import type { VoiceRequest } from "@/lib/types";

// Returns spoken audio (audio/mpeg) from ElevenLabs.
// Voice IDs per language come from env, e.g. ELEVENLABS_VOICE_EN, ELEVENLABS_VOICE_PT.
export async function POST(request: Request) {
  const { text, language = "en" } = (await request.json()) as VoiceRequest;
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId =
    process.env[`ELEVENLABS_VOICE_${language.toUpperCase()}`] ?? process.env.ELEVENLABS_VOICE_EN;

  if (!text) return Response.json({ error: "Missing 'text'" }, { status: 400 });
  if (!key || !voiceId) {
    return Response.json(
      { error: "Voice not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_EN." },
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
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
    }),
  });

  if (!res.ok) {
    return Response.json({ error: `ElevenLabs returned ${res.status}` }, { status: 502 });
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg" } });
}
