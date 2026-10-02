"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Mic, Sparkles, Moon, SunMedium, LogOut, MoreHorizontal, ParkingSquare, Flame } from "lucide-react";
import { NAV, MOBILE_TABS } from "./nav";
import { cn } from "@/lib/utils";
import { ui, useUI } from "@/lib/ui-store";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { NewTaskDialog } from "./new-task-dialog";
import { CaptureDialog } from "./capture-dialog";
import { DelegateDialog } from "./delegate-dialog";
import { SearchPalette } from "./search-palette";
import { Kbd } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { getTheme, setTheme } from "./theme";
import { useQ, refreshAll } from "@/lib/client";
import { MorningLaunch } from "@/components/launch/morning-launch";
import { EndOfDay } from "@/components/today/end-of-day";
import { AgentPanel } from "@/components/agent/agent-panel";
import { flushOutbox } from "@/lib/outbox";

function useServiceWorker() {
  React.useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const flush = () => flushOutbox().then((n) => {
      if (n) void refreshAll();
    });
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  useShortcuts();
  useServiceWorker();
  const agentOpen = useUI((s) => s.agent);
  const launchOpen = useUI((s) => s.launch);
  const [more, setMore] = React.useState(false);
  const [theme, setThemeState] = React.useState<"dark" | "light">("dark");
  const { data: today } = useQ("today", undefined, { refreshInterval: 5 * 60_000 });

  React.useEffect(() => {
    setThemeState(getTheme());
    try {
      if (localStorage.getItem("cc.agent") === "1" && window.innerWidth >= 1280) ui.set({ agent: true });
    } catch {}
  }, []);

  // Morning Launch: first open each day.
  React.useEffect(() => {
    if (!today?.needsLaunch) return;
    const key = `cc.launch.skipped.${today.today}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {}
    if (pathname === "/" || pathname === "/goals" || pathname === "/agent") ui.set({ launch: true });
  }, [today?.needsLaunch, today?.today, pathname]);

  const current = NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href))) ?? (pathname.startsWith("/agent") ? { label: "Agent" } : null);
  const toggleTheme = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    setThemeState(t);
  };
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="min-h-dvh">
      <div className="backdrop" />

      {/* ───────── Desktop sidebar ───────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-bg/60 px-3 py-4 backdrop-blur-xl lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <div className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-[13px] font-bold text-white shadow-[0_8px_24px_-8px_var(--accent)]">M</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Micromex</div>
            <div className="text-[11px] text-muted">Command Center</div>
          </div>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition",
                  active ? "text-fg" : "text-fg-2 hover:bg-panel hover:text-fg",
                )}
              >
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl border border-line-2 bg-panel-2" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <n.icon className={cn("relative size-4", active ? "text-accent" : "text-muted group-hover:text-fg-2")} />
                <span className="relative flex-1">{n.label}</span>
                {n.href === "/parking" && today?.parking.open ? <span className="relative num text-[11px] text-muted">{today.parking.open}</span> : null}
                {n.href === "/review" && today?.reviewDue ? <span className="relative size-1.5 rounded-full bg-warn" /> : null}
              </Link>
            );
          })}
        </nav>
        {today && (
          <div className="mb-3 rounded-xl border border-line bg-panel p-3">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Exit</span>
              <span className="num text-xs text-term">{today.daysToExit.toLocaleString()} days</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-fg-2">
              <Flame className="size-3.5 text-r1" />
              <span className="num font-semibold text-fg">{today.streak.current}</span> day streak
            </div>
          </div>
        )}
        <div className="flex items-center gap-1 px-1">
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <SunMedium /> : <Moon />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Log out">
            <LogOut />
          </Button>
          <span className="ml-auto text-[10px] text-muted">
            <Kbd>/</Kbd> search
          </span>
        </div>
      </aside>

      {/* ───────── Desktop top bar ───────── */}
      <header className={cn("sticky top-0 z-20 hidden h-14 items-center gap-3 border-b border-line bg-bg/70 px-6 backdrop-blur-xl lg:flex lg:pl-[256px]", agentOpen && "xl:pr-[436px]")}>
        <h1 className="text-sm font-semibold tracking-tight">{current?.label ?? ""}</h1>
        <button onClick={() => ui.set({ search: true })} className="ml-6 flex h-8 w-72 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-[13px] text-muted transition hover:border-line-2 hover:text-fg-2">
          <Search className="size-3.5" />
          Search everything
          <Kbd className="ml-auto">/</Kbd>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => ui.openNewTask()}>
            <Plus /> Task <Kbd>N</Kbd>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => ui.openCapture()}>
            <ParkingSquare /> Park <Kbd>P</Kbd>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => ui.openCapture({ voice: true })} aria-label="Dictate">
            <Mic />
          </Button>
          <Button size="sm" variant={agentOpen ? "primary" : "secondary"} onClick={() => ui.toggleAgent()}>
            <Sparkles /> Agent <Kbd className={agentOpen ? "border-white/30 bg-white/10 text-white" : ""}>A</Kbd>
          </Button>
        </div>
      </header>

      {/* ───────── Mobile header ───────── */}
      <header className="safe-top sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/75 px-4 py-2.5 backdrop-blur-xl lg:hidden">
        <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-[11px] font-bold text-white">M</div>
        <h1 className="text-[15px] font-semibold tracking-tight">{current?.label ?? "Micromex"}</h1>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => ui.set({ search: true })} aria-label="Search">
            <Search className="!size-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setMore(true)} aria-label="More">
            <MoreHorizontal className="!size-5" />
          </Button>
        </div>
      </header>

      <main className={cn("relative mx-auto w-full px-4 pb-36 pt-4 lg:pb-16 lg:pl-[256px] lg:pr-6 lg:pt-6", agentOpen && "xl:pr-[436px]")}>
        <AnimatePresence mode="wait">
          <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ───────── Agent panel (desktop) ───────── */}
      <AnimatePresence>
        {agentOpen && pathname !== "/agent" && (
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="fixed inset-y-0 right-0 z-40 hidden w-[420px] border-l border-line bg-bg/85 backdrop-blur-2xl lg:block"
          >
            <AgentPanel onClose={() => ui.toggleAgent(false)} />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ───────── Mobile: mic FAB + tab bar ───────── */}
      <button
        onClick={() => ui.openCapture({ voice: true })}
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 grid size-14 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-[0_12px_30px_-6px_var(--accent)] active:scale-95 lg:hidden"
        aria-label="Dictate a thought"
      >
        <Mic className="size-6" />
      </button>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 backdrop-blur-2xl lg:hidden">
        <div className="mx-auto flex max-w-lg">
          {MOBILE_TABS.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} className="relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[10px] font-medium">
                {active && <motion.span layoutId="tab-active" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
                <t.icon className={cn("size-[22px]", active ? "text-accent" : "text-muted")} strokeWidth={active ? 2.2 : 1.8} />
                <span className={active ? "text-fg" : "text-muted"}>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <Modal open={more} onOpenChange={setMore} title="More">
        <div className="grid grid-cols-3 gap-2">
          {NAV.filter((n) => !MOBILE_TABS.some((t) => t.href === n.href)).map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMore(false)} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel px-2 py-4 text-xs text-fg-2 active:scale-95">
              <n.icon className="size-5 text-accent" />
              {n.label}
            </Link>
          ))}
          <button onClick={toggleTheme} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel px-2 py-4 text-xs text-fg-2">
            {theme === "dark" ? <SunMedium className="size-5 text-accent" /> : <Moon className="size-5 text-accent" />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button onClick={logout} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel px-2 py-4 text-xs text-fg-2">
            <LogOut className="size-5 text-accent" />
            Log out
          </button>
        </div>
      </Modal>

      <NewTaskDialog />
      <CaptureDialog />
      <DelegateDialog />
      <SearchPalette />
      {launchOpen && today && <MorningLaunch today={today} />}
      <EndOfDay />
    </div>
  );
}
