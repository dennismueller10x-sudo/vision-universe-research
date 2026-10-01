# Global market coverage

Measured with Marketstack Professional through bounded GitHub Actions probes on 2026-10-01. Source runs and per-request timestamps are in `reports/marketstack/marketstack_exchange_coverage.json`. Tiingo, SEC and the accepted global identity architecture remain intact.

## Exchange discovery

The exchange directory reported 2,883 venues; 1,000 metadata rows were inspected. A directory entry is not evidence that prices exist. The venue ticker responses contain nested `data.tickers`; totals below are instruments of unknown type, not equity or ETF counts. Most venue directories are partial. The Xetra directory is complete at 8,959 unique symbols; Nasdaq is complete at 44,469 after a bounded resume.

| MIC | Venue country | Reported instruments | Rows inspected | EOD flag true | Intraday flag true |
| --- | --- | ---: | ---: | ---: | ---: |
| XETR | DE | 8959 | 8959 | 8919 | 0 |
| XFRA | DE | 91828 | 1000 | 999 | 0 |
| XPAR | FR | 4673 | 1000 | 998 | 0 |
| XAMS | NL | 2713 | 1000 | 973 | 0 |
| XBRU | BE | 238 | 238 | 236 | 0 |
| XMIL | IT | 3271 | 1000 | 1000 | 0 |
| XMAD | ES | 1001 | 1000 | 989 | 0 |
| XWBO | AT | 2813 | 1000 | 1000 | 0 |
| XSWX | CH | 29075 | 1000 | 1000 | 0 |
| XLON | GB | 36699 | 1000 | 1000 | 0 |
| XCSE | DK | 2081 | 1000 | 1000 | 0 |
| XSTO | SE | 4376 | 1000 | 1000 | 0 |
| XOSL | NO | 599 | 599 | 596 | 0 |
| XHEL | FI | 205 | 205 | 205 | 0 |
| XTKS | JP | unavailable | 0 | 0 | 0 |
| XKRX | KR | 2353 | 1000 | 1000 | 0 |
| XTAI | TW | 3324 | 1000 | 1000 | 0 |
| XHKG | HK | 7351 | 1000 | 1000 | 0 |
| XSHG | CN | 7416 | 1000 | 1000 | 0 |
| XBOM | IN | 15934 | 1000 | 999 | 0 |
| BVMF | BR | 8049 | 1000 | 1000 | 0 |
| XNAS | US | 44469 | 44469 | 34090 | 1 |
| XNYS | US | 15349 | 15349 | 15075 | 1 |
| ARCX | US | 3906 | 3906 | 3885 | 0 |
| XASE | US | 283 | 283 | 273 | 0 |
| BATS | US | 1 | 1 | 1 | 0 |

## Identity and classification

Search and venue pages prove provider names/symbols/MICs for representative German and European listings, including Siemens, Rheinmetall, Deutsche Telekom, ASML, LVMH, Airbus, Novo Nordisk, Nestlé, Shell and Ferrari. The exact findings and absent/truncated results are in `marketstack_europe_equity_counts.json`. SAP and Allianz broad searches are truncated; absence from their first search page is not a coverage failure. Venue discovery pages have no asset type, price currency or issuer domicile. Supplementary direct ticker requests provide item_type, ISIN and MIC, and long-window EOD bars returned for 23 German candidates and representative European equities. Provider EOD currency and asset-type fields were null for these global bars; separate identity/currency evidence is therefore mandatory. Counts of current active common equities remain null until classified, deduplicated full-page discovery and valid price histories are available.

Current authenticated metadata maps NESN.SW to XSWX. The public XLSX instead maps it to BTEE, a British BrokerTec venue in authoritative ISO data. This demonstrates why stale catalog mappings must not override current provider metadata. ASML.AS/ASML.XAMS and MC.PA/MC.XPAR are aliases requiring listing reconciliation. Country refers to venue country until issuer identity proves domicile.

Toyota and Sony name searches identify 7203.T and 6758.T on XJPX. The XTKS directory request failed; this does not establish that Japanese prices are unsupported. Existing suitable ADRs remain preferred consumer listings under the accepted policy.

## Prices, freshness and fundamentals

Supplementary EOD windows beginning January 2025 returned roughly 400–441 bars for the measured German/European/Asian sample. Observed EOD windows are reported per symbol; they do not establish inception or maximum provider history depth. European venue samples advertise no intraday flags. Initial SAP/XETR and MC/XPAR intraday requests returned empty data. Neither observation establishes European realtime, and no LIVE capability is granted. Preserve EOD_ONLY when only EOD bars are measured; unavailable sample results do not become fabricated prices.

Listing-level quote currency comes from validated responses or official instrument reference evidence. `marketstack_trading_currency_evidence.json` records 42 measured official mappings: 23 German listings and 9 Xetra ETFs from the exchange T7 reference CSV updated 2026-10-01, ASML/LVMH/Airbus/Ferrari from official Euronext instrument quote currencies, Nestlé CHF from official SIX reference JSON and Novo Nordisk DKK from its issuer Copenhagen B-share quote, and four Spanish/Austrian listings from official BME instrument currency and Vienna listing price units. Six supplementary Belgian/Swedish/Norwegian/Finnish equities also have explicit provider price currencies. Provider null currency remains null in raw observations. HEN3 is a preferred share and must not enter common-equity-only eligibility. Shell quote-unit validation remains unresolved. GBP and GBX are distinct quote units; never apply a size-based conversion heuristic or infer price currency from venue country. Calendar/holiday coverage remains the existing coverage-gated infrastructure; unverified global sessions are not treated as US sessions.

SEC remains the primary US fundamentals source. European ESEF architecture and PIT dates remain protected. Missing fundamentals are null. ETFs are excluded from company equity engines. A bounded official DAX/MDAX/SDAX/TecDAX investigation made 22 public-source accesses: official pages returned ten component names per index, without ISINs or membership-effective dates; linked complete composition/factsheet exports returned HTTP 503, and the modern DAX factsheet returned HTTP 429. Requests stopped at the throttle. Full dated index membership matches remain null, with exact source/access evidence in `reports/marketstack/marketstack_german_index_coverage.json`. No entitlement requirement or exact identity match is inferred from those failures or names.

## Safe scope

Discovery has established real metadata, not an automatically safe full universe. The ingestion path requires verified identity, type, currency and valid history before admitting an extension. No production listing count is inferred from instrument directory totals.

## Prepared branch data and activation

The final branch contains 58 canonical listings in `quant/data/global-market`: 23 equity listings on German venues (including HEN3 preferred), 16 other European equity listings, seven Asian equity listings, and 12 ETFs (nine Xetra and three US). Europe therefore has 39 prepared equity listings across 12 venues. Counts describe tested listings, not full provider universes or issuer domiciles. The US baseline is preserved.

The histories contain 23,016 valid bars; 1,394 zero or impossible provider bars were quarantined. All 58 histories remain PARTIAL with unverified price/corporate-action basis. Only bounded close charts and canonical identity/display are prepared. No global Quant, technical-engine or fundamentals eligibility is granted. Unknown company identity and issuer domicile remain null. `marketstack_canonical_import.json` is the authoritative machine-generated import/count report.

The final 63 observed candidate pairs yielded 58 prepared listings and five blocked observations: unresolved Shell quote scale, Toyota/Sony missing quote currency, and two UK ETF identity/currency conflicts. `branchPrepared=true` and `productionActivated=false` distinguish preparation from activation. No production deployment or provider migration occurred.

## Complete Xetra candidate classification

Authenticated run 36856401441 retrieved all 8,959 unique Xetra directory symbols in nine pages. An exact `.DE` mnemonic plus XETR join to the official reference file updated 2026-10-01 matched 3,245 active listings. The result is in `reports/marketstack/marketstack_xetra_classified_candidates.json`: 680 equity listing candidates, 2,374 ETF listing candidates, and 191 excluded ETN/ETC listings. The remaining 5,714 provider instruments are unresolved and are retained for investigation.

Twelve equity candidates have an explicit VZO preferred-share hint in the official instrument name. The other 668 are equity candidates without that hint; absence of VZO does not prove common-share status. All 680 verified equity quote currencies are EUR. These are securities listed on Xetra, including foreign issuers, so they must not be described as 680 German-domiciled companies.

Of 3,054 classified equity/ETF candidates, 32 were already in the separately prepared subset with PARTIAL histories; the other 3,022 remain history unchecked. Full discovery grants no additional product eligibility or production activation. Directory flags show 8,919 instruments with EOD and none with intraday; these flags are not measured candle or realtime coverage. Nasdaq's complete 44,469-symbol directory was assembled from 40,000 rows plus a resumed 4,469 rows; the US benchmark owns its coverage interpretation.

Potential same-ISIN/MIC/currency aliases are recorded for listing reconciliation; distinct currency listings are preserved separately. Candidate counts must not bypass identity deduplication gates.

## Supplementary European price validation

Authenticated run 36858301835 returned bounded 2025–2026 EOD histories for actual metadata-discovered UCB.BR and ABI.BR (Belgium), ITX.MC and IBE.MC (Spain), OMV.VI and VOE.VI (Austria), ATCO-A.ST and VOLV-B.ST (Sweden), DNB.OL (Norway), and KNEBV.HE (Finland). Belgian, Swedish, Norwegian and Finnish responses explicitly supply EUR, SEK, NOK and EUR respectively. Spanish and Austrian responses leave currency null; official BME SIBE instrument records and same-listing Vienna JSON-LD price units independently supply EUR. These ten listings passed the canonical import gates after invalid provider bars were quarantined.

The representative matrix covers metadata for all 13 requested European countries; 12 have prepared equity samples. Country and venue totals must not imply complete equity coverage. UK Shell remains blocked on quote scale; the UK's tested ETF candidates remain blocked for conflicting identity and mixed currency. No new sample establishes European intraday/realtime or maximum history depth.
