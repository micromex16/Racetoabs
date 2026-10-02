import { getSettings } from "./settings";
import { todayKey, weekStartKey } from "./time";
import { ensureRecurringForWeek } from "./services/recurring";
import { resurfaceScheduled } from "./services/parking";
import { snapshotAutoMetrics } from "./services/metrics";
import { runScheduledNotifications } from "./services/notify";
import { seedIfEmpty } from "./seed";
import { ensureChallenge } from "./game/challenges";
import { tickVenture } from "./venture/service";

import { tickHooks } from "./hooks";
import "./integrations/registry"; // registers comms sync hooks

export async function tick(now = new Date()) {
  await seedIfEmpty();
  const s = await getSettings();
  const today = todayKey(s.timezone, now);
  const result: Record<string, unknown> = { today };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      result[name] = (await fn()) ?? "ok";
    } catch (e) {
      result[name] = { error: (e as Error).message };
      console.error(`[cron] ${name}`, e);
    }
  };
  await step("recurring", () => ensureRecurringForWeek(weekStartKey(today)));
  await step("parking", () => resurfaceScheduled(today));
  await step("metrics", () => snapshotAutoMetrics());
  // The agent designs the weekly twist (first tick of the week); heuristic if no API key.
  await step("challenge", () => ensureChallenge(weekStartKey(today), true).then((c) => c.title));
  // The tycoon company keeps running between visits
  await step("venture", () => tickVenture());
  for (const [name, fn] of Object.entries(tickHooks)) await step(name, () => fn(now));
  await step("notifications", () => runScheduledNotifications(now));
  return result;
}
