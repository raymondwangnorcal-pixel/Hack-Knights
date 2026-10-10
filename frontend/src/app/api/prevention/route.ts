import { mockRisk } from "@/lib/mockData";
import { getDetections } from "@/lib/backend";
import { gatherPreventionContext, householdCandidates, preventionContextLine, type PreventionContext } from "@/lib/prevention";
import { parseLanguage, promptName } from "@/lib/languages";
import type { Country, Detection, DetectionsResponse, Genus, PreventionAction, PreventionRequest, PreventionResponse } from "@/lib/types";

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
          "Choose exactly three action IDs for a household mosquito prevention panel, in priority order.",
          "The first two candidate IDs are mandatory; choose one of the remaining two as the third.",
          `Context: ${JSON.stringify({ ...ctx, rainMm: ctx.rainMm === null ? null : Math.round(ctx.rainMm) })}. The context describes regional signals, not confirmed features of a user's property.`,
          `For each selected action, translate its title and reason into ${promptName(language)} without adding facts, products, doses, or instructions.`,
          "Keep Bti wording conditional and retain its registration and label warning. Do not add genus names to action titles or reasons; they appear only in the separate context line. No prose outside JSON.",
          `Candidates: ${JSON.stringify(candidates.map(({ id, title, reason }) => ({ id, title, reason })))}`,
          'Return JSON as {"ids":["id1","id2","id3"],"translations":[{"id":"id1","title":"...","reason":"..."},...]}',
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
    const generated = JSON.parse(raw);
    const ids = generated?.ids;
    if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3 ||
        ids[0] !== candidates[0].id || ids[1] !== candidates[1].id ||
        !candidates.slice(2).some((a) => a.id === ids[2])) {
      console.error("prevention: Gemini picked invalid ids", JSON.stringify(ids), candidates.map((c) => c.id).join(","));
      return null;
    }
    const chosen = ids.map((id: string) => candidates.find((a) => a.id === id)!);
    if (language === "en") return remember(chosen);
    const translations = generated?.translations;
    if (!Array.isArray(translations) || translations.length !== 3) return null;
    return remember(chosen.map((original, i) => {
      const t = translations[i];
      if (t?.id !== original.id || typeof t.title !== "string" || typeof t.reason !== "string" ||
          t.title.length > 100 || t.reason.length > 500 || !t.title.trim() || !t.reason.trim() ||
          /\b(aedes|anopheles|culex)\b/i.test(`${t.title} ${t.reason}`)) throw new Error("Invalid translation");
      // Chemical text stays curated until country-specific translations have been reviewed.
      return original.id === "bti-option" ? { ...original, language: "en" as const } : { ...original, title: t.title.trim(), reason: t.reason.trim() };
    }));
  } catch (err) {
    console.error("prevention: Gemini call failed", String(err));
    return null;
  }
}

export async function POST(request: Request) {
  let body: PreventionRequest;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if ((body.country !== "NG" && body.country !== "BR") || typeof body.district !== "string") {
    return Response.json({ error: "Choose a supported district" }, { status: 400 });
  }
  const district = mockRisk(body.country).districts.find((d) => d.district === body.district);
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
  const response: PreventionResponse = {
    actions: chosen ?? candidates.slice(0, 3),
    source: chosen ? "gemini" : "rules",
    basis: ctx.recordingGenus || ctx.regionalGenus ? "local" : "general",
    context: preventionContextLine(ctx),
    language: chosen ? requestedLanguage : "en",
  };
  return Response.json(response);
}
