// Race to Abs — frontend
// Backed by Supabase (auth + Postgres). See supabase/schema.sql.

const QUESTIONS = [
  { id: "exercise",  text: "30 minutes of exercise",                points: 3 },
  { id: "core",      text: "Extra 5 minutes of core",               points: 2 },
  { id: "nutrition", text: "Hit your nutrition goal",               points: 3 },
  { id: "sleep",     text: "More than 7 hours of sleep",            points: 2 },
  { id: "water",     text: "More than 60 oz of water",              points: 2 },
  { id: "stretch",   text: "Stretched or foam rolled",              points: 2 },
  { id: "noAlcohol", text: "No alcohol today",                      points: 2 },
  { id: "screen",    text: "Less than 1 hr non-work screen time",   points: 2 },
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
  draft: {},              // { questionId: true } for today's edits
  saving: false,
};

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
  $("#profile-form")?.addEventListener("submit", handleCreateProfile);
  $("#signout-btn")?.addEventListener("click", handleSignOut);
  $("#save-entry")?.addEventListener("click", handleSaveEntry);

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
  if (!state.profile) {
    show("view-onboarding");
    return;
  }

  await Promise.all([loadSettings(), loadAllData()]);
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
    state.client.from("profiles").select("id, display_name"),
    state.client.from("entries").select("id, user_id, date, answers, points").order("date", { ascending: false }),
  ]);
  state.profiles = profiles || [];
  state.entries = entries || [];

  // Seed today's draft from existing entry, if any
  const today = todayISO();
  const mine = state.entries.find((e) => e.user_id === state.user.id && e.date === today);
  state.draft = mine ? { ...mine.answers } : {};
}

// ─── Auth handlers ────────────────────────────────────────────────────────
async function handleSignIn(e) {
  e.preventDefault();
  const email = $("#email").value.trim();
  if (!email) return;
  const status = $("#signin-status");
  status.textContent = "Sending…";
  const { error } = await state.client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) {
    status.textContent = "Couldn't send link: " + error.message;
    return;
  }
  status.textContent = "Check your email for a sign-in link.";
}

async function handleSignOut() {
  await state.client.auth.signOut();
  state.profile = null;
  state.entries = [];
  state.profiles = [];
  state.draft = {};
}

async function handleCreateProfile(e) {
  e.preventDefault();
  const name = $("#display-name").value.trim();
  if (!name) return;
  const status = $("#profile-status");
  status.textContent = "Saving…";
  const { error } = await state.client
    .from("profiles")
    .insert({ id: state.user.id, display_name: name });
  if (error) {
    status.textContent = "Couldn't save: " + error.message;
    return;
  }
  await loadProfile();
  await Promise.all([loadSettings(), loadAllData()]);
  renderApp();
  show("view-app");
}

// ─── Entry handlers ───────────────────────────────────────────────────────
async function handleSaveEntry() {
  if (state.saving) return;
  const today = todayISO();
  if (!isInChallengeWindow(today)) {
    flashStatus("Challenge isn't active today.");
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
    date: today,
    answers,
    points,
  };
  const { error } = await state.client
    .from("entries")
    .upsert(row, { onConflict: "user_id,date" });

  state.saving = false;
  btn.disabled = false;
  btn.textContent = "Save check-in";

  if (error) {
    flashStatus("Couldn't save: " + error.message);
    return;
  }
  flashStatus(`Saved. +${points} pts today.`);
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
function renderApp() {
  $("#hello").textContent = state.profile?.display_name ? `Hi, ${state.profile.display_name}` : "";
  renderHero();
  renderCheckin();
  renderLeaderboard();
  renderWeekStrip();
}

function renderHero() {
  const start = state.settings.challenge_start_date;
  const total = state.settings.challenge_days;
  const today = todayISO();
  const dayNum = clamp(daysBetween(start, today) + 1, 0, total);
  $("#hero-day-num").textContent = String(Math.max(dayNum, 0));
  $("#hero-day-total").textContent = String(total);

  const startLabel = fmtDate(start);
  const endLabel = fmtDate(addDays(start, total - 1));
  $("#hero-dates").textContent = `${startLabel} → ${endLabel}`;

  const myEntries = state.entries.filter(
    (e) => e.user_id === state.user.id && isInChallengeWindow(e.date)
  );
  const myPoints = myEntries.reduce((s, e) => s + e.points, 0);
  $("#stat-points").textContent = String(myPoints);

  $("#stat-streak").textContent = String(currentStreakFor(state.user.id));

  const ranking = computeRanking();
  const myRank = ranking.findIndex((r) => r.userId === state.user.id);
  $("#stat-rank").textContent = myRank >= 0 ? String(myRank + 1) : "–";

  const pct = total > 0 ? clamp((dayNum / total) * 100, 0, 100) : 0;
  $("#progress-bar").style.width = `${pct}%`;
}

function renderCheckin() {
  const today = todayISO();
  $("#checkin-date").textContent = fmtDate(today);
  $("#checkin-max").textContent = String(MAX_DAILY);

  const inWindow = isInChallengeWindow(today);
  const outEl = $("#checkin-out-of-window");
  const list = $("#checkin-list");
  const footer = document.querySelector(".checkin-footer");

  if (!inWindow) {
    const start = state.settings.challenge_start_date;
    const today2 = todayISO();
    const before = today2 < start;
    outEl.classList.remove("hidden");
    outEl.textContent = before
      ? `Challenge starts ${fmtDate(start)}. Hang tight.`
      : `Challenge ended ${fmtDate(addDays(start, state.settings.challenge_days - 1))}.`;
    list.classList.add("hidden");
    footer.classList.add("hidden");
    return;
  }
  outEl.classList.add("hidden");
  list.classList.remove("hidden");
  footer.classList.remove("hidden");

  list.innerHTML = "";
  for (const q of QUESTIONS) {
    const checked = !!state.draft[q.id];
    const item = document.createElement("div");
    item.className = "checkin-item" + (checked ? " checked" : "");
    item.dataset.qid = q.id;
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-pressed", checked ? "true" : "false");
    item.innerHTML = `
      <div class="checkin-label">
        <div class="checkin-q">${escapeHtml(q.text)}</div>
        <div class="checkin-pts">+${q.points} pts</div>
      </div>
      <div class="check-circle" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#062b14" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    `;
    item.addEventListener("click", () => toggleQuestion(q.id));
    item.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleQuestion(q.id);
      }
    });
    list.appendChild(item);
  }
  updateCheckinSummary();
}

function toggleQuestion(qid) {
  state.draft[qid] = !state.draft[qid];
  const item = document.querySelector(`.checkin-item[data-qid="${qid}"]`);
  if (item) {
    item.classList.toggle("checked", !!state.draft[qid]);
    item.setAttribute("aria-pressed", state.draft[qid] ? "true" : "false");
  }
  updateCheckinSummary();
}

function updateCheckinSummary() {
  const answers = {};
  for (const q of QUESTIONS) answers[q.id] = !!state.draft[q.id];
  $("#checkin-points").textContent = String(computePoints(answers));
}

function renderLeaderboard() {
  const ranking = computeRanking();
  const ul = $("#leaderboard");
  const empty = $("#leaderboard-empty");
  ul.innerHTML = "";
  if (ranking.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  ranking.forEach((row, i) => {
    const rank = i + 1;
    const isYou = row.userId === state.user.id;
    const li = document.createElement("li");
    if (isYou) li.classList.add("you");
    li.innerHTML = `
      <div class="rank-badge ${rank <= 3 ? "rank-" + rank : ""}">${rank}</div>
      <div>
        <div class="lb-name">${escapeHtml(row.name)}${isYou ? " <span class=\"muted\">· you</span>" : ""}</div>
        <div class="lb-meta">${row.daysLogged} day${row.daysLogged === 1 ? "" : "s"} logged</div>
      </div>
      <div class="lb-points">${row.points}</div>
      <div class="lb-streak">${row.streak ? row.streak + "d" : ""}</div>
    `;
    ul.appendChild(li);
  });
}

function renderWeekStrip() {
  const strip = $("#week-strip");
  strip.innerHTML = "";
  const today = todayISO();
  const start = addDays(today, -6);
  const myEntries = new Map(
    state.entries
      .filter((e) => e.user_id === state.user.id)
      .map((e) => [e.date, e])
  );
  for (let i = 0; i < 7; i++) {
    const iso = addDays(start, i);
    const d = new Date(iso + "T00:00:00");
    const entry = myEntries.get(iso);
    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (iso === today) cell.classList.add("today");
    if (entry) cell.classList.add("logged");
    else if (iso < today && isInChallengeWindow(iso)) cell.classList.add("missed");
    cell.innerHTML = `
      <div class="day-name">${d.toLocaleDateString(undefined, { weekday: "short" })}</div>
      <div class="day-num">${entry ? entry.points : (iso === today ? "–" : (isInChallengeWindow(iso) ? "0" : "·"))}</div>
    `;
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

// ─── View switching ───────────────────────────────────────────────────────
function show(id) {
  ["view-loading", "view-config", "view-auth", "view-onboarding", "view-app"].forEach((v) => {
    const el = document.getElementById(v);
    if (!el) return;
    el.classList.toggle("hidden", v !== id);
  });
}
