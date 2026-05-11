"""
VentureGraph — SEC EDGAR Form D Scraper
========================================
C-DE422 · Big Data Engineering II — Data Augmentation Layer
Author: Mohamed Hares

Scrapes SEC EDGAR's XBRL/XML Form D filings to extract:
    - Company name, CIK, state, industry
    - Offering amount, amount sold, investor count
    - Date of first sale
    - Related persons (executives / directors)
    - Investor names (when disclosed in amendments)

Output:  data_augmented/edgar_form_d.csv
         data_augmented/edgar_offerings.csv

Expected yield:  ~5,000 – 8,000 VC-relevant events (Series A/B equivalent)

SEC EDGAR FULL-TEXT SEARCH API (EFTS):
    https://efts.sec.gov/LATEST/search-index?q=...&dateRange=...&forms=D

Rate limit:  10 req/sec — we use 0.15s sleep per request.

Usage:
    python scraper_edgar.py --start-year 2010 --end-year 2024 --output data_augmented/
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
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import requests

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("EDGAR")

# ── Constants ────────────────────────────────────────────────────────────────

EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"
EDGAR_FULL_TEXT  = "https://efts.sec.gov/LATEST/search-index"
EDGAR_FILING_URL = "https://www.sec.gov/cgi-bin/browse-edgar"
EDGAR_ARCHIVES   = "https://www.sec.gov/Archives/edgar/data"

# EDGAR full-text search (EFTS) — public, no key needed
EFTS_SEARCH = "https://efts.sec.gov/LATEST/search-index"
EFTS_API    = "https://efts.sec.gov/LATEST/search-index"

# The actual working endpoint for EDGAR full-text search
EDGAR_EFTS_URL = "https://efts.sec.gov/LATEST/search-index"

# Rate limit: SEC asks for max 10 requests/second
REQUEST_DELAY = 0.15  # seconds between requests

# User-Agent header (SEC requires identification)
HEADERS = {
    "User-Agent": "VentureGraph-Research/1.0 (Academic; SNA-Project; mohamed.hares@student.edu)",
    "Accept-Encoding": "gzip, deflate",
}

# VC-relevant SIC codes
VC_SIC_CODES = {
    "6726",  # Investment offices, not elsewhere classified
    "7372",  # Prepackaged software
    "7371",  # Computer programming, data processing
    "3674",  # Semiconductors
    "2836",  # Biological products
    "3841",  # Surgical & medical instruments
    "5961",  # Catalog and mail-order houses (e-commerce)
    "7374",  # Computer processing and data preparation
    "4813",  # Telephone communications
    "4812",  # Radiotelephone communications
}

# Form D industry group codes that map to VC-backed startups
FORM_D_INDUSTRY_GROUPS = {
    "Technology",
    "Biotechnology",
    "Health Care",
    "Telecommunications",
    "Commercial Banking",
    "Financial Services",
    "Insurance",
    "Energy",
    "Real Estate",
    "Retailing",
    "Manufacturing",
}


# ── SEC EDGAR Full-Text Search ───────────────────────────────────────────────

class EdgarFormDScraper:
    """
    Two-pass scraper:
        1. EDGAR EFTS full-text search to find Form D filing accession numbers.
        2. Fetch each filing's primary XML document to extract structured data.
    """

    def __init__(
        self,
        start_year: int = 2010,
        end_year: int = 2024,
        output_dir: str = "data_augmented",
        max_filings: int = 50_000,
    ):
        self.start_year = start_year
        self.end_year = end_year
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.max_filings = max_filings
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

        # Audit trail
        self._request_count = 0
        self._start_time = None

    # ── Pass 1: Discover filings via EDGAR full-text search ──────────────

    def _search_filings_for_quarter(
        self, year: int, quarter: int
    ) -> list[dict]:
        """
        Use EDGAR EFTS to find Form D filings in a given quarter.
        Returns list of {accession, cik, company_name, filed_date}.
        """
        q_start_month = (quarter - 1) * 3 + 1
        q_start = f"{year}-{q_start_month:02d}-01"
        if quarter == 4:
            q_end = f"{year}-12-31"
        else:
            q_end_month = quarter * 3
            # last day of end month
            if q_end_month in (1, 3, 5, 7, 8, 10, 12):
                q_end = f"{year}-{q_end_month:02d}-31"
            elif q_end_month in (4, 6, 9, 11):
                q_end = f"{year}-{q_end_month:02d}-30"
            else:
                q_end = f"{year}-02-28"

        filings = []
        start = 0
        page_size = 100

        while True:
            params = {
                "q": '"form d" "offering"',
                "dateRange": "custom",
                "startdt": q_start,
                "enddt": q_end,
                "forms": "D,D/A",
                "from": start,
                "size": page_size,
            }

            try:
                url = f"https://efts.sec.gov/LATEST/search-index?{urlencode(params)}"
                resp = self.session.get(url, timeout=30)
                self._request_count += 1
                time.sleep(REQUEST_DELAY)

                if resp.status_code == 429:
                    log.warning("Rate limited — sleeping 60s")
                    time.sleep(60)
                    continue

                if resp.status_code != 200:
                    log.warning(f"EFTS returned {resp.status_code} for {year}Q{quarter}")
                    break

                data = resp.json()
                hits = data.get("hits", {}).get("hits", [])
                if not hits:
                    break

                for hit in hits:
                    src = hit.get("_source", {})
                    filings.append({
                        "accession": src.get("file_num", ""),
                        "cik": src.get("entity_id", ""),
                        "company_name": src.get("entity_name", ""),
                        "filed_date": src.get("file_date", ""),
                        "form_type": src.get("file_type", "D"),
                    })

                start += page_size
                total = data.get("hits", {}).get("total", {})
                total_val = total.get("value", 0) if isinstance(total, dict) else total
                if start >= total_val or start >= self.max_filings:
                    break

            except requests.exceptions.RequestException as e:
                log.error(f"Request failed: {e}")
                time.sleep(5)
                break

        return filings

    def discover_filings(self) -> list[dict]:
        """Iterate all year-quarters and collect Form D filing references."""
        all_filings = []
        for year in range(self.start_year, self.end_year + 1):
            for quarter in range(1, 5):
                log.info(f"Searching EDGAR: {year} Q{quarter} ...")
                batch = self._search_filings_for_quarter(year, quarter)
                all_filings.extend(batch)
                log.info(f"  Found {len(batch)} filings (total: {len(all_filings)})")

                if len(all_filings) >= self.max_filings:
                    log.info(f"Reached max_filings={self.max_filings}, stopping search.")
                    return all_filings[:self.max_filings]

        log.info(f"Total filings discovered: {len(all_filings)}")
        return all_filings

    # ── Pass 2: Fetch & parse Form D XML ─────────────────────────────────

    def _fetch_filing_xml(self, cik: str, accession: str) -> Optional[str]:
        """
        Download the primary Form D XML from EDGAR archives.
        Accession format: 0001234567-YY-NNNNNN → folder 000123456700NNNNNN
        """
        # Clean accession number
        acc_clean = accession.replace("-", "")
        acc_dashed = accession

        url = f"{EDGAR_ARCHIVES}/{cik}/{acc_clean}/primary_doc.xml"
        try:
            resp = self.session.get(url, timeout=30)
            self._request_count += 1
            time.sleep(REQUEST_DELAY)

            if resp.status_code == 200:
                return resp.text

            # Try alternate path
            url2 = f"{EDGAR_ARCHIVES}/{cik}/{acc_dashed}/primary_doc.xml"
            resp2 = self.session.get(url2, timeout=30)
            self._request_count += 1
            time.sleep(REQUEST_DELAY)

            if resp2.status_code == 200:
                return resp2.text

        except requests.exceptions.RequestException:
            pass

        return None

    def _parse_form_d_xml(self, xml_text: str, filing_meta: dict) -> Optional[dict]:
        """
        Parse a Form D XML document into a structured record.
        Extracts: issuer info, offering details, related persons.
        """
        try:
            # Strip namespace for easier parsing
            xml_clean = re.sub(r'\sxmlns[^"]*"[^"]*"', '', xml_text)
            root = ET.fromstring(xml_clean)
        except ET.ParseError:
            return None

        record = {
            "cik": filing_meta.get("cik", ""),
            "company_name": filing_meta.get("company_name", ""),
            "filed_date": filing_meta.get("filed_date", ""),
            "form_type": filing_meta.get("form_type", "D"),
        }

        # ── Issuer info ──────────────────────────────────────────────────
        issuer = root.find(".//issuer") or root.find(".//primaryIssuer")
        if issuer is not None:
            record["entity_name"] = self._text(issuer, "entityName") or record["company_name"]
            record["street1"] = self._text(issuer, "street1")
            record["city"] = self._text(issuer, "city")
            record["state"] = self._text(issuer, "stateOrCountry")
            record["zip"] = self._text(issuer, "zipCode")
            record["phone"] = self._text(issuer, "phoneNumber")
            record["cik"] = self._text(issuer, "cik") or record["cik"]
            record["entity_type"] = self._text(issuer, "entityType")
            record["year_founded"] = self._text(issuer, "yearOfIncorporation")
            record["industry_group"] = self._text(issuer, "industryGroupType")
        else:
            record["entity_name"] = record["company_name"]
            record["industry_group"] = ""

        # ── Offering details ─────────────────────────────────────────────
        offering = root.find(".//offeringData") or root.find(".//offeringSalesAmounts")
        if offering is not None:
            record["total_offering_amount"] = self._text(offering, "totalOfferingAmount")
            record["total_amount_sold"] = self._text(offering, "totalAmountSold")
            record["total_remaining"] = self._text(offering, "totalRemaining")
            record["investor_count"] = self._text(offering, "totalNumberAlreadyInvested")
            record["date_first_sale"] = self._text(offering, "dateOfFirstSale")
            record["is_equity"] = "1" if self._text(offering, "isEquityType") == "Y" else "0"
            record["is_pooled_fund"] = "1" if self._text(offering, "isPooledInvestmentFundType") == "Y" else "0"
        else:
            for k in ["total_offering_amount", "total_amount_sold", "total_remaining",
                       "investor_count", "date_first_sale", "is_equity", "is_pooled_fund"]:
                record[k] = ""

        # ── Related persons (directors, executives, promoters) ───────────
        related = root.findall(".//relatedPersonInfo") or root.findall(".//relatedPersonsList//relatedPersonInfo")
        persons = []
        for rp in related[:20]:  # cap at 20 per filing
            name_parts = []
            for tag in ["firstName", "middleName", "lastName"]:
                v = self._text(rp, tag)
                if v:
                    name_parts.append(v)
            full_name = " ".join(name_parts)
            relationship = self._text(rp, "relationshipList") or self._text(rp, "relationship")
            persons.append({"name": full_name, "relationship": relationship or "Unknown"})

        record["related_persons"] = json.dumps(persons)
        record["n_related_persons"] = str(len(persons))

        return record

    @staticmethod
    def _text(parent, tag: str) -> str:
        """Safely extract text from an XML element."""
        el = parent.find(f".//{tag}")
        return el.text.strip() if el is not None and el.text else ""

    # ── Alternative: Use EDGAR company search API ────────────────────────

    def search_via_company_api(self) -> list[dict]:
        """
        Alternative discovery: use EDGAR company search to find
        all Form D filings. This is more reliable but slower.
        
        GET https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany
            &type=D&dateb=&owner=include&count=100&search_text=
            &action=getcompany&company=&CIK=&type=D&dateb=
            &owner=include&count=100&search_text=&action=getcompany
        """
        all_filings = []
        
        # Search by year using the EDGAR full-text search API
        for year in range(self.start_year, self.end_year + 1):
            url = "https://efts.sec.gov/LATEST/search-index"
            params = {
                "q": "*",
                "forms": "D",
                "dateRange": "custom",
                "startdt": f"{year}-01-01",
                "enddt": f"{year}-12-31",
                "from": 0,
                "size": 40,
            }
            
            try:
                resp = self.session.get(url, params=params, timeout=30)
                self._request_count += 1
                time.sleep(REQUEST_DELAY)
                
                if resp.status_code == 200:
                    data = resp.json()
                    hits = data.get("hits", {}).get("hits", [])
                    for hit in hits:
                        src = hit.get("_source", {})
                        all_filings.append({
                            "accession": src.get("file_num", ""),
                            "cik": str(src.get("entity_id", "")),
                            "company_name": src.get("entity_name", ""),
                            "filed_date": src.get("file_date", ""),
                            "form_type": "D",
                        })
                    log.info(f"{year}: found {len(hits)} filings")
            except Exception as e:
                log.error(f"Company search error for {year}: {e}")
                
        return all_filings

    # ── Use EDGAR XBRL company facts API (most reliable) ─────────────────

    def discover_via_submissions(self) -> list[dict]:
        """
        Use the newer EDGAR submissions API:
        https://data.sec.gov/submissions/CIK{cik}.json
        
        But first we need CIK numbers. Use the company tickers file.
        """
        # Download company tickers
        url = "https://www.sec.gov/files/company_tickers.json"
        try:
            resp = self.session.get(url, timeout=30)
            self._request_count += 1
            time.sleep(REQUEST_DELAY)
            
            if resp.status_code != 200:
                log.error(f"Could not fetch company tickers: {resp.status_code}")
                return []
            
            tickers = resp.json()
            log.info(f"Loaded {len(tickers)} company tickers")
        except Exception as e:
            log.error(f"Failed to fetch tickers: {e}")
            return []
        
        # For each company, check if they have Form D filings
        filings = []
        sampled_ciks = list(tickers.values())[:2000]  # Sample for speed
        
        for i, entry in enumerate(sampled_ciks):
            cik = str(entry.get("cik_str", "")).zfill(10)
            company = entry.get("title", "")
            
            if i % 100 == 0:
                log.info(f"Checking submissions: {i}/{len(sampled_ciks)} ...")
            
            sub_url = f"https://data.sec.gov/submissions/CIK{cik}.json"
            try:
                resp = self.session.get(sub_url, timeout=15)
                self._request_count += 1
                time.sleep(REQUEST_DELAY)
                
                if resp.status_code != 200:
                    continue
                
                data = resp.json()
                recent = data.get("filings", {}).get("recent", {})
                forms = recent.get("form", [])
                dates = recent.get("filingDate", [])
                accessions = recent.get("accessionNumber", [])
                
                for j, form in enumerate(forms):
                    if form in ("D", "D/A"):
                        filed = dates[j] if j < len(dates) else ""
                        acc = accessions[j] if j < len(accessions) else ""
                        
                        filings.append({
                            "accession": acc,
                            "cik": cik.lstrip("0"),
                            "company_name": company,
                            "filed_date": filed,
                            "form_type": form,
                        })
                        
            except Exception:
                continue
        
        log.info(f"Found {len(filings)} Form D filings via submissions API")
        return filings

    # ── Main pipeline ────────────────────────────────────────────────────

    def run(self) -> Path:
        """Execute the full scraping pipeline."""
        self._start_time = datetime.now()
        log.info("=" * 70)
        log.info("SEC EDGAR Form D Scraper — VentureGraph Data Augmentation")
        log.info(f"Date range: {self.start_year} – {self.end_year}")
        log.info("=" * 70)

        # Step 1: Discover filings
        log.info("\nPASS 1 — Discovering Form D filings ...")
        filings = self.discover_via_submissions()
        
        if not filings:
            log.warning("Submissions API returned no results, trying EFTS search ...")
            filings = self.discover_filings()
        
        if not filings:
            log.error("No filings found. Check network connectivity.")
            return self.output_dir

        # Deduplicate
        seen = set()
        unique_filings = []
        for f in filings:
            key = (f["cik"], f["filed_date"], f["company_name"])
            if key not in seen:
                seen.add(key)
                unique_filings.append(f)
        filings = unique_filings
        log.info(f"Unique filings after dedup: {len(filings)}")

        # Save raw discovery results
        raw_path = self.output_dir / "edgar_filings_raw.csv"
        self._write_csv(raw_path, filings)
        log.info(f"Raw filings saved to {raw_path}")

        # Step 2: Convert to Crunchbase-compatible format
        log.info("\nPASS 2 — Converting to pipeline-compatible format ...")
        offerings = self._convert_to_pipeline_format(filings)

        # Save pipeline-compatible CSVs
        offerings_path = self.output_dir / "edgar_form_d.csv"
        self._write_csv(offerings_path, offerings)
        log.info(f"Pipeline-compatible data saved to {offerings_path}")

        # Step 3: Generate Crunchbase-format files
        log.info("\nPASS 3 — Generating Crunchbase-compatible CSVs ...")
        self._generate_crunchbase_csvs(offerings)

        # Audit summary
        elapsed = (datetime.now() - self._start_time).total_seconds()
        log.info("\n" + "=" * 70)
        log.info(f"DONE — {len(offerings)} events extracted")
        log.info(f"  Requests made: {self._request_count}")
        log.info(f"  Time elapsed:  {elapsed:.0f}s")
        log.info(f"  Output:        {self.output_dir}/")
        log.info("=" * 70)

        # Write audit hash
        self._write_audit_hash(offerings_path)

        return self.output_dir

    def _convert_to_pipeline_format(self, filings: list[dict]) -> list[dict]:
        """
        Convert raw EDGAR filings to a format compatible with
        the VentureGraph pipeline. Maps Form D fields to:
            company_name, investor_name, funded_at, funding_round_type,
            amount_usd, sector, source
        """
        records = []
        for f in filings:
            company = f.get("company_name", "").strip()
            if not company:
                continue

            filed_date = f.get("filed_date", "")
            amount = f.get("total_amount_sold", "") or f.get("total_offering_amount", "")
            industry = f.get("industry_group", "")

            # Map EDGAR industry groups to our sector categories
            sector = self._map_industry_to_sector(industry)

            # Parse related persons as potential investors
            persons_json = f.get("related_persons", "[]")
            try:
                persons = json.loads(persons_json) if persons_json else []
            except json.JSONDecodeError:
                persons = []

            # Determine round type from offering amount
            round_type = self._infer_round_type(amount)

            # Create one record per filing (company-level event)
            record = {
                "company_name": company,
                "funded_at": filed_date,
                "funding_round_type": round_type,
                "amount_usd": self._clean_amount(amount),
                "sector": sector,
                "state": f.get("state", ""),
                "cik": f.get("cik", ""),
                "investor_count": f.get("investor_count", ""),
                "source": "sec_edgar_form_d",
                "is_equity": f.get("is_equity", ""),
                "n_related_persons": f.get("n_related_persons", "0"),
            }
            records.append(record)

            # If persons are listed, create investor-level records too
            for p in persons:
                if p.get("name", "").strip():
                    inv_record = record.copy()
                    inv_record["investor_name"] = p["name"]
                    inv_record["investor_role"] = p.get("relationship", "")
                    records.append(inv_record)

        return records

    def _generate_crunchbase_csvs(self, offerings: list[dict]):
        """
        Generate Crunchbase-format CSVs that can be directly merged
        with the existing pipeline:
            - edgar_investments.csv  (investor_object_id → funding_round_id mapping)
            - edgar_rounds.csv       (funding_round_id, funded_at, type, amount)
            - edgar_objects.csv      (id, name, category_code)
        """
        # Generate synthetic IDs
        investments_rows = []
        rounds_rows = []
        objects_set = {}  # id → {name, category_code}
        round_id_counter = 900_000_000  # high range to avoid collisions

        for off in offerings:
            company = off.get("company_name", "")
            if not company:
                continue

            # Company object
            company_id = f"edgar_c_{hashlib.md5(company.encode()).hexdigest()[:12]}"
            objects_set[company_id] = {
                "id": company_id,
                "name": company,
                "category_code": off.get("sector", ""),
            }

            # Round
            round_id = f"edgar_r_{round_id_counter}"
            round_id_counter += 1
            rounds_rows.append({
                "funding_round_id": round_id,
                "object_id": company_id,
                "funded_at": off.get("funded_at", ""),
                "funding_round_type": off.get("funding_round_type", "series-a"),
                "raised_amount_usd": off.get("amount_usd", ""),
            })

            # Investment (if investor_name present)
            investor_name = off.get("investor_name", "")
            if investor_name:
                investor_id = f"edgar_i_{hashlib.md5(investor_name.encode()).hexdigest()[:12]}"
                objects_set[investor_id] = {
                    "id": investor_id,
                    "name": investor_name,
                    "category_code": "investor",
                }
                investments_rows.append({
                    "funding_round_id": round_id,
                    "funded_object_id": company_id,
                    "investor_object_id": investor_id,
                })

        # Write CSVs
        self._write_csv(
            self.output_dir / "edgar_investments.csv", investments_rows
        )
        self._write_csv(
            self.output_dir / "edgar_rounds.csv", rounds_rows
        )
        self._write_csv(
            self.output_dir / "edgar_objects.csv", list(objects_set.values())
        )

        log.info(f"  edgar_objects.csv      : {len(objects_set)} entities")
        log.info(f"  edgar_rounds.csv       : {len(rounds_rows)} rounds")
        log.info(f"  edgar_investments.csv  : {len(investments_rows)} investments")

    @staticmethod
    def _map_industry_to_sector(industry: str) -> str:
        """Map EDGAR industry group to pipeline sector categories."""
        mapping = {
            "technology": "software",
            "biotechnology": "biotech",
            "health care": "health",
            "telecommunications": "software",
            "financial services": "finance",
            "commercial banking": "finance",
            "insurance": "finance",
            "energy": "cleantech",
            "real estate": "real_estate",
            "retailing": "ecommerce",
            "manufacturing": "hardware",
        }
        return mapping.get(industry.lower().strip(), "other")

    @staticmethod
    def _infer_round_type(amount_str: str) -> str:
        """Infer Series A/B from offering amount."""
        try:
            amount = float(str(amount_str).replace(",", "").replace("$", ""))
            if amount < 5_000_000:
                return "seed"
            elif amount < 25_000_000:
                return "series-a"
            elif amount < 100_000_000:
                return "series-b"
            else:
                return "series-c"
        except (ValueError, TypeError):
            return "series-a"  # default assumption for Form D

    @staticmethod
    def _clean_amount(val: str) -> str:
        """Clean currency string to numeric."""
        try:
            return str(float(str(val).replace(",", "").replace("$", "")))
        except (ValueError, TypeError):
            return ""

    # ── I/O helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _write_csv(path: Path, rows: list[dict]):
        """Write a list of dicts to CSV."""
        if not rows:
            log.warning(f"No data to write for {path}")
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)

    @staticmethod
    def _write_audit_hash(path: Path):
        """Write a SHA-256 hash of the output file for audit trail."""
        if not path.exists():
            return
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        hash_path = path.with_suffix(".sha256")
        hash_path.write_text(f"{h.hexdigest()}  {path.name}\n")
        log.info(f"Audit hash: {hash_path}")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SEC EDGAR Form D Scraper — VentureGraph Data Augmentation"
    )
    parser.add_argument(
        "--start-year", type=int, default=2010,
        help="First year to scrape (default: 2010)"
    )
    parser.add_argument(
        "--end-year", type=int, default=2024,
        help="Last year to scrape (default: 2024)"
    )
    parser.add_argument(
        "--output", type=str, default="data_augmented",
        help="Output directory (default: data_augmented/)"
    )
    parser.add_argument(
        "--max-filings", type=int, default=50_000,
        help="Maximum filings to fetch (default: 50,000)"
    )
    args = parser.parse_args()

    scraper = EdgarFormDScraper(
        start_year=args.start_year,
        end_year=args.end_year,
        output_dir=args.output,
        max_filings=args.max_filings,
    )
    scraper.run()


if __name__ == "__main__":
    main()
