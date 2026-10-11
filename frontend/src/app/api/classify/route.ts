import classifyMock from "@/mocks/classify.json";
import { parseCountry } from "@/lib/mockData";
import { BackendError, classify, errorResponse } from "@/lib/backend";
import { applyDemoOverride, demoOverrideOn } from "@/lib/demoOverride";
import type { ClassifyResponse, Country } from "@/lib/types";

// Sends the clip to the Data/ML FastAPI service through backend.ts (BUZZ_API_URL).
// The demo must never dead-end on stage, so whenever the model can't answer (not configured,
// 4xx/5xx, timeout, unreachable) this returns the sample result with `is_simulated: true` and a
// `fallback_reason` the screen shows as "Demo result". Failures are still logged for Vercel's logs.

function demo(country: Country, reason: string): Response {
  const table = classifyMock as Partial<Record<Country, ClassifyResponse>>;
  const mock = table[country] ?? table.NG!; // no US sample clip yet
  const body: ClassifyResponse = {
    ...mock,
    detection_id: `mock-${country}-${Date.now()}`,
    is_simulated: true,
    fallback_reason: reason,
  };
  return Response.json(body);
}

function reasonFor(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = /returned (\d{3})/.exec(message)?.[1];
  if (code) return `Model service returned ${code}`;
  if (err instanceof BackendError && err.status === 504) {
    return /timeout|aborted/i.test(message) ? "Model service timed out" : "Model service unreachable";
  }
  return "Model service error";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const audio = form.get("audio");
  const country = parseCountry(form.get("country") as string | null);
  const district = (form.get("district") as string | null) ?? "";

  if (!(audio instanceof Blob)) {
    return Response.json({ error: "Missing 'audio' file" }, { status: 400 });
  }

  if (!process.env.BUZZ_API_URL) return demo(country, "No model connected");

  if (!district) {
    return Response.json({ error: "Missing 'district'" }, { status: 400 });
  }

  // DEMO=true in Vercel: the stored row keeps the model's real output; only this response is
  // adjusted (see demoOverride.ts). Live mic rows are tagged "web+demo" in the device column so
  // they can be filtered out later; "sample" rows keep their device so they stay flagged simulated.
  const override = demoOverrideOn();
  const sentDevice = (form.get("device") as string | null) ?? undefined;
  const device = override && (!sentDevice || sentDevice === "web") ? "web+demo" : sentDevice;

  try {
    const result = await classify(audio, country, district, {
      clientId: (form.get("client_id") as string | null) ?? undefined,
      recordedAt: (form.get("recorded_at") as string | null) ?? undefined,
      device,
      filename: audio instanceof File && audio.name ? audio.name : undefined,
    });
    return Response.json(override ? applyDemoOverride(result, country) : result);
  } catch (err) {
    errorResponse(err); // logs "[backend] …"
    return demo(country, reasonFor(err));
  }
}
