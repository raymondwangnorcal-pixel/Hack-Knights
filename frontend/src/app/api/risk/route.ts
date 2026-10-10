import type { NextRequest } from "next/server";
import { mockRisk, parseCountry } from "@/lib/mockData";
import { upstreamOr } from "@/lib/upstream";

export async function GET(request: NextRequest) {
  const country = parseCountry(request.nextUrl.searchParams.get("country"));
  // TODO(Raymond): replace with a Tiger Data query once the Data/ML lead's tables are live.
  return upstreamOr(`/risk?country=${country}`, () => mockRisk(country));
}
