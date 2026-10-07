# Independent review B — website/API/VU parity

Observed 2026-10-07, reference SHA `3f11a5a9d523e2b12f448ff91a6ddf7783cdaf7e`; main SHA `b39d8d7ddbd093d138e2844ddec2cb2bb07a6962`. No reference repository mutations; no authenticated/paid API requests.

## Evidence and limits

Official `/search` page uses `/site_js/scripts.min.js?v=monthly-default`, function `submitSearch`, which calls public `/stock_api.php?offset=…&exchange=…&search=…`. This is observed website backend data, distinct from account-authenticated `/v2/tickers`. Every target name was queried; nine transient `rate_limit_reached` responses were preserved and retried serially. Public website JSON can return application errors with HTTP 200.

Raw JSON, HTTP headers, UTC observation times, URL and SHA256: `website/evidence.json`, `website/extra-evidence.json`, `website/exact-evidence.json`. Official website HTML and JavaScript: `website-search.html`, `website-scripts.js`. Downloaded free directory workbook: `published-eod-tickers.xlsx`; independent extraction and SHA256: `published-eod-directory-candidates.json`. CSV contains 120,406 rows; workbook 512,378 rows. Neither download establishes account entitlement, price freshness, current identity or history availability.

## Findings

1. **Premature unsupported classification (VU diagnostic bug).** `scripts/marketstack/probe-missing-identities.mjs:57` proposes `officialLocalTicker + ".DE"` plus frozen cached candidates; the probe only calls exact `/tickers/{candidate}`. `identityResolution` lines 87–90 emits `NOT_SUPPORTED` whenever these candidates return unsupported, without name search or exchange inventory. Reproduced with one empty metadata attempt: `{resolutionStatus:"NOT_SUPPORTED",cause:"UNSUPPORTED_LISTING"}`. This is unsupported *candidate*, not proof an instrument/provider listing is unsupported. Keep unresolved until all documented resolution paths have been tried; preserve a separate exact-candidate failure.

2. **No full ticker discovery exists in reference adapter.** `providers/marketstack/adapter.js` implements exact metadata, prices and actions. It exposes no `searchTicker` or `listExchangeTickers` and has no `/tickers` search or `/exchanges/{mic}/tickers` discovery consumer. Its paginated historical prices are not evidence of paginated ticker discovery. Main currently has no Marketstack provider directory or connector; reference local directory `core/data/de-eu/listings.json` is disabled with zero rows. Missing main normalized data must not be called provider coverage absence.

3. **First-page risk proved independently.** Public website unscoped `SAP` query reports total 144; page 0 contains 100 and page offset 100 contains 44, including `SAP.DE/XETR`. A first-page-only name lookup would miss SAP domestic listing. ABB (511), Allianz (2,350), Santander (530), BBVA (403) and Nordea (2,008) also require pagination or exact exchange-scoped lookup. No finding asserts that VU currently truncates these specific names, since VU does not use that search path.

4. **Real alias mismatch.** Website Kontron returns `SANT.DE/XETR`, not a guessed `KTN.DE`; workbook includes both. Stabilus appears as `STM.DE`; `STA.DE` is absent the workbook. Store exact observed provider symbols as candidates and require listing verification. Do not automatically migrate aliases.

5. **Provider website exchange/filter inconsistencies.** Website dropdown has value `XETRA`, yet `SAP + exchange=XETRA` returns total 0, whereas `SAP + exchange=XETR` returns `SAP.DE`. Dropdown Madrid is `BMEX`, website row is `XMAD`; direct `SAN.MC` finds Banco Santander while `Santander + XMAD` and `Santander + BMEX` return zero. Website/company search absence is not conclusive.

6. **Provider directory MIC inconsistency.** Website maps `ABBN.SW` and `SCMN.SW` to `XSWX`; downloadable workbook maps the identical symbols to `BTEE`. The workbook is a published coverage directory, not an authority for verified listing identity.

7. **Prior broad coverage conclusions require correction.** Website explicitly offers `ADN1.DE`, `HFG.DE`, `HAG.DE`, `R3NK.DE`, all `has_eod:true`; the published workbook contains each. Their missing VU mappings cannot establish provider absence. For Schaeffler, website offers ADR/OTC/LSE listings, but domestic search is absent in tested name/exact-candidate routes and published workbook. Authenticated API remains UNKNOWN.

8. **Seven UCITS candidates are identifiable.** Website and workbook confirm iShares `SXR8.DE` and `EUNL.DE`, Xtrackers `XDWD.DE` and `XESC.DE`, Vanguard `VWCE.DE`, SPDR `SPY5.DE`, Amundi `LCUW.DE`; visible names say UCITS. This establishes directory/website presence only, not ETF holdings support or fund identity.

## Target matrix

| Company | Website provider ticker candidate | Exchange | Website found | API found | VU normalized found |
|---|---|---|---|---|---|
| adesso | ADN1.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| HelloFresh | HFG.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| SAP | SAP.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| Siemens | SIE.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| Allianz | ALV.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| Deutsche Telekom | DTE.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| HENSOLDT | HAG.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| RENK | R3NK.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| Schaeffler | ADR/OTC/LSE only observed | Domestic unresolved | Yes | UNKNOWN | UNKNOWN |
| Fresenius | FRE.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| HAMBORNER REIT | HABA.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| Alzchem | ACT.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| Stabilus | STM.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| SAF-HOLLAND | SFQ.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| Kontron | SANT.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| Einhell | EIN3.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| Nagarro | NA9.DE | XETR | Yes | UNKNOWN | UNKNOWN |
| ASML | ASML.AS | XAMS | Yes | UNKNOWN | UNKNOWN |
| LVMH | MC.PA | XPAR | Yes | UNKNOWN | UNKNOWN |
| ABB | ABBN.SW | XSWX | Yes | UNKNOWN | UNKNOWN |
| Swisscom | SCMN.SW | XSWX | Yes | UNKNOWN | UNKNOWN |
| Ferrari | RACE.MI | XMIL | Yes | UNKNOWN | UNKNOWN |
| Santander | SAN.MC | XMAD | Yes | UNKNOWN | UNKNOWN |
| BBVA | BBVA.MC | XMAD | Yes | UNKNOWN | UNKNOWN |
| Nordea | NDA-FI.HE | XHEL | Yes | UNKNOWN | UNKNOWN |
| Airbus | AIR.PA | XPAR | Yes | UNKNOWN | UNKNOWN |
| QIAGEN | QIA.DE | XETR | Yes | UNKNOWN | UNKNOWN |

All raw latest/history columns remain UNKNOWN because no current account API response was observed. Identity candidates are not approved mappings. No row is labelled WEBSITE_ONLY, API_COVERAGE_GAP or VU_CONNECTOR_GAP from website evidence alone. Complete machine-readable table: `website-api-vu-matrix-independent.json`.

## Verdict

Review identifies concrete VU discovery/diagnostic gaps and independently observed provider directory/filter inconsistencies. It does not prove current account API coverage, Professional entitlement, fresh EOD, historical depth or holdings availability. Those conclusions require the authenticated raw API and normalized materialization layers.

## Final expanded deliverables

`website-api-vu-parity-matrix.json` and `.csv` cover 27 stocks + 12 ETFs. Domestic/home website listings observed for 26/27 stocks; alternatives for Schaeffler; all 12/12 ETFs found. Authenticated API stays UNKNOWN; VU status identifies absent main Marketstack connector, and does not assert US ADR/product absence. `exchange-mapping-independent.json` records the exchange discrepancies.

Diagnostic reproduction artifact: `review-b-identity-diagnostic-reproduction.json`, unchanged actual function source evaluated independently in VM. Whole-module execution in the sparse reference was unavailable because `quant/engines/market-client.js` is absent. Raw website VTI label is `Vanguard Morningstar Total Stock Market ETF`, differing from the expected Vanguard Total Stock Market name; this remains raw provider text and an unverified identity candidate.
