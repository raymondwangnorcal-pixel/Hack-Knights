import classifyMock from "@/mocks/classify.json";
import { parseCountry } from "@/lib/mockData";
import { districtId } from "@/lib/districtIds";
import type { ClassifyResponse, Country, Disease, Genus } from "@/lib/types";

// Proxies the audio clip to the Data/ML FastAPI service (BUZZ_API_URL).
// The demo must never dead-end on stage, so whenever the model can't answer (not configured,
// 4xx/5xx, timeout, unreachable) this returns the mock result with `is_simulated: true` and a
// `fallback_reason` the screen shows as "Demo result". Failures are logged for Vercel's logs.

const UPSTREAM_TIMEOUT_MS = 20_000;

function demo(country: Country, reason: string): Response {
  const mock = (classifyMock as Record<Country, ClassifyResponse>)[country];
  const body: ClassifyResponse = {
    ...mock,
    detection_id: `mock-${country}-${Date.now()}`,
    is_simulated: true,
    fallback_reason: reason,
  };
  return Response.json(body);
}

/** What the FastAPI service returns (backend/app/main.py). */
interface UpstreamResult {
  detection_id: string;
  is_mosquito: boolean;
  species: string | null;
  genus: Genus | null;
  confidence: number | null;
  top3?: { species?: string; genus?: string; probability?: number; p?: number }[];
  diseases?: Disease[];
  model_version?: string;
}

function normalize(u: UpstreamResult): ClassifyResponse {
  return {
    detection_id: u.detection_id,
    is_mosquito: u.is_mosquito,
    species: u.species ?? null,
    genus: u.genus ?? null,
    confidence: u.confidence ?? 0,
    top3: (u.top3 ?? []).map((t) => ({
      species: t.species ?? t.genus ?? "unknown",
      probability: t.probability ?? t.p ?? 0,
    })),
    diseases: u.diseases ?? [],
    is_simulated: false,
    model_version: u.model_version,
  };
}

export async function POST(request: Request) {
  const form = await request.formData();
  const audio = form.get("audio");
  const country = parseCountry(form.get("country") as string | null);
  const district = (form.get("district") as string | null) ?? "";

  if (!(audio instanceof Blob)) {
    return Response.json({ error: "Missing 'audio' file" }, { status: 400 });
  }

  const apiUrl = process.env.BUZZ_API_URL;
  if (!apiUrl) return demo(country, "No model connected");

  // The phone sends a per-clip id and the time recording started; fill them in if it didn't,
  // so retries of the same clip are de-duplicated by the backend.
  const clientId = (form.get("client_id") as string | null) || crypto.randomUUID();
  const recordedAt = (form.get("recorded_at") as string | null) || new Date().toISOString();
  const name = audio instanceof File && audio.name ? audio.name : "clip.webm";

  const upstream = new FormData();
  upstream.append("audio", audio, name);
  upstream.append("client_id", clientId);
  upstream.append("recorded_at", recordedAt);
  upstream.append("country", country);
  upstream.append("district_id", districtId(country, district));
  upstream.append("source", "phone");
  upstream.append("device", (form.get("device") as string | null) || "web");
  if (audio.type) upstream.append("mime", audio.type);

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/classify`, {
      method: "POST",
      body: upstream,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`classify: model service returned ${res.status}`, detail.slice(0, 500));
      return demo(country, `Model service returned ${res.status}`);
    }
    return Response.json(normalize((await res.json()) as UpstreamResult));
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    console.error("classify: model service unreachable", String(err));
    return demo(country, timedOut ? "Model service timed out" : "Model service unreachable");
  }
}
