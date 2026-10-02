"use client";
import * as React from "react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSearchParams } from "next/navigation";
import { GripVertical, Plus, ChevronRight, Archive, Pencil, CheckSquare } from "lucide-react";
import { useQ, call } from "@/lib/client";
import { Ring, CountUp } from "@/components/viz/ring";
import { Bar } from "@/components/viz/sparkline";
import { Check } from "@/components/ui/check";
import { Button } from "@/components/ui/button";
import { Badge, SectionTitle, Skeleton, Segmented } from "@/components/ui/misc";
import { GoalEditor, flatten, type GNode, type EditorState } from "@/components/goals/goal-editor";
import { celebrate } from "@/lib/confetti";
import { cn, RING_COLORS } from "@/lib/utils";
import { ui } from "@/lib/ui-store";
import { relDay } from "@/components/today/sections";

const STATUS_TONE = { NOT_STARTED: "neutral", ON_TRACK: "good", AT_RISK: "warn", OFF_TRACK: "bad", DONE: "accent" } as const;
const STATUS_LABEL = { NOT_STARTED: "Not started", ON_TRACK: "On track", AT_RISK: "At risk", OFF_TRACK: "Off track", DONE: "Done" } as const;

export default function GoalsPage() {
  return (
    <React.Suspense>
      <GoalsInner />
    </React.Suspense>
  );
}

function GoalsInner() {
  const { data } = useQ("goals");
  const [editor, setEditor] = React.useState<EditorState>(null);
  const [view, setView] = React.useState<"current" | "all">("current");
  const params = useSearchParams();
  const focus = params.get("focus");

  React.useEffect(() => {
    if (focus && data) {
      const g = flatten(data.tree).find((x) => x.id === focus);
      if (g) setEditor({ mode: "edit", goal: g });
    }
  }, [focus, data]);

  if (!data) return <div className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-48 rounded-3xl" /><Skeleton className="h-64" /></div>;

  const all = flatten(data.tree);
  const exit = all.find((g) => g.level === "EXIT");
  const annual = all.filter((g) => g.level === "ANNUAL");
  const quarterly = all.filter((g) => g.level === "QUARTERLY");
  const weekly = all.filter((g) => g.level === "WEEKLY");
  const thisQ = { year: Number(data.today.slice(0, 4)), quarter: Math.ceil(Number(data.today.slice(5, 7)) / 3) };

  const qGroups = new Map<string, GNode[]>();
  for (const q of quarterly) {
    const k = q.year && q.quarter ? `${q.year}-Q${q.quarter}` : "Unscheduled";
    qGroups.set(k, [...(qGroups.get(k) ?? []), q]);
  }
  const qKeys = [...qGroups.keys()].sort();
  const currentQKey = `${thisQ.year}-Q${thisQ.quarter}`;
  const visibleQKeys = view === "current" ? qKeys.filter((k) => k >= currentQKey).slice(0, 2) : qKeys;

  const wGroups = new Map<string, GNode[]>();
  for (const w of weekly) wGroups.set(w.weekStart ?? "", [...(wGroups.get(w.weekStart ?? "") ?? []), w]);
  const wKeys = [...wGroups.keys()].sort().reverse();
  const visibleWKeys = view === "current" ? wKeys.filter((k) => k >= data.weekStart) : wKeys;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {exit && <ExitHero exit={exit} onEdit={() => setEditor({ mode: "edit", goal: exit })} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: "current", label: "Current" }, { value: "all", label: "Everything" }]} />
        <Button size="sm" variant="ghost" onClick={() => call("goal.archiveCompleted", {})}>
          <Archive /> Archive completed rocks
        </Button>
      </div>

      <section>
        <SectionTitle right={<AddBtn onClick={() => setEditor({ mode: "new", level: "ANNUAL", parentId: exit?.id, year: thisQ.year + 1 })} />}>Annual goals</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {annual.map((g) => (
            <button key={g.id} onClick={() => setEditor({ mode: "edit", goal: g })} className="glass group flex items-center gap-4 rounded-2xl p-4 text-left transition hover:border-line-2">
              <Ring value={g.progress} size={64} stroke={7} expected={g.expected}>
                <span className="num text-sm font-semibold">{g.progress}%</span>
              </Ring>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{g.year}</div>
                <p data-done={g.status === "DONE"} className="strike-anim text-sm font-medium leading-snug">{g.title}</p>
                <p className="mt-1 text-[11px] text-muted">{g.children.length} rocks</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {visibleWKeys.map((wk) => (
        <section key={wk}>
          <SectionTitle right={<AddBtn onClick={() => setEditor({ mode: "new", level: "WEEKLY", weekStart: wk })} />}>
            {wk === data.weekStart ? "This week's rocks" : `Week of ${relDay(wk, data.today) || wk}`}
          </SectionTitle>
          <SortableGroup items={wGroups.get(wk)!} onEdit={(g) => setEditor({ mode: "edit", goal: g })} colored />
        </section>
      ))}
      {!visibleWKeys.includes(data.weekStart) && (
        <section>
          <SectionTitle>This week&apos;s rocks</SectionTitle>
          <Button variant="secondary" onClick={() => setEditor({ mode: "new", level: "WEEKLY", weekStart: data.weekStart })}>
            <Plus /> Add a weekly rock
          </Button>
        </section>
      )}

      {visibleQKeys.map((k) => (
        <section key={k}>
          <SectionTitle
            right={<AddBtn onClick={() => setEditor({ mode: "new", level: "QUARTERLY", year: Number(k.slice(0, 4)), quarter: Number(k.slice(-1)) })} />}
          >
            {k.replace("-", " ")} rocks {k === currentQKey && <Badge tone="accent">current</Badge>}
          </SectionTitle>
          <SortableGroup items={qGroups.get(k)!} onEdit={(g) => setEditor({ mode: "edit", goal: g })} numbered />
        </section>
      ))}

      <GoalEditor state={editor} onClose={() => setEditor(null)} all={all} />
    </div>
  );
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button size="icon-sm" variant="ghost" onClick={onClick} aria-label="Add">
      <Plus />
    </Button>
  );
}

function ExitHero({ exit, onEdit }: { exit: GNode; onEdit: () => void }) {
  return (
    <section className="glass relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative flex flex-col items-center gap-6 sm:flex-row">
        <Ring value={exit.progress} size={150} stroke={14} color="var(--accent)" expected={exit.expected}>
          <div>
            <CountUp value={exit.progress} suffix="%" className="text-3xl font-semibold" />
            <div className="text-[10px] uppercase tracking-wider text-muted">rolled up</div>
          </div>
        </Ring>
        <div className="flex-1 text-center sm:text-left">
          <p className="eyebrow text-accent">5-year target</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{exit.title}</h2>
          <p className="mt-2 text-sm text-fg-2">
            <span className="num font-semibold text-term">{exit.daysLeft?.toLocaleString()}</span> days left · {exit.children.length} annual goals beneath it
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil /> Edit
        </Button>
      </div>
    </section>
  );
}

function SortableGroup({ items, onEdit, colored, numbered }: { items: GNode[]; onEdit: (g: GNode) => void; colored?: boolean; numbered?: boolean }) {
  const [order, setOrder] = React.useState(items.map((i) => i.id));
  React.useEffect(() => setOrder(items.map((i) => i.id)), [items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }));
  const byId = new Map(items.map((i) => [i.id, i]));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(order, order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)));
    setOrder(next);
    void call("goal.reorder", { ids: next });
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {order.map((id, i) => byId.get(id) && <GoalRow key={id} goal={byId.get(id)!} index={i} onEdit={onEdit} color={colored ? RING_COLORS[i % 3] : undefined} numbered={numbered || colored} />)}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function GoalRow({ goal, index, onEdit, color, numbered }: { goal: GNode; index: number; onEdit: (g: GNode) => void; color?: string; numbered?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id });
  const [open, setOpen] = React.useState(false);
  const done = goal.status === "DONE";
  const c = color ?? "var(--accent)";
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("glass rounded-2xl", isDragging && "z-10 shadow-2xl ring-1 ring-accent/40")}>
      <div className="group flex items-center gap-3 px-3 py-3 sm:px-4">
        <button {...attributes} {...listeners} className="hidden cursor-grab touch-none text-muted opacity-0 transition group-hover:opacity-100 sm:block" aria-label="Drag to reorder">
          <GripVertical className="size-4" />
        </button>
        <Check
          checked={done}
          color={c}
          onChange={async (v) => {
            if (v) celebrate(goal.level === "QUARTERLY" ? "big" : "small");
            await call("goal.complete", { id: goal.id, done: v });
          }}
        />
        <button onClick={() => onEdit(goal)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            {numbered && (
              <span className="num text-[11px] font-bold" style={{ color: c }}>
                #{index + 1}
              </span>
            )}
            <p data-done={done} className="strike-anim truncate text-[15px] font-medium sm:text-sm">
              {goal.title}
            </p>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Bar value={goal.progress} color={c} expected={goal.expected} className="max-w-xs" />
            <span className="num shrink-0 text-xs font-semibold">{goal.progress}%</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <Badge tone={STATUS_TONE[goal.status]}>{STATUS_LABEL[goal.status]}</Badge>
            {goal.owner && goal.owner !== "Me" && <span>{goal.owner}</span>}
            {goal.daysLeft != null && <span>{goal.daysLeft >= 0 ? `${goal.daysLeft}d left` : `${-goal.daysLeft}d past due`}</span>}
            {goal.measureDetail.map((m) => (
              <span key={m.metricKey} className="num">
                {m.name}: <span className="text-fg-2">{m.actual}</span>/{m.target}
              </span>
            ))}
            {goal.expected != null && goal.expected - goal.progress >= 15 && <span className="text-warn">▲ behind pace</span>}
          </div>
        </button>
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-panel-2 hover:text-fg" aria-expanded={open}>
          <CheckSquare className="size-3.5" />
          <span className="num">{goal.taskCounts.open}</span>
          <ChevronRight className={cn("size-3.5 transition", open && "rotate-90")} />
        </button>
      </div>
      {open && <GoalTasks goalId={goal.id} />}
    </div>
  );
}

function GoalTasks({ goalId }: { goalId: string }) {
  const { data } = useQ("tasks", { goalId, status: "ALL" });
  const [title, setTitle] = React.useState("");
  const tasks = (data ?? []).filter((t) => t.status !== "CANCELLED");
  return (
    <div className="space-y-1 border-t border-line px-4 py-3">
      {tasks.map((t) => (
        <div key={t.id} className="group flex items-center gap-2.5 py-1">
          <Check size={18} checked={t.status === "DONE"} onChange={(v) => call("task.complete", { id: t.id, done: v })} />
          <span data-done={t.status === "DONE"} className="strike-anim flex-1 text-sm">
            {t.title}
          </span>
          {t.owner && <Badge>{t.owner.name}</Badge>}
          {t.dueDate && <span className="text-[11px] text-muted">{t.dueDate.slice(5, 10)}</span>}
          <button onClick={() => ui.set({ delegate: { taskId: t.id, title: t.title } })} className="text-[11px] text-muted opacity-0 hover:text-fg group-hover:opacity-100">
            delegate
          </button>
        </div>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await call("task.create", { title, goalId });
          setTitle("");
        }}
        className="flex items-center gap-2 pt-1"
      >
        <Plus className="size-4 text-muted" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task to this goal" className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
      </form>
    </div>
  );
}
