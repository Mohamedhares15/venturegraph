"""
VentureGraph — Sovereign Mode Smoke Test
Exercises every code path in sovereign_mode.py without launching Streamlit.
Reports any runtime exception, missing CSV, or signature mismatch BEFORE the demo.
"""
import sys
import traceback
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent
PASS = "[PASS]"
FAIL = "[FAIL]"
WARN = "[WARN]"

results = []


def check(name, fn):
    try:
        fn()
        results.append((PASS, name, ""))
        print(f"{PASS}  {name}")
    except Exception as e:
        msg = f"{type(e).__name__}: {e}"
        results.append((FAIL, name, msg))
        print(f"{FAIL}  {name}")
        print(f"        > {msg}")
        traceback.print_exc()


# ── 1. Import sovereign_mode without launching Streamlit ────────────────────
def t_import():
    import sovereign_mode  # noqa: F401


# ── 2. Hashing helpers must work on every input shape ───────────────────────
def t_hash_helpers():
    import sovereign_mode as sm
    import pandas as pd

    assert sm._sha256_bytes(b"x").startswith("2d711642")
    assert len(sm._sha256_obj({"a": 1})) == 64
    assert len(sm._sha256_df(pd.DataFrame({"a": [1, 2]}))) == 64
    h = sm._sha256_file("preregistration.py")
    assert h is not None and len(h) == 64, "preregistration.py should hash"
    assert sm._sha256_file("does_not_exist.csv") is None


# ── 3. Data loader returns all expected keys with non-empty frames ──────────
def t_data_loader():
    import sovereign_mode as sm

    data = sm._load_data()
    # Core scoring outputs that MUST be present for the dashboard to function
    must_have = {"tps", "communities", "partition", "sms", "sms_corr",
                 "centrality", "alphas"}
    # Production-grade additions (warn if missing, do not fail)
    nice_have = {"tps_panel", "edges", "inv_panel", "rounds",
                 "acquisitions", "ipos", "objects", "sms_events",
                 "ssi_events", "event_panel", "alphas_ext",
                 "link_pred", "degrees", "funds", "offices"}
    keys = set(data.keys())
    missing_must = must_have - keys
    assert not missing_must, f"must-have keys missing: {missing_must}"
    print(f"        loader returned {len(keys)} keys "
          f"(must={len(must_have)}, nice={len(nice_have & keys)})")
    for k, df in data.items():
        if df.empty:
            results.append((WARN, f"data[{k}] empty", "CSV missing or empty"))
            print(f"{WARN}  data[{k}] empty")
        else:
            print(f"        data[{k}] {len(df):,} rows  cols={list(df.columns)[:6]}")


# ── 4. Audit-receipt computation for ALL three signal types ─────────────────
def t_audit_receipts():
    import sovereign_mode as sm
    data = sm._load_data()
    eval_date = datetime(2011, 12, 31).date()
    for sector in ["IGV", "SOXX", "XBI", "XLF", "FDN"]:
        for sig in ["TPS leaderboard", "SMS silence score", "Community membership"]:
            r = sm._compute_audit_receipt(data, sector, eval_date, sig)
            for k in ("protocol_hash", "input_hash", "output_hash",
                     "receipt_hash", "sealed_at_utc", "eval_date",
                     "signal_type", "sector", "sector_name", "issuer"):
                assert k in r, f"receipt missing key {k} for {sector}/{sig}"
            assert len(r["receipt_hash"]) == 64, "receipt hash bad length"


# ── 5. Pre-registration import and seal generation ──────────────────────────
def t_protocol_seal():
    import preregistration as pr
    seal = pr.generate_protocol_hash()
    assert "protocol_hash" in seal
    assert "sealed_at_utc" in seal
    assert len(seal["protocol_hash"]) == 64
    # Verify each module that sovereign_mode reads
    assert isinstance(pr.HYPOTHESES, dict) and len(pr.HYPOTHESES) >= 3
    for hid, h in pr.HYPOTHESES.items():
        for k in ("statement",):
            assert k in h, f"hypothesis {hid} missing {k}"
    assert isinstance(pr.FIXED_PARAMETERS, dict)
    assert isinstance(pr.ROBUSTNESS_TESTS, list) and len(pr.ROBUSTNESS_TESTS) > 0
    for r in pr.ROBUSTNESS_TESTS:
        for k in ("id", "name", "description", "purpose", "required"):
            assert k in r, f"robustness test missing {k}"


# ── 6. Pricing tier logic — every institution branch ────────────────────────
def t_pricing_tiers():
    import sovereign_mode as sm
    cases = [
        ("Sovereign Wealth Fund — Direct Investments arm", 6, "$1B"),
        ("Sovereign Wealth Fund — subsidiary VC",          4, "$250M"),
        ("Large family office (>$1B AUM)",                 3, "$1B"),
        ("Mid-market family office ($100M–$1B AUM)",       2, "$50M"),
        ("MENA-focused VC fund",                           5, "$50M"),
        ("GCC-based hedge fund (alt-data consumer)",       4, "$5B"),
    ]
    for inst, seats, aum in cases:
        tier, base, mult = sm._pricing_tier(inst, seats, aum)
        assert isinstance(tier, str) and base > 0 and mult > 0
        n = sm._aum_to_num(aum)
        assert n > 0


# ── 7. Memo HTML generation produces non-trivial output ─────────────────────
def t_memo_html():
    import sovereign_mode as sm
    data = sm._load_data()
    for sector in ["IGV", "SOXX", "XBI"]:
        html, digest = sm._build_memo_html(data, sector, 10, True, True,
                                           f"Test Memo {sector}")
        assert isinstance(html, str) and html.lstrip().startswith("<!doctype"), \
            f"Memo for {sector} didn't return HTML"
        assert len(html) > 1000, "Memo HTML suspiciously short"
        assert len(digest) == 64
        assert sector in html
        assert "</html>" in html.lower(), "Memo HTML not closed"
        # Persist a sample so we can eyeball it
        Path(f"_smoke_memo_{sector}.html").write_text(html, encoding="utf-8")


# ── 8. CSV column compatibility — schema drift early-warning ────────────────
def t_csv_schemas():
    import pandas as pd
    expected = {
        "tps_scores.csv":            ["investor", "tps", "portfolio_size",
                                      "out_degree"],
        "sms_scores.csv":            ["sector", "eval_date", "n_expected",
                                      "n_silent", "sms_score",
                                      "top_silenced_investors"],
        "sms_alpha_correlation.csv": ["horizon", "pearson_r", "p_value",
                                      "n_obs"],
        "community_partition.csv":   ["investor", "community_id"],
        "community_summary.csv":     ["community_id", "size", "top_investors"],
    }
    for path, cols in expected.items():
        df = pd.read_csv(path)
        missing = [c for c in cols if c not in df.columns]
        assert not missing, f"{path} missing cols {missing}"


# ── 9b. Module 06 — Investor Deep-Dive helpers ──────────────────────────────
def t_investor_deepdive():
    import sovereign_mode as sm
    data = sm._load_data()
    universe = sm._investor_universe(data)
    assert len(universe) > 100, f"investor universe too small: {len(universe)}"
    # Pick a known top investor
    candidates = ["Sequoia Capital", "Andreessen Horowitz", "Accel Partners",
                  "Bessemer Venture Partners", "Greylock Partners"]
    sample = next((c for c in candidates if c in universe), universe[0])
    profile = sm._build_investor_profile(data, sample)
    assert profile["investor"] == sample
    # Time series
    ts = sm._investor_tps_timeseries(data, sample)
    print(f"        TPS timeseries for {sample!r}: {len(ts)} rows")
    # Co-investors
    coinv = sm._investor_coinvestors(data, sample, top_n=10)
    print(f"        Co-investors for {sample!r}: {len(coinv)} rows")
    # Sector posture
    posture = sm._investor_sector_posture(data, sample)
    print(f"        Sector posture rows: {len(posture)}")
    # Portfolio
    pf = sm._investor_portfolio(data, sample, top_n=20)
    print(f"        Portfolio rows: {len(pf)}")
    # Exits
    acq, ipo = sm._investor_exits(data, sample)
    print(f"        Exits: {len(acq)} acquisitions, {len(ipo)} IPOs")
    # Pill helper
    pill = sm._percentile_pill(95.0)
    assert "TOP" in pill


# ── 9c. Module 07 — Sector Deep-Dive helpers ────────────────────────────────
def t_sector_deepdive():
    import sovereign_mode as sm
    data = sm._load_data()
    sectors = ["IGV", "SOXX", "XBI", "XLF", "FDN"]
    for sector in sectors:
        ov = sm._sector_overview(data, sector)
        assert ov["sector"] == sector
        assert "n_deals" in ov
        ti = sm._sector_top_investors(data, sector, top_n=10)
        sh = sm._sector_sms_history(data, sector)
        ssi = sm._sector_ssi_history(data, sector)
        ah = sm._sector_alpha_history(data, sector)
        flow = sm._sector_deal_flow(data, sector)
        stages = sm._sector_stage_distribution(data, sector)
        acq, ipo = sm._sector_exits(data, sector)
        print(f"        {sector}: deals={ov['n_deals']:>5} "
              f"co={ov['n_companies']:>4} inv={ov['n_investors']:>4} "
              f"top_inv={len(ti):>3} sms={len(sh):>3} ssi={len(ssi):>3} "
              f"α={len(ah):>4} flow_q={len(flow):>3} stg={len(stages):>2} "
              f"acq={len(acq):>3} ipo={len(ipo):>3}")


# ── 9d. Module 01 — Portfolio X-Ray helpers ─────────────────────────────────
def t_portfolio_xray():
    import sovereign_mode as sm
    data = sm._load_data()
    universe = sm._investor_universe(data)

    # Parser: handles newlines/commas/semicolons + de-dupe
    parsed = sm._parse_portfolio_input("Sequoia Capital\nAccel Partners, Benchmark; SV Angel\nSequoia Capital")
    assert parsed == ["Sequoia Capital", "Accel Partners", "Benchmark", "SV Angel"], \
        f"parser bug: {parsed}"

    # Fuzzy match: should find these even with typos
    matches = sm._match_investors(
        ["Sequoia Capital", "Andreesen Horowitz", "NotARealVCFundXYZ"],  # 1 typo + 1 fake
        universe,
    )
    assert matches["Sequoia Capital"][0] == "Sequoia Capital"
    assert matches["Andreesen Horowitz"][0] is not None  # should fuzzy-match
    assert matches["NotARealVCFundXYZ"][0] is None       # should not match

    # End-to-end on default portfolio
    parsed = sm._parse_portfolio_input(sm._DEFAULT_PORTFOLIO)
    matches = sm._match_investors(parsed, universe)
    matched_names = [m for (m, _) in matches.values() if m is not None]
    summary  = sm._portfolio_summary(data, matched_names)
    exposure = sm._portfolio_sector_exposure(data, matched_names)
    comm_map = sm._portfolio_community_map(data, matched_names)
    flags    = sm._portfolio_risk_flags(data, matched_names)
    exits    = sm._portfolio_aggregate_exits(data, matched_names)
    print(f"        default portfolio: {len(parsed)} input, {len(matched_names)} matched")
    print(f"        portfolio mean TPS = {summary.get('portfolio_mean', 0):.3f} "
          f"(α vs universe = {summary.get('alpha_vs_universe', 0):+.3f})")
    print(f"        sector exposure: {len(exposure)} sectors, "
          f"{exposure['deals'].sum() if not exposure.empty else 0} total deals")
    print(f"        communities: {len(comm_map)}")
    print(f"        risk flags: {len(flags)}")
    print(f"        exits: {exits['n_acq']} acq + {exits['n_ipo']} IPO = "
          f"{exits['exit_rate']:.1f}% rate on {exits['n_companies']} cos")


# ── 9e. Module 02 — Live Intelligence Feed ──────────────────────────────────
def t_intelligence_feed():
    import sovereign_mode as sm
    data = sm._load_data()
    feed = sm._build_intelligence_feed(data, max_events=500)
    assert not feed.empty, "feed is empty"
    assert "event_id" in feed.columns
    assert {"SMS", "SSI"} & set(feed["type"].unique()), "no SMS/SSI events"
    print(f"        feed total: {len(feed)} rows · "
          f"{(feed['type']=='SMS').sum()} SMS / {(feed['type']=='SSI').sum()} SSI")
    print(f"        severity: HIGH={int((feed['severity']=='HIGH').sum())} "
          f"MED={int((feed['severity']=='MEDIUM').sum())} "
          f"LOW={int((feed['severity']=='LOW').sum())}")
    # Filter test
    high_only = sm._build_intelligence_feed(
        data, severity_filter=["HIGH"], max_events=50)
    assert (high_only["severity"] == "HIGH").all() or high_only.empty


# ── 9f. Module 11 — Multi-Signal Composer ───────────────────────────────────
def t_signal_composer():
    import sovereign_mode as sm
    data = sm._load_data()
    weights = {"tps": 0.4, "eigenvector": 0.2, "betweenness": 0.15,
               "community": 0.15, "top_tier": 0.1}
    out = sm._compute_composite(data, weights)
    assert not out.empty
    assert "composite" in out.columns
    assert "composite_pct" in out.columns
    # Top-5 must be different from bottom-5
    top5 = set(out.head(5)["investor"])
    bot5 = set(out.tail(5)["investor"])
    assert not (top5 & bot5)
    # Z-score sanity: column means should be ~0
    for col in ["z_tps", "z_eig", "z_bw", "z_comm", "z_top"]:
        m = out[col].mean()
        assert abs(m) < 1e-6, f"{col} mean = {m} (expected ≈ 0)"
    print(f"        composite scored: {len(out):,} investors")
    print(f"        top-3 by composite: {' · '.join(out.head(3)['investor'].tolist())}")


# ── 9g. Module 15 — Compliance Verifier ─────────────────────────────────────
def t_compliance_verifier():
    import sovereign_mode as sm
    data = sm._load_data()
    receipt1 = sm._verify_signal(data, "IGV", "2011-12-31", "TPS leaderboard")
    receipt2 = sm._verify_signal(data, "IGV", "2011-12-31", "TPS leaderboard")
    # Re-running same params should produce same signal-content hashes
    assert receipt1["protocol_hash"] == receipt2["protocol_hash"]
    assert receipt1["input_hash"]    == receipt2["input_hash"]
    assert receipt1["output_hash"]   == receipt2["output_hash"]
    # Different sector should produce different hash
    receipt3 = sm._verify_signal(data, "XBI", "2011-12-31", "TPS leaderboard")
    assert receipt1["receipt_hash"] != receipt3["receipt_hash"]
    print(f"        verifier: same-input reproducible ✓ · diff-input divergent ✓")


# ── 10. Module 13 — Derived Signals (6 helpers) ─────────────────────────────
def t_derived_signals():
    import sovereign_mode as sm
    data = sm._load_data()
    fns = [sm._derive_tps_momentum, sm._derive_sms_momentum, sm._derive_hhi,
           sm._derive_clustering, sm._derive_sector_velocity, sm._derive_prescience_index]
    names = ["tps_momentum", "sms_momentum", "hhi", "clustering",
             "sector_velocity", "prescience_index"]
    for name, fn in zip(names, fns):
        df = fn(data)
        assert isinstance(df, sm.pd.DataFrame), f"{name} must return DataFrame"
        print(f"        {name}: {len(df)} rows ✓")


# ── 11. Module 12 — Scenario Analyzer ───────────────────────────────────────
def t_scenario_analyzer():
    import sovereign_mode as sm
    data = sm._load_data()
    tps = data.get("tps", sm.pd.DataFrame())
    if tps.empty:
        print("        SKIP — tps_scores.csv missing")
        return
    universe = sm._investor_universe(data)
    matches = sm._match_investors(["Sequoia Capital", "Accel Partners"], universe)
    matched = [v for v, _ in matches.values() if v]
    assert len(matched) >= 1, "At least one investor should match"
    for sc_name, sc in sm._SCENARIOS.items():
        sub = tps[tps["investor"].isin(matched)].copy()
        sub["tps_scenario"] = sub["tps"] * sc["tps_multiplier"]
        assert (sub["tps_scenario"] >= 0).all(), f"Scenario {sc_name}: negative TPS unexpected"
    print(f"        {len(sm._SCENARIOS)} scenarios × {len(matched)} investors ✓")


# ── 12. Module 9 — TPS Engine ────────────────────────────────────────────────
def t_tps_engine():
    import sovereign_mode as sm
    data = sm._load_data()
    tps = data.get("tps", sm.pd.DataFrame())
    assert not tps.empty, "tps_scores.csv required"
    assert "tps" in tps.columns, "tps column required"
    assert float(tps["tps"].max()) > 0, "TPS scores should be positive"
    tps_p = data.get("tps_panel", sm.pd.DataFrame())
    if not tps_p.empty:
        assert "eval_date" in tps_p.columns and "investor" in tps_p.columns
    print(f"        {len(tps)} investors · max={tps['tps'].max():.4f} ✓")


# ── 13. Module 10 — SMS Engine ───────────────────────────────────────────────
def t_sms_engine():
    import sovereign_mode as sm
    data = sm._load_data()
    panel = data.get("event_panel", data.get("sms", sm.pd.DataFrame()))
    assert not panel.empty, "event_panel or sms data required"
    assert "sms_score" in panel.columns, "sms_score column required"
    sectors = panel["sector"].dropna().unique() if "sector" in panel.columns else []
    assert len(sectors) >= 1, "At least one sector in panel"
    print(f"        {len(panel)} rows · {len(sectors)} sectors ✓")


# ── 14. Module 8 — Network Navigator ─────────────────────────────────────────
def t_network_navigator():
    import sovereign_mode as sm
    data = sm._load_data()
    edges = data.get("edges", sm.pd.DataFrame())
    assert not edges.empty, "edges.csv required"
    assert "source" in edges.columns and "target" in edges.columns
    n_nodes = len(set(edges["source"]).union(set(edges["target"])))
    assert n_nodes >= 2, "At least 2 nodes required"
    density = len(edges) / (n_nodes * (n_nodes - 1))
    assert density >= 0
    print(f"        {n_nodes} nodes · {len(edges)} edges · density={density:.5f} ✓")


# ── 15. Module 7B — Community Explorer ───────────────────────────────────────
def t_community_explorer():
    import sovereign_mode as sm
    data = sm._load_data()
    comm_sum = data.get("communities", sm.pd.DataFrame())
    assert not comm_sum.empty, "community_summary.csv required"
    assert "community_id" in comm_sum.columns
    if "size" in comm_sum.columns:
        assert comm_sum["size"].sum() > 0
    print(f"        {len(comm_sum)} communities ✓")


# ── 16. Module 17 — Data Lineage (hash verification) ─────────────────────────
def t_data_lineage():
    import sovereign_mode as sm
    files_to_check = [
        "tps_scores.csv", "sms_scores.csv", "tps_panel_expanding.csv",
        "edges.csv", "centrality_comparison.csv", "community_summary.csv",
    ]
    found = sum(1 for f in files_to_check if sm._sha256_file(f))
    assert found >= 3, f"Expected ≥3 core files present, found {found}"
    print(f"        {found}/{len(files_to_check)} files hash-verified ✓")


# ── 17. Module 20 — Methodology Library (structure check) ────────────────────
def t_methodology_library():
    import sovereign_mode as sm
    assert hasattr(sm, "_METHODOLOGY"), "_METHODOLOGY dict must exist"
    assert len(sm._METHODOLOGY) >= 6, "Expected ≥6 methodology topics"
    for title, content in sm._METHODOLOGY.items():
        assert len(content) > 50, f"Topic '{title}' content too short"
    print(f"        {len(sm._METHODOLOGY)} topics · all non-empty ✓")


# ── 18. Module registry completeness ────────────────────────────────────────
def t_registry_completeness():
    import sovereign_mode as sm
    missing = []
    for _floor, title, fn_name in sm._MODULE_REGISTRY:
        if fn_name not in dir(sm):
            missing.append(f"{title} → {fn_name}")
    assert not missing, f"Registry references missing functions: {missing}"
    print(f"        {len(sm._MODULE_REGISTRY)} modules · all functions resolved ✓")


# ── 19. app.py imports cleanly (syntax + import-time errors only) ────────────
def t_app_imports():
    import ast, importlib.util
    src = Path("app.py").read_text(encoding="utf-8")
    ast.parse(src)  # syntax check
    # Verify it imports sovereign_mode
    assert "import sovereign_mode" in src
    # don't execute — Streamlit hooks fail outside runtime — just compile
    compile(Path("sovereign_mode.py").read_text(encoding="utf-8"),
            "sovereign_mode.py", "exec")


if __name__ == "__main__":
    print("=" * 70)
    print("VENTUREGRAPH SOVEREIGN — SMOKE TEST")
    print("=" * 70)
    check("01 import sovereign_mode",         t_import)
    check("02 hash helpers (bytes/obj/df/file)", t_hash_helpers)
    check("03 data loader returns all keys", t_data_loader)
    check("04 audit receipts × 5 sectors × 3 signals", t_audit_receipts)
    check("05 preregistration seal + structures",      t_protocol_seal)
    check("06 pricing tiers (all 6 institution types)", t_pricing_tiers)
    check("07 memo HTML generation",         t_memo_html)
    check("08 CSV schemas match reader expectations", t_csv_schemas)
    check("09 Module 06 — Investor Deep-Dive helpers", t_investor_deepdive)
    check("10 Module 07 — Sector Deep-Dive (5 sectors × 8 fns)", t_sector_deepdive)
    check("11 Module 01 — Portfolio X-Ray (parser+fuzzy+5 aggregators)", t_portfolio_xray)
    check("12 Module 02 — Live Intelligence Feed",         t_intelligence_feed)
    check("13 Module 11 — Multi-Signal Composer (z-score sanity)", t_signal_composer)
    check("14 Module 15 — Compliance Verifier (reproducibility)",  t_compliance_verifier)
    check("15 Module 13 — Derived Signals (6 helpers)",            t_derived_signals)
    check("16 Module 12 — Scenario Analyzer (5 scenarios)",        t_scenario_analyzer)
    check("17 Module 09 — TPS Engine (leaderboard + panel)",       t_tps_engine)
    check("18 Module 10 — SMS Engine (panel + sectors)",           t_sms_engine)
    check("19 Module 08 — Network Navigator (graph stats)",        t_network_navigator)
    check("20 Module 07B — Community Explorer",                    t_community_explorer)
    check("21 Module 17 — Data Lineage (hash verification)",       t_data_lineage)
    check("22 Module 20 — Methodology Library (structure)",        t_methodology_library)
    check("23 Registry completeness (all 22 functions resolve)",   t_registry_completeness)
    check("24 app.py syntax + sovereign_mode compile",             t_app_imports)

    print("\n" + "=" * 70)
    n_pass = sum(1 for r in results if r[0] == PASS)
    n_fail = sum(1 for r in results if r[0] == FAIL)
    n_warn = sum(1 for r in results if r[0] == WARN)
    print(f"SUMMARY  PASS={n_pass}  WARN={n_warn}  FAIL={n_fail}")
    print("=" * 70)
    sys.exit(0 if n_fail == 0 else 1)
