import { db } from "../db";
import { getSettings } from "../settings";
import { addDays, dateToKey, diffDays, keyToDate, localMinutes, parseHHMM, todayKey, weekStartKey, weekday } from "../time";
import { loadGoalTree, currentWeeklyRocks, currentQuarterRocks, rockAncestry, type GoalNode } from "./goals";
import { ensureRecurringForWeek, weeklyCadence } from "./recurring";
import { resurfaceScheduled, park } from "./parking";
import { parkTask } from "./tasks";
import { inboxPulse } from "./comms";
import type { PipelineStage } from "@prisma/client";

export type PickKind = "task" | "followup" | "pipeline";
export type PickRef = { kind: PickKind; refId: string };
export type Pick = PickRef & {
  title: string;
  subtitle?: string;
  reason: string;
  score: number;
  rockId?: string | null;
  rockLabel?: string | null;
  due?: string | null;
  doneAt?: string | null;
};

/** Pipeline stage → the scoreboard metric that stage's next action moves. Used to
 *  connect unlinked pipeline actions to whichever rock measures that metric. */
const STAGE_METRIC: Record<PipelineStage, string[]> = {
  TARGET: ["pipeline_active", "accounts_3_contacts"],
  CONTACTED: ["outreach_touches", "sample_kits"],
  SAMPLE_SENT: ["sample_kits", "discovery_calls"],
  DISCOVERY: ["discovery_calls", "rfqs"],
  RFQ: ["rfqs", "quotes_sent"],
  QUOTED: ["quotes_sent", "pilots_live"],
  PILOT: ["pilots_live", "accounts_won_ytd", "dc_accounts", "ad_accounts"],
  CUSTOMER: ["accounts_won_ytd"],
};

type RockCtx = {
  weekly: GoalNode[];
  quarterly: GoalNode[];
  byId: Map<string, GoalNode>;
};

function rockNumber(ctx: RockCtx, g: GoalNode) {
  const list = g.level === "WEEKLY" ? ctx.weekly : ctx.quarterly;
  const i = list.findIndex((r) => r.id === g.id);
  return i >= 0 ? i + 1 : null;
}

function rockPhrase(ctx: RockCtx, g: GoalNode) {
  const n = rockNumber(ctx, g);
  const label = g.level === "WEEKLY" ? `This week's Rock #${n}` : `Rock #${n}`;
  const short = g.title.length > 34 ? g.title.slice(0, 32).trimEnd() + "…" : g.title;
  const due =
    g.daysLeft == null ? "" : g.daysLeft < 0 ? `${-g.daysLeft} days past due` : g.daysLeft === 0 ? "due today" : `due in ${g.daysLeft} day${g.daysLeft === 1 ? "" : "s"}`;
  const behind = g.expected != null && g.daysLeft != null && g.daysLeft > 0 && g.expected - g.progress >= 10 ? ` (pace says ~${g.expected}%)` : "";
  return { n, text: `${n ? label : g.title} (${short}) is ${g.progress}%${behind}${due ? ` and ${due}` : ""}` };
}

function rockScore(g: GoalNode) {
  let s = g.level === "WEEKLY" ? 40 : 25;
  if (g.expected != null) s += Math.max(0, g.expected - g.progress) * 0.4;
  if (g.daysLeft != null && g.daysLeft <= 14) s += 10;
  if (g.progress >= 100) s -= 30;
  return s;
}

function dueScore(due: string | null, today: string) {
  if (!due) return { score: 0, text: "" };
  const d = diffDays(due, today);
  if (d < 0) return { score: 30 + Math.min(-d, 10) * 2, text: `overdue ${-d} day${d === -1 ? "" : "s"}` };
  if (d === 0) return { score: 25, text: "due today" };
  if (d <= 3) return { score: 10, text: `due in ${d} day${d === 1 ? "" : "s"}` };
  return { score: 0, text: "" };
}

function compose(parts: string[]) {
  const p = parts.filter(Boolean);
  if (!p.length) return "Open item with no rock or date — lowest priority.";
  return "Because " + p.join("; ") + ".";
}

export async function generateCandidates(today: string, ctxIn?: RockCtx): Promise<Pick[]> {
  const ctx = ctxIn ?? (await rockContext(today));
  const horizon = keyToDate(addDays(today, 7));
  const [tasks, followUps, cards] = await Promise.all([
    db.task.findMany({
      where: {
        status: "OPEN",
        ownerId: null,
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: keyToDate(today) } }],
      },
      include: { goal: { select: { title: true } } },
      take: 300,
    }),
    db.followUp.findMany({ where: { status: "OPEN", dueDate: { lte: horizon } }, include: { person: true } }),
    db.pipelineCard.findMany({
      where: { archivedAt: null, nextAction: { not: "" }, OR: [{ nextActionDate: { lte: horizon } }, { nextActionDate: null }] },
    }),
  ]);

  const measuredBy = (metricKeys: string[]) =>
    [...ctx.weekly, ...ctx.quarterly].find((r) => r.measures.some((m) => metricKeys.includes(m.metricKey)));

  const out: Pick[] = [];
  for (const t of tasks) {
    const due = dateToKey(t.dueDate);
    const anc = rockAncestry(ctx.byId, t.goalId);
    const rock = anc.weekly ?? anc.quarterly;
    const parts: string[] = [];
    let score = 5;
    if (rock) {
      score += rockScore(rock);
      parts.push(rockPhrase(ctx, rock).text);
    } else if (anc.annual) {
      score += 10;
      parts.push(`it serves the ${anc.annual.year ?? ""} goal "${anc.annual.title}"`);
    }
    const d = dueScore(due, today);
    score += d.score;
    if (d.text) parts.push(`it's ${d.text}`);
    if (t.recurringId) score -= 5;
    out.push({ kind: "task", refId: t.id, title: t.title, subtitle: t.goal?.title, reason: compose(parts), score, rockId: rock?.id ?? null, rockLabel: rock ? rockPhrase(ctx, rock).n?.toString() : null, due });
  }
  for (const f of followUps) {
    const due = dateToKey(f.dueDate)!;
    const anc = rockAncestry(ctx.byId, f.goalId);
    const rock = anc.weekly ?? anc.quarterly;
    let score = 15;
    const parts: string[] = [];
    if (rock) {
      score += rockScore(rock);
      parts.push(rockPhrase(ctx, rock).text);
    }
    const d = dueScore(due, today);
    score += d.score;
    parts.push(`${f.person ? f.person.name + "'s" : "this"} follow-up is ${d.text || "coming up " + due}`);
    out.push({ kind: "followup", refId: f.id, title: `Chase ${f.person?.name ?? ""}: ${f.title}`.replace("Chase : ", "Chase: "), subtitle: f.person?.name, reason: compose(parts), score, rockId: rock?.id ?? null, due });
  }
  for (const c of cards) {
    const due = dateToKey(c.nextActionDate);
    let rock = c.goalId ? rockAncestry(ctx.byId, c.goalId).weekly ?? rockAncestry(ctx.byId, c.goalId).quarterly : undefined;
    rock ??= measuredBy(STAGE_METRIC[c.stage]);
    let score = 8 + (["RFQ", "QUOTED", "PILOT"].includes(c.stage) ? 12 : 0);
    const parts: string[] = [];
    if (rock) {
      score += rockScore(rock);
      parts.push(rockPhrase(ctx, rock).text);
    }
    const d = dueScore(due, today);
    score += d.score;
    parts.push(`${c.company} is at ${c.stage.replace("_", " ").toLowerCase()}${d.text ? ` with the next action ${d.text}` : ""}`);
    out.push({ kind: "pipeline", refId: c.id, title: `${c.company}: ${c.nextAction}`, subtitle: c.company, reason: compose(parts), score, rockId: rock?.id ?? null, due });
  }
  out.sort((a, b) => b.score - a.score);
  return out.map((p) => ({ ...p, score: Math.round(p.score) }));
}

async function rockContext(today: string): Promise<RockCtx> {
  const { byId } = await loadGoalTree();
  const all = [...byId.values()];
  return { weekly: currentWeeklyRocks(all, weekStartKey(today)), quarterly: currentQuarterRocks(all, today), byId };
}

/** Top-3 with light diversity: no more than 2 picks serving the same rock. */
export function choosePicks(cands: Pick[]) {
  const picks: Pick[] = [];
  const perRock = new Map<string, number>();
  for (const c of cands) {
    if (picks.length === 3) break;
    const k = c.rockId ?? `none-${c.refId}`;
    if ((perRock.get(k) ?? 0) >= 2) continue;
    perRock.set(k, (perRock.get(k) ?? 0) + 1);
    picks.push(c);
  }
  for (const c of cands) {
    if (picks.length === 3) break;
    if (!picks.includes(c)) picks.push(c);
  }
  return picks;
}

export async function ensurePlan(today: string) {
  const existing = await db.dailyPlan.findUnique({ where: { date: today } });
  if (existing) return existing;
  const cands = await generateCandidates(today);
  return db.dailyPlan.upsert({
    where: { date: today },
    create: { date: today, picks: choosePicks(cands) as never, candidates: cands.slice(0, 25) as never },
    update: {},
  });
}

/** Re-run the picker (before launch, or on demand). */
export async function repick(today?: string) {
  const s = await getSettings();
  const d = today ?? todayKey(s.timezone);
  const cands = await generateCandidates(d);
  return db.dailyPlan.upsert({
    where: { date: d },
    create: { date: d, picks: choosePicks(cands) as never, candidates: cands.slice(0, 25) as never },
    update: { picks: choosePicks(cands) as never, candidates: cands.slice(0, 25) as never, pickedBy: "heuristic" },
  });
}

async function resolvePicks(picks: Pick[]) {
  const ids = (k: PickKind) => picks.filter((p) => p.kind === k).map((p) => p.refId);
  const [tasks, fus, cards] = await Promise.all([
    db.task.findMany({ where: { id: { in: ids("task") } } }),
    db.followUp.findMany({ where: { id: { in: ids("followup") } }, include: { person: true } }),
    db.pipelineCard.findMany({ where: { id: { in: ids("pipeline") } } }),
  ]);
  return picks.map((p) => {
    if (p.kind === "task") {
      const t = tasks.find((x) => x.id === p.refId);
      return { ...p, exists: !!t, done: t?.status === "DONE", title: t?.title ?? p.title, due: dateToKey(t?.dueDate) ?? p.due };
    }
    if (p.kind === "followup") {
      const f = fus.find((x) => x.id === p.refId);
      return { ...p, exists: !!f, done: f?.status === "DONE", due: dateToKey(f?.dueDate) ?? p.due };
    }
    const c = cards.find((x) => x.id === p.refId);
    return { ...p, exists: !!c, done: !!p.doneAt, nextAction: c?.nextAction, stage: c?.stage };
  });
}

export async function swapPick(slot: number, ref: PickRef & { title?: string }) {
  const s = await getSettings();
  const today = todayKey(s.timezone);
  const plan = await ensurePlan(today);
  const picks = [...(plan.picks as Pick[])];
  const cands = plan.candidates as Pick[];
  let next = cands.find((c) => c.kind === ref.kind && c.refId === ref.refId);
  if (!next) {
    const fresh = await generateCandidates(today);
    next = fresh.find((c) => c.kind === ref.kind && c.refId === ref.refId);
  }
  if (!next) throw new Error("That item isn't available to pick.");
  picks[slot] = { ...next, reason: next.reason + " (Your swap.)" };
  return db.dailyPlan.update({ where: { date: today }, data: { picks: picks as never } });
}

export async function setPicks(date: string, picks: Pick[], pickedBy: "agent" | "heuristic" | "user") {
  return db.dailyPlan.update({ where: { date }, data: { picks: picks as never, pickedBy } });
}

export async function markPipelinePickDone(refId: string, done = true) {
  const s = await getSettings();
  const today = todayKey(s.timezone);
  const plan = await ensurePlan(today);
  const picks = (plan.picks as Pick[]).map((p) => (p.kind === "pipeline" && p.refId === refId ? { ...p, doneAt: done ? new Date().toISOString() : null } : p));
  return db.dailyPlan.update({ where: { date: today }, data: { picks: picks as never } });
}

export async function launchDay(input: { mindDump?: string }) {
  const s = await getSettings();
  const today = todayKey(s.timezone);
  await ensurePlan(today);
  if (input.mindDump?.trim()) await park(input.mindDump, "launch");
  return db.dailyPlan.update({
    where: { date: today },
    data: { launchedAt: new Date(), mindDump: input.mindDump ?? "" },
  });
}

export type CloseAction = { kind: PickKind; refId: string; action: "done" | "carry" | "park" };

export async function closeDay(input: { actions: CloseAction[] }) {
  const s = await getSettings();
  const today = todayKey(s.timezone);
  const tomorrow = nextWorkday(today);
  const plan = await ensurePlan(today);
  for (const a of input.actions) {
    if (a.kind === "task") {
      if (a.action === "done") await db.task.update({ where: { id: a.refId }, data: { status: "DONE", doneAt: new Date() } });
      if (a.action === "carry") await db.task.update({ where: { id: a.refId }, data: { dueDate: keyToDate(tomorrow) } });
      if (a.action === "park") await parkTask(a.refId);
    } else if (a.kind === "followup") {
      if (a.action === "done") await db.followUp.update({ where: { id: a.refId }, data: { status: "DONE", doneAt: new Date() } });
      if (a.action === "carry") await db.followUp.update({ where: { id: a.refId }, data: { dueDate: keyToDate(tomorrow) } });
      if (a.action === "park") {
        const f = await db.followUp.update({ where: { id: a.refId }, data: { status: "CANCELLED" } });
        await park(`Follow-up: ${f.title}`, "eod");
      }
    } else {
      if (a.action === "done") await markPipelinePickDone(a.refId);
      if (a.action === "carry") await db.pipelineCard.update({ where: { id: a.refId }, data: { nextActionDate: keyToDate(tomorrow) } });
      if (a.action === "park") {
        const c = await db.pipelineCard.update({ where: { id: a.refId }, data: { nextActionDate: null } });
        await park(`${c.company}: ${c.nextAction}`, "eod");
      }
    }
  }
  const resolved = await resolvePicks((await db.dailyPlan.findUniqueOrThrow({ where: { date: today } })).picks as Pick[]);
  const allDone = resolved.length > 0 && resolved.every((p) => p.done);
  await db.dailyPlan.update({ where: { id: plan.id }, data: { closedAt: new Date(), allDone } });
  return { allDone, streak: await streak(today), tomorrow };
}

function nextWorkday(key: string) {
  let d = addDays(key, 1);
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
  return d;
}

export async function streak(today: string) {
  const plans = await db.dailyPlan.findMany({ orderBy: { date: "desc" }, take: 400, select: { date: true, allDone: true, closedAt: true } });
  const map = new Map(plans.map((p) => [p.date, p]));
  let cur = 0;
  let d = today;
  const t = map.get(today);
  // Today isn't lost until it's over; it only adds to the streak once all picks are done.
  if (t?.allDone) cur = 1;
  d = addDays(today, -1);
  for (let i = 0; i < 400; i++) {
    const p = map.get(d);
    const wd = weekday(d);
    if (!p && (wd === 0 || wd === 6)) {
      d = addDays(d, -1);
      continue;
    }
    if (p?.allDone) cur++;
    else break;
    d = addDays(d, -1);
  }
  // best streak
  let best = 0;
  let run = 0;
  const sorted = [...plans].sort((a, b) => a.date.localeCompare(b.date));
  let prev: string | null = null;
  for (const p of sorted) {
    if (p.allDone) {
      const gapOk = prev && (() => {
        let x = addDays(prev!, 1);
        while (x < p.date) {
          const wd = weekday(x);
          if (wd !== 0 && wd !== 6) return false;
          x = addDays(x, 1);
        }
        return true;
      })();
      run = gapOk ? run + 1 : 1;
      best = Math.max(best, run);
      prev = p.date;
    } else {
      run = 0;
      prev = null;
    }
  }
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const k = addDays(today, -13 + i);
    const p = map.get(k);
    return { date: k, state: p?.allDone ? "done" : p?.closedAt ? "missed" : p ? "open" : "none" };
  });
  return { current: cur, best: Math.max(best, cur), last14 };
}

export async function getToday() {
  const s = await getSettings();
  const tz = s.timezone;
  const today = todayKey(tz);
  const ws = weekStartKey(today);
  await Promise.all([ensureRecurringForWeek(ws), resurfaceScheduled(today)]);

  const { byId } = await loadGoalTree();
  const all = [...byId.values()];
  const weeklyRocks = currentWeeklyRocks(all, ws);
  const quarterlyRocks = currentQuarterRocks(all, today);
  const ctx: RockCtx = { weekly: weeklyRocks, quarterly: quarterlyRocks, byId };

  let plan = await db.dailyPlan.findUnique({ where: { date: today } });
  if (!plan) {
    const cands = await generateCandidates(today, ctx);
    plan = await db.dailyPlan.upsert({
      where: { date: today },
      create: { date: today, picks: choosePicks(cands) as never, candidates: cands.slice(0, 25) as never },
      update: {},
    });
  }
  const picks = await resolvePicks(plan.picks as Pick[]);
  const allDone = picks.length > 0 && picks.every((p) => p.done);
  if (allDone !== plan.allDone) await db.dailyPlan.update({ where: { id: plan.id }, data: { allDone } });

  const pickTaskIds = picks.filter((p) => p.kind === "task").map((p) => p.refId);
  const pickFuIds = picks.filter((p) => p.kind === "followup").map((p) => p.refId);
  const pickCardIds = picks.filter((p) => p.kind === "pipeline").map((p) => p.refId);
  const todayDate = keyToDate(today);

  const [overdue, dueTodayTasks, followUpsDue, pipelineDue, parkingOpen, parkingRecent, people] = await Promise.all([
    db.task.findMany({
      where: { status: "OPEN", ownerId: null, dueDate: { lt: todayDate }, id: { notIn: pickTaskIds } },
      include: { goal: { select: { id: true, title: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.task.findMany({
      where: { status: "OPEN", ownerId: null, dueDate: todayDate, id: { notIn: pickTaskIds } },
      include: { goal: { select: { id: true, title: true } } },
    }),
    db.followUp.findMany({
      where: { status: "OPEN", dueDate: { lte: todayDate }, id: { notIn: pickFuIds } },
      include: { person: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.pipelineCard.findMany({
      where: { archivedAt: null, nextActionDate: { lte: todayDate }, id: { notIn: pickCardIds } },
      orderBy: { nextActionDate: "asc" },
      select: { id: true, company: true, lane: true, stage: true, nextAction: true, nextActionDate: true },
    }),
    db.parkingItem.count({ where: { status: "OPEN" } }),
    db.parkingItem.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 3 }),
    db.person.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const nowMin = localMinutes(tz);
  const reviewDue = weekday(today) === s.reviewDay && !(await db.weeklyReview.findUnique({ where: { weekStart: keyToDate(ws) } }))?.closedAt;

  return {
    settings: { ownerName: s.ownerName, company: s.company, closeTime: s.closeTime, exitDate: s.exitDate },
    today,
    weekStart: ws,
    daysToExit: diffDays(s.exitDate, today),
    weeklyRocks,
    quarterlyRocks,
    plan: {
      id: plan.id,
      launched: !!plan.launchedAt,
      closed: !!plan.closedAt,
      pickedBy: plan.pickedBy,
      picks,
      allDone,
      candidates: (plan.candidates as Pick[]).filter((c) => !picks.some((p) => p.kind === c.kind && p.refId === c.refId)).slice(0, 12),
    },
    needsLaunch: !plan.launchedAt,
    closeWindow: nowMin >= parseHHMM(s.closeTime) - 30 && !plan.closedAt,
    overdue: overdue.map((t) => ({ id: t.id, title: t.title, due: dateToKey(t.dueDate)!, goal: t.goal })),
    dueToday: dueTodayTasks.map((t) => ({ id: t.id, title: t.title, due: today, goal: t.goal })),
    followUpsDue: followUpsDue.map((f) => ({ id: f.id, title: f.title, due: dateToKey(f.dueDate)!, person: f.person })),
    pipelineDue: pipelineDue.map((c) => ({ ...c, nextActionDate: dateToKey(c.nextActionDate)! })),
    parking: { open: parkingOpen, recent: parkingRecent },
    streak: await streak(today),
    cadence: await weeklyCadence(ws),
    inbox: await inboxPulse(),
    reviewDue,
    people,
  };
}

export type TodayPayload = Awaited<ReturnType<typeof getToday>>;
