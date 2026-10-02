import { db } from "../db";
import type { Channel, Prisma } from "@prisma/client";
import { adapterForChannel } from "../integrations/registry";

/** Unread counts per channel + the 5 most important open threads. */
export async function inboxPulse() {
  const unread = await db.thread.groupBy({ by: ["channel"], where: { unread: true, archived: false }, _count: true });
  const counts: Record<Channel, number> = { EMAIL: 0, SLACK: 0, WHATSAPP: 0 };
  for (const u of unread) counts[u.channel] = u._count;
  const top = await db.thread.findMany({
    where: { archived: false, OR: [{ unread: true }, { aiRank: { gte: 60 } }] },
    orderBy: [{ aiRank: { sort: "desc", nulls: "last" } }, { lastMessageAt: "desc" }],
    take: 5,
    select: { id: true, channel: true, subject: true, snippet: true, aiSummary: true, aiRank: true, aiRankReason: true, lastMessageAt: true, participants: true, unread: true },
  });
  const integrations = await db.integration.findMany({ select: { provider: true, status: true } });
  const pendingDrafts = await db.draft.count({ where: { status: { in: ["PENDING", "FAILED"] } } });
  return { counts, top, pendingDrafts, connected: integrations.filter((i) => i.status === "connected").map((i) => i.provider) };
}

const threadSelect = {
  id: true,
  channel: true,
  subject: true,
  snippet: true,
  participants: true,
  lastMessageAt: true,
  unread: true,
  unreadCount: true,
  archived: true,
  aiSummary: true,
  aiRank: true,
  aiRankReason: true,
  pipelineCardId: true,
  pipelineCard: { select: { id: true, company: true } },
  meta: true,
  _count: { select: { drafts: { where: { status: "PENDING" as const } } } },
} satisfies Prisma.ThreadSelect;

export async function listThreads(f: { channel?: Channel; q?: string; filter?: "all" | "unread" | "important" | "linked" | "archived"; limit?: number } = {}) {
  const ci = f.q ? { contains: f.q, mode: "insensitive" as const } : undefined;
  return db.thread.findMany({
    where: {
      ...(f.channel ? { channel: f.channel } : {}),
      ...(f.filter === "archived" ? { archived: true } : { archived: false }),
      ...(f.filter === "unread" ? { unread: true } : {}),
      ...(f.filter === "important" ? { aiRank: { gte: 60 } } : {}),
      ...(f.filter === "linked" ? { pipelineCardId: { not: null } } : {}),
      ...(ci ? { OR: [{ subject: ci }, { snippet: ci }, { messages: { some: { body: ci } } }, { messages: { some: { fromName: ci } } }, { messages: { some: { fromAddr: ci } } }] } : {}),
    },
    orderBy: f.filter === "important" ? [{ aiRank: { sort: "desc", nulls: "last" } }, { lastMessageAt: "desc" }] : { lastMessageAt: "desc" },
    take: f.limit ?? 80,
    select: threadSelect,
  });
}

export async function getThread(id: string) {
  return db.thread.findUniqueOrThrow({
    where: { id },
    include: {
      messages: { orderBy: { sentAt: "asc" } },
      drafts: { where: { status: { in: ["PENDING", "FAILED"] } }, orderBy: { createdAt: "desc" } },
      pipelineCard: { select: { id: true, company: true, stage: true } },
      followUps: { where: { status: "OPEN" }, include: { person: { select: { name: true } } } },
      tasks: { where: { status: "OPEN" }, select: { id: true, title: true } },
    },
  });
}

export async function markThreadRead(id: string) {
  const t = await db.thread.update({ where: { id }, data: { unread: false, unreadCount: 0 } });
  await adapterForChannel(t.channel)?.markRead?.(t).catch((e) => console.error("[markRead]", e));
  return { ok: true };
}

export async function archiveThread(id: string, archived = true) {
  const t = await db.thread.update({ where: { id }, data: { archived, unread: archived ? false : undefined } });
  if (archived) await adapterForChannel(t.channel)?.archive?.(t).catch((e) => console.error("[archive]", e));
  return { ok: true };
}

// ───────── Drafts: every outbound message is a draft first ─────────

export async function listDrafts(status: "PENDING" | "ALL" = "PENDING") {
  return db.draft.findMany({
    where: status === "PENDING" ? { status: { in: ["PENDING", "FAILED"] } } : {},
    include: { thread: { select: { id: true, subject: true, channel: true, participants: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Default recipient for a reply on a thread. */
export async function defaultRecipient(threadId: string) {
  const t = await db.thread.findUniqueOrThrow({ where: { id: threadId }, include: { messages: { orderBy: { sentAt: "desc" }, take: 10 } } });
  const inbound = t.messages.find((m) => !m.isFromMe);
  if (t.channel === "SLACK") return ((t.meta as { channel?: string })?.channel ?? t.externalId) as string;
  if (t.channel === "WHATSAPP") return ((t.meta as { wa_id?: string })?.wa_id ?? t.externalId) as string;
  return inbound?.fromAddr ?? ((t.participants as { address: string }[])?.[0]?.address ?? "");
}

export async function createDraft(input: { threadId?: string | null; channel?: Channel; to?: string; subject?: string; body: string; createdBy?: "user" | "agent"; rationale?: string }) {
  let channel = input.channel;
  let to = input.to ?? "";
  if (input.threadId) {
    const t = await db.thread.findUniqueOrThrow({ where: { id: input.threadId } });
    channel ??= t.channel;
    if (!to) to = await defaultRecipient(t.id);
  }
  if (!channel) throw new Error("channel is required for a new message");
  if (!to) throw new Error("No recipient — pass `to`.");
  return db.draft.create({
    data: { threadId: input.threadId ?? null, channel, to, subject: input.subject ?? "", body: input.body, createdBy: input.createdBy ?? "user", rationale: input.rationale ?? "" },
  });
}

export async function updateDraft(id: string, patch: { to?: string; subject?: string; body?: string }) {
  return db.draft.update({ where: { id }, data: patch });
}

export async function discardDraft(id: string) {
  return db.draft.update({ where: { id }, data: { status: "DISCARDED" } });
}

/** Approve & send. Only ever called by an explicit user action in the UI. */
export async function sendDraft(id: string) {
  const d = await db.draft.findUniqueOrThrow({ where: { id }, include: { thread: true } });
  if (d.status === "SENT") return d;
  const adapter = adapterForChannel(d.channel);
  if (!adapter) throw new Error(`${d.channel} is not connected.`);
  try {
    const r = await adapter.send({ thread: d.thread, to: d.to, subject: d.subject, body: d.body });
    const sent = await db.draft.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), error: null } });
    // Keep the local thread complete even before the next sync.
    if (d.thread) {
      await db.message.upsert({
        where: { channel_externalId: { channel: d.channel, externalId: r.externalId } },
        create: { channel: d.channel, externalId: r.externalId, threadId: d.thread.id, fromName: "Me", fromAddr: "me", to: [{ address: d.to }], body: d.body, sentAt: new Date(), isFromMe: true },
        update: {},
      });
      await db.thread.update({ where: { id: d.thread.id }, data: { lastMessageAt: new Date(), snippet: d.body.slice(0, 180), unread: false, unreadCount: 0 } });
      // Log a touch on any open follow-up tied to this thread.
      const fus = await db.followUp.findMany({ where: { threadId: d.thread.id, status: "OPEN" } });
      for (const f of fus) await db.touch.create({ data: { followUpId: f.id, note: `Replied: ${d.body.slice(0, 120)}`, channel: d.channel.toLowerCase() } });
    }
    return sent;
  } catch (e) {
    await db.draft.update({ where: { id }, data: { status: "FAILED", error: (e as Error).message } });
    throw e;
  }
}

/** User typed a reply and pressed Send — that press is the approval. */
export async function replyNow(threadId: string, body: string) {
  const d = await createDraft({ threadId, body, createdBy: "user" });
  return sendDraft(d.id);
}

/** Heuristic importance when the agent hasn't ranked yet: unread, people you work with, pipeline contacts, recency. */
export async function heuristicRank() {
  const [people, contacts] = await Promise.all([
    db.person.findMany({ where: { archivedAt: null }, select: { email: true, slackId: true, whatsapp: true } }),
    db.pipelineContact.findMany({ select: { email: true, phone: true, card: { select: { stage: true } } } }),
  ]);
  const known = new Set([...people.flatMap((p) => [p.email, p.slackId, p.whatsapp]), ...contacts.flatMap((c) => [c.email, c.phone])].filter(Boolean).map((x) => x!.toLowerCase()));
  const threads = await db.thread.findMany({ where: { archived: false, rankedAt: null }, include: { messages: { orderBy: { sentAt: "desc" }, take: 1 } }, take: 200 });
  for (const t of threads) {
    const last = t.messages[0];
    const from = last?.fromAddr.toLowerCase() ?? "";
    let score = 30;
    if (t.unread) score += 20;
    if (known.has(from)) score += 25;
    if (t.pipelineCardId) score += 15;
    const hrs = (Date.now() - t.lastMessageAt.getTime()) / 3_600_000;
    score += hrs < 24 ? 10 : hrs < 72 ? 4 : -10;
    if (/no-?reply|newsletter|notifications?@/.test(from)) score -= 40;
    await db.thread.update({ where: { id: t.id }, data: { aiRank: Math.max(0, Math.min(100, score)), aiRankReason: "heuristic" } });
  }
}
