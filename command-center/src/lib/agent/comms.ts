import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "../db";
import { anthropic, AGENT_MODEL, FALLBACK_BETA } from "./client";
import { liveContext } from "./prompt";
import { scrubMoney } from "../guard";
import { createDraft } from "../services/comms";

function transcript(messages: { fromName: string; fromAddr: string; isFromMe: boolean; sentAt: Date; body: string }[], max = 24_000) {
  let s = messages.map((m) => `[${m.sentAt.toISOString().slice(0, 16).replace("T", " ")}] ${m.isFromMe ? "ME" : m.fromName || m.fromAddr}: ${m.body}`).join("\n\n");
  if (s.length > max) s = "…" + s.slice(-max);
  return s;
}

const NO_MONEY = "Never include financial figures (prices, amounts, revenue, margins, costs); refer to them as [amount] if essential.";

/** One-paragraph summary of a thread, cached on the thread. */
export async function summarizeThread(threadId: string) {
  const t = await db.thread.findUniqueOrThrow({ where: { id: threadId }, include: { messages: { orderBy: { sentAt: "asc" } }, pipelineCard: true } });
  const res = await anthropic().beta.messages.create({
    model: AGENT_MODEL,
    max_tokens: 2000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: `Summarize a ${t.channel.toLowerCase()} thread for a busy CEO reading on a phone: 2–4 short sentences — what it's about, what's being asked of the CEO, any deadline. End with "Ask: …" if a reply is needed. ${NO_MONEY}`,
    messages: [{ role: "user", content: `Subject: ${t.subject}\n${t.pipelineCard ? `Pipeline account: ${t.pipelineCard.company} (${t.pipelineCard.stage})\n` : ""}\n${transcript(t.messages)}` }],
  });
  const text = scrubMoney(res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim());
  await db.thread.update({ where: { id: threadId }, data: { aiSummary: text } });
  return { summary: text };
}

/** Agent drafts a reply. It is saved as a PENDING draft — never sent. */
export async function draftReply(threadId: string, instructions?: string) {
  const t = await db.thread.findUniqueOrThrow({ where: { id: threadId }, include: { messages: { orderBy: { sentAt: "asc" } }, pipelineCard: true } });
  const ctx = await liveContext();
  const Out = z.object({ body: z.string().describe("The reply text only, ready to send, in the thread's language."), rationale: z.string().describe("One line: why this reply, tied to the CEO's rocks if relevant.") });
  const res = await anthropic().beta.messages.parse({
    model: AGENT_MODEL,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Out) },
    system: `You draft replies for the president of Micromex (nearshore contract manufacturer, Imuris, Sonora + Tucson, AZ). Write as the president: direct, warm, brief. ${t.channel === "EMAIL" ? "Email: no subject line, short paragraphs, sign off with first name only if the thread does." : "Chat: one or two short messages' worth, no sign-off."} Reply in the same language as the last inbound message (English or Spanish). Don't commit to prices, dates or volumes that aren't already in the thread. ${NO_MONEY}\n\n${ctx}`,
    messages: [{ role: "user", content: `Thread (${t.channel}) — subject: ${t.subject}\n${t.pipelineCard ? `Pipeline account: ${t.pipelineCard.company}, stage ${t.pipelineCard.stage}\n` : ""}\n${transcript(t.messages)}\n\n${instructions ? `President's instructions for the reply: ${instructions}` : "Draft the best next reply."}` }],
  });
  if (!res.parsed_output) throw new Error("The agent couldn't draft a reply for this thread.");
  return createDraft({ threadId, body: res.parsed_output.body, createdBy: "agent", rationale: scrubMoney(res.parsed_output.rationale) });
}

const RankSchema = z.object({
  threads: z.array(
    z.object({
      id: z.string(),
      score: z.number().min(0).max(100).describe("Importance to the CEO's rocks and relationships today, 0–100"),
      reason: z.string().describe("Few words: why it matters, e.g. 'Rock #5: RFQ from Helios'"),
      summary: z.string().describe("One line, ≤ 20 words: what it is and what's asked"),
    }),
  ),
});

/** Agent ranks the open inbox against the CEO's rocks and writes one-line summaries. */
export async function rankInbox(limit = 40) {
  const threads = await db.thread.findMany({
    where: { archived: false, lastMessageAt: { gte: new Date(Date.now() - 10 * 86_400_000) } },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    include: { messages: { orderBy: { sentAt: "desc" }, take: 3 }, pipelineCard: { select: { company: true, stage: true } } },
  });
  if (!threads.length) return { ranked: 0 };
  const ctx = await liveContext();
  const items = threads.map((t) => ({
    id: t.id,
    channel: t.channel,
    subject: t.subject,
    from: t.messages.find((m) => !m.isFromMe)?.fromName ?? "",
    unread: t.unread,
    account: t.pipelineCard ? `${t.pipelineCard.company} (${t.pipelineCard.stage})` : undefined,
    last_messages: t.messages.map((m) => `${m.isFromMe ? "ME" : m.fromName}: ${m.body.slice(0, 600)}`).reverse(),
  }));
  const res = await anthropic().beta.messages.parse({
    model: AGENT_MODEL,
    max_tokens: 8000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(RankSchema) },
    system: `You triage the president's inbox (email, Slack, WhatsApp). Score each thread 0–100 by how much it matters to their own rocks and goals today: customers and pipeline accounts, people they delegate to, anything blocking a rock, explicit asks and deadlines score high; newsletters, FYIs and automated mail score low. ${NO_MONEY}\n\n${ctx}`,
    messages: [{ role: "user", content: JSON.stringify(items) }],
  });
  if (!res.parsed_output) return { ranked: 0 };
  let ranked = 0;
  for (const r of res.parsed_output.threads) {
    if (!threads.some((t) => t.id === r.id)) continue;
    await db.thread.update({ where: { id: r.id }, data: { aiRank: r.score, aiRankReason: scrubMoney(r.reason), aiSummary: scrubMoney(r.summary), rankedAt: new Date() } });
    ranked++;
  }
  return { ranked };
}
