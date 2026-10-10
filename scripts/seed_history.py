"""Seed 8 weeks of SIMULATED mosquito detections so the map, time slider and risk score have history.

    .venv/bin/python scripts/seed_history.py        (needs the hotspot: Tiger is blocked on venue Wi-Fi)

Every row: is_simulated = true, device = 'seed', model_version = 'seed-v1'. Re-running replaces earlier seed rows.
Volume follows each district's own case curve on a log scale (real dengue nowcast for Sao Paulo; simulated malaria / West Nile
for Lagos / NYC), so busy districts get more reports. Rows stop 2 hours before now, so the live-stream trigger
(last hour only) is not flooded. Genus mix follows the local vector: Aedes in Sao Paulo, Anopheles in Lagos,
Culex in New York.
"""
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import psycopg

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.db import load_dotenv  # noqa: E402
from app.species import diseases_for  # noqa: E402

DAYS = 56
MAX_PER_DAY = 6.0    # busiest district-day in each country averages this many reports
MIN_PER_DAY = 0.3
GENUS_MIX = {"BR": {"aedes": 0.85, "culex": 0.10, "anopheles": 0.05},
             "NG": {"anopheles": 0.80, "culex": 0.15, "aedes": 0.05},
             "US": {"culex": 0.90, "aedes": 0.10}}
SPECIES = {"aedes": ["Aedes aegypti", "Aedes albopictus"],
           "anopheles": ["Anopheles gambiae", "Anopheles arabiensis", "Anopheles stephensi"],
           "culex": ["Culex quinquefasciatus"]}


def main():
    load_dotenv()
    rng = np.random.default_rng(11)
    end = datetime.now(timezone.utc) - timedelta(hours=2)
    start = end - timedelta(days=DAYS)
    with psycopg.connect(connect_timeout=15, autocommit=True) as conn:
        dist = conn.execute("SELECT district_id, country FROM districts").fetchall()
        cases = {}
        for did, wk, n in conn.execute("SELECT district_id, week, cases FROM case_history WHERE week >= %s",
                                       (start.date() - timedelta(days=7),)):
            cases[(did, wk)] = n
        latest = {did: n for (did, _), n in sorted(cases.items(), key=lambda kv: kv[0][1])}
        peak = {}
        for did, country in dist:
            peak[country] = max(peak.get(country, 0), max([n for (d, _), n in cases.items() if d == did] or [0]))

        rows = []
        for did, country in dist:
            mix = GENUS_MIX[country]
            genera, probs = list(mix), np.array(list(mix.values()))
            for k in range(DAYS):
                day = start + timedelta(days=k)
                week = (day.date() - timedelta(days=(day.weekday() + 1) % 7))   # Sunday-start week
                n_cases = cases.get((did, week), latest.get(did, 0))
                share = np.log1p(n_cases) / np.log1p(peak[country]) if peak[country] else 0.0   # log: small districts stay visible
                lam = MIN_PER_DAY + (MAX_PER_DAY - MIN_PER_DAY) * share
                for _ in range(rng.poisson(lam)):
                    t = day + timedelta(seconds=float(rng.uniform(0, 86400)))
                    if t > end:
                        continue
                    genus = str(rng.choice(genera, p=probs))
                    rows.append((t, uuid.uuid4(), country, did, "phone", True, str(rng.choice(SPECIES[genus])), genus,
                                 round(float(rng.uniform(0.55, 0.99)), 3), diseases_for(genus), "seed-v1", "seed", True))
        if not rows:
            sys.exit("generated no rows: is case_history empty?")

        deleted = conn.execute("DELETE FROM detections WHERE device = 'seed' AND is_simulated").rowcount
        with conn.cursor() as cur:
            cur.executemany("""INSERT INTO detections (time, client_id, country, district_id, source, is_mosquito,
                                   species, genus, confidence, diseases, model_version, device, is_simulated)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""", rows)
        conn.execute("CALL refresh_continuous_aggregate('daily_counts', NULL, NULL)")
        conn.execute("CALL refresh_continuous_aggregate('weekly_counts', NULL, NULL)")
        per = conn.execute("""SELECT country, count(*), count(DISTINCT district_id) FROM detections
                              WHERE device = 'seed' GROUP BY 1 ORDER BY 1""").fetchall()
        agg = conn.execute("SELECT sum(detections) FROM daily_counts WHERE simulated > 0").fetchone()[0]
    print(f"replaced {deleted} old seed rows with {len(rows)} new ones ({start:%Y-%m-%d} to {end:%Y-%m-%d %H:%M} UTC)")
    for country, n, nd in per:
        print(f"  {country}: {n} detections across {nd} districts")
    print(f"daily_counts after refresh: {agg} simulated detections")


if __name__ == "__main__":
    main()
