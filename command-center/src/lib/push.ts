import webpush from "web-push";
import { db } from "./db";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

let configured = false;
export function pushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
function configure() {
  if (configured || !pushConfigured()) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:owner@example.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export async function sendPush(payload: PushPayload) {
  if (!pushConfigured()) return { sent: 0, skipped: "VAPID keys not set" };
  configure();
  const subs = await db.pushSubscription.findMany();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, JSON.stringify(payload), { TTL: 60 * 60 * 6 });
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error("[push]", code, (e as Error).message);
      }
    }),
  );
  return { sent };
}

/** Send once per idempotency key (e.g. "morning:2026-10-02"). */
export async function sendOnce(key: string, payload: PushPayload) {
  const exists = await db.notificationLog.findUnique({ where: { key } });
  if (exists) return { sent: 0, skipped: "already sent" };
  await db.notificationLog.create({ data: { key } });
  return sendPush(payload);
}
