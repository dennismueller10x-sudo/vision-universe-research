# Independent B — Europe price quality

Reviewed 8 October 2026, independently of the implementation author. Scope:
`scripts/marketstack/europe-quality.mjs` and its tests. No provider calls or
production writes. Reproductions used Node 22.23.3 from the private execution
workspace. Final status: **APPROVED FOR PRIVATE READINESS**, after the corrective
changes and independent reproductions below. This is not public-data approval.

## Confirmed safeguards

Impossible/nonpositive OHLC, numeric strings, duplicate dates, negative volume
and inconsistent currencies are quarantined without repairing observations.
Raw and normalized layers are retained. Missing volume remains null; zero volume
is a warning. Provider adjusted fields alone cannot certify adjustment. Unknown
calendar evidence does not normally claim current EOD. Feature/RS engines are
the existing unchanged engines, and publication is explicitly gated.

## Reproduced findings

1. **Foreign listing and calendar admission.** Two EUR bars explicitly reporting
   `symbol=WRONG, exchange=XNAS` pass validation under a `SAP/XETR` listing.
   A calendar marked verified with `mic=XNAS` gives `CURRENT` and `CHART_READY`.
   Explicit symbol/MIC conflicts must quarantine bars. Verified freshness evidence
   must bind to the requested MIC; US calendar evidence cannot certify Europe.
2. **Ambiguous snapshot timestamp.** `2026-10-08T10:00:00` without a timezone is
   classified `SNAPSHOT_CURRENT` at `2026-10-08T10:01:00Z`. Timezone ambiguity must
   remain `SNAPSHOT_DELAY_UNKNOWN`; snapshot and realtime semantic evidence need
   exact listing identity and currency scope.
3. **Empty adjustment certification.** `classifyAdjustment([])` returns
   `ADJUSTMENT_CERTIFIED` with independent flags and a verified actions status.
   Certification needs an actual nonempty, identified series and a matched hash;
   a nonempty certificate-looking object cannot certify absent observations.
4. **Weak parallel action gate.** The simplified `assessCorporateActions` can
   certify empty events from `verified/complete/source` flags without the stricter
   interval/identity/inline-event checks in the action module. Price readiness
   must use equally strict evidence and reconciliation.

## Resolution and independent verification

All findings above were fixed. Re-running the original counterexamples returned:
foreign bars zero valid / `MISSING` freshness / `CHART_BLOCKED`; timezone-ambiguous
snapshot `SNAPSHOT_DELAY_UNKNOWN`; empty-series evidence `ADJUSTMENT_PARTIAL`,
never certified; foreign canonical candidate null / `INVALID`. Calendar evidence
now requires the exact listing MIC and excludes US MICs. Adjustment certification
requires an actual validated canonical series, recomputed matching hash, dates
and documentary evidence. The action assessment delegates the strict action
reconciler rather than maintaining a second weaker certification route.

A final additional counterexample (USD snapshot under an EUR listing) was also
fixed: it now returns `UNAVAILABLE / SNAPSHOT_CURRENCY_MISMATCH`. Conflicting raw
and normalized symbols/currencies block current snapshots; absent snapshot
currency remains unknown. Node 22.23.3 final B/C suite: **38/38 passed**, zero
skips. Private evidence: `/workspace/marketstack-europe-private/bc-final-review.tap`.

No provider request was made by this review. Trusted documentary/calendar
attestations still need to be supplied by a verified upstream resolver.

The final A-C2 historical-time finding was also independently reviewed. The
series evaluator now forwards its evaluation time and declared request range to
bar validation. Future dates, dates beyond the completed exchange session and
observations outside the requested interval are quarantined while original rows
remain intact. A foreign MIC calendar cannot supply the completion cutoff;
freshness still remains unverified for such a calendar. Invalid evaluation times
and range boundaries fail explicitly. The combined quality/actions/UCITS
compiler regression suite passed **52/52** under Node 22.23.3 after this change,
including future-history and requested-range counterexamples.

## Limits

No live series has been admitted by this review. Calendar, rights, adjustment
and snapshot semantics remain evidence requirements. `CHART_READY` for valid raw
research observations does not authorize raw display or Quant/Backtest admission.
