import { db } from "../db";
import { getSettings } from "../settings";
import { addDays, keyToDate, localParts, todayKey, weekStartKey, zonedMidnight } from "../time";
import { loadGoalTree, currentWeeklyRocks } from "../services/goals";
import { balance, gameState } from "./economy";
import { ACHIEVEMENTS, BUILDINGS } from "./catalog";
import { syncAchievements, syncRecords, recordsView, plantPower } from "./progress";
import { challengeView } from "./challenges";
import { ensureStarter, activeSprint } from "./town";

/** Everything the game UI needs, in one call. Also runs the derived syncs (achievements, records, twist). */
export async function getGame() {
  const s = await getSettings();
  const today = todayKey(s.timezone);
  const ws = weekStartKey(today);
  await ensureStarter();
  await syncAchievements(today);
  await syncRecords(today);
  const challenge = await challengeView(ws);

  const weekStart = zonedMidnight(ws, s.timezone);
  const dayStart = zonedMidnight(today, s.timezone);
  const [bal, gs, buildings, ach, rewards, recent, weekEarn, dayEarn, cards, kits, sprintsToday] = await Promise.all([
    balance(),
    gameState(),
    db.building.findMany({ orderBy: { createdAt: "asc" } }),
    db.achievement.findMany(),
    db.reward.findMany({ orderBy: [{ claimedAt: { sort: "asc", nulls: "first" } }, { cost: "asc" }] }),
    db.coinEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    db.coinEvent.aggregate({ where: { createdAt: { gte: weekStart }, amount: { gt: 0 }, kind: { notIn: ["sell"] } }, _sum: { amount: true } }),
    db.coinEvent.aggregate({ where: { createdAt: { gte: dayStart }, amount: { gt: 0 }, kind: { notIn: ["sell"] } }, _sum: { amount: true } }),
    db.pipelineCard.findMany({ where: { archivedAt: null }, select: { id: true, company: true, stage: true, lane: true } }),
    db.metricEntry.findFirst({ where: { metric: { key: "sample_kits" }, weekStart: keyToDate(ws) } }),
    db.focusSprint.count({ where: { completed: true, startedAt: { gte: dayStart } } }),
  ]);
  const { byId } = await loadGoalTree();
  const rocks = currentWeeklyRocks([...byId.values()], ws).map((r) => ({ id: r.id, title: r.title, progress: r.progress, done: r.status === "DONE" }));
  const unlocks = (gs.unlocks as string[]) ?? [];
  const lp = localParts(s.timezone);

  return {
    today,
    weekStart: ws,
    weekEnd: addDays(ws, 6),
    hour: lp.hour + lp.minute / 60,
    balance: bal,
    earnedWeek: weekEarn._sum.amount ?? 0,
    earnedToday: dayEarn._sum.amount ?? 0,
    freezes: gs.freezes,
    settings: { soundOn: gs.soundOn, hapticsOn: gs.hapticsOn, sprintMinutes: gs.sprintMinutes },
    power: await plantPower(today),
    buildings: buildings.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, level: b.level })),
    shop: BUILDINGS.filter((b) => !b.fixed).map((b) => {
      const locked = !!b.unlock && !unlocks.includes(b.key);
      const how = b.unlock?.by === "achievement" ? ACHIEVEMENTS.find((a) => a.key === (b.unlock as { key: string }).key)?.desc : b.unlock?.by === "rare" ? "Rare — drops on a lucky completion or a won twist." : null;
      return { key: b.key, locked, how: locked ? how : null };
    }),
    rocks,
    pipeline: cards,
    customers: cards.filter((c) => c.stage === "CUSTOMER").map((c) => c.company),
    kitsThisWeek: kits?.value ?? 0,
    challenge,
    achievements: ACHIEVEMENTS.map((a) => ({ ...a, unlockedAt: ach.find((x) => x.key === a.key)?.unlockedAt.toISOString() ?? null })),
    records: await recordsView(),
    rewards: rewards.map((r) => ({ id: r.id, title: r.title, emoji: r.emoji, cost: r.cost, claimedAt: r.claimedAt?.toISOString() ?? null })),
    recent: recent.map((e) => ({ id: e.id, key: e.key, amount: e.amount, kind: e.kind, label: e.label, meta: e.meta, at: e.createdAt.toISOString() })),
    activeSprint: await activeSprint(),
    sprintsToday,
  };
}

export type GamePayload = Awaited<ReturnType<typeof getGame>>;
