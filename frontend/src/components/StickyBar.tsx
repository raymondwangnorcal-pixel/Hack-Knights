"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RollingNumber } from "@/components/RollingNumber";
import { WatchingDropdown } from "@/components/WatchingDropdown";

// The intro's masthead, pinned to the top of the window. As the first screen scrolls away the
// bar shrinks, its tabs fade out (gone until you scroll back to the top), and the two live
// counters grow in on the right: "229,820,755 INFECTED since Jan 1st | 542,716 DEAD since Jan 1st".
// On phones the counters take a second slim row instead.

const INK = "#ECE6DA";
const BG = "#13110F";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

/** Height the intro must reserve for the bar at the very top. */
export const BAR_SPACER = "h-[64px]";
/** Bar height once the first screen has scrolled away. */
const BAR_SHRUNK = 52;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
/** 0 → 1 as `p` runs from `a` to `b`. */
const ramp = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Scroll progress: 0 at the top of the page, 1 the moment the bottom of the element with this
 *  id has slid up behind the bar (i.e. the big counters are out of view). */
function useScrollProgress(targetId: string): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = document.getElementById(targetId);
      const bottom = el ? el.getBoundingClientRect().bottom + window.scrollY : window.innerHeight;
      const span = Math.max(1, bottom - BAR_SHRUNK);
      setP(clamp(window.scrollY / span));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [targetId]);
  return p;
}

type Counter = {
  value: number | null;
  word: string;
  color: string;
  fraction?: number;
  roll: { duration: number; easing: string };
};

type Side = "you" | "prevention";

export function StickyBar({
  trackId,
  counters,
  onPick,
  onSponsors,
  side,
  onSide,
}: {
  trackId: string;
  counters: [Counter, Counter];
  onPick: (side: Side) => void;
  /** The Sponsors tab: jump to the sponsors section under "For prevention". */
  onSponsors: () => void;
  /** Which side the page below is showing; drives the header toggle once you scroll. */
  side: Side;
  onSide: (side: Side) => void;
}) {
  const p = useScrollProgress(trackId);

  const tabs = 1 - ramp(p, 0, 0.2); // tabs fade out fast…
  const tabsGone = p > 0.02; // …and stay gone until the very top
  // The whole counter group (numbers, words and "since Jan 1st") reveals as one motion,
  // eased so it starts gently and settles as the big counters leave view.
  const t = ramp(p, 0.2, 1);
  const stats = t * t * (3 - 2 * t); // smoothstep
  const words = stats;
  const rowHeight = lerp(64, BAR_SHRUNK, p);

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 border-b border-[#ECE6DA]/20"
      style={{
        backgroundColor: BG,
        color: INK,
        boxShadow: p > 0.02 ? "0 8px 24px rgba(0,0,0,0.35)" : "none",
      }}
    >
      {/* Main row */}
      <div
        className="relative flex items-center gap-5 pr-14 pl-6 sm:pr-16 sm:pl-10"
        style={{
          height: `${rowHeight}px`,
          ["--tag" as string]: String(1 - stats),
          ["--tagw" as string]: `${Math.round((1 - stats) * 420)}px`,
        }}
      >
        <span className="leading-none tracking-wide" style={{ ...DISPLAY, fontSize: `${lerp(44, 34, p)}px` }}>
          Culicid
        </span>
        <span className="hidden w-px bg-[#ECE6DA]/40 sm:block max-[1439px]:opacity-[var(--tag)]" style={{ height: `${lerp(30, 24, p)}px` }} />
        {/* The tagline stays on wide screens. Below 1440px there isn't room for it, a centred toggle
            and both counters, so it fades and collapses as the toggle arrives. */}
        <span
          className="hidden overflow-hidden whitespace-nowrap uppercase tracking-[0.16em] sm:block max-[1439px]:max-w-[var(--tagw)] max-[1439px]:opacity-[var(--tag)]"
          style={{
            ...TYPE,
            fontSize: `${lerp(15, 12.5, p)}px`,
          }}
        >
          Detect locally. Prevent globally.
        </span>
        {/* Toggle: centred on the screen; from 1024 to 1440px (counters take over half the bar)
            it centres in the gap between the wordmark and the counters instead. */}
        <div className="pointer-events-none hidden items-center justify-center sm:absolute sm:inset-0 sm:flex lg:max-[1439px]:static lg:max-[1439px]:flex-1">
          <SideToggle side={side} onSide={onSide} reveal={stats} />
        </div>
        {/* Phones: the toggle takes the right side once the top tabs are gone */}
        <SideToggle side={side} onSide={onSide} reveal={stats} className="ml-auto sm:hidden" small />

        {/* Counters: right-aligned, vertically centred */}
        <div
          className="ml-auto hidden items-center gap-6 lg:flex"
          style={{
            opacity: stats,
            transform: `scale(${lerp(0.8, 1, stats)})`,
            transformOrigin: "right center",
            visibility: stats > 0 ? "visible" : "hidden",
          }}
          aria-hidden={stats === 0}
        >
          {counters.map((c, i) => (
            <div key={c.word} className="flex items-center gap-6">
              {i > 0 && <span className="h-7 w-px bg-[#ECE6DA]/25" />}
              <Stat c={c} words={words} />
            </div>
          ))}
        </div>

        {/* Tabs: only at the very top */}
        <nav
          className="absolute top-1/2 right-14 flex -translate-y-1/2 items-center gap-2 text-sm sm:right-16 sm:gap-6"
          style={{ ...DISPLAY, opacity: tabs, visibility: tabsGone ? "hidden" : "visible" }}
          aria-hidden={tabsGone}
        >
          <button onClick={() => onPick("you")} className="hidden px-2 py-1 text-base tracking-wider whitespace-nowrap hover:underline sm:block">
            For you
          </button>
          <button onClick={() => onPick("prevention")} className="hidden px-2 py-1 text-base tracking-wider whitespace-nowrap hover:underline sm:block">
            For prevention
          </button>
          <button onClick={onSponsors} className="hidden px-2 py-1 text-base tracking-wider whitespace-nowrap hover:underline sm:block">
            Sponsors
          </button>
          {/* How Culicid was built: data, audio model, training, forecasts, databases and the Model API. */}
          <Link href="/how-it-works" className="hidden px-2 py-1 text-base tracking-wider whitespace-nowrap hover:underline sm:block">
            How it works
          </Link>
          <button
            onClick={() => onPick("you")}
            className="ml-1 rounded-sm px-4 py-1.5 text-base tracking-wider whitespace-nowrap text-[#13110F] transition-opacity hover:opacity-85"
            style={{ backgroundColor: INK }}
          >
            Start listening
          </button>
        </nav>
      </div>

      {/* Top-right corner: "while you've been watching" dropdown */}
      <WatchingDropdown rowHeight={rowHeight} />

      {/* Below 1024px: counters on a second slim row */}
      <div
        className="flex items-center justify-between gap-3 overflow-hidden px-6 lg:hidden"
        style={{ height: `${lerp(0, 34, stats)}px`, opacity: stats }}
        aria-hidden={stats === 0}
      >
        {counters.map((c) => (
          <span key={c.word} className="flex items-center gap-1.5 text-[22px] leading-none" style={DISPLAY}>
            <BarNumber c={c} />
            <span style={{ opacity: words }}>{c.word}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SideToggle({
  side,
  onSide,
  reveal,
  className,
  small,
}: {
  side: Side;
  onSide: (s: Side) => void;
  /** 0 → hidden, 1 → fully shown; follows the counters' reveal. */
  reveal: number;
  className?: string;
  small?: boolean;
}) {
  const shown = reveal > 0.05;
  return (
    <div
      role="tablist"
      aria-label="Who is Culicid for?"
      aria-hidden={!shown}
      className={`flex whitespace-nowrap rounded-full border border-[#ECE6DA]/25 p-[3px] ${className ?? ""}`}
      style={{
        ...DISPLAY,
        opacity: reveal,
        transform: `scale(${lerp(0.92, 1, reveal)})`,
        transformOrigin: "center",
        visibility: shown ? "visible" : "hidden",
        pointerEvents: reveal > 0.5 ? "auto" : "none",
      }}
    >
      {(["you", "prevention"] as Side[]).map((s) => {
        const active = side === s;
        return (
          <button
            key={s}
            role="tab"
            aria-selected={active}
            tabIndex={shown ? 0 : -1}
            onClick={() => onSide(s)}
            className={`rounded-full uppercase tracking-wider transition-colors duration-300 ${
              small ? "px-3 py-0.5 text-[14px]" : "px-5 py-1 text-[16px]"
            } ${active ? "bg-[#ECE6DA] text-[#13110F]" : "text-[#ECE6DA]/80 hover:text-[#ECE6DA]"}`}
          >
            {s === "you" ? "For you" : "For prevention"}
          </button>
        );
      })}
    </div>
  );
}

function BarNumber({ c }: { c: Counter }) {
  return (
    <RollingNumber
      value={c.value}
      digitWidth="0.42em"
      cellHeight="0.84em"
      cellLine="1em"
      duration={c.roll.duration}
      easing={c.roll.easing}
      fraction={c.fraction}
      style={{ ...DISPLAY, color: c.color }}
    />
  );
}

function Stat({ c, words }: { c: Counter; words: number }) {
  return (
    <span className="flex items-center gap-2 text-[32px] leading-none" style={DISPLAY}>
      <BarNumber c={c} />
      {/* Same size as the number; arrives as the shrink finishes. Takes no width until then,
          so the numbers stay right-aligned all the way through the scroll. */}
      <span
        className="flex items-center gap-2.5 overflow-hidden whitespace-nowrap"
        style={{ maxWidth: `${words * 190}px`, opacity: words }}
      >
        <span className="tracking-wide">{c.word}</span>
        <span className="flex flex-col text-[11px] leading-[1.05] tracking-[0.1em] opacity-75">
          <span>Since</span>
          <span>Jan 1st</span>
        </span>
      </span>
    </span>
  );
}
