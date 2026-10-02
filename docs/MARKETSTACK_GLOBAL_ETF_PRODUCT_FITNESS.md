# Marketstack global ETF product fitness

Offline, reproducible evidence as of 2026-10-02; source snapshots remain 2026-10-01. No paid requests, product activation, routing change or commercial provider decision.

There are 3217 exact US primary-MIC ETF-flag candidates (3131 nonconflicting), and 6423 European official typed listings representing 2933 ISIN security/share-class candidates. Unique legal funds and global share classes remain NULL. Of 5697 official US known-MIC ETF-role listings, 2480 lack an exact provider-directory match; this is not proof of unsupported prices. 2471 ISINs carry UCITS name labels, with zero verified authorizations. Reference-active does not establish liquid/current trading.

The US sample contains 33 actual requested/discovered symbols across broad market, sector, factor, bond, commodity and international exposure. Identity, bounded histories, dividends, holdings and metadata are reconciled in global_etf_coverage.json. Major SPY/QQQ/VOO/VTI/SCHD/TLT/GLD/SLV/ARKK/XLF/XLK histories retain strict quarantine reasons. XLE has a provider/official type conflict; its holdings were not tested. The two strictly clean bounded series are IWM (8 bars) and SXR8.DE (440 bars), with unverified adjustments. Existing scoped EOD charts are preserved; no new technical approval follows from this audit.

## Holdings

34 unique endpoint observations: 2 PARTIAL_CURRENT, 16 PARTIAL_STALE, 16 UNAVAILABLE; zero FULL_CURRENT. 52.9412% return partial position reports; 47.0588% return no usable report. CURRENT means within the explicit 120-day research threshold, not certified latest holdings. Actual date_report_period controls age; fiscal-year-end/signature/retrieval never does. All 18 usable reports are US fund-series reports; all three European tests were unavailable.

| Symbol | Classification | Actual holdings date | Report lines |
| --- | --- | --- | ---: |
| SPY | UNAVAILABLE | NULL | NULL |
| QQQ | UNAVAILABLE | NULL | NULL |
| VOO | PARTIAL_STALE | 2024-12-31 | 516 |
| EUNL.DE | UNAVAILABLE | NULL | NULL |
| AGG | PARTIAL_STALE | 2025-05-31 | 12572 |
| ARKK | PARTIAL_STALE | 2025-04-30 | 35 |
| BND | UNAVAILABLE | NULL | NULL |
| BNDX | PARTIAL_STALE | 2025-01-31 | 7475 |
| EEM | PARTIAL_STALE | 2025-05-31 | 1195 |
| EFA | PARTIAL_STALE | 2025-01-31 | 731 |
| FLIN | PARTIAL_STALE | 2025-03-31 | 259 |
| GLD | UNAVAILABLE | NULL | NULL |
| HYG | PARTIAL_STALE | 2025-05-31 | 1277 |
| IAU | UNAVAILABLE | NULL | NULL |
| IEF | PARTIAL_STALE | 2026-05-31 | 16 |
| IEMG | PARTIAL_STALE | 2025-05-31 | 2704 |
| IJH | PARTIAL_STALE | 2025-06-30 | 407 |
| IJR | PARTIAL_STALE | 2025-06-30 | 610 |
| IUSN.DE | UNAVAILABLE | NULL | NULL |
| JEPI | PARTIAL_CURRENT | 2026-06-30 | 129 |
| LQD | PARTIAL_STALE | 2025-05-31 | 2910 |
| SCHD | UNAVAILABLE | NULL | NULL |
| SHY | PARTIAL_STALE | 2026-05-31 | 91 |
| SLV | UNAVAILABLE | NULL | NULL |
| TIP | PARTIAL_CURRENT | 2026-07-31 | 50 |
| TLT | UNAVAILABLE | NULL | NULL |
| VT | UNAVAILABLE | NULL | NULL |
| VTI | UNAVAILABLE | NULL | NULL |
| VTV | UNAVAILABLE | NULL | NULL |
| VUG | UNAVAILABLE | NULL | NULL |
| VWCE.DE | UNAVAILABLE | NULL | NULL |
| VXUS | UNAVAILABLE | NULL | NULL |
| XLF | PARTIAL_STALE | 2024-12-31 | 76 |
| XLK | PARTIAL_STALE | 2024-12-31 | 73 |

Observed ISIN intersections and reported top-line/country weight summaries demonstrate partial diagnostics only. They never produce full overlap, concentration or exposure metrics; weights are not normalized and duplicate/negative/cash/derivative positions are retained.

| Feature | Fitness |
| --- | --- |
| ETF_OVERLAP | PARTIAL |
| TRUE_UNDERLYING_EXPOSURE | NOT_SUPPORTED |
| COUNTRY_EXPOSURE | PARTIAL |
| SECTOR_EXPOSURE | NOT_SUPPORTED |
| TOP10_TOP20_CONCENTRATION | PARTIAL |
| DUPLICATE_EXPOSURE_ACROSS_ETFS | PARTIAL |

## Metadata

| Field | Marketstack | Official supplement | Safe observed support |
| --- | --- | --- | --- |
| fund_name | PARTIAL | PARTIAL | PARTIAL |
| ticker | PARTIAL | PARTIAL | PARTIAL |
| exchange | PARTIAL | PARTIAL | PARTIAL |
| ISIN | PARTIAL | PARTIAL | PARTIAL |
| WKN | UNAVAILABLE | PARTIAL | UNVERIFIED |
| issuer | UNVERIFIED | PARTIAL | PARTIAL |
| domicile | UNAVAILABLE | PARTIAL | PARTIAL |
| UCITS | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| fund_currency | UNAVAILABLE | PARTIAL | PARTIAL |
| trading_currency | PARTIAL | PARTIAL | PARTIAL |
| inception_date | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| benchmark | UNAVAILABLE | PARTIAL | PARTIAL |
| TER | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| OCF | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| expense_ratio | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| AUM | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| distribution_policy | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| replication | UNAVAILABLE | PARTIAL | PARTIAL |
| physical_synthetic | UNAVAILABLE | PARTIAL | PARTIAL |
| NAV | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| historical_price | PARTIAL | UNVERIFIED | PARTIAL |
| dividends | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| tracking_difference | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| tracking_error | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| sectors | UNAVAILABLE | UNVERIFIED | UNAVAILABLE |
| countries | PARTIAL | UNVERIFIED | PARTIAL |
| holdings | PARTIAL | UNVERIFIED | PARTIAL |
| holding_weights | PARTIAL | UNVERIFIED | PARTIAL |

Dividend observations occur in quarantined series, so clean dividend history is unverified. WKN raw nine-character values are not silently trimmed into standard WKN. SIX ManagementFee is not TER/OCF. Structured official manager/legal-structure/benchmark/replication labels supplement some identities, with no extrapolation or legal-issuer/UCITS proof.

## Required secondary ETF data

- Complete, dated, current share-class-to-fund portfolios with explicit completeness and public availability/filing provenance.
- Security identifiers and canonical issuer joins for every equity, bond, cash and derivative leg; fund-of-fund look-through.
- Portfolio NAV denominators, weight units/accounting methodology and signed gross/net derivative economic exposures.
- Verified sector and issuer-country mappings plus complete allocations; synchronized as-of dates and licensed historical point-in-time holdings.
- Verified ETF share-class/fund legal identity, UCITS authorization, costs, AUM/NAV, benchmark and distribution/replication policy.

## Reproduction

Run the read-only script with --probe=private-provenance-cache.json --full-audit=private-finalized-etf-audit.json --as-of=2026-10-02. Public inputs default to the accepted PR334 artifacts. Every inspected holdings body must hash-match accepted provenance; private counts/holdings/listing keys must match the baseline. Public artifacts publish source hashes, bounded representative identities and diagnostic aggregates, not full holdings/provider payloads. No network, credential or frontend dependency exists.
