// Race to Abs — frontend
// Backed by Supabase (auth + Postgres). See supabase/schema.sql.

const QUESTIONS = [
  { id: "exercise",  text: "30 minutes of exercise",                points: 3 },
  { id: "core",      text: "Extra 5 minutes of core",               points: 1 },
  { id: "nutrition", text: "Hit your nutrition goal",               points: 3 },
  { id: "sleep",     text: "More than 7 hours of sleep",            points: 2 },
  { id: "water",     text: "More than 60 oz of water",              points: 2 },
  { id: "stretch",   text: "Stretched or foam rolled",              points: 1 },
  { id: "noAlcohol", text: "No alcohol today",                      points: 2 },
  { id: "screen",    text: "Less than 1 hr non-work screen time",   points: 2 },
  { id: "custom",    text: "Your custom goal",                      points: 2, custom: true },
];

const MAX_DAILY = QUESTIONS.reduce((s, q) => s + q.points, 0);

// ─── State ────────────────────────────────────────────────────────────────
const state = {
  client: null,
  user: null,
  profile: null,
  settings: null,         // { challenge_start_date, challenge_days }
  entries: [],            // all entries from all users
  profiles: [],           // all profiles
  draft: {},              // { questionId: true } for the currently-displayed day
  editingDate: null,      // ISO date being shown / edited (defaults to today)
  viewingUserId: null,    // if set, we're looking at someone else's profile read-only
  saving: false,
  messages: [],           // all chat messages, oldest first
  messagesChannel: null,  // supabase realtime channel
  pendingImage: null,     // File selected for upload but not yet sent
  sending: false,
};

const signedUrlCache = new Map(); // path → { url, expiresAt }

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
  $("#signout-btn")?.addEventListener("click", handleSignOut);
  $("#save-entry")?.addEventListener("click", handleSaveEntry);
  $("#back-to-today")?.addEventListener("click", () => setEditingDate(todayISO()));
  $("#viewing-back")?.addEventListener("click", () => setViewingUser(state.user.id));
  $("#chat-send")?.addEventListener("click", handleSendChat);
  $("#chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
  });
  $("#chat-image")?.addEventListener("change", handlePickChatImage);
  $("#chat-preview-remove")?.addEventListener("click", clearPendingImage);

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

  // Load profile + shared data
  await loadProfile();
  if (!state.profile || !state.profile.custom_goal || !state.profile.custom_goal.trim()) {
    // Pre-fill if returning to finish onboarding
    if (state.profile?.display_name) $("#display-name").value = state.profile.display_name;
    if (state.profile?.custom_goal) $("#custom-goal").value = state.profile.custom_goal;
    show("view-onboarding");
    return;
  }

  await Promise.all([loadSettings(), loadAllData(), loadMessages()]);
  subscribeMessages();
  renderApp();
  show("view-app");
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

async function loadSettings() {
  const { data, error } = await state.client
    .from("settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) console.error(error);
  state.settings = data || { challenge_start_date: todayISO(), challenge_days: 30 };
}

async function loadAllData() {
  const [{ data: profiles }, { data: entries }] = await Promise.all([
    state.client.from("profiles").select("id, display_name, custom_goal"),
    state.client.from("entries").select("id, user_id, date, answers, points").order("date", { ascending: false }),
  ]);
  state.profiles = profiles || [];
  state.entries = entries || [];

  if (!state.editingDate) state.editingDate = todayISO();
  reseedDraftFromEditingDate();
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
  signedUrlCache.clear();
}

async function handleCreateProfile(e) {
  e.preventDefault();
  const name = $("#display-name").value.trim();
  const customGoal = $("#custom-goal").value.trim();
  if (!name || !customGoal) return;
  const status = $("#profile-status");
  status.textContent = "Saving…";
  const { error } = await state.client
    .from("profiles")
    .upsert({ id: state.user.id, display_name: name, custom_goal: customGoal });
  if (error) {
    status.textContent = "Couldn't save: " + error.message;
    return;
  }
  await loadProfile();
  await Promise.all([loadSettings(), loadAllData()]);
  renderApp();
  show("view-app");
}

async function updateCustomGoal(newGoal) {
  const trimmed = (newGoal || "").trim();
  if (!trimmed) return;
  const { error } = await state.client
    .from("profiles")
    .update({ custom_goal: trimmed })
    .eq("id", state.user.id);
  if (error) {
    flashStatus("Couldn't update goal: " + error.message);
    return;
  }
  state.profile.custom_goal = trimmed;
  renderCheckin();
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
  for (const q of QUESTIONS) answers[q.id] = !!state.draft[q.id];
  const points = computePoints(answers);

  const row = {
    user_id: state.user.id,
    date,
    answers,
    points,
  };
  const { error } = await state.client
    .from("entries")
    .upsert(row, { onConflict: "user_id,date" });

  state.saving = false;
  btn.disabled = false;
  btn.textContent = "Save";

  if (error) {
    flashStatus("Couldn't save: " + error.message);
    return;
  }
  const dayLabel = date === todayISO() ? "today" : fmtDate(date);
  flashStatus(`Saved. +${points} pts for ${dayLabel}.`);
  await loadAllData();
  renderApp();
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
  $("#hello").textContent = state.profile?.display_name ? `Hi, ${state.profile.display_name}` : "";
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
  $("#ring-max").textContent = String(MAX_DAILY);

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
  for (const q of QUESTIONS) draftAnswers[q.id] = !!state.draft[q.id];
  const points = computePoints(draftAnswers);
  const pct = MAX_DAILY > 0 ? Math.min(points / MAX_DAILY, 1) : 0;

  animateNumber($("#ring-num"), points);

  const fillEl = $("#ring-fill");
  fillEl.setAttribute("stroke-dasharray", String(RING_CIRCUMFERENCE));
  fillEl.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - pct));

  const checkedCount = QUESTIONS.filter((q) => draftAnswers[q.id]).length;
  const tag = inWindow
    ? `${checkedCount} of ${QUESTIONS.length} checked`
    : (date < state.settings.challenge_start_date ? "before challenge" : "after challenge");
  $("#ring-tag").textContent = tag;

  let stateMsg = "";
  if (!inWindow) {
    stateMsg = "";
  } else if (readOnly) {
    stateMsg = dayEntry
      ? (points === MAX_DAILY ? "Perfect day" : "Logged")
      : "Not logged this day";
  } else if (dayEntry && JSON.stringify(draftAnswers) === JSON.stringify(dayEntry.answers)) {
    stateMsg = points === MAX_DAILY
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
    inWindow && points === MAX_DAILY
  );
}

function renderStats() {
  const start = state.settings.challenge_start_date;
  const total = state.settings.challenge_days;
  const today = todayISO();
  const rawDay = daysBetween(start, today) + 1;
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

  const maxSoFar = Math.max(dayNum, 0) * MAX_DAILY;
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
    const start = state.settings.challenge_start_date;
    const before = date < start;
    outEl.classList.remove("hidden");
    outEl.textContent = before
      ? `Challenge starts ${fmtDate(start)}. Hang tight.`
      : `Challenge ended ${fmtDate(addDays(start, state.settings.challenge_days - 1))}.`;
    list.classList.add("hidden");
    saveBtn.classList.add("hidden");
    return;
  }
  outEl.classList.add("hidden");
  list.classList.remove("hidden");
  saveBtn.classList.toggle("hidden", readOnly);

  list.innerHTML = "";
  for (const q of QUESTIONS) {
    const checked = !!state.draft[q.id];
    const isCustom = !!q.custom;
    const customLabel = profile?.custom_goal?.trim();
    const labelText = isCustom
      ? (customLabel || (readOnly ? "Custom goal (not set)" : "Set a custom goal"))
      : q.text;
    const item = document.createElement("div");
    item.className = "checkin-item" + (checked ? " checked" : "") + (isCustom ? " custom" : "");
    item.dataset.qid = q.id;
    if (!readOnly) {
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.setAttribute("aria-pressed", checked ? "true" : "false");
    }
    const editBtn = (isCustom && !readOnly)
      ? `<button type="button" class="edit-goal" aria-label="Edit custom goal" title="Edit goal">
           <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
           </svg>
         </button>`
      : "";
    const ptsLabel = `+${q.points} pt${q.points === 1 ? "" : "s"}${isCustom ? (readOnly ? " · custom goal" : " · your goal") : ""}`;
    item.innerHTML = `
      <div class="checkin-label">
        <div class="checkin-q">${escapeHtml(labelText)}${editBtn}</div>
        <div class="checkin-pts">${ptsLabel}</div>
      </div>
      <div class="check-circle" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#062b14" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    `;
    if (!readOnly) {
      item.addEventListener("click", (e) => {
        if (e.target.closest(".edit-goal")) return;
        toggleQuestion(q.id);
      });
      item.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggleQuestion(q.id);
        }
      });
      if (isCustom) {
        item.querySelector(".edit-goal")?.addEventListener("click", (e) => {
          e.stopPropagation();
          const current = state.profile?.custom_goal || "";
          const next = window.prompt("Update your custom goal:", current);
          if (next != null) updateCustomGoal(next);
        });
      }
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
  return QUESTIONS.reduce((s, q) => s + (answers[q.id] ? q.points : 0), 0);
}

function isInChallengeWindow(iso) {
  const start = state.settings.challenge_start_date;
  const end = addDays(start, state.settings.challenge_days - 1);
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
  const { data, error } = await state.client
    .from("messages")
    .select("id, user_id, body, image_path, created_at")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) { console.error(error); return; }
  state.messages = data || [];
  await refreshSignedUrls(state.messages);
}

function subscribeMessages() {
  if (state.messagesChannel) return;
  state.messagesChannel = state.client
    .channel("messages-feed")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      async (payload) => {
        const m = payload.new;
        if (!state.messages.find((x) => x.id === m.id)) state.messages.push(m);
        if (m.image_path) await getSignedUrl(m.image_path);
        renderChat({ keepScroll: false });
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "messages" },
      (payload) => {
        const id = payload.old?.id;
        if (!id) return;
        state.messages = state.messages.filter((m) => m.id !== id);
        renderChat({ keepScroll: true });
      }
    )
    .subscribe();
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

// ─── View switching ───────────────────────────────────────────────────────
function show(id) {
  ["view-loading", "view-config", "view-auth", "view-onboarding", "view-app"].forEach((v) => {
    const el = document.getElementById(v);
    if (!el) return;
    el.classList.toggle("hidden", v !== id);
  });
}
