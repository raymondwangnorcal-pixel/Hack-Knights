import type { NextRequest } from "next/server";
import { USE_MOCKS, mockRisk, parseCountry } from "@/lib/mockData";
import { errorResponse, getRisk } from "@/lib/backend";

export async function GET(request: NextRequest) {
  const country = parseCountry(request.nextUrl.searchParams.get("country"));

  if (USE_MOCKS) return Response.json(mockRisk(country));

  try {
    return Response.json(await getRisk(country));
  } catch (err) {
    return errorResponse(err);
  }
}
