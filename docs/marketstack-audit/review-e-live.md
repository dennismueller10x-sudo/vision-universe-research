# Independent live review E — realtime semantics and EOD freshness

Evidence: authenticated Actions run 37636729908, 2026-10-07; exact decrypted responses under `live-private/run-37636729908/vu-marketstack-capability-audit/evidence`. No paid API calls made by this reviewer. This review does not modify repository or products. Initial run reserved 782 conservative credits for 326 requests; that is not an observed provider billing delta.

## Initial findings requiring correction / follow-up

1. `/stockprice` routing is correctly separate from IEX intraday, but endpoint pacing is deficient. SAP.DE+XETR returns HTTP404 `no_ticker_or_exchange_found` (raw0019, 14:27:38.421Z). All remaining 13 qualified/local Europe snapshot requests return HTTP429 `rate_limit_reached`, raw0020 through0154, latest14:28:13.589Z. The first local SAP probe follows the qualified request by136ms. These responses establish throttling; they do not establish missing plan entitlement or missing Europe coverage. Follow-up must conservatively space `/stockprice` requests at least61seconds and test explicit local symbols independently. Numeric rate exact value is not certified by this run; a60second policy is conservative empirical remediation.
2. `micOf` prioritizes `exchange_code` over `exchange`. Actual US EOD responses carry descriptive `exchange_code='NASDAQ'/'NYSE ARCA'` together with ISO MIC `exchange='XNAS'/'ARCX'`. This rejects valid AAPL/TSLA/NVDA and five US ETF EOD observations as identityMismatch. Use actual valid MIC fields for identity and preserve provider descriptive exchange code independently. EuropeEODrows mostly have exchange_code=null and therefore normalize correctly.
3. Europe intraday responses are HTTP200, pagination count0/total0 at both15min and1min for all7 latestProbe names. No plan-entitlement error occurs. This supports a coverage limitation for the tested exact qualified listings, not a global plan limitation. A bounded follow-up should check documented local/hyphen notation and a US15min/1min control; do not derive Europe snapshot capabilities from this result.

## EOD latest and freshness

The actual requests occur14:27–14:29UTC (16:27–16:29CEST), before the ordinary continental Europe closing auction at15:30UTC. Therefore October6 is the last completed regular trading session. October7 EOD is not yet required to establish freshness. Provider `date='2026-10-06T00:00:00+0000'` denotes trading date, not midnight trading/publication time. Retrieval time and provider publication/update time must remain distinct; no publication/update time is reported by these EOD rows.

| Company | Provider ticker / MIC | Raw EOD date | Close | Raw currency | Raw response |
|---|---|---|---:|---|---|
| SAP | SAP.DE / XETR |2026-10-06|188.60|null|0017|
| Siemens |SIE.DE / XETR|2026-10-06|279.00|null|0032|
| Allianz |ALV.DE / XETR|2026-10-06|420.70|null|0044|
| Deutsche Telekom |DTE.DE / XETR|2026-10-06|26.41|null|0054|
| ASML |ASML.AS / XAMS|2026-10-06|1636.40|EUR|0126|
| LVMH |MC.PA / XPAR|2026-10-06|385.60|EUR|0141|
| ABB |ABBN.SW / XSWX|2026-10-06|82.58|CHF|0151|

All seven latest EOD rows survive normalization with identical trading date and close. The separate history request (`date_from=2026-10-01,date_to=2026-10-07,sort=ASC`) has four rows, latest October6, matching `/eod/latest`. Adesso/HelloFresh/HENSOLDT/RENK similarly have October6 available raw and normalized. Current qualified/no-cache usage disproves a blanket claim that Marketstack Europe stocks only reach October5.

Across26 European stock listings that actually receive EOD probes,22 are October6. Exceptions: ACT.DE October5(raw0090/recent0091), SANT.DE April1(raw0108/recent0109 empty), EIN3.DE April13(raw0114/recent0115 empty), NA9.DE August27(raw0120/recent0121 empty). Schaeffler has no providerTicker in initialplan and therefore no EOD call. SANT.DE is an observed legacy identity: stale data for a legacy symbol alone cannot prove the current Kontron listing is stale. New observed aliases and alternate documented lookup routes must be checked before concluding PROVIDER_DOES_NOT_HAVE.

UCITS latest dates are: SXR8.DE/EUNL.DE/XESC.DE/VWCE.DE/SPY5.DE October5; XDWD.DE August12; LCUW.DE February20 2025. Raw provider responses already contain those dates, and normalized observations preserve them. No evidence of normalization/date truncation explains these observations. For UCITS initial plan does not separately request recenthistory, so a focused alternative route/date-bound test is needed before a definitive publication/identity conclusion. These stale responses must not silently pass a product freshness gate.

Initial `/stockprice` does not provide any successful price/currency/MIC/trade_last tuple. Therefore no measured Europe realtime or delayed price capability follows from this run. Correct initial status is unresolved due to throttling, with successful globalEOD capability but partial listing freshness. The follow-up may resolve this without modifying any production price truth.

## Paced second run — 37638353777

Evidence:145 requests,411 conservative reservedcredits. Stockprice calls are61seconds apart and there are zero429s, resolving the initial probe-throttling defect. All seven European native symbols with their documentedMIC query return404, and each qualified symbol without exchange also returns404. These results still do not answer nativeunscoped resolution because a US positivecontrol exposes a provider parameter mismatch.

Raw0128 `/stockprice?ticker=AAPL` returns five distinct worldwide venue snapshots: BCBA(Argentina,ARS), BMV(Mexico,MXN), NASDAQ(US,USD), VIE(Austria,EUR), WSE(Poland,PLN). Raw0129 the identical ticker with documented `exchange=XNAS` returns404. Therefore `/stockprice` accepts data independent of global EODsymbol/MIC conventions; adding an ISO MIC can turn a supportedstock into a negative result. This is an endpoint-selection/parameter/mapping issue, not proof of a plan block. An endpoint-specific explicit snapshotTicker must be queried without the rejectedMIC parameter, then returnedlistings filtered using actual MIC or explicitly verified provider-code/MIC evidence. No automated suffixstripping/countryonly selection is justified.

NASDAQ AAPL rawprice335.36 USD, trade_last='2026-10-07 10:32:43', retrieved14:41:12.407Z. That timestamp has no UTCoffset/timezone. Assuming NewYorkexchange-local time would imply age8m29s, but the response does not certify that convention. Consequently success supports lastknownsnapshot availability; exact realtime or delay cannot be certified. Foreign AAPL snapshots include old May/August dates. Worldwide coverage marketing alone cannot promise fresh snapshots at every returned venue, and Austrian/Polish AAPL rows cannot prove availability of SAP/ASML Europeanhome listings.

US intraday positivecontrol succeeds at both15min(raw0112) and1min(raw0113). Both report exchangeIEXG, with marketstack_last derived reference price and null last/bid/ask fields. At1min, date='2026-10-07T14:40:00+0000', marketstack_last335.05, retrieved14:41:08.196Z (~68seconds since intervaltimestamp). At15min, date14:30UTC, marketstack_last335.345, retrieved14:41:07.521Z. This establishes Professional1minute USIEXderiveddata entitlement; no fullTOPSquote entitlement follows. Fifteenminute interval age is not independent quote-feed delay.

European nativeintraday symbols with actualMIC all return200 empty count0,total0. The seven hyphenformatted candidates return422 `no_valid_symbols_provided`. Combined with first-runqualified15min/1min empty responses, these fail to obtain Europehome intraday data. Classification for the tested Europeanhome listings is UNSUPPORTED, with US intraday SUPPORTED. There is no401/403/nonentitlement error: do not label Europeabsence NOT_ENTITLED.

Current second-run practicalclassification: globalEOD SUPPORTED with partiallistingfreshness; intradayUS SUPPORTED(derivedIEX); intradayEurope UNSUPPORTED for testedhome listings; realtimeUS PARTIAL(availablelastknown snapshot, uncertifiedtimestamp/delay); realtimeEurope awaiting the necessary nativeunscoped finalresolution rather than being forcednegative after providerMICparameter failure.

## Third authenticated run — 37642262870: Europe snapshots exist

The required nativeunscoped lookup succeeds for all7 querysymbols, exposing the missing connector venue mappings rather than a blanket providerEuropecapability gap. Exact snapshot native ticker is an explicitly provided canonicalTicker/snapshotTicker; it is not inferred by stripping a suffix. The following rawhomevenue observations are identified from the fullreturned multivenue responses:

| Company | Query / provider venue → MIC | Price / currency | Raw trade_last | UTC retrieval | Response |
|---|---|---|---|---|---|
| SAP |SAP / ETR → XETR|186.38 EUR|2026-10-07 16:45:46|2026-10-07T15:11:06.336Z|0047|
| Siemens |SIE / ETR → XETR|270.05 EUR|2026-10-07 16:41:59|2026-10-07T15:12:07.389Z|0048|
| Allianz |ALV / ETR → XETR|416 EUR|2026-10-07 16:46:16|2026-10-07T15:13:08.484Z|0049|
| Deutsche Telekom |DTE / ETR → XETR|27.04 EUR|2026-10-07 16:41:45|2026-10-07T15:14:09.482Z|0050|
| ASML |ASML / AMS → XAMS|1550 EUR|2026-08-19 13:32:51|2026-10-07T15:15:10.502Z|0051|
| LVMH |MC / EPA → XPAR|387.5 EUR|2026-10-07 16:52:10|2026-10-07T15:16:11.611Z|0052|
| ABB |ABBN / only VIE returned; no XSWX|86.62 EUR foreignvenue only|2026-08-18 13:00:24|2026-10-07T15:17:12.986Z|0053|

Five of7 Europeanhome listings have actual currentday snapshots; a sixth(ASMLAmsterdam) is available but stale; ABB has no Swisshome observation in the returned result. ASMLNASDAQ freshUSD is a distinct listing and cannot replace the staleAmsterdamEUR observation. ABBViennaEUR cannot stand in for SIXSwissCHF. NYSEALV, DTE, and MC are different issuers, so same ticker alone never selects those rows for Allianz/Telekom/LVMH. Retain all original rows in raw evidence while selecting exactly one verifiedhomevenue for normalization.

Raw0045 `/stockprice?ticker=AAPL&exchange=NASDAQ` now returns200, proving the endpoint's actual provider exchange-code parameter works. Together with run2 XNAS404 this is direct evidence of documentation/runtime mismatch: documentedISO MIC is not the accepted querycode in this endpoint. Unscoped requests followed by exactverified provider venue selection avoid misleading404s.

`trade_last` remains timezonefree in every successful snapshot. If continentaltimestamps mean exchange-local CEST, the five currentday Europequotes are approximately24–32minutes older than retrieval. This conditional calculation is evidence of an available lastknown/delayed snapshot, not a guarantee of fixeddelay or true realtime. No raw update/publicationtimestamp exists. **realtimeEurope=PARTIAL** is therefore justified: currentdayprices are obtainable for five testedhome listings, but exactrealtime semantics are uncertified and listingfreshness is partial. IntradayEurope remains unsupported for testedhome listings independently of this snapshot success. A broad statement 'Marketstack Europe is EODonly' is false.

## Root fix and offline verification

Owned files changed: `providers/marketstack/audit-adapter.js`, `providers/marketstack/tests/audit.test.mjs`, new `providers/marketstack/snapshot-exchange-mappings.json`. Default mappings ETR→XETR, EPA→XPAR, AMS→XAMS, NASDAQ→XNAS carry auditable run/response IDs andSHA256 references to live venue rows plus exactticker metadataMICs. Exported mappingevidence is deeply frozen. The adapter omits the rejectedMICquery, uses only explicit snapshotTicker orcanonicalTicker, accepts a unique expectedvenue, preserves venuecode/provenance andrawfields, rejects conflictingMIC, ambiguousduplicate listings, foreignsame-ticker issuers, and missinghomevenues. A contradictory reportedexchangename cannot override the defaultcode mapping. Description is preserved from actual description/aboutmetadata, with raw unchanged.

Offline replay against all8 real snapshot bodies(AAPL plus7Europe) accepts AAPL and six Europehome rows, retains ASML'sAugust19 timestamp, and rejects ABB as snapshotVenueUnverified. No APIcalls are made by this replay. Output: `live-private/final-snapshot-raw-replay.json`. Node22 all41 provider tests pass, including rawpreservation, explicitalias override/noimplicitrewrite, venueconflicts/foreignissuers, timestampuncertainty, and immutableevidence regressions. Final post-fix authenticatedrun must still verify the nowcompiledadapter against freshresponses; parent owns that dispatch.

## Final post-fix authenticated verification — 37645399592

**PASS for the snapshot root fix and realtime semantic gates.** Independently checked all 21 preserved response SHA256 values, exact raw wrapper and selected row preservation, selected price/currency/timestamp equality, retained venue mapping provenance, and all seven latest EOD dates. This final run made 21 requests and reserved 78 conservative credits. The reviewer made no API requests and no repository changes during this verification.

The corrected adapter calls `/stockprice` with explicit native symbols SAP, SIE, ALV, DTE, ASML, MC, ABBN and AAPL, without the incorrect ISO MIC query parameter. It selects the expected home venue through auditable code mappings. Actual final results:

| Company | Selected venue | Price/currency | Raw trade date | Response | Result |
|---|---|---|---|---|---|
| SAP | XETR / ETR | 186.92 EUR | 2026-10-07 | 0007 | Accepted |
| Siemens | XETR / ETR | 270.60 EUR | 2026-10-07 | 0009 | Accepted |
| Allianz | XETR / ETR | 416.10 EUR | 2026-10-07 | 0011 | Accepted |
| Deutsche Telekom | XETR / ETR | 27.04 EUR | 2026-10-07 | 0013 | Accepted |
| ASML | XAMS / AMS | 1550 EUR | 2026-08-19 | 0015 | Accepted as a stale observation |
| LVMH | XPAR / EPA | 388 EUR | 2026-10-07 | 0017 | Accepted |
| ABB | No XSWX venue returned | Only Vienna EUR | 2026-08-18 | 0019 | snapshotVenueUnverified |
| AAPL | XNAS / NASDAQ | 335.55 USD | 2026-10-07 | 0021 | Accepted |

Five of seven European home listings have current-day snapshots. ASML's stale Amsterdam quote is never replaced by its fresh NASDAQ USD quote. ABB's Vienna EUR quote correctly fails venue verification rather than being admitted as a Swiss CHF price. Only AAPL's NASDAQ venue is selected from its five original worldwide rows. Foreign same-ticker issuers, including NYSE ALV/DTE/MC, are excluded from the requested European listings.

Every accepted snapshot retains `timestampTimezone=NOT_REPORTED`, `delayState=UNKNOWN` and `providerUpdateTimestamp=null`. If the continental Europe timestamps mean exchange-local CEST, their observed ages are SAP 23m56.7s, Siemens 33m56.7s, Allianz 25m23.8s, Telekom 30m13.9s and LVMH 26m26.0s. This proves practical current-day snapshot availability while preserving uncertainty about exact feed delay and timestamp timezone. **Europe snapshot capability is PARTIAL**, with no guarantee of true realtime or a fixed 15-minute delay. The blanket claim that Europe is EOD-only is definitively corrected by actual provider responses and successful VU normalization in this authenticated post-fix run.

All seven separate `/eod/latest` calls still report October 6, preserving dates and prices exactly and selecting XETR/XAMS/XPAR/XSWX correctly. These final EOD requests occur at 15:41–15:47 UTC, approximately 11–17 minutes after the ordinary continental closing auction. October 7 EOD had not appeared in those raw responses. Without a verified publication deadline, that short post-close interval does not establish an overdue feed. It cannot be attributed to VU cache because the requests use TTL0 and the new raw provider bytes already report October 6. The initial pre-close history/latest comparison had already proved October 6 availability for these names, disproving the blanket October 5 stock-freshness finding.

No outstanding snapshot connector or realtime semantic blocker was found. Remaining provider limits are the old ASML Amsterdam snapshot, missing ABB Swiss snapshot, absent intraday data for the tested European home listings, missing timezone/update/delay metadata, and uneven EOD listing freshness. Product admission remains outside this observational audit adapter.
