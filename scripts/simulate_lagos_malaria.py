"""Simulate weekly malaria cases for the 20 Lagos LGAs, driven by REAL rainfall, into Snowflake.

    .venv/bin/python scripts/simulate_lagos_malaria.py

Why simulated: no public weekly malaria counts exist per Lagos LGA (Malaria Atlas Project data is annual and
modeled). Every row is labelled source='simulated' downstream and must be shown as such.

Generator (deterministic, seed 42):
  rain_index(t) = mean weekly rainfall over weeks t-6 .. t-3 (mosquito breeding lag), from Open-Meteo (real)
  r = rain_index / its 90th percentile, clipped to [0, 1.5]
  expected(t) = base_LGA * (0.5 + 0.9 * r);  cases ~ Poisson(expected)
  base_LGA ~ lognormal around 120 cases/week (illustrative, not a sourced rate)
Writes RAW.CASES_SIMULATED (district_id, week_start, disease='malaria', cases, generator).
"""
import json, os, sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import snowflake_rest as sf  # noqa: E402

GENERATOR = "rain-lag3to6-poisson-v1"
LAG_MIN, LAG_MAX = 3, 6


def load_env():
    for line in (ROOT / ".env").read_text().splitlines():
        k, _, v = line.partition("=")
        if k.startswith("SNOWFLAKE_"):
            os.environ[k] = v.strip().strip('"').strip("'")


def day(n: str) -> date:  # SQL API returns DATE as days since 1970-01-01
    return date(1970, 1, 1) + timedelta(days=int(n))


def main():
    load_env()
    rng = np.random.default_rng(42)
    # Sunday-start weeks (InfoDengue convention), complete weeks only
    rows = sf.execute("""
        SELECT district_id, week_start, SUM(rain_mm) AS rain
        FROM (SELECT district_id, rain_mm, DATEADD('day', -(DAYOFWEEKISO(day) % 7), day) AS week_start
              FROM RAW.WEATHER_DAILY WHERE district_id LIKE 'NG-LA-%')
        GROUP BY 1, 2 HAVING COUNT(*) = 7 ORDER BY 1, 2""")
    if not rows:
        sys.exit("no Lagos weather in RAW.WEATHER_DAILY: run load_snowflake.py first")
    series = {}
    for did, wk, rain in rows:
        series.setdefault(did, []).append((day(wk), float(rain or 0.0)))
    if len(series) != 20:
        sys.exit(f"expected 20 Lagos LGAs with weather, found {len(series)}")

    lagged = {did: [(wk, np.mean([r for _, r in s[i - LAG_MAX:i - LAG_MIN + 1]]))
                    for i, (wk, _) in enumerate(s) if i >= LAG_MAX] for did, s in series.items()}
    p90 = np.percentile([v for s in lagged.values() for _, v in s], 90)
    out = []
    for did in sorted(lagged):
        base = float(np.exp(rng.normal(np.log(120), 0.5)))
        for wk, v in lagged[did]:
            r = min(1.5, max(0.0, v / p90))
            out.append({"district_id": did, "week_start": wk.isoformat(), "disease": "malaria",
                        "cases": int(rng.poisson(base * (0.5 + 0.9 * r))), "generator": GENERATOR})

    sf.execute("""CREATE TABLE IF NOT EXISTS RAW.CASES_SIMULATED (
        district_id STRING NOT NULL, week_start DATE NOT NULL, disease STRING NOT NULL,
        cases NUMBER NOT NULL, generator STRING NOT NULL)""")
    sf.execute("DELETE FROM RAW.CASES_SIMULATED WHERE disease = 'malaria'")
    for i in range(0, len(out), 4000):
        sf.execute("""INSERT INTO RAW.CASES_SIMULATED
            SELECT value:district_id::STRING, value:week_start::DATE, value:disease::STRING,
                   value:cases::NUMBER, value:generator::STRING
            FROM TABLE(FLATTEN(INPUT => PARSE_JSON(?)))""",
                   bindings={"1": {"type": "TEXT", "value": json.dumps(out[i:i + 4000])}})
    got = int(sf.execute("SELECT COUNT(*) FROM RAW.CASES_SIMULATED WHERE disease = 'malaria'")[0][0])
    weeks = sorted({r["week_start"] for r in out})
    print(f"simulated {len(out)} rows: 20 LGAs x {len(weeks)} weeks ({weeks[0]} to {weeks[-1]}); Snowflake has {got}")
    if got != len(out):
        sys.exit("row count mismatch")
    c = np.array([r["cases"] for r in out])
    print(f"weekly cases per LGA: median {np.median(c):.0f}, 10th pct {np.percentile(c, 10):.0f}, 90th {np.percentile(c, 90):.0f}")


if __name__ == "__main__":
    main()
