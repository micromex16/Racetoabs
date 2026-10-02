import { type NextRequest } from "next/server";
import { runAgent, type AgentEvent } from "@/lib/agent/run";
import { agentConfigured } from "@/lib/agent/client";
import "@/lib/integrations/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { message, conversationId } = await req.json().catch(() => ({}));
  if (!message || typeof message !== "string") return Response.json({ error: "message required" }, { status: 400 });
  if (!agentConfigured()) return Response.json({ error: "The agent needs ANTHROPIC_API_KEY. Add it in your environment variables and redeploy." }, { status: 503 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        for await (const e of runAgent({ message, conversationId })) send(e);
      } catch (e) {
        console.error("[agent]", e);
        send({ type: "error", message: (e as Error).message || "Agent error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
