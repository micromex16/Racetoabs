import { NextResponse, type NextRequest } from "next/server";
import { verifySlackSignature, handleSlackEvent } from "@/lib/integrations/slack";
import { markError } from "@/lib/integrations/store";

// Slack Events API. Request URL: https://<your-app>/api/webhooks/slack
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySlackSignature(raw, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const body = JSON.parse(raw);
  if (body.type === "url_verification") return NextResponse.json({ challenge: body.challenge });
  // Slack retries if we're slow; ignore retries of events we've already handled.
  if (req.headers.get("x-slack-retry-num")) return NextResponse.json({ ok: true });
  if (body.type === "event_callback" && body.event) {
    try {
      await handleSlackEvent(body.event);
    } catch (e) {
      await markError("slack", e);
    }
  }
  return NextResponse.json({ ok: true });
}
