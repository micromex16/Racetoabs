// Race to Abs — frontend
// Backed by Supabase (auth + Postgres). See supabase/schema.sql.

// Per-challenge goals live on challenges.goals (jsonb array of
// { id, text, points }). The defaults below are only used as a fallback
// while data is loading.
const DEFAULT_GOALS = [
  { id: "exercise",  text: "30 minutes of exercise",                points: 3 },
  { id: "core",      text: "Extra 5 minutes of core",               points: 1 },
  { id: "nutrition", text: "Hit your nutrition goal",               points: 3 },
  { id: "sleep",     text: "More than 7 hours of sleep",            points: 2 },
  { id: "water",     text: "More than 60 oz of water",              points: 2 },
  { id: "stretch",   text: "Stretched or foam rolled",              points: 1 },
  { id: "noAlcohol", text: "No alcohol today",                      points: 2 },
  { id: "screen",    text: "Less than 1 hr non-work screen time",   points: 2 },
];

function activeGoals() {
  const ac = activeChallenge();
  if (ac?.goals && Array.isArray(ac.goals) && ac.goals.length > 0) return ac.goals;
  return DEFAULT_GOALS;
}

function maxDailyPoints() {
  return activeGoals().reduce((s, g) => s + (Number(g.points) || 0), 0);
}

function newGoalId() {
  return "g" + Math.random().toString(36).slice(2, 8);
}

// ─── State ────────────────────────────────────────────────────────────────
const state = {
  client: null,
  user: null,
  profile: null,
  challenges: [],         // all challenges the user is a member of
  activeChallengeId: null,
  entries: [],            // entries scoped to the active challenge
  profiles: [],           // profiles of active-challenge members
  draft: {},              // { questionId: true } for the currently-displayed day
  editingDate: null,      // ISO date being shown / edited (defaults to today)
  viewingUserId: null,    // if set, we're looking at someone else's profile read-only
  saving: false,
  messages: [],           // chat messages for the active challenge
  messagesChannel: null,  // supabase realtime channel
  pendingImage: null,     // File selected for upload but not yet sent
  sending: false,
};

const signedUrlCache = new Map(); // path → { url, expiresAt }
const ACTIVE_KEY = (uid) => `raceToAbs.activeChallengeId.${uid}`;

function activeChallenge() {
  return state.challenges.find((c) => c.id === state.activeChallengeId) || null;
}

function challengeStart() { return activeChallenge()?.start_date || null; }
function challengeDays()  { return activeChallenge()?.days || 30; }

function viewedUserId() {
  return state.viewingUserId || state.user?.id;
}

function viewedProfile() {
  const id = viewedUserId();
  return state.profiles.find((p) => p.id === id) || null;
}

function isReadOnly() {
  return !!state.viewingUserId;
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ─── Init ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const cfg = window.RACE_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    show("view-config");
    return;
  }
  state.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // Wire up events that exist regardless of view
  $("#signin-form")?.addEventListener("submit", handleSignIn);
  $("#auth-toggle-btn")?.addEventListener("click", () => {
    setAuthMode(authMode === "signin" ? "signup" : "signin");
  });
  $("#profile-form")?.addEventListener("submit", handleCreateProfile);
  $("#menu-btn")?.addEventListener("click", openMenu);
  $("#save-entry")?.addEventListener("click", handleSaveEntry);
  $("#back-to-today")?.addEventListener("click", () => setEditingDate(todayISO()));
  $("#viewing-back")?.addEventListener("click", () => setViewingUser(state.user.id));
  $("#chat-send")?.addEventListener("click", handleSendChat);
  $("#chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
  });
  $("#chat-image")?.addEventListener("change", handlePickChatImage);
  $("#chat-preview-remove")?.addEventListener("click", clearPendingImage);
  $("#challenge-pill")?.addEventListener("click", openChallengePicker);
  $("#empty-new-challenge")?.addEventListener("click", openNewChallengeForm);
  $("#empty-join-challenge")?.addEventListener("click", openJoinChallengeForm);
  $("#modal-close")?.addEventListener("click", closeModal);
  $("#modal-backdrop")?.addEventListener("click", closeModal);

  // Boot
  bootstrap();
});

async function bootstrap() {
  show("view-loading");
  const { data: { session } } = await state.client.auth.getSession();
  await applySession(session);
  state.client.auth.onAuthStateChange(async (_evt, session) => {
    await applySession(session);
  });
}

async function applySession(session) {
  state.user = session?.user || null;
  if (!state.user) {
    show("view-auth");
    return;
  }

  await loadProfile();
  if (!state.profile || !state.profile.display_name?.trim()) {
    if (state.profile?.display_name) $("#display-name").value = state.profile.display_name;
    show("view-onboarding");
    return;
  }

  await loadChallenges();
  await maybeAutoJoinFromUrl();
  if (state.challenges.length === 0) {
    show("view-challenges");
    return;
  }
  await pickInitialActiveChallenge();
  await loadActiveChallengeData();
  subscribeMessages();
  renderApp();
  show("view-app");
}

async function pickInitialActiveChallenge() {
  // Prefer the previously-selected challenge (per-user, localStorage), else pick
  // the most-recent challenge whose window contains today, else the newest one.
  const saved = localStorage.getItem(ACTIVE_KEY(state.user.id));
  if (saved && state.challenges.some((c) => c.id === saved)) {
    state.activeChallengeId = saved;
    return;
  }
  const today = todayISO();
  const active = state.challenges
    .filter((c) => c.start_date <= today && addDays(c.start_date, c.days - 1) >= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
  const newest = [...state.challenges].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  state.activeChallengeId = (active || newest).id;
  localStorage.setItem(ACTIVE_KEY(state.user.id), state.activeChallengeId);
}

// ─── Data loading ─────────────────────────────────────────────────────────
async function loadProfile() {
  const { data, error } = await state.client
    .from("profiles")
    .select("*")
    .eq("id", state.user.id)
    .maybeSingle();
  if (error) console.error(error);
  state.profile = data || null;
}

async function loadChallenges() {
  const { data, error } = await state.client
    .from("challenges")
    .select("id, name, start_date, days, invite_code, created_by, goals, created_at")
    .order("start_date", { ascending: false });
  if (error) { console.error(error); state.challenges = []; return; }
  state.challenges = data || [];
}

async function loadActiveChallengeData() {
  const cid = state.activeChallengeId;
  if (!cid) return;

  const [{ data: members, error: mErr }, { data: entries, error: eErr }] = await Promise.all([
    state.client.from("challenge_members").select("user_id, joined_at").eq("challenge_id", cid),
    state.client.from("entries").select("id, user_id, date, answers, points")
      .eq("challenge_id", cid).order("date", { ascending: false }),
  ]);
  if (mErr) console.error(mErr);
  if (eErr) console.error(eErr);
  state.entries = entries || [];

  const memberIds = (members || []).map((m) => m.user_id);
  if (memberIds.length > 0) {
    const { data: profiles } = await state.client
      .from("profiles").select("id, display_name, custom_goal").in("id", memberIds);
    state.profiles = profiles || [];
  } else {
    state.profiles = [];
  }

  await loadMessages();

  if (!state.editingDate) state.editingDate = todayISO();
  if (state.viewingUserId && !state.profiles.find((p) => p.id === state.viewingUserId)) {
    state.viewingUserId = null; // viewed user isn't in this challenge
  }
  reseedDraftFromEditingDate();
}

async function setActiveChallenge(cid) {
  if (!cid || cid === state.activeChallengeId) return;
  state.activeChallengeId = cid;
  localStorage.setItem(ACTIVE_KEY(state.user.id), cid);
  state.editingDate = todayISO();
  state.viewingUserId = null;
  state.entries = [];
  state.messages = [];
  state.profiles = [];
  await loadActiveChallengeData();
  await resubscribeMessages();
  renderApp();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function reseedDraftFromEditingDate() {
  const userId = viewedUserId();
  const e = state.entries.find(
    (x) => x.user_id === userId && x.date === state.editingDate
  );
  state.draft = e ? { ...e.answers } : {};
}

function setEditingDate(iso) {
  if (!isInChallengeWindow(iso)) return;
  if (iso > todayISO()) return; // no looking at the future
  state.editingDate = iso;
  reseedDraftFromEditingDate();
  renderApp();
}

function setViewingUser(userId) {
  state.viewingUserId = userId === state.user?.id ? null : userId;
  state.editingDate = todayISO();
  reseedDraftFromEditingDate();
  renderApp();
  // Scroll to the top so they see the viewing banner + ring.
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ─── Auth handlers ────────────────────────────────────────────────────────
let authMode = "signin"; // "signin" | "signup"

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === "signup";
  $("#auth-title").textContent      = isSignup ? "Create account" : "Sign in";
  $("#auth-sub").textContent        = isSignup
    ? "Pick a password. No email confirmation, you're in immediately."
    : "Welcome back. Enter your email and password.";
  $("#auth-submit").textContent     = isSignup ? "Create account" : "Sign in";
  $("#auth-toggle-text").textContent = isSignup ? "Already have an account?" : "First time?";
  $("#auth-toggle-btn").textContent  = isSignup ? "Sign in instead" : "Create an account";
  $("#password").setAttribute("autocomplete", isSignup ? "new-password" : "current-password");
  $("#signin-status").textContent = "";
}

async function handleSignIn(e) {
  e.preventDefault();
  const email = $("#email").value.trim();
  const password = $("#password").value;
  if (!email || !password) return;
  const status = $("#signin-status");
  const submit = $("#auth-submit");
  submit.disabled = true;
  status.textContent = authMode === "signup" ? "Creating account…" : "Signing in…";

  const fn = authMode === "signup" ? "signUp" : "signInWithPassword";
  const { data, error } = await state.client.auth[fn]({ email, password });
  submit.disabled = false;

  if (error) {
    if (authMode === "signin" && /invalid login/i.test(error.message)) {
      status.textContent = "Email and password don't match. New here? Tap 'Create an account'.";
    } else if (authMode === "signup" && /already registered|already.*exists/i.test(error.message)) {
      status.textContent = "That email's already in. Switch to Sign in.";
    } else {
      status.textContent = error.message;
    }
    return;
  }

  // If sign-up requires confirmation (because the toggle wasn't disabled in
  // Supabase), `data.session` is null. Tell the user.
  if (authMode === "signup" && !data?.session) {
    status.textContent = "Check your inbox to confirm your email, then come back.";
    return;
  }
  // applySession runs via onAuthStateChange and switches the view.
}

async function handleSignOut() {
  if (state.messagesChannel) {
    try { await state.client.removeChannel(state.messagesChannel); } catch {}
    state.messagesChannel = null;
  }
  await state.client.auth.signOut();
  state.profile = null;
  state.entries = [];
  state.profiles = [];
  state.draft = {};
  state.messages = [];
  state.viewingUserId = null;
  state.editingDate = null;
  state.challenges = [];
  state.activeChallengeId = null;
  signedUrlCache.clear();
}

async function handleCreateProfile(e) {
  e.preventDefault();
  const name = $("#display-name").value.trim();
  if (!name) return;
  const status = $("#profile-status");
  status.textContent = "Saving…";
  const { error } = await state.client
    .from("profiles")
    .upsert({ id: state.user.id, display_name: name });
  if (error) {
    status.textContent = "Couldn't save: " + error.message;
    return;
  }
  await loadProfile();
  await loadChallenges();
  if (state.challenges.length === 0) {
    show("view-challenges");
    return;
  }
  await pickInitialActiveChallenge();
  await loadActiveChallengeData();
  subscribeMessages();
  renderApp();
  show("view-app");
}

// ─── Entry handlers ───────────────────────────────────────────────────────
async function handleSaveEntry() {
  if (state.saving) return;
  const date = state.editingDate || todayISO();
  if (!isInChallengeWindow(date)) {
    flashStatus("That day is outside the challenge window.");
    return;
  }
  state.saving = true;
  const btn = $("#save-entry");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const answers = {};
  const goals = activeGoals();
  for (const q of goals) answers[q.id] = !!state.draft[q.id];
  const points = computePoints(answers);

  const row = {
    user_id: state.user.id,
    challenge_id: state.activeChallengeId,
    date,
    answers,
    points,
  };
  const error = await saveEntryRow(row);

  state.saving = false;
  btn.disabled = false;
  btn.textContent = "Save";

  if (error) {
    flashStatus("Couldn't save: " + error.message);
    return;
  }
  const dayLabel = date === todayISO() ? "today" : fmtDate(date);
  flashStatus(`Saved. +${points} pts for ${dayLabel}.`);
  await loadActiveChallengeData();
  renderApp();
}

// Entries are unique per (challenge, user, day). The pre-multi-challenge schema
// constrained them per (user, day) across the whole table, so upserting on that
// target overwrote — and re-stamped the challenge_id of — the row belonging to a
// different challenge, wiping that day from the other leaderboard. Aim at the
// per-challenge constraint instead, and if the database hasn't been migrated
// yet, fall back to an explicitly challenge-scoped write rather than clobbering.
const LEGACY_DAY_LIMIT_HELP =
  "this database still allows only one check-in per day across all challenges, " +
  "so this day is already logged in a different one. Re-run supabase/schema.sql " +
  "to fix it.";

async function saveEntryRow(row) {
  const { error } = await state.client
    .from("entries")
    .upsert(row, { onConflict: "challenge_id,user_id,date" });
  if (!error) return null;
  if (isMissingConflictTarget(error)) return saveEntryRowUnmigrated(row);
  // The per-challenge target resolved, but a leftover (user_id, date) rule
  // rejected the row anyway -- a half-migrated database.
  if (isDuplicateDay(error)) return { ...error, message: LEGACY_DAY_LIMIT_HELP };
  return error;
}

function isMissingConflictTarget(error) {
  return error.code === "42P10" ||
    /no unique or exclusion constraint/i.test(error.message || "");
}

function isDuplicateDay(error) {
  return error.code === "23505" || /duplicate key/i.test(error.message || "");
}

async function saveEntryRowUnmigrated(row) {
  const { data: existing, error: findErr } = await state.client
    .from("entries")
    .select("id")
    .eq("challenge_id", row.challenge_id)
    .eq("user_id", row.user_id)
    .eq("date", row.date)
    .maybeSingle();
  if (findErr) return findErr;

  if (existing) {
    const { error } = await state.client
      .from("entries")
      .update({ answers: row.answers, points: row.points })
      .eq("id", existing.id);
    return error;
  }

  const { error } = await state.client.from("entries").insert(row);
  if (error && isDuplicateDay(error)) {
    return { ...error, message: LEGACY_DAY_LIMIT_HELP };
  }
  return error;
}

function flashStatus(msg) {
  const el = $("#entry-status");
  el.textContent = msg;
  clearTimeout(flashStatus._t);
  flashStatus._t = setTimeout(() => (el.textContent = ""), 3500);
}

// ─── Rendering ────────────────────────────────────────────────────────────
const RING_CIRCUMFERENCE = 2 * Math.PI * 84; // matches r=84 in markup

function renderApp() {
  renderChallengePill();
  renderViewingBanner();
  renderRing();
  renderStats();
  renderCheckin();
  renderLeaderboard();
  renderWeekStrip();
  renderChat({ keepScroll: true });
}

function renderViewingBanner() {
  const banner = $("#viewing-banner");
  if (!banner) return;
  const profile = viewedProfile();
  if (isReadOnly() && profile) {
    $("#viewing-name").textContent = profile.display_name;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

// Smoothly animate a number from its previous value to the target.
function animateNumber(el, target, opts = {}) {
  if (!el) return;
  const dur = opts.duration ?? 700;
  const from = Number(el.dataset.cur ?? "0") || 0;
  if (from === target) {
    el.textContent = String(target);
    el.dataset.cur = String(target);
    return;
  }
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const v = Math.round(from + (target - from) * eased);
    el.textContent = String(v);
    if (t < 1) requestAnimationFrame(tick);
    else el.dataset.cur = String(target);
  }
  requestAnimationFrame(tick);
}

function renderRing() {
  const today = todayISO();
  const date = state.editingDate || today;
  const isToday = date === today;
  const readOnly = isReadOnly();
  const userId = viewedUserId();
  $("#ring-date").textContent = fmtDate(date);
  const MAX = maxDailyPoints();
  const goals = activeGoals();
  $("#ring-max").textContent = String(MAX);

  const eyebrow = document.querySelector(".bento-ring .eyebrow");
  if (eyebrow) {
    if (readOnly) eyebrow.textContent = (viewedProfile()?.display_name?.split(/\s+/)[0]) || "Viewing";
    else eyebrow.textContent = isToday ? "Today" : "Logging";
  }

  const inWindow = isInChallengeWindow(date);
  const dayEntry = state.entries.find(
    (e) => e.user_id === userId && e.date === date
  );
  const draftAnswers = {};
  for (const q of goals) draftAnswers[q.id] = !!state.draft[q.id];
  const points = computePoints(draftAnswers);
  const pct = MAX > 0 ? Math.min(points / MAX, 1) : 0;

  animateNumber($("#ring-num"), points);

  const fillEl = $("#ring-fill");
  fillEl.setAttribute("stroke-dasharray", String(RING_CIRCUMFERENCE));
  fillEl.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - pct));

  const checkedCount = goals.filter((q) => draftAnswers[q.id]).length;
  const tag = inWindow
    ? `${checkedCount} of ${goals.length} checked`
    : (date < challengeStart() ? "before challenge" : "after challenge");
  $("#ring-tag").textContent = tag;

  let stateMsg = "";
  if (!inWindow) {
    stateMsg = "";
  } else if (readOnly) {
    stateMsg = dayEntry
      ? (points === MAX ? "Perfect day" : "Logged")
      : "Not logged this day";
  } else if (dayEntry && JSON.stringify(draftAnswers) === JSON.stringify(dayEntry.answers)) {
    stateMsg = points === MAX
      ? (isToday ? "Perfect day. Locked in." : "Perfect day · saved")
      : (isToday ? "Saved for today" : "Saved");
  } else if (dayEntry) {
    stateMsg = "Unsaved changes — tap Save";
  } else if (checkedCount > 0) {
    stateMsg = isToday ? "Tap Save to log today" : "Tap Save to log this day";
  } else {
    stateMsg = "Tap an item below to start";
  }
  $("#ring-state").textContent = stateMsg;

  document.querySelector(".bento-ring").classList.toggle(
    "complete",
    inWindow && points === MAX
  );
}

function renderStats() {
  const start = challengeStart();
  const total = challengeDays();
  const today = todayISO();
  const rawDay = start ? daysBetween(start, today) + 1 : 0;
  const dayNum = clamp(rawDay, 0, total);

  $("#stat-day-total").textContent = String(total);
  animateNumber($("#stat-day"), Math.max(dayNum, 0));

  const endIso = addDays(start, total - 1);
  let daySub;
  if (today < start) daySub = `Starts ${fmtDate(start)}`;
  else if (today > endIso) daySub = `Ended ${fmtDate(endIso)}`;
  else {
    const left = total - dayNum;
    daySub = left === 0 ? "Final day" : `${left} day${left === 1 ? "" : "s"} to go`;
  }
  $("#stat-day-sub").textContent = daySub;
  $("#day-progress").style.width = `${total > 0 ? clamp((dayNum / total) * 100, 0, 100) : 0}%`;

  const userId = viewedUserId();
  const streak = currentStreakFor(userId);
  animateNumber($("#stat-streak"), streak);
  const dotsEl = $("#streak-dots");
  dotsEl.innerHTML = "";
  const dotCount = 7;
  for (let i = 0; i < dotCount; i++) {
    const d = document.createElement("i");
    if (i < Math.min(streak, dotCount)) d.classList.add("on");
    dotsEl.appendChild(d);
  }

  const ranking = computeRanking();
  const idx = ranking.findIndex((r) => r.userId === userId);
  if (idx >= 0) {
    $("#stat-rank").textContent = String(idx + 1);
    if (ranking.length <= 1) {
      $("#stat-rank-sub").textContent = "be the first to log";
    } else if (idx === 0) {
      const lead = ranking[0].points - ranking[1].points;
      $("#stat-rank-sub").textContent = lead > 0 ? `+${lead} on 2nd` : `tied at top`;
    } else {
      const gap = ranking[idx - 1].points - ranking[idx].points;
      $("#stat-rank-sub").textContent = gap === 0
        ? `tied with #${idx}`
        : `${gap} pt${gap === 1 ? "" : "s"} behind #${idx}`;
    }
  } else {
    $("#stat-rank").textContent = "–";
    $("#stat-rank-sub").textContent = "no entries yet";
  }

  const userEntries = state.entries.filter(
    (e) => e.user_id === userId && isInChallengeWindow(e.date)
  );
  const userPoints = userEntries.reduce((s, e) => s + e.points, 0);
  animateNumber($("#stat-points"), userPoints);

  const maxSoFar = Math.max(dayNum, 0) * maxDailyPoints();
  $("#stat-points-sub").textContent = maxSoFar > 0
    ? `of ${maxSoFar} possible · ${Math.round((userPoints / maxSoFar) * 100)}%`
    : "challenge starting soon";
}

function renderCheckin() {
  const today = todayISO();
  const date = state.editingDate || today;
  const isToday = date === today;
  const readOnly = isReadOnly();
  const inWindow = isInChallengeWindow(date);
  const outEl = $("#checkin-out-of-window");
  const list = $("#checkin-list");
  const saveBtn = $("#save-entry");
  const titleEl = document.querySelector(".bento-checkin h2");
  const backEl = $("#back-to-today");
  const profile = viewedProfile();
  const firstName = profile?.display_name?.split(/\s+/)[0] || "";

  if (titleEl) {
    if (readOnly) {
      titleEl.textContent = isToday
        ? `${firstName}'s today`
        : `${firstName} on ${fmtDate(date)}`;
    } else {
      titleEl.textContent = isToday ? "Today's check-in" : `Logging for ${fmtDate(date)}`;
    }
  }
  if (backEl) backEl.classList.toggle("hidden", isToday || readOnly);
  list.classList.toggle("readonly", readOnly);

  if (!inWindow) {
    const start = challengeStart();
    const before = date < start;
    outEl.classList.remove("hidden");
    outEl.textContent = before
      ? `Challenge starts ${fmtDate(start)}. Hang tight.`
      : `Challenge ended ${fmtDate(addDays(start, challengeDays() - 1))}.`;
    list.classList.add("hidden");
    saveBtn.classList.add("hidden");
    return;
  }
  outEl.classList.add("hidden");
  list.classList.remove("hidden");
  saveBtn.classList.toggle("hidden", readOnly);

  list.innerHTML = "";
  for (const q of activeGoals()) {
    const checked = !!state.draft[q.id];
    const item = document.createElement("div");
    item.className = "checkin-item" + (checked ? " checked" : "");
    item.dataset.qid = q.id;
    if (!readOnly) {
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.setAttribute("aria-pressed", checked ? "true" : "false");
    }
    const pts = Number(q.points) || 0;
    item.innerHTML = `
      <div class="checkin-label">
        <div class="checkin-q">${escapeHtml(q.text || "—")}</div>
        <div class="checkin-pts">+${pts} pt${pts === 1 ? "" : "s"}</div>
      </div>
      <div class="check-circle" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#062b14" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    `;
    if (!readOnly) {
      item.addEventListener("click", () => toggleQuestion(q.id));
      item.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggleQuestion(q.id);
        }
      });
    }
    list.appendChild(item);
  }
}

function toggleQuestion(qid) {
  state.draft[qid] = !state.draft[qid];
  const item = document.querySelector(`.checkin-item[data-qid="${qid}"]`);
  if (item) {
    item.classList.toggle("checked", !!state.draft[qid]);
    item.setAttribute("aria-pressed", state.draft[qid] ? "true" : "false");
  }
  renderRing();
}

function renderLeaderboard() {
  const ranking = computeRanking();
  const ul = $("#leaderboard");
  const empty = $("#leaderboard-empty");
  const meta = $("#leaderboard-meta");
  ul.innerHTML = "";
  if (ranking.length === 0) {
    empty.classList.remove("hidden");
    if (meta) meta.textContent = "";
    return;
  }
  empty.classList.add("hidden");
  if (meta) {
    const total = ranking.length;
    meta.textContent = `${total} racer${total === 1 ? "" : "s"}`;
  }

  ranking.forEach((row, i) => {
    const rank = i + 1;
    const isYou = row.userId === state.user.id;
    const isViewed = row.userId === viewedUserId();
    const li = document.createElement("li");
    li.className = (isYou ? "you " : "") + (isViewed ? "viewed " : "") + "tappable";
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");
    li.setAttribute("aria-label", `View ${row.name}'s profile`);
    li.innerHTML = `
      <div class="rank-badge ${rank <= 3 ? "rank-" + rank : ""}">${rank}</div>
      <div>
        <div class="lb-name">${escapeHtml(row.name)}${isYou ? " <span class=\"muted\">· you</span>" : ""}</div>
        <div class="lb-meta">${row.daysLogged} day${row.daysLogged === 1 ? "" : "s"} logged</div>
      </div>
      <div class="lb-points">${row.points}</div>
      <div class="lb-streak">${row.streak ? row.streak + "d" : ""}</div>
    `;
    li.addEventListener("click", () => setViewingUser(row.userId));
    li.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setViewingUser(row.userId);
      }
    });
    ul.appendChild(li);
  });
}

function renderWeekStrip() {
  const strip = $("#week-strip");
  strip.innerHTML = "";
  const today = todayISO();
  const editing = state.editingDate || today;
  const start = addDays(today, -6);
  const userId = viewedUserId();
  const myEntries = new Map(
    state.entries
      .filter((e) => e.user_id === userId)
      .map((e) => [e.date, e])
  );
  for (let i = 0; i < 7; i++) {
    const iso = addDays(start, i);
    const d = new Date(iso + "T00:00:00");
    const entry = myEntries.get(iso);
    const inWindow = isInChallengeWindow(iso);
    const isFuture = iso > today;
    const selectable = inWindow && !isFuture;

    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (iso === today) cell.classList.add("today");
    if (entry) cell.classList.add("logged");
    else if (iso < today && inWindow) cell.classList.add("missed");
    else if (!inWindow) cell.classList.add("future");
    if (iso === editing) cell.classList.add("selected");
    if (selectable) cell.classList.add("selectable");

    const numDisplay = entry
      ? entry.points
      : iso === today
        ? "–"
        : inWindow
          ? "0"
          : "·";
    cell.innerHTML = `
      <div class="day-name">${d.toLocaleDateString(undefined, { weekday: "short" })}</div>
      <div class="day-num">${numDisplay}</div>
    `;
    if (selectable) {
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-label", `Edit ${fmtDate(iso)}`);
      cell.addEventListener("click", () => setEditingDate(iso));
      cell.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setEditingDate(iso);
        }
      });
    }
    strip.appendChild(cell);
  }
}

// ─── Computations ─────────────────────────────────────────────────────────
function computePoints(answers) {
  return activeGoals().reduce((s, q) => s + (answers[q.id] ? (Number(q.points) || 0) : 0), 0);
}

function isInChallengeWindow(iso) {
  const start = challengeStart();
  if (!start) return false;
  const end = addDays(start, challengeDays() - 1);
  return iso >= start && iso <= end;
}

function computeRanking() {
  const map = new Map();
  for (const p of state.profiles) {
    map.set(p.id, { userId: p.id, name: p.display_name, points: 0, daysLogged: 0, streak: 0 });
  }
  for (const e of state.entries) {
    if (!isInChallengeWindow(e.date)) continue;
    const row = map.get(e.user_id);
    if (!row) continue;
    row.points += e.points;
    row.daysLogged += 1;
  }
  for (const row of map.values()) {
    row.streak = currentStreakFor(row.userId);
  }
  return [...map.values()].sort(
    (a, b) => b.points - a.points || b.daysLogged - a.daysLogged || a.name.localeCompare(b.name)
  );
}

function currentStreakFor(userId) {
  // Streak = consecutive days through today (or yesterday if today not yet logged)
  // counting only days within the challenge window where the user has an entry.
  const dates = new Set(
    state.entries
      .filter((e) => e.user_id === userId && isInChallengeWindow(e.date))
      .map((e) => e.date)
  );
  const today = todayISO();
  let cursor = today;
  if (!dates.has(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (dates.has(cursor) && isInChallengeWindow(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// ─── Date helpers (timezone-safe ISO dates) ───────────────────────────────
function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}
function fmtDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ─── Chat ─────────────────────────────────────────────────────────────────
async function loadMessages() {
  if (!state.activeChallengeId) { state.messages = []; return; }
  const { data, error } = await state.client
    .from("messages")
    .select("id, user_id, body, image_path, created_at")
    .eq("challenge_id", state.activeChallengeId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) { console.error(error); return; }
  state.messages = data || [];
  await refreshSignedUrls(state.messages);
}

function subscribeMessages() {
  if (!state.activeChallengeId || state.messagesChannel) return;
  const cid = state.activeChallengeId;
  state.messagesChannel = state.client
    .channel(`messages-feed:${cid}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `challenge_id=eq.${cid}` },
      async (payload) => {
        const m = payload.new;
        if (!state.messages.find((x) => x.id === m.id)) state.messages.push(m);
        if (m.image_path) await getSignedUrl(m.image_path);
        renderChat({ keepScroll: false });
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "messages", filter: `challenge_id=eq.${cid}` },
      (payload) => {
        const id = payload.old?.id;
        if (!id) return;
        state.messages = state.messages.filter((m) => m.id !== id);
        renderChat({ keepScroll: true });
      }
    )
    .subscribe();
}

async function resubscribeMessages() {
  if (state.messagesChannel) {
    try { await state.client.removeChannel(state.messagesChannel); } catch {}
    state.messagesChannel = null;
  }
  subscribeMessages();
}

async function getSignedUrl(path) {
  if (!path) return null;
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  const { data, error } = await state.client.storage
    .from("chat-images")
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  signedUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return data.signedUrl;
}

async function refreshSignedUrls(messages) {
  const paths = [...new Set(messages.filter((m) => m.image_path).map((m) => m.image_path))];
  await Promise.all(paths.map(getSignedUrl));
}

async function compressImage(file, maxDim = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
}

async function uploadChatImage(file) {
  const blob = await compressImage(file);
  const path = `${state.user.id}/${randomId()}.jpg`;
  const { error } = await state.client.storage
    .from("chat-images")
    .upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
  if (error) throw error;
  return path;
}

function randomId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function handlePickChatImage(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  state.pendingImage = file;
  const url = URL.createObjectURL(file);
  $("#chat-preview-img").src = url;
  $("#chat-preview").classList.remove("hidden");
}

function clearPendingImage() {
  if (state.pendingImage && $("#chat-preview-img").src.startsWith("blob:")) {
    try { URL.revokeObjectURL($("#chat-preview-img").src); } catch {}
  }
  state.pendingImage = null;
  $("#chat-image").value = "";
  $("#chat-preview").classList.add("hidden");
  $("#chat-preview-img").removeAttribute("src");
}

async function handleSendChat() {
  if (state.sending) return;
  const input = $("#chat-input");
  const body = input.value.trim();
  const hasImage = !!state.pendingImage;
  if (!body && !hasImage) return;

  state.sending = true;
  const sendBtn = $("#chat-send");
  sendBtn.disabled = true;
  sendBtn.textContent = "Sending…";

  try {
    let imagePath = null;
    if (hasImage) imagePath = await uploadChatImage(state.pendingImage);
    const { error } = await state.client.from("messages").insert({
      user_id: state.user.id,
      challenge_id: state.activeChallengeId,
      body: body || null,
      image_path: imagePath,
    });
    if (error) throw error;
    input.value = "";
    clearPendingImage();
  } catch (err) {
    console.error(err);
    alert("Couldn't send: " + (err.message || err));
  } finally {
    state.sending = false;
    sendBtn.disabled = false;
    sendBtn.textContent = "Send";
  }
}

function senderName(userId) {
  if (userId === state.user.id) return "You";
  const p = state.profiles.find((x) => x.id === userId);
  return p?.display_name || "Someone";
}

function avatarColor(userId) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 60%, 62%)`;
}

function avatarLetter(userId) {
  const name = userId === state.user.id
    ? state.profile?.display_name
    : state.profiles.find((p) => p.id === userId)?.display_name;
  return (name || "?").trim().charAt(0).toUpperCase();
}

function fmtChatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function renderChat({ keepScroll = false } = {}) {
  const list = $("#chat-messages");
  if (!list) return;
  const wasAtBottom =
    list.scrollHeight - list.scrollTop - list.clientHeight < 60;

  list.innerHTML = "";
  if (state.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "chat-empty muted";
    empty.textContent = "No messages yet. Be the first to say something.";
    list.appendChild(empty);
    return;
  }

  for (const m of state.messages) {
    const isMine = m.user_id === state.user.id;
    const row = document.createElement("div");
    row.className = "chat-msg" + (isMine ? " mine" : "");

    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";
    avatar.style.background = avatarColor(m.user_id);
    avatar.textContent = avatarLetter(m.user_id);

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    const meta = document.createElement("div");
    meta.className = "chat-meta";
    meta.innerHTML = `<span class="chat-author">${escapeHtml(senderName(m.user_id))}</span> <span class="chat-time">${fmtChatTime(m.created_at)}</span>`;
    bubble.appendChild(meta);

    if (m.image_path) {
      const url = signedUrlCache.get(m.image_path)?.url;
      const img = document.createElement("img");
      img.className = "chat-img";
      img.alt = "Shared photo";
      img.loading = "lazy";
      if (url) img.src = url;
      else getSignedUrl(m.image_path).then((u) => { if (u) img.src = u; });
      bubble.appendChild(img);
    }

    if (m.body) {
      const body = document.createElement("div");
      body.className = "chat-body";
      body.textContent = m.body;
      bubble.appendChild(body);
    }

    if (isMine) {
      const del = document.createElement("button");
      del.className = "chat-delete";
      del.type = "button";
      del.title = "Delete";
      del.setAttribute("aria-label", "Delete message");
      del.textContent = "×";
      del.addEventListener("click", () => deleteMessage(m.id));
      bubble.appendChild(del);
    }

    row.appendChild(avatar);
    row.appendChild(bubble);
    list.appendChild(row);
  }

  if (!keepScroll || wasAtBottom) {
    list.scrollTop = list.scrollHeight;
  }
}

async function deleteMessage(id) {
  if (!confirm("Delete this message?")) return;
  const { error } = await state.client.from("messages").delete().eq("id", id);
  if (error) { alert("Couldn't delete: " + error.message); return; }
  state.messages = state.messages.filter((m) => m.id !== id);
  renderChat({ keepScroll: true });
}

// ─── Challenges UI: picker modal, new + join forms, invite-code sharing ───
function classifyChallenge(c) {
  const today = todayISO();
  const end = addDays(c.start_date, c.days - 1);
  if (today < c.start_date) return { status: "upcoming", end };
  if (today > end)         return { status: "past", end };
  return { status: "active", end };
}

function challengeRowMeta(c) {
  const { status, end } = classifyChallenge(c);
  if (status === "active") {
    const day = clamp(daysBetween(c.start_date, todayISO()) + 1, 1, c.days);
    return `Day ${day} of ${c.days}`;
  }
  if (status === "past")     return `Ended ${fmtDate(end)}`;
  return `Starts ${fmtDate(c.start_date)}`;
}

function renderChallengePill() {
  const ac = activeChallenge();
  const title = $("#header-challenge");
  const sub = $("#header-sub");
  if (title) title.textContent = ac?.name || "Race to Abs";
  if (sub) {
    if (!ac) { sub.textContent = ""; return; }
    const today = todayISO();
    const end = addDays(ac.start_date, ac.days - 1);
    if (today < ac.start_date) sub.textContent = `Starts ${fmtDate(ac.start_date)}`;
    else if (today > end)      sub.textContent = `Ended ${fmtDate(end)}`;
    else {
      const day = clamp(daysBetween(ac.start_date, today) + 1, 1, ac.days);
      sub.textContent = `Day ${day} of ${ac.days}`;
    }
  }
}

const ICON_SWITCH = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
const ICON_USER = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const ICON_GOAL = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
const ICON_SIGNOUT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

function openMenu() {
  const ac = activeChallenge();
  const name = state.profile?.display_name || "—";
  const email = state.user?.email || "";
  const isHost = ac && ac.created_by === state.user.id;
  const goalsCount = activeGoals().length;
  const maxPts = maxDailyPoints();

  const editGoalsItem = isHost ? `
    <li><button type="button" class="menu-item" id="menu-edit-goals">
      <span class="menu-icon">${ICON_GOAL}</span>
      <div class="menu-label">
        <div>Edit challenge goals</div>
        <div class="muted small">${goalsCount} goal${goalsCount === 1 ? "" : "s"} · ${maxPts} pts/day</div>
      </div>
      <span class="menu-chev">›</span>
    </button></li>
  ` : "";

  openModal(`
    <div class="menu-header">
      <div class="menu-avatar">${escapeHtml(name.charAt(0).toUpperCase() || "?")}</div>
      <div style="min-width: 0;">
        <div class="menu-name">${escapeHtml(name)}</div>
        <div class="menu-email muted small">${escapeHtml(email)}</div>
      </div>
    </div>
    <ul class="menu-list">
      <li><button type="button" class="menu-item" id="menu-switch">
        <span class="menu-icon">${ICON_SWITCH}</span>
        <div class="menu-label">
          <div>Switch challenge</div>
          <div class="muted small">${escapeHtml(ac?.name || "—")}</div>
        </div>
        <span class="menu-chev">›</span>
      </button></li>
      ${editGoalsItem}
      <li><button type="button" class="menu-item" id="menu-profile">
        <span class="menu-icon">${ICON_USER}</span>
        <div class="menu-label">
          <div>Edit profile</div>
          <div class="muted small">Display name</div>
        </div>
        <span class="menu-chev">›</span>
      </button></li>
      <li><button type="button" class="menu-item danger" id="menu-signout">
        <span class="menu-icon">${ICON_SIGNOUT}</span>
        <div class="menu-label"><div>Sign out</div></div>
        <span></span>
      </button></li>
    </ul>
  `, {
    onMount() {
      $("#menu-switch").addEventListener("click", () => { closeModal(); openChallengePicker(); });
      $("#menu-edit-goals")?.addEventListener("click", () => { closeModal(); openEditGoalsForm(); });
      $("#menu-profile").addEventListener("click", openEditProfileForm);
      $("#menu-signout").addEventListener("click", () => { closeModal(); handleSignOut(); });
    },
  });
}

function openEditProfileForm() {
  const name = state.profile?.display_name || "";
  openModal(`
    <h2>Edit profile</h2>
    <p class="muted">Your name on the leaderboard and in the chat.</p>
    <form id="edit-profile-form">
      <div class="field">
        <label for="ep-name">Display name</label>
        <input type="text" id="ep-name" maxlength="40" required value="${escapeHtml(name)}" />
      </div>
      <button type="submit" class="btn-primary">Save</button>
      <p id="ep-status" class="muted"></p>
    </form>
  `, {
    onMount() {
      $("#edit-profile-form").addEventListener("submit", handleSaveProfile);
    },
  });
}

async function handleSaveProfile(e) {
  e.preventDefault();
  const name = $("#ep-name").value.trim();
  const status = $("#ep-status");
  if (!name) return;
  status.textContent = "Saving…";
  const { error } = await state.client
    .from("profiles")
    .update({ display_name: name })
    .eq("id", state.user.id);
  if (error) { status.textContent = "Couldn't save: " + error.message; return; }
  state.profile.display_name = name;
  const mine = state.profiles.find((p) => p.id === state.user.id);
  if (mine) mine.display_name = name;
  closeModal();
  renderApp();
}

function openModal(html, opts = {}) {
  const content = $("#modal-content");
  content.innerHTML = html;
  $("#modal-overlay").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  opts.onMount?.();
}

function closeModal() {
  $("#modal-overlay").classList.add("hidden");
  $("#modal-content").innerHTML = "";
  document.body.style.overflow = "";
}

function openChallengePicker() {
  const sorted = [...state.challenges].sort((a, b) => {
    const sa = classifyChallenge(a).status === "past" ? 1 : 0;
    const sb = classifyChallenge(b).status === "past" ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return b.start_date.localeCompare(a.start_date);
  });

  const rows = sorted.map((c) => {
    const isActive = c.id === state.activeChallengeId;
    const cls = classifyChallenge(c).status;
    return `
      <button class="picker-row ${isActive ? "current" : ""}" data-cid="${c.id}">
        <div class="picker-row-main">
          <div class="picker-row-name">${escapeHtml(c.name)} ${cls === "past" ? '<span class="picker-tag past">past</span>' : cls === "upcoming" ? '<span class="picker-tag upcoming">upcoming</span>' : ''}</div>
          <div class="picker-row-meta">${challengeRowMeta(c)}</div>
        </div>
        ${isActive ? '<span class="picker-check" aria-label="current">✓</span>' : ""}
      </button>
    `;
  }).join("");

  const active = activeChallenge();
  const inviteHtml = active ? `
    <div class="picker-section">
      <div class="picker-section-label">Invite people to "${escapeHtml(active.name)}"</div>
      <div class="picker-invite-row">
        <code class="picker-invite-code">${active.invite_code}</code>
        <button type="button" class="btn-ghost" id="copy-invite-btn">Copy code</button>
        <button type="button" class="btn-ghost" id="copy-link-btn">Copy link</button>
      </div>
      <p class="muted small">Share this code or link with someone. They'll join "${escapeHtml(active.name)}" after signing in.</p>
    </div>
  ` : "";

  openModal(`
    <h2>Your challenges</h2>
    <div class="picker-list">${rows || '<p class="muted">No challenges yet.</p>'}</div>
    ${inviteHtml}
    <div class="picker-actions">
      <button type="button" class="btn-primary" id="picker-new">+ New challenge</button>
      <button type="button" class="btn-ghost" id="picker-join">Join with code</button>
    </div>
  `, {
    onMount() {
      document.querySelectorAll(".picker-row").forEach((b) =>
        b.addEventListener("click", async () => {
          const cid = b.dataset.cid;
          closeModal();
          if (cid !== state.activeChallengeId) await setActiveChallenge(cid);
        })
      );
      $("#picker-new")?.addEventListener("click", openNewChallengeForm);
      $("#picker-join")?.addEventListener("click", openJoinChallengeForm);
      $("#copy-invite-btn")?.addEventListener("click", () => copyText(active.invite_code, "Code copied"));
      $("#copy-link-btn")?.addEventListener("click", () =>
        copyText(`${location.origin}${location.pathname}?join=${active.invite_code}`, "Invite link copied")
      );
    },
  });
}

function openNewChallengeForm() {
  const todayDefault = todayISO();
  const seedGoals = DEFAULT_GOALS.map((g) => ({ ...g, id: newGoalId() }));
  openModal(`
    <h2>New challenge</h2>
    <p class="muted">Name it, set a start date, and define the daily check-in items + points.</p>
    <form id="new-challenge-form">
      <div class="field">
        <label for="nc-name">Name</label>
        <input type="text" id="nc-name" maxlength="40" required placeholder='e.g. "Summer round"' />
      </div>
      <div class="field">
        <label for="nc-date">Start date</label>
        <input type="date" id="nc-date" required value="${todayDefault}" />
      </div>
      <div class="field">
        <label for="nc-days">Length (days)</label>
        <input type="number" id="nc-days" min="1" max="365" value="30" required />
      </div>
      <div class="field">
        <label>Daily goals</label>
        <small class="muted small">Each one is a yes/no check-in. Add as many as you want.</small>
        <div id="goals-editor" class="goals-editor"></div>
        <button type="button" id="add-goal" class="btn-ghost btn-small">+ Add goal</button>
      </div>
      <button type="submit" class="btn-primary">Create challenge</button>
      <p id="nc-status" class="muted"></p>
    </form>
  `, {
    onMount() {
      const editor = $("#goals-editor");
      renderGoalsEditor(editor, seedGoals);
      $("#add-goal").addEventListener("click", () => addEmptyGoalRow(editor));
      $("#new-challenge-form").addEventListener("submit", handleCreateChallenge);
    },
  });
}

function openEditGoalsForm() {
  const ac = activeChallenge();
  if (!ac) return;
  if (ac.created_by && ac.created_by !== state.user.id) {
    alert("Only the host of this challenge can edit its goals.");
    return;
  }
  const goals = (ac.goals && ac.goals.length > 0)
    ? ac.goals.map((g) => ({ ...g }))
    : DEFAULT_GOALS.map((g) => ({ ...g, id: newGoalId() }));
  openModal(`
    <h2>Edit goals</h2>
    <p class="muted">Change the wording, points, or list. New point values apply to future check-ins; past entries keep what was saved at the time.</p>
    <form id="edit-goals-form">
      <div id="goals-editor" class="goals-editor"></div>
      <button type="button" id="add-goal" class="btn-ghost btn-small">+ Add goal</button>
      <button type="submit" class="btn-primary" style="margin-top: 1rem;">Save changes</button>
      <p id="eg-status" class="muted"></p>
    </form>
  `, {
    onMount() {
      const editor = $("#goals-editor");
      renderGoalsEditor(editor, goals);
      $("#add-goal").addEventListener("click", () => addEmptyGoalRow(editor));
      $("#edit-goals-form").addEventListener("submit", handleSaveGoals);
    },
  });
}

function renderGoalsEditor(container, goals) {
  container.innerHTML = "";
  goals.forEach((g) => container.appendChild(makeGoalRow(g)));
  if (goals.length === 0) addEmptyGoalRow(container);
}

function makeGoalRow(g) {
  const row = document.createElement("div");
  row.className = "goal-row";
  row.dataset.id = g.id || newGoalId();
  row.innerHTML = `
    <input type="text"   class="goal-text"   maxlength="60" required value="${escapeHtml(g.text || "")}" placeholder="What's the goal?" />
    <input type="number" class="goal-points" min="0" max="10" required value="${Number(g.points ?? 1)}" />
    <button type="button" class="goal-remove" aria-label="Remove">×</button>
  `;
  row.querySelector(".goal-remove").addEventListener("click", () => row.remove());
  return row;
}

function addEmptyGoalRow(container) {
  container.appendChild(makeGoalRow({ id: newGoalId(), text: "", points: 1 }));
}

function collectGoals(container) {
  return Array.from(container.querySelectorAll(".goal-row")).map((row) => ({
    id: row.dataset.id,
    text: row.querySelector(".goal-text").value.trim(),
    points: clamp(parseInt(row.querySelector(".goal-points").value, 10) || 0, 0, 10),
  })).filter((g) => g.text);
}

async function handleSaveGoals(e) {
  e.preventDefault();
  const goals = collectGoals($("#goals-editor"));
  const status = $("#eg-status");
  if (goals.length === 0) { status.textContent = "Add at least one goal."; return; }
  status.textContent = "Saving…";
  const { data, error } = await state.client
    .from("challenges")
    .update({ goals })
    .eq("id", state.activeChallengeId)
    .select("id, goals");
  if (error) { status.textContent = "Couldn't save: " + error.message; return; }
  if (!data || data.length === 0) {
    status.textContent = "Couldn't save — only the challenge host can edit its goals.";
    return;
  }
  // Trust the row we just got back, not just the local intent.
  const saved = data[0].goals || goals;
  const c = state.challenges.find((x) => x.id === state.activeChallengeId);
  if (c) c.goals = saved;
  closeModal();
  reseedDraftFromEditingDate();
  renderApp();
}

// join_challenge() raises for a code that matches nothing; everything else is
// an unexpected failure worth showing verbatim.
function joinChallengeMessage(error) {
  if (/no challenge with that code/i.test(error.message || "")) {
    return "No challenge with that code.";
  }
  return "Couldn't join: " + error.message;
}

function openJoinChallengeForm() {
  openModal(`
    <h2>Join a challenge</h2>
    <p class="muted">Enter the 6-character code from whoever invited you.</p>
    <form id="join-challenge-form">
      <div class="field">
        <label for="jc-code">Invite code</label>
        <input type="text" id="jc-code" required minlength="4" maxlength="12" autocapitalize="characters" placeholder="ABC123" />
      </div>
      <button type="submit" class="btn-primary">Join</button>
      <p id="jc-status" class="muted"></p>
    </form>
  `, {
    onMount() {
      $("#join-challenge-form").addEventListener("submit", handleJoinChallenge);
      $("#jc-code").focus();
    },
  });
}

async function handleCreateChallenge(e) {
  e.preventDefault();
  const name = $("#nc-name").value.trim();
  const date = $("#nc-date").value;
  const days = parseInt($("#nc-days").value, 10);
  const goals = collectGoals($("#goals-editor"));
  const status = $("#nc-status");
  if (!name || !date || !days) return;
  if (goals.length === 0) { status.textContent = "Add at least one goal."; return; }
  status.textContent = "Creating…";

  // Challenges are readable only by their members, so creating one has to run
  // through the SECURITY DEFINER RPC: it inserts the challenge and the
  // creator's membership together and hands back the row we can't yet select.
  const { data: ch, error: insErr } = await state.client
    .rpc("create_challenge", {
      p_name: name, p_start_date: date, p_days: days, p_goals: goals,
    });
  if (insErr) { status.textContent = "Couldn't create: " + insErr.message; return; }

  closeModal();
  await loadChallenges();
  await setActiveChallenge(ch?.id);
  show("view-app");
}

async function handleJoinChallenge(e) {
  e.preventDefault();
  const code = $("#jc-code").value.trim().toUpperCase();
  const status = $("#jc-status");
  if (!code) return;
  status.textContent = "Joining…";

  // The code names a challenge this user can't see yet, so the lookup and the
  // membership insert both happen inside join_challenge().
  const { data: ch, error: joinErr } = await state.client
    .rpc("join_challenge", { p_code: code });
  if (joinErr) { status.textContent = joinChallengeMessage(joinErr); return; }

  closeModal();
  await loadChallenges();
  await setActiveChallenge(ch?.id);
  show("view-app");
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    flashStatus(label || "Copied");
  } catch {
    prompt("Copy this:", text);
  }
}

// Auto-join via ?join=CODE in the URL. Runs once after the user has a profile.
async function maybeAutoJoinFromUrl() {
  const url = new URL(location.href);
  const code = url.searchParams.get("join");
  if (!code) return;
  url.searchParams.delete("join");
  history.replaceState({}, "", url.toString());

  const { data: ch, error: joinErr } = await state.client
    .rpc("join_challenge", { p_code: code });
  if (joinErr) { alert(joinChallengeMessage(joinErr)); return; }

  await loadChallenges();
  if (ch?.id) await setActiveChallenge(ch.id);
}

// ─── View switching ───────────────────────────────────────────────────────
function show(id) {
  ["view-loading", "view-config", "view-auth", "view-onboarding", "view-challenges", "view-app"].forEach((v) => {
    const el = document.getElementById(v);
    if (!el) return;
    el.classList.toggle("hidden", v !== id);
  });
}
