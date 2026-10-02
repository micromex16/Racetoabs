"use client";
import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Dice5, Flame, Megaphone, PartyPopper, Handshake, UserPlus, UserMinus, Lock, Check, X, Building2, Wrench, Trophy, Zap, TrendingUp, Star, Pencil, Bell, BellOff, Coins as CoinsIc } from "lucide-react";
import { useQ, call, type QOut } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented, Skeleton, Badge, Empty } from "@/components/ui/misc";
import { Modal } from "@/components/ui/dialog";
import { FluidSparkline } from "@/components/viz/sparkline";
import { CoinIcon, Coins } from "@/components/game/coin";
import { Bucks, BuckIcon, fmtB, fmtLeft, useNow, Stars } from "@/components/venture/bucks";
import { VentureScene } from "@/components/venture/scene";
import { INDUSTRIES, LEASES, TRAITS, CONTRACT_TIERS, industryDef, type Role } from "@/lib/venture/catalog";
import { sfx } from "@/lib/game/sound";
import { celebrate } from "@/lib/confetti";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Data = QOut<"venture">;
type Co = NonNullable<Data["company"]>;
const H = 3600_000;
const ROLE_TONE: Record<Role, string> = { OPERATOR: "bg-[#f59e0b]", SALES: "bg-[#3b82f6]", ENGINEER: "bg-[#10b981]", MANAGER: "bg-[#8b5cf6]" };
const ROLE_HELP: Record<Role, string> = {
  OPERATOR: "Makes the product. More skill, more output.",
  SALES: "Brings in offers, and lets you run one more contract at once.",
  ENGINEER: "Makes every operator more productive.",
  MANAGER: "Keeps the team happy. Each one covers 8 people.",
};

export default function VenturePage() {
  const { data } = useQ("venture", undefined, { refreshInterval: 20_000 });
  if (!data) return <div className="mx-auto max-w-6xl space-y-4"><Skeleton className="h-24" /><Skeleton className="h-[380px] rounded-3xl" /></div>;
  return data.company ? <Company d={data} c={data.company} /> : <Founding d={data} />;
}

// ───────── Founding ─────────

function FounderCard({ d, compact }: { d: Data; compact?: boolean }) {
  const f = d.founder;
  const nextLease = LEASES.find((l) => l.level > f.level);
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-4">
      <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-accent/15 blur-3xl" />
      <div className="flex items-center justify-between">
        <p className="eyebrow">You, the founder</p>
        <Badge tone="accent">Level {f.level}</Badge>
      </div>
      <p className="mt-1 text-lg font-semibold">{f.title}</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-track">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-[#f5b819]" initial={{ width: 0 }} animate={{ width: `${f.pct}%` }} transition={{ duration: 0.8 }} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        {f.next ? <>{(f.next - f.xp).toLocaleString()} more real coins to level {f.level + 1}</> : "Max level"}
        {nextLease && !compact && <> · level {nextLease.level} unlocks a {nextLease.name.toLowerCase()}</>}
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-2">
        <Flame className={cn("size-4", f.momentum >= 1.5 ? "text-[#f97316]" : f.momentum >= 1 ? "text-[#f5b819]" : "text-muted")} />
        <span className="text-sm">
          Momentum <span className="num font-semibold">×{f.momentum.toFixed(2)}</span>
        </span>
        <span className="ml-auto text-[11px] text-muted">{f.coins24h} coins in 24h</span>
      </div>
      {!compact && <p className="mt-2 text-[11px] text-muted">Your real work powers the company. Every coin you earn in the real world speeds it up for the next 24 hours.</p>}
    </div>
  );
}

function Founding({ d }: { d: Data }) {
  const [ind, setInd] = React.useState(INDUSTRIES[0].key);
  const def = industryDef(ind);
  const [name, setName] = React.useState(def.names[0]);
  const [touched, setTouched] = React.useState(false);
  const [city, setCity] = React.useState("Tucson");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!touched) setName(industryDef(ind).names[0]);
  }, [ind, touched]);
  const shuffle = () => {
    const list = def.names.filter((n) => n !== name);
    setName(list[Math.floor(Math.random() * list.length)]);
    setTouched(true);
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass relative overflow-hidden rounded-3xl p-6 sm:p-8">
          <div className="pointer-events-none absolute -left-16 -top-16 size-64 rounded-full bg-[#3fa34d]/20 blur-3xl" />
          <p className="eyebrow">The tycoon game</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Start a company.</h1>
          <p className="mt-3 max-w-xl text-sm text-fg-2">
            Pick any industry. Lease a space, hire people, win contracts, keep the team happy — it runs live, all day, while you work. Grow it, sell it, start another.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-fg-2">
            <li>🔥 <b className="text-fg">Real work is the fuel.</b> Coins from real picks set your momentum.</li>
            <li>🔑 <b className="text-fg">Real milestones open doors.</b> Founder level unlocks bigger spaces.</li>
            <li>🥂 <b className="text-fg">Sell it for an exit bonus</b> in coins for your plant.</li>
          </ul>
          <p className="mt-4 text-[11px] text-muted">The company&apos;s money is play &ldquo;bucks&rdquo; — pretend, and never connected to Micromex.</p>
        </div>
        <FounderCard d={d} />
      </div>

      <section>
        <h2 className="mb-3 px-1 text-sm font-semibold text-fg-2">1 · Pick an industry</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {INDUSTRIES.map((i) => (
            <button
              key={i.key}
              onClick={() => setInd(i.key)}
              className={cn("glass relative rounded-2xl p-4 text-left transition hover:-translate-y-0.5", ind === i.key ? "border-2" : "border")}
              style={ind === i.key ? { borderColor: i.color, boxShadow: `0 12px 30px -16px ${i.color}` } : undefined}
            >
              <div className="text-3xl">{i.emoji}</div>
              <p className="mt-2 text-sm font-semibold leading-tight">{i.name}</p>
              <p className="mt-1 line-clamp-2 text-[11px] text-muted">{i.pitch}</p>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-muted">Makes {i.unit}</p>
              {i.key === "contract_mfg" && <span className="absolute right-3 top-3 text-[10px] font-bold text-accent">MIRROR</span>}
              {ind === i.key && <Check className="absolute bottom-3 right-3 size-4" style={{ color: i.color }} />}
            </button>
          ))}
        </div>
      </section>

      <section className="glass rounded-2xl p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-fg-2">2 · Name it</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl">{def.emoji}</span>
          <Input value={name} onChange={(e) => { setName(e.target.value); setTouched(true); }} className="min-w-48 flex-1 text-base font-semibold" maxLength={60} aria-label="Company name" />
          <Button variant="ghost" size="icon" onClick={shuffle} aria-label="Another name">
            <Dice5 />
          </Button>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-36" maxLength={60} aria-label="City" />
          <Button
            variant="primary"
            size="lg"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await call("venture.found", { industry: ind, name, city });
                sfx.fanfare();
                celebrate("big");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Building2 /> Found it
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted">You start in a garage with 5,000 bucks, one small offer and a few people interested in working for you.</p>
      </section>

      <Hall d={d} />
    </div>
  );
}

function Hall({ d }: { d: Data }) {
  if (!d.hall.length) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-fg-2">
        <Trophy className="size-4" /> Past companies
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {d.hall.map((h) => {
          const i = industryDef(h.industry);
          const days = h.soldAt ? Math.max(1, Math.round((Date.parse(h.soldAt) - Date.parse(h.foundedAt)) / (24 * H))) : 0;
          return (
            <div key={h.id} className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{i.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{h.name}</p>
                  <p className="text-[11px] text-muted">
                    {i.name} · {days} day{days === 1 ? "" : "s"} · peak {h.peakStaff} staff
                  </p>
                </div>
                <Badge tone={h.status === "SOLD" ? "good" : "neutral"}>{h.status === "SOLD" ? "Sold" : "Closed"}</Badge>
              </div>
              {h.status === "SOLD" && (
                <div className="mt-3 flex items-center justify-between text-sm">
                  <Bucks n={h.salePrice ?? 0} />
                  <Coins n={h.exitCoins ?? 0} signed className="text-[#c98a00] dark:text-[#ffcf4a]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ───────── Running company ─────────

type Tab = "contracts" | "team" | "hire" | "space" | "money" | "hq" | "feed";

function useLive(c: Co) {
  const now = useNow(1000);
  const el = Math.max(0, (now - Date.parse(c.asOf)) / H);
  const active = c.contracts.filter((x) => x.status === "ACTIVE");
  const flow = (active.length ? 0 : c.rates.grossPerHour) - c.rates.burnPerHour;
  let budget = c.rates.unitsPerHour * el;
  const progress = new Map<string, number>();
  for (const x of [...active].sort((a, b) => Date.parse(a.dueAt ?? "") - Date.parse(b.dueAt ?? ""))) {
    const take = Math.min(budget, Math.max(0, x.units - x.progress - 0.001));
    progress.set(x.id, x.progress + take);
    budget -= take;
  }
  return { now, cash: c.cash + flow * el, progress };
}

function Company({ d, c }: { d: Data; c: Co }) {
  const ind = industryDef(c.industry);
  const live = useLive(c);
  const [tab, setTab] = React.useState<Tab>("contracts");
  const offers = c.contracts.filter((x) => x.status === "OFFER");
  const active = c.contracts.filter((x) => x.status === "ACTIVE");
  const people = [{ id: "founder", role: "FOUNDER" as const, morale: 100, name: "You" }, ...c.emps.map((e) => ({ id: e.id, role: e.role as Role, morale: e.morale, name: `${e.name} · ${e.title}` }))];
  const day = Math.floor(c.ageHours / 24) + 1;
  const tierNext = c.nextTierRep;
  const tierPrev = CONTRACT_TIERS[c.maxTier].rep;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Header d={d} c={c} now={live.now} />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 sm:gap-3">
        <div className="glass relative overflow-hidden rounded-2xl p-3 sm:p-4">
          <div className="pointer-events-none absolute -left-8 -top-10 size-32 rounded-full bg-[#3fa34d]/20 blur-3xl" />
          <p className="eyebrow">Bucks</p>
          <div className="mt-1 flex items-center gap-2">
            <BuckIcon size={26} />
            <span className={cn("num text-2xl font-semibold tracking-tight sm:text-3xl", live.cash < 0 && "text-bad")}>{fmtB(live.cash)}</span>
          </div>
          <p className={cn("mt-1 text-xs", c.rates.netPerHour >= 0 ? "text-good" : "text-bad")}>
            <span className="num font-semibold">{fmtB(c.rates.netPerHour, { sign: true })}</span>/h <span className="text-muted">right now</span>
          </p>
        </div>
        <div className="glass rounded-2xl p-3 sm:p-4">
          <p className="eyebrow">Momentum</p>
          <div className="mt-1 flex items-center gap-2">
            <Flame className={cn("size-6", d.founder.momentum >= 1.5 ? "text-[#f97316]" : d.founder.momentum >= 1 ? "text-[#f5b819]" : "text-muted")} />
            <span className="num text-2xl font-semibold sm:text-3xl">×{d.founder.momentum.toFixed(2)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-muted">{d.founder.coins24h} real coins in 24h · {d.founder.momentum < d.founder.momentumCap ? "finish a pick to push it" : "maxed — the floor is flying"}</p>
        </div>
        <div className="glass rounded-2xl p-3 sm:p-4">
          <p className="eyebrow">Reputation</p>
          <div className="mt-1 flex items-center gap-2">
            <Star className="size-6 text-[#f5b819]" />
            <span className="num text-2xl font-semibold sm:text-3xl">{Math.round(c.reputation)}</span>
            <Badge>{CONTRACT_TIERS[c.maxTier].label} jobs</Badge>
          </div>
          {tierNext != null ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-track">
              <div className="h-full rounded-full bg-[#f5b819]" style={{ width: `${Math.min(100, ((c.reputation - tierPrev) / (tierNext - tierPrev)) * 100)}%` }} />
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-muted">Top tier</p>
          )}
          {tierNext != null && <p className="mt-1 text-[11px] text-muted">{Math.ceil(tierNext - c.reputation)} to {CONTRACT_TIERS[c.maxTier + 1].label.toLowerCase()} jobs</p>}
        </div>
        <div className="glass rounded-2xl p-3 sm:p-4">
          <p className="eyebrow">Worth</p>
          <div className="mt-1 flex items-center gap-2">
            <TrendingUp className="size-6 text-good" />
            <span className="num text-2xl font-semibold sm:text-3xl">{fmtB(c.valuation)}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Day {day} · exit ≈ <CoinIcon size={11} className="inline" /> {c.exitCoins.toLocaleString()}
          </p>
        </div>
      </div>

      <section className="glass relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#dbe9f7] to-[#f6efe2]">
        <VentureScene className="mx-auto block h-[260px] w-full sm:h-[400px]" lease={c.lease} name={c.name} color={ind.color} people={people} machines={c.machines} producing={c.rates.unitsPerHour > 0} shipping={active.length > 0} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-xl bg-black/40 px-2.5 py-1 text-[11px] text-white backdrop-blur">
            {c.rates.unitsPerHour.toFixed(c.rates.unitsPerHour < 10 ? 1 : 0)} {ind.unit}/h
          </span>
          {c.boosts.map((b) => (
            <span key={b.label + b.until} className={cn("rounded-xl px-2.5 py-1 text-[11px] text-white backdrop-blur", b.mult >= 1 ? "bg-good/70" : "bg-bad/70")}>
              {b.label} ×{b.mult < 0.05 ? 0 : b.mult} · {fmtLeft(Date.parse(b.until) - live.now)}
            </span>
          ))}
          <span className="rounded-xl bg-black/40 px-2.5 py-1 text-[11px] text-white backdrop-blur">
            {LEASES.find((l) => l.key === c.lease)?.emoji} {c.emps.length}/{c.seats} seats · {c.machines.length}/{c.slots} machines
          </span>
          {c.rates.idleMachines > 0 && <span className="rounded-xl bg-warn/80 px-2.5 py-1 text-[11px] text-white">{c.rates.idleMachines} machine{c.rates.idleMachines > 1 ? "s" : ""} idle — hire operators</span>}
        </div>
      </section>

      <AnimatePresence initial={false}>
        {c.cards.map((card) => (
          <DecisionCard key={card.id} card={card} now={live.now} />
        ))}
      </AnimatePresence>

      <div className="-mx-1 overflow-x-auto px-1 scrollbar-none [&_button]:whitespace-nowrap">
        <Segmented
          className="w-max"
          value={tab}
          onChange={setTab}
          options={[
            { value: "contracts", label: `Contracts${offers.length ? ` · ${offers.length} new` : ""}` },
            { value: "team", label: `Team ${c.emps.length}` },
            { value: "hire", label: "Hire" },
            { value: "space", label: "Space" },
            { value: "money", label: "Books" },
            { value: "hq", label: "HQ perks" },
            { value: "feed", label: "Feed" },
          ]}
        />
      </div>

      {tab === "contracts" && <Contracts d={d} c={c} live={live} />}
      {tab === "team" && <Team d={d} c={c} now={live.now} />}
      {tab === "hire" && <Hire d={d} c={c} />}
      {tab === "space" && <Space d={d} c={c} />}
      {tab === "money" && <Books d={d} c={c} />}
      {tab === "hq" && <Perks d={d} />}
      {tab === "feed" && <Feed c={c} />}
    </div>
  );
}

function Header({ d, c, now }: { d: Data; c: Co; now: number }) {
  const ind = industryDef(c.industry);
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(c.name);
  const [selling, setSelling] = React.useState(false);
  const canSell = now >= Date.parse(c.canSellAt);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="grid size-12 place-items-center rounded-2xl text-2xl" style={{ background: `${ind.color}22` }}>
        {ind.emoji}
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await call("venture.rename", { name });
              setEditing(false);
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} className="max-w-xs" />
            <Button type="submit" size="sm" variant="primary">
              Save
            </Button>
          </form>
        ) : (
          <button className="group flex items-center gap-2 text-left" onClick={() => setEditing(true)}>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{c.name}</h1>
            <Pencil className="size-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
          </button>
        )}
        <p className="text-xs text-muted">
          {ind.name} · {LEASES.find((l) => l.key === c.lease)?.name}
          {c.city ? ` · ${c.city}` : ""} · founder level {d.founder.level}
        </p>
      </div>
      <Button variant="ghost" size="icon" onClick={() => call("venture.alerts", { on: !d.alerts })} aria-label={d.alerts ? "Turn off company alerts" : "Turn on company alerts"} title={d.alerts ? "Phone alerts for decisions: on" : "Phone alerts for decisions: off"}>
        {d.alerts ? <Bell /> : <BellOff />}
      </Button>
      <Button variant={canSell ? "primary" : "secondary"} onClick={() => setSelling(true)}>
        <Handshake /> Sell
      </Button>
      <Modal open={selling} onOpenChange={setSelling} title={`Sell ${c.name}?`}>
        <div className="space-y-3 text-sm">
          <p className="text-fg-2">Buyers value it at about</p>
          <Bucks n={c.valuation} size={22} className="text-3xl" />
          <p className="text-fg-2">
            You&apos;d bank an exit bonus of <Coins n={c.exitCoins} className="text-fg" /> real coins for your plant{c.dilution > 0 ? ` (after giving up ${Math.round(c.dilution * 100)}% to investors)` : ""}. Then you can start something new.
          </p>
          {!canSell && <p className="rounded-xl bg-warn/10 px-3 py-2 text-warn">Buyers want {Math.ceil((Date.parse(c.canSellAt) - now) / H)} more hours of history first.</p>}
          <p className="text-[11px] text-muted">Worth = a month of recent profit + reputation + gear + bucks in the bank + the team&apos;s talent. Acquirers sometimes offer more — watch for them.</p>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              className="mr-auto text-muted hover:text-bad"
              onClick={async () => {
                if (!confirm("Wind it down with no sale and no bonus?")) return;
                await call("venture.windDown", {});
                setSelling(false);
              }}
            >
              Wind it down
            </Button>
            <Button variant="ghost" onClick={() => setSelling(false)}>
              Keep building
            </Button>
            <Button
              variant="primary"
              disabled={!canSell}
              onClick={async () => {
                await call("venture.sell", {});
                setSelling(false);
                sfx.fanfare();
                celebrate("big");
              }}
            >
              <Handshake /> Sell it
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DecisionCard({ card, now }: { card: Co["cards"][number]; now: number }) {
  const [busy, setBusy] = React.useState(false);
  const left = Date.parse(card.expiresAt) - now;
  return (
    <motion.div layout initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 60 }} className="glass relative overflow-hidden rounded-2xl border-accent/40 p-4">
      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent/15 blur-3xl" />
      <div className="flex items-start gap-3">
        <span className="text-3xl">{card.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{card.title}</p>
            <Badge tone="accent">Your call · {fmtLeft(left)}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-fg-2">{card.body}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        {card.options.map((o, i) => (
          <button
            key={i}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await call("venture.decide", { id: card.id, option: i });
                toast(r?.text ?? "Done", { icon: card.emoji });
                if (r?.ok === false) sfx.nope();
                else sfx.coin();
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-xl border border-line-2 bg-panel px-3 py-2.5 text-left transition hover:border-accent/50 hover:bg-accent/5 disabled:opacity-50"
          >
            <p className="text-sm font-medium">
              {o.label}
              {o.chance != null && <span className="ml-1.5 text-[11px] font-normal text-muted">{Math.round(o.chance * 100)}% odds</span>}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">{o.hint}</p>
            {i === card.defaultIdx && <p className="mt-1 text-[10px] uppercase tracking-wide text-muted/80">if you don&apos;t answer</p>}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function Contracts({ d, c, live }: { d: Data; c: Co; live: ReturnType<typeof useLive> }) {
  const ind = industryDef(c.industry);
  const offers = c.contracts.filter((x) => x.status === "OFFER");
  const active = c.contracts.filter((x) => x.status === "ACTIVE");
  const hasSales = c.emps.some((e) => e.role === "SALES");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-fg-2">
          Running <b className="text-fg">{active.length}</b> of {c.maxActive} · offers arrive about every {c.rates.offersPerHour > 0 ? fmtLeft(H / c.rates.offersPerHour) : "—"}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <label className={cn("flex items-center gap-2 text-xs", !hasSales && "opacity-50")} title={hasSales ? "" : "Hire a salesperson first"}>
            <input type="checkbox" disabled={!hasSales} checked={c.autoAccept} onChange={(e) => call("venture.autoAccept", { on: e.target.checked })} className="accent-[var(--accent)]" />
            Sales signs offers for me
          </label>
          <Button size="sm" variant="secondary" disabled={d.coins < d.costs.pitch || offers.length >= 4} onClick={() => call("venture.pitch", {}).then(() => sfx.coin())}>
            <Megaphone /> Pitch · <CoinIcon size={12} /> {d.costs.pitch}
          </Button>
        </div>
      </div>

      {active.length === 0 && offers.length === 0 && <Empty icon={<Handshake />} title="No work on the books" hint={`You're selling ${ind.unit} at walk-in prices. Hire sales or pitch a customer.`} />}

      {active.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {active.map((x) => {
            const p = live.progress.get(x.id) ?? x.progress;
            const pct = Math.min(100, (p / x.units) * 100);
            const left = Date.parse(x.dueAt ?? "") - live.now;
            const hoursNeeded = (x.units - p) / Math.max(0.0001, c.rates.unitsPerHour);
            const late = hoursNeeded * H > left;
            return (
              <div key={x.id} className="glass rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{x.customer}</p>
                    <p className="text-[11px] text-muted">
                      {x.tierLabel} job{x.rush ? " · rush" : ""} · {Math.round(x.units).toLocaleString()} {ind.unit}
                    </p>
                  </div>
                  <Bucks n={x.value} className="text-sm" />
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${pct}%`, background: ind.color }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px]">
                  <span className="text-muted">{pct.toFixed(0)}%</span>
                  <span className={late ? "font-semibold text-bad" : "text-muted"}>{late ? `At risk · due in ${fmtLeft(left)}` : `Due in ${fmtLeft(left)}`}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {offers.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {offers.map((x) => {
            const need = x.units / Math.max(0.0001, c.rates.unitsPerHour);
            const tight = need > x.hours;
            return (
              <motion.div key={x.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl border-dashed p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Badge tone="accent">Offer</Badge>
                      {x.rush && <Badge tone="warn">Rush</Badge>}
                    </div>
                    <p className="mt-1 truncate font-semibold">{x.customer}</p>
                    <p className="text-[11px] text-muted">
                      {Math.round(x.units).toLocaleString()} {ind.unit} in {x.hours}h · {x.tierLabel.toLowerCase()} job · +{CONTRACT_TIERS[x.tier].repGain} rep
                    </p>
                  </div>
                  <Bucks n={x.value} className="text-sm" />
                </div>
                <p className={cn("mt-2 text-[11px]", tight ? "text-warn" : "text-muted")}>
                  At today&apos;s pace: {need < 1 ? "under an hour" : `${need.toFixed(0)}h of work`}
                  {tight ? " — tight" : ""} · expires in {fmtLeft(Date.parse(x.expiresAt) - live.now)}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    className="flex-1"
                    disabled={active.length >= c.maxActive}
                    onClick={async () => {
                      await call("venture.accept", { id: x.id });
                      sfx.coin();
                    }}
                  >
                    <Check /> Sign it
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => call("venture.decline", { id: x.id })}>
                    <X /> Pass
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Mood({ v, target }: { v: number; target?: number }) {
  const color = v >= 65 ? "bg-good" : v >= 35 ? "bg-[#f5b819]" : "bg-bad";
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-track">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(3, v)}%` }} />
      {target != null && <div className="absolute top-0 h-full w-0.5 bg-fg/50" style={{ left: `${target}%` }} />}
    </div>
  );
}

function Avatar({ name, role }: { name: string; role: Role }) {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2);
  return <div className={cn("grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white", ROLE_TONE[role])}>{initials}</div>;
}

function Team({ d, c, now }: { d: Data; c: Co; now: number }) {
  const ind = industryDef(c.industry);
  const pepReady = !c.pepReadyAt || Date.parse(c.pepReadyAt) <= now;
  const avg = c.emps.length ? c.emps.reduce((a, e) => a + e.morale, 0) / c.emps.length : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-fg-2">
          {c.emps.length}/{c.seats} seats · team mood <b className="text-fg">{Math.round(avg)}</b> · payroll <Bucks n={c.rates.wages} className="text-fg" />/h
        </p>
        <Button size="sm" variant="secondary" className="ml-auto" disabled={!c.emps.length || !pepReady || d.coins < d.costs.pep} onClick={() => call("venture.pep", {}).then(() => sfx.bigCoin())}>
          <PartyPopper /> {pepReady ? <>Pep talk · <CoinIcon size={12} /> {d.costs.pep}</> : `Pep talk in ${fmtLeft(Date.parse(c.pepReadyAt!) - now)}`}
        </Button>
      </div>
      <div className="glass divide-y divide-line rounded-2xl">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e5326c] text-lg">👑</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">You · founder</p>
            <p className="text-[11px] text-muted">
              Works the floor for free · {c.rates.founderUnits.toFixed(1)} {ind.unit}/h at momentum ×{d.founder.momentum.toFixed(2)}
            </p>
          </div>
        </div>
        {c.emps.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Just you so far. Check the Hire tab.</p>}
        {c.emps.map((e) => {
          const t = e.trait ? TRAITS[e.trait as keyof typeof TRAITS] : null;
          return (
            <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={e.name} role={e.role as Role} />
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-semibold">
                  {e.name} <Stars n={e.skill} className="text-xs" />
                </p>
                <p className="truncate text-[11px] text-muted">
                  {e.title}
                  {t ? ` · ${t.emoji} ${t.name}` : ""} · <span className="num">{e.wage}</span>/h
                  {e.output != null ? ` · ${e.output.toFixed(1)} ${ind.unit}/h` : ""}
                </p>
              </div>
              <div className="w-28">
                <div className="mb-1 flex justify-between text-[10px] text-muted">
                  <span>mood</span>
                  <span className="num">{Math.round(e.morale)}</span>
                </div>
                <Mood v={e.morale} target={e.target} />
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted hover:text-bad"
                aria-label={`Let ${e.name} go`}
                title={`Let go · severance ${e.wage * 8}`}
                onClick={async () => {
                  if (!confirm(`Let ${e.name} go? Severance is ${e.wage * 8} bucks and the team will notice.`)) return;
                  await call("venture.fire", { id: e.id });
                }}
              >
                <UserMinus />
              </Button>
            </div>
          );
        })}
      </div>
      <p className="px-1 text-[11px] text-muted">The tick on each mood bar is where it&apos;s heading. Under 20 for six hours and they quit. Managers, perks from your plant, and a healthy bank balance keep it up.</p>
    </div>
  );
}

function Hire({ d, c }: { d: Data; c: Co }) {
  const full = c.emps.length >= c.seats;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-fg-2">{full ? "Every seat is taken — lease more space to grow." : `${c.seats - c.emps.length} open seat${c.seats - c.emps.length === 1 ? "" : "s"}. Fresh candidates every 8 hours.`}</p>
        <Button size="sm" variant="secondary" className="ml-auto" disabled={d.coins < d.costs.ad} onClick={() => call("venture.ad", {}).then(() => sfx.coin())}>
          <Megaphone /> Post a job ad · <CoinIcon size={12} /> {d.costs.ad}
        </Button>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {c.candidates.map((e) => {
          const t = e.trait ? TRAITS[e.trait as keyof typeof TRAITS] : null;
          return (
            <div key={e.id} className="glass flex flex-col rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <Avatar name={e.name} role={e.role as Role} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{e.name}</p>
                  <p className="text-[11px] text-muted">{e.title}</p>
                </div>
                <Stars n={e.skill} className="ml-auto text-sm" />
              </div>
              <p className="mt-2 text-[11px] text-muted">{ROLE_HELP[e.role as Role]}</p>
              {t && (
                <p className="mt-1.5 text-xs">
                  {t.emoji} <b>{t.name}</b> <span className="text-muted">— {t.desc}</span>
                </p>
              )}
              <div className="mt-auto flex items-center justify-between pt-3 text-xs">
                <span className="text-muted">
                  <span className="num font-semibold text-fg">{e.wage}</span>/h · signing <span className="num">{fmtB(e.signing)}</span>
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={full || c.cash < e.signing}
                  onClick={async () => {
                    await call("venture.hire", { id: e.id });
                    sfx.build();
                    toast(`${e.name} starts today`, { icon: "🤝" });
                  }}
                >
                  <UserPlus /> Hire
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Space({ d, c }: { d: Data; c: Co }) {
  const ind = industryDef(c.industry);
  const cur = LEASES.findIndex((l) => l.key === c.lease);
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 px-1 text-sm font-semibold text-fg-2">Lease</h3>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {LEASES.map((l, i) => {
            const locked = d.founder.level < l.level;
            const here = l.key === c.lease;
            const tooSmall = c.emps.length > l.seats || c.machines.length > l.slots;
            return (
              <div key={l.key} className={cn("glass flex flex-col rounded-2xl p-3.5", here && "border-2 border-accent/60")}>
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{l.emoji}</span>
                  {here ? <Badge tone="accent">Here</Badge> : locked ? <Badge><Lock className="size-3" /> Lvl {l.level}</Badge> : null}
                </div>
                <p className="mt-1 font-semibold">{l.name}</p>
                <p className="text-[11px] text-muted">
                  {l.seats} seats · {l.slots} machine{l.slots > 1 ? "s" : ""}
                  <br />
                  rent <span className="num">{Math.round(l.rent * (1 - d.perks.rent))}</span>/h{l.moveIn ? <> · move-in {fmtB(l.moveIn)}</> : null}
                </p>
                {!here && (
                  <Button
                    size="sm"
                    variant={i > cur ? "primary" : "ghost"}
                    className="mt-3"
                    disabled={locked || tooSmall || (i > cur && c.cash < l.moveIn)}
                    onClick={async () => {
                      await call("venture.lease", { key: l.key });
                      sfx.fanfare();
                      if (i > cur) celebrate("small");
                    }}
                  >
                    {locked ? `Founder level ${l.level}` : tooSmall ? "Too small" : i > cur ? "Move in" : "Downsize"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 px-1 text-sm font-semibold text-fg-2">
          On the floor · {c.machines.length}/{c.slots}
        </h3>
        {c.machines.length === 0 ? (
          <p className="px-1 text-sm text-muted">No machines yet. Each one boosts one operator&apos;s output.</p>
        ) : (
          <div className="glass divide-y divide-line rounded-2xl">
            {c.machines.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <Wrench className="size-4 text-muted" />
                <span className="flex-1 text-sm">
                  {m.name} <span className="text-[11px] text-muted">· +{Math.round(m.boost * 100)}% for one operator · upkeep {m.upkeep}/h</span>
                </span>
                <Button size="sm" variant="ghost" className="text-muted" onClick={() => confirm(`Sell the ${m.name.toLowerCase()} for ${m.resale}?`) && call("venture.sellMachine", { id: m.id })}>
                  Sell {fmtB(m.resale)}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 px-1 text-sm font-semibold text-fg-2">Equipment</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {c.shop.map((m) => {
            const full = c.machines.length >= c.slots;
            return (
              <div key={m.tier} className={cn("glass flex flex-col rounded-2xl p-3.5", !m.ok && "opacity-60")}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Tier {m.tier + 1}</p>
                <p className="mt-0.5 text-sm font-semibold leading-tight">{m.name}</p>
                <p className="mt-1 text-[11px] text-muted">
                  +{Math.round(m.boost * 100)}% output · {m.upkeep}/h
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  disabled={!m.ok || full || c.cash < m.cost}
                  onClick={async () => {
                    await call("venture.buyMachine", { tier: m.tier });
                    sfx.build();
                  }}
                >
                  {!m.ok ? `Needs ${m.needsLease.toLowerCase()}` : full ? "No floor space" : <Bucks n={m.cost} size={12} />}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-[11px] text-muted">Machines go to your best operators first. More machines than operators means some sit idle. {ind.emoji}</p>
      </section>
    </div>
  );
}

function Books({ d, c }: { d: Data; c: Co }) {
  const [coins, setCoins] = React.useState("100");
  const ind = industryDef(c.industry);
  const rows: [string, number][] = [
    ["Earning (at today's pace)", c.rates.grossPerHour],
    ["Payroll", -c.rates.wages],
    ["Rent", -c.rates.rent],
    ["Machine upkeep", -c.rates.upkeep],
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="glass rounded-2xl p-4">
        <p className="eyebrow">Per hour</p>
        <div className="mt-2 divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between py-2 text-sm">
              <span className="text-fg-2">{k}</span>
              <span className={cn("num font-medium", v < 0 && "text-muted")}>{fmtB(v, { sign: true })}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 text-sm font-semibold">
            <span>Net</span>
            <span className={cn("num", c.rates.netPerHour >= 0 ? "text-good" : "text-bad")}>{fmtB(c.rates.netPerHour, { sign: true })}</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">Contracts pay when they ship; without contracts you sell {ind.unit} at walk-in prices.</p>
      </div>
      <div className="glass rounded-2xl p-4">
        <p className="eyebrow">Bucks over time</p>
        <div className="mt-3">
          {c.history.length < 3 ? (
            <p className="grid h-[110px] place-items-center text-xs text-muted">The chart fills in hour by hour.</p>
          ) : (
            <FluidSparkline data={c.history.map((h) => ({ label: new Date(h.t).toLocaleString("en-US", { weekday: "short", hour: "numeric" }), value: h.cash }))} height={110} color="#3fa34d" format={(v) => fmtB(v)} />
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label={`${ind.unit} made`} v={Math.round(c.unitsMade).toLocaleString()} />
          <Stat label="contracts shipped" v={`${c.contractsDone}`} />
          <Stat label="missed" v={`${c.contractsFailed}`} />
          <Stat label="hired" v={`${c.hires}`} />
          <Stat label="quit" v={`${c.quits}`} />
          <Stat label="investors own" v={`${Math.round(c.dilution * 100)}%`} />
        </div>
      </div>
      <div className="glass rounded-2xl p-4 lg:col-span-2">
        <p className="eyebrow">Put real work into it</p>
        <p className="mt-1 text-sm text-fg-2">
          Turn coins into bucks: <CoinIcon size={12} className="inline" /> 1 = <BuckIcon size={12} className="inline" /> {d.costs.coinsToBucks}. One-way — bucks never turn back into coins (except when you sell).
        </p>
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = Math.floor(Number(coins));
            if (!n) return;
            await call("venture.invest", { coins: n });
            sfx.bigCoin();
          }}
        >
          <div className="flex items-center gap-1.5">
            <CoinIcon size={18} />
            <Input type="number" min={10} value={coins} onChange={(e) => setCoins(e.target.value)} className="w-28" aria-label="Coins to invest" />
          </div>
          <span className="text-sm text-muted">→</span>
          <Bucks n={Math.max(0, Math.floor(Number(coins) || 0)) * d.costs.coinsToBucks} />
          <Button type="submit" variant="secondary" disabled={(Number(coins) || 0) < 10 || d.coins < (Number(coins) || 0)}>
            <CoinsIc /> Invest
          </Button>
          <span className="text-[11px] text-muted">You have {d.coins.toLocaleString()} coins.</span>
        </form>
      </div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-2 py-2">
      <p className="num text-base font-semibold">{v}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

function Perks({ d }: { d: Data }) {
  const p = d.perks;
  const lv = d.hqLevels as Record<string, number>;
  const rows = [
    { k: "production", icon: "🏭", name: "Production buildings", v: `+${Math.round(p.output * 100)}% output`, lv: lv.production ?? 0 },
    { k: "logistics", icon: "🚚", name: "Logistics buildings", v: `+${Math.round(p.price * 100)}% on contracts`, lv: lv.logistics ?? 0 },
    { k: "people", icon: "🧑‍🤝‍🧑", name: "People buildings", v: `+${p.morale} team mood`, lv: lv.people ?? 0 },
    { k: "energy", icon: "☀️", name: "Energy buildings", v: `−${Math.round(p.rent * 100)}% rent & upkeep`, lv: lv.energy ?? 0 },
    { k: "decor", icon: "🌵", name: "Decor & landmarks", v: `+${Math.round(p.rep * 100)}% reputation gains`, lv: lv.decor ?? 0 },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Your plant is HQ</p>
          <Button asChild size="sm" variant="ghost">
            <Link href="/build">Build more</Link>
          </Button>
        </div>
        <p className="mt-1 text-sm text-fg-2">Everything you build with coins on the Plant page helps the company.</p>
        <div className="mt-3 divide-y divide-line">
          {rows.map((r) => (
            <div key={r.k} className="flex items-center gap-3 py-2.5">
              <span className="text-xl">{r.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{r.name}</p>
                <p className="text-[11px] text-muted">{r.lv} building level{r.lv === 1 ? "" : "s"}</p>
              </div>
              <span className="text-sm font-semibold">{r.v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="glass rounded-2xl p-4">
        <p className="eyebrow">Connections from real life</p>
        <p className="mt-1 text-sm text-fg-2">Real milestones open doors in the game.</p>
        <div className="mt-3 divide-y divide-line">
          {d.connections.map((x) => (
            <div key={x.achievement} className={cn("flex items-center gap-3 py-2.5", !x.active && "opacity-50")}>
              <span className={cn("text-xl", !x.active && "grayscale")}>{x.active ? x.emoji : "🔒"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{x.name}</p>
                <p className="text-[11px] text-muted">{x.desc}</p>
              </div>
              {x.active ? <Zap className="size-4 text-[#f5b819]" /> : null}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Locked ones open when you earn the matching trophy at work — first RFQ, a data-center pilot, a new customer, four closed reviews, a 10-day streak, 50 focus sprints.</p>
      </div>
      <div className="lg:col-span-2">
        <FounderCard d={d} />
      </div>
    </div>
  );
}

function Feed({ c }: { c: Co }) {
  const icon: Record<string, string> = { contract_done: "📦", contract_failed: "⚠️", offer: "📨", offer_auto: "✍️", offer_expired: "⌛", quit: "🚪", hire: "🤝", fire: "👋", levelup: "⭐", decision: "🗳️", card: "🃏", lease: "🔑", machine: "🔧", invest: "🪙", pep: "📣", ad: "📰", founded: "🎉", accept: "✅", sold: "🥂", pitch: "📣" };
  return (
    <div className="glass divide-y divide-line rounded-2xl">
      {c.log.map((l) => (
        <div key={l.id} className="flex items-start gap-3 px-4 py-2.5">
          <span className="text-base">{icon[l.kind] ?? "•"}</span>
          <span className="min-w-0 flex-1 text-sm">{l.text}</span>
          {l.amount ? <span className={cn("num shrink-0 text-xs font-semibold", l.amount > 0 ? "text-good" : "text-muted")}>{fmtB(l.amount, { sign: true })}</span> : null}
          <span className="w-16 shrink-0 text-right text-[11px] text-muted">{new Date(l.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
        </div>
      ))}
    </div>
  );
}
