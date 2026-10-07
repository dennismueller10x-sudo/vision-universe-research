# Independent live parity review B — preparation

Read-only review of PR #479. No paid API calls, no repository writes. Authenticated raw evidence pending parent download.

The preserved website matrix has 39 cases: 27 DE/EU stocks, 12 ETFs. Domestic stock listings are observed for 26; Schaeffler has only alternative/OTC/LSE listings. All 12 ETFs have observed provider directory candidates. Website discovery does not prove price or holdings coverage.

| Company/fund | Observed provider ticker | Website MIC | Domestic candidate |
|---|---|---|---|
| adesso | ADN1.DE | XETR | yes |
| HelloFresh | HFG.DE | XETR | yes |
| SAP | SAP.DE | XETR | yes |
| Siemens | SIE.DE | XETR | yes |
| Allianz | ALV.DE | XETR | yes |
| Deutsche Telekom | DTE.DE | XETR | yes |
| HENSOLDT | HAG.DE | XETR | yes |
| RENK | R3NK.DE | XETR | yes |
| Schaeffler | unresolved | unresolved | no |
| Fresenius | FRE.DE | XETR | yes |
| HAMBORNER REIT | HABA.DE | XETR | yes |
| Alzchem | ACT.DE | XETR | yes |
| Stabilus | STM.DE | XETR | yes |
| SAF-HOLLAND | SFQ.DE | XETR | yes |
| Kontron | SANT.DE | XETR | yes |
| Einhell | EIN3.DE | XETR | yes |
| Nagarro | NA9.DE | XETR | yes |
| ASML | ASML.AS | XAMS | yes |
| LVMH | MC.PA | XPAR | yes |
| ABB | ABBN.SW | XSWX | yes |
| Swisscom | SCMN.SW | XSWX | yes |
| Ferrari | RACE.MI | XMIL | yes |
| Santander | SAN.MC | XMAD | yes |
| BBVA | BBVA.MC | XMAD | yes |
| Nordea | NDA-FI.HE | XHEL | yes |
| Airbus | AIR.PA | XPAR | yes |
| QIAGEN | QIA.DE | XETR | yes |
| SPDR S&P 500 ETF Trust | SPY | ARCX | yes |
| Invesco QQQ Trust Series 1 | QQQ | XNAS | yes |
| VANGUARD 500 INDEX FUND ETF SHARES | VOO | ARCX | yes |
| Vanguard Morningstar Total Stock Market ETF | VTI | ARCX | yes |
| SCHWAB U.S. DIVIDEND EQUITY ETF | SCHD | ARCX | yes |
| iShares Core S&P 500 UCITS ETF USD | SXR8.DE | XETR | yes |
| iShares Core MSCI World UCITS ETF USD | EUNL.DE | XETR | yes |
| Xtrackers MSCI World UCITS ETF 1C | XDWD.DE | XETR | yes |
| Xtrackers Euro Stoxx 50 UCITS ETF 1C | XESC.DE | XETR | yes |
| Vanguard FTSE All-World UCITS ETF USD Accumulation | VWCE.DE | XETR | yes |
| SPDR S&P 500 UCITS ETF | SPY5.DE | XETR | yes |
| Amundi MSCI World V UCITS ETF | LCUW.DE | XETR | yes |

## Resolution-route requirements

- Current live runner tests global company-name search, exchange-scoped company-name search, exchange-filtered ticker search, exact metadata for primary observed ticker and optional explicitly provided local ticker. Latest EOD and historical probes use observed listing and explicit MIC.
- If primary suffix route fails, same-name/same-venue website candidates ASML.XAMS, MC.XPAR and AIR.XPAR remain necessary probes before a negative API coverage conclusion. Their observations are candidate evidence, not verified security aliases.
- ABB/Swisscom website MIC XSWX conflicts with frozen public directory MIC BTEE. Actual live directory response must determine provider MIC. A normalizer must retain raw MIC and explicit mapping provenance, not silently change venue.
- Schaeffler has no observed XETR candidate. Global API name search may establish API/website parity for alternative listings but must not establish domestic coverage or replace the primary security with Schaeffler India.
- Search matches can include different issuers: Siemens Energy/Healthineers, Fresenius Medical Care, Abbott, Nordea/Allianz investment funds. Name substrings never establish aliases. Executable aliases are appropriately empty in all 42 current test cases.
- A paginated company search returning total beyond downloaded pages remains PARTIAL and does not justify API_COVERAGE_GAP. For broad queries SAP/Santander/BBVA, venue-scoped exact ticker probes are particularly important.
- Exact ticker metadata, EOD presence, stockprice presence and holdings presence are separate capabilities; directory membership alone does not prove the others.
- The baseline main has no Marketstack adapter. VU_FOUND must distinguish existing product universe from the observational branch adapter; this audit has no product admission and no canonical identity verification.

## Pending live checks

Verify each raw primary ticker/MIC against website candidates, compare directory and exact symbol representations, detect explicit normalization rejection despite valid provider listing, list unresolved alternate resolution routes, and report account errors by endpoint without converting entitlement failure into coverage absence.

## Authenticated result — run 37636729908

Raw evidence inspected at external private archive. All 325 persisted raw responses match the summary SHA256 manifest. Run reserved 782 credits over 326 attempts; the disparity is a transport attempt without a preserved HTTP response. Observations span 2026-10-07 14:27:33–14:29:53 UTC, before European market close.

**Directory and exact metadata parity: PASS for every observed primary home listing.** All 26 domestic DE/EU stock candidates and all 12 ETF candidates occur in authenticated raw directory responses at the observed website MIC and resolve through exact ticker metadata. This proves representative primary-listing parity, not completeness of the entire worldwide directory.

Schaeffler global authenticated company search returns 11 listings; all 10 observed website alternative tickers are retained plus SCHAEFFLER.BO. There is no observed XETR domestic listing. The scoped query returns no_valid_exchange_provided with a message saying requested symbol data is unavailable; it is not evidence that XETR itself is invalid. This case remains home-listing provider coverage limitation in tested routes; an exact domestic ticker still requires externally verified candidate before an absolute negative assertion.

| Company/fund | Ticker | API exact/directory | Raw latest date | Raw MIC | Branch latest accepted |
|---|---|---|---|---|---|
| adesso | ADN1.DE | yes | 2026-10-06 | XETR | yes |
| HelloFresh | HFG.DE | yes | 2026-10-06 | XETR | yes |
| SAP | SAP.DE | yes | 2026-10-06 | XETR | yes |
| Siemens | SIE.DE | yes | 2026-10-06 | XETR | yes |
| Allianz | ALV.DE | yes | 2026-10-06 | XETR | yes |
| Deutsche Telekom | DTE.DE | yes | 2026-10-06 | XETR | yes |
| HENSOLDT | HAG.DE | yes | 2026-10-06 | XETR | yes |
| RENK | R3NK.DE | yes | 2026-10-06 | XETR | yes |
| Schaeffler | unresolved | alternative listings only | not probed | unresolved | not probed |
| Fresenius | FRE.DE | yes | 2026-10-06 | XETR | yes |
| HAMBORNER REIT | HABA.DE | yes | 2026-10-06 | XETR | yes |
| Alzchem | ACT.DE | yes | 2026-10-05 | XETR | yes |
| Stabilus | STM.DE | yes | 2026-10-06 | XETR | yes |
| SAF-HOLLAND | SFQ.DE | yes | 2026-10-06 | XETR | yes |
| Kontron | SANT.DE | yes | 2026-04-01 | XETR | yes |
| Einhell | EIN3.DE | yes | 2026-04-13 | XETR | yes |
| Nagarro | NA9.DE | yes | 2026-08-27 | XETR | yes |
| ASML | ASML.AS | yes | 2026-10-06 | XAMS | yes |
| LVMH | MC.PA | yes | 2026-10-06 | XPAR | yes |
| ABB | ABBN.SW | yes | 2026-10-06 | XSWX | yes |
| Swisscom | SCMN.SW | yes | 2026-10-06 | XSWX | yes |
| Ferrari | RACE.MI | yes | 2026-10-06 | XMIL | yes |
| Santander | SAN.MC | yes | 2026-10-06 | XMAD | yes |
| BBVA | BBVA.MC | yes | 2026-10-06 | XMAD | yes |
| Nordea | NDA-FI.HE | yes | 2026-10-06 | XHEL | yes |
| Airbus | AIR.PA | yes | 2026-10-06 | XPAR | yes |
| QIAGEN | QIA.DE | yes | 2026-10-06 | XETR | yes |
| SPDR S&P 500 ETF Trust | SPY | yes | 2026-10-06 | ARCX | identityMismatch |
| Invesco QQQ Trust Series 1 | QQQ | yes | 2026-10-06 | XNAS | identityMismatch |
| VANGUARD 500 INDEX FUND ETF SHARES | VOO | yes | 2026-10-06 | ARCX | identityMismatch |
| Vanguard Morningstar Total Stock Market ETF | VTI | yes | 2026-10-06 | ARCX | identityMismatch |
| SCHWAB U.S. DIVIDEND EQUITY ETF | SCHD | yes | 2026-10-06 | ARCX | identityMismatch |
| iShares Core S&P 500 UCITS ETF USD | SXR8.DE | yes | 2026-10-05 | XETR | yes |
| iShares Core MSCI World UCITS ETF USD | EUNL.DE | yes | 2026-10-05 | XETR | yes |
| Xtrackers MSCI World UCITS ETF 1C | XDWD.DE | yes | 2026-08-12 | XETR | yes |
| Xtrackers Euro Stoxx 50 UCITS ETF 1C | XESC.DE | yes | 2026-10-05 | XETR | yes |
| Vanguard FTSE All-World UCITS ETF USD Accumulation | VWCE.DE | yes | 2026-10-05 | XETR | yes |
| SPDR S&P 500 UCITS ETF | SPY5.DE | yes | 2026-10-05 | XETR | yes |
| Amundi MSCI World V UCITS ETF | LCUW.DE | yes | 2025-02-20 | XETR | yes |

### Proven VU normalization/identity error

`micOf` chooses `exchange_code` before `exchange`. Live US EOD raw rows have a human label in exchange_code and a MIC in exchange. SPY/VOO/VTI/SCHD contain exchange_code="NYSE ARCA", exchange="ARCX"; QQQ/AAPL/TSLA/NVDA contain exchange_code="NASDAQ", exchange="XNAS". The adapter wrongly rejects them as identityMismatch despite correct ticker and raw MIC. Required fix: prefer explicit valid MIC fields; preserve provider exchange label separately. Tests must retain mismatch rejection when authoritative MIC actually differs. This affects the new observational adapter, not existing product/Tiingo consumers. Responses 0205,0212,0219,0226,0233,0288,0302,0311 prove it.

The 26 European primary EOD observations avoid this bug only because exchange_code is null. All accept correct symbol/MIC. There is no observed DE/EU normalization identity rejection in this run.

### Freshness and remaining resolution routes

- 22/26 domestic primary stocks have latest EOD 2026-10-06, the completed prior trading day during the run. ACT.DE ends Oct5, SANT.DE Apr1, EIN3.DE Apr13 and NA9.DE Aug27. Raw /eod/latest and raw date-bounded /eod agree; three older listings have empty recent results. This is not a local audit cache or normalization-date error. No market-calendar claim can explain multi-month stagnation.
- Kontron global API retains legacy SANT.DE while listing KTN.F (Frankfurt) and KTN.VI (Vienna). A focused exact symbol-prefix discovery query KTN can check a renamed domestic listing before a broad issuer freshness limit. Do not generate KTN.DE by suffix guess or silently replace XETR with another exchange.
- Einhell raw metadata for EIN3.DE has ISIN DE0005654933 and name Einhell Germany AG; parent Core identity must verify current share class before claiming stale data for the current security. The Frankfurt candidate EIN.F and LSE0N9F.L are different listing observations, not aliases.
- Nagarro alternate observed listings NA9.F and NA9D.XC can compare provider freshness at their explicit observed MIC. Domestic absence of newer bars cannot establish absence across other venues.
- ASML.XAMS, MC.XPAR and AIR.XPAR are observed additional notations, but the preferred .AS/.PA routes already have current EOD and successful identity. No extra candidate calls are necessary for directory parity; stockprice-specific notation remains untested if its API expects other symbols.
- ABB/Swisscom authenticated directory, exact metadata and EOD all use XSWX. The BTEE conflict is confined to the frozen free workbook; do not map actual live venue to BTEE.

### Search/parameter semantics

- SXR8.DE exists and exact/EOD calls succeed even though the full requested company name produces zero global results and no-valid-exchange scoped response. Raw exact name contains literal HTML `&amp;`, while supplied request uses `&`. Exact ticker fallback correctly avoids mistaking a name-search miss for coverage absence.
- Santander scoped query using short name Santander fails while full global search and exact SAN.MC succeed. SPY5 scoped full-company search fails while exact SPY5.DE succeeds. The provider error no_valid_exchange_provided therefore must not map blindly to invalid exchange or plan restriction.
- Allianz global pagination genuinely downloads2350 rows through three pages; Nordea2008 through three pages. Both complete=true and relevant domestic primary listing is found. These are strong live evidence that first-page-only discovery would be incomplete; corrected connector pagination works here.
- No company-search result is silently promoted to canonical product identity. Same-brand siblings/funds remain separate candidates. Empty executable alias arrays remain correct.

### Classification guidance

- stockDirectory: SUPPORTED for observed account with complete multi-page representative searches; do not infer whole universe enumeration from targeted searches.
- Representative website→API primary home parity:26/26 stocks +12/12ETFs. Domestic Schaeffler remains unobserved on both surfaces; API/website alternative-listing parity is positive.
- Website→API→branch EOD: Europe26/26; UCITS7/7; US ETF5/5 raw available but0/5 accepted before proven MIC-field fix. Product VU admission remains intentionally untested and unchanged.
- Current primary EOD availability:38/38 observed primary candidates have some raw bar;26Europe stocks include22 current completed-day,4provider-specific stale cases; UCITS dataset includes substantial stale cases handled by ETF reviewer.
- Do not classify Europe stockprice availability from this run: first qualified SAP response is no_valid_ticker_provided and subsequent stockprice calls are rate_limit_reached. Rate-limited local candidates require a correctly paced followup before capability conclusions.

Final disposition for initial run: representative directory/exact identity parity PASS; normalization MIC precedence BLOCKING until corrected and regression-tested. Remaining stale-security coverage must be stated per explicit observed listing, and stockprice conclusions require the paced followup. No paid API calls or repository edits by this reviewer.

## UCITS holdings alternative-request review

None of the seven bare domestic local tickers occurs as an exact ticker field in any persisted initial live response or the preserved published CSV. A bare request is an explicit endpoint-parameter hypothesis, not an observed alias. The holdings endpoint accepts ticker without exchange and returns fund/series identity, so parent may probe such hypotheses but must require returned ISIN/series/fund identity before associating results with a target.

| Primary | Observed same-name alternatives from raw global search | Raw ID |
|---|---|---|
| SXR8.DE | none; HTML &amp; name-search ambiguity | 0236 |
| EUNL.DE | EUNL.F XFRA, SWDA.MI XMIL, IWDA.AS XAMS, IWDD.AS XAMS, IWDA.L XLON, SWDA.L XLON, SWDA.SW XSWX | 0242 |
| XDWD.DE | XDWD.F XFRA, XDWD.MI XMIL, XDWD.L XLON, XWLD.L XLON, XDWD.SW XSWX, XDWDZ.XC CHIX | 0249 |
| XESC.DE | XESC.F XFRA, XESC.MI XMIL, IH0.SI XSES, XESC.L XLON, XESC.SW XSWX | 0256 |
| VWCE.DE | VWCE.F XFRA, VWCE.MI XMIL, VWCE.AS XAMS, VWRP.L XLON | 0263 |
| SPY5.DE | SSSPF PSGM | 0270 |
| LCUW.DE | LCWD.PA XPAR, LCUW.F XFRA, LCWD.MI XMIL, LCWD.L XLON, LCWL.L XLON | 0277 |

All seven domestic exact metadata responses lack ISIN. Same-name alternatives may differ by trading currency, share class or fund identity, so they cannot be entered into verifiedAliases. Suggested bounded differential: seven bare parameter hypotheses plus one observed LSE/OTC candidate per six cases with alternatives (IWDA.L, XDWD.L, XESC.L, VWRP.L, SSSPF, LCWD.L), at most13holdingsrequests260reservedcredits, plus one or two HTML-encoded company-name directory queries to recover actual SXR8/SPY5 alternatives. This fits an unused500creditallocation and tests notation before a sample-scoped unsupported conclusion. No calls by reviewer.

The initial /etflist raw has52429total string, first1000ticker-only rows beginning000001.SZ/000002.SZ; all12ticker-filtered calls returned this global first page. Therefore a fund-specific search argument is visibly ignored by this API. Do not infer UCITS holdings absence merely from ticker-filtered /etflist result or claim these rows establish holdings support. Global etflist enumeration would require at least53requests×20credits1060credits and is unnecessary for this representative root-cause run.

## Final review across runs 37636729908, 37638353777, 37642262870

The second run rechecks all38observed primary home listings with the corrected EOD MIC extraction:38/38accept successfully, including5/5US ETFs previously rejected. Third run has55attempts,302reservedcredits,53persisted raw responses; all53hashes verified. Two missing responses are timed-out bare iShares holdings requests. The earlier reviewer blocking MIC precedence bug is resolved in actual authenticated responses.

**Final representative Website→API→observational VU parity:**26/26observed domestic stock candidates and12/12ETF candidates remain found in raw directory/exact metadata and accepted for latest EOD after correction. Schaeffler also has positive alternative-listing metadata/EOD evidence, but no observed domestic XETR listing. This yields39/39company/fund cases with some directory evidence and39/39with some EOD observation only when explicitly counting Schaeffler's very stale LSE alternative separately. It must not be advertised as27/27domestic current EOD coverage or39canonical product admissions. Main product data remains outside this observational audit.

### Necessary matrix corrections

- Schaeffler: add alternative0RBK.L, XLON, exact metadata namedSchaefflerAG and raw latest2024-10-02. Metadata ISIN is blank. Website and API alternative-listing parity is positive; domestic venue gap and provider stale alternative EOD remain. Source third0020/0021.
- Kontron: retain SANT.DE stale2026-04-01. Add KTN.DE XETR candidate with fresh2026-10-06EOD, but global ticker result name blank and exact metadata is empty array; binding toKontron remains identity mapping uncertainty, not verified alias. Source second0050/0058/0059. Do not conclude Marketstack lacks newerKontron prices across everynotation, and do not silently replace canonical security.
- iSharesSXR8/SPDRSPY5: third HTML-encoded company-name probes return14/18directory rows respectively, including desired primary listing and multiple alternatives. The API stores literal&amp; and does not treat user plain& name equivalently. Initial full-company search misses were parameter/provider name-format effects, not coverage absence. Source third0018/0019.
- SPDRfalsecandidateSSSPF: initial name directory calls itSPDRS&P500UCITSETF; third exact metadata identifiesShandongSacredPowerSourcesCompanyLimitedQ. This is a provider directory/exact metadata identity conflict. Exclude its holdings404from evidence aboutSPDRUCITS holdings. Actual same-name UCITS candidates now includeSPY5.L/SPX5.L/SPXL.L; still unverified share/fund identity. Source third0014/0019.

### Native snapshots and identity safety

Unscoped native tickers reveal multiple exchanges and issuer collisions. SAP/SIE/ALV/DTE have observedETRDeutscheBörseXetraEUR rows; MC has observedEPAEuronextParisEUR row. Their last-trade strings carry2026-10-07, later than prior-dayEOD, so rawEurope-current-snapshot availability is proven. Snapshot provider codesETR/EPA/AMS are not MICs and differ from EOD request notation. ASMLAMS row is dated2026-08-19; ABBN has only VIEViennaEUR row dated2026-08-18and noSIXhome row. These remain provider-specific snapshot freshness/venue limits in the actual observed response.

ALV/MC also have NYSE rows belonging to different US tickers; selecting the first or native symbol alone would be an identity bug. Required adapter selection uses explicitly observed endpoint-native ticker plus provider venue code/name mapping and retains source provenance. Ticker/exchange name does not prove canonical issuer/share-class identity. No universal realtime delay claim is possible: trade_last has no timezone marker or provider update timestamp. Current-day Europe snapshots supportPARTIALEuropean current-price capability, not a guaranteed zero-delay European realtime feed.

### UCITS holdings conclusion limits

Domestic suffix-qualified requests, bare parameter hypotheses and observed alternatives have returned no usable UCITS holding report. TwoiSharesbare calls time out andSXR8suffix repeats also time out; this is uncertainty, neverNOT_ENTITLED. Fivebare requests and fivevalidLSEsame-name alternatives return dataUnavailable404. The SSSPF404is excluded because exact metadata contradictsETFidentity. No successful report means no proof ofETFholdingspaginationforUCITS; sample-scoped unavailability can be reported, but a global claim thatallUCITSholdingsareUNSUPPORTEDis stronger than observed evidence. Neitherbillingplan noridentity proof was suppliedby404.

Full final matrix corrections are available inlive-parity-final-matrix-corrections.json. No paid calls or repository edits by reviewer. Final review disposition: directory/EOD representative parityPASS; previousMICbugresolvedinlive rerun; snapshotadapterfixmustretain explicitnativevenueidentityroutingandSSSPFconflictmustremainexcludedfromverifiedaliases.
