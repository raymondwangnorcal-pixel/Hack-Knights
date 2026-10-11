// What the intro maps say on hover, by region (keys match worldRegions.ts).
//
// Sources (2024 data):
//   WHO World Malaria Report 2025: 282M cases / 610,000 deaths worldwide; African Region 265M cases
//     (95%) and 579,000 deaths (95%); Americas 663,000 cases and 504 deaths; Eastern Mediterranean
//     11.1M cases in 7 countries. 75% of African Region malaria deaths are children under five.
//   WHO Weekly Epidemiological Record 100(52), dengue 2024: 14.4M cases, 11,201 deaths; Americas >90%
//     of cases; Brazil >10M cases and 6,321 deaths; Indonesia 257,271 and India 232,425 cases;
//     >1M cases across South-East Asia and the Western Pacific.
//   ECDC West Nile virus 2024 season: 1,436 locally acquired cases and 125 deaths in Europe.
//
// Death bands are Culicid's estimate: those 2024 death counts against each region's population,
// banded (like WHO's deaths-per-million maps) because only Africa and the Americas have exact
// regional totals. The remaining ~30,000 malaria deaths fall across the Middle East and Asia.

export type RegionKey = "n" | "l" | "e" | "s" | "m" | "a" | "t" | "c" | "r" | "o";

export const REGION_NAMES: Record<RegionKey, string> = {
  n: "North America",
  l: "Latin America & Caribbean",
  e: "Europe",
  s: "Sub-Saharan Africa",
  m: "North Africa & Middle East",
  a: "South Asia",
  t: "Southeast Asia",
  c: "East Asia",
  r: "Russia & Central Asia",
  o: "Oceania",
};

/** Infected map: the main diseases in each region and a sourced figure where one exists. */
export const INFECTION_FACTS: Record<RegionKey, { disease: string; stat: string; also?: string }> = {
  s: { disease: "Malaria", stat: "265 million cases in 2024, 95% of the world's", also: "Yellow fever's main home too" },
  l: { disease: "Dengue", stat: "13+ million cases in 2024, over 90% of the world's", also: "Malaria: 663,000 cases · chikungunya · Zika · yellow fever" },
  m: { disease: "Malaria", stat: "11.1 million cases in 7 countries in 2024", also: "Recurrent dengue epidemics" },
  a: { disease: "Dengue", stat: "India: 232,425 reported cases in 2024", also: "Malaria · Japanese encephalitis" },
  t: { disease: "Dengue", stat: "Indonesia: 257,271 reported cases in 2024", also: "Malaria · Japanese encephalitis" },
  c: { disease: "Japanese encephalitis", stat: "Endemic across East and Southeast Asia", also: "Dengue in the south" },
  o: { disease: "Malaria", stat: "Concentrated in Papua New Guinea", also: "Dengue across the Pacific islands" },
  e: { disease: "West Nile virus", stat: "1,436 locally acquired cases in 2024", also: "Occasional local dengue in the south" },
  n: { disease: "West Nile virus", stat: "The leading mosquito-borne disease in the US", also: "Local dengue in Florida and Texas" },
  r: { disease: "Little transmission", stat: "Too cold or dry for most carriers" },
};

/** Death bands, deaths per million people per year (lightest → darkest). */
export const DEATH_BANDS = ["Under 1", "1–20", "20–200", "200–500+"] as const;

/** Death map: band index into DEATH_BANDS plus the fact behind it. Where a published 2024 death
 *  count exists for the region, `deaths` holds it and the label shows it instead of the band. */
export const DEATH_FACTS: Record<RegionKey, { band: 0 | 1 | 2 | 3; stat: string; deaths?: string }> = {
  s: { band: 3, deaths: "579,000", stat: "Malaria, 95% of the world's malaria deaths. 3 in 4 were children under five" },
  // Known counts only: Brazil's dengue deaths plus malaria deaths across the Americas (WHO).
  l: { band: 1, deaths: "6,825+", stat: "Dengue: 6,321 in Brazil alone. Malaria: 504 across the Americas" },
  m: { band: 1, stat: "Mostly malaria, part of ~30,000 deaths outside Africa" },
  a: { band: 1, stat: "Malaria and dengue" },
  t: { band: 1, stat: "Dengue and malaria" },
  o: { band: 1, stat: "Almost all in Papua New Guinea" },
  c: { band: 0, stat: "Few; Japanese encephalitis is the main risk" },
  e: { band: 0, deaths: "125", stat: "West Nile virus, locally acquired" },
  n: { band: 0, stat: "Mostly West Nile virus" },
  r: { band: 0, stat: "Almost none" },
};
