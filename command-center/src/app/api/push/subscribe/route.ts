import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const sub = await req.json();
  if (!sub?.endpoint || !sub?.keys) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { endpoint: sub.endpoint, keys: sub.keys, userAgent: req.headers.get("user-agent") ?? "" },
    update: { keys: sub.keys },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { endpoint } = await req.json().catch(() => ({}));
  if (endpoint) await db.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
