"""Tiger Data access. Connection settings come from PG* env vars (libpq standard)."""
import os
from pathlib import Path

from psycopg_pool import AsyncConnectionPool


def load_dotenv() -> None:
    """Local dev only: read PG* vars from the repo .env if they are not already set.
    Ignores TIMESCALE_SERVICE_URL on purpose (it holds a stale password)."""
    env = Path(__file__).resolve().parents[2] / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        k, _, v = line.partition("=")
        if k.startswith("PG") and k not in os.environ:
            os.environ[k] = v.strip().strip('"').strip("'")


def missing_settings() -> list[str]:
    return [k for k in ("PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE") if not os.environ.get(k)]


def make_pool() -> AsyncConnectionPool:
    load_dotenv()
    if missing := missing_settings():
        raise RuntimeError(f"Tiger Data settings missing: {', '.join(missing)}")
    return AsyncConnectionPool(conninfo="connect_timeout=15", min_size=1, max_size=5, open=False)
