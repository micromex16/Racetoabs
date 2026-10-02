import { db } from "../db";
import type { Goal, GoalLevel, GoalStatus, Prisma } from "@prisma/client";
import { getTz } from "../settings";
import { dateToKey, diffDays, keyToDate, todayKey, weekStartKey, addDays, quarterBounds } from "../time";
import { metricActualsForRange } from "./metrics";

export type Measure = { metricKey: string; target: number };

export type GoalNode = {
  id: string;
  level: GoalLevel;
  title: string;
  notes: string;
  owner: string;
  status: GoalStatus;
  manualProgress: number | null;
  measures: Measure[];
  measureDetail: { metricKey: string; name: string; actual: number; target: number }[];
  periodStart: string | null;
  dueDate: string | null;
  year: number | null;
  quarter: number | null;
  weekStart: string | null;
  sortOrder: number;
  completedAt: string | null;
  archivedAt: string | null;
  parentId: string | null;
  progress: number; // 0–100
  progressSource: "manual" | "done" | "measures" | "children" | "tasks" | "none";
  expected: number | null; // where you "should" be by now (time elapsed), 0–100
  daysLeft: number | null;
  taskCounts: { open: number; done: number };
  children: GoalNode[];
};

const LEVEL_ORDER: GoalLevel[] = ["EXIT", "ANNUAL", "QUARTERLY", "WEEKLY"];

/** Period start for time-elapsed math. */
function periodStartOf(g: Goal): string | null {
  if (g.periodStart) return dateToKey(g.periodStart);
  if (g.level === "WEEKLY" && g.weekStart) return dateToKey(g.weekStart);
  if (g.level === "QUARTERLY" && g.year && g.quarter) return quarterBounds(g.year, g.quarter).start;
  if (g.level === "ANNUAL" && g.year) return `${g.year}-01-01`;
  return dateToKey(g.createdAt);
}

export async function loadGoalTree(opts: { includeArchived?: boolean } = {}) {
  const tz = await getTz();
  const today = todayKey(tz);
  const goals = await db.goal.findMany({
    where: opts.includeArchived ? {} : { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const taskGroups = await db.task.groupBy({
    by: ["goalId", "status"],
    where: { goalId: { not: null }, status: { in: ["OPEN", "DONE"] } },
    _count: true,
  });
  const counts = new Map<string, { open: number; done: number }>();
  for (const t of taskGroups) {
    const c = counts.get(t.goalId!) ?? { open: 0, done: 0 };
    if (t.status === "OPEN") c.open += t._count;
    else c.done += t._count;
    counts.set(t.goalId!, c);
  }

  // Metric actuals for measured goals
  const measured = goals.filter((g) => Array.isArray(g.measures) && (g.measures as Measure[]).length);
  const actuals = new Map<string, Awaited<ReturnType<typeof metricActualsForRange>>>();
  for (const g of measured) {
    const start = periodStartOf(g) ?? today;
    const end = g.dueDate ? dateToKey(g.dueDate)! : today;
    actuals.set(g.id, await metricActualsForRange((g.measures as Measure[]).map((m) => m.metricKey), start, end));
  }

  const byId = new Map<string, GoalNode>();
  for (const g of goals) {
    const start = periodStartOf(g);
    const due = dateToKey(g.dueDate);
    let expected: number | null = null;
    if (start && due) {
      const total = Math.max(1, diffDays(due, start));
      expected = Math.max(0, Math.min(100, Math.round((diffDays(today, start) / total) * 100)));
    }
    const measures = ((g.measures as Measure[]) ?? []).filter((m) => m && m.metricKey);
    const act = actuals.get(g.id);
    byId.set(g.id, {
      id: g.id,
      level: g.level,
      title: g.title,
      notes: g.notes,
      owner: g.owner,
      status: g.status,
      manualProgress: g.manualProgress,
      measures,
      measureDetail: measures.map((m) => ({
        metricKey: m.metricKey,
        name: act?.[m.metricKey]?.name ?? m.metricKey,
        actual: act?.[m.metricKey]?.value ?? 0,
        target: m.target,
      })),
      periodStart: start,
      dueDate: due,
      year: g.year,
      quarter: g.quarter,
      weekStart: dateToKey(g.weekStart),
      sortOrder: g.sortOrder,
      completedAt: g.completedAt?.toISOString() ?? null,
      archivedAt: g.archivedAt?.toISOString() ?? null,
      parentId: g.parentId,
      progress: 0,
      progressSource: "none",
      expected,
      daysLeft: due ? diffDays(due, today) : null,
      taskCounts: counts.get(g.id) ?? { open: 0, done: 0 },
      children: [],
    });
  }
  const roots: GoalNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Roll-up rules:
  //   manual override → done → scoreboard measures → children (except weekly children,
  //   which are steps, not slices, of a quarterly rock) → tasks in the whole subtree.
  const subtreeTasks = (n: GoalNode): { open: number; done: number } =>
    n.children.reduce(
      (acc, c) => {
        const t = subtreeTasks(c);
        return { open: acc.open + t.open, done: acc.done + t.done };
      },
      { ...n.taskCounts },
    );
  const visit = (n: GoalNode): number => {
    const childProgress = n.children.map(visit);
    const rollChildren = n.children.length > 0 && n.children.some((c) => c.level !== "WEEKLY");
    const tasks = subtreeTasks(n);
    if (n.status === "DONE" || n.completedAt) {
      n.progress = 100;
      n.progressSource = "done";
    } else if (n.manualProgress != null) {
      n.progress = n.manualProgress;
      n.progressSource = "manual";
    } else if (n.measureDetail.length) {
      const parts = n.measureDetail.map((m) => (m.target > 0 ? Math.min(1, m.actual / m.target) : 0));
      n.progress = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
      n.progressSource = "measures";
    } else if (rollChildren) {
      const vals = n.children.map((c, i) => (c.level === "WEEKLY" ? null : childProgress[i])).filter((v): v is number => v != null);
      n.progress = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      n.progressSource = "children";
    } else if (tasks.open + tasks.done > 0) {
      n.progress = Math.round((tasks.done / (tasks.open + tasks.done)) * 100);
      n.progressSource = "tasks";
    }
    return n.progress;
  };
  roots.forEach(visit);

  const sortRec = (list: GoalNode[]) => {
    list.sort(
      (a, b) =>
        LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
        a.sortOrder - b.sortOrder ||
        (a.dueDate ?? "").localeCompare(b.dueDate ?? ""),
    );
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return { roots, byId, today };
}

export async function goalsOverview() {
  const { roots, byId, today } = await loadGoalTree();
  const all = [...byId.values()];
  const weekStart = weekStartKey(today);
  const strip = (n: GoalNode): GoalNode => ({ ...n, children: n.children.map(strip) });
  return {
    today,
    weekStart,
    tree: roots.map(strip),
    weeklyRocks: currentWeeklyRocks(all, weekStart),
    nextWeekRocks: all.filter((g) => g.level === "WEEKLY" && g.weekStart === addDays(weekStart, 7)),
    quarterlyRocks: currentQuarterRocks(all, today),
  };
}

export function currentWeeklyRocks(all: GoalNode[], weekStart: string) {
  return all
    .filter((g) => g.level === "WEEKLY" && g.weekStart === weekStart)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ children: _c, ...rest }) => ({ ...rest, children: [] as GoalNode[] }));
}

/** Quarterly rocks active today (quarter contains today), falling back to the nearest open ones. */
export function currentQuarterRocks(all: GoalNode[], today: string) {
  const q = all.filter((g) => g.level === "QUARTERLY" && !g.archivedAt);
  const active = q.filter((g) => (g.periodStart ?? "") <= today && (g.dueDate ?? "9999") >= today);
  const list = active.length ? active : q.filter((g) => (g.dueDate ?? "9999") >= today).slice(0, 5);
  return list
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ children: _c, ...rest }) => ({ ...rest, children: [] as GoalNode[] }));
}

/** Walk up the tree to the nearest rock (weekly or quarterly). */
export function rockAncestry(byId: Map<string, GoalNode>, goalId: string | null | undefined) {
  const chain: GoalNode[] = [];
  let cur = goalId ? byId.get(goalId) : undefined;
  while (cur) {
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return {
    weekly: chain.find((g) => g.level === "WEEKLY"),
    quarterly: chain.find((g) => g.level === "QUARTERLY"),
    annual: chain.find((g) => g.level === "ANNUAL"),
    chain,
  };
}

// ───────────── mutations ─────────────

export type GoalInput = {
  level: GoalLevel;
  title: string;
  notes?: string;
  owner?: string;
  status?: GoalStatus;
  manualProgress?: number | null;
  measures?: Measure[];
  periodStart?: string | null;
  dueDate?: string | null;
  year?: number | null;
  quarter?: number | null;
  weekStart?: string | null;
  parentId?: string | null;
};

function toData(input: Partial<GoalInput>) {
  const d: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (k === "dueDate" || k === "periodStart" || k === "weekStart") d[k] = v ? keyToDate(v as string) : null;
    else d[k] = v;
  }
  return d;
}

export async function createGoal(input: GoalInput) {
  if (input.level === "WEEKLY" && !input.weekStart) {
    const today = todayKey(await getTz());
    input.weekStart = weekStartKey(today);
  }
  if (input.level === "WEEKLY" && input.weekStart && !input.dueDate) {
    input.dueDate = addDays(weekStartKey(input.weekStart), 4); // Friday
  }
  if (input.level === "QUARTERLY" && input.year && input.quarter && !input.dueDate) {
    const b = quarterBounds(input.year, input.quarter);
    input.dueDate = b.end;
    input.periodStart ??= b.start;
  }
  if (input.level === "ANNUAL" && input.year && !input.dueDate) {
    input.dueDate = `${input.year}-12-31`;
    input.periodStart ??= `${input.year}-01-01`;
  }
  const siblings = await db.goal.count({ where: { level: input.level, parentId: input.parentId ?? null } });
  return db.goal.create({ data: { ...toData(input), sortOrder: siblings } as Prisma.GoalUncheckedCreateInput });
}

export async function updateGoal(id: string, patch: Partial<GoalInput>) {
  const data = toData(patch);
  if (patch.status === "DONE") data.completedAt = new Date();
  else if (patch.status) data.completedAt = null;
  return db.goal.update({ where: { id }, data });
}

export async function completeGoal(id: string, done: boolean) {
  return db.goal.update({
    where: { id },
    data: done ? { status: "DONE", completedAt: new Date() } : { status: "ON_TRACK", completedAt: null },
  });
}

export async function archiveGoal(id: string, archived = true) {
  return db.goal.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
}

export async function archiveCompletedGoals() {
  const r = await db.goal.updateMany({
    where: { status: "DONE", archivedAt: null, level: { in: ["WEEKLY", "QUARTERLY"] } },
    data: { archivedAt: new Date() },
  });
  return { archived: r.count };
}

export async function deleteGoal(id: string) {
  await db.goal.updateMany({ where: { parentId: id }, data: { parentId: null } });
  return db.goal.delete({ where: { id } });
}

export async function reorderGoals(ids: string[]) {
  await db.$transaction(ids.map((id, i) => db.goal.update({ where: { id }, data: { sortOrder: i } })));
  return { ok: true };
}
