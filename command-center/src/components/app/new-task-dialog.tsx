"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Field, Textarea } from "@/components/ui/input";
import { DateChips } from "./date-chips";
import { RockPicker } from "./rock-picker";
import { useUI, ui } from "@/lib/ui-store";
import { call } from "@/lib/client";
import { toast } from "sonner";
import { AlertTriangle, ParkingSquare } from "lucide-react";

/** New task with the drift alert: every task must serve a rock or goal — or be parked. */
export function NewTaskDialog() {
  const st = useUI((s) => s.newTask);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [drift, setDrift] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (st.open) {
      setTitle(st.title ?? "");
      setGoalId(st.goalId ?? null);
      setDue(st.dueDate ?? null);
      setNotes("");
      setDrift(false);
    }
  }, [st.open, st.title, st.goalId, st.dueDate]);

  const close = () => ui.set({ newTask: { open: false } });

  async function save() {
    if (!title.trim()) return;
    if (!goalId) {
      setDrift(true);
      return;
    }
    setBusy(true);
    try {
      await call("task.create", { title, notes, dueDate: due, goalId, threadId: st.threadId ?? null, source: "manual" });
      toast.success("Task added");
      close();
    } finally {
      setBusy(false);
    }
  }

  async function parkIt() {
    setBusy(true);
    try {
      await call("parking.add", { text: title + (notes ? ` — ${notes}` : ""), source: "drift" });
      toast("Parked. It won't touch Today.", { icon: "🅿️" });
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={st.open} onOpenChange={(o) => !o && close()} title={drift ? "Which rock does this serve?" : "New task"}>
      {!drift ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input autoFocus placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} className="h-12 text-base" />
          <Field label="Due">
            <DateChips value={due} onChange={setDue} />
          </Field>
          <Field label="Serves">
            <RockPicker value={goalId} onChange={setGoalId} />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="min-h-[60px]" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!title.trim() || busy}>
              Add task
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <p className="text-fg-2">
              <span className="font-medium text-fg">“{title}”</span> isn&apos;t linked to a rock or goal. Link it, or park it so it doesn&apos;t pull you sideways.
            </p>
          </div>
          <RockPicker value={goalId} onChange={setGoalId} />
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={parkIt} disabled={busy} size="lg">
              <ParkingSquare /> None — park it
            </Button>
            <Button variant="primary" size="lg" onClick={save} disabled={!goalId || busy}>
              Link &amp; add task
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
