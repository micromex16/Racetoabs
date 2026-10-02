// Date conventions
// ─────────────────
// • "Date-only" values (due dates, week starts, next-action dates) are stored as
//   UTC midnight of the *local* calendar date, and passed around as "YYYY-MM-DD" keys.
// • "Now" is resolved in the user's timezone (default America/Phoenix — Tucson and
//   Imuris are both UTC−7 with no DST).

export const DEFAULT_TZ = "America/Phoenix";

export type DateKey = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar parts for an instant in a timezone. */
export function localParts(tz: string, at: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday as string,
  };
}

export function todayKey(tz: string, at: Date = new Date()): DateKey {
  const p = localParts(tz, at);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight. */
export function localMinutes(tz: string, at: Date = new Date()) {
  const p = localParts(tz, at);
  return p.hour * 60 + p.minute;
}

export function keyToDate(key: DateKey): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function dateToKey(d: Date | string | null | undefined): DateKey | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = keyToDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToKey(d)!;
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(key: DateKey) {
  return keyToDate(key).getUTCDay();
}

/** Monday of the week containing key. */
export function weekStartKey(key: DateKey): DateKey {
  const wd = weekday(key);
  const diff = wd === 0 ? -6 : 1 - wd;
  return addDays(key, diff);
}

export function diffDays(a: DateKey, b: DateKey) {
  return Math.round((keyToDate(a).getTime() - keyToDate(b).getTime()) / 86_400_000);
}

export function quarterOf(key: DateKey) {
  const m = Number(key.slice(5, 7));
  return { year: Number(key.slice(0, 4)), quarter: Math.ceil(m / 3) };
}

export function quarterBounds(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3 + 1;
  const start = `${year}-${pad(startMonth)}-01`;
  const endD = new Date(Date.UTC(year, startMonth - 1 + 3, 0));
  return { start, end: dateToKey(endD)! };
}

export function parseHHMM(s: string) {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fmtShort(key: DateKey | null | undefined) {
  if (!key) return "";
  const d = keyToDate(key);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtWeekday(key: DateKey) {
  return keyToDate(key).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/** Human relative label for a date key vs today. */
export function relDay(key: DateKey | null | undefined, today: DateKey) {
  if (!key) return "";
  const d = diffDays(key, today);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d < 0) return `${-d}d overdue`;
  if (d < 7) return fmtWeekday(key);
  return fmtShort(key);
}

/** Resolve a natural-ish weekday/relative word to a date key ("thursday", "tomorrow", "next week"). */
export function resolveDateWord(word: string, today: DateKey): DateKey | null {
  const w = word.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
  if (w === "today") return today;
  if (w === "tomorrow") return addDays(today, 1);
  if (w === "next week") return addDays(weekStartKey(today), 7);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const idx = days.findIndex((d) => w.startsWith(d.slice(0, 3)));
  if (idx >= 0) {
    const cur = weekday(today);
    let delta = (idx - cur + 7) % 7;
    if (delta === 0) delta = 7;
    return addDays(today, delta);
  }
  return null;
}
