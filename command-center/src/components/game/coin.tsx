"use client";
import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQ } from "@/lib/client";
import { CountUp } from "@/components/viz/ring";
import { cn } from "@/lib/utils";

/** The coin: a gold disc stamped with an M. Play currency — never money. */
export function CoinIcon({ size = 16, className }: { size?: number; className?: string }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={`c-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe48a" />
          <stop offset="0.55" stopColor="#f5b819" />
          <stop offset="1" stopColor="#c98a00" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#c-${id})`} stroke="#a46f00" strokeWidth="1" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="#fff3c4" strokeOpacity=".7" strokeWidth="1" />
      <path d="M7.6 16V8.3l4.4 4.6 4.4-4.6V16" fill="none" stroke="#8a5a00" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Coins({ n, size = 14, className, signed }: { n: number; size?: number; className?: string; signed?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 num font-semibold", className)}>
      <CoinIcon size={size} />
      {signed && n > 0 ? "+" : ""}
      {n.toLocaleString()}
    </span>
  );
}

/** Balance pill in the header; pulses when coins land. */
export function CoinPill({ className }: { className?: string }) {
  const { data } = useQ("game", undefined, { refreshInterval: 60_000 });
  const [bump, setBump] = React.useState(0);
  const prev = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (data == null) return;
    if (prev.current != null && data.balance > prev.current) setBump((b) => b + 1);
    prev.current = data.balance;
  }, [data]);
  if (!data) return null;
  return (
    <Link
      href="/build"
      className={cn("relative flex h-8 items-center gap-1.5 rounded-full border border-[#f5b819]/40 bg-[#f5b819]/10 pl-1.5 pr-3 text-[13px] font-semibold text-fg transition hover:bg-[#f5b819]/20", className)}
      aria-label={`${data.balance} coins — open your plant`}
    >
      <motion.span key={bump} initial={{ rotateY: 0, scale: 1 }} animate={{ rotateY: bump ? 360 : 0, scale: bump ? [1, 1.25, 1] : 1 }} transition={{ duration: 0.6 }}>
        <CoinIcon size={20} />
      </motion.span>
      <CountUp value={data.balance} />
      <AnimatePresence>
        {data.power.value < 50 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warn" title="Plant power is low" />
        )}
      </AnimatePresence>
    </Link>
  );
}
