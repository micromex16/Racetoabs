"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, Bell, Kanban, Mail, Hash, MessageCircle, Flame, Mic, ParkingSquare, Plus, ArrowRight, Reply, Shuffle } from "lucide-react";
import { ItemRow, ACTION_ICONS } from "./item-row";
import { SectionTitle, Badge, Empty } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { call, type QOut } from "@/lib/client";
import { ui } from "@/lib/ui-store";
import { celebrate } from "@/lib/confetti";
import { queueParking } from "@/lib/outbox";
import { cn, RING_COLORS } from "@/lib/utils";
import { toast } from "sonner";
import { SpeedrunStrip, Bounty, startSprint, ChallengeCard, PlantCard } from "@/components/game/widgets";
import { VentureCard } from "@/components/venture/live";
import { useQ } from "@/lib/client";
import { Timer } from "lucide-react";

type Today = QOut<"today">;
type PickT = Today["plan"]["picks"][number];

const KIND_ICON = { task: CheckSquare, followup: Bell, pipeline: Kanban } as const;
const KIND_LABEL = { task: "Task", followup: "Follow-up", pipeline: "Pipeline" } as const;

export function relDay(key: string | null | undefined, today: string) {
  if (!key) return "";
  const d = Math.round((Date.parse(key) - Date.parse(today)) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d < 0) return `${-d}d overdue`;
  if (d < 7) return new Date(key + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return new Date(key + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

async function completePick(p: PickT, done: boolean, allOthersDone: boolean) {
  if (done && allOthersDone) celebrate("big");
  if (p.kind === "task") await call("task.complete", { id: p.refId, done });
  else if (p.kind === "followup") await call("followup.complete", { id: p.refId, done });
  else await call("day.pipelineDone", { refId: p.refId, done });
}

async function snooze(p: { kind: string; refId: string }) {
  if (p.kind === "task") await call("task.snooze", { id: p.refId, days: 1 });
  else if (p.kind === "followup") {
    await call("followup.update", { id: p.refId, patch: { dueDate: "tomorrow" } });
  } else {
    await call("card.update", { id: p.refId, patch: { nextActionDate: "tomorrow" } });
  }
  toast("Snoozed to tomorrow");
}

export function PicksSection({ today }: { today: Today }) {
  const [swapSlot, setSwapSlot] = React.useState<number | null>(null);
  const picks = today.plan.picks;
  const doneCount = picks.filter((p) => p.done).length;
  return (
    <section>
      <SectionTitle
        right={
          <span className="num text-xs text-fg-2">
            {doneCount}/{picks.length} done
          </span>
        }
      >
        Do these 3 first
      </SectionTitle>
      <SpeedrunStrip today={today} />
      {picks.length === 0 ? (
        <Empty title="Nothing to pick from yet" hint="Add tasks linked to your rocks, follow-ups, or pipeline next actions — the picker chooses from those." action={<Button size="sm" variant="primary" onClick={() => ui.openNewTask()}><Plus /> Add a task</Button>} />
      ) : (
        <div className="space-y-2">
          {picks.map((p, i) => {
            const Icon = KIND_ICON[p.kind];
            const rockIdx = today.weeklyRocks.findIndex((r) => r.id === p.rockId);
            return (
              <ItemRow
                key={p.kind + p.refId}
                title={p.title}
                done={p.done}
                accent={rockIdx >= 0 ? RING_COLORS[rockIdx % 3] : "var(--accent)"}
                onToggle={(v) => completePick(p, v, picks.filter((x, j) => j !== i).every((x) => x.done))}
                onLeft={() => snooze(p)}
                onLongPress={p.kind === "task" ? () => ui.set({ delegate: { taskId: p.refId, title: p.title } }) : undefined}
                meta={
                  <>
                    <span className="num font-semibold text-fg-2">#{i + 1}</span>
                    <Badge tone="neutral">
                      <Icon className="size-3" />
                      {KIND_LABEL[p.kind]}
                    </Badge>
                    {p.due && <span className={cn(p.due < today.today && "text-bad")}>{relDay(p.due, today.today)}</span>}
                    {!p.exists && <Badge tone="warn">removed</Badge>}
                    <Bounty n={p.done ? 0 : p.bounty} />
                    {!p.done && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void startSprint({ title: p.title, kind: p.kind, refId: p.refId });
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent"
                      >
                        <Timer className="size-3" /> Sprint
                      </button>
                    )}
                  </>
                }
                reason={p.reason}
                actions={[
                  { label: "Focus sprint", icon: <Timer />, onSelect: () => void startSprint({ title: p.title, kind: p.kind, refId: p.refId }) },
                  { label: "Swap for another", icon: <Shuffle />, onSelect: () => setSwapSlot(i) },
                  { label: "Snooze to tomorrow", icon: <ACTION_ICONS.Clock />, onSelect: () => snooze(p) },
                  ...(p.kind === "task"
                    ? [
                        { label: "Delegate…", icon: <ACTION_ICONS.UserPlus />, onSelect: () => ui.set({ delegate: { taskId: p.refId, title: p.title } }) },
                        { label: "Park it", icon: <ACTION_ICONS.ParkingSquare />, onSelect: () => call("task.park", { id: p.refId }) },
                      ]
                    : []),
                ]}
              />
            );
          })}
        </div>
      )}
      <SwapDialog today={today} slot={swapSlot} onClose={() => setSwapSlot(null)} />
    </section>
  );
}

export function SwapDialog({ today, slot, onClose }: { today: Today; slot: number | null; onClose: () => void }) {
  return (
    <Modal open={slot != null} onOpenChange={(o) => !o && onClose()} title={`Swap pick #${(slot ?? 0) + 1}`} description="Ranked against your rocks. The reason travels with the pick.">
      <div className="space-y-2">
        {today.plan.candidates.length === 0 && <p className="text-sm text-muted">No other candidates right now.</p>}
        {today.plan.candidates.map((c) => {
          const Icon = KIND_ICON[c.kind];
          return (
            <button
              key={c.kind + c.refId}
              onClick={async () => {
                await call("day.swap", { slot: slot!, kind: c.kind, refId: c.refId });
                onClose();
              }}
              className="flex w-full items-start gap-3 rounded-xl border border-line bg-panel p-3 text-left transition hover:border-accent/40 hover:bg-panel-2"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.title}</p>
                <p className="mt-0.5 text-xs italic text-fg-2">{c.reason}</p>
              </div>
              <span className="num text-[11px] text-muted">{c.score}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function DueSections({ today }: { today: Today }) {
  const [showToday, setShowToday] = React.useState(false);
  const router = useRouter();
  return (
    <>
      {today.overdue.length > 0 && (
        <section>
          <SectionTitle count={today.overdue.length}>Overdue</SectionTitle>
          <div className="space-y-2">
            {today.overdue.map((t) => (
              <ItemRow
                key={t.id}
                overdue
                title={t.title}
                meta={
                  <>
                    <span className="text-bad">{relDay(t.due, today.today)}</span>
                    {t.goal && <span className="truncate">· {t.goal.title}</span>}
                    <Bounty n={t.bounty} />
                  </>
                }
                onToggle={(v) => call("task.complete", { id: t.id, done: v })}
                onLeft={() => snooze({ kind: "task", refId: t.id })}
                onLongPress={() => ui.set({ delegate: { taskId: t.id, title: t.title } })}
                actions={[
                  { label: "Snooze to tomorrow", icon: <ACTION_ICONS.Clock />, onSelect: () => snooze({ kind: "task", refId: t.id }) },
                  { label: "Delegate…", icon: <ACTION_ICONS.UserPlus />, onSelect: () => ui.set({ delegate: { taskId: t.id, title: t.title } }) },
                  { label: "Park it", icon: <ACTION_ICONS.ParkingSquare />, onSelect: () => call("task.park", { id: t.id }) },
                  { label: "Delete", icon: <ACTION_ICONS.Trash2 />, danger: true, onSelect: () => call("task.delete", { id: t.id }) },
                ]}
              />
            ))}
          </div>
        </section>
      )}
      {today.followUpsDue.length > 0 && (
        <section>
          <SectionTitle count={today.followUpsDue.length} right={<Link href="/accountability" className="text-xs text-muted hover:text-fg">All →</Link>}>
            Follow-ups due
          </SectionTitle>
          <div className="space-y-2">
            {today.followUpsDue.map((f) => (
              <ItemRow
                key={f.id}
                overdue={f.due < today.today}
                title={<>Chase {f.person?.name ?? "—"}: {f.title}</>}
                meta={
                  <>
                    <span className={cn(f.due < today.today && "text-bad")}>{relDay(f.due, today.today)}</span>
                    <Bounty n={f.bounty} />
                  </>
                }
                onToggle={(v) => call("followup.complete", { id: f.id, done: v })}
                onLeft={() => snooze({ kind: "followup", refId: f.id })}
                onClick={() => router.push(`/accountability?focus=${f.id}`)}
              />
            ))}
          </div>
        </section>
      )}
      {today.pipelineDue.length > 0 && (
        <section>
          <SectionTitle count={today.pipelineDue.length} right={<Link href="/pipeline" className="text-xs text-muted hover:text-fg">Board →</Link>}>
            Pipeline next actions
          </SectionTitle>
          <div className="space-y-2">
            {today.pipelineDue.map((c) => (
              <ItemRow
                key={c.id}
                overdue={c.nextActionDate < today.today}
                icon={<Kanban className="mt-0.5 size-5 shrink-0 text-accent" />}
                title={
                  <>
                    <span className="text-fg-2">{c.company}:</span> {c.nextAction || "set a next action"}
                  </>
                }
                meta={
                  <>
                    <Badge tone={c.lane === "DATA_CENTER" ? "r3" : c.lane === "AD" ? "r1" : "neutral"}>{c.lane === "DATA_CENTER" ? "Data Center" : c.lane === "AD" ? "A&D" : "Other"}</Badge>
                    <span>{c.stage.replace("_", " ").toLowerCase()}</span>
                    <span className={cn(c.nextActionDate < today.today && "text-bad")}>{relDay(c.nextActionDate, today.today)}</span>
                  </>
                }
                onLeft={() => snooze({ kind: "pipeline", refId: c.id })}
                onClick={() => router.push(`/pipeline?card=${c.id}`)}
              />
            ))}
          </div>
        </section>
      )}
      {today.dueToday.length > 0 && (
        <button onClick={() => setShowToday(!showToday)} className="w-full rounded-xl border border-dashed border-line-2 py-2.5 text-xs text-muted transition hover:text-fg-2">
          {showToday ? "Hide" : "Show"} {today.dueToday.length} more due today (not picked)
        </button>
      )}
      {showToday && (
        <div className="space-y-2">
          {today.dueToday.map((t) => (
            <ItemRow key={t.id} title={t.title} meta={t.goal?.title} onToggle={(v) => call("task.complete", { id: t.id, done: v })} onLeft={() => snooze({ kind: "task", refId: t.id })} onLongPress={() => ui.set({ delegate: { taskId: t.id, title: t.title } })} />
          ))}
        </div>
      )}
    </>
  );
}

const CH = {
  EMAIL: { icon: Mail, label: "Email", tone: "r3" as const },
  SLACK: { icon: Hash, label: "Slack", tone: "accent" as const },
  WHATSAPP: { icon: MessageCircle, label: "WhatsApp", tone: "r2" as const },
};

export function InboxPulse({ today }: { today: Today }) {
  const { counts, top, connected, pendingDrafts } = today.inbox;
  return (
    <section>
      <SectionTitle right={<Link href="/comms" className="text-xs text-muted hover:text-fg">Comms →</Link>}>Inbox pulse</SectionTitle>
      <div className="glass rounded-2xl p-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {(Object.keys(CH) as (keyof typeof CH)[]).map((k) => {
            const c = CH[k];
            return (
              <Link key={k} href={`/comms?channel=${k}`} className="flex shrink-0 items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2">
                <c.icon className="size-4 text-fg-2" />
                <span className="text-xs text-fg-2">{c.label}</span>
                <span className={cn("num text-sm font-semibold", counts[k] ? "text-fg" : "text-muted")}>{counts[k]}</span>
              </Link>
            );
          })}
        </div>
        {pendingDrafts > 0 && (
          <Link href="/comms" className="mt-2 flex items-center justify-between rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs font-medium text-warn">
            {pendingDrafts} draft{pendingDrafts > 1 ? "s" : ""} waiting for your approval <ArrowRight className="size-3.5" />
          </Link>
        )}
        {top.length === 0 ? (
          <p className="px-1 pb-1 pt-3 text-xs text-muted">
            {connected.length ? "Inbox is quiet. Nothing ranked important right now." : (
              <>
                No channels connected yet. <Link className="text-accent" href="/settings#integrations">Connect Email, Slack, WhatsApp →</Link>
              </>
            )}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {top.map((t) => {
              const c = CH[t.channel];
              const who = (t.participants as { name?: string; address?: string }[])?.[0];
              return (
                <li key={t.id} className="flex items-start gap-3 px-1 py-2.5">
                  <c.icon className="mt-0.5 size-4 shrink-0 text-muted" />
                  <Link href={`/comms?thread=${t.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {t.unread && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-accent align-middle" />}
                      {who?.name || who?.address || ""} {t.subject ? <span className="text-fg-2">· {t.subject}</span> : null}
                    </p>
                    <p className="line-clamp-1 text-xs text-fg-2">{t.aiSummary ?? t.snippet}</p>
                  </Link>
                  <Link href={`/comms?thread=${t.id}&reply=1`} className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-fg" aria-label="Reply">
                    <Reply className="size-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export function ParkingQuick({ count }: { count: number }) {
  const [text, setText] = React.useState("");
  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      await call("parking.add", { text: t, source: "typed" }, { silent: true });
      toast.success("Parked");
    } catch {
      queueParking(t, "typed");
      toast("Saved offline");
    }
  };
  return (
    <section>
      <div className="glass flex items-center gap-2 rounded-2xl p-1.5 pl-3.5">
        <ParkingSquare className="size-4 shrink-0 text-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Park a thought — it won't touch Today"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted sm:text-sm"
        />
        <Button variant="ghost" size="icon" onClick={() => ui.openCapture({ voice: true })} aria-label="Dictate">
          <Mic />
        </Button>
        <Link href="/parking" className="num rounded-xl bg-panel-2 px-2.5 py-2 text-xs text-fg-2">
          {count}
        </Link>
      </div>
    </section>
  );
}

export function StreakAndCadence({ today }: { today: Today }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Streak</span>
          <span className="text-[11px] text-muted">best {today.streak.best}</span>
        </div>
        <div className="mt-2 flex items-end gap-2">
          <Flame className={cn("size-7", today.streak.current ? "text-r1" : "text-muted")} />
          <span className="num text-4xl font-semibold leading-none tracking-tight">{today.streak.current}</span>
          <span className="pb-1 text-xs text-fg-2">days all 3 picks done</span>
        </div>
        <div className="mt-3 flex gap-1" aria-label="Last 14 days">
          {today.streak.last14.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.state}`}
              className={cn(
                "h-6 flex-1 rounded-[5px]",
                d.state === "done" ? "bg-r1 shadow-[0_0_10px_-2px_var(--r1)]" : d.state === "missed" ? "bg-bad/30" : d.state === "open" ? "border border-line-2" : "bg-track",
              )}
            />
          ))}
        </div>
      </div>
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Weekly cadence</span>
          <span className="text-[11px] text-muted">tap + to log</span>
        </div>
        <div className="mt-3 space-y-2.5">
          {today.cadence.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span data-done={c.done} className="strike-anim truncate text-sm">{c.title}</span>
                  {c.target != null && (
                    <span className="num text-xs text-fg-2">
                      <span className="font-semibold text-fg">{c.current ?? 0}</span>/{c.target}
                    </span>
                  )}
                </div>
                {c.target != null && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-track">
                    <div className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent transition-all duration-500" style={{ width: `${Math.min(100, ((c.current ?? 0) / c.target) * 100)}%` }} />
                  </div>
                )}
              </div>
              {c.metricKey ? (
                <Button
                  size="icon-sm"
                  variant="secondary"
                  aria-label={`Log one: ${c.title}`}
                  onClick={async () => {
                    await call("metric.record", { metricKey: c.metricKey!, value: 1, mode: "add" });
                    if (c.target != null && (c.current ?? 0) + 1 === c.target) celebrate("small");
                  }}
                >
                  <Plus />
                </Button>
              ) : c.taskId ? (
                <Button size="icon-sm" variant={c.done ? "good" : "secondary"} aria-label={`Done: ${c.title}`} onClick={() => call("task.complete", { id: c.taskId!, done: !c.done })}>
                  <CheckSquare />
                </Button>
              ) : null}
            </div>
          ))}
          {today.reviewDue && (
            <Link href="/review" className="mt-1 flex items-center justify-between rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs font-medium text-warn">
              Friday review is due <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** The game row on Today: this week's twist + the plant you're building. */
export function GameRow() {
  const { data: g } = useQ("game");
  return (
    <section className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {g ? <ChallengeCard c={g.challenge} compact /> : <div className="glass h-32 animate-pulse rounded-2xl" />}
      <PlantCard />
      <VentureCard />
    </section>
  );
}
