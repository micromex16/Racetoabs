"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Game "bucks": a green play bill. Fictional — never real money. */
export function BuckIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden>
      <rect x="1.5" y="5.5" width="21" height="13" rx="2.5" fill="#3fa34d" stroke="#1f6b2b" strokeWidth="1" />
      <rect x="4" y="8" width="16" height="8" rx="1.5" fill="none" stroke="#c9f2cf" strokeOpacity=".7" strokeWidth="1" />
      <circle cx="12" cy="12" r="2.6" fill="#c9f2cf" />
      <path d="M11 11.2h2M11 12.8h2" stroke="#1f6b2b" strokeWidth=".9" strokeLinecap="round" />
    </svg>
  );
}

export function fmtB(n: number, opts: { sign?: boolean } = {}) {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M` : a >= 1e4 ? `${(a / 1e3).toFixed(1)}k` : Math.round(a).toLocaleString("en-US");
  return `${n < 0 ? "−" : opts.sign && n > 0 ? "+" : ""}${s}`;
}

export function Bucks({ n, size = 14, className, sign }: { n: number; size?: number; className?: string; sign?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 num font-semibold", className)}>
      <BuckIcon size={size} />
      {fmtB(n, { sign })}
    </span>
  );
}

/** Re-render on an interval so live numbers tick. */
export function useNow(ms = 500) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function fmtLeft(ms: number) {
  if (ms <= 0) return "now";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
  return `${Math.round(h / 24)}d`;
}

export function Stars({ n, max = 5, className }: { n: number; max?: number; className?: string }) {
  return (
    <span className={cn("tracking-tight text-[#f5b819]", className)} aria-label={`${n} of ${max} stars`}>
      {"★".repeat(n)}
      <span className="text-muted/40">{"★".repeat(Math.max(0, max - n))}</span>
    </span>
  );
}
