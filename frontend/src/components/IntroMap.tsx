"use client";

import { useRef, useState } from "react";
import { MAP_COLS, MAP_ROWS } from "@/lib/worldDots";
import { REGION_GRID, REGION_PATHS } from "@/lib/worldRegions";
import {
  DEATH_BANDS,
  DEATH_FACTS,
  INFECTION_FACTS,
  REGION_NAMES,
  type RegionKey,
} from "@/lib/regionFacts";

// Dot-matrix world map with two hover behaviours:
//  - "infected": the region under the cursor lights up and a label names its main disease.
//  - "killed": the whole map turns into a deaths-per-million map (bands, like WHO's), the region
//    under the cursor is outlined in full colour and labelled with its band and the fact behind it.

const BAND_OPACITY = [0.14, 0.38, 0.65, 0.95];

// Infected map: every region keeps its own shade of orange, so the sections read at a glance.
// Three tiers (pale, bright, deep) assigned so no two neighbouring regions share a tier.
const REGION_ORANGE: Record<RegionKey, string> = {
  n: "#FFB677", // North America        pale
  l: "#F26B1D", // Latin America        bright
  e: "#FFD9B3", // Europe               pale
  m: "#FF9233", // N Africa & Mid East  bright
  s: "#B83A0B", // Sub-Saharan Africa   deep
  a: "#FFC793", // South Asia           pale
  t: "#9C330C", // Southeast Asia       deep
  c: "#FFA24D", // East Asia            bright
  r: "#6E2A0E", // Russia & Central Asia deep
  o: "#FFE6CC", // Oceania              pale
};
const HIGHLIGHT = "#FFE066";
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };

export function IntroMap({
  mode,
  dots,
  accent,
  label,
}: {
  mode: "infected" | "killed";
  dots: string[];
  accent: string;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ region: RegionKey; x: number; y: number; w: number; h: number } | null>(null);

  // Cursor → grid cell → region; a near-miss on the coast snaps to the closest land cell.
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const col = Math.floor((x / r.width) * MAP_COLS);
    const row = Math.floor((y / r.height) * MAP_ROWS);
    let found: RegionKey | null = null;
    for (let d = 0; d <= 2 && !found; d++) {
      for (let dr = -d; dr <= d && !found; dr++) {
        for (let dc = -d; dc <= d && !found; dc++) {
          const rr = row + dr;
          const cc = col + dc;
          if (rr < 0 || rr >= MAP_ROWS || cc < 0 || cc >= MAP_COLS) continue;
          const k = REGION_GRID.charAt(rr * MAP_COLS + cc);
          if (k !== ".") found = k as RegionKey;
        }
      }
    }
    setHover(found ? { region: found, x, y, w: r.width, h: r.height } : null);
  }

  const choropleth = mode === "killed" && hover !== null;

  return (
    <div
      ref={box}
      data-glow-block
      className="relative mt-4 w-full max-w-[640px] cursor-crosshair touch-none select-none"
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${MAP_COLS} ${MAP_ROWS}`} className="block w-full" role="img" aria-label={label}>
        {/* Infected map: a fixed shade per region; the hovered one switches to the bright highlight */}
        {mode === "infected" &&
          (Object.keys(REGION_ORANGE) as RegionKey[]).map((k) => (
            <path
              key={k}
              d={REGION_PATHS[k]}
              fill={hover?.region === k ? HIGHLIGHT : REGION_ORANGE[k]}
              fillOpacity={hover?.region === k ? 1 : 0.92}
              style={{ transition: "fill 200ms, fill-opacity 200ms" }}
            />
          ))}

        {/* Death map: burden shading that gives way to the per-region bands while hovering */}
        {mode === "killed" && (
          <g style={{ opacity: choropleth ? 0 : 1, transition: "opacity 250ms" }}>
            {dots.map((d, i) => (
              <path key={i} d={d} fill={accent} fillOpacity={[0.22, 0.38, 0.56, 0.76, 0.95].at(i)} />
            ))}
          </g>
        )}

        {mode === "killed" && (
          <g style={{ opacity: choropleth ? 1 : 0, transition: "opacity 250ms" }}>
            {(Object.keys(DEATH_FACTS) as RegionKey[]).map((k) => (
              <path
                key={k}
                d={REGION_PATHS[k]}
                fill={hover?.region === k ? "#FF8A8F" : accent}
                fillOpacity={hover?.region === k ? 1 : BAND_OPACITY.at(DEATH_FACTS[k].band)}
              />
            ))}
          </g>
        )}

      </svg>

      {/* Label card, kept inside the map's width */}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-60 border border-current/25 bg-[#13110F]/92 px-3 py-2 shadow-xl backdrop-blur-sm"
          style={{
            left: Math.min(Math.max(hover.x + 14, 0), hover.w - 240),
            top: hover.y + 14,
            // In the lower half of the map, open the label above the cursor instead.
            transform: hover.y > hover.h / 2 ? "translateY(calc(-100% - 28px))" : undefined,
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.16em] opacity-70" style={TYPE}>
            {REGION_NAMES[hover.region]}
          </p>
          {mode === "infected" ? (
            <>
              <p className="text-2xl leading-tight tracking-wide" style={{ ...DISPLAY, color: accent }}>
                {INFECTION_FACTS[hover.region].disease}
              </p>
              <p className="text-[11px] leading-snug" style={TYPE}>
                {INFECTION_FACTS[hover.region].stat}
              </p>
              {INFECTION_FACTS[hover.region].also && (
                <p className="mt-1 text-[10px] leading-snug opacity-70" style={TYPE}>
                  {INFECTION_FACTS[hover.region].also}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-2xl leading-tight tracking-wide" style={{ ...DISPLAY, color: accent }}>
                {DEATH_BANDS[DEATH_FACTS[hover.region].band]} deaths per million
              </p>
              <p className="text-[11px] leading-snug" style={TYPE}>
                {DEATH_FACTS[hover.region].stat}
              </p>
            </>
          )}
        </div>
      )}

      {/* Death-map key, shown while the bands are */}
      {mode === "killed" && (
        <div
          className="pointer-events-none mt-2 flex items-center justify-end gap-2 text-[10px] uppercase tracking-[0.12em]"
          style={{ ...TYPE, opacity: choropleth ? 0.85 : 0, transition: "opacity 250ms" }}
        >
          Deaths / million / yr
          {DEATH_BANDS.map((b, i) => (
            <span key={b} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5" style={{ background: accent, opacity: BAND_OPACITY.at(i) }} />
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
