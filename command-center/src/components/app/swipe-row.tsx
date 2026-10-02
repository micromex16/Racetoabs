"use client";
import * as React from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Check, Clock, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/confetti";

/** Phone gestures: swipe right = done, swipe left = snooze/park, long-press = delegate.
 *  On desktop the row is static (actions are buttons / hover menu). */
export function SwipeRow({
  children,
  onDone,
  onLeft,
  onLongPress,
  leftLabel = "Snooze",
  className,
  disabled,
}: {
  children: React.ReactNode;
  onDone?: () => void;
  onLeft?: () => void;
  onLongPress?: () => void;
  leftLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const x = useMotionValue(0);
  const [touch, setTouch] = React.useState(false);
  const pressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = React.useRef(false);
  React.useEffect(() => setTouch(window.matchMedia("(pointer: coarse)").matches), []);
  const doneOpacity = useTransform(x, [0, 90], [0, 1]);
  const leftOpacity = useTransform(x, [-90, 0], [1, 0]);
  const scale = useTransform(x, [-120, 0, 120], [1.1, 0.8, 1.1]);

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      {touch && !disabled && (
        <>
          <motion.div style={{ opacity: doneOpacity }} className="absolute inset-0 flex items-center rounded-2xl bg-good/90 pl-5 text-white">
            <motion.span style={{ scale }} className="flex items-center gap-2 text-sm font-semibold">
              <Check className="size-5" /> Done
            </motion.span>
          </motion.div>
          <motion.div style={{ opacity: leftOpacity }} className="absolute inset-0 flex items-center justify-end rounded-2xl bg-warn/90 pr-5 text-black">
            <motion.span style={{ scale }} className="flex items-center gap-2 text-sm font-semibold">
              {leftLabel} <Clock className="size-5" />
            </motion.span>
          </motion.div>
        </>
      )}
      <motion.div
        drag={touch && !disabled ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        style={{ x }}
        onPointerDown={() => {
          if (!touch || !onLongPress || disabled) return;
          moved.current = false;
          pressTimer.current = setTimeout(() => {
            if (!moved.current) {
              haptic(25);
              onLongPress();
            }
          }, 550);
        }}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        onDrag={(_, info) => {
          if (Math.abs(info.offset.x) > 8) {
            moved.current = true;
            clearPress();
          }
        }}
        onDragEnd={(_, info) => {
          if (info.offset.x > 100 && onDone) {
            haptic();
            animate(x, 500, { duration: 0.2 }).then(() => {
              onDone();
              x.set(0);
            });
          } else if (info.offset.x < -100 && onLeft) {
            haptic();
            animate(x, -500, { duration: 0.2 }).then(() => {
              onLeft();
              x.set(0);
            });
          }
        }}
        className="relative touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function GestureHint() {
  return (
    <p className="flex items-center justify-center gap-3 px-2 pt-1 text-[10px] text-muted lg:hidden">
      <span>→ done</span>
      <span>← snooze</span>
      <span className="flex items-center gap-1">
        <UserPlus className="size-3" /> hold = delegate
      </span>
    </p>
  );
}
