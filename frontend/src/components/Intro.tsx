"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RollingNumber } from "@/components/RollingNumber";
import { useYearClock } from "@/lib/useYearClock";
import { CASES_PER_SECOND, DISEASES, SECONDS_PER_DEATH, SECONDS_PER_YEAR } from "@/lib/burden";
import { INFECTED_DOTS, KILLED_DOTS, MAP_COLS, MAP_ROWS } from "@/lib/worldDots";

// Full-screen intro: a printed-poster take on the counters. Two live totals since Jan 1,
// each over a dot-matrix world map shaded where mosquito-borne disease concentrates.
// Its own palette (warm near-black ground, paper-coloured ink, orange, red), separate from the
// Vercel-style app below.

export type IntroSide = "you" | "prevention";

const INK = "#ECE6DA"; // paper-coloured text on the dark ground
const ORANGE = "#F07636";
const RED = "#E0434A";
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

export function Intro({ onPick }: { onPick: (side: IntroSide) => void }) {
  const clock = useYearClock(1000);
  const perYear = (annual: number, c: typeof clock) =>
    c === null ? null : Math.floor((c.secs / SECONDS_PER_YEAR) * annual);
  const cases = DISEASES.reduce((s, d) => s + d.cases, 0);
  const infected = useJitteredCount(cases);
  const deaths = DISEASES.reduce((s, d) => s + d.deaths, 0);

  return (
    <section
      aria-label="Mozzy: mosquito-borne disease this year"
      className="relative flex min-h-[100svh] flex-col"
      style={{ backgroundColor: "#13110F", backgroundImage: PAPER, color: INK }}
    >
      {/* Masthead */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECE6DA]/20 px-6 py-4 sm:px-10">
        <div className="flex items-center gap-5">
          <span className="text-5xl leading-none tracking-wide sm:text-6xl" style={DISPLAY}>
            Mozzy
          </span>
          <span className="hidden h-10 w-px bg-[#ECE6DA]/40 sm:block" />
          <span className="hidden text-xs uppercase leading-relaxed tracking-[0.18em] sm:block" style={TYPE}>
            Hear the mosquito.
            <br />
            Know the risk.
          </span>
        </div>
        <nav className="flex items-center gap-2 text-sm sm:gap-6" style={DISPLAY}>
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
      </header>

      {/* Two counters */}
      <div className="grid flex-1 md:grid-cols-2 md:divide-x md:divide-[#ECE6DA]/20">
        <Panel
          accent={ORANGE}
          word="Infected"
          value={infected}
          roll={{ duration: 600, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}
          rate={
            <>
              <Num color={ORANGE}>+{CASES_PER_SECOND.toFixed(1)}</Num> every second
            </>
          }
          dots={INFECTED_DOTS}
        />
        <Panel
          accent={RED}
          word="Died"
          value={perYear(deaths, clock)}
          // The last digit creeps through the whole ~45 s gap, so each death arrives as the end of a slow roll.
          fraction={clock === null ? undefined : ((clock.secs / SECONDS_PER_YEAR) * deaths) % 1}
          // Digits that carry over (…9 → …0) still turn with a slow, settling roll.
          roll={{ duration: 1500, easing: "cubic-bezier(0.45, 0, 0.25, 1.15)" }}
          rate={
            <>
              About <Num color={RED}>1</Num> every <Num color={RED}>{Math.round(SECONDS_PER_DEATH)}</Num> sec
            </>
          }
          dots={KILLED_DOTS}
        />
      </div>

      <Collage />

      {/* Way down */}
      <div className="flex flex-col items-center gap-2 border-t border-[#ECE6DA]/20 px-6 py-4">
        <button
          onClick={() => onPick("you")}
          className="flex items-center gap-2 text-xl tracking-wider hover:underline"
          style={DISPLAY}
        >
          Find out what&apos;s buzzing near you <span aria-hidden="true">↓</span>
        </button>
        <span className="text-center text-[10px] uppercase tracking-[0.12em] opacity-55" style={TYPE}>
          Since Jan 1 (UTC) · WHO and ECDC yearly estimates spread evenly over the year · Zika, West Nile and
          lymphatic filariasis excluded, so these are a floor · map shading is illustrative
        </span>
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
  dots,
}: {
  accent: string;
  word: string;
  value: number | null;
  roll: { duration: number; easing: string };
  fraction?: number;
  rate: React.ReactNode;
  dots: string[];
}) {
  return (
    <div className="relative flex flex-col items-center border-b border-[#ECE6DA]/20 px-6 pt-8 pb-6 md:border-b-0 sm:px-10">
      <h2 className="text-3xl tracking-wide sm:text-4xl" style={DISPLAY}>
        <span style={{ color: accent }}>{word}</span> since Jan 1
      </h2>
      <RollingNumber
        value={value}
        className="mt-4 mb-3 text-[clamp(4.5rem,9.5vw,9.5rem)]"
        sepClassName=""
        digitWidth="0.42em"
        cellHeight="0.84em"
        cellLine="1em"
        duration={roll.duration}
        easing={roll.easing}
        fraction={fraction}
        style={{ ...DISPLAY, color: accent }}
      />
      <p className="mt-1 text-2xl uppercase tracking-wider sm:text-3xl" style={DISPLAY}>
        {rate}
      </p>

      <svg
        viewBox={`0 0 ${MAP_COLS} ${MAP_ROWS}`}
        className="mt-4 w-full max-w-[640px]"
        role="img"
        aria-label={`World map shaded where mosquito-borne disease ${word === "Died" ? "deaths" : "infections"} concentrate`}
      >
        {dots.map((d, i) => (
          <path key={i} d={d} fill={accent} fillOpacity={[0.22, 0.38, 0.56, 0.76, 0.95].at(i)} />
        ))}
      </svg>

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
    <section aria-label="People affected by mosquito-borne disease" className="border-t border-[#ECE6DA]/20 py-6">
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
                  className="relative h-[180px] flex-none overflow-hidden md:h-[260px]"
                  style={{ aspectRatio: p.ar }}
                >
                  <Image
                    src={p.src}
                    alt={copy === 0 ? p.alt : ""}
                    fill
                    loading="eager"
                    sizes="(min-width: 768px) 470px, 320px"
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
