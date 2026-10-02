"use client";
import { useState } from "react";
import { Ring, CountUp } from "@/components/viz/ring";
import { Check } from "@/components/ui/check";
import { call, type QOut } from "@/lib/client";
import { celebrate } from "@/lib/confetti";
import { RING_COLORS, cn } from "@/lib/utils";
import { Modal } from "@/components/ui/dialog";
import { SetWeeklyRocks } from "@/components/goals/set-weekly-rocks";
import { Button } from "@/components/ui/button";
import { Mountain } from "lucide-react";

type Today = QOut<"today">;

export function RockHero({ today }: { today: Today }) {
  const [setting, setSetting] = useState(false);
  const rocks = today.weeklyRocks;

  if (!rocks.length) {
    return (
      <section className="glass relative overflow-hidden rounded-3xl p-6 text-center sm:p-10">
        <Mountain className="mx-auto mb-3 size-8 text-accent" />
        <h2 className="text-xl font-semibold tracking-tight">No rocks set for this week</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-fg-2">Three outcomes that move the quarter. Everything else is negotiable.</p>
        <Button variant="primary" size="lg" className="mt-5" onClick={() => setSetting(true)}>
          Set this week&apos;s 3 rocks
        </Button>
        <Modal open={setting} onOpenChange={setSetting} title="This week's rocks">
          <SetWeeklyRocks weekStart={today.weekStart} existing={[]} quarterlyRocks={today.quarterlyRocks} onSaved={() => setSetting(false)} />
        </Modal>
      </section>
    );
  }

  return (
    <section className="glass relative overflow-hidden rounded-3xl px-3 py-5 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-2/3 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative mb-4 flex items-baseline justify-between px-2 sm:mb-6">
        <h2 className="eyebrow">This week&apos;s rocks</h2>
        <span className="text-[11px] text-muted">tick marks = where time says you should be</span>
      </div>
      <div className={cn("relative grid gap-2 sm:gap-6", rocks.length === 1 ? "grid-cols-1" : rocks.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {rocks.map((r, i) => (
          <RockRing key={r.id} rock={r} index={i} />
        ))}
      </div>
    </section>
  );
}

function RockRing({ rock, index }: { rock: Today["weeklyRocks"][number]; index: number }) {
  const color = RING_COLORS[index % 3];
  const done = rock.status === "DONE";
  return (
    <div className="flex flex-col items-center text-center">
      <Ring value={rock.progress} color={color} expected={rock.expected} size={176} stroke={16} className="hidden sm:inline-grid" label={`Rock ${index + 1}: ${rock.progress}%`}>
        <div>
          <CountUp value={rock.progress} suffix="%" className="text-4xl font-semibold tracking-tight" />
          <div className="mt-0.5 text-[11px] text-muted">{rock.daysLeft == null ? "" : rock.daysLeft > 0 ? `${rock.daysLeft}d left` : rock.daysLeft === 0 ? "due today" : "past due"}</div>
        </div>
      </Ring>
      <Ring value={rock.progress} color={color} expected={rock.expected} size={96} stroke={10} className="sm:hidden" label={`Rock ${index + 1}: ${rock.progress}%`}>
        <CountUp value={rock.progress} suffix="%" className="text-xl font-semibold tracking-tight" />
      </Ring>
      <div className="mt-3 flex w-full max-w-[260px] items-start justify-center gap-2 px-1">
        <Check
          checked={done}
          color={color}
          size={20}
          className="mt-0.5"
          label={done ? `Reopen rock ${index + 1}` : `Complete rock ${index + 1}`}
          onChange={async (v) => {
            if (v) celebrate("big");
            await call("goal.complete", { id: rock.id, done: v });
          }}
        />
        <div className="min-w-0 text-left">
          <div className="num text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
            Rock #{index + 1}
          </div>
          <p data-done={done} className="strike-anim line-clamp-3 text-[13px] font-medium leading-snug text-fg sm:text-sm">
            {rock.title}
          </p>
        </div>
      </div>
    </div>
  );
}
