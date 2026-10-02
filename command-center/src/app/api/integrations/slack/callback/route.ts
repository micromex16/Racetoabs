import type { NextRequest } from "next/server";
import { slackHandleCallback, slackAdapter } from "@/lib/integrations/slack";
import { checkState, backToSettings } from "@/lib/integrations/oauth-state";
import { markError } from "@/lib/integrations/store";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!checkState(req)) return backToSettings(req, { error: "slack_state" });
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return backToSettings(req, { error: req.nextUrl.searchParams.get("error") ?? "slack_denied" });
  try {
    await slackHandleCallback(code);
    await slackAdapter.sync({ full: true }).catch((e) => markError("slack", e));
    return backToSettings(req, { connected: "slack" });
  } catch (e) {
    await markError("slack", e);
    return backToSettings(req, { error: "slack_failed" });
  }
}
