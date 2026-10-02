"use client";
import * as React from "react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { DateChips } from "@/components/app/date-chips";
import { useQ, call } from "@/lib/client";
import { STAGES, STAGE_LABEL, LANE_LABEL, type Lane, type Stage } from "./shared";
import { Plus, Trash2, Archive, Mail, Hash, MessageCircle, AtSign as Linkedin, Phone, Check, Bell, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { celebrate } from "@/lib/confetti";
import Link from "next/link";

type Contact = { id?: string; name: string; title: string; email: string; phone: string; linkedin: string };
const CH_ICON = { EMAIL: Mail, SLACK: Hash, WHATSAPP: MessageCircle } as const;

export function CardDrawer({ id, onClose }: { id: string | "new" | null; onClose: () => void }) {
  const isNew = id === "new";
  const { data: card } = useQ("card", { id: id && !isNew ? id : "" }, { isPaused: () => !id || isNew });
  const { data: goals } = useQ("goals");
  const [f, setF] = React.useState({ company: "", lane: "DATA_CENTER" as Lane, stage: "TARGET" as Stage, tier: "A", nextAction: "", nextActionDate: null as string | null, notes: "", website: "", goalId: "" });
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [linkQ, setLinkQ] = React.useState("");
  const { data: threadHits } = useQ("search", { q: linkQ }, { isPaused: () => linkQ.length < 2 });
  const [next, setNext] = React.useState<{ action: string; date: string | null } | null>(null);

  React.useEffect(() => {
    if (isNew) {
      setF({ company: "", lane: "DATA_CENTER", stage: "TARGET", tier: "A", nextAction: "", nextActionDate: null, notes: "", website: "", goalId: "" });
      setContacts([{ name: "", title: "", email: "", phone: "", linkedin: "" }]);
    } else if (card && card.id === id) {
      setF({
        company: card.company,
        lane: card.lane,
        stage: card.stage,
        tier: card.tier,
        nextAction: card.nextAction,
        nextActionDate: card.nextActionDate?.slice(0, 10) ?? null,
        notes: card.notes,
        website: card.website,
        goalId: card.goalId ?? "",
      });
      setContacts(card.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, email: c.email ?? "", phone: c.phone ?? "", linkedin: c.linkedin ?? "" })));
    }
    setNext(null);
  }, [id, card, isNew]);

  if (!id) return null;
  const rocks = goals ? [...goals.weeklyRocks, ...goals.quarterlyRocks] : [];

  const save = async () => {
    const payload = {
      company: f.company,
      lane: f.lane,
      stage: f.stage,
      tier: f.tier,
      nextAction: f.nextAction,
      nextActionDate: f.nextActionDate,
      notes: f.notes,
      website: f.website,
      goalId: f.goalId || null,
      contacts: contacts.filter((c) => c.name.trim()).map((c, i) => ({ ...c, email: c.email || null, phone: c.phone || null, linkedin: c.linkedin || null, isPrimary: i === 0 })),
    };
    if (isNew) await call("card.create", payload);
    else {
      if (card && card.stage !== "CUSTOMER" && f.stage === "CUSTOMER") celebrate("big");
      await call("card.update", { id, patch: payload });
    }
    toast.success(isNew ? "Account added" : "Saved");
    onClose();
  };

  return (
    <Modal open={!!id} onOpenChange={(o) => !o && onClose()} title={isNew ? "New account" : f.company || "Account"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" className="sm:col-span-2">
          <Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} className="h-11 text-base" autoFocus={isNew} />
        </Field>
        <Field label="Stage">
          <Select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value as Stage })}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lane">
            <Select value={f.lane} onChange={(e) => setF({ ...f, lane: e.target.value as Lane })}>
              {(Object.keys(LANE_LABEL) as Lane[]).map((l) => (
                <option key={l} value={l}>
                  {LANE_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tier">
            <Select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })}>
              {["A", "B", "C", ""].map((t) => (
                <option key={t} value={t}>
                  {t || "—"}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="rounded-xl border border-accent/25 bg-accent/[0.06] p-3 sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-fg-2">Next action — feeds Today</span>
            {!isNew && f.nextAction && !next && (
              <Button size="sm" variant="good" onClick={() => setNext({ action: "", date: null })}>
                <Check /> Done → set next
              </Button>
            )}
          </div>
          {next ? (
            <div className="space-y-2">
              <p className="text-xs text-muted line-through">{f.nextAction}</p>
              <Input autoFocus placeholder="What's the next action?" value={next.action} onChange={(e) => setNext({ ...next, action: e.target.value })} />
              <DateChips value={next.date} onChange={(d) => setNext({ ...next, date: d })} />
              <Button
                size="sm"
                variant="primary"
                disabled={!next.action.trim()}
                onClick={async () => {
                  await call("card.nextDone", { id: id as string, nextAction: next.action, nextActionDate: next.date });
                  await call("day.pipelineDone", { refId: id as string }, { silent: true }).catch(() => {});
                  setNext(null);
                  toast.success("Logged. Next action set.");
                }}
              >
                Save next action
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input placeholder="e.g. Mail sample kit + founder note" value={f.nextAction} onChange={(e) => setF({ ...f, nextAction: e.target.value })} />
              <DateChips value={f.nextActionDate} onChange={(d) => setF({ ...f, nextActionDate: d })} />
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-fg-2">
              Contacts <span className={contacts.filter((c) => c.name).length >= 3 ? "text-good" : "text-warn"}>({contacts.filter((c) => c.name).length}/3)</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setContacts([...contacts, { name: "", title: "", email: "", phone: "", linkedin: "" }])}>
              <Plus /> Contact
            </Button>
          </div>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={c.id ?? i} className="grid gap-1.5 rounded-xl border border-line bg-panel p-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input placeholder="Name" value={c.name} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-9" />
                <Input placeholder="Title" value={c.title} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="h-9" />
                <div className="flex items-center gap-1">
                  {i === 0 && <Badge tone="accent">primary</Badge>}
                  <Button size="icon-sm" variant="ghost" onClick={() => setContacts(contacts.filter((_, j) => j !== i))} aria-label="Remove contact">
                    <Trash2 />
                  </Button>
                </div>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                  <Input placeholder="Email" value={c.email} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} className="h-9 pl-8" />
                </div>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                  <Input placeholder="Phone" value={c.phone} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} className="h-9 pl-8" />
                </div>
                <div className="relative">
                  <Linkedin className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                  <Input placeholder="LinkedIn" value={c.linkedin} onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, linkedin: e.target.value } : x)))} className="h-9 pl-8" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <Field label="Serves rock (optional)">
          <Select value={f.goalId} onChange={(e) => setF({ ...f, goalId: e.target.value })}>
            <option value="">Auto (by stage)</option>
            {rocks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Website">
          <Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
        </Field>
        <Field label="Notes" className="sm:col-span-2" hint="No pricing or dollar figures — this app doesn't hold financial data.">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>

        {!isNew && card && (
          <>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-fg-2">Linked threads</span>
              <div className="space-y-1">
                {card.threads.map((t) => {
                  const I = CH_ICON[t.channel];
                  return (
                    <div key={t.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm">
                      <I className="size-3.5 text-muted" />
                      <Link href={`/comms?thread=${t.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                        {t.subject || t.snippet}
                      </Link>
                      <button onClick={() => call("card.linkThread", { cardId: null, threadId: t.id })} className="text-muted hover:text-bad" aria-label="Unlink">
                        <Unlink className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
                <div className="relative">
                  <Link2 className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                  <Input placeholder="Link an Email / Slack / WhatsApp thread…" value={linkQ} onChange={(e) => setLinkQ(e.target.value)} className="h-9 pl-8" />
                </div>
                {linkQ.length >= 2 &&
                  threadHits?.results
                    .filter((r) => r.type === "thread")
                    .map((r) => (
                      <button
                        key={r.id}
                        onClick={async () => {
                          await call("card.linkThread", { cardId: card.id, threadId: r.id });
                          setLinkQ("");
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-panel-2"
                      >
                        <Plus className="size-3.5 text-accent" /> {r.title} <span className="text-xs text-muted">{r.sub}</span>
                      </button>
                    ))}
              </div>
            </div>
            {card.followUps.length > 0 && (
              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-fg-2">Open follow-ups</span>
                {card.followUps.map((fu) => (
                  <div key={fu.id} className="flex items-center gap-2 text-sm">
                    <Bell className="size-3.5 text-muted" /> {fu.person?.name}: {fu.title} <span className="text-xs text-muted">{fu.dueDate.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-fg-2">Stage history</span>
              <ol className="flex flex-wrap gap-1.5">
                {[...card.events].reverse().map((e) => (
                  <li key={e.id} className="rounded-md border border-line bg-panel px-2 py-1 text-[11px] text-fg-2">
                    {STAGE_LABEL[e.toStage]} · {new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {!isNew && card && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await call("followup.create", { title: f.nextAction || `Follow up with ${f.company}`, dueDate: f.nextActionDate ?? "tomorrow", personName: contacts[0]?.name || f.company, pipelineCardId: card.id });
                toast.success("Follow-up created");
              }}
            >
              <Bell /> Follow-up
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await call("card.archive", { id: card.id, archived: !card.archivedAt });
                onClose();
              }}
            >
              <Archive /> {card.archivedAt ? "Unarchive" : "Archive"}
            </Button>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!f.company.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
