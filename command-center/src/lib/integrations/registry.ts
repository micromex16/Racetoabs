import { db } from "../db";
import { registerTickHook } from "../hooks";
import type { CommsAdapter, Provider } from "./types";
import { gmailAdapter } from "./gmail";
import { slackAdapter } from "./slack";
import { whatsappAdapter } from "./whatsapp";
import { markError } from "./store";

// Pluggable adapters. Add a new channel by implementing CommsAdapter and listing it here.
export const ADAPTERS: CommsAdapter[] = [gmailAdapter, slackAdapter, whatsappAdapter];

export function adapterFor(p: Provider | string) {
  return ADAPTERS.find((a) => a.provider === p);
}
export function adapterForChannel(c: string) {
  return ADAPTERS.find((a) => a.channel === c);
}

export async function syncProvider(p: Provider, opts: { full?: boolean } = {}) {
  const a = adapterFor(p);
  if (!a) throw new Error(`No adapter for ${p}`);
  try {
    return await a.sync(opts);
  } catch (e) {
    await markError(p, e);
    throw e;
  }
}

/** Cron: sync each connected adapter when it's due. */
export async function syncDue(now = new Date()) {
  const out: Record<string, unknown> = {};
  const rows = await db.integration.findMany({ where: { status: { in: ["connected", "error"] } } });
  for (const r of rows) {
    const a = adapterFor(r.provider);
    if (!a || !a.isConfigured() || a.syncEveryMinutes <= 0) continue;
    const age = r.lastSyncAt ? (now.getTime() - r.lastSyncAt.getTime()) / 60_000 : Infinity;
    if (age < a.syncEveryMinutes - 0.5) continue;
    try {
      out[r.provider] = await a.sync();
    } catch (e) {
      await markError(r.provider as Provider, e);
      out[r.provider] = { error: (e as Error).message };
    }
  }
  return out;
}

export async function integrationsStatus() {
  const rows = await db.integration.findMany();
  return ADAPTERS.map((a) => {
    const r = rows.find((x) => x.provider === a.provider);
    return {
      provider: a.provider,
      channel: a.channel,
      label: a.label,
      configured: a.isConfigured(),
      missingEnv: a.requiredEnv.filter((k) => !process.env[k]),
      status: r?.status ?? "disconnected",
      account: r?.account ?? null,
      lastSyncAt: r?.lastSyncAt?.toISOString() ?? null,
      lastError: r?.lastError ?? null,
    };
  });
}

registerTickHook("comms", (now) => syncDue(now));
