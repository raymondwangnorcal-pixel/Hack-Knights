// Reads from the Data/ML service when BUZZ_API_URL is set, but falls back to mock data whenever
// it can't answer (endpoint not built yet, error, timeout), so setting BUZZ_API_URL for
// /classify never blanks the district list or the dashboard. Failures are logged.
export async function upstreamOr<T>(path: string, fallback: () => T | null): Promise<Response> {
  const base = process.env.BUZZ_API_URL;
  const mock = () => {
    const data = fallback();
    return data ? Response.json(data) : Response.json({ error: "Not found" }, { status: 404 });
  };
  if (!base) return mock();
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return Response.json(await res.json());
    console.error(`upstream ${path}: ${res.status}; serving mock data`);
  } catch (err) {
    console.error(`upstream ${path}: ${String(err)}; serving mock data`);
  }
  return mock();
}
