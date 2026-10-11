import { CORS, RATE_LIMIT_PER_MIN, authorize } from "@/lib/apiKeys";

// Model API index: checks the key and lists what it can call.
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export function GET(request: Request) {
  const caller = authorize(request);
  if (caller instanceof Response) return caller;
  return Response.json(
    {
      api: "mozzy",
      version: "v1",
      organisation: caller.org,
      rate_limit_per_minute: RATE_LIMIT_PER_MIN,
      endpoints: [
        { method: "POST", path: "/api/v1/identify", body: "multipart: audio, country, district", returns: "genus, confidence, closest species, diseases" },
        { method: "GET", path: "/api/v1/risk?country=NG", returns: "risk score 0–100 per district, with its inputs" },
        { method: "GET", path: "/api/v1/forecast?district=Alimosho", returns: "4 weeks of low / mid / high" },
      ],
    },
    { headers: caller.headers },
  );
}
