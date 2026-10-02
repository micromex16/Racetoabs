import { db } from "../db";
import { getTz } from "../settings";
import { todayKey, dateToKey, diffDays } from "../time";
import { award, revoke, maybeDrop, safely, bountyFor, COIN, addUnlock } from "./economy";
import { RARE_BLUEPRINTS, ACHIEVEMENTS, BUILDINGS } from "./catalog";

// Called by the service layer after real work changes. Each one is wrapped in
// safely() so a game bug can never block a task from being completed.

type PickRef = { kind: string; refId: string };

async function today() {
  return todayKey(await getTz());
}

export async function isTodaysPick(kind: string, refId: string) {
  const plan = await db.dailyPlan.findUnique({ where: { date: await today() }, select: { picks: true } });
  return ((plan?.picks as PickRef[]) ?? []).some((p) => p.kind === kind && p.refId === refId);
}

export const onTaskDone = (taskId: string, done: boolean) =>
  safely(async () => {
    const key = `task:${taskId}`;
    if (!done) return revoke(key);
    const t = await db.task.findUnique({ where: { id: taskId } });
    if (!t) return;
    const d = await today();
    const overdue = t.dueDate ? diffDays(d, dateToKey(t.dueDate)!) : 0;
    const bounty = bountyFor(t.dodges, overdue);
    const pick = (await isTodaysPick("task", taskId)) ? COIN.pickBonus : 0;
    const base = t.goalId ? COIN.taskLinked : COIN.taskUnlinked;
    await award(key, base + pick + bounty, bounty ? "bounty" : pick ? "pick" : "task", `${t.title}${bounty ? ` · bounty +${bounty}` : ""}`, { bounty, pick: !!pick });
    if (t.goalId) await maybeDrop(key, RARE_BLUEPRINTS);
  });

export const onFollowUpDone = (id: string, done: boolean) =>
  safely(async () => {
    const key = `fu:${id}`;
    if (!done) return revoke(key);
    const f = await db.followUp.findUnique({ where: { id }, include: { person: true } });
    if (!f) return;
    const overdue = diffDays(await today(), dateToKey(f.dueDate)!);
    const bounty = bountyFor(f.dodges, overdue);
    const pick = (await isTodaysPick("followup", id)) ? COIN.pickBonus : 0;
    await award(key, COIN.followUp + pick + bounty, bounty ? "bounty" : "followup", `Closed: ${f.person?.name ? f.person.name + " — " : ""}${f.title}${bounty ? ` · bounty +${bounty}` : ""}`, { bounty });
    await maybeDrop(key, RARE_BLUEPRINTS);
  });

/** Snoozed, carried or pushed out: the item's bounty grows. */
export const onDodge = (kind: "task" | "followup", id: string) =>
  safely(async () => {
    if (kind === "task") await db.task.update({ where: { id }, data: { dodges: { increment: 1 } } });
    else await db.followUp.update({ where: { id }, data: { dodges: { increment: 1 } } });
  });

const STAGE_ORDER = ["TARGET", "CONTACTED", "SAMPLE_SENT", "DISCOVERY", "RFQ", "QUOTED", "PILOT", "CUSTOMER"];

export const onStageMove = (cardId: string, company: string, from: string | null, to: string) =>
  safely(async () => {
    if (from && STAGE_ORDER.indexOf(to) <= STAGE_ORDER.indexOf(from)) return;
    const amount = COIN.stage[to] ?? 0;
    if (!amount) return;
    const key = `stage:${cardId}:${to}`;
    await award(key, amount, "pipeline", `${company} → ${to.replace("_", " ").toLowerCase()}`, { to });
    await maybeDrop(key, RARE_BLUEPRINTS);
  });

export const onNextActionDone = (cardId: string, company: string) =>
  safely(async () => {
    const d = await today();
    const pick = (await isTodaysPick("pipeline", cardId)) ? COIN.pickBonus : 0;
    await award(`next:${cardId}:${d}`, COIN.nextAction + pick, pick ? "pick" : "pipeline", `${company}: next action done`);
  });

export const onPipelinePickUndone = (cardId: string) =>
  safely(async () => {
    await revoke(`next:${cardId}:${await today()}`);
  });

/** Scoreboard entries pay per unit for activity metrics (recomputed for the week, so edits stay consistent). */
export const onMetricRecorded = (metricId: string, weekStart: Date) =>
  safely(async () => {
    const m = await db.metric.findUnique({ where: { id: metricId } });
    if (!m || m.source !== "MANUAL" || m.aggregation !== "SUM") return;
    const entry = await db.metricEntry.findUnique({ where: { metricId_weekStart: { metricId, weekStart } } });
    const unit = COIN.metricUnit[m.key] ?? 5;
    const cap = COIN.metricUnit[m.key] != null ? 2000 : 100;
    const value = Math.max(0, entry?.value ?? 0);
    await award(`metric:${m.key}:${dateToKey(weekStart)}`, Math.min(cap, Math.round(unit * value)), "metric", `${m.name}: ${value} this week`, { metric: m.key, value });
  });

export const onGoalDone = (goalId: string, done: boolean) =>
  safely(async () => {
    const key = `rock:${goalId}`;
    if (!done) return revoke(key);
    const g = await db.goal.findUnique({ where: { id: goalId } });
    if (!g) return;
    const amount = COIN.rock[g.level] ?? 0;
    await award(key, amount, "rock", `${g.level === "WEEKLY" ? "Weekly rock" : g.level === "QUARTERLY" ? "Quarter rock" : "Goal"} done: ${g.title}`);
    if (g.level === "QUARTERLY") await unlockAchievement("quarter_rock");
  });

/** Friday payout: rewards clean days and finished rocks, docks for what's overdue. */
export const onWeeklyReviewClosed = (weekStart: string, stats: { cleanDays: number; rocksDone: number; overdue: number }) =>
  safely(async () => {
    const amount = Math.max(50, 100 + 60 * stats.cleanDays + 40 * stats.rocksDone - 15 * stats.overdue);
    await award(`payout:${weekStart}`, amount, "payout", `Friday payout · ${stats.cleanDays} clean day${stats.cleanDays === 1 ? "" : "s"}, ${stats.rocksDone} rock${stats.rocksDone === 1 ? "" : "s"}${stats.overdue ? `, −${15 * stats.overdue} for overdue` : ""}`, stats);
    if (stats.cleanDays >= 4) await maybeDrop(`payout:${weekStart}`, RARE_BLUEPRINTS);
    if (stats.overdue === 0) await unlockAchievement("zero_overdue");
  });

export async function unlockAchievement(key: string) {
  const def = ACHIEVEMENTS.find((a) => a.key === key);
  if (!def) return false;
  const exists = await db.achievement.findUnique({ where: { key } });
  if (exists) return false;
  await db.achievement.create({ data: { key } });
  await award(`ach:${key}`, def.reward, "achievement", `${def.emoji} ${def.title}`, { achievement: key });
  // Achievements that unlock a building
  for (const b of BUILDINGS) if (b.unlock?.by === "achievement" && b.unlock.key === key) await addUnlock(b.key);
  return true;
}
