import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "cc_oauth_state";

export function redirectWithState(url: (state: string) => string) {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(url(state));
  res.cookies.set(COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}

export function checkState(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("state");
  return !!s && s === req.cookies.get(COOKIE)?.value;
}

export function backToSettings(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings", process.env.APP_URL || req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.hash = "integrations";
  const res = NextResponse.redirect(url);
  res.cookies.delete(COOKIE);
  return res;
}
