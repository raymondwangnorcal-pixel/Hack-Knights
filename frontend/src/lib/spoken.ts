import type { Language, PreventionResponse } from "./types";

/**
 * What the Prevention card reads aloud, and in which voice. Titles already in the chosen language
 * are spoken in that language's voice. When none are (Gemini and the built-in table both missed,
 * e.g. Yoruba), the English titles are spoken with the English voice rather than a foreign voice
 * reading English, and `translated` is false so the card can say so.
 */
/**
 * The full plan read aloud: each action's title followed by its reason. Reasons are only in the
 * chosen language when Gemini translated them; otherwise the whole plan is read in English with the
 * English voice, so a Yoruba voice never reads English sentences.
 */
export function pickSpokenFull(data: PreventionResponse, language: Language): { lines: string[]; voice: Language; translated: boolean } {
  const end = (s: string, stop: string) => s.trim().replace(/[.。!！]+$/, "") + stop;
  const allInLanguage = data.actions.every((a) => (a.language ?? data.language) === language);
  if (language === "en" || (data.source === "gemini" && allInLanguage)) {
    const stop = language === "zh" || language === "yue" ? "。" : ".";
    return { lines: data.actions.map((a) => `${end(a.title, stop)} ${a.reason.trim()}`), voice: language, translated: true };
  }
  return { lines: data.actions.map((a) => `${end(a.englishTitle ?? a.title, ".")} ${a.reason.trim()}`), voice: "en", translated: false };
}

export function pickSpoken(data: PreventionResponse, language: Language): { titles: string[]; voice: Language; translated: boolean } {
  const inLanguage = data.actions.filter((a) => (a.language ?? data.language) === language).map((a) => a.title);
  if (inLanguage.length) return { titles: inLanguage, voice: language, translated: true };
  return { titles: data.actions.map((a) => a.title), voice: "en", translated: language === "en" };
}
