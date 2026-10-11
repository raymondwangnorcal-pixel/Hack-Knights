import { getRisk } from "@/lib/backend";
import { CORS, COUNTRIES, apiError, authorize, isCountry } from "@/lib/apiKeys";

// Model API: current risk per district. No sample-data fallback: callers get the real error.
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const caller = authorize(request);
  if (caller instanceof Response) return caller;
  const country = new URL(request.url).searchParams.get("country")?.toUpperCase() ?? null;
  if (!isCountry(country)) {
    return Response.json({ error: `'country' must be one of ${COUNTRIES.join(", ")}` }, { status: 400, headers: caller.headers });
  }
  try {
    return Response.json(await getRisk(country), { headers: caller.headers });
  } catch (err) {
    return apiError(err, caller);
  }
}
