"""Export districts from Tiger Data to data/districts.json (for Raymond's dropdown and mock_phone.py).

    .venv/bin/python scripts/export_districts.py
"""
import json, sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.db import load_dotenv  # noqa: E402

OUT = ROOT / "data/districts.json"


def main():
    load_dotenv()
    with psycopg.connect(connect_timeout=15) as conn:
        rows = conn.execute("""SELECT district_id, country, city, name, centroid_lat, centroid_lon
                               FROM districts ORDER BY country, name""").fetchall()
    if not rows:
        sys.exit("districts table is empty")
    out = [dict(district_id=r[0], country=r[1], city=r[2], name=r[3], lat=round(r[4], 5), lon=round(r[5], 5))
           for r in rows]
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"wrote {len(out)} districts to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
