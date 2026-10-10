"use client";

import { useState } from "react";

// Slot-machine number: each digit is a reel that only ever turns forward, so 9 → 0 rolls on
// to the next 0 instead of spinning back through 8…1. Commas stay put.
//
// `duration` and `easing` set how each reel turns: short and smooth for a fast counter,
// long with a slight overshoot for a slow, slot-machine settle.

const REEL = Array.from({ length: 30 }, (_, i) => i % 10); // three laps of 0–9

export function RollingNumber({
  value,
  className = "",
  sepClassName = "",
  duration = 500,
  easing = "cubic-bezier(0.2, 0.8, 0.2, 1)",
}: {
  value: number | null;
  className?: string;
  /** Extra classes for commas, e.g. a different font in monospace numbers. */
  sepClassName?: string;
  /** How long one reel turn takes, in ms. */
  duration?: number;
  easing?: string;
}) {
  if (value === null) return <span className={className}>—</span>;
  const text = value.toLocaleString("en-US");

  return (
    <span className={`inline-flex overflow-hidden leading-none ${className}`} aria-label={text}>
      {text.split("").map((ch, i) => {
        // Key from the right so each reel keeps its place value as the number grows.
        const key = text.length - i;
        if (ch < "0" || ch > "9") {
          return (
            <span key={`s${key}`} aria-hidden="true" className={`inline-block h-[1.15em] leading-[1.15em] ${sepClassName}`}>
              {ch}
            </span>
          );
        }
        return <Reel key={`d${key}`} digit={ch.charCodeAt(0) - 48} duration={duration} easing={easing} />;
      })}
    </span>
  );
}

function Reel({ digit, duration, easing }: { digit: number; duration: number; easing: string }) {
  // pos is a slot on the 30-long reel; pos % 10 is the digit showing.
  const [pos, setPos] = useState(digit);
  const [animate, setAnimate] = useState(false);
  const [prevDigit, setPrevDigit] = useState(digit);

  // Adjust state while rendering when the digit changes (no effect needed).
  if (digit !== prevDigit) {
    setPrevDigit(digit);
    const forward = pos + ((digit - (pos % 10) + 10) % 10);
    if (forward < REEL.length) {
      setPos(forward);
      setAnimate(true);
    } else {
      // Out of reel (many turns queued up without settling): jump without animating.
      setPos(digit);
      setAnimate(false);
    }
  }

  return (
    <span aria-hidden="true" className="relative inline-block h-[1.15em] w-[0.62em] overflow-hidden">
      <span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transform: `translateY(-${(pos * 100) / REEL.length}%)`,
          transition: animate ? `transform ${duration}ms ${easing}` : "none",
        }}
        onTransitionEnd={() => {
          // Once settled, quietly move back to the first lap so the reel never runs out.
          if (pos >= 10) {
            setAnimate(false);
            setPos(pos % 10);
          }
        }}
      >
        {REEL.map((n, i) => (
          <span key={i} className="block h-[1.15em] text-center leading-[1.15em]">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}
