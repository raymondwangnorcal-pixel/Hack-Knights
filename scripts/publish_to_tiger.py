"""Copy Snowflake's results into Tiger Data so the live path reads everything from one place.

    .venv/bin/python scripts/publish_to_tiger.py        (needs the hotspot: Tiger is blocked on venue Wi-Fi)

  RAW.CASES_INFODENGUE (dengue, real nowcast)   -> case_history, source 'infodengue'
  RAW.CASES_SIMULATED  (malaria, Lagos)         -> case_history, source 'simulated'
  RAW.WEATHER_DAILY                             -> weather_daily
  ANALYTICS.<DISEASE>_FORECAST_OUT              -> forecasts, weeks_ahead 1..4 after that disease's last observed
                                                   week, clipped at 0; model name says when history was simulated
Idempotent for cases and weather (upsert). Forecasts append a new generated_at batch. Exits non-zero on empty sources.
"""
import os, sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import snowflake_rest as sf  # noqa: E402
from app.db import load_dotenv  # noqa: E402

SOURCES = {  # disease -> (case query returning district_id, week_start, cases), case source label, forecast model name
    "dengue": ("SELECT district_id, week_start, ROUND(cases_est) FROM RAW.CASES_INFODENGUE "
               "WHERE disease = 'dengue' AND cases_est IS NOT NULL", "infodengue", "snowflake-ml-forecast-v1-log"),
    "malaria": ("SELECT district_id, week_start, cases FROM RAW.CASES_SIMULATED WHERE disease = 'malaria'",
                "simulated", "snowflake-ml-forecast-v1-log-on-simulated"),
    "west nile": ("SELECT district_id, week_start, cases FROM RAW.CASES_SIMULATED WHERE disease = 'west nile'",
                  "simulated", "snowflake-ml-forecast-v1-log-on-simulated"),   # unit: positive mosquito pools
}


def day(n: str) -> date:  # the SQL API returns DATE as days since 1970-01-01
    return date(1970, 1, 1) + timedelta(days=int(n))


def main():
    load_dotenv()
    for line in (ROOT / ".env").read_text().splitlines():
        k, _, v = line.partition("=")
        if k.startswith("SNOWFLAKE_"):
            os.environ[k] = v.strip().strip('"').strip("'")

    cases, fc = [], []
    for disease, (query, label, model_name) in SOURCES.items():
        rows = sf.execute(query)
        if not rows:
            sys.exit(f"Snowflake returned no {disease} cases: nothing published")
        cases += [(day(r[1]), r[0], disease, int(float(r[2])), label) for r in rows]
        last_obs = max(day(r[1]) for r in rows)
        n_before = len(fc)
        for series, ts, mid, lo, hi in sf.execute(
                "SELECT series, DATE_PART(epoch_second, ts), forecast, lower_bound, upper_bound "
                f"FROM ANALYTICS.{disease.upper().replace(' ', '_')}_FORECAST_OUT"):
            wk = datetime.fromtimestamp(int(float(ts)), tz=timezone.utc).date()
            ahead = (wk - last_obs).days // 7
            if 1 <= ahead <= 4:  # weeks at or before the last observed week are already in the past
                lo_, mid_, hi_ = (max(0.0, float(x)) for x in (lo, mid, hi))
                fc.append((series, disease, wk, ahead, lo_, mid_, hi_, model_name))
        if len(fc) == n_before:
            sys.exit(f"no future {disease} forecast weeks: re-run run_forecast.py")
        print(f"{disease}: {len(rows)} case rows ({label}), {len(fc) - n_before} forecast rows, last observed {last_obs}")
    weather = [(day(r[1]), r[0], None if r[2] is None else float(r[2]), None if r[3] is None else float(r[3]))
               for r in sf.execute("SELECT district_id, day, rain_mm, temp_mean_c FROM RAW.WEATHER_DAILY")]
    if not weather:
        sys.exit("Snowflake returned no weather: nothing published")

    with psycopg.connect(connect_timeout=15) as conn, conn.cursor() as cur:
        cur.executemany("""INSERT INTO case_history (week, district_id, disease, cases, source)
                           VALUES (%s, %s, %s, %s, %s)
                           ON CONFLICT (district_id, disease, week) DO UPDATE SET cases = EXCLUDED.cases,
                             source = EXCLUDED.source""", cases)
        cur.executemany("""INSERT INTO weather_daily (day, district_id, rain_mm, temp_mean_c) VALUES (%s, %s, %s, %s)
                           ON CONFLICT (district_id, day) DO UPDATE SET rain_mm = EXCLUDED.rain_mm,
                             temp_mean_c = EXCLUDED.temp_mean_c""", weather)
        cur.executemany("""INSERT INTO forecasts (district_id, disease, week_start, weeks_ahead, low, mid, high, model)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""", fc)
        for t in ("case_history", "weather_daily", "forecasts"):
            print(f"  Tiger {t}: {cur.execute(f'SELECT count(*) FROM {t}').fetchone()[0]} rows")
    print("done")


if __name__ == "__main__":
    main()
