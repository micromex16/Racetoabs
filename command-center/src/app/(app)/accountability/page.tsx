"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Plus, ChevronDown, MessageSquare, Phone, Mail, Hash, MessageCircle, Users, StickyNote, Trash2, Link2 } from "lucide-react";
import { useQ, call, type QOut } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input, Select, Field, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";
import { Badge, SectionTitle, Skeleton, Empty } from "@/components/ui/misc";
import { Check } from "@/components/ui/check";
import { DateChips, nextWeekdayKey, todayLocalKey } from "@/components/app/date-chips";
import { RockPicker } from "@/components/app/rock-picker";
import { SwipeRow } from "@/components/app/swipe-row";
import { relDay } from "@/components/today/sections";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type FU = QOut<"followUps">[number];
const CHANNELS = [
  ["note", "Note", StickyNote],
  ["call", "Call", Phone],
  ["email", "Email", Mail],
  ["slack", "Slack", Hash],
  ["whatsapp", "WhatsApp", MessageCircle],
  ["in-person", "In person", Users],
] as const;

export default function AccountabilityPage() {
  return (
    <React.Suspense>
      <Inner />
    </React.Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const [person, setPerson] = React.useState<string | null>(params.get("person"));
  const [showDone, setShowDone] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const { data: fus } = useQ("followUps", { status: showDone ? "ALL" : "OPEN", ...(person ? { personId: person } : {}) });
  const { data: people } = useQ("people");
  const { data: delegated } = useQ("tasks", { delegated: true, status: "OPEN" });
  const today = todayLocalKey();
  const focus = params.get("focus");

  if (!fus || !people) return <Skeleton className="mx-auto h-96 max-w-4xl" />;
  const open = fus.filter((f) => f.status === "OPEN");
  const weekEnd = nextWeekdayKey(0);
  const groups = [
    { label: "Overdue", items: open.filter((f) => f.dueDate.slice(0, 10) < today), tone: "bad" },
    { label: "Today", items: open.filter((f) => f.dueDate.slice(0, 10) === today), tone: "accent" },
    { label: "This week", items: open.filter((f) => f.dueDate.slice(0, 10) > today && f.dueDate.slice(0, 10) <= weekEnd), tone: "neutral" },
    { label: "Later", items: open.filter((f) => f.dueDate.slice(0, 10) > weekEnd), tone: "neutral" },
  ];
  const done = fus.filter((f) => f.status !== "OPEN");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accountability</h1>
          <p className="mt-1 text-sm text-fg-2">Who owes what, by when — and every touch along the way.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus /> Follow-up
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ["Open", open.length, ""],
          ["Overdue", groups[0].items.length, groups[0].items.length ? "text-bad" : ""],
          ["Delegated", delegated?.length ?? 0, ""],
        ].map(([l, n, c]) => (
          <div key={l as string} className="glass rounded-2xl p-3 sm:p-4">
            <div className="eyebrow !text-[10px]">{l}</div>
            <div className={cn("num mt-1 text-3xl font-semibold", c as string)}>{n as number}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        <PersonChip active={!person} onClick={() => setPerson(null)} label="Everyone" />
        {people.map((p) => (
          <PersonChip key={p.id} active={person === p.id} onClick={() => setPerson(p.id)} label={p.name} />
        ))}
      </div>

      {open.length === 0 && <Empty icon={<Users />} title="No open follow-ups" hint="Delegate a task (long-press on phone) or add a follow-up. Or tell the agent: “chase Juan on the Dyson SOW Thursday”." />}

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.label}>
              <SectionTitle count={g.items.length} className={g.tone === "bad" ? "[&_h2]:text-bad" : ""}>
                {g.label}
              </SectionTitle>
              <div className="space-y-2">
                {g.items.map((f) => (
                  <FollowUpCard key={f.id} f={f} today={today} defaultOpen={focus === f.id} />
                ))}
              </div>
            </section>
          ),
      )}

      {delegated && delegated.length > 0 && (
        <section>
          <SectionTitle count={delegated.length}>Delegated tasks</SectionTitle>
          <div className="glass divide-y divide-line rounded-2xl">
            {delegated.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <Check size={18} checked={t.status === "DONE"} onChange={(v) => call("task.complete", { id: t.id, done: v })} />
                <span className="flex-1 text-sm">{t.title}</span>
                <Badge>{t.owner?.name}</Badge>
                {t.dueDate && <span className="text-xs text-muted">{relDay(t.dueDate.slice(0, 10), today)}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <button onClick={() => setShowDone(!showDone)} className="text-xs text-muted hover:text-fg-2">
        {showDone ? "Hide" : "Show"} closed follow-ups
      </button>
      {showDone && (
        <div className="space-y-2 opacity-70">
          {done.map((f) => (
            <FollowUpCard key={f.id} f={f} today={today} />
          ))}
        </div>
      )}

      <NewFollowUp open={creating} onOpenChange={setCreating} people={people} />
    </div>
  );
}

function PersonChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition", active ? "border-accent/50 bg-accent/15 text-accent" : "border-line bg-panel text-fg-2")}>
      {label}
    </button>
  );
}

function FollowUpCard({ f, today, defaultOpen }: { f: FU; today: string; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const [note, setNote] = React.useState("");
  const [channel, setChannel] = React.useState<string>("note");
  const [next, setNext] = React.useState<string | null>(null);
  const due = f.dueDate.slice(0, 10);
  const overdue = f.status === "OPEN" && due < today;
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (defaultOpen) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [defaultOpen]);

  return (
    <SwipeRow onDone={f.status === "OPEN" ? () => call("followup.complete", { id: f.id }) : undefined} onLeft={() => call("followup.update", { id: f.id, patch: { dueDate: "tomorrow" } })}>
      <div ref={ref} className={cn("glass rounded-2xl", overdue && "border-bad/35 bg-bad/[0.07]")}>
        <div className="flex items-start gap-3 px-3.5 py-3">
          <Check checked={f.status === "DONE"} onChange={(v) => call("followup.complete", { id: f.id, done: v })} color={overdue ? "var(--bad)" : "var(--good)"} className="mt-0.5" />
          <button onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left">
            <p data-done={f.status === "DONE"} className="strike-anim text-[15px] font-medium sm:text-sm">
              {f.person && <span className="text-fg-2">{f.person.name} · </span>}
              {f.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className={cn(overdue && "font-semibold text-bad")}>{relDay(due, today)}</span>
              {f.touches.length > 0 && (
                <span className="flex items-center gap-1">
                  <MessageSquare className="size-3" /> {f.touches.length} touch{f.touches.length > 1 ? "es" : ""} · last {relDay(f.touches[0].at.slice(0, 10), today)}
                </span>
              )}
              {f.goal && <Badge>{f.goal.title}</Badge>}
              {f.pipelineCard && <Badge tone="r3">{f.pipelineCard.company}</Badge>}
              {f.thread && (
                <Badge>
                  <Link2 className="size-3" /> {f.thread.subject || f.thread.channel.toLowerCase()}
                </Badge>
              )}
            </div>
          </button>
          <ChevronDown className={cn("mt-1 size-4 text-muted transition", open && "rotate-180")} />
        </div>
        {open && (
          <div className="border-t border-line px-4 py-3">
            {f.notes && <p className="mb-3 text-sm text-fg-2">{f.notes}</p>}
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!note.trim()) return;
                await call("followup.touch", { id: f.id, note, channel, nextDate: next ?? undefined });
                setNote("");
                setNext(null);
                toast.success("Touch logged");
              }}
            >
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                {CHANNELS.map(([v, l, I]) => (
                  <button type="button" key={v} onClick={() => setChannel(v)} className={cn("flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px]", channel === v ? "border-accent/50 bg-accent/15 text-accent" : "border-line text-muted")}>
                    <I className="size-3" /> {l}
                  </button>
                ))}
              </div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? (e.g. ‘said Thursday’)" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted">Next chase:</span>
                <DateChips value={next} onChange={setNext} />
              </div>
              <div className="flex justify-between">
                <Button type="button" size="sm" variant="ghost" className="text-muted hover:text-bad" onClick={() => confirm("Delete this follow-up?") && call("followup.delete", { id: f.id })}>
                  <Trash2 />
                </Button>
                <Button type="submit" size="sm" variant="primary" disabled={!note.trim()}>
                  Log touch
                </Button>
              </div>
            </form>
            {f.touches.length > 0 && (
              <ol className="relative mt-4 space-y-3 border-l border-line-2 pl-4">
                {f.touches.map((t) => {
                  const C = CHANNELS.find((c) => c[0] === t.channel);
                  const I = C?.[2] ?? StickyNote;
                  return (
                    <li key={t.id} className="relative">
                      <span className="absolute -left-[22px] top-0.5 grid size-3 place-items-center rounded-full bg-accent ring-4 ring-[var(--bg)]" />
                      <p className="text-sm">{t.note}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                        <I className="size-3" /> {new Date(t.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>
    </SwipeRow>
  );
}

function NewFollowUp({ open, onOpenChange, people }: { open: boolean; onOpenChange: (o: boolean) => void; people: QOut<"people"> }) {
  const [title, setTitle] = React.useState("");
  const [personId, setPersonId] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [date, setDate] = React.useState<string | null>(nextWeekdayKey(4));
  const [goalId, setGoalId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setTitle("");
      setPersonId("");
      setNewName("");
      setNotes("");
      setGoalId(null);
      setDate(nextWeekdayKey(4));
    }
  }, [open]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New follow-up">
      <div className="space-y-4">
        <Input autoFocus placeholder="What are you chasing?" value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 text-base" />
        <Field label="Who">
          <div className="flex gap-2">
            <Select value={personId} onChange={(e) => setPersonId(e.target.value)} className="flex-1">
              <option value="">New person…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            {!personId && <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />}
          </div>
        </Field>
        <Field label="Follow up on">
          <DateChips value={date} onChange={setDate} allowNone={false} />
        </Field>
        <Field label="Serves (optional)">
          <RockPicker value={goalId} onChange={setGoalId} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" />
        </Field>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!title.trim() || !date || (!personId && !newName.trim())}
          onClick={async () => {
            await call("followup.create", { title, dueDate: date!, personId: personId || null, personName: personId ? null : newName, goalId, notes });
            toast.success("Follow-up set");
            onOpenChange(false);
          }}
        >
          Add follow-up
        </Button>
      </div>
    </Modal>
  );
}
