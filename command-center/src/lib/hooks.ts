// Dependency-free hook registry (avoids import cycles between cron, services and adapters).
export type TickHook = (now: Date) => Promise<unknown>;
export const tickHooks: Record<string, TickHook> = {};
export function registerTickHook(name: string, fn: TickHook) {
  tickHooks[name] = fn;
}
