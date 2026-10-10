import type { NextRequest } from "next/server";
import { mockForecast } from "@/lib/mockData";
import { upstreamOr } from "@/lib/upstream";

export async function GET(request: NextRequest) {
  const district = request.nextUrl.searchParams.get("district");
  if (!district) {
    return Response.json({ error: "Missing 'district'" }, { status: 400 });
  }
  return upstreamOr(`/forecast?district=${encodeURIComponent(district)}`, () => mockForecast(district));
}
