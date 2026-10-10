"""Species and genus -> diseases they can carry (spec's table). Grounding for advice; never 'infected'."""

GENUS_DISEASES = {
    "anopheles": ["malaria"],
    "aedes": ["dengue", "zika", "chikungunya", "yellow fever"],
    "culex": ["lymphatic filariasis", "west nile"],
}

# Abuzz folder name -> (display species, genus)
SPECIES = {
    "Anopheles_gambiae": ("Anopheles gambiae", "anopheles"),
    "Anopheles_arabiensis": ("Anopheles arabiensis", "anopheles"),
    "Anopheles_stephensi": ("Anopheles stephensi", "anopheles"),
    "Aedes_aegypti": ("Aedes aegypti", "aedes"),
    "Aedes_albopictus": ("Aedes albopictus", "aedes"),
    "Culex_quinquefasciatus": ("Culex quinquefasciatus", "culex"),
}


def diseases_for(genus: str | None) -> list[str]:
    return GENUS_DISEASES.get(genus or "", [])
