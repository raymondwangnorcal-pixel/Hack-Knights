import { getForecast } from "@/lib/backend";
import { CORS, apiError, authorize } from "@/lib/apiKeys";

// Model API: 4-week forecast for one district. `district` is a name ("Alimosho") or an id
// ("NG-LA-ALIMOSHO"). No sample-data fallback: callers get the real error.
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const caller = authorize(request);
  if (caller instanceof Response) return caller;
  const district = new URL(request.url).searchParams.get("district");
  if (!district) return Response.json({ error: "Missing 'district'" }, { status: 400, headers: caller.headers });
  try {
    return Response.json(await getForecast(district), { headers: caller.headers });
  } catch (err) {
    return apiError(err, caller);
  }
}
