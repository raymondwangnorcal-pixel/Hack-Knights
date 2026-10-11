"use client";

import { useEffect, useRef, useState } from "react";
import { RollingNumber } from "@/components/RollingNumber";
import { CASES_PER_SECOND, DEATHS_PER_SECOND } from "@/lib/burden";

// Small chevron in the top-right corner of the sticky bar. Opens a panel under the bar:
// "In the time you've been watching this presentation, mosquito-borne illnesses have infected
// X people and claimed Y lives." The clock starts when the page loads (intro included), and X and Y use the
// same global rates as the main counters.

const INK = "#ECE6DA";
const BG = "#13110F";
const ORANGE = "#F07636";
const RED = "#E0434A";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

/** Seconds since the page loaded (including the intro splash), refreshed every second. */
function useWatchingSeconds(): number | null {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setSecs(performance.now() / 1000);
    const first = setTimeout(update, 0);
    const id = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return secs;
}

export function WatchingDropdown({ rowHeight }: { rowHeight: number }) {
  const [open, setOpen] = useState(false);
  const secs = useWatchingSeconds();
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on Escape or a click anywhere outside the button and panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const infected = secs === null ? null : Math.floor(secs * CASES_PER_SECOND);
  const deaths = secs === null ? null : Math.floor(secs * DEATHS_PER_SECOND);

  return (
    <div ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="watching-panel"
        style={{ top: `${rowHeight / 2}px` }}
        aria-label={open ? "Hide what has happened while you've been watching" : "Show what has happened while you've been watching"}
        className="absolute right-3 z-10 flex h-8 w-8 -translate-y-1/2 items-center sm:right-4 justify-center rounded-sm border border-[#ECE6DA]/25 text-[#ECE6DA]/80 transition-colors hover:border-[#ECE6DA]/60 hover:text-[#ECE6DA]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          className="transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          <path d="M2.5 5 7 9.5 11.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Panel: hangs from the bottom edge of the bar, flush with the right side */}
      <div
        id="watching-panel"
        role="region"
        aria-label="Since you started watching"
        aria-hidden={!open}
        className="absolute top-full right-0 w-[min(480px,100vw)] origin-top-right border-b border-l border-[#ECE6DA]/20 transition-[opacity,transform] duration-300 ease-out"
        style={{
          backgroundColor: BG,
          color: INK,
          boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(-8px)",
          visibility: open ? "visible" : "hidden",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div className="px-7 pt-6 pb-7 sm:px-9">
          <p className="text-[12px] leading-relaxed tracking-[0.12em] uppercase opacity-75" style={TYPE}>
            In the time you’ve been watching this presentation, mosquito-borne illnesses have
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <Line lead="infected" tail="people">
              <RollingNumber
                value={infected}
                digitWidth="0.42em"
                cellHeight="0.84em"
                cellLine="1em"
                duration={600}
                easing="cubic-bezier(0.2, 0.8, 0.2, 1)"
                style={{ ...DISPLAY, color: ORANGE }}
              />
            </Line>
            <Line lead="and claimed" tail="lives">
              <RollingNumber
                value={deaths}
                digitWidth="0.42em"
                cellHeight="0.84em"
                cellLine="1em"
                duration={1500}
                easing="cubic-bezier(0.45, 0, 0.25, 1.15)"
                style={{ ...DISPLAY, color: RED }}
              />
            </Line>
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ lead, tail, children }: { lead: string; tail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[6.5rem] shrink-0 text-[12px] tracking-[0.12em] uppercase opacity-75" style={TYPE}>
        {lead}
      </span>
      <span className="text-[72px] leading-none" style={DISPLAY}>
        {children}
      </span>
      <span className="text-[12px] tracking-[0.12em] uppercase opacity-75" style={TYPE}>
        {tail}
      </span>
    </div>
  );
}
