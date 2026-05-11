"""
VentureGraph — Bundesanzeiger (DE) Scraper
============================================
C-DE422 · Big Data Engineering II — Data Augmentation Layer
Author: Mohamed Hares

Scrapes the German Federal Gazette (Bundesanzeiger) and supplementary
sources for German startup / VC investment data:

    1. Bundesanzeiger (bundesanzeiger.de) — mandatory financial disclosures
    2. Handelsregister (handelsregister.de) — commercial register entries
    3. Deutsche Startups (deutsche-startups.de) — press coverage

German GmbH / UG companies must publish annual financial statements
in the Bundesanzeiger. Capital increases reveal funding events.
Gesellschafterliste (shareholder list) changes reveal investor entries.

Output:  data_augmented/ba_companies.csv
         data_augmented/ba_disclosures.csv
         data_augmented/ba_investments.csv
         data_augmented/ba_rounds.csv
         data_augmented/ba_objects.csv

Expected yield:  ~500 – 1,500 German startup events

Rate limits:
    - Bundesanzeiger: 1s delay (public, no API key)
    - Handelsregister: 2s delay (public)
    - Deutsche-Startups: 0.5s delay

Usage:
    python scraper_bundesanzeiger.py --output data_augmented/
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
from urllib.parse import urljoin, urlencode, quote_plus

import requests
from bs4 import BeautifulSoup

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("BA")

# ── Constants ────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
}

# Bundesanzeiger
BA_BASE        = "https://www.bundesanzeiger.de"
BA_SEARCH_URL  = "https://www.bundesanzeiger.de/pub/de/suchergebnis"

# Handelsregister (public)
HR_BASE        = "https://www.handelsregister.de"
HR_SEARCH_URL  = "https://www.handelsregister.de/rp_web/normalesuche.xhtml"

# Deutsche Startups (press)
DS_BASE        = "https://www.deutsche-startups.de"
DS_DEALS_URL   = "https://www.deutsche-startups.de/tag/finanzierungsrunde/"

# German tech keywords for filtering
TECH_KEYWORDS = {
    "software", "saas", "fintech", "healthtech", "edtech", "proptech",
    "insurtech", "biotech", "cleantech", "deeptech", "mobility",
    "artificial intelligence", "machine learning", "blockchain",
    "e-commerce", "marketplace", "platform", "digital", "tech",
    "ki", "künstliche intelligenz",  # German AI terms
}

# City list for German tech hubs
GERMAN_TECH_HUBS = [
    "Berlin", "München", "Hamburg", "Frankfurt", "Köln",
    "Stuttgart", "Düsseldorf", "Leipzig", "Dresden", "Hannover",
    "Nürnberg", "Karlsruhe", "Darmstadt", "Aachen", "Heidelberg",
]


class BundesanzeigerScraper:
    """
    Multi-source German startup data scraper.
    
    Primary: Bundesanzeiger financial disclosures (capital increases → funding)
    Secondary: Deutsche Startups press (funding round announcements)
    Tertiary: Handelsregister commercial register (company metadata)
    """

    def __init__(self, output_dir: str = "data_augmented", max_pages: int = 100):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.max_pages = max_pages
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self._request_count = 0

    def _get(self, url: str, delay: float = 1.0, params: dict = None) -> Optional[BeautifulSoup]:
        """Fetch URL and return BeautifulSoup."""
        try:
            resp = self.session.get(url, params=params, timeout=30)
            self._request_count += 1
            time.sleep(delay)

            if resp.status_code == 200:
                return BeautifulSoup(resp.text, "html.parser")
            else:
                log.warning(f"HTTP {resp.status_code}: {url}")
                return None
        except requests.exceptions.RequestException as e:
            log.error(f"Request failed: {e}")
            return None

    # ── Source 1: Bundesanzeiger ──────────────────────────────────────────

    def scrape_bundesanzeiger(self) -> list[dict]:
        """
        Search Bundesanzeiger for capital increase disclosures
        from tech-sector companies.
        
        Capital increase (Kapitalerhöhung) filings indicate funding events.
        The Gesellschafterliste reveals who the new shareholders (investors) are.
        """
        disclosures = []
        log.info("Scraping Bundesanzeiger ...")

        # Search for capital increase disclosures from tech companies
        search_terms = [
            "Kapitalerhöhung GmbH Software",
            "Kapitalerhöhung GmbH Fintech",
            "Kapitalerhöhung GmbH Technology",
            "Kapitalerhöhung UG Software",
            "Gesellschafterliste GmbH Software Berlin",
            "Gesellschafterliste GmbH Software München",
            "Jahresabschluss GmbH Software",
            "Kapitalerhöhung GmbH Berlin",
            "Kapitalerhöhung GmbH München",
            "Kapitalerhöhung GmbH Hamburg",
        ]

        for term in search_terms:
            log.info(f"  Searching: '{term}' ...")
            results = self._search_bundesanzeiger(term)
            disclosures.extend(results)
            log.info(f"    Found {len(results)} results (total: {len(disclosures)})")

        return disclosures

    def _search_bundesanzeiger(self, query: str) -> list[dict]:
        """Execute a search on Bundesanzeiger."""
        results = []

        for page in range(1, min(self.max_pages, 20) + 1):
            url = f"{BA_SEARCH_URL}?query={quote_plus(query)}&page={page}"
            soup = self._get(url, delay=1.5)

            if soup is None:
                break

            # Parse search results
            entries = soup.select(
                ".result_container, .publication, tr.result, "
                "[class*='result'], [class*='entry']"
            )
            if not entries:
                # Try broader selectors
                entries = soup.find_all("div", class_=re.compile(r"result|entry|publication"))

            if not entries:
                break

            for entry in entries:
                record = self._parse_ba_entry(entry)
                if record:
                    results.append(record)

        return results

    def _parse_ba_entry(self, entry) -> Optional[dict]:
        """Parse a Bundesanzeiger search result entry."""
        try:
            # Company name
            name_el = entry.select_one("a, .company, .name, h3, h4, strong")
            name = name_el.get_text(strip=True) if name_el else ""
            if not name:
                return None

            # Clean GmbH/UG suffix
            name = re.sub(r"\s+(GmbH|UG|AG|SE|KG|OHG)\s*(\(.*?\))?\s*$", "", name, flags=re.IGNORECASE)
            name = name.strip()
            if not name:
                return None

            # Date
            date_el = entry.select_one(".date, time, [class*='date']")
            date_str = date_el.get_text(strip=True) if date_el else ""

            # Publication type
            type_el = entry.select_one(".type, .category, [class*='type']")
            pub_type = type_el.get_text(strip=True) if type_el else ""

            # Description/content
            desc_el = entry.select_one(".description, .content, p, .text")
            description = desc_el.get_text(strip=True)[:500] if desc_el else ""

            # Detect if this is a capital increase
            is_capital_increase = any(kw in description.lower() for kw in [
                "kapitalerhöhung", "capital increase", "stammkapital",
                "geschäftsanteile", "gesellschafterliste",
            ])

            # Try to extract amount
            amount = self._extract_euro_amount(description)

            # Detect investors from Gesellschafterliste
            investors = self._extract_investors_from_text(description)

            return {
                "company_name": name,
                "publication_date": date_str,
                "publication_type": pub_type,
                "description": description,
                "is_capital_increase": "1" if is_capital_increase else "0",
                "amount_eur": amount,
                "investors": json.dumps(investors),
                "n_investors": str(len(investors)),
                "country": "DE",
                "source": "bundesanzeiger",
            }
        except Exception:
            return None

    # ── Source 2: Deutsche Startups Press ─────────────────────────────────

    def scrape_deutsche_startups(self) -> list[dict]:
        """
        Scrape deutsche-startups.de for funding round announcements.
        This is the leading German startup press source.
        """
        deals = []
        log.info("Scraping Deutsche Startups ...")

        for page in range(1, min(self.max_pages, 50) + 1):
            url = f"{DS_DEALS_URL}page/{page}/"
            soup = self._get(url, delay=0.5)

            if soup is None:
                break

            articles = soup.select("article, .post, [class*='article']")
            if not articles:
                break

            for article in articles:
                deal = self._parse_ds_article(article)
                if deal:
                    deals.append(deal)

            if page % 10 == 0:
                log.info(f"  Page {page}: {len(deals)} deals")

        return deals

    def _parse_ds_article(self, article) -> Optional[dict]:
        """Parse a Deutsche Startups article for deal info."""
        try:
            # Title
            title_el = article.select_one("h2 a, h3 a, .entry-title a, a[rel='bookmark']")
            title = title_el.get_text(strip=True) if title_el else ""
            link = title_el["href"] if title_el and title_el.has_attr("href") else ""

            if not title:
                return None

            title_lower = title.lower()

            # Check if funding-related
            funding_keywords = [
                "finanzierung", "funding", "millionen", "million",
                "investiert", "kapital", "seed", "series", "runde",
                "investment", "beteiligung", "wachstumskapital",
            ]
            if not any(kw in title_lower for kw in funding_keywords):
                return None

            # Date
            date_el = article.select_one("time, .date, .entry-date")
            date_str = ""
            if date_el:
                date_str = date_el.get("datetime", "") or date_el.get_text(strip=True)

            # Extract company name (usually first word/phrase before "raises/secures")
            company = self._extract_company_from_german_headline(title)

            # Amount
            amount = self._extract_euro_amount(title)
            if not amount:
                amount = self._extract_dollar_amount(title)

            # Round type
            round_type = self._extract_german_round_type(title_lower)

            # Summary / excerpt
            excerpt_el = article.select_one(".entry-content, .excerpt, p")
            excerpt = excerpt_el.get_text(strip=True)[:300] if excerpt_el else ""

            return {
                "company_name": company,
                "headline": title,
                "article_date": date_str,
                "amount": amount,
                "round_type": round_type,
                "article_url": link,
                "excerpt": excerpt,
                "country": "DE",
                "source": "deutsche_startups",
            }
        except Exception:
            return None

    # ── Source 3: Handelsregister search ──────────────────────────────────

    def scrape_handelsregister(self) -> list[dict]:
        """
        Search Handelsregister for recently registered GmbH
        companies in tech sectors / tech hub cities.
        """
        companies = []
        log.info("Scraping Handelsregister ...")

        for city in GERMAN_TECH_HUBS[:5]:  # Limit to top 5 hubs
            log.info(f"  Searching {city} ...")
            for keyword in ["Software", "Tech", "Digital"]:
                results = self._search_handelsregister(keyword, city)
                companies.extend(results)

            log.info(f"  {city}: {len(companies)} total entries")

        return companies

    def _search_handelsregister(self, keyword: str, city: str) -> list[dict]:
        """Search Handelsregister for companies matching keyword + city."""
        results = []

        params = {
            "schlagwort": keyword,
            "ort": city,
            "rechtsform": "GmbH",
        }

        soup = self._get(HR_SEARCH_URL, delay=2.0, params=params)
        if soup is None:
            return results

        rows = soup.select("tr, .result, [class*='company']")
        for row in rows:
            cols = row.select("td")
            if len(cols) >= 3:
                name = cols[0].get_text(strip=True)
                reg_number = cols[1].get_text(strip=True) if len(cols) > 1 else ""
                location = cols[2].get_text(strip=True) if len(cols) > 2 else city

                if name and "GmbH" in name:
                    results.append({
                        "company_name": name,
                        "register_number": reg_number,
                        "city": location,
                        "country": "DE",
                        "source": "handelsregister",
                    })

        return results

    # ── NLP helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _extract_company_from_german_headline(headline: str) -> str:
        """Extract company name from a German funding headline."""
        patterns = [
            r"^([A-Z][A-Za-z0-9\.\-]+)\s+(?:erhält|sammelt|sichert|bekommt|schließt|holt)",
            r"^([A-Z][A-Za-z0-9\.\-]+)\s+(?:raises|secures|closes|gets)",
            r"(?:Startup\s+)?([A-Z][A-Za-z0-9\.\-]+)\s+(?:Finanzierung|Kapital|Millionen|funding)",
            r"^(?:Millionen für|Funding für)\s+([A-Z][A-Za-z0-9\.\-]+)",
        ]
        for p in patterns:
            m = re.search(p, headline)
            if m:
                return m.group(1).strip()

        # Fallback: first word/phrase
        parts = headline.split()
        if parts and parts[0][0].isupper():
            name_parts = []
            for p in parts:
                if p.lower() in {"erhält", "sammelt", "sichert", "bekommt",
                                  "schließt", "raises", "secures", "millionen",
                                  "million", "finanzierung", "holt", "sich"}:
                    break
                name_parts.append(p)
            return " ".join(name_parts[:3])

        return ""

    @staticmethod
    def _extract_euro_amount(text: str) -> str:
        """Extract Euro amount from text."""
        patterns = [
            r"([\d,\.]+)\s*(?:Millionen|Mio\.?)\s*(?:Euro|EUR|€)",
            r"€\s*([\d,\.]+)\s*(?:Millionen|Mio\.?|M)",
            r"([\d,\.]+)\s*(?:Million|Mio\.?)\s*€",
            r"([\d,\.]+)\s*Mio",
        ]
        for p in patterns:
            m = re.search(p, text, re.IGNORECASE)
            if m:
                num = float(m.group(1).replace(",", "."))
                return str(num * 1_000_000)

        # Simple Euro amount
        m = re.search(r"€\s*([\d,\.]+)", text)
        if m:
            return m.group(1).replace(",", ".")

        return ""

    @staticmethod
    def _extract_dollar_amount(text: str) -> str:
        """Extract USD amount from text."""
        patterns = [
            r"\$\s*([\d,\.]+)\s*(million|m|billion|b)",
            r"([\d,\.]+)\s*(million|m)\s*(?:dollar|usd|\$)",
        ]
        for p in patterns:
            m = re.search(p, text, re.IGNORECASE)
            if m:
                num = float(m.group(1).replace(",", ""))
                mult = m.group(2).lower()
                if mult in ("million", "m"):
                    num *= 1_000_000
                elif mult in ("billion", "b"):
                    num *= 1_000_000_000
                return str(num)
        return ""

    @staticmethod
    def _extract_german_round_type(text_lower: str) -> str:
        """Extract round type from German text."""
        if "series c" in text_lower or "serie c" in text_lower:
            return "series-c"
        if "series b" in text_lower or "serie b" in text_lower:
            return "series-b"
        if "series a" in text_lower or "serie a" in text_lower:
            return "series-a"
        if "seed" in text_lower or "frühphase" in text_lower:
            return "seed"
        if "wachstum" in text_lower or "growth" in text_lower:
            return "series-b"
        return "venture"

    @staticmethod
    def _extract_investors_from_text(text: str) -> list[str]:
        """
        Try to extract investor names from disclosure text.
        Common patterns in Gesellschafterliste:
            "Gesellschafter: ABC GmbH (30%), XYZ Ventures (20%)"
        """
        investors = []
        patterns = [
            r"(?:Gesellschafter|Investor|Beteiligung)[:\s]+(.*?)(?:\.|$)",
            r"([A-Z][A-Za-z\s&\.]+(?:GmbH|AG|Ventures|Capital|Partners|Fund))",
        ]
        for p in patterns:
            matches = re.findall(p, text)
            for m in matches:
                # Split on comma or semicolon
                for part in re.split(r"[,;]", m):
                    name = part.strip()
                    if name and len(name) > 3:
                        # Remove percentage
                        name = re.sub(r"\s*\([\d,\.]+\s*%\)", "", name).strip()
                        if name:
                            investors.append(name)

        return investors[:10]  # cap

    # ── Crunchbase-compatible output ─────────────────────────────────────

    def _generate_crunchbase_csvs(self, all_deals: list[dict]):
        """Convert to Crunchbase-compatible CSVs."""
        objects_map = {}
        rounds_rows = []
        investments_rows = []
        round_counter = 600_000_000

        for deal in all_deals:
            company = deal.get("company_name", "").strip()
            if not company:
                continue

            cid = f"ba_c_{hashlib.md5(company.encode()).hexdigest()[:12]}"
            sector = deal.get("sector", "software")
            objects_map[cid] = {
                "id": cid,
                "name": company,
                "category_code": sector,
            }

            rid = f"ba_r_{round_counter}"
            round_counter += 1
            funded_at = deal.get("article_date", "") or deal.get("publication_date", "")
            round_type = deal.get("round_type", "") or deal.get("stage", "venture")
            amount = deal.get("amount", "") or deal.get("amount_eur", "")

            rounds_rows.append({
                "funding_round_id": rid,
                "object_id": cid,
                "funded_at": funded_at,
                "funding_round_type": round_type,
                "raised_amount_usd": amount,
            })

            # Investors
            investors_json = deal.get("investors", "[]")
            try:
                investors = json.loads(investors_json) if isinstance(investors_json, str) else investors_json
            except json.JSONDecodeError:
                investors = []

            if isinstance(investors, list):
                for inv in investors:
                    inv_name = inv if isinstance(inv, str) else str(inv)
                    if inv_name:
                        iid = f"ba_i_{hashlib.md5(inv_name.encode()).hexdigest()[:12]}"
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

        self._write_csv(self.output_dir / "ba_objects.csv", list(objects_map.values()))
        self._write_csv(self.output_dir / "ba_rounds.csv", rounds_rows)
        self._write_csv(self.output_dir / "ba_investments.csv", investments_rows)

        log.info(f"  ba_objects.csv      : {len(objects_map)} entities")
        log.info(f"  ba_rounds.csv       : {len(rounds_rows)} rounds")
        log.info(f"  ba_investments.csv  : {len(investments_rows)} investments")

    # ── Main pipeline ────────────────────────────────────────────────────

    def run(self) -> Path:
        """Execute all German data collection sources."""
        start = datetime.now()
        log.info("=" * 70)
        log.info("Bundesanzeiger (DE) Scraper — VentureGraph Data Augmentation")
        log.info("=" * 70)

        all_deals = []

        # Source 1: Bundesanzeiger
        ba_results = self.scrape_bundesanzeiger()
        all_deals.extend(ba_results)
        log.info(f"Bundesanzeiger: {len(ba_results)} disclosures")

        # Source 2: Deutsche Startups press
        ds_deals = self.scrape_deutsche_startups()
        all_deals.extend(ds_deals)
        log.info(f"Deutsche Startups: {len(ds_deals)} deals")

        # Source 3: Handelsregister
        hr_companies = self.scrape_handelsregister()
        log.info(f"Handelsregister: {len(hr_companies)} companies")
        # Add to deals with minimal info
        for c in hr_companies:
            all_deals.append({
                "company_name": c["company_name"],
                "country": "DE",
                "source": "handelsregister",
                "sector": "software",
                "round_type": "seed",
            })

        # Deduplicate
        all_deals = self._deduplicate(all_deals)
        log.info(f"After dedup: {len(all_deals)} unique entries")

        # Save raw data
        self._write_csv(self.output_dir / "ba_disclosures.csv", all_deals)

        # Generate Crunchbase-compatible CSVs
        log.info("\nGenerating Crunchbase-compatible CSVs ...")
        self._generate_crunchbase_csvs(all_deals)

        elapsed = (datetime.now() - start).total_seconds()
        log.info("\n" + "=" * 70)
        log.info(f"DONE — {len(all_deals)} German entries collected")
        log.info(f"  Requests: {self._request_count}")
        log.info(f"  Time:     {elapsed:.0f}s")
        log.info(f"  Output:   {self.output_dir}/")
        log.info("=" * 70)

        return self.output_dir

    @staticmethod
    def _deduplicate(deals: list[dict]) -> list[dict]:
        seen = set()
        unique = []
        for d in deals:
            key = d.get("company_name", "").strip().lower()
            if key and key not in seen:
                seen.add(key)
                unique.append(d)
        return unique

    @staticmethod
    def _write_csv(path: Path, rows: list[dict]):
        if not rows:
            log.warning(f"No data for {path}")
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        all_keys = []
        seen_keys = set()
        for row in rows:
            for k in row.keys():
                if k not in seen_keys:
                    all_keys.append(k)
                    seen_keys.add(k)
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=all_keys, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Bundesanzeiger (DE) Scraper — VentureGraph Data Augmentation"
    )
    parser.add_argument(
        "--output", type=str, default="data_augmented",
        help="Output directory (default: data_augmented/)"
    )
    parser.add_argument(
        "--max-pages", type=int, default=100,
        help="Max pages per source (default: 100)"
    )
    args = parser.parse_args()

    scraper = BundesanzeigerScraper(output_dir=args.output, max_pages=args.max_pages)
    scraper.run()


if __name__ == "__main__":
    main()
