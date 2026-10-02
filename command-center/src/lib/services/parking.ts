import { db } from "../db";
import { keyToDate } from "../time";
import { createTask } from "./tasks";

export async function listParking(status: "OPEN" | "ALL" = "OPEN") {
  return db.parkingItem.findMany({
    where: status === "OPEN" ? { status: "OPEN" } : { status: { not: "DELETED" } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export async function park(text: string, source = "typed") {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  const items = [];
  for (const line of lines) items.push(await db.parkingItem.create({ data: { text: line, source } }));
  return items;
}

export async function triageParking(
  id: string,
  action: "promote" | "schedule" | "delete" | "reopen",
  opts: { goalId?: string | null; dueDate?: string | null; date?: string; title?: string } = {},
) {
  const item = await db.parkingItem.findUniqueOrThrow({ where: { id } });
  if (action === "delete") return db.parkingItem.update({ where: { id }, data: { status: "DELETED" } });
  if (action === "reopen") return db.parkingItem.update({ where: { id }, data: { status: "OPEN", scheduledFor: null } });
  if (action === "schedule") {
    // Scheduled = parked with a date; it re-surfaces in the Parking Lot on that day.
    return db.parkingItem.update({
      where: { id },
      data: { status: "SCHEDULED", scheduledFor: opts.date ? keyToDate(opts.date) : null },
    });
  }
  const task = await createTask({
    title: opts.title ?? item.text,
    goalId: opts.goalId ?? null,
    dueDate: opts.dueDate ?? null,
    source: "parking",
  });
  return db.parkingItem.update({ where: { id }, data: { status: "PROMOTED", taskId: task.id } });
}

/** Scheduled items whose date has arrived go back to OPEN. */
export async function resurfaceScheduled(todayKey: string) {
  await db.parkingItem.updateMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: keyToDate(todayKey) } },
    data: { status: "OPEN" },
  });
}

export async function updateParking(id: string, text: string) {
  return db.parkingItem.update({ where: { id }, data: { text } });
}
