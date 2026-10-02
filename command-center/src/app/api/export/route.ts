import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Full JSON backup of everything you typed into the app (comms bodies and secrets excluded). */
export async function GET() {
  const [settings, goals, tasks, recurring, parking, plans, reviews, people, followUps, touches, metrics, entries, exit, cards, contacts, events, drafts] = await Promise.all([
    db.setting.findMany(),
    db.goal.findMany(),
    db.task.findMany(),
    db.recurringTask.findMany(),
    db.parkingItem.findMany(),
    db.dailyPlan.findMany(),
    db.weeklyReview.findMany(),
    db.person.findMany(),
    db.followUp.findMany(),
    db.touch.findMany(),
    db.metric.findMany(),
    db.metricEntry.findMany(),
    db.exitCriterion.findMany(),
    db.pipelineCard.findMany(),
    db.pipelineContact.findMany(),
    db.pipelineEvent.findMany(),
    db.draft.findMany(),
  ]);
  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), settings, goals, tasks, recurring, parking, plans, reviews, people, followUps, touches, metrics, entries, exit, cards, contacts, events, drafts },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="micromex-command-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
