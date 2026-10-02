"use client";
import * as React from "react";
import { useQ, call, type QOut } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Panel, SectionTitle, Skeleton, Badge } from "@/components/ui/misc";
import { PushCard } from "@/components/settings/push-card";
import { Integrations } from "@/components/settings/integrations";
import { Download, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SettingsPage() {
  const { data: s } = useQ("settings");
  if (!s) return <Skeleton className="mx-auto h-96 max-w-3xl" />;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="px-1 text-2xl font-semibold tracking-tight">Settings</h1>
      <General s={s} />
      <section>
        <SectionTitle>Notifications</SectionTitle>
        <Panel className="p-5">
          <p className="mb-3 text-sm text-fg-2">
            “Your day” at {s.morningTime}, follow-up digest two hours later, “Close the day” at {s.closeTime}, and the Friday review nudge.
          </p>
          <PushCard />
        </Panel>
      </section>
      <GameSettings />
      <section id="integrations">
        <SectionTitle>Integrations</SectionTitle>
        <React.Suspense>
          <Integrations />
        </React.Suspense>
      </section>
      <People />
      <Cadence />
      <section>
        <SectionTitle>Data</SectionTitle>
        <Panel className="flex flex-wrap items-center gap-3 p-5">
          <p className="flex-1 text-sm text-fg-2">Download everything you&apos;ve entered as JSON. For full database backups see the README.</p>
          <Button asChild variant="secondary">
            <a href="/api/export">
              <Download /> Export JSON
            </a>
          </Button>
        </Panel>
      </section>
    </div>
  );
}

function General({ s }: { s: QOut<"settings"> }) {
  const [f, setF] = React.useState(s);
  React.useEffect(() => setF(s), [s]);
  const save = async () => {
    await call("settings.update", { ownerName: f.ownerName, company: f.company, timezone: f.timezone, morningTime: f.morningTime, closeTime: f.closeTime, reviewDay: f.reviewDay, exitDate: f.exitDate, pushEnabled: f.pushEnabled });
    toast.success("Saved");
  };
  return (
    <section>
      <SectionTitle>General</SectionTitle>
      <Panel className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Your first name (for the greeting)">
          <Input value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} />
        </Field>
        <Field label="Company">
          <Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
        </Field>
        <Field label="Timezone" hint="Tucson & Imuris are both America/Phoenix (UTC−7, no DST)">
          <Input value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} />
        </Field>
        <Field label="Exit-ready date">
          <Input type="date" value={f.exitDate} onChange={(e) => setF({ ...f, exitDate: e.target.value })} />
        </Field>
        <Field label="“Your day” push">
          <Input type="time" value={f.morningTime} onChange={(e) => setF({ ...f, morningTime: e.target.value })} />
        </Field>
        <Field label="“Close the day” push">
          <Input type="time" value={f.closeTime} onChange={(e) => setF({ ...f, closeTime: e.target.value })} />
        </Field>
        <Field label="Weekly review day">
          <Select value={f.reviewDay} onChange={(e) => setF({ ...f, reviewDay: Number(e.target.value) })}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scheduled pushes">
          <Select value={f.pushEnabled ? "on" : "off"} onChange={(e) => setF({ ...f, pushEnabled: e.target.value === "on" })}>
            <option value="on">On</option>
            <option value="off">Paused</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Button variant="primary" onClick={save}>
            <Save /> Save
          </Button>
        </div>
      </Panel>
    </section>
  );
}

function People() {
  const { data } = useQ("people");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("");
  return (
    <section>
      <SectionTitle count={data?.length}>People</SectionTitle>
      <Panel className="p-2">
        <div className="divide-y divide-line">
          {data?.map((p) => (
            <PersonRow key={p.id} p={p} />
          ))}
        </div>
        <form
          className="flex gap-2 p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await call("person.upsert", { name, role, isTeam: true });
            setName("");
            setRole("");
          }}
        >
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Role (optional)" value={role} onChange={(e) => setRole(e.target.value)} />
          <Button type="submit" variant="secondary" size="icon" aria-label="Add person">
            <Plus />
          </Button>
        </form>
      </Panel>
    </section>
  );
}

function PersonRow({ p }: { p: QOut<"people">[number] }) {
  const [edit, setEdit] = React.useState(false);
  const [f, setF] = React.useState({ name: p.name, role: p.role, email: p.email ?? "", slackId: p.slackId ?? "", whatsapp: p.whatsapp ?? "" });
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="grid size-8 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent">{p.name.slice(0, 1).toUpperCase()}</div>
        <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(!edit)}>
          <p className="text-sm font-medium">{p.name}</p>
          <p className="text-xs text-muted">{[p.role, p.email].filter(Boolean).join(" · ") || "tap to add details"}</p>
        </button>
        <Button size="icon-sm" variant="ghost" onClick={() => call("person.archive", { id: p.id })} aria-label="Archive">
          <Trash2 />
        </Button>
      </div>
      {edit && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" />
          <Input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Role" />
          <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" />
          <Input value={f.slackId} onChange={(e) => setF({ ...f, slackId: e.target.value })} placeholder="Slack member ID" />
          <Input value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder="WhatsApp (+52…)" />
          <Button
            variant="primary"
            onClick={async () => {
              await call("person.upsert", { id: p.id, ...f, email: f.email || null, slackId: f.slackId || null, whatsapp: f.whatsapp || null });
              setEdit(false);
            }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

function Cadence() {
  const { data } = useQ("recurring");
  const { data: sb } = useQ("scoreboard", {}, { revalidateOnFocus: false });
  const [title, setTitle] = React.useState("");
  return (
    <section>
      <SectionTitle>Weekly cadence</SectionTitle>
      <Panel className="p-2">
        <div className="divide-y divide-line">
          {data?.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="min-w-40 flex-1 text-sm">{r.title}</span>
              {r.targetCount != null && <Badge>target {r.targetCount}</Badge>}
              <Select value={r.weekday} onChange={(e) => call("recurring.upsert", { id: r.id, title: r.title, weekday: Number(e.target.value) })} className="h-8 w-28 text-xs">
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    due {d.slice(0, 3)}
                  </option>
                ))}
              </Select>
              <Select value={r.metricKey ?? ""} onChange={(e) => call("recurring.upsert", { id: r.id, title: r.title, metricKey: e.target.value || null })} className="h-8 w-40 text-xs">
                <option value="">No metric</option>
                {sb?.metrics
                  .filter((m) => m.source === "MANUAL")
                  .map((m) => (
                    <option key={m.key} value={m.key}>
                      → {m.name}
                    </option>
                  ))}
              </Select>
              <Button size="icon-sm" variant="ghost" onClick={() => call("recurring.upsert", { id: r.id, title: r.title, active: !r.active })} aria-label="Toggle">
                <span className="text-[10px]">{r.active ? "on" : "off"}</span>
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => confirm(`Delete “${r.title}”?`) && call("recurring.delete", { id: r.id })} aria-label="Delete">
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <form
          className="flex gap-2 p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const m = title.match(/^(\d+)\s/);
            await call("recurring.upsert", { title, weekday: 5, targetCount: m ? Number(m[1]) : null });
            setTitle("");
          }}
        >
          <Input placeholder="e.g. 5 plant walk-throughs" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" variant="secondary" size="icon" aria-label="Add">
            <Plus />
          </Button>
        </form>
      </Panel>
    </section>
  );
}

function GameSettings() {
  const { data: g } = useQ("game");
  if (!g) return null;
  const set = (patch: { soundOn?: boolean; hapticsOn?: boolean; sprintMinutes?: number }) => call("game.settings", patch);
  return (
    <section>
      <SectionTitle>Game</SectionTitle>
      <Panel className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Sounds">
          <Select value={g.settings.soundOn ? "on" : "off"} onChange={(e) => set({ soundOn: e.target.value === "on" })}>
            <option value="on">On</option>
            <option value="off">Off</option>
          </Select>
        </Field>
        <Field label="Haptics (Android)" hint="iPhone browsers don't expose vibration.">
          <Select value={g.settings.hapticsOn ? "on" : "off"} onChange={(e) => set({ hapticsOn: e.target.value === "on" })}>
            <option value="on">On</option>
            <option value="off">Off</option>
          </Select>
        </Field>
        <Field label="Focus sprint length">
          <Select value={g.settings.sprintMinutes} onChange={(e) => set({ sprintMinutes: Number(e.target.value) })}>
            {[15, 25, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </Select>
        </Field>
      </Panel>
    </section>
  );
}
