"""Simulated malaria detections for the "Nigeria test" map: this week, +1 week and +2 weeks, as a spreading outbreak.

    python scripts/build_ng_test_dots.py [--preview out.png]        (needs numpy, scipy, pillow)

Week 0 (where the dots go)
  1. A map of predicted malaria parasitemia prevalence for Nigeria
     (scripts/assets/nigeria_parasitemia_prevalence.png: <20% pale yellow up to >50% dark brown) is the main
     guide. Its colours become a prevalence estimate per pixel, and the picture is placed on the real map by
     fitting it to Nigeria's outline (overlap 0.98).
  2. Local conditions adjust how likely a spot is, from the data the rest of the app already uses:
        Tiger Data  density_cells: warm-season temperature, yearly rain, distance to rivers and lakes, nearness
                    to cities (scripts/assets/ng_density_cells.csv)
        Tiger + Snowflake  the 20 Lagos LGAs: Snowflake's weekly malaria cases (last 52 weeks) decide how many
                    dots each gets (scripts/assets/ng_lagos_lga_signals.csv)
  3. Dots are clumped around hotspots (a few big, many small) plus a thin scatter.

Weeks +1 and +2 (the spread)
  The same dots, moved on. Every dot keeps its hotspot and its spot within it, so as the hotspots change the dots
  follow them smoothly:
        drift     each hotspot's centre creeps a few km a week, mostly toward more suitable land
        grow      hotspots widen about 8% a week and gain dots (4,800 -> 5,400 -> 6,000)
        seed      new small hotspots appear next to the biggest ones (the outbreak jumping to new places)
All rows are SIMULATED. At most 6,000 dots a week. Output: frontend/public/geo/ng-test-dots.json. Same seed, same dots.
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
IMAGE = ASSETS / "nigeria_parasitemia_prevalence.png"
CELLS = ASSETS / "ng_density_cells.csv"
LGAS = ASSETS / "ng_lagos_lga_signals.csv"
OUT = ROOT / "frontend" / "public" / "geo" / "ng-test-dots.json"

DOTS_PER_WEEK = [4800, 5400, 6000]  # 6,000 is the cap
N_LAGOS = 150  # week-0 dots placed LGA by LGA from Snowflake's case counts
N_GENERIC_HOTSPOTS = 480
N_NEW_HOTSPOTS = [0, 40, 40]  # appearing at week 0, +1, +2
SCATTER_SHARE = 0.15
GROWTH_SIGMA = 1.08  # hotspots widen this much a week
GROWTH_SIZE = 1.14  # and their share of the dots grows this much
DRIFT_DEG = 0.07  # a hotspot's centre moves about this far a week (about 8 km)
SEED = 20261011
MAX_AGE_DAYS = 7

# Placing the picture on the map: a plain latitude / longitude picture (about 52 px per degree both ways), fitted by
# overlaying Nigeria's outline on the picture's map pixels.
SX, TX, SY, TY = 52.2046, -138.940, -51.8912, 722.068


def to_pixel(lng, lat):
    return np.asarray(lng, float) * SX + TX, np.asarray(lat, float) * SY + TY


# ---- reading the prevalence map -----------------------------------------------------------------------------------
img = np.array(Image.open(IMAGE).convert("RGB")).astype(float)
H, W = img.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
valid = img.min(axis=2) < 235
valid &= ~((xx >= 500) & (yy >= 345))  # legend
valid &= ~(yy >= 497)  # scale bar
valid &= ~((xx >= 625) & (yy <= 75))  # north arrow
lab, n = ndimage.label(valid)
valid = lab == (1 + int(np.argmax(ndimage.sum(valid, lab, range(1, n + 1)))))

lum = 0.299 * img[..., 0] + 0.587 * img[..., 1] + 0.114 * img[..., 2]
sat = (img.max(axis=2) - img.min(axis=2)) / np.maximum(img.max(axis=2), 1)
ANCHOR_LUM = [244, 213, 185, 150, 119, 80]
ANCHOR_PREV = [0.12, 0.25, 0.35, 0.45, 0.55, 0.65]
prev = np.interp(-lum, [-v for v in ANCHOR_LUM], ANCHOR_PREV)
border = (lum < 120) & (sat < 0.35)  # state borders take the prevalence of the nearest real colour
known = valid & ~border
nearest = ndimage.distance_transform_edt(~known, return_distances=False, return_indices=True)
prev = ndimage.gaussian_filter(prev[nearest[0], nearest[1]], 1.5)
prev[~valid] = np.nan


def prevalence_at(lat, lng):
    px, py = to_pixel(lng, lat)
    ix, iy = np.rint(px).astype(int), np.rint(py).astype(int)
    out = np.full(np.shape(lat), np.nan)
    ok = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
    out[ok] = prev[iy[ok], ix[ok]]
    return out


# ---- local conditions: Tiger Data grid, Snowflake case counts ------------------------------------------------------
cells = list(csv.DictReader(open(CELLS)))
cell_tree = cKDTree(np.array([[float(c["lat"]), float(c["lng"])] for c in cells]))
cell = {k: np.array([float(c[k]) for c in cells]) for k in ("temp_warm_c", "rain_mm_yr", "water_km", "urban", "in_lake")}

lgas = list(csv.DictReader(open(LGAS)))
lga_xy = np.array([[float(r["lat"]), float(r["lng"])] for r in lgas])
cases = np.array([float(r["malaria_cases_52w_snowflake"] or 0) for r in lgas])


def conditions(lat, lng):
    shape = np.shape(lat)
    lat = np.asarray(lat, float).ravel()
    lng = np.asarray(lng, float).ravel()
    _, idx = cell_tree.query(np.column_stack([lat, lng]))
    heat = np.clip(1 - ((cell["temp_warm_c"][idx] - 27.5) / 9.0) ** 2, 0.3, 1.0)
    rain = np.clip(cell["rain_mm_yr"][idx] / 1400.0, 0.4, 1.2) ** 0.7
    water = 0.40 + 0.60 * np.exp(-cell["water_km"][idx] / 40.0)
    pop = 0.30 + 1.50 * np.minimum(1.0, np.sqrt(np.maximum(cell["urban"][idx], 0) / 0.10))  # cities weigh up to 6x rural land
    return (heat * rain * water * pop * np.where(cell["in_lake"][idx] > 0.5, 0.0, 1.0)).reshape(shape)


def weight_at(lat, lng):
    p = prevalence_at(lat, lng)
    w = np.where(~np.isnan(p), (np.nan_to_num(p, nan=0.0) / 0.35) ** 2.0, 0.0)
    return (w * conditions(lat, lng)) ** 0.75


rng = np.random.default_rng(SEED)
CELL = 0.03
lats = np.arange(4.2, 13.95, CELL)
lngs = np.arange(2.6, 14.75, CELL)
LNG, LAT = np.meshgrid(lngs, lats)
WEIGHT = weight_at(LAT, LNG)
flat_w = WEIGHT.ravel()
prob = flat_w / flat_w.sum()
print(f"candidate spots with weight: {int((flat_w > 0).sum()):,} of {flat_w.size:,}")

# which way is "more suitable": the slope of the smoothed weight field
smooth = ndimage.gaussian_filter(WEIGHT, 8)
g_lat, g_lng = np.gradient(smooth)


def uphill(lat, lng):
    r = np.clip(np.rint((np.asarray(lat) - lats[0]) / CELL).astype(int), 0, WEIGHT.shape[0] - 1)
    c = np.clip(np.rint((np.asarray(lng) - lngs[0]) / CELL).astype(int), 0, WEIGHT.shape[1] - 1)
    v = np.column_stack([g_lat[r, c], g_lng[r, c]])
    return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)


# ---- hotspots: where they start, how they move, how they grow --------------------------------------------------------
K0 = N_GENERIC_HOTSPOTS
n_lga = len(lgas)
H_TOTAL = K0 + n_lga + sum(N_NEW_HOTSPOTS)
first_week = np.zeros(H_TOTAL, int)  # the week a hotspot first exists
is_lga = np.zeros(H_TOTAL, bool)
is_lga[K0 : K0 + n_lga] = True
size0 = np.zeros(H_TOTAL)
sigma0 = np.zeros(H_TOTAL)
c0 = np.zeros((H_TOTAL, 2))  # centre at the week the hotspot first exists

g = rng.choice(flat_w.size, size=K0, p=prob)
c0[:K0, 0] = LAT.ravel()[g] + rng.uniform(-CELL / 2, CELL / 2, K0)
c0[:K0, 1] = LNG.ravel()[g] + rng.uniform(-CELL / 2, CELL / 2, K0)
size0[:K0] = np.clip(rng.pareto(1.3, K0) + 1, 1, 60)
sigma0[:K0] = 0.035 + 0.04 * np.log1p(size0[:K0])
c0[K0 : K0 + n_lga] = lga_xy
size0[K0 : K0 + n_lga] = 4 * cases / cases.mean()
sigma0[K0 : K0 + n_lga] = 0.022

# new hotspots seeded next to the biggest existing ones
slot = K0 + n_lga
for w, count in enumerate(N_NEW_HOTSPOTS):
    for _ in range(count):
        existing = np.where((first_week[:slot] < w) & ~is_lga[:slot])[0]
        parent = rng.choice(existing, p=size0[existing] / size0[existing].sum())
        for _try in range(20):
            cand = c0[parent] + rng.normal(0, 0.14, 2)
            if weight_at(cand[0], cand[1]) > 0:
                break
        else:
            cand = c0[parent]
        c0[slot] = cand
        first_week[slot] = w
        size0[slot] = rng.uniform(1.5, 4.0)
        sigma0[slot] = 0.03
        slot += 1

drift = np.zeros((H_TOTAL, 2))
dirn = uphill(c0[:, 0], c0[:, 1])
noise = rng.normal(0, 1, (H_TOTAL, 2))
noise /= np.maximum(np.linalg.norm(noise, axis=1, keepdims=True), 1e-12)
drift = (0.6 * dirn + 0.4 * noise) * rng.uniform(0.5, 1.2, (H_TOTAL, 1)) * DRIFT_DEG
drift[is_lga] *= 0.2  # city areas hardly move

n_weeks = len(DOTS_PER_WEEK)
centers = np.zeros((n_weeks, H_TOTAL, 2))
sigmas = np.zeros((n_weeks, H_TOTAL))
sizes = np.zeros((n_weeks, H_TOTAL))
for w in range(n_weeks):
    age = np.maximum(w - first_week, 0)
    centers[w] = c0 + drift * age[:, None]
    sigmas[w] = sigma0 * GROWTH_SIGMA**age
    sizes[w] = np.where(first_week <= w, size0 * GROWTH_SIZE**age, 0.0)

# ---- dots: each keeps its hotspot and its place inside it ------------------------------------------------------------
N_MAX = DOTS_PER_WEEK[-1]
z = rng.normal(0, 1, (N_MAX, 2))
scatter = rng.random(N_MAX) < SCATTER_SHARE
owner = np.zeros(N_MAX, int)
# week 0: Lagos dots by LGA, the rest among the generic hotspots
lga_share = cases / cases.sum()
lga_n = np.floor(lga_share * N_LAGOS).astype(int)
lga_n[np.argsort(-lga_share)[: N_LAGOS - lga_n.sum()]] += 1
owner[:N_LAGOS] = K0 + np.repeat(np.arange(n_lga), lga_n)
scatter[:N_LAGOS] = False
p0 = size0[:K0] / size0[:K0].sum()
owner[N_LAGOS : DOTS_PER_WEEK[0]] = rng.choice(K0, size=DOTS_PER_WEEK[0] - N_LAGOS, p=p0)
# later weeks: extra dots go to the hotspots that exist by then, in proportion to their size
for w in range(1, n_weeks):
    lo, hi = DOTS_PER_WEEK[w - 1], DOTS_PER_WEEK[w]
    pw = sizes[w] / sizes[w].sum()
    owner[lo:hi] = rng.choice(H_TOTAL, size=hi - lo, p=pw)


def settle(lat, lng, clat, clng):
    """A dot that landed off the map (sea, outside Nigeria) slides back toward its hotspot's centre."""
    for _ in range(10):
        bad = weight_at(lat, lng) <= 0
        if not bad.any():
            break
        lat = np.where(bad, (lat + clat) / 2, lat)
        lng = np.where(bad, (lng + clng) / 2, lng)
    return lat, lng


week_pos = []
for w in range(n_weeks):
    n = DOTS_PER_WEEK[w]
    h = owner[:n]
    s = sigmas[w][h] * np.where(scatter[:n], 4.0, 1.0)
    clat, clng = centers[w][h, 0], centers[w][h, 1]
    la = clat + z[:n, 0] * s
    ln = clng + z[:n, 1] * s / np.cos(np.radians(la))
    la, ln = settle(la, ln, clat, clng)
    week_pos.append((la, ln))

# ---- per-dot details -------------------------------------------------------------------------------------------------
CITIES = [
    ("Lagos", 6.52, 3.38), ("Abeokuta", 7.16, 3.35), ("Ibadan", 7.38, 3.95), ("Ogbomosho", 8.13, 4.24), ("Ilorin", 8.50, 4.54),
    ("Osogbo", 7.77, 4.56), ("Akure", 7.25, 5.19), ("Ado Ekiti", 7.62, 5.22), ("Benin City", 6.34, 5.60), ("Warri", 5.52, 5.76),
    ("Asaba", 6.20, 6.73), ("Onitsha", 6.14, 6.79), ("Awka", 6.21, 7.07), ("Owerri", 5.48, 7.03), ("Port Harcourt", 4.82, 7.05),
    ("Yenagoa", 4.92, 6.26), ("Uyo", 5.04, 7.93), ("Calabar", 4.95, 8.32), ("Umuahia", 5.53, 7.49), ("Enugu", 6.46, 7.55),
    ("Abakaliki", 6.32, 8.11), ("Makurdi", 7.73, 8.52), ("Lokoja", 7.80, 6.74), ("Abuja", 9.08, 7.40), ("Lafia", 8.49, 8.52),
    ("Minna", 9.61, 6.55), ("Bida", 9.08, 6.01), ("Jos", 9.90, 8.86), ("Kaduna", 10.51, 7.42), ("Zaria", 11.07, 7.70),
    ("Kano", 12.00, 8.59), ("Katsina", 12.99, 7.60), ("Gusau", 12.17, 6.66), ("Sokoto", 13.06, 5.24), ("Birnin Kebbi", 12.45, 4.20),
    ("Dutse", 11.76, 9.34), ("Bauchi", 10.31, 9.84), ("Gombe", 10.29, 11.17), ("Yola", 9.20, 12.50), ("Jalingo", 8.89, 11.37),
    ("Maiduguri", 11.83, 13.15), ("Damaturu", 11.75, 11.96),
]
# the nearest city to each hotspot's starting centre names it ("near Kano" on a dot's card)
city_xy = np.array([[c[1], c[2]] for c in CITIES])  # lat, lng
hs_place = np.array([int(np.argmin((city_xy[:, 0] - c0[i, 0]) ** 2 + ((city_xy[:, 1] - c0[i, 1]) * math.cos(math.radians(8.5))) ** 2)) for i in range(H_TOTAL)])

SPECIES = ["Anopheles gambiae", "Anopheles coluzzii", "Anopheles arabiensis", "Anopheles funestus"]
la0, ln0 = week_pos[0]
u = rng.random(N_MAX)
lat_for_species = np.concatenate([la0, week_pos[-1][0][len(la0):]])
north = lat_for_species > 10.0  # An. arabiensis dominates the dry north; gambiae and coluzzii the wet south
species = np.where(north, np.where(u < 0.7, 2, np.where(u < 0.85, 0, 3)), np.where(u < 0.45, 0, np.where(u < 0.8, 1, np.where(u < 0.92, 3, 2))))
confidence = np.clip(rng.beta(6, 2.2, N_MAX), 0.5, 0.98)
trap = rng.random(N_MAX) < 0.25
flags = trap.astype(int) << 1

weeks = []
for w in range(n_weeks):
    n = DOTS_PER_WEEK[w]
    la, ln = week_pos[w]
    ages = np.rint(MAX_AGE_DAYS * 10 * rng.beta(1.0, 1.6, n)).astype(int)
    weeks.append([
        [int(round(la[j] * 1000)), int(round(ln[j] * 1000)), int(ages[j]), int(owner[j]), int(species[j]), int(round(confidence[j] * 100)), int(flags[j])]
        for j in range(n)
    ])

# where each hotspot is each week (for the slider's animation); a hotspot not yet born sits at its first position
centers_out = []
for w in range(n_weeks):
    cw = np.where((first_week <= w)[:, None], centers[w], c0)
    centers_out.append([[int(round(a * 1000)), int(round(b * 1000))] for a, b in cw])

payload = {
    "note": "Simulated malaria detections for the Nigeria test map, this week and the next two. Generated by scripts/build_ng_test_dots.py.",
    "fields": ["lat_e3", "lng_e3", "age_days_x10", "hotspot", "species", "confidence_pct", "flags(bit1 trap)"],
    "species": SPECIES,
    "hotspots": [CITIES[int(i)][0] for i in hs_place],
    "centers": centers_out,
    "weeks": weeks,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, separators=(",", ":")))
print(f"wrote {OUT.relative_to(ROOT)}: dots per week {[len(x) for x in weeks]}, {H_TOTAL} hotspots, {OUT.stat().st_size / 1e3:.0f} KB")

# ---- a quick look at what came out ----------------------------------------------------------------------------------------
p_here = prevalence_at(*week_pos[0])
print("week 0 dots by the predicted prevalence where they land:")
for lo, hi, name in ((0, 0.20, "<20%"), (0.20, 0.30, "20-30%"), (0.30, 0.40, "30-40%"), (0.40, 0.50, "40-50%"), (0.50, 1, ">50%")):
    print(f"  {name:7} {np.mean((p_here >= lo) & (p_here < hi)) * 100:5.1f}%")
for w in range(1, n_weeks):
    n = DOTS_PER_WEEK[w - 1]
    moved = np.hypot(week_pos[w][0][:n] - week_pos[w - 1][0][:n], (week_pos[w][1][:n] - week_pos[w - 1][1][:n]) * math.cos(math.radians(8.5))) * 111
    print(f"week {w}: {DOTS_PER_WEEK[w]:,} dots; the {n:,} that were there moved {np.median(moved):.1f} km (median), {np.percentile(moved, 90):.1f} km (90th percentile)")

ap = argparse.ArgumentParser()
ap.add_argument("--preview")
args = ap.parse_args()
if args.preview:
    left = Image.open(IMAGE).convert("RGB")
    panels = [left]
    for w in range(n_weeks):
        panel = Image.new("RGB", left.size, (24, 22, 20))
        d = ImageDraw.Draw(panel)
        px, py = to_pixel(week_pos[w][1], week_pos[w][0])
        for x, y in zip(px, py):
            d.ellipse([x - 1.4, y - 1.4, x + 1.4, y + 1.4], fill=(240, 118, 54))
        d.text((12, 12), f"week {w}  ({DOTS_PER_WEEK[w]:,} dots)", fill=(236, 230, 218))
        panels.append(panel)
    sheet = Image.new("RGB", (left.width * len(panels), left.height))
    for i, pnl in enumerate(panels):
        sheet.paste(pnl, (i * left.width, 0))
    sheet.save(args.preview)
    print("preview:", args.preview)
