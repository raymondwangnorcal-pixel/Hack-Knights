import type { PreventionAction } from "./types";
import type { HealthTeamContext } from "./healthTeam";
import { writingRules } from "./geminiPlan";

// The Gemini prompt for the For prevention Action plan. Reply contract (checked by applyGeminiPlan):
//   {"ids":["id1","id2","id3"],"actions":[{"id":"id1","title":"...","reason":"..."}, ...]}
// - ids: exactly 3 candidate IDs, in priority order, and the first candidate must be included.
// - actions: one per chosen id, with Gemini's own reason written for this district.

export function buildHealthTeamPrompt(
  candidates: PreventionAction[],
  ctx: HealthTeamContext,
  languageName: string,
  english = languageName === "English",
): string {
  return [
    `You are advising the health team for ${ctx.district} on mosquito-borne disease prevention for the next two weeks.`,
    "Choose exactly three action IDs from the candidates, in priority order.",
    `The first candidate (${candidates[0].id}) is mandatory; choose the other two that best fit this district's numbers.`,
    `District data: ${JSON.stringify({ ...ctx, rainMm: ctx.rainMm === null ? null : Math.round(ctx.rainMm) })}.`,
    "These numbers come from phone detections, case history and a prototype forecast; treat them as signals, not certainties.",
    "Write for a health officer: specific, practical, citing this district's own figures.",
    ...writingRules(languageName, english),
    `Candidates: ${JSON.stringify(candidates.map(({ id, title, reason }) => ({ id, title, reason })))}`,
    'Return JSON as {"ids":["id1","id2","id3"],"actions":[{"id":"id1","title":"...","reason":"..."},...]}',
  ].join("\n");
}
