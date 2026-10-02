"use client";
import { useSyncExternalStore } from "react";

type UIState = {
  newTask: { open: boolean; title?: string; goalId?: string | null; dueDate?: string | null; threadId?: string | null };
  capture: { open: boolean; text?: string; voice?: boolean };
  search: boolean;
  agent: boolean;
  delegate: { taskId: string; title: string } | null;
  launch: boolean;
  closeDay: boolean;
};

let state: UIState = {
  newTask: { open: false },
  capture: { open: false },
  search: false,
  agent: false,
  delegate: null,
  launch: false,
  closeDay: false,
};
const listeners = new Set<() => void>();

export const ui = {
  get: () => state,
  set(patch: Partial<UIState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  openNewTask(opts: Omit<UIState["newTask"], "open"> = {}) {
    ui.set({ newTask: { open: true, ...opts } });
  },
  openCapture(opts: Omit<UIState["capture"], "open"> = {}) {
    ui.set({ capture: { open: true, ...opts } });
  },
  toggleAgent(v?: boolean) {
    const next = v ?? !state.agent;
    ui.set({ agent: next });
    try {
      localStorage.setItem("cc.agent", next ? "1" : "0");
    } catch {}
  },
};

export function useUI<T>(sel: (s: UIState) => T): T {
  return useSyncExternalStore(ui.subscribe, () => sel(state), () => sel(state));
}
