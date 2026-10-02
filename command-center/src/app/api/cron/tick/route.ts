import { NextResponse, type NextRequest } from "next/server";
import { tick } from "@/lib/cron";
import "@/lib/integrations/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sends the Authorization header; external pingers can use ?key=
  return req.headers.get("authorization") === `Bearer ${secret}` || req.nextUrl.searchParams.get("key") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await tick());
}
export const POST = GET;
