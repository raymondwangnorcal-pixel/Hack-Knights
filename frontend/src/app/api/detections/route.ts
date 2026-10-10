import type { NextRequest } from "next/server";
import { USE_MOCKS, mockDetections, parseCountry } from "@/lib/mockData";
import { errorResponse, getDetections } from "@/lib/backend";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const country = parseCountry(params.get("country"));
  const sinceRaw = params.get("since") ?? undefined;

  if (USE_MOCKS) return Response.json(mockDetections(country, sinceRaw ? new Date(sinceRaw) : undefined));

  try {
    return Response.json(await getDetections(country, sinceRaw));
  } catch (err) {
    return errorResponse(err);
  }
}
