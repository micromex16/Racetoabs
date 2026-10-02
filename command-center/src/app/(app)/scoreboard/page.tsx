"use client";
import * as React from "react";
import { BarChart, Bar as RBar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Cell } from "recharts";
import { useQ, call, refreshAll, type QOut } from "@/lib/client";
import { Ring, CountUp } from "@/components/viz/ring";
import { FluidSparkline } from "@/components/viz/sparkline";
import { Button } from "@/components/ui/button";
import { Input, Select, Field, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";
import { RagBadge, SectionTitle, Skeleton, Badge } from "@/components/ui/misc";
import { Plus, Minus, PencilLine, Settings2, Trash2, Zap, Table2, LineChart } from "lucide-react";
import { celebrate } from "@/lib/confetti";
import { toast } from "sonner";

type SB = QOut<"scoreboard">;
type M = SB["metrics"][number];

const RAG_COLOR = { green: "var(--good)", amber: "var(--warn)", red: "var(--bad)", none: "var(--accent)" } as const;
const STAGES = ["TARGET", "CONTACTED", "SAMPLE_SENT", "DISCOVERY", "RFQ", "QUOTED", "PILOT", "CUSTOMER"] as const;
const STAGE_LABEL: Record<string, string> = { TARGET: "Target", CONTACTED: "Contacted", SAMPLE_SENT: "Sample sent", DISCOVERY: "Discovery", RFQ: "RFQ", QUOTED: "Quoted", PILOT: "Pilot", CUSTOMER: "Customer" };
const LANES = [
  { key: "DATA_CENTER", label: "Data Center", color: "var(--r3)" },
  { key: "AD", label: "A&D", color: "var(--r1)" },
  { key: "OTHER", label: "Other", color: "var(--muted)" },
] as const;

const fmt = (m: Pick<M, "unit">, v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 10) / 10}${m.unit === "%" ? "%" : ""}`);
const weekLabel = (k: string) => new Date(k + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function ScoreboardPage() {
  const { data } = useQ("scoreboard", { weeks: 12 });
  const [entry, setEntry] = React.useState(false);
  const [detail, setDetail] = React.useState<M | null>(null);
  const [editMetric, setEditMetric] = React.useState<M | "new" | null>(null);
  const [editExit, setEditExit] = React.useState(false);
  if (!data) return <div className="mx-auto max-w-6xl space-y-4"><Skeleton className="h-64 rounded-3xl" /><Skeleton className="h-96" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scoreboard</h1>
          <p className="mt-1 text-sm text-fg-2">Activity and pipeline only. Week of {weekLabel(data.thisWeek)}.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditMetric("new")}>
            <Plus /> Metric
          </Button>
          <Button variant="primary" onClick={() => setEntry(true)}>
            <PencilLine /> Enter this week
          </Button>
        </div>
      </div>

      <ExitReadiness exit={data.exit} onEdit={() => setEditExit(true)} />

      <section>
        <SectionTitle>Weekly metrics</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {data.metrics.map((m) => (
            <MetricTile key={m.id} m={m} onClick={() => setDetail(m)} />
          ))}
        </div>
      </section>

      <PipelineByStage counts={data.stageCounts} />

      <EntrySheet open={entry} onOpenChange={setEntry} data={data} />
      <MetricDetail m={detail} weeks={data.weekKeys} onClose={() => setDetail(null)} onEdit={(m) => { setDetail(null); setEditMetric(m); }} />
      <MetricEditor m={editMetric} onClose={() => setEditMetric(null)} />
      <ExitEditor open={editExit} onOpenChange={setEditExit} exit={data.exit} metrics={data.metrics} />
    </div>
  );
}

function ExitReadiness({ exit, onEdit }: { exit: SB["exit"]; onEdit: () => void }) {
  return (
    <section className="glass relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center">
          <Ring value={exit.score} size={210} stroke={18} color="var(--accent)">
            <div>
              <CountUp value={exit.score} className="text-6xl font-semibold tracking-tight" />
              <div className="mt-1 text-[11px] uppercase tracking-wider text-muted">exit readiness</div>
            </div>
          </Ring>
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">Weighted checklist</span>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Settings2 /> Edit
            </Button>
          </div>
          <div className="space-y-3">
            {exit.items.map((c) => (
              <div key={c.id}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    {c.title}
                    {c.auto && (
                      <Badge tone="accent">
                        <Zap className="size-3" /> auto
                      </Badge>
                    )}
                  </span>
                  <span className="num shrink-0 text-xs text-fg-2">
                    <span className="font-semibold text-fg">{c.progress}%</span> · w{c.weight}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent transition-[width] duration-700" style={{ width: `${c.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricTile({ m, onClick }: { m: M; onClick: () => void }) {
  const rag = m.aggregation === "SUM" && m.ragLastWeek && m.rag !== "green" ? m.ragLastWeek : m.rag;
  const color = RAG_COLOR[m.rag];
  return (
    <button onClick={onClick} className="glass group flex flex-col rounded-2xl p-4 text-left transition hover:border-line-2">
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-xs font-medium text-fg-2">{m.name}</span>
        {m.source === "AUTO" && <Zap className="size-3.5 shrink-0 text-accent" aria-label="Auto from pipeline" />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="num text-3xl font-semibold tracking-tight">{fmt(m, m.current)}</span>
        {m.target != null && <span className="num text-xs text-muted">/ {fmt(m, m.target)}</span>}
      </div>
      <div className="mt-3">
        <FluidSparkline data={m.series.map((s) => ({ label: weekLabel(s.week), value: s.value }))} target={m.target} color={color} height={34} format={(v) => fmt(m, v)} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {m.target != null && m.current == null ? <Badge>No data yet</Badge> : <RagBadge rag={rag} />}
        <span className="num text-[11px] text-muted">{m.aggregation === "SUM" ? `YTD ${fmt(m, m.ytd)}` : m.lowerIsBetter ? "lower is better" : "now"}</span>
      </div>
    </button>
  );
}

function EntrySheet({ open, onOpenChange, data }: { open: boolean; onOpenChange: (o: boolean) => void; data: SB }) {
  const manual = data.metrics.filter((m) => m.source === "MANUAL");
  const [week, setWeek] = React.useState(data.thisWeek);
  const [vals, setVals] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (!open) return;
    setVals(
      Object.fromEntries(
        manual.map((m) => {
          const v = m.series.find((s) => s.week === week)?.value;
          return [m.id, v == null || (m.aggregation === "LATEST" && week !== data.thisWeek && !m.series.find((s) => s.week === week)) ? "" : String(v)];
        }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, week]);
  const save = async () => {
    let hit = 0;
    for (const m of manual) {
      const raw = vals[m.id];
      if (raw === "" || raw == null) continue;
      await call("metric.record", { metricId: m.id, weekStart: week, value: Number(raw) }, { refresh: false });
      if (m.target != null && (m.lowerIsBetter ? Number(raw) <= m.target : Number(raw) >= m.target)) hit++;
    }
    await refreshAll();
    if (hit >= 3) celebrate("small");
    toast.success("Scoreboard updated");
    onOpenChange(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Weekly numbers" description="Counts only. Pipeline metrics fill themselves.">
      <div className="mb-4">
        <Select value={week} onChange={(e) => setWeek(e.target.value)} className="w-48">
          {[...data.weekKeys].reverse().map((w) => (
            <option key={w} value={w}>
              Week of {weekLabel(w)}
              {w === data.thisWeek ? " (this week)" : ""}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        {manual.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{m.name}</p>
              <p className="text-[11px] text-muted">{m.target != null ? `target ${fmt(m, m.target)}${m.aggregation === "SUM" ? "/wk" : ""}` : "no target"}</p>
            </div>
            <button className="grid size-9 place-items-center rounded-lg border border-line text-fg-2 active:scale-95" onClick={() => setVals({ ...vals, [m.id]: String(Math.max(0, Number(vals[m.id] || 0) - 1)) })} aria-label="Minus one">
              <Minus className="size-4" />
            </button>
            <Input type="number" inputMode="decimal" value={vals[m.id] ?? ""} onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })} className="num h-9 w-16 text-center" placeholder="—" />
            <button className="grid size-9 place-items-center rounded-lg border border-line text-fg-2 active:scale-95" onClick={() => setVals({ ...vals, [m.id]: String(Number(vals[m.id] || 0) + 1) })} aria-label="Plus one">
              <Plus className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <Button variant="primary" size="lg" className="mt-4 w-full" onClick={save}>
        Save
      </Button>
    </Modal>
  );
}

function MetricDetail({ m, weeks, onClose, onEdit }: { m: M | null; weeks: string[]; onClose: () => void; onEdit: (m: M) => void }) {
  const [view, setView] = React.useState<"chart" | "table">("chart");
  if (!m) return null;
  const rows = m.series.map((s) => ({ week: weekLabel(s.week), key: s.week, value: s.value }));
  const color = RAG_COLOR[m.rag];
  return (
    <Modal open={!!m} onOpenChange={(o) => !o && onClose()} title={m.name} description={m.description || (m.source === "AUTO" ? "Computed from the pipeline every week." : "Entered weekly.")} wide>
      <div className="mb-3 flex items-center gap-2">
        <RagBadge rag={m.rag} />
        {m.target != null && <span className="text-xs text-fg-2">target {fmt(m, m.target)}{m.aggregation === "SUM" ? " / week" : ""}</span>}
        <div className="ml-auto flex gap-1">
          <Button size="icon-sm" variant={view === "chart" ? "secondary" : "ghost"} onClick={() => setView("chart")} aria-label="Chart view">
            <LineChart />
          </Button>
          <Button size="icon-sm" variant={view === "table" ? "secondary" : "ghost"} onClick={() => setView("table")} aria-label="Table view">
            <Table2 />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(m)}>
            <Settings2 /> Edit
          </Button>
        </div>
      </div>
      {view === "chart" ? (
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap={6}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="week" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--line-2)" }} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: "var(--panel-2)" }} contentStyle={{ background: "var(--panel-solid)", border: "1px solid var(--line-2)", borderRadius: 12, fontSize: 12 }} labelStyle={{ color: "var(--fg-2)" }} itemStyle={{ color: "var(--fg)" }} formatter={(v) => [fmt(m, Number(v)), m.name]} />
              {m.target != null && <ReferenceLine y={m.target} stroke="var(--fg-2)" strokeDasharray="4 4" label={{ value: "target", fill: "var(--muted)", fontSize: 10, position: "insideTopRight" }} />}
              <RBar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
                {rows.map((r) => (
                  <Cell key={r.key} fill={color} fillOpacity={r.key === weeks.at(-1) ? 1 : 0.7} />
                ))}
              </RBar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1.5 font-medium">Week</th>
              <th className="py-1.5 text-right font-medium">Value</th>
              <th className="py-1.5 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="num">
            {[...rows].reverse().map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="py-1.5">{r.week}</td>
                <td className="py-1.5 text-right">{fmt(m, r.value)}</td>
                <td className="py-1.5 text-right">
                  {m.source === "MANUAL" && r.value != null && (
                    <button className="text-muted hover:text-bad" onClick={() => call("metric.clear", { metricId: m.id, weekStart: r.key })} aria-label="Clear">
                      <Trash2 className="inline size-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function MetricEditor({ m, onClose }: { m: M | "new" | null; onClose: () => void }) {
  const isNew = m === "new";
  const [f, setF] = React.useState({ key: "", name: "", description: "", unit: "", aggregation: "SUM" as "SUM" | "LATEST", target: "", ytdTarget: "", lowerIsBetter: false });
  React.useEffect(() => {
    if (!m) return;
    if (m === "new") setF({ key: "", name: "", description: "", unit: "", aggregation: "SUM", target: "", ytdTarget: "", lowerIsBetter: false });
    else setF({ key: m.key, name: m.name, description: m.description, unit: m.unit, aggregation: m.aggregation, target: m.target?.toString() ?? "", ytdTarget: m.ytdTarget?.toString() ?? "", lowerIsBetter: m.lowerIsBetter });
  }, [m]);
  if (!m) return null;
  const save = async () => {
    const key = f.key || f.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    await call("metric.upsert", {
      id: isNew ? null : m.id,
      key,
      name: f.name,
      description: f.description,
      unit: f.unit,
      aggregation: f.aggregation,
      target: f.target === "" ? null : Number(f.target),
      ytdTarget: f.ytdTarget === "" ? null : Number(f.ytdTarget),
      lowerIsBetter: f.lowerIsBetter,
      ...(isNew ? { source: "MANUAL" as const } : {}),
    });
    onClose();
  };
  return (
    <Modal open={!!m} onOpenChange={(o) => !o && onClose()} title={isNew ? "Add a metric" : "Edit metric"} description="Activity or pipeline counts only — financial metrics are blocked.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Plant tours hosted" />
        </Field>
        <Field label="How it rolls up">
          <Select value={f.aggregation} onChange={(e) => setF({ ...f, aggregation: e.target.value as "SUM" | "LATEST" })} disabled={!isNew && m.source === "AUTO"}>
            <option value="SUM">Weekly count (sums YTD)</option>
            <option value="LATEST">Level / snapshot</option>
          </Select>
        </Field>
        <Field label="Unit" hint="blank, %, or a noun (calls, kits…)">
          <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
        </Field>
        <Field label={f.aggregation === "SUM" ? "Weekly target" : "Target level"}>
          <Input type="number" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} />
        </Field>
        <Field label="Direction">
          <Select value={f.lowerIsBetter ? "down" : "up"} onChange={(e) => setF({ ...f, lowerIsBetter: e.target.value === "down" })}>
            <option value="up">Higher is better</option>
            <option value="down">Lower is better</option>
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-[60px]" />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        {!isNew && (
          <Button variant="ghost" className="text-bad" onClick={async () => { await call("metric.archive", { id: m.id }); onClose(); }}>
            <Trash2 /> Archive
          </Button>
        )}
        <Button variant="primary" className="ml-auto" onClick={save} disabled={!f.name}>
          Save
        </Button>
      </div>
    </Modal>
  );
}

function ExitEditor({ open, onOpenChange, exit, metrics }: { open: boolean; onOpenChange: (o: boolean) => void; exit: SB["exit"]; metrics: M[] }) {
  const [rows, setRows] = React.useState(exit.items);
  React.useEffect(() => setRows(exit.items), [exit.items, open]);
  const latest = metrics.filter((m) => m.aggregation === "LATEST");
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Exit readiness checklist" description="You define it. Weights set how much each item counts." wide>
      <div className="space-y-3">
        {rows.map((c, i) => (
          <div key={c.id} className="rounded-xl border border-line bg-panel p-3">
            <div className="flex items-center gap-2">
              <Input value={c.title} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="h-9 flex-1" />
              <span className="text-xs text-muted">weight</span>
              <Input type="number" value={c.weight} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} className="h-9 w-16" />
              <Button size="icon-sm" variant="ghost" onClick={async () => { await call("exit.delete", { id: c.id }); }} aria-label="Delete">
                <Trash2 />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input type="range" min={0} max={100} step={5} value={c.progress} disabled={c.auto} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, progress: Number(e.target.value) } : x)))} className="flex-1 accent-[var(--accent)]" />
              <span className="num w-10 text-right text-sm font-semibold">{c.progress}%</span>
              <Select value={c.metricKey ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, metricKey: e.target.value || null } : x)))} className="h-8 w-48 text-xs">
                <option value="">Manual score</option>
                {latest.map((m) => (
                  <option key={m.key} value={m.key}>
                    Auto: {m.name}
                  </option>
                ))}
              </Select>
              {c.metricKey && (
                <Input type="number" value={c.threshold ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, threshold: e.target.value === "" ? null : Number(e.target.value) } : x)))} className="h-8 w-20 text-xs" placeholder="threshold" />
              )}
            </div>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => call("exit.upsert", { title: "New criterion", weight: 1, progress: 0 })}>
          <Plus /> Add criterion
        </Button>
      </div>
      <Button
        variant="primary"
        className="mt-4 w-full"
        onClick={async () => {
          for (const c of rows) await call("exit.upsert", { id: c.id, title: c.title, weight: c.weight, progress: c.progress, metricKey: c.metricKey, threshold: c.threshold }, { refresh: false });
          await refreshAll();
          onOpenChange(false);
        }}
      >
        Save checklist
      </Button>
    </Modal>
  );
}

function PipelineByStage({ counts }: { counts: SB["stageCounts"] }) {
  const rows = STAGES.map((s) => {
    const r: Record<string, number | string> = { stage: STAGE_LABEL[s] };
    for (const l of LANES) r[l.key] = counts.find((c) => c.stage === s && c.lane === l.key)?.count ?? 0;
    return r;
  });
  const total = counts.reduce((a, c) => a + c.count, 0);
  return (
    <section>
      <SectionTitle right={<span className="num text-xs text-fg-2">{total} accounts</span>}>Pipeline by stage</SectionTitle>
      <div className="glass rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-fg-2">
          {LANES.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: l.color }} /> {l.label}
            </span>
          ))}
        </div>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No accounts in the pipeline yet.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="stage" tick={{ fill: "var(--fg-2)", fontSize: 12 }} tickLine={false} axisLine={false} width={84} />
                <Tooltip cursor={{ fill: "var(--panel-2)" }} contentStyle={{ background: "var(--panel-solid)", border: "1px solid var(--line-2)", borderRadius: 12, fontSize: 12 }} labelStyle={{ color: "var(--fg-2)" }} itemStyle={{ color: "var(--fg)" }} />
                {LANES.map((l, i) => (
                  <RBar key={l.key} dataKey={l.key} name={l.label} stackId="a" fill={l.color} stroke="var(--bg)" strokeWidth={2} radius={i === LANES.length - 1 ? [0, 4, 4, 0] : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

