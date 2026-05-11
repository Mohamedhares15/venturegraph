"""
VentureGraph — Companies House (UK) Scraper
=============================================
C-DE422 · Big Data Engineering II — Data Augmentation Layer
Author: Mohamed Hares

Scrapes the UK Companies House API for startup investment data:
    - Company registrations with SIC codes matching VC-backed sectors
    - Significant persons of control (PSC) — reveals investors
    - Filing history — reveals funding events via share allotments
    - Officers — directors / secretaries (network nodes)

The Companies House API is free and well-documented:
    https://developer.company-information.service.gov.uk/

You need an API key (free registration):
    https://developer.company-information.service.gov.uk/manage-applications

Set your API key via environment variable:
    export COMPANIES_HOUSE_API_KEY="your-key-here"

Output:  data_augmented/ch_companies.csv
         data_augmented/ch_officers.csv
         data_augmented/ch_psc.csv
         data_augmented/ch_investments.csv
         data_augmented/ch_rounds.csv
         data_augmented/ch_objects.csv

Expected yield:  ~1,500 – 3,000 UK startup events

Rate limit:  600 requests per 5 minutes (Companies House limit)

Usage:
    python scraper_companies_house.py --api-key YOUR_KEY --output data_augmented/
    # or set COMPANIES_HOUSE_API_KEY env var
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
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("CH")

# ── Constants ────────────────────────────────────────────────────────────────

CH_API_BASE = "https://api.company-information.service.gov.uk"

# SIC codes for tech/startup sectors
# Full list: https://resources.companieshouse.gov.uk/sic/
STARTUP_SIC_CODES = {
    # Software & IT
    "62011": "software",   # Computer programming activities
    "62012": "software",   # Business and domestic software development
    "62020": "software",   # Computer consultancy activities
    "62090": "software",   # Other IT service activities
    "63110": "software",   # Data processing, hosting
    "63120": "software",   # Web portals
    # Telecom
    "61100": "software",   # Wired telecommunications
    "61200": "software",   # Wireless telecommunications
    "61900": "software",   # Other telecommunications
    # Finance / Fintech
    "64110": "finance",    # Central banking
    "64191": "finance",    # Banks
    "64205": "finance",    # Financial leasing
    "64301": "finance",    # Activities of investment trusts
    "64302": "finance",    # Activities of unit trusts
    "64303": "finance",    # Activities of venture capital trusts
    "64304": "finance",    # Activities of open-ended investment companies
    "64910": "finance",    # Financial leasing
    "64921": "finance",    # Credit granting by non-deposit taking finance houses
    "64929": "finance",    # Other credit granting n.e.c.
    "64999": "finance",    # Financial service activities
    "66110": "finance",    # Administration of financial markets
    "66120": "finance",    # Security and commodity contracts dealing
    "66190": "finance",    # Other auxiliary financial service activities
    # Biotech / Health
    "72110": "biotech",    # Research in biotechnology
    "72190": "biotech",    # Other R&D in natural sciences
    "86101": "health",     # Hospital activities
    "86210": "health",     # General medical practice activities
    # Manufacturing / Hardware
    "26110": "hardware",   # Manufacture of electronic components
    "26120": "hardware",   # Manufacture of loaded electronic boards
    "26200": "hardware",   # Manufacture of computers
    "26301": "hardware",   # Manufacture of telegraph and telephone equipment
    # E-commerce / Retail
    "47910": "ecommerce",  # Retail sale via mail order or internet
    "47990": "ecommerce",  # Other retail sale not in stores
}

# Rate limit: 600 requests per 5 minutes
REQUEST_DELAY = 0.5  # seconds


class CompaniesHouseScraper:
    """
    Scrapes Companies House REST API for UK startup/VC data.
    Requires a free API key from Companies House Developer Hub.
    """

    def __init__(
        self,
        api_key: str,
        output_dir: str = "data_augmented",
        max_companies: int = 5000,
        start_date: str = "2010-01-01",
        end_date: str = "2024-12-31",
    ):
        self.api_key = api_key
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.max_companies = max_companies
        self.start_date = start_date
        self.end_date = end_date
        self.session = requests.Session()
        self.session.auth = (api_key, "")  # Companies House uses HTTP Basic Auth
        self.session.headers.update({
            "Accept": "application/json",
        })
        self._request_count = 0
        self._rate_limit_remaining = 600

    def _get(self, endpoint: str, params: dict = None) -> Optional[dict]:
        """Make an authenticated GET request to Companies House API."""
        url = f"{CH_API_BASE}{endpoint}"
        try:
            resp = self.session.get(url, params=params, timeout=30)
            self._request_count += 1

            # Track rate limits
            remaining = resp.headers.get("X-Ratelimit-Remain", "")
            if remaining:
                self._rate_limit_remaining = int(remaining)
                if self._rate_limit_remaining < 50:
                    log.warning(f"Rate limit low: {self._rate_limit_remaining} remaining")
                    time.sleep(5)

            time.sleep(REQUEST_DELAY)

            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 429:
                log.warning("Rate limited — sleeping 60s")
                time.sleep(60)
                return self._get(endpoint, params)  # retry
            elif resp.status_code == 404:
                return None
            else:
                log.warning(f"HTTP {resp.status_code}: {url}")
                return None

        except requests.exceptions.RequestException as e:
            log.error(f"Request failed: {e}")
            return None

    # ── Search for VC-backed companies ───────────────────────────────────

    def search_companies(self) -> list[dict]:
        """
        Search for companies with SIC codes matching startup sectors.
        Uses the advanced search endpoint.
        """
        all_companies = []

        for sic_code, sector in STARTUP_SIC_CODES.items():
            log.info(f"Searching SIC {sic_code} ({sector}) ...")
            start_index = 0

            while start_index < self.max_companies:
                data = self._get("/advanced-search/companies", {
                    "sic_codes": sic_code,
                    "incorporated_from": self.start_date,
                    "incorporated_to": self.end_date,
                    "size": 100,
                    "start_index": start_index,
                    "company_status": "active",
                })

                if data is None:
                    break

                items = data.get("items", [])
                if not items:
                    break

                for item in items:
                    company = {
                        "company_number": item.get("company_number", ""),
                        "company_name": item.get("company_name", ""),
                        "company_status": item.get("company_status", ""),
                        "date_of_creation": item.get("date_of_creation", ""),
                        "sic_codes": json.dumps(item.get("sic_codes", [])),
                        "sector": sector,
                        "address_locality": item.get("registered_office_address", {}).get("locality", ""),
                        "address_region": item.get("registered_office_address", {}).get("region", ""),
                        "address_country": item.get("registered_office_address", {}).get("country", "UK"),
                        "company_type": item.get("company_type", ""),
                        "source": "companies_house",
                    }
                    all_companies.append(company)

                total = data.get("total_results", 0)
                start_index += 100

                if start_index >= total or len(all_companies) >= self.max_companies:
                    break

            log.info(f"  SIC {sic_code}: {len(all_companies)} total companies so far")

            if len(all_companies) >= self.max_companies:
                break

        return all_companies

    # ── Fetch officers (directors = potential investors) ──────────────────

    def fetch_officers(self, company_number: str) -> list[dict]:
        """Get officers (directors, secretaries) for a company."""
        data = self._get(f"/company/{company_number}/officers")
        if data is None:
            return []

        officers = []
        for item in data.get("items", []):
            officers.append({
                "company_number": company_number,
                "name": item.get("name", ""),
                "officer_role": item.get("officer_role", ""),
                "appointed_on": item.get("appointed_on", ""),
                "resigned_on": item.get("resigned_on", ""),
                "nationality": item.get("nationality", ""),
                "occupation": item.get("occupation", ""),
                "country_of_residence": item.get("country_of_residence", ""),
            })

        return officers

    # ── Fetch Persons with Significant Control (investors) ───────────────

    def fetch_psc(self, company_number: str) -> list[dict]:
        """
        Get Persons with Significant Control.
        PSC records reveal significant shareholders — i.e., investors.
        """
        data = self._get(f"/company/{company_number}/persons-with-significant-control")
        if data is None:
            return []

        pscs = []
        for item in data.get("items", []):
            natures = item.get("natures_of_control", [])
            pscs.append({
                "company_number": company_number,
                "name": item.get("name", ""),
                "kind": item.get("kind", ""),
                "notified_on": item.get("notified_on", ""),
                "ceased_on": item.get("ceased_on", ""),
                "natures_of_control": json.dumps(natures),
                "country_of_residence": item.get("country_of_residence", ""),
                "nationality": item.get("nationality", ""),
                "is_corporate": "1" if "corporate" in item.get("kind", "") else "0",
            })

        return pscs

    # ── Fetch filing history (share allotments = funding events) ─────────

    def fetch_filings(self, company_number: str) -> list[dict]:
        """
        Fetch filing history. Share allotment filings (SH01)
        indicate new equity issuance = funding events.
        """
        data = self._get(f"/company/{company_number}/filing-history", {
            "category": "capital",
            "items_per_page": 50,
        })
        if data is None:
            return []

        filings = []
        for item in data.get("items", []):
            desc = item.get("description", "")
            # SH01 = Statement of capital following allotment
            if "allotment" in desc.lower() or "SH01" in item.get("type", ""):
                filings.append({
                    "company_number": company_number,
                    "filing_type": item.get("type", ""),
                    "date": item.get("date", ""),
                    "description": desc,
                    "category": item.get("category", ""),
                })

        return filings

    # ── Main pipeline ────────────────────────────────────────────────────

    def run(self) -> Path:
        """Execute the full Companies House scraping pipeline."""
        start = datetime.now()
        log.info("=" * 70)
        log.info("Companies House (UK) Scraper — VentureGraph Data Augmentation")
        log.info(f"Date range: {self.start_date} – {self.end_date}")
        log.info("=" * 70)

        # Step 1: Search for startup companies
        log.info("\nSTEP 1 — Searching for VC-sector companies ...")
        companies = self.search_companies()
        log.info(f"Found {len(companies)} companies")

        # Save companies
        self._write_csv(self.output_dir / "ch_companies.csv", companies)

        # Step 2: Fetch officers and PSC for each company
        log.info("\nSTEP 2 — Fetching officers & PSC data ...")
        all_officers = []
        all_psc = []
        all_filings = []

        for i, comp in enumerate(companies):
            cn = comp["company_number"]
            if i % 100 == 0:
                log.info(f"  Processing {i}/{len(companies)} ...")

            officers = self.fetch_officers(cn)
            all_officers.extend(officers)

            pscs = self.fetch_psc(cn)
            all_psc.extend(pscs)

            filings = self.fetch_filings(cn)
            all_filings.extend(filings)

        log.info(f"  Officers: {len(all_officers)}")
        log.info(f"  PSCs:     {len(all_psc)}")
        log.info(f"  Filings:  {len(all_filings)}")

        # Save detailed data
        self._write_csv(self.output_dir / "ch_officers.csv", all_officers)
        self._write_csv(self.output_dir / "ch_psc.csv", all_psc)
        self._write_csv(self.output_dir / "ch_filings.csv", all_filings)

        # Step 3: Generate Crunchbase-compatible CSVs
        log.info("\nSTEP 3 — Generating pipeline-compatible CSVs ...")
        self._generate_crunchbase_csvs(companies, all_psc, all_filings)

        elapsed = (datetime.now() - start).total_seconds()
        log.info("\n" + "=" * 70)
        log.info(f"DONE — {len(companies)} companies, {len(all_psc)} PSCs, {len(all_filings)} filings")
        log.info(f"  Requests: {self._request_count}")
        log.info(f"  Time:     {elapsed:.0f}s")
        log.info(f"  Output:   {self.output_dir}/")
        log.info("=" * 70)

        return self.output_dir

    def _generate_crunchbase_csvs(
        self, companies: list[dict], pscs: list[dict], filings: list[dict]
    ):
        """
        Convert Companies House data to Crunchbase-compatible format.
        PSC → investor; Share allotment filing → funding round.
        """
        objects_map = {}
        rounds_rows = []
        investments_rows = []
        round_counter = 700_000_000

        # Build company lookup
        company_lookup = {}
        for c in companies:
            cn = c["company_number"]
            company_lookup[cn] = c

            cid = f"ch_c_{cn}"
            objects_map[cid] = {
                "id": cid,
                "name": c["company_name"],
                "category_code": c.get("sector", ""),
            }

        # Map filings to rounds
        filing_lookup = {}
        for f in filings:
            cn = f["company_number"]
            cid = f"ch_c_{cn}"
            rid = f"ch_r_{round_counter}"
            round_counter += 1

            rounds_rows.append({
                "funding_round_id": rid,
                "object_id": cid,
                "funded_at": f["date"],
                "funding_round_type": "series-a",  # best approximation
                "raised_amount_usd": "",  # not available from filing
            })

            if cn not in filing_lookup:
                filing_lookup[cn] = []
            filing_lookup[cn].append(rid)

        # Map PSC to investors
        for psc in pscs:
            cn = psc["company_number"]
            if not psc.get("name"):
                continue

            investor_name = psc["name"]
            iid = f"ch_i_{hashlib.md5(investor_name.encode()).hexdigest()[:12]}"
            objects_map[iid] = {
                "id": iid,
                "name": investor_name,
                "category_code": "investor",
            }

            cid = f"ch_c_{cn}"
            # Link to filing rounds if available, otherwise create generic round
            round_ids = filing_lookup.get(cn, [])
            if not round_ids:
                # Create a round from company creation date
                comp = company_lookup.get(cn, {})
                rid = f"ch_r_{round_counter}"
                round_counter += 1
                rounds_rows.append({
                    "funding_round_id": rid,
                    "object_id": cid,
                    "funded_at": comp.get("date_of_creation", ""),
                    "funding_round_type": "seed",
                    "raised_amount_usd": "",
                })
                round_ids = [rid]

            for rid in round_ids[:1]:  # link to first round
                investments_rows.append({
                    "funding_round_id": rid,
                    "funded_object_id": cid,
                    "investor_object_id": iid,
                })

        self._write_csv(self.output_dir / "ch_objects.csv", list(objects_map.values()))
        self._write_csv(self.output_dir / "ch_rounds.csv", rounds_rows)
        self._write_csv(self.output_dir / "ch_investments.csv", investments_rows)

        log.info(f"  ch_objects.csv      : {len(objects_map)} entities")
        log.info(f"  ch_rounds.csv       : {len(rounds_rows)} rounds")
        log.info(f"  ch_investments.csv  : {len(investments_rows)} investments")

    @staticmethod
    def _write_csv(path: Path, rows: list[dict]):
        if not rows:
            log.warning(f"No data for {path}")
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Companies House (UK) Scraper — VentureGraph Data Augmentation"
    )
    parser.add_argument(
        "--api-key", type=str,
        default=os.environ.get("COMPANIES_HOUSE_API_KEY", ""),
        help="Companies House API key (or set COMPANIES_HOUSE_API_KEY env var)"
    )
    parser.add_argument(
        "--output", type=str, default="data_augmented",
        help="Output directory (default: data_augmented/)"
    )
    parser.add_argument(
        "--max-companies", type=int, default=5000,
        help="Maximum companies to fetch (default: 5000)"
    )
    parser.add_argument(
        "--start-date", type=str, default="2010-01-01",
        help="Start date (default: 2010-01-01)"
    )
    parser.add_argument(
        "--end-date", type=str, default="2024-12-31",
        help="End date (default: 2024-12-31)"
    )
    args = parser.parse_args()

    if not args.api_key:
        log.error("No API key provided!")
        log.error("Get a free key at: https://developer.company-information.service.gov.uk/")
        log.error("Then run:  python scraper_companies_house.py --api-key YOUR_KEY")
        log.error("Or set:    set COMPANIES_HOUSE_API_KEY=YOUR_KEY")
        sys.exit(1)

    scraper = CompaniesHouseScraper(
        api_key=args.api_key,
        output_dir=args.output,
        max_companies=args.max_companies,
        start_date=args.start_date,
        end_date=args.end_date,
    )
    scraper.run()


if __name__ == "__main__":
    main()
