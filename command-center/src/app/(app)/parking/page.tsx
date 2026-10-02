"use client";
import * as React from "react";
import { useQ, call } from "@/lib/client";
import { ParkingQuick } from "@/components/today/sections";
import { ParkingTriage } from "@/components/review/parking-triage";
import { SectionTitle, Skeleton, Empty } from "@/components/ui/misc";
import { ParkingSquare } from "lucide-react";

export default function ParkingPage() {
  const { data } = useQ("parking", { status: "ALL" });
  if (!data) return <Skeleton className="mx-auto h-64 max-w-3xl" />;
  const open = data.filter((p) => p.status === "OPEN");
  const scheduled = data.filter((p) => p.status === "SCHEDULED");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Parking Lot</h1>
        <p className="mt-1 text-sm text-fg-2">Ideas, worries, side-quests. Safe here. Triaged on Friday — promoted, scheduled, or deleted.</p>
      </div>
      <ParkingQuick count={open.length} />
      <section>
        <SectionTitle count={open.length}>Open</SectionTitle>
        {open.length ? <ParkingTriage items={open} /> : <Empty icon={<ParkingSquare />} title="Empty lot" hint="Capture anything with P, the mic, or the box above." />}
      </section>
      {scheduled.length > 0 && (
        <section>
          <SectionTitle count={scheduled.length}>Scheduled to resurface</SectionTitle>
          <div className="space-y-1.5">
            {scheduled.map((p) => (
              <div key={p.id} className="glass flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm">
                <span className="flex-1">{p.text}</span>
                <span className="text-xs text-muted">{p.scheduledFor?.slice(0, 10)}</span>
                <button className="text-xs text-muted hover:text-fg" onClick={() => call("parking.triage", { id: p.id, action: "reopen" })}>
                  reopen
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
