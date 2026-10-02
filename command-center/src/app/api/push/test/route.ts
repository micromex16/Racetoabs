import { NextResponse, type NextRequest } from "next/server";
import { sendPush, pushConfigured } from "@/lib/push";
import { morningCard, closeNudge } from "@/lib/services/notify";

export async function POST(req: NextRequest) {
  if (!pushConfigured()) return NextResponse.json({ error: "Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY first." }, { status: 400 });
  const { kind } = await req.json().catch(() => ({ kind: "morning" }));
  const payload = kind === "close" ? await closeNudge() : await morningCard();
  return NextResponse.json(await sendPush(payload));
}
