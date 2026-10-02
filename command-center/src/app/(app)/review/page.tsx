"use client";
import * as React from "react";
import { useQ, call, type QOut } from "@/lib/client";
import { Ring } from "@/components/viz/ring";
import { Button } from "@/components/ui/button";
import { Textarea, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";
import { Badge, SectionTitle, Skeleton, Empty, RagBadge } from "@/components/ui/misc";
import { Check } from "@/components/ui/check";
import { ParkingTriage } from "@/components/review/parking-triage";
import { SetWeeklyRocks } from "@/components/goals/set-weekly-rocks";
import { cn, RING_COLORS } from "@/lib/utils";
import { celebrate } from "@/lib/confetti";
import { ui } from "@/lib/ui-store";
import { ArrowLeft, ArrowRight, Lock, FileText, Copy, CheckCircle2, CalendarClock, ParkingSquare, UserPlus } from "lucide-react";
import { toast } from "sonner";

type Review = QOut<"review">;

const STEPS = ["Said vs. done", "Overdue", "Parking Lot", "Next week's rocks"] as const;

export default function ReviewPage() {
  const { data } = useQ("review");
  const [step, setStep] = React.useState(0);
  const [monthly, setMonthly] = React.useState(false);
  if (!data) return <Skeleton className="mx-auto h-96 max-w-4xl" />;
  const closed = !!data.review?.closedAt;
  const wkLabel = (k: string) => new Date(k + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-xs text-muted">
            Week of {wkLabel(data.weekStart)} – {wkLabel(data.weekEnd)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Friday Weekly Review</h1>
        </div>
        <div className="flex items-center gap-2">
          {closed && (
            <Badge tone="good">
              <CheckCircle2 className="size-3" /> Closed
            </Badge>
          )}
          <Button size="sm" variant="secondary" onClick={() => setMonthly(true)}>
            <FileText /> Monthly summary
          </Button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} className={cn("flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition", step === i ? "border-accent/50 bg-accent/12 text-fg" : "border-line bg-panel text-muted hover:text-fg-2")}>
            <span className={cn("num grid size-5 place-items-center rounded-full text-[10px]", step === i ? "bg-accent text-accent-fg" : "bg-panel-2")}>{i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      {step === 0 && <SaidVsDone data={data} />}
      {step === 1 && <Overdue data={data} />}
      {step === 2 && (
        <section>
          <SectionTitle count={data.parking.length}>Triage every item</SectionTitle>
          {data.parking.length ? <ParkingTriage items={data.parking} /> : <Empty icon={<ParkingSquare />} title="Parking Lot is clear" />}
        </section>
      )}
      {step === 3 && <NextWeek data={data} />}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          <ArrowLeft /> Back
        </Button>
        {step < 3 && (
          <Button variant="primary" onClick={() => setStep(step + 1)}>
            Next <ArrowRight />
          </Button>
        )}
      </div>

      <MonthlyModal open={monthly} onOpenChange={setMonthly} />
    </div>
  );
}

function Stat({ label, said, done }: { label: string; said: number; done: number }) {
  const pct = said ? Math.round((done / said) * 100) : 0;
  return (
    <div className="glass flex flex-col items-center gap-2 rounded-2xl p-3 text-center sm:flex-row sm:gap-4 sm:p-4 sm:text-left">
      <Ring value={pct} size={58} stroke={7}>
        <span className="num text-xs font-semibold">{pct}%</span>
      </Ring>
      <div>
        <div className="eyebrow !text-[10px] sm:!text-[11px]">{label}</div>
        <div className="mt-1 text-sm">
          <span className="num text-xl font-semibold">{done}</span>
          <span className="text-fg-2"> of {said}</span>
        </div>
      </div>
    </div>
  );
}

function SaidVsDone({ data }: { data: Review }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Rocks" said={data.said.rocks} done={data.done.rocks} />
        <Stat label="Tasks due" said={data.said.tasksDue} done={data.done.tasksDueDone} />
        <Stat label="Perfect days" said={data.done.plannedDays} done={data.done.picksDays} />
      </div>
      <section>
        <SectionTitle>This week&apos;s rocks</SectionTitle>
        <div className="space-y-2">
          {data.rocks.length === 0 && <p className="text-sm text-muted">No rocks were set this week.</p>}
          {data.rocks.map((r, i) => (
            <div key={r.id} className="glass flex items-center gap-3 rounded-2xl p-3">
              <Check checked={r.status === "DONE"} color={RING_COLORS[i % 3]} onChange={async (v) => { if (v) celebrate(); await call("goal.complete", { id: r.id, done: v }); }} />
              <span className="flex-1 text-sm">{r.title}</span>
              <span className="num text-sm font-semibold">{r.progress}%</span>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="glass rounded-2xl p-4">
          <div className="eyebrow">Tasks completed</div>
          <div className="num mt-1 text-2xl font-semibold">{data.done.tasksCompleted}</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="eyebrow">Follow-ups closed</div>
          <div className="num mt-1 text-2xl font-semibold">{data.done.followUpsClosed}</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="eyebrow">Pipeline moves</div>
          <div className="num mt-1 text-2xl font-semibold">{data.done.pipelineMoves}</div>
          <div className="text-[11px] text-muted">{data.done.newCards} new accounts</div>
        </div>
      </section>
      <section>
        <SectionTitle>Scoreboard this week</SectionTitle>
        <div className="glass divide-y divide-line rounded-2xl">
          {data.metrics.map((m) => (
            <MetricLine key={m.key} m={m} weekStart={data.weekStart} />
          ))}
        </div>
      </section>
      {data.daily.length > 0 && (
        <section>
          <SectionTitle>Daily picks</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-5">
            {data.daily.map((d) => (
              <div key={d.date} className={cn("rounded-xl border p-3 text-xs", d.allDone ? "border-good/30 bg-good/10" : "border-line bg-panel")}>
                <div className="mb-1.5 font-semibold">{new Date(d.date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} {d.allDone ? "✓" : ""}</div>
                <ul className="space-y-1 text-fg-2">
                  {d.picks.map((p, i) => (
                    <li key={i} className="line-clamp-2">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MetricLine({ m, weekStart }: { m: Review["metrics"][number]; weekStart: string }) {
  const [v, setV] = React.useState(m.value?.toString() ?? "");
  React.useEffect(() => setV(m.value?.toString() ?? ""), [m.value]);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex-1 text-sm">{m.name}</span>
      {m.source === "MANUAL" ? (
        <Input
          type="number"
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => v !== "" && Number(v) !== m.value && call("metric.record", { metricKey: m.key, weekStart, value: Number(v) })}
          className="num h-8 w-20 text-right"
          placeholder="—"
        />
      ) : (
        <span className="num w-20 text-right text-sm font-semibold">{m.value ?? "—"}</span>
      )}
      <span className="num w-14 text-right text-xs text-muted">{m.target != null ? `/ ${m.target}${m.unit === "%" ? "%" : ""}` : ""}</span>
      <RagBadge rag={m.rag} compact />
    </div>
  );
}

function Overdue({ data }: { data: Review }) {
  const nextMon = data.nextWeekStart;
  const empty = !data.overdue.tasks.length && !data.overdue.followUps.length;
  if (empty) return <Empty icon={<CheckCircle2 />} title="Nothing overdue" hint="Clean slate going into next week." />;
  return (
    <div className="space-y-6">
      {data.overdue.tasks.length > 0 && (
        <section>
          <SectionTitle count={data.overdue.tasks.length}>Overdue tasks</SectionTitle>
          <div className="space-y-1.5">
            {data.overdue.tasks.map((t) => (
              <div key={t.id} className="glass flex flex-col gap-2 rounded-xl border-bad/20 px-3.5 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{t.title}</p>
                  <p className="text-[11px] text-muted">
                    due {t.due} {t.owner ? `· ${t.owner}` : ""} {t.goal ? `· ${t.goal}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="good" onClick={() => call("task.complete", { id: t.id })}>Done</Button>
                  <Button size="sm" variant="ghost" onClick={() => call("task.update", { id: t.id, patch: { dueDate: nextMon } })}>
                    <CalendarClock /> Mon
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => ui.set({ delegate: { taskId: t.id, title: t.title } })}>
                    <UserPlus />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => call("task.park", { id: t.id })}>
                    <ParkingSquare />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {data.overdue.followUps.length > 0 && (
        <section>
          <SectionTitle count={data.overdue.followUps.length}>Overdue follow-ups</SectionTitle>
          <div className="space-y-1.5">
            {data.overdue.followUps.map((f) => (
              <div key={f.id} className="glass flex items-center gap-2 rounded-xl px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {f.person ? `${f.person}: ` : ""}
                    {f.title}
                  </p>
                  <p className="text-[11px] text-muted">due {f.due}</p>
                </div>
                <Button size="sm" variant="good" onClick={() => call("followup.complete", { id: f.id })}>Done</Button>
                <Button size="sm" variant="ghost" onClick={() => call("followup.update", { id: f.id, patch: { dueDate: nextMon } })}>
                  <CalendarClock /> Mon
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NextWeek({ data }: { data: Review }) {
  const [notes, setNotes] = React.useState(data.review?.notes ?? "");
  const [wins, setWins] = React.useState(data.review?.wins ?? "");
  const canClose = data.nextRocks.length > 0;
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Set next week&apos;s rocks</SectionTitle>
        <div className="glass rounded-2xl p-4">
          <SetWeeklyRocks key={data.nextRocks.length} weekStart={data.nextWeekStart} existing={data.nextRocks} quarterlyRocks={data.quarterlyRocks} />
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <SectionTitle>Wins</SectionTitle>
          <Textarea value={wins} onChange={(e) => setWins(e.target.value)} onBlur={() => call("review.save", { weekStart: data.weekStart, wins }, { refresh: false })} placeholder="What moved?" />
        </div>
        <div>
          <SectionTitle>Notes / lessons</SectionTitle>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => call("review.save", { weekStart: data.weekStart, notes }, { refresh: false })} placeholder="What got in the way?" />
        </div>
      </section>
      <div className="glass flex flex-col items-center gap-3 rounded-2xl p-5 text-center sm:flex-row sm:text-left">
        {!canClose && <Lock className="size-5 text-warn" />}
        <p className="flex-1 text-sm text-fg-2">{canClose ? "Rocks are set. Close the week." : "The review can't close until next week's rocks are set."}</p>
        <Button
          variant="primary"
          size="lg"
          disabled={!canClose}
          onClick={async () => {
            await call("review.close", { weekStart: data.weekStart, notes, wins });
            celebrate("big");
            toast.success("Week closed. Enjoy the weekend.");
          }}
        >
          Close the week
        </Button>
      </div>
    </div>
  );
}

function MonthlyModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7));
  const { data } = useQ("monthly", { month }, { isPaused: () => !open });
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Monthly progress summary" wide>
      <div className="mb-3 flex items-center gap-2">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
        <Button
          variant="primary"
          size="sm"
          className="ml-auto"
          disabled={!data}
          onClick={async () => {
            await navigator.clipboard.writeText(data!.markdown);
            toast.success("Copied");
          }}
        >
          <Copy /> Copy
        </Button>
      </div>
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-panel p-4 font-mono text-xs leading-relaxed text-fg-2">{data?.markdown ?? "Loading…"}</pre>
    </Modal>
  );
}
