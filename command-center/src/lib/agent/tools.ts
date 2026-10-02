import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getTz } from "../settings";
import { todayKey, resolveDateWord, dateToKey } from "../time";
import * as goals from "../services/goals";
import * as tasks from "../services/tasks";
import * as parking from "../services/parking";
import * as daily from "../services/daily";
import * as review from "../services/review";
import * as people from "../services/people";
import * as followups from "../services/followups";
import * as metrics from "../services/metrics";
import * as pipeline from "../services/pipeline";
import { globalSearch } from "../services/search";
import { db } from "../db";
import { getGame } from "../game/state";
import { ventureBrief } from "../venture/service";
import { fmtDuration } from "../game/catalog";

// The agent's hands. Every tool calls the same service layer as the UI.
// None of these tools sends a message to anyone — outbound comms are drafts (see comms tools).

export type ToolCtx = { today: string };
type ToolDef<S extends z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: S;
  /** Short human label for the UI tool chip */
  label: (i: z.infer<S>) => string;
  run: (i: z.infer<S>, ctx: ToolCtx) => Promise<unknown>;
  /** Mutating tools refresh the UI after the turn */
  writes?: boolean;
};
export function tool<S extends z.ZodTypeAny>(d: ToolDef<S>) {
  return d;
}

const dateish = z.string().describe('A date: "YYYY-MM-DD", or a word like "today", "tomorrow", "thursday", "next week".');
const resolve = (v: string | null | undefined, ctx: ToolCtx) => (v ? (resolveDateWord(v, ctx.today) ?? v) : null);
const lane = z.enum(["DATA_CENTER", "AD", "OTHER"]);
const stage = z.enum(["TARGET", "CONTACTED", "SAMPLE_SENT", "DISCOVERY", "RFQ", "QUOTED", "PILOT", "CUSTOMER"]);

/** Compact goal node for the model (no deep nesting noise). */
function slimGoal(g: goals.GoalNode, n?: number) {
  return {
    id: g.id,
    ...(n ? { rock_number: n } : {}),
    level: g.level,
    title: g.title,
    status: g.status,
    progress: g.progress,
    pace_expected: g.expected,
    days_left: g.daysLeft,
    due: g.dueDate,
    owner: g.owner,
    measures: g.measureDetail.map((m) => `${m.name}: ${m.actual}/${m.target}`),
    open_tasks: g.taskCounts.open,
    parent_id: g.parentId,
  };
}

export const INTERNAL_TOOLS = [
  tool({
    name: "get_overview",
    description:
      "Today's state in one call: this week's 3 rocks with progress, quarter rocks, today's 3 picks (with reasons and done state), overdue tasks, follow-ups due, pipeline next actions due, parking lot count, streak, weekly cadence. Call this first for anything about 'today', 'my day' or 'what should I do'.",
    schema: z.object({}),
    label: () => "Read today",
    run: async () => {
      const t = await daily.getToday();
      return {
        today: t.today,
        days_to_exit: t.daysToExit,
        weekly_rocks: t.weeklyRocks.map((r, i) => slimGoal(r as goals.GoalNode, i + 1)),
        quarter_rocks: t.quarterlyRocks.map((r, i) => slimGoal(r as goals.GoalNode, i + 1)),
        picks: t.plan.picks.map((p, i) => ({ slot: i, kind: p.kind, ref_id: p.refId, title: p.title, reason: p.reason, done: p.done })),
        picked_by: t.plan.pickedBy,
        launched: t.plan.launched,
        closed: t.plan.closed,
        other_candidates: t.plan.candidates.map((c) => ({ kind: c.kind, ref_id: c.refId, title: c.title, reason: c.reason, score: c.score })),
        overdue_tasks: t.overdue,
        due_today_not_picked: t.dueToday,
        followups_due: t.followUpsDue,
        pipeline_actions_due: t.pipelineDue,
        parking_open: t.parking.open,
        streak: t.streak.current,
        cadence: t.cadence.map((c) => ({ title: c.title, current: c.current, target: c.target, done: c.done })),
        weekly_review_due: t.reviewDue,
      };
    },
  }),
  tool({
    name: "list_goals",
    description: "The full goal tree: 5-year exit target → annual goals → quarterly rocks → weekly rocks, with progress, pace, due dates and measures. Use ids from here when linking tasks.",
    schema: z.object({ include_future_quarters: z.boolean().optional() }),
    label: () => "Read goals",
    run: async (i) => {
      const o = await goals.goalsOverview();
      const flat = (n: goals.GoalNode[]): goals.GoalNode[] => n.flatMap((x) => [x, ...flat(x.children)]);
      const all = flat(o.tree as goals.GoalNode[]);
      const cur = `${o.today.slice(0, 4)}-Q${Math.ceil(Number(o.today.slice(5, 7)) / 3)}`;
      return {
        today: o.today,
        exit: all.filter((g) => g.level === "EXIT").map((g) => slimGoal(g)),
        annual: all.filter((g) => g.level === "ANNUAL").map((g) => slimGoal(g)),
        quarter_rocks: all
          .filter((g) => g.level === "QUARTERLY" && (i.include_future_quarters || `${g.year}-Q${g.quarter}` <= cur))
          .map((g) => ({ ...slimGoal(g), quarter: `${g.year} Q${g.quarter}` })),
        current_quarter_rocks_numbered: o.quarterlyRocks.map((r, k) => slimGoal(r as goals.GoalNode, k + 1)),
        this_week_rocks: o.weeklyRocks.map((r, k) => slimGoal(r as goals.GoalNode, k + 1)),
        next_week_rocks: o.nextWeekRocks.map((r, k) => slimGoal(r as goals.GoalNode, k + 1)),
      };
    },
  }),
  tool({
    name: "create_goal",
    description: "Create a goal or rock. Only do this when the user asks — never invent priorities. Weekly rocks need parent_id of a quarterly rock; week_start defaults to this week.",
    schema: z.object({
      level: z.enum(["ANNUAL", "QUARTERLY", "WEEKLY"]),
      title: z.string(),
      parent_id: z.string().nullable().optional(),
      due: dateish.optional(),
      year: z.number().int().optional(),
      quarter: z.number().int().min(1).max(4).optional(),
      week_start: dateish.optional().describe("Monday of the week for WEEKLY rocks"),
      owner: z.string().optional(),
      notes: z.string().optional(),
    }),
    writes: true,
    label: (i) => `Created ${i.level.toLowerCase()} “${i.title}”`,
    run: async (i, ctx) =>
      goals.createGoal({
        level: i.level,
        title: i.title,
        parentId: i.parent_id ?? null,
        dueDate: resolve(i.due, ctx),
        year: i.year ?? null,
        quarter: i.quarter ?? null,
        weekStart: resolve(i.week_start, ctx),
        owner: i.owner,
        notes: i.notes,
        status: "ON_TRACK",
      }),
  }),
  tool({
    name: "update_goal",
    description: "Update a goal/rock: status, title, notes, owner, due date, manual progress (0-100, or null to roll up automatically), or mark done.",
    schema: z.object({
      id: z.string(),
      title: z.string().optional(),
      status: z.enum(["NOT_STARTED", "ON_TRACK", "AT_RISK", "OFF_TRACK", "DONE"]).optional(),
      notes: z.string().optional(),
      owner: z.string().optional(),
      due: dateish.optional(),
      manual_progress: z.number().int().min(0).max(100).nullable().optional(),
    }),
    writes: true,
    label: (i) => (i.status === "DONE" ? "Completed a rock" : "Updated a goal"),
    run: async (i, ctx) =>
      goals.updateGoal(i.id, {
        title: i.title,
        status: i.status,
        notes: i.notes,
        owner: i.owner,
        dueDate: i.due ? resolve(i.due, ctx) : undefined,
        manualProgress: i.manual_progress,
      }),
  }),
  tool({
    name: "list_tasks",
    description: "List tasks. Filter by status (OPEN default), goal_id, text query, or delegated=true for tasks owned by someone else.",
    schema: z.object({ status: z.enum(["OPEN", "DONE", "ALL"]).optional(), goal_id: z.string().optional(), query: z.string().optional(), delegated: z.boolean().optional() }),
    label: () => "Read tasks",
    run: async (i) =>
      (await tasks.listTasks({ status: i.status, goalId: i.goal_id, q: i.query, delegated: i.delegated, limit: 80 })).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        due: dateToKey(t.dueDate),
        goal: t.goal?.title,
        goal_id: t.goalId,
        owner: t.owner?.name,
        notes: t.notes || undefined,
      })),
  }),
  tool({
    name: "create_task",
    description:
      "Create a task. DRIFT RULE: every task must serve a rock or goal — pass goal_id (a weekly rock, quarterly rock or annual goal id). If nothing fits, do NOT create a task: use park_item instead, or ask the user which rock it serves.",
    schema: z.object({ title: z.string(), goal_id: z.string(), due: dateish.optional(), notes: z.string().optional(), thread_id: z.string().optional().describe("Link the task to a conversation") }),
    writes: true,
    label: (i) => `Added task “${i.title}”`,
    run: async (i, ctx) => {
      const g = await db.goal.findUnique({ where: { id: i.goal_id } });
      if (!g) throw new Error("goal_id not found — call list_goals, or park the item instead.");
      return tasks.createTask({ title: i.title, goalId: i.goal_id, dueDate: resolve(i.due, ctx), notes: i.notes, threadId: i.thread_id ?? null, source: i.thread_id ? "comms" : "agent" });
    },
  }),
  tool({
    name: "update_task",
    description: "Update a task's title, due date, notes, linked goal, or status (OPEN/DONE/CANCELLED).",
    schema: z.object({ id: z.string(), title: z.string().optional(), due: dateish.nullable().optional(), notes: z.string().optional(), goal_id: z.string().optional(), status: z.enum(["OPEN", "DONE", "CANCELLED"]).optional() }),
    writes: true,
    label: (i) => (i.status === "DONE" ? "Completed a task" : "Updated a task"),
    run: async (i, ctx) =>
      tasks.updateTask(i.id, { title: i.title, dueDate: i.due === undefined ? undefined : resolve(i.due, ctx), notes: i.notes, goalId: i.goal_id, status: i.status }),
  }),
  tool({
    name: "delegate_task",
    description: "Delegate a task to a person (by name; created if new) and set a follow-up date. Creates a follow-up that surfaces on Today.",
    schema: z.object({ task_id: z.string(), person_name: z.string(), follow_up_on: dateish, note: z.string().optional() }),
    writes: true,
    label: (i) => `Delegated to ${i.person_name}`,
    run: async (i, ctx) => followups.delegateTask(i.task_id, { personName: i.person_name, followUpDate: resolve(i.follow_up_on, ctx)!, note: i.note }),
  }),
  tool({
    name: "list_followups",
    description: "Open follow-ups (who owes what, by when) with their touch logs. Optional person_name filter. status ALL includes closed.",
    schema: z.object({ person_name: z.string().optional(), status: z.enum(["OPEN", "DONE", "ALL"]).optional() }),
    label: () => "Read follow-ups",
    run: async (i) => {
      const p = i.person_name ? await people.findPersonByName(i.person_name) : null;
      return (await followups.listFollowUps({ status: i.status, personId: p?.id })).map((f) => ({
        id: f.id,
        title: f.title,
        person: f.person?.name,
        due: dateToKey(f.dueDate),
        status: f.status,
        account: f.pipelineCard?.company,
        touches: f.touches.slice(0, 5).map((t) => `${dateToKey(t.at)} ${t.channel}: ${t.note}`),
      }));
    },
  }),
  tool({
    name: "create_followup",
    description:
      'Create a follow-up from plain speech, e.g. "chase Juan on the Dyson SOW Thursday" → person_name "Juan", title "Dyson SOW", due "thursday". Link goal_id or pipeline_card_id when obvious from context.',
    schema: z.object({
      title: z.string(),
      person_name: z.string(),
      due: dateish,
      notes: z.string().optional(),
      goal_id: z.string().optional(),
      pipeline_card_id: z.string().optional(),
      thread_id: z.string().optional(),
    }),
    writes: true,
    label: (i) => `Follow-up: chase ${i.person_name} — ${i.title}`,
    run: async (i, ctx) =>
      followups.createFollowUp({
        title: i.title,
        personName: i.person_name,
        dueDate: resolve(i.due, ctx)!,
        notes: i.notes,
        goalId: i.goal_id,
        pipelineCardId: i.pipeline_card_id,
        threadId: i.thread_id,
      }),
  }),
  tool({
    name: "log_touch",
    description: "Log a touch on a follow-up (what happened) and optionally push the next chase date.",
    schema: z.object({ followup_id: z.string(), note: z.string(), channel: z.enum(["note", "call", "email", "slack", "whatsapp", "in-person"]).optional(), next_date: dateish.optional() }),
    writes: true,
    label: () => "Logged a touch",
    run: async (i, ctx) => followups.logTouch(i.followup_id, i.note, i.channel, resolve(i.next_date, ctx) ?? undefined),
  }),
  tool({
    name: "complete_followup",
    description: "Close a follow-up (optionally with a closing note).",
    schema: z.object({ followup_id: z.string(), note: z.string().optional() }),
    writes: true,
    label: () => "Closed a follow-up",
    run: async (i) => followups.completeFollowUp(i.followup_id, true, i.note),
  }),
  tool({
    name: "list_pipeline",
    description: "Pipeline accounts (no financial data exists). Filter by lane (DATA_CENTER / AD / OTHER), stage, or text query.",
    schema: z.object({ lane: lane.optional(), stage: stage.optional(), query: z.string().optional() }),
    label: () => "Read pipeline",
    run: async (i) =>
      (await pipeline.listPipeline({ lane: i.lane, q: i.query }))
        .filter((c) => !i.stage || c.stage === i.stage)
        .map((c) => ({
          id: c.id,
          company: c.company,
          lane: c.lane,
          stage: c.stage,
          tier: c.tier,
          next_action: c.nextAction,
          next_action_date: dateToKey(c.nextActionDate),
          contacts: c.contacts.map((x) => `${x.name}${x.title ? ` (${x.title})` : ""}`),
          linked_threads: c.threads.length,
        })),
  }),
  tool({
    name: "pipeline_summary",
    description: 'Roll-up for questions like "where are we on data center?": counts by stage, moves in the last 7 days, late-stage accounts, accounts missing next actions or contacts, actions due this week.',
    schema: z.object({ lane: lane.optional() }),
    label: (i) => `Summarized ${i.lane ? pipeline.LANE_LABEL[i.lane] : "pipeline"}`,
    run: async (i) => pipeline.pipelineSummary(i.lane),
  }),
  tool({
    name: "create_pipeline_card",
    description: "Add an account to the pipeline. Never record pricing, deal value or any financial figure.",
    schema: z.object({
      company: z.string(),
      lane: lane.optional(),
      stage: stage.optional(),
      tier: z.string().optional(),
      next_action: z.string().optional(),
      next_action_date: dateish.optional(),
      notes: z.string().optional(),
      contacts: z.array(z.object({ name: z.string(), title: z.string().optional(), email: z.string().optional() })).optional(),
    }),
    writes: true,
    label: (i) => `Added ${i.company} to pipeline`,
    run: async (i, ctx) =>
      pipeline.createCard({
        company: i.company,
        lane: i.lane,
        stage: i.stage,
        tier: i.tier,
        nextAction: i.next_action,
        nextActionDate: resolve(i.next_action_date, ctx),
        notes: i.notes,
        contacts: i.contacts?.map((c) => ({ name: c.name, title: c.title, email: c.email ?? null })),
      }),
  }),
  tool({
    name: "update_pipeline_card",
    description: "Update an account: stage (moves it and logs history), next action + date, tier, lane, notes. Never add financial figures.",
    schema: z.object({ id: z.string(), stage: stage.optional(), next_action: z.string().optional(), next_action_date: dateish.nullable().optional(), tier: z.string().optional(), lane: lane.optional(), notes: z.string().optional() }),
    writes: true,
    label: (i) => (i.stage ? `Moved account to ${pipeline.STAGE_LABEL[i.stage]}` : "Updated an account"),
    run: async (i, ctx) =>
      pipeline.updateCard(i.id, {
        stage: i.stage,
        nextAction: i.next_action,
        nextActionDate: i.next_action_date === undefined ? undefined : resolve(i.next_action_date, ctx),
        tier: i.tier,
        lane: i.lane,
        notes: i.notes,
      }),
  }),
  tool({
    name: "get_scoreboard",
    description: "Weekly scoreboard (activity & pipeline counts only): each metric's this-week value, target, RAG, last week, YTD, and the 12-week trend; plus exit-readiness score and checklist.",
    schema: z.object({}),
    label: () => "Read scoreboard",
    run: async () => {
      const s = await metrics.scoreboard(12);
      return {
        week_of: s.thisWeek,
        metrics: s.metrics.map((m) => ({
          key: m.key,
          name: m.name,
          source: m.source,
          this_week: m.current,
          last_week: m.lastWeek,
          target: m.target,
          lower_is_better: m.lowerIsBetter,
          rag: m.rag,
          ytd: m.ytd,
          trend: m.series.map((x) => x.value),
        })),
        exit_readiness: { score: s.exit.score, items: s.exit.items.map((c) => ({ title: c.title, progress: c.progress, weight: c.weight })) },
        pipeline_by_stage: s.stageCounts,
      };
    },
  }),
  tool({
    name: "record_metric",
    description: 'Record a weekly scoreboard number for a MANUAL metric (e.g. "log 3 outreach touches" → metric_key outreach_touches, value 3, mode add). Counts only.',
    schema: z.object({ metric_key: z.string(), value: z.number(), mode: z.enum(["add", "set"]).optional(), week_of: dateish.optional() }),
    writes: true,
    label: (i) => `Logged ${i.value} → ${i.metric_key.replace(/_/g, " ")}`,
    run: async (i, ctx) => metrics.recordMetric({ metricKey: i.metric_key, value: i.value, mode: i.mode ?? "add", weekStart: resolve(i.week_of, ctx) ?? undefined }),
  }),
  tool({
    name: "list_parking_lot",
    description: "Open Parking Lot items (ideas and side-quests waiting for Friday triage).",
    schema: z.object({}),
    label: () => "Read Parking Lot",
    run: async () => (await parking.listParking("OPEN")).map((p) => ({ id: p.id, text: p.text, source: p.source, created: dateToKey(p.createdAt) })),
  }),
  tool({
    name: "park_item",
    description: "Put something in the Parking Lot. Use for anything that doesn't serve a current rock — it never touches Today.",
    schema: z.object({ text: z.string() }),
    writes: true,
    label: (i) => `Parked “${i.text.slice(0, 50)}”`,
    run: async (i) => parking.park(i.text, "agent"),
  }),
  tool({
    name: "triage_parking_item",
    description: "Friday triage: promote (to a task linked to goal_id), schedule (resurface on a date), or delete. Ask the user before deleting.",
    schema: z.object({ id: z.string(), action: z.enum(["promote", "schedule", "delete"]), goal_id: z.string().optional(), due: dateish.optional(), date: dateish.optional() }),
    writes: true,
    label: (i) => `Parking item → ${i.action}`,
    run: async (i, ctx) => {
      if (i.action === "promote" && !i.goal_id) throw new Error("Promoting needs a goal_id (the rock it serves).");
      return parking.triageParking(i.id, i.action, { goalId: i.goal_id, dueDate: resolve(i.due, ctx), date: resolve(i.date, ctx) ?? undefined });
    },
  }),
  tool({
    name: "set_daily_picks",
    description:
      "Replace today's 3 picks. Choose ONLY from get_overview's picks + other_candidates (by kind + ref_id). Every reason must be concrete and tie to the user's own rocks, e.g. “Rock #2 is 40% and due in 9 days; this unblocks the kit mailing.”",
    schema: z.object({
      picks: z.array(z.object({ kind: z.enum(["task", "followup", "pipeline"]), ref_id: z.string(), reason: z.string() })).min(1).max(3),
    }),
    writes: true,
    label: () => "Re-picked today's 3",
    run: async (i, ctx) => {
      const cands = await daily.generateCandidates(ctx.today);
      const picks = i.picks.map((p) => {
        const c = cands.find((x) => x.kind === p.kind && x.refId === p.ref_id);
        if (!c) throw new Error(`${p.kind} ${p.ref_id} is not an open candidate.`);
        return { ...c, reason: p.reason };
      });
      await daily.ensurePlan(ctx.today);
      return daily.setPicks(ctx.today, picks, "agent");
    },
  }),
  tool({
    name: "get_weekly_review",
    description: "The Friday review data: said vs. done, rocks, daily picks, overdue tasks/follow-ups, Parking Lot, scoreboard this week, next week's rocks. Use when running the review with the user.",
    schema: z.object({}),
    label: () => "Read weekly review",
    run: async () => {
      const r = await review.getWeeklyReview();
      return { ...r, rocks: r.rocks.map((g) => slimGoal(g as goals.GoalNode)), nextRocks: r.nextRocks.map((g) => slimGoal(g as goals.GoalNode)), quarterlyRocks: r.quarterlyRocks.map((g, k) => slimGoal(g as goals.GoalNode, k + 1)) };
    },
  }),
  tool({
    name: "close_weekly_review",
    description: "Close this week's review with wins and notes. Fails unless next week's rocks are set — set them with create_goal (level WEEKLY, week_start next Monday) first, with the user's words.",
    schema: z.object({ wins: z.string().optional(), notes: z.string().optional() }),
    writes: true,
    label: () => "Closed the weekly review",
    run: async (i) => {
      const r = await review.getWeeklyReview();
      return review.closeWeeklyReview(r.weekStart, i);
    },
  }),
  tool({
    name: "monthly_summary",
    description: "One-page monthly progress summary (markdown) for a month YYYY-MM (default this month).",
    schema: z.object({ month: z.string().optional() }),
    label: () => "Built monthly summary",
    run: async (i) => review.monthlySummary(i.month),
  }),
  tool({
    name: "list_people",
    description: "People the user delegates to / follows up with.",
    schema: z.object({}),
    label: () => "Read people",
    run: async () => (await people.listPeople()).map((p) => ({ id: p.id, name: p.name, role: p.role, email: p.email, team: p.isTeam })),
  }),
  tool({
    name: "get_game_state",
    description:
      "The president's game layer: coin balance, coins earned today/this week, today's speedrun vs personal best, this week's twist (challenge) and its progress, personal records, recent achievements, plant power, streak freezes, and their pretend tycoon company (play-money \"bucks\", never real financials). Use it to coach: celebrate records, nudge toward the twist, point out a growing bounty, or note that real work is what powers the game company's momentum.",
    schema: z.object({}),
    label: () => "Read the game",
    run: async () => {
      const g = await getGame();
      const t = await daily.getToday();
      return {
        coins: g.balance,
        earned_today: g.earnedToday,
        earned_week: g.earnedWeek,
        plant_power: g.power,
        freezes: g.freezes,
        speedrun: {
          started: t.speedrun.started,
          finished_in: t.speedrun.durationSec ? fmtDuration(t.speedrun.durationSec) : null,
          personal_best: t.speedrun.pb ? fmtDuration(t.speedrun.pb.durationSec) : null,
        },
        twist: { title: g.challenge.title, description: g.challenge.description, status: g.challenge.status, progress: g.challenge.progress, deadline: g.challenge.deadlineLabel, reward: g.challenge.reward },
        records: g.records.filter((r) => r.value != null).map((r) => `${r.title}: ${r.display}`),
        achievements_unlocked: g.achievements.filter((a) => a.unlockedAt).map((a) => a.title),
        biggest_bounties: [...t.overdue, ...t.followUpsDue].filter((x) => x.bounty > 0).sort((a, b) => b.bounty - a.bounty).slice(0, 3).map((x) => `${x.title}: +${x.bounty}`),
        buildings: g.buildings.length,
        tycoon_company: await ventureBrief(),
      };
    },
  }),
  tool({
    name: "search",
    description: "Search across goals, tasks, follow-ups, pipeline accounts, parking lot, people and stored messages.",
    schema: z.object({ query: z.string() }),
    label: (i) => `Searched “${i.query}”`,
    run: async (i) => globalSearch(i.query),
  }),
];

export type AnyTool = ToolDef<z.ZodTypeAny>;

export function toAnthropicTools(list: AnyTool[]): Anthropic.Beta.BetaTool[] {
  return list.map((t) => {
    const schema = z.toJSONSchema(t.schema, { target: "draft-7" }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: t.name,
      description: t.description,
      input_schema: { type: "object", ...schema } as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    };
  });
}

export async function toolContext(): Promise<ToolCtx> {
  return { today: todayKey(await getTz()) };
}
