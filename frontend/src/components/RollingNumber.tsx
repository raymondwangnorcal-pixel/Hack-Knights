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
  digitWidth = "0.62em",
  cellHeight = "1.15em",
  cellLine,
  fraction,
  fractionMs = 1000,
  style,
}: {
  value: number | null;
  className?: string;
  /** Extra classes for commas, e.g. a different font in monospace numbers. */
  sepClassName?: string;
  /** How long one reel turn takes, in ms. */
  duration?: number;
  easing?: string;
  /** Width of each digit cell; condensed display fonts need less than the 0.62em default. */
  digitWidth?: string;
  /** Height of each digit window; set it close to the font's numeral height so neighbours never peek in mid-roll. */
  cellHeight?: string;
  /** Line height inside each window (defaults to cellHeight); lower it to lift a font that sits low. */
  cellLine?: string;
  /** 0–1 progress toward the next whole number. When set, the last digit creeps continuously
   *  instead of turning all at once, so the next number arrives at the end of a slow roll. */
  fraction?: number;
  /** How often `fraction` updates, in ms; the creep glides linearly over this long. */
  fractionMs?: number;
  style?: React.CSSProperties;
}) {
  if (value === null) return <span className={className} style={style}>—</span>;
  const text = value.toLocaleString("en-US");

  return (
    <span className={`inline-flex leading-none ${className}`} style={style} aria-label={text}>
      {text.split("").map((ch, i) => {
        // Key from the right so each reel keeps its place value as the number grows.
        const key = text.length - i;
        if (ch < "0" || ch > "9") {
          return (
            <span key={`s${key}`} aria-hidden="true" className={`inline-block ${sepClassName}`} style={{ height: cellHeight, lineHeight: cellLine ?? cellHeight }}>
              {ch}
            </span>
          );
        }
        return (
          <Reel
            key={`d${key}`}
            digit={ch.charCodeAt(0) - 48}
            duration={duration}
            easing={easing}
            width={digitWidth}
            height={cellHeight}
            line={cellLine ?? cellHeight}
            creep={key === 1 ? fraction : undefined}
            creepMs={fractionMs}
          />
        );
      })}
    </span>
  );
}

function Reel({
  digit,
  duration,
  easing,
  width,
  height,
  line,
  creep,
  creepMs,
}: {
  digit: number;
  duration: number;
  easing: string;
  width: string;
  height: string;
  line: string;
  creep?: number;
  creepMs: number;
}) {
  // pos is a slot on the 30-long reel; pos % 10 is the digit showing.
  const [pos, setPos] = useState(digit);
  const [animate, setAnimate] = useState(false);
  const [prevDigit, setPrevDigit] = useState(digit);
  // A creeping reel is always gliding; `snapped` pauses that glide for the one update after it
  // quietly jumps back a lap, so the jump itself is never animated.
  const [snapped, setSnapped] = useState(false);
  const [prevCreep, setPrevCreep] = useState(creep);
  if (creep !== prevCreep) {
    setPrevCreep(creep);
    if (snapped) setSnapped(false);
  }

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
    <span aria-hidden="true" className="relative inline-block overflow-hidden" style={{ width, height }}>
      <span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transform: `translateY(-${((pos + (creep ?? 0)) * 100) / REEL.length}%)`,
          transition:
            creep !== undefined
              ? snapped
                ? "none"
                : `transform ${creepMs}ms linear`
              : animate
                ? `transform ${duration}ms ${easing}`
                : "none",
        }}
        onTransitionEnd={() => {
          // Once settled, quietly move back to the first lap so the reel never runs out.
          if (pos >= 10) {
            setAnimate(false);
            if (creep !== undefined) setSnapped(true);
            setPos(pos % 10);
          }
        }}
      >
        {REEL.map((n, i) => (
          <span key={i} className="block text-center" style={{ height, lineHeight: line }}>
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}
