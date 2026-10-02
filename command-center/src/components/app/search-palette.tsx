"use client";
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { useRouter } from "next/navigation";
import { useUI, ui } from "@/lib/ui-store";
import { useQ } from "@/lib/client";
import { NAV } from "./nav";
import { Plus, ParkingSquare, Sparkles, Search, Target, CheckSquare, Kanban, MessageSquare, User, Bell } from "lucide-react";

const ICON = { goal: Target, task: CheckSquare, card: Kanban, thread: MessageSquare, parking: ParkingSquare, person: User, followup: Bell } as const;

export function SearchPalette() {
  const open = useUI((s) => s.search);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 180);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const { data } = useQ("search", { q: debounced }, { isPaused: () => debounced.trim().length < 2 });
  const close = () => ui.set({ search: false });
  const go = (href: string) => {
    close();
    router.push(href);
  };

  return (
    <D.Root open={open} onOpenChange={(o) => ui.set({ search: o })}>
      <D.Portal>
        <D.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <D.Content className="fixed left-1/2 top-[10vh] z-50 w-[94vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line-2 bg-panel-solid/95 shadow-2xl backdrop-blur-2xl">
          <D.Title className="sr-only">Search</D.Title>
          <Command shouldFilter={false} className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-muted" />
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Search goals, tasks, accounts, messages…" className="h-13 flex-1 bg-transparent py-4 text-[15px] outline-none placeholder:text-muted" />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{q.length < 2 ? "Type to search" : "No matches"}</Command.Empty>
              {q.length < 2 && (
                <>
                  <Command.Group heading="Actions">
                    <Item onSelect={() => (close(), ui.openNewTask())} icon={<Plus />} label="New task" kbd="N" />
                    <Item onSelect={() => (close(), ui.openCapture())} icon={<ParkingSquare />} label="Park a thought" kbd="P" />
                    <Item onSelect={() => (close(), ui.toggleAgent(true))} icon={<Sparkles />} label="Ask the agent" kbd="A" />
                  </Command.Group>
                  <Command.Group heading="Go to">
                    {NAV.map((n) => (
                      <Item key={n.href} onSelect={() => go(n.href)} icon={<n.icon />} label={n.label} kbd={`G ${n.key.toUpperCase()}`} />
                    ))}
                  </Command.Group>
                </>
              )}
              {data?.results.length ? (
                <Command.Group heading="Results">
                  {data.results.map((r) => {
                    const I = ICON[r.type];
                    return <Item key={r.type + r.id} onSelect={() => go(r.href)} icon={<I />} label={r.title} sub={r.sub} />;
                  })}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Item({ onSelect, icon, label, sub, kbd }: { onSelect: () => void; icon: React.ReactNode; label: string; sub?: string; kbd?: string }) {
  return (
    <Command.Item onSelect={onSelect} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg-2 data-[selected=true]:bg-panel-2 data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:text-muted">
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      {kbd && <span className="font-mono text-[10px] text-muted">{kbd}</span>}
    </Command.Item>
  );
}
