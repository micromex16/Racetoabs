import { getSettings } from "./settings";
import { todayKey, weekStartKey } from "./time";
import { ensureRecurringForWeek } from "./services/recurring";
import { resurfaceScheduled } from "./services/parking";
import { snapshotAutoMetrics } from "./services/metrics";
import { runScheduledNotifications } from "./services/notify";
import { seedIfEmpty } from "./seed";

export type TickHook = (now: Date) => Promise<unknown>;
const hooks: Record<string, TickHook> = {};
/** Integrations register their sync here (see lib/integrations/registry.ts). */
export function registerTickHook(name: string, fn: TickHook) {
  hooks[name] = fn;
}

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
  for (const [name, fn] of Object.entries(hooks)) await step(name, () => fn(now));
  await step("notifications", () => runScheduledNotifications(now));
  return result;
}
