import { gmail as gmailApi, auth, type gmail_v1 } from "@googleapis/gmail";
import type { Thread } from "@prisma/client";
import { db } from "../db";
import type { CommsAdapter, OutboundDraft, SyncResult } from "./types";
import { getSecret, getIntegration, saveConnection, saveCursor, updateSecret } from "./store";
import { ingestThread, htmlToText, stripQuoted } from "./ingest";

// Gmail API adapter. Superhuman is a client on top of Gmail, so everything this
// adapter does (read state, archive, sends) shows up in Superhuman too.

export const GMAIL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.modify", // read, label, mark read, archive, create drafts, send
];

type Tokens = { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null; scope?: string; token_type?: string | null };

function redirectUri() {
  return `${process.env.APP_URL?.replace(/\/$/, "")}/api/integrations/gmail/callback`;
}

export function oauthClient() {
  return new auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri());
}

export function gmailAuthUrl(state: string) {
  return oauthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GMAIL_SCOPES, include_granted_scopes: true, state });
}

export async function gmailHandleCallback(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const g = gmailApi({ version: "v1", auth: client });
  const profile = await g.users.getProfile({ userId: "me" });
  await saveConnection("gmail", { secret: tokens, account: profile.data.emailAddress ?? null, cursor: {} });
  return profile.data.emailAddress;
}

async function client() {
  const tokens = await getSecret<Tokens>("gmail");
  if (!tokens?.refresh_token && !tokens?.access_token) throw new Error("Gmail is not connected.");
  const c = oauthClient();
  c.setCredentials(tokens);
  c.on("tokens", (t) => void updateSecret("gmail", { ...tokens, ...t, refresh_token: t.refresh_token ?? tokens.refresh_token }));
  return { g: gmailApi({ version: "v1", auth: c }), account: (await getIntegration("gmail"))?.account ?? "" };
}

const header = (m: gmail_v1.Schema$Message, name: string) => m.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

function parseAddr(s: string) {
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), address: m[2].trim() } : { name: "", address: s.trim() };
}
function parseList(s: string) {
  return s
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map(parseAddr);
}

function decode(data?: string | null) {
  return data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";
}

function bodyOf(p?: gmail_v1.Schema$MessagePart): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return decode(p.body.data);
  if (p.parts?.length) {
    const plain = p.parts.map((x) => (x.mimeType === "text/plain" ? decode(x.body?.data) : "")).find(Boolean);
    if (plain) return plain;
    for (const part of p.parts) {
      const b = bodyOf(part);
      if (b) return b;
    }
  }
  if (p.mimeType === "text/html" && p.body?.data) return htmlToText(decode(p.body.data));
  return "";
}

async function pullThread(g: gmail_v1.Gmail, id: string, me: string) {
  const t = await g.users.threads.get({ userId: "me", id, format: "full" });
  const msgs = t.data.messages ?? [];
  if (!msgs.length) return { added: 0 };
  const labels = new Set(msgs.flatMap((m) => m.labelIds ?? []));
  const unreadCount = msgs.filter((m) => m.labelIds?.includes("UNREAD")).length;
  const people = new Map<string, { name?: string; address: string }>();
  for (const m of msgs) for (const a of [parseAddr(header(m, "From")), ...parseList(header(m, "To")), ...parseList(header(m, "Cc"))]) if (a.address && a.address.toLowerCase() !== me.toLowerCase()) people.set(a.address.toLowerCase(), a);
  const r = await ingestThread({
    channel: "EMAIL",
    externalId: id,
    subject: header(msgs[0], "Subject"),
    participants: [...people.values()].slice(0, 12),
    unread: unreadCount > 0,
    unreadCount,
    archived: !labels.has("INBOX") && !labels.has("SENT"),
    meta: { labels: [...labels] },
    messages: msgs.map((m) => {
      const from = parseAddr(header(m, "From"));
      return {
        externalId: m.id!,
        fromName: from.name || from.address,
        fromAddr: from.address,
        to: parseList(header(m, "To")),
        body: stripQuoted(bodyOf(m.payload)).slice(0, 20_000),
        sentAt: new Date(Number(m.internalDate ?? Date.now())),
        isFromMe: from.address.toLowerCase() === me.toLowerCase() || !!m.labelIds?.includes("SENT"),
        meta: { messageId: header(m, "Message-ID"), references: header(m, "References") },
      };
    }),
  });
  return r;
}

export const gmailAdapter: CommsAdapter = {
  provider: "gmail",
  channel: "EMAIL",
  label: "Email (Gmail / Superhuman)",
  requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_URL", "ENCRYPTION_KEY"],
  syncEveryMinutes: 5,
  isConfigured: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

  async sync(opts = {}): Promise<SyncResult> {
    const { g, account } = await client();
    const integ = await getIntegration("gmail");
    const cursor = (integ?.cursor ?? {}) as { historyId?: string };
    let threadIds = new Set<string>();
    let full = !!opts.full || !cursor.historyId;

    if (!full) {
      try {
        let pageToken: string | undefined;
        do {
          const h = await g.users.history.list({ userId: "me", startHistoryId: cursor.historyId, pageToken, historyTypes: ["messageAdded", "labelAdded", "labelRemoved"], maxResults: 500 });
          for (const rec of h.data.history ?? []) {
            for (const x of [...(rec.messagesAdded ?? []), ...(rec.labelsAdded ?? []), ...(rec.labelsRemoved ?? [])]) if (x.message?.threadId) threadIds.add(x.message.threadId);
          }
          pageToken = h.data.nextPageToken ?? undefined;
        } while (pageToken);
      } catch (e) {
        // historyId too old (404) → full resync
        if ((e as { code?: number }).code === 404) full = true;
        else throw e;
      }
    }
    if (full) {
      threadIds = new Set();
      const list = await g.users.threads.list({ userId: "me", q: "newer_than:21d -in:chats -category:promotions -category:social", maxResults: 100 });
      for (const t of list.data.threads ?? []) if (t.id) threadIds.add(t.id);
    }
    const profile = await g.users.getProfile({ userId: "me" });
    let messages = 0;
    for (const id of threadIds) messages += (await pullThread(g, id, account)).added;
    await saveCursor("gmail", { historyId: profile.data.historyId ?? cursor.historyId ?? null });
    return { threads: threadIds.size, messages, full };
  },

  async send(d: OutboundDraft) {
    const { g, account } = await client();
    let inReplyTo = "";
    let references = "";
    if (d.thread) {
      const last = await db.message.findFirst({ where: { threadId: d.thread.id }, orderBy: { sentAt: "desc" } });
      const meta = (last?.meta ?? {}) as { messageId?: string; references?: string };
      inReplyTo = meta.messageId ?? "";
      references = [meta.references, meta.messageId].filter(Boolean).join(" ");
    }
    const subject = d.subject || (d.thread?.subject ? (/^re:/i.test(d.thread.subject) ? d.thread.subject : `Re: ${d.thread.subject}`) : "");
    const mime = [
      `From: ${account}`,
      `To: ${d.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${references}`] : []),
      "",
      d.body,
    ].join("\r\n");
    const raw = Buffer.from(mime).toString("base64url");
    const r = await g.users.messages.send({ userId: "me", requestBody: { raw, threadId: d.thread?.externalId } });
    return { externalId: r.data.id!, threadExternalId: r.data.threadId ?? undefined };
  },

  async markRead(t: Thread) {
    const { g } = await client();
    await g.users.threads.modify({ userId: "me", id: t.externalId, requestBody: { removeLabelIds: ["UNREAD"] } });
  },

  async archive(t: Thread) {
    const { g } = await client();
    await g.users.threads.modify({ userId: "me", id: t.externalId, requestBody: { removeLabelIds: ["INBOX"] } });
  },
};
