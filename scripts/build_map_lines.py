"""Build the state and district boundary lines the dashboard map draws (frontend/public/geo/).

    python3 scripts/build_map_lines.py

Reads geoBoundaries ADM2 from data/raw/geoboundaries (already downloaded for load_districts.py) and
downloads ADM1 (states) from the geoBoundaries release when it is missing. Writes, per country:
  <CC>-adm1.json   state / province lines   (drawn when zoomed out)
  <CC>-adm2.json   district / county / municipality / LGA lines (drawn once zoomed in)
as {"lines": [[lng, lat, lng, lat, ...], ...]} with 2-decimal (~1 km) coordinates. Lines are simplified with
Douglas-Peucker; the tolerance is coarser for ADM1 than ADM2. Contiguous US only (matches the map view).
"""
import json
import math
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw/geoboundaries"
OUT = ROOT / "frontend/public/geo"
ISO = {"NG": "NGA", "BR": "BRA", "US": "USA"}
TOL = {"adm1": 0.02, "adm2": {"NG": 0.003, "BR": 0.008, "US": 0.01}}
US_BOX = (-125.5, 24.0, -66.0, 49.8)  # contiguous states only
ADM1_URL = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/{iso}/ADM1/geoBoundaries-{iso}-ADM1_simplified.geojson"


def adm1_path(iso: str) -> Path:
    path = RAW / f"geoBoundaries-{iso}-ADM1-all" / f"geoBoundaries-{iso}-ADM1_simplified.geojson"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {iso} ADM1 ...")
        # curl, not urllib: python.org builds on macOS ship without root certificates
        subprocess.run(["curl", "-fsSL", "-o", str(path), ADM1_URL.format(iso=iso)], check=True)
    return path


def adm2_path(iso: str) -> Path:
    path = RAW / f"geoBoundaries-{iso}-ADM2-all" / f"geoBoundaries-{iso}-ADM2_simplified.geojson"
    if not path.exists():
        sys.exit(f"missing {path}: run scripts/load_districts.py's download step first")
    return path


def rings(geometry: dict):
    polys = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    for poly in polys:
        yield from poly  # outer ring and holes alike: all are boundary lines


def douglas_peucker(pts: list, tol: float) -> list:
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a][:2], pts[b][:2]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        far, far_i = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i][:2]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm if norm else math.hypot(px - ax, py - ay)
            if d > far:
                far, far_i = d, i
        if far > tol:
            keep[far_i] = True
            stack += [(a, far_i), (far_i, b)]
    return [p for p, k in zip(pts, keep) if k]


def build(country: str, level: str, path: Path) -> None:
    tol = TOL["adm1"] if level == "adm1" else TOL["adm2"][country]
    lines, points = [], 0
    for feature in json.load(open(path))["features"]:
        for ring in rings(feature["geometry"]):
            if country == "US" and not all(US_BOX[0] <= p[0] <= US_BOX[2] and US_BOX[1] <= p[1] <= US_BOX[3] for p in ring[:1]):
                continue
            simple = douglas_peucker(ring, tol)
            if len(simple) < 3:
                continue
            flat = [round(c, 2) for p in simple for c in p[:2]]
            lines.append(flat)
            points += len(simple)
    out = OUT / f"{country}-{level}.json"
    out.write_text(json.dumps({"lines": lines}, separators=(",", ":")))
    print(f"{out.relative_to(ROOT)}: {len(lines)} lines, {points} points, {out.stat().st_size / 1024:.0f} KB")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for country, iso in ISO.items():
        build(country, "adm1", adm1_path(iso))
        build(country, "adm2", adm2_path(iso))


if __name__ == "__main__":
    main()
