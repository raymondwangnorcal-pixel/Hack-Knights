import { USE_MOCKS, mockForecast, mockRisk } from "@/lib/mockData";
import { districtsById, getDetections, getForecast, getRisk } from "@/lib/backend";
import { gatherPreventionContext, householdCandidates, preventionContextLine, type PreventionContext } from "@/lib/prevention";
import { healthTeamCandidates, healthTeamContextLine, healthTeamStats, type HealthTeamContext } from "@/lib/healthTeam";
import { buildHealthTeamPrompt } from "@/lib/healthTeamPrompt";
import { withBuiltinTitles } from "@/lib/actionTranslations";
import { allowedNumbers, applyGeminiPlan, writingRules } from "@/lib/geminiPlan";
import { parseLanguage, promptName } from "@/lib/languages";
import type {
  Country, Detection, DetectionsResponse, ForecastResponse, Genus, Language, PreventionAction, PreventionRequest,
  PreventionResponse, RiskResponse,
} from "@/lib/types";

const GENERA: Genus[] = ["aedes", "anopheles", "culex", "other"];
const geminiCache = new Map<string, { expiresAt: number; actions: PreventionAction[] }>();
// Gemini's free tier allows only a few requests a day, so its answers are kept in Vercel's shared
// Data Cache: every visitor and server instance reuses one answer per district, mosquito, rain
// level and language for GEMINI_REUSE_S. Only successful (200) replies are stored.
const GEMINI_REUSE_S = 6 * 60 * 60;
// After a quota error, skip Gemini on this instance for a while instead of asking on every tap.
let geminiPausedUntil = 0;

async function recentRain(lat: number, lng: number): Promise<number | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude: String(lat), longitude: String(lng), hourly: "rain", past_hours: "72", forecast_hours: "1", timeformat: "unixtime" }).toString();
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const hourly = (await res.json())?.hourly;
    const times: unknown[] = hourly?.time;
    const rain: unknown[] = hourly?.rain;
    if (!Array.isArray(times) || !Array.isArray(rain) || times.length !== rain.length) return null;
    const now = Date.now() / 1000;
    let total = 0;
    let hours = 0;
    for (let i = 0; i < times.length; i++) {
      const time = times[i];
      const amount = rain[i];
      if (typeof time === "number" && time <= now && time >= now - 72 * 3600 &&
          typeof amount === "number" && Number.isFinite(amount)) {
        total += amount;
        hours++;
      }
    }
    return hours >= 60 ? total : null;
  } catch {
    return null;
  }
}

async function prevalentGenus(country: Country, district: string): Promise<Exclude<Genus, "other"> | null> {
  if (!process.env.BUZZ_API_URL) return null;
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  try {
    // Through backend.ts, so detections arrive in the contract shape (district names, genus).
    const data: DetectionsResponse = await Promise.race([
      getDetections(country, since),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("detections timed out")), 5000)),
    ]);
    if (!Array.isArray(data.detections)) return null;
    const counts: Record<Exclude<Genus, "other">, number> = { aedes: 0, anopheles: 0, culex: 0 };
    for (const item of data.detections as Detection[]) {
      if (item.country === country && item.district === district && !item.is_simulated &&
          item.confidence >= 0.7 && item.time >= since && item.genus in counts) {
        counts[item.genus as keyof typeof counts] += 1;
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[1] >= 3 && sorted[0][1] > sorted[1][1] ? sorted[0][0] as Exclude<Genus, "other"> : null;
  } catch {
    return null;
  }
}

async function chooseWithGemini(candidates: ReturnType<typeof householdCandidates>, ctx: PreventionContext, language: ReturnType<typeof parseLanguage>) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const cacheKey = JSON.stringify({ ...ctx, rainMm: ctx.rainMm === null ? null : Math.round(ctx.rainMm), language });
  const cached = geminiCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.actions;
  if (geminiPausedUntil > Date.now()) return null;
  const remember = (actions: PreventionAction[]) => {
    if (geminiCache.size >= 128) geminiCache.delete(geminiCache.keys().next().value!);
    geminiCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, actions });
    return actions;
  };
  const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
  try {
    // GEMINI_API_BASE exists only so tests can point at a stand-in server.
    const base = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com";
    const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: [
          `You write the household mosquito prevention panel for residents of ${ctx.district}.`,
          "Choose exactly three action IDs, in priority order.",
          "The first two candidate IDs are mandatory; choose the better fit of the remaining two as the third.",
          `Context: ${JSON.stringify({ ...ctx, rainMm: ctx.rainMm === null ? null : Math.round(ctx.rainMm) })}. The context describes regional signals, not confirmed features of a user's property.`,
          "Write for a resident: warm, plain and specific to this district.",
          ...writingRules(promptName(language), language === "en"),
          "Keep Bti wording conditional and retain its registration and label warning. Do not name mosquito genera in titles or reasons; they appear only in the separate context line.",
          `Candidates: ${JSON.stringify(candidates.map(({ id, title, reason }) => ({ id, title, reason })))}`,
          'Return JSON as {"ids":["id1","id2","id3"],"actions":[{"id":"id1","title":"...","reason":"..."},...]}',
        ].join("\n") }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1, thinkingConfig: { thinkingLevel: "low" } },
      }),
      signal: AbortSignal.timeout(20000),
      cache: "force-cache",
      next: { revalidate: GEMINI_REUSE_S },
    });
    if (!res.ok) {
      if (res.status === 429) geminiPausedUntil = Date.now() + 10 * 60_000;
      console.error(`prevention: Gemini returned ${res.status}`, (await res.text().catch(() => "")).slice(0, 500));
      return null;
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
    const actions = applyGeminiPlan(JSON.parse(raw), candidates, {
      language,
      validIds: (ids) => ids[0] === candidates[0].id && ids[1] === candidates[1].id && candidates.slice(2).some((a) => a.id === ids[2]),
      allowed: allowedNumbers(ctx, candidates),
      forbid: /\b(aedes|anopheles|culex)\b/i,
    });
    if (!actions) {
      console.error("prevention: Gemini picked invalid ids", raw.slice(0, 300), candidates.map((c) => c.id).join(","));
      return null;
    }
    return remember(actions);
  } catch (err) {
    console.error("prevention: Gemini call failed", String(err));
    return null;
  }
}

// The listening screen's district list comes from /api/risk, i.e. the Data/ML service's districts
// when BUZZ_API_URL is set, so validate against those; the mock list only when there is no service.
async function findDistrict(country: Country, name: string): Promise<{ district: string; lat: number; lng: number } | null> {
  const mock = () => mockRisk(country).districts.find((d) => d.district === name) ?? null;
  if (!process.env.BUZZ_API_URL) return mock();
  try {
    const all = await districtsById();
    const d = [...all.values()].find((x) => x.country === country && x.name === name);
    return d ? { district: d.name, lat: d.lat, lng: d.lon } : null;
  } catch (err) {
    console.error("prevention: district lookup failed, using the sample list", String(err));
    return mock();
  }
}

// ---------- Health-team plan (For prevention side) ----------

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))]);
}

// Same sources as /api/risk and /api/forecast: the Data/ML service when BUZZ_API_URL is set,
// the sample data otherwise or when the service fails, so the card never blanks mid-demo.
async function loadRisk(country: Country): Promise<RiskResponse> {
  if (USE_MOCKS) return mockRisk(country);
  try {
    return await withTimeout(getRisk(country), 8000, "risk");
  } catch (err) {
    console.error("prevention: risk lookup failed, using the sample list", String(err));
    return mockRisk(country);
  }
}

async function loadForecast(district: string): Promise<ForecastResponse | null> {
  if (USE_MOCKS) return mockForecast(district);
  try {
    return await withTimeout(getForecast(district), 8000, "forecast");
  } catch (err) {
    console.error("prevention: forecast lookup failed, using the sample forecast", String(err));
    return mockForecast(district);
  }
}

async function chooseHealthTeamWithGemini(candidates: PreventionAction[], ctx: HealthTeamContext, language: Language) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const cacheKey = JSON.stringify({ audience: "health_team", ...ctx, rainMm: ctx.rainMm === null ? null : Math.round(ctx.rainMm), language });
  const cached = geminiCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.actions;
  if (geminiPausedUntil > Date.now()) return null;
  const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
  try {
    const base = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com";
    const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildHealthTeamPrompt(candidates, ctx, promptName(language), language === "en") }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1, thinkingConfig: { thinkingLevel: "low" } },
      }),
      signal: AbortSignal.timeout(20000),
      cache: "force-cache",
      next: { revalidate: GEMINI_REUSE_S },
    });
    if (!res.ok) {
      if (res.status === 429) geminiPausedUntil = Date.now() + 10 * 60_000;
      console.error(`prevention (health team): Gemini returned ${res.status}`, (await res.text().catch(() => "")).slice(0, 500));
      return null;
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
    const actions = applyGeminiPlan(JSON.parse(raw), candidates, {
      language,
      validIds: (ids) => ids.includes(candidates[0].id),
      allowed: allowedNumbers({ ...ctx, rainMm: ctx.rainMm === null ? null : Math.round(ctx.rainMm) }, candidates),
    });
    if (!actions) {
      console.error("prevention (health team): Gemini picked invalid ids", raw.slice(0, 300), candidates.map((c) => c.id).join(","));
      return null;
    }
    if (geminiCache.size >= 128) geminiCache.delete(geminiCache.keys().next().value!);
    geminiCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, actions });
    return actions;
  } catch (err) {
    console.error("prevention (health team): Gemini call failed", String(err));
    return null;
  }
}

async function healthTeamPlan(body: PreventionRequest): Promise<Response> {
  if (body.country !== "NG" && body.country !== "BR" && body.country !== "US") {
    return Response.json({ error: "Choose a supported district" }, { status: 400 });
  }
  const country = body.country;
  const risk = await loadRisk(country);
  const district = risk.districts.find((d) => d.district === body.district);
  if (!district) return Response.json({ error: "Choose a supported district" }, { status: 400 });

  const [forecast, rainMm, regionalGenus] = await Promise.all([
    loadForecast(district.district),
    recentRain(district.lat, district.lng),
    prevalentGenus(country, district.district),
  ]);
  const weeks = [...(forecast?.weeks ?? [])].sort((a, b) => a.week_ahead - b.week_ahead);
  const last = weeks[weeks.length - 1];
  const ctx: HealthTeamContext = {
    country,
    district: district.district,
    disease: forecast?.disease ?? district.main_disease,
    riskScore: district.risk_score,
    rank: district.rank,
    districtCount: risk.districts.length,
    detections7d: district.detections_7d,
    cases14d: district.cases_14d,
    forecast: weeks.length && last
      ? { unit: forecast?.unit ?? "cases", week1: weeks[0].mid, week4: last.mid, low4: last.low, high4: last.high }
      : null,
    regionalGenus,
    rainMm,
    simulated: risk.is_simulated || !!forecast?.is_simulated,
  };
  const candidates = healthTeamCandidates(ctx);
  const language = parseLanguage(body.language);
  const chosen = await chooseHealthTeamWithGemini(candidates, ctx, language);
  // Without Gemini, titles still come back translated from the built-in table.
  const fallback = chosen ? null : withBuiltinTitles(candidates.slice(0, 3), language);
  const response: PreventionResponse = {
    actions: chosen ?? fallback!.actions,
    source: chosen ? "gemini" : "rules",
    basis: "local",
    context: healthTeamContextLine(ctx),
    stats: healthTeamStats(ctx),
    language: chosen ? language : fallback!.language,
    is_simulated: ctx.simulated,
  };
  return Response.json(response);
}

export async function POST(request: Request) {
  let body: PreventionRequest;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (body?.audience === "health_team") return healthTeamPlan(body);
  if ((body.country !== "NG" && body.country !== "BR") || typeof body.district !== "string") {
    return Response.json({ error: "Choose a supported district" }, { status: 400 });
  }
  const district = await findDistrict(body.country, body.district);
  if (!district) return Response.json({ error: "Choose a supported district" }, { status: 400 });

  const detection = body.detection;
  const detected = detection && !detection.is_simulated && detection.confidence >= 0.7 &&
    detection.genus && GENERA.includes(detection.genus) && detection.genus !== "other"
      ? detection.genus as Exclude<Genus, "other"> : null;
  const ctx = await gatherPreventionContext(
    { country: body.country, district: district.district, recordingGenus: detected },
    {
      rain: () => recentRain(district.lat, district.lng),
      regionalGenus: () => prevalentGenus(body.country, body.district),
    },
  );
  const candidates = householdCandidates(ctx);
  const requestedLanguage = parseLanguage(body.language);
  const chosen = await chooseWithGemini(candidates, ctx, requestedLanguage);
  // Without Gemini, titles still come back translated from the built-in table.
  const fallback = chosen ? null : withBuiltinTitles(candidates.slice(0, 3), requestedLanguage);
  const response: PreventionResponse = {
    actions: chosen ?? fallback!.actions,
    source: chosen ? "gemini" : "rules",
    basis: ctx.recordingGenus || ctx.regionalGenus ? "local" : "general",
    context: preventionContextLine(ctx),
    language: chosen ? requestedLanguage : fallback!.language,
  };
  return Response.json(response);
}
