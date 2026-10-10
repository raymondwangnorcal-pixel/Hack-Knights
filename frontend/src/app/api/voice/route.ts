import { connection } from "next/server";
import { LANGUAGES, parseLanguage } from "@/lib/languages";
import type { Language, VoiceLanguagesResponse, VoiceRequest } from "@/lib/types";

// A language is spoken only when it has its own voice ID, e.g. ELEVENLABS_VOICE_EN,
// ELEVENLABS_VOICE_YUE. Leave a language's variable unset until its voice has been tested.
function voiceFor(language: Language) {
  return process.env[`ELEVENLABS_VOICE_${language.toUpperCase()}`];
}

// Some languages need a different model (e.g. ELEVENLABS_MODEL_HA=eleven_v3).
function modelFor(language: Language) {
  return (
    process.env[`ELEVENLABS_MODEL_${language.toUpperCase()}`] ??
    process.env.ELEVENLABS_MODEL ??
    "eleven_multilingual_v2"
  );
}

// Lists the languages the UI may show a play button for.
export async function GET() {
  await connection(); // read env at request time, not at build
  const res: VoiceLanguagesResponse = {
    languages: process.env.ELEVENLABS_API_KEY
      ? LANGUAGES.map((l) => l.code).filter((code) => voiceFor(code))
      : [],
  };
  return Response.json(res);
}

// Returns spoken audio (audio/mpeg) from ElevenLabs.
export async function POST(request: Request) {
  const body = (await request.json()) as VoiceRequest;
  const language = parseLanguage(body.language);
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = voiceFor(language);

  if (!body.text) return Response.json({ error: "Missing 'text'" }, { status: 400 });
  if (!key || !voiceId) {
    return Response.json(
      {
        error: `Voice not configured for "${language}". Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_${language.toUpperCase()}.`,
      },
      { status: 501 },
    );
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": key,
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text: body.text, model_id: modelFor(language) }),
  });

  if (!res.ok) {
    return Response.json({ error: `ElevenLabs returned ${res.status}` }, { status: 502 });
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg" } });
}
