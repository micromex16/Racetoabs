import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, checkPassword, createSession, sessionCookieOptions } from "@/lib/auth";

const attempts = new Map<string, { n: number; at: number }>();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const a = attempts.get(ip);
  if (a && a.n >= 8 && Date.now() - a.at < 15 * 60_000) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!checkPassword(String(password ?? ""))) {
    attempts.set(ip, { n: (a?.n ?? 0) + 1, at: Date.now() });
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), sessionCookieOptions);
  return res;
}
