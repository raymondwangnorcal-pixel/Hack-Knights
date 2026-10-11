"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RollingNumber } from "@/components/RollingNumber";
import { CASES_PER_SECOND, DEATHS_PER_SECOND } from "@/lib/burden";

// Small chevron in the top-right corner of the sticky bar. Pressing it sends a dark ripple out
// of the button, orange at its leading edge with two faint rings running ahead, until it fills
// the whole screen. Then the sentence fades in, centred, with the numbers huge:
// "In the time you've been watching this presentation, mosquito-borne illnesses have infected
// X people and claimed Y lives." A click anywhere, the chevron, or Escape draws the wave back
// into the button. X and Y count from page load (intro included) at the same global rates as
// the main counters.

const INK = "#ECE6DA";
const BG = "#13110F";
const ORANGE = "#F07636";
const RED = "#E0434A";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };
const BODY = { fontFamily: "'Roboto Condensed', var(--font-geist-sans), sans-serif" };
/** The sentence and the small words around the numbers share one size; the numbers dwarf them. */
const WORD_SIZE = "clamp(20px, 2.6vw, 38px)";
// Capped by height (laptops) and width (phones, where a 4-digit number plus its unit word must fit).
const NUMBER_SIZE = "clamp(56px, min(19vh, 21vw), 210px)";

/** How long the wave takes to fill the screen, and to draw back. */
const OPEN_MS = 1000;
const CLOSE_MS = 700;
const WAVE_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

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

type Origin = { x: number; y: number; r: number; size: number };

/** Render as a direct child of the fixed bar. `rowHeight` is the main row's current height,
 *  to centre the button in it. */
export function WatchingDropdown({ rowHeight }: { rowHeight: number }) {
  const secs = useWatchingSeconds();
  const btnRef = useRef<HTMLButtonElement>(null);
  // origin set: the overlay exists. expanded: the wave is out (or heading out).
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reduced, setReduced] = useState(false);
  const closeTimer = useRef(0);

  const open = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const x = b.left + b.width / 2;
    const y = b.top + b.height / 2;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Radius that reaches the farthest corner, plus room for the glowing edge to clear it.
    const r = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 120;
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    window.clearTimeout(closeTimer.current);
    setOrigin({ x, y, r, size: b.width });
    // Two frames later: start the transition from scale(0).
    requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
  }, []);

  const close = useCallback(() => {
    setExpanded(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOrigin(null), CLOSE_MS);
  }, []);

  // Escape closes; the page underneath doesn't scroll while the wave is up.
  useEffect(() => {
    if (!origin) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [origin, close]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const infected = secs === null ? null : Math.floor(secs * CASES_PER_SECOND);
  const deaths = secs === null ? null : Math.floor(secs * DEATHS_PER_SECOND);
  const isOpen = origin !== null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (isOpen ? close() : open())}
        aria-expanded={expanded}
        aria-controls="watching-wave"
        aria-label="Show what has happened while you've been watching"
        className="absolute right-3 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm border border-[#ECE6DA]/25 text-[#ECE6DA]/80 transition-colors hover:border-[#ECE6DA]/60 hover:text-[#ECE6DA] sm:right-4"
        style={{ top: `${rowHeight / 2}px` }}
      >
        <Chevron up={false} />
      </button>

      {origin &&
        createPortal(
          <Wave origin={origin} expanded={expanded} reduced={reduced} onClose={close} infected={infected} deaths={deaths} />,
          document.body,
        )}
    </>
  );
}

function Wave({
  origin,
  expanded,
  reduced,
  onClose,
  infected,
  deaths,
}: {
  origin: Origin;
  expanded: boolean;
  reduced: boolean;
  onClose: () => void;
  infected: number | null;
  deaths: number | null;
}) {
  const { x, y, r, size } = origin;
  const ms = expanded ? OPEN_MS : CLOSE_MS;
  // A circle 2r across, centred on the button, scaled from 0 to 1.
  const circle: React.CSSProperties = {
    position: "absolute",
    left: x - r,
    top: y - r,
    width: r * 2,
    height: r * 2,
    borderRadius: "9999px",
    transformOrigin: "center",
    willChange: "transform",
  };

  return (
    <div
      id="watching-wave"
      role="dialog"
      aria-modal="true"
      aria-label="Since you started watching"
      onClick={onClose}
      className="fixed inset-0 z-[60] cursor-pointer overflow-hidden"
      style={{ color: INK }}
    >
      {/* Two faint rings run ahead of the wave on the way out, fading as they go */}
      {!reduced &&
        [0, 1].map((i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              ...circle,
              border: `1.5px solid ${ORANGE}`,
              transform: `scale(${expanded ? 1 : 0})`,
              opacity: expanded ? 0 : 0.7 - i * 0.25,
              transition: expanded
                ? `transform ${700 + i * 120}ms cubic-bezier(0.25, 0.6, 0.3, 1), opacity ${700 + i * 120}ms ease-in`
                : "none",
              visibility: expanded ? "visible" : "hidden",
            }}
          />
        ))}

      {/* The wave: near-black fill with an orange leading edge */}
      <div
        aria-hidden="true"
        style={{
          ...circle,
          backgroundColor: BG,
          boxShadow: `inset 0 0 0 2px ${ORANGE}, inset 0 0 90px 12px rgba(240,118,54,0.28), 0 0 60px 6px rgba(240,118,54,0.25)`,
          transform: reduced ? "none" : `scale(${expanded ? 1 : 0})`,
          opacity: reduced ? (expanded ? 1 : 0) : 1,
          transition: reduced ? "opacity 250ms ease" : `transform ${ms}ms ${WAVE_EASE}`,
        }}
      />

      {/* Same chevron, flipped, sitting exactly over the bar's button: click to close */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="absolute flex items-center justify-center rounded-sm border border-[#ECE6DA]/40 text-[#ECE6DA] hover:border-[#ECE6DA]/80"
        style={{
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          opacity: expanded ? 1 : 0,
          transition: `opacity ${expanded ? 300 : 150}ms ease ${expanded ? OPEN_MS * 0.5 : 0}ms`,
        }}
      >
        <Chevron up />
      </button>

      {/* The sentence, centred, numbers huge */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center sm:px-12"
        style={{
          opacity: expanded ? 1 : 0,
          transform: expanded ? "translateY(0)" : "translateY(12px)",
          transition: expanded
            ? `opacity 500ms ease ${reduced ? 0 : OPEN_MS * 0.6}ms, transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1) ${reduced ? 0 : OPEN_MS * 0.6}ms`
            : "opacity 180ms ease, transform 180ms ease",
        }}
      >
        <p className="max-w-[30ch] leading-[1.25] opacity-80" style={{ ...BODY, fontSize: WORD_SIZE, fontWeight: 300 }}>
          In the time you’ve been watching this presentation, mosquito-borne illnesses have infected
        </p>

        <NumberLine tail="people">
          <BigNumber value={infected} color={ORANGE} duration={600} easing="cubic-bezier(0.2, 0.8, 0.2, 1)" />
        </NumberLine>

        <p className="tracking-[0.22em] uppercase opacity-70" style={{ ...TYPE, fontSize: "clamp(14px, 1.35vw, 19px)" }}>
          and claimed
        </p>

        <NumberLine tail={deaths === 1 ? "life." : "lives."}>
          <BigNumber value={deaths} color={RED} duration={1500} easing="cubic-bezier(0.45, 0, 0.25, 1.15)" />
        </NumberLine>

        <p className="absolute bottom-6 text-[11px] tracking-[0.2em] uppercase opacity-40" style={TYPE}>
          Click anywhere to close
        </p>
      </div>
    </div>
  );
}

/** A big number, centred on the page, with its unit word hanging off its right on the baseline
 *  (so the word never pushes the number off centre). */
function NumberLine({ tail, children }: { tail: string; children: React.ReactNode }) {
  return (
    <div className="relative my-[2.2vh] inline-flex">
      {children}
      <span
        className="absolute bottom-0 left-full ml-[0.45em] whitespace-nowrap leading-none opacity-85"
        style={{ ...BODY, fontSize: WORD_SIZE, paddingBottom: "0.08em" }}
      >
        {tail}
      </span>
    </div>
  );
}

function BigNumber({ value, color, duration, easing }: { value: number | null; color: string; duration: number; easing: string }) {
  return (
    <RollingNumber
      value={value}
      digitWidth="0.42em"
      cellHeight="0.84em"
      cellLine="1em"
      duration={duration}
      easing={easing}
      style={{ ...DISPLAY, color, fontSize: NUMBER_SIZE }}
    />
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ transform: up ? "rotate(180deg)" : "none" }}>
      <path d="M2.5 5 7 9.5 11.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
