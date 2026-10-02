import { db } from "../db";
import type { Channel, Prisma } from "@prisma/client";

export type IngestMessage = {
  externalId: string;
  fromName: string;
  fromAddr: string;
  to?: { name?: string; address: string }[];
  body: string;
  sentAt: Date;
  isFromMe: boolean;
  meta?: Prisma.InputJsonValue;
};

export type IngestThread = {
  channel: Channel;
  externalId: string;
  subject?: string;
  participants?: { name?: string; address: string }[];
  unread?: boolean;
  unreadCount?: number;
  archived?: boolean;
  meta?: Prisma.InputJsonValue;
  messages: IngestMessage[];
};

/** Upsert a thread and its messages. Shared by cron syncs and webhooks. */
export async function ingestThread(t: IngestThread) {
  const latest = t.messages.reduce<IngestMessage | null>((a, m) => (!a || m.sentAt > a.sentAt ? m : a), null);
  const thread = await db.thread.upsert({
    where: { channel_externalId: { channel: t.channel, externalId: t.externalId } },
    create: {
      channel: t.channel,
      externalId: t.externalId,
      subject: t.subject ?? "",
      participants: (t.participants ?? []) as Prisma.InputJsonValue,
      unread: t.unread ?? false,
      unreadCount: t.unreadCount ?? (t.unread ? 1 : 0),
      archived: t.archived ?? false,
      meta: t.meta ?? {},
      snippet: latest ? snippetOf(latest.body) : "",
      lastMessageAt: latest?.sentAt ?? new Date(),
    },
    update: {
      ...(t.subject !== undefined ? { subject: t.subject } : {}),
      ...(t.participants ? { participants: t.participants as Prisma.InputJsonValue } : {}),
      ...(t.unread !== undefined ? { unread: t.unread } : {}),
      ...(t.unreadCount !== undefined ? { unreadCount: t.unreadCount } : {}),
      ...(t.archived !== undefined ? { archived: t.archived } : {}),
      ...(t.meta !== undefined ? { meta: t.meta } : {}),
    },
  });
  let added = 0;
  for (const m of t.messages) {
    const exists = await db.message.findUnique({ where: { channel_externalId: { channel: t.channel, externalId: m.externalId } }, select: { id: true } });
    if (exists) continue;
    await db.message.create({
      data: {
        channel: t.channel,
        externalId: m.externalId,
        threadId: thread.id,
        fromName: m.fromName,
        fromAddr: m.fromAddr,
        to: (m.to ?? []) as Prisma.InputJsonValue,
        body: m.body,
        sentAt: m.sentAt,
        isFromMe: m.isFromMe,
        meta: m.meta ?? {},
      },
    });
    added++;
  }
  if (added) {
    const last = await db.message.findFirst({ where: { threadId: thread.id }, orderBy: { sentAt: "desc" } });
    if (last) {
      // New inbound activity invalidates the AI summary/rank.
      const inbound = t.messages.some((m) => !m.isFromMe);
      await db.thread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: last.sentAt,
          snippet: snippetOf(last.body),
          ...(inbound ? { aiSummary: null, rankedAt: null, archived: false } : {}),
        },
      });
    }
  }
  return { thread, added };
}

export function snippetOf(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 180);
}

/** Very small HTML → text for email bodies. */
export function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strip quoted replies ("On … wrote:", "> …") so threads read cleanly. */
export function stripQuoted(text: string) {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if (/^On .+wrote:$/.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim()) || /^From: .+/.test(l.trim()) && out.length > 3) break;
    if (l.startsWith(">")) continue;
    out.push(l);
  }
  return out.join("\n").trim();
}
