// Server-side adapter between the Data/ML FastAPI service and the frontend contract (types.ts).
// The FastAPI service returns its own shapes (district_id, lon, risk 0–1, "west nile"); every
// Next.js route goes through here so components only ever see the contract shapes.
import type {
  ClassifyResponse,
  Country,
  Detection,
  DetectionsResponse,
  Disease,
  DistrictRisk,
  ForecastResponse,
  Genus,
  RiskResponse,
} from "./types";

export class BackendError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

function base(): string {
  const url = process.env.BUZZ_API_URL;
  if (!url) throw new BackendError("BUZZ_API_URL is not set", 500);
  return url.replace(/\/$/, "");
}

// Fails loudly: a non-2xx or unreachable service throws with the upstream status and body.
export async function upstream<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs), ...init });
  } catch (err) {
    throw new BackendError(`Model service unreachable at ${base()}${path}: ${String(err)}`, 504);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BackendError(`Model service ${path} returned ${res.status}: ${body.slice(0, 300)}`, res.status === 422 ? 422 : 502);
  }
  return res.json() as Promise<T>;
}

export function errorResponse(err: unknown): Response {
  const status = err instanceof BackendError ? err.status : 500;
  console.error("[backend]", err);
  return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });
}

// "west nile" -> "west_nile", "yellow fever" -> "yellow_fever"
export const toDisease = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_") as Disease;

const DEFAULT_DISEASE: Record<Country, Disease> = { NG: "malaria", BR: "dengue", US: "west_nile" };

// ---- Districts (cached for the life of the server process; 35 rows) ----

type Geo = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
interface UpDistrict {
  district_id: string;
  country: Country;
  city: string;
  name: string;
  lat: number;
  lon: number;
  geojson?: Geo | string | null;
}
interface DistrictInfo extends Omit<UpDistrict, "geojson"> {
  polygons: number[][][][]; // [polygon][ring][point][lng, lat]
  bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
}

let districtCache: Promise<Map<string, DistrictInfo>> | null = null;

export function districtsById(): Promise<Map<string, DistrictInfo>> {
  districtCache ??= upstream<{ districts: UpDistrict[] }>("/districts?geojson=true")
    .then(({ districts }) => {
      if (!districts.length) throw new BackendError("Model service returned no districts");
      const map = new Map<string, DistrictInfo>();
      for (const d of districts) {
        const g: Geo | null = typeof d.geojson === "string" ? JSON.parse(d.geojson) : (d.geojson ?? null);
        const polygons = !g ? [] : g.type === "Polygon" ? [g.coordinates] : g.coordinates;
        const pts = polygons.flatMap((p) => p[0]);
        const bbox: DistrictInfo["bbox"] = pts.length
          ? [
              Math.min(...pts.map((p) => p[0])),
              Math.min(...pts.map((p) => p[1])),
              Math.max(...pts.map((p) => p[0])),
              Math.max(...pts.map((p) => p[1])),
            ]
          : [d.lon, d.lat, d.lon, d.lat];
        map.set(d.district_id, { ...d, polygons, bbox });
      }
      return map;
    })
    .catch((err) => {
      districtCache = null; // retry on the next request instead of caching the failure
      throw err;
    });
  return districtCache;
}

// The UI keys districts by display name; the service by id. Accepts either.
export async function resolveDistrictId(nameOrId: string, country?: Country): Promise<string> {
  const all = await districtsById();
  if (all.has(nameOrId)) return nameOrId;
  const want = nameOrId.trim().toLowerCase();
  const hits = [...all.values()].filter((d) => d.name.toLowerCase() === want && (!country || d.country === country));
  if (hits.length !== 1) {
    throw new BackendError(
      hits.length ? `District name "${nameOrId}" is ambiguous; pass a country` : `Unknown district "${nameOrId}"`,
      422,
    );
  }
  return hits[0].district_id;
}

// ---- Detection placement ----
// The service stores only the district (never GPS), so every detection carries the district centroid.
// To draw one dot per detection, each is placed at a stable pseudo-random point inside its district
// outline, denser toward the centre (Gaussian, rejection-sampled against the polygon).

const SPREAD = 0.3; // Gaussian sigma as a fraction of the district's half-width/height

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inDistrict(x: number, y: number, d: DistrictInfo): boolean {
  return d.polygons.some((p) => inRing(x, y, p[0]) && !p.slice(1).some((hole) => inRing(x, y, hole)));
}

export function placeInDistrict(id: string, d: DistrictInfo | undefined, lat: number, lng: number) {
  if (!d || !d.polygons.length) return { lat, lng };
  const rand = rng(hashSeed(id));
  const [minX, minY, maxX, maxY] = d.bbox;
  const sx = ((maxX - minX) / 2) * SPREAD;
  const sy = ((maxY - minY) / 2) * SPREAD;
  for (let i = 0; i < 40; i++) {
    // Box–Muller
    const r = Math.sqrt(-2 * Math.log(rand() || 1e-9));
    const t = 2 * Math.PI * rand();
    const x = d.lon + r * Math.cos(t) * sx;
    const y = d.lat + r * Math.sin(t) * sy;
    if (inDistrict(x, y, d)) return { lat: y, lng: x };
  }
  return { lat: d.lat, lng: d.lon };
}

// ---- Endpoint adapters ----

interface UpRisk {
  district_id: string;
  district_name: string;
  lat: number;
  lon: number;
  risk_score: number; // 0–1
  rank: number;
  detections_7d: number;
  cases_14d: number;
  weather_factor: number;
  cases_simulated: boolean;
  disease: string | null;
}

interface UpDetection {
  time: string;
  detection_id: string;
  country: Country;
  district_id: string;
  district_name: string;
  lat: number;
  lon: number;
  genus: Genus | null;
  species: string | null;
  confidence: number | null;
  source: "phone" | "trap";
  is_simulated: boolean;
}

export async function getDetections(country: Country, since?: string): Promise<DetectionsResponse> {
  const qs = new URLSearchParams({ country, limit: "20000", ...(since ? { since } : {}) });
  const [{ detections }, districts] = await Promise.all([
    upstream<{ detections: UpDetection[] }>(`/detections?${qs}`),
    districtsById(),
  ]);
  return {
    country,
    detections: detections.map((d): Detection => {
      const p = placeInDistrict(d.detection_id, districts.get(d.district_id), d.lat, d.lon);
      return {
        detection_id: d.detection_id,
        time: d.time,
        country: d.country,
        district: d.district_name,
        district_id: d.district_id,
        lat: p.lat,
        lng: p.lng,
        species: d.species,
        genus: d.genus ?? "other",
        confidence: d.confidence ?? 0,
        source: d.source,
        is_simulated: d.is_simulated,
      };
    }),
  };
}

export async function getRisk(country: Country): Promise<RiskResponse> {
  const [risk, recent] = await Promise.all([
    upstream<{ districts: UpRisk[] }>(`/risk?country=${country}`),
    upstream<{ detections: UpDetection[] }>(`/detections?country=${country}&limit=500`),
  ]);
  if (!risk.districts.length) throw new BackendError(`No risk rows for ${country}`);
  return {
    country,
    updated_at: new Date().toISOString(),
    // Labelled whenever any input is simulated: case history (Lagos, NYC) or seeded detections.
    is_simulated: risk.districts.some((d) => d.cases_simulated) || recent.detections.some((d) => d.is_simulated),
    districts: risk.districts.map(
      (d): DistrictRisk => ({
        district: d.district_name,
        district_id: d.district_id,
        country,
        lat: d.lat,
        lng: d.lon,
        risk_score: Math.round(d.risk_score * 100),
        rank: Number(d.rank),
        detections_7d: Number(d.detections_7d),
        cases_14d: Number(d.cases_14d),
        weather_factor: d.weather_factor,
        main_disease: d.disease ? toDisease(d.disease) : DEFAULT_DISEASE[country],
      }),
    ),
  };
}

interface UpForecast {
  district_id: string;
  district_name: string;
  disease: string;
  week_start: string;
  weeks_ahead: 1 | 2 | 3 | 4;
  low: number;
  mid: number;
  high: number;
  simulated: boolean;
  unit: string;
}

export async function getForecast(district: string): Promise<ForecastResponse> {
  const id = await resolveDistrictId(district);
  const { forecasts } = await upstream<{ forecasts: UpForecast[] }>(`/forecast?district=${encodeURIComponent(id)}`);
  if (!forecasts.length) throw new BackendError(`No forecast for ${district}`, 404);
  const disease = forecasts[0].disease; // one disease per district today
  const rows = forecasts.filter((f) => f.disease === disease).sort((a, b) => a.weeks_ahead - b.weeks_ahead);
  return {
    district: rows[0].district_name,
    district_id: id,
    country: id.slice(0, 2) as Country,
    disease: toDisease(disease),
    is_simulated: rows.some((r) => r.simulated),
    unit: rows[0].unit,
    weeks: rows.map((r) => ({ week_ahead: r.weeks_ahead, week_start: r.week_start, low: r.low, mid: r.mid, high: r.high })),
  };
}

interface UpClassify {
  detection_id: string;
  is_mosquito: boolean;
  species: string | null;
  genus: Genus | null;
  confidence: number | null;
  top3: { species: string; p: number }[];
  diseases: string[];
  gate_score?: number;
  model_version: string;
}

/** Ids the phone sends with each clip, so a retried upload is recognised as the same clip. */
export interface ClipMeta {
  clientId?: string;
  recordedAt?: string;
  device?: string;
  filename?: string;
}

export async function classify(audio: Blob, country: Country, district: string, meta: ClipMeta = {}): Promise<ClassifyResponse> {
  const form = new FormData();
  form.append("audio", audio, meta.filename || "clip");
  form.append("client_id", meta.clientId || crypto.randomUUID());
  form.append("recorded_at", meta.recordedAt || new Date().toISOString());
  form.append("country", country);
  form.append("district_id", await resolveDistrictId(district, country));
  form.append("source", "phone");
  form.append("device", meta.device || "web");
  if (audio.type) form.append("mime", audio.type);
  const r = await upstream<UpClassify>("/classify", { method: "POST", body: form }, 30_000);
  // The genus call is the reliable one and decides the diseases; the species is only a closest match
  // and can come from another genus ("Aedes albopictus" under an Anopheles call). Show the closest
  // species within the called genus, or none (the screen then shows the genus only).
  const inGenus = (s: string | null | undefined) => !!s && !!r.genus && s.split(" ")[0].toLowerCase() === r.genus;
  const species = inGenus(r.species) ? r.species : (r.top3 ?? []).find((t) => inGenus(t.species))?.species ?? null;
  return {
    detection_id: r.detection_id,
    is_mosquito: r.is_mosquito,
    species,
    genus: r.genus,
    confidence: r.confidence ?? 0,
    top3: (r.top3 ?? []).map((t) => ({ species: t.species, probability: t.p })),
    diseases: r.diseases.map(toDisease),
    is_simulated: false,
    gate_score: r.gate_score,
    model_version: r.model_version,
  };
}
