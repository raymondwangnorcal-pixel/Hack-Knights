import { parseLanguage, promptName } from "@/lib/languages";
import { GENUS_INFO } from "@/lib/species";
import { getForecast, getRisk } from "@/lib/backend";
import type { RecommendRequest, RecommendResponse } from "@/lib/types";

// Prompts are owned by the Pitch lead; swap the text in buildPrompt() when theirs are ready.
function buildPrompt(req: RecommendRequest, facts: string[] = []): string {
  const lang = promptName(parseLanguage(req.language));
  if (req.kind === "species_advice") {
    const info = GENUS_INFO[req.genus ?? "other"];
    if (req.format === "steps") {
      return [
        `You are a public health assistant. Reply only in ${lang}.`,
        `A phone just detected a mosquito: ${req.species ?? info.label} (genus ${info.label}).`,
        `Translate ONLY these steps, keeping each as a short command of at most 6 words.`,
        `Reply with exactly ${info.steps.length} lines, one step per line, no numbers, bullets or preamble:`,
        ...info.steps.map((s) => `- ${s}`),
      ].join("\n");
    }
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
    ...facts,
    `Write 4 specific, practical prevention actions for the next 2 weeks`,
    `(larviciding, net or repellent distribution, community messaging, clinic readiness).`,
    `Keep each to one sentence. No preamble.`,
  ].join("\n");
}

function mockText(req: RecommendRequest): string {
  if (req.kind === "species_advice") {
    const info = GENUS_INFO[req.genus ?? "other"];
    return req.format === "steps" ? info.steps.join("\n") : info.nextSteps.join(" ");
  }
  return [
    `1. Treat standing water at markets and construction sites in ${req.district} this week.`,
    `2. Distribute treated nets or repellent to households in the highest-risk wards.`,
    `3. Send SMS and radio reminders about clearing water and sleeping under nets.`,
    `4. Ask clinics to stock rapid tests and rehydration supplies for a rise in cases.`,
  ].join("\n");
}

// Current numbers for the district from the Data/ML service, so the plan is grounded in them.
// Best effort: the plan still generates without them, but the failure is logged.
async function districtFacts(req: RecommendRequest): Promise<string[]> {
  if (req.kind !== "district_plan" || !req.district || !req.country || !process.env.BUZZ_API_URL) return [];
  try {
    const [risk, forecast] = await Promise.all([getRisk(req.country), getForecast(req.district)]);
    const d = risk.districts.find((x) => x.district === req.district);
    const unit = forecast.unit ?? "cases";
    const sim = forecast.is_simulated ? " (simulated history)" : "";
    return [
      ...(d
        ? [`Risk score ${d.risk_score}/100, rank ${d.rank} of ${risk.districts.length} districts; ` +
           `${d.detections_7d} mosquito detections in the last 7 days; ${d.cases_14d} ${unit} in the last 14 days.`]
        : []),
      `Forecast ${forecast.disease.replace("_", " ")} ${unit} per week${sim}: ` +
        forecast.weeks.map((w) => `week ${w.week_ahead} ${Math.round(w.mid)} (${Math.round(w.low)}–${Math.round(w.high)})`).join(", ") + ".",
    ];
  } catch (err) {
    console.error("[recommend] could not load district facts", err);
    return [];
  }
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
        body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(body, await districtFacts(body)) }] }] }),
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
