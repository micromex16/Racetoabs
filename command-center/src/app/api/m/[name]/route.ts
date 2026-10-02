import { NextResponse, type NextRequest } from "next/server";
import { mutations, type MutationName } from "@/lib/rpc/registry";
import { jsonError } from "@/lib/rpc/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const m = mutations[name as MutationName];
  if (!m) return NextResponse.json({ error: `Unknown mutation ${name}` }, { status: 404 });
  try {
    const body = await req.json().catch(() => ({}));
    const input = m.input.parse(body);
    const data = await (m.run as (i: unknown) => Promise<unknown>)(input);
    return NextResponse.json(data ?? { ok: true });
  } catch (e) {
    return jsonError(e, name);
  }
}
