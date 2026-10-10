import type { NextRequest } from "next/server";
import { parseCountry } from "@/lib/mockData";
import { districtsById, errorResponse } from "@/lib/backend";

// District list with centroids; ?geojson=true adds outlines as [polygon][ring][point][lng, lat].
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const country = params.get("country") ? parseCountry(params.get("country")) : null;
  const withShapes = params.get("geojson") === "true";

  try {
    const all = await districtsById();
    const districts = [...all.values()]
      .filter((d) => !country || d.country === country)
      .map((d) => ({
        district_id: d.district_id,
        district: d.name,
        country: d.country,
        city: d.city,
        lat: d.lat,
        lng: d.lon,
        ...(withShapes ? { polygons: d.polygons } : {}),
      }));
    return Response.json({ districts });
  } catch (err) {
    return errorResponse(err);
  }
}
