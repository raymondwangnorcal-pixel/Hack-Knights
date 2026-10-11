"""Simulated West Nile detections for the "USA test" map.

    python scripts/build_us_test_dots.py [--preview out.png]        (needs numpy, scipy, pillow)

Where the dots go
  1. The CDC's county map of West Nile virus activity (scripts/assets/cdc_west_nile_2026_counties.png) is the
     main guide. Its colours are classified per pixel (no activity / non-human activity / human infections /
     both), and the image is placed on the real map by fitting an Albers projection to the lower-48 outline
     (standard parallels 29.5 and 45.5, central meridian -96; overlap with the image's map pixels 0.97).
  2. Inside that footprint, local conditions decide how likely a spot is, from the same geography grid the other
     simulated dots use (scripts/assets/us_density_cells.csv):
        heat        warm-month temperature: West Nile transmission needs warmth
        water       distance to rivers and lakes: Culex breed in standing water
        population  nearness to cities: most human infections are in or near people
  3. Dots are clumped around hotspots (a few big, many small), like real outbreaks, plus a thin scatter.
All rows are SIMULATED. The output is frontend/public/geo/us-test-dots.json. Same seed, same dots.
"""
import argparse
import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "scripts" / "assets"
IMAGE = ASSETS / "cdc_west_nile_2026_counties.png"
CELLS = ASSETS / "us_density_cells.csv"
OUT = ROOT / "frontend" / "public" / "geo" / "us-test-dots.json"

N_DOTS = 800  # the USA test map is capped at 800 dots
N_HOTSPOTS = 140
SCATTER_SHARE = 0.12
SEED = 20261011
MAX_AGE_DAYS = 7

# ---- placing the image on the map -------------------------------------------------------------------------
# Albers equal-area conic, as drawn by the CDC's map. SCALE/TX/TY were fitted by overlaying the lower-48 outline
# on the image's map pixels (IoU 0.9725).
P1, P2, LON0, LAT0 = (math.radians(v) for v in (29.5, 45.5, -96.0, 37.5))
_N = (math.sin(P1) + math.sin(P2)) / 2
_C = math.cos(P1) ** 2 + 2 * _N * math.sin(P1)
_RHO0 = math.sqrt(_C - 2 * _N * math.sin(LAT0)) / _N
SCALE, TX, TY = 2093.623, 908.79, 756.16


def to_pixel(lng, lat):
    lng = np.radians(np.asarray(lng, float))
    lat = np.radians(np.asarray(lat, float))
    rho = np.sqrt(_C - 2 * _N * np.sin(lat)) / _N
    th = _N * (lng - LON0)
    return (rho * np.sin(th)) * SCALE + TX, -(_RHO0 - rho * np.cos(th)) * SCALE + TY


# ---- reading the CDC map ----------------------------------------------------------------------------------
PALETTE = {0: (222, 226, 226), 1: (123, 204, 196), 2: (38, 123, 166), 3: (8, 64, 129)}
# 0 no reported activity, 1 non-human activity only, 2 human infections, 3 human infections and non-human activity
CATEGORY_WEIGHT = {0: 0.012, 1: 0.25, 2: 0.8, 3: 1.0}
HUMAN_SHARE = {0: 0.30, 1: 0.02, 2: 0.90, 3: 0.55}
TEMPER = 0.65

img = np.array(Image.open(IMAGE).convert("RGB")).astype(int)
H, W = img.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
background = img.min(axis=2) >= 240
d2 = np.stack([((img - np.array(c)) ** 2).sum(axis=2) for c in PALETTE.values()], axis=2)
cat = np.where(d2.min(axis=2) < 28**2, d2.argmin(axis=2), -1)
cat[background] = -2
# title, legend and the Alaska / Hawaii / Puerto Rico insets are not part of the lower 48
cat[(yy <= 235) | (yy >= 1250)] = -2
cat[(xx < 470) & (yy > 940)] = -2
cat[(xx >= 470) & (xx < 700) & (yy > 1030)] = -2
cat[(xx > 1540) & (yy > 1130)] = -2
# county borders and anti-aliased edges take the category of the nearest classified pixel
known = cat >= 0
nearest = ndimage.distance_transform_edt(~known, return_distances=False, return_indices=True)
filled = np.where(cat == -2, -2, cat[nearest[0], nearest[1]])

# ---- local conditions: heat, water, population ------------------------------------------------------------
cells = list(csv.DictReader(open(CELLS)))
STEP = 0.5
lat0c, lng0c = 25.0, -125.0
rows_n, cols_n = int((50 - lat0c) / STEP) + 1, int((-66 - lng0c) / STEP) + 1
grid = {k: np.full((rows_n, cols_n), np.nan) for k in ("temp_warm_c", "water_km", "urban", "in_lake")}
for c in cells:
    r = int(round((float(c["lat"]) - 0.25 - lat0c) / STEP))
    q = int(round((float(c["lng"]) - 0.25 - lng0c) / STEP))
    if 0 <= r < rows_n and 0 <= q < cols_n:
        for k in grid:
            grid[k][r, q] = float(c[k])
# cells missing from the table (coast, border) borrow their nearest neighbour
for k, g in grid.items():
    miss = np.isnan(g)
    idx = ndimage.distance_transform_edt(miss, return_distances=False, return_indices=True)
    grid[k] = g[idx[0], idx[1]]


def conditions(lat, lng):
    r = np.clip(np.floor((lat - lat0c) / STEP).astype(int), 0, rows_n - 1)
    q = np.clip(np.floor((lng - lng0c) / STEP).astype(int), 0, cols_n - 1)
    heat = np.clip((grid["temp_warm_c"][r, q] - 15.0) / 9.0, 0.15, 1.0)
    water = 0.30 + 0.70 * np.exp(-grid["water_km"][r, q] / 60.0)
    pop = 0.35 + 0.65 * np.minimum(1.0, np.sqrt(np.maximum(grid["urban"][r, q], 0) / 0.08))
    lake = grid["in_lake"][r, q] > 0.5
    return heat * water * pop * np.where(lake, 0.0, 1.0)


def category_at(lat, lng):
    px, py = to_pixel(lng, lat)
    ix, iy = np.rint(px).astype(int), np.rint(py).astype(int)
    ok = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
    out = np.full(np.shape(lat), -2)
    out[ok] = filled[iy[ok], ix[ok]]
    return out


def weight_at(lat, lng):
    c = category_at(lat, lng)
    base = np.array([0.0] + [CATEGORY_WEIGHT[i] for i in range(4)])[np.clip(c + 1, 0, 4)]
    base = np.where(c == -2, 0.0, np.where(c == -1, 0.0, base))
    # raised to a power below 1 so the biggest areas don't swallow everything: activity spreads across more counties
    return (base * conditions(np.asarray(lat), np.asarray(lng))) ** TEMPER


# ---- the grid of candidate spots --------------------------------------------------------------------------
rng = np.random.default_rng(SEED)
CELL = 0.05
lats = np.arange(24.4, 49.6, CELL)
lngs = np.arange(-125.0, -66.4, CELL)
LNG, LAT = np.meshgrid(lngs, lats)
WEIGHT = weight_at(LAT, LNG)
flat_w = WEIGHT.ravel()
prob = flat_w / flat_w.sum()
print(f"candidate spots with weight: {int((flat_w > 0).sum()):,} of {flat_w.size:,}")

# ---- hotspots, then dots clumped around them --------------------------------------------------------------
hs_cell = rng.choice(flat_w.size, size=N_HOTSPOTS, p=prob)
hs_lat = LAT.ravel()[hs_cell] + rng.uniform(-CELL / 2, CELL / 2, N_HOTSPOTS)
hs_lng = LNG.ravel()[hs_cell] + rng.uniform(-CELL / 2, CELL / 2, N_HOTSPOTS)
hs_size = np.clip(rng.pareto(1.25, N_HOTSPOTS) + 1, 1, 80)  # a few big outbreaks, many small ones
hs_sigma = 0.05 + 0.05 * np.log1p(hs_size)  # degrees: bigger hotspots spread wider
hs_w = flat_w[hs_cell]

n_clump = int(N_DOTS * (1 - SCATTER_SHARE))
owner = rng.choice(N_HOTSPOTS, size=n_clump, p=hs_size / hs_size.sum())
d_lat = np.empty(n_clump)
d_lng = np.empty(n_clump)
todo = np.arange(n_clump)
for _ in range(14):
    s = hs_sigma[owner[todo]]
    la = hs_lat[owner[todo]] + rng.normal(0, 1, todo.size) * s
    ln = hs_lng[owner[todo]] + rng.normal(0, 1, todo.size) * s / np.cos(np.radians(la))
    w_c = weight_at(la, ln)
    accept = rng.random(todo.size) < np.minimum(1.0, (w_c / (hs_w[owner[todo]] + 1e-12)) ** 0.8)
    accept &= w_c > 0
    d_lat[todo[accept]] = la[accept]
    d_lng[todo[accept]] = ln[accept]
    todo = todo[~accept]
    if not todo.size:
        break
if todo.size:  # stragglers sit right at their hotspot
    d_lat[todo] = hs_lat[owner[todo]] + rng.normal(0, 0.01, todo.size)
    d_lng[todo] = hs_lng[owner[todo]] + rng.normal(0, 0.01, todo.size)

n_scatter = N_DOTS - n_clump
sc = rng.choice(flat_w.size, size=n_scatter, p=prob)
s_lat = LAT.ravel()[sc] + rng.uniform(-CELL / 2, CELL / 2, n_scatter)
s_lng = LNG.ravel()[sc] + rng.uniform(-CELL / 2, CELL / 2, n_scatter)
# scatter dots belong to the nearest hotspot (as its outskirts)
_, s_owner = cKDTree(np.column_stack([hs_lat, hs_lng * np.cos(np.radians(38))])).query(
    np.column_stack([s_lat, s_lng * np.cos(np.radians(38))]))

lat = np.concatenate([d_lat, s_lat])
lng = np.concatenate([d_lng, s_lng])
owner = np.concatenate([owner, s_owner])

# ---- per-dot details ---------------------------------------------------------------------------------------
CITIES = [  # (name, lat, lng): the "near X" shown on a dot's card
    ("New York", 40.71, -74.01), ("Boston", 42.36, -71.06), ("Philadelphia", 39.95, -75.17), ("Washington", 38.91, -77.04),
    ("Pittsburgh", 40.44, -80.0), ("Buffalo", 42.89, -78.88), ("Richmond", 37.54, -77.44), ("Raleigh", 35.78, -78.64),
    ("Charlotte", 35.23, -80.84), ("Atlanta", 33.75, -84.39), ("Jacksonville", 30.33, -81.66), ("Miami", 25.76, -80.19),
    ("Tampa", 27.95, -82.46), ("Orlando", 28.54, -81.38), ("Birmingham", 33.52, -86.8), ("Nashville", 36.16, -86.78),
    ("Memphis", 35.15, -90.05), ("New Orleans", 29.95, -90.07), ("Jackson", 32.3, -90.18), ("Little Rock", 34.75, -92.29),
    ("Houston", 29.76, -95.37), ("San Antonio", 29.42, -98.49), ("Dallas", 32.78, -96.8), ("Austin", 30.27, -97.74),
    ("Oklahoma City", 35.47, -97.52), ("Wichita", 37.69, -97.34), ("Kansas City", 39.1, -94.58), ("St. Louis", 38.63, -90.2),
    ("Louisville", 38.25, -85.76), ("Indianapolis", 39.77, -86.16), ("Columbus", 39.96, -83.0), ("Detroit", 42.33, -83.05),
    ("Chicago", 41.88, -87.63), ("Milwaukee", 43.04, -87.91), ("Minneapolis", 44.98, -93.27), ("Des Moines", 41.59, -93.62),
    ("Omaha", 41.26, -95.93), ("Sioux Falls", 43.54, -96.73), ("Fargo", 46.88, -96.79), ("Bismarck", 46.81, -100.78),
    ("Rapid City", 44.08, -103.23), ("Billings", 45.78, -108.5), ("Denver", 39.74, -104.99), ("Albuquerque", 35.08, -106.65),
    ("El Paso", 31.76, -106.49), ("Phoenix", 33.45, -112.07), ("Tucson", 32.22, -110.97), ("Las Vegas", 36.17, -115.14),
    ("Salt Lake City", 40.76, -111.89), ("Boise", 43.62, -116.2), ("Spokane", 47.66, -117.43), ("Seattle", 47.61, -122.33),
    ("Portland", 45.52, -122.68), ("Sacramento", 38.58, -121.49), ("San Francisco", 37.77, -122.42), ("Fresno", 36.74, -119.79),
    ("Los Angeles", 34.05, -118.24), ("San Diego", 32.72, -117.16), ("Bakersfield", 35.37, -119.02), ("Cheyenne", 41.14, -104.82),
]
c_tree = cKDTree(np.array([[c[1], c[2] * math.cos(math.radians(c[1]))] for c in CITIES]))
hs_place = c_tree.query(np.column_stack([hs_lat, hs_lng * np.cos(np.radians(hs_lat))]))[1]

cat_here = category_at(lat, lng)
human = rng.random(lat.size) < np.array([HUMAN_SHARE.get(int(c), 0.3) for c in cat_here])
species = np.where(lng < -104, 2, np.where(lat < 35.5, 1, 0))  # tarsalis in the west, quinquefasciatus in the south
SPECIES = ["Culex pipiens", "Culex quinquefasciatus", "Culex tarsalis"]
age_tenths = np.rint(MAX_AGE_DAYS * 10 * rng.beta(1.0, 1.6, lat.size)).astype(int)  # recent days have more
confidence = np.clip(rng.beta(6, 2.2, lat.size), 0.5, 0.98)
trap = rng.random(lat.size) < 0.25
flags = human.astype(int) | (trap.astype(int) << 1)

dots = [
    [int(round(la * 1000)), int(round(ln * 1000)), int(a), int(o), int(sp), int(round(cf * 100)), int(fl)]
    for la, ln, a, o, sp, cf, fl in zip(lat, lng, age_tenths, owner, species, confidence, flags)
]
payload = {
    "note": "Simulated West Nile detections for the USA test map. Generated by scripts/build_us_test_dots.py.",
    "fields": ["lat_e3", "lng_e3", "age_days_x10", "hotspot", "species", "confidence_pct", "flags(bit0 human, bit1 trap)"],
    "species": SPECIES,
    "hotspots": [CITIES[int(i)][0] for i in hs_place],
    "dots": dots,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, separators=(",", ":")))
print(f"wrote {OUT.relative_to(ROOT)}: {len(dots):,} dots, {N_HOTSPOTS} hotspots, {OUT.stat().st_size / 1e3:.0f} KB")

# ---- a quick look at what came out ---------------------------------------------------------------------------
names = {0: "no activity (gray)", 1: "non-human only (teal)", 2: "human (blue)", 3: "human + non-human (dark)"}
print("dots by the CDC category they land in:")
for k in (3, 2, 1, 0):
    print(f"  {names[k]:26} {np.mean(cat_here == k) * 100:5.1f}%")
print(f"  outside the drawn map      {np.mean(cat_here < 0) * 100:5.1f}%")
print(f"human infections {human.mean() * 100:.0f}% of dots; Culex species:", {SPECIES[i]: int((species == i).sum()) for i in range(3)})

ap = argparse.ArgumentParser()
ap.add_argument("--preview")
args = ap.parse_args()
if args.preview:
    left = Image.open(IMAGE).convert("RGB")
    right = Image.new("RGB", left.size, (24, 22, 20))
    d = ImageDraw.Draw(right)
    px, py = to_pixel(lng, lat)
    for x, y, h in zip(px, py, human):
        d.ellipse([x - 2.2, y - 2.2, x + 2.2, y + 2.2], fill=(240, 118, 54) if h else (253, 192, 128))
    both = Image.new("RGB", (left.width * 2, left.height))
    both.paste(left, (0, 0)); both.paste(right, (left.width, 0))
    both.crop((100, 220, left.width * 2 - 80, 1230)).resize((1800, int(1010 * 1800 / (left.width * 2 - 180)))).save(args.preview)
    print("preview:", args.preview)
