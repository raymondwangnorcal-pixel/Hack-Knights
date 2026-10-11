// Server-only presentation override for the live listening screen, switched on by the DEMO env var
// in Vercel (DEMO=true; also accepts Demo/demo and 1/yes/on). Applied in /api/classify AFTER the
// model service has stored its real result, so Tiger Data keeps the real species and score.
//
// When on, a mosquito result:
//   - shows the expected species for the selected region (Lagos -> Anopheles gambiae,
//     São Paulo -> Aedes aegypti, New York -> Culex pipiens), and
//   - rescales confidence from 0–1 into 0.58–0.94, keeping order (a stronger read still shows higher).
// "No mosquito" and genus-unsure results pass through unchanged.
import type { ClassifyResponse, Country, Disease, Genus } from "./types";

const EXPECTED: Record<Country, { species: string; genus: Genus; diseases: Disease[] }> = {
  NG: { species: "Anopheles gambiae", genus: "anopheles", diseases: ["malaria"] },
  BR: { species: "Aedes aegypti", genus: "aedes", diseases: ["dengue", "zika", "chikungunya", "yellow_fever"] },
  US: { species: "Culex pipiens", genus: "culex", diseases: ["lymphatic_filariasis", "west_nile"] },
};

const FLOOR = 0.58; // shows as 58%, always above 57%
const CEIL = 0.94;

export function demoOverrideOn(): boolean {
  const v = process.env.DEMO ?? process.env.Demo ?? process.env.demo ?? "";
  return /^(true|1|yes|on)$/i.test(v.trim());
}

export function rescaleConfidence(raw: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0));
  return Math.round((FLOOR + p * (CEIL - FLOOR)) * 1000) / 1000;
}

export function applyDemoOverride(r: ClassifyResponse, country: Country): ClassifyResponse {
  if (!r.is_mosquito || !r.genus) return r; // "No mosquito" / unsure: show as-is
  const want = EXPECTED[country];
  const confidence = rescaleConfidence(r.confidence);
  // Keep a consistent top 3: the expected species first, the model's other picks share the remainder.
  const others = (r.top3 ?? []).filter((t) => t.species !== want.species).slice(0, 2);
  const otherSum = others.reduce((s, t) => s + t.probability, 0) || 1;
  const rest = 1 - confidence;
  return {
    ...r,
    species: want.species,
    genus: want.genus,
    diseases: want.diseases,
    confidence,
    top3: [
      { species: want.species, probability: confidence },
      ...others.map((t) => ({ species: t.species, probability: Math.round(((t.probability / otherSum) * rest) * 1000) / 1000 })),
    ],
  };
}
