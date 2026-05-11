"""
VentureGraph Live Engine — Orchestrator
========================================
CLI entry point. Use --loop to select which pipeline step to run.

  python live/run_all.py --loop ingest      # Loop 1: ingest funding events
  python live/run_all.py --loop signal      # Loop 2: compute signals
  python live/run_all.py --loop market      # Loop 3: update market outcomes
  python live/run_all.py --loop all         # Run all three in sequence

Environment: create a .env file in the project root (copy from .env.example).
"""

import argparse
import os
import sys
from pathlib import Path

# Ensure project root is on the path so "live.*" imports resolve
sys.path.insert(0, str(Path(__file__).parent.parent))

def _load_env():
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        from dotenv import load_dotenv
        load_dotenv(env_path)
        print(f"[run_all] Loaded env from {env_path}")
    else:
        print("[run_all] No .env file found — using environment variables directly")


def _check_packages():
    missing = []
    try:
        import supabase   # noqa: F401
    except ImportError:
        missing.append("supabase")
    try:
        import feedparser  # noqa: F401
    except ImportError:
        missing.append("feedparser")
    try:
        import yfinance   # noqa: F401
    except ImportError:
        missing.append("yfinance")
    if missing:
        print(f"[run_all] Installing missing packages: {missing}")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install"] + missing, stdout=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser(description="VentureGraph Live Engine")
    parser.add_argument(
        "--loop",
        choices=["ingest", "signal", "market", "all"],
        default="all",
        help="Which pipeline loop to run (default: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without writing to Supabase (for testing)",
    )
    args = parser.parse_args()

    _load_env()
    _check_packages()

    if args.dry_run:
        os.environ.pop("SUPABASE_URL", None)
        os.environ.pop("SUPABASE_SERVICE_KEY", None)
        print("[run_all] DRY RUN — Supabase writes disabled")

    print(f"\n{'='*60}")
    print(f"  VentureGraph Live Engine · Loop: {args.loop.upper()}")
    print(f"{'='*60}\n")

    from live.db import is_configured
    print(f"[run_all] Supabase configured: {is_configured()}")

    if args.loop in ("ingest", "all"):
        print("\n── LOOP 1: INGESTION ──────────────────────────────────────")
        from live.ingest import run_ingestion
        run_ingestion()

    if args.loop in ("signal", "all"):
        print("\n── LOOP 2: SIGNAL ENGINE ──────────────────────────────────")
        from live.signal_engine import run_signal_engine
        run_signal_engine()

    if args.loop in ("market", "all"):
        print("\n── LOOP 3: MARKET BENCHMARK ───────────────────────────────")
        from live.market import run_market_loop
        run_market_loop()

    print(f"\n{'='*60}")
    print("  VentureGraph Live Engine · Run complete")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
