"use client";
import confetti from "canvas-confetti";

export function celebrate(kind: "small" | "big" = "small") {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#e5326c", "#55a016", "#1f8fc0", "#7c8cff", "#ffb020"];
  if (kind === "small") {
    confetti({ particleCount: 70, spread: 70, startVelocity: 35, origin: { y: 0.7 }, colors, scalar: 0.9, ticks: 160 });
    return;
  }
  const end = Date.now() + 900;
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors });
    confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}
