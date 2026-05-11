"""
VentureGraph — Auto-apply Supabase Schema
==========================================
Runs supabase_schema.sql against the project via the Supabase REST API.
No Supabase CLI needed. Called automatically by setup.ps1.

Usage:
  python live/apply_schema.py
"""

import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "--quiet"])
    import requests

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()

if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sys.exit(1)

SCHEMA_PATH = Path(__file__).parent.parent / "supabase_schema.sql"
if not SCHEMA_PATH.exists():
    print(f"ERROR: supabase_schema.sql not found at {SCHEMA_PATH}")
    sys.exit(1)

sql = SCHEMA_PATH.read_text(encoding="utf-8")

# Supabase REST API endpoint for running SQL
url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"

# Try the pg_meta API (available on all Supabase projects)
meta_url = SUPABASE_URL.replace(".supabase.co", ".supabase.co")
headers = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
}

# Split the SQL into individual statements and run each one
statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]

print(f"[schema] Applying {len(statements)} SQL statements to {SUPABASE_URL}...")

success = 0
skipped = 0
errors  = 0

for i, stmt in enumerate(statements, 1):
    if not stmt:
        continue
    # Use the pg endpoint
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/",
        headers={**headers, "Prefer": "return=minimal"},
        json={"query": stmt},
        timeout=30,
    )
    # Supabase Management API (use the database REST endpoint)
    pg_resp = requests.post(
        f"{SUPABASE_URL.replace('.supabase.co', '.supabase.co')}"
        f"/pg/query",
        headers=headers,
        json={"query": stmt},
        timeout=30,
    )

    if pg_resp.status_code in (200, 201, 204):
        success += 1
    elif pg_resp.status_code == 409 or "already exists" in pg_resp.text.lower():
        skipped += 1
    else:
        # Try direct SQL via the Supabase RPC workaround
        errors += 1

print(f"[schema] Done — {success} applied, {skipped} already existed, {errors} errors")
print("[schema] If errors > 0, run supabase_schema.sql manually in the Supabase SQL Editor")
