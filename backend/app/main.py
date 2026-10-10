"""Buzz Check model service.

    .venv/bin/uvicorn app.main:app --app-dir backend --port 8000

Write: POST /classify.  Reads for the dashboard: GET /districts /detections /risk /forecast /timeline,
and GET /stream (Server-Sent Events, one event per new real-time detection, relayed from Postgres NOTIFY).
"""
import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import psycopg
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import model
from .audio import AudioDecodeError, decode
from .db import make_pool
from .species import diseases_for

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # a 10 s clip is well under 1 MB in any browser format

COUNTRIES = ("BR", "NG", "US")
UNITS = {"dengue": "cases", "malaria": "cases", "west nile": "positive mosquito pools"}

log = logging.getLogger("buzzcheck")
pool = make_pool()
districts: dict[str, dict] = {}
subscribers: set[asyncio.Queue] = set()
listener = {"connected": False, "events": 0}


async def listen_forever():
    """One session connection LISTENs on 'detections' and fans each event out to every open /stream.
    Reconnects on failure and logs it loudly; /health reports whether it is connected."""
    while True:
        try:
            conn = await psycopg.AsyncConnection.connect("connect_timeout=15", autocommit=True)
            async with conn:
                await conn.execute("LISTEN detections")
                listener["connected"] = True
                log.warning("stream listener connected")
                async for n in conn.notifies():
                    ev = json.loads(n.payload)
                    d = districts.get(ev.get("district_id"), {})
                    ev.update(district_name=d.get("name"), lat=d.get("lat"), lon=d.get("lon"))
                    listener["events"] += 1
                    for q in list(subscribers):
                        if not q.full():
                            q.put_nowait(ev)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            listener["connected"] = False
            log.error("stream listener lost its connection (%s); reconnecting in 3 s", e)
            await asyncio.sleep(3)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await pool.open(wait=True, timeout=30)
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT district_id, country, city, name, centroid_lat, centroid_lon FROM districts")
        for did, country, city, name, lat, lon in await cur.fetchall():
            districts[did] = {"country": country, "city": city, "name": name, "lat": lat, "lon": lon}
    if not districts:
        raise RuntimeError("districts table is empty: run scripts/load_districts.py first")
    task = asyncio.create_task(listen_forever())
    yield
    task.cancel()
    await pool.close()


app = FastAPI(title="Buzz Check model service", lifespan=lifespan)
# Read endpoints carry no secrets; the dashboard (Vercel) and the phone proxy call them from another origin.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


def _country(country: str | None) -> str | None:
    if country is not None and country not in COUNTRIES:
        raise HTTPException(422, f"country must be one of {COUNTRIES}")
    return country


async def _rows(sql: str, params: tuple) -> list[dict]:
    async with pool.connection() as conn:
        cur = await conn.execute(sql, params)
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, r)) for r in await cur.fetchall()]


@app.get("/health")
async def health():
    async with pool.connection() as conn:
        await conn.execute("SELECT 1")
    return {"ok": True, "model_version": model.MODEL_VERSION, "districts": len(districts),
            "stream_listener_connected": listener["connected"], "stream_clients": len(subscribers)}


@app.get("/districts")
async def get_districts(country: str | None = None, geojson: bool = False):
    """District list for dropdowns and the map. geojson=true adds simplified outlines."""
    _country(country)
    rows = await _rows(f"""SELECT district_id, country, city, name, centroid_lat AS lat, centroid_lon AS lon
                                  {', geojson' if geojson else ''}
                           FROM districts WHERE %(c)s::text IS NULL OR country = %(c)s::text
                           ORDER BY country, name""", {"c": country})
    return {"districts": rows}


@app.get("/detections")
async def get_detections(country: str | None = None, since: datetime | None = None,
                         limit: int = Query(5000, le=20000)):
    """Mosquito detections for the map and time slider (newest first). Default: last 7 days."""
    _country(country)
    since = since or datetime.now(timezone.utc) - timedelta(days=7)
    rows = await _rows("""
        SELECT d.time, d.detection_id, d.country, d.district_id, s.name AS district_name,
               s.centroid_lat AS lat, s.centroid_lon AS lon, d.genus, d.species, d.confidence,
               d.diseases, d.source, d.is_simulated
        FROM detections d JOIN districts s USING (district_id)
        WHERE d.is_mosquito AND d.time >= %(since)s AND (%(c)s::text IS NULL OR d.country = %(c)s::text)
        ORDER BY d.time DESC LIMIT %(limit)s""", {"since": since, "c": country, "limit": limit})
    return {"since": since, "count": len(rows), "detections": rows}


@app.get("/risk")
async def get_risk(country: str = Query(...)):
    """Transparent risk score per district (risk_now view), ranked within the country."""
    _country(country)
    rows = await _rows("""
        SELECT r.district_id, s.name AS district_name, s.centroid_lat AS lat, s.centroid_lon AS lon,
               round(r.risk_score::numeric, 3)::float AS risk_score,
               rank() OVER (ORDER BY r.risk_score DESC) AS rank,
               r.detections_7d, r.cases_14d, round(r.weather_factor::numeric, 3)::float AS weather_factor,
               coalesce(c.simulated, false) AS cases_simulated, c.disease
        FROM risk_now r JOIN districts s USING (district_id)
        LEFT JOIN (SELECT district_id, bool_or(source = 'simulated') AS simulated, min(disease) AS disease
                   FROM case_history GROUP BY 1) c USING (district_id)
        WHERE r.country = %(c)s ORDER BY r.risk_score DESC""", {"c": country})
    return {"country": country, "districts": rows}


@app.get("/forecast")
async def get_forecast(district: str | None = None, country: str | None = None):
    """Latest forecast per district and disease: weeks 1-4 with low / mid / high (80% interval)."""
    _country(country)
    if not district and not country:
        raise HTTPException(422, "pass district= or country=")
    if district and district not in districts:
        raise HTTPException(422, f"unknown district {district!r}")
    rows = await _rows("""
        SELECT f.district_id, s.name AS district_name, f.disease, f.week_start, f.weeks_ahead,
               round(f.low::numeric, 1)::float AS low, round(f.mid::numeric, 1)::float AS mid,
               round(f.high::numeric, 1)::float AS high, f.model, f.generated_at,
               f.model LIKE '%%-on-simulated' AS simulated
        FROM forecasts f JOIN districts s USING (district_id)
        WHERE f.generated_at = (SELECT max(generated_at) FROM forecasts g
                                WHERE g.district_id = f.district_id AND g.disease = f.disease)
          AND (%(d)s::text IS NULL OR f.district_id = %(d)s::text)
          AND (%(c)s::text IS NULL OR s.country = %(c)s::text)
        ORDER BY s.name, f.disease, f.weeks_ahead""", {"d": district, "c": country})
    for r in rows:
        r["unit"] = UNITS.get(r["disease"], "cases")
    return {"forecasts": rows}


@app.get("/timeline")
async def get_timeline(country: str = Query(...), weeks: int = Query(12, ge=1, le=156)):
    """Week x district: mosquito detections and cases, for the spread-over-time slider.
    Weeks start on Sunday (InfoDengue convention) for both series."""
    _country(country)
    rows = await _rows("""
        WITH wk AS (SELECT generate_series(
                      date_trunc('week', now()::date + 1)::date - 1 - 7 * (%(w)s - 1),
                      date_trunc('week', now()::date + 1)::date - 1, interval '7 days')::date AS week),
        det AS (SELECT (day::date - extract(dow FROM day)::int) AS week, district_id, sum(detections) AS detections
                FROM daily_counts WHERE country = %(c)s GROUP BY 1, 2),
        cas AS (SELECT week, district_id, sum(cases) AS cases, bool_or(source = 'simulated') AS simulated
                FROM case_history GROUP BY 1, 2)
        SELECT w.week, s.district_id, s.name AS district_name, coalesce(det.detections, 0)::int AS detections,
               cas.cases, coalesce(cas.simulated, false) AS cases_simulated
        FROM wk w CROSS JOIN districts s
        LEFT JOIN det ON det.week = w.week AND det.district_id = s.district_id
        LEFT JOIN cas ON cas.week = w.week AND cas.district_id = s.district_id
        WHERE s.country = %(c)s ORDER BY w.week, s.name""", {"c": country, "w": weeks})
    return {"country": country, "weeks": weeks, "rows": rows}


@app.get("/stream")
async def stream(request: Request, country: str | None = None):
    """Server-Sent Events: 'event: detection' per new real-time mosquito detection; comment ping every 15 s."""
    _country(country)
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    subscribers.add(q)

    async def events():
        try:
            yield ": connected\n\n"
            while not await request.is_disconnected():
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                if country and ev.get("country") != country:
                    continue
                yield f"event: detection\ndata: {json.dumps(ev)}\n\n"
        finally:
            subscribers.discard(q)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/classify")
async def classify(
    audio: UploadFile = File(...),
    client_id: uuid.UUID = Form(...),
    recorded_at: datetime = Form(...),
    country: str = Form(...),
    district_id: str = Form(...),
    source: str = Form("phone"),
    device: str | None = Form(None),
    mime: str | None = Form(None),
):
    if recorded_at.tzinfo is None:
        raise HTTPException(422, "recorded_at needs a timezone, e.g. 2026-10-10T14:03:22Z")
    d = districts.get(district_id)
    if d is None:
        raise HTTPException(422, f"unknown district_id {district_id!r}")
    if d["country"] != country:
        raise HTTPException(422, f"district {district_id} is in {d['country']}, not {country}")
    if source not in ("phone", "trap"):
        raise HTTPException(422, "source must be 'phone' or 'trap'")

    data = await audio.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "clip larger than 5 MB")
    try:
        x = await asyncio.to_thread(decode, data, None, 15)
    except AudioDecodeError as e:
        raise HTTPException(422, f"could not decode audio ({mime or audio.content_type}): {e}")
    result = await asyncio.to_thread(model.classify, x)
    diseases = diseases_for(result["genus"])

    # Store first, answer second: a result without a stored row would surface later as a "missing
    # dot on the map" bug. Any DB error propagates as a 500.
    async with pool.connection() as conn:
        cur = await conn.execute(
            """INSERT INTO detections (time, client_id, country, district_id, source, is_mosquito,
                                       species, genus, confidence, diseases, model_version, device,
                                       is_simulated)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (client_id, time) DO NOTHING
               RETURNING detection_id""",
            (recorded_at, client_id, country, district_id, source, result["is_mosquito"],
             result["species"], result["genus"], result["confidence"], diseases,
             result["model_version"], device, device == "mock-phone"))  # mock uploads are demo data
        row = await cur.fetchone()
        duplicate = row is None
        if duplicate:  # phone retry: answer with what we stored the first time
            cur = await conn.execute(
                """SELECT detection_id, is_mosquito, species, genus, confidence, diseases, model_version
                   FROM detections WHERE client_id = %s AND time = %s""", (client_id, recorded_at))
            stored = await cur.fetchone()
            if stored is None:
                raise HTTPException(500, "insert conflicted but no stored row was found")
            det_id, is_mosq, species, genus, conf, diseases, version = stored
            return {"detection_id": str(det_id), "is_mosquito": is_mosq, "species": species, "genus": genus,
                    "confidence": conf, "top3": [], "diseases": diseases, "model_version": version,
                    "duplicate": True}

    return {"detection_id": str(row[0]), "is_mosquito": result["is_mosquito"],
            "genus": result["genus"], "confidence": result["confidence"],
            "species": result["species"], "species_is_closest_match": True, "top3": result["top3"],
            "genus_probs": result.get("genus_probs", {}), "gate_score": result["gate_score"],
            "diseases": diseases, "model_version": result["model_version"], "duplicate": False}
