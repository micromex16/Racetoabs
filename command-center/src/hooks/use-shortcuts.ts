"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/lib/ui-store";
import { NAV } from "@/components/app/nav";

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

/** N task · P parking · / search · A agent · G+key navigation · Esc closes. */
export function useShortcuts() {
  const router = useRouter();
  useEffect(() => {
    let gPending = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.set({ search: true });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      if (document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (Date.now() - gPending < 1200) {
        gPending = 0;
        const n = NAV.find((x) => x.key === k);
        if (n) {
          e.preventDefault();
          router.push(n.href);
        }
        return;
      }
      if (k === "g") {
        gPending = Date.now();
        return;
      }
      if (k === "n") {
        e.preventDefault();
        ui.openNewTask();
      } else if (k === "p") {
        e.preventDefault();
        ui.openCapture();
      } else if (k === "/") {
        e.preventDefault();
        ui.set({ search: true });
      } else if (k === "a") {
        e.preventDefault();
        ui.toggleAgent();
      } else if (k === "v") {
        e.preventDefault();
        ui.openCapture({ voice: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}
