import { db } from "../db";
import { getSettings } from "../settings";
import { addDays, dateToKey, keyToDate, localMinutes, todayKey, weekStartKey, weekday } from "../time";
import { streak } from "../services/daily";
import { exitReadiness } from "../services/metrics";
import { award } from "./economy";
import { unlockAchievement } from "./hooks";
import { RECORDS, fmtRecord, type RecordDef } from "./catalog";

// Achievements and personal records are derived from real data on each sync.

const SPEND_KINDS = ["build", "upgrade", "freeze", "reward", "sell", "record"];

async function sumMetric(key: string) {
  const r = await db.metricEntry.aggregate({ where: { metric: { key } }, _sum: { value: true } });
  return r._sum.value ?? 0;
}

export async function syncAchievements(today: string) {
  const s = await getSettings();
  const [cleanRuns, plans, sprints, rfq, adDisc, dcPilot, won, reviews, challengesWon, buildings, quarterDone, pipelineActive] = await Promise.all([
    db.dailyPlan.count({ where: { allDone: true } }),
    db.dailyPlan.findMany({ where: { finishedAt: { not: null } }, select: { finishedAt: true } }),
    db.focusSprint.count({ where: { completed: true } }),
    db.pipelineEvent.count({ where: { toStage: { in: ["RFQ", "QUOTED", "PILOT", "CUSTOMER"] } } }),
    db.pipelineEvent.count({ where: { toStage: { in: ["DISCOVERY", "RFQ", "QUOTED", "PILOT", "CUSTOMER"] }, card: { lane: "AD" } } }),
    db.pipelineEvent.count({ where: { toStage: { in: ["PILOT", "CUSTOMER"] }, card: { lane: "DATA_CENTER" } } }),
    db.pipelineCard.count({ where: { wonAt: { not: null } } }),
    db.weeklyReview.count({ where: { closedAt: { not: null } } }),
    db.challenge.count({ where: { status: "WON" } }),
    db.building.count({ where: { type: { not: "plant_1" } } }),
    db.goal.count({ where: { level: "QUARTERLY", status: "DONE" } }),
    db.pipelineCard.count({ where: { archivedAt: null, stage: { not: "CUSTOMER" } } }),
  ]);
  const st = await streak(today);
  const early = plans.some((p) => localMinutes(s.timezone, p.finishedAt!) < 600);
  const checks: [string, boolean][] = [
    ["first_clean", cleanRuns >= 1],
    ["early_bird", early],
    ["streak_5", st.best >= 5],
    ["streak_10", st.best >= 10],
    ["streak_20", st.best >= 20],
    ["sprints_10", sprints >= 10],
    ["sprints_50", sprints >= 50],
    ["first_rfq", rfq >= 1],
    ["ad_discovery", adDisc >= 1],
    ["dc_pilot", dcPilot >= 1],
    ["first_customer", won >= 1],
    ["reviews_4", reviews >= 4],
    ["challenge_3", challengesWon >= 3],
    ["first_build", buildings >= 1],
    ["builder_10", buildings >= 10],
    ["quarter_rock", quarterDone >= 1],
    ["pipeline_100", pipelineActive >= 100],
  ];
  const have = new Set((await db.achievement.findMany({ select: { key: true } })).map((a) => a.key));
  for (const [k, ok] of checks) if (ok && !have.has(k)) await unlockAchievement(k);
  // Costlier checks only when still locked
  if (!have.has("kits_50") && (await sumMetric("sample_kits")) >= 50) await unlockAchievement("kits_50");
  if (!have.has("touches_100") && (await sumMetric("outreach_touches")) >= 100) await unlockAchievement("touches_100");
  if (!have.has("exit_80") && (await exitReadiness()).score >= 80) await unlockAchievement("exit_80");
}

/** Current best value for each record, from the data. */
async function computeRecords(today: string, tz: string): Promise<Record<string, { value: number; detail: string } | null>> {
  const plans = await db.dailyPlan.findMany({ select: { date: true, allDone: true, launchedAt: true, createdAt: true, finishedAt: true } });
  const finished = plans.filter((p) => p.finishedAt);
  const durations = finished.map((p) => ({ v: (p.finishedAt!.getTime() - (p.launchedAt ?? p.createdAt).getTime()) / 1000, d: p.date })).filter((x) => x.v > 0);
  const clocks = finished.map((p) => ({ v: localMinutes(tz, p.finishedAt!), d: p.date }));
  const cleanByWeek = new Map<string, number>();
  for (const p of plans) if (p.allDone) cleanByWeek.set(weekStartKey(p.date), (cleanByWeek.get(weekStartKey(p.date)) ?? 0) + 1);
  const touches = await db.metricEntry.findMany({ where: { metric: { key: "outreach_touches" } }, select: { value: true, weekStart: true } });
  const sprints = await db.focusSprint.findMany({ where: { completed: true }, select: { startedAt: true } });
  const perDay = new Map<string, number>();
  for (const sp of sprints) {
    const k = todayKey(tz, sp.startedAt);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const events = await db.coinEvent.findMany({ where: { amount: { gt: 0 }, kind: { notIn: SPEND_KINDS } }, select: { amount: true, createdAt: true } });
  const coinsByWeek = new Map<string, number>();
  for (const e of events) {
    const k = weekStartKey(todayKey(tz, e.createdAt));
    coinsByWeek.set(k, (coinsByWeek.get(k) ?? 0) + e.amount);
  }
  const min = (xs: { v: number; d: string }[]) => (xs.length ? xs.reduce((a, b) => (b.v < a.v ? b : a)) : null);
  const maxOf = (m: Map<string, number>) => {
    let best: [string, number] | null = null;
    for (const e of m) if (!best || e[1] > best[1]) best = e;
    return best;
  };
  const fr = min(durations);
  const ef = min(clocks);
  const cw = maxOf(cleanByWeek);
  const sd = maxOf(perDay);
  const cbw = maxOf(coinsByWeek);
  const tw = touches.length ? touches.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const st = await streak(today);
  return {
    fastest_run: fr ? { value: Math.round(fr.v), detail: fr.d } : null,
    earliest_finish: ef ? { value: ef.v, detail: ef.d } : null,
    longest_streak: st.best ? { value: st.best, detail: "" } : null,
    clean_week: cw ? { value: cw[1], detail: `week of ${cw[0]}` } : null,
    touches_week: tw && tw.value > 0 ? { value: tw.value, detail: `week of ${dateToKey(tw.weekStart)}` } : null,
    sprints_day: sd ? { value: sd[1], detail: sd[0] } : null,
    coins_week: cbw ? { value: cbw[1], detail: `week of ${cbw[0]}` } : null,
  };
}

function better(def: RecordDef, a: number, b: number) {
  return def.better === "lower" ? a < b : a > b;
}

/** Store new personal bests. Beating an existing record pays out and fires a "record broken" moment. */
export async function syncRecords(today: string) {
  const s = await getSettings();
  const current = await computeRecords(today, s.timezone);
  const stored = new Map((await db.personalRecord.findMany()).map((r) => [r.key, r]));
  for (const def of RECORDS) {
    const c = current[def.key];
    if (!c) continue;
    const prev = stored.get(def.key);
    if (!prev) {
      await db.personalRecord.create({ data: { key: def.key, value: c.value, detail: c.detail } });
      continue;
    }
    if (better(def, c.value, prev.value)) {
      await db.personalRecord.update({ where: { key: def.key }, data: { value: c.value, previous: prev.value, detail: c.detail, at: new Date() } });
      await award(`record:${def.key}:${c.value}`, 50, "record", `New record — ${def.title}: ${fmtRecord(def, c.value)} (was ${fmtRecord(def, prev.value)})`, { record: def.key, value: c.value, previous: prev.value });
    }
  }
}

export async function recordsView() {
  const stored = new Map((await db.personalRecord.findMany()).map((r) => [r.key, r]));
  return RECORDS.map((d) => {
    const r = stored.get(d.key);
    return { ...d, value: r?.value ?? null, previous: r?.previous ?? null, detail: r?.detail ?? "", at: r?.at.toISOString() ?? null, display: r ? fmtRecord(d, r.value) : "—" };
  });
}

/** Plant power: dims when workdays are missed and work goes overdue. */
export async function plantPower(today: string) {
  const first = await db.dailyPlan.findFirst({ orderBy: { date: "asc" }, select: { date: true } });
  const days: string[] = [];
  let d = addDays(today, -1);
  while (days.length < 5) {
    if (weekday(d) !== 0 && weekday(d) !== 6) days.push(d);
    d = addDays(d, -1);
  }
  const plans = await db.dailyPlan.findMany({ where: { date: { in: days } } });
  const map = new Map(plans.map((p) => [p.date, p]));
  const missed = first ? days.filter((x) => x >= first.date && !map.get(x)?.allDone && !map.get(x)?.frozen).length : 0;
  const todayPlan = await db.dailyPlan.findUnique({ where: { date: today }, select: { allDone: true } });
  const [ot, of] = await Promise.all([
    db.task.count({ where: { status: "OPEN", ownerId: null, dueDate: { lt: keyToDate(today) } } }),
    db.followUp.count({ where: { status: "OPEN", dueDate: { lt: keyToDate(today) } } }),
  ]);
  const overdue = ot + of;
  const value = Math.max(10, Math.min(100, 100 - 18 * missed - 3 * Math.min(overdue, 10) + (todayPlan?.allDone ? 10 : 0)));
  const label = value >= 80 ? "Running hot" : value >= 50 ? "Steady" : value >= 25 ? "Flickering" : "Lights out";
  const hint =
    value >= 80
      ? "Every line is lit."
      : missed
        ? `${missed} missed workday${missed > 1 ? "s" : ""} this week${overdue ? ` and ${overdue} overdue` : ""}. Clean runs power it back up.`
        : `${overdue} overdue item${overdue === 1 ? "" : "s"} are draining power.`;
  return { value, label, hint, missed, overdue };
}
