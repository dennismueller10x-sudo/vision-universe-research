# Baseline test isolation for Europe publication

The seven failing tests were reproduced on main `440a1645048d6b559988488f9a0f3148f21d3cdd`, before the Europe source overlay. These corrections change test inputs and assertions only. They do not change US market data, Tiingo routing, calculation engines, rankings, producer output, canonical IDs, or schedules.

- The universe classifier test's sole common-stock fixture now ends on the current UTC date. Its fixed September end date was testing stale-status exclusion instead of the intended active-versus-delisted classification.
- The Watchlist alerts test retains its explicit migration and unverified-run suppression cases. It checks the current published alerts against their actual suppression and watchlist scope instead of treating every future run as the old Elliott migration.
- The News golden path checks freshness metadata and explicit unavailable identity for unresolved editorial mentions; it never fabricates a security. A separate controlled equity feed still requires every mention to resolve through the real company master. Current unresolved composite strings and the ETF mention are reported as diagnostics.
- Golden-series parity and report reproducibility use the historically measured and confirmed interval, with actual provider rows copied into temporary directories. New provider rows are not evidence for an older report.
- Two untouched JPM rows from October 5 and 6 are preserved as a source-bound test fixture. The unchanged engines must classify the observed missing dividend adjustment as `CONFLICT_CANONICAL_WINS` and `NO_ADJUSTMENT_AT_ALL`. In an isolated historical sample the unchanged verification producer must write `INCONSISTENT` and exit nonzero. Neither a synthetic repair nor a `MATCH` exemption is applied.

Current provider quality is a separate measurement. On the reviewed main inputs the producer checks 235 dividend events, matches 234, and identifies JPM on `2026-10-06` with dividend `1.65` and relative error `0.004988963807335324`. This remains an unresolved provider inconsistency. The confirmed historical report covers 234 events through September 29 and does not certify this later observation.

The full Core and Quant suites and the provider diagnostic run against private output paths. Before and after validation, 64,162 protected files are compared to their SHA256 baseline. Test fixtures are excluded from the public Pages release by the existing release boundary.
