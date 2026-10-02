import { NextResponse, type NextRequest } from "next/server";
import { queries, type QueryName } from "@/lib/rpc/registry";
import { jsonError } from "@/lib/rpc/server";
import { boot } from "@/lib/rpc/boot";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const q = queries[name as QueryName];
  if (!q) return NextResponse.json({ error: `Unknown query ${name}` }, { status: 404 });
  try {
    await boot();
    const raw = req.nextUrl.searchParams.get("input");
    const input = q.input.parse(raw ? JSON.parse(raw) : {});
    const data = await (q.run as (i: unknown) => Promise<unknown>)(input);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e, name);
  }
}
