# Run 39007119068 (protocol 3.0.0, first full run)

Completed. Every collection worked except the validation vendor: GitHub-hosted runners receive HTTP 429 from it (25 of 25
symbols blocked, collection stopped by design; probe run 39013825289 confirmed both hosts blocked). The audit therefore ran
without vendor labels: all vendor-based labels are UNLABELED and the engine-independent false-negative population is empty.
Acceptance in this run is NOT a valid FP/FN measurement; it is kept as evidence (PIT oracle, FINRA, SEC, D2, 83, downward
census). Decision rules were not changed afterwards. The vendor evidence is produced outside the runner from a sealed label
request (reuse runs, see RUN-INPUTS.json and scripts/quant/corporate-action-v3/vendor-evidence.mjs).

Capture fingerprint differs from the V4 freeze, as in the v2 runs (each capture binds its own read receipts); the V4 population
counts reproduce exactly (2200 / 65 / 13, 83 diagnostic cases, 74 adjusted-level securities, 11 known D2 defects).
