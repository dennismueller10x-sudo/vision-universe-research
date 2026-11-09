# Vision Universe Quant 2.0 Methodology

Status: **canonical specification, not active**  
Methodology ID: `quant-v2.0.0-full-7f`  
Machine-readable contract: `quant/methodology/quant-v2.json`

## Version boundary

Quant V2 is the canonical product methodology. Quant V1 (`quant-v1.0.0`) remains immutable and active only as the legacy/comparison runtime until V2 passes its data, breadth and publication gates. V1 results are never relabelled, overwritten or joined into V2 history.

No V2 score is published yet. The full score requires every factor; missing Revisions weight is never redistributed. A six-factor score is not implicitly created.

## Factor DNA and weights

| Factor | Weight | Meaning | Current readiness |
|---|---:|---|---|
| Quality | 10% | durability, accrual quality, balance-sheet resilience | PARTIAL |
| Growth | 15% | realized operating expansion and acceleration | PARTIAL |
| Momentum | 25% | medium-horizon total-return strength and confirmation | PARTIAL |
| Value | 15% | price relative to PIT-safe fundamentals | PARTIAL |
| Profitability | 15% | current and persistent operating economics | PARTIAL |
| Revisions | 15% | changes in analyst expectations | BLOCKED_EXTERNAL |
| Risk | 5% | observed market risk; higher score means lower risk | PARTIAL |

Quality and Profitability are deliberately disjoint. SEC filing restatements are not analyst revisions.

## Component definitions

| Factor | Components and within-factor weights | Window / minimum |
|---|---|---|
| Quality | accrual ratio 25%; net debt/assets 20%; equity/assets 15%; positive FCF years 20%; operating-margin stability 20% | TTM/latest plus 5 FY; margin stability needs 4 FY |
| Growth | revenue CAGR 30%; EPS CAGR 20%; FCF CAGR 15%; TTM revenue YoY 15%; margin expansion 10%; growth acceleration 10% | 3 FY plus current/prior TTM; cross-zero EPS/FCF CAGR is null |
| Momentum | 12–1 total return 30%; 6m 20%; 3m 10%; benchmark-relative 12–1 20%; 52w-high distance 10%; SMA200 distance 10% | 252 sessions, 95% valid; total-return and split-adjusted bases stay distinct |
| Value | FCF yield 30%; earnings yield 25%; EBITDA yield 20%; sales yield 10%; book-to-market 15% | latest completed close plus PIT-safe TTM/latest filing |
| Profitability | ROIC TTM 25%; median ROIC 3FY 15%; gross profitability 20%; operating margin 15%; FCF margin 15%; ROA 10% | PIT-safe TTM and last 3 FY |
| Revisions | FY1 EPS yield 30%; FY2 EPS yield 15%; next-quarter EPS yield 10%; FY1 revenue 10%; breadth 20%; acceleration 10%; dispersion 5% | immutable PIT snapshots; ≥3 analysts at both endpoints; current ≤7 days; baseline ±7 days |
| Risk | realized volatility 35%; downside volatility 25%; maximum drawdown 25%; beta 15% | 252 sessions; ≥240 valid and aligned observations |

The JSON contract contains the exact formulas, direction, source semantics, mandatory components and applicability rules for every component.

## Universe and peers

Scoring is issuer-level. An eligible row needs canonical identity, product eligibility, a deterministic primary US common/accepted ADR security, USD quote, market cap of at least USD 300m, 60-session average dollar volume of at least USD 5m and 252 market sessions. Warrants, rights, units, preferreds, tests and unresolved identities are excluded. Historical membership is selected as of the score cutoff.

Normalization uses deterministic midranks and a 70% peer / 30% universe blend. In
the current-snapshot V2 projection, methodology `industry` is explicitly bound to
four-digit SEC SIC (`sic4_industry`) and methodology `sector` to the official SEC
SIC Division range (`sic_division`). SIC Division must not be presented as GICS
or as a modern sector taxonomy:

1. industry with at least 20 valid issuers;
2. sector with at least 40;
3. score universe with at least 200.

Unknown classifications are never invented. Universe-only fallback is disclosed
and lowers confidence. The canonical chain `factor.securityId` → Company Master
`masterMemberId` → `issuerId` → exact CIK-derived Fundamentals `issuerId`
currently projects 5,355 factor securities / 5,046 distinct issuers. Of these,
5,206 securities have a
valid SIC classification. The 149 classification-missing securities remain in
the score universe and may use only the disclosed universe fallback with LOW
confidence and mandatory penalty. The remaining 1,049 securities fail closed for
canonical identity reasons. Tickers are never join keys. These are taxonomy
populations, not
metric-valid populations. Every component must reapply the 20/40/200 minimum to
its own valid issuer observations before normalization. No historical SIC series
exists in the product artifacts, so historical scoring and Backtesting remain
fail-closed.

## Validation, missing data and outliers

The mandatory order is identity/as-of membership → PIT selection → semantic/unit/denominator/basis validation → applicability → preserve legitimate negatives → invalid/nonfinite to null → 2nd/98th percentile winsorization separately in peer and universe → percentile → factor → composite.

Counts and binary values are not winsorized. A factor needs at least three components and 60% of its original component weight, including its mandatory components. Only available weights inside that factor may renormalize, and the renormalization is disclosed. The full composite needs all seven factors and at least 80% weighted component coverage.

Generic Quality is `NOT_APPLICABLE` for banks, insurers and REITs until separately versioned templates exist. Negative profitability and cash-flow values are adverse observations, not missing. Invalid denominators remain null, never zero.

## PIT and cadence

Every historical observation must satisfy `availableAt <= scoreCutoff`. `acceptedAt` is preferred; validated `filedAt` is the fallback. Later amendments and restatements are invisible before their own availability. Estimates use actual provider publication timestamps. Prices use final bars available before the cutoff. Historical scores are immutable as-of snapshots, never reconstructed from current values.

Price inputs update after a completed session; filing and revision inputs update on valid events. A current score may materialize nightly when a dependency changed. Canonical history is weekly, with optional additional event snapshots. Every identity includes methodology, universe and data-snapshot hashes.

## Score and confidence

`compositeScore` is the fixed weighted mean of the seven factor scores. `quantScore` is its percentile rank in the eligible score universe. Neither is a probability, price target or recommendation.

Confidence is separate:

`0.50 Coverage + 0.20 Freshness + 0.15 PeerQuality + 0.10 HistoryDepth + 0.05 Provenance`

Bands are High ≥90, Medium ≥75, Low ≥60, Insufficient <60. A numeric score with confidence below 60 is not published.

## Activation gates

- licensed historical PIT analyst-consensus snapshots;
- certified broad-market total-return benchmark;
- historical PIT universe membership/classification;
- complete corporate-action semantics;
- PIT shares and enterprise-value inputs;
- industry templates for banks, insurers and REITs;
- broad component coverage, overlap/correlation and out-of-sample validation.

Until all gates required for a row and the full methodology are satisfied: `V2_SCORE_PUBLICATION_ALLOWED = false` and real backtesting remains closed.
