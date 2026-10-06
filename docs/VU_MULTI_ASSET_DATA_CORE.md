# VU MULTI-ASSET DATA CORE

Wie Vision Universe neben Aktien Indizes, Rohstoffe, Edelmetalle, Krypto,
Devisen, Renditen und Leitzinsen versteht — in derselben Datenschicht, nicht
daneben.

Katalog: `quant/config/multi-asset-instruments.json` ·
Quellen und Lizenz: `quant/config/multi-asset.json` ·
Messung: `quant/data/market/capabilities/multi-asset-probe.json` ·
Vertrag: `quant/api/multi-asset-contract.js` ·
Daten: `quant/data/market/multi-asset/` ·
Workflow: `.github/workflows/multi-asset-data.yml`

---

## 1. MULTI_ASSET_ARCHITECTURE_MAP

Der Grundsatz ist ONE DATA CORE — MANY PRODUCTS. Jede Zeile unten sagt, welcher
bestehende Baustein wiederverwendet und welcher minimal erweitert wurde. Neu
gebaut wurde nur, was es vorher nicht gab.

| Baustein | Bestand vor diesem Auftrag | Multi-Asset | Art |
|---|---|---|---|
| Instrument Master | `company-master.js`, ID `vu_<hash>` | `multi-asset/instrument-catalog.js` vergibt IDs mit derselben Funktion `mintInstrumentId` im selben ID-Raum (`provider: vu-core`, `exchange: assetClass`) | Segment, kein zweiter Master |
| Taxonomie / Einheiten | `instrument-classification.js` (Aktiengattungen), `price-semantics.js` | `multi-asset/asset-taxonomy.js`: Assetklassen, Subtypen, `valueSemantics`, Einheiten, bp-Semantik, Umrechenbarkeit | neu (gab es nicht) |
| Provider-Abstraktion | `providers/<name>/adapter.js` | Tiingo-Adapter um `getCryptoBars`, `getFxEndpointBars`, `getFxEndpointTop` erweitert; EZB-Adapter um Leitzinsen; neue Adapter nach demselben Muster fuer Treasury, NY Fed, Bundesbank, EIA | erweitert / gleiches Muster |
| Transport, Kontingent | `market-client.js` | ueber den Tiingo-Adapter wiederverwendet | wiederverwendet |
| Kalender | `quant/config/market-calendar.json`, `market-hours.js`, `trading-session.js` | XETR, XLON, XPAR, XSWX, XTKS, XHKG, XSHG; je Boerse eigene `coverage` (null = kein gepruefter Feiertagskalender) | erweitert (abwaertskompatibel) |
| Sitzungsprofile | nur XNYS | `realtime/session-profiles.js`: waehlt je Profil die bestehende Antwort (Boerse → trading-session, FX → fx-freshness, sonst Wochenfenster / 24/7 / Veroeffentlichung / Beschluss) | Profil-Schicht, keine zweite Engine |
| Freshness | `realtime/freshness.js` (Aktien), `fx/fx-freshness.js` (FX) | `realtime/asset-freshness.js`: ein Vokabular (LIVE / CURRENT / LAST_SESSION / STALE / UNAVAILABLE), delegiert an die beiden bestehenden | Dispatcher |
| Source State | `realtime/source-state.js` (Aktienseite) | unveraendert; Multi-Asset traegt `data.sourceState` aus derselben asset-aware Bewertung | unveraendert |
| Currency Core | `quant/engines/fx/*` | nur konsumiert: `present()` ruft `VUFx.layer.price()` fuer umrechenbare Einheiten; EUR/USD ist die bestehende EZB-Reihe | wiederverwendet, 0 Aenderungen |
| Product Contract | `quant/api/*-contract.js` | `quant/api/multi-asset-contract.js` (`build`, `refresh`, `present`) | neu, im bestehenden Contract-Ordner |
| Veroeffentlichung | statische JSON unter `quant/data/market/`, Pages-Release | `quant/data/market/multi-asset/{snapshot,instruments}.json`, `series/<SYM>.json`; Pages-Release wird nach dem Lauf ausgeloest | gleicher Pfad, gleicher Release |
| Secrets | `TIINGO_API_KEY` nur im Runner, Authorization-Header | identisch; offizielle Quellen brauchen keinen Schluessel | wiederverwendet |
| Realtime-Laufzeit | `worker/` (Durable Object, IEX) | nicht angefasst; Krypto-/FX-WebSocket gemessen, nicht aktiviert | unveraendert |
| Quant | Scores, Faktoren, Backtests | 0 Aenderungen | unveraendert |
| Discover | `discover/` | Integration in einem eigenen Schritt (eigener PR, siehe §8) | getrennte Spur |

## 2. Taxonomie

| assetClass | valueSemantics | Einheit | Veraenderung | Umrechnung |
|---|---|---|---|---|
| INDEX | INDEX_LEVEL | INDEX_POINTS | Prozent | nie (Punkte sind kein Geld) |
| COMMODITY | PRICE | PRICE_PER_BARREL / _MMBTU / … | Prozent | ueber Currency Core |
| PRECIOUS_METAL | PRICE | PRICE_PER_OUNCE (Feinunze) | Prozent | ueber Currency Core |
| CRYPTO | PRICE | CRYPTO_QUOTE | Prozent | ueber Currency Core |
| FX | FX_RATE | FX_RATE | Prozent | SELF (das Paar wird nicht umgerechnet) |
| YIELD | YIELD | PERCENT | Basispunkte | nie |
| RATE | POLICY_RATE | PERCENT | Basispunkte | nie |

Einheits-IDs sind zusammengesetzt, nicht aus UI-Text geraten: `USD_PER_TROY_OUNCE`,
`USD_PER_BARREL`, `USD_PER_BTC`, `POINTS`, `PERCENT`, `EUR_IN_USD`.

Bei Renditen ist die Hauptgroesse der Veraenderung `basisPoints`. Die relative
Veraenderung des Zinsniveaus heisst `relativePercent` und traegt eine
Anmerkung — 4,20 % → 4,35 % ist +15 bp, nicht „+3,57 %".

## 3. Sitzungsprofile

| Profil | Uhr | Quelle der Antwort |
|---|---|---|
| US_EQUITY | NYSE inkl. Vor-/Nachboerse | trading-session.js (XNYS) |
| INDEX_US / INDEX_EU / INDEX_ASIA | Heimatboerse, nur regulaere Sitzung, Mittagspausen in Asien | trading-session.js (XNYS, XETR, XLON, XPAR, XSWX, XTKS, XHKG, XSHG) |
| METALS_OTC_24_5 | So. 18:00 – Fr. 17:00 New York, taeglich 17–18 Uhr Pause | Wochenfenster |
| COMMODITY_FUTURES | wie Globex, Feiertagssitzungen NICHT modelliert | Wochenfenster |
| FX_24_5 | So. 22:00 – Fr. 22:00 UTC | `fx-freshness.js#marketPhase` (Currency Core) |
| CRYPTO_24_7 | immer offen | — |
| REFERENCE_DAILY | Geschaeftstage und Veroeffentlichungszeit des Herausgebers | Herausgeberprofil in `multi-asset.json` |
| POLICY_EVENT | gilt bis zum naechsten Beschluss | — |

`calendarCoverage` ist nur dort `true`, wo ein Feiertagskalender vorliegt
(XNYS, XETR, XLON, XPAR, Veroeffentlicher mit diesen Kalendern). Asiatische
Boersen, SIX und die Wochenfenster tragen `false`.

## 4. Freshness je Klasse

| Klasse | LIVE | CURRENT | LAST_SESSION | STALE |
|---|---|---|---|---|
| Aktie/Index | nur mit Echtzeitpfad | laufender Snapshot / letzter Tagesschluss | Boerse zu, letzte Sitzung | Sitzung fehlt |
| Krypto | Echtzeit-Tick ≤ 180 s | Snapshot ≤ 6 h | — (nie geschlossen) | > 6 h |
| Metalle | Echtzeit-Tick ≤ 180 s, Markt offen | Snapshot ≤ 6 h | Wochenende/Pause, Stand ≤ 1 h vor Schluss | sonst |
| FX | aus dem Currency Core | innerhalb der FX-Schwelle | Wochenende | ueber der Schwelle |
| Rendite (Veroeffentlichung) | — | juengster faelliger Tag, oder Rueckstand ≤ `maxLagBusinessDays` | — | Rueckstand groesser |
| Leitzins (Beschluss) | — | Quelle ≤ 96 h zuletzt abgefragt | — | Quelle nicht mehr abgefragt |

„LIVE" ist in diesem Segment an `frequency: REALTIME` gebunden. Ein Snapshot —
auch ein sehr junger — ist CURRENT. Der bestehende Aktienvertrag nennt einen
laufenden Snapshot `LIVE` und beschriftet ihn trotzdem „Heute · Stand";
`asset-freshness.js` bildet das auf CURRENT ab.

## 5. Quellen — gemessen

Zwei Sondierungslaeufe in GitHub Actions (36002559332, 36003261084), 175 Tiingo-
und 48 offizielle Anfragen. Der Bericht enthaelt keine Werte; Identitaet wird
ueber einen Groessenordnungs-Test belegt.

| Klasse | Tiingo | Entscheidung |
|---|---|---|
| Indizes | Tiingo: UNSUPPORTED — Suche liefert nur ETFs/Fonds; `spx` = Spenda Ltd. (ASX), `dax` = Global X DAX ETF, `px1` = Plexure, `hsi` = Home Security Intl., `djia` = Global X Dow 30 Covered Call ETF, `mid`, `smi` = ETFs | **Index Coverage P0** (docs/VU_INDEX_COVERAGE_P0.md): N225 ueber FRED (Citation required) ACTIVE; SPX, DJI, SX5E, UKX, HSI, RUT ueber den vorhandenen FMP-Zugang LICENSE_PENDING; NDX, DAX, CAC, SMI, SHCOMP, MID, MSCI World CAPABILITY_GAP (Tarif/Lizenz). |
| Edelmetalle | SUPPORTED ueber den FX-Endpunkt (xauusd, xagusd, xptusd, xpdusd): Tagesreihe ab 2021 (Start vor ~5 J. → HTTP 400), 5-Min-Bars, WebSocket | Tiingo, **LICENSE_PENDING** |
| WTI / Brent | UNSUPPORTED (kein Symbol) | **EIA-Spot** (RWTC ab 1986, RBRTE ab 1987) |
| Erdgas | `natgasusd` vorhanden, ab 2026-01-30, Kontrakt undokumentiert | **EIA Henry-Hub-Spot** (ab 1997) |
| Kupfer | `copperusd` vorhanden, ab 2023-09, Markt und Einheit undokumentiert | **CAPABILITY_GAP** (Semantik nicht belegbar) |
| Krypto | SUPPORTED (BTC ab 2011, ETH ab 2015); Zeilengrenze je Anfrage → Scheiben; Wochenend-Bars belegt; WebSocket belegt | Tiingo, **LICENSE_PENDING** |
| US-Renditen | UNSUPPORTED (nur Anleihe-ETFs) | **US Treasury** Par Yield Curve (ab 1990) |
| Bund-Renditen | UNSUPPORTED | **Bundesbank** Zinsstruktur (Svensson, ab 1997) |
| Fed | UNSUPPORTED | **NY Fed** EFFR inkl. Zielband (ab 2000) |
| EZB | UNSUPPORTED | **ECB Data Portal** Einlagefazilitaet (ab 1999, Stufenserie) |
| EUR/USD | bereits gemessen (Currency Core) | bestehende **EZB-Referenzreihe** |

FRED wurde nur zum Abgleich gemessen und nicht angebunden (§12, Stufe 3).

## 6. Keine stillen Proxys

Jeder Katalogeintrag fuehrt `knownProxies` — und der Vertrag gibt sie als
`proxy.knownProxiesNotUsed` aus. `verify-multi-asset.mjs` bricht ab, wenn ein
Proxy-Kuerzel als Quelle eines Instruments auftaucht. Ein Proxy waere nur als
eigenes Instrument (`assetClass: ETF`, `represents`, `isProxy: true`) zulaessig —
und nur nach Owner-Entscheidung.

## 7. Lizenz

Tiingo-Krypto und Tiingo-FX-Edelmetalle sind technisch angebunden und im
Arbeitsstand geprueft. Oeffentlich ausgeliefert werden sie nicht: die Owner-
Erklaerung vom 13.09.2026 nennt die Market-Data, und `fx-license.json` haelt fest,
dass rohe FX-Reihen (Klasse E) nicht redistribuiert werden. Freischaltung ist
ein Eintrag: `sourceRegistry.<id>.publicDisplay = true` mit Grundlage und Datum.

## 8. Discover

Discover baut keine eigene Providerlogik. Es liest `snapshot.json`, bewertet
die Freshness mit `VUMultiAssetContract.refresh()` zur Anzeigezeit und zeigt
monetaere Werte ueber den Currency Core. Die Integration laeuft als eigener
Pull Request, weil `discover-ci.yml` Aenderungen an Discover und am Data Core
in einem PR ablehnt — die Spuren bleiben getrennt.

## 9. Grenzen

- Indexstaende: nur Nikkei 225 oeffentlich; fuenf weitere technisch angebunden, Anzeige nach Owner-Freigabe; NDX und DAX nur mit Bezahltarif.
- Keine Futures, keine Roll-Methodik — die Rohstoffe sind EIA-Spotreferenzen.
- Sitzungsprofil der Wochenfenster ohne Feiertagskalender.
- Kein Realtime-Strom fuer Multi-Asset: gemessen (Krypto- und FX-WebSocket
  liefern), aber nicht aktiviert — der bestehende Realtime-Worker ist nicht
  ausgerollt, und ein neuer Strom waere eine neue Laufzeit.
- Die EZB-Referenzreihe des Currency Core wird nur auf Marker/Dispatch
  aufgefrischt, nicht nach Zeitplan; EUR/USD wird deshalb nach vier Tagen
  ohne Auffrischung ehrlich STALE. Das gehoert in die Currency-Spur.

## Markt-Tracker (Owner-Entscheidung 2026-09-25, Tiingo-first)

Aktienmärkte erscheinen in der Consumer-Übersicht über börsengehandelte **Index-Tracker** aus dem bestehenden Tiingo-Vertrag, nicht über Indexstände ungeklärter Free-Provider.

| Tracker | Markt (`displayMarketName`) | `tracksIndex` | Identität (Tiingo) |
|---|---|---|---|
| QQQ | Nasdaq 100 | NASDAQ_100 | Beschreibung nennt den Nasdaq-100 Index |
| SPY | S&P 500 | SP500 | Name und Beschreibung nennen den S&P 500 |
| DIA | Dow Jones | DOW_JONES_INDUSTRIAL_AVERAGE | Name nennt den Dow Jones Industrial Average |
| IWM | Russell 2000 | RUSSELL_2000 | Name nennt den Russell 2000 |
| FEZ | Euro Stoxx 50 | EURO_STOXX_50 | Name nennt den EURO STOXX 50; in USD notiert, enthält den EUR/USD-Effekt |
| URTH | MSCI World | MSCI_WORLD | Name nennt MSCI World; in USD, enthält Währungseffekte |
| EEM | Schwellenländer | MSCI_EMERGING_MARKETS | Name nennt MSCI Emerging Markets; in USD |

Abgelehnt (`tiingo-tracker-probe.json`):

| Kandidat | Grund |
|---|---|
| EWU (MSCI United Kingdom), FLGB (FTSE UK Capped) | nicht der FTSE 100 |
| EWJ (MSCI Japan) | nicht der Nikkei 225 – der echte Nikkei-225-Pfad (FRED) bleibt |
| Global X DAX Germany ETF (Ticker DAX) | Identität belegt, aber unter 100.000 Anteile/Tag und lückenhafte Intraday-Bars |

**Modell.** Jeder Tracker ist ein eigenes Instrument:
- `assetClass` = ETF, `instrumentSubtype` = INDEX_TRACKER;
- Einheit USD je Anteil (`USD_PER_SHARE`), nie Indexpunkte;
- `proxy.isProxy` = true und `proxy.isIndexLevel` = false;
- Sitzung `US_EQUITY_ETF` (US-Handelssitzung des ETF, nicht die Berechnungszeit des Index).

**Vertrag 1.1.0.** Er ergänzt:
- den Block `tracker`: `displayMarketName`, `trackerDisclosure`, `price`, `change`, `changePercent`, `asOf`, `freshness`, `history`, `realtimeCapability`;
- in `market`: `displayMarket`, `underlyingType`, `trackedBy`, `tradingSession`.

Umrechnung und Wertreihen:
- Der Kurs geht über den Currency Core in die Anzeigewährung, Prozentbewegungen bleiben unverändert.
- Die Tagesreihe ist der split-bereinigte Schlusskurs (Kursbewegung des ETF, ohne Ausschüttungen).
- Der jüngste Stand ist Tiingos Referenzkurs (tngoLast) über IEX.
- Der 5-Minuten-Tagesverlauf liegt unter `quant/data/market/multi-asset/intraday/`.

**Echtzeit.** Sie läuft über den bestehenden VU-Live-Worker (Tiingo IEX, thresholdLevel 6, reguläre US-Sitzung) als Fähigkeit (`realtimeCapability`). LIVE sagt nur `data.freshness`.

**Lizenz je Wert.** Jeder Wert trägt ein festes Vokabular, `license.state` ∈ LICENSE_CONFIRMED / OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT / PRE_COMMERCIAL_LICENSE_CONFIRMATION_REQUIRED / UNAVAILABLE.

| Quelle | Zustand |
|---|---|
| Tiingo-Aktien-/ETF-Daten | LICENSE_CONFIRMED (Owner-Erklärung 2026-09-13) |
| Tiingo Krypto und Edelmetalle | OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT mit `preCommercialLicenseConfirmationRequired` = true und `commercialDisplayApproved` = false |

**FMP.** FMP trägt keine Consumer-Werte mehr:
- SPX, DJI, SX5E, UKX, HSI und RUT sind benannte Lücken mit Verweis auf den Tracker;
- der Ingest erhält keinen FMP-Schlüssel;
- Adapter, Berichte und Tests bleiben als Audit-Evidence.

**Gates.** TRACKER_SEMANTICS, LICENSE_STATES und CONSUMER_DEPENDENCIES (kein FMP, kein Comparison-FRED, keine Pre-Approval-FRED-Reihe, kein Yahoo/Google/Massive).
