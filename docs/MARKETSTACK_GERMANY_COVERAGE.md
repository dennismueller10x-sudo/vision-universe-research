# Germany: observed directory and identity coverage

This audit describes securities listed on German venues. It does not equate listing country, an ISIN prefix, or an instrument's primary venue with issuer domicile. The observations were retrieved on 2026-10-01; the machine-generated reports retain individual provider observation times and official reference provenance.

The captured directories contain 172,913 unique provider records across the requested 16 cash-market MICs. Recovery run `36885254528` completed all eight supported venue directories: Frankfurt (XFRA: 91,828), Berlin (XBER: 16,288), Munich (XMUN: 15,617), Quotrix (DUSD: 14,000), Stuttgart (XSTU: 17,932), Xetra (XETR: 8,959), Hamburg (XHAM: 5,332), and Hanover (XHAN: 2,957). No supported venue remains partially paginated in this snapshot. Eight other registered cash-market MICs returned HTTP 422 `no_valid_exchange_provided`; complete coverage of all requested registered venues is therefore not asserted. Exchange registration establishes neither entitlement nor price coverage. Per-request results and completeness are in [germany_exchange_coverage.json](../reports/marketstack/germany_exchange_coverage.json).

An exact mnemonic-plus-MIC join against the official Xetra and Frankfurt T7 instrument masters classifies 11,612 equity provider records: 680 on Xetra and 10,932 in the complete Frankfurt directory. After deduplicating 125 provider aliases within the same ISIN, MIC and currency, this is a lower bound of 11,487 equity listing identities representing 10,808 distinct equity ISINs; 679 ISINs occur on both observed venues. Another 4,244 provider records join official ETF instruments (2,374 Xetra and 1,870 Frankfurt); 2,436 joined records have excluded instrument types and 154,621 records remain unclassified. These are classified subsets, not extrapolated full equity counts. Six other venue directories are complete but have no independently captured same-venue instrument-type reference, so their records remain unknown. Fresh Frankfurt pages use `.F` while the seeded first page uses `.XFRA`; both namespaces are preserved as observed provider evidence and their canonical aliases are deduplicated.

The official T7 instrument type `CS` establishes the broad equity class. Legal common/preferred rights are unknown unless already verified separately. Thirty-one classified official equity names contain preferred-share hints; these hints do not constitute verified share rights. The 797 classified equity provider records whose ISINs begin `DE` do not establish a count of German-domiciled issuers. All full domestic/common/preferred universe counts therefore remain null. Exact listings and exclusion decisions are in [germany_marketstack_universe.json](../reports/marketstack/germany_marketstack_universe.json).

## Current German index composition

The official public [Deutsche Börse index constituent pages](https://live.deutsche-boerse.com/indices/dax/constituents) use `https://api.live.deutsche-boerse.com/v1/search/equity_search`. Their observed full responses contain 40 DAX, 50 MDAX, 70 SDAX and 30 TecDAX members with ISIN and venue. All reported rows were retrieved, rather than a default first-page sample. The composition is current as observed; its effective date and historical membership availability are unknown.

| Index | Official members observed | Exact constituent ISIN + venue directory joins | Unmatched members |
| --- | ---: | ---: | ---: |
| DAX | 40 | 40 | 0 |
| MDAX | 50 | 47 | 3 |
| SDAX | 70 | 65 | 5 |
| TecDAX | 30 | 29 | 1 |

Eight distinct unmatched securities are present as active instruments in both official T7 masters. Direct authenticated Marketstack metadata requests for their current Xetra mnemonic plus `.DE` returned HTTP 404: Schaeffler `SHA0.DE`, TKMS `TKMS.DE`, Aumovio `AMV0.DE`, AlzChem `ACT0.DE`, ASTA `1AST.DE`, Shelly `SLYG.DE`, Vincorion `V1NC.DE`, and Ottobock `OBCK.DE`. Ottobock occurs in two indices. These observations establish failure of those requested symbols at the recorded time; they do not establish that every possible provider alias is absent. The discovered AlzChem directory candidate `ACT.DE` was tested directly: its metadata returns ISIN `DE000A2YNT30`, which differs from current constituent ISIN `DE000A41YHG1`. This identity mismatch prevents alias substitution. Another venue or a US ADR cannot substitute for a constituent's requested listing.

The full constituent snapshot, exact identities, observation provenance and direct-request evidence are in [germany_index_coverage.json](../reports/marketstack/germany_index_coverage.json) and [german_index_constituents.json](../reports/marketstack/reference/german_index_constituents.json). Membership and directory matches do not establish price history, corporate-action treatment, or product eligibility.

## All 680 Xetra equity candidates: current metadata and bounded prices

Final validation run `36887919408` observes metadata for every one of the 680 official-reference-classified Xetra equity candidates. It contains 657 responses under the full-equity audit label and reuses 23 earlier captured metadata responses. Exact returned symbol, ISIN and MIC match for 247 candidates. Another 427 have unverified metadata responses, predominantly missing ISINs. Six contradict the official instrument or asset class: `FRE.DE`, `CLIQ.DE`, `SFQ.DE` and `STM.DE` return a different ISIN; `DKG.DE` and `HABA.DE` return another asset class. These six are vetoed from new metadata admission. The 680-candidate diagnostic denominator remains intact and legal common/preferred rights and issuer domicile remain unknown.

Seven EOD batches requested the bounded 2026-09-21 through 2026-09-30 window and returned 4,404 candles. Price shape and requested identity/date/currency gates find 629 candidates with positive valid OHLC observations and 51 without observations; this alone is insufficient to admit a price when security metadata is unverified. Combined with exact metadata, 240 candidates have valid observed prices and seven have no prices. The 427 unverified metadata candidates and six contradictory candidates receive no price-validation admission. A total of 1,680 candles pass the combined identity and quality gates. Zero stale candidates and zero impossible/date-invalid candles were measured in this sample. Freshness uses a stated seven-calendar-day bound relative to each request's observation time, rather than an inferred holiday calendar.

Missing provider currency is filled solely from the exact same-venue official T7 instrument's native trading currency; explicit conflicting currency would quarantine the listing. Contradictory duplicate candles and missing/unrequested returned symbols also quarantine identity coverage. No raw OHLC is published, no price history backfill is established, and no technical or production activation follows from this report. Per-candidate metadata evidence and quality diagnostics are in [germany_full_equity_validation.json](../reports/marketstack/germany_full_equity_validation.json).

## Canonical identity preparation and reproduction

After current full-equity validation vetoes, the reviewed Xetra metadata foundation contains 3,048 listings: 674 equities and 2,374 ETFs. Its regenerated preparation preserves 32 listing IDs from the accepted 58-listing baseline and grants zero price, history, technical, or fundamentals coverage. Provisional metadata publication is excluded from the protected baseline. New company and issuer-domicile values remain null. ETFs have separate fund identity and no company identity. Provider ISIN/currency contradictions, existing ticker/MIC currency contradictions and ambiguous reference joins are blocked before canonical preparation.

The primary pipeline merges this foundation with accepted records centrally. Existing complete records and their histories take precedence. This audit neither writes public data nor activates production. The public [foundation summary](../reports/marketstack/germany_canonical_foundation_summary.json) records preparation decisions; the delivered canonical layer is authoritative for branch-publication counts.

Archive the exact official CSV bytes and captured API artifacts at the paths in `quant/config/marketstack-germany-audit.json`. The reference hashes protect the archived 2026-10-01 snapshot from silently becoming a later daily instrument list. Then run:

```sh
node scripts/market/build-marketstack-germany-reports.mjs --config=quant/config/marketstack-germany-audit.json
node --test quant/tests/marketstack-germany-audit.test.mjs
```

Full foundation output defaults to private `.market-cache/marketstack/germany-canonical-foundation.json`; `--foundation-out=<private-file>` overrides that destination. Public reports contain compact preparation summaries rather than a duplicate full canonical payload. All report generation is offline and requires no API key.
