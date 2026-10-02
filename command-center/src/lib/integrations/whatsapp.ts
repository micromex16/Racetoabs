import { createHmac, timingSafeEqual } from "crypto";
import { db } from "../db";
import type { CommsAdapter, OutboundDraft, SyncResult } from "./types";
import { saveConnection } from "./store";
import { ingestThread } from "./ingest";

// WhatsApp Business Cloud API (Meta). Works only with a WhatsApp Business number
// registered in Meta's WhatsApp Manager — a personal WhatsApp line cannot be read
// or sent from by any official API. Inbound messages arrive by webhook only (there
// is no history API), so the app stores them as they come in.

const API = () => `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v23.0"}`;
const WINDOW_MS = 24 * 3600_000;

async function graph(path: string, init?: RequestInit) {
  const r = await fetch(`${API()}/${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? `WhatsApp API ${r.status}`);
  return j;
}

export const whatsappAdapter: CommsAdapter = {
  provider: "whatsapp",
  channel: "WHATSAPP",
  label: "WhatsApp Business",
  requiredEnv: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"],
  syncEveryMinutes: 0, // webhook-only
  isConfigured: () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),

  /** "Activate": verify the token + number and mark connected. Messages arrive by webhook. */
  async sync(): Promise<SyncResult> {
    const info = await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`);
    await saveConnection("whatsapp", { account: `${info.verified_name ?? "WhatsApp"} · ${info.display_phone_number ?? ""}`.trim() });
    await db.integration.update({ where: { provider: "whatsapp" }, data: { lastSyncAt: new Date() } });
    return { threads: 0, messages: 0, note: "Connected. Inbound messages arrive via webhook." };
  },

  async send(d: OutboundDraft) {
    const to = ((d.thread?.meta as { wa_id?: string })?.wa_id ?? d.thread?.externalId ?? d.to).replace(/[^\d]/g, "");
    if (d.thread) {
      const lastIn = await db.message.findFirst({ where: { threadId: d.thread.id, isFromMe: false }, orderBy: { sentAt: "desc" } });
      if (!lastIn || Date.now() - lastIn.sentAt.getTime() > WINDOW_MS) {
        throw new Error("Outside WhatsApp's 24-hour reply window. Meta only allows pre-approved template messages until the contact writes again — send a template from WhatsApp Manager, or message them from the phone.");
      }
    }
    const r = await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: d.body } }),
    });
    return { externalId: r.messages?.[0]?.id ?? `out-${Date.now()}`, threadExternalId: to };
  },
};

// ───────── Webhook ─────────

export function verifyWhatsAppSignature(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header) return false;
  const mine = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(mine);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

type WaMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  image?: { caption?: string };
  document?: { caption?: string; filename?: string };
  audio?: unknown;
  video?: { caption?: string };
  location?: { name?: string; address?: string };
  reaction?: { emoji?: string };
};

function textOf(m: WaMessage) {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "button":
      return m.button?.text ?? "";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    case "image":
      return `[photo] ${m.image?.caption ?? ""}`.trim();
    case "document":
      return `[document${m.document?.filename ? `: ${m.document.filename}` : ""}] ${m.document?.caption ?? ""}`.trim();
    case "audio":
      return "[voice note]";
    case "video":
      return `[video] ${m.video?.caption ?? ""}`.trim();
    case "location":
      return `[location] ${m.location?.name ?? ""} ${m.location?.address ?? ""}`.trim();
    case "reaction":
      return `[reacted ${m.reaction?.emoji ?? ""}]`;
    default:
      return `[${m.type}]`;
  }
}

export async function handleWhatsAppWebhook(body: {
  entry?: { changes?: { value?: { contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: WaMessage[] } }[] }[];
}) {
  let added = 0;
  for (const e of body.entry ?? []) {
    for (const c of e.changes ?? []) {
      const v = c.value;
      if (!v?.messages?.length) continue; // statuses (sent/delivered/read) are ignored
      const names = new Map((v.contacts ?? []).map((x) => [x.wa_id, x.profile?.name ?? x.wa_id]));
      const byFrom = new Map<string, WaMessage[]>();
      for (const m of v.messages) byFrom.set(m.from, [...(byFrom.get(m.from) ?? []), m]);
      for (const [from, msgs] of byFrom) {
        const name = names.get(from) ?? from;
        const r = await ingestThread({
          channel: "WHATSAPP",
          externalId: from,
          participants: [{ name, address: from }],
          meta: { wa_id: from },
          messages: msgs.map((m) => ({ externalId: m.id, fromName: name, fromAddr: from, body: textOf(m), sentAt: new Date(Number(m.timestamp) * 1000), isFromMe: false })),
        });
        if (r.added) {
          await db.thread.update({ where: { id: r.thread.id }, data: { unread: true, unreadCount: { increment: r.added } } });
          added += r.added;
        }
      }
    }
  }
  if (added) await db.integration.upsert({ where: { provider: "whatsapp" }, create: { provider: "whatsapp", status: "connected", lastSyncAt: new Date() }, update: { lastSyncAt: new Date(), status: "connected", lastError: null } });
  return { added };
}
