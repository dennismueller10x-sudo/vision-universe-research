# VISION UNIVERSE® — Tiingo-first Markt-Tracker und vollständige Märkte-Seite

Abschlussbericht zur Owner-Entscheidung „TIINGO-FIRST MARKET TRACKERS / MULTI-ASSET FINALIZATION“ (2026-09-25) und zur Owner-Ergänzung „COMPLETE DISCOVER MARKETS SURFACE“.

- Core: PR #206, Discover: PR #207, Browser-QA Märkte: PR #208 (alle gemergt); Proof-Beispiele und dieser Bericht: Folge-PR.
- Messung: `quant/data/market/capabilities/tiingo-tracker-probe.json` (2026-09-25 02:49 UTC, 48 Tiingo-Anfragen, keine Werte, keine Schlüssel).
- Production Proof: `quant/data/market/multi-asset/production-proof.json` gegen `https://research.visionuniverse.de`; Browser-QA: `scripts/discover/browser-qa-maerkte.mjs` im Workflow „Discover Live-Rauchtest“.

## 1. Geprüfte Tracker

Zwölf Kandidaten über den bestehenden Tiingo-Zugang (Metadaten, Tagesschluss seit Auflage, IEX-Kurs, 5-Minuten-Tagesverlauf, IEX-WebSocket): QQQ, SPY, DIA (Pflicht) sowie IWM, FEZ, DAX (Global X), EWU, FLGB, EWJ, EEM, URTH, VGK. Naheliegende, aber falsche Tracker wurden bewusst mitgemessen, um ihre Ablehnung zu belegen.

## 2. Akzeptiert

| Tracker | Markt (Anzeige) | Stufe | Grund |
|---|---|---|---|
| QQQ | Nasdaq 100 | Pflicht | Identität bewiesen |
| SPY | S&P 500 | Pflicht | Identität bewiesen |
| DIA | Dow Jones | Pflicht | Identität bewiesen |
| IWM | Russell 2000 | optional | Identität bewiesen, Liquidität ≥10 Mio. |
| FEZ | Euro Stoxx 50 | optional | Identität bewiesen, Währungshinweis EUR/USD |
| URTH | MSCI World | optional | Identität bewiesen, Währungshinweis |
| EEM | Schwellenländer | optional | im Core, auf der Seite zurückgestellt (Anzeigename, siehe §20) |

Abgelehnt: EWU (bildet MSCI UK ab, nicht FTSE 100), FLGB (FTSE UK Capped, nicht FTSE 100), EWJ (MSCI Japan, nicht Nikkei 225). DAX (Global X) ist identisch, aber mit weniger als 100 000 Stück Tagesvolumen und einem Tagesverlauf, der um 17:50 UTC endet, nicht tragfähig; VGK bildet FTSE Developed Europe ab und hat keinen Consumer-Platz. Für FTSE 100 und DAX bleibt die benannte Lücke.

## 3. Identität

Aus den Tiingo-Metadaten, nicht aus dem Symbol:

| Tracker | Name laut Tiingo | Index genannt in | Börse |
|---|---|---|---|
| QQQ | Invesco QQQ Trust Series 1 | Beschreibung („based on the Nasdaq-100 Index®“) | NASDAQ |
| SPY | SPDR S&P 500 ETF Trust | Name | NYSE |
| DIA | SPDR Dow Jones Industrial Average ETF | Name | NYSE |

## 4. Index-Zuordnung

Jeder Tracker trägt `tracker.tracksIndex` (NASDAQ_100, SP500, DOW_JONES_INDUSTRIAL_AVERAGE), `tracksIndexInstrument` (NDX, SPX, DJI), `displayMarketName` und `trackerDisclosure` („Markt-Tracker: Invesco QQQ“). Der Vertrag setzt `assetClass=ETF`, `instrumentSubtype=INDEX_TRACKER`, `isProxy=true`, `proxy.isIndexLevel=false`, `market.displayMarket=NASDAQ_100`, `underlyingType=INDEX`, `trackedBy=QQQ`, `tradingSession=US_EQUITY_ETF`. Die Indizes NDX, SPX und DJI bleiben `CAPABILITY_GAP` mit Verweis auf ihren Tracker; ein ETF wird nie als Index ausgegeben.

## 5. Historie

Split-bereinigter Tagesschluss (`splitAdjustedCloses`, Kursrendite ohne Ausschüttungen – im Vertrag als `ETF_PRICE_RETURN_SPLIT_ADJUSTED` benannt):

| Tracker | Beobachtungen | Von | Bis | Splits | Ausschüttungen (2 J.) |
|---|---|---|---|---|---|
| QQQ | 6 929 | 1999-03-10 | 2026-09-24 | 2000-03-20 | 8 |
| SPY | 8 471 (veröffentlicht ab 1995-01-03: 7 985) | 1993-01-29 | 2026-09-24 | – | 8 |
| DIA | 7 215 | 1998-01-20 | 2026-09-24 | – | 24 |

Keine Wochenendbeobachtungen, größte Lücke 7 Tage (Feiertage). Der Ingest veröffentlicht ab 1995-01-01; QQQ und DIA liegen vollständig darin.

## 6. Intraday

IEX 5-Minuten-Balken: je 312 Balken für vier Sitzungen (2026-09-21 13:30 UTC bis 2026-09-24 19:55 UTC). Öffentlich unter `/quant/data/market/multi-asset/intraday/<SYMBOL>.json` (nur Quellen mit `publicDisplay=true`, per Hygiene-Gate geprüft).

## 7. Realtime

- IEX-Kurs (`tngoLast`) HTTP 200 für alle drei; der Ingest übernimmt ihn als jüngsten Stand nur, wenn sein New-York-Datum nach dem letzten Tagesschluss liegt.
- IEX-WebSocket: Stufe 5 wird vom Tarif abgelehnt („thresholdLevel not valid for your subscription tier“); der bestehende VU-Live-Worker (`worker/src/vu-live.mjs`) nutzt Stufe 6. Der Vertrag meldet `realtimeCapability` aus der Registry (Worker-Pfad, reguläre US-Sitzung). Messung bei offenem Markt: siehe §17.
- Außerhalb der Sitzung ist die Frische ehrlich `LAST_SESSION` („Letzter Handelsstand“), nie „Live“.

## 8. Währung

Tracker notieren in USD (`nativeCurrency`). Die Anzeige in EUR läuft ausschließlich über den Currency Core (`VUMultiAssetContract.present` → `VUFx.layer`); Prozentveränderungen werden nie umgerechnet. FEZ, URTH und EEM tragen einen `currencyNote` (der Tracker bewegt sich zusätzlich mit dem Wechselkurs).

## 9. Kennzeichnung

Karte: Titel „Nasdaq 100“, darüber „Tracker · QQQ“, Wert „645,00 €“ bzw. „741,10 $“ (nie „Pkt.“), Veränderung in Prozent, Semantikzeile „Markt-Tracker: Invesco QQQ. Kurs und Bewegung des Trackers - nicht der offizielle Indexstand“. Vertragsnotiz: „Kurs des Trackers je Anteil in USD - kein Indexstand, keine Indexpunkte.“ Das Gate `TRACKER_SEMANTICS` erzwingt das für jeden Tracker.

## 10. Entfernte FMP-Abhängigkeiten

- `fmp-index` ist `AUDIT_EVIDENCE_ONLY`, `publicDisplay=false`, `displayLicense=UNAVAILABLE`.
- SPX, DJI, SX5E, UKX, HSI, RUT: keine FMP-Quelle mehr, sondern `CAPABILITY_GAP` mit Tracker-Verweis bzw. Owner-Optionen.
- Der Ingest erhält keinen `FMP_API_KEY` mehr; FMP-Anfragen im Lauf: 0.
- Adapter `providers/fmp/adapter.js` und `index-source-probe.json` bleiben als Evidence.
- Gate `CONSUMER_DEPENDENCIES`: keine Consumer-Quelle `fmp-index` oder `fred`.

## 11. Massive

Keine Anbindung, kein Schlüssel, keine Consumer-Quelle. Das Gate prüft Verträge, FRED-Adapter und Registry auf `massive`/`polygon`.

## 12. FRED (Pre-Approval-Reihen)

`NASDAQ100`, `SP500`, `DJIA`, `NASDAQCOM` tragen die Lizenzklasse „Pre-approval required“ und stehen nicht im FRED-Adapter (Gate `RESTRICTED_FRED_INDEX`). Der einzige FRED-Pfad ist `NIKKEI225` (Klasse „Citation required“) für den echten Nikkei-225-Index, weiter unverändert.

## 13. Edelmetalle

Gold, Silber, Platin, Palladium über `tiingo-fx-metals`: `OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT`, `preCommercialLicenseConfirmationRequired=true`, `commercialDisplayApproved=false`. Einheit je Feinunze (`/oz`), Sitzung `METALS_OTC_24_5`.

## 14. Krypto

Bitcoin, Ethereum, Solana, XRP über `tiingo-crypto`: gleicher Lizenzstatus wie Edelmetalle. Sitzung `CRYPTO_24_7`, keine Börsensitzung; die Karte sagt „Handel rund um die Uhr (24/7)“.

## 15. Offizielle Quellen

Unverändert und `LICENSE_CONFIRMED`: U.S. Treasury (US-Renditen), Bundesbank (Bund-Renditen), Federal Reserve / NY Fed (Zielband, EFFR), EZB (Einlagezins, EUR/USD-Referenzkurs), EIA (WTI, Brent, Henry Hub), FRED-Nikkei.

## 16. Tests

- Quant: 1 488 / 1 488 (davon 54 Multi-Asset: Taxonomie, Vertrag, Adapter, Tracker-Regeln, Lizenzvokabular, Tiingo-first-Abhängigkeiten).
- Negativtests: QQQ/SPY/DIA nie `INDEX`; Tracker nie `POINTS`/„Pkt.“; keine FMP-/Massive-/FRED-NASDAQ100-Consumer-Abhängigkeit; kein Yahoo/Google.
- Discover: alle `discover/tests/*.test.mjs` grün, `markets.test.mjs` 19 Tests (Owner-Liste, Tracker, Krypto 24/7, bp, Brent in EUR über den Currency Core, Platin/Palladium je Unze, keine Providerlogik).
- Gates des Multi-Asset-Verifiers: alle PASS (inkl. `TRACKER_SEMANTICS`, `LICENSE_STATES`, `CONSUMER_DEPENDENCIES`).

## 17. Production Proof

Stand: 2026-09-25 04:10 UTC gegen `https://research.visionuniverse.de` (Snapshot 03:57 UTC), US-Markt geschlossen.

**Daten (`production-proof.json`):** alle 18 Gates PASS (INSTRUMENT_MASTER, ASSET_CLASS_MODEL, NO_SILENT_ETF_PROXIES, INDEX_SEMANTICS, UNIT_SYSTEM, MARKET_HOURS, FRESHNESS, CURRENCY_INTEGRATION, LICENSE_STATES, CONSUMER_DEPENDENCIES, HISTORICAL_DATA, PROVENANCE, COMMODITY_SEMANTICS, CRYPTO_SEMANTICS, YIELD_SEMANTICS, TRACKER_SEMANTICS, PUBLIC_DATA_HYGIENE, PRODUCT_CONTRACT), Datenverfügbarkeit PASS.

| Instrument | Wert (nativ) | Veränderung | Frische | Markt | Lizenz | Historie | Ergebnis |
|---|---|---|---|---|---|---|---|
| QQQ (Nasdaq 100) | 741,10 USD | −0,01 % | LAST_SESSION | CLOSED | LICENSE_CONFIRMED | 1999–2026 (6 929), Intraday | PASS |
| SPY (S&P 500) | 767,18 USD | −0,08 % | LAST_SESSION | CLOSED | LICENSE_CONFIRMED | 1995–2026 (7 985), Intraday | PASS |
| DIA (Dow Jones) | 512,68 USD | −0,31 % | LAST_SESSION | CLOSED | LICENSE_CONFIRMED | 1998–2026 (7 215), Intraday | PASS |
| Nikkei 225 | 65 513,99 Pkt. | +0,76 % | CURRENT | OPEN | LICENSE_CONFIRMED | 1949–2026 | PASS |
| WTI | 96,41 USD/bbl | −0,58 % | CURRENT | Tageswert | LICENSE_CONFIRMED | 1986–2026 | PASS |
| Brent | 114,89 USD/bbl | −1,08 % | CURRENT | Tageswert | LICENSE_CONFIRMED | 1987–2026 | PASS |
| Gold | 4 271,61 USD/oz | −0,28 % | CURRENT | OPEN | OWNER_RISK_ACCEPTED… | 2021–2026, Intraday | PASS |
| Silber | 63,68 USD/oz | −0,68 % | CURRENT | OPEN | OWNER_RISK_ACCEPTED… | 2021–2026, Intraday | PASS |
| Bitcoin | 84 196,74 USD | −0,22 % | CURRENT | 24/7 | OWNER_RISK_ACCEPTED… | 2011–2026, Intraday | PASS |
| Ethereum | 2 677,77 USD | −0,35 % | CURRENT | 24/7 | OWNER_RISK_ACCEPTED… | 2015–2026, Intraday | PASS |
| US 10J | 5,18 % | +7 bp | CURRENT | Tageswert | LICENSE_CONFIRMED | 1990–2026 | PASS |
| Bund 10J | 3,62 % | +10 bp | CURRENT | Tageswert | LICENSE_CONFIRMED | 1997–2026 | PASS |
| Fed Target | 3,75–4,00 % | +25 bp | CURRENT | Beschluss | LICENSE_CONFIRMED | 2008–2026 (33 Beschlüsse) | PASS |
| EZB-Einlagezins | 2,50 % | +25 bp | CURRENT | Beschluss | LICENSE_CONFIRMED | 1999–2026 (64 Beschlüsse) | PASS |
| EUR/USD | 1,1490 | +0,26 % | CURRENT | – | LICENSE_CONFIRMED | 1999–2026 | PASS |

Ebenfalls PASS: EFFR, Henry Hub, Platin, Palladium, Solana, XRP, US 2J/5J/30J, Bund 2J/30J, IWM, FEZ, URTH. NDX, SPX, DJI: CAPABILITY_GAP (kein Indexstand, Tracker zeigt den Markt) – erwartet.

**Tracker-Semantik im Proof:** QQQ/SPY/DIA je `assetClass=ETF`, `isProxy=true`, `isIndexLevel=false`, `tradingSession=US_EQUITY_ETF`, `tracksIndex` NASDAQ_100 / SP500 / DOW_JONES_INDUSTRIAL_AVERAGE, Offenlegung gesetzt, Intraday-Pfad veröffentlicht, `realtimeCapability` = VU-Live-Worker (IEX-WebSocket, Stufe 6, reguläre US-Sitzung).

**Seite (`browser-qa-maerkte.mjs`, Workflow „Discover Live-Rauchtest“, Lauf 36093220124):** 123/123 PASS bei 390 px und 1280 px. Ausgeliefert (Anzeige EUR über Currency Core):

- Aktienmärkte: Nasdaq 100 (Tracker · QQQ) 645,00 € −0,01 % · S&P 500 (Tracker · SPY) 667,69 € −0,08 % · Dow Jones (Tracker · DIA) 446,20 € −0,31 % · Nikkei 225 65.513,99 Pkt. +0,76 % · IWM, FEZ, URTH
- Energie: WTI 83,91 € /bbl · Brent 99,99 € /bbl · Henry Hub 2,524 € /MMBtu
- Edelmetalle: Gold 3.717,68 € /oz · Silber 55,42 € /oz · Platin 1.525,66 € /oz · Palladium 1.096,15 € /oz
- Krypto: BTC 73.278,27 € · ETH 2.330,52 € · SOL 101,65 € · XRP 1,33 € – alle „Handel rund um die Uhr (24/7)“
- Renditen: US 2J/5J/10J/30J 4,87/5,03/5,18/5,47 % · Bund 2J/10J/30J 3,30/3,62/3,94 % – Veränderung in bp, ohne Kursfarbe
- Leitzinsen: Fed 3,75–4,00 % +25 bp · EFFR 3,88 % ±0 bp · EZB 2,50 % +25 bp
- Devisen: EUR/USD 1,1490 USD

Negativprüfungen bestanden: kein Tracker mit „Pkt.“, keine Rendite mit Währungszeichen, EUR/USD nicht umgerechnet, keine Seitenfehler, kein Querlauf auf dem Telefon.

**Im selben Lauf:** Browser-QA Discover 186/186, Live-QA 33/33. Der strenge Freshness-Check meldet STALE für die **Tageskurse des Aktien-Universums** (Stand 2026-09-18, erwartet 2026-09-24). Das betrifft die bestehende Tagesreihen-Pipeline der Einzelaktien, nicht den Multi-Asset-Core und nicht die Märkte-Seite; es ist kein Befund dieses Auftrags und wird hier nicht verändert (siehe §20).

**Realtime bei offener Börse:** folgt nach der US-Eröffnung (Tracker-Sonde mit IEX-WebSocket Stufe 6 und erneuter Proof); bis dahin gilt: außerhalb der Sitzung korrekt LAST_SESSION, nie „Live“.

## 18. Kosten

Keine. Bestehender Tiingo-Zugang, keine neue Subscription, kein Trial, keine Testbuchung. `PAID_SERVICES_ENABLED = 0`.

## 19. Geänderte Dateien

- Core (#206): `quant/engines/multi-asset/asset-taxonomy.js`, `quant/engines/realtime/session-profiles.js`, `quant/config/multi-asset-instruments.json`, `quant/config/multi-asset.json`, `quant/api/multi-asset-contract.js`, `providers/tiingo/adapter.js`, `scripts/market/ingest-multi-asset.mjs`, `scripts/market/probe-multi-asset.mjs`, `scripts/market/assert-public-data-hygiene.mjs`, `scripts/quality/verify-multi-asset.mjs`, `.github/workflows/multi-asset-data.yml`, Tests unter `quant/tests/multi-asset-*.test.mjs`, `docs/VU_MULTI_ASSET_DATA_CORE.md`, Daten unter `quant/data/market/multi-asset/`, Messung `tiingo-tracker-probe.json`.
- Discover (#207): `discover/ui/markets.js`, `discover/markets.css`, `discover/tests/markets.test.mjs`.
- Browser-QA (#208): `scripts/discover/browser-qa-maerkte.mjs`, `.github/workflows/discover-live-smoke.yml`.
- Bericht (Folge-PR): Proof-Beispiele in `scripts/quality/verify-multi-asset.mjs`, `production-proof.json`, dieser Bericht.

## 20. Offene Owner-Entscheidungen

1. Vorkommerzielle Lizenzbestätigung für Tiingo Krypto und Edelmetalle (heute `OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT`, nie `COMMERCIAL_DISPLAY_APPROVED`).
2. FTSE 100 und DAX: kein sauberer Tiingo-Tracker – Lücke akzeptieren oder echte Indexlizenz.
3. Optional echte Indexstände (NDX, SPX, DJI) über eine lizenzierte Quelle – heute bewusst Tracker.
4. EEM: Anzeigename im Core auf „Schwellenländer“ korrigieren, danach auf der Märkte-Seite aufnehmen (kleiner Core-Folge-PR).
5. Tageskurse des Aktien-Universums sind STALE (Stand 2026-09-18) – außerhalb dieses Auftrags, eigener Befund für die bestehende Tagesreihen-Pipeline.
6. Aus dem Free-Source-Audit (`docs/VU_FREE_DATA_SOURCE_MAP.md`): Finnhub-, SSGA- und Senate-Befunde – nicht umgesetzt, nur dokumentiert.

## Owner-Ergänzung: Märkte-Seite

| Bereich | Instrumente | Semantik |
|---|---|---|
| Aktienmärkte | Nasdaq 100 (Tracker · QQQ), S&P 500 (Tracker · SPY), Dow Jones (Tracker · DIA), Nikkei 225 (Index), Russell 2000 (IWM), Euro Stoxx 50 (FEZ), MSCI World (URTH) | Tracker in Währung, Nikkei in Punkten |
| Energie | WTI, Brent, Henry Hub | /bbl, /MMBtu, Umrechnung über Currency Core |
| Edelmetalle | Gold, Silber, Platin, Palladium | /oz |
| Krypto | Bitcoin, Ethereum, Solana, XRP | 24/7, keine Börsensitzung |
| US-Renditen | 2J, 5J, 10J, 30J | %, bp, keine Kursfarbe |
| Europa-Renditen | Bund 2J, 10J, 30J | %, bp, keine Kursfarbe |
| Leitzinsen | Fed Target, EFFR, EZB-Einlagezins | %, bp, gültig seit Beschluss |
| Devisen | EUR/USD | EZB-Referenzkurs, nicht umgerechnet |

Kein Redesign: bestehende Karten, eigene Stylesheet-Datei, Gruppen nach Assetklasse, Sprungleiste für Mobil (Buttons, weil der Hash dem Router gehört; kein Querlauf).

## Zielzustände

| Ziel | Zustand |
|---|---|
| TIINGO_FIRST_MARKET_DATA | PASS |
| QQQ_NASDAQ100_TRACKER | PASS |
| SPY_SP500_TRACKER | PASS |
| DIA_DOW_TRACKER | PASS |
| TRACKER_IS_PROXY | PASS (isProxy=true, isIndexLevel=false) |
| ETF_NOT_INDEX | PASS |
| NO_POINTS_FOR_ETF | PASS |
| TRACKER_HISTORY | PASS |
| TRACKER_INTRADAY | PASS (IEX 5 Minuten, veröffentlicht) |
| TRACKER_REALTIME | Pfad vorhanden (VU-Live-Worker, Stufe 6); Messung bei offener Börse folgt |
| N225_REAL_INDEX | PASS (FRED, Citation required) |
| FMP_CONSUMER_DEPENDENCY | 0 |
| MASSIVE_DEPENDENCY | 0 |
| FRED_RESTRICTED_SERIES | 0 |
| YAHOO_GOOGLE_SCRAPING | 0 |
| METALS / CRYPTO | PASS (OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT, commercialDisplayApproved=false) |
| OFFICIAL_SOURCES | PASS |
| PAID_SERVICES_ENABLED | 0 |
| NEW_PARALLEL_DATA_ARCHITECTURES | 0 |
| QUANT_CHANGES (Engines/Scores) | 0 |
| DISCOVER_MARKETS | COMPLETE |
| EQUITY_MARKET_TRACKERS | PASS |
| ENERGY | PASS |
| PRECIOUS_METALS | PASS |
| CRYPTO | PASS |
| YIELDS | PASS |
| RATES | PASS |
| FX | PASS |
| PROVIDER_LOGIC_IN_DISCOVER | 0 |
| NEW_DATA_PIPELINES | 0 |
| NEW_PROVIDER_INTEGRATIONS | 0 |
| CRITICAL_BLOCKERS | 0 |
