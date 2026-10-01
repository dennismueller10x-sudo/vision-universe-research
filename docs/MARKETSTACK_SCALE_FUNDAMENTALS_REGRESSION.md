# Fundamentals preservation during the Marketstack scale pass

The 2026-10-01 scale investigation makes no writes to SEC or official European
fundamentals. Market-data discovery, bounded price diagnostics and ETF metadata
remain separate from company facts. No price-only listing is admitted to Quant
because it has a provider symbol or returned candles.

## Executed regression checks

| Command | Measured result |
| --- | --- |
| `python3 scripts/quant/cli.py test` | 484 passed in 23.762 seconds |
| `python3 -m unittest discover -s scripts/fundamentals/tests` | 7 passed in 0.410 seconds |
| `python3 scripts/fundamentals/official.py --manifest=quant/config/official-filings/lvmh-2024.json --out=/workspace/scratch/marketstack-scale-esef-sample` | Real official LVMH ESEF filing parsed through the existing Arelle installation; 12 facts, 543 reported issues |

The sample used the existing manifest's official French filing source and
document SHA-256 `72f36f9a80dad1ca16f4f9627dc79d88d358a30264b78c74e8bcd2ccf3adc41d`.
The scratch output and the committed official-filing artifact have identical
facts after excluding ingestion timestamps, identical provenance after excluding
retrieval timestamps, and identical remaining fields. Their 543 diagnostic
issues have an identical multiset; issue iteration order differs. This confirms
the retained sample's metrics and provenance without claiming full European
fundamental coverage or hiding the existing parser diagnostics.

The annual 2023 and 2024 facts remain available from the official 2025-03-25
filing, with conservative date-only end-of-day availability. Period end does
not become public availability. Units, EUR reporting currency, source concepts,
filing ID and reported values remain unchanged.

## Marketstack fundamental role

The prior measured Professional entitlement responses for company facts,
concepts, submissions and analyst ratings remain restricted; the scale pass
does not repeat those paid probes or fabricate a successful cross-check.
Accessible ticker metadata is not an income statement or company-facts feed.

Business company-facts and concepts documentation describes raw SEC EDGAR data.
These endpoints provide another access/parser path to the same regulatory
source. The read-only `providers/marketstack/fundamental-crosscheck.js` compares
CIK, taxonomy, concept, unit, period boundaries, accession, form and filing
date, and reports ambiguous, missing or differing records. It never overwrites
SEC/ESEF values or constructs filing availability dates.

An upgrade could increase request allowance, but duplicated SEC access does not
establish independent financial correctness or repair unverified adjusted-price
semantics. SEC remains the primary US source; official European/ESEF filings
remain the European architecture.


## Resumed finalization regression

The recovered environment reran the full existing SEC unittest suite: **484 passed** in 23.057 seconds; ESEF: **7 passed** in 0.398 seconds. Serving regressions: **32 passed**. The cached official LVMH sample was replayed without network requests: its 12 canonical facts, 543 diagnostic multiset, filing availability and provenance remain identical apart from retrieval/ingestion timestamps. Independent byte manifests also confirm unchanged protected SEC/ESEF artifacts. Marketstack normalization and analysis do not write to these pipelines.
