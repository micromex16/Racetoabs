import { randomUUID } from "crypto";
import { CONTRACT_TIERS, MACHINE_TIERS, TRAITS, industryDef, leaseDef, maxTierFor, rateOf, type Industry, type Role } from "./catalog";

// The live simulation. Pure: takes the company's state, advances it through
// real time, and reports what happened. No database in here.

export type Emp = {
  id: string;
  name: string;
  role: Role;
  skill: number;
  xp: number;
  wage: number;
  trait: string | null;
  morale: number;
  lowHours: number;
  hiredAt: number;
};
export type Machine = { id: string; tier: number; name: string; boughtAt: number };
export type Contract = {
  id: string;
  status: "OFFER" | "ACTIVE";
  customer: string;
  tier: number;
  units: number;
  progress: number;
  price: number;
  hours: number;
  offeredAt: number;
  expiresAt: number;
  dueAt: number | null;
  rush: boolean;
};
export type Effect = {
  cash?: number;
  morale?: number;
  moraleEmp?: number;
  rep?: number;
  boost?: { mult: number; hours: number; label: string };
  offer?: { tierUp?: number; rush?: boolean; customer?: string };
  skillEmp?: number;
  quitEmp?: boolean;
  raiseEmp?: number;
  candidate?: { role: Role; skill: number; trait?: string | null };
  dilution?: number;
  machine?: number;
  sell?: number;
  units?: number;
};
export type CardOption = { label: string; effect: Effect; chance?: number; fail?: Effect; okText?: string; failText?: string };
export type Card = { id: string; template: string; emoji: string; title: string; body: string; empId?: string | null; options: CardOption[]; defaultIdx: number; createdAt: number; expiresAt: number };
export type Boost = { mult: number; until: number; label: string };

export type VState = {
  cash: number;
  reputation: number;
  leaseKey: string;
  unitsMade: number;
  revenue: number;
  profitEma: number;
  offerClock: number;
  nextCardAt: number;
  poolRefreshAt: number;
  boosts: Boost[];
  autoAccept: boolean;
  dilution: number;
  emps: Emp[];
  candidates: Emp[];
  machines: Machine[];
  contracts: Contract[];
  cards: Card[];
  lastPepAt: number | null;
  peakStaff: number;
  contractsDone: number;
  contractsFailed: number;
  hires: number;
  quits: number;
  history: { t: number; cash: number; staff: number }[];
};

export type Perks = { output: number; price: number; morale: number; rent: number; rep: number; offerRate: number; bigOffer: number };
export const NO_PERKS: Perks = { output: 0, price: 0, morale: 0, rent: 0, rep: 0, offerRate: 0, bigOffer: 0 };
export type Ctx = { industry: Industry; momentum: number; perks: Perks; localHour: (t: number) => number; rng?: () => number };
export type Log = { kind: string; text: string; amount?: number; at: number };

const H = 3600_000;
export const WALK_IN = 0.35;
const FOUNDER_SKILL = 2;
const rnd = (r: () => number, a: number, b: number) => a + (b - a) * r();
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function moraleFactor(m: number) {
  return 0.6 + (0.6 * clamp(m, 0, 100)) / 100;
}
export function traitMult(e: { trait: string | null }) {
  return e.trait === "hustler" ? 1.2 : e.trait === "star" ? 1.3 : 1;
}
export function maxActive(s: VState) {
  return 2 + s.emps.filter((e) => e.role === "SALES").length;
}
export function seatsUsed(s: VState) {
  return s.emps.length;
}

/** Per-operator output in units/h, and machine assignment. */
export function production(s: VState, ctx: Ctx, at: number) {
  const rate = rateOf(ctx.industry);
  type Op = { id: string; base: number; morale: number; mult: number };
  const ops: Op[] = [{ id: "founder", base: 1 + 0.5 * FOUNDER_SKILL, morale: 100, mult: 1 }];
  for (const e of s.emps) if (e.role === "OPERATOR") ops.push({ id: e.id, base: 1 + 0.5 * e.skill, morale: e.morale, mult: traitMult(e) });
  ops.sort((a, b) => b.base * b.mult - a.base * a.mult);
  const boosts = s.machines.map((m) => MACHINE_TIERS[m.tier].boost).sort((a, b) => b - a);
  const eng = Math.min(0.6, s.emps.filter((e) => e.role === "ENGINEER").reduce((a, e) => a + 0.04 * e.skill * traitMult(e) * moraleFactor(e.morale), 0));
  const boostMult = s.boosts.filter((b) => b.until > at).reduce((a, b) => a * b.mult, 1);
  const common = (1 + eng) * (1 + ctx.perks.output) * ctx.momentum * boostMult;
  const per = new Map<string, number>();
  let total = 0;
  ops.forEach((o, i) => {
    const u = o.base * rate * (1 + (boosts[i] ?? 0)) * moraleFactor(o.morale) * o.mult * common;
    per.set(o.id, u);
    total += u;
  });
  return { total, per, engineering: eng, idleMachines: Math.max(0, boosts.length - ops.length), boostMult };
}

export function costs(s: VState, ctx: Ctx) {
  const lease = leaseDef(s.leaseKey);
  const wages = s.emps.reduce((a, e) => a + e.wage, 0);
  const rent = lease.rent * (1 - ctx.perks.rent);
  const upkeep = s.machines.reduce((a, m) => a + MACHINE_TIERS[m.tier].upkeep, 0) * (1 - ctx.perks.rent);
  return { wages, rent, upkeep, total: wages + rent + upkeep };
}

export function offerRate(s: VState, ctx: Ctx) {
  const sales = s.emps.filter((e) => e.role === "SALES").reduce((a, e) => a + 0.1 * e.skill * traitMult(e) * moraleFactor(e.morale), 0);
  return (0.12 + sales) * ctx.momentum * (1 + ctx.perks.offerRate);
}

export function moraleTarget(s: VState, ctx: Ctx, e: Emp) {
  const managers = s.emps.filter((x) => x.role === "MANAGER");
  const span = 4 + 8 * managers.length;
  const over = Math.max(0, s.emps.length - span);
  let t = 70 + ctx.perks.morale + Math.min(15, managers.reduce((a, m) => a + 1.5 * m.skill, 0)) - over * 4;
  if (s.cash < 0) t -= 30;
  if (e.trait === "loyal") t += 10;
  if (e.trait === "hustler") t -= 5;
  return clamp(t, 0, 100);
}

export function newOffer(s: VState, ctx: Ctx, at: number, opts: { tierUp?: number; rush?: boolean; customer?: string } = {}): Contract {
  const r = ctx.rng ?? Math.random;
  const ind = ctx.industry;
  const maxT = maxTierFor(s.reputation);
  let tier = r() < 0.55 + ctx.perks.bigOffer ? maxT : Math.floor(r() * (maxT + 1));
  tier = clamp(tier + (opts.tierUp ?? 0), 0, CONTRACT_TIERS.length - 1);
  const T = CONTRACT_TIERS[tier];
  const units = Math.max(1, Math.round(rnd(r, T.units[0], T.units[1]) * rateOf(ind)));
  let hours = Math.round(rnd(r, T.hours[0], T.hours[1]));
  let price = ind.price * T.mult * rnd(r, 0.9, 1.15);
  if (opts.rush) {
    hours = Math.max(4, Math.round(hours * 0.5));
    price *= 1.4;
  }
  const customer = opts.customer ?? ind.customers[Math.floor(r() * ind.customers.length)];
  return { id: randomUUID(), status: "OFFER", customer, tier, units, progress: 0, price: Math.round(price * 100) / 100, hours, offeredAt: at, expiresAt: at + 8 * H, dueAt: null, rush: !!opts.rush };
}

export function acceptContract(c: Contract, at: number) {
  c.status = "ACTIVE";
  c.dueAt = at + c.hours * H;
}

export function contractValue(c: Contract, perks: Perks) {
  return c.units * c.price * (1 + perks.price);
}

/** Advance the company from `from` to `to`. Mutates `s`; returns what happened. */
export function advance(s: VState, ctx: Ctx, from: number, to: number) {
  const r = ctx.rng ?? Math.random;
  const logs: Log[] = [];
  const out = { logs, spawnCards: [] as number[], refreshPool: false };
  const ind = ctx.industry;
  const STEP = 0.25 * H;
  let t = from;
  while (t < to) {
    const dtMs = Math.min(STEP, to - t);
    const dt = dtMs / H;
    t += dtMs;
    let earned = 0;

    // Make things
    const { total } = production(s, ctx, t);
    let made = total * dt;
    s.unitsMade += made;
    const active = s.contracts.filter((c) => c.status === "ACTIVE").sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
    for (const c of active) {
      if (made <= 0) break;
      const take = Math.min(made, c.units - c.progress);
      c.progress += take;
      made -= take;
      if (c.progress >= c.units - 1e-6) {
        const pay = contractValue(c, ctx.perks);
        const rep = CONTRACT_TIERS[c.tier].repGain * (1 + ctx.perks.rep) * (c.rush ? 1.5 : 1);
        earned += pay;
        s.reputation += rep;
        s.contractsDone++;
        s.contracts = s.contracts.filter((x) => x.id !== c.id);
        logs.push({ kind: "contract_done", text: `Shipped ${fmtUnits(c.units)} ${ind.unit} to ${c.customer}. +${Math.round(rep)} reputation`, amount: pay, at: t });
      }
    }
    if (made > 0) earned += made * ind.price * WALK_IN;

    // Late contracts
    for (const c of s.contracts.filter((x) => x.status === "ACTIVE" && x.dueAt != null && x.dueAt < t)) {
      const pay = c.progress * c.price * 0.5;
      const loss = CONTRACT_TIERS[c.tier].repLoss;
      earned += pay;
      s.reputation = Math.max(0, s.reputation - loss);
      s.contractsFailed++;
      s.contracts = s.contracts.filter((x) => x.id !== c.id);
      logs.push({ kind: "contract_failed", text: `Missed the deadline for ${c.customer} (${Math.round((c.progress / c.units) * 100)}% done). −${loss} reputation`, amount: pay, at: t });
    }
    // Offers expire
    for (const c of s.contracts.filter((x) => x.status === "OFFER" && x.expiresAt < t)) {
      s.contracts = s.contracts.filter((x) => x.id !== c.id);
      logs.push({ kind: "offer_expired", text: `${c.customer}'s offer expired`, at: t });
    }

    // Pay people and the landlord
    const cost = costs(s, ctx).total * dt;
    s.cash += earned - cost;
    s.revenue += earned;
    s.profitEma += ((earned - cost) / dt - s.profitEma) * Math.min(1, dt / 24);

    // New offers from sales effort
    s.offerClock += offerRate(s, ctx) * dt;
    while (s.offerClock >= 1) {
      s.offerClock -= 1;
      if (s.contracts.filter((c) => c.status === "OFFER").length >= 4) continue;
      const o = newOffer(s, ctx, t);
      const hasSales = s.emps.some((e) => e.role === "SALES");
      if (s.autoAccept && hasSales && s.contracts.filter((c) => c.status === "ACTIVE").length < maxActive(s)) {
        acceptContract(o, t);
        logs.push({ kind: "offer_auto", text: `Sales signed ${o.customer}: ${fmtUnits(o.units)} ${ind.unit} in ${o.hours}h`, at: t });
      } else {
        logs.push({ kind: "offer", text: `New offer from ${o.customer}: ${fmtUnits(o.units)} ${ind.unit} in ${o.hours}h`, at: t });
      }
      s.contracts.push(o);
    }

    // People: mood, growth, quitting
    const mentor = s.emps.some((e) => e.trait === "mentor");
    for (const e of [...s.emps]) {
      const target = moraleTarget(s, ctx, e);
      const k = e.trait === "steady" ? 0.02 : 0.08;
      e.morale += (target - e.morale) * Math.min(1, dt * k);
      e.xp += dt * (e.trait === "rookie" ? 2 : 1) * (mentor ? 1.3 : 1);
      if (e.skill < 5 && e.xp >= 30 * e.skill) {
        e.xp = 0;
        e.skill++;
        logs.push({ kind: "levelup", text: `${e.name} got better at the job — now ★${e.skill}`, at: t });
      }
      const low = e.trait === "loyal" ? 8 : 20;
      e.lowHours = e.morale < low ? e.lowHours + dt : 0;
      if (e.lowHours >= (e.trait === "loyal" ? 12 : 6)) {
        s.emps = s.emps.filter((x) => x.id !== e.id);
        s.quits++;
        logs.push({ kind: "quit", text: `${e.name} quit. Morale was too low for too long.`, at: t });
      }
    }

    s.boosts = s.boosts.filter((b) => b.until > t);

    // Decision cards, during waking hours
    if (t >= s.nextCardAt) {
      const hr = ctx.localHour(t);
      if (s.cards.length + out.spawnCards.length >= 3) s.nextCardAt = t + 1 * H;
      else if (hr < 7 || hr >= 21) s.nextCardAt = t + 0.5 * H;
      else {
        out.spawnCards.push(t);
        s.nextCardAt = t + rnd(r, 1.5, 3.5) * H;
      }
    }
    if (t >= s.poolRefreshAt) {
      out.refreshPool = true;
      s.poolRefreshAt = t + 8 * H;
    }

    // Hourly history for the chart
    const last = s.history[s.history.length - 1];
    if (!last || t - last.t >= H) {
      s.history.push({ t, cash: Math.round(s.cash), staff: s.emps.length });
      if (s.history.length > 96) s.history.splice(0, s.history.length - 96);
    }
  }
  s.peakStaff = Math.max(s.peakStaff, s.emps.length);
  return out;
}

export function fmtUnits(n: number) {
  return n >= 100 ? Math.round(n).toLocaleString("en-US") : n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
}

export function makeCandidate(role: Role, skill: number, trait: string | null, names: { first: string[]; last: string[] }, r: () => number = Math.random, wage?: number): Emp {
  const name = `${names.first[Math.floor(r() * names.first.length)]} ${names.last[Math.floor(r() * names.last.length)]}`;
  return { id: randomUUID(), name, role, skill, xp: 0, wage: wage ?? 0, trait, morale: 75, lowHours: 0, hiredAt: 0 };
}

export const traitInfo = (t: string | null) => (t ? TRAITS[t as keyof typeof TRAITS] ?? null : null);
export { industryDef };
