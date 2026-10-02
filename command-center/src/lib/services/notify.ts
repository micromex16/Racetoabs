import { db } from "../db";
import { getSettings } from "../settings";
import { localMinutes, parseHHMM, todayKey, weekday, dateToKey, keyToDate } from "../time";
import { getToday } from "./daily";
import { sendOnce } from "../push";

const WINDOW = 90; // minutes after the scheduled time we still send (covers missed ticks)

function trim(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

/** 7:00 "Your day" card: 3 rocks + 3 picks + 3 threads. */
export async function morningCard() {
  const t = await getToday();
  const rocks = t.weeklyRocks.length
    ? t.weeklyRocks.map((r, i) => `#${i + 1} ${trim(r.title, 28)} ${r.progress}%`).join(" · ")
    : "No rocks set — set 3 now";
  const picks = t.plan.picks.map((p, i) => `${i + 1}) ${trim(p.title, 40)}`).join("\n");
  const threads = t.inbox.top.slice(0, 3).map((th) => `• ${trim(th.subject || th.snippet, 38)}`).join("\n");
  const fu = t.followUpsDue.length ? `\n${t.followUpsDue.length} follow-up${t.followUpsDue.length > 1 ? "s" : ""} due` : "";
  return {
    title: "Your day",
    body: [rocks, picks || "No picks yet — open to launch.", threads].filter(Boolean).join("\n") + fu,
    url: "/",
    tag: `morning-${t.today}`,
  };
}

export async function closeNudge() {
  const t = await getToday();
  const done = t.plan.picks.filter((p) => p.done).length;
  return {
    title: "Close the day",
    body: `${done}/${t.plan.picks.length} picks done · streak ${t.streak.current}. One tap to carry or park the rest.`,
    url: "/?close=1",
    tag: `close-${t.today}`,
  };
}

/** Runs from the cron tick. Each notification is idempotent per day. */
export async function runScheduledNotifications(now = new Date()) {
  const s = await getSettings();
  if (!s.pushEnabled) return { skipped: "push disabled" };
  const today = todayKey(s.timezone, now);
  const mins = localMinutes(s.timezone, now);
  const wd = weekday(today);
  const workday = wd !== 0 && wd !== 6;
  const out: Record<string, unknown> = {};

  const morning = parseHHMM(s.morningTime);
  if (workday && mins >= morning && mins < morning + WINDOW) out.morning = await sendOnce(`morning:${today}`, await morningCard());

  const close = parseHHMM(s.closeTime);
  if (workday && mins >= close && mins < close + WINDOW) {
    const plan = await db.dailyPlan.findUnique({ where: { date: today } });
    if (!plan?.closedAt) out.close = await sendOnce(`close:${today}`, await closeNudge());
  }

  // Follow-up reminders: 2h after the morning card, one digest of what's due/overdue.
  const fuAt = morning + 120;
  if (workday && mins >= fuAt && mins < fuAt + WINDOW) {
    const due = await db.followUp.findMany({ where: { status: "OPEN", dueDate: { lte: keyToDate(today) } }, include: { person: true }, orderBy: { dueDate: "asc" } });
    if (due.length) {
      const overdue = due.filter((f) => dateToKey(f.dueDate)! < today).length;
      out.followups = await sendOnce(`followups:${today}`, {
        title: `${due.length} follow-up${due.length > 1 ? "s" : ""} due${overdue ? ` (${overdue} overdue)` : ""}`,
        body: due.slice(0, 4).map((f) => `• ${f.person?.name ?? "—"}: ${trim(f.title, 40)}`).join("\n"),
        url: "/accountability",
        tag: `followups-${today}`,
      });
      await db.followUp.updateMany({ where: { id: { in: due.map((f) => f.id) } }, data: { remindedAt: new Date() } });
    }
  }

  // Friday review nudge at close time on review day
  if (wd === s.reviewDay && mins >= close - 60 && mins < close - 60 + WINDOW) {
    out.review = await sendOnce(`review:${today}`, { title: "Friday review", body: "Said vs. done, triage the Parking Lot, set next week's rocks.", url: "/review", tag: `review-${today}` });
  }
  return out;
}
