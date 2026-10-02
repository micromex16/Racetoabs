"use client";
import * as React from "react";
import { DropdownMenu } from "radix-ui";
import { MoreHorizontal, Clock, ParkingSquare, UserPlus, Trash2, CalendarPlus } from "lucide-react";
import { Check } from "@/components/ui/check";
import { SwipeRow } from "@/components/app/swipe-row";
import { cn } from "@/lib/utils";

export type RowAction = { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean };

export function ItemRow({
  title,
  meta,
  reason,
  done,
  onToggle,
  onLeft,
  leftLabel,
  onLongPress,
  actions = [],
  accent,
  icon,
  overdue,
  className,
  onClick,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  reason?: React.ReactNode;
  done?: boolean;
  onToggle?: (v: boolean) => void;
  onLeft?: () => void;
  leftLabel?: string;
  onLongPress?: () => void;
  actions?: RowAction[];
  accent?: string;
  icon?: React.ReactNode;
  overdue?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <SwipeRow onDone={onToggle && !done ? () => onToggle(true) : undefined} onLeft={onLeft} leftLabel={leftLabel} onLongPress={onLongPress}>
      <div
        onClick={onClick}
        className={cn(
          "group glass flex items-start gap-3 rounded-2xl px-3.5 py-3 transition hover:border-line-2",
          overdue && "border-bad/30 bg-bad/[0.06]",
          onClick && "cursor-pointer",
          className,
        )}
      >
        {onToggle ? <Check checked={!!done} onChange={onToggle} color={accent ?? "var(--good)"} className="mt-0.5" /> : icon}
        <div className="min-w-0 flex-1">
          <p data-done={!!done} className="strike-anim text-[15px] font-medium leading-snug text-fg sm:text-sm">
            {title}
          </p>
          {meta && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">{meta}</div>}
          {reason && <p className="mt-1.5 line-clamp-2 text-xs italic leading-relaxed text-fg-2 sm:line-clamp-none">{reason}</p>}
        </div>
        {actions.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button onClick={(e) => e.stopPropagation()} className="rounded-lg p-1 text-muted opacity-100 transition hover:bg-panel-2 hover:text-fg lg:opacity-0 lg:group-hover:opacity-100 data-[state=open]:opacity-100" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-xl border border-line-2 bg-panel-solid p-1 shadow-xl">
                {actions.map((a) => (
                  <DropdownMenu.Item
                    key={a.label}
                    onSelect={a.onSelect}
                    className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-panel-2 [&_svg]:size-4", a.danger ? "text-bad" : "text-fg-2 data-[highlighted]:text-fg")}
                  >
                    {a.icon}
                    {a.label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </SwipeRow>
  );
}

export const ACTION_ICONS = { Clock, ParkingSquare, UserPlus, Trash2, CalendarPlus };
