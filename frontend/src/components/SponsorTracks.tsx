"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { scrollToId } from "@/components/SmoothScroll";

// Sponsors: the section under "For prevention". One sponsor at a time, switched from the dropdown
// in the panel's header, with that sponsor's logo beside how Mozzy uses it. Same poster palette as
// the rest of the page. Links to /#sponsors (or /sponsors) land here; #tiger-data, #snowflake,
// #gemini and #elevenlabs land here with that sponsor open.

const INK = "#ECE6DA";
const ORANGE = "#F07636";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };
const BODY = { fontFamily: "'Roboto Condensed', var(--font-geist-sans), sans-serif" };

export const SPONSORS_ID = "sponsors";

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

/** Scroll to the sponsors section once it's on the page (it only renders on the prevention side,
 *  which may still be switching in when this is called). The map and lists above it are still
 *  loading and push it down, so it re-aims a few times as the page settles, unless the visitor
 *  starts scrolling themselves. */
export function scrollToSponsors() {
  let tries = 0;
  let cancelled = false;
  const stop = () => {
    cancelled = true;
  };
  const opts = { once: true, passive: true } as const;
  window.addEventListener("wheel", stop, opts);
  window.addEventListener("touchstart", stop, opts);
  window.addEventListener("keydown", stop, opts);

  const aim = () => {
    if (!cancelled) scrollToId(SPONSORS_ID);
  };
  const go = () => {
    if (document.getElementById(SPONSORS_ID)) {
      aim();
      [500, 1200, 2500].forEach((ms) => setTimeout(aim, ms));
      setTimeout(() => {
        window.removeEventListener("wheel", stop);
        window.removeEventListener("touchstart", stop);
        window.removeEventListener("keydown", stop);
      }, 2600);
    } else if (++tries < 40) {
      setTimeout(go, 50);
    }
  };
  go();
}

/** The round down-arrow at the bottom of the prevention screen. */
export function ToSponsorsArrow() {
  return (
    <button
      type="button"
      onClick={() => scrollToId(SPONSORS_ID)}
      className="group mx-auto flex flex-col items-center gap-2 pt-2 pb-1"
      style={{ color: INK }}
    >
      <span className="text-[18px] leading-none tracking-[0.12em] uppercase" style={DISPLAY}>
        To sponsors
      </span>
      <span
        className="bob-arrow flex h-11 w-11 items-center justify-center rounded-full border border-[#ECE6DA]/30 bg-[#13110F] transition-colors group-hover:border-[#ECE6DA]/80"
        aria-hidden="true"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v15M5.5 12.5 12 19l6.5-6.5" />
        </svg>
      </span>
    </button>
  );
}

export function SponsorSection() {
  const [id, setId] = useState(SPONSORS[0].id);

  // Arriving from a link: #sponsors scrolls here; a sponsor's id also opens that sponsor.
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      const s = byId(hash);
      if (s) setId(s.id);
      if (s || hash === SPONSORS_ID) scrollToSponsors();
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const s = byId(id) ?? SPONSORS[0];

  return (
    <section
      id={SPONSORS_ID}
      aria-labelledby="sponsor-label"
      className="flex scroll-mt-[86px] flex-col gap-[14px] border border-[#ECE6DA]/20 px-4 pt-4 pb-6 sm:gap-[18px] sm:px-7 sm:pt-6 sm:pb-8 lg:scroll-mt-[52px]"
      style={{ color: INK }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-[#ECE6DA]/20 pb-4 sm:pb-5">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="text-[22px] leading-none tracking-[0.18em] uppercase sm:text-[26px]" style={{ ...DISPLAY, color: ORANGE }}>
            Sponsors
          </span>
          <label
            id="sponsor-label"
            htmlFor="sponsor-select"
            className="text-[11px] tracking-[0.18em] text-[#ECE6DA]/80 uppercase"
            style={TYPE}
          >
            {s.label}
          </label>
        </div>
        <span className="relative inline-flex w-full min-[481px]:w-auto">
          <select
            id="sponsor-select"
            value={id}
            onChange={(e) => setId(e.target.value)}
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
          <h2
            className="m-0 text-[clamp(56px,10vw,104px)] leading-[0.85] tracking-wide uppercase"
            style={{ ...DISPLAY, color: ORANGE }}
          >
            {s.name}
          </h2>
          <h3
            className="m-0 text-[clamp(26px,4vw,36px)] leading-[1.05] tracking-wide text-balance uppercase"
            style={DISPLAY}
          >
            {s.headline}
          </h3>
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
          />
        </div>
      </div>
    </section>
  );
}
