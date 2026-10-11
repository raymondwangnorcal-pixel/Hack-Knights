// Keys for the public Model API (/api/v1/*): health ministries, NGOs and researchers call the same
// model and data the app uses. One key per organisation, sent as "Authorization: Bearer <key>"
// (or an "x-api-key" header).
//
// The published key below ships with the code so the "How it's built" page can show a working
// example. More organisations are added with MOZZY_API_KEYS="Org name=key,Other org=key2"
// (server-side env var; Vercel → Environment Variables).

export const PUBLISHED_KEY = { org: "Partner org 001", key: "mzk_live_3f581ec8f1bcfb6ef05c70a6be57fbd1" };

export const RATE_LIMIT_PER_MIN = 60;

function keyring(): Map<string, string> {
  const ring = new Map([[PUBLISHED_KEY.key, PUBLISHED_KEY.org]]);
  for (const pair of (process.env.MOZZY_API_KEYS ?? "").split(",")) {
    const i = pair.lastIndexOf("=");
    if (i <= 0) continue;
    const org = pair.slice(0, i).trim();
    const key = pair.slice(i + 1).trim();
    if (org && key) ring.set(key, org);
  }
  return ring;
}

// Sliding one-minute window per key. Per server instance: good enough to stop a runaway loop,
// not a billing meter.
const recent = new Map<string, number[]>();

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, X-API-Key, Content-Type",
};

export interface Caller {
  org: string;
  headers: Record<string, string>;
}

function fail(status: number, error: string, extra: Record<string, string> = {}): Response {
  return Response.json({ error }, { status, headers: { ...CORS, ...extra } });
}

/** Returns the calling organisation, or the 401 / 429 response to send back. */
export function authorize(request: Request): Caller | Response {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const key = bearer ?? request.headers.get("x-api-key")?.trim();
  if (!key) return fail(401, "Missing API key. Send 'Authorization: Bearer <your key>'.");
  const org = keyring().get(key);
  if (!org) return fail(401, "Unknown API key.");

  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= RATE_LIMIT_PER_MIN) {
    const retry = Math.ceil((60_000 - (now - hits[0])) / 1000);
    return fail(429, `Rate limit: ${RATE_LIMIT_PER_MIN} requests a minute per key.`, { "Retry-After": String(retry) });
  }
  hits.push(now);
  recent.set(key, hits);

  return {
    org,
    headers: {
      ...CORS,
      "X-Mozzy-Org": org,
      "X-RateLimit-Limit": String(RATE_LIMIT_PER_MIN),
      "X-RateLimit-Remaining": String(RATE_LIMIT_PER_MIN - hits.length),
    },
  };
}

/** Errors from the model service, passed through with their status (no sample-data fallback). */
export function apiError(err: unknown, caller: Caller): Response {
  const message = err instanceof Error ? err.message : String(err);
  const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 500;
  console.error("[api/v1]", caller.org, message);
  const error = /BUZZ_API_URL is not set/.test(message) ? "Model service not connected." : message;
  return Response.json({ error }, { status: error === "Model service not connected." ? 503 : status, headers: caller.headers });
}

export const COUNTRIES = ["BR", "NG", "US"] as const;
export type ApiCountry = (typeof COUNTRIES)[number];
export const isCountry = (c: string | null): c is ApiCountry => !!c && (COUNTRIES as readonly string[]).includes(c);
