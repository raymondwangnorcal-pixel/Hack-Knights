"""Snowflake over REST only (SQL API + Cortex Search), authenticated with a programmatic access token.

Fails loudly: any non-success response raises SnowflakeError. Nothing here returns an empty
result to hide a failure.
"""
import os
import time

import httpx

ROLE, WAREHOUSE, DATABASE = "BUZZ_APP", "BUZZ_WH", "BUZZ"


class SnowflakeError(Exception):
    pass


def _settings() -> tuple[str, str]:
    account, pat = os.environ.get("SNOWFLAKE_ACCOUNT"), os.environ.get("SNOWFLAKE_PAT")
    if not account or not pat:
        raise SnowflakeError("SNOWFLAKE_ACCOUNT and SNOWFLAKE_PAT must be set")
    return f"https://{account.replace('_', '-')}.snowflakecomputing.com", pat


def _headers(pat: str) -> dict:
    return {"Authorization": f"Bearer {pat}", "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
            "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "buzz-check/1.0"}


def execute(sql: str, bindings: dict | None = None, timeout_s: int = 120) -> list[list]:
    """Run one SQL statement; returns result rows (all values are strings or None, as the API sends them)."""
    base, pat = _settings()
    body = {"statement": sql, "timeout": timeout_s, "warehouse": WAREHOUSE, "role": ROLE, "database": DATABASE}
    if bindings:
        body["bindings"] = bindings
    with httpx.Client(timeout=timeout_s + 30) as c:
        r = c.post(f"{base}/api/v2/statements", headers=_headers(pat), json=body)
        deadline = time.time() + timeout_s
        while r.status_code == 202:  # still running: the API may answer async even without being asked
            if time.time() > deadline:
                raise SnowflakeError(f"statement still running after {timeout_s}s: {sql[:80]}")
            time.sleep(1)
            r = c.get(f"{base}/api/v2/statements/{r.json()['statementHandle']}", headers=_headers(pat))
        if r.status_code != 200:
            raise SnowflakeError(f"HTTP {r.status_code}: {r.text[:500]}")
        out = r.json()
        rows = list(out.get("data", []))
        for part in range(1, len(out.get("resultSetMetaData", {}).get("partitionInfo", []))):
            p = c.get(f"{base}/api/v2/statements/{out['statementHandle']}", headers=_headers(pat),
                      params={"partition": part})
            if p.status_code != 200:
                raise SnowflakeError(f"HTTP {p.status_code} fetching partition {part}: {p.text[:300]}")
            rows += p.json()["data"]
        return rows


def search_guidance(query: str, disease: str | None = None, limit: int = 5) -> list[dict]:
    """Cortex Search over the guidance chunks; each hit carries its source_url."""
    base, pat = _settings()
    body = {"query": query, "columns": ["chunk", "doc_title", "source_url"], "limit": limit}
    if disease:
        body["filter"] = {"@eq": {"disease": disease}}
    r = httpx.post(f"{base}/api/v2/databases/{DATABASE}/schemas/AI/cortex-search-services/GUIDANCE_SEARCH:query",
                   headers=_headers(pat), json=body, timeout=60)
    if r.status_code != 200:
        raise SnowflakeError(f"Cortex Search HTTP {r.status_code}: {r.text[:500]}")
    return r.json()["results"]
