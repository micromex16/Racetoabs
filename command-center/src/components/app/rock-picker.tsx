"use client";
import { useState } from "react";
import { useQ } from "@/lib/client";
import { cn, RING_COLORS } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

/** "Which rock does this serve?" — weekly rocks first, then quarterly rocks, then annual goals. */
export function RockPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { data } = useQ("goals");
  const [more, setMore] = useState(false);
  if (!data) return <div className="h-24 animate-pulse rounded-xl bg-panel" />;
  const annual = data.tree.flatMap((n) => (n.level === "EXIT" ? n.children : [n])).filter((n) => n.level === "ANNUAL");
  const Opt = ({ id, label, sub, color }: { id: string; label: string; sub?: string; color?: string }) => (
    <button
      type="button"
      onClick={() => onChange(value === id ? null : id)}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition",
        value === id ? "border-accent/60 bg-accent/10" : "border-line bg-panel hover:bg-panel-2",
      )}
    >
      <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: color ?? "var(--muted)" }} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-fg">{label}</span>
        {sub && <span className="text-[11px] text-muted">{sub}</span>}
      </span>
    </button>
  );
  return (
    <div className="space-y-1.5">
      {data.weeklyRocks.map((r, i) => (
        <Opt key={r.id} id={r.id} label={r.title} sub={`This week · Rock #${i + 1} · ${r.progress}%`} color={RING_COLORS[i % 3]} />
      ))}
      {data.quarterlyRocks.map((r, i) => (
        <Opt key={r.id} id={r.id} label={r.title} sub={`Quarter rock #${i + 1} · ${r.progress}%`} color="var(--accent)" />
      ))}
      <button type="button" onClick={() => setMore(!more)} className="flex items-center gap-1 px-1 py-1 text-xs text-muted hover:text-fg-2">
        <ChevronDown className={cn("size-3.5 transition", more && "rotate-180")} /> Annual goals
      </button>
      {more && annual.map((g) => <Opt key={g.id} id={g.id} label={g.title} sub={`${g.year ?? ""} goal`} />)}
    </div>
  );
}
