"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Archive, CheckSquare, Bell, Kanban, Send, Sparkles, FileText, Loader2, X, Pencil, MailOpen } from "lucide-react";
import { useQ, call, type QOut } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Modal } from "@/components/ui/dialog";
import { Input, Textarea, Field, Select } from "@/components/ui/input";
import { DateChips, nextWeekdayKey } from "@/components/app/date-chips";
import { ui } from "@/lib/ui-store";
import { scrubMoney } from "@/lib/guard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CH } from "./channel";

type T = QOut<"thread">;

export function ThreadView({ id, onBack, autoReply }: { id: string; onBack?: () => void; autoReply?: boolean }) {
  const { data: t, error } = useQ("thread", { id });
  const { data: agent } = useQ("agent.status");
  const [reply, setReply] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [agentBusy, setAgentBusy] = React.useState<"" | "summary" | "draft">("");
  const [summary, setSummary] = React.useState<string | null>(null);
  const [fuOpen, setFuOpen] = React.useState(false);
  const [cardOpen, setCardOpen] = React.useState(false);
  const bottom = React.useRef<HTMLDivElement>(null);
  const composer = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (t?.unread) void call("thread.read", { id }, { silent: true });
    setSummary(t?.aiSummary ?? null);
    bottom.current?.scrollIntoView({ block: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id]);
  React.useEffect(() => {
    if (autoReply) setTimeout(() => composer.current?.focus(), 300);
  }, [autoReply]);

  if (error) return <p className="p-6 text-sm text-bad">{error.message}</p>;
  if (!t) return <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-muted" /></div>;
  const C = CH[t.channel];
  const other = (t.participants as { name?: string; address: string }[])?.[0];

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await call("thread.reply", { id, body: reply });
      setReply("");
      toast.success("Sent");
    } finally {
      setSending(false);
    }
  };

  const agentAction = async (kind: "summary" | "draft") => {
    setAgentBusy(kind);
    try {
      if (kind === "summary") {
        const r = await call("thread.summarize", { id });
        setSummary(r.summary);
      } else {
        const r = await call("thread.agentDraft", { id, instructions: reply || undefined });
        toast.success("Draft ready for your approval");
        if (r) setReply("");
      }
    } finally {
      setAgentBusy("");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        {onBack && (
          <Button size="icon-sm" variant="ghost" onClick={onBack} aria-label="Back">
            <ArrowLeft />
          </Button>
        )}
        <C.icon className="size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{t.subject || other?.name || other?.address || "Conversation"}</p>
          <p className="truncate text-xs text-muted">{(t.participants as { name?: string; address: string }[]).map((p) => p.name || p.address).join(", ")}</p>
        </div>
        {t.pipelineCard && (
          <Link href={`/pipeline?card=${t.pipelineCard.id}`}>
            <Badge tone="r3">
              <Kanban className="size-3" /> {t.pipelineCard.company}
            </Badge>
          </Link>
        )}
        <Button size="icon-sm" variant="ghost" onClick={() => call("thread.archive", { id, archived: !t.archived }).then(() => onBack?.())} aria-label="Archive">
          <Archive />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
        <Button size="sm" variant="ghost" onClick={() => ui.openNewTask({ title: t.subject || `Reply to ${other?.name ?? ""}`, threadId: t.id })}>
          <CheckSquare /> Task
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setFuOpen(true)}>
          <Bell /> Follow-up
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCardOpen(true)}>
          <Kanban /> Pipeline
        </Button>
        {agent?.configured && (
          <Button size="sm" variant="ghost" onClick={() => agentAction("summary")} disabled={!!agentBusy}>
            {agentBusy === "summary" ? <Loader2 className="animate-spin" /> : <FileText />} Summarize
          </Button>
        )}
        {t.channel === "SLACK" && (
          <Button size="sm" variant="ghost" onClick={() => call("thread.react", { id, emoji: "thumbsup" }).then(() => toast.success("👍 sent"))}>
            👍
          </Button>
        )}
        {t.unread && (
          <Button size="sm" variant="ghost" onClick={() => call("thread.read", { id })}>
            <MailOpen /> Read
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {summary && (
          <div className="rounded-xl border border-accent/25 bg-accent/[0.07] p-3 text-sm">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <Sparkles className="size-3" /> Summary
            </p>
            <p className="whitespace-pre-wrap text-fg-2">{scrubMoney(summary)}</p>
          </div>
        )}
        {(t.followUps.length > 0 || t.tasks.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {t.followUps.map((f) => (
              <Badge key={f.id} tone="warn">
                <Bell className="size-3" /> {f.person?.name}: {f.title}
              </Badge>
            ))}
            {t.tasks.map((x) => (
              <Badge key={x.id}>
                <CheckSquare className="size-3" /> {x.title}
              </Badge>
            ))}
          </div>
        )}
        {t.messages.map((m) => (
          <div key={m.id} className={cn("max-w-[88%]", m.isFromMe ? "ml-auto" : "")}>
            <div className={cn("mb-1 flex items-baseline gap-2 text-[11px] text-muted", m.isFromMe && "justify-end")}>
              <span className="font-medium text-fg-2">{m.isFromMe ? "You" : m.fromName || m.fromAddr}</span>
              <span>{new Date(m.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </div>
            <div className={cn("whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed", m.isFromMe ? "rounded-br-md bg-accent/90 text-accent-fg" : "rounded-bl-md border border-line bg-panel-2")}>
              {m.body || <span className="italic text-muted">(no text)</span>}
            </div>
          </div>
        ))}
        {t.drafts.map((d) => (
          <DraftCard key={d.id} d={d} />
        ))}
        <div ref={bottom} />
      </div>

      <div className="safe-bottom border-t border-line p-3">
        <div className="rounded-2xl border border-line-2 bg-panel p-1.5 focus-within:border-accent/50">
          <textarea
            ref={composer}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
            rows={2}
            placeholder={agent?.configured ? "Reply — or type instructions and tap “Draft with agent”" : "Reply…"}
            className="max-h-48 min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-muted sm:text-sm"
          />
          <div className="flex items-center justify-between gap-2 px-1">
            {agent?.configured ? (
              <Button size="sm" variant="ghost" onClick={() => agentAction("draft")} disabled={!!agentBusy}>
                {agentBusy === "draft" ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft with agent
              </Button>
            ) : (
              <span />
            )}
            <Button size="sm" variant="primary" onClick={send} disabled={sending || !reply.trim()}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />} Send
            </Button>
          </div>
        </div>
      </div>

      <FollowUpFromThread open={fuOpen} onOpenChange={setFuOpen} t={t} />
      <PipelineFromThread open={cardOpen} onOpenChange={setCardOpen} t={t} />
    </div>
  );
}

export function DraftCard({ d }: { d: { id: string; to: string; subject: string; body: string; status: string; createdBy: string; rationale: string; error?: string | null } }) {
  const [edit, setEdit] = React.useState(false);
  const [body, setBody] = React.useState(d.body);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setBody(d.body), [d.body]);
  return (
    <div className="ml-auto max-w-[92%] rounded-2xl border border-dashed border-warn/50 bg-warn/[0.06] p-3">
      <div className="mb-1.5 flex items-center gap-2 text-[11px]">
        <Badge tone="warn">{d.status === "FAILED" ? "Send failed" : "Draft — needs your approval"}</Badge>
        <span className="truncate text-muted">to {d.to}</span>
        {d.createdBy === "agent" && (
          <span className="ml-auto flex items-center gap-1 text-accent">
            <Sparkles className="size-3" /> agent
          </span>
        )}
      </div>
      {d.rationale && <p className="mb-1.5 text-[11px] italic text-fg-2">{d.rationale}</p>}
      {edit ? <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[120px]" /> : <p className="whitespace-pre-wrap text-sm">{d.body}</p>}
      {d.error && <p className="mt-1 text-xs text-bad">{d.error}</p>}
      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => call("draft.discard", { id: d.id })}>
          <X /> Discard
        </Button>
        {edit ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await call("draft.update", { id: d.id, body });
              setEdit(false);
            }}
          >
            Save
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>
            <Pencil /> Edit
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (edit) await call("draft.update", { id: d.id, body }, { refresh: false });
              await call("draft.send", { id: d.id });
              toast.success("Approved & sent");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Send />} Approve &amp; send
        </Button>
      </div>
    </div>
  );
}

function FollowUpFromThread({ open, onOpenChange, t }: { open: boolean; onOpenChange: (o: boolean) => void; t: T }) {
  const other = (t.participants as { name?: string; address: string }[])?.[0];
  const [title, setTitle] = React.useState("");
  const [person, setPerson] = React.useState("");
  const [date, setDate] = React.useState<string | null>(nextWeekdayKey(4));
  React.useEffect(() => {
    if (open) {
      setTitle(t.subject || "Reply");
      setPerson(other?.name || other?.address || "");
      setDate(nextWeekdayKey(4));
    }
  }, [open, t.subject, other?.name, other?.address]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Follow-up from this thread">
      <div className="space-y-3">
        <Field label="What">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Who">
          <Input value={person} onChange={(e) => setPerson(e.target.value)} />
        </Field>
        <Field label="When">
          <DateChips value={date} onChange={setDate} allowNone={false} />
        </Field>
        <Button
          variant="primary"
          className="w-full"
          disabled={!title || !person || !date}
          onClick={async () => {
            await call("followup.create", { title, personName: person, dueDate: date!, threadId: t.id, pipelineCardId: t.pipelineCardId ?? null });
            toast.success("Follow-up set");
            onOpenChange(false);
          }}
        >
          Add follow-up
        </Button>
      </div>
    </Modal>
  );
}

function PipelineFromThread({ open, onOpenChange, t }: { open: boolean; onOpenChange: (o: boolean) => void; t: T }) {
  const { data: cards } = useQ("pipeline", {}, { isPaused: () => !open });
  const other = (t.participants as { name?: string; address: string }[])?.[0];
  const domain = other?.address.includes("@") ? other.address.split("@")[1].split(".")[0] : "";
  const [mode, setMode] = React.useState<"link" | "new">("link");
  const [cardId, setCardId] = React.useState("");
  const [company, setCompany] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setCompany(domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : "");
      const match = cards?.find((c) => domain && c.company.toLowerCase().includes(domain.toLowerCase()));
      setCardId(match?.id ?? "");
      setMode(match || cards?.length ? "link" : "new");
    }
  }, [open, cards, domain]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Link to pipeline">
      <div className="space-y-3">
        <div className="flex gap-1.5">
          <Button size="sm" variant={mode === "link" ? "secondary" : "ghost"} onClick={() => setMode("link")}>
            Existing account
          </Button>
          <Button size="sm" variant={mode === "new" ? "secondary" : "ghost"} onClick={() => setMode("new")}>
            New account
          </Button>
        </div>
        {mode === "link" ? (
          <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">Choose…</option>
            {cards?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </Select>
        ) : (
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" />
        )}
        <Button
          variant="primary"
          className="w-full"
          disabled={mode === "link" ? !cardId : !company}
          onClick={async () => {
            let id = cardId;
            if (mode === "new") {
              const c = await call("card.create", { company, stage: "CONTACTED", nextAction: `Reply to ${other?.name || other?.address || "thread"}`, contacts: other ? [{ name: other.name || other.address, email: other.address.includes("@") ? other.address : null }] : [] }, { refresh: false });
              id = c.id;
            }
            await call("card.linkThread", { cardId: id, threadId: t.id });
            toast.success("Linked to pipeline");
            onOpenChange(false);
          }}
        >
          Link thread
        </Button>
      </div>
    </Modal>
  );
}
