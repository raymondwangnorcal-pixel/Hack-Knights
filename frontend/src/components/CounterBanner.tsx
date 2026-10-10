"use client";

import { useEffect, useState } from "react";
import { RollingNumber } from "@/components/RollingNumber";
import {
  CASES_PER_SECOND,
  DISEASES,
  SECONDS_PER_DEATH,
  SECONDS_PER_YEAR,
} from "@/lib/burden";

// Full-bleed counter banner in the style of climateclock.world: stacked solid-color bands,
// uppercase mono labels and one live number per band. On desktop the two bands sit side by side,
// each laid out as a single row. Looks the same on both sides of the landing page.

/** Seconds since Jan 1 (UTC) of the current year, refreshed every second. Null until mounted. */
function useYearClock(): { secs: number; year: number } | null {
  const [clock, setClock] = useState<{ secs: number; year: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const year = now.getUTCFullYear();
      setClock({ secs: (now.getTime() - Date.UTC(year, 0, 1)) / 1000, year });
    };
    const id = setInterval(update, 1000);
    const first = setTimeout(update, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, []);
  return clock;
}

export function CounterBanner() {
  const clock = useYearClock();
  const perYear = (annual: number) =>
    clock === null ? null : Math.floor((clock.secs / SECONDS_PER_YEAR) * annual);
  const totalCases = DISEASES.reduce((s, d) => s + d.cases, 0);
  const totalDeaths = DISEASES.reduce((s, d) => s + d.deaths, 0);

  // Average gap between deaths, counted down. A statistical average, labeled as such.
  const nextDeath = clock === null ? null : Math.ceil(SECONDS_PER_DEATH - (clock.secs % SECONDS_PER_DEATH));
  const since = `since Jan 1${clock ? `, ${clock.year}` : ""}`;

  return (
    <section aria-label="Mozzy clock" className="w-full font-mono">
      {/* Side by side on desktop, stacked on mobile */}
      <div className="grid lg:grid-cols-2">
      <Band
        tone="bg-[#ffb224] text-black"
        title="Infected"
        caption={since}
        value={perYear(totalCases)}
        meta={<span>+{CASES_PER_SECOND.toFixed(1)} people / second</span>}
        breakdown={DISEASES.map((d) => ({ name: d.name, value: perYear(d.cases) }))}
      />
      <Band
        tone="bg-[#e5484d] text-white"
        title="Killed"
        caption={since}
        value={perYear(totalDeaths)}
        meta={
          <span>
            1 death every {Math.round(SECONDS_PER_DEATH)}s
            <br />
            avg. next in{" "}
            <span className="tabular-nums">{nextDeath === null ? "—" : `0:${String(nextDeath).padStart(2, "0")}`}</span>
          </span>
        }
        breakdown={DISEASES.map((d) => ({ name: d.name, value: perYear(d.deaths) }))}
      />
      </div>
    </section>
  );
}

function Band({
  tone,
  title,
  caption,
  value,
  meta,
  breakdown,
}: {
  tone: string;
  title: string;
  caption: string;
  value: number | null;
  meta: React.ReactNode;
  breakdown: { name: string; value: number | null }[];
}) {
  return (
    <div className={`${tone} flex flex-col gap-2 px-6 py-5 sm:px-12 lg:flex-row lg:items-center lg:gap-6 lg:px-8 lg:py-3`}>
      <span className="flex flex-col uppercase">
        <span className="text-xl font-bold tracking-wide lg:text-sm">{title}</span>
        <span className="text-[11px] leading-tight opacity-75">by mosquito-borne disease</span>
        <span className="text-[11px] leading-tight opacity-75">{caption}</span>
      </span>

      <RollingNumber
        value={value}
        className="text-[clamp(2.5rem,8.5vw,4.75rem)] font-bold tracking-tighter lg:text-[clamp(1.75rem,2.6vw,2.5rem)]"
        sepClassName="font-sans -mr-[0.04em]"
      />

      <div className="flex flex-col items-start gap-1.5 text-xs uppercase lg:ml-auto lg:items-end lg:text-right">
        <span className="text-[11px] leading-tight">{meta}</span>
      {/* Breakdown sits beside the number and opens as a popover, so the band never grows. */}
      <div className="text-xs uppercase">
        <details className="group relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 border border-current px-2 py-0.5 select-none hover:bg-current/10 [&::-webkit-details-marker]:hidden">
            By disease
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" className="transition-transform group-open:rotate-180">
              <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </summary>
          <ul className={`${tone} absolute right-0 top-full z-20 mt-2 flex w-64 flex-col gap-1 border border-current p-3 normal-case shadow-xl max-sm:left-0 max-sm:right-auto`}>
            {breakdown.map((d) => (
              <li key={d.name} className="flex justify-between gap-6">
                <span className="opacity-75">{d.name}</span>
                <span className="tabular-nums">{d.value === null ? "—" : d.value.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
      </div>
    </div>
  );
}
