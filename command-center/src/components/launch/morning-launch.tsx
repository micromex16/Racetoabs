"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { X, ArrowRight, ArrowLeft, Shuffle, Mic, Square, CheckSquare, Bell, Kanban, Rocket, RotateCcw, Sparkles } from "lucide-react";
import { Ring } from "@/components/viz/ring";
import { Bar } from "@/components/viz/sparkline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { call, useQ, type QOut } from "@/lib/client";
import { ui } from "@/lib/ui-store";
import { useSpeech } from "@/hooks/use-speech";
import { celebrate } from "@/lib/confetti";
import { RING_COLORS, cn } from "@/lib/utils";
import { SetWeeklyRocks } from "@/components/goals/set-weekly-rocks";
import { SwapDialog } from "@/components/today/sections";

type Today = QOut<"today">;
const KIND_ICON = { task: CheckSquare, followup: Bell, pipeline: Kanban } as const;

/** First open each day: 3 screens, ~30 seconds. Rocks → 3 picks → mind dump → Today. */
export function MorningLaunch({ today }: { today: Today }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [dir, setDir] = React.useState(1);
  const [dump, setDump] = React.useState("");
  const [swapSlot, setSwapSlot] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [agentBusy, setAgentBusy] = React.useState(false);
  const { data: agent } = useQ("agent.status");
  const speech = useSpeech({ onFinal: (t) => setDump((d) => (d ? d.trim() + "\n" : "") + t) });

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };
  const skip = () => {
    try {
      sessionStorage.setItem(`cc.launch.skipped.${today.today}`, "1");
    } catch {}
    ui.set({ launch: false });
  };
  const launch = async () => {
    setBusy(true);
    if (speech.listening) speech.stop();
    try {
      await call("day.launch", { mindDump: dump });
      celebrate("small");
      ui.set({ launch: false });
      router.push("/");
    } finally {
      setBusy(false);
    }
  };

  const dateLabel = new Date(today.today + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

  const screens = [
    // 1 — Rocks
    <div key="rocks" className="flex min-h-full flex-col">
      <Header kicker="1 · Where you stand" title="Your 3 rocks this week" sub={`${today.daysToExit.toLocaleString()} days to exit-ready.`} />
      {today.weeklyRocks.length ? (
        <div className="grid flex-1 grid-cols-3 content-center gap-2 sm:gap-6">
          {today.weeklyRocks.map((r, i) => (
            <div key={r.id} className="flex flex-col items-center text-center">
              <Ring value={r.progress} color={RING_COLORS[i % 3]} expected={r.expected} size={120} stroke={12} className="sm:hidden">
                <span className="num text-2xl font-semibold">{r.progress}%</span>
              </Ring>
              <Ring value={r.progress} color={RING_COLORS[i % 3]} expected={r.expected} size={170} stroke={16} className="hidden sm:inline-grid">
                <span className="num text-4xl font-semibold">{r.progress}%</span>
              </Ring>
              <div className="mt-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: RING_COLORS[i % 3] }}>
                Rock #{i + 1}
              </div>
              <p className="mt-0.5 line-clamp-3 text-[13px] font-medium leading-snug sm:text-sm">{r.title}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-lg">
          <p className="mb-3 text-sm text-fg-2">No rocks set for this week yet. Pick three outcomes from your quarter:</p>
          <SetWeeklyRocks weekStart={today.weekStart} existing={[]} quarterlyRocks={today.quarterlyRocks} compact />
        </div>
      )}
      <div className="mx-auto mt-6 w-full max-w-lg space-y-2.5">
        <p className="eyebrow">Quarter rocks</p>
        {today.quarterlyRocks.map((q, i) => (
          <div key={q.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-fg-2">
                <span className="num mr-1.5 font-semibold text-fg">#{i + 1}</span>
                {q.title}
              </span>
              <span className="num shrink-0 text-fg-2">
                {q.progress}%{q.daysLeft != null ? ` · ${q.daysLeft}d` : ""}
              </span>
            </div>
            <Bar value={q.progress} expected={q.expected} />
          </div>
        ))}
      </div>
    </div>,

    // 2 — Picks
    <div key="picks" className="flex min-h-full flex-col">
      <Header
        kicker="2 · Focus"
        title="Do these 3 things first today"
        sub={today.speedrun.pb ? `The clock starts when you launch. Time to beat: ${Math.floor(today.speedrun.pb.durationSec / 3600)}h ${String(Math.floor((today.speedrun.pb.durationSec % 3600) / 60)).padStart(2, "0")}m.` : "Picked against your rocks. The clock starts when you launch — set the time to beat."}
      />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-3">
        {today.plan.picks.length === 0 && <p className="rounded-2xl border border-dashed border-line-2 p-6 text-center text-sm text-muted">Nothing to pick from yet — add tasks tied to your rocks and the picker will fill this.</p>}
        {today.plan.picks.map((p, i) => {
          const Icon = KIND_ICON[p.kind];
          return (
            <motion.div key={p.kind + p.refId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }} className="glass rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <span className="num grid size-8 shrink-0 place-items-center rounded-xl bg-accent/15 text-sm font-bold text-accent">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug">{p.title}</p>
                  <p className="mt-1.5 text-xs italic leading-relaxed text-fg-2">{p.reason}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                    <Icon className="size-3" /> {p.kind}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSwapSlot(i)} aria-label="Swap">
                  <Shuffle /> <span className="hidden sm:inline">Swap</span>
                </Button>
              </div>
            </motion.div>
          );
        })}
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => call("day.repick", {})}>
            <RotateCcw /> Re-pick
          </Button>
          {agent?.configured && (
            <Button
              size="sm"
              variant="ghost"
              disabled={agentBusy}
              onClick={async () => {
                setAgentBusy(true);
                try {
                  await call("day.agentRepick", {});
                } finally {
                  setAgentBusy(false);
                }
              }}
            >
              <Sparkles /> {agentBusy ? "Thinking…" : "Let the agent pick"}
            </Button>
          )}
        </div>
        {today.plan.pickedBy === "agent" && <p className="text-center text-[11px] text-muted">Picked by your chief of staff.</p>}
      </div>
      <SwapDialog today={today} slot={swapSlot} onClose={() => setSwapSlot(null)} />
    </div>,

    // 3 — Mind dump
    <div key="mind" className="flex min-h-full flex-col">
      <Header kicker="3 · Clear your head" title="Anything on your mind?" sub="Dump it. It goes to the Parking Lot — not into your day." />
      <div className="mx-auto w-full max-w-xl flex-1">
        <div className="relative">
          <Textarea
            value={speech.listening ? (dump ? dump + "\n" : "") + speech.interim : dump}
            onChange={(e) => setDump(e.target.value)}
            placeholder={"One thought per line…\n(or tap the mic)"}
            className="min-h-[200px] text-base leading-relaxed"
          />
          {speech.supported && (
            <button
              type="button"
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              className={cn("absolute bottom-3 right-3 grid size-12 place-items-center rounded-full", speech.listening ? "animate-pulse bg-bad text-white" : "bg-accent text-accent-fg")}
              aria-label={speech.listening ? "Stop dictation" : "Dictate"}
            >
              {speech.listening ? <Square className="size-5" /> : <Mic className="size-5" />}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">Leave it empty if you&apos;re clear.</p>
      </div>
    </div>,
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[60] flex flex-col bg-bg/95 backdrop-blur-2xl">
      <div className="backdrop" />
      <div className="safe-top flex items-center justify-between px-5 pt-4">
        <span className="text-xs text-muted">{dateLabel}</span>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-accent" : i < step ? "w-1.5 bg-accent/60" : "w-1.5 bg-line-2")} />
          ))}
        </div>
        <button onClick={skip} className="flex items-center gap-1 rounded-lg p-1.5 text-xs text-muted hover:text-fg" aria-label="Skip launch">
          Skip <X className="size-4" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ x: dir * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -dir * 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 38 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 && step < 2) go(step + 1);
              if (info.offset.x > 80 && step > 0) go(step - 1);
            }}
            className="absolute inset-0 overflow-y-auto px-5 pb-6 pt-6 sm:px-10"
          >
            {screens[step]}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="safe-bottom border-t border-line bg-bg/60 px-5 py-4">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {step > 0 && (
            <Button variant="ghost" size="lg" onClick={() => go(step - 1)}>
              <ArrowLeft /> Back
            </Button>
          )}
          {step < 2 ? (
            <Button variant="primary" size="xl" className="flex-1" onClick={() => go(step + 1)}>
              Next <ArrowRight />
            </Button>
          ) : (
            <Button variant="primary" size="xl" className="flex-1" onClick={launch} disabled={busy}>
              <Rocket /> Launch my day
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Header({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-6 w-full max-w-xl text-center sm:mb-10">
      <p className="eyebrow text-accent">{kicker}</p>
      <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-2 text-sm text-fg-2">{sub}</p>}
    </div>
  );
}
