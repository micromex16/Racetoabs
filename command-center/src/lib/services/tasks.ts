import { db } from "../db";
import { getTz } from "../settings";
import { addDays, keyToDate, todayKey } from "../time";

export type TaskInput = {
  title: string;
  notes?: string;
  goalId?: string | null;
  dueDate?: string | null;
  ownerId?: string | null;
  source?: string;
  threadId?: string | null;
};

const taskInclude = {
  goal: { select: { id: true, title: true, level: true } },
  owner: { select: { id: true, name: true } },
} as const;

export async function listTasks(filter: { status?: "OPEN" | "DONE" | "ALL"; goalId?: string; q?: string; delegated?: boolean; limit?: number } = {}) {
  return db.task.findMany({
    where: {
      ...(filter.status && filter.status !== "ALL" ? { status: filter.status } : filter.status === "ALL" ? {} : { status: "OPEN" }),
      ...(filter.goalId ? { goalId: filter.goalId } : {}),
      ...(filter.delegated ? { ownerId: { not: null } } : {}),
      ...(filter.q ? { title: { contains: filter.q, mode: "insensitive" as const } } : {}),
    },
    include: taskInclude,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: filter.limit ?? 200,
  });
}

export async function createTask(input: TaskInput) {
  return db.task.create({
    data: {
      title: input.title.trim(),
      notes: input.notes ?? "",
      goalId: input.goalId ?? null,
      ownerId: input.ownerId ?? null,
      threadId: input.threadId ?? null,
      dueDate: input.dueDate ? keyToDate(input.dueDate) : null,
      source: input.source ?? "manual",
    },
    include: taskInclude,
  });
}

export async function updateTask(id: string, patch: Partial<TaskInput> & { status?: "OPEN" | "DONE" | "CANCELLED" }) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k === "dueDate") data.dueDate = v ? keyToDate(v as string) : null;
    else data[k] = v;
  }
  if (patch.status === "DONE") data.doneAt = new Date();
  if (patch.status === "OPEN") data.doneAt = null;
  return db.task.update({ where: { id }, data, include: taskInclude });
}

export async function completeTask(id: string, done = true) {
  return db.task.update({
    where: { id },
    data: done ? { status: "DONE", doneAt: new Date() } : { status: "OPEN", doneAt: null },
    include: taskInclude,
  });
}

export async function snoozeTask(id: string, days = 1) {
  const today = todayKey(await getTz());
  const until = keyToDate(addDays(today, days));
  return db.task.update({ where: { id }, data: { snoozedUntil: until, dueDate: until } });
}

export async function deleteTask(id: string) {
  return db.task.delete({ where: { id } });
}

/** Park a task: it leaves the task list and goes to the Parking Lot. */
export async function parkTask(id: string) {
  const t = await db.task.findUniqueOrThrow({ where: { id } });
  await db.$transaction([
    db.parkingItem.create({ data: { text: t.title + (t.notes ? ` — ${t.notes}` : ""), source: "task" } }),
    db.task.update({ where: { id }, data: { status: "CANCELLED" } }),
  ]);
  return { ok: true };
}
