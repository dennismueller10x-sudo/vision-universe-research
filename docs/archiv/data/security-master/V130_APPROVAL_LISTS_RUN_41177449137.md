# Prüftabellen der Freigabeliste 1.1.0 (Probelauf 41177449137, main f84e86b, 31.10.2026)

Erzeugt von `scripts/market/build-security-master-approval-list.mjs --markdown-out`. Nicht freigabefähige Einträge vollständig, freigabefähige als Stichprobe (vollständig in `v130-approved-changes-1.1.0.json`).

### canonical_id-Wechsel: 87 gesamt, 63 freigabefähig, 24 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| TICKER_REUSE_NEW_LISTING | 27 |
| MOVED_TO_OTC | 19 |
| PROVIDER_HISTORY_RESTARTED | 15 |
| EXCHANGE_LABEL_RENAMED | 7 |
| TWO_ACTIVE_LISTINGS | 5 |
| START_DATE_RESTATED | 5 |
| EXCHANGE_TRANSFER | 2 |
| MOVED_TO_OTC_SEC_EVIDENCE | 2 |
| LISTING_RESTART | 2 |
| UNCLEAR_REPLACEMENT | 1 |
| HISTORICAL_ROW_DROPPED | 1 |
| DELISTED_TO_OTC_SEC_EVIDENCE | 1 |

**Nicht freigabefähig (vollständig, 24):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_ADIL | tiingo:NASDAQ:ADIL:2018-07-27 | tiingo:NASDAQ:ADIL:2026-10-29 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2018-07-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-29: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_APAD | tiingo:NYSE:APAD:2025-08-27 | tiingo:NASDAQ:APAD:2025-08-27 | EXCHANGE_TRANSFER | gleiches Listing (Beginn 2025-08-27), Börsenwechsel NYSE → NASDAQ; SEC bestätigt nicht (APAD nicht gelistet); zudem SEC-Delisting-Beleg 8-K_2.01+3.01 (wirksam 2026-05-08) gegen die aktive Zeile an NASDAQ |
| ref_CAM | tiingo:NYSE:CAM:1995-07-05 | tiingo:NYSE ARCA:CAM:2025-10-06 | UNCLEAR_REPLACEMENT | Altzeile entfallen, ersetzt durch ein Listing an anderer Börse mit anderem Beginn (NYSE 1995-07-05 → NYSE ARCA 2025-10-06); die Anbieterliste belegt das Ende des alten Listings nicht |
| ref_CHOW | tiingo:AMEX:CHOW:2025-09-16 | tiingo:NYSE MKT:CHOW:2025-09-16\|tiingo:NYSE MKT:CHOW:2026-10-23 | TWO_ACTIVE_LISTINGS | zwei aktive Anbieterzeilen (tiingo:NYSE MKT:CHOW:2026-10-23, tiingo:NYSE MKT:CHOW:2025-09-16); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_EFTY | tiingo:NASDAQ:EFTY:2025-08-08 | tiingo:NASDAQ:EFTY:2025-08-08\|tiingo:NASDAQ:EFTY:2026-10-19 | TWO_ACTIVE_LISTINGS | zwei aktive Anbieterzeilen (tiingo:NASDAQ:EFTY:2025-08-08, tiingo:NASDAQ:EFTY:2026-10-19); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_FGNX | tiingo:NASDAQ:FGNX:2014-04-01 | tiingo:NASDAQ:FGNX:2026-09-28 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2014-04-01) beim Anbieter entfallen, neue Zeile erst seit 2026-09-28: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_FGNXP | tiingo:NASDAQ:FGNXP:2018-02-28 | tiingo:NASDAQ:FGNXP:2026-09-28 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2018-02-28) beim Anbieter entfallen, neue Zeile erst seit 2026-09-28: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_LESL | tiingo:NASDAQ:LESL:2020-10-29 | tiingo:NASDAQ:LESL:2026-10-05 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2020-10-29) beim Anbieter entfallen, neue Zeile erst seit 2026-10-05: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_LRHC | tiingo:NASDAQ:LRHC:2023-10-09 | tiingo:NASDAQ:LRHC:2026-10-19 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-10-09) beim Anbieter entfallen, neue Zeile erst seit 2026-10-19: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_NAVI | tiingo:NASDAQ:NAVI:2014-04-17 | tiingo:NASDAQ:NAVI:2014-04-17\|tiingo:NASDAQ:NAVI:2026-10-29 | TWO_ACTIVE_LISTINGS | zwei aktive Anbieterzeilen (tiingo:NASDAQ:NAVI:2026-10-29, tiingo:NASDAQ:NAVI:2014-04-17); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_NVNI | tiingo:NASDAQ:NVNI:2023-09-29 | tiingo:NASDAQ:NVNI:2026-10-09 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-09-29) beim Anbieter entfallen, neue Zeile erst seit 2026-10-09: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_NVNIW | tiingo:NASDAQ:NVNIW:2023-10-02 | tiingo:PINK:NVNIW:2026-10-09 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-10-02) beim Anbieter entfallen, neue Zeile erst seit 2026-10-09: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_QNCX | tiingo:NASDAQ:QNCX:2019-05-09 | tiingo:NASDAQ:QNCX:2026-10-12 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2019-05-09) beim Anbieter entfallen, neue Zeile erst seit 2026-10-12: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_RITR | tiingo:NASDAQ:RITR:2024-08-23 | tiingo:NASDAQ:RITR:2026-09-17 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2024-08-23) beim Anbieter entfallen, neue Zeile erst seit 2026-09-17: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_SPKL | tiingo:NASDAQ:SPKL:2023-11-27 | tiingo:NASDAQ:SPKL:2026-10-07 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-11-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_SPKLU | tiingo:NASDAQ:SPKLU:2023-10-06 | tiingo:PINK:SPKLU:2026-10-07 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-10-06) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_SPKLW | tiingo:NASDAQ:SPKLW:2023-11-27 | tiingo:PINK:SPKLW:2026-10-07 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2023-11-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_TETE | tiingo:NASDAQ:TETE:2022-03-09 | tiingo:NASDAQ:TETE:2026-10-07 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2022-03-09) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_TETEW | tiingo:NASDAQ:TETEW:2022-03-14 | tiingo:NASDAQ:TETEW:2026-10-07 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2022-03-14) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_TRT | tiingo:AMEX:TRT:1995-04-24 | tiingo:NYSE MKT:TRT:1995-04-24 | EXCHANGE_LABEL_RENAMED | gleiches Listing (Beginn 1995-04-24), Börsenbezeichnung AMEX → NYSE MKT (dieselbe Börsenfamilie NYSE); SEC widerspricht (TRT → CIK 0000732026 TRIO-TECH INTERNATIONAL (Nasdaq)) |
| ref_TRUE | tiingo:NASDAQ:TRUE:2000-05-02 | tiingo:NASDAQ:TRUE:2014-05-16 | START_DATE_RESTATED | gleiches Listing an NASDAQ, Anbieter korrigiert den Beginn 2000-05-02 → 2014-05-16; SEC bestätigt nicht (TRUE nicht gelistet) |
| ref_VTAK | tiingo:AMEX:VTAK:2018-09-27 | tiingo:AMEX:VTAK:2026-10-05 | PROVIDER_HISTORY_RESTARTED | Altzeile (Beginn 2018-09-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-05: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht |
| ref_XRPN | tiingo:NASDAQ:XRPN:2025-06-24 | tiingo:NASDAQ:XRPN:2025-06-24\|tiingo:NASDAQ:XRPN:2026-10-09 | TWO_ACTIVE_LISTINGS | zwei aktive Anbieterzeilen (tiingo:NASDAQ:XRPN:2026-10-09, tiingo:NASDAQ:XRPN:2025-06-24); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_XRPNW | tiingo:NASDAQ:XRPNW:2025-06-24 | tiingo:NASDAQ:XRPNW:2025-06-24\|tiingo:NASDAQ:XRPNW:2026-10-12 | TWO_ACTIVE_LISTINGS | zwei aktive Anbieterzeilen (tiingo:NASDAQ:XRPNW:2025-06-24, tiingo:NASDAQ:XRPNW:2026-10-12); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |

**Freigabefähig (Stichprobe je Klasse, höchstens 8; vollständig in der Freigabedatei):**

| securityId | von | nach | Klasse | Beleg |
|---|---|---|---|---|
| ref_AAAP | tiingo:NASDAQ:AAAP:2015-11-11 | tiingo:NASDAQ:AAAP:2015-11-11\|tiingo:NASDAQ:AAAP:2026-06-23 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2015-11-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2015-11-11..2018-02-20 INACTIVE EQUITY_COMMON; NASDAQ:2026-06-23..2026-10-30 ACTIVE ETF] · SEC: AAAP nicht gelistet |
| ref_ABI | tiingo:NASDAQ:ABI:2009-05-11 | tiingo:NASDAQ:ABI:2009-05-11\|tiingo:NASDAQ:ABI:2025-06-26 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2009-05-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-06-26..2026-10-30 ACTIVE ETF; NASDAQ:2009-05-11..2014-05-15 INACTIVE EQUITY_COMMON] · SEC: ABI nicht gelistet |
| ref_AEC | tiingo:NASDAQ:AEC:1993-11-11 | tiingo:NASDAQ:AEC:1993-11-11\|tiingo:NASDAQ:AEC:2025-09-18 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:1993-11-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-09-18..2026-10-30 ACTIVE EQUITY_COMMON geeignet; NASDAQ:1993-11-11..2015-08-14 INACTIVE EQUITY_COMMON] · SEC: AEC → CIK 0001519469 ANFIELD ENERGY INC. (Nasdaq) |
| ref_ALPS | tiingo:NASDAQ:ALPS:2022-09-28 | tiingo:EXPM:ALPS:2021-10-18\|tiingo:NASDAQ:ALPS:2022-09-28\|tiingo:NASDAQ:ALPS:2025-10-31 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2022-09-28..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-10-31..2026-10-30 ACTIVE EQUITY_COMMON geeignet; EXPM:2021-10-18..2022-09-27 INACTIVE EQUITY_COMMON; NASDAQ:2022-09-28..2023-07-20 INACTIVE EQUITY_COMMON] · SEC: ALPS → CIK 0002025774 Alps Group Inc (Nasdaq) |
| ref_AMBR | tiingo:NASDAQ:AMBR:2014-03-21 | tiingo:NASDAQ:AMBR:2014-03-21\|tiingo:NASDAQ:AMBR:2025-03-13 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2014-03-21..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2014-03-21..2019-07-29 INACTIVE EQUITY_COMMON; NASDAQ:2025-03-13..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: AMBR → CIK 0001697818 Amber International Holding Ltd (Nasdaq) |
| ref_ANV | tiingo:NASDAQ:ANV:2007-05-10 | tiingo:NASDAQ:ANV:2007-05-10\|tiingo:NASDAQ:ANV:2026-02-03 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2007-05-10..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2007-05-10..2015-03-09 INACTIVE EQUITY_COMMON; NASDAQ:2026-02-03..2026-10-30 ACTIVE ETF] · SEC: ANV nicht gelistet |
| ref_ARTC | tiingo:NASDAQ:ARTC:1996-02-05 | tiingo:NASDAQ:ARTC:1996-02-05\|tiingo:NASDAQ:ARTC:2026-02-27 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:1996-02-05..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:1996-02-05..2014-05-29 INACTIVE EQUITY_COMMON; NASDAQ:2026-02-27..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: ARTC → CIK 0002086545 Art Technology Acquisition Corp. (Nasdaq) |
| ref_ATCX | tiingo:NASDAQ:ATCX:2019-01-23 | tiingo:NASDAQ:ATCX:2019-01-23\|tiingo:NASDAQ:ATCX:2026-01-09 | TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2019-01-23..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2019-01-23..2023-04-19 INACTIVE EQUITY_COMMON; NASDAQ:2026-01-09..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: ATCX → CIK 0001684688 ATLAS CRITICAL MINERALS Corp (Nasdaq) |
| ref_AMZE | tiingo:NYSE MKT:AMZE:2021-12-14 | tiingo:OTCMKTS:AMZE:2021-12-14 | MOVED_TO_OTC | prev [NYSE MKT:2021-12-14..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2021-12-14..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: AMZE → CIK 0001880343 AMAZE HOLDINGS, INC. (OTC) |
| ref_CLRCU | tiingo:NASDAQ:CLRCU:2022-04-28 | tiingo:OTCMKTS:CLRCU:2022-04-28 | MOVED_TO_OTC | prev [NASDAQ:2022-04-28..2026-09-10 ACTIVE UNIT] → next [OTCMKTS:2022-04-28..2026-10-30 ACTIVE UNIT] · SEC: CLRCU nicht gelistet |
| ref_FEED | tiingo:NASDAQ:FEED:2017-06-13 | tiingo:OTCMKTS:FEED:2017-06-13 | MOVED_TO_OTC | prev [NASDAQ:2017-06-13..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2017-06-13..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: FEED → CIK 0001326706 ENvue Medical, Inc. (OTC) |
| ref_ILLRW | tiingo:NASDAQ:ILLRW:2019-07-30 | tiingo:OTCMKTS:ILLRW:2019-07-30 | MOVED_TO_OTC | prev [NASDAQ:2019-07-30..2026-09-10 ACTIVE WARRANT] → next [OTCMKTS:2019-07-30..2026-10-30 ACTIVE WARRANT] · SEC: ILLRW → CIK 0001769624 Triller Group Inc. (OTC) |
| ref_IVCB | tiingo:NASDAQ:IVCB:2022-02-04 | tiingo:OTCMKTS:IVCB:2022-02-04 | MOVED_TO_OTC | prev [NASDAQ:2022-02-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2022-02-04..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: IVCB nicht gelistet |
| ref_IVCBU | tiingo:NASDAQ:IVCBU:2021-12-15 | tiingo:OTCMKTS:IVCBU:2021-12-15 | MOVED_TO_OTC | prev [NASDAQ:2021-12-15..2026-09-10 ACTIVE UNIT] → next [OTCMKTS:2021-12-15..2026-10-30 ACTIVE UNIT] · SEC: IVCBU nicht gelistet |
| ref_LILMW | tiingo:NASDAQ:LILMW:2021-09-15 | tiingo:OTCMKTS:LILMW:2021-09-15 | MOVED_TO_OTC | prev [NASDAQ:2021-09-15..2026-09-10 ACTIVE WARRANT] → next [OTCMKTS:2021-09-15..2026-10-30 ACTIVE WARRANT] · SEC: LILMW nicht gelistet |
| ref_MSSAU | tiingo:NASDAQ:MSSAU:2022-04-01 | tiingo:OTCMKTS:MSSAU:2022-04-01 | MOVED_TO_OTC | prev [NASDAQ:2022-04-01..2026-09-10 ACTIVE UNIT] → next [OTCMKTS:2022-04-01..2026-10-30 ACTIVE UNIT] · SEC: MSSAU nicht gelistet |
| ref_AZTR | tiingo:AMEX:AZTR:2023-06-16 | tiingo:NYSE MKT:AZTR:2023-06-16 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2023-06-16..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2023-06-16..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: AZTR → CIK 0001701478 Azitra, Inc. (NYSE) |
| ref_MMA | tiingo:AMEX:MMA:2024-03-28 | tiingo:NYSE MKT:MMA:2024-03-28 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2024-03-28..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2024-03-28..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: MMA → CIK 0001981519 MIXED MARTIAL ARTS GROUP LTD (NYSE) |
| ref_MTNB | tiingo:AMEX:MTNB:2014-08-18 | tiingo:NYSE MKT:MTNB:2014-08-18 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2014-08-18..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2014-08-18..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: MTNB → CIK 0001582554 Matinas BioPharma Holdings, Inc. (NYSE) |
| ref_OPTT | tiingo:AMEX:OPTT:2007-04-25 | tiingo:NYSE MKT:OPTT:2007-04-25 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2007-04-25..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2007-04-25..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: OPTT → CIK 0001378140 Ocean Power Technologies, Inc. (NYSE) |
| ref_POAS | tiingo:AMEX:POAS:2025-11-13 | tiingo:NYSE MKT:POAS:2025-11-13 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2025-11-13..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2025-11-13..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: POAS → CIK 0002024258 PHAOS TECHNOLOGY HOLDINGS (CAYMAN) Ltd (NYSE) |
| ref_SOAR | tiingo:AMEX:SOAR:2022-01-21 | tiingo:NYSE MKT:SOAR:2022-01-21 | EXCHANGE_LABEL_RENAMED | prev [AMEX:2022-01-21..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2022-01-21..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: SOAR → CIK 0001853070 SOAR AI, Inc. (NYSE) |
| ref_DBRG_P_H | tiingo:NYSE:DBRG-P-H:2017-01-11\|tiingo:NYSE:DBRG-P-H:2021-06-22 | tiingo:NYSE:DBRG-P-H:2021-06-22 | HISTORICAL_ROW_DROPPED | prev [NYSE:2017-01-11..2021-06-22 INACTIVE PREFERRED; NYSE:2021-06-22..2026-09-10 ACTIVE PREFERRED] → next [NYSE:2021-06-22..2026-10-02 ACTIVE PREFERRED] · SEC: DBRG-P-H nicht gelistet |
| ref_ELE | tiingo:NASDAQ:ELE:2026-05-26 | tiingo:NASDAQ:ELE:2025-11-25 | START_DATE_RESTATED | prev [NASDAQ:2026-05-26..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-11-25..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: ELE → CIK 0002086771 Elemental Royalty Corp (Nasdaq) |
| ref_MDCX | tiingo:NASDAQ:MDCX:2016-02-03 | tiingo:NASDAQ:MDCX:2011-02-23 | START_DATE_RESTATED | prev [NASDAQ:2016-02-03..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2011-02-23..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: MDCX → CIK 0001997296 Medicus Pharma Ltd. (Nasdaq) |
| ref_OGC | tiingo:NYSE:OGC:2026-05-26 | tiingo:NYSE:OGC:2026-04-07 | START_DATE_RESTATED | prev [NYSE:2026-05-26..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:2026-04-07..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: OGC → CIK 0001487326 OceanaGold Corp (NYSE) |
| ref_RCAT | tiingo:NASDAQ:RCAT:2017-09-22 | tiingo:NASDAQ:RCAT:2008-01-31 | START_DATE_RESTATED | prev [NASDAQ:2017-09-22..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2008-01-31..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: RCAT → CIK 0000748268 Red Cat Holdings, Inc. (Nasdaq) |
| ref_GCTK | tiingo:NASDAQ:GCTK:2013-04-25 | tiingo:OTCMKTS:GCTK:2013-04-25 | MOVED_TO_OTC_SEC_EVIDENCE | prev [NASDAQ:2013-04-25..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2013-04-25..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: GCTK → CIK 0001506983 Glucotrack, Inc. (Nasdaq) |
| ref_LNAI | tiingo:NASDAQ:LNAI:2015-02-02 | tiingo:OTCMKTS:LNAI:2015-02-02 | MOVED_TO_OTC_SEC_EVIDENCE | prev [NASDAQ:2015-02-02..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2015-02-02..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: LNAI → CIK 0001527728 Lunai Bioworks Inc. (Nasdaq) |
| ref_INCR | tiingo:NASDAQ:INCR:2014-11-07\|tiingo:NASDAQ:INCR:2019-01-28 | tiingo:NASDAQ:INCR:2014-11-07\|tiingo:NASDAQ:INCR:2019-01-28\|tiingo:NASDAQ:INCR:2021-09-01 | LISTING_RESTART | prev [NASDAQ:2019-01-28..2021-08-31 INACTIVE EQUITY_COMMON; NASDAQ:2014-11-07..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2021-09-01..2026-10-30 ACTIVE EQUITY_COMMON geeignet; NASDAQ:2019-01-28..2021-08-31 INACTIVE EQUITY_COMMON; NASDAQ:2014-11-07..2018-01-05 INACTIVE EQUITY_COMMON] · SEC: INCR → CIK 0001857030 Intercure Ltd. (Nasdaq) |
| ref_JCSE | tiingo:NASDAQ:JCSE:2022-04-22 | tiingo:NASDAQ:JCSE:2022-04-22\|tiingo:NASDAQ:JCSE:2026-09-21 | LISTING_RESTART | prev [NASDAQ:2022-04-22..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-09-21..2026-10-30 ACTIVE EQUITY_COMMON geeignet; NASDAQ:2022-04-22..2026-09-18 INACTIVE EQUITY_COMMON] · SEC: JCSE → CIK 0001905511 JE Cleantech Holdings Ltd (Nasdaq) |
| ref_NXDR | tiingo:NYSE:NXDR:2021-03-24 | tiingo:NASDAQ:NXDR:2021-03-24 | EXCHANGE_TRANSFER | prev [NYSE:2021-03-24..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2021-03-24..2026-10-30 ACTIVE EQUITY_COMMON geeignet] · SEC: NXDR → CIK 0001846069 Nextdoor Holdings, Inc. (Nasdaq) |
| ref_SBXD | tiingo:NYSE:SBXD:2024-10-07 | tiingo:PINK:SBXD:2026-09-28 | DELISTED_TO_OTC_SEC_EVIDENCE | prev [NYSE:2024-10-07..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [PINK:2026-09-28..2026-09-29 INACTIVE EQUITY_COMMON] · SEC: SBXD nicht gelistet |

### Deaktivierungen (aktiv → inaktiv): 105 gesamt, 88 freigabefähig, 17 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| PROVIDER_ENDDATE_AGED | 67 |
| PROVIDER_ENDDATE_RESTATED | 31 |
| WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED | 3 |
| WITH_CANONICAL_CHANGE:MOVED_TO_OTC | 2 |
| WITH_CANONICAL_CHANGE:TICKER_REUSE_NEW_LISTING | 1 |
| WITH_CANONICAL_CHANGE:DELISTED_TO_OTC_SEC_EVIDENCE | 1 |

**Nicht freigabefähig (vollständig, 17):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_ACTS | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2016-12-20: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_BREW | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2020-09-30: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_EDVA | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2026-08-21: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_ENTL | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2018-02-28: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_FGNX | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED | folgt aus dem nicht freigabefähigen canonical_id-Wechsel (PROVIDER_HISTORY_RESTARTED) |
| ref_FGNXP | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED | folgt aus dem nicht freigabefähigen canonical_id-Wechsel (PROVIDER_HISTORY_RESTARTED) |
| ref_FTPA | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2023-03-15: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_GNMX | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2020-02-03: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_INVN | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2017-07-17: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_NMBL | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2017-08-17: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_NYNY | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2019-11-22: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_PCLN | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2018-02-26: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_RITR | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED | folgt aus dem nicht freigabefähigen canonical_id-Wechsel (PROVIDER_HISTORY_RESTARTED) |
| ref_TRIL | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2021-11-18: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_USX | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2023-06-30: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_WR | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2018-06-05: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |
| ref_WX | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | eigene Tagesreihe (discover-series) läuft bis 2026-10-30, Anbieter-Ende 2015-12-10: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting |

**Freigabefähig (Stichprobe je Klasse, höchstens 8; vollständig in der Freigabedatei):**

| securityId | von | nach | Klasse | Beleg |
|---|---|---|---|---|
| ref_AACBR | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2025-04-07..2026-08-19 ACTIVE RIGHT] → next [NASDAQ:2025-04-07..2026-08-19 INACTIVE RIGHT] · SEC: AACBR nicht gelistet |
| ref_AIHS | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2026-08-26..2026-08-27 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-08-26..2026-08-27 INACTIVE EQUITY_COMMON] · SEC: AIHS nicht gelistet |
| ref_ANSCW | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2024-01-03..2026-08-12 ACTIVE WARRANT] → next [NASDAQ:2024-01-03..2026-08-12 INACTIVE WARRANT] · SEC: ANSCW nicht gelistet |
| ref_APGE | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2023-07-14..2026-09-04 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2023-07-14..2026-09-04 INACTIVE EQUITY_COMMON] · SEC: APGE nicht gelistet |
| ref_AREN | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NYSE MKT:2007-07-13..2026-08-28 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2007-07-13..2026-08-28 INACTIVE EQUITY_COMMON] · SEC: AREN nicht gelistet |
| ref_ARQQW | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2021-04-06..2026-09-02 ACTIVE WARRANT] → next [NASDAQ:2021-04-06..2026-09-02 INACTIVE WARRANT] · SEC: ARQQW nicht gelistet |
| ref_AVB | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NYSE:1994-03-11..2026-08-17 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:1994-03-11..2026-08-17 INACTIVE EQUITY_COMMON] · SEC: AVB nicht gelistet |
| ref_BBCQU | ACTIVE | INACTIVE | PROVIDER_ENDDATE_AGED | prev [NASDAQ:2026-01-08..2026-08-27 ACTIVE UNIT] → next [NASDAQ:2026-01-08..2026-08-27 INACTIVE UNIT] · SEC: BBCQU nicht gelistet |
| ref_ATAI | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2021-06-18..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2021-06-18..2026-09-11 INACTIVE EQUITY_COMMON] · SEC: ATAI nicht gelistet |
| ref_BRRWW | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-07-31..2026-09-10 ACTIVE WARRANT] → next [NASDAQ:2025-07-31..2026-09-25 INACTIVE WARRANT] · SEC: BRRWW nicht gelistet |
| ref_DBRG | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NYSE:2014-06-27..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:2014-06-27..2026-09-30 INACTIVE EQUITY_COMMON] · SEC: DBRG nicht gelistet |
| ref_GBTG | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NYSE:2020-11-23..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:2020-11-23..2026-09-29 INACTIVE EQUITY_COMMON] · SEC: GBTG nicht gelistet |
| ref_HCWC | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [AMEX:2024-09-16..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [AMEX:2024-09-16..2026-09-17 INACTIVE EQUITY_COMMON] · SEC: HCWC nicht gelistet |
| ref_HVII | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-02-10..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-02-10..2026-09-23 INACTIVE EQUITY_COMMON] · SEC: HVII nicht gelistet |
| ref_HVIIU | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-01-17..2026-09-10 ACTIVE UNIT] → next [NASDAQ:2025-01-17..2026-09-24 INACTIVE UNIT] · SEC: HVIIU nicht gelistet |
| ref_IPEXR | ACTIVE | INACTIVE | PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-03-07..2026-09-10 ACTIVE RIGHT] → next [NASDAQ:2025-03-07..2026-09-28 INACTIVE RIGHT] · SEC: IPEXR nicht gelistet |
| ref_BCAR | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2012-03-07..2026-08-27 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2012-03-07..2015-08-03 INACTIVE EQUITY_COMMON; NASDAQ:2025-08-20..2026-08-27 INACTIVE EQUITY_COMMON] · SEC: BCAR nicht gelistet |
| ref_SBXD | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:DELISTED_TO_OTC_SEC_EVIDENCE | prev [NYSE:2024-10-07..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [PINK:2026-09-28..2026-09-29 INACTIVE EQUITY_COMMON] · SEC: SBXD nicht gelistet |
| ref_SNYR | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:MOVED_TO_OTC | prev [NASDAQ:2016-01-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2016-01-04..2026-09-18 INACTIVE EQUITY_COMMON] · SEC: SNYR nicht gelistet |
| ref_SVMH | ACTIVE | INACTIVE | WITH_CANONICAL_CHANGE:MOVED_TO_OTC | prev [NASDAQ:2023-12-08..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2023-12-08..2026-09-23 INACTIVE EQUITY_COMMON] · SEC: SVMH nicht gelistet |

### Eignungswechsel: 226 gesamt, 209 freigabefähig, 17 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| APPROVED_1_0_0 | 138 |
| CAUSED_BY:Deaktivierung=freigabefähig | 46 |
| CAUSED_BY:canonical_id=freigabefähig | 24 |
| CAUSED_BY:Deaktivierung=nicht | 14 |
| CAUSED_BY:canonical_id=nicht | 3 |
| ELIGIBLE_ROW_AGED_OUT | 1 |

**Nicht freigabefähig (vollständig, 17):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_ACTS | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_BREW | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_CAM | true | false | CAUSED_BY:canonical_id=UNCLEAR_REPLACEMENT | Folge von canonical_id (UNCLEAR_REPLACEMENT, nicht freigabefähig) |
| ref_EDVA | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | Folge von Deaktivierung (PROVIDER_ENDDATE_AGED, nicht freigabefähig) |
| ref_ENTL | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_FGNX | true | false | CAUSED_BY:canonical_id=PROVIDER_HISTORY_RESTARTED+Deaktivierung=WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED | Folge von canonical_id (PROVIDER_HISTORY_RESTARTED, nicht freigabefähig) und Deaktivierung (WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED, nicht freigabefähig) |
| ref_FTPA | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_GNMX | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_INVN | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_NMBL | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_NYNY | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_PCLN | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_RITR | true | false | CAUSED_BY:canonical_id=PROVIDER_HISTORY_RESTARTED+Deaktivierung=WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED | Folge von canonical_id (PROVIDER_HISTORY_RESTARTED, nicht freigabefähig) und Deaktivierung (WITH_CANONICAL_CHANGE:PROVIDER_HISTORY_RESTARTED, nicht freigabefähig) |
| ref_TRIL | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_USX | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_WR | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |
| ref_WX | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | Folge von Deaktivierung (PROVIDER_ENDDATE_RESTATED, nicht freigabefähig) |

**Freigabefähig (Stichprobe je Klasse, höchstens 8; vollständig in der Freigabedatei):**

| securityId | von | nach | Klasse | Beleg |
|---|---|---|---|---|
| ref_AAAP | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2015-11-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2015-11-11..2018-02-20 INACTIVE EQUITY_COMMON; NASDAQ:2026-06-23..2026-10-30 ACTIVE ETF] · SEC: AAAP nicht gelistet |
| ref_ABI | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2009-05-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-06-26..2026-10-30 ACTIVE ETF; NASDAQ:2009-05-11..2014-05-15 INACTIVE EQUITY_COMMON] · SEC: ABI nicht gelistet |
| ref_ANV | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2007-05-10..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2007-05-10..2015-03-09 INACTIVE EQUITY_COMMON; NASDAQ:2026-02-03..2026-10-30 ACTIVE ETF] · SEC: ANV nicht gelistet |
| ref_DINE | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2001-01-02..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-05-05..2026-10-30 ACTIVE ETF; NASDAQ:2001-01-02..2011-01-03 INACTIVE EQUITY_COMMON] · SEC: DINE nicht gelistet |
| ref_LMNX | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2000-04-06..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-10-16..2026-10-30 ACTIVE ETF; NASDAQ:2000-04-06..2021-07-14 INACTIVE EQUITY_COMMON] · SEC: LMNX nicht gelistet |
| ref_LQ | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2014-04-09..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-05-05..2026-10-30 ACTIVE ETF; NASDAQ:2014-04-09..2018-05-31 INACTIVE EQUITY_COMMON] · SEC: LQ nicht gelistet |
| ref_PCS | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [BATS:2007-04-19..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [BATS:2025-08-01..2026-10-30 ACTIVE ETF; BATS:2007-04-19..2013-10-17 INACTIVE EQUITY_COMMON] · SEC: PCS nicht gelistet |
| ref_PTNT | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [BATS:1999-07-23..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [BATS:2026-05-06..2026-10-30 ACTIVE ETF; BATS:1999-07-23..2015-09-22 INACTIVE EQUITY_COMMON] · SEC: PTNT nicht gelistet |
| ref_AIHS | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2026-08-26..2026-08-27 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-08-26..2026-08-27 INACTIVE EQUITY_COMMON] · SEC: AIHS nicht gelistet |
| ref_APGE | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2023-07-14..2026-09-04 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2023-07-14..2026-09-04 INACTIVE EQUITY_COMMON] · SEC: APGE nicht gelistet |
| ref_AREN | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NYSE MKT:2007-07-13..2026-08-28 ACTIVE EQUITY_COMMON geeignet] → next [NYSE MKT:2007-07-13..2026-08-28 INACTIVE EQUITY_COMMON] · SEC: AREN nicht gelistet |
| ref_AVB | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NYSE:1994-03-11..2026-08-17 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:1994-03-11..2026-08-17 INACTIVE EQUITY_COMMON] · SEC: AVB nicht gelistet |
| ref_BNRG | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2026-08-14..2026-08-14 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-08-14..2026-08-14 INACTIVE EQUITY_COMMON] · SEC: BNRG nicht gelistet |
| ref_BTOG | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2019-08-14..2026-09-03 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2019-08-14..2026-09-03 INACTIVE EQUITY_COMMON] · SEC: BTOG nicht gelistet |
| ref_CMII | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2026-05-28..2026-08-26 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-05-28..2026-08-26 INACTIVE EQUITY_COMMON] · SEC: CMII nicht gelistet |
| ref_CRNX | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_AGED | prev [NASDAQ:2018-07-18..2026-09-01 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2018-07-18..2026-09-01 INACTIVE EQUITY_COMMON] · SEC: CRNX nicht gelistet |
| ref_AMZE | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NYSE MKT:2021-12-14..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2021-12-14..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: AMZE → CIK 0001880343 AMAZE HOLDINGS, INC. (OTC) |
| ref_FEED | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:2017-06-13..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2017-06-13..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: FEED → CIK 0001326706 ENvue Medical, Inc. (OTC) |
| ref_IVCB | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:2022-02-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2022-02-04..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: IVCB nicht gelistet |
| ref_ORIS | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:2024-10-17..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2024-10-17..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: ORIS nicht gelistet |
| ref_QETA | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:2023-11-30..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2023-11-30..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: QETA → CIK 0001978528 Quetta Acquisition Corp (OTC) |
| ref_SNBR | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:1998-12-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:1998-12-04..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: SNBR nicht gelistet |
| ref_SOBR | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NASDAQ:2013-05-14..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2013-05-14..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: SOBR → CIK 0001425627 SOBR Safe, Inc. (OTC) |
| ref_VLNWF | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC | prev [NYSE:2020-09-23..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2020-09-23..2026-10-01 ACTIVE EQUITY_COMMON] · SEC: VLNWF nicht gelistet |
| ref_ATAI | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2021-06-18..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2021-06-18..2026-09-11 INACTIVE EQUITY_COMMON] · SEC: ATAI nicht gelistet |
| ref_DBRG | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [NYSE:2014-06-27..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:2014-06-27..2026-09-30 INACTIVE EQUITY_COMMON] · SEC: DBRG nicht gelistet |
| ref_GBTG | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [NYSE:2020-11-23..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:2020-11-23..2026-09-29 INACTIVE EQUITY_COMMON] · SEC: GBTG nicht gelistet |
| ref_HCWC | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [AMEX:2024-09-16..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [AMEX:2024-09-16..2026-09-17 INACTIVE EQUITY_COMMON] · SEC: HCWC nicht gelistet |
| ref_HVII | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2025-02-10..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-02-10..2026-09-23 INACTIVE EQUITY_COMMON] · SEC: HVII nicht gelistet |
| ref_RIVR | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [NASDAQ:2016-01-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2016-01-04..2026-09-22 INACTIVE EQUITY_COMMON] · SEC: RIVR nicht gelistet |
| ref_SAT | true | false | CAUSED_BY:Deaktivierung=PROVIDER_ENDDATE_RESTATED | prev [NYSE:2022-05-03..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NYSE:2022-05-03..2026-09-29 INACTIVE EQUITY_COMMON] · SEC: SAT nicht gelistet |
| ref_BCAR | true | false | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING+Deaktivierung=WITH_CANONICAL_CHANGE:TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2012-03-07..2026-08-27 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2012-03-07..2015-08-03 INACTIVE EQUITY_COMMON; NASDAQ:2025-08-20..2026-08-27 INACTIVE EQUITY_COMMON] · SEC: BCAR nicht gelistet |
| ref_COOL | true | false | ELIGIBLE_ROW_AGED_OUT | prev [NASDAQ:1999-08-17..2026-05-28 INACTIVE EQUITY_COMMON; NASDAQ:2026-08-13..2026-09-10 ACTIVE ETF; NASDAQ:2021-02-19..2026-08-12 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2021-02-19..2026-08-12 INACTIVE EQUITY_COMMON; NASDAQ:1999-08-17..2026-05-28 INACTIVE EQUITY_COMMON; NASDAQ:2026-08-13..2026-10-30 ACTIVE ETF] · SEC: COOL nicht gelistet |
| ref_GCTK | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC_SEC_EVIDENCE | prev [NASDAQ:2013-04-25..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2013-04-25..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: GCTK → CIK 0001506983 Glucotrack, Inc. (Nasdaq) |
| ref_LNAI | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC_SEC_EVIDENCE | prev [NASDAQ:2015-02-02..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2015-02-02..2026-10-30 ACTIVE EQUITY_COMMON] · SEC: LNAI → CIK 0001527728 Lunai Bioworks Inc. (Nasdaq) |
| ref_SBXD | true | false | CAUSED_BY:canonical_id=DELISTED_TO_OTC_SEC_EVIDENCE+Deaktivierung=WITH_CANONICAL_CHANGE:DELISTED_TO_OTC_SEC_EVIDENCE | prev [NYSE:2024-10-07..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [PINK:2026-09-28..2026-09-29 INACTIVE EQUITY_COMMON] · SEC: SBXD nicht gelistet |
| ref_SNYR | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC+Deaktivierung=WITH_CANONICAL_CHANGE:MOVED_TO_OTC | prev [NASDAQ:2016-01-04..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2016-01-04..2026-09-18 INACTIVE EQUITY_COMMON] · SEC: SNYR nicht gelistet |
| ref_SVMH | true | false | CAUSED_BY:canonical_id=MOVED_TO_OTC+Deaktivierung=WITH_CANONICAL_CHANGE:MOVED_TO_OTC | prev [NASDAQ:2023-12-08..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [OTCMKTS:2023-12-08..2026-09-23 INACTIVE EQUITY_COMMON] · SEC: SVMH nicht gelistet |

### Instrumenttyp-Wechsel: 148 gesamt, 147 freigabefähig, 1 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| APPROVED_1_0_0 | 138 |
| CAUSED_BY:canonical_id=freigabefähig | 9 |
| CAUSED_BY:canonical_id=nicht | 1 |

**Nicht freigabefähig (vollständig, 1):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_CAM | EQUITY_COMMON | ETF | CAUSED_BY:canonical_id=UNCLEAR_REPLACEMENT | Folge von canonical_id (UNCLEAR_REPLACEMENT, nicht freigabefähig) |

**Freigabefähig (Stichprobe je Klasse, höchstens 8; vollständig in der Freigabedatei):**

| securityId | von | nach | Klasse | Beleg |
|---|---|---|---|---|
| ref_AAAP | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2015-11-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2015-11-11..2018-02-20 INACTIVE EQUITY_COMMON; NASDAQ:2026-06-23..2026-10-30 ACTIVE ETF] · SEC: AAAP nicht gelistet |
| ref_ABI | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2009-05-11..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-06-26..2026-10-30 ACTIVE ETF; NASDAQ:2009-05-11..2014-05-15 INACTIVE EQUITY_COMMON] · SEC: ABI nicht gelistet |
| ref_ANV | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2007-05-10..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2007-05-10..2015-03-09 INACTIVE EQUITY_COMMON; NASDAQ:2026-02-03..2026-10-30 ACTIVE ETF] · SEC: ANV nicht gelistet |
| ref_DINE | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2001-01-02..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-05-05..2026-10-30 ACTIVE ETF; NASDAQ:2001-01-02..2011-01-03 INACTIVE EQUITY_COMMON] · SEC: DINE nicht gelistet |
| ref_LMNX | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2000-04-06..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2025-10-16..2026-10-30 ACTIVE ETF; NASDAQ:2000-04-06..2021-07-14 INACTIVE EQUITY_COMMON] · SEC: LMNX nicht gelistet |
| ref_LQ | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [NASDAQ:2014-04-09..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [NASDAQ:2026-05-05..2026-10-30 ACTIVE ETF; NASDAQ:2014-04-09..2018-05-31 INACTIVE EQUITY_COMMON] · SEC: LQ nicht gelistet |
| ref_PCS | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [BATS:2007-04-19..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [BATS:2025-08-01..2026-10-30 ACTIVE ETF; BATS:2007-04-19..2013-10-17 INACTIVE EQUITY_COMMON] · SEC: PCS nicht gelistet |
| ref_PTNT | EQUITY_COMMON | EQUITY_COMMON\|ETF | CAUSED_BY:canonical_id=TICKER_REUSE_NEW_LISTING | prev [BATS:1999-07-23..2026-09-10 ACTIVE EQUITY_COMMON geeignet] → next [BATS:2026-05-06..2026-10-30 ACTIVE ETF; BATS:1999-07-23..2015-09-22 INACTIVE EQUITY_COMMON] · SEC: PTNT nicht gelistet |

### Neue doppelte canonical_id (G6): 0 gesamt, 0 freigabefähig, 0 nicht freigabefähig

Keine.

### Namenswechsel (G9): 592 gesamt, 591 freigabefähig, 1 nicht freigabefähig

| Klasse | Anzahl |
|---|---:|
| NAME_ADDED_SEC | 573 |
| RENAMED_SAME_CIK_SEC | 14 |
| RENAMED_SAME_CIK_PROVIDER | 4 |
| ISSUER_CIK_CHANGED | 1 |

**Nicht freigabefähig (vollständig, 1):**

| securityId | von | nach | Klasse | Grund |
|---|---|---|---|---|
| ref_XRPN | Armada Acquisition Corp II - Class A | Evernorth Holdings Inc. | ISSUER_CIK_CHANGED | CIK 0002044009 → 0002092592: anderer Emittent unter dem Ticker (z. B. Fusion oder SPAC-Abschluss), Namenswechsel ist eine Identitätsfrage |

**Freigabefähig (Stichprobe je Klasse, höchstens 8; vollständig in der Freigabedatei):**

| securityId | von | nach | Klasse | Beleg |
|---|---|---|---|---|
| ref_AACIW | – | Armada Acquisition Corp. III | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002092897); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACIW → CIK 0002092897 Armada Acquisition Corp. III (Nasdaq) |
| ref_AACOU | – | Abony Acquisition Corp. I | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002099906); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACOU → CIK 0002099906 Abony Acquisition Corp. I (Nasdaq) |
| ref_AACOW | – | Abony Acquisition Corp. I | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002099906); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACOW → CIK 0002099906 Abony Acquisition Corp. I (Nasdaq) |
| ref_AACPR | – | Apogee Acquisition Corp | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002102123); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACPR → CIK 0002102123 Apogee Acquisition Corp (Nasdaq) |
| ref_AACPU | – | Apogee Acquisition Corp | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002102123); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACPU → CIK 0002102123 Apogee Acquisition Corp (Nasdaq) |
| ref_AACPW | – | Apogee Acquisition Corp | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002102123); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: AACPW → CIK 0002102123 Apogee Acquisition Corp (Nasdaq) |
| ref_ABLVW | – | Able View Global Inc. | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0001957489); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: ABLVW → CIK 0001957489 Able View Global Inc. (Nasdaq) |
| ref_ACAAU | – | Averin Capital Acquisition Corp. | NAME_ADDED_SEC | Name neu aus SEC company_tickers_exchange (CIK 0002096900); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null) · SEC: ACAAU → CIK 0002096900 Averin Capital Acquisition Corp. (Nasdaq) |
| ref_ATTT | Raytech Holding Ltd | Atlas Trinity Tech Ltd | RENAMED_SAME_CIK_PROVIDER | Umfirmierung desselben Emittenten (CIK 0001948443); Quelle TIINGO_METADATA · SEC: ATTT → CIK 0001948443 Atlas Trinity Tech Co., Ltd. (Nasdaq) |
| ref_BTLN | Glimpse Group, Inc. | Brightline Interactive Inc | RENAMED_SAME_CIK_PROVIDER | Umfirmierung desselben Emittenten (CIK 0001854445); Quelle TIINGO_METADATA · SEC: BTLN → CIK 0001854445 Brightline Interactive, Inc./NV (Nasdaq) |
| ref_NXAT | K Wave Media Ltd. | Nexus Advanced Technologies Inc Ord New | RENAMED_SAME_CIK_PROVIDER | Umfirmierung desselben Emittenten (CIK 0002000756); Quelle TIINGO_METADATA · SEC: NXAT → CIK 0002000756 Nexus Advanced Technologies Inc. (Nasdaq) |
| ref_VAI | Senmiao Technology Ltd | Valor Energy Inc | RENAMED_SAME_CIK_PROVIDER | Umfirmierung desselben Emittenten (CIK 0001711012); Quelle TIINGO_METADATA · SEC: VAI → CIK 0001711012 Valor Energy Inc (Nasdaq) |
| ref_BNC | CEA Industries Inc | BNB Standard Corp | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001482541); Quelle SEC_COMPANY_TICKERS · SEC: BNC → CIK 0001482541 BNB Standard Corp (Nasdaq) |
| ref_BNCWW | CEA Industries Inc - Warrants (11/02/2027) | BNB Standard Corp | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001482541); Quelle SEC_COMPANY_TICKERS · SEC: BNCWW → CIK 0001482541 BNB Standard Corp (Nasdaq) |
| ref_BNCWZ | CEA Industries Inc Warrants | BNB Standard Corp | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001482541); Quelle SEC_COMPANY_TICKERS · SEC: BNCWZ → CIK 0001482541 BNB Standard Corp (Nasdaq) |
| ref_DPU | Top KingWin Ltd - Class A | Nexpu Ltd. | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001938865); Quelle SEC_COMPANY_TICKERS · SEC: DPU → CIK 0001938865 Nexpu Ltd. (Nasdaq) |
| ref_GHI | Greystone Housing Impact | Greystone Housing Impact Investors LP | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001059142); Quelle SEC_COMPANY_TICKERS · SEC: GHI → CIK 0001059142 Greystone Housing Impact Investors LP (NYSE) |
| ref_HELP | Cybin Inc | Helus Pharma Inc. | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001833141); Quelle SEC_COMPANY_TICKERS · SEC: HELP → CIK 0001833141 Helus Pharma Inc. (Nasdaq) |
| ref_INVE | Identiv Inc | INVE Technologies, Inc. | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001036044); Quelle SEC_COMPANY_TICKERS · SEC: INVE → CIK 0001036044 INVE Technologies, Inc. (Nasdaq) |
| ref_MBAI | CheckCap Ltd | MBody AI Ltd. | RENAMED_SAME_CIK_SEC | Umfirmierung desselben Emittenten (CIK 0001610590); Quelle SEC_COMPANY_TICKERS · SEC: MBAI → CIK 0001610590 MBody AI Ltd. (Nasdaq) |

### Tickerwechsel je securityId: 0 gesamt, 0 freigabefähig, 0 nicht freigabefähig

Keine.

