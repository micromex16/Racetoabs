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
