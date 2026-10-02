import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(e: unknown, name = "") {
  if (e instanceof ZodError) return NextResponse.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
  const msg = e instanceof Error ? e.message : String(e);
  const notFound = /No .* found|Record to update not found/i.test(msg);
  console.error(`[rpc] ${name}:`, msg, e instanceof Error && !msg ? e.stack : "");
  return NextResponse.json({ error: msg }, { status: notFound ? 404 : 400 });
}
