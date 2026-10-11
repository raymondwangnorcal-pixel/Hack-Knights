import type { Language, PreventionAction } from "./types";
import { localizeAction, type ActionI18n } from "./localize.ts";

// Gemini writes the explanation ("reason") for each action, for this district right now.
// The built-in rules still decide which actions are safe to offer and their titles; Gemini ranks
// the optional ones and writes why each matters here, from the district's own numbers.
// Every written reason is checked: a number Gemini cites must appear in the data it was given, so it
// can't invent figures. A reason that fails falls back to the built-in text for that action alone,
// translated from the built-in tables (localize.ts) so the card never mixes in English.
//
// Reply contract (both audiences):
//   {"ids":["id1","id2","id3"],"actions":[{"id":"id1","title":"...","reason":"..."}, ...]}

export interface GeminiReply {
  ids?: unknown;
  actions?: unknown;
}

const MIN_REASON = 20;
const MAX_REASON = 420;
const MAX_TITLE = 120;
// Small counts and time spans a sentence may use without them being in the data ("3 actions", "72 hours").
const ALWAYS_ALLOWED = ["1", "2", "3", "4", "5", "6", "7", "10", "14", "24", "48", "72", "100"];

const numbersIn = (text: string): string[] => text.match(/\d+(?:[.,]\d+)?/g)?.map((n) => n.replace(",", ".")) ?? [];

/** Numbers Gemini may cite: anything in the district data or the candidate texts, plus small counts. */
export function allowedNumbers(data: unknown, candidates: PreventionAction[]): Set<string> {
  const text = `${JSON.stringify(data)} ${candidates.map((c) => `${c.title} ${c.reason}`).join(" ")}`;
  const set = new Set<string>(ALWAYS_ALLOWED);
  for (const n of numbersIn(text)) {
    set.add(n);
    const x = Number(n);
    if (Number.isFinite(x)) set.add(String(Math.round(x))); // 3.4 mm may be written as 3 mm
  }
  return set;
}

/** True when every number in `text` is allowed. */
export function numbersGrounded(text: string, allowed: Set<string>): boolean {
  return numbersIn(text).every((n) => allowed.has(n) || allowed.has(String(Math.round(Number(n)))));
}

interface ApplyOptions {
  language: Language;
  /** Whether the three chosen ids respect the audience's mandatory picks. */
  validIds: (ids: string[]) => boolean;
  allowed: Set<string>;
  /** Words a written title or reason must not contain (e.g. genus names on the household card). */
  forbid?: RegExp;
}

/**
 * Turns Gemini's reply into the three actions to show, or null when the picks themselves are invalid.
 * Each action carries Gemini's reason when it passes the checks, otherwise the built-in one.
 */
export function applyGeminiPlan(reply: GeminiReply | null, candidates: (PreventionAction & { i18n?: ActionI18n })[], opts: ApplyOptions): PreventionAction[] | null {
  const ids = reply?.ids;
  if (
    !Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3 ||
    !ids.every((id) => typeof id === "string" && candidates.some((c) => c.id === id)) ||
    !opts.validIds(ids as string[])
  ) {
    return null;
  }
  const written = Array.isArray(reply?.actions) ? (reply!.actions as unknown[]) : [];
  return (ids as string[]).map((id) => {
    const { i18n, ...original } = candidates.find((c) => c.id === id)!;
    const builtIn = localizeAction({ ...original, i18n }, opts.language);
    // Chemical (registry-linked) text stays curated word for word (the built-in translation).
    if (original.registryUrl) return builtIn;
    const w = written.find((x) => (x as { id?: unknown })?.id === id) as { title?: unknown; reason?: unknown } | undefined;
    const reason = typeof w?.reason === "string" ? w.reason.trim() : "";
    const reasonOk =
      reason.length >= MIN_REASON && reason.length <= MAX_REASON &&
      numbersGrounded(reason, opts.allowed) && !(opts.forbid?.test(reason));
    if (!reasonOk) return builtIn;
    if (opts.language === "en") return { ...original, reason };
    const title = typeof w?.title === "string" ? w.title.trim() : "";
    const titleOk = title.length > 0 && title.length <= MAX_TITLE && numbersGrounded(title, opts.allowed) && !(opts.forbid?.test(title));
    // A translated reason needs a translated title beside it; otherwise show the built-in pair.
    return titleOk ? { ...original, title, reason } : builtIn;
  });
}

/** The writing instructions shared by both prompts. */
export function writingRules(languageName: string, english: boolean): string[] {
  return [
    "For each chosen action, write its reason: one or two plain sentences (under 300 characters) saying why it matters in this district right now.",
    "Ground every reason in the data given (recent rain, detections, risk, rank, forecast, the mosquitoes seen) and in that candidate's own reason.",
    "Use only numbers that appear in the data or the candidates. Never invent numbers, products, doses, places or new instructions.",
    english
      ? "Write in English and keep each candidate's title exactly as given."
      : `Write each title and reason in ${languageName}. Keep every number as digits.`,
    "No prose outside JSON.",
  ];
}
