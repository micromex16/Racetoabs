import { NextResponse } from "next/server";
import { gmailAuthUrl, gmailAdapter } from "@/lib/integrations/gmail";
import { redirectWithState } from "@/lib/integrations/oauth-state";

export async function GET() {
  if (!gmailAdapter.isConfigured()) return NextResponse.json({ error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (README → Email)." }, { status: 400 });
  return redirectWithState((state) => gmailAuthUrl(state));
}
