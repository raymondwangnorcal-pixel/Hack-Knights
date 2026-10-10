// Global mosquito-borne disease burden used by the landing-page counters.
// Annual estimates (latest available):
//   Malaria            ~282M cases,   ~610,000 deaths   WHO World Malaria Report 2025 (2024 data)
//   Dengue             14.1M cases,     9,508 deaths   WHO surveillance, 2024 (Haider et al., IJID 2025)
//   Yellow fever       67k–173k severe, 31k–82k deaths  WHO fact sheet, Oct 2025 (midpoints used)
//   Japanese enceph.   ~100,000 cases,  ~25,000 deaths  WHO fact sheet
//   Chikungunya        ~620,000 cases,      213 deaths  ECDC, 2024
// Zika, West Nile and lymphatic filariasis are excluded (no reliable annual global count),
// so these counters are a conservative floor.

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

export const DISEASES = [
  { name: "Malaria", cases: 282_000_000, deaths: 610_000 },
  { name: "Dengue", cases: 14_100_000, deaths: 9_508 },
  { name: "Yellow fever", cases: 120_000, deaths: 56_500 },
  { name: "Japanese encephalitis", cases: 100_000, deaths: 25_000 },
  { name: "Chikungunya", cases: 620_000, deaths: 213 },
] as const;

export const ANNUAL_CASES = DISEASES.reduce((s, d) => s + d.cases, 0); // ≈ 296.9M
export const ANNUAL_DEATHS = DISEASES.reduce((s, d) => s + d.deaths, 0); // ≈ 701,000

export const CASES_PER_SECOND = ANNUAL_CASES / SECONDS_PER_YEAR; // ≈ 9.4
export const DEATHS_PER_SECOND = ANNUAL_DEATHS / SECONDS_PER_YEAR; // ≈ 0.022
export const SECONDS_PER_DEATH = 1 / DEATHS_PER_SECOND; // ≈ 45
