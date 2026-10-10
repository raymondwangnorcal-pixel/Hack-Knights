"""Load demo districts into Tiger Data's `districts` table.

Brazil: 10 Greater Sao Paulo municipalities (IBGE codes verified against InfoDengue).
Nigeria: the 20 Lagos State LGAs.

Usage (on the hotspot, Tiger needs a clean network):
    .venv/bin/python scripts/load_districts.py --dry-run    # print only, write nothing
    .venv/bin/python scripts/load_districts.py              # upsert into Tiger Data

Fails loudly (non-zero exit) if any expected district is missing or ambiguous.
"""
import json, os, sys, unicodedata
from pathlib import Path

import httpx
import psycopg
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parent.parent
GEO = ROOT / "data/raw/geoboundaries"

# IBGE code -> (name as InfoDengue reports it). Codes checked against the live API.
BR_DISTRICTS = {
    "3550308": "São Paulo", "3518800": "Guarulhos", "3534401": "Osasco",
    "3547809": "Santo André", "3548708": "São Bernardo do Campo",
    "3548807": "São Caetano do Sul", "3513801": "Diadema", "3529401": "Mauá",
    "3505708": "Barueri", "3552809": "Taboão da Serra",
}
BR_BBOX = (-24.2, -23.2, -47.0, -46.2)   # lat_min, lat_max, lon_min, lon_max (Greater Sao Paulo)

# Lagos State's 20 LGAs, normalized (lowercase letters only). Two spellings of Somolu.
LAGOS = {
    "agege", "ajeromiifelodun", "alimosho", "amuwoodofin", "apapa", "badagry", "epe",
    "etiosa", "ibejulekki", "ifakoijaye", "ikeja", "ikorodu", "kosofe", "lagosisland",
    "lagosmainland", "mushin", "ojo", "oshodiisolo", "somolu", "shomolu", "surulere",
}
LAGOS_BBOX = (6.35, 6.72, 2.68, 4.40)    # keeps Lagos's Surulere, drops Oyo's


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return "".join(ch for ch in s.lower() if ch.isalpha())


def ring_centroid(ring):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        f = x0 * y1 - x1 * y0
        a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f
    if a == 0:
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        return sum(xs) / len(xs), sum(ys) / len(ys), 0.0
    return cx / (3 * a), cy / (3 * a), abs(a) / 2


def centroid(geom):
    """Area-weighted centroid of the largest polygon, planar lon/lat (fine at city scale)."""
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    best = max((ring_centroid(p[0]) for p in polys), key=lambda c: c[2])
    return best[1], best[0]  # lat, lon


def round_coords(c, n=5):
    return round(c, n) if isinstance(c, float) else [round_coords(x, n) for x in c]


def load_features(code):
    path = GEO / f"geoBoundaries-{code}-ADM2-all" / f"geoBoundaries-{code}-ADM2_simplified.geojson"
    return json.load(open(path))["features"]


def in_box(lat, lon, box):
    return box[0] <= lat <= box[1] and box[2] <= lon <= box[3]


def row(district_id, country, city, name, feat, population):
    lat, lon = centroid(feat["geometry"])
    geom = {"type": feat["geometry"]["type"], "coordinates": round_coords(feat["geometry"]["coordinates"])}
    return dict(district_id=district_id, country=country, city=city, name=name,
                lat=lat, lon=lon, population=population, geojson=geom)


def brazil_rows():
    feats = load_features("BRA")
    rows, problems = [], []
    for ibge, name in BR_DISTRICTS.items():
        hits = [f for f in feats if norm(f["properties"]["shapeName"]) == norm(name)
                and in_box(*centroid(f["geometry"]), BR_BBOX)]
        if len(hits) != 1:
            problems.append(f"{name}: expected 1 match in geoBoundaries, found {len(hits)}")
            continue
        r = httpx.get("https://info.dengue.mat.br/api/alertcity", timeout=30, params=dict(
            geocode=ibge, disease="dengue", format="json", ew_start=1, ew_end=41, ey_start=2026, ey_end=2026))
        r.raise_for_status()
        data = r.json()
        if not data or data[0].get("municipio_nome") != name:
            problems.append(f"{name}: InfoDengue geocode {ibge} returned {data[0].get('municipio_nome') if data else 'nothing'}")
            continue
        rows.append(row(f"BR-{ibge}", "BR", "Sao Paulo", name, hits[0], int(data[0]["pop"])))
    return rows, problems


def lagos_rows():
    rows, problems, seen = [], [], set()
    for f in load_features("NGA"):
        n = f["properties"]["shapeName"]
        if norm(n) in LAGOS and in_box(*centroid(f["geometry"]), LAGOS_BBOX):
            did = "NG-LA-" + norm(n).upper()
            if did in seen:
                problems.append(f"{n}: matched twice inside the Lagos box")
                continue
            seen.add(did)
            rows.append(row(did, "NG", "Lagos", n, f, None))
    if len(rows) != 20:
        problems.append(f"expected 20 Lagos LGAs, found {len(rows)}: {sorted(r['name'] for r in rows)}")
    return rows, problems


def load_env():
    """Read PG* vars from .env. Deliberately ignores TIMESCALE_SERVICE_URL (stale password)."""
    for line in (ROOT / ".env").read_text().splitlines():
        k, _, v = line.partition("=")
        if k.startswith("PG"):
            os.environ[k] = v.strip().strip('"').strip("'")


def main():
    dry = "--dry-run" in sys.argv
    br, p1 = brazil_rows()
    ng, p2 = lagos_rows()
    problems = p1 + p2
    for r in br + ng:
        print(f"{r['district_id']:<26} {r['name']:<24} lat {r['lat']:8.4f} lon {r['lon']:9.4f} pop {r['population']}")
    print(f"\n{len(br)} Brazil + {len(ng)} Nigeria districts")
    if problems:
        print("\nPROBLEMS:", *problems, sep="\n  - ")
        sys.exit(1)
    if dry:
        print("dry run: nothing written")
        return
    load_env()
    with psycopg.connect(connect_timeout=15) as conn:
        with conn.cursor() as cur:
            for r in br + ng:
                cur.execute(
                    """INSERT INTO districts (district_id, country, city, name, centroid_lat, centroid_lon, population, geojson)
                       VALUES (%(district_id)s, %(country)s, %(city)s, %(name)s, %(lat)s, %(lon)s, %(population)s, %(g)s)
                       ON CONFLICT (district_id) DO UPDATE SET name = EXCLUDED.name,
                         centroid_lat = EXCLUDED.centroid_lat, centroid_lon = EXCLUDED.centroid_lon,
                         population = EXCLUDED.population, geojson = EXCLUDED.geojson""",
                    {**r, "g": Jsonb(r["geojson"])})
            cur.execute("SELECT country, count(*) FROM districts GROUP BY 1 ORDER BY 1")
            print("districts table now:", cur.fetchall())
    print("done")


if __name__ == "__main__":
    main()
