"""
VentureGraph Live Engine — Data Ingestion
==========================================
Loop 1: Runs every 15 minutes (GitHub Actions cron).

Sources:
  1. SEC EDGAR Form D RSS   — US private placements (free, no key)
  2. TechCrunch RSS         — Global funding news (free)
  3. VentureBeat RSS        — Global funding news (free)
  4. Tech.eu RSS            — European funding news (free)
  5. Wamda RSS              — MENA funding news (free)
  6. MENABytes RSS          — MENA funding news (free)
  7. UK Companies House API — UK company filings (free key)

All events are normalized to a canonical schema and upserted to Supabase.
Duplicate detection uses company_name + investor_name + round_type + announced_at.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

try:
    import feedparser
    _FP = True
except ImportError:
    _FP = False

from live.db import upsert, is_configured

# ── Sector mapping (mirrors sms_engine.py CATEGORY_TO_ETF) ─────────────────
CATEGORY_TO_ETF: dict[str, str] = {
    "software": "IGV", "enterprise": "IGV", "analytics": "IGV",
    "security": "IGV", "cloud_computing": "IGV", "saas": "IGV",
    "semiconductor": "SOXX", "hardware": "SOXX", "networking": "SOXX",
    "biotech": "XBI", "health": "XBI", "medical": "XBI",
    "pharma": "XBI", "healthcare": "XBI", "genomics": "XBI",
    "finance": "XLF", "fintech": "XLF", "payments": "XLF",
    "insurance": "XLF", "banking": "XLF",
    "internet": "FDN", "web": "FDN", "mobile": "FDN",
    "ecommerce": "FDN", "marketplace": "FDN", "social": "FDN",
    "cleantech": "QCLN", "energy": "QCLN", "greentech": "QCLN",
    "ai": "ARKW", "artificial_intelligence": "ARKW", "machine_learning": "ARKW",
    "cybersecurity": "HACK", "infosec": "HACK",
}

KEYWORDS_TO_SECTOR: dict[str, str] = {
    "software": "IGV", "saas": "IGV", "cloud": "IGV", "enterprise": "IGV",
    "chip": "SOXX", "semiconductor": "SOXX", "hardware": "SOXX",
    "biotech": "XBI", "pharma": "XBI", "genomics": "XBI", "health": "XBI",
    "fintech": "XLF", "payments": "XLF", "banking": "XLF", "insurtech": "XLF",
    "ecommerce": "FDN", "marketplace": "FDN", "social": "FDN",
    "cleantech": "QCLN", "solar": "QCLN", "renewable": "QCLN",
    "ai": "ARKW", "llm": "ARKW", "deep learning": "ARKW",
    "security": "HACK", "cybersecurity": "HACK",
}

ROUND_NORMALISE = {
    "series a": "series-a", "series-a": "series-a", "seriesa": "series-a",
    "series b": "series-b", "series-b": "series-b", "seriesb": "series-b",
    "series c": "series-c", "series-c": "series-c",
    "seed": "seed", "pre-seed": "pre-seed", "preseed": "pre-seed",
    "angel": "angel", "venture": "venture",
}

# ── RSS feed definitions ─────────────────────────────────────────────────────
RSS_FEEDS = [
    {
        "name": "techcrunch",
        "url": "https://techcrunch.com/category/startups/feed/",
        "region": "global",
    },
    {
        "name": "venturebeat",
        "url": "https://venturebeat.com/feed/",
        "region": "global",
    },
    {
        "name": "tech_eu",
        "url": "https://tech.eu/feed",
        "region": "europe",
    },
    {
        "name": "wamda",
        "url": "https://www.wamda.com/feed",
        "region": "mena",
    },
    {
        "name": "menabytes",
        "url": "https://www.menabytes.com/feed/",
        "region": "mena",
    },
]

EDGAR_RSS = (
    "https://www.sec.gov/cgi-bin/browse-edgar"
    "?action=getcurrent&type=D&dateb=&owner=include&count=40&output=atom"
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _sector_from_text(text: str) -> str:
    if not text:
        return "IGV"
    t = text.lower()
    for kw, etf in KEYWORDS_TO_SECTOR.items():
        if kw in t:
            return etf
    return "IGV"


def _normalise_round(raw: str) -> str:
    if not raw:
        return "unknown"
    return ROUND_NORMALISE.get(raw.lower().strip(), raw.lower().strip())


def _parse_amount(s: str | None) -> int | None:
    if not s:
        return None
    try:
        return int(re.sub(r"[^\d]", "", str(s)))
    except (ValueError, TypeError):
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch(url: str, timeout: int = 15) -> str | None:
    try:
        r = requests.get(
            url, timeout=timeout,
            headers={"User-Agent": "VentureGraph/2.0 research@venturegraph.io"},
        )
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"  [ingest] fetch failed {url[:60]}: {e}")
        return None


# ── EDGAR Form D ingestion ───────────────────────────────────────────────────

def ingest_edgar() -> list[dict]:
    """Parse SEC EDGAR Form D RSS and return normalized funding events."""
    print("[ingest] EDGAR Form D RSS …")
    xml_text = _fetch(EDGAR_RSS)
    if not xml_text:
        return []

    events: list[dict] = []
    try:
        root = ET.fromstring(xml_text)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.findall("atom:entry", ns):
            title  = (entry.findtext("atom:title",  default="", namespaces=ns) or "").strip()
            link   = (entry.findtext("atom:link",   default="", namespaces=ns) or "").strip()
            updated = entry.findtext("atom:updated", default="", namespaces=ns) or ""
            summary = (entry.findtext("atom:summary", default="", namespaces=ns) or "").strip()

            try:
                announced_at = datetime.fromisoformat(
                    updated.replace("Z", "+00:00")
                ).isoformat() if updated else _now_iso()
            except ValueError:
                announced_at = _now_iso()

            sector = _sector_from_text(title + " " + summary)

            events.append({
                "company_name": title[:200] if title else None,
                "investor_name": None,   # Form D doesn't name investors directly
                "round_type": "venture",
                "amount_usd": None,
                "sector": sector,
                "country": "US",
                "source": "edgar",
                "source_url": link[:500] if link else None,
                "announced_at": announced_at,
            })
    except Exception as e:
        print(f"  [ingest] EDGAR parse error: {e}")

    print(f"  → EDGAR: {len(events)} events")
    return events


# ── RSS feed ingestion ───────────────────────────────────────────────────────

def _extract_amount_from_text(text: str) -> int | None:
    patterns = [
        r"\$(\d+(?:\.\d+)?)\s*(billion|bn)",
        r"\$(\d+(?:\.\d+)?)\s*(million|mn|m)\b",
        r"\$(\d+(?:,\d{3})*(?:\.\d+)?)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = float(m.group(1).replace(",", ""))
            multiplier = m.group(2).lower() if len(m.groups()) > 1 else ""
            if "billion" in multiplier or "bn" in multiplier:
                return int(val * 1_000_000_000)
            elif "million" in multiplier or "mn" in multiplier or multiplier == "m":
                return int(val * 1_000_000)
            return int(val)
    return None


def _extract_round_from_text(text: str) -> str:
    t = text.lower()
    for key in ["series d", "series c", "series b", "series a", "seed", "pre-seed", "angel"]:
        if key in t:
            return _normalise_round(key)
    return "venture"


def _extract_company_from_title(title: str) -> str | None:
    patterns = [
        r"^(.+?)\s+raises\b",
        r"^(.+?)\s+secures\b",
        r"^(.+?)\s+closes\b",
        r"^(.+?)\s+lands\b",
        r"^(.+?)\s+gets\b",
        r"^(.+?)\s+receives\b",
    ]
    for pat in patterns:
        m = re.match(pat, title, re.IGNORECASE)
        if m:
            return m.group(1).strip()[:200]
    return title[:200] if title else None


def ingest_rss_feed(feed_def: dict) -> list[dict]:
    """Parse a single RSS feed and return normalized funding events."""
    if not _FP:
        print("  [ingest] feedparser not installed; skipping RSS")
        return []

    name = feed_def["name"]
    url  = feed_def["url"]
    print(f"[ingest] RSS: {name} …")

    xml = _fetch(url)
    if not xml:
        return []

    try:
        parsed = feedparser.parse(xml)
    except Exception as e:
        print(f"  [ingest] feedparser error {name}: {e}")
        return []

    funding_keywords = [
        "raises", "raised", "funding", "investment", "series", "seed",
        "million", "billion", "venture", "capital", "$",
    ]

    events: list[dict] = []
    for entry in parsed.entries[:50]:
        title   = getattr(entry, "title", "") or ""
        summary = getattr(entry, "summary", "") or ""
        link    = getattr(entry, "link", "") or ""
        pub     = getattr(entry, "published", "") or ""

        text = (title + " " + summary).lower()
        if not any(kw in text for kw in funding_keywords):
            continue

        try:
            announced_at = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc).isoformat()
        except Exception:
            announced_at = _now_iso()

        events.append({
            "company_name": _extract_company_from_title(title),
            "investor_name": None,
            "round_type": _extract_round_from_text(title + " " + summary),
            "amount_usd": _extract_amount_from_text(title + " " + summary),
            "sector": _sector_from_text(title + " " + summary),
            "country": None,
            "source": name,
            "source_url": link[:500] if link else None,
            "announced_at": announced_at,
        })

    print(f"  → {name}: {len(events)} events")
    return events


# ── UK Companies House ───────────────────────────────────────────────────────

def ingest_companies_house(max_items: int = 20) -> list[dict]:
    """Pull recent confirmation statements from UK Companies House API."""
    api_key = os.environ.get("COMPANIES_HOUSE_API_KEY", "").strip()
    if not api_key:
        print("[ingest] Companies House: no API key — skipping")
        return []

    print("[ingest] Companies House …")
    url = "https://api.company-information.service.gov.uk/search/companies"
    try:
        r = requests.get(
            url,
            params={"q": "venture capital", "items_per_page": max_items},
            auth=(api_key, ""),
            timeout=15,
            headers={"User-Agent": "VentureGraph/2.0"},
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  [ingest] Companies House error: {e}")
        return []

    events: list[dict] = []
    for item in data.get("items", []):
        name = item.get("title", "") or ""
        events.append({
            "company_name": name[:200] if name else None,
            "investor_name": None,
            "round_type": "venture",
            "amount_usd": None,
            "sector": "IGV",
            "country": "GB",
            "source": "companies_house",
            "source_url": f"https://find-and-update.company-information.service.gov.uk/company/{item.get('company_number', '')}",
            "announced_at": _now_iso(),
        })

    print(f"  → Companies House: {len(events)} events")
    return events


# ── Main ingestion run ────────────────────────────────────────────────────────

def run_ingestion() -> int:
    """Run all ingestors and write to Supabase. Returns total events upserted."""
    if not is_configured():
        print("[ingest] Supabase not configured — running in dry-run mode")

    all_events: list[dict] = []

    # EDGAR
    all_events.extend(ingest_edgar())

    # RSS feeds
    for feed in RSS_FEEDS:
        all_events.extend(ingest_rss_feed(feed))

    # Companies House
    all_events.extend(ingest_companies_house())

    # Filter out empty company names
    all_events = [e for e in all_events if e.get("company_name")]

    print(f"\n[ingest] Total raw events: {len(all_events)}")

    if not is_configured():
        print("[ingest] Dry-run: would have upserted the above events.")
        return len(all_events)

    written = upsert(
        "funding_events",
        all_events,
        on_conflict="company_name,investor_name,round_type,announced_at",
    )
    print(f"[ingest] Upserted to Supabase: {written}")
    return written


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
    run_ingestion()
