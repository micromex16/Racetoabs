import { db } from "../db";
import { getSettings } from "../settings";
import { addDays, dateToKey, keyToDate, todayKey, weekStartKey, fmtShort } from "../time";
import { loadGoalTree, currentWeeklyRocks, currentQuarterRocks } from "./goals";
import { scoreboard, exitReadiness } from "./metrics";
import type { Pick } from "./daily";
import { STAGE_LABEL } from "./pipeline";

export async function getWeeklyReview(weekStartIn?: string) {
  const s = await getSettings();
  const today = todayKey(s.timezone);
  const ws = weekStartIn ?? weekStartKey(today);
  const we = addDays(ws, 6);
  const nextWs = addDays(ws, 7);
  const wsD = keyToDate(ws);
  const weEnd = keyToDate(addDays(ws, 7));

  const { byId } = await loadGoalTree();
  const all = [...byId.values()];
  const rocks = currentWeeklyRocks(all, ws);
  const nextRocks = currentWeeklyRocks(all, nextWs);
  const quarterlyRocks = currentQuarterRocks(all, today);

  const [plans, tasksDue, tasksDone, fuClosed, moves, overdueTasks, overdueFus, parking, review, newCards] = await Promise.all([
    db.dailyPlan.findMany({ where: { date: { gte: ws, lte: we } }, orderBy: { date: "asc" } }),
    db.task.findMany({ where: { dueDate: { gte: wsD, lt: weEnd }, status: { not: "CANCELLED" } }, select: { id: true, title: true, status: true } }),
    db.task.findMany({ where: { doneAt: { gte: wsD, lt: weEnd } }, select: { id: true, title: true } }),
    db.followUp.count({ where: { doneAt: { gte: wsD, lt: weEnd } } }),
    db.pipelineEvent.findMany({ where: { at: { gte: wsD, lt: weEnd }, fromStage: { not: null } }, include: { card: { select: { company: true } } } }),
    db.task.findMany({ where: { status: "OPEN", dueDate: { lt: keyToDate(today) } }, include: { owner: true, goal: { select: { title: true } } }, orderBy: { dueDate: "asc" } }),
    db.followUp.findMany({ where: { status: "OPEN", dueDate: { lt: keyToDate(today) } }, include: { person: true }, orderBy: { dueDate: "asc" } }),
    db.parkingItem.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" } }),
    db.weeklyReview.findUnique({ where: { weekStart: wsD } }),
    db.pipelineCard.count({ where: { createdAt: { gte: wsD, lt: weEnd } } }),
  ]);

  const picksMade = plans.reduce((a, p) => a + (p.picks as Pick[]).length, 0);
  const sb = await scoreboard(2);
  const metricsThisWeek = sb.metrics.map((m) => ({ key: m.key, name: m.name, value: m.current, target: m.target, rag: m.rag, aggregation: m.aggregation, source: m.source, unit: m.unit }));

  return {
    today,
    weekStart: ws,
    weekEnd: we,
    nextWeekStart: nextWs,
    rocks,
    nextRocks,
    quarterlyRocks,
    said: {
      rocks: rocks.length,
      tasksDue: tasksDue.length,
      picks: picksMade,
    },
    done: {
      rocks: rocks.filter((r) => r.progress >= 100).length,
      tasksDueDone: tasksDue.filter((t) => t.status === "DONE").length,
      tasksCompleted: tasksDone.length,
      picksDays: plans.filter((p) => p.allDone).length,
      plannedDays: plans.length,
      followUpsClosed: fuClosed,
      pipelineMoves: moves.length,
      newCards,
    },
    daily: plans.map((p) => ({ date: p.date, allDone: p.allDone, closed: !!p.closedAt, picks: (p.picks as Pick[]).map((x) => x.title) })),
    moves: moves.map((m) => ({ company: m.card.company, from: m.fromStage ? STAGE_LABEL[m.fromStage] : "", to: STAGE_LABEL[m.toStage] })),
    overdue: {
      tasks: overdueTasks.map((t) => ({ id: t.id, title: t.title, due: dateToKey(t.dueDate)!, owner: t.owner?.name ?? null, goal: t.goal?.title ?? null })),
      followUps: overdueFus.map((f) => ({ id: f.id, title: f.title, due: dateToKey(f.dueDate)!, person: f.person?.name ?? null })),
    },
    parking,
    metrics: metricsThisWeek,
    review: review ? { notes: review.notes, wins: review.wins, closedAt: review.closedAt?.toISOString() ?? null } : null,
  };
}

export async function saveWeeklyReview(weekStart: string, input: { notes?: string; wins?: string }) {
  const wsD = keyToDate(weekStart);
  return db.weeklyReview.upsert({
    where: { weekStart: wsD },
    create: { weekStart: wsD, notes: input.notes ?? "", wins: input.wins ?? "" },
    update: input,
  });
}

export async function closeWeeklyReview(weekStart: string, input: { notes?: string; wins?: string }) {
  const nextWs = keyToDate(addDays(weekStart, 7));
  const nextRocks = await db.goal.count({ where: { level: "WEEKLY", weekStart: nextWs, archivedAt: null } });
  if (nextRocks === 0) throw new Error("Set next week's rocks before closing the review.");
  const snap = await getWeeklyReview(weekStart);
  const wsD = keyToDate(weekStart);
  return db.weeklyReview.upsert({
    where: { weekStart: wsD },
    create: { weekStart: wsD, notes: input.notes ?? "", wins: input.wins ?? "", closedAt: new Date(), snapshot: { said: snap.said, done: snap.done } as never },
    update: { ...input, closedAt: new Date(), snapshot: { said: snap.said, done: snap.done } as never },
  });
}

/** One-page monthly progress summary (markdown), copyable. Activity and pipeline only. */
export async function monthlySummary(month?: string) {
  const s = await getSettings();
  const today = todayKey(s.timezone);
  const m = month ?? today.slice(0, 7);
  const start = `${m}-01`;
  const [y, mo] = m.split("-").map(Number);
  const end = dateToKey(new Date(Date.UTC(y, mo, 0)))!;
  const startD = keyToDate(start);
  const endD = keyToDate(addDays(end, 1));

  const { byId } = await loadGoalTree();
  const all = [...byId.values()];
  const quarterRocks = currentQuarterRocks(all, end < today ? end : today);
  const annual = all.filter((g) => g.level === "ANNUAL");
  const [tasksDone, fuDone, moves, newCards, won, rocksDone, plans, reviews] = await Promise.all([
    db.task.count({ where: { doneAt: { gte: startD, lt: endD } } }),
    db.followUp.count({ where: { doneAt: { gte: startD, lt: endD } } }),
    db.pipelineEvent.findMany({ where: { at: { gte: startD, lt: endD }, fromStage: { not: null } }, include: { card: { select: { company: true, lane: true } } } }),
    db.pipelineCard.count({ where: { createdAt: { gte: startD, lt: endD } } }),
    db.pipelineCard.findMany({ where: { wonAt: { gte: startD, lt: endD } }, select: { company: true } }),
    db.goal.findMany({ where: { completedAt: { gte: startD, lt: endD }, level: { in: ["WEEKLY", "QUARTERLY"] } }, select: { title: true, level: true } }),
    db.dailyPlan.findMany({ where: { date: { gte: start, lte: end } } }),
    db.weeklyReview.count({ where: { weekStart: { gte: startD, lt: endD }, closedAt: { not: null } } }),
  ]);
  const metrics = await db.metric.findMany({
    where: { archivedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { entries: { where: { weekStart: { gte: keyToDate(weekStartKey(start)), lt: endD } }, orderBy: { weekStart: "asc" } } },
  });
  const exit = await exitReadiness();

  const lines: string[] = [];
  const monthName = new Date(`${start}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  lines.push(`# ${s.company} — ${monthName} progress`);
  lines.push("");
  lines.push(`**Exit readiness: ${exit.score}/100** · target: exit-ready by ${fmtShort(s.exitDate)} ${s.exitDate.slice(0, 4)}`);
  lines.push("");
  lines.push("## Rocks");
  for (const [i, r] of quarterRocks.entries()) lines.push(`- Rock #${i + 1} ${r.title} — **${r.progress}%**${r.dueDate ? ` (due ${fmtShort(r.dueDate)})` : ""}`);
  if (rocksDone.length) {
    lines.push("");
    lines.push(`Completed this month: ${rocksDone.map((r) => r.title).join("; ")}`);
  }
  if (annual.length) {
    lines.push("");
    lines.push("## Annual goals");
    for (const g of annual) lines.push(`- ${g.year ?? ""} · ${g.title} — ${g.progress}%`);
  }
  lines.push("");
  lines.push("## Execution");
  lines.push(`- Tasks completed: ${tasksDone}`);
  lines.push(`- Follow-ups closed: ${fuDone}`);
  lines.push(`- Days with all 3 picks done: ${plans.filter((p) => p.allDone).length} of ${plans.length} planned`);
  lines.push(`- Weekly reviews closed: ${reviews}`);
  lines.push("");
  lines.push("## Pipeline");
  lines.push(`- New accounts added: ${newCards}`);
  lines.push(`- Stage advances: ${moves.length}`);
  if (won.length) lines.push(`- New customers: ${won.map((w) => w.company).join(", ")}`);
  const late = moves.filter((x) => ["RFQ", "QUOTED", "PILOT", "CUSTOMER"].includes(x.toStage));
  if (late.length) lines.push(`- Late-stage moves: ${late.map((x) => `${x.card.company} → ${STAGE_LABEL[x.toStage]}`).join("; ")}`);
  lines.push("");
  lines.push("## Scoreboard (month)");
  for (const mt of metrics) {
    if (!mt.entries.length) continue;
    const v = mt.aggregation === "SUM" ? mt.entries.reduce((a, e) => a + e.value, 0) : mt.entries.at(-1)!.value;
    lines.push(`- ${mt.name}: ${v}${mt.unit === "%" ? "%" : ""}`);
  }
  return { month: m, markdown: lines.join("\n") };
}
