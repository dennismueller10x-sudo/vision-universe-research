# Marketstack scale ETF audit

Generated from measured evidence as of 2026-10-01. The audit performs zero API calls and does not activate listings or change Tiingo, equity fundamentals, provider routing or product eligibility.

## Listing, share-class and fund reconciliation

The complete machine artifact marketstack_etf_identity_reconciliation.json reconciles every candidate listing. Its 2933 distinct European ISINs identify securities or share classes, not unique funds. 2004 of those ISINs occur on more than one venue and 2338 have at least one explicitly active official listing. A unique ETF fund total remains NULL because the available legal fund/share-class mappings do not cover the universe. US flag-only records supply 30 distinct nonconflicting observed ISINs and leave the remaining identifiers unknown; ticker and similar fund names are never used to combine funds.

4781 European listing candidates (2471 distinct ISINs) contain an explicit UCITS name label. This is an unverified name-label estimate, with zero independently verified regulatory UCITS authorizations; the remaining candidates cannot be classified as non-UCITS from absence of that label. 18/34 tested holdings endpoints return usable position data, all partial; zero complete current portfolios are verified. The requested 16-field matrix in marketstack_etf_metadata_matrix.json uses AVAILABLE / PARTIAL / NONE / UNVERIFIED and keeps provider fields separate from official supplements.

## Universe evidence

6423 European provider listing candidates have an exact official ETF identity/classification reference (2933 distinct ISINs; 6423 distinct venue/ISIN/trading-currency identities). Separately, 3217 US listing candidates match the NasdaqTrader ETF flag and exact primary MIC; that flag does not independently verify ETF fund legal structure. The combined candidate registry contains 9644 ETF-role records with these different confidence levels, including the European official matched subset above. No verified global ETF total is asserted. Across that full cohort, 4244 listings have verified active reference status, 0 have verified inactive status, and 5400 retain UNKNOWN status. These are bounded observed candidates, not a complete global ETF universe or unique fund count.

| Listing country | Official matched ETF candidates |
| --- | ---: |
| DE | 4244 |
| CH | 1456 |
| FR | 445 |
| NL | 276 |
| BE | 1 |
| NO | 1 |

The current NasdaqTrader directory supplies explicit ETF flags and primary MICs for the US; explicit ETN descriptions and test symbols are excluded, other possible ETP/ETC legal structures remain unresolved, unknown MICs stay unresolved, and trading status, currency and ISIN are never assumed. Provider directory/metadata conflicts remain quarantined. Its current listing presence is independent of price or holdings validation. The Xetra T7 reference, the explicit SIX ETF Explorer records and Euronext filtered ETF/ACTIVE ETF/STRUCTURED ETF JSON responses supply independent type evidence. Euronext's unfiltered tracker CSV mixes products; its GET filter parameters returned identical mixed payloads and cannot establish ETF type. Italy's official ETFplus MIC ETFP is kept separate from the provider's XMIL directory. Swiss repeated symbols with multiple currency lines remain ambiguous unless an existing verified identity disambiguates them.

The provider etflist endpoint is contaminated by common equities and is never an asset-type authority. Xetra-Gold remains ETC and is excluded from ETF/company admission. 12 recognized issuer-family name-hint groups are represented; legal issuer and UCITS authorization are not inferred from names or ISIN prefixes.

## US official-flag candidate census

The complete current US primary directory contains 5758 ETF-flagged records. Excluding 54 explicitly named ETNs and 2 test symbols leaves 5702 flag-role candidates; 5 retain unknown MIC. Exact symbol/current-MIC matches total 3217, of which 3131 have no observed provider identity/type conflict. 2480 have no exact match in the measured current-MIC directories. Missing directory matches do not prove provider price unavailability. BATS venue normalization remains unresolved; its provider directory contains one symbol while the official flag cohort includes 1632 listings.

US flag-role records remain separate from European official type/ISIN matches. Possible other ETP/ETC structures and note-related name hints require legal-source review; weak names never remove otherwise valid funds. The audit guesses no US ISIN or trading currency and grants no product activation.

## Prices and actions

145 classified ETF listings have a listing-level metadata or price endpoint response; 52 have at least one valid returned OHLC bar. 138 history series require review for invalid raw/adjusted OHLC, contradictory observations, or identity violations. These stricter OHLC gates do not rewrite the existing close-chart ingestion behavior. Entire series retain quarantine status when an identity or same-date contradiction exists. The bounded follow-up returned 45 requested windows in 119 pages (99326 raw rows); 45 have complete, distinct paginated delivery. Delivery does not establish usable OHLC, full inception history, verified corporate-action adjustments or global realtime coverage. Only 2 observed series (IWM, SXR8.DE) pass the strict sampled-series OHLC/currency/identity gates, and corporate-action adjustment verification remains absent.

A dividend response is verified only when its returned listing identity, date and currency agree. Generic dividends lacking venue/currency remain unverified; positive EOD dividends are retained as source observations under the normalized identity. No dividend amounts or raw OHLC are published in this audit.

## Holdings

| Symbol | Measured state | Reason or report date | Holding lines |
| --- | --- | --- | ---: |
| SPY | UNAVAILABLE | providerError | — |
| QQQ | UNAVAILABLE | providerError | — |
| VOO | AVAILABLE_PARTIAL | 2024-12-31 | 516 |
| EUNL.DE | TRANSPORT_OR_PROVIDER_UNAVAILABLE | timeout | — |
| AGG | AVAILABLE_PARTIAL | 2025-05-31 | 12572 |
| ARKK | AVAILABLE_PARTIAL | 2025-04-30 | 35 |
| BND | TRANSPORT_OR_PROVIDER_UNAVAILABLE | dataUnavailable | — |
| BNDX | AVAILABLE_PARTIAL | 2025-01-31 | 7475 |
| EEM | AVAILABLE_PARTIAL | 2025-05-31 | 1195 |
| EFA | AVAILABLE_PARTIAL | 2025-01-31 | 731 |
| FLIN | AVAILABLE_PARTIAL | 2025-03-31 | 259 |
| GLD | TRANSPORT_OR_PROVIDER_UNAVAILABLE | dataUnavailable | — |
| HYG | AVAILABLE_PARTIAL | 2025-05-31 | 1277 |
| IAU | TRANSPORT_OR_PROVIDER_UNAVAILABLE | dataUnavailable | — |
| IEF | AVAILABLE_PARTIAL | 2026-05-31 | 16 |
| IEMG | AVAILABLE_PARTIAL | 2025-05-31 | 2704 |
| IJH | AVAILABLE_PARTIAL | 2025-06-30 | 407 |
| IJR | AVAILABLE_PARTIAL | 2025-06-30 | 610 |
| IUSN.DE | TRANSPORT_OR_PROVIDER_UNAVAILABLE | timeout | — |
| JEPI | AVAILABLE_PARTIAL | 2026-06-30 | 129 |
| LQD | AVAILABLE_PARTIAL | 2025-05-31 | 2910 |
| SCHD | TRANSPORT_OR_PROVIDER_UNAVAILABLE | timeout | — |
| SHY | AVAILABLE_PARTIAL | 2026-05-31 | 91 |
| SLV | TRANSPORT_OR_PROVIDER_UNAVAILABLE | dataUnavailable | — |
| TIP | AVAILABLE_PARTIAL | 2026-07-31 | 50 |
| TLT | TRANSPORT_OR_PROVIDER_UNAVAILABLE | timeout | — |
| VT | TRANSPORT_OR_PROVIDER_UNAVAILABLE | timeout | — |
| VTI | TRANSPORT_OR_PROVIDER_UNAVAILABLE | timeout | — |
| VTV | TRANSPORT_OR_PROVIDER_UNAVAILABLE | timeout | — |
| VUG | TRANSPORT_OR_PROVIDER_UNAVAILABLE | timeout | — |
| VWCE.DE | TRANSPORT_OR_PROVIDER_UNAVAILABLE | timeout | — |
| VXUS | TRANSPORT_OR_PROVIDER_UNAVAILABLE | timeout | — |
| XLF | AVAILABLE_PARTIAL | 2024-12-31 | 76 |
| XLK | AVAILABLE_PARTIAL | 2024-12-31 | 73 |

18 holdings observations are usable as partial fund-series reports; 16 are stale for current portfolio analysis. 2 reports meet the explicit 120-day freshness threshold (JEPI, TIP); no current complete ETF share-class portfolio has been verified. 20 HTTP-success observations include domain-level no-data responses and must not be counted as usable portfolios. 31126 reported holding lines contain 100 exact duplicates, 297 negative weights, 35 cash/collateral legs and 29 explicit derivative-category legs. 6 total-weight anomalies remain uncorrected (EEM, HYG, IEMG, IJH, IJR, LQD); categories and accounting methodology can also affect totals. Signed derivative positions, cash/collateral legs, missing identifiers and exact duplicate anomalies remain visible. A repeated ISIN alone does not authorize deduplication. Portfolio values are never synthesized into share-class AUM. SEC Form N-PORT and its official version 1.13 XML schema define repPdDate as the actual holdings as-of date and repPdEnd as fiscal year-end. Marketstack date_report_period therefore supplies actualAsOf; end_report_period is retained as fundFiscalYearEnd, even when future. Legacy period fields remain compatible but are not reporting-period boundaries. Report/signature/retrieval dates do not establish SEC public acceptance or point-in-time availability. See https://www.sec.gov/files/formn-port.pdf and https://www.sec.gov/files/edgar/filer-information/specifications/edgar-form-n-port-xml-tech-spec-113.zip.

## Metadata availability

Provider and external-reference availability are separate. SIX reports structured manager/fund legal names, fund currency, legal-structure country, benchmark description and replication fields for matched identities. Its ManagementFee field remains ManagementFee; it is not converted into TER, OCF or expense ratio. Official WKN reference values retain their original source format; raw-value lengths and standard six-character value counts are published in the matrix, with no silent reformatting. UCITS regulatory status, AUM, NAV, tracking difference/error and regulatory inception remain unknown unless separately evidenced.

| Field | Marketstack | Official external supplement |
| --- | --- | --- |
| ETF_NAME | PARTIAL | PARTIAL |
| TICKER | PARTIAL | PARTIAL |
| EXCHANGE | PARTIAL | PARTIAL |
| ISIN | PARTIAL | PARTIAL |
| WKN | NOT AVAILABLE | PARTIAL |
| ISSUER | UNKNOWN | PARTIAL |
| FUND_DOMICILE | NOT AVAILABLE | PARTIAL |
| FUND_CURRENCY | NOT AVAILABLE | PARTIAL |
| TRADING_CURRENCY | PARTIAL | PARTIAL |
| UCITS_STATUS | NOT AVAILABLE | UNKNOWN |
| INCEPTION_DATE | NOT AVAILABLE | UNKNOWN |
| BENCHMARK | NOT AVAILABLE | PARTIAL |
| TER | NOT AVAILABLE | UNKNOWN |
| OCF | NOT AVAILABLE | UNKNOWN |
| EXPENSE_RATIO | NOT AVAILABLE | UNKNOWN |
| AUM | NOT AVAILABLE | UNKNOWN |
| ACCUMULATING_OR_DISTRIBUTING | NOT AVAILABLE | UNKNOWN |
| REPLICATION_METHOD | NOT AVAILABLE | PARTIAL |
| PHYSICAL_OR_SYNTHETIC | NOT AVAILABLE | PARTIAL |
| HOLDINGS | PARTIAL | UNKNOWN |
| FULL_HOLDINGS | UNKNOWN | UNKNOWN |
| HOLDINGS_WEIGHTS | PARTIAL | UNKNOWN |
| SECTOR_ALLOCATION | NOT AVAILABLE | UNKNOWN |
| COUNTRY_ALLOCATION | PARTIAL | UNKNOWN |
| ASSET_ALLOCATION | PARTIAL | UNKNOWN |
| DIVIDEND_HISTORY | UNKNOWN | UNKNOWN |
| HISTORICAL_PRICES | PARTIAL | UNKNOWN |
| NAV | NOT AVAILABLE | UNKNOWN |
| TRACKING_DIFFERENCE | NOT AVAILABLE | UNKNOWN |
| TRACKING_ERROR | NOT AVAILABLE | UNKNOWN |

### Requested coverage matrix

Scope is the inspected sample. PARTIAL does not authorize product activation; the machine matrix records quality counts and semantic limitations for each field.

| Field | Combined observed support | Marketstack | Official supplement |
| --- | --- | --- | --- |
| price_history | PARTIAL | PARTIAL | UNVERIFIED |
| dividends | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| holdings | PARTIAL | PARTIAL | UNVERIFIED |
| holding_weights | PARTIAL | PARTIAL | UNVERIFIED |
| ISIN | PARTIAL | PARTIAL | PARTIAL |
| WKN | PARTIAL | NONE | PARTIAL |
| issuer | PARTIAL | UNVERIFIED | PARTIAL |
| UCITS | UNVERIFIED | NONE | UNVERIFIED |
| TER/OCF | NONE | NONE | UNVERIFIED |
| AUM | NONE | NONE | UNVERIFIED |
| benchmark | PARTIAL | NONE | PARTIAL |
| distribution_policy | NONE | NONE | UNVERIFIED |
| replication | PARTIAL | NONE | PARTIAL |
| domicile | PARTIAL | NONE | PARTIAL |
| sector_exposure | NONE | NONE | UNVERIFIED |
| country_exposure | PARTIAL | PARTIAL | UNVERIFIED |

## Request controls and reproduction

The bounded follow-up plan selects 37 new unique holdings requests, at most 740 conservatively reserved credits before retries (none planned). Its non-US failure circuit breaker prevents repeated unavailable aliases. Cached checkpoint observations are deduplicated; 239 reused observations were excluded from independent sample counts. The primary ingestion workflow reports reserved request attempts and conservative estimated credits; provider billing and account balance were not independently measured. The provider decision remains DEFERRED; this follow-up selects none of A/B/C/D and changes no routing.

Use scripts/market/audit-marketstack-etfs.mjs with repeat --probe=private-probe.json, --reference=normalized-t7-references.json, --six-reference=six-etfs-reference.json, --us-reference=current-NasdaqTrader-directory.json, and --euronext-page=filtered-reference-page.json. Public outputs contain census keys, aggregate counts and bounded observed/representative validations. --private-full-out=private-working-path writes the full joined audit; --joined-reference-out=private-working-path exports exact typed references for existing universe gates. --markdown-out=docs/MARKETSTACK_SCALE_ETF_AUDIT.md regenerates this report. No source directory or raw provider response is added to frontend payloads.
