# ETF coverage

> This document records the accepted PR #330 baseline. Current scale measurements, expanded branch data and deferred provider decision are documented in [MARKETSTACK_SCALE_ENGINEERING_REPORT](MARKETSTACK_SCALE_ENGINEERING_REPORT.md). Production Tiingo/SEC/ESEF routing remains unchanged.

Measured Professional evidence is in `reports/marketstack/marketstack_etf_coverage.json`, with source run IDs and request timestamps.

## Measured price coverage

SPY, QQQ, VOO, VTI, IWM and ARKK returned EOD bars for the requested September 2026 sample, explicitly typed ETF with USD quote currency. SPY returned a dividend in the September corporate-action probe. Those observations establish six validated US price samples. Supplementary exact-symbol requests also returned metadata explicitly typed ETF and roughly 437–441 EOD bars beginning January 2025 for nine Xetra ETFs: EUNL.DE, VWCE.DE, SXR8.DE, SXRV.DE, IS3N.DE, EXSA.DE, EXS1.DE, EUNA.DE and ISPA.DE. These observations do not establish the global ETF count, inception dates or complete dividend history.

The public EOD catalog includes exact European candidates across MSCI World, FTSE All-World, S&P 500, Nasdaq 100, Emerging Markets, STOXX Europe 600, DAX, bonds and dividends. Its two columns cannot prove ETF identity, UCITS status, prices or currency. Nine exact-symbol probes subsequently establish provider ETF type, names explicitly containing UCITS, and EOD history. Official Xetra T7 reference data matches their exact mnemonics/MIC and supplies EUR quote currency, ISINs and WKNs. Regulatory UCITS status remains represented as name-based partial evidence. Name searches returned three MSCI World results and zero UCITS/FTSE All-World results; exact-symbol validation remains necessary.

## ETF list anomaly

`etflist` returned a total of 52,421 and 1,000 sampled ticker-only records, including common equities 000001.SZ and 000660.KS. This endpoint is quarantined as an asset-type authority. Its reported total must never be presented as an ETF count or used to grant ETF eligibility. Current global, active and UCITS ETF counts remain null.

## Holdings

VOO returned 516 fund-series portfolio lines dated 2024-12-31, signed 2025-02-27. They comprise 504 EC equity lines, 10 DE derivative lines and two STIV short-term investment lines. All have weights; the signed total is 99.916916230713%. Thirteen lines lack ISIN, which is not evidence of thirteen duplicates. Negative derivative weights and values are valid observations and retained. The liquidity-fund collateral line remains separate from the noncollateral line. Update frequency and report completeness are unverified.

SPY and QQQ returned HTTP 200 with semantic `code: 404`; they have no measured holdings. Transport success cannot be treated as holdings coverage. VOO's December 2024 report is stale relative to retrieval in October 2026, so it is not current portfolio exposure.

The report identifies SEC fund/trust and series metadata. Its portfolio scope is the reported Vanguard 500 Index Fund series, not an ETF share-class AUM measurement. The schema resembles regulatory fund reporting, but underlying document/accession and acceptance timestamps are absent. The normalizer preserves report date and signature separately and leaves public availability null; retrieval or signing dates never manufacture a PIT availability date.

## Metadata foundation

The field-by-field matrix distinguishes documented schemas from measured population. Fund/series name, ticker, ISIN and holdings weights are measured for VOO. Listing type/currency and historical bars are measured for six US samples and nine Xetra ETFs, with official reference EUR currencies supplementing null provider currency. The direct EUNL.DE holdings request timed out; global UCITS holdings coverage remains unknown. No inspected Marketstack ETF schema supplies TER, OCF, AUM, regulatory UCITS status, domicile, benchmark, NAV, tracking difference or tracking error. Provider UCITS names and official WKN/ISIN metadata remain separate provenance-backed observations. Missing fields are null/unavailable, not synthesized.

`providers/marketstack/etf.js` normalizes ETF/fund portfolio observations independently of company fundamentals. It requires listing/security identity and ETF type, validates symbol/ISIN/report dates, preserves raw decimal percentage strings and signed positions, and flags missing weights, exact duplicate lines and unusual totals without deleting valid cash/derivative exposure. Its real VOO fixture tests preserve collateral distinctions and unknown PIT availability.

ETF data remains excluded from equity Quant, Factor DNA and company valuation/CANSLIM eligibility. Search/chart/watchlist eligibility requires validated listing identity and prices in the shared canonical layer. No dedicated ETF consumer product is introduced.

ETF endpoints carry a documented 20-credit multiplier; discovery and holdings probes remain bounded. Do not repeatedly paginate the contaminated list to infer global counts.

## Prepared branch ETF listings

The branch prepares 12 canonical ETF listings: nine Xetra ETFs and SPY, QQQ and VOO. VTI, IWM and ARKK remain measured price samples outside this prepared extension. This count does not describe the global ETF universe.

Prepared ETF histories are PARTIAL and support bounded close charts only while price/corporate-action basis remains unverified. ETF holdings observations remain separate fund-series data; the stale VOO report never becomes current holdings. Equity Quant, Factor DNA, company valuation and company fundamental engines remain gated.

The machine-readable reports distinguish `branchPrepared=true` from `productionActivated=false`. No production deployment occurred.

## Complete Xetra ETF candidate discovery

The complete authenticated Xetra directory was reconciled with the official active instrument reference file using exact venue and mnemonic identity. This classifies 2,374 ETF listing candidates with 2,290 distinct ISINs. It is a listing/share-class discovery count, not a unique fund count or a regulatory UCITS count. Their explicit quote currencies are EUR (2,240), USD (109), GBP (18), CHF (4), SEK (1), AUD (1) and JPY (1). Fund currency and trading currency remain separate.

Nine Xetra ETF candidates were already prepared with PARTIAL histories; the other 2,365 require history validation. The prepared subset does not prove history, corporate-action, freshness or holdings coverage for all 2,374 candidates. No bulk import or new consumer eligibility is granted by this discovery. The machine-readable candidate artifact preserves unresolved listings and excludes matched ETN/ETC instruments from the ETF/equity candidate counts.

## UK UCITS candidate identity/currency failures

Two actual directory-discovered names, IBTA.XLON and VERX.XLON, returned 317 EOD bars each in authenticated run 36858301835. IBTA alternates USD (229 bars) and GBP (88); VERX alternates GBP (313) and USD (4). The direct metadata adds independent identity contradictions: IBTA returns US4510511060 with no asset type; VERX returns US92538J1060 typed equity, despite the discovered UCITS ETF names. Neither sample is admitted as an ETF or a usable chart. Currency scaling or guessing a local symbol would conceal identity collisions. These findings do not establish usable UK ETF coverage. Global active/UCITS ETF counts remain unknown.
