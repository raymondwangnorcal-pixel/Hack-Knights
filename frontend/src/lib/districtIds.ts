import type { Country } from "./types";

// Maps the district names shown on screen to the backend's `districts.district_id`.
// Mirrors scripts/load_districts.py on the backend branch:
//   Lagos LGAs   -> "NG-LA-" + name with accents and non-letters removed, upper-cased
//                   (Oshodi-Isolo -> NG-LA-OSHODIISOLO)
//   Sao Paulo    -> "BR-" + IBGE municipality code. The backend has Greater Sao Paulo
//                   municipalities, while the frontend lists neighbourhoods inside Sao Paulo
//                   city, so every one of them maps to Sao Paulo city for now.
// TODO(Data/ML): align the Sao Paulo list; then this can read the real list from the API.

const SAO_PAULO_CITY = "BR-3550308";

function lettersOnly(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function districtId(country: Country, district: string): string {
  if (country === "BR") return SAO_PAULO_CITY;
  return `NG-LA-${lettersOnly(district).toUpperCase()}`;
}
