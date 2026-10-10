"use client";

import { useState } from "react";
import Link from "next/link";
import { LiveCounter } from "@/components/LiveCounter";
import { CASES_PER_SECOND, SECONDS_PER_DEATH } from "@/lib/burden";

// One full-screen landing page with two sides, switched by a toggle near the top.
// Starts on the consumer side (light). The government/nonprofit side (dark) takes over
// the full width of the screen. Styled after vercel.com: pure white / black, Geist, hairlines.

type Side = "consumer" | "gov";

const SIDES: { id: Side; label: string }[] = [
  { id: "consumer", label: "Consumers" },
  { id: "gov", label: "Governments & nonprofits" },
];

export function Landing() {
  const [side, setSide] = useState<Side>("consumer");
  const dark = side === "gov";

  return (
    <main
      className={`flex min-h-screen flex-1 flex-col transition-colors duration-500 ${
        dark ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      {/* Top bar: wordmark + two-option toggle */}
      <header
        className={`flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4 transition-colors duration-500 sm:px-12 ${
          dark ? "border-neutral-800" : "border-neutral-200"
        }`}
      >
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <MozzyMark />
          Mozzy
        </span>

        <div
          role="tablist"
          aria-label="Choose who Mozzy is for"
          className={`flex rounded-full border p-1 transition-colors duration-500 ${
            dark ? "border-neutral-800 bg-neutral-950" : "border-neutral-200 bg-neutral-50"
          }`}
        >
          {SIDES.map((s) => {
            const active = side === s.id;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={active}
                onClick={() => setSide(s.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${
                  active
                    ? dark
                      ? "bg-white text-black"
                      : "bg-black text-white"
                    : dark
                      ? "text-neutral-400 hover:text-white"
                      : "text-neutral-500 hover:text-black"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Two live counters, shown on both sides */}
      <section
        className={`grid gap-8 border-b px-6 py-8 transition-colors duration-500 sm:grid-cols-2 sm:px-12 ${
          dark ? "border-neutral-800" : "border-neutral-200"
        }`}
      >
        <LiveCounter
          accent="amber"
          ratePerSecond={CASES_PER_SECOND}
          label="Infected by mosquitoes this year"
          sublabel={`≈ ${CASES_PER_SECOND.toFixed(1)} people every second`}
        />
        <LiveCounter
          accent="red"
          ratePerSecond={1 / SECONDS_PER_DEATH}
          label="Killed by mosquito-borne disease this year"
          sublabel={`1 person every ${Math.round(SECONDS_PER_DEATH)} seconds`}
        />
      </section>

      {/* Side content */}
      <section key={side} className="flex flex-1 flex-col justify-center gap-10 px-6 py-12 sm:px-12 animate-[fadein_400ms_ease-out]">
        {dark ? <GovSide /> : <ConsumerSide />}
      </section>

      <footer className="px-6 pb-4 font-mono text-[10px] opacity-50 sm:px-12">
        Estimates from WHO and ECDC figures for malaria, dengue, yellow fever, Japanese encephalitis and
        chikungunya. Zika, West Nile and lymphatic filariasis excluded, so counts are a floor.
      </footer>
    </main>
  );
}

function ConsumerSide() {
  return (
    <>
      <div className="flex max-w-2xl flex-col gap-5">
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Hear the mosquito.
          <br />
          Know the risk.
        </h1>
        <p className="max-w-xl text-lg text-neutral-600">
          Mozzy listens for a mosquito&apos;s buzz, names the species, and tells you which diseases
          it can carry and what to do next.
        </p>
      </div>
      <FeatureRow
        dark={false}
        items={[
          ["Identify by sound", "Like Shazam, but for mosquitoes."],
          ["Know what to do", "Clear next steps, read aloud."],
          ["See your area", "Risk in your neighborhood this week."],
        ]}
      />
      <Link
        href="/listen"
        className="flex w-fit items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
      >
        Start listening <span aria-hidden="true">→</span>
      </Link>
    </>
  );
}

function GovSide() {
  return (
    <>
      <div className="flex max-w-2xl flex-col gap-5">
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          See outbreaks
          <br />
          before they spread.
        </h1>
        <p className="max-w-xl text-lg text-neutral-400">
          Mozzy turns thousands of phone detections into a live risk map, 4-week forecasts and
          AI-drafted prevention plans for every district.
        </p>
      </div>
      <FeatureRow
        dark
        items={[
          ["Live risk map", "Detections and risk by district, in 3D."],
          ["Forecasts", "Cases 1–4 weeks out, always with ranges."],
          ["Act fast", "Prevention plans and multilingual alerts."],
        ]}
      />
      <Link
        href="/dashboard"
        className="flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
      >
        Open dashboard <span aria-hidden="true">→</span>
      </Link>
    </>
  );
}

function FeatureRow({ items, dark }: { items: [string, string][]; dark: boolean }) {
  return (
    <div
      className={`grid max-w-4xl overflow-hidden rounded-xl border sm:grid-cols-3 ${
        dark ? "border-neutral-800" : "border-neutral-200"
      }`}
    >
      {items.map(([title, body], i) => (
        <div
          key={title}
          className={`flex flex-col gap-1 p-5 ${
            i > 0 ? (dark ? "border-t border-neutral-800 sm:border-t-0 sm:border-l" : "border-t border-neutral-200 sm:border-t-0 sm:border-l") : ""
          }`}
        >
          <span className="font-mono text-xs opacity-50">0{i + 1}</span>
          <span className="font-medium">{title}</span>
          <span className={`text-sm ${dark ? "text-neutral-400" : "text-neutral-600"}`}>{body}</span>
        </div>
      ))}
    </div>
  );
}

function MozzyMark() {
  return (
    <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true">
      {/* Soundwave mark: the buzz Mozzy listens for */}
      <rect x="0" y="7" width="2.5" height="4" rx="1.25" fill="currentColor" />
      <rect x="4.4" y="3" width="2.5" height="12" rx="1.25" fill="currentColor" />
      <rect x="8.8" y="0" width="2.5" height="18" rx="1.25" fill="currentColor" />
      <rect x="13.2" y="4" width="2.5" height="10" rx="1.25" fill="currentColor" />
      <rect x="17.5" y="7" width="2.5" height="4" rx="1.25" fill="currentColor" />
    </svg>
  );
}
