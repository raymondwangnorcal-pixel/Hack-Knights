import classifyMock from "@/mocks/classify.json";
import { parseCountry } from "@/lib/mockData";
import type { ClassifyResponse, Country } from "@/lib/types";

// Proxies the audio clip to the Data/ML FastAPI service.
// Falls back to a mock result when BUZZ_API_URL is not set.
export async function POST(request: Request) {
  const form = await request.formData();
  const audio = form.get("audio");
  const country = parseCountry(form.get("country") as string | null);
  const district = (form.get("district") as string | null) ?? "";

  if (!(audio instanceof Blob)) {
    return Response.json({ error: "Missing 'audio' file" }, { status: 400 });
  }

  const apiUrl = process.env.BUZZ_API_URL;
  if (!apiUrl) {
    const mock = (classifyMock as Record<Country, ClassifyResponse>)[country];
    return Response.json({
      ...mock,
      detection_id: `mock-${country}-${Date.now()}`,
    });
  }

  const upstream = new FormData();
  upstream.append("audio", audio, audio instanceof File && audio.name ? audio.name : "clip.webm");
  upstream.append("country", country);
  upstream.append("district", district);

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/classify`, {
      method: "POST",
      body: upstream,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return Response.json(
        { error: `Model service returned ${res.status}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as ClassifyResponse;
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: "Model service unreachable", detail: String(err) },
      { status: 504 },
    );
  }
}
