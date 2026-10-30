# Freigabeliste 1.1.0 nach #1163 neu erzeugt (30.10.2026)

Dieses Dokument ersetzt die Zahlen in [V130_APPROVAL_LIST_REVIEW.md](V130_APPROVAL_LIST_REVIEW.md), die aus dem Probelauf 40942100928 vom 29.10. stammen. Regeln, Klassen und Builder gelten unverändert. Das Gate und seine Grenzen sind nicht geändert.

## Ergebnis

**Die neu erzeugte Liste reicht nicht für PASS.** Das Gate bleibt BLOCKED an **G7: 27 canonical_id-Wechsel ohne Freigabe, Grenze 25**. G6 ist mit dem Erzeuger aus #1163 bei 0. Alle anderen Grenzen werden eingehalten.

**#1163 erzeugt keinen zusätzlichen canonical_id-Wechsel.** Wir haben das Gate gegen den committeten Stamm laufen lassen, einmal mit und einmal ohne Register. Beide Läufe ergeben dieselben Mengen: 87 canonical_id-Wechsel, 148 Typwechsel, 104 Deaktivierungen und 225 Eignungswechsel, Element für Element gleich.

Der Grund: Das Gate vergleicht die Menge der canonical_ids je securityId. Bei OKE und TEL fällt nur eine Zeile mit derselben canonical_id weg, die Menge bleibt also gleich. Die übrigen sechs Doppelungen (FUN, HUT, BAM, CCSI, NYXH, UHAL-B) bleiben fail closed unverändert.

Die frühere Annahme „#1163 ändert auch die canonical_id der 7 bisherigen Doppelungen“ trifft nicht zu. Die 27 Wechsel stammen vollständig aus der Anbieterdrift und aus Fällen, die schon am 29.10. nicht freigabefähig waren.

## Grundlage

| Eingabe | Wert |
|---|---|
| Probelauf | Run 41086438209, `security-master-weekly.yml` auf dem Kopf von #1163 (`99ca9ae1dc`), `commit=false`, `allow_version_change=true`, `approved_changes=false` |
| Anbieterliste | `supported_tickers.zip`, 109.165 Zeilen, sha256 `a35b030e…b3f3` (dieselbe Datei wie im Register von #1163) |
| Doppelzeilen-Register | 2 Einträge, beide angewandt (OKE, TEL), 0 nicht angewandt |
| Folgestand `sm-next/us-security-master.json` | sha256 `5d5d7112dff801b2475c2cac25211d0af01a18fd55c854e8dd3b9c0f61f01693`, 8.055 Zeilen |
| Ausgangsstamm | `us-security-master-1.1.0`, sha256 `26c82617913ab0dcbd08d24c80eb818134ccced74cc01e9eac819b4635498332` (unverändert in `main`) |
| SEC | `company_tickers_exchange.json` vom 30.10., sha256 `76b92fba…7b46` |
| Delisting-Register | PR #1119 @4f16be7 (nur gelesen) |
| Gegenprobe | lokaler Neubau mit derselben Anbieterdatei: identisch mit dem CI-Folgestand. Ohne Register byte-gleich mit dem Erzeuger aus `main` (nur der Ausgabepfad im Text weicht ab) |
| neue Liste | `v130-approved-changes-1.1.0.json`, sha256 `9638ace1ace52e614b721cb8f9f386884d983ca799625cf45048125eb070d1b6` |

## Zahlen

| Kategorie | Probelauf | freigabefähig | nicht freigabefähig | Grenze | zählt danach | Liste 29.10. |
|---|---:|---:|---:|---:|---:|---:|
| canonical_id | 87 | 60 | 27 | 25 | **27 (BLOCKED)** | 60 |
| Instrumenttyp | 148 | 147 | 1 | 25 | 1 | 147 |
| Deaktivierungen | 104 | 86 | 18 | 50 | 18 | 84 |
| Eignungswechsel | 225 | 205 | 20 | 50 | 20 | 203 |
| doppelte canonical_id (G6) | 0 | – | – | 0 | 0 | 1 (OKE) |
| Namen | 592 | 591 | 1 (XRPN) | 200 | 1 | 591 |

Die freigegebenen Einträge der alten Liste sind alle wieder enthalten. Neu hinzugekommen sind die Deaktivierungen und Eignungswechsel von ref_GBTG und ref_SAT.

## Die 27 nicht freigabefähigen canonical_id-Wechsel

| Gruppe | Anzahl | Bemerkung |
|---|---:|---|
| PROVIDER_HISTORY_RESTARTED | 16 | Die Altzeile ist beim Anbieter entfallen, eine neue Zeile beginnt 2026-09/10. Ob dasselbe Wertpapier weiterläuft (Reverse Split, CUSIP-Wechsel), belegt die Tickerliste nicht. Mehrere Fälle gehören zu derselben Emittentenfamilie (SPKL/SPKLU/SPKLW, TETE/TETEW, NVNI/NVNIW, FGNX/FGNXP). |
| TWO_ACTIVE_LISTINGS | 5 | CHOW, EFTY, NAVI, XRPN, XRPNW: Es gibt zwei aktive Anbieterzeilen. Die ältere altert erst nach 30 Tagen aus. |
| MOVED_TO_OTC | 2 | GCTK, LNAI: Die SEC-Liste führt den Titel noch an einer Börse. |
| CAM, APAD, TRT, TRUE | 4 | schon am 29.10. nicht freigabefähig |

<details><summary>Einzelliste (Builder-Klassierung)</summary>

| securityId | Klasse | vorher → nachher | Grund (gekürzt) |
|---|---|---|---|
| ref_ADIL | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:ADIL:2018-07-27` → `tiingo:NASDAQ:ADIL:2026-10-29` | Altzeile (Beginn 2018-07-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-29: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_APAD | EXCHANGE_TRANSFER | `tiingo:NYSE:APAD:2025-08-27` → `tiingo:NASDAQ:APAD:2025-08-27` | gleiches Listing (Beginn 2025-08-27), Börsenwechsel NYSE → NASDAQ; SEC bestätigt nicht (APAD nicht gelistet); zudem SEC-Delisting-Beleg 8-K_2.01+3.01 (wirksam 2026-05-08) gegen die aktive Zeile an NASDAQ |
| ref_CAM | UNCLEAR_REPLACEMENT | `tiingo:NYSE:CAM:1995-07-05` → `tiingo:NYSE ARCA:CAM:2025-10-06` | Altzeile entfallen, ersetzt durch ein Listing an anderer Börse mit anderem Beginn (NYSE 1995-07-05 → NYSE ARCA 2025-10-06); die Anbieterliste belegt das Ende des alten Listings nicht |
| ref_CHOW | TWO_ACTIVE_LISTINGS | `tiingo:AMEX:CHOW:2025-09-16` → `tiingo:NYSE MKT:CHOW:2025-09-16|tiingo:NYSE MKT:CHOW:2026-10-23` | zwei aktive Anbieterzeilen (tiingo:NYSE MKT:CHOW:2025-09-16, tiingo:NYSE MKT:CHOW:2026-10-23); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_EFTY | TWO_ACTIVE_LISTINGS | `tiingo:NASDAQ:EFTY:2025-08-08` → `tiingo:NASDAQ:EFTY:2025-08-08|tiingo:NASDAQ:EFTY:2026-10-19` | zwei aktive Anbieterzeilen (tiingo:NASDAQ:EFTY:2025-08-08, tiingo:NASDAQ:EFTY:2026-10-19); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_FGNX | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:FGNX:2014-04-01` → `tiingo:NASDAQ:FGNX:2026-09-28` | Altzeile (Beginn 2014-04-01) beim Anbieter entfallen, neue Zeile erst seit 2026-09-28: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_FGNXP | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:FGNXP:2018-02-28` → `tiingo:NASDAQ:FGNXP:2026-09-28` | Altzeile (Beginn 2018-02-28) beim Anbieter entfallen, neue Zeile erst seit 2026-09-28: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_GCTK | MOVED_TO_OTC | `tiingo:NASDAQ:GCTK:2013-04-25` → `tiingo:OTCMKTS:GCTK:2013-04-25` | gleiches Listing (Beginn 2013-04-25) von NASDAQ nach OTCMKTS verlegt (Börsenrückzug in den Freiverkehr); SEC widerspricht (GCTK → CIK 0001506983 Glucotrack, Inc. (Nasdaq)) |
| ref_LESL | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:LESL:2020-10-29` → `tiingo:NASDAQ:LESL:2026-10-05` | Altzeile (Beginn 2020-10-29) beim Anbieter entfallen, neue Zeile erst seit 2026-10-05: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_LNAI | MOVED_TO_OTC | `tiingo:NASDAQ:LNAI:2015-02-02` → `tiingo:OTCMKTS:LNAI:2015-02-02` | gleiches Listing (Beginn 2015-02-02) von NASDAQ nach OTCMKTS verlegt (Börsenrückzug in den Freiverkehr); SEC widerspricht (LNAI → CIK 0001527728 Lunai Bioworks Inc. (Nasdaq)) |
| ref_LRHC | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:LRHC:2023-10-09` → `tiingo:NASDAQ:LRHC:2026-10-19` | Altzeile (Beginn 2023-10-09) beim Anbieter entfallen, neue Zeile erst seit 2026-10-19: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_NAVI | TWO_ACTIVE_LISTINGS | `tiingo:NASDAQ:NAVI:2014-04-17` → `tiingo:NASDAQ:NAVI:2014-04-17|tiingo:NASDAQ:NAVI:2026-10-29` | zwei aktive Anbieterzeilen (tiingo:NASDAQ:NAVI:2026-10-29, tiingo:NASDAQ:NAVI:2014-04-17); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_NVNI | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:NVNI:2023-09-29` → `tiingo:NASDAQ:NVNI:2026-10-09` | Altzeile (Beginn 2023-09-29) beim Anbieter entfallen, neue Zeile erst seit 2026-10-09: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_NVNIW | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:NVNIW:2023-10-02` → `tiingo:PINK:NVNIW:2026-10-09` | Altzeile (Beginn 2023-10-02) beim Anbieter entfallen, neue Zeile erst seit 2026-10-09: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_QNCX | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:QNCX:2019-05-09` → `tiingo:NASDAQ:QNCX:2026-10-12` | Altzeile (Beginn 2019-05-09) beim Anbieter entfallen, neue Zeile erst seit 2026-10-12: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_RITR | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:RITR:2024-08-23` → `tiingo:NASDAQ:RITR:2026-09-17` | Altzeile (Beginn 2024-08-23) beim Anbieter entfallen, neue Zeile erst seit 2026-09-17: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_SBXD | PROVIDER_HISTORY_RESTARTED | `tiingo:NYSE:SBXD:2024-10-07` → `tiingo:PINK:SBXD:2026-09-28` | Altzeile (Beginn 2024-10-07) beim Anbieter entfallen, neue Zeile erst seit 2026-09-28: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_SPKL | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:SPKL:2023-11-27` → `tiingo:NASDAQ:SPKL:2026-10-07` | Altzeile (Beginn 2023-11-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_SPKLU | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:SPKLU:2023-10-06` → `tiingo:PINK:SPKLU:2026-10-07` | Altzeile (Beginn 2023-10-06) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_SPKLW | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:SPKLW:2023-11-27` → `tiingo:PINK:SPKLW:2026-10-07` | Altzeile (Beginn 2023-11-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_TETE | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:TETE:2022-03-09` → `tiingo:NASDAQ:TETE:2026-10-07` | Altzeile (Beginn 2022-03-09) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_TETEW | PROVIDER_HISTORY_RESTARTED | `tiingo:NASDAQ:TETEW:2022-03-14` → `tiingo:NASDAQ:TETEW:2026-10-07` | Altzeile (Beginn 2022-03-14) beim Anbieter entfallen, neue Zeile erst seit 2026-10-07: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_TRT | EXCHANGE_LABEL_RENAMED | `tiingo:AMEX:TRT:1995-04-24` → `tiingo:NYSE MKT:TRT:1995-04-24` | gleiches Listing (Beginn 1995-04-24), Börsenbezeichnung AMEX → NYSE MKT (dieselbe Börsenfamilie NYSE); SEC widerspricht (TRT → CIK 0000732026 TRIO-TECH INTERNATIONAL (Nasdaq)) |
| ref_TRUE | START_DATE_RESTATED | `tiingo:NASDAQ:TRUE:2000-05-02` → `tiingo:NASDAQ:TRUE:2014-05-16` | gleiches Listing an NASDAQ, Anbieter korrigiert den Beginn 2000-05-02 → 2014-05-16; SEC bestätigt nicht (TRUE nicht gelistet) |
| ref_VTAK | PROVIDER_HISTORY_RESTARTED | `tiingo:AMEX:VTAK:2018-09-27` → `tiingo:AMEX:VTAK:2026-10-05` | Altzeile (Beginn 2018-09-27) beim Anbieter entfallen, neue Zeile erst seit 2026-10-05: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, beleg… |
| ref_XRPN | TWO_ACTIVE_LISTINGS | `tiingo:NASDAQ:XRPN:2025-06-24` → `tiingo:NASDAQ:XRPN:2025-06-24|tiingo:NASDAQ:XRPN:2026-10-09` | zwei aktive Anbieterzeilen (tiingo:NASDAQ:XRPN:2025-06-24, tiingo:NASDAQ:XRPN:2026-10-09); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |
| ref_XRPNW | TWO_ACTIVE_LISTINGS | `tiingo:NASDAQ:XRPNW:2025-06-24` → `tiingo:NASDAQ:XRPNW:2025-06-24|tiingo:NASDAQ:XRPNW:2026-10-12` | zwei aktive Anbieterzeilen (tiingo:NASDAQ:XRPNW:2025-06-24, tiingo:NASDAQ:XRPNW:2026-10-12); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus |

</details>

## Was das für die Reihenfolge heißt

1. #1163 ist geprüft, und seine Pflichtchecks sind grün. Der Merge braucht weiterhin die Owner-Freigabe.
2. Der Probelauf `commit=false` ist erledigt (oben). Nach dem Merge von #1163 entsteht bei gleicher Anbieterdatei derselbe Folgestand, denn der Erzeuger auf `main` wäre dann derselbe Code.
3. Die Liste ist neu erzeugt. Sie ergibt kein PASS. **Ein produktiver Lauf mit `commit=true` würde heute an G7 blockieren** (fail closed, nichts wird übernommen).
4. Ohne Änderung der Grenzen gibt es zwei Wege, G7 auf höchstens 25 zu bringen. Beide sind Owner-Entscheidungen:
   - **Warten und neu erzeugen.** Die 5 doppelt aktiven Zeilen altern nach 30 Tagen aus. Eine Neuerzeugung am Lauftag kann dann ≤ 25 ergeben, neue Drift kann aber auch neue Fälle bringen.
   - **Einzelbelege ergänzen.** Für mindestens 3 der 16 Neustarts müsste ein SEC-Beleg (8-K oder Form 25) nachweisen, dass dasselbe Wertpapier weiterläuft oder das alte Listing endet. Das ginge über ein Belegregister im Builder nach dem Muster von #1163. Dafür braucht es einen eigenen PR mit Vorher/Nachher.
5. Die Liste ist an die Anbieterdatei des Lauftags gebunden. Am Tag des produktiven Laufs wird sie mit demselben Builder erneut erzeugt und dem Owner vorgelegt.
