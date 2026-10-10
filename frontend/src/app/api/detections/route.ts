import type { NextRequest } from "next/server";
import { mockDetections, parseCountry } from "@/lib/mockData";
import { upstreamOr } from "@/lib/upstream";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const country = parseCountry(params.get("country"));
  const sinceRaw = params.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : undefined;
  const qs = new URLSearchParams({ country, ...(sinceRaw ? { since: sinceRaw } : {}) });
  return upstreamOr(`/detections?${qs}`, () => mockDetections(country, since));
}
