import { db } from "../db";
import type { Prisma } from "@prisma/client";

// Coin ledger. Coins are a play currency for the town — never money.
// Every award has a stable key, so re-running a hook can't double-pay and
// un-checking something takes its coins back.

export const COIN = {
  pickBonus: 20,
  taskLinked: 10,
  taskUnlinked: 2,
  followUp: 15,
  nextAction: 15,
  cleanRun: 100,
  sprint: 20,
  recordBroken: 50,
  freezeCost: 150,
  bountyPerDodge: 15,
  bountyPerOverdueDay: 5,
  bountyCap: 150,
  rock: { WEEKLY: 150, QUARTERLY: 1000, ANNUAL: 3000, EXIT: 10000 } as Record<string, number>,
  stage: { TARGET: 0, CONTACTED: 10, SAMPLE_SENT: 20, DISCOVERY: 40, RFQ: 75, QUOTED: 75, PILOT: 150, CUSTOMER: 500 } as Record<string, number>,
  /** Coins per unit logged on these scoreboard metrics */
  metricUnit: { outreach_touches: 3, sample_kits: 10, discovery_calls: 25, rfqs: 40, quotes_sent: 40, linkedin_posts: 25, pilots_live: 0 } as Record<string, number>,
};

/** Chance that a completion drops a surprise. */
const DROP_CHANCE = 0.14;

export async function balance() {
  const r = await db.coinEvent.aggregate({ _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

/** Award (or update) coins under an idempotency key. amount 0 removes it. */
export async function award(key: string, amount: number, kind: string, label: string, meta: Prisma.InputJsonValue = {}) {
  if (amount === 0) {
    await db.coinEvent.deleteMany({ where: { key } });
    return null;
  }
  const existing = await db.coinEvent.findUnique({ where: { key } });
  if (existing) {
    if (existing.amount === amount) return null;
    return db.coinEvent.update({ where: { key }, data: { amount, label, meta } });
  }
  return db.coinEvent.create({ data: { key, amount, kind, label, meta } });
}

/** Take back an award and any surprise it dropped. */
export async function revoke(key: string) {
  await db.coinEvent.deleteMany({ where: { OR: [{ key }, { key: `drop:${key}` }] } });
}

export async function spend(key: string, cost: number, kind: string, label: string, meta: Prisma.InputJsonValue = {}) {
  const bal = await balance();
  if (bal < cost) throw new Error(`Not enough coins — you need ${cost - bal} more.`);
  return db.coinEvent.create({ data: { key, amount: -cost, kind, label, meta } });
}

export async function gameState() {
  return db.gameState.upsert({ where: { id: "me" }, create: { id: "me" }, update: {} });
}

export async function addUnlock(key: string) {
  const s = await gameState();
  const list = (s.unlocks as string[]) ?? [];
  if (list.includes(key)) return false;
  await db.gameState.update({ where: { id: "me" }, data: { unlocks: [...list, key] } });
  return true;
}

/** Random surprise on a completion: bonus coins, a rare blueprint, or a streak freeze. */
export async function maybeDrop(sourceKey: string, rareBlueprints: string[]) {
  if (await db.coinEvent.findUnique({ where: { key: `drop:${sourceKey}` } })) return;
  if (Math.random() > DROP_CHANCE) return;
  const s = await gameState();
  const locked = rareBlueprints.filter((b) => !((s.unlocks as string[]) ?? []).includes(b));
  const roll = Math.random();
  if (roll < 0.25 && locked.length) {
    const bp = locked[Math.floor(Math.random() * locked.length)];
    await addUnlock(bp);
    await db.coinEvent.create({ data: { key: `drop:${sourceKey}`, amount: 25, kind: "drop", label: "Lucky drop: rare blueprint", meta: { blueprint: bp } } });
  } else if (roll < 0.4 && s.freezes < 3) {
    await db.gameState.update({ where: { id: "me" }, data: { freezes: { increment: 1 } } });
    await db.coinEvent.create({ data: { key: `drop:${sourceKey}`, amount: 10, kind: "drop", label: "Lucky drop: streak freeze", meta: { freeze: true } } });
  } else {
    const coins = [25, 40, 60, 100, 150][Math.floor(Math.random() ** 2 * 5)];
    await db.coinEvent.create({ data: { key: `drop:${sourceKey}`, amount: coins, kind: "drop", label: `Lucky drop: +${coins}`, meta: {} } });
  }
}

/** Never let the game break the work: every hook goes through this. */
export async function safely(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error("[game]", e);
  }
}

export function bountyFor(dodges: number, overdueDays: number) {
  return Math.min(COIN.bountyCap, dodges * COIN.bountyPerDodge + Math.max(0, overdueDays) * COIN.bountyPerOverdueDay);
}

/** A zero-coin event, for moments worth a toast (freeze used/earned, record set…). */
export async function note(key: string, kind: string, label: string, meta: Prisma.InputJsonValue = {}) {
  return db.coinEvent.upsert({ where: { key }, create: { key, amount: 0, kind, label, meta }, update: {} });
}
