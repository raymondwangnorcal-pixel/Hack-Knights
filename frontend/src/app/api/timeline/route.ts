import type { NextRequest } from "next/server";
import { parseCountry } from "@/lib/mockData";
import { errorResponse, upstream } from "@/lib/backend";
import type { TimelineResponse, TimelineRow } from "@/lib/types";

// Week x district detections and cases, for the spread-over-time slider. No mock fallback yet.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const country = parseCountry(params.get("country"));
  const weeks = Math.min(156, Math.max(1, Number(params.get("weeks")) || 12));

  try {
    const data = await upstream<{
      rows: { week: string; district_id: string; district_name: string; detections: number; cases: number | null; cases_simulated: boolean }[];
    }>(`/timeline?country=${country}&weeks=${weeks}`);
    const res: TimelineResponse = {
      country,
      weeks,
      rows: data.rows.map(
        (r): TimelineRow => ({
          week: r.week,
          district: r.district_name,
          district_id: r.district_id,
          detections: r.detections,
          cases: r.cases,
          cases_simulated: r.cases_simulated,
        }),
      ),
    };
    return Response.json(res);
  } catch (err) {
    return errorResponse(err);
  }
}
