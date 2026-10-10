"""Buzz Check model service.

    .venv/bin/uvicorn app.main:app --app-dir backend --port 8000
"""
import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from . import model
from .audio import AudioDecodeError, decode
from .db import make_pool
from .species import diseases_for

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # a 10 s clip is well under 1 MB in any browser format

pool = make_pool()
districts: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await pool.open(wait=True, timeout=30)
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT district_id, country, name, centroid_lat, centroid_lon FROM districts")
        for did, country, name, lat, lon in await cur.fetchall():
            districts[did] = {"country": country, "name": name, "lat": lat, "lon": lon}
    if not districts:
        raise RuntimeError("districts table is empty: run scripts/load_districts.py first")
    yield
    await pool.close()


app = FastAPI(title="Buzz Check model service", lifespan=lifespan)


@app.get("/health")
async def health():
    async with pool.connection() as conn:
        await conn.execute("SELECT 1")
    return {"ok": True, "model_version": model.MODEL_VERSION, "districts": len(districts)}


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

    return {"detection_id": str(row[0]), "is_mosquito": result["is_mosquito"], "species": result["species"],
            "genus": result["genus"], "confidence": result["confidence"], "top3": result["top3"],
            "diseases": diseases, "model_version": result["model_version"], "duplicate": False}
