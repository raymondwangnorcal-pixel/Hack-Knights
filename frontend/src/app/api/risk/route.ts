import type { NextRequest } from "next/server";
import { USE_MOCKS, mockRisk, parseCountry } from "@/lib/mockData";

export async function GET(request: NextRequest) {
  const country = parseCountry(request.nextUrl.searchParams.get("country"));

  if (USE_MOCKS) return Response.json(mockRisk(country));

  // TODO(Raymond): replace with a Tiger Data query once the Data/ML lead's tables are live.
  const res = await fetch(`${process.env.BUZZ_API_URL}/risk?country=${country}`, {
    cache: "no-store",
  });
  return Response.json(await res.json(), { status: res.status });
}
