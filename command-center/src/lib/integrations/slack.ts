import { WebClient } from "@slack/web-api";
import { createHmac, timingSafeEqual } from "crypto";
import type { Thread } from "@prisma/client";
import { db } from "../db";
import type { CommsAdapter, OutboundDraft, SyncResult } from "./types";
import { getSecret, getIntegration, saveConnection, saveCursor } from "./store";
import { ingestThread } from "./ingest";

// Slack adapter. Reads the DMs, group DMs and channels you're in with your *user*
// token, posts as you, reacts, and receives real-time events (mentions, DMs) via
// the Events API webhook.

export const SLACK_BOT_SCOPES = ["app_mentions:read", "chat:write", "users:read", "im:history"];
export const SLACK_USER_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "mpim:history",
  "mpim:read",
  "users:read",
  "chat:write",
  "reactions:write",
];

type SlackSecret = { botToken?: string; userToken: string; userId: string; teamId?: string; teamName?: string };
type SlackConfig = { users?: Record<string, string>; usersAt?: string; channels?: Record<string, { name: string; kind: "im" | "mpim" | "channel"; user?: string }> };

function redirectUri() {
  return `${process.env.APP_URL?.replace(/\/$/, "")}/api/integrations/slack/callback`;
}

export function slackAuthUrl(state: string) {
  const u = new URL("https://slack.com/oauth/v2/authorize");
  u.searchParams.set("client_id", process.env.SLACK_CLIENT_ID!);
  u.searchParams.set("scope", SLACK_BOT_SCOPES.join(","));
  u.searchParams.set("user_scope", SLACK_USER_SCOPES.join(","));
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("state", state);
  return u.toString();
}

export async function slackHandleCallback(code: string) {
  const r = await new WebClient().oauth.v2.access({ client_id: process.env.SLACK_CLIENT_ID!, client_secret: process.env.SLACK_CLIENT_SECRET!, code, redirect_uri: redirectUri() });
  if (!r.ok || !r.authed_user?.access_token) throw new Error(r.error ?? "Slack OAuth failed (no user token — check User Token Scopes).");
  const secret: SlackSecret = { botToken: r.access_token, userToken: r.authed_user.access_token, userId: r.authed_user.id!, teamId: r.team?.id, teamName: r.team?.name };
  await saveConnection("slack", { secret, account: `${r.team?.name ?? "Slack"}`, cursor: {}, config: {} });
  return secret;
}

async function ctx() {
  const s = await getSecret<SlackSecret>("slack");
  if (!s?.userToken) throw new Error("Slack is not connected.");
  const integ = await getIntegration("slack");
  return { s, user: new WebClient(s.userToken), config: (integ?.config ?? {}) as SlackConfig, cursor: (integ?.cursor ?? {}) as Record<string, string> };
}

async function userMap(user: WebClient, config: SlackConfig): Promise<{ users: Record<string, string>; at: string }> {
  if (config.users && config.usersAt && Date.now() - Date.parse(config.usersAt) < 86_400_000) return { users: config.users, at: config.usersAt };
  const map: Record<string, string> = {};
  let cursor: string | undefined;
  do {
    const r = await user.users.list({ limit: 200, cursor });
    for (const m of r.members ?? []) if (m.id) map[m.id] = m.profile?.display_name || m.real_name || m.name || m.id;
    cursor = r.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return { users: map, at: new Date().toISOString() };
}

/** Replace <@U123> mentions with names. */
function render(text: string, users: Record<string, string>) {
  return text
    .replace(/<@([A-Z0-9]+)(\|[^>]+)?>/g, (_, id) => `@${users[id] ?? id}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

type SlackMsg = { ts?: string; user?: string; text?: string; subtype?: string; bot_id?: string; thread_ts?: string; reply_count?: number };

async function ingestConversation(channelId: string, info: { name: string; kind: "im" | "mpim" | "channel"; user?: string }, msgs: SlackMsg[], me: string, users: Record<string, string>) {
  const real = msgs.filter((m) => m.ts && (!m.subtype || m.subtype === "thread_broadcast" || m.subtype === "file_share"));
  if (!real.length) return 0;
  // Channels are noisy: only DMs, group DMs and @-mentions make a thread unread.
  const important = real.filter((m) => m.user !== me && (info.kind !== "channel" || (m.text ?? "").includes(`<@${me}>`)));
  const r = await ingestThread({
    channel: "SLACK",
    externalId: channelId,
    subject: info.kind === "channel" ? `#${info.name}` : info.name,
    participants: info.kind === "im" && info.user ? [{ name: users[info.user] ?? info.user, address: info.user }] : [{ name: info.kind === "channel" ? `#${info.name}` : info.name, address: channelId }],
    meta: { channel: channelId, kind: info.kind },
    messages: real.map((m) => ({
      externalId: `${channelId}:${m.ts}`,
      fromName: m.user ? (users[m.user] ?? m.user) : "bot",
      fromAddr: m.user ?? m.bot_id ?? "",
      body: render(m.text ?? "", users),
      sentAt: new Date(Number(m.ts) * 1000),
      isFromMe: m.user === me,
      meta: { ts: m.ts, thread_ts: m.thread_ts ?? null },
    })),
  });
  if (r.added && important.length) {
    await db.thread.update({ where: { id: r.thread.id }, data: { unread: true, unreadCount: { increment: important.length } } });
  }
  return r.added;
}

export const slackAdapter: CommsAdapter = {
  provider: "slack",
  channel: "SLACK",
  label: "Slack",
  requiredEnv: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_SIGNING_SECRET", "APP_URL", "ENCRYPTION_KEY"],
  syncEveryMinutes: 10,
  isConfigured: () => !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET),

  async sync(opts = {}): Promise<SyncResult> {
    const { s, user, config, cursor } = await ctx();
    const { users, at: usersAt } = await userMap(user, config);
    const channels: NonNullable<SlackConfig["channels"]> = {};
    let next: string | undefined;
    do {
      const r = await user.users.conversations({ types: "im,mpim,private_channel,public_channel", exclude_archived: true, limit: 200, cursor: next });
      for (const c of r.channels ?? []) {
        if (!c.id) continue;
        if (c.is_im) channels[c.id] = { name: users[c.user ?? ""] ?? "Direct message", kind: "im", user: c.user };
        else if (c.is_mpim) channels[c.id] = { name: (c.name ?? "group").replace(/^mpdm-|--\d+$/g, "").replace(/--/g, ", "), kind: "mpim" };
        else channels[c.id] = { name: c.name ?? c.id, kind: "channel" };
      }
      next = r.response_metadata?.next_cursor || undefined;
    } while (next);

    const since = String(Date.now() / 1000 - 3 * 86_400);
    const newCursor: Record<string, string> = { ...cursor };
    let messages = 0;
    let threads = 0;
    // DMs and group DMs first; cap per sync to stay inside rate limits.
    const order = Object.entries(channels).sort(([, a], [, b]) => (a.kind === "channel" ? 1 : 0) - (b.kind === "channel" ? 1 : 0)).slice(0, 60);
    for (const [id, info] of order) {
      const oldest = opts.full ? since : (cursor[id] ?? since);
      try {
        const h = await user.conversations.history({ channel: id, oldest, limit: 100, inclusive: false });
        const msgs = (h.messages ?? []) as SlackMsg[];
        if (!msgs.length) continue;
        const added = await ingestConversation(id, info, msgs, s.userId, users);
        messages += added;
        if (added) threads++;
        newCursor[id] = msgs.reduce((a, m) => (m.ts && m.ts > a ? m.ts : a), oldest);
      } catch (e) {
        if ((e as { data?: { error?: string } }).data?.error === "ratelimited") break;
        if ((e as { data?: { error?: string } }).data?.error !== "not_in_channel") throw e;
      }
    }
    await db.integration.update({ where: { provider: "slack" }, data: { config: { users, usersAt, channels } } });
    await saveCursor("slack", newCursor);
    return { threads, messages, full: !!opts.full };
  },

  async send(d: OutboundDraft) {
    const { user } = await ctx();
    const channel = (d.thread?.meta as { channel?: string })?.channel ?? d.thread?.externalId ?? d.to;
    const r = await user.chat.postMessage({ channel, text: d.body });
    if (!r.ok || !r.ts) throw new Error(r.error ?? "Slack post failed");
    return { externalId: `${r.channel ?? channel}:${r.ts}`, threadExternalId: r.channel ?? channel };
  },

  async markRead(_t: Thread) {
    // Local-only: marking read in Slack needs broader *:write scopes than this app asks for.
  },
};

/** React to the latest inbound message in a Slack conversation (e.g. 👍 = "seen, on it"). */
export async function slackReact(threadId: string, emoji = "thumbsup") {
  const { user } = await ctx();
  const t = await db.thread.findUniqueOrThrow({ where: { id: threadId } });
  const m = await db.message.findFirst({ where: { threadId, isFromMe: false }, orderBy: { sentAt: "desc" } });
  if (!m) throw new Error("No message to react to.");
  const ts = (m.meta as { ts?: string })?.ts ?? m.externalId.split(":")[1];
  await user.reactions.add({ channel: (t.meta as { channel?: string })?.channel ?? t.externalId, timestamp: ts, name: emoji });
  return { ok: true };
}

// ───────── Events API webhook ─────────

export function verifySlackSignature(rawBody: string, ts: string | null, sig: string | null) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false;
  const mine = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(mine);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

type SlackEvent = { type: string; channel?: string; channel_type?: string; user?: string; text?: string; ts?: string; subtype?: string; bot_id?: string; thread_ts?: string };

export async function handleSlackEvent(ev: SlackEvent) {
  if (!ev.channel || !ev.ts || ev.bot_id || (ev.subtype && ev.subtype !== "thread_broadcast" && ev.subtype !== "file_share")) return { skipped: true };
  const { s, config } = await ctx();
  const users = config.users ?? {};
  const known = config.channels?.[ev.channel];
  const kind: "im" | "mpim" | "channel" = known?.kind ?? (ev.channel_type === "im" ? "im" : ev.channel_type === "mpim" ? "mpim" : "channel");
  const info = known ?? { name: kind === "im" ? (users[ev.user ?? ""] ?? "Direct message") : ev.channel, kind, user: kind === "im" ? ev.user : undefined };
  const added = await ingestConversation(ev.channel, info, [{ ts: ev.ts, user: ev.user, text: ev.text, thread_ts: ev.thread_ts }], s.userId, users);
  return { added };
}
