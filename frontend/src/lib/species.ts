import type { Disease, Genus } from "./types";

// Grounding table for advice. Gemini rewrites these; it must not invent new guidance.
// `steps` are the short imperative lines on the listening screen's Prevention panel;
// `nextSteps` are the same guidance as full sentences.
export const GENUS_INFO: Record<
  Genus,
  { label: string; diseases: Disease[]; nextSteps: string[]; steps: string[] }
> = {
  anopheles: {
    label: "Anopheles",
    diseases: ["malaria"],
    nextSteps: [
      "Sleep under an insecticide-treated net tonight.",
      "If you get a fever in the next two weeks, get a malaria test.",
    ],
    steps: ["Sleep under a treated net", "Get tested if a fever follows", "Repair window screens"],
  },
  aedes: {
    label: "Aedes",
    diseases: ["dengue", "zika", "chikungunya", "yellow_fever"],
    nextSteps: [
      "Empty standing water around your home today.",
      "Use repellent during the day, when Aedes bite.",
      "Watch for fever, headache and joint pain.",
    ],
    steps: ["Empty standing water today", "Wear repellent in the daytime", "Watch for fever and joint pain"],
  },
  culex: {
    label: "Culex",
    diseases: ["lymphatic_filariasis", "west_nile"],
    nextSteps: [
      "Use screens and nets at night.",
      "Clear blocked drains and gutters.",
    ],
    steps: ["Use screens and nets at night", "Clear blocked drains", "Drain standing water"],
  },
  other: {
    label: "Unknown",
    diseases: [],
    nextSteps: ["Couldn't identify. Try again closer to the sound."],
    steps: ["Move closer to the sound", "Try again somewhere quieter"],
  },
};

export const DISEASE_LABEL: Record<Disease, string> = {
  malaria: "Malaria",
  dengue: "Dengue",
  zika: "Zika",
  chikungunya: "Chikungunya",
  yellow_fever: "Yellow fever",
  lymphatic_filariasis: "Lymphatic filariasis",
  west_nile: "West Nile virus",
};

// Per-species detail for the result row. `main` is the disease this species is best known for
// spreading and `role` says how big a part it plays; `also` lists the rest it can carry.
// Species the model returns that aren't listed here fall back to their genus.
type Role = "Main carrier" | "Secondary carrier" | "Can carry";
export interface SpeciesInfo {
  common: string;
  main: Disease;
  role: Role;
  also: Disease[];
}

export const SPECIES_INFO: Record<string, SpeciesInfo> = {
  "Anopheles gambiae": { common: "African malaria mosquito", main: "malaria", role: "Main carrier", also: [] },
  "Anopheles arabiensis": { common: "Arabian malaria mosquito", main: "malaria", role: "Main carrier", also: [] },
  "Anopheles funestus": { common: "Funestus malaria mosquito", main: "malaria", role: "Main carrier", also: [] },
  "Anopheles stephensi": { common: "Asian malaria mosquito", main: "malaria", role: "Main carrier", also: [] },
  "Aedes aegypti": {
    common: "Yellow fever mosquito",
    main: "dengue",
    role: "Main carrier",
    also: ["zika", "chikungunya", "yellow_fever"],
  },
  "Aedes albopictus": {
    common: "Asian tiger mosquito",
    main: "dengue",
    role: "Secondary carrier",
    also: ["chikungunya", "zika"],
  },
  "Culex quinquefasciatus": {
    common: "Southern house mosquito",
    main: "lymphatic_filariasis",
    role: "Main carrier",
    also: ["west_nile"],
  },
  "Culex pipiens": { common: "Northern house mosquito", main: "west_nile", role: "Main carrier", also: [] },
};

/** The three diseases people ask about first; the result row says which of them a species can't carry. */
const HEADLINE: Disease[] = ["malaria", "dengue", "zika"];

export interface CarryInfo {
  main: Disease | null;
  role: Role | null;
  also: Disease[];
  /** Headline diseases this species does not carry, e.g. "Not malaria, dengue or Zika". */
  not: Disease[];
  common: string | null;
}

export function carryInfo(species: string | null, genus: Genus | null, diseases: Disease[]): CarryInfo {
  const known = species ? SPECIES_INFO[species] : undefined;
  const all = known ? [known.main, ...known.also] : diseases.length ? diseases : GENUS_INFO[genus ?? "other"].diseases;
  const main = known?.main ?? all[0] ?? null;
  return {
    main,
    role: known?.role ?? (main ? "Can carry" : null),
    also: all.filter((d) => d !== main),
    not: main ? HEADLINE.filter((d) => !all.includes(d)) : [],
    common: known?.common ?? null,
  };
}

/** "malaria, dengue or Zika" */
export function listOr(ds: Disease[]): string {
  // Zika and West Nile are place names, so they keep their capitals mid-sentence.
  const names = ds.map((d) => (d === "zika" || d === "west_nile" ? DISEASE_LABEL[d] : DISEASE_LABEL[d].toLowerCase()));
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
