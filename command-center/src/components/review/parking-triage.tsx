"use client";
import * as React from "react";
import { ArrowUpRight, CalendarClock, Trash2 } from "lucide-react";
import { call, type QOut } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { RockPicker } from "@/components/app/rock-picker";
import { DateChips } from "@/components/app/date-chips";
import { Field, Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

type Item = QOut<"parking">[number];

/** Promote (→ task linked to a rock) / Schedule (resurface on a date) / Delete. */
export function ParkingTriage({ items }: { items: Item[] }) {
  const [promote, setPromote] = React.useState<Item | null>(null);
  const [schedule, setSchedule] = React.useState<Item | null>(null);
  const [goalId, setGoalId] = React.useState<string | null>(null);
  const [due, setDue] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState<string | null>(null);

  return (
    <>
      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {items.map((p) => (
            <motion.div key={p.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 60 }} className="glass flex flex-col gap-2 rounded-xl px-3.5 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm">{p.text}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {p.source} · {new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setPromote(p);
                    setTitle(p.text);
                    setGoalId(null);
                    setDue(null);
                  }}
                >
                  <ArrowUpRight /> Promote
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSchedule(p);
                    setDate(null);
                  }}
                >
                  <CalendarClock /> Schedule
                </Button>
                <Button size="sm" variant="ghost" className="text-muted hover:text-bad" onClick={() => call("parking.triage", { id: p.id, action: "delete" })} aria-label="Delete">
                  <Trash2 />
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Modal open={!!promote} onOpenChange={(o) => !o && setPromote(null)} title="Promote to a task" description="It has to serve a rock to earn a place in your week.">
        <div className="space-y-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          <Field label="Due">
            <DateChips value={due} onChange={setDue} />
          </Field>
          <Field label="Serves">
            <RockPicker value={goalId} onChange={setGoalId} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPromote(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!goalId}
              onClick={async () => {
                await call("parking.triage", { id: promote!.id, action: "promote", goalId, dueDate: due, title });
                toast.success("Promoted to a task");
                setPromote(null);
              }}
            >
              Promote
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!schedule} onOpenChange={(o) => !o && setSchedule(null)} title="Schedule" description="Hide it until a date, then it returns to the lot.">
        <div className="space-y-4">
          <DateChips value={date} onChange={setDate} allowNone={false} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSchedule(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!date}
              onClick={async () => {
                await call("parking.triage", { id: schedule!.id, action: "schedule", date: date! });
                setSchedule(null);
              }}
            >
              Schedule
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
