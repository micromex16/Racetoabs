import Anthropic from "@anthropic-ai/sdk";

export const AGENT_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
// Server-side refusal fallbacks: on a policy decline the API re-runs the request on
// Anthropic's recommended fallback model inside the same call.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
export function agentConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
export function anthropic() {
  if (!agentConfigured()) throw new Error("ANTHROPIC_API_KEY is not set — add it in Vercel → Settings → Environment Variables.");
  client ??= new Anthropic();
  return client;
}
