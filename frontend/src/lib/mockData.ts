import riskMock from "@/mocks/risk.json";
import type {
  Country,
  Detection,
  DetectionsResponse,
  ForecastResponse,
  Genus,
  RiskResponse,
} from "./types";

export const USE_MOCKS = !process.env.BUZZ_API_URL;

export function parseCountry(value: string | null): Country {
  return value === "BR" ? "BR" : "NG";
}

export function mockRisk(country: Country): RiskResponse {
  return (riskMock as Record<Country, RiskResponse>)[country];
}

// Small deterministic PRNG so mock detections are stable between reloads.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function mockDetections(country: Country, since?: Date): DetectionsResponse {
  const risk = mockRisk(country);
  const rand = rng(country === "NG" ? 42 : 7);
  const now = Date.parse(risk.updated_at);
  const days = 28;
  const genus: Genus = country === "NG" ? "anopheles" : "aedes";
  const species = country === "NG" ? "Anopheles gambiae" : "Aedes aegypti";
  const detections: Detection[] = [];
  let n = 0;

  for (const d of risk.districts) {
    // More detections in higher-risk districts, rising toward "now".
    const total = Math.round(d.detections_7d * 2.5);
    for (let i = 0; i < total; i++) {
      const ageDays = days * Math.pow(rand(), 1.6);
      const time = new Date(now - ageDays * 864e5);
      if (since && time < since) continue;
      detections.push({
        detection_id: `mock-${country}-${n++}`,
        time: time.toISOString(),
        country,
        district: d.district,
        lat: d.lat + (rand() - 0.5) * 0.04,
        lng: d.lng + (rand() - 0.5) * 0.04,
        species: rand() > 0.15 ? species : null,
        genus: rand() > 0.1 ? genus : "culex",
        confidence: Math.round((0.55 + rand() * 0.4) * 100) / 100,
        source: rand() > 0.9 ? "trap" : "phone",
        is_simulated: true,
      });
    }
  }

  detections.sort((a, b) => b.time.localeCompare(a.time));
  return { country, detections };
}

export function mockForecast(district: string): ForecastResponse | null {
  for (const country of ["NG", "BR"] as Country[]) {
    const d = mockRisk(country).districts.find((x) => x.district === district);
    if (!d) continue;
    const weekly = d.cases_14d / 2;
    const growth = 1 + (d.risk_score - 50) / 400;
    return {
      district,
      country,
      disease: d.main_disease,
      is_simulated: true,
      weeks: ([1, 2, 3, 4] as const).map((w) => {
        const mid = Math.round(weekly * Math.pow(growth, w));
        const spread = 0.12 + 0.06 * w; // wider range further out
        return {
          week_ahead: w,
          low: Math.round(mid * (1 - spread)),
          mid,
          high: Math.round(mid * (1 + spread)),
        };
      }),
    };
  }
  return null;
}
