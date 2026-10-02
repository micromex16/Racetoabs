"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Flame, Check as CheckIcon, ArrowRight, ParkingSquare, Moon } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQ, call } from "@/lib/client";
import { useUI, ui } from "@/lib/ui-store";
import { celebrate } from "@/lib/confetti";
import { cn } from "@/lib/utils";

type Action = "done" | "carry" | "park";
type Row = { kind: "task" | "followup" | "pipeline"; refId: string; title: string; done: boolean; pick: boolean };

/** One tap closes the day: done stays done, everything else carries forward (or gets parked). */
export function EndOfDay() {
  const open = useUI((s) => s.closeDay);
  const { data: today } = useQ("today");
  const [actions, setActions] = React.useState<Record<string, Action>>({});
  const [result, setResult] = React.useState<{ allDone: boolean; streak: { current: number; best: number }; tomorrow: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const rows: Row[] = React.useMemo(() => {
    if (!today) return [];
    return [
      ...today.plan.picks.map((p) => ({ kind: p.kind, refId: p.refId, title: p.title, done: p.done, pick: true })),
      ...today.overdue.map((t) => ({ kind: "task" as const, refId: t.id, title: t.title, done: false, pick: false })),
      ...today.dueToday.map((t) => ({ kind: "task" as const, refId: t.id, title: t.title, done: false, pick: false })),
      ...today.followUpsDue.map((f) => ({ kind: "followup" as const, refId: f.id, title: `Chase ${f.person?.name ?? ""}: ${f.title}`, done: false, pick: false })),
    ];
  }, [today]);

  React.useEffect(() => {
    if (open) {
      setResult(null);
      setActions(Object.fromEntries(rows.map((r) => [r.kind + r.refId, r.done ? "done" : "carry"])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Deep link from the 4:30 push: /?close=1
  React.useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("close") === "1") {
      ui.set({ closeDay: true });
      window.history.replaceState(null, "", "/");
    }
  }, []);

  const close = () => ui.set({ closeDay: false });

  const submit = async () => {
    setBusy(true);
    try {
      const list = rows
        .filter((r) => !(r.done && actions[r.kind + r.refId] === "done"))
        .map((r) => ({ kind: r.kind, refId: r.refId, action: actions[r.kind + r.refId] ?? "carry" }));
      const res = await call("day.close", { actions: list });
      setResult(res);
      if (res.allDone) celebrate("big");
    } finally {
      setBusy(false);
    }
  };

  const picksDone = rows.filter((r) => r.pick && (r.done || actions[r.kind + r.refId] === "done")).length;
  const pickCount = rows.filter((r) => r.pick).length;

  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title={result ? undefined : "Close the day"} description={result ? undefined : `${picksDone}/${pickCount} picks done. Everything unfinished carries to tomorrow unless you park it.`}>
      {result ? (
        <div className="py-6 text-center">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }} className="mx-auto grid size-28 place-items-center rounded-full bg-gradient-to-br from-r1/30 to-r1/5">
            <Flame className={cn("size-14", result.allDone ? "text-r1" : "text-muted")} />
          </motion.div>
          <div className="num mt-4 text-5xl font-semibold tracking-tight">{result.streak.current}</div>
          <p className="mt-1 text-sm text-fg-2">day streak · best {result.streak.best}</p>
          <p className="mx-auto mt-4 max-w-xs text-sm text-fg-2">{result.allDone ? "All three picks done. That's how exits get built." : "Streak needs all three picks. Tomorrow's a clean shot."}</p>
          <Button className="mt-6" variant="primary" size="lg" onClick={close}>
            <Moon /> Done for today
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.length === 0 && <p className="py-4 text-center text-sm text-muted">Nothing open. Clean close.</p>}
          {rows.map((r) => {
            const k = r.kind + r.refId;
            const a = actions[k] ?? "carry";
            return (
              <div key={k} className="rounded-xl border border-line bg-panel p-3">
                <p className={cn("text-sm", a === "done" && "text-fg-2 line-through")}>
                  {r.pick && <span className="mr-1.5 text-[10px] font-bold uppercase text-accent">pick</span>}
                  {r.title}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ["done", "Done", CheckIcon, "border-good/50 bg-good/15 text-good"],
                      ["carry", "Tomorrow", ArrowRight, "border-accent/50 bg-accent/15 text-accent"],
                      ["park", "Park", ParkingSquare, "border-warn/50 bg-warn/15 text-warn"],
                    ] as const
                  ).map(([v, label, Icon, on]) => (
                    <button
                      key={v}
                      onClick={() => setActions({ ...actions, [k]: v })}
                      disabled={r.done && v !== "done"}
                      className={cn("flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition disabled:opacity-30", a === v ? on : "border-line text-muted")}
                    >
                      <Icon className="size-3.5" /> {label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <Button variant="primary" size="xl" className="mt-3 w-full" onClick={submit} disabled={busy}>
            <Moon /> Close the day
          </Button>
        </div>
      )}
    </Modal>
  );
}
