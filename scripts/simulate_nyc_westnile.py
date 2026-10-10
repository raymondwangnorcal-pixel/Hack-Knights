"""Simulate weekly West Nile positive mosquito pools for the 5 NYC boroughs, driven by REAL temperature.

    .venv/bin/python scripts/simulate_nyc_westnile.py

Unit: positive mosquito pools per week (what NYC's health department reports; human cases are too few to
forecast). Stored in the 'cases' column with disease='west nile'; every row is labelled simulated downstream.

Generator (deterministic, seed 7):
  heat(t) = max(0, mean temperature over weeks t-2 .. t-1  minus 18 C) / 8      (Culex + virus need warmth)
  amp(t)  = min(1, warm weeks so far this year / 10)                            (virus builds up in birds over summer)
  expected(t) = base_borough * heat^1.5 * amp;  pools ~ Poisson(expected)
  base_borough ~ lognormal around 6 pools/week (illustrative, not a sourced rate)
Writes RAW.CASES_SIMULATED (district_id, week_start, disease='west nile', cases, generator).
"""
import json, os, sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import snowflake_rest as sf  # noqa: E402

DISEASE, GENERATOR = "west nile", "temp-lag1to2-season-poisson-v1"
T_BASE, T_SCALE, LAG = 18.0, 8.0, 2


def load_env():
    for line in (ROOT / ".env").read_text().splitlines():
        k, _, v = line.partition("=")
        if k.startswith("SNOWFLAKE_"):
            os.environ[k] = v.strip().strip('"').strip("'")


def day(n: str) -> date:  # SQL API returns DATE as days since 1970-01-01
    return date(1970, 1, 1) + timedelta(days=int(n))


def main():
    load_env()
    rng = np.random.default_rng(7)
    rows = sf.execute("""
        SELECT district_id, week_start, AVG(temp_mean_c) AS temp
        FROM (SELECT district_id, temp_mean_c, DATEADD('day', -(DAYOFWEEKISO(day) % 7), day) AS week_start
              FROM RAW.WEATHER_DAILY WHERE district_id LIKE 'US-NY-%')
        GROUP BY 1, 2 HAVING COUNT(*) = 7 ORDER BY 1, 2""")
    series = {}
    for did, wk, temp in rows:
        series.setdefault(did, []).append((day(wk), float(temp)))
    if len(series) != 5:
        sys.exit(f"expected 5 NYC boroughs with weather, found {len(series)}: run load_snowflake.py --weather-only US-")

    out = []
    for did in sorted(series):
        base = float(np.exp(rng.normal(np.log(6), 0.4)))
        s = series[did]
        warm_weeks, year = 0, None
        for i in range(LAG, len(s)):
            wk, temp = s[i]
            if wk.year != year:
                year, warm_weeks = wk.year, 0
            if temp > T_BASE:
                warm_weeks += 1
            t_lag = np.mean([t for _, t in s[i - LAG:i]])
            heat = max(0.0, t_lag - T_BASE) / T_SCALE
            amp = min(1.0, warm_weeks / 10)
            out.append({"district_id": did, "week_start": wk.isoformat(), "disease": DISEASE,
                        "cases": int(rng.poisson(base * heat ** 1.5 * amp)), "generator": GENERATOR})

    sf.execute("DELETE FROM RAW.CASES_SIMULATED WHERE disease = ?", bindings={"1": {"type": "TEXT", "value": DISEASE}})
    sf.execute("""INSERT INTO RAW.CASES_SIMULATED
        SELECT value:district_id::STRING, value:week_start::DATE, value:disease::STRING,
               value:cases::NUMBER, value:generator::STRING
        FROM TABLE(FLATTEN(INPUT => PARSE_JSON(?)))""", bindings={"1": {"type": "TEXT", "value": json.dumps(out)}})
    got = int(sf.execute("SELECT COUNT(*) FROM RAW.CASES_SIMULATED WHERE disease = ?",
                         bindings={"1": {"type": "TEXT", "value": DISEASE}})[0][0])
    weeks = sorted({r["week_start"] for r in out})
    print(f"simulated {len(out)} rows: 5 boroughs x {len(weeks)} weeks ({weeks[0]} to {weeks[-1]}); Snowflake has {got}")
    if got != len(out):
        sys.exit("row count mismatch")
    by_month = {}
    for r in out:
        if r["week_start"].startswith("2025"):
            by_month.setdefault(int(r["week_start"][5:7]), []).append(r["cases"])
    print("2025 average pools per borough-week by month:",
          {m: round(float(np.mean(v)), 1) for m, v in sorted(by_month.items())})


if __name__ == "__main__":
    main()
