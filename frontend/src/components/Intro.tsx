"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { RollingNumber } from "@/components/RollingNumber";
import { useYearClock } from "@/lib/useYearClock";
import { CASES_PER_SECOND, DISEASES, SECONDS_PER_DEATH, SECONDS_PER_YEAR } from "@/lib/burden";
import { IntroMap } from "@/components/IntroMap";
import { GlowGrid } from "@/components/GlowGrid";
import { BAR_SPACER, StickyBar } from "@/components/StickyBar";

// Full-screen intro: a printed-poster take on the counters. Two live totals since Jan 1,
// each over a dot-matrix world map shaded where mosquito-borne disease concentrates.
// Its own palette (warm near-black ground, paper-coloured ink, orange, red), separate from the
// Vercel-style app below.

export type IntroSide = "you" | "prevention";

const INK = "#ECE6DA"; // paper-coloured text on the dark ground
const ORANGE = "#F07636";
const RED = "#E0434A";
const GLOW: [string, string] = [ORANGE, RED];
const INFECTED_ROLL = { duration: 600, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
// Death digits that carry over (…9 → …0) turn with a slow, settling roll; the last digit creeps.
const DEATH_ROLL = { duration: 1500, easing: "cubic-bezier(0.45, 0, 0.25, 1.15)" };
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

// Fine paper grain, drawn by an SVG noise filter.
const PAPER =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.95 0 0 0 0 0.9 0 0 0 0 0.8 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/**
 * Running total since Jan 1 that jumps by a random 6–14 people each second. Each jump is nudged
 * toward the true estimate (≈ 9.4 a second), so the count looks alive but never drifts from it.
 */
function useJitteredCount(annual: number): number | null {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    const truth = () => {
      const now = new Date();
      const secs = (now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 1000;
      return Math.floor((secs / SECONDS_PER_YEAR) * annual);
    };
    const tick = () =>
      setShown((prev) => {
        if (prev === null) return truth();
        const noise = Math.floor(Math.random() * 7) - 3; // -3 … +3
        const step = Math.min(14, Math.max(6, truth() - prev + noise));
        return prev + step;
      });
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [annual]);
  return shown;
}

export function Intro({
  onPick,
  onSponsors,
  side,
  onSide,
}: {
  onPick: (side: IntroSide) => void;
  onSponsors: () => void;
  side: IntroSide;
  onSide: (side: IntroSide) => void;
}) {
  const clock = useYearClock(1000);
  const perYear = (annual: number, c: typeof clock) =>
    c === null ? null : Math.floor((c.secs / SECONDS_PER_YEAR) * annual);
  const cases = DISEASES.reduce((s, d) => s + d.cases, 0);
  const infected = useJitteredCount(cases);
  const deaths = DISEASES.reduce((s, d) => s + d.deaths, 0);
  const deathFraction = clock === null ? undefined : ((clock.secs / SECONDS_PER_YEAR) * deaths) % 1;

  return (
    <section
      aria-label="Mozzy: mosquito-borne disease this year"
      className="relative flex flex-col"
      style={{ backgroundColor: "#13110F", backgroundImage: PAPER, color: INK }}
    >
      <GlowGrid colors={GLOW} />
      <StickyBar
        trackId="intro-big-number"
        onPick={onPick}
        onSponsors={onSponsors}
        side={side}
        onSide={onSide}
        counters={[
          { value: infected, word: "Infected", color: ORANGE, roll: INFECTED_ROLL },
          { value: perYear(deaths, clock), word: "Dead", color: RED, fraction: deathFraction, roll: DEATH_ROLL },
        ]}
      />
      {/* First screen: exactly one window tall on desktop, so the photo strip sits on the bottom edge */}
      <div id="intro-first-screen" className="flex flex-col md:h-[100svh] md:min-h-[640px]">
      {/* Masthead lives in the pinned bar; this keeps its space at the top */}
      <div className={BAR_SPACER} aria-hidden="true" />

      {/* Two counters */}
      <div data-glow-zone className="relative z-10 grid flex-1 md:min-h-0 md:grid-cols-2 md:divide-x md:divide-[#ECE6DA]/20">
        <Panel
          accent={ORANGE}
          word="Infected"
          value={infected}
          roll={INFECTED_ROLL}
          rate={
            <>
              <Num color={ORANGE}>+{CASES_PER_SECOND.toFixed(1)}</Num> every second
            </>
          }
        />
        <Panel
          accent={RED}
          word="Died"
          value={perYear(deaths, clock)}
          // The last digit creeps through the whole ~45 s gap, so each death arrives as the end of a slow roll.
          fraction={deathFraction}
          roll={DEATH_ROLL}
          rate={
            <>
              About <Num color={RED}>1</Num> every <Num color={RED}>{Math.round(SECONDS_PER_DEATH)}</Num> sec
            </>
          }
        />
        <Sources />
        {/* Nudge toward the listening screen: a slow, small bob (still for reduce-motion) */}
        <button
          onClick={() => onPick("you")}
          aria-label="Scroll down to start listening"
          className="bob-arrow absolute bottom-4 left-1/2 z-20 hidden h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-[#ECE6DA]/30 bg-[#13110F] transition-colors hover:border-[#ECE6DA]/80 md:flex"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v15M5.5 12.5 12 19l6.5-6.5" />
          </svg>
        </button>
      </div>

      <Collage />
      </div>

    </section>
  );
}

function Panel({
  accent,
  word,
  value,
  roll,
  fraction,
  rate,
}: {
  accent: string;
  word: string;
  value: number | null;
  roll: { duration: number; easing: string };
  fraction?: number;
  rate: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center border-b border-[#ECE6DA]/20 px-6 pt-6 pb-4 md:min-h-0 md:border-b-0 sm:px-8">
      <h2 className="text-3xl tracking-wide sm:text-4xl" style={DISPLAY}>
        <span style={{ color: accent }}>{word}</span> since Jan 1
      </h2>
      <RollingNumber
        value={value}
        id={word === "Infected" ? "intro-big-number" : undefined}
        className="mt-3 mb-2 text-[clamp(4.5rem,8.5vw,9rem)]"
        sepClassName=""
        digitWidth="0.42em"
        cellHeight="0.84em"
        cellLine="1em"
        duration={roll.duration}
        easing={roll.easing}
        fraction={fraction}
        style={{ ...DISPLAY, color: accent }}
      />
      <p className="text-2xl uppercase tracking-wider sm:text-3xl" style={DISPLAY}>
        {rate}
      </p>

      {/* The map takes whatever height is left, sized to fit both ways (a size container) */}
      <div className="flex w-full flex-1 items-center justify-center md:min-h-0 md:[container-type:size]">
        <IntroMap
          mode={word === "Died" ? "killed" : "infected"}
          accent={accent}
          label={`World map shaded where mosquito-borne disease ${word === "Died" ? "deaths" : "infections"} concentrate; hover a region for details`}
        />
      </div>

    </div>
  );
}

// Where the counters and maps come from. Shown on hover, focus or tap so judges can check.
const SOURCES =
  "Since Jan 1 (UTC) · WHO and ECDC yearly estimates spread evenly over the year · Zika, West Nile and lymphatic filariasis excluded, so these are a floor · map regions are broad groupings; hover figures from WHO and ECDC, 2024 · death bands are Mozzy estimates";

function Sources() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div
      ref={box}
      className="z-20 max-md:relative max-md:mr-6 max-md:mb-3 max-md:justify-self-end md:absolute md:left-6 md:bottom-3"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-describedby="intro-sources"
        className="flex items-center gap-1.5 text-[11px] tracking-[0.14em] uppercase opacity-60 transition-opacity hover:opacity-100"
        style={TYPE}
      >
        <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] normal-case">
          i
        </span>
        Sources
      </button>
      <p
        id="intro-sources"
        role="tooltip"
        className={`absolute right-0 bottom-full mb-2 w-[min(420px,calc(100vw-2rem))] md:right-auto md:left-0 border border-[#ECE6DA]/25 bg-[#13110F] p-3 text-[10.5px] leading-relaxed tracking-[0.06em] uppercase shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-opacity ${
          open ? "opacity-95" : "pointer-events-none opacity-0"
        }`}
        style={TYPE}
      >
        {SOURCES}
      </p>
    </div>
  );
}

function Num({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="text-[1.35em] leading-none" style={{ color }}>
      {children}
    </span>
  );
}

// The people behind the numbers: a strip of photos that scrolls forever. Every photo keeps its
// full frame (width follows its aspect ratio at a fixed height), the list is drawn twice so the
// loop is seamless, it pauses on hover, and it holds still for people who turn off motion.
type Photo = { src: string; alt: string; ar: number };

const PHOTOS: Photo[] = [
  { src: "/intro/zika-infant-full.jpg", alt: "An infant with microcephaly held by her mother", ar: 1.777 },
  { src: "/intro/ventilated-woman-full.jpg", alt: "A woman on a ventilator in intensive care", ar: 1.778 },
  { src: "/intro/red-eyes-full.jpg", alt: "A boy with bleeding in the whites of both eyes", ar: 1.345 },
  { src: "/intro/bed-net-girl-full.jpg", alt: "A girl asleep on a hospital cot under a mosquito net", ar: 1.5 },
  { src: "/intro/jaundice-full.jpg", alt: "A man with jaundice and bruising in a hospital bed", ar: 1.501 },
  { src: "/intro/bandaged-child-full.jpg", alt: "A small child with a bandaged head held by his mother", ar: 1.389 },
  { src: "/intro/rash-torso-full.jpg", alt: "A rash covering a man's chest and arm", ar: 0.852 },
  { src: "/intro/icu-teen-full.jpg", alt: "A teenage boy in intensive care with a central line and monitor leads", ar: 0.75 },
  { src: "/intro/child-oxygen-full.jpg", alt: "A young child on oxygen in a hospital bed", ar: 1.779 },
  { src: "/intro/crying-child-full.jpg", alt: "A crying child covered in dust", ar: 1.504 },
  { src: "/intro/rash-face-full.jpg", alt: "A rash across a young woman's face and neck", ar: 1.777 },
  { src: "/intro/ventilated-man-full.jpg", alt: "A man on a ventilator in a hospital bed", ar: 1.499 },
];

function Collage() {
  return (
    <section aria-label="People affected by mosquito-borne disease" className="relative z-10 border-t border-[#ECE6DA]/20">
      <div
        className="photo-reel overflow-hidden"
        style={{ maskImage: "linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)" }}
      >
        <div className="photo-reel-track flex w-max">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex gap-1.5 pr-1.5" aria-hidden={copy === 1}>
              {PHOTOS.map((p) => (
                <figure
                  key={p.src}
                  className="relative h-[128px] flex-none overflow-hidden md:h-[clamp(128px,19.5svh,195px)]"
                  style={{ aspectRatio: p.ar }}
                >
                  <Image
                    src={p.src}
                    alt={copy === 0 ? p.alt : ""}
                    fill
                    loading="eager"
                    sizes="(min-width: 768px) 360px, 240px"
                    className="object-cover brightness-90 saturate-[0.9] transition duration-500 hover:brightness-100 hover:saturate-100"
                  />
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
