"use client";
import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Inbox, Sparkles, Kanban, Settings, PenSquare } from "lucide-react";
import Link from "next/link";
import { useQ, call } from "@/lib/client";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Segmented, Skeleton, Empty, Badge } from "@/components/ui/misc";
import { ThreadView, DraftCard } from "@/components/comms/thread-view";
import { CH, type ChannelKey } from "@/components/comms/channel";
import { scrubMoney } from "@/lib/guard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Filter = "important" | "unread" | "all" | "linked" | "archived";

export default function CommsPage() {
  return (
    <React.Suspense>
      <Hub />
    </React.Suspense>
  );
}

function ago(iso: string) {
  const m = (Date.now() - Date.parse(iso)) / 60_000;
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  if (m < 60 * 24 * 7) return `${Math.round(m / 1440)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Hub() {
  const params = useSearchParams();
  const router = useRouter();
  const [channel, setChannel] = React.useState<ChannelKey | "ALL">((params.get("channel") as ChannelKey) || "ALL");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [q, setQ] = React.useState("");
  const [dq, setDq] = React.useState("");
  const [compose, setCompose] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const open = params.get("thread");
  const select = (id: string | null) => router.replace(id ? `/comms?thread=${id}` : "/comms", { scroll: false });
  const { data: threads } = useQ("threads", { ...(channel !== "ALL" ? { channel } : {}), filter, ...(dq.length > 1 ? { q: dq } : {}) }, { refreshInterval: 60_000 });
  const { data: drafts } = useQ("drafts");
  const { data: integ } = useQ("integrations");
  const connected = integ?.filter((i) => i.status === "connected") ?? [];
  const standaloneDrafts = drafts?.filter((d) => !open || d.threadId !== open) ?? [];

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all messages" className="h-9 pl-8" />
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {(["ALL", "EMAIL", "SLACK", "WHATSAPP"] as const).map((c) => {
            const I = c === "ALL" ? Inbox : CH[c].icon;
            return (
              <button key={c} onClick={() => setChannel(c)} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium", channel === c ? "border-accent/50 bg-accent/15 text-accent" : "border-line text-fg-2")}>
                <I className="size-3.5" /> {c === "ALL" ? "All" : CH[c].label}
              </button>
            );
          })}
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          className="w-full [&>button]:flex-1"
          options={[
            { value: "all", label: "Recent" },
            { value: "important", label: "Ranked" },
            { value: "unread", label: "Unread" },
            { value: "linked", label: "Pipeline" },
            { value: "archived", label: "Done" },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {standaloneDrafts.length > 0 && (
          <div className="border-b border-line bg-warn/[0.05] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-warn">{standaloneDrafts.length} draft{standaloneDrafts.length > 1 ? "s" : ""} awaiting approval</p>
            <div className="space-y-2">
              {standaloneDrafts.slice(0, 3).map((d) => (
                <button key={d.id} onClick={() => (d.threadId ? select(d.threadId) : undefined)} className="block w-full rounded-lg border border-line bg-panel p-2 text-left text-xs">
                  <span className="font-medium">{d.thread?.subject || d.to}</span>
                  <span className="line-clamp-1 text-muted">{d.body}</span>
                </button>
              ))}
              {standaloneDrafts
                .filter((d) => !d.threadId)
                .map((d) => (
                  <DraftCard key={d.id} d={d} />
                ))}
            </div>
          </div>
        )}
        {!threads ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="p-4">
            <Empty
              icon={<Inbox />}
              title={connected.length ? "Nothing here" : "No channels connected"}
              hint={connected.length ? "Try another filter." : "Connect Email, Slack and WhatsApp in Settings — messages are stored locally so search and the agent work offline."}
              action={!connected.length ? <Button size="sm" variant="primary" asChild><Link href="/settings#integrations"><Settings /> Connect</Link></Button> : undefined}
            />
          </div>
        ) : (
          <ul>
            {threads.map((t) => {
              const C = CH[t.channel];
              const who = (t.participants as { name?: string; address: string }[])?.[0];
              return (
                <li key={t.id}>
                  <button onClick={() => select(t.id)} className={cn("flex w-full gap-3 border-b border-line px-3 py-3 text-left transition hover:bg-panel", open === t.id && "bg-panel-2")}>
                    <div className="relative mt-0.5">
                      <div className="grid size-8 place-items-center rounded-full bg-panel-2 text-xs font-semibold text-fg-2">{(who?.name || who?.address || "?").slice(0, 1).toUpperCase()}</div>
                      <C.icon className="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-bg p-px text-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className={cn("truncate text-sm", t.unread ? "font-semibold text-fg" : "text-fg-2")}>{who?.name || who?.address || t.subject}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted">{ago(t.lastMessageAt)}</span>
                      </div>
                      {t.subject && <p className={cn("truncate text-[13px]", t.unread ? "text-fg" : "text-fg-2")}>{t.subject}</p>}
                      <p className="line-clamp-2 text-xs text-muted">{t.aiSummary ? scrubMoney(t.aiSummary) : t.snippet}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {t.unread && <span className="size-1.5 rounded-full bg-accent" />}
                        {t.aiRank != null && t.aiRank >= 60 && (
                          <Badge tone="accent">
                            <Sparkles className="size-3" /> {Math.round(t.aiRank)}
                          </Badge>
                        )}
                        {t.pipelineCard && (
                          <Badge tone="r3">
                            <Kanban className="size-3" /> {t.pipelineCard.company}
                          </Badge>
                        )}
                        {t._count.drafts > 0 && <Badge tone="warn">draft</Badge>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className={cn(open && "hidden lg:block")}>
          <h1 className="text-2xl font-semibold tracking-tight">Comms</h1>
          <p className="text-xs text-muted">Email · Slack · WhatsApp in one feed. Turn anything into a task, follow-up or pipeline card.</p>
        </div>
        <Button size="sm" variant="secondary" className={cn("ml-auto", open && "hidden lg:inline-flex")} onClick={() => setCompose(true)} disabled={!connected.length}>
          <PenSquare /> New
        </Button>
      </div>
      <div className="glass grid h-[calc(100dvh-210px)] overflow-hidden rounded-3xl lg:h-[calc(100dvh-170px)] lg:grid-cols-[380px_1fr]">
        <div className={cn("min-h-0 border-line lg:border-r", open && "hidden lg:block")}>{list}</div>
        <div className={cn("min-h-0", !open && "hidden lg:block")}>
          {open ? <ThreadView key={open} id={open} onBack={() => select(null)} autoReply={params.get("reply") === "1"} /> : <div className="grid h-full place-items-center text-sm text-muted">Select a conversation</div>}
        </div>
      </div>
      <ComposeModal open={compose} onOpenChange={setCompose} channels={connected.map((c) => c.channel as ChannelKey)} />
    </div>
  );
}

function ComposeModal({ open, onOpenChange, channels }: { open: boolean; onOpenChange: (o: boolean) => void; channels: ChannelKey[] }) {
  const [channel, setChannel] = React.useState<ChannelKey>(channels[0] ?? "EMAIL");
  const [to, setTo] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setChannel(channels[0] ?? "EMAIL");
      setTo("");
      setSubject("");
      setBody("");
    }
  }, [open, channels]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New message" description="Saved as a draft, then you approve & send.">
      <div className="space-y-3">
        <Field label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as ChannelKey)}>
            {channels.map((c) => (
              <option key={c} value={c}>
                {CH[c].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={channel === "EMAIL" ? "To (email)" : channel === "SLACK" ? "To (channel or user ID, e.g. C0123 / U0123)" : "To (WhatsApp number, e.g. 5216311234567)"}>
          <Input value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {channel === "EMAIL" && (
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        )}
        <Field label="Message">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[140px]" />
        </Field>
        <Button
          variant="primary"
          className="w-full"
          disabled={!to || !body}
          onClick={async () => {
            const d = await call("draft.create", { channel, to, subject, body }, { refresh: false });
            await call("draft.send", { id: d.id });
            toast.success("Sent");
            onOpenChange(false);
          }}
        >
          Send
        </Button>
      </div>
    </Modal>
  );
}
