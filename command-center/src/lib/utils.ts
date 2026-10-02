import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const RING_COLORS = ["var(--r1)", "var(--r2)", "var(--r3)"] as const;
export const RING_CLASS = ["text-r1", "text-r2", "text-r3"] as const;

export function plural(n: number, w: string, p = w + "s") {
  return `${n} ${n === 1 ? w : p}`;
}
