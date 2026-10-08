# Independent review E — UCITS holdings

Reviewed 2026-10-08: `ucits-quality.mjs`, its tests, and corrected holdings adapter behavior. No authenticated calls or Git mutations performed.

## Findings

**E-1, high, fixed and independently verified: duplicate holdings previously admitted to X-Ray.** With two identical `{ticker:'A', weight:50, assetType:'EQUITY'}` rows, `providerTotal:2`, `complete:true`, `asOf:'2026-10-07'`, explicit percent units and physical structure, the analyzer previously returned `FULL` and `xrayReady:true`. The corrected analyzer detects identical original rows using stable object-key serialization, retains both original rows and the observed sum, and returns `PARTIAL`, `DUPLICATE_HOLDINGS_ROWS` and `xrayReady:false`. It does not deduplicate by ticker or rescale weights.

**E-2, high, fixed and independently verified: explicit as-of previously overrode a conflicting report period end.** Adapter-shaped holdings with `reportedPeriodEnds:['2026-01-01']` and explicit `asOf:'2026-10-07'` previously returned `FULL`/X-Ray-ready on 2026-10-08. All reported as-of aliases and period ends now participate in consistency checks. The same reproduction returns `PARTIAL`, canonical `asOf:null`, `CONFLICTING_AS_OF_EVIDENCE` and `xrayReady:false`. Report-period starts remain separate.

**E-3, medium, fixed and independently verified: malformed trailing date text previously accepted.** `asOf:'2026-10-07garbage'` was truncated and could produce `FULL`/X-Ray-ready. Holdings evidence now requires an exact valid ISO calendar date. The reproduction returns `PARTIAL`, `asOf:null`, `INVALID_AS_OF_EVIDENCE` and `xrayReady:false`. Evaluation `now` separately permits a supported valid timestamp.

No unresolved blocker remains in the reviewed UCITS analysis gates. Actual UCITS completeness, identity and licensing still require run evidence before product publication.

## Verified safeguards

- Future dates and impossible calendar dates covered by existing tests cannot become FULL. Age is computed from holdings as-of evidence, not retrieval time.
- The corrected adapter's `reportedPeriodEnds` map to as-of; `reportDates` remain report-period starts. A missing period end does not reuse a period start.
- All input holdings rows and unrecognized provider fields remain available. Signed weights, cash, derivatives, original units and original row weights are retained. Partial basket weights are never rescaled to 100%.
- FULL requires explicit weight units, valid dated data, count/transfer evidence and structure-specific completeness. Physical baskets use an explicit 98–102% mass tolerance, retaining the observed sum. Count alone is insufficient.
- Cash is retained. Derivatives and unknown asset types block X-Ray. Synthetic FULL status requires separate structure coverage evidence and still does not enable X-Ray.
- A 504 remains `GATEWAY_ERROR` with underlying coverage `UNKNOWN`; it never produces an unsupported-provider conclusion. Partial rows, if present, remain preserved.
- Metadata does not infer domicile, UCITS status, TER units, replication or other absent fields from names/descriptions. Missing values remain null. Share classes group by valid ISIN; fund identity requires separate explicit linkage.
- Vorsorge proposals use secondary-source fusion, preserve provenance, never overwrite primary sources and separately block publication without confirmed display/commercial rights.

## Validation

`node --test providers/marketstack/tests/ucits-quality.test.mjs`: **12/12 passed** after correction. All three original offline reproductions were independently rerun and now block FULL/X-Ray while preserving original rows and weights. No live UCITS 504s were retried during this review.
