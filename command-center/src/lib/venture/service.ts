import { randomUUID } from "crypto";
import type { Prisma, Venture } from "@prisma/client";
import { db } from "../db";
import { getSettings } from "../settings";
import { localParts } from "../time";
import { sendOnce } from "../push";
import { award, gameState, safely, spend } from "../game/economy";
import { unlockAchievement } from "../game/hooks";
import { buildingDef } from "../game/catalog";
import {
  CONNECTIONS,
  COINS_TO_BUCKS,
  CONTRACT_TIERS,
  FIRST,
  INDUSTRIES,
  LAST,
  LEASES,
  MACHINE_TIERS,
  MAX_CATCHUP_HOURS,
  MIN_SELL_HOURS,
  MOMENTUM_COINS,
  STARTING_CASH,
  TRAITS,
  founderLevel,
  industryDef,
  leaseDef,
  leaseIndex,
  machineNeedsLease,
  maxTierFor,
  wageFor,
  type Role,
} from "./catalog";
import { WALK_IN, acceptContract, advance, contractValue, costs, makeCandidate, maxActive, moraleTarget, newOffer, offerRate, production, type Card, type Ctx, type Effect, type Emp, type Log, type Perks, type VState } from "./sim";
import { describe, makeCard } from "./cards";

// Runs the pretend company: advances it in real time on every read and cron
// tick, and applies the player's moves. Real work is the fuel — coins earned
// in the last 24h set the company's momentum, and lifetime coins set the
// founder level that unlocks bigger leases.

const H = 3600_000;
const NOT_XP = ["sell", "exit"];
const PEP_COST = 40;
const AD_COST = 30;
const PITCH_COST = 60;

class Conflict extends Error {}

/** Coins spent inside a retried move must only be charged once. */
async function spendOnce(key: string, cost: number, kind: string, label: string) {
  if (await db.coinEvent.findUnique({ where: { key } })) return;
  await spend(key, cost, kind, label);
}

// ───────── Real work → the game ─────────

export async function founder() {
  const since = new Date(Date.now() - 24 * H);
  const [life, day, ach] = await Promise.all([
    db.coinEvent.aggregate({ where: { amount: { gt: 0 }, kind: { notIn: NOT_XP } }, _sum: { amount: true } }),
    db.coinEvent.aggregate({ where: { amount: { gt: 0 }, kind: { notIn: NOT_XP }, createdAt: { gte: since } }, _sum: { amount: true } }),
    db.achievement.findMany({ select: { key: true } }),
  ]);
  const have = new Set(ach.map((a) => a.key));
  const connections = CONNECTIONS.map((c) => ({ ...c, active: have.has(c.achievement) }));
  const on = (k: string) => have.has(k);
  const coins24h = day._sum.amount ?? 0;
  const cap = on("sprints_50") ? 2.3 : 2;
  const momentum = Math.round(Math.min(cap, 0.5 + coins24h / MOMENTUM_COINS) * 100) / 100;
  return { ...founderLevel(life._sum.amount ?? 0), coins24h, momentum, momentumCap: cap, connections, on };
}

/** The plant you built with coins is the company's HQ: each kind of building gives a perk. */
export async function hqPerks(on: (k: string) => boolean) {
  const buildings = await db.building.findMany();
  const lv: Record<string, number> = {};
  for (const b of buildings) {
    const d = buildingDef(b.type);
    if (!d) continue;
    const cat = d.category === "landmark" ? "decor" : d.category;
    lv[cat] = (lv[cat] ?? 0) + b.level;
  }
  const p: Perks = {
    output: Math.min(0.45, 0.03 * (lv.production ?? 0)) + (on("streak_10") ? 0.05 : 0),
    price: Math.min(0.45, 0.03 * (lv.logistics ?? 0)) + (on("first_rfq") ? 0.05 : 0),
    morale: Math.min(20, 2 * (lv.people ?? 0)) + (on("reviews_4") ? 5 : 0),
    rent: Math.min(0.4, 0.04 * (lv.energy ?? 0)),
    rep: Math.min(0.75, 0.05 * (lv.decor ?? 0)),
    offerRate: on("first_customer") ? 0.2 : 0,
    bigOffer: on("dc_pilot") ? 0.15 : 0,
  };
  return { perks: p, levels: lv };
}

async function context(industry: string) {
  const s = await getSettings();
  const f = await founder();
  const { perks, levels } = await hqPerks(f.on);
  const ctx: Ctx = { industry: industryDef(industry), momentum: f.momentum, perks, localHour: (t) => localParts(s.timezone, new Date(t)).hour };
  return { ctx, founder: f, levels, tz: s.timezone };
}

// ───────── Loading, advancing, saving ─────────

const stateOf = (v: Venture) => v.state as unknown as VState;

function candidatePool(ctx: Ctx, n = 4, boost = 0): Emp[] {
  const r = Math.random;
  const out: Emp[] = [];
  for (let i = 0; i < n; i++) {
    const x = r();
    const role: Role = x < 0.4 ? "OPERATOR" : x < 0.65 ? "SALES" : x < 0.85 ? "ENGINEER" : "MANAGER";
    const y = r() + boost + ctx.perks.morale / 100;
    const skill = y > 1.05 ? 4 : y > 0.75 ? 3 : y > 0.35 ? 2 : 1;
    const traits = Object.keys(TRAITS);
    const trait = r() < 0.4 ? traits[Math.floor(r() * traits.length)] : null;
    const c = makeCandidate(role, skill, trait, { first: FIRST, last: LAST });
    c.wage = wageFor(role, skill, trait);
    out.push(c);
  }
  return out;
}

export function valuation(s: VState) {
  const talent = s.emps.reduce((a, e) => a + 400 * e.skill, 0);
  const gear = s.machines.reduce((a, m) => a + MACHINE_TIERS[m.tier].cost * 0.5, 0);
  return Math.max(0, Math.round(Math.max(0, s.profitEma) * 720 + s.reputation * 300 + gear + Math.max(0, s.cash) + talent));
}
export const exitCoinsFor = (price: number, dilution: number) => Math.round(Math.min(10000, Math.max(25, (price * (1 - dilution)) / 300)));

type Run = { v: Venture; s: VState; ctx: Ctx; logs: Log[]; now: number; newCards: Card[]; sold?: { price: number } };

function catchUp(run: Run) {
  const { v, s, ctx, now } = run;
  const from = Math.max(v.lastTickAt.getTime(), now - MAX_CATCHUP_HOURS * H);
  if (now <= from) return;
  const out = advance(s, ctx, from, now);
  run.logs.push(...out.logs);
  if (out.refreshPool) s.candidates = candidatePool(ctx);
  const ageDays = (now - v.foundedAt.getTime()) / (24 * H);
  for (const at of out.spawnCards) {
    const c = makeCard(s, ctx, at, ageDays, valuation(s));
    if (c) {
      s.cards.push(c);
      run.newCards.push(c);
      run.logs.push({ kind: "card", text: `${c.emoji} ${c.title}`, at });
    }
  }
  // Ignored cards resolve to their default
  for (const c of [...s.cards]) if (c.expiresAt <= now) resolveCard(run, c, c.defaultIdx, true);
}

async function save(run: Run) {
  const { v, s, logs, now } = run;
  await db.$transaction(async (tx) => {
    const data: Prisma.VentureUpdateManyMutationInput = { state: s as unknown as Prisma.InputJsonValue, lastTickAt: new Date(now), version: { increment: 1 }, peakStaff: Math.max(v.peakStaff, s.peakStaff) };
    if (run.sold) {
      data.status = "SOLD";
      data.soldAt = new Date(now);
      data.salePrice = run.sold.price;
      data.exitCoins = exitCoinsFor(run.sold.price, s.dilution);
    }
    const r = await tx.venture.updateMany({ where: { id: v.id, version: v.version, status: "ACTIVE" }, data });
    if (r.count !== 1) throw new Conflict("changed underneath");
    if (logs.length) await tx.ventureLog.createMany({ data: logs.map((l) => ({ ventureId: v.id, kind: l.kind, text: l.text, amount: l.amount ?? null, at: new Date(l.at) })) });
  });
  if (run.sold) await settleExit(v.id);
  if (run.newCards.length) await safely(() => alertCards(run));
  if (s.emps.length >= 10) await safely(() => unlockAchievement("venture_hire_10"));
}

async function alertCards(run: Run) {
  const gs = await gameState();
  if (!gs.ventureAlerts) return;
  const s = await getSettings();
  const hr = localParts(s.timezone).hour;
  if (hr < 8 || hr >= 20) return;
  const c = run.newCards[run.newCards.length - 1];
  await sendOnce(`venture-card:${c.id}`, { title: `${run.v.name}: ${c.title}`, body: c.body, url: "/venture", tag: "venture" });
}

/** Load the active company, catch it up to now, let `fn` act on it, save. Retries on a concurrent write. */
async function withVenture<T>(fn: ((run: Run) => T | Promise<T>) | null, opts: { minGapMs?: number } = {}): Promise<{ run: Run; result: T | null } | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const v = await db.venture.findFirst({ where: { status: "ACTIVE" } });
    if (!v) return null;
    const { ctx } = await context(v.industry);
    const run: Run = { v, s: structuredClone(stateOf(v)), ctx, logs: [], now: Date.now(), newCards: [] };
    if (!fn && opts.minGapMs && run.now - v.lastTickAt.getTime() < opts.minGapMs) return { run, result: null };
    catchUp(run);
    const result = fn ? await fn(run) : null;
    try {
      await save(run);
      return { run, result };
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
  throw new Error("The company is busy — try again.");
}

async function act<T>(fn: (run: Run) => T | Promise<T>) {
  const r = await withVenture(fn);
  if (!r) throw new Error("Found a company first.");
  return r.result;
}

/** Cron and reads call this. */
export async function tickVenture() {
  const r = await withVenture(null, { minGapMs: 20_000 });
  return r ? { cash: Math.round(r.run.s.cash), staff: r.run.s.emps.length } : "no company";
}

// ───────── Cards ─────────

function applyEffect(run: Run, e: Effect, card: Card | null): string[] {
  const { s, ctx, now } = run;
  const notes: string[] = [];
  const emp = card?.empId ? s.emps.find((x) => x.id === card.empId) : null;
  if (e.cash) s.cash += e.cash;
  if (e.rep) s.reputation = Math.max(0, s.reputation + e.rep);
  if (e.morale) for (const x of s.emps) x.morale = Math.max(0, Math.min(100, x.morale + e.morale));
  if (emp && e.moraleEmp) emp.morale = Math.max(0, Math.min(100, emp.morale + e.moraleEmp));
  if (emp && e.raiseEmp) emp.wage = Math.round(emp.wage * (1 + e.raiseEmp));
  if (emp && e.skillEmp) emp.skill = Math.min(5, emp.skill + e.skillEmp);
  if (emp && e.quitEmp) {
    s.emps = s.emps.filter((x) => x.id !== emp.id);
    s.quits++;
    notes.push(`${emp.name} left.`);
  }
  if (e.boost) s.boosts.push({ mult: e.boost.mult, until: now + e.boost.hours * H, label: e.boost.label });
  if (e.offer) {
    const o = newOffer(s, ctx, now, e.offer);
    s.contracts.push(o);
    notes.push(`Offer from ${o.customer} is on the board.`);
  }
  if (e.units) {
    const extra = production(s, ctx, now).total * e.units;
    const a = s.contracts.filter((c) => c.status === "ACTIVE").sort((x, y) => (x.dueAt ?? 0) - (y.dueAt ?? 0))[0];
    if (a) a.progress = Math.min(a.units - 0.01, a.progress + extra);
  }
  if (e.candidate) {
    const c = makeCandidate(e.candidate.role, e.candidate.skill, e.candidate.trait ?? null, { first: FIRST, last: LAST });
    c.wage = wageFor(c.role, c.skill, c.trait);
    s.candidates.unshift(c);
    notes.push(`${c.name} is in your candidate list.`);
  }
  if (e.machine != null && s.machines.length < leaseDef(s.leaseKey).slots) s.machines.push({ id: randomUUID(), tier: e.machine, name: ctx.industry.machines[e.machine], boughtAt: now });
  if (e.dilution) s.dilution = Math.min(0.6, s.dilution + e.dilution);
  if (e.sell) run.sold = { price: e.sell };
  return notes;
}

function resolveCard(run: Run, card: Card, idx: number, ignored = false) {
  const opt = card.options[idx] ?? card.options[card.defaultIdx];
  const ok = opt.chance == null || Math.random() < opt.chance;
  const effect = ok ? opt.effect : opt.fail ?? {};
  const notes = applyEffect(run, effect, card);
  run.s.cards = run.s.cards.filter((c) => c.id !== card.id);
  const txt = [ignored ? `${card.title} — no answer, so: ${opt.label.toLowerCase()}` : `${card.title} → ${opt.label}`, opt.chance != null ? (ok ? opt.okText : opt.failText) : null, ...notes].filter(Boolean).map((x) => x!.replace(/\.$/, "")).join(". ") + ".";
  run.logs.push({ kind: "decision", text: txt, amount: effect.cash, at: run.now });
  return { ok, text: txt };
}

// ───────── Moves ─────────

export async function found(input: { industry: string; name: string; city?: string }) {
  if (await db.venture.findFirst({ where: { status: "ACTIVE" } })) throw new Error("You already run a company. Sell it or wind it down first.");
  const ind = industryDef(input.industry);
  const { ctx } = await context(ind.key);
  const now = Date.now();
  const s: VState = {
    cash: STARTING_CASH,
    reputation: 0,
    leaseKey: "garage",
    unitsMade: 0,
    revenue: 0,
    profitEma: 0,
    offerClock: 0,
    nextCardAt: now + 20 * 60_000,
    poolRefreshAt: now + 8 * H,
    boosts: [],
    autoAccept: false,
    dilution: 0,
    emps: [],
    candidates: candidatePool(ctx),
    machines: [],
    contracts: [],
    cards: [],
    lastPepAt: null,
    peakStaff: 0,
    contractsDone: 0,
    contractsFailed: 0,
    hires: 0,
    quits: 0,
    history: [{ t: now, cash: STARTING_CASH, staff: 0 }],
  };
  s.contracts.push(newOffer(s, ctx, now));
  const v = await db.venture.create({
    data: { name: input.name.trim() || ind.names[0], industry: ind.key, city: input.city?.trim() ?? "", state: s as unknown as Prisma.InputJsonValue, lastTickAt: new Date(now) },
  });
  await db.ventureLog.create({ data: { ventureId: v.id, kind: "founded", text: `${ind.emoji} Founded ${v.name}. A garage, ${STARTING_CASH.toLocaleString("en-US")} bucks and you.` } });
  await safely(() => unlockAchievement("venture_founded"));
  return { id: v.id };
}

const needCash = (s: VState, n: number, what: string) => {
  if (s.cash < n) throw new Error(`Not enough bucks for ${what} — you need ${Math.ceil(n - s.cash).toLocaleString("en-US")} more.`);
};

export const hire = (id: string) =>
  act((run) => {
    const { s } = run;
    const c = s.candidates.find((x) => x.id === id);
    if (!c) throw new Error("That candidate took another job.");
    const lease = leaseDef(s.leaseKey);
    if (s.emps.length >= lease.seats) throw new Error(`The ${lease.name.toLowerCase()} is full (${lease.seats} seats). Lease something bigger.`);
    const bonus = c.wage * 8;
    needCash(s, bonus, "the signing bonus");
    s.cash -= bonus;
    s.candidates = s.candidates.filter((x) => x.id !== id);
    s.emps.push({ ...c, hiredAt: run.now, morale: 80 });
    s.hires++;
    run.logs.push({ kind: "hire", text: `Hired ${c.name} as ${run.ctx.industry.roles[c.role].toLowerCase()} (★${c.skill})`, amount: -bonus, at: run.now });
  });

export const fire = (id: string) =>
  act((run) => {
    const { s } = run;
    const e = s.emps.find((x) => x.id === id);
    if (!e) throw new Error("Not on the team.");
    const sev = e.wage * 8;
    s.cash -= sev;
    s.emps = s.emps.filter((x) => x.id !== id);
    for (const x of s.emps) x.morale = Math.max(0, x.morale - 8);
    run.logs.push({ kind: "fire", text: `Let ${e.name} go. The team noticed.`, amount: -sev, at: run.now });
  });

export const lease = (key: string) =>
  act(async (run) => {
    const { s } = run;
    const L = LEASES.find((l) => l.key === key);
    if (!L) throw new Error("Unknown space.");
    if (L.key === s.leaseKey) return;
    const f = await founder();
    if (f.level < L.level) throw new Error(`A ${L.name.toLowerCase()} needs founder level ${L.level}. Real work levels you up.`);
    if (s.emps.length > L.seats) throw new Error(`Too many people for a ${L.name.toLowerCase()} (${L.seats} seats).`);
    if (s.machines.length > L.slots) throw new Error(`Too many machines for a ${L.name.toLowerCase()} (${L.slots} slots).`);
    if (s.machines.some((m) => machineNeedsLease(m.tier) > leaseIndex(L.key))) throw new Error("Some of your machines won't fit there.");
    const up = leaseIndex(L.key) > leaseIndex(s.leaseKey);
    const cost = up ? L.moveIn : 0;
    needCash(s, cost, "the move");
    s.cash -= cost;
    s.leaseKey = L.key;
    for (const x of s.emps) x.morale = Math.min(100, x.morale + (up ? 10 : -10));
    run.logs.push({ kind: "lease", text: `${L.emoji} Moved into a ${L.name.toLowerCase()}`, amount: -cost, at: run.now });
  });

export const buyMachine = (tier: number) =>
  act((run) => {
    const { s, ctx } = run;
    const T = MACHINE_TIERS[tier];
    if (!T) throw new Error("Unknown machine.");
    if (machineNeedsLease(tier) > leaseIndex(s.leaseKey)) throw new Error(`Needs a ${LEASES[machineNeedsLease(tier)].name.toLowerCase()} or bigger.`);
    if (s.machines.length >= leaseDef(s.leaseKey).slots) throw new Error("No floor space left. Sell one or lease bigger.");
    needCash(s, T.cost, "that machine");
    s.cash -= T.cost;
    s.machines.push({ id: randomUUID(), tier, name: ctx.industry.machines[tier], boughtAt: run.now });
    run.logs.push({ kind: "machine", text: `Installed a ${ctx.industry.machines[tier].toLowerCase()}`, amount: -T.cost, at: run.now });
  });

export const sellMachine = (id: string) =>
  act((run) => {
    const { s } = run;
    const m = s.machines.find((x) => x.id === id);
    if (!m) throw new Error("Not on the floor.");
    const back = Math.round(MACHINE_TIERS[m.tier].cost * 0.4);
    s.cash += back;
    s.machines = s.machines.filter((x) => x.id !== id);
    run.logs.push({ kind: "machine", text: `Sold the ${m.name.toLowerCase()}`, amount: back, at: run.now });
  });

export const acceptOffer = (id: string) =>
  act((run) => {
    const { s } = run;
    const c = s.contracts.find((x) => x.id === id && x.status === "OFFER");
    if (!c) throw new Error("That offer's gone.");
    if (s.contracts.filter((x) => x.status === "ACTIVE").length >= maxActive(s)) throw new Error(`You can run ${maxActive(s)} contracts at once. Each salesperson adds one.`);
    acceptContract(c, run.now);
    run.logs.push({ kind: "accept", text: `Signed ${c.customer}: ${Math.round(c.units)} ${run.ctx.industry.unit} due in ${c.hours}h`, at: run.now });
  });

export const declineOffer = (id: string) =>
  act((run) => {
    run.s.contracts = run.s.contracts.filter((x) => !(x.id === id && x.status === "OFFER"));
  });

export const decide = (id: string, idx: number) =>
  act((run) => {
    const c = run.s.cards.find((x) => x.id === id);
    if (!c) throw new Error("That one already played out.");
    const opt = c.options[idx];
    if (!opt) throw new Error("Pick one of the options.");
    if (opt.effect.cash && opt.effect.cash < 0) needCash(run.s, -opt.effect.cash, "that");
    return resolveCard(run, c, idx);
  });

export const invest = (coins: number, key = `invest:${randomUUID()}`) =>
  act(async (run) => {
    if (coins < 10) throw new Error("Invest at least 10 coins.");
    await spendOnce(key, coins, "invest", `Invested in ${run.v.name}`);
    const bucks = coins * COINS_TO_BUCKS;
    run.s.cash += bucks;
    run.logs.push({ kind: "invest", text: `You put in ${coins} coins of real work`, amount: bucks, at: run.now });
  });

export const pepTalk = (key = `pep:${randomUUID()}`) =>
  act(async (run) => {
    const { s } = run;
    if (s.lastPepAt && run.now - s.lastPepAt < 4 * H) throw new Error("They just heard one. Give it a few hours.");
    if (!s.emps.length) throw new Error("Nobody to talk to yet.");
    await spendOnce(key, PEP_COST, "venture", "Pep talk");
    for (const x of s.emps) x.morale = Math.min(100, x.morale + 15);
    s.lastPepAt = run.now;
    run.logs.push({ kind: "pep", text: "Pep talk. The floor's buzzing.", at: run.now });
  });

export const postAd = (key = `ad:${randomUUID()}`) =>
  act(async (run) => {
    await spendOnce(key, AD_COST, "venture", "Posted a job ad");
    run.s.candidates = candidatePool(run.ctx, 5, 0.2);
    run.s.poolRefreshAt = run.now + 8 * H;
    run.logs.push({ kind: "ad", text: "Posted a job ad. Fresh candidates.", at: run.now });
  });

export const pitch = (key = `pitch:${randomUUID()}`) =>
  act(async (run) => {
    if (run.s.contracts.filter((c) => c.status === "OFFER").length >= 4) throw new Error("Four offers are already waiting.");
    await spendOnce(key, PITCH_COST, "venture", "Pitched a customer");
    const o = newOffer(run.s, run.ctx, run.now);
    run.s.contracts.push(o);
    run.logs.push({ kind: "pitch", text: `You pitched ${o.customer} yourself. Offer on the board.`, at: run.now });
  });

export const setAutoAccept = (on: boolean) =>
  act((run) => {
    run.s.autoAccept = on;
  });

export const rename = (name: string) =>
  act(async (run) => {
    await db.venture.update({ where: { id: run.v.id }, data: { name: name.trim() || run.v.name } });
  });

export const sell = () =>
  act((run) => {
    const age = run.now - run.v.foundedAt.getTime();
    if (age < MIN_SELL_HOURS * H) throw new Error(`Buyers want to see ${MIN_SELL_HOURS / 24} days of history first.`);
    const price = valuation(run.s);
    run.sold = { price };
    run.logs.push({ kind: "sold", text: `Sold ${run.v.name} for ${price.toLocaleString("en-US")} bucks`, at: run.now });
  });

export async function windDown() {
  const v = await db.venture.findFirst({ where: { status: "ACTIVE" } });
  if (!v) throw new Error("No company running.");
  await db.venture.update({ where: { id: v.id }, data: { status: "CLOSED", soldAt: new Date() } });
  await db.ventureLog.create({ data: { ventureId: v.id, kind: "closed", text: `Wound down ${v.name}.` } });
}

async function settleExit(id: string) {
  const v = await db.venture.findUniqueOrThrow({ where: { id } });
  if (!v.exitCoins) return;
  await award(`exit:${id}`, v.exitCoins, "exit", `🥂 Sold ${v.name} — exit bonus`, { venture: id, price: v.salePrice });
  await safely(() => unlockAchievement("venture_exit"));
  if ((await db.venture.count({ where: { status: "SOLD" } })) >= 3) await safely(() => unlockAchievement("venture_serial"));
}

// ───────── What the UI sees ─────────

export async function getVenture() {
  await tickVenture().catch((e) => console.error("[venture]", e));
  const v = await db.venture.findFirst({ where: { status: "ACTIVE" } });
  const { ctx, founder: f, levels } = await context(v?.industry ?? INDUSTRIES[0].key);
  const [hall, bal, gs] = await Promise.all([
    db.venture.findMany({ where: { status: { not: "ACTIVE" } }, orderBy: { soldAt: "desc" }, select: { id: true, name: true, industry: true, foundedAt: true, soldAt: true, salePrice: true, exitCoins: true, peakStaff: true, status: true } }),
    db.coinEvent.aggregate({ _sum: { amount: true } }),
    gameState(),
  ]);
  const base = {
    founder: { level: f.level, title: f.title, xp: f.xp, next: f.next, prev: f.prev, pct: f.pct, coins24h: f.coins24h, momentum: f.momentum, momentumCap: f.momentumCap },
    connections: f.connections,
    perks: ctx.perks,
    hqLevels: levels,
    coins: bal._sum.amount ?? 0,
    alerts: gs.ventureAlerts,
    hall: hall.map((h) => ({ ...h, foundedAt: h.foundedAt.toISOString(), soldAt: h.soldAt?.toISOString() ?? null })),
    costs: { pep: PEP_COST, ad: AD_COST, pitch: PITCH_COST, coinsToBucks: COINS_TO_BUCKS },
  };
  if (!v) return { ...base, company: null };

  const s = stateOf(v);
  const now = Date.now();
  const ind = ctx.industry;
  const prod = production(s, ctx, now);
  const c = costs(s, ctx);
  const active = s.contracts.filter((x) => x.status === "ACTIVE");
  const contractPrice = active.length ? active.reduce((a, x) => a + x.price, 0) / active.length : null;
  const grossPerHour = prod.total * (contractPrice ? contractPrice * (1 + ctx.perks.price) : ind.price * WALK_IN);
  const val = valuation(s);
  const ageMs = now - v.foundedAt.getTime();
  const logs = await db.ventureLog.findMany({ where: { ventureId: v.id }, orderBy: { at: "desc" }, take: 40 });
  const lease = leaseDef(s.leaseKey);
  return {
    ...base,
    company: {
      id: v.id,
      name: v.name,
      city: v.city,
      industry: ind.key,
      foundedAt: v.foundedAt.toISOString(),
      asOf: v.lastTickAt.toISOString(),
      ageHours: ageMs / H,
      cash: s.cash,
      reputation: s.reputation,
      maxTier: maxTierFor(s.reputation),
      nextTierRep: CONTRACT_TIERS[maxTierFor(s.reputation) + 1]?.rep ?? null,
      lease: lease.key,
      seats: lease.seats,
      slots: lease.slots,
      autoAccept: s.autoAccept,
      dilution: s.dilution,
      unitsMade: s.unitsMade,
      revenue: s.revenue,
      contractsDone: s.contractsDone,
      contractsFailed: s.contractsFailed,
      hires: s.hires,
      quits: s.quits,
      peakStaff: Math.max(v.peakStaff, s.peakStaff),
      boosts: s.boosts.filter((b) => b.until > now).map((b) => ({ ...b, until: new Date(b.until).toISOString() })),
      pepReadyAt: s.lastPepAt ? new Date(s.lastPepAt + 4 * H).toISOString() : null,
      rates: {
        unitsPerHour: prod.total,
        founderUnits: prod.per.get("founder") ?? 0,
        grossPerHour,
        wages: c.wages,
        rent: c.rent,
        upkeep: c.upkeep,
        netPerHour: grossPerHour - c.total,
        burnPerHour: c.total,
        offersPerHour: offerRate(s, ctx),
        engineering: prod.engineering,
        idleMachines: prod.idleMachines,
        boostMult: prod.boostMult,
      },
      valuation: val,
      canSellAt: new Date(v.foundedAt.getTime() + MIN_SELL_HOURS * H).toISOString(),
      exitCoins: exitCoinsFor(val, s.dilution),
      maxActive: maxActive(s),
      emps: s.emps.map((e) => ({ ...e, title: ind.roles[e.role], output: prod.per.get(e.id) ?? null, target: Math.round(moraleTarget(s, ctx, e)), hiredAt: new Date(e.hiredAt).toISOString() })),
      candidates: s.candidates.map((e) => ({ ...e, title: ind.roles[e.role], signing: e.wage * 8 })),
      machines: s.machines.map((m) => ({ ...m, boost: MACHINE_TIERS[m.tier].boost, upkeep: MACHINE_TIERS[m.tier].upkeep, resale: Math.round(MACHINE_TIERS[m.tier].cost * 0.4) })),
      shop: MACHINE_TIERS.map((T, tier) => ({ tier, name: ind.machines[tier], ...T, needsLease: LEASES[machineNeedsLease(tier)].name, ok: machineNeedsLease(tier) <= leaseIndex(s.leaseKey) })),
      contracts: s.contracts
        .map((x) => ({ ...x, value: contractValue(x, ctx.perks), tierLabel: CONTRACT_TIERS[x.tier].label, offeredAt: new Date(x.offeredAt).toISOString(), expiresAt: new Date(x.expiresAt).toISOString(), dueAt: x.dueAt ? new Date(x.dueAt).toISOString() : null }))
        .sort((a, b) => (a.status === b.status ? 0 : a.status === "ACTIVE" ? -1 : 1)),
      cards: s.cards.map((x) => ({ id: x.id, emoji: x.emoji, title: x.title, body: x.body, defaultIdx: x.defaultIdx, expiresAt: new Date(x.expiresAt).toISOString(), options: x.options.map((o) => ({ label: o.label, hint: describe(o.effect, ind.unit), chance: o.chance ?? null })) })),
      history: s.history.map((h) => ({ t: new Date(h.t).toISOString(), cash: h.cash, staff: h.staff })),
      log: logs.map((l) => ({ id: l.id, kind: l.kind, text: l.text, amount: l.amount, at: l.at.toISOString() })),
    },
  };
}

/** A small summary for the Today card and the agent. */
export async function ventureBrief() {
  await tickVenture().catch(() => {});
  const v = await db.venture.findFirst({ where: { status: "ACTIVE" } });
  if (!v) return null;
  const s = stateOf(v);
  const { ctx, founder: f } = await context(v.industry);
  const prod = production(s, ctx, Date.now());
  const c = costs(s, ctx);
  const active = s.contracts.filter((x) => x.status === "ACTIVE");
  const price = active.length ? active.reduce((a, x) => a + x.price, 0) / active.length : ctx.industry.price * WALK_IN;
  const latest = await db.ventureLog.findMany({ where: { ventureId: v.id }, orderBy: { at: "desc" }, take: 8, select: { id: true, kind: true, text: true, at: true } });
  return {
    id: v.id,
    latest,
    name: v.name,
    industry: v.industry,
    emoji: ctx.industry.emoji,
    lease: leaseDef(s.leaseKey).name,
    asOf: v.lastTickAt.toISOString(),
    cash: s.cash,
    netPerHour: prod.total * price - c.total,
    staff: s.emps.length,
    reputation: Math.round(s.reputation),
    pendingCards: s.cards.length,
    offers: s.contracts.filter((x) => x.status === "OFFER").length,
    activeContracts: active.length,
    momentum: f.momentum,
    founderLevel: f.level,
    valuation: valuation(s),
  };
}

export async function setAlerts(on: boolean) {
  await gameState();
  return db.gameState.update({ where: { id: "me" }, data: { ventureAlerts: on } });
}
