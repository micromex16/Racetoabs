"use client";
import { useQ } from "@/lib/client";
import { ui } from "@/lib/ui-store";
import { RockHero } from "@/components/today/rock-hero";
import { PicksSection, DueSections, InboxPulse, ParkingQuick, StreakAndCadence, GameRow } from "@/components/today/sections";
import { GestureHint } from "@/components/app/swipe-row";
import { Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Moon, Rocket } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function TodayPage() {
  const { data: today, error } = useQ("today");
  if (error) return <p className="text-sm text-bad">{String(error.message)}</p>;
  if (!today) return <TodaySkeleton />;
  const dateLabel = new Date(today.today + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-xs text-muted">{dateLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting()}
            {today.settings.ownerName ? `, ${today.settings.ownerName}` : ""}.
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <div className="num text-lg font-semibold leading-none text-term">{today.daysToExit.toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted">days to exit-ready</div>
          </div>
          {today.needsLaunch ? (
            <Button size="sm" variant="primary" onClick={() => ui.set({ launch: true })}>
              <Rocket /> Launch
            </Button>
          ) : (
            <Button size="sm" variant={today.closeWindow ? "primary" : "secondary"} onClick={() => ui.set({ closeDay: true })}>
              <Moon /> {today.plan.closed ? "Day closed" : "Close the day"}
            </Button>
          )}
        </div>
      </div>

      <RockHero today={today} />
      <PicksSection today={today} />
      <DueSections today={today} />
      <GestureHint />
      <GameRow />
      <InboxPulse today={today} />
      <ParkingQuick count={today.parking.open} />
      <StreakAndCadence today={today} />
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-72 rounded-3xl" />
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  );
}
