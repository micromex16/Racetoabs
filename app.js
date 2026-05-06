const QUESTIONS = [
  { id: "exercise",   text: "Did you exercise 30 minutes today?",                  yesPoints: 3, noPoints: 0 },
  { id: "core",       text: "Extra 5 minutes of core?",                            yesPoints: 2, noPoints: 0 },
  { id: "nutrition",  text: "Did you hit your nutrition goal?",                    yesPoints: 3, noPoints: 0 },
  { id: "sleep",      text: "More than 7 hours of sleep?",                         yesPoints: 2, noPoints: 0 },
  { id: "water",      text: "More than 60 oz of water?",                           yesPoints: 2, noPoints: 0 },
  { id: "stretch",    text: "Did you stretch or foam roll?",                       yesPoints: 2, noPoints: 0 },
  { id: "noAlcohol",  text: "No alcohol today?",                                   yesPoints: 2, noPoints: 0 },
  { id: "screen",     text: "Less than 1 hour of non-work screen time?",           yesPoints: 2, noPoints: 0 },
];

const MAX_DAILY = QUESTIONS.reduce((sum, q) => sum + Math.max(q.yesPoints, q.noPoints), 0);
const STORAGE_KEY = "raceToAbs.entries.v1";
const NAME_KEY = "raceToAbs.lastName";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function startOfWeekISO(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  const day = d.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // make Monday the start
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(ts) {
  return new Date(ts).toLocaleString();
}

function entryPoints(entry) {
  return QUESTIONS.reduce((sum, q) => {
    const ans = entry.answers[q.id];
    if (ans === true) return sum + q.yesPoints;
    if (ans === false) return sum + q.noPoints;
    return sum;
  }, 0);
}

function renderQuestions() {
  const container = $("#questions");
  container.innerHTML = "";
  QUESTIONS.forEach((q) => {
    const row = document.createElement("div");
    row.className = "question";
    row.innerHTML = `
      <div>
        <div class="question-text">${q.text}</div>
        <small class="question-points">Yes: +${q.yesPoints} pts &middot; No: +${q.noPoints} pts</small>
      </div>
      <div class="toggle" data-qid="${q.id}" role="group" aria-label="${q.text}">
        <button type="button" class="yes" data-value="yes">Yes</button>
        <button type="button" class="no"  data-value="no">No</button>
      </div>
    `;
    container.appendChild(row);
  });

  $$(".toggle").forEach((toggle) => {
    toggle.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      toggle.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      toggle.dataset.answer = btn.dataset.value;
    });
  });
}

function readAnswers() {
  const answers = {};
  let missing = 0;
  $$(".toggle").forEach((toggle) => {
    const id = toggle.dataset.qid;
    const ans = toggle.dataset.answer;
    if (ans === "yes") answers[id] = true;
    else if (ans === "no") answers[id] = false;
    else missing++;
  });
  return { answers, missing };
}

function clearForm() {
  $$(".toggle").forEach((toggle) => {
    delete toggle.dataset.answer;
    toggle.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  });
}

function loadAnswersIntoForm(entry) {
  $$(".toggle").forEach((toggle) => {
    const id = toggle.dataset.qid;
    const v = entry.answers[id];
    toggle.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    if (v === true) {
      toggle.dataset.answer = "yes";
      toggle.querySelector('button[data-value="yes"]').classList.add("active");
    } else if (v === false) {
      toggle.dataset.answer = "no";
      toggle.querySelector('button[data-value="no"]').classList.add("active");
    } else {
      delete toggle.dataset.answer;
    }
  });
}

function findExisting(entries, name, date) {
  const key = name.trim().toLowerCase();
  return entries.findIndex((e) => e.name.trim().toLowerCase() === key && e.date === date);
}

function renderLeaderboard() {
  const weekStart = startOfWeekISO($("#week-picker").value || todayISO());
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const entries = loadEntries().filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    return d >= start && d < end;
  });

  const totals = new Map();
  entries.forEach((e) => {
    const key = e.name.trim();
    if (!totals.has(key)) totals.set(key, { name: key, points: 0, days: 0 });
    const row = totals.get(key);
    row.points += entryPoints(e);
    row.days += 1;
  });

  const ranked = [...totals.values()].sort((a, b) => b.points - a.points || b.days - a.days);
  const tbody = $("#leaderboard tbody");
  tbody.innerHTML = "";

  if (ranked.length === 0) {
    $("#leaderboard").classList.add("hidden");
    $("#leaderboard-empty").classList.remove("hidden");
    return;
  }
  $("#leaderboard").classList.remove("hidden");
  $("#leaderboard-empty").classList.add("hidden");

  ranked.forEach((row, i) => {
    const rank = i + 1;
    const tr = document.createElement("tr");
    tr.className = `rank-${rank}`;
    tr.innerHTML = `
      <td>${rank}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.points} / ${MAX_DAILY * row.days}</td>
      <td>${row.days}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderEntries() {
  const entries = loadEntries().slice().sort((a, b) => b.date.localeCompare(a.date) || b.timestamp - a.timestamp);
  const tbody = $("#entries-table tbody");
  tbody.innerHTML = "";

  if (entries.length === 0) {
    $("#entries-table").classList.add("hidden");
    $("#entries-empty").classList.remove("hidden");
    return;
  }
  $("#entries-table").classList.remove("hidden");
  $("#entries-empty").classList.add("hidden");

  entries.forEach((e) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(e.date)}</td>
      <td>${escapeHtml(e.name)}</td>
      <td>${entryPoints(e)} / ${MAX_DAILY}</td>
      <td>${fmtTime(e.timestamp)}</td>
      <td><button type="button" class="link" data-id="${e.id}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button.link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const entries = loadEntries().filter((e) => e.id !== id);
      saveEntries(entries);
      refreshAll();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function refreshAll() {
  renderLeaderboard();
  renderEntries();
  maybePreloadEntry();
}

function maybePreloadEntry() {
  const name = $("#name").value.trim();
  const date = $("#date").value;
  if (!name || !date) return;
  const entries = loadEntries();
  const idx = findExisting(entries, name, date);
  if (idx >= 0) {
    loadAnswersIntoForm(entries[idx]);
    $("#save-status").textContent = "Editing existing entry for this date.";
  } else {
    $("#save-status").textContent = "";
  }
}

function init() {
  renderQuestions();

  const today = todayISO();
  $("#date").value = today;
  $("#week-picker").value = today;
  $("#timestamp-note").textContent = `Will be timestamped on save.`;

  const lastName = localStorage.getItem(NAME_KEY);
  if (lastName) $("#name").value = lastName;

  $("#name").addEventListener("input", maybePreloadEntry);
  $("#date").addEventListener("change", maybePreloadEntry);
  $("#week-picker").addEventListener("change", renderLeaderboard);

  $("#entry-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#name").value.trim();
    const date = $("#date").value;
    if (!name || !date) return;

    const { answers, missing } = readAnswers();
    if (missing > 0) {
      $("#save-status").textContent = `Please answer all ${QUESTIONS.length} questions (${missing} missing).`;
      return;
    }

    localStorage.setItem(NAME_KEY, name);
    const entries = loadEntries();
    const idx = findExisting(entries, name, date);
    const record = {
      id: idx >= 0 ? entries[idx].id : cryptoId(),
      name,
      date,
      answers,
      timestamp: Date.now(),
    };
    if (idx >= 0) entries[idx] = record;
    else entries.push(record);
    saveEntries(entries);

    $("#save-status").textContent = `Saved! +${entryPoints(record)} points for ${fmtDate(date)}.`;
    refreshAll();
  });

  $("#clear-all").addEventListener("click", () => {
    if (!confirm("Delete every entry on this device? This can't be undone.")) return;
    localStorage.removeItem(STORAGE_KEY);
    clearForm();
    refreshAll();
  });

  refreshAll();
}

function cryptoId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

document.addEventListener("DOMContentLoaded", init);
