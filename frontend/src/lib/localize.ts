import type { Language, PreventionAction } from "./types";
import en from "./i18n/en.json" with { type: "json" };
import pt from "./i18n/pt.json" with { type: "json" };
import es from "./i18n/es.json" with { type: "json" };
import fr from "./i18n/fr.json" with { type: "json" };
import zh from "./i18n/zh.json" with { type: "json" };
import yue from "./i18n/yue.json" with { type: "json" };
import yo from "./i18n/yo.json" with { type: "json" };
import ha from "./i18n/ha.json" with { type: "json" };

// Built-in translations of every prevention string (action titles and reasons for both cards, the
// evidence row, and the card's links), so a card is fully in the chosen language even when Gemini
// is rate-limited or one of its answers fails a check. en.json is the source; each language file has
// the same keys with the same {placeholders}. Machine translations, not professionally reviewed.

export type Phrase = { key: string; vars?: Record<string, string | number> };
/** How to rebuild an action's title and reason in another language. Server-side only. */
export type ActionI18n = { title: Phrase; reason: Phrase[] };

type Table = Record<string, string>;
const TABLES: Record<Language, Table> = { en, pt, es, fr, zh, yue, yo, ha };

export function tr(language: Language, key: string, vars: Phrase["vars"] = {}): string {
  const template = TABLES[language]?.[key] ?? TABLES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function phrase(key: string, vars?: Phrase["vars"]): Phrase {
  return vars ? { key, vars } : { key };
}

const joiner = (language: Language) => (language === "zh" || language === "yue" ? "" : " ");

/**
 * The action with its built-in title and reason in `language`, marked with that language. English
 * actions, and any without a recipe, come back unchanged (marked "en" when another language was asked).
 */
export function localizeAction(action: PreventionAction & { i18n?: ActionI18n }, language: Language): PreventionAction {
  const { i18n, ...rest } = action;
  if (language === "en") return rest;
  if (!i18n) return { ...rest, language: "en" };
  return {
    ...rest,
    title: tr(language, i18n.title.key, i18n.title.vars),
    reason: i18n.reason.map((p) => tr(language, p.key, p.vars)).join(joiner(language)),
    englishTitle: rest.title,
    language,
  };
}

/** Drops the server-side recipe before an action goes into a response. */
export function stripI18n(action: PreventionAction & { i18n?: ActionI18n }): PreventionAction {
  const { i18n: _drop, ...rest } = action;
  void _drop;
  return rest;
}
