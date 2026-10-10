"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RollingNumber } from "@/components/RollingNumber";

// The intro's masthead, pinned to the top of the window. As the first screen scrolls away the
// bar shrinks, its tabs fade out (gone until you scroll back to the top), and the two live
// counters grow in on the right: "229,820,755 INFECTED since Jan 1st | 542,716 DEAD since Jan 1st".
// On phones the counters take a second slim row instead.

const INK = "#ECE6DA";
const BG = "#13110F";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

/** Height the intro must reserve for the bar at the very top, per breakpoint. */
export const BAR_SPACER = "h-[64px] md:h-[86px]";

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
      const span = Math.max(1, bottom - 64);
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

export function StickyBar({
  trackId,
  counters,
  onPick,
}: {
  trackId: string;
  counters: [Counter, Counter];
  onPick: (side: "you" | "prevention") => void;
}) {
  const p = useScrollProgress(trackId);

  const tabs = 1 - ramp(p, 0, 0.2); // tabs fade out fast…
  const tabsGone = p > 0.02; // …and stay gone until the very top
  const stats = ramp(p, 0.25, 0.6); // counters grow in
  const words = ramp(p, 0.85, 1); // "INFECTED / DEAD · since Jan 1st" arrive at the end

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
        className="relative flex items-center gap-5 px-6 sm:px-10"
        style={{ height: `${lerp(86, 64, p)}px` }}
      >
        <span className="leading-none tracking-wide" style={{ ...DISPLAY, fontSize: `${lerp(60, 42, p)}px` }}>
          Mozzy
        </span>
        <span className="hidden w-px bg-[#ECE6DA]/40 sm:block" style={{ height: `${lerp(40, 30, p)}px` }} />
        {/* One line. Below 1280px wide it fades out as the counters arrive, so they never collide. */}
        <span
          className="hidden whitespace-nowrap uppercase tracking-[0.16em] sm:block max-xl:opacity-[var(--tag)]"
          style={{ ...TYPE, fontSize: `${lerp(16, 13, p)}px`, ["--tag" as string]: String(1 - stats) }}
        >
          Detect locally. Prevent globally.
        </span>

        {/* Counters: right-aligned, vertically centred */}
        <div
          className="ml-auto hidden items-center gap-7 md:flex"
          style={{
            opacity: stats,
            transform: `scale(${lerp(0.8, 1, stats)})`,
            transformOrigin: "right center",
            visibility: stats > 0 ? "visible" : "hidden",
          }}
          aria-hidden={stats === 0}
        >
          {counters.map((c, i) => (
            <div key={c.word} className="flex items-center gap-7">
              {i > 0 && <span className="h-9 w-px bg-[#ECE6DA]/25" />}
              <Stat c={c} words={words} />
            </div>
          ))}
        </div>

        {/* Tabs: only at the very top */}
        <nav
          className="absolute top-1/2 right-6 flex -translate-y-1/2 items-center gap-2 text-sm sm:right-10 sm:gap-6"
          style={{ ...DISPLAY, opacity: tabs, visibility: tabsGone ? "hidden" : "visible" }}
          aria-hidden={tabsGone}
        >
          <button onClick={() => onPick("you")} className="hidden px-2 py-1 text-lg tracking-wider whitespace-nowrap hover:underline sm:block">
            For you
          </button>
          <button onClick={() => onPick("prevention")} className="hidden px-2 py-1 text-lg tracking-wider whitespace-nowrap hover:underline sm:block">
            For prevention
          </button>
          <Link
            href="/listen"
            className="ml-1 rounded-sm px-5 py-2.5 text-lg tracking-wider whitespace-nowrap text-[#13110F] transition-opacity hover:opacity-85"
            style={{ backgroundColor: INK }}
          >
            Start listening
          </Link>
        </nav>
      </div>

      {/* Phones: counters on a second slim row */}
      <div
        className="flex items-center justify-between gap-3 overflow-hidden px-6 md:hidden"
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
    <span className="flex items-center gap-2.5 text-[42px] leading-none" style={DISPLAY}>
      <BarNumber c={c} />
      {/* Same size as the number; arrives as the shrink finishes. Takes no width until then,
          so the numbers stay right-aligned all the way through the scroll. */}
      <span
        className="flex items-center gap-2.5 overflow-hidden whitespace-nowrap"
        style={{ maxWidth: `${words * 240}px`, opacity: words }}
      >
        <span className="tracking-wide">{c.word}</span>
        <span className="flex flex-col text-[13px] leading-[1.05] tracking-[0.1em] opacity-75">
          <span>Since</span>
          <span>Jan 1st</span>
        </span>
      </span>
    </span>
  );
}
