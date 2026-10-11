"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

// The sponsor page: one sponsor at a time, switched from the dropdown in the panel's header.
// Same look as the home page intro. Deep links (#tiger-data, #snowflake, #gemini, #elevenlabs)
// open straight to that sponsor.

const BG = "#13110F";
const INK = "#ECE6DA";
const ORANGE = "#F07636";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };
const BODY = { fontFamily: "'Roboto Condensed', var(--font-geist-sans), sans-serif" };

type Sponsor = {
  id: string;
  name: string;
  label: string;
  headline: string;
  body: string;
  logo: { src: string; width: number; height: number };
};

const SPONSORS: Sponsor[] = [
  {
    id: "tiger-data",
    name: "Tiger Data",
    label: "Track 01 · Storage",
    headline: "Keeping the model and map in sync",
    body: "Tiger Data can hold the same genus and species labels as Mozzy’s training database, with a version recorded for each model. New phone detections can update the heatmap as they arrive, while unverified reports stay out of the training set until they’ve been checked.",
    logo: { src: "/logos/tiger-data.png", width: 456, height: 455 },
  },
  {
    id: "snowflake",
    name: "Snowflake",
    label: "Track 02 · Analytics",
    headline: "Finding the pattern",
    body: "Mozzy’s predictive and prevention models are built around Snowflake’s analytics. Snowflake looks across the observation history to identify district trends, unusual increases, and projected mosquito activity. Those findings shape the heatmap and give Mozzy more to work from than individual recordings alone.",
    logo: { src: "/logos/snowflake.png", width: 1565, height: 1559 },
  },
  {
    id: "gemini",
    name: "Gemini",
    label: "Track 03 · Guidance",
    headline: "Making the data useful",
    body: "A forecast does not tell a family what to do tonight. Gemini takes local signals from Snowflake and vetted health guidance, then writes household steps for residents and a separate, reviewable plan for health teams. The advice can change when conditions such as rainfall change.",
    logo: { src: "/logos/gemini.png", width: 554, height: 554 },
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    label: "Track 04 · Voice",
    headline: "Getting the advice heard",
    body: "Not everyone wants to read instructions on a phone. ElevenLabs lets residents hear their prevention steps in a supported language. Catholic Relief Services could use that audio alongside digital net campaigns, while Malaria Consortium could share study-informed guidance through field teams.",
    logo: { src: "/logos/elevenlabs.png", width: 538, height: 273 },
  },
];

const byId = (id: string) => SPONSORS.find((s) => s.id === id);

export function SponsorTracks() {
  const [id, setId] = useState(SPONSORS[0].id);

  // Open on the sponsor named in the URL hash, and follow hash changes.
  useEffect(() => {
    const fromHash = () => {
      const s = byId(window.location.hash.slice(1));
      if (s) setId(s.id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const pick = (next: string) => {
    setId(next);
    window.history.replaceState(null, "", `#${next}`);
  };

  const s = byId(id) ?? SPONSORS[0];

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: BG, color: INK }}>
      <header className="border-b border-[#ECE6DA]/20">
        <div className="mx-auto flex max-w-[1216px] items-center justify-between gap-4 px-4 py-[18px] sm:px-8">
          <Link href="/" className="text-[44px] leading-none tracking-wide" style={DISPLAY}>
            Mozzy
          </Link>
          <Link
            href="/"
            className="rounded-full px-[22px] pt-[13px] pb-[11px] text-base leading-none tracking-wider text-[#13110F] uppercase transition-opacity hover:opacity-85"
            style={{ ...DISPLAY, backgroundColor: INK }}
          >
            Back to Mozzy
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1216px] px-4 pt-8 pb-7 sm:px-8 sm:pt-14 sm:pb-[72px]">
        <section
          aria-labelledby="sponsor-label"
          className="flex flex-col gap-[14px] border border-[#ECE6DA]/20 px-5 py-6 sm:gap-[18px] sm:p-10"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-[#ECE6DA]/20 pb-[18px]">
            <label
              id="sponsor-label"
              htmlFor="sponsor-select"
              className="text-[11px] tracking-[0.18em] text-[#ECE6DA]/80 uppercase"
              style={TYPE}
            >
              {s.label}
            </label>
            <span className="relative inline-flex w-full min-[481px]:w-auto">
              <select
                id="sponsor-select"
                value={id}
                onChange={(e) => pick(e.target.value)}
                className="min-h-12 w-full cursor-pointer appearance-none rounded-full border border-[#ECE6DA]/20 bg-[#13110F] pt-[13px] pr-12 pb-[11px] pl-5 text-xl leading-none tracking-wider text-[#ECE6DA] uppercase hover:border-[#ECE6DA]/60 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F07636] min-[481px]:w-auto min-[481px]:min-w-[240px]"
                style={DISPLAY}
              >
                {SPONSORS.map((o) => (
                  <option key={o.id} value={o.id} className="bg-[#13110F] normal-case" style={BODY}>
                    {o.name}
                  </option>
                ))}
              </select>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-5 -translate-y-1/2 text-base"
                style={{ color: ORANGE }}
              >
                ▾
              </span>
            </span>
          </div>

          <div
            key={s.id}
            className="sponsor-fade grid grid-cols-1 items-center gap-6 md:grid-cols-[minmax(0,1fr)_clamp(220px,28vw,320px)] md:gap-10"
          >
            <div className="flex min-w-0 flex-col gap-[14px] sm:gap-[18px]">
              <h1
                className="m-0 text-[clamp(56px,10vw,104px)] leading-[0.85] tracking-wide uppercase"
                style={{ ...DISPLAY, color: ORANGE }}
              >
                {s.name}
              </h1>
              <h2
                className="m-0 text-[clamp(26px,4vw,36px)] leading-[1.05] tracking-wide text-balance uppercase"
                style={DISPLAY}
              >
                {s.headline}
              </h2>
              <p className="m-0 max-w-[62ch] text-[21px] leading-[1.55] font-light text-[#ECE6DA]/90" style={BODY}>
                {s.body}
              </p>
            </div>
            <div className="order-first grid aspect-square w-[140px] place-items-center md:order-none md:w-auto md:p-4">
              <Image
                src={s.logo.src}
                alt={`${s.name} logo`}
                width={s.logo.width}
                height={s.logo.height}
                className="h-auto max-h-full w-auto max-w-full object-contain"
                priority
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
