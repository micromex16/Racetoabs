"use client";
import { cn } from "@/lib/utils";

function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dayKeyFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localKey(d);
}
export function nextWeekdayKey(wd: number) {
  const d = new Date();
  let delta = (wd - d.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  return localKey(d);
}
export const todayLocalKey = () => dayKeyFromNow(0);

export function DateChips({ value, onChange, allowNone = true }: { value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
  const opts: { label: string; v: string | null }[] = [
    { label: "Today", v: dayKeyFromNow(0) },
    { label: "Tomorrow", v: dayKeyFromNow(1) },
    { label: "Friday", v: new Date().getDay() === 5 ? dayKeyFromNow(0) : nextWeekdayKey(5) },
    { label: "Next Mon", v: nextWeekdayKey(1) },
    ...(allowNone ? [{ label: "No date", v: null }] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opts.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
            value === o.v ? "border-accent/50 bg-accent/15 text-accent" : "border-line bg-panel text-fg-2 hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 rounded-lg border border-line bg-panel px-2 text-xs text-fg-2 outline-none [color-scheme:inherit]"
      />
    </div>
  );
}
