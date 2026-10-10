import { parseLanguage, promptName } from "@/lib/languages";
import { GENUS_INFO } from "@/lib/species";
import type { RecommendRequest, RecommendResponse } from "@/lib/types";

// Prompts are owned by the Pitch lead; swap the text in buildPrompt() when theirs are ready.
function buildPrompt(req: RecommendRequest): string {
  const lang = promptName(parseLanguage(req.language));
  if (req.kind === "species_advice") {
    const info = GENUS_INFO[req.genus ?? "other"];
    return [
      `You are a public health assistant. Reply only in ${lang}.`,
      `A phone just detected a mosquito: ${req.species ?? info.label} (genus ${info.label}).`,
      `It can carry: ${info.diseases.join(", ") || "unknown"}.`,
      `Rewrite ONLY these steps as 3 short, friendly sentences. Do not add new medical advice:`,
      ...info.nextSteps.map((s) => `- ${s}`),
    ].join("\n");
  }
  return [
    `You are advising a district health team. Reply only in ${lang}.`,
    `District: ${req.district}, country: ${req.country}.`,
    `Write 4 specific, practical prevention actions for the next 2 weeks`,
    `(larviciding, net or repellent distribution, community messaging, clinic readiness).`,
    `Keep each to one sentence. No preamble.`,
  ].join("\n");
}

function mockText(req: RecommendRequest): string {
  if (req.kind === "species_advice") {
    return GENUS_INFO[req.genus ?? "other"].nextSteps.join(" ");
  }
  return [
    `1. Treat standing water at markets and construction sites in ${req.district} this week.`,
    `2. Distribute treated nets or repellent to households in the highest-risk wards.`,
    `3. Send SMS and radio reminders about clearing water and sleeping under nets.`,
    `4. Ask clinics to stock rapid tests and rehydration supplies for a rise in cases.`,
  ].join("\n");
}

export async function POST(request: Request) {
  const body = (await request.json()) as RecommendRequest;
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    const res: RecommendResponse = { text: mockText(body), source: "mock" };
    return Response.json(res);
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(body) }] }] }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
      "";
    const out: RecommendResponse = { text: text || mockText(body), source: text ? "gemini" : "mock" };
    return Response.json(out);
  } catch {
    // Never break the demo: fall back to the grounded table.
    const out: RecommendResponse = { text: mockText(body), source: "mock" };
    return Response.json(out);
  }
}
