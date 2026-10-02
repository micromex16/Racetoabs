import type { NextRequest } from "next/server";
import { gmailHandleCallback, gmailAdapter } from "@/lib/integrations/gmail";
import { checkState, backToSettings } from "@/lib/integrations/oauth-state";
import { markError } from "@/lib/integrations/store";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!checkState(req)) return backToSettings(req, { error: "gmail_state" });
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return backToSettings(req, { error: req.nextUrl.searchParams.get("error") ?? "gmail_denied" });
  try {
    await gmailHandleCallback(code);
    await gmailAdapter.sync({ full: true }).catch((e) => markError("gmail", e));
    return backToSettings(req, { connected: "gmail" });
  } catch (e) {
    await markError("gmail", e);
    return backToSettings(req, { error: "gmail_failed" });
  }
}
