import type { NextRequest } from "next/server";
import { USE_MOCKS, mockForecast } from "@/lib/mockData";

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

  const res = await fetch(
    `${process.env.BUZZ_API_URL}/forecast?district=${encodeURIComponent(district)}`,
    { cache: "no-store" },
  );
  return Response.json(await res.json(), { status: res.status });
}
