import type { NextRequest } from "next/server";
import { USE_MOCKS, mockDetections, parseCountry } from "@/lib/mockData";
import { getDetections } from "@/lib/backend";
import { realOrSample } from "@/lib/fallback";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const country = parseCountry(params.get("country"));
  const sinceRaw = params.get("since") ?? undefined;
  const sample = () => mockDetections(country, sinceRaw ? new Date(sinceRaw) : undefined);

  if (USE_MOCKS) return Response.json(sample());

  return realOrSample(() => getDetections(country, sinceRaw), sample);
}
