# Buzz Check model service. Build context is the repo root.
FROM python:3.13-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/

ENV PYTHONUNBUFFERED=1
# Railway and Render inject $PORT. The service refuses to start if the PG* variables are missing.
CMD ["sh", "-c", "uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT:-8000}"]
