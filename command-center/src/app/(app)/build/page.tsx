"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Snowflake, Plus, Minus, Hammer, Move, ArrowUpCircle, Trash2, X, Lock, Volume2, VolumeX, Gift, Check } from "lucide-react";
import { useQ, call, type QOut } from "@/lib/client";
import { World, occupiedCells, fits, type Ghost } from "@/components/game/world";
import { BuildingThumb } from "@/components/game/iso";
import { Coins, CoinIcon } from "@/components/game/coin";
import { ChallengeCard } from "@/components/game/widgets";
import { CountUp } from "@/components/viz/ring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented, Skeleton, Badge, Empty } from "@/components/ui/misc";
import { BUILDINGS, buildingDef, upgradeCost, type BuildingDef } from "@/lib/game/catalog";
import { sfx } from "@/lib/game/sound";
import { celebrate } from "@/lib/confetti";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Game = QOut<"game">;
type Tab = "shop" | "twist" | "trophies" | "records" | "treats" | "ledger";
const CATS = [
  ["all", "All"],
  ["production", "Production"],
  ["logistics", "Logistics"],
  ["people", "People"],
  ["energy", "Energy"],
  ["decor", "Decor"],
  ["landmark", "Landmarks"],
] as const;

export default function BuildPage() {
  const { data: g } = useQ("game");
  const [tab, setTab] = React.useState<Tab>("shop");
  const [placing, setPlacing] = React.useState<{ type: string; moveId?: string } | null>(null);
  const [target, setTarget] = React.useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const worldRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (window.innerWidth < 640) setZoom(1.45);
  }, []);
  const loaded = g != null;
  React.useEffect(() => {
    const el = worldRef.current;
    if (el && zoom > 1) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [zoom, loaded]);

  if (!g) return <div className="mx-auto max-w-6xl space-y-4"><Skeleton className="h-24" /><Skeleton className="h-[420px] rounded-3xl" /></div>;

  const occ = occupiedCells(g.buildings, placing?.moveId);
  const ghost: Ghost = placing && target ? { type: placing.type, x: target.x, y: target.y, valid: fits(placing.type, target.x, target.y, occ) } : null;
  const sel = g.buildings.find((b) => b.id === selected);
  const selDef = sel ? buildingDef(sel.type) : null;

  const startPlacing = (type: string) => {
    setSelected(null);
    setPlacing({ type });
    setTarget(null);
    worldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    toast("Tap a spot on the plant site", { icon: "🏗️" });
  };
  const confirm = async () => {
    if (!placing || !ghost?.valid || !target) return;
    try {
      if (placing.moveId) await call("town.move", { id: placing.moveId, x: target.x, y: target.y });
      else await call("town.build", { type: placing.type, x: target.x, y: target.y });
      sfx.build();
      if (!placing.moveId) celebrate("small");
      setPlacing(null);
      setTarget(null);
    } catch {
      sfx.nope();
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Hud g={g} />

      <section className="glass relative overflow-hidden rounded-3xl">
        <div ref={worldRef} className="overflow-x-auto overflow-y-hidden scrollbar-none">
          <div style={{ width: `${zoom * 100}%` }}>
            <World
              game={g}
              ghost={ghost}
              hideId={placing?.moveId}
              selectedId={selected}
              showGrid={!!placing}
              onTile={(t) => {
                if (placing) setTarget(t);
                else setSelected(null);
              }}
              onBuilding={(id) => setSelected(id === selected ? null : id)}
            />
          </div>
        </div>
        <div className="absolute right-3 top-3 flex gap-1">
          <Button size="icon-sm" variant="secondary" onClick={() => setZoom((z) => Math.max(1, z - 0.4))} aria-label="Zoom out">
            <Minus />
          </Button>
          <Button size="icon-sm" variant="secondary" onClick={() => setZoom((z) => Math.min(3, z + 0.4))} aria-label="Zoom in">
            <Plus />
          </Button>
        </div>
        <div className="absolute left-3 top-3 rounded-xl bg-black/35 px-2.5 py-1.5 text-[11px] text-white backdrop-blur">
          {g.rocks.length ? g.rocks.map((r, i) => `#${i + 1} ${r.progress}%`).join(" · ") : "Set this week's rocks to light the beacons"}
          {g.kitsThisWeek > 0 && ` · ${g.kitsThisWeek} kit${g.kitsThisWeek > 1 ? "s" : ""} rolling`}
        </div>

        <AnimatePresence>
          {placing && (
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line-2 bg-panel-solid/95 p-2.5 shadow-2xl backdrop-blur">
              <span className="text-sm font-medium">
                {placing.moveId ? "Move" : "Build"} {buildingDef(placing.type)?.name}
              </span>
              {!placing.moveId && <Coins n={buildingDef(placing.type)?.cost ?? 0} />}
              <span className={cn("text-xs", !target ? "text-muted" : ghost?.valid ? "text-good" : "text-bad")}>{!target ? "tap a spot" : ghost?.valid ? "fits here" : "doesn't fit"}</span>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setPlacing(null)}>
                  <X /> Cancel
                </Button>
                <Button size="sm" variant="primary" disabled={!ghost?.valid} onClick={confirm}>
                  <Hammer /> {placing.moveId ? "Move here" : "Build here"}
                </Button>
              </div>
            </motion.div>
          )}
          {!placing && sel && selDef && <Selected key={sel.id} b={sel} def={selDef} balance={g.balance} onMove={() => { setPlacing({ type: sel.type, moveId: sel.id }); setSelected(null); }} onClose={() => setSelected(null)} />}
        </AnimatePresence>
      </section>

      <div className="-mx-1 overflow-x-auto px-1 scrollbar-none">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "shop", label: "Shop" },
            { value: "twist", label: "Twist" },
            { value: "trophies", label: `Trophies ${g.achievements.filter((a) => a.unlockedAt).length}/${g.achievements.length}` },
            { value: "records", label: "Records" },
            { value: "treats", label: "Treats" },
            { value: "ledger", label: "Ledger" },
          ]}
        />
      </div>

      {tab === "shop" && <Shop g={g} onPick={startPlacing} />}
      {tab === "twist" && <ChallengeCard c={g.challenge} />}
      {tab === "trophies" && <Trophies g={g} />}
      {tab === "records" && <Records g={g} />}
      {tab === "treats" && <Treats g={g} />}
      {tab === "ledger" && <Ledger g={g} />}
    </div>
  );
}

function Hud({ g }: { g: Game }) {
  const pw = g.power.value;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.2fr_1fr_auto] sm:gap-3">
      <div className="glass relative overflow-hidden rounded-2xl p-3 sm:p-4">
        <div className="pointer-events-none absolute -left-8 -top-10 size-36 rounded-full bg-[#f5b819]/20 blur-3xl" />
        <p className="eyebrow">Coins</p>
        <div className="mt-1 flex items-center gap-2.5">
          <CoinIcon size={30} />
          <CountUp value={g.balance} className="text-3xl font-semibold tracking-tight sm:text-4xl" />
        </div>
        <p className="mt-1 text-xs text-fg-2">
          <span className="num font-semibold text-fg">+{g.earnedToday}</span> today · <span className="num font-semibold text-fg">+{g.earnedWeek}</span> this week
        </p>
      </div>
      <div className="glass rounded-2xl p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Power</p>
          <span className={cn("text-xs font-semibold", pw >= 80 ? "text-good" : pw >= 50 ? "text-fg-2" : "text-warn")}>{g.power.label}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Zap className={cn("size-5", pw >= 50 ? "text-[#f5b819]" : "text-muted")} />
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-track">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-[#f5b819] to-[#55a016]" initial={{ width: 0 }} animate={{ width: `${pw}%` }} transition={{ duration: 0.9 }} />
          </div>
          <span className="num text-sm font-semibold">{pw}%</span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[11px] text-muted">{g.power.hint}</p>
      </div>
      <div className="glass col-span-2 flex items-center gap-3 rounded-2xl px-3 py-2 sm:col-span-1 sm:flex-col sm:items-stretch sm:p-4">
        <div className="flex items-center gap-2">
          <Snowflake className="size-4 text-[#7cc7f0]" />
          <span className="text-sm">
            <span className="num font-semibold">{g.freezes}</span>/3 freezes
          </span>
        </div>
        <Button size="sm" variant="secondary" disabled={g.freezes >= 3 || g.balance < 150} onClick={() => call("game.buyFreeze", {}).then(() => sfx.freeze())}>
          Buy · <CoinIcon size={12} /> 150
        </Button>
        <Button size="sm" variant="ghost" onClick={() => call("game.settings", { soundOn: !g.settings.soundOn })} aria-label="Toggle sound">
          {g.settings.soundOn ? <Volume2 /> : <VolumeX />}
        </Button>
      </div>
    </div>
  );
}

function Selected({ b, def, balance, onMove, onClose }: { b: Game["buildings"][number]; def: BuildingDef; balance: number; onMove: () => void; onClose: () => void }) {
  const canUp = b.level < def.maxLevel;
  const cost = def.fixed ? 400 * b.level : upgradeCost(def, b.level + 1);
  return (
    <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line-2 bg-panel-solid/95 p-3 shadow-2xl backdrop-blur">
      <BuildingThumb def={def} size={52} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {def.name} <Badge tone="accent">L{b.level}</Badge>
        </p>
        <p className="truncate text-xs text-muted">{def.desc}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {canUp && (
          <Button
            size="sm"
            variant="primary"
            disabled={balance < cost}
            onClick={async () => {
              await call("town.upgrade", { id: b.id });
              sfx.build();
              celebrate("small");
            }}
          >
            <ArrowUpCircle /> L{b.level + 1} · <CoinIcon size={12} /> {cost}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onMove}>
          <Move /> Move
        </Button>
        {!def.fixed && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted hover:text-bad"
            onClick={async () => {
              if (!confirm(`Sell ${def.name} for half what you put in?`)) return;
              await call("town.sell", { id: b.id });
              onClose();
            }}
          >
            <Trash2 />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
    </motion.div>
  );
}

function Shop({ g, onPick }: { g: Game; onPick: (type: string) => void }) {
  const [cat, setCat] = React.useState<(typeof CATS)[number][0]>("all");
  const shop = new Map(g.shop.map((s) => [s.key, s]));
  const items = BUILDINGS.filter((b) => !b.fixed && (cat === "all" || b.category === cat)).sort((a, b) => {
    const la = shop.get(a.key)?.locked ? 1 : 0;
    const lb = shop.get(b.key)?.locked ? 1 : 0;
    return la - lb || a.cost - b.cost;
  });
  return (
    <div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-none">
        {CATS.map(([k, l]) => (
          <button key={k} onClick={() => setCat(k)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium", cat === k ? "border-accent/50 bg-accent/15 text-accent" : "border-line bg-panel text-fg-2")}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((b) => {
          const s = shop.get(b.key);
          const locked = !!s?.locked;
          const afford = g.balance >= b.cost;
          return (
            <button
              key={b.key}
              disabled={locked || !afford}
              onClick={() => onPick(b.key)}
              className={cn("glass group relative flex flex-col items-center rounded-2xl p-3 text-center transition", !locked && afford && "hover:-translate-y-0.5 hover:border-accent/40", (locked || !afford) && "cursor-not-allowed")}
            >
              <div className={cn("grid h-24 w-full place-items-center", locked && "opacity-40 grayscale")}>
                <BuildingThumb def={b} size={92} />
              </div>
              <p className="mt-1 text-sm font-semibold leading-tight">{b.name}</p>
              <p className="mt-0.5 line-clamp-2 min-h-8 text-[11px] text-muted">{locked ? s?.how : b.desc}</p>
              <div className="mt-2">
                {locked ? (
                  <Badge>
                    <Lock className="size-3" /> Locked
                  </Badge>
                ) : (
                  <Coins n={b.cost} className={afford ? "text-fg" : "text-muted"} />
                )}
              </div>
              {b.unlock?.by === "rare" && !locked && <span className="absolute right-2 top-2 text-[10px] font-bold text-[#f5b819]">RARE</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Trophies({ g }: { g: Game }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {g.achievements.map((a) => (
        <div key={a.key} className={cn("glass rounded-2xl p-3.5", !a.unlockedAt && "opacity-50")}>
          <div className={cn("text-3xl", !a.unlockedAt && "grayscale")}>{a.unlockedAt ? a.emoji : "🔒"}</div>
          <p className="mt-2 text-sm font-semibold leading-tight">{a.title}</p>
          <p className="mt-0.5 text-[11px] text-muted">{a.desc}</p>
          <div className="mt-2 flex items-center justify-between">
            <Coins n={a.reward} size={12} className="text-xs" />
            {a.unlockedAt && <span className="text-[10px] text-good">{new Date(a.unlockedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Records({ g }: { g: Game }) {
  return (
    <div className="glass divide-y divide-line rounded-2xl">
      {g.records.map((r) => (
        <div key={r.key} className="flex items-center gap-3 px-4 py-3">
          <span className="text-lg">{r.format === "duration" || r.format === "clock" ? "⏱️" : r.format === "coins" ? "🪙" : "📈"}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm">{r.title}</p>
            {r.previous != null && <p className="text-[11px] text-muted">beat your old best</p>}
          </div>
          <div className="text-right">
            <p className="num text-base font-semibold">{r.display}</p>
            {r.detail && <p className="text-[10px] text-muted">{r.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Treats({ g }: { g: Game }) {
  const [title, setTitle] = React.useState("");
  const [emoji, setEmoji] = React.useState("🎁");
  const [cost, setCost] = React.useState("1000");
  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-fg-2">Real-life rewards you set for yourself. Earn the coins, then cash them in — it&apos;s on the honor system.</p>
      {g.rewards.length === 0 && <Empty icon={<Gift />} title="No treats yet" hint="Something you actually want. Price it so it takes a real stretch of good weeks." />}
      <div className="grid gap-2 sm:grid-cols-2">
        {g.rewards.map((r) => {
          const pct = Math.min(100, Math.round((g.balance / r.cost) * 100));
          return (
            <div key={r.id} className={cn("glass rounded-2xl p-4", r.claimedAt && "border-good/40")}>
              <div className="flex items-start gap-3">
                <span className="text-3xl">{r.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.title}</p>
                  <Coins n={r.cost} className="text-sm" />
                </div>
                {!r.claimedAt && (
                  <button onClick={() => call("reward.delete", { id: r.id })} className="text-muted hover:text-bad" aria-label="Delete">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              {r.claimedAt ? (
                <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-good">
                  <Check className="size-3.5" /> Claimed {new Date(r.claimedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              ) : (
                <>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-track">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#f5b819] to-[#ffe48a]" style={{ width: `${pct}%` }} />
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    className="mt-3 w-full"
                    disabled={g.balance < r.cost}
                    onClick={async () => {
                      await call("reward.claim", { id: r.id });
                      sfx.fanfare();
                      celebrate("big");
                    }}
                  >
                    {g.balance >= r.cost ? "Claim it" : `${(r.cost - g.balance).toLocaleString()} to go`}
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <form
        className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim() || !Number(cost)) return;
          await call("reward.upsert", { title, emoji: emoji || "🎁", cost: Number(cost) });
          setTitle("");
        }}
      >
        <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-14 text-center text-lg" aria-label="Emoji" />
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A treat for yourself" className="min-w-40 flex-1" />
        <div className="flex items-center gap-1">
          <CoinIcon size={16} />
          <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className="w-24" aria-label="Cost in coins" />
        </div>
        <Button type="submit" variant="secondary">
          <Plus /> Add
        </Button>
      </form>
    </div>
  );
}

function Ledger({ g }: { g: Game }) {
  return (
    <div className="glass divide-y divide-line rounded-2xl">
      {g.recent.length === 0 && <p className="p-4 text-sm text-muted">Nothing yet. Finish a pick.</p>}
      {g.recent.map((e) => (
        <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
          <span className={cn("num w-16 shrink-0 text-right text-sm font-semibold", e.amount > 0 ? "text-[#c98a00] dark:text-[#ffcf4a]" : e.amount < 0 ? "text-muted" : "text-fg-2")}>
            {e.amount > 0 ? `+${e.amount}` : e.amount < 0 ? e.amount : "—"}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{e.label}</span>
          <span className="shrink-0 text-[11px] text-muted">{new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        </div>
      ))}
    </div>
  );
}
