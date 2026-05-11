"""
VentureGraph Live Engine — Market Benchmark Loop
=================================================
Loop 3: Runs daily after US market close (~21:30 UTC).

Steps:
  1. Fetch live ETF prices via yfinance (free, 15-min delay)
  2. For every active signal, compute returns at T+30/60/90/180/360 days
  3. Compare to SPY baseline (excess return)
  4. Flag direction correctness (signal said NEGATIVE_ALPHA → excess_return < 0)
  5. Update signal_outcomes in Supabase
  6. Recompute track_record aggregate (hit rate, mean lead time, etc.)
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import yfinance as yf
    _YF = True
except ImportError:
    _YF = False

from live.db import upsert, insert, select, is_configured

HORIZONS = [30, 60, 90, 180, 360]   # days

ETF_MAP = {
    "IGV":  "IGV",
    "SOXX": "SOXX",
    "XBI":  "XBI",
    "XLF":  "XLF",
    "FDN":  "FDN",
    "ARKW": "ARKW",
    "HACK": "HACK",
    "WCLD": "WCLD",
    "IBB":  "IBB",
    "QCLN": "QCLN",
}
SPY = "SPY"


# ── Price fetching ────────────────────────────────────────────────────────────

def _fetch_price_history(tickers: list[str],
                         start: date, end: date) -> pd.DataFrame:
    """Return adjusted close prices for all tickers between start and end."""
    if not _YF:
        print("  [market] yfinance not installed — skipping price fetch")
        return pd.DataFrame()

    all_tickers = list(set(tickers + [SPY]))
    try:
        raw = yf.download(
            all_tickers,
            start=str(start),
            end=str(end + timedelta(days=1)),
            auto_adjust=True,
            progress=False,
        )
        if raw.empty:
            return pd.DataFrame()

        if isinstance(raw.columns, pd.MultiIndex):
            prices = raw["Close"] if "Close" in raw.columns.get_level_values(0) else raw
        else:
            prices = raw[["Close"]] if "Close" in raw.columns else raw

        if isinstance(prices, pd.Series):
            prices = prices.to_frame()

        prices.index = pd.to_datetime(prices.index, utc=True)
        return prices

    except Exception as e:
        print(f"  [market] yfinance error: {e}")
        return pd.DataFrame()


def _cumulative_return(prices: pd.DataFrame, ticker: str,
                       from_dt: datetime, horizon_days: int) -> float | None:
    """Compute cumulative return for ticker from from_dt over horizon_days."""
    if ticker not in prices.columns:
        return None

    col = prices[ticker].dropna()
    if col.empty:
        return None

    from_dt_utc = from_dt.replace(tzinfo=timezone.utc) if from_dt.tzinfo is None else from_dt
    idx_on_or_after = col.index[col.index >= from_dt_utc]
    if idx_on_or_after.empty:
        return None

    start_price = float(col[idx_on_or_after[0]])
    end_dt      = from_dt_utc + timedelta(days=horizon_days)
    idx_at_end  = col.index[col.index <= end_dt]
    if idx_at_end.empty:
        return None

    end_price = float(col[idx_at_end[-1]])
    return (end_price - start_price) / start_price if start_price else None


# ── Lead-time estimation ──────────────────────────────────────────────────────

def _find_inflection_date(prices: pd.DataFrame, ticker: str,
                          from_dt: datetime,
                          window_days: int = 180) -> int | None:
    """
    Find approximate lead time in days:
    days between from_dt and the first date the ETF enters a >2% drawdown
    from its local high in the post-signal window.
    """
    if ticker not in prices.columns:
        return None

    col = prices[ticker].dropna()
    from_dt_utc = from_dt.replace(tzinfo=timezone.utc) if from_dt.tzinfo is None else from_dt
    end_dt      = from_dt_utc + timedelta(days=window_days)
    window      = col[(col.index >= from_dt_utc) & (col.index <= end_dt)]

    if len(window) < 5:
        return None

    rolling_max = window.expanding().max()
    drawdown    = (window - rolling_max) / rolling_max
    triggered   = drawdown[drawdown < -0.02]
    if triggered.empty:
        return None

    first_trigger = triggered.index[0]
    return int((first_trigger - from_dt_utc).days)


# ── Compute outcomes for all active signals ────────────────────────────────────

def compute_outcomes() -> list[dict]:
    """
    Load active signals from Supabase, fetch prices, compute outcomes.
    Returns list of signal_outcomes ready for upsert.
    """
    if not is_configured():
        print("[market] Supabase not configured — skipping outcome computation")
        return []

    print("[market] Loading active signals …")
    signals = select("signals", status="active")
    if not signals:
        print("  No active signals")
        return []

    print(f"  {len(signals)} active signal(s)")

    # Determine date range needed
    earliest = min(
        datetime.fromisoformat(s["issued_at"].replace("Z", "+00:00"))
        for s in signals
    )
    start_date = earliest.date()
    end_date   = date.today()

    tickers_needed = list({ETF_MAP.get(s["sector"], "IGV") for s in signals})

    print(f"[market] Fetching prices: {tickers_needed} from {start_date} …")
    prices = _fetch_price_history(tickers_needed, start_date, end_date)

    if prices.empty:
        print("  [market] No price data available")
        return []

    today = date.today()
    outcomes: list[dict] = []

    for sig in signals:
        issued_at = datetime.fromisoformat(
            sig["issued_at"].replace("Z", "+00:00")
        )
        ticker = ETF_MAP.get(sig["sector"], "IGV")

        for h in HORIZONS:
            target_date = issued_at.date() + timedelta(days=h)
            if target_date > today:
                continue  # horizon not yet reached

            etf_ret = _cumulative_return(prices, ticker,   issued_at, h)
            spy_ret = _cumulative_return(prices, SPY,      issued_at, h)

            if etf_ret is None or spy_ret is None:
                continue

            excess        = etf_ret - spy_ret
            dir_correct   = excess < 0  # signal says NEGATIVE_ALPHA

            outcomes.append({
                "signal_id":        sig["id"],
                "sector":           sig["sector"],
                "etf_ticker":       ticker,
                "observed_at":      str(today),
                "horizon_days":     h,
                "etf_return":       round(etf_ret, 6),
                "spy_return":       round(spy_ret, 6),
                "excess_return":    round(excess, 6),
                "direction_correct": dir_correct,
            })

    print(f"[market] Computed {len(outcomes)} outcome records")
    return outcomes


# ── Track record aggregate ────────────────────────────────────────────────────

def compute_track_record() -> dict | None:
    """Aggregate all signal outcomes into a track record summary."""
    if not is_configured():
        print("[market] Supabase not configured — skipping track record")
        return None

    print("[market] Computing track record …")

    signals  = select("signals")
    outcomes = select("signal_outcomes")

    if not signals:
        return None

    total = len(signals)
    out_df = pd.DataFrame(outcomes) if outcomes else pd.DataFrame()

    def hit_rate(h: int) -> float | None:
        if out_df.empty:
            return None
        sub = out_df[out_df["horizon_days"] == h].dropna(subset=["direction_correct"])
        return float(sub["direction_correct"].mean()) if len(sub) >= 3 else None

    def mean_alpha(h: int) -> float | None:
        if out_df.empty:
            return None
        sub = out_df[out_df["horizon_days"] == h].dropna(subset=["excess_return"])
        return float(sub["excess_return"].mean()) if len(sub) >= 3 else None

    lead_times: list[float] = []
    if not out_df.empty:
        sig_df = pd.DataFrame(signals)
        for _, sig in sig_df.iterrows():
            issued_at = datetime.fromisoformat(
                str(sig["issued_at"]).replace("Z", "+00:00")
            )
            ticker    = ETF_MAP.get(sig["sector"], "IGV")
            start     = issued_at.date()
            if start < date.today() - timedelta(days=60):
                prices = _fetch_price_history([ticker], start, date.today())
                lt = _find_inflection_date(prices, ticker, issued_at)
                if lt is not None:
                    lead_times.append(lt)

    rec = {
        "total_signals":          total,
        "signals_with_k30":       int(len(out_df[out_df["horizon_days"] == 30])) if not out_df.empty else 0,
        "signals_with_k90":       int(len(out_df[out_df["horizon_days"] == 90])) if not out_df.empty else 0,
        "hit_rate_k30":           hit_rate(30),
        "hit_rate_k60":           hit_rate(60),
        "hit_rate_k90":           hit_rate(90),
        "hit_rate_k180":          hit_rate(180),
        "mean_excess_alpha_k90":  mean_alpha(90),
        "mean_excess_alpha_k180": mean_alpha(180),
        "mean_lead_time_days":    float(np.mean(lead_times))   if lead_times else None,
        "median_lead_time_days":  float(np.median(lead_times)) if lead_times else None,
    }

    print(f"  total_signals={rec['total_signals']}  "
          f"hit_rate_k90={rec.get('hit_rate_k90')}")
    return rec


# ── Main market run ────────────────────────────────────────────────────────────

def run_market_loop() -> dict[str, int]:
    """Full market benchmark loop. Returns counts of rows written."""
    counts = {"outcomes": 0, "track_record": 0}

    outcomes = compute_outcomes()
    if outcomes and is_configured():
        counts["outcomes"] = upsert(
            "signal_outcomes", outcomes, on_conflict="signal_id,horizon_days"
        )

    record = compute_track_record()
    if record and is_configured():
        counts["track_record"] = insert("track_record", [record])

    print(f"[market] Done → outcomes={counts['outcomes']}  "
          f"track_record={counts['track_record']}")
    return counts


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
    run_market_loop()
