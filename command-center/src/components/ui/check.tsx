"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Round animated checkbox. */
export function Check({
  checked,
  onChange,
  color = "var(--accent)",
  size = 22,
  className,
  label,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  color?: string;
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? "Mark not done" : "Mark done")}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={cn("relative grid shrink-0 place-items-center rounded-full transition active:scale-90", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full border-[1.5px] transition-colors"
        style={{ borderColor: checked ? color : "var(--line-2)", background: checked ? color : "transparent", boxShadow: checked ? `0 0 14px -2px ${color}` : undefined }}
      />
      <svg viewBox="0 0 24 24" className="relative" width={size * 0.62} height={size * 0.62}>
        <motion.path
          d="M5 12.5l4.2 4.2L19 7"
          fill="none"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        />
      </svg>
    </button>
  );
}
