"""
VentureGraph — Submission Package Builder
Converts every Markdown deliverable to PDF and bundles a clean ZIP.

Run once:    python build_submission.py
Output:      submission/VentureGraph_Submission_2026-05-12.zip
             submission/*.pdf  (individual PDFs for review)

Dashboard:   The interactive Part F dashboard is the Next.js app
             in venturegraph-web/. The ZIP includes the full source
             (node_modules excluded). Instructor launches via:
                 cd venturegraph-web && npm install && npm run dev
             -> http://localhost:3000
"""
from __future__ import annotations
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

import markdown as md
from xhtml2pdf import pisa

# Force UTF-8 stdout so the Unicode arrows we print don't crash on cp1252
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).parent
OUT  = ROOT / "submission"
OUT.mkdir(exist_ok=True)

# ── 1. Markdown deliverables we want as PDFs ────────────────────────────────
MD_DOCS = [
    ("REPORT.md",                "VentureGraph_REPORT.pdf",
     "VentureGraph 2.0 — C-DE422 Report"),
    ("methodology_appendix.md",  "VentureGraph_Methodology_Appendix.pdf",
     "VentureGraph — Methodology Appendix"),
    ("paper_abstract.md",        "VentureGraph_Paper_Abstract.pdf",
     "VentureGraph — SSRN Paper Abstract"),
    ("demo_script.md",           "VentureGraph_Demo_Script.pdf",
     "VentureGraph — Demo Script (10 min)"),
    ("qa_prep.md",               "VentureGraph_QA_Prep.pdf",
     "VentureGraph — Q&A Preparation"),
    ("handout.md",               "VentureGraph_Handout.pdf",
     "VentureGraph — One-Page Handout"),
    ("venturegraph_ssrn_paper.md", "VentureGraph_SSRN_Paper.pdf",
     "Smart Money Silence — SSRN Research Paper"),
    ("presentation_slides_detailed.md", "VentureGraph_Presentation.pdf",
     "VentureGraph — Presentation Slides"),
]

# Root-level files to include in the ZIP
SOURCE_FILES = [
    # Python pipeline (C-DE422 analysis)
    "graph_construction.py", "tps.py", "community_detection.py",
    "link_prediction.py", "sna_metrics.py", "centrality_comparison.py",
    "sms_engine.py", "preregistration.py", "expanding_window_tps.py",
    "panel_regression_final.py", "compute_ssi.py", "smoke_test.py",
    # Data augmentation pipeline (Innovation)
    "scraper_edgar.py", "scraper_magnitt.py", "scraper_companies_house.py",
    "scraper_bundesanzeiger.py", "entity_matcher.py", "run_augmented_pipeline.py",
    # Markdown originals
    "REPORT.md", "methodology_appendix.md", "paper_abstract.md",
    "demo_script.md", "qa_prep.md", "handout.md",
    "presentation_slides.md", "presentation_slides_detailed.md",
    "venturegraph_ssrn_paper.md",
    # Project meta
    "README.txt", "requirements.txt",
    # Pre-computed pipeline CSV outputs
    "tps_scores.csv", "sms_scores.csv", "sms_alpha_correlation.csv",
    "community_partition.csv", "community_summary.csv",
    "centrality_comparison.csv", "sector_alphas.csv", "edges.csv",
    "tps_panel_expanding.csv", "event_panel_sms.csv",
    "investment_sector_panel.csv", "sms_silence_events.csv",
    "ssi_events.csv", "sector_alphas_extended.csv", "link_predictions.csv",
    # Key visualisations
    "centrality_comparison.png", "community_graph.png",
    "community_profiles.png", "community_stage_mix.png",
    "tps_ranking.png", "tps_scatter.png",
    "link_prediction_top.png", "link_prediction_scatter.png",
    "link_prediction_distribution.png", "venturegraph_preview.png",
]

# Directories / suffixes to skip when bundling venturegraph-web
WEB_SKIP_DIRS     = {".git", "node_modules", ".next", ".turbo", "dist", "out"}
WEB_SKIP_SUFFIXES = {".tsbuildinfo"}


# ── 2. Markdown → PDF via xhtml2pdf ─────────────────────────────────────────
PDF_CSS = """
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
body  { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt;
        color: #1a1a1a; line-height: 1.45; }
h1    { color: #0d47a1; font-size: 22pt; border-bottom: 2px solid #0d47a1;
        padding-bottom: 6px; margin-top: 24px; }
h2    { color: #1565c0; font-size: 15pt; margin-top: 22px;
        border-bottom: 1px solid #cfd8dc; padding-bottom: 3px; }
h3    { color: #1976d2; font-size: 12.5pt; margin-top: 16px; }
h4    { color: #1976d2; font-size: 11pt; margin-top: 12px; }
code  { background: #f3f6f9; padding: 1px 5px; border-radius: 3px;
        font-family: 'Courier New', monospace; font-size: 9.5pt;
        color: #b71c1c; }
pre   { background: #f3f6f9; border-left: 3px solid #1976d2;
        padding: 8px 12px; font-family: 'Courier New', monospace;
        font-size: 9pt; white-space: pre-wrap; }
table { border-collapse: collapse; width: 100%; margin: 10px 0;
        font-size: 9.5pt; }
th    { background: #e3f2fd; color: #0d47a1; padding: 6px 10px;
        border: 1px solid #b0bec5; text-align: left; }
td    { padding: 5px 10px; border: 1px solid #cfd8dc; }
blockquote { border-left: 4px solid #f0883e; background: #fff8e8;
             padding: 6px 14px; margin: 10px 0; color: #6b5b1c; }
hr    { border: 0; border-top: 1px dashed #b0bec5; margin: 18px 0; }
.cover{ text-align: center; padding: 40px 0 60px 0;
        border-bottom: 3px solid #0d47a1; margin-bottom: 30px; }
.cover h1 { border: none; font-size: 28pt; color: #0d47a1; }
.cover .sub { color: #455a64; font-size: 12pt; margin-top: 8px; }
.cover .meta { color: #78909c; font-size: 9.5pt; margin-top: 18px;
               font-family: 'Courier New', monospace; }
img   { max-width: 100%; }
"""


def md_to_html(md_text: str, title: str) -> str:
    """Render markdown to a self-contained HTML document."""
    md_text = re.sub(r"^---\n.*?\n---\n", "", md_text, count=1, flags=re.S)
    body_html = md.markdown(
        md_text,
        extensions=["tables", "fenced_code", "toc", "sane_lists"],
    )
    cover = f"""
    <div class='cover'>
        <h1>{title}</h1>
        <div class='sub'>VentureGraph 2.0 · The FinTech Foundry Edition</div>
        <div class='meta'>
            C-DE422 · Big Data Engineering II · Egypt University of Informatics<br>
            Mohamed Hares · {datetime.now().strftime('%B %Y')}
        </div>
    </div>
    """
    return (f"<!doctype html><html><head><meta charset='utf-8'>"
            f"<title>{title}</title><style>{PDF_CSS}</style></head>"
            f"<body>{cover}{body_html}</body></html>")


def convert_md_to_pdf(md_path: Path, pdf_path: Path, title: str) -> bool:
    if not md_path.exists():
        print(f"  [skip] {md_path.name} not found")
        return False
    text = md_path.read_text(encoding="utf-8")
    html = md_to_html(text, title)
    # Save HTML alongside — fallback the instructor can print-to-PDF in browser
    html_path = pdf_path.with_suffix(".html")
    html_path.write_text(html, encoding="utf-8")
    with open(pdf_path, "wb") as fh:
        result = pisa.CreatePDF(html, dest=fh, encoding="utf-8")
    ok = not result.err
    size_kb = pdf_path.stat().st_size // 1024 if pdf_path.exists() else 0
    flag = "OK" if ok else "!!"
    print(f"  [{flag}] {md_path.name} -> {pdf_path.name}  ({size_kb} KB)")
    return ok


# ── 3. Marp slides → PDF + PPTX via npx ────────────────────────────────────
def convert_marp_slides() -> tuple[Path | None, Path | None]:
    src = ROOT / "presentation_slides.md"
    if not src.exists():
        print("  [skip] presentation_slides.md not found")
        return None, None

    pdf_out  = OUT / "VentureGraph_Slides.pdf"
    pptx_out = OUT / "VentureGraph_Slides.pptx"

    npx = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
    base_cmd = [npx, "--yes", "@marp-team/marp-cli@latest", str(src),
                "--allow-local-files"]

    print("  [..] Marp -> PDF (may take 30-90s on first run)")
    for flag, extra, out_path in [("--pdf", [], pdf_out), ("--pptx", [], pptx_out)]:
        try:
            r = subprocess.run(base_cmd + [flag, "-o", str(out_path)],
                               capture_output=True, text=True, timeout=300,
                               cwd=str(ROOT))
            if r.returncode == 0 and out_path.exists():
                print(f"  [OK] -> {out_path.name}  "
                      f"({out_path.stat().st_size // 1024} KB)")
            else:
                print(f"  [!!] Marp {flag} failed: {(r.stderr or r.stdout)[:300]}")
                out_path = None
        except Exception as e:
            print(f"  [!!] Marp {flag} crashed: {e}")
            out_path = None

    return pdf_out, pptx_out


# ── 4. Bundle venturegraph-web (Next.js Part F dashboard) ───────────────────
def bundle_web_dashboard(zf: zipfile.ZipFile) -> int:
    """
    Recursively add venturegraph-web/ to the ZIP, skipping node_modules,
    .next, and other build artefacts. Returns the number of files added.
    """
    web_root = ROOT / "venturegraph-web"
    if not web_root.exists():
        print("  [skip] venturegraph-web/ not found — dashboard not bundled")
        return 0

    n = 0
    for path in web_root.rglob("*"):
        if path.is_dir():
            continue
        parts = set(path.relative_to(web_root).parts)
        if parts & WEB_SKIP_DIRS:
            continue
        if path.suffix in WEB_SKIP_SUFFIXES:
            continue
        arc_name = "venturegraph-web/" + path.relative_to(web_root).as_posix()
        zf.write(path, arcname=arc_name)
        n += 1

    print(f"  [OK] venturegraph-web/ -> {n} files bundled (node_modules excluded)")
    return n


# ── 5. Build the ZIP ─────────────────────────────────────────────────────────
SUBMISSION_DATE = "2026-05-12"


def collect_existing_pdfs() -> list[Path]:
    """Return any already-built PDFs from submission/ as fallback."""
    return [p for p in OUT.glob("*.pdf") if p.exists() and p.stat().st_size > 5000]


def build_zip(extra_pdfs: list[Path]) -> Path:
    zip_path = OUT / f"VentureGraph_Submission_{SUBMISSION_DATE}.zip"
    if zip_path.exists():
        zip_path.unlink()

    written: list[str] = []
    skipped: list[str] = []
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Root-level source files
        for fname in SOURCE_FILES:
            p = ROOT / fname
            if p.exists():
                zf.write(p, arcname=fname)
                written.append(fname)
            else:
                skipped.append(fname)

        # PDFs inside /pdf/
        for pdf in extra_pdfs:
            if pdf and Path(pdf).exists():
                zf.write(pdf, arcname=f"pdf/{Path(pdf).name}")
                written.append(f"pdf/{Path(pdf).name}")

        # Protocol seal (if generated)
        seal = ROOT / "protocol_seal.json"
        if seal.exists():
            zf.write(seal, arcname="protocol_seal.json")
            written.append("protocol_seal.json")

        # Data augmentation outputs (data_augmented/)
        aug_dir = ROOT / "data_augmented"
        n_aug = 0
        if aug_dir.exists():
            for p in aug_dir.iterdir():
                if p.is_file() and p.suffix in {".csv", ".json", ".sha256"}:
                    zf.write(p, arcname=f"data_augmented/{p.name}")
                    written.append(f"data_augmented/{p.name}")
                    n_aug += 1
            print(f"  [OK] data_augmented/ -> {n_aug} files bundled")

        # Next.js dashboard (Part F) — venturegraph-web/
        n_web = bundle_web_dashboard(zf)

    print("\n  -- ZIP CONTENTS --")
    for w in written:
        print(f"    + {w}")
    if n_web:
        print(f"    + venturegraph-web/ ({n_web} source files, node_modules excluded)")
    if skipped:
        print("  -- SKIPPED (not present in repo) --")
        for s in skipped:
            print(f"    - {s}")
    print(f"\n  ZIP path : {zip_path}")
    print(f"  ZIP size : {zip_path.stat().st_size // 1024} KB")
    return zip_path


# ── 6. Main ──────────────────────────────────────────────────────────────────
def main() -> int:
    print("=" * 70)
    print("VENTUREGRAPH -- SUBMISSION PACKAGE BUILDER")
    print("=" * 70)
    print(f"Output dir: {OUT}\n")

    print("STEP 1 -- Markdown -> PDF")
    print("-" * 70)
    pdfs: list[Path] = []
    for md_name, pdf_name, title in MD_DOCS:
        pdf_path = OUT / pdf_name
        if convert_md_to_pdf(ROOT / md_name, pdf_path, title):
            pdfs.append(pdf_path)

    print("\nSTEP 2 -- Marp slides -> PDF + PPTX")
    print("-" * 70)
    slides_pdf, slides_pptx = convert_marp_slides()
    if slides_pdf:  pdfs.append(slides_pdf)
    if slides_pptx: pdfs.append(slides_pptx)

    # If PDF conversion produced nothing, fall back to already-built PDFs
    if not pdfs:
        print("  [..] No new PDFs — using pre-existing PDFs from submission/")
        pdfs = collect_existing_pdfs()
        for p in pdfs:
            print(f"  [FB] {p.name}")

    print("\nSTEP 3 -- Bundle ZIP (includes venturegraph-web/ dashboard)")
    print("-" * 70)
    zip_path = build_zip(pdfs)

    print("\n" + "=" * 70)
    print("BUILD COMPLETE")
    print(f"  PDFs : {sum(1 for p in pdfs if Path(p).suffix == '.pdf')} files")
    print(f"  PPTX : {sum(1 for p in pdfs if Path(p).suffix == '.pptx')} files")
    print(f"  ZIP  : {zip_path.name}")
    print("  Launch the dashboard after extracting the ZIP:")
    print("    cd venturegraph-web && npm install && npm run dev")
    print("    -> http://localhost:3000  (default Next.js port)")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
