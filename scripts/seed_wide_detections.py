"""Scatter SIMULATED detections across all of Brazil, Nigeria and the contiguous US (not just our 35 districts).

    .venv/bin/python scripts/seed_wide_detections.py        (hotspot needed for Tiger)

Where dots go (same geography as scripts/build_density.py, read from Tiger's density_cells):
  weight(cell) = (suitability/100)^3 * (0.25 + urban)^1.3  -> warm, wet, near water, near people
Dots are CLUMPED: persistent hotspots with heavy-tailed sizes and their own spread, plus 10% thin scatter.
A point is a random spot inside a chosen cell. Over 8 weeks, older weeks get fewer reports (the map shows the
last 7 days). All rows: is_simulated = true, device = 'seed-wide'. Re-running replaces them.
"""
import math, sys, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import psycopg

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.db import load_dotenv  # noqa: E402
from app.species import diseases_for  # noqa: E402

LAST_7_DAYS = {"BR": 3500, "NG": 3000, "US": 1200}      # dots visible on the map per country (US: off-season)
WEEK_FACTOR = [1.0, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35]  # reports per week going back; week 0 = last 7 days
GENUS_MIX = {"BR": {"aedes": 0.85, "culex": 0.10, "anopheles": 0.05},
             "NG": {"anopheles": 0.80, "culex": 0.15, "aedes": 0.05},
             "US": {"culex": 0.90, "aedes": 0.10}}
SPECIES = {"aedes": ["Aedes aegypti", "Aedes albopictus"],
           "anopheles": ["Anopheles gambiae", "Anopheles arabiensis", "Anopheles stephensi"],
           "culex": ["Culex quinquefasciatus"]}
NEAR = {  # place shown as "near X" in a dot's card
    "NG": [("Lagos", 6.5244, 3.3792), ("Abuja", 9.0765, 7.3986), ("Kano", 12.0022, 8.592), ("Ibadan", 7.3775, 3.947),
           ("Port Harcourt", 4.8156, 7.0498), ("Kaduna", 10.5105, 7.4165), ("Benin City", 6.335, 5.6037),
           ("Maiduguri", 11.8333, 13.15), ("Enugu", 6.4584, 7.5464), ("Sokoto", 13.0622, 5.2339), ("Jos", 9.8965, 8.8583),
           ("Ilorin", 8.4966, 4.5421), ("Calabar", 4.9517, 8.322), ("Yola", 9.2035, 12.4954)],
    "BR": [("São Paulo", -23.5505, -46.6333), ("Rio de Janeiro", -22.9068, -43.1729), ("Brasília", -15.7939, -47.8828),
           ("Salvador", -12.9777, -38.5016), ("Fortaleza", -3.7319, -38.5267), ("Belo Horizonte", -19.9167, -43.9345),
           ("Manaus", -3.119, -60.0217), ("Curitiba", -25.4284, -49.2733), ("Recife", -8.0476, -34.877),
           ("Porto Alegre", -30.0346, -51.2177), ("Belém", -1.4558, -48.4902), ("Goiânia", -16.6869, -49.2648),
           ("Cuiabá", -15.601, -56.0979), ("Campo Grande", -20.4697, -54.6201), ("Porto Velho", -8.7612, -63.9039),
           ("Rio Branco", -9.9747, -67.8243), ("Palmas", -10.1689, -48.3317), ("Teresina", -5.0892, -42.8019)],
    "US": [("New York", 40.7128, -74.006), ("Los Angeles", 34.0522, -118.2437), ("Chicago", 41.8781, -87.6298),
           ("Dallas", 32.7767, -96.797), ("Houston", 29.7604, -95.3698), ("Atlanta", 33.749, -84.388),
           ("Miami", 25.7617, -80.1918), ("Denver", 39.7392, -104.9903), ("Seattle", 47.6062, -122.3321),
           ("Phoenix", 33.4484, -112.074), ("Minneapolis", 44.9778, -93.265), ("St. Louis", 38.627, -90.1994),
           ("Kansas City", 39.0997, -94.5786), ("New Orleans", 29.9511, -90.0715), ("Boston", 42.3601, -71.0589),
           ("Salt Lake City", 40.7608, -111.891), ("Nashville", 36.1627, -86.7816), ("Charlotte", 35.2271, -80.8431)],
}


def nearest_place(country, lat, lng):
    return min(NEAR[country], key=lambda p: (p[1] - lat) ** 2 + ((p[2] - lng) * math.cos(math.radians(lat))) ** 2)[0]


def main():
    load_dotenv()
    rng = np.random.default_rng(23)
    now = datetime.now(timezone.utc) - timedelta(hours=2)
    with psycopg.connect(connect_timeout=15, autocommit=True) as conn:
        rows, per = [], {}
        for country, n7 in LAST_7_DAYS.items():
            cells = conn.execute("SELECT lat, lng, cell_deg, value, urban, in_lake FROM density_cells WHERE country = %s",
                                 (country,)).fetchall()
            if not cells:
                sys.exit(f"no density cells for {country}: run scripts/build_density.py first")
            lat0 = min(c[0] for c in cells); lng0 = min(c[1] for c in cells); cd0 = cells[0][2]
            by_cell = {(round((c[0] - lat0) / cd0), round((c[1] - lng0) / cd0)): i for i, c in enumerate(cells)}
            has_cell = lambda la, ln: (round((la - lat0) / cd0), round((ln - lng0) / cd0)) in by_cell  # noqa: E731
            w = np.array([(v / 100.0) ** 3.0 * (0.25 + u) ** 1.3 * (0.2 if lake else 1.0) for _, _, _, v, u, lake in cells])
            w /= w.sum()
            # Uneven on purpose: persistent hotspots (heavy-tailed sizes, each with its own spread) placed by the
            # geography weights, plus a thin scatter elsewhere. Real outbreaks clump; they are not an even sprinkle.
            n_par = max(40, LAST_7_DAYS[country] // 22)
            par_cells = rng.choice(len(cells), size=n_par, p=w)
            par = np.array([(cells[i][0] + rng.uniform(-cells[i][2] / 2, cells[i][2] / 2),
                             cells[i][1] + rng.uniform(-cells[i][2] / 2, cells[i][2] / 2)) for i in par_cells])
            par_w = rng.lognormal(0.0, 1.15, n_par); par_w /= par_w.sum()
            par_sigma = rng.uniform(0.04, 0.22, n_par) * (cd0 / 0.5)
            genera = list(GENUS_MIX[country]); gp = np.array(list(GENUS_MIX[country].values()))
            for wk, f in enumerate(WEEK_FACTOR):
                n = int(n7 * f)
                for _ in range(n):
                    if rng.random() < 0.10:                       # background scatter
                        i = int(rng.choice(len(cells), p=w))
                        la = cells[i][0] + rng.uniform(-cells[i][2] / 2, cells[i][2] / 2)
                        ln = cells[i][1] + rng.uniform(-cells[i][2] / 2, cells[i][2] / 2)
                    else:
                        k = int(rng.choice(n_par, p=par_w))
                        la, ln = par[k]
                        for _try in range(6):
                            cand = (par[k][0] + rng.normal(0, par_sigma[k]), par[k][1] + rng.normal(0, par_sigma[k]))
                            if has_cell(*cand):
                                la, ln = cand
                                break
                    t = now - timedelta(days=7 * wk + float(rng.uniform(0, 7)))
                    genus = str(rng.choice(genera, p=gp))
                    rows.append((t, uuid.uuid4(), country, None, "phone", True, str(rng.choice(SPECIES[genus])), genus,
                                 round(float(rng.uniform(0.55, 0.99)), 3), diseases_for(genus), "seed-wide-v1", "seed-wide",
                                 True, round(float(la), 5), round(float(ln), 5), "near " + nearest_place(country, la, ln)))
            per[country] = sum(1 for r in rows if r[2] == country)
        deleted = conn.execute("DELETE FROM detections WHERE device = 'seed-wide'").rowcount
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO detections (time, client_id, country, district_id, source, is_mosquito, species,
                                   genus, confidence, diseases, model_version, device, is_simulated, lat, lng, region)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", rows)
        conn.execute("CALL refresh_continuous_aggregate('daily_counts', NULL, NULL)")
        conn.execute("CALL refresh_continuous_aggregate('weekly_counts', NULL, NULL)")
    print(f"replaced {deleted} old rows with {len(rows)} new simulated detections: {per}")


if __name__ == "__main__":
    main()
