import type { NextRequest } from "next/server";
import { USE_MOCKS, mockDetections, parseCountry } from "@/lib/mockData";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const country = parseCountry(params.get("country"));
  const sinceRaw = params.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : undefined;

  if (USE_MOCKS) return Response.json(mockDetections(country, since));

  const qs = new URLSearchParams({ country, ...(sinceRaw ? { since: sinceRaw } : {}) });
  const res = await fetch(`${process.env.BUZZ_API_URL}/detections?${qs}`, {
    cache: "no-store",
  });
  return Response.json(await res.json(), { status: res.status });
}
