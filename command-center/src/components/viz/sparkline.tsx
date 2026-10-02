"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Pt = { label?: string; value: number | null };

/** Sparkline with gradient area, last-point dot, optional target line and a hover readout. */
/** Fills its container's width. */
export function FluidSparkline(props: Omit<Parameters<typeof Sparkline>[0], "width">) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="w-full">
      {w > 0 && <Sparkline {...props} width={w} />}
    </div>
  );
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "var(--accent)",
  target,
  className,
  format = (v: number) => String(Math.round(v * 10) / 10),
}: {
  data: Pt[];
  width?: number;
  height?: number;
  color?: string;
  target?: number | null;
  className?: string;
  format?: (v: number) => string;
}) {
  const id = React.useId().replace(/:/g, "");
  const [hover, setHover] = React.useState<number | null>(null);
  const vals = data.map((d) => d.value);
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length === 0) {
    return (
      <svg width={width} height={height} className={className} aria-hidden>
        <line x1={0} x2={width} y1={height - 2} y2={height - 2} stroke="var(--line-2)" strokeDasharray="2 3" />
      </svg>
    );
  }
  const max = Math.max(...nums, target ?? -Infinity, 1);
  const min = Math.min(0, ...nums);
  const pad = 3;
  const x = (i: number) => (data.length === 1 ? width / 2 : pad + (i / (data.length - 1)) * (width - pad * 2));
  const y = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const pts = vals.map((v, i) => (v == null ? null : ([x(i), y(v)] as const)));
  let line = "";
  pts.forEach((p, i) => {
    if (!p) return;
    line += (line === "" || !pts[i - 1] ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1) + " ";
  });
  const firstIdx = pts.findIndex(Boolean);
  const lastIdx = pts.length - 1 - [...pts].reverse().findIndex(Boolean);
  const area = `${line} L${x(lastIdx)} ${height} L${x(firstIdx)} ${height} Z`;
  const last = pts[lastIdx]!;

  return (
    <div className={cn("relative", className)} style={{ width, height }}>
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - pad) / (width - pad * 2)) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`a-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {target != null && <line x1={0} x2={width} y1={y(target)} y2={y(target)} stroke="var(--fg-2)" strokeOpacity={0.35} strokeDasharray="3 3" strokeWidth={1} />}
        <path d={area} fill={`url(#a-${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r={3} fill={color} stroke="var(--bg)" strokeWidth={1.5} />
        {hover != null && pts[hover] && (
          <>
            <line x1={pts[hover]![0]} x2={pts[hover]![0]} y1={0} y2={height} stroke="var(--fg-2)" strokeOpacity={0.4} />
            <circle cx={pts[hover]![0]} cy={pts[hover]![1]} r={4} fill={color} stroke="var(--bg)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hover != null && vals[hover] != null && (
        <div className="pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded-md border border-line-2 bg-panel-solid px-1.5 py-0.5 text-[10px] text-fg shadow" style={{ left: Math.min(width - 60, Math.max(0, (pts[hover]?.[0] ?? 0) - 24)) }}>
          <span className="num font-semibold">{format(vals[hover]!)}</span>
          {data[hover].label && <span className="ml-1 text-muted">{data[hover].label}</span>}
        </div>
      )}
    </div>
  );
}

export function Bar({ value, max = 100, color = "var(--accent)", className, expected }: { value: number; max?: number; color?: string; className?: string; expected?: number | null }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-track", className)}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, transparent), ${color})`, boxShadow: `0 0 12px -2px ${color}` }} />
      {expected != null && <div className="absolute top-0 h-full w-0.5 bg-fg/50" style={{ left: `${Math.min(100, expected)}%` }} />}
    </div>
  );
}
