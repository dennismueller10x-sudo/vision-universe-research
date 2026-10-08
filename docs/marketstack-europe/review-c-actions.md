# Independent C — Europe corporate actions

Reviewed 8 October 2026, independently of the implementation author. Scope:
`scripts/marketstack/europe-actions.mjs`, its price-quality dependency and tests.
No provider calls or production writes. Final status: **APPROVED FOR PRIVATE
CANONICAL CANDIDATES**, after independently verifying the corrective changes.

## Confirmed safeguards

The action module retains complete raw observations, separates splits, reverse
splits, dividends and symbol changes, refuses duplicate/conflicting events, and
does not treat an empty provider response as proof of no events. Documentary
evidence must cover the symbol/MIC, entire history interval and split convention.
Inline split/dividend conflicts block admission. Symbol changes require explicit
continuity evidence. Canonical candidates use existing split geometry and close
rounding; provider adjusted columns are not used. Output remains private and
`productionReady=false`.

## Reproduced finding

**Foreign raw bars relabelled as the requested listing.** Bars explicitly
reporting `WRONG/XNAS`, with otherwise valid EUR OHLC, can be supplied under a
`SAP/XETR` listing. Empty actions plus documentary absence evidence scoped to
SAP/XETR then produce `status=VERIFIED` and a SAP/XETR canonical candidate.
The shared price-quality validator must quarantine reported symbol/MIC conflicts
before action reconciliation or canonical transformation. Independent documentary
evidence about SAP cannot authenticate another listing's raw history.

The weaker action-certification path in `europe-quality.mjs` was also reported:
complete/source flags alone cannot substitute for this module's scoped interval
and inline-event checks. Both modules must agree before downstream readiness.

## Resolution and independent verification

The shared price validator now quarantines explicit provider symbol/MIC conflicts.
Reported identity absence prevents canonical admission. Re-running the exact
foreign-history counterexample now returns `canonicalSeries=null`, `status=INVALID`
and `CHART_BLOCKED` for the price evaluation. The simplified quality action gate
now delegates this stricter reconciler, preserving interval, identity, absence and
inline-event requirements. Original raw observations remain preserved unchanged.

Node 22.23.3 final B/C suite: **38/38 passed**, zero skips. Private evidence:
`/workspace/marketstack-europe-private/bc-final-review.tap`. The reviewer made no
provider requests. Documentary assertions are trusted resolver input, not proof
created by a provider response or by this review.

## Limits

This review does not certify provider-wide event completeness or universal
Marketstack adjustment semantics. Valid canonical research candidates still need
history, volume, benchmark, identity and publication gates for individual products.
