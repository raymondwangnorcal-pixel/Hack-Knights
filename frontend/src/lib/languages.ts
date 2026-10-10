import type { Language } from "./types";

// Languages for advice text (Gemini) and spoken advice (ElevenLabs).
// `label` is shown in the picker; `promptName` tells Gemini exactly what to write.
export const LANGUAGES: { code: Language; label: string; promptName: string }[] = [
  { code: "en", label: "English", promptName: "English" },
  { code: "pt", label: "Português", promptName: "Brazilian Portuguese" },
  { code: "es", label: "Español", promptName: "Spanish" },
  { code: "fr", label: "Français", promptName: "French" },
  { code: "zh", label: "普通话", promptName: "Mandarin Chinese, written in Simplified Chinese" },
  { code: "yue", label: "廣東話", promptName: "Cantonese, written in Traditional Chinese" },
  { code: "yo", label: "Yorùbá", promptName: "Yoruba" },
  { code: "ha", label: "Hausa", promptName: "Hausa" },
];

export function parseLanguage(value: string | null | undefined): Language {
  return LANGUAGES.find((l) => l.code === value)?.code ?? "en";
}

export function promptName(code: Language): string {
  return LANGUAGES.find((l) => l.code === code)?.promptName ?? "English";
}
