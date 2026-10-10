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
//  - "killed": a deaths-per-million map (bands, like WHO's) in blended reds; the region under the
//    cursor lights up and is labelled with its band and the fact behind it.

// Death map: a ramp of reds, dark maroon (fewest deaths) to bright scarlet (most).
const BAND_REDS = ["#3A1215", "#7A1C23", "#C42A33", "#FF4D55"]; // DEATH_BANDS 0–3
const DEATH_HIGHLIGHT = "#FFC2C4";

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

// Blend each region's colour gradually into its neighbours: every land dot takes a Gaussian-
// weighted mix of the region colours within 8 dots of it, so regions meet in long, gentle gradients.
const BLEND_RADIUS = 8; // dots
const BLEND_SIGMA = 4;
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function blendDots(colors: Record<RegionKey, string>): { fill: string; d: string }[] {
  const rgb = Object.fromEntries(Object.entries(colors).map(([k, c]) => [k, hex(c)]));
  const weights: number[] = [];
  for (let dr = -BLEND_RADIUS; dr <= BLEND_RADIUS; dr++)
    for (let dc = -BLEND_RADIUS; dc <= BLEND_RADIUS; dc++)
      weights.push(Math.exp(-(dr * dr + dc * dc) / (2 * BLEND_SIGMA * BLEND_SIGMA)));
  const groups = new Map<string, string>();
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (REGION_GRID.charAt(r * MAP_COLS + c) === ".") continue;
      let wr = 0, wg = 0, wb = 0, wt = 0, i = 0;
      for (let dr = -BLEND_RADIUS; dr <= BLEND_RADIUS; dr++) {
        for (let dc = -BLEND_RADIUS; dc <= BLEND_RADIUS; dc++, i++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= MAP_ROWS || cc < 0 || cc >= MAP_COLS) continue;
          const k = REGION_GRID.charAt(rr * MAP_COLS + cc);
          if (k === ".") continue;
          const w = weights.at(i) ?? 0;
          const [cr, cg, cb] = rgb[k];
          wr += cr * w; wg += cg * w; wb += cb * w; wt += w;
        }
      }
      // Quantise to steps of 6 so dots of near-identical colour share one path.
      const q = (v: number) => Math.min(255, Math.round(v / wt / 6) * 6);
      const fill = `rgb(${q(wr)},${q(wg)},${q(wb)})`;
      groups.set(fill, (groups.get(fill) ?? "") + `M${c} ${r}h.7v.7h-.7z`);
    }
  }
  return [...groups].map(([fill, d]) => ({ fill, d }));
}

const INFECTED_BLEND = blendDots(REGION_ORANGE);
const DEATH_BLEND = blendDots(
  Object.fromEntries(
    (Object.keys(DEATH_FACTS) as RegionKey[]).map((k) => [k, BAND_REDS[DEATH_FACTS[k].band]]),
  ) as Record<RegionKey, string>,
);
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };

export function IntroMap({
  mode,
  accent,
  label,
}: {
  mode: "infected" | "killed";
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


  return (
    <div
      ref={box}
      data-glow-block
      className="relative mt-3 w-full max-w-[640px] md:max-w-none md:w-[min(100cqw,calc((100cqh-40px)*2.77))] cursor-crosshair touch-none select-none"
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${MAP_COLS} ${MAP_ROWS}`} className="block w-full" role="img" aria-label={label}>
        {/* Infected map: blended per-region oranges; the hovered region lights up on top */}
        {mode === "infected" && (
          <>
            {INFECTED_BLEND.map((g) => (
              <path key={g.fill} d={g.d} fill={g.fill} fillOpacity={0.92} />
            ))}
            {hover && <path d={REGION_PATHS[hover.region]} fill={HIGHLIGHT} />}
          </>
        )}

        {/* Death map: deaths-per-million bands, always on, blended in reds; hover lights one region */}
        {mode === "killed" && (
          <>
            {DEATH_BLEND.map((g) => (
              <path key={g.fill} d={g.d} fill={g.fill} />
            ))}
            {hover && <path d={REGION_PATHS[hover.region]} fill={DEATH_HIGHLIGHT} />}
          </>
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
                {DEATH_FACTS[hover.region].deaths
                  ? `${DEATH_FACTS[hover.region].deaths} deaths in 2024`
                  : `${DEATH_BANDS[DEATH_FACTS[hover.region].band]} deaths per million`}
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
          style={{ ...TYPE, opacity: 0.85 }}
        >
          Deaths / million / yr
          {DEATH_BANDS.map((b, i) => (
            <span key={b} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5" style={{ background: BAND_REDS.at(i) }} />
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
