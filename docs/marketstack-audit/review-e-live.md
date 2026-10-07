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
