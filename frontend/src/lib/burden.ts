// Global mosquito-borne disease burden used by the landing-page counters.
// Malaria: WHO World Malaria Report 2025 (2024 data): ~282M cases, ~610,000 deaths.
// Dengue: WHO global surveillance, 2024: 14.1M reported cases, 9,508 deaths
//   (Haider et al., International Journal of Infectious Diseases, 2025).
// Other mosquito-borne diseases (Zika, chikungunya, yellow fever...) are excluded,
// so these counters are a conservative floor.

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

export const ANNUAL_CASES = 282_000_000 + 14_100_000;
export const ANNUAL_DEATHS = 610_000 + 9_508;

export const CASES_PER_SECOND = ANNUAL_CASES / SECONDS_PER_YEAR; // ≈ 9.4
export const DEATHS_PER_SECOND = ANNUAL_DEATHS / SECONDS_PER_YEAR; // ≈ 0.0196
export const SECONDS_PER_DEATH = 1 / DEATHS_PER_SECOND; // ≈ 51
