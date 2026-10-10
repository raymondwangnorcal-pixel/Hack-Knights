import type { NextRequest } from "next/server";
import { USE_MOCKS, mockForecast } from "@/lib/mockData";
import { getForecast } from "@/lib/backend";
import { realOrSample } from "@/lib/fallback";

// `district` may be a display name ("Alimosho") or a service id ("NG-LA-ALIMOSHO").
export async function GET(request: NextRequest) {
  const district = request.nextUrl.searchParams.get("district");
  if (!district) {
    return Response.json({ error: "Missing 'district'" }, { status: 400 });
  }

  if (USE_MOCKS) {
    const forecast = mockForecast(district);
    return forecast
      ? Response.json(forecast)
      : Response.json({ error: "Unknown district" }, { status: 404 });
  }

  // Unknown districts still return the backend's error (mockForecast gives null for them).
  return realOrSample(() => getForecast(district), () => mockForecast(district));
}
