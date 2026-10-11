import { connection } from "next/server";
import { LANGUAGES, parseLanguage } from "@/lib/languages";
import type { Language, VoiceLanguagesResponse, VoiceRequest } from "@/lib/types";

// Spoken advice through ElevenLabs.
//   GET  /api/voice                     -> { languages } that have a voice configured
//   GET  /api/voice?lang=ha&text=...    -> audio/mpeg, cacheable (CDN + browser), used by the screen
//   POST /api/voice { text, language }  -> audio/mpeg, uncached (kept for other callers)
//
// A language is spoken only when it has its own voice ID, e.g. ELEVENLABS_VOICE_EN. Yoruba and
// Cantonese have no ElevenLabs model, so they stay unset and text-only (see docs/decisions.md).

const MAX_CHARS = 1500; // a full action plan with reasons is ~900 characters; this caps any one request's credit cost

function voiceFor(language: Language) {
  return process.env[`ELEVENLABS_VOICE_${language.toUpperCase()}`];
}

// Some languages need a different model (e.g. ELEVENLABS_MODEL_HA=eleven_v3: only v3+ speaks Hausa).
function modelFor(language: Language) {
  return (
    process.env[`ELEVENLABS_MODEL_${language.toUpperCase()}`] ??
    process.env.ELEVENLABS_MODEL ??
    "eleven_multilingual_v2"
  );
}

async function synthesize(text: string, language: Language): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = voiceFor(language);
  const noStore = { "Cache-Control": "no-store" };

  if (!text.trim()) return Response.json({ error: "Missing 'text'" }, { status: 400, headers: noStore });
  if (text.length > MAX_CHARS) {
    return Response.json({ error: `Text over ${MAX_CHARS} characters` }, { status: 413, headers: noStore });
  }
  if (!key || !voiceId) {
    return Response.json(
      {
        error: `Voice not configured for "${language}". Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_${language.toUpperCase()}.`,
      },
      { status: 501, headers: noStore },
    );
  }

  // ELEVENLABS_API_BASE exists only so tests can point at a stand-in server.
  const base = process.env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io";
  try {
    const res = await fetch(`${base}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": key, Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: modelFor(language) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`voice: ElevenLabs returned ${res.status}`, detail.slice(0, 300));
      return Response.json({ error: `ElevenLabs returned ${res.status}` }, { status: 502, headers: noStore });
    }
    return new Response(res.body, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (err) {
    console.error("voice: ElevenLabs unreachable", String(err));
    return Response.json({ error: "ElevenLabs unreachable" }, { status: 504, headers: noStore });
  }
}

export async function GET(request: Request) {
  await connection(); // read env at request time, not at build
  const params = new URL(request.url).searchParams;
  const text = params.get("text");

  if (text === null) {
    const res: VoiceLanguagesResponse = {
      languages: process.env.ELEVENLABS_API_KEY
        ? LANGUAGES.map((l) => l.code).filter((code) => voiceFor(code))
        : [],
    };
    return Response.json(res, { headers: { "Cache-Control": "no-store" } });
  }

  const res = await synthesize(text, parseLanguage(params.get("lang")));
  if (!res.ok) return res;
  // Same text + language always gives the same audio, so let the CDN and the phone keep it:
  // repeat demos cost no ElevenLabs credits and survive a flaky connection.
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "public, max-age=604800, s-maxage=31536000, immutable");
  return new Response(res.body, { status: 200, headers });
}

export async function POST(request: Request) {
  const body = (await request.json()) as VoiceRequest;
  return synthesize(body.text ?? "", parseLanguage(body.language));
}
