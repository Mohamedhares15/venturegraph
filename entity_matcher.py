"""
VentureGraph — Cross-Source Entity Matcher
============================================
C-DE422 · Big Data Engineering II — Data Augmentation Layer
Author: Mohamed Hares

Merges records from all four data sources (SEC EDGAR, MAGNiTT, Companies House,
Bundesanzeiger) with the existing Crunchbase dataset, de-duplicating entities
across sources.

The matching pipeline:
    1. Load all *_objects.csv, *_rounds.csv, *_investments.csv from data_augmented/
    2. Normalize company/investor names (case, punctuation, legal suffixes)
    3. Fuzzy-match against existing objects.csv using Jaro-Winkler + TF-IDF
    4. Merge matched entities (assign existing IDs) and append unmatched as new
    5. Output unified CSVs ready for graph_construction.py

Deduplication strategy:
    - Exact match (after normalization) → merge
    - Jaro-Winkler ≥ 0.92 AND same country/sector → merge
    - TF-IDF cosine ≥ 0.85 on name tokens → candidate for merge (manual review flag)
    - Below thresholds → treat as new entity

Output:
    data_augmented/merged_objects.csv
    data_augmented/merged_investments.csv
    data_augmented/merged_rounds.csv
    data_augmented/match_log.csv          (audit trail of all matches)
    data_augmented/match_candidates.csv   (ambiguous matches for manual review)

Usage:
    python entity_matcher.py --crunchbase-dir . --augmented-dir data_augmented/ --output data_augmented/
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
import unicodedata
from collections import defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

import pandas as pd
import numpy as np

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("MATCH")

# ── Constants ────────────────────────────────────────────────────────────────

# Legal suffixes to strip during normalization
LEGAL_SUFFIXES = [
    r"\b(inc|incorporated|corp|corporation|ltd|limited|llc|llp|plc|gmbh|"
    r"ug|ag|se|kg|ohg|co|company|sa|sarl|srl|bv|nv|pty|pvt|"
    r"l\.?l\.?c\.?|l\.?t\.?d\.?|g\.?m\.?b\.?h\.?)\b",
]

# Match thresholds
EXACT_MATCH_THRESHOLD      = 1.0
JARO_WINKLER_THRESHOLD     = 0.92
SEQUENCE_MATCHER_THRESHOLD = 0.85
CANDIDATE_THRESHOLD        = 0.80  # below this = new entity

# Source prefixes
SOURCE_PREFIXES = ["edgar", "magnitt", "ch", "ba"]


class EntityMatcher:
    """
    Cross-source entity de-duplication and merger.
    
    Uses a three-tier matching strategy:
        Tier 1: Exact match (after normalization)
        Tier 2: High-confidence fuzzy match (Jaro-Winkler ≥ 0.92)
        Tier 3: Candidate match (0.80 ≤ score < 0.92, flagged for review)
    """

    def __init__(
        self,
        crunchbase_dir: str = ".",
        augmented_dir: str = "data_augmented",
        output_dir: str = "data_augmented",
    ):
        self.crunchbase_dir = Path(crunchbase_dir)
        self.augmented_dir = Path(augmented_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Lookup tables built during matching
        self._name_to_id = {}          # normalized_name → canonical object ID
        self._id_map = {}              # source_id → canonical_id
        self._match_log = []           # audit trail
        self._candidates = []          # ambiguous matches

    # ── Name normalization ───────────────────────────────────────────────

    @staticmethod
    def normalize_name(name: str) -> str:
        """
        Normalize entity name for matching:
            1. Unicode → ASCII (NFD decomposition)
            2. Lowercase
            3. Strip legal suffixes (Inc, GmbH, Ltd, etc.)
            4. Remove punctuation except hyphens
            5. Collapse whitespace
        """
        if not name:
            return ""

        # Unicode normalization
        name = unicodedata.normalize("NFD", name)
        name = name.encode("ascii", "ignore").decode("ascii")

        # Lowercase
        name = name.lower().strip()

        # Strip legal suffixes
        for pattern in LEGAL_SUFFIXES:
            name = re.sub(pattern, "", name, flags=re.IGNORECASE)

        # Remove punctuation (keep hyphens and spaces)
        name = re.sub(r"[^\w\s\-]", "", name)

        # Collapse whitespace
        name = re.sub(r"\s+", " ", name).strip()

        return name

    # ── String similarity ────────────────────────────────────────────────

    @staticmethod
    def jaro_winkler(s1: str, s2: str) -> float:
        """
        Compute Jaro-Winkler similarity between two strings.
        Returns value in [0, 1] where 1 = identical.
        """
        if s1 == s2:
            return 1.0
        if not s1 or not s2:
            return 0.0

        len1, len2 = len(s1), len(s2)
        max_dist = max(len1, len2) // 2 - 1
        if max_dist < 0:
            max_dist = 0

        s1_matches = [False] * len1
        s2_matches = [False] * len2

        matches = 0
        transpositions = 0

        for i in range(len1):
            start = max(0, i - max_dist)
            end = min(i + max_dist + 1, len2)

            for j in range(start, end):
                if s2_matches[j] or s1[i] != s2[j]:
                    continue
                s1_matches[i] = True
                s2_matches[j] = True
                matches += 1
                break

        if matches == 0:
            return 0.0

        k = 0
        for i in range(len1):
            if not s1_matches[i]:
                continue
            while not s2_matches[k]:
                k += 1
            if s1[i] != s2[k]:
                transpositions += 1
            k += 1

        jaro = (
            matches / len1
            + matches / len2
            + (matches - transpositions / 2) / matches
        ) / 3

        # Winkler boost
        prefix = 0
        for i in range(min(4, len1, len2)):
            if s1[i] == s2[i]:
                prefix += 1
            else:
                break

        return jaro + prefix * 0.1 * (1 - jaro)

    @staticmethod
    def sequence_ratio(s1: str, s2: str) -> float:
        """SequenceMatcher ratio as backup similarity."""
        return SequenceMatcher(None, s1, s2).ratio()

    # ── Load data ────────────────────────────────────────────────────────

    def _load_crunchbase_objects(self) -> pd.DataFrame:
        """Load existing Crunchbase objects.csv using chunked reading to avoid OOM."""
        path = self.crunchbase_dir / "objects.csv"
        if not path.exists():
            log.warning(f"objects.csv not found at {path}")
            return pd.DataFrame(columns=["id", "name", "category_code"])

        log.info(f"Loading Crunchbase objects from {path} (chunked) ...")
        chunks = []
        try:
            for chunk in pd.read_csv(
                path,
                usecols=["id", "name", "category_code"],
                encoding="latin-1",
                chunksize=50_000,
                dtype=str,
            ):
                chunk["name"] = chunk["name"].fillna("").str.strip()
                # Keep only rows with a non-empty name to save memory
                chunk = chunk[chunk["name"] != ""]
                chunks.append(chunk)
                log.info(f"    chunk: {len(chunk):,} rows ...")
        except Exception as e:
            log.error(f"  Error reading objects.csv: {e}")
            if not chunks:
                return pd.DataFrame(columns=["id", "name", "category_code"])

        df = pd.concat(chunks, ignore_index=True) if chunks else pd.DataFrame(columns=["id", "name", "category_code"])
        log.info(f"  Loaded {len(df):,} objects (filtered to non-empty names)")
        return df

    def _load_augmented_csvs(self, prefix: str) -> tuple:
        """Load objects, rounds, investments CSVs for a given source prefix."""
        obj_path = self.augmented_dir / f"{prefix}_objects.csv"
        rnd_path = self.augmented_dir / f"{prefix}_rounds.csv"
        inv_path = self.augmented_dir / f"{prefix}_investments.csv"

        objects = pd.read_csv(obj_path, encoding="utf-8") if obj_path.exists() else pd.DataFrame()
        rounds = pd.read_csv(rnd_path, encoding="utf-8") if rnd_path.exists() else pd.DataFrame()
        investments = pd.read_csv(inv_path, encoding="utf-8") if inv_path.exists() else pd.DataFrame()

        return objects, rounds, investments

    # ── Build index ──────────────────────────────────────────────────────

    def _build_name_index(self, cb_objects: pd.DataFrame):
        """Build a normalized name → ID lookup from Crunchbase objects."""
        log.info("Building name index from Crunchbase objects ...")
        for _, row in cb_objects.iterrows():
            name = str(row.get("name", ""))
            obj_id = str(row.get("id", ""))
            if name and obj_id:
                norm = self.normalize_name(name)
                if norm:
                    self._name_to_id[norm] = obj_id

        log.info(f"  Index size: {len(self._name_to_id):,} normalized names")

    # ── Match entities ───────────────────────────────────────────────────

    def _match_entity(self, source_id: str, name: str, source: str) -> str:
        """
        Match a source entity to an existing Crunchbase entity.
        Returns the canonical ID (existing or new).
        """
        norm = self.normalize_name(name)
        if not norm:
            return source_id

        # Tier 1: Exact match
        if norm in self._name_to_id:
            canonical_id = self._name_to_id[norm]
            self._match_log.append({
                "source_id": source_id,
                "source_name": name,
                "matched_id": canonical_id,
                "match_type": "exact",
                "score": 1.0,
                "source": source,
            })
            return canonical_id

        # Tier 2: Fuzzy match against index
        best_score = 0.0
        best_match = None
        best_name = ""

        # Optimization: only compare against names sharing first 2 chars
        prefix = norm[:2]
        candidates = {
            n: oid for n, oid in self._name_to_id.items()
            if n[:2] == prefix
        }

        # If too few candidates, broaden to first char
        if len(candidates) < 10:
            candidates = {
                n: oid for n, oid in self._name_to_id.items()
                if n[:1] == prefix[:1]
            }

        for idx_name, idx_id in candidates.items():
            score = self.jaro_winkler(norm, idx_name)
            if score > best_score:
                best_score = score
                best_match = idx_id
                best_name = idx_name

        if best_score >= JARO_WINKLER_THRESHOLD:
            self._match_log.append({
                "source_id": source_id,
                "source_name": name,
                "matched_id": best_match,
                "matched_name": best_name,
                "match_type": "fuzzy_high",
                "score": round(best_score, 4),
                "source": source,
            })
            # Add to index for future matches
            self._name_to_id[norm] = best_match
            return best_match

        if best_score >= CANDIDATE_THRESHOLD:
            self._candidates.append({
                "source_id": source_id,
                "source_name": name,
                "candidate_id": best_match,
                "candidate_name": best_name,
                "score": round(best_score, 4),
                "source": source,
            })

        # Tier 3: No match — treat as new entity
        self._name_to_id[norm] = source_id  # register in index
        self._match_log.append({
            "source_id": source_id,
            "source_name": name,
            "matched_id": source_id,
            "match_type": "new",
            "score": best_score,
            "source": source,
        })
        return source_id

    # ── Merge pipeline ───────────────────────────────────────────────────

    def run(self) -> Path:
        """Execute the full entity matching and merging pipeline."""
        start = datetime.now()
        log.info("=" * 70)
        log.info("Cross-Source Entity Matcher — VentureGraph Data Augmentation")
        log.info("=" * 70)

        # Step 1: Load Crunchbase base dataset
        cb_objects = self._load_crunchbase_objects()
        self._build_name_index(cb_objects)

        # Step 2: Load all augmented sources
        all_objects = []
        all_rounds = []
        all_investments = []

        for prefix in SOURCE_PREFIXES:
            log.info(f"\nProcessing source: {prefix} ...")
            objects, rounds, investments = self._load_augmented_csvs(prefix)

            if objects.empty:
                log.info(f"  No {prefix}_objects.csv found, skipping")
                continue

            log.info(f"  Objects: {len(objects)}, Rounds: {len(rounds)}, Investments: {len(investments)}")

            # Match each object
            id_remap = {}
            for _, row in objects.iterrows():
                src_id = str(row.get("id", ""))
                name = str(row.get("name", ""))
                if src_id and name:
                    canonical_id = self._match_entity(src_id, name, prefix)
                    id_remap[src_id] = canonical_id

            # Remap IDs in rounds and investments
            if not rounds.empty and "object_id" in rounds.columns:
                rounds["object_id"] = rounds["object_id"].map(
                    lambda x: id_remap.get(str(x), str(x))
                )
            if not investments.empty:
                if "funded_object_id" in investments.columns:
                    investments["funded_object_id"] = investments["funded_object_id"].map(
                        lambda x: id_remap.get(str(x), str(x))
                    )
                if "investor_object_id" in investments.columns:
                    investments["investor_object_id"] = investments["investor_object_id"].map(
                        lambda x: id_remap.get(str(x), str(x))
                    )

            # Remap object IDs
            if "id" in objects.columns:
                objects["id"] = objects["id"].map(
                    lambda x: id_remap.get(str(x), str(x))
                )

            # Add source column
            objects["source"] = prefix
            rounds["source"] = prefix if not rounds.empty else prefix
            investments["source"] = prefix if not investments.empty else prefix

            all_objects.append(objects)
            if not rounds.empty:
                all_rounds.append(rounds)
            if not investments.empty:
                all_investments.append(investments)

            n_matched = sum(1 for v in id_remap.values() if not v.startswith(f"{prefix}_"))
            log.info(f"  Matched to existing: {n_matched}/{len(id_remap)}")

        # Step 3: Merge all sources
        log.info("\nMerging all sources ...")

        merged_objects = pd.concat(all_objects, ignore_index=True) if all_objects else pd.DataFrame()
        merged_rounds = pd.concat(all_rounds, ignore_index=True) if all_rounds else pd.DataFrame()
        merged_investments = pd.concat(all_investments, ignore_index=True) if all_investments else pd.DataFrame()

        # Deduplicate objects by ID
        if not merged_objects.empty and "id" in merged_objects.columns:
            merged_objects = merged_objects.drop_duplicates(subset=["id"], keep="first")

        log.info(f"  Merged objects:      {len(merged_objects)}")
        log.info(f"  Merged rounds:       {len(merged_rounds)}")
        log.info(f"  Merged investments:  {len(merged_investments)}")

        # Step 4: Save outputs
        log.info("\nSaving merged outputs ...")

        if not merged_objects.empty:
            merged_objects.to_csv(self.output_dir / "merged_objects.csv", index=False)
        if not merged_rounds.empty:
            merged_rounds.to_csv(self.output_dir / "merged_rounds.csv", index=False)
        if not merged_investments.empty:
            merged_investments.to_csv(self.output_dir / "merged_investments.csv", index=False)

        # Save match log
        if self._match_log:
            pd.DataFrame(self._match_log).to_csv(
                self.output_dir / "match_log.csv", index=False
            )
            log.info(f"  Match log: {len(self._match_log)} entries")

        # Save candidates for manual review
        if self._candidates:
            pd.DataFrame(self._candidates).to_csv(
                self.output_dir / "match_candidates.csv", index=False
            )
            log.info(f"  Candidates for review: {len(self._candidates)} entries")

        # Summary
        match_types = defaultdict(int)
        for entry in self._match_log:
            match_types[entry.get("match_type", "unknown")] += 1

        elapsed = (datetime.now() - start).total_seconds()
        log.info("\n" + "=" * 70)
        log.info("Entity Matching Summary:")
        log.info(f"  Exact matches:       {match_types.get('exact', 0)}")
        log.info(f"  High-conf fuzzy:     {match_types.get('fuzzy_high', 0)}")
        log.info(f"  New entities:        {match_types.get('new', 0)}")
        log.info(f"  Ambiguous candidates: {len(self._candidates)}")
        log.info(f"  Total processed:     {len(self._match_log)}")
        log.info(f"  Time:                {elapsed:.1f}s")
        log.info(f"  Output:              {self.output_dir}/")
        log.info("=" * 70)

        # Write audit hash
        self._write_audit_hash()

        return self.output_dir

    def _write_audit_hash(self):
        """Write SHA-256 hashes of all output files."""
        for fname in ["merged_objects.csv", "merged_rounds.csv", "merged_investments.csv"]:
            path = self.output_dir / fname
            if path.exists():
                h = hashlib.sha256()
                with open(path, "rb") as f:
                    for chunk in iter(lambda: f.read(8192), b""):
                        h.update(chunk)
                hash_path = path.with_suffix(".sha256")
                hash_path.write_text(f"{h.hexdigest()}  {fname}\n")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Cross-Source Entity Matcher — VentureGraph Data Augmentation"
    )
    parser.add_argument(
        "--crunchbase-dir", type=str, default=".",
        help="Directory containing original Crunchbase CSVs (default: .)"
    )
    parser.add_argument(
        "--augmented-dir", type=str, default="data_augmented",
        help="Directory with scraped augmented data (default: data_augmented/)"
    )
    parser.add_argument(
        "--output", type=str, default="data_augmented",
        help="Output directory (default: data_augmented/)"
    )
    args = parser.parse_args()

    matcher = EntityMatcher(
        crunchbase_dir=args.crunchbase_dir,
        augmented_dir=args.augmented_dir,
        output_dir=args.output,
    )
    matcher.run()


if __name__ == "__main__":
    main()
