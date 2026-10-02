import { z } from "zod";
import * as goals from "../services/goals";
import * as tasks from "../services/tasks";
import * as parking from "../services/parking";
import * as daily from "../services/daily";
import * as review from "../services/review";
import * as people from "../services/people";
import * as followups from "../services/followups";
import * as metrics from "../services/metrics";
import * as pipeline from "../services/pipeline";
import * as recurring from "../services/recurring";
import { globalSearch } from "../services/search";
import * as comms from "../services/comms";
import { integrationsStatus, syncProvider } from "../integrations/registry";
import { disconnect } from "../integrations/store";
import { getSettings, updateSettings } from "../settings";
import { conversationView, listConversations } from "../agent/run";
import { agentRepick } from "../agent/picks";
import { agentConfigured } from "../agent/client";
import { summarizeThread, draftReply } from "../agent/comms";
import { db } from "../db";
import { todayKey } from "../time";

// One registry for the UI (via /api/q and /api/m), the agent's tools and cron.

function def<S extends z.ZodTypeAny, O>(input: S, run: (i: z.infer<S>) => Promise<O>) {
  return { input, run };
}

const id = z.object({ id: z.string() });
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const level = z.enum(["EXIT", "ANNUAL", "QUARTERLY", "WEEKLY"]);
const goalStatus = z.enum(["NOT_STARTED", "ON_TRACK", "AT_RISK", "OFF_TRACK", "DONE"]);
const measure = z.object({ metricKey: z.string(), target: z.number() });
const goalInput = z.object({
  level,
  title: z.string().min(1),
  notes: z.string().optional(),
  owner: z.string().optional(),
  status: goalStatus.optional(),
  manualProgress: z.number().int().min(0).max(100).nullable().optional(),
  measures: z.array(measure).optional(),
  periodStart: dateKey.nullable().optional(),
  dueDate: dateKey.nullable().optional(),
  year: z.number().int().nullable().optional(),
  quarter: z.number().int().min(1).max(4).nullable().optional(),
  weekStart: dateKey.nullable().optional(),
  parentId: z.string().nullable().optional(),
});
const taskInput = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  goalId: z.string().nullable().optional(),
  dueDate: dateKey.nullable().optional(),
  ownerId: z.string().nullable().optional(),
  source: z.string().optional(),
  threadId: z.string().nullable().optional(),
});
const pickKind = z.enum(["task", "followup", "pipeline"]);
const lane = z.enum(["DATA_CENTER", "AD", "OTHER"]);
const stage = z.enum(["TARGET", "CONTACTED", "SAMPLE_SENT", "DISCOVERY", "RFQ", "QUOTED", "PILOT", "CUSTOMER"]);
const contact = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  title: z.string().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
});
const cardInput = z.object({
  company: z.string().min(1),
  lane: lane.optional(),
  stage: stage.optional(),
  tier: z.string().optional(),
  nextAction: z.string().optional(),
  nextActionDate: z.string().nullable().optional(),
  notes: z.string().optional(),
  website: z.string().optional(),
  goalId: z.string().nullable().optional(),
  contacts: z.array(contact).optional(),
});

export const queries = {
  today: def(z.object({}), () => daily.getToday()),
  goals: def(z.object({}), () => goals.goalsOverview()),
  tasks: def(z.object({ status: z.enum(["OPEN", "DONE", "ALL"]).optional(), goalId: z.string().optional(), q: z.string().optional(), delegated: z.boolean().optional() }), (i) => tasks.listTasks(i)),
  parking: def(z.object({ status: z.enum(["OPEN", "ALL"]).optional() }), (i) => parking.listParking(i.status)),
  review: def(z.object({ weekStart: dateKey.optional() }), (i) => review.getWeeklyReview(i.weekStart)),
  monthly: def(z.object({ month: z.string().optional() }), (i) => review.monthlySummary(i.month)),
  people: def(z.object({}), () => people.listPeople()),
  followUps: def(z.object({ status: z.enum(["OPEN", "DONE", "ALL"]).optional(), personId: z.string().optional() }), (i) => followups.listFollowUps(i)),
  scoreboard: def(z.object({ weeks: z.number().int().min(4).max(52).optional() }), (i) => metrics.scoreboard(i.weeks)),
  exit: def(z.object({}), () => metrics.exitReadiness()),
  pipeline: def(z.object({ lane: lane.optional(), q: z.string().optional() }), (i) => pipeline.listPipeline(i)),
  card: def(id, (i) => pipeline.getCard(i.id)),
  pipelineSummary: def(z.object({ lane: lane.optional() }), (i) => pipeline.pipelineSummary(i.lane)),
  recurring: def(z.object({}), () => recurring.listRecurring()),
  search: def(z.object({ q: z.string().default("") }), (i) => globalSearch(i.q)),
  settings: def(z.object({}), () => getSettings()),
  threads: def(
    z.object({ channel: z.enum(["EMAIL", "SLACK", "WHATSAPP"]).optional(), q: z.string().optional(), filter: z.enum(["all", "unread", "important", "linked", "archived"]).optional() }),
    (i) => comms.listThreads(i),
  ),
  thread: def(id, (i) => comms.getThread(i.id)),
  drafts: def(z.object({}), () => comms.listDrafts()),
  integrations: def(z.object({}), () => integrationsStatus()),
  "agent.status": def(z.object({}), async () => ({ configured: agentConfigured(), model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5" })),
  "agent.conversations": def(z.object({}), () => listConversations()),
  "agent.messages": def(id, (i) => conversationView(i.id)),
};

export const mutations = {
  // goals
  "goal.create": def(goalInput, (i) => goals.createGoal(i)),
  "goal.update": def(id.extend({ patch: goalInput.partial() }), (i) => goals.updateGoal(i.id, i.patch)),
  "goal.complete": def(id.extend({ done: z.boolean() }), (i) => goals.completeGoal(i.id, i.done)),
  "goal.archive": def(id.extend({ archived: z.boolean().optional() }), (i) => goals.archiveGoal(i.id, i.archived ?? true)),
  "goal.archiveCompleted": def(z.object({}), () => goals.archiveCompletedGoals()),
  "goal.delete": def(id, (i) => goals.deleteGoal(i.id)),
  "goal.reorder": def(z.object({ ids: z.array(z.string()) }), (i) => goals.reorderGoals(i.ids)),
  // tasks
  "task.create": def(taskInput, (i) => tasks.createTask(i)),
  "task.update": def(id.extend({ patch: taskInput.partial().extend({ status: z.enum(["OPEN", "DONE", "CANCELLED"]).optional() }) }), (i) => tasks.updateTask(i.id, i.patch)),
  "task.complete": def(id.extend({ done: z.boolean().optional() }), (i) => tasks.completeTask(i.id, i.done ?? true)),
  "task.snooze": def(id.extend({ days: z.number().int().min(1).max(60).optional() }), (i) => tasks.snoozeTask(i.id, i.days ?? 1)),
  "task.park": def(id, (i) => tasks.parkTask(i.id)),
  "task.delete": def(id, (i) => tasks.deleteTask(i.id)),
  "task.delegate": def(
    id.extend({ personId: z.string().optional(), personName: z.string().optional(), followUpDate: z.string(), note: z.string().optional() }),
    (i) => followups.delegateTask(i.id, i),
  ),
  // parking
  "parking.add": def(z.object({ text: z.string().min(1), source: z.string().optional() }), (i) => parking.park(i.text, i.source)),
  "parking.update": def(id.extend({ text: z.string().min(1) }), (i) => parking.updateParking(i.id, i.text)),
  "parking.triage": def(
    id.extend({ action: z.enum(["promote", "schedule", "delete", "reopen"]), goalId: z.string().nullable().optional(), dueDate: dateKey.nullable().optional(), date: dateKey.optional(), title: z.string().optional() }),
    (i) => parking.triageParking(i.id, i.action, i),
  ),
  // daily
  "day.launch": def(z.object({ mindDump: z.string().optional() }), (i) => daily.launchDay(i)),
  "day.repick": def(z.object({}), () => daily.repick()),
  "day.agentRepick": def(z.object({}), async () => agentRepick(todayKey((await getSettings()).timezone))),
  "agent.deleteConversation": def(id, (i) => db.agentConversation.delete({ where: { id: i.id } })),
  "day.swap": def(z.object({ slot: z.number().int().min(0).max(2), kind: pickKind, refId: z.string() }), (i) => daily.swapPick(i.slot, i)),
  "day.pipelineDone": def(z.object({ refId: z.string(), done: z.boolean().optional() }), (i) => daily.markPipelinePickDone(i.refId, i.done ?? true)),
  "day.close": def(z.object({ actions: z.array(z.object({ kind: pickKind, refId: z.string(), action: z.enum(["done", "carry", "park"]) })) }), (i) => daily.closeDay(i)),
  // weekly review
  "review.save": def(z.object({ weekStart: dateKey, notes: z.string().optional(), wins: z.string().optional() }), (i) => review.saveWeeklyReview(i.weekStart, i)),
  "review.close": def(z.object({ weekStart: dateKey, notes: z.string().optional(), wins: z.string().optional() }), (i) => review.closeWeeklyReview(i.weekStart, i)),
  // people & follow-ups
  "person.upsert": def(
    z.object({ id: z.string().nullable().optional(), name: z.string().min(1), role: z.string().optional(), email: z.string().nullable().optional(), slackId: z.string().nullable().optional(), whatsapp: z.string().nullable().optional(), isTeam: z.boolean().optional() }),
    ({ id: pid, ...rest }) => people.upsertPerson(pid ?? null, rest),
  ),
  "person.archive": def(id, (i) => people.archivePerson(i.id)),
  "followup.create": def(
    z.object({ title: z.string().min(1), dueDate: z.string(), personId: z.string().nullable().optional(), personName: z.string().nullable().optional(), notes: z.string().optional(), taskId: z.string().nullable().optional(), goalId: z.string().nullable().optional(), pipelineCardId: z.string().nullable().optional(), threadId: z.string().nullable().optional() }),
    (i) => followups.createFollowUp(i),
  ),
  "followup.update": def(
    id.extend({ patch: z.object({ title: z.string().optional(), dueDate: z.string().optional(), personId: z.string().nullable().optional(), notes: z.string().optional(), goalId: z.string().nullable().optional(), status: z.enum(["OPEN", "DONE", "CANCELLED"]).optional() }) }),
    (i) => followups.updateFollowUp(i.id, i.patch),
  ),
  "followup.complete": def(id.extend({ done: z.boolean().optional(), note: z.string().optional() }), (i) => followups.completeFollowUp(i.id, i.done ?? true, i.note)),
  "followup.touch": def(id.extend({ note: z.string().min(1), channel: z.string().optional(), nextDate: z.string().optional() }), (i) => followups.logTouch(i.id, i.note, i.channel, i.nextDate)),
  "followup.delete": def(id, (i) => followups.deleteFollowUp(i.id)),
  // scoreboard
  "metric.record": def(
    z.object({ metricKey: z.string().optional(), metricId: z.string().optional(), weekStart: dateKey.optional(), value: z.number(), mode: z.enum(["set", "add"]).optional(), note: z.string().optional() }),
    (i) => metrics.recordMetric(i),
  ),
  "metric.clear": def(z.object({ metricId: z.string(), weekStart: dateKey }), (i) => metrics.clearMetricEntry(i.metricId, i.weekStart)),
  "metric.upsert": def(
    z.object({
      id: z.string().nullable().optional(),
      key: z.string().regex(/^[a-z0-9_]+$/),
      name: z.string().min(1),
      description: z.string().optional(),
      unit: z.string().optional(),
      aggregation: z.enum(["SUM", "LATEST"]).optional(),
      source: z.enum(["MANUAL", "AUTO"]).optional(),
      autoKey: z.string().nullable().optional(),
      target: z.number().nullable().optional(),
      ytdTarget: z.number().nullable().optional(),
      lowerIsBetter: z.boolean().optional(),
    }),
    ({ id: mid, ...rest }) => metrics.upsertMetric(mid ?? null, rest),
  ),
  "metric.archive": def(id, (i) => metrics.archiveMetric(i.id)),
  "metric.reorder": def(z.object({ ids: z.array(z.string()) }), (i) => metrics.reorderMetrics(i.ids)),
  "exit.upsert": def(
    z.object({ id: z.string().nullable().optional(), title: z.string().min(1), notes: z.string().optional(), weight: z.number().min(0).optional(), progress: z.number().int().min(0).max(100).optional(), metricKey: z.string().nullable().optional(), threshold: z.number().nullable().optional() }),
    ({ id: eid, ...rest }) => metrics.upsertExitCriterion(eid ?? null, rest),
  ),
  "exit.delete": def(id, (i) => metrics.deleteExitCriterion(i.id)),
  // pipeline
  "card.create": def(cardInput, (i) => pipeline.createCard(i)),
  "card.update": def(id.extend({ patch: cardInput.partial() }), (i) => pipeline.updateCard(i.id, i.patch)),
  "card.move": def(id.extend({ stage, index: z.number().int().optional() }), (i) => pipeline.moveStage(i.id, i.stage, i.index)),
  "card.archive": def(id.extend({ archived: z.boolean().optional() }), (i) => pipeline.archiveCard(i.id, i.archived ?? true)),
  "card.delete": def(id, (i) => pipeline.deleteCard(i.id)),
  "card.import": def(z.object({ csv: z.string().min(1), lane: lane.optional(), stage: stage.optional() }), (i) => pipeline.importCards(i.csv, i)),
  "card.linkThread": def(z.object({ cardId: z.string().nullable(), threadId: z.string() }), (i) => pipeline.linkThread(i.cardId, i.threadId)),
  "card.nextDone": def(id.extend({ nextAction: z.string(), nextActionDate: z.string().nullable().optional() }), (i) => pipeline.completeNextAction(i.id, i)),
  // comms
  "thread.read": def(id, (i) => comms.markThreadRead(i.id)),
  "thread.archive": def(id.extend({ archived: z.boolean().optional() }), (i) => comms.archiveThread(i.id, i.archived ?? true)),
  "thread.reply": def(id.extend({ body: z.string().min(1) }), (i) => comms.replyNow(i.id, i.body)),
  "thread.summarize": def(id, (i) => summarizeThread(i.id)),
  "thread.agentDraft": def(id.extend({ instructions: z.string().optional() }), (i) => draftReply(i.id, i.instructions)),
  "draft.create": def(
    z.object({ threadId: z.string().nullable().optional(), channel: z.enum(["EMAIL", "SLACK", "WHATSAPP"]).optional(), to: z.string().optional(), subject: z.string().optional(), body: z.string().min(1) }),
    (i) => comms.createDraft({ ...i, createdBy: "user" }),
  ),
  "draft.update": def(id.extend({ to: z.string().optional(), subject: z.string().optional(), body: z.string().optional() }), ({ id: did, ...rest }) => comms.updateDraft(did, rest)),
  "draft.send": def(id, (i) => comms.sendDraft(i.id)),
  "draft.discard": def(id, (i) => comms.discardDraft(i.id)),
  "integration.sync": def(z.object({ provider: z.enum(["gmail", "slack", "whatsapp"]), full: z.boolean().optional() }), (i) => syncProvider(i.provider, { full: i.full })),
  "integration.disconnect": def(z.object({ provider: z.enum(["gmail", "slack", "whatsapp"]) }), async (i) => (await disconnect(i.provider), { ok: true })),
  // recurring
  "recurring.upsert": def(
    z.object({ id: z.string().nullable().optional(), title: z.string().min(1), weekday: z.number().int().min(0).max(6).optional(), targetCount: z.number().int().nullable().optional(), metricKey: z.string().nullable().optional(), goalId: z.string().nullable().optional(), active: z.boolean().optional() }),
    ({ id: rid, ...rest }) => recurring.upsertRecurring(rid ?? null, rest),
  ),
  "recurring.delete": def(id, (i) => recurring.deleteRecurring(i.id)),
  // settings
  "settings.update": def(
    z.object({
      ownerName: z.string().optional(),
      company: z.string().optional(),
      timezone: z.string().optional(),
      morningTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      reviewDay: z.number().int().min(0).max(6).optional(),
      theme: z.enum(["dark", "light"]).optional(),
      exitDate: dateKey.optional(),
      pushEnabled: z.boolean().optional(),
    }),
    (i) => updateSettings(i),
  ),
};

export type Queries = typeof queries;
export type Mutations = typeof mutations;
export type QueryName = keyof Queries;
export type MutationName = keyof Mutations;
