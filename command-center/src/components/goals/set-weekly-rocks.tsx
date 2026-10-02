"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { call, refreshAll, type QOut } from "@/lib/client";
import { RING_COLORS } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

type Rock = QOut<"goals">["weeklyRocks"][number];
type QRock = QOut<"goals">["quarterlyRocks"][number];

/** Set (up to) 3 weekly rocks for a week. Each must serve a quarterly rock. */
export function SetWeeklyRocks({
  weekStart,
  existing,
  quarterlyRocks,
  onSaved,
  compact,
}: {
  weekStart: string;
  existing: Rock[];
  quarterlyRocks: QRock[];
  onSaved?: () => void;
  compact?: boolean;
}) {
  const empty = Math.max(0, 3 - existing.length);
  const [drafts, setDrafts] = useState(() => Array.from({ length: empty }, () => ({ title: "", parentId: quarterlyRocks[0]?.id ?? "" })));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const todo = drafts.filter((d) => d.title.trim());
    if (!todo.length) return;
    setBusy(true);
    try {
      for (const d of todo) {
        await call("goal.create", { level: "WEEKLY", title: d.title.trim(), weekStart, parentId: d.parentId || null, status: "ON_TRACK" }, { refresh: false });
      }
      await refreshAll();
      toast.success(`${todo.length} rock${todo.length > 1 ? "s" : ""} set`);
      setDrafts(Array.from({ length: Math.max(0, 3 - existing.length - todo.length) }, () => ({ title: "", parentId: quarterlyRocks[0]?.id ?? "" })));
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      {existing.map((r, i) => (
        <div key={r.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
          <span className="num grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: RING_COLORS[i % 3] }}>
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
          <button
            onClick={async () => {
              await call("goal.delete", { id: r.id });
            }}
            className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-bad"
            aria-label="Remove rock"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      {drafts.map((d, j) => {
        const i = existing.length + j;
        return (
          <div key={j} className="rounded-xl border border-dashed border-line-2 p-2.5">
            <div className="flex items-center gap-2.5">
              <span className="num grid size-6 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold" style={{ borderColor: RING_COLORS[i % 3], color: RING_COLORS[i % 3] }}>
                {i + 1}
              </span>
              <Input
                placeholder={`Rock #${i + 1} — an outcome, not a task`}
                value={d.title}
                onChange={(e) => setDrafts(drafts.map((x, k) => (k === j ? { ...x, title: e.target.value } : x)))}
                className="h-10 border-0 bg-transparent px-1 focus:ring-0"
              />
            </div>
            {!compact || d.title ? (
              <div className="mt-1.5 flex items-center gap-2 pl-8">
                <span className="shrink-0 text-[11px] text-muted">serves</span>
                <Select value={d.parentId} onChange={(e) => setDrafts(drafts.map((x, k) => (k === j ? { ...x, parentId: e.target.value } : x)))} className="h-8 text-xs">
                  {quarterlyRocks.map((q, qi) => (
                    <option key={q.id} value={q.id}>
                      Q-Rock #{qi + 1}: {q.title}
                    </option>
                  ))}
                  <option value="">— no quarterly rock —</option>
                </Select>
              </div>
            ) : null}
          </div>
        );
      })}
      {drafts.length > 0 && (
        <div className="flex justify-end pt-1">
          <Button variant="primary" onClick={save} disabled={busy || !drafts.some((d) => d.title.trim())}>
            Set rocks
          </Button>
        </div>
      )}
    </div>
  );
}
