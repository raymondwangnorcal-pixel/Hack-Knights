import type { Disease, Genus } from "./types";

// Grounding table for advice. Gemini rewrites these; it must not invent new guidance.
export const GENUS_INFO: Record<
  Genus,
  { label: string; diseases: Disease[]; nextSteps: string[] }
> = {
  anopheles: {
    label: "Anopheles",
    diseases: ["malaria"],
    nextSteps: [
      "Sleep under an insecticide-treated net tonight.",
      "If you get a fever in the next two weeks, get a malaria test.",
    ],
  },
  aedes: {
    label: "Aedes",
    diseases: ["dengue", "zika", "chikungunya", "yellow_fever"],
    nextSteps: [
      "Empty standing water around your home today.",
      "Use repellent during the day, when Aedes bite.",
      "Watch for fever, headache and joint pain.",
    ],
  },
  culex: {
    label: "Culex",
    diseases: ["lymphatic_filariasis", "west_nile"],
    nextSteps: [
      "Use screens and nets at night.",
      "Clear blocked drains and gutters.",
    ],
  },
  other: {
    label: "Unknown",
    diseases: [],
    nextSteps: ["Couldn't identify. Try again closer to the sound."],
  },
};

export const DISEASE_LABEL: Record<Disease, string> = {
  malaria: "Malaria",
  dengue: "Dengue",
  zika: "Zika",
  chikungunya: "Chikungunya",
  yellow_fever: "Yellow fever",
  lymphatic_filariasis: "Lymphatic filariasis",
  west_nile: "West Nile",
};
