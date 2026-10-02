import { randomUUID } from "crypto";
import { MACHINE_TIERS, ROLES, leaseDef, type Industry, type Role } from "./catalog";
import { costs, type Card, type CardOption, type Ctx, type Effect, type Emp, type VState } from "./sim";

// Decision cards: little moments that pop up through the day. Each option
// says plainly what it does; ignoring a card picks its default when it expires.

type Env = { s: VState; ctx: Ctx; ind: Industry; S: number; r: () => number; ageDays: number; valuation: number };
type Tpl = {
  key: string;
  weight: number;
  when?: (e: Env) => boolean;
  emp?: (e: Env) => Emp | null;
  make: (e: Env, emp: Emp | null) => { emoji: string; title: string; body: string; options: CardOption[]; defaultIdx: number };
};

const pick = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)];
const nice = (n: number) => {
  const mag = n >= 10000 ? 1000 : n >= 1000 ? 100 : n >= 100 ? 10 : 5;
  return Math.max(mag, Math.round(n / mag) * mag);
};
const anyEmp = (e: Env) => (e.s.emps.length ? pick(e.r, e.s.emps) : null);
const roleTitle = (e: Env, emp: Emp) => e.ind.roles[emp.role].toLowerCase();

const TEMPLATES: Tpl[] = [
  {
    key: "rush",
    weight: 3,
    make: (e) => {
      const c = pick(e.r, e.ind.customers);
      return {
        emoji: "⏱️",
        title: `${c} needs a rush job`,
        body: `They'll pay a 40% premium if you can turn ${e.ind.unit} around fast. Miss it and it stings your reputation.`,
        options: [
          { label: "Put it on the board", effect: { offer: { rush: true, customer: c } } },
          { label: "Pass", effect: {} },
        ],
        defaultIdx: 1,
      };
    },
  },
  {
    key: "raise",
    weight: 3,
    emp: anyEmp,
    when: (e) => e.s.emps.length > 0,
    make: (e, emp) => ({
      emoji: "💬",
      title: `${emp!.name} wants a raise`,
      body: `Your ${roleTitle(e, emp!)} (★${emp!.skill}) says the market's paying more.`,
      options: [
        { label: "Give 15%", effect: { raiseEmp: 0.15, moraleEmp: 25 } },
        { label: "Offer a title instead", effect: { moraleEmp: 12 }, chance: 0.55, fail: { moraleEmp: -15 }, okText: "They took it.", failText: "They weren't impressed." },
        { label: "Not now", effect: { moraleEmp: -20 } },
      ],
      defaultIdx: 2,
    }),
  },
  {
    key: "breakdown",
    weight: 2,
    when: (e) => e.s.machines.length > 0,
    make: (e) => {
      const m = pick(e.r, e.s.machines);
      return {
        emoji: "🔧",
        title: `The ${m.name.toLowerCase()} went down`,
        body: "You can pay for a rush repair or limp along until parts show up.",
        options: [
          { label: "Rush repair", effect: { cash: -nice(MACHINE_TIERS[m.tier].cost * 0.15 + e.S) } },
          { label: "Wait for parts", effect: { boost: { mult: 0.75, hours: 8, label: "Machine down" } } },
        ],
        defaultIdx: 1,
      };
    },
  },
  {
    key: "trade_show",
    weight: 2,
    make: (e) => ({
      emoji: "🎪",
      title: "Trade show next week",
      body: `A booth costs real effort and some bucks, but buyers for ${e.ind.unit} will be there.`,
      options: [
        { label: "Get a booth", effect: { cash: -nice(e.S * 3), rep: 6, offer: { tierUp: 1 } } },
        { label: "Skip it", effect: {} },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "poach",
    weight: 2,
    when: (e) => e.s.emps.some((x) => x.skill >= 2),
    emp: (e) => pick(e.r, e.s.emps.filter((x) => x.skill >= 2)),
    make: (e, emp) => {
      const comp = pick(e.r, e.ind.competitors);
      return {
        emoji: "🎣",
        title: `${comp} is after ${emp!.name}`,
        body: `They offered your ${roleTitle(e, emp!)} more money. ${emp!.name} hasn't decided.`,
        options: [
          { label: "Match it (+20%)", effect: { raiseEmp: 0.2, moraleEmp: 15 } },
          { label: "Talk to them", effect: { moraleEmp: 10 }, chance: emp!.trait === "loyal" ? 0.95 : 0.6, fail: { quitEmp: true }, okText: `${emp!.name} is staying.`, failText: `${emp!.name} took the offer.` },
          { label: "Let them go", effect: { quitEmp: true } },
        ],
        defaultIdx: 1,
      };
    },
  },
  {
    key: "viral",
    weight: 1.5,
    make: (e) => ({
      emoji: "📈",
      title: "A post about you took off",
      body: "People are talking. Want to pour fuel on it?",
      options: [
        { label: "Run with it", effect: { cash: -nice(e.S), rep: 4, offer: {} } },
        { label: "Enjoy it quietly", effect: { rep: 2 } },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "lunch",
    weight: 2,
    when: (e) => e.s.emps.length >= 2,
    make: (e) => ({
      emoji: "🌮",
      title: "The team's been grinding",
      body: "Long week. Everyone could use a break.",
      options: [
        { label: "Buy lunch", effect: { cash: -nice(e.s.emps.length * 25), morale: 10 } },
        { label: "Early Friday", effect: { morale: 15, boost: { mult: 0.7, hours: 4, label: "Early Friday" } } },
        { label: "Keep going", effect: { morale: -4 } },
      ],
      defaultIdx: 2,
    }),
  },
  {
    key: "bulk",
    weight: 1.5,
    make: (e) => ({
      emoji: "📦",
      title: "Supplier bulk deal",
      body: "Buy a big lot of materials now and the floor runs smoother for a day.",
      options: [
        { label: "Buy the lot", effect: { cash: -nice(e.S * 2), boost: { mult: 1.2, hours: 24, label: "Bulk materials" } } },
        { label: "Pass", effect: {} },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "quality",
    weight: 1.5,
    when: (e) => e.s.contractsDone > 0,
    make: (e) => {
      const c = pick(e.r, e.ind.customers);
      return {
        emoji: "🧯",
        title: `${c} sent a batch back`,
        body: `Some ${e.ind.unit} didn't meet spec. They want it fixed.`,
        options: [
          { label: "Fix it on overtime", effect: { cash: -nice(e.S * 1.5), rep: 2 } },
          { label: "Push back", effect: {}, chance: 0.5, fail: { rep: -8 }, okText: "They agreed it was in spec.", failText: "They didn't buy it. Word gets around." },
        ],
        defaultIdx: 1,
      };
    },
  },
  {
    key: "intern",
    weight: 1.5,
    when: (e) => e.s.emps.length < leaseDef(e.s.leaseKey).seats,
    make: () => {
      const role: Role = "OPERATOR";
      return {
        emoji: "🎓",
        title: "A college sends an intern",
        body: "Eager, green, and cheap. They'll learn fast.",
        options: [
          { label: "Bring them on", effect: { candidate: { role, skill: 1, trait: "rookie" } } },
          { label: "No room", effect: {} },
        ],
        defaultIdx: 1,
      };
    },
  },
  {
    key: "audit",
    weight: 1.5,
    when: (e) => e.s.reputation >= 10,
    make: (e) => {
      const c = pick(e.r, e.ind.customers);
      return {
        emoji: "📋",
        title: `${c} wants to audit you`,
        body: "A good audit opens doors. A bad one closes them.",
        options: [
          { label: "Prep hard", effect: { cash: -nice(e.S), rep: 8, morale: -5 } },
          { label: "Wing it", effect: { rep: 4 }, chance: 0.6, fail: { rep: -6 }, okText: "Passed clean.", failText: "They found things." },
        ],
        defaultIdx: 1,
      };
    },
  },
  {
    key: "overtime",
    weight: 1.5,
    when: (e) => e.s.contracts.some((c) => c.status === "ACTIVE"),
    make: (e) => ({
      emoji: "🌙",
      title: "Backlog is piling up",
      body: "A weekend of overtime would clear a lot of it.",
      options: [
        { label: "Overtime", effect: { cash: -nice(e.S * 2), units: 8, morale: -6 } },
        { label: "Normal hours", effect: {} },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "press",
    weight: 1,
    make: () => ({
      emoji: "📰",
      title: "Local paper wants a profile",
      body: "An hour of your time, some good press.",
      options: [
        { label: "Do the interview", effect: { rep: 5 } },
        { label: "Decline", effect: {} },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "burnout",
    weight: 2,
    when: (e) => e.s.emps.some((x) => x.morale < 55),
    emp: (e) => [...e.s.emps].sort((a, b) => a.morale - b.morale)[0],
    make: (e, emp) => ({
      emoji: "😮‍💨",
      title: `${emp!.name} looks burned out`,
      body: `Mood is at ${Math.round(emp!.morale)}. Under 20 for six hours and they walk.`,
      options: [
        { label: "Give them a day off", effect: { moraleEmp: 30 } },
        { label: "Push through", effect: { moraleEmp: -10 } },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "price_war",
    weight: 1,
    when: (e) => e.s.reputation >= 5,
    make: (e) => {
      const comp = pick(e.r, e.ind.competitors);
      return {
        emoji: "⚔️",
        title: `${comp} is undercutting you`,
        body: "Customers are asking whether you'll match.",
        options: [
          { label: "Win on service", effect: { cash: -nice(e.S * 2), rep: 4 } },
          { label: "Hold your ground", effect: { rep: -3 } },
        ],
        defaultIdx: 1,
      };
    },
  },
  {
    key: "auction",
    weight: 1,
    when: (e) => e.s.machines.length < leaseDef(e.s.leaseKey).slots,
    make: (e) => {
      const tier = Math.min(1, Math.floor(e.r() * 2));
      const price = nice(MACHINE_TIERS[tier].cost * 0.4);
      return {
        emoji: "🔨",
        title: "Equipment auction",
        body: `A shop down the road closed. Their ${e.ind.machines[tier].toLowerCase()} is up for bids.`,
        options: [
          { label: `Bid ${price.toLocaleString("en-US")}`, effect: { cash: -price, machine: tier }, chance: 0.65, fail: {}, okText: "You won it.", failText: "Outbid. No charge." },
          { label: "Pass", effect: {} },
        ],
        defaultIdx: 1,
      };
    },
  },
  {
    key: "birthday",
    weight: 0.8,
    when: (e) => e.ageDays >= 1,
    make: (e) => ({
      emoji: "🎂",
      title: `Day ${Math.floor(e.ageDays) + 1} in business`,
      body: "Small milestone. Worth a moment?",
      options: [
        { label: "Throw a party", effect: { cash: -nice(e.S), morale: 12 } },
        { label: "Back to work", effect: { morale: 2 } },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "angel",
    weight: 0.8,
    when: (e) => e.s.cash < e.S * 12 && e.s.dilution < 0.3,
    make: (e) => ({
      emoji: "👼",
      title: "An angel investor wants in",
      body: "Cash now for 10% of the company. You'll keep less when you sell.",
      options: [
        { label: "Take the money", effect: { cash: nice(e.S * 20), dilution: 0.1 } },
        { label: "Stay independent", effect: {} },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "referral",
    weight: 1.5,
    when: (e) => e.s.emps.length > 0,
    emp: anyEmp,
    make: (e, emp) => {
      const role = pick(e.r, ROLES);
      return {
        emoji: "🧲",
        title: `${emp!.name} knows someone`,
        body: `A strong ${e.ind.roles[role].toLowerCase()} who might be open to a move.`,
        options: [
          { label: "Set up an interview", effect: { candidate: { role, skill: Math.min(5, 3 + Math.floor(e.r() * 2)), trait: null } } },
          { label: "Not hiring", effect: {} },
        ],
        defaultIdx: 1,
      };
    },
  },
  {
    key: "outage",
    weight: 1,
    make: (e) => ({
      emoji: "🔌",
      title: "Power's out on your block",
      body: "Could be an hour, could be the afternoon.",
      options: [
        { label: "Rent a generator", effect: { cash: -nice(e.S) } },
        { label: "Send everyone home", effect: { boost: { mult: 0.01, hours: 3, label: "Power out" }, morale: 5 } },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "mentor",
    weight: 1,
    when: (e) => e.s.emps.some((x) => x.skill < 5),
    emp: (e) => pick(e.r, e.s.emps.filter((x) => x.skill < 5)),
    make: (e, emp) => ({
      emoji: "🧑‍🏫",
      title: "A retired pro offers to coach",
      body: `They could spend a week with ${emp!.name}.`,
      options: [
        { label: "Yes, please", effect: { cash: -nice(e.S * 0.5), skillEmp: 1 } },
        { label: "No thanks", effect: {} },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "tender",
    weight: 1.2,
    when: (e) => e.s.reputation >= 15,
    make: (e) => {
      const c = pick(e.r, e.ind.customers);
      return {
        emoji: "📑",
        title: `${c} opened a tender`,
        body: "A bigger job than you usually see. Bidding takes work.",
        options: [
          { label: "Bid on it", effect: { cash: -nice(e.S * 2), offer: { tierUp: 1, customer: c } }, chance: 0.55, fail: { cash: -nice(e.S * 2) }, okText: "You made the shortlist", failText: "Lost the bid." },
          { label: "Skip", effect: {} },
        ],
        defaultIdx: 1,
      };
    },
  },
  {
    key: "inspection",
    weight: 1,
    make: (e) => ({
      emoji: "🦺",
      title: "Safety inspection Thursday",
      body: "A few things on the floor aren't quite right.",
      options: [
        { label: "Fix it all now", effect: { cash: -nice(e.S * 1.5), rep: 3 } },
        { label: "Hope for the best", effect: {}, chance: 0.7, fail: { cash: -nice(e.S * 4) }, okText: "Passed.", failText: "Fined." },
      ],
      defaultIdx: 1,
    }),
  },
  {
    key: "acquirer",
    weight: 1.2,
    when: (e) => e.ageDays >= 3 && e.valuation >= 50000,
    make: (e) => {
      const buyer = pick(e.r, [...e.ind.competitors, "Summit Holdings", "Desert Capital Partners", "Meridian Group"]);
      const price = nice(e.valuation * (0.9 + e.r() * 0.45));
      return {
        emoji: "🤝",
        title: `${buyer} wants to buy you`,
        body: `They're offering ${price.toLocaleString("en-US")} bucks for the whole company. Your own read of its value is ${nice(e.valuation).toLocaleString("en-US")}.`,
        options: [
          { label: "Sell", effect: { sell: price } },
          { label: "Not yet", effect: {} },
        ],
        defaultIdx: 1,
      };
    },
  },
];

export function makeCard(s: VState, ctx: Ctx, at: number, ageDays: number, valuation: number): Card | null {
  const r = ctx.rng ?? Math.random;
  const ind = ctx.industry;
  const S = Math.max(150, costs(s, ctx).total);
  const env: Env = { s, ctx, ind, S, r, ageDays, valuation };
  const recent = new Set(s.cards.map((c) => c.template));
  const ok = TEMPLATES.filter((t) => !recent.has(t.key) && (!t.when || t.when(env)));
  if (!ok.length) return null;
  let roll = r() * ok.reduce((a, t) => a + t.weight, 0);
  let tpl = ok[0];
  for (const t of ok) {
    roll -= t.weight;
    if (roll <= 0) {
      tpl = t;
      break;
    }
  }
  const emp = tpl.emp ? tpl.emp(env) : null;
  if (tpl.emp && !emp) return null;
  const c = tpl.make(env, emp);
  return { id: randomUUID(), template: tpl.key, ...c, empId: emp?.id ?? null, createdAt: at, expiresAt: at + 10 * 3600_000 };
}

/** Plain-language summary of what an option does. */
export function describe(e: Effect, unit: string) {
  const parts: string[] = [];
  const n = (x: number) => Math.abs(Math.round(x)).toLocaleString("en-US");
  if (e.sell) parts.push(`sell for ${n(e.sell)}`);
  if (e.cash) parts.push(`${e.cash > 0 ? "+" : "−"}${n(e.cash)} bucks`);
  if (e.rep) parts.push(`${e.rep > 0 ? "+" : "−"}${n(e.rep)} rep`);
  if (e.morale) parts.push(`${e.morale > 0 ? "+" : "−"}${n(e.morale)} team mood`);
  if (e.moraleEmp) parts.push(`${e.moraleEmp > 0 ? "+" : "−"}${n(e.moraleEmp)} mood`);
  if (e.raiseEmp) parts.push(`+${Math.round(e.raiseEmp * 100)}% wage`);
  if (e.skillEmp) parts.push(`+${e.skillEmp}★`);
  if (e.boost) parts.push(`output ×${e.boost.mult < 0.05 ? 0 : e.boost.mult} for ${e.boost.hours}h`);
  if (e.offer) parts.push(e.offer.rush ? "rush offer (+40%)" : e.offer.tierUp ? "a bigger offer" : "a new offer");
  if (e.units) parts.push(`+${e.units}h of ${unit}`);
  if (e.candidate) parts.push("new candidate");
  if (e.machine != null) parts.push("a machine");
  if (e.dilution) parts.push(`give up ${Math.round(e.dilution * 100)}%`);
  if (e.quitEmp) parts.push("they leave");
  return parts.join(" · ") || "nothing changes";
}
