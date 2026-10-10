import classifyMock from "@/mocks/classify.json";
import { parseCountry } from "@/lib/mockData";
import { classify, errorResponse } from "@/lib/backend";
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

  if (!process.env.BUZZ_API_URL) {
    const mock = (classifyMock as Record<Country, ClassifyResponse>)[country];
    return Response.json({
      ...mock,
      detection_id: `mock-${country}-${Date.now()}`,
    });
  }

  if (!district) {
    return Response.json({ error: "Missing 'district'" }, { status: 400 });
  }

  try {
    return Response.json(await classify(audio, country, district));
  } catch (err) {
    return errorResponse(err);
  }
}
