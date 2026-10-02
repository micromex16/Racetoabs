"use client";
import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Plus, Search, Upload, Users, MessageSquare, AlertCircle, ArrowRight } from "lucide-react";
import { useQ, call, type QOut } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";
import { Badge, Segmented, Skeleton, Empty } from "@/components/ui/misc";
import { CardDrawer } from "@/components/pipeline/card-drawer";
import { STAGES, STAGE_LABEL, LANE_LABEL, LANE_TONE, type Lane, type Stage } from "@/components/pipeline/shared";
import { todayLocalKey } from "@/components/app/date-chips";
import { relDay } from "@/components/today/sections";
import { celebrate } from "@/lib/confetti";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Card = QOut<"pipeline">[number];

export default function PipelinePage() {
  return (
    <React.Suspense>
      <Board />
    </React.Suspense>
  );
}

function Board() {
  const params = useSearchParams();
  const router = useRouter();
  const [lane, setLane] = React.useState<Lane | "ALL">("ALL");
  const [q, setQ] = React.useState("");
  const [mobileStage, setMobileStage] = React.useState<Stage>("TARGET");
  const [importing, setImporting] = React.useState(false);
  const [active, setActive] = React.useState<Card | null>(null);
  const openId = params.get("card");
  const setOpen = (id: string | null) => router.replace(id ? `/pipeline?card=${id}` : "/pipeline", { scroll: false });
  const { data } = useQ("pipeline", { ...(lane !== "ALL" ? { lane } : {}), ...(q.length > 1 ? { q } : {}) });
  const [local, setLocal] = React.useState<Card[] | null>(null);
  React.useEffect(() => setLocal(data ?? null), [data]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const today = todayLocalKey();

  if (!local) return <Skeleton className="h-[70vh]" />;
  const byStage = (s: Stage) => local.filter((c) => c.stage === s);

  const onDragStart = (e: DragStartEvent) => setActive(local.find((c) => c.id === e.active.id) ?? null);
  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const stage = e.over?.id as Stage | undefined;
    const card = local.find((c) => c.id === e.active.id);
    if (!stage || !card || card.stage === stage) return;
    setLocal(local.map((c) => (c.id === card.id ? { ...c, stage } : c)));
    if (stage === "CUSTOMER") celebrate("big");
    await call("card.move", { id: card.id, stage });
    toast.success(`${card.company} → ${STAGE_LABEL[stage]}`, { description: card.nextAction ? `Next: ${card.nextAction}` : "Set a next action" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-xs text-muted">{local.length} accounts · next actions feed Today</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company or contact" className="h-9 w-48 pl-8" />
          </div>
          <Segmented
            value={lane}
            onChange={setLane}
            options={[
              { value: "ALL", label: "All" },
              { value: "DATA_CENTER", label: "Data Center" },
              { value: "AD", label: "A&D" },
              { value: "OTHER", label: "Other" },
            ]}
          />
          <Button size="sm" variant="ghost" onClick={() => setImporting(true)}>
            <Upload /> Import
          </Button>
          <Button size="sm" variant="primary" onClick={() => setOpen("new")}>
            <Plus /> Account
          </Button>
        </div>
      </div>

      {local.length === 0 && !q && (
        <Empty icon={<Users />} title="No accounts yet" hint="Rock #3: 100 target accounts with 3 contacts each. Paste a CSV with Import, or add one at a time." action={<Button size="sm" variant="primary" onClick={() => setImporting(true)}><Upload /> Import a list</Button>} />
      )}

      {/* Desktop board */}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="-mx-4 hidden overflow-x-auto px-4 pb-4 lg:block">
          <div className="flex min-w-max gap-3">
            {STAGES.map((s) => (
              <Column key={s} stage={s} cards={byStage(s)} today={today} onOpen={setOpen} />
            ))}
          </div>
        </div>
        <DragOverlay>{active && <CardTile card={active} today={today} dragging />}</DragOverlay>
      </DndContext>

      {/* Phone: stage tabs + list */}
      <div className="lg:hidden">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2 scrollbar-none">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => setMobileStage(s)}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium", mobileStage === s ? "border-accent/50 bg-accent/15 text-accent" : "border-line bg-panel text-fg-2")}
            >
              {STAGE_LABEL[s]} <span className="num text-[10px] opacity-70">{byStage(s).length}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 space-y-2">
          {byStage(mobileStage).map((c) => (
            <div key={c.id} className="space-y-1">
              <CardTile card={c} today={today} onClick={() => setOpen(c.id)} />
              {mobileStage !== "CUSTOMER" && (
                <button
                  onClick={async () => {
                    const next = STAGES[STAGES.indexOf(c.stage) + 1];
                    if (next === "CUSTOMER") celebrate("big");
                    await call("card.move", { id: c.id, stage: next });
                    toast.success(`${c.company} → ${STAGE_LABEL[next]}`);
                  }}
                  className="ml-auto flex items-center gap-1 px-2 text-[11px] text-muted"
                >
                  advance to {STAGE_LABEL[STAGES[STAGES.indexOf(c.stage) + 1]]} <ArrowRight className="size-3" />
                </button>
              )}
            </div>
          ))}
          {byStage(mobileStage).length === 0 && <p className="py-8 text-center text-sm text-muted">Nothing in {STAGE_LABEL[mobileStage]}.</p>}
        </div>
      </div>

      <CardDrawer id={openId} onClose={() => setOpen(null)} />
      <ImportModal open={importing} onOpenChange={setImporting} />
    </div>
  );
}

function Column({ stage, cards, today, onOpen }: { stage: Stage; cards: Card[]; today: string; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const due = cards.filter((c) => c.nextActionDate && c.nextActionDate.slice(0, 10) <= today).length;
  return (
    <div ref={setNodeRef} className={cn("flex w-[268px] shrink-0 flex-col rounded-2xl border border-line bg-panel/50 p-2 transition", isOver && "border-accent/50 bg-accent/[0.06]")}>
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-2">{STAGE_LABEL[stage]}</span>
        <span className="flex items-center gap-1.5">
          {due > 0 && <span className="num rounded bg-warn/15 px-1 text-[10px] font-semibold text-warn">{due} due</span>}
          <span className="num text-xs text-muted">{cards.length}</span>
        </span>
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {cards.map((c) => (
          <Draggable key={c.id} card={c}>
            <CardTile card={c} today={today} onClick={() => onOpen(c.id)} />
          </Draggable>
        ))}
      </div>
    </div>
  );
}

function Draggable({ card, children }: { card: Card; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none", isDragging && "opacity-30")}>
      {children}
    </div>
  );
}

function CardTile({ card, today, onClick, dragging }: { card: Card; today: string; onClick?: () => void; dragging?: boolean }) {
  const due = card.nextActionDate?.slice(0, 10) ?? null;
  const overdue = !!due && due < today;
  const primary = card.contacts[0];
  return (
    <div onClick={onClick} className={cn("glass cursor-pointer rounded-xl p-3 transition hover:border-line-2", dragging && "rotate-2 shadow-2xl ring-1 ring-accent/40", overdue && "border-bad/30")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{card.company}</p>
        {card.tier && <span className="num rounded border border-line px-1 text-[10px] font-bold text-fg-2">{card.tier}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge tone={LANE_TONE[card.lane]}>{LANE_LABEL[card.lane]}</Badge>
        {primary && <span className="truncate text-[11px] text-muted">{primary.name}</span>}
      </div>
      <div className={cn("mt-2 rounded-lg px-2 py-1.5 text-xs", card.nextAction ? "bg-panel-2 text-fg-2" : "bg-warn/10 text-warn")}>
        {card.nextAction ? (
          <>
            <span className="text-fg">{card.nextAction}</span>
            {due && <span className={cn("ml-1.5", overdue ? "font-semibold text-bad" : "text-muted")}>· {relDay(due, today)}</span>}
          </>
        ) : (
          <span className="flex items-center gap-1">
            <AlertCircle className="size-3" /> No next action
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted">
        <span className="flex items-center gap-1" title={`${card.contacts.length} contacts`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("size-1.5 rounded-full", i < card.contacts.length ? "bg-good" : "bg-line-2")} />
          ))}
        </span>
        {card.threads.length > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare className="size-3" /> {card.threads.length}
          </span>
        )}
        {card.followUps.length > 0 && <span>{card.followUps.length} follow-up</span>}
      </div>
    </div>
  );
}

function ImportModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [csv, setCsv] = React.useState("");
  const [lane, setLane] = React.useState<Lane>("DATA_CENTER");
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Import accounts" description="Paste CSV (or tab-separated from a spreadsheet). One row per contact; rows with the same company merge." wide>
      <pre className="mb-3 overflow-x-auto rounded-lg border border-line bg-panel p-2 font-mono text-[11px] text-fg-2">company,lane,tier,contact_name,contact_title,contact_email,contact_phone,linkedin,next_action</pre>
      <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} className="min-h-[200px] font-mono text-xs" placeholder={"Acme Hyperscale,Data Center,A,Jane Doe,VP Ops,jane@acme.com,,,Mail sample kit"} />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Default lane (when blank)">
          <Select value={lane} onChange={(e) => setLane(e.target.value as Lane)} className="w-44">
            {(Object.keys(LANE_LABEL) as Lane[]).map((l) => (
              <option key={l} value={l}>
                {LANE_LABEL[l]}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="primary"
          className="ml-auto"
          disabled={!csv.trim()}
          onClick={async () => {
            const r = await call("card.import", { csv, lane });
            toast.success(`${r.created} new accounts, ${r.updated} updated`);
            setCsv("");
            onOpenChange(false);
          }}
        >
          <Upload /> Import
        </Button>
      </div>
    </Modal>
  );
}
