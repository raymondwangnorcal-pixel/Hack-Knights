"""Load public history into Snowflake RAW tables, over the REST API only.

    .venv/bin/python scripts/load_snowflake.py
    .venv/bin/python scripts/load_snowflake.py --weather-only US-     # add weather for new districts only

- RAW.CASES_INFODENGUE: weekly dengue cases for the 10 Greater Sao Paulo municipalities, 2020 to now (InfoDengue).
- RAW.WEATHER_DAILY: daily rain and mean temperature at each of the 30 district centroids (Open-Meteo archive).
Both tables are fully reloaded each run. Exits non-zero if a source returns nothing: no silent empty loads.
"""
import json, os, sys, time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import snowflake_rest as sf  # noqa: E402

CHUNK = 4000          # rows per INSERT; keeps each statement well under the API's size limit
WEATHER_START = "2024-01-01"   # forecast v1 uses cases only; weather feeds the risk score and a later lag feature


def load_env():
    for line in (ROOT / ".env").read_text().splitlines():
        k, _, v = line.partition("=")
        if k.startswith("SNOWFLAKE_"):
            os.environ[k] = v.strip().strip('"').strip("'")


def insert_json(table: str, columns: dict[str, str], rows: list[dict]):
    """columns: name -> Snowflake cast, e.g. {'day': 'DATE'}. One statement per chunk, rows sent as one JSON binding."""
    cols = ", ".join(columns)
    sel = ", ".join(f"value:{c}::{t}" for c, t in columns.items())
    for i in range(0, len(rows), CHUNK):
        sf.execute(f"INSERT INTO {table} ({cols}) SELECT {sel} FROM TABLE(FLATTEN(INPUT => PARSE_JSON(?)))",
                   bindings={"1": {"type": "TEXT", "value": json.dumps(rows[i:i + CHUNK])}})


def infodengue(districts):
    rows = []
    today = date.today()
    with httpx.Client(timeout=60) as c:
        for d in districts:
            if d["country"] != "BR":
                continue
            ibge = d["district_id"].split("-")[1]
            r = c.get("https://info.dengue.mat.br/api/alertcity", params=dict(
                geocode=ibge, disease="dengue", format="json", ew_start=1, ew_end=53, ey_start=2020, ey_end=today.year))
            r.raise_for_status()
            data = r.json()
            if not data:
                sys.exit(f"InfoDengue returned nothing for {d['name']} ({ibge})")
            seen = set()
            for w in data:
                # JSON gives epoch milliseconds at UTC midnight; local-time conversion would shift weeks back a day
                wk = (datetime.fromtimestamp(w["data_iniSE"] / 1000, tz=timezone.utc).date().isoformat()
                      if isinstance(w["data_iniSE"], (int, float)) else w["data_iniSE"])
                if wk in seen:
                    continue
                seen.add(wk)
                rows.append({"district_id": d["district_id"], "week_start": wk, "disease": "dengue",
                             "cases": int(w["casos"]), "cases_est": w.get("casos_est"),
                             "incidence_100k": w.get("p_inc100k")})
            print(f"  infodengue {d['name']:<24} {len(seen)} weeks")
    return rows


def weather(districts):
    rows, end = [], (date.today() - timedelta(days=3)).isoformat()
    with httpx.Client(timeout=60) as c:
        for d in districts:
            for attempt in range(6):  # free tier rate-limits bursts: back off, then fail loudly
                r = c.get("https://archive-api.open-meteo.com/v1/archive", params=dict(
                    latitude=d["lat"], longitude=d["lon"], start_date=WEATHER_START, end_date=end,
                    daily="precipitation_sum,temperature_2m_mean", timezone="auto"))
                if r.status_code != 429:
                    break
                wait = 15 * (attempt + 1)
                print(f"  open-meteo rate limit at {d['district_id']}, waiting {wait}s")
                time.sleep(wait)
            r.raise_for_status()
            day = r.json()["daily"]
            n = 0
            for t, rain, temp in zip(day["time"], day["precipitation_sum"], day["temperature_2m_mean"]):
                if rain is None and temp is None:
                    continue
                rows.append({"district_id": d["district_id"], "day": t, "rain_mm": rain, "temp_mean_c": temp})
                n += 1
            if n == 0:
                sys.exit(f"Open-Meteo returned no data for {d['district_id']}")
            time.sleep(0.3)
    print(f"  open-meteo {len(rows)} district-days for {len(districts)} districts")
    return rows


def weather_only(prefix: str):
    """Add weather for districts whose id starts with prefix (e.g. 'US-') without reloading everything else."""
    districts = [d for d in json.load(open(ROOT / "data/districts.json")) if d["district_id"].startswith(prefix)]
    if not districts:
        sys.exit(f"no districts start with {prefix!r}")
    wx = weather(districts)
    sf.execute("DELETE FROM RAW.WEATHER_DAILY WHERE STARTSWITH(district_id, ?)",
               bindings={"1": {"type": "TEXT", "value": prefix}})
    insert_json("RAW.WEATHER_DAILY", {"district_id": "STRING", "day": "DATE", "rain_mm": "FLOAT",
                                      "temp_mean_c": "FLOAT"}, wx)
    got = int(sf.execute("SELECT COUNT(*) FROM RAW.WEATHER_DAILY WHERE STARTSWITH(district_id, ?)",
                         bindings={"1": {"type": "TEXT", "value": prefix}})[0][0])
    print(f"  RAW.WEATHER_DAILY rows for {prefix}*: {got}")
    if got != len(wx):
        sys.exit(f"sent {len(wx)} rows but Snowflake has {got}")


def main():
    load_env()
    if len(sys.argv) == 3 and sys.argv[1] == "--weather-only":
        return weather_only(sys.argv[2])
    districts = json.load(open(ROOT / "data/districts.json"))
    print("fetching InfoDengue...")
    cases = infodengue(districts)
    print("fetching Open-Meteo...")
    wx = weather(districts)

    print("loading into Snowflake...")
    sf.execute("TRUNCATE TABLE RAW.CASES_INFODENGUE")
    insert_json("RAW.CASES_INFODENGUE", {"district_id": "STRING", "week_start": "DATE", "disease": "STRING",
                                         "cases": "NUMBER", "cases_est": "FLOAT", "incidence_100k": "FLOAT"}, cases)
    sf.execute("TRUNCATE TABLE RAW.WEATHER_DAILY")
    insert_json("RAW.WEATHER_DAILY", {"district_id": "STRING", "day": "DATE", "rain_mm": "FLOAT",
                                      "temp_mean_c": "FLOAT"}, wx)

    for table, expect in (("RAW.CASES_INFODENGUE", len(cases)), ("RAW.WEATHER_DAILY", len(wx))):
        got = int(sf.execute(f"SELECT COUNT(*) FROM {table}")[0][0])
        print(f"  {table}: {got} rows")
        if got != expect:
            sys.exit(f"{table}: sent {expect} rows but Snowflake has {got}")
    print("done")


if __name__ == "__main__":
    main()
