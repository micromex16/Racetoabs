"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { DateChips, nextWeekdayKey } from "./date-chips";
import { useUI, ui } from "@/lib/ui-store";
import { call, useQ } from "@/lib/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function DelegateDialog() {
  const st = useUI((s) => s.delegate);
  const { data: people } = useQ("people");
  const [personId, setPersonId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [date, setDate] = useState<string | null>(nextWeekdayKey(4));
  const [note, setNote] = useState("");

  useEffect(() => {
    if (st) {
      setPersonId(null);
      setNewName("");
      setNote("");
      setDate(nextWeekdayKey(4));
    }
  }, [st]);

  const close = () => ui.set({ delegate: null });
  async function save() {
    if (!st || !date) return;
    await call("task.delegate", { id: st.taskId, personId: personId ?? undefined, personName: personId ? undefined : newName, followUpDate: date, note });
    toast.success("Delegated — follow-up set");
    close();
  }

  return (
    <Modal open={!!st} onOpenChange={(o) => !o && close()} title="Delegate" description={st?.title}>
      <div className="space-y-4">
        <Field label="To">
          <div className="flex flex-wrap gap-1.5">
            {people?.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPersonId(p.id);
                  setNewName("");
                }}
                className={cn("rounded-full border px-3 py-1.5 text-sm transition", personId === p.id ? "border-accent/60 bg-accent/15 text-accent" : "border-line bg-panel text-fg-2")}
              >
                {p.name}
              </button>
            ))}
          </div>
          <Input
            className="mt-2"
            placeholder={people?.length ? "…or someone new" : "Name"}
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setPersonId(null);
            }}
          />
        </Field>
        <Field label="Follow up on">
          <DateChips value={date} onChange={setDate} allowNone={false} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What does done look like?" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!date || (!personId && !newName.trim())}>
            Delegate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
