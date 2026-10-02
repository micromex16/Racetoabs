"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Timer, Ghost, Flag, Zap, Sparkles, ParkingSquare, X, Minimize2, Maximize2, CheckCircle2, Trophy } from "lucide-react";
import { useQ, call, type QOut } from "@/lib/client";
import { Ring } from "@/components/viz/ring";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { ui } from "@/lib/ui-store";
import { sfx } from "@/lib/game/sound";
import { fmtDuration } from "@/lib/game/catalog";
import { cn } from "@/lib/utils";
import { CoinIcon, Coins } from "./coin";
import { World } from "./world";
import { toast } from "sonner";

type Today = QOut<"today">;
type Game = QOut<"game">;

function useNow(ms = 1000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
}

/** Today's race against your personal best (the ghost). */
export function SpeedrunStrip({ today }: { today: Today }) {
  const now = useNow();
  const sr = today.speedrun;
  const picks = today.plan.picks;
  const doneN = picks.filter((p) => p.done).length;
  if (!picks.length) return null;
  const start = Date.parse(sr.startAt);
  const elapsed = sr.durationSec ?? (now - start) / 1000;
  const pb = sr.pb;
  // Compare against the ghost at the current split
  let delta: number | null = null;
  if (pb) {
    if (sr.durationSec != null) delta = sr.durationSec - pb.durationSec;
    else if (doneN > 0 && sr.splits[doneN - 1] != null && pb.splits[doneN - 1] != null) delta = sr.splits[doneN - 1] - pb.splits[doneN - 1];
    else if (pb.splits[doneN] != null && elapsed > pb.splits[doneN]) delta = elapsed - pb.splits[doneN];
    else if (pb.splits[doneN] != null) delta = elapsed - pb.splits[doneN];
  }
  const scale = Math.max(elapsed, pb?.durationSec ?? 0, 3600) * 1.08;
  const pct = (sec: number) => `${Math.min(100, (sec / scale) * 100)}%`;
  const finished = sr.durationSec != null;
  const ahead = delta != null && delta < 0;

  return (
    <div className="glass mb-3 rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          {finished ? <Flag className="size-4 text-good" /> : <Timer className={cn("size-4", sr.started ? "text-accent" : "text-muted")} />}
          <span className={cn("num text-2xl font-semibold tracking-tight", finished && "text-good")}>{clock(elapsed)}</span>
        </div>
        <div className="text-xs text-fg-2">
          {finished ? (
            sr.isPb ? (
              <span className="font-semibold text-[#f5b819]">New personal best!</span>
            ) : sr.firstRun ? (
              <span className="font-semibold text-good">First clean run — that&apos;s the time to beat</span>
            ) : (
              <>Clean run · PB {pb ? fmtDuration(pb.durationSec) : "—"}</>
            )
          ) : !sr.started ? (
            <>Clock started at first open — Launch tomorrow to start it on your terms</>
          ) : pb ? (
            <>
              <Ghost className="mr-1 inline size-3.5" />
              Best: {fmtDuration(pb.durationSec)}
            </>
          ) : (
            <>First run — set the time to beat</>
          )}
        </div>
        {delta != null && (
          <Badge tone={ahead ? "good" : "warn"} className="ml-auto">
            {ahead ? "▼" : "▲"} {fmtDuration(Math.abs(delta))} {ahead ? "ahead" : "behind"}
          </Badge>
        )}
      </div>
      <div className="relative mt-3 h-2.5 rounded-full bg-track">
        <motion.div className={cn("absolute inset-y-0 left-0 rounded-full", finished ? "bg-good" : "bg-gradient-to-r from-accent/60 to-accent")} animate={{ width: pct(elapsed) }} transition={{ duration: 0.6 }} />
        {pb?.splits.map((s, i) => (
          <div key={`g${i}`} className="absolute -top-1 h-4.5 w-0.5 rounded bg-fg/35" style={{ left: pct(s) }} title={`Ghost split ${i + 1}: ${fmtDuration(s)}`} />
        ))}
        {pb && <div className="absolute -top-1.5 size-5 -translate-x-1/2 rounded-full border-2 border-dashed border-fg/40" style={{ left: pct(pb.durationSec) }} title={`PB finish ${fmtDuration(pb.durationSec)}`} />}
        {sr.splits.map((s, i) => (
          <div key={`s${i}`} className="absolute -top-1 grid size-4.5 -translate-x-1/2 place-items-center rounded-full bg-accent text-[9px] font-bold text-accent-fg ring-2 ring-[var(--bg)]" style={{ left: pct(s) }}>
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChallengeCard({ c, compact }: { c: Game["challenge"]; compact?: boolean }) {
  const won = c.status === "WON";
  const lost = c.status === "LOST";
  const p = c.progress;
  const inverse = c.pct == null;
  return (
    <div className={cn("glass relative overflow-hidden rounded-2xl p-4", won && "border-good/40", lost && "opacity-70")}>
      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent-2/15 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5">
            🌀 This week&apos;s twist {c.createdBy === "agent" && <Sparkles className="size-3 text-accent" />}
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-snug">{c.title}</p>
          {!compact && <p className="mt-0.5 text-sm text-fg-2">{c.description}</p>}
        </div>
        <div className="shrink-0 text-right">
          <Coins n={c.reward} size={16} className="text-sm" />
          <p className="mt-0.5 text-[10px] text-muted">{won ? "won" : lost ? "missed" : `by ${c.deadlineLabel}`}</p>
        </div>
      </div>
      <div className="relative mt-3">
        {inverse ? (
          <p className={cn("text-sm font-semibold", p.current === 0 ? "text-good" : "text-fg")}>{p.current === 0 ? "Zero. Done." : `${p.current} ${p.unit}`}</p>
        ) : (
          <>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="num">
                <span className="text-base font-semibold">{p.current}</span>
                <span className="text-muted"> / {p.target}</span> <span className="text-fg-2">{p.unit}</span>
              </span>
              <span className="num text-muted">{c.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-track">
              <motion.div className={cn("h-full rounded-full", won ? "bg-good" : "bg-gradient-to-r from-accent-2 to-accent")} initial={{ width: 0 }} animate={{ width: `${c.pct}%` }} transition={{ duration: 0.8 }} />
            </div>
          </>
        )}
        {won && (
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-good">
            <CheckCircle2 className="size-3.5" /> Won — coins and a rare blueprint are yours
          </p>
        )}
      </div>
    </div>
  );
}

/** Mini town on Today: tap through to build. */
export function PlantCard() {
  const { data: g } = useQ("game");
  if (!g) return <div className="glass h-48 animate-pulse rounded-2xl" />;
  return (
    <Link href="/build" className="glass group block overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="eyebrow">Your plant</span>
        <span className="flex items-center gap-3 text-xs">
          <span className={cn("flex items-center gap-1", g.power.value >= 80 ? "text-good" : g.power.value >= 50 ? "text-fg-2" : "text-warn")}>
            <Zap className="size-3.5" /> {g.power.value}%
          </span>
          <Coins n={g.balance} />
        </span>
      </div>
      <div className="relative transition group-hover:scale-[1.02]">
        <World game={g} mini />
      </div>
      <p className="px-4 pb-3 text-[11px] text-muted">
        {g.earnedToday ? (
          <>
            <span className="text-fg-2">+{g.earnedToday}</span> today · {g.power.label}
          </>
        ) : (
          <>{g.power.hint}</>
        )}
      </p>
    </Link>
  );
}

/** Full-screen focus sprint. Minimizes to a floating timer so you can still work in the app. */
export function FocusMode() {
  const { data: g } = useQ("game");
  const now = useNow(250);
  const [min, setMin] = React.useState(false);
  const [done, setDone] = React.useState<{ id: string; kind: string | null; refId: string | null; title: string } | null>(null);
  const finishing = React.useRef<string | null>(null);
  const sp = g?.activeSprint;
  const remaining = sp ? (Date.parse(sp.endsAt as unknown as string) - now) / 1000 : 0;
  const total = sp ? sp.minutes * 60 : 1;

  React.useEffect(() => {
    if (!sp || remaining > 0 || finishing.current === sp.id) return;
    finishing.current = sp.id;
    sfx.bell();
    setMin(false);
    setDone({ id: sp.id, kind: sp.kind, refId: sp.refId, title: sp.title });
    void call("sprint.finish", { id: sp.id, completed: true }, { silent: true });
  }, [sp, remaining]);

  if (done && (!sp || sp.id === done.id)) {
    return (
      <SprintComplete
        done={done}
        onClose={() => {
          setDone(null);
          finishing.current = null;
        }}
      />
    );
  }
  if (!sp) return null;

  if (min) {
    return (
      <button onClick={() => setMin(false)} className="fixed bottom-[calc(150px+env(safe-area-inset-bottom))] left-4 z-40 flex items-center gap-2 rounded-full border border-accent/40 bg-panel-solid/95 py-2 pl-2 pr-4 shadow-2xl backdrop-blur lg:bottom-6">
        <Ring value={(1 - remaining / total) * 100} size={34} stroke={4}>
          <Timer className="size-3.5 text-accent" />
        </Ring>
        <span className="num text-sm font-semibold">{clock(remaining)}</span>
        <Maximize2 className="size-3.5 text-muted" />
      </button>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-bg/96 px-6 backdrop-blur-2xl">
      <div className="backdrop" />
      <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+12px)] flex gap-1">
        <Button variant="ghost" size="icon" onClick={() => setMin(true)} aria-label="Minimize">
          <Minimize2 />
        </Button>
      </div>
      <p className="eyebrow text-accent">Focus sprint</p>
      <h2 className="mt-2 max-w-md text-center text-xl font-semibold leading-snug">{sp.title}</h2>
      <div className="my-8">
        <Ring value={(1 - remaining / total) * 100} size={260} stroke={18} color="var(--accent)">
          <div>
            <div className="num text-6xl font-semibold tracking-tight">{clock(remaining)}</div>
            <div className="mt-1 flex items-center justify-center gap-1 text-xs text-muted">
              <CoinIcon size={13} /> +20 · combo grows each sprint
            </div>
          </div>
        </Ring>
      </div>
      <p className="mb-6 max-w-xs text-center text-sm text-fg-2">One thing. Anything else that pops into your head goes to the Parking Lot.</p>
      <div className="flex gap-2">
        <Button variant="secondary" size="lg" onClick={() => ui.openCapture({ voice: false })}>
          <ParkingSquare /> Park a thought
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={async () => {
            if (!confirm("End the sprint early? No coins for unfinished sprints.")) return;
            sfx.nope();
            await call("sprint.finish", { id: sp.id, completed: false });
          }}
        >
          <X /> Stop
        </Button>
      </div>
    </motion.div>
  );
}

function SprintComplete({ done, onClose }: { done: { kind: string | null; refId: string | null; title: string }; onClose: () => void }) {
  const markDone = async () => {
    if (done.kind === "task" && done.refId) await call("task.complete", { id: done.refId, done: true });
    else if (done.kind === "followup" && done.refId) await call("followup.complete", { id: done.refId, done: true });
    else if (done.kind === "pipeline" && done.refId) await call("day.pipelineDone", { refId: done.refId });
    onClose();
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-bg/96 px-6 text-center backdrop-blur-2xl">
      <div className="backdrop" />
      <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="grid size-28 place-items-center rounded-full bg-accent/15 text-6xl">
        🎯
      </motion.div>
      <h2 className="mt-5 text-2xl font-semibold">Sprint complete</h2>
      <p className="mt-1 max-w-sm text-sm text-fg-2">{done.title}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {done.refId && (
          <Button variant="primary" size="lg" onClick={markDone}>
            <CheckCircle2 /> It&apos;s done
          </Button>
        )}
        <Button variant="secondary" size="lg" onClick={async () => { onClose(); await startSprint({ title: done.title, kind: done.kind ?? undefined, refId: done.refId ?? undefined }); }}>
          <Timer /> Another sprint
        </Button>
        <Button variant="ghost" size="lg" onClick={onClose}>
          <Trophy /> Back
        </Button>
      </div>
    </motion.div>
  );
}

export async function startSprint(p: { title: string; kind?: string; refId?: string }) {
  await call("sprint.start", { title: p.title, kind: p.kind ?? null, refId: p.refId ?? null });
  toast("Sprint started — go.", { icon: "⏱️" });
}

export function Bounty({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#f5b819]/50 bg-[#f5b819]/15 px-1.5 py-0.5 text-[11px] font-bold text-[#c98a00] shadow-[0_0_12px_-3px_#f5b819] dark:text-[#ffcf4a]" title="Bounty grows every time this gets snoozed or pushed">
      <CoinIcon size={12} /> +{n} bounty
    </span>
  );
}
