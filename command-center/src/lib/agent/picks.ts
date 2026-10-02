import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, agentConfigured, AGENT_MODEL, FALLBACK_BETA } from "./client";
import { liveContext } from "./prompt";
import { generateCandidates, ensurePlan, setPicks, type Pick } from "../services/daily";
import { scrubMoney } from "../guard";

const PickSchema = z.object({
  picks: z
    .array(z.object({ kind: z.enum(["task", "followup", "pipeline"]), ref_id: z.string(), reason: z.string() }))
    .describe("Exactly 3 picks (fewer only if fewer candidates exist), most important first."),
});

/** The agent chooses today's 3 from the scored candidates and writes the reasons.
 *  Falls back silently to the heuristic picks if the API isn't configured or fails. */
export async function agentRepick(today: string) {
  if (!agentConfigured()) return { pickedBy: "heuristic" as const, reason: "agent not configured" };
  const cands = (await generateCandidates(today)).slice(0, 15);
  if (cands.length === 0) return { pickedBy: "heuristic" as const, reason: "no candidates" };
  await ensurePlan(today);
  const ctx = await liveContext();
  const list = cands.map((c) => ({ kind: c.kind, ref_id: c.refId, title: c.title, due: c.due, heuristic_score: c.score, heuristic_reason: c.reason }));
  const res = await anthropic().beta.messages.parse({
    model: AGENT_MODEL,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(PickSchema) },
    system:
      "You pick the president's 3 most important things for today from a candidate list, judged ONLY against their own rocks and goals. Prefer work on rocks that are behind pace or due soon, overdue items, and late-stage pipeline. Each reason is one sentence, concrete, and cites the rock number, its % and days left when relevant (e.g. 'Rock #2 is 40% and due in 9 days; this unblocks kit mailing.'). Never mention financial figures.",
    messages: [{ role: "user", content: `${ctx}\n\nToday: ${today}\nCandidates:\n${JSON.stringify(list, null, 1)}` }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return { pickedBy: "heuristic" as const, reason: "no parsed output" };
  const picks: Pick[] = [];
  for (const p of res.parsed_output.picks.slice(0, 3)) {
    const c = cands.find((x) => x.kind === p.kind && x.refId === p.ref_id);
    if (c && !picks.some((x) => x.refId === c.refId)) picks.push({ ...c, reason: scrubMoney(p.reason) });
  }
  if (!picks.length) return { pickedBy: "heuristic" as const, reason: "picks not in candidates" };
  await setPicks(today, picks, "agent");
  return { pickedBy: "agent" as const, picks: picks.length };
}
