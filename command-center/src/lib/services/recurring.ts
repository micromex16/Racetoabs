import { db } from "../db";
import { addDays, keyToDate } from "../time";

/** Create this week's instance of every active recurring commitment (idempotent). */
export async function ensureRecurringForWeek(weekStart: string) {
  const recs = await db.recurringTask.findMany({ where: { active: true } });
  const ws = keyToDate(weekStart);
  for (const r of recs) {
    const due = addDays(weekStart, (r.weekday + 6) % 7);
    await db.task.upsert({
      where: { recurringId_weekStart: { recurringId: r.id, weekStart: ws } },
      create: {
        title: r.title,
        recurringId: r.id,
        weekStart: ws,
        goalId: r.goalId,
        dueDate: keyToDate(due),
        source: "recurring",
      },
      update: {},
    });
  }
}

export async function weeklyCadence(weekStart: string) {
  const ws = keyToDate(weekStart);
  const recs = await db.recurringTask.findMany({
    where: { active: true },
    include: { tasks: { where: { weekStart: ws }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });
  const keys = recs.map((r) => r.metricKey).filter(Boolean) as string[];
  const metrics = await db.metric.findMany({
    where: { key: { in: keys } },
    include: { entries: { where: { weekStart: ws } } },
  });
  return recs.map((r) => {
    const m = metrics.find((x) => x.key === r.metricKey);
    const current = m?.entries[0]?.value ?? 0;
    const task = r.tasks[0];
    const done = task?.status === "DONE" || (r.targetCount != null && current >= r.targetCount);
    return {
      id: r.id,
      title: r.title,
      metricKey: r.metricKey,
      target: r.targetCount,
      current: r.metricKey ? current : null,
      taskId: task?.id ?? null,
      done,
      weekday: r.weekday,
    };
  });
}

export async function listRecurring() {
  return db.recurringTask.findMany({ orderBy: { createdAt: "asc" }, include: { goal: { select: { id: true, title: true } } } });
}

export async function upsertRecurring(
  id: string | null,
  input: { title: string; weekday?: number; targetCount?: number | null; metricKey?: string | null; goalId?: string | null; active?: boolean },
) {
  if (id) return db.recurringTask.update({ where: { id }, data: input });
  return db.recurringTask.create({ data: input });
}

export async function deleteRecurring(id: string) {
  return db.recurringTask.delete({ where: { id } });
}
