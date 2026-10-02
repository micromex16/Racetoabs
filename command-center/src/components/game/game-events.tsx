"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useQ, type QOut } from "@/lib/client";
import { sfx, setSound } from "@/lib/game/sound";
import { celebrate } from "@/lib/confetti";
import { CoinIcon } from "./coin";
import { ACHIEVEMENTS, BUILDINGS, fmtDuration } from "@/lib/game/catalog";
import { Button } from "@/components/ui/button";

type Ev = QOut<"game">["recent"][number];
const SEEN = "cc.game.seen";
const BIG = new Set(["achievement", "record", "challenge", "clean_run", "payout", "rock"]);
const QUIET = new Set(["build", "upgrade", "reward", "sell"]);

/** Watches the coin ledger and turns new entries into coin pops and big moments. */
export function GameEvents() {
  const { data } = useQ("game", undefined, { refreshInterval: 60_000 });
  const [pops, setPops] = React.useState<Ev[]>([]);
  const [queue, setQueue] = React.useState<Ev[]>([]);

  React.useEffect(() => {
    if (data) setSound(data.settings.soundOn, data.settings.hapticsOn);
  }, [data]);

  React.useEffect(() => {
    if (!data) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN);
    } catch {}
    const newest = data.recent[0]?.at;
    if (!seen) {
      if (newest) localStorage.setItem(SEEN, newest);
      return;
    }
    const fresh = data.recent.filter((e) => e.at > seen!).reverse();
    if (!fresh.length) return;
    try {
      localStorage.setItem(SEEN, newest!);
    } catch {}
    const big = fresh.filter((e) => BIG.has(e.kind) || (e.kind === "drop" && (e.meta as { blueprint?: string })?.blueprint));
    const small = fresh.filter((e) => !big.includes(e) && !QUIET.has(e.kind) && e.amount >= 0);
    if (small.length) {
      setPops((p) => [...p, ...small].slice(-5));
      const hasBounty = small.some((e) => e.kind === "bounty" || e.kind === "drop");
      if (small.some((e) => e.kind === "freeze")) sfx.freeze();
      else if (hasBounty) sfx.bigCoin();
      else sfx.coin();
      for (const e of small) setTimeout(() => setPops((p) => p.filter((x) => x.id !== e.id)), 3800);
    }
    if (big.length) setQueue((q) => [...q, ...big]);
  }, [data]);

  const current = queue[0];
  React.useEffect(() => {
    if (!current) return;
    if (current.kind === "record") sfx.record();
    else sfx.fanfare();
    celebrate(current.kind === "clean_run" || current.kind === "challenge" || current.kind === "payout" ? "big" : "small");
  }, [current]);

  return (
    <>
      <div className="pointer-events-none fixed right-3 top-16 z-[70] flex flex-col items-end gap-1.5 lg:top-16">
        <AnimatePresence>
          {pops.map((e) => (
            <motion.div
              key={e.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="flex max-w-[78vw] items-center gap-2 rounded-full border border-[#f5b819]/40 bg-panel-solid/95 py-1.5 pl-1.5 pr-3 text-xs shadow-xl backdrop-blur"
            >
              <motion.span animate={{ rotateY: [0, 360] }} transition={{ duration: 0.7 }}>
                <CoinIcon size={22} />
              </motion.span>
              <span className={`num font-bold ${e.kind === "bounty" || e.kind === "drop" ? "text-[#f5b819]" : "text-fg"}`}>{e.amount > 0 ? `+${e.amount}` : e.kind === "freeze" ? "🧊" : ""}</span>
              <span className="truncate text-fg-2">{e.label}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {current && <Moment key={current.id} e={current} onDone={() => setQueue((q) => q.slice(1))} />}
      </AnimatePresence>
    </>
  );
}

function Burst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {Array.from({ length: 14 }).map((_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <motion.div key={i} className="absolute left-1/2 top-[86px]" initial={{ x: -12, y: -12, opacity: 1, scale: 0.6 }} animate={{ x: Math.cos(a) * 150 - 12, y: Math.sin(a) * 110 - 12, opacity: 0, scale: 1.1, rotate: 360 }} transition={{ duration: 1.1, ease: "easeOut", delay: 0.15 }}>
            <CoinIcon size={24} />
          </motion.div>
        );
      })}
    </div>
  );
}

function Moment({ e, onDone }: { e: Ev; onDone: () => void }) {
  const meta = (e.meta ?? {}) as { achievement?: string; blueprint?: string; durationSec?: number; record?: string };
  const ach = meta.achievement ? ACHIEVEMENTS.find((a) => a.key === meta.achievement) : null;
  const unlocked = ach ? BUILDINGS.find((b) => b.unlock?.by === "achievement" && b.unlock.key === ach.key) : meta.blueprint ? BUILDINGS.find((b) => b.key === meta.blueprint) : null;
  const view = (() => {
    switch (e.kind) {
      case "clean_run":
        return { icon: "🏁", kicker: "Clean run", title: meta.durationSec ? fmtDuration(meta.durationSec) : "All 3 picks done", sub: "All three picks, done. The plant hums." };
      case "record":
        return { icon: "⏱️", kicker: "New personal record", title: e.label.replace(/^New record — /, ""), sub: "You just beat yourself." };
      case "achievement":
        return { icon: ach?.emoji ?? "🏅", kicker: "Achievement unlocked", title: ach?.title ?? e.label, sub: ach?.desc ?? "" };
      case "challenge":
        return { icon: "🌀", kicker: "Twist won", title: e.label.replace(/^Twist won: /, "").replace(/ · rare blueprint unlocked$/, ""), sub: "This week's twist is in the bag." };
      case "payout":
        return { icon: "🧰", kicker: "Friday payout", title: "Week closed", sub: e.label.replace(/^Friday payout · /, "") };
      case "rock":
        return { icon: "🪨", kicker: "Rock crushed", title: e.label.replace(/^(Weekly rock|Quarter rock|Goal) done: /, ""), sub: "" };
      default:
        return { icon: "🍀", kicker: "Lucky drop", title: "Rare blueprint found", sub: "" };
    }
  })();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-6 backdrop-blur-md" onClick={onDone}>
      <motion.div
        initial={{ scale: 0.7, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        onClick={(ev) => ev.stopPropagation()}
        className="relative w-full max-w-sm overflow-visible rounded-3xl border border-[#f5b819]/40 bg-panel-solid p-7 text-center shadow-[0_30px_80px_-20px_rgba(245,184,25,0.45)]"
      >
        <Burst />
        <div className="pointer-events-none absolute inset-x-0 -top-20 mx-auto h-40 w-40 rounded-full bg-[#f5b819]/25 blur-3xl" />
        <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.1 }} className="relative mx-auto grid size-24 place-items-center rounded-full bg-gradient-to-br from-[#f5b819]/30 to-[#f5b819]/5 text-5xl">
          {view.icon}
        </motion.div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#f5b819]">{view.kicker}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{view.title}</h2>
        {view.sub && <p className="mt-1.5 text-sm text-fg-2">{view.sub}</p>}
        {e.amount > 0 && (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35, type: "spring" }} className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-[#f5b819]/15 px-4 py-2">
            <CoinIcon size={26} />
            <span className="num text-2xl font-bold text-[#f5b819]">+{e.amount}</span>
          </motion.div>
        )}
        {unlocked && (
          <p className="mt-3 text-sm">
            🔓 <span className="font-semibold">{unlocked.name}</span> blueprint unlocked
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          {unlocked && (
            <Button asChild variant="secondary" onClick={onDone}>
              <Link href="/build">Build it</Link>
            </Button>
          )}
          <Button variant="primary" onClick={onDone}>
            Keep going
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
