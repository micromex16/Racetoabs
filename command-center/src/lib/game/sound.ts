"use client";
// Tiny synthesized sound kit (no audio files). Respects the in-app sound switch.

let ctx: AudioContext | null = null;
let enabled = true;
let hapticsOn = true;

export function setSound(on: boolean, haptics: boolean) {
  enabled = on;
  hapticsOn = haptics;
}

function ac() {
  if (typeof window === "undefined" || !enabled) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.12) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

function buzz(pattern: number | number[]) {
  if (!hapticsOn) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

export const sfx = {
  coin() {
    tone(988, 0, 0.09, "square", 0.05);
    tone(1319, 0.07, 0.22, "square", 0.05);
    buzz(12);
  },
  bigCoin() {
    [988, 1319, 1568, 1976].forEach((f, i) => tone(f, i * 0.06, 0.18, "square", 0.045));
    buzz([12, 40, 12]);
  },
  fanfare() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.24, "triangle", 0.1));
    buzz([20, 60, 20, 60, 40]);
  },
  record() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.09, 0.3, "sawtooth", 0.04));
    tone(2093, 0.4, 0.6, "triangle", 0.08);
    buzz([30, 50, 30]);
  },
  build() {
    tone(110, 0, 0.18, "square", 0.12);
    tone(220, 0.05, 0.12, "triangle", 0.08);
    [1568, 2093].forEach((f, i) => tone(f, 0.18 + i * 0.07, 0.2, "sine", 0.06));
    buzz([25, 30, 10]);
  },
  tick() {
    tone(1800, 0, 0.03, "square", 0.02);
  },
  bell() {
    tone(1047, 0, 1.2, "sine", 0.15);
    tone(1568, 0.02, 1.0, "sine", 0.07);
    buzz([60, 80, 60]);
  },
  freeze() {
    [2093, 1760, 2349].forEach((f, i) => tone(f, i * 0.05, 0.25, "sine", 0.05));
  },
  nope() {
    tone(220, 0, 0.12, "square", 0.06);
    tone(180, 0.1, 0.16, "square", 0.06);
  },
};
