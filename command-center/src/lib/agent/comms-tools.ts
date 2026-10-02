import { z } from "zod";
import { db } from "../db";
import * as comms from "../services/comms";
import { linkThread } from "../services/pipeline";
import { summarizeThread, draftReply, rankInbox } from "./comms";
import { tool, type AnyTool } from "./tools";

// Comms tools. The agent can read, summarize, rank, link and DRAFT. There is no
// send tool — every outbound message waits for the president's Approve & send.

const channel = z.enum(["EMAIL", "SLACK", "WHATSAPP"]);

export const COMMS_TOOLS = [
  tool({
    name: "list_inbox",
    description: "Recent conversations across Email, Slack and WhatsApp with unread state, importance rank, one-line summary and linked pipeline account. filter: ranked (most important first), unread, all, linked (to pipeline).",
    schema: z.object({ channel: channel.optional(), filter: z.enum(["ranked", "unread", "all", "linked"]).optional(), query: z.string().optional() }),
    label: () => "Read inbox",
    run: async (i) =>
      (await comms.listThreads({ channel: i.channel, q: i.query, filter: i.filter === "ranked" ? "important" : (i.filter as "unread" | "all" | "linked" | undefined), limit: 40 })).map((t) => ({
        id: t.id,
        channel: t.channel,
        subject: t.subject,
        with: (t.participants as { name?: string; address: string }[]).map((p) => p.name || p.address).slice(0, 4),
        last_at: t.lastMessageAt.toISOString().slice(0, 16),
        unread: t.unread,
        rank: t.aiRank,
        why: t.aiRankReason,
        summary: t.aiSummary ?? t.snippet,
        account: t.pipelineCard?.company,
        pending_drafts: t._count.drafts,
      })),
  }),
  tool({
    name: "get_thread",
    description: "Read a full conversation (messages oldest → newest), plus linked account, open follow-ups/tasks and pending drafts.",
    schema: z.object({ thread_id: z.string() }),
    label: () => "Read a thread",
    run: async (i) => {
      const t = await comms.getThread(i.thread_id);
      return {
        id: t.id,
        channel: t.channel,
        subject: t.subject,
        participants: t.participants,
        account: t.pipelineCard,
        followups: t.followUps.map((f) => `${f.person?.name}: ${f.title}`),
        tasks: t.tasks.map((x) => x.title),
        pending_drafts: t.drafts.map((d) => ({ id: d.id, body: d.body })),
        messages: t.messages.slice(-30).map((m) => ({ from: m.isFromMe ? "ME" : m.fromName || m.fromAddr, at: m.sentAt.toISOString().slice(0, 16), text: m.body.slice(0, 4000) })),
      };
    },
  }),
  tool({
    name: "search_messages",
    description: "Full-text search over stored Email/Slack/WhatsApp messages (sender, subject, body).",
    schema: z.object({ query: z.string(), channel: channel.optional() }),
    label: (i) => `Searched messages “${i.query}”`,
    run: async (i) => {
      const ci = { contains: i.query, mode: "insensitive" as const };
      const msgs = await db.message.findMany({
        where: { ...(i.channel ? { channel: i.channel } : {}), OR: [{ body: ci }, { fromName: ci }, { fromAddr: ci }, { thread: { subject: ci } }] },
        orderBy: { sentAt: "desc" },
        take: 25,
        include: { thread: { select: { id: true, subject: true } } },
      });
      return msgs.map((m) => ({ thread_id: m.thread.id, subject: m.thread.subject, channel: m.channel, from: m.isFromMe ? "ME" : m.fromName, at: m.sentAt.toISOString().slice(0, 16), excerpt: m.body.slice(0, 300) }));
    },
  }),
  tool({
    name: "summarize_thread",
    description: "Write (and save) a short summary of a conversation: what it's about, what's asked of the president, any deadline.",
    schema: z.object({ thread_id: z.string() }),
    writes: true,
    label: () => "Summarized a thread",
    run: async (i) => summarizeThread(i.thread_id),
  }),
  tool({
    name: "rank_inbox",
    description: "Re-rank the open inbox (last 10 days) by importance to the president's rocks and write one-line summaries. Use for 'what's important in my inbox' or each morning.",
    schema: z.object({}),
    writes: true,
    label: () => "Ranked the inbox",
    run: async () => rankInbox(),
  }),
  tool({
    name: "draft_reply",
    description: "Draft a reply on a conversation in the president's voice. Saved as a PENDING draft for approval — it is NOT sent. Pass the president's instructions if they gave any.",
    schema: z.object({ thread_id: z.string(), instructions: z.string().optional() }),
    writes: true,
    label: () => "Drafted a reply (awaiting approval)",
    run: async (i) => {
      const d = await draftReply(i.thread_id, i.instructions);
      return { draft_id: d.id, to: d.to, body: d.body, status: "PENDING — the president must approve & send in Comms" };
    },
  }),
  tool({
    name: "draft_message",
    description: "Draft a NEW message (not a reply) on Email, Slack or WhatsApp. Saved as PENDING for approval — never sent by you. Email needs a subject.",
    schema: z.object({ channel, to: z.string().describe("email address, Slack channel/user id, or WhatsApp number"), subject: z.string().optional(), body: z.string() }),
    writes: true,
    label: (i) => `Drafted a message to ${i.to} (awaiting approval)`,
    run: async (i) => {
      const d = await comms.createDraft({ channel: i.channel, to: i.to, subject: i.subject, body: i.body, createdBy: "agent" });
      return { draft_id: d.id, status: "PENDING — awaiting approval" };
    },
  }),
  tool({
    name: "link_thread_to_card",
    description: "Link a conversation to a pipeline account (or unlink with card_id null).",
    schema: z.object({ thread_id: z.string(), card_id: z.string().nullable() }),
    writes: true,
    label: () => "Linked thread to pipeline",
    run: async (i) => linkThread(i.card_id, i.thread_id),
  }),
  tool({
    name: "archive_thread",
    description: "Archive a conversation (marks done here and archives in Gmail). Only when the president asks or confirms.",
    schema: z.object({ thread_id: z.string() }),
    writes: true,
    label: () => "Archived a thread",
    run: async (i) => comms.archiveThread(i.thread_id, true),
  }),
] as AnyTool[];
