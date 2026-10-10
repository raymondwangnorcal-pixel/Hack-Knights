"""Measure wingbeat fundamental and band-energy ratio per Abuzz species.

    .venv/bin/python scripts/calibrate_pitch.py
Writes data/calibration/pitch_by_clip.csv and prints per-species stats.
"""
import csv, sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.audio import AudioDecodeError, decode  # noqa: E402
from app.model import features  # noqa: E402

SPECIES_DIR = ROOT / "data/raw/species"
OUT = ROOT / "data/calibration/pitch_by_clip.csv"
EXTS = {".wav", ".m4a", ".amr", ".mp4"}


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows, failures = [], []
    for sp_dir in sorted(p for p in SPECIES_DIR.iterdir() if p.is_dir()):
        for f in sorted(sp_dir.rglob("*")):
            if f.suffix.lower() not in EXTS:
                continue
            try:
                x = decode(path=str(f), max_seconds=30)
            except AudioDecodeError as e:
                failures.append((f.name, str(e)))
                continue
            ft = features(x)
            rows.append({"species": sp_dir.name, "file": f.name, **{k: round(v, 4) for k, v in ft.items()}})
    with open(OUT, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)

    print(f"{'species':<24}{'n':>4}{'f0 p10':>9}{'f0 med':>9}{'f0 p90':>9}{'band p10':>10}{'band med':>10}")
    for sp in sorted({r["species"] for r in rows}):
        f0 = np.array([r["f0_hz"] for r in rows if r["species"] == sp])
        br = np.array([r["band_ratio"] for r in rows if r["species"] == sp])
        print(f"{sp:<24}{len(f0):>4}{np.percentile(f0,10):>9.0f}{np.median(f0):>9.0f}{np.percentile(f0,90):>9.0f}"
              f"{np.percentile(br,10):>10.2f}{np.median(br):>10.2f}")
    print(f"\n{len(rows)} clips measured, {len(failures)} failed to decode")
    for name, err in failures[:10]:
        print("  FAIL", name, err[:120])
    if not rows:
        sys.exit("no clips measured")


if __name__ == "__main__":
    main()
