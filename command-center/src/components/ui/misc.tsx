"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-2xl", className)} {...props} />;
}

export function SectionTitle({ children, right, className, count }: { children: React.ReactNode; right?: React.ReactNode; className?: string; count?: number }) {
  return (
    <div className={cn("mb-2.5 flex items-center justify-between gap-3 px-1", className)}>
      <h2 className="eyebrow flex items-center gap-2">
        {children}
        {count != null && <span className="num rounded-full bg-panel-2 px-1.5 py-px text-[10px] text-fg-2">{count}</span>}
      </h2>
      {right}
    </div>
  );
}

const BADGE = {
  neutral: "bg-panel-2 text-fg-2 border-line",
  accent: "bg-accent/12 text-accent border-accent/25",
  good: "bg-good/12 text-good border-good/25",
  warn: "bg-warn/12 text-warn border-warn/25",
  bad: "bg-bad/12 text-bad border-bad/25",
  r1: "bg-r1/12 text-r1 border-r1/25",
  r2: "bg-r2/12 text-r2 border-r2/25",
  r3: "bg-r3/12 text-r3 border-r3/25",
} as const;

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof BADGE }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none", BADGE[tone], className)} {...props} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-2 bg-panel-2 px-1 font-mono text-[10px] text-fg-2", className)}>
      {children}
    </kbd>
  );
}

export function Empty({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-2 px-6 py-8 text-center">
      {icon && <div className="text-muted [&_svg]:size-6">{icon}</div>}
      <p className="text-sm font-medium text-fg-2">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-xl bg-[linear-gradient(90deg,var(--panel)_0%,var(--panel-2)_50%,var(--panel)_100%)] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-xl border border-line bg-panel p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[10px] px-3 py-1.5 text-xs font-medium transition",
            value === o.value ? "bg-panel-2 text-fg shadow-sm ring-1 ring-line-2" : "text-muted hover:text-fg-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_TONE = { green: "good", amber: "warn", red: "bad", none: "neutral" } as const;
const STATUS_LABEL = { green: "On target", amber: "Close", red: "Behind", none: "No target" } as const;

/** RAG status: always icon-shape + label, never color alone. */
export function RagBadge({ rag, compact }: { rag: "green" | "amber" | "red" | "none"; compact?: boolean }) {
  const shape = rag === "green" ? "●" : rag === "amber" ? "▲" : rag === "red" ? "■" : "○";
  return (
    <Badge tone={STATUS_TONE[rag]} aria-label={STATUS_LABEL[rag]}>
      <span aria-hidden className="text-[9px]">
        {shape}
      </span>
      {!compact && STATUS_LABEL[rag]}
    </Badge>
  );
}
