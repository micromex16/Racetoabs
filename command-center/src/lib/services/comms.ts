import { db } from "../db";
import type { Channel } from "@prisma/client";

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
  return { counts, top, connected: integrations.filter((i) => i.status === "connected").map((i) => i.provider) };
}
