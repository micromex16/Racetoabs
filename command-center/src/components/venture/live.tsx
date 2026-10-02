"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Flame, Users, Briefcase } from "lucide-react";
import { useQ } from "@/lib/client";
import { sfx } from "@/lib/game/sound";
import { Badge } from "@/components/ui/misc";
import { Bucks, fmtB } from "./bucks";
import { cn } from "@/lib/utils";

const SEEN = "cc.venture.seen";
const TOAST: Record<string, string> = { card: "🃏", contract_done: "📦", contract_failed: "⚠️", quit: "🚪", offer: "📨", offer_auto: "✍️", levelup: "⭐" };

/** The company runs all day: surface what it does as toasts wherever you are in the app. */
export function VentureEvents() {
  const { data } = useQ("venture.brief", undefined, { refreshInterval: 60_000 });
  const router = useRouter();
  React.useEffect(() => {
    if (!data) return;
    const newest = data.latest[0]?.at;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN);
    } catch {}
    if (!newest) return;
    try {
      localStorage.setItem(SEEN, newest);
    } catch {}
    if (!seen) return;
    const fresh = data.latest.filter((l) => l.at > seen! && TOAST[l.kind]).reverse().slice(-3);
    for (const l of fresh) {
      toast(l.text, { icon: TOAST[l.kind], description: data.name, action: { label: "Open", onClick: () => router.push("/venture") } });
    }
    if (fresh.some((l) => l.kind === "contract_done")) sfx.bigCoin();
    else if (fresh.some((l) => l.kind === "card")) sfx.bell();
  }, [data, router]);
  return null;
}

/** Today-screen card: the company at a glance. */
export function VentureCard() {
  const { data: b, isLoading } = useQ("venture.brief", undefined, { refreshInterval: 60_000 });
  if (isLoading && b === undefined) return <div className="glass h-40 animate-pulse rounded-2xl" />;
  if (!b)
    return (
      <Link href="/venture" className="glass group relative block overflow-hidden rounded-2xl p-4">
        <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-[#3fa34d]/20 blur-3xl" />
        <span className="eyebrow">Tycoon</span>
        <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
          <Briefcase className="size-5" /> Start a company
        </p>
        <p className="mt-1 text-sm text-fg-2">Any industry. Hire, lease, win contracts — it runs live while you work, and your real work powers it.</p>
        <p className="mt-3 text-xs font-medium text-accent group-hover:underline">Found one →</p>
      </Link>
    );
  return (
    <Link href="/venture" className="glass group relative block overflow-hidden rounded-2xl p-4">
      <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-[#3fa34d]/15 blur-3xl" />
      <div className="flex items-center justify-between">
        <span className="eyebrow">Your company</span>
        {b.pendingCards > 0 && <Badge tone="accent">{b.pendingCards} decision{b.pendingCards > 1 ? "s" : ""}</Badge>}
      </div>
      <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
        <span className="text-2xl">{b.emoji}</span>
        <span className="truncate">{b.name}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Bucks n={b.cash} />
        <span className={cn("num text-xs", b.netPerHour >= 0 ? "text-good" : "text-bad")}>{fmtB(b.netPerHour, { sign: true })}/h</span>
        <span className="flex items-center gap-1 text-xs text-fg-2">
          <Users className="size-3.5" /> {b.staff}
        </span>
        <span className={cn("flex items-center gap-1 text-xs", b.momentum >= 1.5 ? "text-[#f97316]" : "text-fg-2")}>
          <Flame className="size-3.5" /> ×{b.momentum.toFixed(1)}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {b.lease} · {b.activeContracts} contract{b.activeContracts === 1 ? "" : "s"} running{b.offers ? ` · ${b.offers} offer${b.offers > 1 ? "s" : ""} waiting` : ""}
      </p>
    </Link>
  );
}
