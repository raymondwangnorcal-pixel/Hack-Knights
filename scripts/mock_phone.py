"""Stand-in for the phone app: posts 10 s Abuzz clips to /classify the way the browser will.

    .venv/bin/python scripts/mock_phone.py --n 5                    # local service
    .venv/bin/python scripts/mock_phone.py --url https://... --n 20 --interval 3
Clips are encoded as webm/Opus (what Chrome on Android records). Rows are real, not simulated:
they go through the full decode -> model -> insert -> notify path.
"""
import argparse, json, random, subprocess, sys, time, uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
CLIPS = ROOT / "data/raw/species"
EXTS = {".wav", ".m4a", ".amr", ".mp4"}


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def ten_second_webm(path: Path) -> bytes:
    start = max(0.0, random.uniform(0, max(0.0, duration(path) - 10)))
    return subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-ss", f"{start:.2f}", "-t", "10", "-i", str(path),
                           "-ac", "1", "-c:a", "libopus", "-b:a", "32k", "-f", "webm", "pipe:1"],
                          capture_output=True, check=True).stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--interval", type=float, default=2.0)
    ap.add_argument("--districts", default=str(ROOT / "data/districts.json"))
    args = ap.parse_args()

    districts = json.load(open(args.districts))
    clips = [f for f in CLIPS.rglob("*") if f.suffix.lower() in EXTS]
    if not clips or not districts:
        sys.exit("no clips or no districts: extract Abuzz and run export_districts.py first")

    failures = 0
    with httpx.Client(timeout=60) as client:
        for i in range(args.n):
            clip, d = random.choice(clips), random.choice(districts)
            r = client.post(f"{args.url}/classify",
                            files={"audio": ("clip.webm", ten_second_webm(clip), "audio/webm")},
                            data={"client_id": str(uuid.uuid4()), "recorded_at": datetime.now(timezone.utc).isoformat(),
                                  "country": d["country"], "district_id": d["district_id"], "source": "phone",
                                  "device": "mock-phone", "mime": "audio/webm;codecs=opus"})
            if r.status_code != 200:
                failures += 1
                print(f"[{i+1}] HTTP {r.status_code}: {r.text[:200]}")
            else:
                j = r.json()
                species = clip.relative_to(CLIPS).parts[0]
                print(f"[{i+1}] {species:<24} -> {d['district_id']:<22} mosquito={j['is_mosquito']} "
                      f"genus={j['genus']} conf={j['confidence']} id={j['detection_id'][:8]}")
            if i < args.n - 1:
                time.sleep(args.interval)
    if failures:
        sys.exit(f"{failures} of {args.n} uploads failed")


if __name__ == "__main__":
    main()
