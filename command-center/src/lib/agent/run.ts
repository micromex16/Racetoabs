import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { anthropic, AGENT_MODEL, FALLBACK_BETA } from "./client";
import { STATIC_PROMPT, liveContext } from "./prompt";
import { INTERNAL_TOOLS, toAnthropicTools, toolContext, type AnyTool } from "./tools";
import { scrubMoney } from "../guard";

export type AgentEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string }
  | { type: "tool_end"; id: string; name: string; label: string; ok: boolean; error?: string }
  | { type: "done"; refresh: boolean }
  | { type: "error"; message: string };

const MAX_STEPS = 16;
const MAX_RESULT_CHARS = 40_000;

let extraTools: AnyTool[] = [];
/** Comms adapters add their tools here (draft_reply, summarize_thread, …). */
export function registerAgentTools(list: AnyTool[]) {
  const names = new Set(list.map((t) => t.name));
  extraTools = [...extraTools.filter((t) => !names.has(t.name)), ...list];
}
export function allTools(): AnyTool[] {
  return [...INTERNAL_TOOLS, ...extraTools] as AnyTool[];
}

type ToolLog = { name: string; label: string; ok: boolean; error?: string };

export async function* runAgent(opts: { conversationId?: string | null; message: string }): AsyncGenerator<AgentEvent> {
  const client = anthropic();
  let convo = opts.conversationId ? await db.agentConversation.findUnique({ where: { id: opts.conversationId } }) : null;
  convo ??= await db.agentConversation.create({ data: { title: opts.message.slice(0, 70) } });
  yield { type: "conversation", id: convo.id };

  const history = await db.agentMessage.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: "asc" } });
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content as never }));
  messages.push({ role: "user", content: opts.message });
  await db.agentMessage.create({ data: { conversationId: convo.id, role: "user", kind: "user", content: opts.message, display: opts.message } });

  const tools = allTools();
  const apiTools = toAnthropicTools(tools);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: STATIC_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: await liveContext() },
  ];
  const ctx = await toolContext();
  let refresh = false;
  const toolLog: ToolLog[] = [];
  let finalText = "";
  let jsonRetries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = client.beta.messages.stream({
      model: AGENT_MODEL,
      max_tokens: 32_000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system,
      tools: apiTools,
      messages,
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield { type: "text", delta: ev.delta.text };
        if (ev.type === "content_block_start" && ev.content_block.type === "tool_use") yield { type: "tool_start", id: ev.content_block.id, name: ev.content_block.name };
      }
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Eager tool-input streaming can surface unparseable JSON; retry that turn only.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue;
    }

    const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    if (text) finalText += (finalText ? "\n\n" : "") + text;
    messages.push({ role: "assistant", content: message.content as never });
    await db.agentMessage.create({
      data: { conversationId: convo.id, role: "assistant", kind: "assistant", content: message.content as never, display: scrubMoney(text) },
    });

    if (message.stop_reason === "refusal") {
      yield { type: "text", delta: "\n\nI can't help with that one." };
      break;
    }
    if (message.stop_reason === "pause_turn") continue;
    const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    // A tool input cut off at max_tokens can parse as a valid partial object — never run it.
    if (message.stop_reason === "max_tokens" && uses.length) throw new Error("A tool call was cut off (max_tokens). Try a narrower request.");
    if (message.stop_reason !== "tool_use" || uses.length === 0) break;

    const results = await Promise.all(
      uses.map(async (u): Promise<{ block: Anthropic.Beta.BetaToolResultBlockParam; log: ToolLog }> => {
        const t = tools.find((x) => x.name === u.name);
        if (!t) return { block: { type: "tool_result", tool_use_id: u.id, is_error: true, content: `Unknown tool ${u.name}` }, log: { name: u.name, label: u.name, ok: false, error: "unknown tool" } };
        const parsed = t.schema.safeParse(u.input);
        if (!parsed.success) {
          return {
            block: { type: "tool_result", tool_use_id: u.id, is_error: true, content: JSON.stringify({ INVALID_JSON: JSON.stringify(u.input), issues: parsed.error.issues.slice(0, 5) }) },
            log: { name: u.name, label: u.name, ok: false, error: "invalid input" },
          };
        }
        try {
          const out = await t.run(parsed.data, ctx);
          if (t.writes) refresh = true;
          let s = JSON.stringify(out ?? { ok: true });
          if (s.length > MAX_RESULT_CHARS) s = s.slice(0, MAX_RESULT_CHARS) + "…(truncated)";
          return { block: { type: "tool_result", tool_use_id: u.id, content: s }, log: { name: u.name, label: t.label(parsed.data), ok: true } };
        } catch (e) {
          const msg = (e as Error).message;
          return { block: { type: "tool_result", tool_use_id: u.id, is_error: true, content: msg }, log: { name: u.name, label: t.label(parsed.data), ok: false, error: msg } };
        }
      }),
    );
    for (const [i, r] of results.entries()) {
      toolLog.push(r.log);
      yield { type: "tool_end", id: uses[i].id, name: r.log.name, label: r.log.label, ok: r.log.ok, error: r.log.error };
    }
    const content = results.map((r) => r.block);
    messages.push({ role: "user", content });
    await db.agentMessage.create({ data: { conversationId: convo.id, role: "user", kind: "tool_results", content: content as never, toolLog: results.map((r) => r.log) as never } });
  }

  await db.agentConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
  yield { type: "done", refresh };
}

/** Conversation as the UI shows it: user bubbles, assistant text, tool chips. */
export async function conversationView(id: string) {
  const rows = await db.agentMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" } });
  const out: { id: string; role: "user" | "assistant"; text: string; tools: ToolLog[] }[] = [];
  for (const r of rows) {
    if (r.kind === "user") out.push({ id: r.id, role: "user", text: r.display, tools: [] });
    else if (r.kind === "assistant") {
      const last = out.at(-1);
      if (last?.role === "assistant") last.text += (last.text && r.display ? "\n\n" : "") + r.display;
      else out.push({ id: r.id, role: "assistant", text: r.display, tools: [] });
    } else {
      const last = out.at(-1);
      const logs = (r.toolLog as ToolLog[]) ?? [];
      if (last?.role === "assistant") last.tools.push(...logs);
      else out.push({ id: r.id, role: "assistant", text: "", tools: logs });
    }
  }
  return out;
}

export async function listConversations() {
  return db.agentConversation.findMany({ orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, updatedAt: true } });
}
