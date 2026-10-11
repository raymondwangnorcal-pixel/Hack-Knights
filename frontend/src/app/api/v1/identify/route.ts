import { classify } from "@/lib/backend";
import { CORS, COUNTRIES, apiError, authorize, isCountry } from "@/lib/apiKeys";

// Model API: identify a mosquito from a clip. Multipart form: `audio` (3–10 s, any format ffmpeg
// reads), `country`, `district`. The result is stored as a real detection (device "api"), so it
// reaches the live map like a phone upload. No sample-data fallback: callers get the real error.

const MAX_BYTES = 10 * 1024 * 1024;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const caller = authorize(request);
  if (caller instanceof Response) return caller;
  const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: caller.headers });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Send multipart/form-data with 'audio', 'country' and 'district'.");
  }
  const audio = form.get("audio");
  const country = (form.get("country") as string | null)?.toUpperCase() ?? null;
  const district = (form.get("district") as string | null)?.trim();
  if (!(audio instanceof Blob)) return bad("Missing 'audio' file.");
  if (audio.size > MAX_BYTES) return bad("Clip is larger than 10 MB; send 3–10 seconds.", 413);
  if (!isCountry(country)) return bad(`'country' must be one of ${COUNTRIES.join(", ")}`);
  if (!district) return bad("Missing 'district'.");

  try {
    const r = await classify(audio, country, district, {
      device: "api",
      clientId: (form.get("client_id") as string | null) ?? undefined,
      filename: audio instanceof File && audio.name ? audio.name : undefined,
    });
    return Response.json({ ...r, organisation: caller.org }, { headers: caller.headers });
  } catch (err) {
    return apiError(err, caller);
  }
}
