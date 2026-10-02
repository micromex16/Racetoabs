"use client";
import * as React from "react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { call, useQ, type QOut } from "@/lib/client";
import { Plus, Trash2, Archive } from "lucide-react";
import { toast } from "sonner";

export type GNode = QOut<"goals">["tree"][number];
type Level = "EXIT" | "ANNUAL" | "QUARTERLY" | "WEEKLY";

const PARENT_LEVEL: Record<Level, Level | null> = { EXIT: null, ANNUAL: "EXIT", QUARTERLY: "ANNUAL", WEEKLY: "QUARTERLY" };
const STATUSES = [
  ["NOT_STARTED", "Not started"],
  ["ON_TRACK", "On track"],
  ["AT_RISK", "At risk"],
  ["OFF_TRACK", "Off track"],
  ["DONE", "Done"],
] as const;

export function flatten(nodes: GNode[]): GNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children as GNode[])]);
}

export type EditorState = { mode: "edit"; goal: GNode } | { mode: "new"; level: Level; parentId?: string | null; weekStart?: string; year?: number; quarter?: number } | null;

export function GoalEditor({ state, onClose, all }: { state: EditorState; onClose: () => void; all: GNode[] }) {
  const { data: sb } = useQ("scoreboard", {}, { revalidateOnFocus: false });
  const g = state?.mode === "edit" ? state.goal : null;
  const [f, setF] = React.useState({
    title: "",
    level: "QUARTERLY" as Level,
    parentId: "" as string,
    owner: "Me",
    status: "NOT_STARTED" as (typeof STATUSES)[number][0],
    dueDate: "",
    periodStart: "",
    year: "",
    quarter: "",
    weekStart: "",
    notes: "",
    auto: true,
    manualProgress: 0,
    measures: [] as { metricKey: string; target: number }[],
  });

  React.useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      const x = state.goal;
      setF({
        title: x.title,
        level: x.level,
        parentId: x.parentId ?? "",
        owner: x.owner,
        status: x.status,
        dueDate: x.dueDate ?? "",
        periodStart: x.periodStart ?? "",
        year: x.year?.toString() ?? "",
        quarter: x.quarter?.toString() ?? "",
        weekStart: x.weekStart ?? "",
        notes: x.notes,
        auto: x.manualProgress == null,
        manualProgress: x.manualProgress ?? x.progress,
        measures: x.measures,
      });
    } else {
      setF((p) => ({
        ...p,
        title: "",
        notes: "",
        level: state.level,
        parentId: state.parentId ?? "",
        status: "NOT_STARTED",
        dueDate: "",
        periodStart: "",
        year: state.year?.toString() ?? "",
        quarter: state.quarter?.toString() ?? "",
        weekStart: state.weekStart ?? "",
        auto: true,
        manualProgress: 0,
        measures: [],
        owner: "Me",
      }));
    }
  }, [state]);

  const parentLevel = PARENT_LEVEL[f.level];
  const parents = all.filter((x) => x.level === parentLevel && !x.archivedAt);
  const metrics = sb?.metrics ?? [];

  const save = async () => {
    const payload = {
      level: f.level,
      title: f.title.trim(),
      parentId: f.parentId || null,
      owner: f.owner || "Me",
      status: f.status,
      dueDate: f.dueDate || null,
      periodStart: f.periodStart || null,
      year: f.year ? Number(f.year) : null,
      quarter: f.quarter ? Number(f.quarter) : null,
      weekStart: f.weekStart || null,
      notes: f.notes,
      manualProgress: f.auto ? null : f.manualProgress,
      measures: f.measures.filter((m) => m.metricKey),
    };
    if (!payload.title) return;
    if (g) await call("goal.update", { id: g.id, patch: payload });
    else await call("goal.create", payload);
    toast.success(g ? "Saved" : "Goal added");
    onClose();
  };

  return (
    <Modal open={!!state} onOpenChange={(o) => !o && onClose()} title={g ? "Edit goal" : "New goal"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          <Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="h-11 text-base" />
        </Field>
        <Field label="Level">
          <Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as Level, parentId: "" })}>
            <option value="EXIT">5-year exit</option>
            <option value="ANNUAL">Annual goal</option>
            <option value="QUARTERLY">Quarterly rock</option>
            <option value="WEEKLY">Weekly rock</option>
          </Select>
        </Field>
        <Field label="Serves">
          <Select value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })} disabled={!parentLevel}>
            <option value="">— none —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.year ? `${p.year}${p.quarter ? ` Q${p.quarter}` : ""} · ` : ""}
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner">
          <Input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })}>
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        {f.level === "ANNUAL" && (
          <Field label="Year">
            <Input type="number" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} />
          </Field>
        )}
        {f.level === "QUARTERLY" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Year">
              <Input type="number" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} />
            </Field>
            <Field label="Quarter">
              <Select value={f.quarter} onChange={(e) => setF({ ...f, quarter: e.target.value })}>
                <option value="">—</option>
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {f.level === "WEEKLY" && (
          <Field label="Week of (Monday)">
            <Input type="date" value={f.weekStart} onChange={(e) => setF({ ...f, weekStart: e.target.value })} />
          </Field>
        )}
        <Field label="Due">
          <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </Field>

        <div className="rounded-xl border border-line p-3 sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-2">Progress</span>
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <input type="checkbox" checked={f.auto} onChange={(e) => setF({ ...f, auto: e.target.checked })} className="accent-[var(--accent)]" />
              Roll up automatically
            </label>
          </div>
          {!f.auto && (
            <div className="mt-3 flex items-center gap-3">
              <input type="range" min={0} max={100} value={f.manualProgress} onChange={(e) => setF({ ...f, manualProgress: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
              <span className="num w-10 text-right text-sm font-semibold">{f.manualProgress}%</span>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">Auto = scoreboard measures if set, else children, else tasks done.</p>
          <div className="mt-3 space-y-2">
            {f.measures.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={m.metricKey} onChange={(e) => setF({ ...f, measures: f.measures.map((x, j) => (j === i ? { ...x, metricKey: e.target.value } : x)) })} className="h-9 flex-1 text-xs">
                  <option value="">Metric…</option>
                  {metrics.map((mt) => (
                    <option key={mt.key} value={mt.key}>
                      {mt.name}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-muted">target</span>
                <Input type="number" value={m.target} onChange={(e) => setF({ ...f, measures: f.measures.map((x, j) => (j === i ? { ...x, target: Number(e.target.value) } : x)) })} className="h-9 w-20 text-xs" />
                <Button size="icon-sm" variant="ghost" onClick={() => setF({ ...f, measures: f.measures.filter((_, j) => j !== i) })} aria-label="Remove measure">
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setF({ ...f, measures: [...f.measures, { metricKey: "", target: 1 }] })}>
              <Plus /> Measure from scoreboard
            </Button>
          </div>
        </div>

        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {g && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await call("goal.archive", { id: g.id, archived: !g.archivedAt });
                onClose();
              }}
            >
              <Archive /> {g.archivedAt ? "Unarchive" : "Archive"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-bad"
              onClick={async () => {
                if (!confirm(`Delete “${g.title}”? Children are kept and unlinked.`)) return;
                await call("goal.delete", { id: g.id });
                onClose();
              }}
            >
              <Trash2 /> Delete
            </Button>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!f.title.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
