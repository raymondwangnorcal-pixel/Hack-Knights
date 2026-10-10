"""Train SNOWFLAKE.ML.FORECAST on dengue history and back-test it. All through Snowflake's REST API.

    .venv/bin/python scripts/run_forecast.py

Target = ln(1 + InfoDengue's nowcast casos_est): reported counts for the most recent weeks are incomplete, and
raw counts swing from single digits to tens of thousands, so on the raw scale the model forecasts negative cases
with absurd intervals. Outputs are converted back with exp(x) - 1. The last 2 weeks are dropped (incomplete). Produces:
  ANALYTICS.DENGUE_FORECAST_OUT   6 weeks past the training cutoff per district (publish only the future ones), lower / forecast / upper (80% interval)
  ANALYTICS.DENGUE_BACKTEST       forecasts from 3 past origins next to what actually happened
"""
import json, os, sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import snowflake_rest as sf  # noqa: E402

HORIZON, INTERVAL = 6, 0.8   # 6 weeks past the cutoff: the first 2 are already in the past (data lag)
DROP_RECENT_DAYS = 14          # latest weeks are incomplete nowcasts
BACKTEST_ORIGINS_WEEKS = (4, 8, 12)   # forecast from this many weeks before the last usable week


def load_env():
    for line in (ROOT / ".env").read_text().splitlines():
        k, _, v = line.partition("=")
        if k.startswith("SNOWFLAKE_"):
            os.environ[k] = v.strip().strip('"').strip("'")


def day(n: str) -> date:           # the SQL API returns DATE as days since 1970-01-01
    return date(1970, 1, 1) + timedelta(days=int(n))


def train_view(name: str, cutoff: date | None):
    where = f"AND week_start <= '{cutoff.isoformat()}'" if cutoff else ""
    sf.execute(f"""CREATE OR REPLACE VIEW ANALYTICS.{name} AS
        SELECT district_id AS series, week_start::TIMESTAMP_NTZ AS ts, LN(1 + ROUND(cases_est))::FLOAT AS cases
        FROM RAW.CASES_INFODENGUE
        WHERE disease = 'dengue' AND cases_est IS NOT NULL
          AND week_start <= DATEADD('day', -{DROP_RECENT_DAYS}, (SELECT MAX(week_start) FROM RAW.CASES_INFODENGUE)) {where}""")


FORECAST_SQL = ("SELECT series::STRING, DATE_PART(epoch_second, ts), EXP(forecast) - 1, EXP(lower_bound) - 1, "
                "EXP(upper_bound) - 1 FROM TABLE(ANALYTICS.{m}!FORECAST(FORECASTING_PERIODS => {h}, "
                "CONFIG_OBJECT => OBJECT_CONSTRUCT('prediction_interval', {i})))")
# Over REST, a plain SELECT from model!FORECAST works but CREATE TABLE AS / INSERT ... SELECT over it is rejected
# (error 391917), so rows are fetched and written back as JSON.


def forecast_rows(m: str) -> list[dict]:
    out = sf.execute(FORECAST_SQL.format(m=m, h=HORIZON, i=INTERVAL), timeout_s=600)
    return [{"series": r[0], "ts": int(float(r[1])), "forecast": float(r[2]),
             "lower_bound": float(r[3]), "upper_bound": float(r[4])} for r in out]


def save(table: str, rows: list[dict], origin: date | None = None):
    for r in rows:
        if origin:
            r["origin"] = origin.isoformat()
    cols = (["origin::DATE"] if origin else []) + ["series::STRING", "TO_TIMESTAMP_NTZ(value:ts::NUMBER, 0)",
                                                    "value:forecast::FLOAT", "value:lower_bound::FLOAT",
                                                    "value:upper_bound::FLOAT"]
    sel = ", ".join(c if "value:" in c else f"value:{c.split('::')[0]}::{c.split('::')[1]}" for c in cols)
    sf.execute(f"INSERT INTO {table} SELECT {sel} FROM TABLE(FLATTEN(INPUT => PARSE_JSON(?)))",
               bindings={"1": {"type": "TEXT", "value": json.dumps(rows)}})


def model(name: str, view: str):
    sf.execute(f"""CREATE OR REPLACE SNOWFLAKE.ML.FORECAST ANALYTICS.{name}(
        INPUT_DATA => TABLE(ANALYTICS.{view}), SERIES_COLNAME => 'SERIES',
        TIMESTAMP_COLNAME => 'TS', TARGET_COLNAME => 'CASES')""", timeout_s=600)


def main():
    load_env()
    last_usable = day(sf.execute(
        f"SELECT MAX(week_start) - {DROP_RECENT_DAYS} FROM RAW.CASES_INFODENGUE")[0][0])
    print("last usable week:", last_usable)

    print("training production model on all usable weeks...")
    train_view("DENGUE_TRAIN", None)
    model("DENGUE_FORECASTER", "DENGUE_TRAIN")
    sf.execute("""CREATE OR REPLACE TABLE ANALYTICS.DENGUE_FORECAST_OUT (
        series STRING, ts TIMESTAMP_NTZ, forecast FLOAT, lower_bound FLOAT, upper_bound FLOAT)""")
    save("ANALYTICS.DENGUE_FORECAST_OUT", forecast_rows("DENGUE_FORECASTER"))
    n = int(sf.execute("SELECT COUNT(*) FROM ANALYTICS.DENGUE_FORECAST_OUT")[0][0])
    print(f"  forecast rows: {n}")
    if n != 10 * HORIZON:
        sys.exit(f"expected {10 * HORIZON} forecast rows (10 districts x {HORIZON} weeks), got {n}")

    print("back-testing...")
    sf.execute("""CREATE OR REPLACE TABLE ANALYTICS.DENGUE_BACKTEST (
        origin DATE, series STRING, ts TIMESTAMP_NTZ, forecast FLOAT, lower_bound FLOAT, upper_bound FLOAT)""")
    for w in BACKTEST_ORIGINS_WEEKS:
        origin = last_usable - timedelta(weeks=w)
        v, m = f"DENGUE_TRAIN_BT{w}", f"DENGUE_BT{w}"
        train_view(v, origin)
        model(m, v)
        save("ANALYTICS.DENGUE_BACKTEST", forecast_rows(m), origin)
        print(f"  origin {origin}: done")

    rows = sf.execute("""
        SELECT DATEDIFF('week', b.origin, b.ts::DATE) AS weeks_ahead,
               COUNT(*) AS n,
               SUM(ABS(b.forecast - ROUND(c.cases_est))) / SUM(ROUND(c.cases_est)) AS wape,
               AVG(IFF(ROUND(c.cases_est) BETWEEN b.lower_bound AND b.upper_bound, 1, 0)) AS coverage
        FROM ANALYTICS.DENGUE_BACKTEST b
        JOIN RAW.CASES_INFODENGUE c ON c.district_id = b.series AND c.week_start = b.ts::DATE
        GROUP BY 1 ORDER BY 1""")
    print("\nback-test (3 origins x 10 districts), error vs InfoDengue nowcast on weeks the model never saw:")
    print(f"{'weeks ahead':>12}{'n':>5}{'WAPE':>9}{'80% band hit rate':>20}")
    for wa, n, wape, cov in rows:
        print(f"{wa:>12}{n:>5}{float(wape):>9.2f}{float(cov):>20.2f}")
    if not rows:
        sys.exit("back-test joined to zero rows")


if __name__ == "__main__":
    main()
