"use client";

import Link from "next/link";
import { RollingNumber } from "@/components/RollingNumber";
import { useYearClock } from "@/lib/useYearClock";
import { CASES_PER_SECOND, DISEASES, SECONDS_PER_DEATH, SECONDS_PER_YEAR } from "@/lib/burden";
import { INFECTED_DOTS, KILLED_DOTS, MAP_COLS, MAP_ROWS } from "@/lib/worldDots";

// Full-screen intro: a printed-poster take on the counters. Two live totals since Jan 1,
// each over a dot-matrix world map shaded where mosquito-borne disease concentrates.
// Its own palette (warm paper, ink, orange, deep red), separate from the Vercel-style app below.

export type IntroSide = "you" | "prevention";

const INK = "#1C2624";
const ORANGE = "#D9581E";
const RED = "#A51D22";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

// Fine paper grain, drawn by an SVG noise filter.
const PAPER =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.3 0 0 0 0 0.22 0 0 0 0.09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export function Intro({ onPick }: { onPick: (side: IntroSide) => void }) {
  const clock = useYearClock(1000);
  // One tick per new infection: about 9.4 a second.
  const fast = useYearClock(1000 / CASES_PER_SECOND);
  const perYear = (annual: number, c: typeof clock) =>
    c === null ? null : Math.floor((c.secs / SECONDS_PER_YEAR) * annual);
  const cases = DISEASES.reduce((s, d) => s + d.cases, 0);
  const deaths = DISEASES.reduce((s, d) => s + d.deaths, 0);

  return (
    <section
      aria-label="Mozzy: mosquito-borne disease this year"
      className="relative flex min-h-[100svh] flex-col"
      style={{ backgroundColor: "#EEE9DF", backgroundImage: PAPER, color: INK }}
    >
      {/* Masthead */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1C2624]/20 px-6 py-4 sm:px-10">
        <div className="flex items-center gap-5">
          <span className="text-5xl leading-none tracking-wide sm:text-6xl" style={DISPLAY}>
            Mozzy
          </span>
          <span className="hidden h-10 w-px bg-[#1C2624]/40 sm:block" />
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
            className="ml-1 rounded-sm px-5 py-2.5 text-lg tracking-wider whitespace-nowrap text-[#EEE9DF] transition-opacity hover:opacity-85"
            style={{ backgroundColor: INK }}
          >
            Start listening
          </Link>
        </nav>
      </header>

      {/* Two counters */}
      <div className="grid flex-1 md:grid-cols-2 md:divide-x md:divide-[#1C2624]/20">
        <Panel
          accent={ORANGE}
          word="Infected"
          value={perYear(cases, fast)}
          roll={{ duration: 90, easing: "linear" }}
          rate={
            <>
              <Num color={ORANGE}>+{CASES_PER_SECOND.toFixed(1)}</Num> every second
            </>
          }
          dots={INFECTED_DOTS}
          left={
            <div className="flex flex-col gap-1.5">
              <span className="border-b border-[#1C2624]/30 pb-1 text-[11px] uppercase tracking-[0.18em]" style={TYPE}>
                Counted here
              </span>
              {DISEASES.map((d) => (
                <span key={d.name} className="flex items-baseline justify-between gap-4 font-serif text-[15px]">
                  {d.name}
                  <span className="text-[11px] tabular-nums opacity-70" style={TYPE}>
                    {perYear(d.cases, clock)?.toLocaleString("en-US") ?? "—"}
                  </span>
                </span>
              ))}
            </div>
          }
          right={<Note>Mozzy hears which mosquito is in the room.</Note>}
        />
        <Panel
          accent={RED}
          word="Died"
          value={perYear(deaths, clock)}
          // Each new death rolls in slowly, like a slot-machine reel settling.
          roll={{ duration: 3500, easing: "cubic-bezier(0.45, 0, 0.25, 1.15)" }}
          rate={
            <>
              About <Num color={RED}>1</Num> every <Num color={RED}>{Math.round(SECONDS_PER_DEATH)}</Num> sec
            </>
          }
          dots={KILLED_DOTS}
          left={<Note>Same mosquitoes. Different outcomes.</Note>}
          right={<Note align="right">Most malaria deaths are children under five.</Note>}
        />
      </div>

      {/* Way down */}
      <div className="flex flex-col items-center gap-2 border-t border-[#1C2624]/20 px-6 py-4">
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
  rate,
  dots,
  left,
  right,
}: {
  accent: string;
  word: string;
  value: number | null;
  roll: { duration: number; easing: string };
  rate: React.ReactNode;
  dots: string[];
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center border-b border-[#1C2624]/20 px-6 pt-8 pb-6 md:border-b-0 sm:px-10">
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
          <path key={i} d={d} fill={accent} fillOpacity={[0.13, 0.32, 0.52, 0.74, 0.95].at(i)} />
        ))}
      </svg>

      {/* Corner notes: overlaid on wide screens, stacked below the map on small ones */}
      <div className="mt-4 flex w-full items-end justify-between gap-6 lg:absolute lg:inset-x-10 lg:bottom-6 lg:mt-0 lg:w-auto">
        <div className="max-w-[220px]">{left}</div>
        <div className="max-w-[200px]">{right}</div>
      </div>
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

function Note({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <p
      className={`text-[11px] uppercase leading-relaxed tracking-[0.16em] ${align === "right" ? "text-right" : ""}`}
      style={TYPE}
    >
      <span aria-hidden="true" className="mb-1 block opacity-60">
        —
      </span>
      {children}
    </p>
  );
}
