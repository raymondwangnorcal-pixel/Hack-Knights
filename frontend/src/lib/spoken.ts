import type { Language, PreventionResponse } from "./types";

// What a Prevention card reads aloud. Only text already in the chosen language is spoken, always in
// that language's voice: an untranslated action is skipped rather than read in English, and the
// English voice is never swapped in for another language. `translated` is false when any action is
// not in the chosen language, so the card can say so; with nothing to read, the play button hides.

const inLanguage = (data: PreventionResponse, language: Language) =>
  data.actions.filter((a) => language === "en" || (a.language ?? data.language) === language);

const stopFor = (language: Language) => (language === "zh" || language === "yue" ? "。" : ".");

/** The full plan: each action's title followed by its reason. */
export function pickSpokenFull(data: PreventionResponse, language: Language): { lines: string[]; voice: Language; translated: boolean } {
  const end = (s: string, stop: string) => s.trim().replace(/[.。!！]+$/, "") + stop;
  const actions = inLanguage(data, language);
  return {
    lines: actions.map((a) => `${end(a.title, stopFor(language))} ${a.reason.trim()}`),
    voice: language,
    translated: actions.length === data.actions.length,
  };
}

/** Just the titles (the For you card). */
export function pickSpoken(data: PreventionResponse, language: Language): { titles: string[]; voice: Language; translated: boolean } {
  const actions = inLanguage(data, language);
  return { titles: actions.map((a) => a.title), voice: language, translated: actions.length === data.actions.length };
}
