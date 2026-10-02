import { NextResponse } from "next/server";
import { slackAuthUrl, slackAdapter } from "@/lib/integrations/slack";
import { redirectWithState } from "@/lib/integrations/oauth-state";

export async function GET() {
  if (!slackAdapter.isConfigured()) return NextResponse.json({ error: "Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET first (README → Slack)." }, { status: 400 });
  return redirectWithState((state) => slackAuthUrl(state));
}
