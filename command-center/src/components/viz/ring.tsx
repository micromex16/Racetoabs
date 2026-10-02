"use client";
import * as React from "react";
import { motion, useSpring, useTransform, useMotionValueEvent } from "framer-motion";
import { cn } from "@/lib/utils";

/** Apple-Fitness-style progress ring: gradient stroke, glow, rounded head, animated fill.
 *  Values past 100 wrap into a second lap. */
export function Ring({
  value,
  size = 120,
  stroke = 12,
  color = "var(--accent)",
  track = "var(--track)",
  expected,
  children,
  className,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  /** Optional "where you should be" tick (0–100) */
  expected?: number | null;
  children?: React.ReactNode;
  className?: string;
  label?: string;
}) {
  const id = React.useId().replace(/:/g, "");
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const spring = useSpring(0, { stiffness: 60, damping: 18, mass: 0.8 });
  React.useEffect(() => {
    spring.set(Math.max(0, value));
  }, [value, spring]);
  const offset = useTransform(spring, (v) => c * (1 - Math.min(v, 100) / 100));
  const lap2 = useTransform(spring, (v) => c * (1 - Math.max(0, Math.min(v - 100, 100)) / 100));
  const [showLap2, setShowLap2] = React.useState(false);
  useMotionValueEvent(spring, "change", (v) => setShowLap2(v > 100));

  const tickAngle = expected != null ? (Math.min(100, Math.max(0, expected)) / 100) * 360 - 90 : null;

  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(value)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible">
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.75" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <filter id={`f-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={stroke * 0.45} />
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.12} strokeWidth={stroke} />
        {/* glow */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ strokeDashoffset: offset }}
          filter={`url(#f-${id})`}
          opacity={0.45}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ strokeDashoffset: offset }}
        />
        {showLap2 && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            style={{ strokeDashoffset: lap2, filter: "brightness(1.25)" }}
          />
        )}
      </svg>
      {tickAngle != null && (
        <div className="pointer-events-none absolute inset-0" style={{ transform: `rotate(${tickAngle + 90}deg)` }} aria-hidden>
          <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-fg/70" style={{ width: 2, height: stroke + 4, marginTop: -2 }} />
        </div>
      )}
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Animated number. */
export function CountUp({ value, className, suffix = "", decimals = 0 }: { value: number; className?: string; suffix?: string; decimals?: number }) {
  const spring = useSpring(0, { stiffness: 70, damping: 20 });
  const [v, setV] = React.useState(0);
  React.useEffect(() => spring.set(value), [value, spring]);
  useMotionValueEvent(spring, "change", (x) => setV(x));
  return (
    <span className={cn("num", className)}>
      {v.toFixed(decimals)}
      {suffix}
    </span>
  );
}
