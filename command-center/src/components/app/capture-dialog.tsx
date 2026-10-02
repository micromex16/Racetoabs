"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { useUI, ui } from "@/lib/ui-store";
import { call } from "@/lib/client";
import { queueParking } from "@/lib/outbox";
import { useSpeech } from "@/hooks/use-speech";
import { toast } from "sonner";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/confetti";

/** Voice-first capture → Parking Lot (default) or Task. */
export function CaptureDialog() {
  const st = useUI((s) => s.capture);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<"parking" | "task">("parking");
  const speech = useSpeech({
    onFinal: (t) => setText((prev) => (prev ? prev.trim() + " " : "") + t),
  });

  useEffect(() => {
    if (st.open) {
      setText(st.text ?? "");
      setTarget("parking");
      if (st.voice && speech.supported) setTimeout(() => speech.start(), 150);
    } else if (speech.listening) speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.open]);

  const close = () => ui.set({ capture: { open: false } });

  async function submit() {
    const t = text.trim();
    if (!t) return;
    if (speech.listening) speech.stop();
    if (target === "task") {
      close();
      ui.openNewTask({ title: t });
      return;
    }
    haptic();
    try {
      await call("parking.add", { text: t, source: st.voice ? "voice" : "typed" }, { silent: true });
      toast.success("Parked", { description: t.length > 60 ? t.slice(0, 60) + "…" : t });
    } catch {
      queueParking(t, st.voice ? "voice" : "typed");
      toast("Saved offline — will sync when you're back online.");
    }
    close();
  }

  const live = speech.listening ? (text ? text + " " : "") + speech.interim : text;

  return (
    <Modal open={st.open} onOpenChange={(o) => !o && close()} title="Capture" description="Get it out of your head. Parking Lot never touches Today.">
      <div className="space-y-4">
        <Segmented
          value={target}
          onChange={setTarget}
          options={[
            { value: "parking", label: "Parking Lot" },
            { value: "task", label: "Task" },
          ]}
        />
        <div className="relative">
          <Textarea
            autoFocus={!st.voice}
            value={live}
            onChange={(e) => setText(e.target.value)}
            placeholder={speech.supported ? "Type, or tap the mic and talk…" : "Type, or use your keyboard's dictation mic…"}
            className="min-h-[120px] pr-14 text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
          />
          {speech.supported && (
            <button
              type="button"
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              className={cn(
                "absolute bottom-3 right-3 grid size-10 place-items-center rounded-full transition",
                speech.listening ? "bg-bad text-white shadow-[0_0_0_6px_color-mix(in_srgb,var(--bad)_25%,transparent)] animate-pulse" : "bg-accent text-accent-fg",
              )}
              aria-label={speech.listening ? "Stop dictation" : "Start dictation"}
            >
              {speech.listening ? <Square className="size-4" /> : <Mic className="size-4" />}
            </button>
          )}
        </div>
        {speech.error && <p className="text-xs text-bad">{speech.error}</p>}
        <p className="text-[11px] text-muted">Each line becomes its own item. ⌘↵ to save.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!live.trim()} size="lg">
            {target === "parking" ? "Park it" : "Next: link to a rock"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
