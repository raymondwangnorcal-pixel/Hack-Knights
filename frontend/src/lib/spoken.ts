import type { Language, PreventionResponse } from "./types";

/**
 * What the Prevention card reads aloud, and in which voice. Titles already in the chosen language
 * are spoken in that language's voice. When none are (Gemini and the built-in table both missed,
 * e.g. Yoruba), the English titles are spoken with the English voice rather than a foreign voice
 * reading English, and `translated` is false so the card can say so.
 */
export function pickSpoken(data: PreventionResponse, language: Language): { titles: string[]; voice: Language; translated: boolean } {
  const inLanguage = data.actions.filter((a) => (a.language ?? data.language) === language).map((a) => a.title);
  if (inLanguage.length) return { titles: inLanguage, voice: language, translated: true };
  return { titles: data.actions.map((a) => a.title), voice: "en", translated: language === "en" };
}
