"""Build a SIMULATED mosquito-suitability surface for all of Brazil, Nigeria and the contiguous US.

    .venv/bin/python scripts/build_density.py            # compute, write data/density/*.json, load Tiger
    .venv/bin/python scripts/build_density.py --no-db    # compute and write JSON only

Each grid cell gets a 0-100 index from real geography (not random):
  elevation      OpenTopoData SRTM 90 m DEM                       -> cooler highlands
  temperature    Open-Meteo archive at ~30 sample points per country (warmest 91 days, sea-level adjusted),
                 inverse-distance interpolated, then lapse-rate corrected (6.5 C/km) with each cell's elevation
  rainfall       same sample points, last 365 days, inverse-distance interpolated
  water          Natural Earth rivers + lakes (distance to nearest, km) and coastline (distance, km)
  people         distance to major cities (approximate metro populations) -> urban uplift
Index = thermal_suit(T) * (0.35 + 0.65 * (0.55 rain + 0.30 water*(0.2+0.8 rain) + 0.15 coast)) * (1 + urban_weight * urban)
        scaled to 0-100; open-water cells (inside a lake) are damped. Same formula everywhere; only the urban
        weight differs by vector (Aedes city-dwelling > Culex suburban > Anopheles rural).
The index is illustrative: it rewards the conditions mosquitoes need, it is NOT a measured abundance.
"""
import json, math, sys, time
from datetime import date, timedelta
from pathlib import Path

import httpx
import numpy as np
from shapely import STRtree, points
from shapely.geometry import MultiPolygon, Point, Polygon, shape
from shapely.ops import nearest_points
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
OUT = ROOT / "data/density"
NE = ROOT / "data/raw/naturalearth"

GRID = {"NG": 0.25, "BR": 0.5, "US": 0.5}
CLIP = {"NG": (2.5, 4.0, 14.8, 14.0), "BR": (-74.2, -34.0, -34.5, 5.5), "US": (-125.0, 24.0, -66.5, 49.6)}  # w s e n
URBAN_W = {"BR": 0.35, "US": 0.25, "NG": 0.15}
N_SAMPLES = 25
CACHE = OUT / "cache"   # raw inputs are cached so a rerun (or a rate-limit stop) resumes instead of restarting
LAPSE_C_PER_KM = 6.5

CITIES = {  # (lat, lng, approx. metro population in millions): approximate, for the urban uplift only
    "NG": [(6.5244, 3.3792, 15.4), (12.0022, 8.592, 4.1), (7.3775, 3.947, 3.6), (9.0765, 7.3986, 3.5),
           (4.8156, 7.0498, 3.2), (6.335, 5.6037, 1.8), (10.5105, 7.4165, 1.8), (11.8333, 13.15, 1.2),
           (6.4584, 7.5464, 1.0), (6.1498, 6.7857, 1.4), (5.1066, 7.3667, 1.0), (8.4966, 4.5421, 1.0),
           (9.8965, 8.8583, 0.9), (5.5167, 5.75, 0.9), (13.0622, 5.2339, 0.8)],
    "BR": [(-23.5505, -46.6333, 22.0), (-22.9068, -43.1729, 13.5), (-19.9167, -43.9345, 6.0), (-15.7939, -47.8828, 4.8),
           (-30.0346, -51.2177, 4.3), (-8.0476, -34.877, 4.1), (-3.7319, -38.5267, 4.1), (-12.9777, -38.5016, 3.9),
           (-25.4284, -49.2733, 3.7), (-22.9099, -47.0626, 3.3), (-3.119, -60.0217, 2.3), (-1.4558, -48.4902, 2.5),
           (-16.6869, -49.2648, 2.7), (-2.5307, -44.3068, 1.5), (-20.3155, -40.3128, 1.9), (-5.7945, -35.211, 1.6),
           (-9.6498, -35.7089, 1.3), (-15.601, -56.0979, 0.9), (-20.4697, -54.6201, 0.9)],
    "US": [(40.7128, -74.006, 20.0), (34.0522, -118.2437, 13.0), (41.8781, -87.6298, 9.5), (32.7767, -96.797, 7.8),
           (29.7604, -95.3698, 7.3), (38.9072, -77.0369, 6.3), (39.9526, -75.1652, 6.2), (25.7617, -80.1918, 6.1),
           (33.749, -84.388, 6.1), (42.3601, -71.0589, 4.9), (33.4484, -112.074, 5.0), (37.7749, -122.4194, 4.6),
           (47.6062, -122.3321, 4.0), (42.3314, -83.0458, 4.3), (32.7157, -117.1611, 3.3), (44.9778, -93.265, 3.7),
           (27.9506, -82.4572, 3.2), (39.7392, -104.9903, 3.0), (38.627, -90.1994, 2.8), (28.5383, -81.3792, 2.7),
           (29.9511, -90.0715, 1.3)],
}
CHECKS = {  # places whose index should make sense; printed after the run
    "BR": [("Manaus (Amazon)", -3.12, -60.02), ("Belem (delta)", -1.46, -48.49), ("Sao Paulo", -23.55, -46.63),
           ("Pantanal wetland", -17.5, -57.5), ("Petrolina (semi-arid sertao)", -9.39, -40.5),
           ("Brasilia (plateau)", -15.79, -47.88), ("Porto Alegre (south)", -30.03, -51.22)],
    "NG": [("Lagos", 6.52, 3.38), ("Port Harcourt (Niger Delta)", 4.82, 7.05), ("Abuja", 9.08, 7.4),
           ("Jos (plateau, 1200 m)", 9.9, 8.86), ("Kano (Sahel edge)", 12.0, 8.59), ("Maiduguri", 11.83, 13.15)],
    "US": [("Miami", 25.76, -80.19), ("New Orleans", 29.95, -90.07), ("New York", 40.71, -74.0),
           ("Houston", 29.76, -95.37), ("Phoenix (desert)", 33.45, -112.07), ("Denver (1600 m)", 39.74, -104.99),
           ("Seattle", 47.61, -122.33), ("Montana plains", 47.0, -108.0)],
}


def km(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def load_country(code):
    d = json.load(open(ROOT / "data/raw/countryShapes.json"))[code]
    w, s, e, n = CLIP[code]
    polys = []
    for poly in d["polygons"]:
        g = Polygon(poly[0], poly[1:]) if len(poly) > 1 else Polygon(poly[0])
        if not g.is_valid:
            g = g.buffer(0)
        g = g.intersection(Polygon([(w, s), (e, s), (e, n), (w, n)]))
        if not g.is_empty:
            polys.append(g)
    return MultiPolygon([p for g in polys for p in (g.geoms if hasattr(g, "geoms") else [g])])


def grid_cells(code, geom):
    step, (w, s, e, n) = GRID[code], CLIP[code]
    pg = prep(geom)
    cells = []
    for lat in np.arange(s + step / 2, n, step):
        for lng in np.arange(w + step / 2, e, step):
            if pg.contains(Point(lng, lat)):
                cells.append((round(float(lat), 4), round(float(lng), 4)))
    return cells


def get_json(client, url, params, what):
    for attempt in range(16):
        r = client.get(url, params=params)
        if r.status_code != 429:
            break
        hourly = "Hourly" in r.text
        wait = 240 if hourly else 20 * (attempt + 1)   # an hourly limit resets within the hour: wait it out
        print(f"    {what}: rate limited ({'hourly' if hourly else 'burst'}), waiting {wait}s", flush=True)
        time.sleep(wait)
    if r.status_code != 200:
        sys.exit(f"{what} failed: HTTP {r.status_code} {r.text[:200]}")
    return r.json()


def elevations(client, code, cells):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"elev_{code}.json"
    have = json.load(open(path)) if path.exists() else {}
    todo = [c for c in cells if f"{c[0]}|{c[1]}" not in have]
    for i in range(0, len(todo), 100):
        chunk = todo[i:i + 100]
        j = get_json(client, "https://api.opentopodata.org/v1/srtm90m",
                     {"locations": "|".join(f"{c[0]},{c[1]}" for c in chunk)}, "elevation")
        if j.get("status") != "OK" or len(j["results"]) != len(chunk):
            sys.exit(f"elevation service returned {j.get('status')} / {len(j.get('results', []))} values for {len(chunk)}")
        for c, r in zip(chunk, j["results"]):
            have[f"{c[0]}|{c[1]}"] = r["elevation"] if r["elevation"] is not None else 0.0   # null = open water
        json.dump(have, open(path, "w"))
        print(f"    {code}: elevation {min(i + 100, len(todo))}/{len(todo)}", flush=True)
        time.sleep(1.2)   # public service: about 1 request a second
    return np.array([have[f"{c[0]}|{c[1]}"] for c in cells], dtype=float)


def farthest_points(cells, k):
    pts = np.array(cells)
    chosen = [int(np.argmin(np.hypot(pts[:, 0] - pts[:, 0].mean(), pts[:, 1] - pts[:, 1].mean())))]
    d = np.hypot(pts[:, 0] - pts[chosen[0], 0], (pts[:, 1] - pts[chosen[0], 1]) * 0.85)
    while len(chosen) < min(k, len(pts)):
        i = int(np.argmax(d))
        chosen.append(i)
        d = np.minimum(d, np.hypot(pts[:, 0] - pts[i, 0], (pts[:, 1] - pts[i, 1]) * 0.85))
    return [cells[i] for i in chosen]


def climate_samples(client, code, cells, elev_at):
    """Real temperature (warmest 91 days, sea-level adjusted) and annual rainfall at sample points."""
    cache = CACHE / f"climate_{code}.json"
    if cache.exists():
        print(f"    {code}: climate samples loaded from cache", flush=True)
        return [tuple(r) for r in json.load(open(cache))]
    end = date.today() - timedelta(days=4)
    start = end - timedelta(days=364)
    rows = []
    sample = farthest_points(cells, N_SAMPLES)
    for i in range(0, len(sample), 10):
        chunk = sample[i:i + 10]
        j = get_json(client, "https://archive-api.open-meteo.com/v1/archive", {
            "latitude": ",".join(str(c[0]) for c in chunk), "longitude": ",".join(str(c[1]) for c in chunk),
            "start_date": start.isoformat(), "end_date": end.isoformat(),
            "daily": "temperature_2m_mean,precipitation_sum", "timezone": "UTC"}, f"{code} climate")
        j = j if isinstance(j, list) else [j]
        for (lat, lng), loc in zip(chunk, j):
            t = np.array([v if v is not None else np.nan for v in loc["daily"]["temperature_2m_mean"]], dtype=float)
            p = np.array([v if v is not None else 0.0 for v in loc["daily"]["precipitation_sum"]], dtype=float)
            if np.isnan(t).mean() > 0.2:
                sys.exit(f"{code}: too much missing temperature at {lat},{lng}")
            t = np.where(np.isnan(t), np.nanmean(t), t)
            warm = float(np.convolve(t, np.ones(91) / 91, mode="valid").max())
            gridz = loc.get("elevation") if loc.get("elevation") is not None else elev_at(lat, lng)
            rows.append((lat, lng, warm + LAPSE_C_PER_KM * gridz / 1000.0, float(p.sum()), float(np.mean(t)) + LAPSE_C_PER_KM * gridz / 1000.0))
        print(f"    {code}: climate samples {min(i + 10, len(sample))}/{len(sample)}", flush=True)
        time.sleep(3)
    json.dump(rows, open(cache, "w"))
    return rows


def idw(samples, lat, lng, col, k=6):
    d = np.array([math.hypot(s[0] - lat, (s[1] - lng) * math.cos(math.radians(lat))) for s in samples]) + 1e-3
    idx = np.argsort(d)[:k]
    w = 1.0 / d[idx] ** 2
    return float(np.sum(w * np.array([samples[i][col] for i in idx])) / np.sum(w))


def thermal(t):  # suitability of warm-season temperature: 0 below 15 C, 1 at 25-28 C, 0 above 38 C
    if t <= 15 or t >= 38:
        return 0.0
    if t < 25:
        return ((t - 15) / 10) ** 1.3
    return 1.0 if t <= 28 else (38 - t) / 10


def load_water(code):
    w, s, e, n = CLIP[code]
    box = Polygon([(w - 1, s - 1), (e + 1, s - 1), (e + 1, n + 1), (w - 1, n + 1)])

    def feats(name):
        gs = [shape(f["geometry"]) for f in json.load(open(NE / name))["features"] if f.get("geometry")]
        return [g.intersection(box) for g in gs if g.intersects(box)]
    return feats("ne_50m_rivers_lake_centerlines.geojson"), feats("ne_50m_lakes.geojson"), feats("ne_50m_coastline.geojson")


def nearest_km(geoms, lat, lng, tree):
    if not geoms:
        return 999.0
    pt = Point(lng, lat)
    g = geoms[int(tree.nearest(pt))]
    a, b = nearest_points(pt, g)
    return km(lat, lng, b.y, b.x)


def build(client, code):
    print(f"\n[{code}] building grid...", flush=True)
    geom = load_country(code)
    cells = grid_cells(code, geom)
    print(f"  {len(cells)} cells at {GRID[code]} deg", flush=True)
    elev = elevations(client, code, cells)
    elev_map = {c: float(e) for c, e in zip(cells, elev)}
    near = lambda la, ln: elev_map[min(cells, key=lambda c: (c[0] - la) ** 2 + (c[1] - ln) ** 2)]  # noqa: E731
    samples = climate_samples(client, code, cells, near)
    rivers, lakes, coast = load_water(code)
    rtree, ltree, ctree = STRtree(rivers), STRtree(lakes), STRtree(coast)
    lake_union = prep(MultiPolygon([p for g in lakes for p in (g.geoms if hasattr(g, "geoms") else [g]) if p.geom_type == "Polygon"]))
    pop_max = max(c[2] for c in CITIES[code])
    out = []
    for (lat, lng), z in zip(cells, elev):
        t_warm = idw(samples, lat, lng, 2) - LAPSE_C_PER_KM * z / 1000.0
        t_ann = idw(samples, lat, lng, 4) - LAPSE_C_PER_KM * z / 1000.0
        rain = idw(samples, lat, lng, 3)
        d_river, d_lake = nearest_km(rivers, lat, lng, rtree), nearest_km(lakes, lat, lng, ltree)
        d_coast = nearest_km(coast, lat, lng, ctree)
        d_water = min(d_river, d_lake)
        in_lake = lake_union.contains(Point(lng, lat))
        urban = min(1.0, sum(p / pop_max * math.exp(-(km(lat, lng, la, ln) / 45.0) ** 2) for la, ln, p in CITIES[code]))
        wet = 1 - math.exp(-rain / 700.0)
        # rivers and lakes only breed mosquitoes where there is water to spare: dry riverbeds in deserts barely count
        env = 0.55 * wet + 0.30 * math.exp(-d_water / 35.0) * (0.2 + 0.8 * wet) + 0.15 * math.exp(-d_coast / 60.0)
        v = thermal(t_warm) * (0.35 + 0.65 * env) * (1 + URBAN_W[code] * urban)
        v *= 0.3 if in_lake else 1.0
        out.append({"lat": lat, "lng": lng, "v": v, "temp_warm_c": t_warm, "temp_mean_c": t_ann, "rain_mm_yr": rain,
                    "water_km": d_water, "coast_km": d_coast, "elev_m": float(z), "urban": urban, "in_lake": bool(in_lake)})
    return out


def main():
    code_list = [a for a in sys.argv[1:] if not a.startswith("--")] or ["NG", "BR", "US"]
    results = {}
    with httpx.Client(timeout=90) as client:
        for code in code_list:
            results[code] = build(client, code)
    scale = max(c["v"] for rows in results.values() for c in rows)
    for code, rows in results.items():
        for c in rows:
            c["v"] = round(100 * c["v"] / scale, 1)
            for k in ("temp_warm_c", "temp_mean_c", "rain_mm_yr", "water_km", "coast_km", "elev_m", "urban"):
                c[k] = round(c[k], 1 if k != "urban" else 2)
        OUT.mkdir(parents=True, exist_ok=True)
        json.dump({"country": code, "cell_deg": GRID[code], "scale_max": round(scale, 4), "cells": rows},
                  open(OUT / f"{code}.json", "w"))
        v = np.array([c["v"] for c in rows])
        print(f"\n[{code}] {len(rows)} cells | index: min {v.min():.0f}, median {np.median(v):.0f}, "
              f"p90 {np.percentile(v, 90):.0f}, max {v.max():.0f} | <15: {np.mean(v < 15):.0%}, 15-40: "
              f"{np.mean((v >= 15) & (v < 40)):.0%}, 40-70: {np.mean((v >= 40) & (v < 70)):.0%}, 70+: {np.mean(v >= 70):.0%}")
        for name, la, ln in CHECKS[code]:
            c = min(rows, key=lambda r: (r["lat"] - la) ** 2 + (r["lng"] - ln) ** 2)
            print(f"   {name:<32} index {c['v']:>5.1f}   warm {c['temp_warm_c']:>5.1f} C   rain {c['rain_mm_yr']:>6.0f} mm   "
                  f"water {c['water_km']:>5.0f} km   elev {c['elev_m']:>5.0f} m")
    if "--no-db" in sys.argv:
        return
    import psycopg
    from app.db import load_dotenv
    load_dotenv()
    with psycopg.connect(connect_timeout=15) as conn, conn.cursor() as cur:
        for code, rows in results.items():
            cur.execute("DELETE FROM density_cells WHERE country = %s", (code,))
            cur.executemany("""INSERT INTO density_cells (country, lat, lng, cell_deg, value, temp_warm_c, temp_mean_c,
                               rain_mm_yr, water_km, coast_km, elev_m, urban, in_lake)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                            [(code, r["lat"], r["lng"], GRID[code], r["v"], r["temp_warm_c"], r["temp_mean_c"], r["rain_mm_yr"],
                              r["water_km"], r["coast_km"], r["elev_m"], r["urban"], r["in_lake"]) for r in rows])
        print("\nTiger density_cells:", cur.execute("SELECT country, count(*) FROM density_cells GROUP BY 1 ORDER BY 1").fetchall())


if __name__ == "__main__":
    main()
