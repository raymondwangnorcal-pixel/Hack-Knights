import type { PreventionAction } from "./types";
import type { HealthTeamContext } from "./healthTeam";

// PLACEHOLDER PROMPT for the "For prevention" recommendation card.
// Replace the text in buildHealthTeamPrompt() with the final prompt. Keep the reply contract
// below unchanged, or update validateHealthTeamReply() in app/api/prevention/route.ts to match:
//   {"ids":["id1","id2","id3"],"translations":[{"id":"id1","title":"...","reason":"..."}, ...]}
// - ids: exactly 3 candidate IDs, in priority order, and the first candidate must be included.
// - translations: only read when the language isn't English; one per chosen id, same order.

export function buildHealthTeamPrompt(
  candidates: PreventionAction[],
  ctx: HealthTeamContext,
  languageName: string,
): string {
  return [
    "You are advising a district health team on mosquito-borne disease prevention for the next two weeks.",
    "Choose exactly three action IDs from the candidates, in priority order.",
    `The first candidate (${candidates[0].id}) is mandatory; choose the other two that best fit the district's numbers.`,
    `District data: ${JSON.stringify({ ...ctx, rainMm: ctx.rainMm === null ? null : Math.round(ctx.rainMm) })}.`,
    "These numbers come from phone detections, case history and a prototype forecast; treat them as signals, not certainties.",
    `For each selected action, translate its title and reason into ${languageName}. Keep every number exactly as written and do not add facts, products, doses or instructions.`,
    "No prose outside JSON.",
    `Candidates: ${JSON.stringify(candidates.map(({ id, title, reason }) => ({ id, title, reason })))}`,
    'Return JSON as {"ids":["id1","id2","id3"],"translations":[{"id":"id1","title":"...","reason":"..."},...]}',
  ].join("\n");
}
