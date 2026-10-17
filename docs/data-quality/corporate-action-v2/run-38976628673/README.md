# Run 38976628673 (protocol 2.0.0, contract 2.1.0) - final measurement

Code commit 35b2cb2893d: detection rules identical to run 38957800888; the only change is the PIT timestamp fix F19 (canonical-price-validity-2.1.0).

- SEC collection: 76,083 requests, 45,763 filings, 70,394 documents, no incomplete search window, no document cap. SEC throttled heavily during this run (2,000+ retries), so 308 documents were not loadable after retries (run 38957800888: 13). `complete: false`.
- Capture: same 9,407 securities; the data fingerprint differs from run 38957800888 because the store gained about 1,035 bars (a new trading day) in between.
- PIT: 600 as-of views, 0 bars / holds / evidence after asOf, 0 return mismatches outside disclosed revisions (14 PIT_REVISION, 3 HOLD with resumeFrom). Pass.
- Acceptance (pre-registered): control FP 0/905, hold precision 0.981, FN 0.0298, PIT pass; normalize false share 0.25 and SEC completeness fail.
- Regression on the known populations: identical to run 38957800888.

Sealed per-case results: `sealed/`.
