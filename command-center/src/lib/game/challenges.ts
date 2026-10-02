import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "../db";
import { getSettings } from "../settings";
import { addDays, keyToDate, localMinutes, todayKey, weekStartKey } from "../time";
import { loadGoalTree, currentQuarterRocks } from "../services/goals";
import { award, addUnlock, gameState, safely } from "./economy";
import { unlockAchievement } from "./hooks";
import { RARE_BLUEPRINTS, fmtClock, type ChallengeKind } from "./catalog";
import { agentConfigured, anthropic, AGENT_MODEL, FALLBACK_BETA } from "../agent/client";

// The weekly twist: one challenge a week, built from whichever of YOUR rocks needs it.
// Deadlines are local "YYYY-MM-DD HH:MM".

type Params = { metricKey?: string; metricName?: string; target?: number; by?: string; before?: number };
type Spec = { kind: ChallengeKind; title: string; description: string; params: Params; reward: number };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function deadline(weekStart: string, weekdayIdx: number, hhmm: string) {
  return `${addDays(weekStart, (weekdayIdx + 6) % 7)} ${hhmm}`;
}
function deadlineLabel(by: string) {
  const [d, t] = by.split(" ");
  const wd = DAY_NAMES[keyToDate(d).getUTCDay()];
  const [h, m] = t.split(":").map(Number);
  return `${wd} ${fmtClock(h * 60 + m)}`;
}

async function heuristicChallenge(weekStart: string): Promise<Spec> {
  const s = await getSettings();
  const today = todayKey(s.timezone);
  const { byId } = await loadGoalTree();
  const rocks = currentQuarterRocks([...byId.values()], today);
  const behind = rocks
    .flatMap((r, i) => r.measureDetail.map((m) => ({ rock: r, n: i + 1, m, gap: (r.expected ?? 0) - (m.target ? (m.actual / m.target) * 100 : 0) })))
    .filter((x) => ["outreach_touches", "sample_kits", "discovery_calls"].includes(x.m.metricKey))
    .sort((a, b) => b.gap - a.gap)[0];
  const overdue =
    (await db.task.count({ where: { status: "OPEN", ownerId: null, dueDate: { lt: keyToDate(today) } } })) +
    (await db.followUp.count({ where: { status: "OPEN", dueDate: { lt: keyToDate(today) } } }));
  const friday = deadline(weekStart, 5, "17:00");

  if (overdue >= 4) {
    return { kind: "zero_overdue_by" as const, title: "Clear the decks", description: `Get every overdue item to zero by Wednesday 5pm. ${overdue} to go.`, params: { by: deadline(weekStart, 3, "17:00") }, reward: 300 };
  }
  if (behind && behind.gap > 0) {
    const weeksLeft = Math.max(1, Math.ceil((behind.rock.daysLeft ?? 7) / 7));
    const need = Math.max(3, Math.ceil(((behind.m.target - behind.m.actual) / weeksLeft) * 0.7));
    const target = behind.m.metricKey === "outreach_touches" ? Math.max(10, need) : need;
    return {
      kind: "metric_by" as const,
      title: `${behind.m.name} blitz`,
      description: `${target} ${behind.m.name.toLowerCase()} before Wednesday noon. Rock #${behind.n} is behind pace.`,
      params: { metricKey: behind.m.metricKey, metricName: behind.m.name, target, by: deadline(weekStart, 3, "12:00") },
      reward: 300,
    };
  }
  const rotation = [
    { kind: "clean_runs" as const, title: "Three clean runs", description: "All 3 picks done on 3 days this week.", params: { target: 3, by: friday }, reward: 250 },
    { kind: "early_finishes" as const, title: "Done by eleven", description: "Finish your 3 picks before 11:00am twice this week.", params: { target: 2, before: 660, by: friday }, reward: 250 },
    { kind: "sprints" as const, title: "Eight sprints", description: "Finish 8 focus sprints this week.", params: { target: 8, by: friday }, reward: 250 },
    { kind: "stage_advances" as const, title: "Push the pipeline", description: "Move 5 accounts forward a stage by Friday.", params: { target: 5, by: friday }, reward: 300 },
  ];
  const wk = Math.floor(keyToDate(weekStart).getTime() / (7 * 86_400_000));
  return rotation[wk % rotation.length];
}

const AgentChallenge = z.object({
  kind: z.enum(["metric_by", "zero_overdue_by", "clean_runs", "early_finishes", "sprints", "stage_advances"]),
  title: z.string().describe("Short, punchy name, max 5 words"),
  description: z.string().describe("One sentence: the exact target and deadline, and which rock it serves"),
  metric_key: z.string().nullable().describe("For metric_by: the scoreboard metric key"),
  target: z.number().int().min(1).max(200).nullable(),
  deadline_weekday: z.number().int().min(1).max(5).describe("1=Mon … 5=Fri"),
  deadline_time: z.string().describe("HH:MM, 24h"),
  reward: z.number().int().min(150).max(400),
});

async function agentChallenge(weekStart: string): Promise<Spec | null> {
  const { liveContext } = await import("../agent/prompt");
  const metrics = await db.metric.findMany({ where: { source: "MANUAL", aggregation: "SUM", archivedAt: null }, select: { key: true, name: true, target: true } });
  const res = await anthropic().beta.messages.parse({
    model: AGENT_MODEL,
    max_tokens: 2000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(AgentChallenge) },
    system:
      "You design ONE weekly challenge (a 'twist') for a CEO who gets bored by routine. It must push on whichever of the CEO's own rocks is most behind pace — never invent a new priority. Make it specific, a little audacious but achievable in the week, with a mid-week deadline when it suits. Kinds: metric_by (hit a weekly count on a scoreboard metric by a deadline), zero_overdue_by (clear all overdue items), clean_runs (days with all 3 picks done), early_finishes (picks done before 11am), sprints (25-min focus sprints), stage_advances (pipeline accounts moved forward). No financial figures.",
    messages: [{ role: "user", content: `${await liveContext()}\n\nWeekly-count metrics you may use: ${JSON.stringify(metrics)}\nWeek starts ${weekStart}.` }],
  });
  const o = res.parsed_output;
  if (!o) return null;
  if (o.kind === "metric_by" && !metrics.some((m) => m.key === o.metric_key)) return null;
  const name = metrics.find((m) => m.key === o.metric_key)?.name;
  return {
    kind: o.kind as ChallengeKind,
    title: o.title,
    description: o.description,
    params: { metricKey: o.metric_key ?? undefined, metricName: name, target: o.target ?? 1, by: deadline(weekStart, o.deadline_weekday, /^\d{2}:\d{2}$/.test(o.deadline_time) ? o.deadline_time : "17:00"), ...(o.kind === "early_finishes" ? { before: 660 } : {}) },
    reward: o.reward,
  };
}

/** Make sure this week has a twist. The agent designs it when available (cron), else the heuristic. */
/** Started mid-week? Never hand out a deadline that's already gone: push it to Friday 5pm, or 24h out. */
function sane(spec: Spec, weekStart: string, tz: string): Spec {
  const by = spec.params.by;
  if (!by) return spec;
  const plus = (h: number) => {
    const d = new Date(Date.now() + h * 3600_000);
    return `${todayKey(tz, d)} ${String(Math.floor(localMinutes(tz, d) / 60)).padStart(2, "0")}:00`;
  };
  const soon = plus(6);
  if (by > soon) return spec;
  let next = deadline(weekStart, 5, "17:00");
  if (next <= soon) next = plus(24) > `${addDays(weekStart, 6)} 20:00` ? plus(24) : `${addDays(weekStart, 6)} 20:00`;
  return { ...spec, params: { ...spec.params, by: next }, description: spec.description.replace(/(before|by) (Monday|Tuesday|Wednesday|Thursday|Friday)( noon| \d+(am|pm))?/i, `by ${deadlineLabel(next)}`) };
}

export async function ensureChallenge(weekStart: string, useAgent = false) {
  const existing = await db.challenge.findUnique({ where: { weekStart: keyToDate(weekStart) } });
  if (existing) return existing;
  let c: Spec | null = null;
  let by = "heuristic";
  if (useAgent && agentConfigured()) {
    c = await agentChallenge(weekStart).catch(() => null);
    if (c) by = "agent";
  }
  c ??= await heuristicChallenge(weekStart);
  c = sane(c, weekStart, (await getSettings()).timezone);
  return db.challenge.upsert({
    where: { weekStart: keyToDate(weekStart) },
    create: { weekStart: keyToDate(weekStart), kind: c.kind, title: c.title, description: c.description, params: JSON.parse(JSON.stringify(c.params)), reward: c.reward, createdBy: by },
    update: {},
  });
}

function localNowStamp(tz: string) {
  const d = todayKey(tz);
  const m = localMinutes(tz);
  return `${d} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

async function progressOf(kind: string, p: Params, weekStart: string, tz: string) {
  const ws = keyToDate(weekStart);
  const we = keyToDate(addDays(weekStart, 7));
  const today = todayKey(tz);
  switch (kind) {
    case "metric_by": {
      const e = await db.metricEntry.findFirst({ where: { metric: { key: p.metricKey }, weekStart: ws } });
      return { current: e?.value ?? 0, target: p.target ?? 1, unit: (p.metricName ?? "").toLowerCase() };
    }
    case "zero_overdue_by": {
      const n =
        (await db.task.count({ where: { status: "OPEN", ownerId: null, dueDate: { lt: keyToDate(today) } } })) +
        (await db.followUp.count({ where: { status: "OPEN", dueDate: { lt: keyToDate(today) } } }));
      return { current: n, target: 0, unit: "overdue left", inverse: true };
    }
    case "clean_runs":
      return { current: await db.dailyPlan.count({ where: { date: { gte: weekStart, lt: addDays(weekStart, 7) }, allDone: true } }), target: p.target ?? 3, unit: "clean runs" };
    case "early_finishes": {
      const plans = await db.dailyPlan.findMany({ where: { date: { gte: weekStart, lt: addDays(weekStart, 7) }, finishedAt: { not: null } }, select: { finishedAt: true } });
      return { current: plans.filter((x) => localMinutes(tz, x.finishedAt!) < (p.before ?? 660)).length, target: p.target ?? 2, unit: `finishes before ${fmtClock(p.before ?? 660)}` };
    }
    case "sprints":
      return { current: await db.focusSprint.count({ where: { completed: true, startedAt: { gte: ws, lt: we } } }), target: p.target ?? 8, unit: "sprints" };
    case "stage_advances":
      return { current: await db.pipelineEvent.count({ where: { at: { gte: ws, lt: we }, fromStage: { not: null } } }), target: p.target ?? 5, unit: "accounts moved" };
  }
  return { current: 0, target: 1, unit: "" };
}

/** Evaluate this week's twist; pay out (coins + a rare blueprint) the moment it's won. */
export async function challengeView(weekStart: string) {
  const s = await getSettings();
  const c = await ensureChallenge(weekStart);
  const p = (c.params ?? {}) as Params;
  const prog = await progressOf(c.kind, p, weekStart, s.timezone);
  const done = "inverse" in prog && prog.inverse ? prog.current <= 0 : prog.current >= prog.target;
  const past = !!p.by && localNowStamp(s.timezone) > p.by;
  let status = c.status;
  if (status === "ACTIVE" && done) {
    status = "WON";
    await db.challenge.update({ where: { id: c.id }, data: { status, completedAt: new Date() } });
    await safely(async () => {
      const gs = await gameState();
      const locked = RARE_BLUEPRINTS.filter((b) => !((gs.unlocks as string[]) ?? []).includes(b));
      const bp = locked.length ? locked[Math.floor(Math.random() * locked.length)] : null;
      if (bp) await addUnlock(bp);
      await award(`challenge:${c.id}`, c.reward + (bp ? 0 : 100), "challenge", `Twist won: ${c.title}${bp ? " · rare blueprint unlocked" : ""}`, { blueprint: bp });
      const won = await db.challenge.count({ where: { status: "WON" } });
      if (won >= 3) await unlockAchievement("challenge_3");
    });
  } else if (status === "ACTIVE" && past) {
    status = "LOST";
    await db.challenge.update({ where: { id: c.id }, data: { status } });
  }
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    description: c.description,
    reward: c.reward,
    status,
    createdBy: c.createdBy,
    deadline: p.by ?? null,
    deadlineLabel: p.by ? deadlineLabel(p.by) : "",
    progress: prog,
    pct: "inverse" in prog && prog.inverse ? null : Math.min(100, Math.round((prog.current / Math.max(1, prog.target)) * 100)),
  };
}

export async function weekOf(tz: string) {
  return weekStartKey(todayKey(tz));
}
