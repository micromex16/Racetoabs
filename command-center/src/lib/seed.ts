import { db } from "./db";
import { keyToDate, quarterBounds } from "./time";

// First-run seed — the president's own targets. Everything here is editable in-app.
// Deliberately contains no people, accounts or financial data.

const METRICS = [
  { key: "pipeline_active", name: "Accounts in pipeline", description: "Active pipeline accounts (all stages before Customer).", aggregation: "LATEST", source: "AUTO", autoKey: "pipeline_active", target: 100 },
  { key: "accounts_3_contacts", name: "Accounts with 3 contacts", description: "Pipeline accounts with at least 3 named contacts.", aggregation: "LATEST", source: "AUTO", autoKey: "accounts_3_contacts", target: 100 },
  { key: "accounts_won_ytd", name: "New accounts won YTD", description: "Cards moved to Customer this calendar year.", aggregation: "LATEST", source: "AUTO", autoKey: "accounts_won_ytd", target: null },
  { key: "dc_accounts", name: "Data Center accounts", description: "Customer-stage accounts in the Data Center lane.", aggregation: "LATEST", source: "AUTO", autoKey: "dc_accounts", target: null },
  { key: "ad_accounts", name: "A&D accounts", description: "Customer-stage accounts in the A&D lane.", aggregation: "LATEST", source: "AUTO", autoKey: "ad_accounts", target: null },
  { key: "outreach_touches", name: "Founder outreach touches", description: "Personal touches by the president this week.", aggregation: "SUM", source: "MANUAL", target: 20, unit: "touches" },
  { key: "sample_kits", name: "Sample kits mailed", description: "Kits built and mailed this week.", aggregation: "SUM", source: "MANUAL", target: null, unit: "kits" },
  { key: "discovery_calls", name: "Discovery calls", aggregation: "SUM", source: "MANUAL", target: null, unit: "calls" },
  { key: "rfqs", name: "RFQs received", aggregation: "SUM", source: "MANUAL", target: null, unit: "RFQs" },
  { key: "quotes_sent", name: "Quotes sent", description: "Count of quotes sent — never their value.", aggregation: "SUM", source: "MANUAL", target: null, unit: "quotes" },
  { key: "pilots_live", name: "Pilots live", aggregation: "LATEST", source: "MANUAL", target: null, unit: "pilots" },
  { key: "linkedin_posts", name: "LinkedIn posts", aggregation: "SUM", source: "MANUAL", target: 1, unit: "posts" },
  { key: "top_customer_pct", name: "% of volume from top customer", description: "Unitless share of production volume. Lower is better.", aggregation: "LATEST", source: "MANUAL", target: 25, unit: "%", lowerIsBetter: true },
] as const;

export async function seedIfEmpty() {
  const seeded = await db.setting.findUnique({ where: { key: "seededAt" } });
  if (seeded) return false;
  const anyGoal = await db.goal.count();
  if (anyGoal > 0) {
    await db.setting.create({ data: { key: "seededAt", value: new Date().toISOString() } });
    return false;
  }
  await seed();
  return true;
}

export async function seed() {
  // ── Metrics
  for (const [i, m] of METRICS.entries()) {
    await db.metric.upsert({
      where: { key: m.key },
      create: { ...m, sortOrder: i, target: m.target ?? null } as never,
      update: {},
    });
  }

  // ── Goal tree
  const exit = await db.goal.create({
    data: { level: "EXIT", title: "Exit-ready by Oct 2031.", dueDate: keyToDate("2031-10-31"), periodStart: keyToDate("2026-10-01"), status: "ON_TRACK" },
  });

  const annual = async (title: string, sortOrder: number) =>
    db.goal.create({
      data: { level: "ANNUAL", title, year: 2027, periodStart: keyToDate("2027-01-01"), dueDate: keyToDate("2027-12-31"), parentId: exit.id, sortOrder },
    });
  const gDC = await annual("6–8 new data center accounts", 0);
  const gAD = await annual("Launch A&D wire-harness lane", 1);
  const gTop = await annual("Top customer below 30% of volume", 2);
  const gHire = await annual("Inside-sales hire", 3);
  const gCase = await annual("Two case studies with logos", 4);

  const rock = async (year: number, quarter: number, title: string, parentId: string, sortOrder: number, measures: { metricKey: string; target: number }[] = [], notes = "") => {
    const b = quarterBounds(year, quarter);
    return db.goal.create({
      data: {
        level: "QUARTERLY",
        title,
        year,
        quarter,
        periodStart: keyToDate(b.start),
        dueDate: keyToDate(b.end),
        parentId,
        sortOrder,
        measures,
        notes,
        status: year === 2026 ? "ON_TRACK" : "NOT_STARTED",
      },
    });
  };

  // Q4 2026 rocks
  await rock(2026, 4, "Data center positioning + anonymized case study + landing page live", gDC.id, 0);
  const r2 = await rock(2026, 4, "50 sample kits built and mailed to Tier A with founder follow-up calls", gDC.id, 1, [{ metricKey: "sample_kits", target: 50 }]);
  await rock(2026, 4, "100-account target list in pipeline, 3 contacts each", gDC.id, 2, [
    { metricKey: "pipeline_active", target: 100 },
    { metricKey: "accounts_3_contacts", target: 100 },
  ]);
  await rock(2026, 4, "Book Data Center World + 7x24 Exchange 2027", gDC.id, 3);
  await rock(2026, 4, "10 discovery calls / 3 RFQs / 1 pilot quoted by Dec 31", gDC.id, 4, [
    { metricKey: "discovery_calls", target: 10 },
    { metricKey: "rfqs", target: 3 },
    { metricKey: "quotes_sent", target: 1 },
  ], "“1 pilot quoted” is tracked as Quotes sent ≥ 1. Edit the measures if you want a different signal.");

  // 2027 by quarter
  const plan: [number, string, string][] = [
    [1, "Close pilots", gDC.id],
    [1, "Data Center World", gDC.id],
    [1, "Landed-cost memo", gDC.id],
    [1, "Referral ask to all customers", gDC.id],
    [2, "Case study #2", gCase.id],
    [2, "Lead-time guarantee", gDC.id],
    [2, "100-kit wave two", gDC.id],
    [2, "Hire inside sales", gHire.id],
    [2, "Prep A&D list", gAD.id],
    [3, "7x24 Exchange", gDC.id],
    [3, "Launch A&D lane", gAD.id],
    [3, "Distributor/broker partner channel", gTop.id],
    [4, "2027 review", exit.id],
    [4, "Lock 2028 shows", gDC.id],
    [4, "Wave three", gDC.id],
  ];
  const perQ: Record<number, number> = {};
  for (const [q, title, parent] of plan) {
    perQ[q] = (perQ[q] ?? 0) + 1;
    await rock(2027, q, title, parent, perQ[q] - 1);
  }

  // ── Recurring weekly commitments (due Friday)
  await db.recurringTask.createMany({
    data: [
      { title: "20 founder outreach touches", weekday: 5, targetCount: 20, metricKey: "outreach_touches", goalId: r2.id },
      { title: "1 LinkedIn post", weekday: 5, targetCount: 1, metricKey: "linkedin_posts", goalId: gDC.id },
      { title: "Friday review", weekday: 5 },
    ],
  });

  // ── Exit readiness checklist (equal weights — edit in Scoreboard)
  await db.exitCriterion.createMany({
    data: [
      { title: "SOPs documented", weight: 1, sortOrder: 0 },
      { title: "Management team in place", weight: 1, sortOrder: 1 },
      { title: "Top customer < 25% of volume", weight: 1, sortOrder: 2, metricKey: "top_customer_pct", threshold: 25 },
      { title: "Recurring programs", weight: 1, sortOrder: 3 },
      { title: "Key-person dependence reduced", weight: 1, sortOrder: 4 },
    ],
  });

  await db.setting.upsert({ where: { key: "seededAt" }, create: { key: "seededAt", value: new Date().toISOString() }, update: {} });
}
