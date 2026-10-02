"use client";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Plus, History, ArrowUp, Mic, Square, CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react";
import { useQ, refreshAll } from "@/lib/client";
import { call } from "@/lib/client";
import { useSpeech } from "@/hooks/use-speech";
import { scrubMoney } from "@/lib/guard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ToolChip = { id?: string; name: string; label: string; ok?: boolean; pending?: boolean; error?: string };
type Msg = { id: string; role: "user" | "assistant"; text: string; tools: ToolChip[] };

const SUGGESTIONS = [
  "Where are we on data center?",
  "What's behind pace this week?",
  "Re-pick my 3 for today",
  "Chase Juan on the Dyson SOW Thursday",
  "Run my Friday review with me",
  "Summarize the month in one page",
];

const TOOL_NAMES: Record<string, string> = {
  get_overview: "Reading today",
  list_goals: "Reading goals",
  list_tasks: "Reading tasks",
  list_followups: "Reading follow-ups",
  list_pipeline: "Reading pipeline",
  pipeline_summary: "Summarizing pipeline",
  get_scoreboard: "Reading scoreboard",
  get_weekly_review: "Reading weekly review",
  search: "Searching",
};

const CONVO_KEY = "cc.agent.convo";

export function AgentPanel({ onClose, fullscreen }: { onClose?: () => void; fullscreen?: boolean }) {
  const { data: status } = useQ("agent.status");
  const { data: convos, mutate: reloadConvos } = useQ("agent.conversations");
  const [convoId, setConvoId] = React.useState<string | null>(null);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const scroller = React.useRef<HTMLDivElement>(null);
  const abort = React.useRef<AbortController | null>(null);
  const speech = useSpeech({ onFinal: (t) => setInput((p) => (p ? p.trim() + " " : "") + t) });

  // Resume the last conversation
  React.useEffect(() => {
    try {
      const id = localStorage.getItem(CONVO_KEY);
      if (id) void load(id);
    } catch {}
     
  }, []);

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  async function load(id: string) {
    const r = await fetch(`/api/q/agent.messages?input=${encodeURIComponent(JSON.stringify({ id }))}`);
    if (!r.ok) return;
    setMsgs(await r.json());
    setConvoId(id);
    setShowHistory(false);
  }

  function newChat() {
    abort.current?.abort();
    setConvoId(null);
    setMsgs([]);
    setShowHistory(false);
    try {
      localStorage.removeItem(CONVO_KEY);
    } catch {}
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    if (speech.listening) speech.stop();
    setInput("");
    setBusy(true);
    const aid = `a-${Date.now()}`;
    setMsgs((m) => [...m, { id: `u-${Date.now()}`, role: "user", text: t, tools: [] }, { id: aid, role: "assistant", text: "", tools: [] }]);
    const patch = (fn: (m: Msg) => Msg) => setMsgs((list) => list.map((m) => (m.id === aid ? fn(m) : m)));
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: t, conversationId: convoId }), signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: "Agent unavailable" }));
        patch((m) => ({ ...m, text: `⚠️ ${e.error}` }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          if (!p.startsWith("data: ")) continue;
          const ev = JSON.parse(p.slice(6));
          if (ev.type === "conversation") {
            setConvoId(ev.id);
            try {
              localStorage.setItem(CONVO_KEY, ev.id);
            } catch {}
          } else if (ev.type === "text") patch((m) => ({ ...m, text: m.text + ev.delta }));
          else if (ev.type === "tool_start") patch((m) => ({ ...m, tools: [...m.tools, { id: ev.id, name: ev.name, label: TOOL_NAMES[ev.name] ?? ev.name.replace(/_/g, " "), pending: true }] }));
          else if (ev.type === "tool_end")
            patch((m) => ({ ...m, tools: m.tools.map((x) => (x.id === ev.id ? { ...x, label: ev.label, ok: ev.ok, error: ev.error, pending: false } : x)) }));
          else if (ev.type === "done") {
            if (ev.refresh) void refreshAll();
          } else if (ev.type === "error") patch((m) => ({ ...m, text: (m.text ? m.text + "\n\n" : "") + `⚠️ ${ev.message}` }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch((m) => ({ ...m, text: (m.text ? m.text + "\n\n" : "") + "⚠️ Connection dropped." }));
    } finally {
      setBusy(false);
      void reloadConvos();
    }
  }

  const empty = msgs.length === 0;

  return (
    <div className={cn("flex h-full flex-col", fullscreen && "h-[calc(100dvh-140px)] lg:h-[calc(100dvh-110px)]")}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2">
          <Sparkles className="size-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Chief of Staff</p>
          <p className="truncate text-[11px] text-muted">{status?.configured ? "Proposes. You approve anything that sends." : "Needs ANTHROPIC_API_KEY"}</p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={() => setShowHistory(!showHistory)} aria-label="History">
          <History />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={newChat} aria-label="New chat">
          <Plus />
        </Button>
        {onClose && (
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close agent">
            <X />
          </Button>
        )}
      </div>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence>
          {showHistory && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-3 top-2 z-10 max-h-[70%] overflow-y-auto rounded-xl border border-line-2 bg-panel-solid p-1 shadow-2xl">
              {convos?.length ? (
                convos.map((c) => (
                  <div key={c.id} className={cn("group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-panel-2", c.id === convoId && "bg-panel-2")}>
                    <button className="min-w-0 flex-1 truncate text-left" onClick={() => load(c.id)}>
                      {c.title}
                    </button>
                    <span className="text-[10px] text-muted">{new Date(c.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <button
                      className="text-muted opacity-0 hover:text-bad group-hover:opacity-100"
                      onClick={async () => {
                        await call("agent.deleteConversation", { id: c.id });
                        if (c.id === convoId) newChat();
                      }}
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="p-3 text-xs text-muted">No conversations yet.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {empty ? (
          <div className="flex h-full flex-col justify-end gap-4 pb-2">
            <div>
              <p className="text-lg font-semibold tracking-tight">What do you need?</p>
              <p className="mt-1 text-sm text-fg-2">Hand me work. I read your rocks first and keep you on them.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-xl border border-line bg-panel px-3 py-2 text-left text-xs text-fg-2 transition hover:border-accent/40 hover:text-fg">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {msgs.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent/90 px-3.5 py-2.5 text-sm text-accent-fg">
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="max-w-full space-y-2">
                  {m.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {m.tools.map((t, i) => (
                        <span
                          key={(t.id ?? "") + i}
                          title={t.error}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
                            t.pending ? "border-line text-muted" : t.ok ? "border-good/25 bg-good/10 text-fg-2" : "border-bad/25 bg-bad/10 text-bad",
                          )}
                        >
                          {t.pending ? <Loader2 className="size-3 animate-spin" /> : t.ok ? <CheckCircle2 className="size-3 text-good" /> : <XCircle className="size-3" />}
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.text ? (
                    <div className="prose-agent text-sm leading-relaxed text-fg">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{scrubMoney(m.text)}</ReactMarkdown>
                    </div>
                  ) : busy && m === msgs.at(-1) ? (
                    <div className="flex items-center gap-1.5 py-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span key={i} className="size-1.5 rounded-full bg-accent" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <form
        className="safe-bottom border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line-2 bg-panel p-1.5 focus-within:border-accent/50">
          <textarea
            value={speech.listening ? (input ? input + " " : "") + speech.interim : input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Ask, or hand off a task…"
            className="max-h-36 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted sm:text-sm"
          />
          {speech.supported && (
            <Button type="button" size="icon" variant="ghost" onClick={() => (speech.listening ? speech.stop() : speech.start())} aria-label="Dictate" className={speech.listening ? "text-bad" : ""}>
              {speech.listening ? <Square /> : <Mic />}
            </Button>
          )}
          <Button type="submit" size="icon" variant="primary" disabled={busy || !input.trim()} aria-label="Send">
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </form>
    </div>
  );
}
