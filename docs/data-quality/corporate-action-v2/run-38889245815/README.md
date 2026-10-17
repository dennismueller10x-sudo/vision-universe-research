# Run 38889245815 (protocol 2.0.0, first complete run)

The SEC collection hit the workflow document cap (45,000 documents; 15,862 of the newest filings were not read), so the pre-registered precondition `secCollectionComplete` failed. This run is kept as reported evidence. Run 2 repeats it with identical rules and no cap; it adds only diagnostics for PIT mismatches.

Correction (review round 2, R2-08): this run already failed the pre-registered PIT check (6 return mismatches in 525 views) and had a normalize false share of 0.174 (4 of 23). The PIT mismatch diagnostics added for the next run (commit cae6581) were added after seeing this result; they are diagnostics only and change no rule. The cause was identified as F19 in run 38957800888.
