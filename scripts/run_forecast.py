"""Train SNOWFLAKE.ML.FORECAST per disease and (for real data) back-test it. All through Snowflake's REST API.

    .venv/bin/python scripts/run_forecast.py              # all diseases
    .venv/bin/python scripts/run_forecast.py malaria      # one disease ("west nile" in quotes)

Target = ln(1 + weekly cases), converted back with exp(x) - 1: raw counts swing from single digits to tens of
thousands, and on the raw scale the model forecast negative cases with absurd intervals.

dengue  : InfoDengue nowcast (casos_est), 10 Sao Paulo municipalities. Reported counts for recent weeks are
          incomplete, so the last 2 weeks are dropped and 6 weeks are forecast (the first 2 are already past).
          Back-tested from 3 past origins.
malaria : SIMULATED weekly cases for 20 Lagos LGAs (scripts/simulate_lagos_malaria.py). No reporting lag, so
          4 weeks are forecast. Back-tested too, but that score is ON SIMULATED DATA: always quote it as such.
Produces ANALYTICS.<DISEASE>_FORECAST_OUT (lower / forecast / upper, 80% interval) and ANALYTICS.DENGUE_BACKTEST.
"""
import json, os, sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import snowflake_rest as sf  # noqa: E402

INTERVAL = 0.8
BACKTEST_ORIGINS_WEEKS = (4, 8, 12)   # forecast from this many weeks before the last usable week

DISEASES = {
    "dengue": dict(
        source="SELECT district_id, week_start, ROUND(cases_est) AS cases FROM RAW.CASES_INFODENGUE "
               "WHERE disease = 'dengue' AND cases_est IS NOT NULL",
        drop_days=14, horizon=6, backtest=True),
    "malaria": dict(
        source="SELECT district_id, week_start, cases FROM RAW.CASES_SIMULATED WHERE disease = 'malaria'",
        drop_days=0, horizon=4, backtest=True),
    "west nile": dict(   # SIMULATED positive mosquito pools, 5 NYC boroughs (scripts/simulate_nyc_westnile.py)
        source="SELECT district_id, week_start, cases FROM RAW.CASES_SIMULATED WHERE disease = 'west nile'",
        drop_days=0, horizon=4, backtest=True),
}

FORECAST_SQL = ("SELECT series::STRING, DATE_PART(epoch_second, ts), EXP(forecast) - 1, EXP(lower_bound) - 1, "
                "EXP(upper_bound) - 1 FROM TABLE(ANALYTICS.{m}!FORECAST(FORECASTING_PERIODS => {h}, "
                "CONFIG_OBJECT => OBJECT_CONSTRUCT('prediction_interval', {i})))")
# Over REST, a plain SELECT from model!FORECAST works but CREATE TABLE AS / INSERT ... SELECT over it is rejected
# (error 391917), and {...} object literals are rejected too; so rows are fetched and written back as JSON.


def load_env():
    for line in (ROOT / ".env").read_text().splitlines():
        k, _, v = line.partition("=")
        if k.startswith("SNOWFLAKE_"):
            os.environ[k] = v.strip().strip('"').strip("'")


def day(n: str) -> date:           # the SQL API returns DATE as days since 1970-01-01
    return date(1970, 1, 1) + timedelta(days=int(n))


def train_view(name: str, cfg: dict, cutoff: date | None):
    where = f"AND week_start <= '{cutoff.isoformat()}'" if cutoff else ""
    src = cfg["source"]
    sf.execute(f"""CREATE OR REPLACE VIEW ANALYTICS.{name} AS
        SELECT district_id AS series, week_start::TIMESTAMP_NTZ AS ts, LN(1 + cases)::FLOAT AS cases
        FROM ({src}) s
        WHERE week_start <= DATEADD('day', -{cfg['drop_days']}, (SELECT MAX(week_start) FROM ({src}) m)) {where}""")


def model(name: str, view: str):
    sf.execute(f"""CREATE OR REPLACE SNOWFLAKE.ML.FORECAST ANALYTICS.{name}(
        INPUT_DATA => TABLE(ANALYTICS.{view}), SERIES_COLNAME => 'SERIES',
        TIMESTAMP_COLNAME => 'TS', TARGET_COLNAME => 'CASES')""", timeout_s=600)


def forecast_rows(m: str, horizon: int) -> list[dict]:
    out = sf.execute(FORECAST_SQL.format(m=m, h=horizon, i=INTERVAL), timeout_s=600)
    return [{"series": r[0], "ts": int(float(r[1])), "forecast": float(r[2]),
             "lower_bound": float(r[3]), "upper_bound": float(r[4])} for r in out]


def save(table: str, rows: list[dict], origin: date | None = None):
    for r in rows:
        if origin:
            r["origin"] = origin.isoformat()
    cols = (["value:origin::DATE"] if origin else []) + [
        "value:series::STRING", "TO_TIMESTAMP_NTZ(value:ts::NUMBER, 0)", "value:forecast::FLOAT",
        "value:lower_bound::FLOAT", "value:upper_bound::FLOAT"]
    sf.execute(f"INSERT INTO {table} SELECT {', '.join(cols)} FROM TABLE(FLATTEN(INPUT => PARSE_JSON(?)))",
               bindings={"1": {"type": "TEXT", "value": json.dumps(rows)}})


def run(disease: str, cfg: dict):
    D = disease.upper().replace(" ", "_")
    n_series = int(sf.execute(f"SELECT COUNT(DISTINCT district_id) FROM ({cfg['source']})")[0][0])
    last_usable = day(sf.execute(f"SELECT MAX(week_start) - {cfg['drop_days']} FROM ({cfg['source']})")[0][0])
    print(f"\n[{disease}] {n_series} districts, last usable week {last_usable}")

    train_view(f"{D}_TRAIN", cfg, None)
    model(f"{D}_FORECASTER", f"{D}_TRAIN")
    sf.execute(f"""CREATE OR REPLACE TABLE ANALYTICS.{D}_FORECAST_OUT (
        series STRING, ts TIMESTAMP_NTZ, forecast FLOAT, lower_bound FLOAT, upper_bound FLOAT)""")
    save(f"ANALYTICS.{D}_FORECAST_OUT", forecast_rows(f"{D}_FORECASTER", cfg["horizon"]))
    n = int(sf.execute(f"SELECT COUNT(*) FROM ANALYTICS.{D}_FORECAST_OUT")[0][0])
    print(f"  forecast rows: {n}")
    if n != n_series * cfg["horizon"]:
        sys.exit(f"expected {n_series * cfg['horizon']} forecast rows, got {n}")

    if not cfg["backtest"]:
        print("  back-test skipped (simulated history)")
        return
    sf.execute(f"""CREATE OR REPLACE TABLE ANALYTICS.{D}_BACKTEST (
        origin DATE, series STRING, ts TIMESTAMP_NTZ, forecast FLOAT, lower_bound FLOAT, upper_bound FLOAT)""")
    for w in BACKTEST_ORIGINS_WEEKS:
        origin = last_usable - timedelta(weeks=w)
        train_view(f"{D}_TRAIN_BT{w}", cfg, origin)
        model(f"{D}_BT{w}", f"{D}_TRAIN_BT{w}")
        save(f"ANALYTICS.{D}_BACKTEST", forecast_rows(f"{D}_BT{w}", cfg["horizon"]), origin)
        print(f"  back-test origin {origin}: done")
    rows = sf.execute(f"""
        SELECT DATEDIFF('week', b.origin, b.ts::DATE) AS weeks_ahead, COUNT(*) AS n,
               SUM(ABS(b.forecast - c.cases)) / SUM(c.cases) AS wape,
               AVG(IFF(c.cases BETWEEN b.lower_bound AND b.upper_bound, 1, 0)) AS coverage
        FROM ANALYTICS.{D}_BACKTEST b
        JOIN ({cfg['source']}) c ON c.district_id = b.series AND c.week_start = b.ts::DATE
        GROUP BY 1 ORDER BY 1""")
    if not rows:
        sys.exit("back-test joined to zero rows")
    print(f"  back-test ({len(BACKTEST_ORIGINS_WEEKS)} origins x {n_series} districts), weeks the model never saw:")
    print(f"  {'weeks ahead':>12}{'n':>5}{'WAPE':>9}{'80% band hit rate':>20}")
    for wa, n, wape, cov in rows:
        print(f"  {wa:>12}{n:>5}{float(wape):>9.2f}{float(cov):>20.2f}")


def main():
    load_env()
    wanted = sys.argv[1:] or list(DISEASES)
    for d in wanted:
        if d not in DISEASES:
            sys.exit(f"unknown disease {d!r}; choose from {list(DISEASES)}")
        run(d, DISEASES[d])


if __name__ == "__main__":
    main()
