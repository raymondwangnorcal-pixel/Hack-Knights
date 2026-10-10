import type { NextRequest } from "next/server";
import { USE_MOCKS, mockRisk, parseCountry } from "@/lib/mockData";
import { getRisk } from "@/lib/backend";
import { realOrSample } from "@/lib/fallback";

export async function GET(request: NextRequest) {
  const country = parseCountry(request.nextUrl.searchParams.get("country"));

  if (USE_MOCKS) return Response.json(mockRisk(country));

  return realOrSample(() => getRisk(country), () => mockRisk(country));
}
