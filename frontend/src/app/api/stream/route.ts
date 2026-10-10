import type { NextRequest } from "next/server";
import { parseCountry } from "@/lib/mockData";

// Relays the service's Server-Sent Events ('event: detection' per new live detection).
// Fine locally; on Vercel the function time limit cuts it and EventSource reconnects on its own.
export async function GET(request: NextRequest) {
  const api = process.env.BUZZ_API_URL;
  if (!api) return Response.json({ error: "BUZZ_API_URL is not set: no live stream with mocks" }, { status: 501 });
  const country = parseCountry(request.nextUrl.searchParams.get("country"));

  let res: Response;
  try {
    res = await fetch(`${api.replace(/\/$/, "")}/stream?country=${country}`, {
      cache: "no-store",
      signal: request.signal,
      headers: { Accept: "text/event-stream" },
    });
  } catch (err) {
    return Response.json({ error: `Stream unreachable: ${String(err)}` }, { status: 504 });
  }
  if (!res.ok || !res.body) {
    return Response.json({ error: `Stream returned ${res.status}` }, { status: 502 });
  }
  return new Response(res.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
