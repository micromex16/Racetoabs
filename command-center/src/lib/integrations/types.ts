import type { Channel, Thread } from "@prisma/client";

export type Provider = "gmail" | "slack" | "whatsapp";

export type SyncResult = { threads: number; messages: number; full?: boolean; note?: string };

export type OutboundDraft = {
  thread: (Thread & { meta: unknown }) | null;
  to: string;
  subject: string;
  body: string;
};

/** Every comms integration implements this. Messages are always stored locally
 *  (Thread/Message) so search and the agent work even when a provider is down. */
export interface CommsAdapter {
  provider: Provider;
  channel: Channel;
  label: string;
  /** Env vars required for the adapter to work at all */
  requiredEnv: string[];
  isConfigured(): boolean;
  /** Pull new messages into the local store */
  sync(opts?: { full?: boolean }): Promise<SyncResult>;
  /** Send a message (only ever called after the user approves a draft) */
  send(draft: OutboundDraft): Promise<{ externalId: string; threadExternalId?: string }>;
  markRead?(thread: Thread): Promise<void>;
  archive?(thread: Thread): Promise<void>;
  /** Minimum minutes between cron syncs (webhooks deliver in between) */
  syncEveryMinutes: number;
}
