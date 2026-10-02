"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Centered modal on desktop, bottom sheet on phones (thumb-reachable). */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  wide,
  footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <D.Content
          className={cn(
            "dialog-content fixed z-50 flex max-h-[92dvh] flex-col overflow-hidden border border-line-2 bg-panel-solid/95 shadow-2xl backdrop-blur-2xl outline-none",
            "inset-x-0 bottom-0 rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[12vh] sm:w-[92vw] sm:-translate-x-1/2 sm:rounded-2xl sm:pb-0",
            wide ? "sm:max-w-3xl" : "sm:max-w-lg",
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-2 sm:hidden" />
          {(title || description) && (
            <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-4">
              <div>
                {title && <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>}
                {description && <D.Description className="mt-0.5 text-sm text-fg-2">{description}</D.Description>}
              </div>
              <D.Close className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-fg" aria-label="Close">
                <X className="size-4" />
              </D.Close>
            </div>
          )}
          {!title && <D.Title className="sr-only">Dialog</D.Title>}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
