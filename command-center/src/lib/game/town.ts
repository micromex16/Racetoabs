import { randomUUID } from "crypto";
import { db } from "../db";
import { getSettings } from "../settings";
import { todayKey } from "../time";
import { award, spend, gameState, COIN } from "./economy";
import { BUILDINGS, BEACONS, FIXED, GRID, buildingDef, upgradeCost } from "./catalog";

// The town: place, move, upgrade and sell buildings with coins.

export async function ensureStarter() {
  for (const f of FIXED) {
    if (!(await db.building.findFirst({ where: { type: f.key } }))) await db.building.create({ data: { type: f.key, x: f.x, y: f.y } });
  }
}

async function occupied(ignoreId?: string) {
  const list = await db.building.findMany();
  const cells = new Set<string>();
  for (const b of list) {
    if (b.id === ignoreId) continue;
    const d = buildingDef(b.type);
    if (!d) continue;
    for (let i = 0; i < d.w; i++) for (let j = 0; j < d.d; j++) cells.add(`${b.x + i},${b.y + j}`);
  }
  for (const bc of BEACONS) cells.add(`${bc.x},${bc.y}`);
  return cells;
}

async function assertFree(type: string, x: number, y: number, ignoreId?: string) {
  const d = buildingDef(type);
  if (!d) throw new Error("Unknown building.");
  if (x < 0 || y < 0 || x + d.w > GRID.w || y + d.d > GRID.h) throw new Error("That doesn't fit there.");
  const occ = await occupied(ignoreId);
  for (let i = 0; i < d.w; i++) for (let j = 0; j < d.d; j++) if (occ.has(`${x + i},${y + j}`)) throw new Error("Something's already there.");
  return d;
}

export async function build(type: string, x: number, y: number) {
  const d = await assertFree(type, x, y);
  if (d.fixed) throw new Error("That one's already built.");
  if (d.unlock) {
    const gs = await gameState();
    if (!((gs.unlocks as string[]) ?? []).includes(type)) throw new Error("Still locked — see how to unlock it in the shop.");
  }
  const id = randomUUID();
  await spend(`build:${id}`, d.cost, "build", `Built ${d.name}`, { type });
  return db.building.create({ data: { id, type, x, y } });
}

export async function moveBuilding(id: string, x: number, y: number) {
  const b = await db.building.findUniqueOrThrow({ where: { id } });
  await assertFree(b.type, x, y, id);
  return db.building.update({ where: { id }, data: { x, y } });
}

export async function upgradeBuilding(id: string) {
  const b = await db.building.findUniqueOrThrow({ where: { id } });
  const d = buildingDef(b.type)!;
  if (b.level >= d.maxLevel) throw new Error("Already at max level.");
  const cost = d.fixed ? 400 * b.level : upgradeCost(d, b.level + 1);
  await spend(`upgrade:${id}:${b.level + 1}`, cost, "upgrade", `Upgraded ${d.name} to level ${b.level + 1}`, { type: b.type });
  return db.building.update({ where: { id }, data: { level: b.level + 1 } });
}

export async function sellBuilding(id: string) {
  const b = await db.building.findUniqueOrThrow({ where: { id } });
  const d = buildingDef(b.type)!;
  if (d.fixed) throw new Error("The original plant stays.");
  let invested = d.cost;
  for (let l = 2; l <= b.level; l++) invested += upgradeCost(d, l);
  const refund = Math.floor(invested / 2);
  await db.building.delete({ where: { id } });
  await award(`sell:${id}`, refund, "sell", `Sold ${d.name} (+${refund})`);
  return { refund };
}

export async function buyFreeze() {
  const gs = await gameState();
  if (gs.freezes >= 3) throw new Error("You can hold 3 freezes at most.");
  await spend(`freeze:${randomUUID()}`, COIN.freezeCost, "freeze", "Bought a streak freeze 🧊");
  return db.gameState.update({ where: { id: "me" }, data: { freezes: { increment: 1 } } });
}

// ───────── Real-life rewards you set for yourself ─────────

export async function upsertReward(id: string | null, input: { title: string; emoji?: string; cost: number }) {
  if (id) return db.reward.update({ where: { id }, data: input });
  return db.reward.create({ data: input });
}

export async function claimReward(id: string) {
  const r = await db.reward.findUniqueOrThrow({ where: { id } });
  if (r.claimedAt) throw new Error("Already claimed — enjoy it.");
  await spend(`reward:${id}`, r.cost, "reward", `${r.emoji} Treated yourself: ${r.title}`);
  return db.reward.update({ where: { id }, data: { claimedAt: new Date() } });
}

export async function deleteReward(id: string) {
  const r = await db.reward.findUniqueOrThrow({ where: { id } });
  if (r.claimedAt) throw new Error("Claimed rewards stay in the trophy case.");
  return db.reward.delete({ where: { id } });
}

// ───────── Focus sprints ─────────

export async function activeSprint() {
  return db.focusSprint.findFirst({ where: { endedAt: null }, orderBy: { startedAt: "desc" } });
}

export async function startSprint(input: { title: string; kind?: string | null; refId?: string | null; minutes?: number }) {
  const running = await activeSprint();
  if (running) return running;
  const minutes = input.minutes ?? (await gameState()).sprintMinutes;
  return db.focusSprint.create({ data: { title: input.title, kind: input.kind ?? null, refId: input.refId ?? null, minutes, endsAt: new Date(Date.now() + minutes * 60_000) } });
}

/** Finish or abandon. Only a sprint that ran its full time pays out (combo grows through the day). */
export async function finishSprint(id: string, completed: boolean) {
  const sp = await db.focusSprint.findUniqueOrThrow({ where: { id } });
  if (sp.endedAt) return sp;
  const ok = completed && Date.now() >= sp.endsAt.getTime() - 10_000;
  const updated = await db.focusSprint.update({ where: { id }, data: { endedAt: new Date(), completed: ok } });
  if (ok) {
    const s = await getSettings();
    const today = todayKey(s.timezone);
    const doneToday = (await db.focusSprint.findMany({ where: { completed: true, startedAt: { gte: new Date(Date.now() - 20 * 3600_000) } }, select: { startedAt: true } })).filter((x) => todayKey(s.timezone, x.startedAt) === today).length;
    const combo = Math.min(30, (doneToday - 1) * 5);
    await award(`sprint:${id}`, COIN.sprint + combo, "sprint", `Focus sprint: ${sp.title}${combo ? ` · combo x${doneToday}` : ""}`, { combo: doneToday });
  }
  return updated;
}

export const ALL_BUILDINGS = BUILDINGS;
