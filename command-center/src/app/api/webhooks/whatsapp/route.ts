import { NextResponse, type NextRequest } from "next/server";
import { verifyWhatsAppSignature, handleWhatsAppWebhook } from "@/lib/integrations/whatsapp";
import { markError } from "@/lib/integrations/store";

// Meta webhook. Callback URL: https://<your-app>/api/webhooks/whatsapp
// Verify token: WHATSAPP_VERIFY_TOKEN. Subscribe the WhatsApp Business Account to "messages".

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  try {
    await handleWhatsAppWebhook(JSON.parse(raw));
  } catch (e) {
    await markError("whatsapp", e);
  }
  return NextResponse.json({ ok: true });
}
