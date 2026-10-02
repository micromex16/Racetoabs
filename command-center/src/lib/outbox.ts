"use client";
// Offline outbox for Parking Lot captures: a thought captured in a dead zone
// is never lost. Flushed on reconnect and on app start.

const KEY = "cc.outbox.parking";

type Item = { text: string; source: string; at: number };

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
}

export function queueParking(text: string, source: string) {
  write([...read(), { text, source, at: Date.now() }]);
}

export function pendingCount() {
  return read().length;
}

export async function flushOutbox() {
  const items = read();
  if (!items.length || !navigator.onLine) return 0;
  const left: Item[] = [];
  for (const it of items) {
    try {
      const r = await fetch("/api/m/parking.add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: it.text, source: it.source }) });
      if (!r.ok) left.push(it);
    } catch {
      left.push(it);
    }
  }
  write(left);
  return items.length - left.length;
}
