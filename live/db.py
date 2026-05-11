"""
VentureGraph Live Engine — Supabase DB client
=============================================
Single import point for the Supabase client used by all live engine modules.
Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from environment variables.
"""

import os
from functools import lru_cache

try:
    from supabase import create_client, Client
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False
    Client = None  # type: ignore


@lru_cache(maxsize=1)
def get_client():
    """Return a cached Supabase client (service role — full write access)."""
    if not _SUPABASE_AVAILABLE:
        raise RuntimeError(
            "supabase package not installed. Run: pip install supabase"
        )
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.\n"
            "Copy .env.example to .env and fill in your Supabase credentials."
        )
    return create_client(url, key)


def is_configured() -> bool:
    """Return True if Supabase credentials are present in the environment."""
    return bool(
        os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")
    )


def upsert(table: str, rows: list[dict], on_conflict: str | None = None) -> int:
    """Upsert rows into a Supabase table. Returns number of rows written."""
    if not rows:
        return 0
    client = get_client()
    kwargs = {}
    if on_conflict:
        kwargs["on_conflict"] = on_conflict
    try:
        resp = client.table(table).upsert(rows, **kwargs).execute()
        return len(resp.data) if resp.data else 0
    except Exception as e:
        print(f"  [db] upsert to {table} failed: {e}")
        return 0


def insert(table: str, rows: list[dict]) -> int:
    """Insert rows (ignore duplicates). Returns number of rows written."""
    if not rows:
        return 0
    client = get_client()
    try:
        resp = client.table(table).insert(rows).execute()
        return len(resp.data) if resp.data else 0
    except Exception as e:
        print(f"  [db] insert to {table} failed: {e}")
        return 0


def select(table: str, columns: str = "*", **filters) -> list[dict]:
    """Select rows from a table with optional equality filters."""
    client = get_client()
    try:
        q = client.table(table).select(columns)
        for col, val in filters.items():
            q = q.eq(col, val)
        resp = q.execute()
        return resp.data or []
    except Exception as e:
        print(f"  [db] select from {table} failed: {e}")
        return []
