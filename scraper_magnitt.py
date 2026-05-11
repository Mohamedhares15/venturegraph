"""
VentureGraph — Magnitt / MENA Press Scraper
=============================================
C-DE422 · Big Data Engineering II — Data Augmentation Layer
Author: Mohamed Hares

Scrapes MENA startup ecosystem data from:
    1. MAGNiTT public reports and startup directory
    2. Wamda press releases (wamda.com)
    3. GCC press / Gulf News / ArabianBusiness startup coverage
    4. Crunchbase MENA supplement (public API / CSV dump)

This module is critical for the "MENA extension story" that differentiates
VentureGraph from Western-only VC network analyses.

Output:  data_augmented/magnitt_deals.csv
         data_augmented/magnitt_investors.csv
         data_augmented/magnitt_objects.csv
         data_augmented/magnitt_investments.csv
         data_augmented/magnitt_rounds.csv

Expected yield:  ~2,000 – 4,000 MENA-specific events

Rate limits:
    - MAGNiTT: no public API, uses report parsing + directory scraping
    - Wamda: 0.5s between requests
    - Press: 1s between requests

Usage:
    python scraper_magnitt.py --output data_augmented/
"""

import argparse
import csv
import hashlib
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlencode

import requests
from bs4 import BeautifulSoup

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("MAGNITT")

# ── Constants ────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# MENA country codes (ISO 3166-1 alpha-2)
MENA_COUNTRIES = {
    "AE", "SA", "EG", "JO", "LB", "BH", "KW", "OM", "QA", "IQ",
    "MA", "TN", "DZ", "LY", "SD", "YE", "PS", "SY", "IR", "TR",
}

MENA_COUNTRY_NAMES = {
    "united arab emirates", "uae", "saudi arabia", "ksa", "egypt",
    "jordan", "lebanon", "bahrain", "kuwait", "oman", "qatar",
    "iraq", "morocco", "tunisia", "algeria", "libya", "sudan",
    "yemen", "palestine", "syria", "iran", "turkey",
    "dubai", "abu dhabi", "riyadh", "jeddah", "cairo", "amman",
    "beirut", "manama", "muscat", "doha",
}

# MAGNiTT public pages
MAGNITT_BASE      = "https://magnitt.com"
MAGNITT_STARTUPS  = "https://magnitt.com/startups"
MAGNITT_RESEARCH  = "https://magnitt.com/research"

# Wamda press
WAMDA_BASE   = "https://www.wamda.com"
WAMDA_NEWS   = "https://www.wamda.com/news"

# Press sources
PRESS_SOURCES = [
    ("https://gulfnews.com/business/markets", "Gulf News"),
    ("https://www.arabianbusiness.com/startup", "Arabian Business"),
    ("https://www.menabytes.com/", "MENAbytes"),
]


class MagnittScraper:
    """
    Multi-source MENA venture data scraper.
    Parses publicly available startup funding data from:
        - MAGNiTT directory pages
        - Wamda news articles
        - GCC press sources
    """

    def __init__(self, output_dir: str = "data_augmented", max_pages: int = 200):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.max_pages = max_pages
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self._request_count = 0

    def _get(self, url: str, delay: float = 0.5) -> Optional[BeautifulSoup]:
        """Fetch URL and return BeautifulSoup, respecting rate limits."""
        try:
            resp = self.session.get(url, timeout=30)
            self._request_count += 1
            time.sleep(delay)

            if resp.status_code == 200:
                return BeautifulSoup(resp.text, "html.parser")
            else:
                log.warning(f"HTTP {resp.status_code}: {url}")
                return None
        except requests.exceptions.RequestException as e:
            log.error(f"Request failed for {url}: {e}")
            return None

    # ── Source 1: MAGNiTT Directory ──────────────────────────────────────

    def scrape_magnitt_directory(self) -> list[dict]:
        """
        Scrape MAGNiTT startup directory pages.
        Each startup page contains: name, country, sector, funding stage,
        total funding, investors.
        """
        deals = []
        log.info("Scraping MAGNiTT startup directory ...")

        for page in range(1, self.max_pages + 1):
            url = f"{MAGNITT_STARTUPS}?page={page}"
            soup = self._get(url)

            if soup is None:
                log.info(f"  MAGNiTT: stopped at page {page} (no response)")
                break

            # Parse startup cards
            cards = soup.select(".startup-card, .entity-card, [class*='startup'], [class*='card']")
            if not cards:
                # Try alternative selectors
                cards = soup.find_all("div", class_=re.compile(r"card|startup|entity"))

            if not cards:
                log.info(f"  MAGNiTT: no cards found on page {page}, stopping")
                break

            for card in cards:
                deal = self._parse_magnitt_card(card)
                if deal:
                    deals.append(deal)

            log.info(f"  Page {page}: {len(cards)} cards → {len(deals)} total deals")

            if page % 20 == 0:
                log.info(f"  [checkpoint] {len(deals)} deals collected so far")

        return deals

    def _parse_magnitt_card(self, card) -> Optional[dict]:
        """Extract structured deal info from a MAGNiTT startup card element."""
        try:
            # Company name
            name_el = card.select_one("h3, h4, .name, .title, a[href*='startup']")
            name = name_el.get_text(strip=True) if name_el else ""
            if not name:
                return None

            # Link to detail page
            link_el = card.select_one("a[href]")
            detail_url = urljoin(MAGNITT_BASE, link_el["href"]) if link_el else ""

            # Country
            country_el = card.select_one(".country, .location, [class*='country']")
            country = country_el.get_text(strip=True) if country_el else ""

            # Sector
            sector_el = card.select_one(".sector, .industry, .category, [class*='sector']")
            sector = sector_el.get_text(strip=True) if sector_el else ""

            # Funding
            funding_el = card.select_one(".funding, .amount, [class*='funding']")
            funding = funding_el.get_text(strip=True) if funding_el else ""

            # Stage
            stage_el = card.select_one(".stage, [class*='stage']")
            stage = stage_el.get_text(strip=True) if stage_el else ""

            return {
                "company_name": name,
                "country": country,
                "sector": self._normalize_sector(sector),
                "total_funding": self._parse_funding_amount(funding),
                "stage": self._normalize_stage(stage),
                "detail_url": detail_url,
                "source": "magnitt",
                "scraped_at": datetime.utcnow().isoformat(),
            }
        except Exception:
            return None

    def scrape_magnitt_detail(self, url: str) -> Optional[dict]:
        """Scrape a single MAGNiTT startup detail page for investor info."""
        soup = self._get(url, delay=1.0)
        if soup is None:
            return None

        investors = []
        investor_section = soup.select_one(
            ".investors, [class*='investor'], #investors"
        )
        if investor_section:
            for inv_el in investor_section.select("a, .investor-name, li"):
                inv_name = inv_el.get_text(strip=True)
                if inv_name and len(inv_name) > 2:
                    investors.append(inv_name)

        # Funding rounds
        rounds = []
        round_section = soup.select_one(
            ".funding-rounds, [class*='round'], #funding"
        )
        if round_section:
            for row in round_section.select("tr, .round-row, li"):
                cols = row.select("td, span, .col")
                if len(cols) >= 2:
                    rounds.append({
                        "round_type": cols[0].get_text(strip=True),
                        "amount": cols[1].get_text(strip=True) if len(cols) > 1 else "",
                        "date": cols[2].get_text(strip=True) if len(cols) > 2 else "",
                    })

        return {
            "investors": investors,
            "rounds": rounds,
        }

    # ── Source 2: Wamda Press ────────────────────────────────────────────

    def scrape_wamda(self) -> list[dict]:
        """
        Scrape Wamda news articles for MENA startup funding announcements.
        Parse headlines and article bodies for structured deal info.
        """
        deals = []
        log.info("Scraping Wamda news ...")

        for page in range(1, min(self.max_pages, 100) + 1):
            url = f"{WAMDA_NEWS}?page={page}"
            soup = self._get(url, delay=0.8)

            if soup is None:
                break

            articles = soup.select("article, .article, .post, [class*='article']")
            if not articles:
                break

            for article in articles:
                deal = self._parse_news_article(article, "wamda")
                if deal:
                    deals.append(deal)

            if page % 10 == 0:
                log.info(f"  Wamda page {page}: {len(deals)} deals")

        return deals

    # ── Source 3: GCC Press ──────────────────────────────────────────────

    def scrape_gcc_press(self) -> list[dict]:
        """Scrape GCC press sources for startup funding news."""
        deals = []
        log.info("Scraping GCC press sources ...")

        for base_url, source_name in PRESS_SOURCES:
            log.info(f"  Scanning {source_name} ...")
            for page in range(1, min(self.max_pages // 3, 30) + 1):
                url = f"{base_url}?page={page}"
                soup = self._get(url, delay=1.0)

                if soup is None:
                    break

                articles = soup.select("article, .article, .post, h2 a, h3 a")
                if not articles:
                    break

                for article in articles:
                    deal = self._parse_news_article(article, source_name.lower().replace(" ", "_"))
                    if deal:
                        deals.append(deal)

            log.info(f"  {source_name}: {len(deals)} deals")

        return deals

    def _parse_news_article(self, element, source: str) -> Optional[dict]:
        """
        Extract deal info from a news article element.
        Uses NLP-like pattern matching on headlines.
        """
        try:
            # Get headline text
            headline_el = element.select_one("h2, h3, h4, .title, a")
            headline = headline_el.get_text(strip=True) if headline_el else ""
            if not headline:
                return None

            # Check if it's a funding article
            funding_keywords = [
                "raises", "secures", "closes", "funding", "investment",
                "series a", "series b", "seed", "round", "million", "billion",
                "$", "usd", "venture", "backed",
            ]
            headline_lower = headline.lower()
            if not any(kw in headline_lower for kw in funding_keywords):
                return None

            # Extract company name (usually first part of headline)
            company = self._extract_company_from_headline(headline)
            if not company:
                return None

            # Extract amount
            amount = self._extract_amount_from_text(headline)

            # Extract round type
            round_type = self._extract_round_type(headline_lower)

            # Get article date
            date_el = element.select_one("time, .date, .published, [datetime]")
            date_str = ""
            if date_el:
                date_str = date_el.get("datetime", "") or date_el.get_text(strip=True)

            # Get article link
            link_el = element.select_one("a[href]")
            link = link_el["href"] if link_el else ""
            if link and not link.startswith("http"):
                link = urljoin(WAMDA_BASE if source == "wamda" else "", link)

            return {
                "company_name": company,
                "country": self._extract_country(headline),
                "sector": "",  # would need article body
                "total_funding": amount,
                "stage": round_type,
                "detail_url": link,
                "headline": headline,
                "source": source,
                "scraped_at": datetime.utcnow().isoformat(),
                "article_date": date_str,
            }
        except Exception:
            return None

    # ── NLP-like extraction helpers ──────────────────────────────────────

    @staticmethod
    def _extract_company_from_headline(headline: str) -> str:
        """
        Extract company name from a funding headline.
        Common patterns:
            "CompanyX raises $10M in Series A"
            "CompanyX secures $5M funding"
            "CompanyX closes $20M Series B round"
        """
        patterns = [
            r"^([A-Z][A-Za-z0-9\s\.]+?)\s+(?:raises|secures|closes|gets|receives|bags|lands|nabs)",
            r"^([A-Z][A-Za-z0-9\s\.]+?)\s+(?:funding|investment|round)",
            r"^(?:MENA|UAE|Saudi|Egyptian|Jordanian)\s+(?:startup|fintech|healthtech)\s+([A-Z][A-Za-z0-9\s\.]+?)\s+",
        ]
        for pattern in patterns:
            m = re.search(pattern, headline)
            if m:
                return m.group(1).strip()

        # Fallback: first capitalized phrase before common verbs
        parts = headline.split()
        if len(parts) >= 2:
            name_parts = []
            for p in parts:
                if p.lower() in {"raises", "secures", "closes", "gets", "receives",
                                  "funding", "in", "a", "the", "with", "from"}:
                    break
                name_parts.append(p)
            if name_parts:
                return " ".join(name_parts)

        return ""

    @staticmethod
    def _extract_amount_from_text(text: str) -> str:
        """Extract dollar amount from text. Returns amount in USD."""
        patterns = [
            r"\$\s*([\d,\.]+)\s*(million|m|billion|b|thousand|k)",
            r"([\d,\.]+)\s*(million|m|billion|b)\s*(?:dollars|usd|\$)",
            r"\$\s*([\d,\.]+)",
        ]
        for pattern in patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                num = float(m.group(1).replace(",", ""))
                if len(m.groups()) > 1:
                    multiplier = m.group(2).lower()
                    if multiplier in ("million", "m"):
                        num *= 1_000_000
                    elif multiplier in ("billion", "b"):
                        num *= 1_000_000_000
                    elif multiplier in ("thousand", "k"):
                        num *= 1_000
                return str(num)
        return ""

    @staticmethod
    def _extract_round_type(text_lower: str) -> str:
        """Extract funding round type from text."""
        if "series c" in text_lower or "series-c" in text_lower:
            return "series-c"
        if "series b" in text_lower or "series-b" in text_lower:
            return "series-b"
        if "series a" in text_lower or "series-a" in text_lower:
            return "series-a"
        if "seed" in text_lower or "pre-seed" in text_lower:
            return "seed"
        if "bridge" in text_lower:
            return "bridge"
        return "venture"

    @staticmethod
    def _extract_country(text: str) -> str:
        """Try to identify a MENA country from text."""
        text_lower = text.lower()
        for country in MENA_COUNTRY_NAMES:
            if country in text_lower:
                return country.title()
        return ""

    @staticmethod
    def _normalize_sector(sector: str) -> str:
        """Normalize sector names to pipeline categories."""
        sector_lower = sector.lower().strip()
        mapping = {
            "fintech": "finance",
            "financial services": "finance",
            "financial technology": "finance",
            "healthtech": "health",
            "health tech": "health",
            "healthcare": "health",
            "edtech": "education",
            "e-commerce": "ecommerce",
            "ecommerce": "ecommerce",
            "logistics": "logistics",
            "delivery": "logistics",
            "saas": "software",
            "enterprise": "software",
            "ai": "software",
            "artificial intelligence": "software",
            "proptech": "real_estate",
            "real estate": "real_estate",
            "cleantech": "cleantech",
            "energy": "cleantech",
        }
        for key, val in mapping.items():
            if key in sector_lower:
                return val
        return sector_lower or "other"

    @staticmethod
    def _normalize_stage(stage: str) -> str:
        """Normalize funding stage names."""
        stage_lower = stage.lower().strip()
        if "series a" in stage_lower:
            return "series-a"
        if "series b" in stage_lower:
            return "series-b"
        if "series c" in stage_lower:
            return "series-c"
        if "seed" in stage_lower:
            return "seed"
        return stage_lower or "venture"

    @staticmethod
    def _parse_funding_amount(text: str) -> str:
        """Parse a funding amount string to numeric USD."""
        if not text:
            return ""
        text = text.replace(",", "").replace("$", "").strip()
        m = re.search(r"([\d\.]+)\s*(m|million|b|billion|k|thousand)?", text, re.IGNORECASE)
        if m:
            num = float(m.group(1))
            mult = (m.group(2) or "").lower()
            if mult in ("m", "million"):
                num *= 1_000_000
            elif mult in ("b", "billion"):
                num *= 1_000_000_000
            elif mult in ("k", "thousand"):
                num *= 1_000
            return str(num)
        return ""

    # ── Crunchbase-compatible output ─────────────────────────────────────

    def _generate_crunchbase_csvs(self, deals: list[dict]):
        """
        Convert deals to Crunchbase-compatible format:
            magnitt_investments.csv
            magnitt_rounds.csv
            magnitt_objects.csv
        """
        objects_map = {}
        rounds_rows = []
        investments_rows = []
        round_counter = 800_000_000

        for deal in deals:
            company = deal.get("company_name", "").strip()
            if not company:
                continue

            # Company object
            cid = f"magnitt_c_{hashlib.md5(company.encode()).hexdigest()[:12]}"
            objects_map[cid] = {
                "id": cid,
                "name": company,
                "category_code": deal.get("sector", ""),
            }

            # Round
            rid = f"magnitt_r_{round_counter}"
            round_counter += 1
            funded_at = deal.get("article_date", "") or deal.get("scraped_at", "")
            rounds_rows.append({
                "funding_round_id": rid,
                "object_id": cid,
                "funded_at": funded_at,
                "funding_round_type": deal.get("stage", "venture"),
                "raised_amount_usd": deal.get("total_funding", ""),
            })

            # Investors from detail scrape
            for inv_name in deal.get("investors", []):
                iid = f"magnitt_i_{hashlib.md5(inv_name.encode()).hexdigest()[:12]}"
                objects_map[iid] = {
                    "id": iid,
                    "name": inv_name,
                    "category_code": "investor",
                }
                investments_rows.append({
                    "funding_round_id": rid,
                    "funded_object_id": cid,
                    "investor_object_id": iid,
                })

        self._write_csv(self.output_dir / "magnitt_objects.csv", list(objects_map.values()))
        self._write_csv(self.output_dir / "magnitt_rounds.csv", rounds_rows)
        self._write_csv(self.output_dir / "magnitt_investments.csv", investments_rows)

        log.info(f"  magnitt_objects.csv      : {len(objects_map)} entities")
        log.info(f"  magnitt_rounds.csv       : {len(rounds_rows)} rounds")
        log.info(f"  magnitt_investments.csv  : {len(investments_rows)} investments")

    # ── Main pipeline ────────────────────────────────────────────────────

    def run(self) -> Path:
        """Execute all MENA data collection sources."""
        start = datetime.now()
        log.info("=" * 70)
        log.info("MAGNiTT / MENA Startup Scraper — VentureGraph Data Augmentation")
        log.info("=" * 70)

        all_deals = []

        # Source 1: MAGNiTT directory
        magnitt_deals = self.scrape_magnitt_directory()
        all_deals.extend(magnitt_deals)
        log.info(f"MAGNiTT directory: {len(magnitt_deals)} deals")

        # Source 2: Wamda press
        wamda_deals = self.scrape_wamda()
        all_deals.extend(wamda_deals)
        log.info(f"Wamda news:        {len(wamda_deals)} deals")

        # Source 3: GCC press
        gcc_deals = self.scrape_gcc_press()
        all_deals.extend(gcc_deals)
        log.info(f"GCC press:         {len(gcc_deals)} deals")

        # Deduplicate by company name + date
        all_deals = self._deduplicate(all_deals)
        log.info(f"After dedup:       {len(all_deals)} unique deals")

        # Save raw deals
        self._write_csv(self.output_dir / "magnitt_deals.csv", all_deals)

        # Generate Crunchbase-compatible CSVs
        log.info("\nGenerating Crunchbase-compatible CSVs ...")
        self._generate_crunchbase_csvs(all_deals)

        elapsed = (datetime.now() - start).total_seconds()
        log.info("\n" + "=" * 70)
        log.info(f"DONE — {len(all_deals)} MENA deals collected")
        log.info(f"  Requests: {self._request_count}")
        log.info(f"  Time:     {elapsed:.0f}s")
        log.info(f"  Output:   {self.output_dir}/")
        log.info("=" * 70)

        return self.output_dir

    @staticmethod
    def _deduplicate(deals: list[dict]) -> list[dict]:
        """Remove duplicate deals by company name (case-insensitive)."""
        seen = set()
        unique = []
        for d in deals:
            key = d.get("company_name", "").strip().lower()
            date = d.get("article_date", "") or d.get("scraped_at", "")
            dedup_key = f"{key}|{date[:10]}"
            if dedup_key not in seen and key:
                seen.add(dedup_key)
                unique.append(d)
        return unique

    @staticmethod
    def _write_csv(path: Path, rows: list[dict]):
        if not rows:
            log.warning(f"No data to write for {path}")
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", newline="", encoding="utf-8") as f:
            # Collect all keys across all rows
            all_keys = []
            seen_keys = set()
            for row in rows:
                for k in row.keys():
                    if k not in seen_keys:
                        all_keys.append(k)
                        seen_keys.add(k)
            writer = csv.DictWriter(f, fieldnames=all_keys, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="MAGNiTT / MENA Startup Scraper — VentureGraph Data Augmentation"
    )
    parser.add_argument(
        "--output", type=str, default="data_augmented",
        help="Output directory (default: data_augmented/)"
    )
    parser.add_argument(
        "--max-pages", type=int, default=200,
        help="Max pages per source (default: 200)"
    )
    args = parser.parse_args()

    scraper = MagnittScraper(output_dir=args.output, max_pages=args.max_pages)
    scraper.run()


if __name__ == "__main__":
    main()
