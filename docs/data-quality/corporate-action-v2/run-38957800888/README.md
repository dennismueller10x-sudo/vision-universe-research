# Run 38957800888 (protocol 2.0.0, split SEC collection)

Code commit d6eb7cf879b, rules identical to run 38889245815. The SEC collection ran as three parallel parts (2001-2012, 2013-2019, 2020-2026-10) with no document cap: 74,551 requests, 45,750 filings, 70,381 documents, no incomplete search window, 13 documents not loadable after retries (`complete: false`). Part a found no in-universe filings: the captured price universe starts 2015-01-02 and filings are kept from 400 days before a listing's first bar (run 38889245815 shows the same).

Acceptance (pre-registered): control FP pooled 0/904, per category 0, hold precision 0.981, FN rate 0.0298 pass; normalize false share 0.25 (7 of 28 labelled), SEC collection complete and PIT consistency fail.

PIT: no bar, hold or evidence after asOf. Six views (5 events) differed from the final view at a normalization the view could not yet contain, and `pitHistory()` did not disclose them: the stage-only `observedAt` was too early (review F19, HIGH). Fixed in canonical-price-validity-2.1.0 (observedAt = first as-of view containing the normalization; disclosure of every earlier view). The fix changes timestamps only, not which events normalize or which bars are valid. The next run re-measures PIT with the fixed contract and otherwise identical rules.

Sealed per-case results: `sealed/` (owner and session envelopes).
