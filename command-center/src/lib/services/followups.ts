import { db } from "../db";
import { getTz } from "../settings";
import { keyToDate, todayKey, resolveDateWord } from "../time";
import { findPersonByName } from "./people";

const include = {
  person: { select: { id: true, name: true } },
  task: { select: { id: true, title: true, status: true } },
  goal: { select: { id: true, title: true } },
  pipelineCard: { select: { id: true, company: true } },
  thread: { select: { id: true, subject: true, channel: true } },
  touches: { orderBy: { at: "desc" as const } },
} as const;

export async function listFollowUps(filter: { status?: "OPEN" | "DONE" | "ALL"; personId?: string } = {}) {
  return db.followUp.findMany({
    where: {
      ...(filter.status === "ALL" ? {} : { status: filter.status ?? "OPEN" }),
      ...(filter.personId ? { personId: filter.personId } : {}),
    },
    include,
    orderBy: [{ dueDate: "asc" }],
    take: 300,
  });
}

export type FollowUpInput = {
  title: string;
  dueDate: string; // YYYY-MM-DD or weekday word
  personId?: string | null;
  personName?: string | null;
  notes?: string;
  taskId?: string | null;
  goalId?: string | null;
  pipelineCardId?: string | null;
  threadId?: string | null;
};

export async function createFollowUp(input: FollowUpInput) {
  const today = todayKey(await getTz());
  const due = resolveDateWord(input.dueDate, today) ?? today;
  let personId = input.personId ?? null;
  if (!personId && input.personName) personId = (await findPersonByName(input.personName, true))?.id ?? null;
  return db.followUp.create({
    data: {
      title: input.title.trim(),
      dueDate: keyToDate(due),
      personId,
      notes: input.notes ?? "",
      taskId: input.taskId ?? null,
      goalId: input.goalId ?? null,
      pipelineCardId: input.pipelineCardId ?? null,
      threadId: input.threadId ?? null,
    },
    include,
  });
}

export async function updateFollowUp(id: string, patch: Partial<FollowUpInput> & { status?: "OPEN" | "DONE" | "CANCELLED" }) {
  const today = todayKey(await getTz());
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || k === "personName") continue;
    if (k === "dueDate") data.dueDate = keyToDate(resolveDateWord(v as string, today) ?? today);
    else data[k] = v;
  }
  if (patch.status === "DONE") data.doneAt = new Date();
  if (patch.status === "OPEN") data.doneAt = null;
  return db.followUp.update({ where: { id }, data, include });
}

export async function completeFollowUp(id: string, done = true, note?: string) {
  if (note) await db.touch.create({ data: { followUpId: id, note, channel: "note" } });
  return db.followUp.update({
    where: { id },
    data: done ? { status: "DONE", doneAt: new Date() } : { status: "OPEN", doneAt: null },
    include,
  });
}

export async function logTouch(followUpId: string, note: string, channel = "note", nextDate?: string) {
  const touch = await db.touch.create({ data: { followUpId, note, channel } });
  if (nextDate) {
    const today = todayKey(await getTz());
    const due = resolveDateWord(nextDate, today);
    if (due) await db.followUp.update({ where: { id: followUpId }, data: { dueDate: keyToDate(due) } });
  }
  return touch;
}

/** Delegate a task to a person and set a follow-up date. */
export async function delegateTask(taskId: string, input: { personId?: string; personName?: string; followUpDate: string; note?: string }) {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  let personId = input.personId ?? null;
  if (!personId && input.personName) personId = (await findPersonByName(input.personName, true))?.id ?? null;
  if (!personId) throw new Error("Pick someone to delegate to.");
  await db.task.update({ where: { id: taskId }, data: { ownerId: personId } });
  return createFollowUp({
    title: task.title,
    dueDate: input.followUpDate,
    personId,
    taskId,
    goalId: task.goalId,
    notes: input.note ?? "",
  });
}

export async function deleteFollowUp(id: string) {
  return db.followUp.delete({ where: { id } });
}
