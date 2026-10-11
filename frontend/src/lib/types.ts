// Shared API contract for Mozzy.
// The Data/ML service and these Next.js routes must return exactly these shapes.
// See frontend/API_CONTRACT.md for the human-readable version.

export type Country = "BR" | "NG" | "US";
export type Language = "en" | "pt" | "es" | "fr" | "zh" | "yue" | "yo" | "ha";
export type Genus = "anopheles" | "aedes" | "culex" | "other";
export type Disease =
  | "malaria"
  | "dengue"
  | "zika"
  | "chikungunya"
  | "yellow_fever"
  | "lymphatic_filariasis"
  | "west_nile";

/** POST /api/classify -> FastAPI /classify */
export interface ClassifyResponse {
  detection_id: string;
  is_mosquito: boolean;
  species: string | null; // e.g. "Anopheles gambiae"; null when only the genus is confident
  genus: Genus | null;
  confidence: number; // 0–1
  top3: { species: string; probability: number }[];
  diseases: Disease[];
  is_simulated: boolean;
  gate_score?: number; // wingbeat tonality; mosquito if >= 0.20
  /** e.g. "pitch-rule-v1"; set when the real model answered */
  model_version?: string;
  /** Set when the model couldn't answer and this is the demo result instead, e.g. "Model service returned 422" */
  fallback_reason?: string;
}

/** GET /api/risk?country= */
export interface DistrictRisk {
  district: string; // display name
  district_id?: string; // service id, e.g. 'NG-LA-IKEJA'
  country: Country;
  lat: number;
  lng: number;
  risk_score: number; // 0–100
  rank: number;
  detections_7d: number;
  cases_14d: number;
  weather_factor: number; // 0–1
  main_disease: Disease;
}
export interface RiskResponse {
  country: Country;
  updated_at: string;
  is_simulated: boolean;
  districts: DistrictRisk[];
}

/** GET /api/detections?country=&since= */
export interface Detection {
  detection_id: string;
  time: string; // ISO
  country: Country;
  district: string;
  district_id?: string;
  lat: number;
  lng: number;
  species: string | null;
  genus: Genus;
  confidence: number;
  source: "phone" | "trap";
  is_simulated: boolean;
  opacity?: number; // 0..1, only for dots fading in or out on the Nigeria test map; absent means fully drawn
}
export interface DetectionsResponse {
  country: Country;
  detections: Detection[];
}

/** GET /api/forecast?district= */
export interface ForecastWeek {
  week_ahead: 1 | 2 | 3 | 4;
  week_start?: string; // ISO date (Sunday)
  low: number;
  mid: number;
  high: number;
}
export interface ForecastResponse {
  district: string;
  district_id?: string;
  country: Country;
  disease: Disease;
  is_simulated: boolean;
  unit?: string; // 'cases' | 'positive mosquito pools' (West Nile)
  weeks: ForecastWeek[];
}

/** GET /api/timeline?country=&weeks= (spread-over-time slider) */
export interface TimelineRow {
  week: string; // ISO date, Sunday-start
  district: string;
  district_id: string;
  detections: number;
  cases: number | null;
  cases_simulated: boolean;
}
export interface TimelineResponse {
  country: Country;
  weeks: number;
  rows: TimelineRow[];
}

/** POST /api/recommend */
export interface RecommendRequest {
  kind: "species_advice" | "district_plan";
  species?: string | null;
  genus?: Genus | null;
  district?: string;
  country?: Country;
  language?: Language; // defaults to "en"
  /** species_advice only: "paragraph" (default) or "steps" = exactly 3 short lines, one per step */
  format?: "paragraph" | "steps";
}
export interface RecommendResponse {
  text: string;
  source: "gemini" | "mock";
}

/** POST /api/prevention: three actions, for a household (listening screen) or a health team (For prevention). */
export interface PreventionRequest {
  country: Country;
  district: string;
  language?: Language;
  /** "household" (default; NG and BR) or "health_team" (NG, BR and US; grounded on risk and forecast). */
  audience?: "household" | "health_team";
  detection?: {
    genus: Genus | null;
    confidence: number;
    is_simulated: boolean;
  };
}

export interface PreventionAction {
  id: string;
  title: string;
  reason: string;
  sourceUrl: string;
  registryUrl?: string;
  language?: Language;
}

export interface PreventionResponse {
  actions: PreventionAction[];
  source: "gemini" | "rules";
  basis: "local" | "general";
  context: string;
  language: Language;
  /** health_team only: true when any input behind the plan is simulated demo data. */
  is_simulated?: boolean;
}

/** POST /api/voice -> returns audio/mpeg bytes */
export interface VoiceRequest {
  text: string;
  language?: Language;
}

/** GET /api/voice -> languages that have a voice configured */
export interface VoiceLanguagesResponse {
  languages: Language[];
}
