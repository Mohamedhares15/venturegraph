# Q&A Preparation — 15 Likely Examiner Questions

**Rule:** if asked a question whose honest answer is "I don't know yet," say exactly that. Do not improvise. Examiners respect intellectual honesty more than rehearsed answers.

---

## CATEGORY 1 — Methodological depth

### Q1. "Your TPS rank correlation with out-degree is 0.31. Is that actually low?"

**A:** Yes, in the Spearman rank-correlation literature, 0.31 is in the "weak positive" band — meaning the two measures share about 10% of rank variance. Classical centrality measures among themselves typically correlate at 0.7–0.95. The fact that TPS sits at 0.31 with out-degree demonstrates it captures a genuinely different dimension of investor behaviour — **prescience, not prominence**. That's the intended property.

### Q2. "Why the specific decay λ = 0.3? Did you sensitivity-test it?"

**A:** Pre-registered at λ = 0.3 before any back-test; see `preregistration.py:79`. The value corresponds to a half-life of ~2.3 years, which roughly matches the average time between Series A and B in the Crunchbase sample. I have not re-run TPS at λ = 0.2 or 0.4 in this submission — that robustness test is listed as ROB-03 in the pre-registered battery but was deferred. I can flag that as a follow-up.

### Q3. "Why top-30% for SMS but top-20% for TPS top-tier?"

**A:** TPS top-tier (p80) is the prescience *target* — the elite receiver set. SMS top-30% is the prescience *signal population* — the senders whose silence we're measuring. Two different roles in the construction, pre-registered as two different thresholds (`preregistration.py:80` for TPS p80, and `sms_engine.py:24-26` for SMS p70). A future-work item is a joint sensitivity plot varying both simultaneously.

### Q4. "Expanding-window TPS — is this genuinely different from just computing TPS on the full sample?"

**A:** Yes — fundamentally. Full-sample TPS for investor A at eval date t = 2008-Q2 would include edges from deals that happened in 2011. That's look-ahead contamination: the score knows the future. Expanding-window TPS at 2008-Q2 uses **only** edges with round dates ≤ 2008-Q2. Every snapshot is cryptographically hashed (`expanding_window_tps.py:79-95`), so you can prove no backward-time contamination occurred. In financial back-testing this is the difference between a publishable result and a methodological artifact.

---

## CATEGORY 2 — The null result

### Q5. "Your p-values are 0.61 to 0.90. Does this mean your method fails?"

**A:** It means the *empirical H3 hypothesis* is not rejected by the null in this specific sample. It does not mean the method fails. Post-hoc power analysis shows the sample is under-powered by ~30× for the observed effect size. What the null rules out is *this dataset as a decisive empirical test*, not *the construct as a potential signal*. The methodological contribution — operationalizing inverse link prediction with audit-grade infrastructure — is what earns the bonus, not the empirical claim.

### Q6. "Why didn't you just run it on a bigger dataset?"

**A:** Two honest reasons: (1) the Crunchbase 2013 snapshot is the only fully-public VC investment dataset I had license access to — WRDS VentureXpert and Magnitt MENA are commercial datasets I could not procure on a student budget; (2) the project brief was for end-to-end SNA on *one* real-world network dataset, not a meta-analysis. Future Work §8 Item 1 explicitly lists WRDS replication as the natural next step, and the framework is built to be dataset-portable.

### Q7. "Could the sign reversal between horizons indicate the signal is actually noise?"

**A:** Possible. It could also indicate that the effect has a specific time window (k = 12, 24 where the sign matched prediction) and that the 6/18/36 horizons capture different dynamics (momentum rather than information cascade). Honestly, with this sample size I cannot distinguish these hypotheses. Both are consistent with the data. A larger sample would separate them.

### Q8. "Should you report this project as a failure given the null?"

**A:** No — and I'd push back gently on the framing. The deliverable was to apply SNA techniques end-to-end, produce a novel construct, and test it rigorously. I did all three. The H3 empirical test producing a null is a *result*, not a failure. Reporting a statistically null result honestly — including the power analysis that contextualizes it — is stronger science than post-hoc adjusting the specification until something becomes significant. The latter is p-hacking.

---

## CATEGORY 3 — Innovation & the 5-mark bonus

### Q9. "What exactly is 'novel' about SMS? Isn't silence just the complement of link presence?"

**A:** Mathematically yes, but that's the insight. The entire link-prediction literature scores *candidate edges by probability of formation*. Nobody asks the inverse question: *which expected edges deliberately did not form, and does that absence carry independent information?* The construction requires defining "expected" in a non-circular way (I use the pre-registered top-tier set from prior TPS), matching Series A leads to Series B rounds, and aggregating to a sector-quarter signal. That pipeline — inverse link prediction as an operational financial feature — does not exist in the literature I've surveyed. Happy to be shown a prior paper that has it.

### Q10. "Why is the pre-registration protocol genuinely innovative?"

**A:** Pre-registration is standard practice in medical research (CONSORT) and experimental economics (AEA RCT Registry), but it's **extraordinarily rare** in applied financial machine learning, which is dominated by in-sample hyperparameter search and silent specification tweaking. I wrote `preregistration.py` as a Python module that produces a SHA-256 hash of every hyperparameter, hypothesis, and robustness test before running any back-test. That hash is git-committed and becomes tamper-evident. If anyone claims retroactively they "always meant" a different spec, the hash contradicts them. This level of rigor is rare even in peer-reviewed finance.

### Q11. "How does this compare to standard random-forest or GNN approaches to VC prediction?"

**A:** Different problem framings. Black-box ML predicts *outcomes* (will this company IPO?) with high accuracy but low interpretability. My approach defines *explicit graph-theoretic features* with transparent mathematics and pre-registered thresholds — the cost is statistical power, the benefit is methodological transparency. A future GNN extension (Future Work §8 Item 4) would try to learn the silence classifier end-to-end; that's a natural next step but requires more data than I have.

---

## CATEGORY 4 — Dashboard & engineering

### Q12. "Walk me through the dashboard architecture."

**A:** `app.py` is Streamlit. Main loader `fetch_system_data()` reads three real CSVs — `tps_scores.csv`, `community_partition.csv`, `sms_scores.csv`, and `sms_alpha_correlation.csv`. The Academic Mode is the original project dashboard: topology, centrality, community, SMS. The Sovereign Mode is a separate set of views demonstrating the audit vault, pre-registration protocol, and commercial framing. A sidebar toggle switches between them. Everything below the graph-loading layer is interactive on cached data — the heavy analyses (Louvain, percolation, centrality) run on-demand via the `st.button` + `st.spinner` pattern.

### Q13. "Is there any fabricated or synthetic data in the dashboard?"

**A:** No. There was in an earlier iteration — the SMS panel originally rendered a synthetic 5-row table with invented p-values. I caught this during final QA and replaced every synthetic number with a direct `pd.read_csv` read of the pipeline outputs. The honest disclosure text ("H3 does not reach significance in the 2013 Crunchbase sample") is now displayed directly on the innovation panel. The commit that made this fix is the last one before submission.

---

## CATEGORY 5 — Real-world implications

### Q14. "If SMS doesn't predict alpha, what's the point of the sovereign-mode dashboard?"

**A:** The Sovereign Mode demonstrates the **governance infrastructure** that is independently valuable regardless of whether the SMS signal validates. Compliance officers at sovereign wealth funds need: (a) point-in-time audit trails for any signal used to justify a capital allocation decision, (b) pre-registered, hash-locked protocols the regulator can verify, (c) reproducible input-hash-to-output-hash chains. That stack is built here. It would be valuable even if the specific SMS signal were replaced with any other signal — because the infrastructure is signal-agnostic. The Sovereign Mode is a prototype of that value proposition. It is labeled as **future work** explicitly, not a claim of current commercial readiness.

### Q15. "What's one thing you'd do differently if you started over?"

**A:** Scope the empirical test at the **deal level** (each Series B as one observation, $N \sim 10{,}000$) instead of the sector-quarter level ($N \le 76$). The sector aggregation collapses variance and is responsible for most of the power loss. It's Future Work §8 Item 2, but if I'd known the sample-size math at the start I would have run that specification first. The lesson: always do a power analysis *before* designing the test, not after. Appendix §7 Limitation 1 documents this honestly.

---

## Things to have ready but NOT volunteer

- The full Round 2–4 commercial analysis (unicorn-mode reframe). **This is not relevant to academic grading** and bringing it up unprompted signals confusion about what this deliverable is. Only mention if specifically asked.
- Specific named GCC SWFs (PIF, Mubadala). Only mention if asked about commercialization.
- The 30-day customer discovery sprint plan. Post-submission activity, irrelevant here.

---

## Meta-strategy

- **Listen fully** before answering. If you don't understand the question, ask to clarify — that's professional, not weak.
- **Lead with the honest answer**, then add the nuance. "The p-value is 0.77 — yes, that's null. Here's what it does and doesn't mean ..."
- **Never overclaim.** If a sentence would be wrong if they checked it, rewrite the sentence.
- **Defer gracefully** on things you genuinely don't know: *"I haven't computed that — let me take a note and follow up after the presentation."*
- **End each answer with a period.** Do not trail off. Confidence comes from finishing the sentence, even when the answer is a null.
