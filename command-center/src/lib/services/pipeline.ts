import { db } from "../db";
import type { Lane, PipelineStage, Prisma } from "@prisma/client";
import { getTz } from "../settings";
import { keyToDate, todayKey, weekStartKey, addDays, resolveDateWord } from "../time";

export const STAGES: PipelineStage[] = ["TARGET", "CONTACTED", "SAMPLE_SENT", "DISCOVERY", "RFQ", "QUOTED", "PILOT", "CUSTOMER"];
export const STAGE_LABEL: Record<PipelineStage, string> = {
  TARGET: "Target",
  CONTACTED: "Contacted",
  SAMPLE_SENT: "Sample Sent",
  DISCOVERY: "Discovery",
  RFQ: "RFQ",
  QUOTED: "Quoted",
  PILOT: "Pilot",
  CUSTOMER: "Customer",
};
export const LANE_LABEL: Record<Lane, string> = { DATA_CENTER: "Data Center", AD: "A&D", OTHER: "Other" };

const include = {
  contacts: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] as Prisma.PipelineContactOrderByWithRelationInput[] },
  goal: { select: { id: true, title: true } },
  threads: { select: { id: true, subject: true, channel: true, lastMessageAt: true, snippet: true }, orderBy: { lastMessageAt: "desc" as const }, take: 20 },
  followUps: { where: { status: "OPEN" as const }, include: { person: { select: { name: true } } } },
} satisfies Prisma.PipelineCardInclude;

export async function listPipeline(filter: { lane?: Lane; q?: string; includeArchived?: boolean } = {}) {
  return db.pipelineCard.findMany({
    where: {
      ...(filter.includeArchived ? {} : { archivedAt: null }),
      ...(filter.lane ? { lane: filter.lane } : {}),
      ...(filter.q
        ? {
            OR: [
              { company: { contains: filter.q, mode: "insensitive" as const } },
              { contacts: { some: { name: { contains: filter.q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    include,
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getCard(id: string) {
  return db.pipelineCard.findUniqueOrThrow({
    where: { id },
    include: { ...include, events: { orderBy: { at: "desc" } } },
  });
}

export type ContactInput = { id?: string; name: string; title?: string; email?: string | null; phone?: string | null; linkedin?: string | null; isPrimary?: boolean };
export type CardInput = {
  company: string;
  lane?: Lane;
  stage?: PipelineStage;
  tier?: string;
  nextAction?: string;
  nextActionDate?: string | null;
  notes?: string;
  website?: string;
  goalId?: string | null;
  contacts?: ContactInput[];
};

export async function createCard(input: CardInput) {
  const today = todayKey(await getTz());
  const stage = input.stage ?? "TARGET";
  const count = await db.pipelineCard.count({ where: { stage } });
  return db.pipelineCard.create({
    data: {
      company: input.company.trim(),
      lane: input.lane ?? "OTHER",
      stage,
      tier: input.tier ?? "",
      nextAction: input.nextAction ?? "",
      nextActionDate: input.nextActionDate ? keyToDate(resolveDateWord(input.nextActionDate, today) ?? input.nextActionDate) : null,
      notes: input.notes ?? "",
      website: input.website ?? "",
      goalId: input.goalId ?? null,
      sortOrder: count,
      wonAt: stage === "CUSTOMER" ? new Date() : null,
      contacts: input.contacts?.length
        ? { create: input.contacts.map((c, i) => ({ name: c.name, title: c.title ?? "", email: c.email ?? null, phone: c.phone ?? null, linkedin: c.linkedin ?? null, isPrimary: c.isPrimary ?? i === 0, sortOrder: i })) }
        : undefined,
      events: { create: { toStage: stage } },
    },
    include,
  });
}

export async function updateCard(id: string, patch: Partial<CardInput>) {
  const today = todayKey(await getTz());
  const { contacts, stage, ...rest } = patch;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if (k === "nextActionDate") data.nextActionDate = v ? keyToDate(resolveDateWord(v as string, today) ?? (v as string)) : null;
    else data[k] = v;
  }
  if (stage) await moveStage(id, stage);
  if (contacts) {
    const keep = contacts.filter((c) => c.id).map((c) => c.id!);
    await db.pipelineContact.deleteMany({ where: { cardId: id, id: { notIn: keep } } });
    for (const [i, c] of contacts.entries()) {
      const d = { name: c.name, title: c.title ?? "", email: c.email ?? null, phone: c.phone ?? null, linkedin: c.linkedin ?? null, isPrimary: c.isPrimary ?? i === 0, sortOrder: i };
      if (c.id) await db.pipelineContact.update({ where: { id: c.id }, data: d });
      else await db.pipelineContact.create({ data: { ...d, cardId: id } });
    }
  }
  return db.pipelineCard.update({ where: { id }, data, include });
}

export async function moveStage(id: string, stage: PipelineStage, index?: number) {
  const card = await db.pipelineCard.findUniqueOrThrow({ where: { id } });
  if (card.stage !== stage) {
    await db.pipelineCard.update({
      where: { id },
      data: {
        stage,
        stageChangedAt: new Date(),
        wonAt: stage === "CUSTOMER" ? (card.wonAt ?? new Date()) : null,
        events: { create: { fromStage: card.stage, toStage: stage } },
      },
    });
  }
  if (index != null) {
    const col = await db.pipelineCard.findMany({ where: { stage, archivedAt: null, id: { not: id } }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    const ids = col.map((c) => c.id);
    ids.splice(Math.max(0, Math.min(index, ids.length)), 0, id);
    await db.$transaction(ids.map((cid, i) => db.pipelineCard.update({ where: { id: cid }, data: { sortOrder: i } })));
  }
  return db.pipelineCard.findUniqueOrThrow({ where: { id }, include });
}

export async function archiveCard(id: string, archived = true) {
  return db.pipelineCard.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
}

export async function deleteCard(id: string) {
  return db.pipelineCard.delete({ where: { id } });
}

/** Plain-language rollup for "where are we on data center?" */
export async function pipelineSummary(lane?: Lane) {
  const today = todayKey(await getTz());
  const cards = await db.pipelineCard.findMany({
    where: { archivedAt: null, ...(lane ? { lane } : {}) },
    include: { contacts: true },
    orderBy: { stageChangedAt: "desc" },
  });
  const byStage = Object.fromEntries(STAGES.map((s) => [s, cards.filter((c) => c.stage === s).length]));
  const weekAgo = keyToDate(addDays(today, -7));
  const moved = await db.pipelineEvent.findMany({
    where: { at: { gte: weekAgo }, fromStage: { not: null }, card: lane ? { lane } : undefined },
    include: { card: { select: { company: true } } },
    orderBy: { at: "desc" },
  });
  const ws = keyToDate(weekStartKey(today));
  const dueActions = cards
    .filter((c) => c.nextActionDate && c.nextActionDate <= keyToDate(addDays(today, 7)))
    .map((c) => ({ company: c.company, stage: c.stage, nextAction: c.nextAction, date: c.nextActionDate!.toISOString().slice(0, 10), overdue: c.nextActionDate! < keyToDate(today) }));
  return {
    lane: lane ? LANE_LABEL[lane] : "All lanes",
    total: cards.length,
    byStage,
    advancedThisWeek: moved.filter((m) => m.at >= ws).length,
    recentMoves: moved.slice(0, 15).map((m) => ({ company: m.card.company, from: m.fromStage, to: m.toStage, at: m.at.toISOString().slice(0, 10) })),
    withoutNextAction: cards.filter((c) => !c.nextAction && c.stage !== "CUSTOMER").map((c) => c.company).slice(0, 25),
    under3Contacts: cards.filter((c) => c.contacts.length < 3).length,
    dueActions,
    lateStage: cards.filter((c) => ["RFQ", "QUOTED", "PILOT"].includes(c.stage)).map((c) => ({ company: c.company, stage: c.stage, nextAction: c.nextAction })),
  };
}
