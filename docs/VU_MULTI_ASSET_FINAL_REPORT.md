# VISION UNIVERSE® MULTI-ASSET DATA CORE
## FINAL IMPLEMENTATION & CAPABILITY REPORT

Stand: 2026-09-24 · Methodik und Architecture Map: `docs/VU_MULTI_ASSET_DATA_CORE.md`

Legende der Belegstufen: **MEASURED** (in einem Lauf gemessen, Beleg genannt) ·
**INFERRED** (aus Dokumentation oder Struktur geschlossen, nicht gemessen) ·
**UNKNOWN** (nicht feststellbar) · **NOT_AVAILABLE** (gemessen: gibt es nicht).

---

## 1. Agent-Graph

```
A Repository Architecture ─┬─> B Provider Capability ──> C Instrument Master ─┬─> D Index
                           │                                                   ├─> E Commodity
                           │                                                   ├─> F Crypto
                           │                                                   └─> G Yield/Rate
                           └─> H Session/Calendar ──> M Freshness/Source State
C,D-G,H,M ──> I History ─> J Intraday ─> K Realtime (gemessen, nicht aktiviert)
C ──> L Currency (nur Konsum des Core) ──> N Product Contract ──> P Data Quality ──> Q Regression
N,P,Q ──> Merge Core-PR ──> R Production Proof ──> O Discover Integration (eigener PR) ──> R ──> S Report
Recovery-Pfade: Probe-Fehlschluss -> Evidenz pruefen -> Sonde korrigieren -> neu messen
                Gate-FAIL im Ingest -> kein Commit -> Ursache -> Fix -> neuer Lauf
Owner-Eskalation: Lizenz (Tiingo Krypto/Metalle), Indexquelle, Kupfer-Semantik
```

## 2. Tatsaechlich durchlaufene Zustaende

| # | Zustand | Ergebnis |
|---|---|---|
| 1 | Audit (A) | drei parallele Auditoren: Session/Freshness/FX, Tiingo/Stores/Workflows, Discover |
| 2 | Probe 1 (Actions 36002559332) | Befund: 3 Index-"Treffer" und 0 Metall-Treffer |
| 3 | Evidenzpruefung | beide Befunde FALSCH: `spx` = Spenda Ltd. (ASX), `px1` = Plexure, `dax` = Global-X-ETF; FX-Sammelantwort ohne Tickerfeld, WebSocket lieferte 57 xauusd-Ticks |
| 4 | Recovery | Namens-Identitaet fuer Indizes, Quotes je Symbol, Krypto-Scheiben, Wochenendfenster, EIA-XLS |
| 5 | Probe 2 (Actions 36003261084) | Indizes UNSUPPORTED, Metalle SUPPORTED, Krypto SUPPORTED |
| 6 | Quellenentscheidung | `quant/config/multi-asset.json#sources` |
| 7 | Ingest 1 (Actions 36004344158) | Daten korrekt, Gate HISTORICAL_DATA FAIL -> **nichts committet** |
| 8 | Recovery | EUR/USD-Reihe traegt im Currency Core source `ecb`; Alias statt Kopie |
| 9 | Ingest 2 (Actions 36006534604) | 15/15 Gates PASS, Daten committet |
| 10 | Core-PR #200 | CI gruen, gemergt (`7fe0b938f`), Pages-Release 36010871364 |
| 11 | Production Proof | 15/15 Gates PASS gegen research.visionuniverse.de |
| 12 | Discover-PR | Maerkte-Flaeche, Browser- und a11y-Nachweis |

## 3. Bestehende Architektur

Siehe Architecture Map (`docs/VU_MULTI_ASSET_DATA_CORE.md` §1). Kernaussage:
Company Master (ID-Raum), Provider-Adapter-Muster, market-client, Marktkalender,
trading-session, freshness, Currency Core und Pages-Release werden wiederverwendet.

## 4. Provider-Audit

| Quelle | Rolle | Zugang | Stand |
|---|---|---|---|
| Tiingo (bestehend, lizenziert) | Stufe 2, Vorrang wo es liefert | Secret im Runner | MEASURED |
| US Treasury | Stufe 1, US-Renditen | schluessellos, CSV | MEASURED |
| Federal Reserve Bank of New York | Stufe 1, Zielband + EFFR | schluessellos, JSON | MEASURED |
| EZB Data Portal | Stufe 1, Leitzinsen | schluessellos, CSV | MEASURED |
| Deutsche Bundesbank | Stufe 1, Bund-Renditen | schluessellos, CSV | MEASURED |
| EIA | Stufe 1, Energie-Spot | API: HTTP 403 ohne Schluessel; XLS schluessellos | MEASURED |
| FRED | Stufe 3, nur Abgleich | schluessellos | MEASURED, nicht angebunden |

## 5. Tiingo Capability Matrix (MEASURED, `multi-asset-probe.json`)

| Klasse | History | Daily | Intraday | Latest | Realtime | WebSocket |
|---|---|---|---|---|---|---|
| INDEX | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED |
| PRECIOUS_METAL | SUPPORTED (ab 2021) | SUPPORTED | SUPPORTED (5 min) | SUPPORTED | SUPPORTED (Quote 2-3 s alt) | PARTIAL (FX-Strom liefert xauusd) |
| COMMODITY | PARTIAL (nur copperusd/natgasusd) | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| CRYPTO | SUPPORTED (BTC ab 2011, Scheiben) | SUPPORTED | SUPPORTED (5 min, Wochenende) | SUPPORTED | SUPPORTED | SUPPORTED |
| YIELD | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED |
| RATE | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED |
| FX | bestehende Messung `tiingo-fx-probe.json` | | | | | |

Weitere Semantik (MEASURED): Symbolaufloesung ueber `/tiingo/utilities/search`
liefert fuer Index-, Treasury- und Bund-Begriffe nur ETFs/Fonds;
Zeitstempel FX `OFFSET_TIMESTAMP`, Krypto `OFFSET_TIMESTAMP`; fehlendes Symbol:
Daily 404 `{"detail":"Not found."}`, FX und Krypto HTTP 200 mit leerem Array;
FX-Startdatum vor ~5 Jahren: HTTP 400; Krypto-Tagesreihe: Zeilengrenze je Anfrage
(ab 2009 angefragt, endet 2022-09-10); Kontingent-Header: keine gesendet.
Lizenzsignale: **UNKNOWN** (technisch nicht messbar).

## 6. Weitere bereits vorhandene Quellen

EZB-Referenzkurse (Currency Core, `providers/ecb`) — fuer EUR/USD wiederverwendet;
derselbe Adapter traegt jetzt die Leitzinsen.

## 7. Instrument Master

36 Instrumente in `quant/config/multi-asset-instruments.json`, aufgeloest in
`quant/data/market/multi-asset/instruments.json`. IDs `vu_<14 hex>` aus
`company-master.js#mintInstrumentId` (`provider: vu-core`, `exchange: assetClass`).
Felder nach §14: instrumentId, symbol, name, assetType/assetClass, subType,
exchangeOrVenue, currency, country, timezone, providerIdentifiers,
sessionProfile, priceSemantics, unit, source, status.

## 8. Asset-Class-Taxonomie

EQUITY, INDEX, COMMODITY, PRECIOUS_METAL, CRYPTO, FX, YIELD, RATE (+ ETF, FUTURE
vorbereitet, nicht als Ersatz genutzt). `valueSemantics`: INDEX_LEVEL, PRICE,
YIELD, POLICY_RATE, FX_RATE. Yield-Arten: REFERENCE_YIELD, MARKET_YIELD, POLICY_RATE.

## 9. Index-Ergebnisse — Index Coverage P0 (Nachtrag 2026-09-24)

13 Indizes (7 Pflicht, 6 optional) katalogisiert inkl. Price/Total-Return-
Unterscheidung (DAX = Performanceindex). Tiingo fuehrt keine Indexstaende
(MEASURED) - das war nicht das Ende: sechs Messrunden ueber vorhandene
Zugaenge, offizielle Quellen und FRED (docs/VU_INDEX_COVERAGE_P0.md).

- Nikkei 225: ACTIVE, ausgeliefert - FRED `NIKKEI225`, Lizenzklasse
  "Citation required" (MEASURED), Gegenprobe gegen die Nikkei-Tagesdatei.
- S&P 500, Dow Jones, Euro Stoxx 50, FTSE 100 (+ Hang Seng, Russell 2000):
  DATA_SOURCE_RESOLVED ueber den vorhandenen FMP-Zugang (Tagesschluss 10 J.,
  Identitaet je Lauf), LICENSE_PENDING - Anzeige-Erlaubnis UNKNOWN.
- Nasdaq 100, DAX: im vorhandenen Tarif gesperrt (FMP 402, Twelve Data
  "ab Grow", STOXX-API 401) - Anbieter-Matrix mit Kosten fuer den Owner.
Kein ETF-Proxy, kein Future, keine Eigenberechnung.

## 10. Commodity-Ergebnisse

| | Quelle | Semantik | Historie |
|---|---|---|---|
| WTI | EIA RWTC | SPOT_REFERENCE, Cushing FOB, USD/bbl | ab 1986-01-02 (MEASURED) |
| Brent | EIA RBRTE | SPOT_REFERENCE, Europe FOB, USD/bbl | ab 1987-05-20 |
| Erdgas | EIA RNGWHHD | SPOT_REFERENCE, Henry Hub, USD/MMBtu | ab 1997-01-07 |
| Kupfer | — | CAPABILITY_GAP (Kontrakt/Einheit von Tiingo `copperusd` UNKNOWN) | — |

Keine Futures, keine Roll-Logik — §43 ohne Eskalation erledigt.

## 11. Precious-Metal-Ergebnisse

Gold, Silber, Platin, Palladium: Tiingo FX-Endpunkt, SPOT_METAL, USD je
Feinunze, MID-Quote. Technisch PASS (interner Nachweis), oeffentlich
**LICENSE_PENDING**.

## 12. Crypto-Ergebnisse

BTC, ETH, SOL, XRP: Tiingo Krypto, aggregiert, USD. 24/7-Profil; Wochenend-Bars
MEASURED; Freshness nie "geschlossen". Technisch PASS, oeffentlich
**LICENSE_PENDING**.

## 13. Yield-/Rates-Ergebnisse

| | Quelle | Historie (MEASURED) |
|---|---|---|
| US 2/5/10/30J | Treasury Par Yield Curve (CMT) | ab 1990-01-02 (30J: Luecke 2002-2006) |
| Bund 2/10/30J | Bundesbank Svensson-Zinsstruktur | ab 1997-08-07 (30J ab 2000-08-01) |
| Fed-Zielband | NY Fed | Stufen ab 2008-12-16 |
| EFFR | NY Fed | ab 2000-07-03 |
| EZB-Einlagesatz | ECB Data Portal | Stufen ab 1999-01-01 |

## 14. Market-Hours-Modell

Profile US_EQUITY, INDEX_US/EU/ASIA, METALS_OTC_24_5, COMMODITY_FUTURES,
FX_24_5, CRYPTO_24_7, REFERENCE_DAILY, REFERENCE_MONTHLY, POLICY_EVENT.
§31-Faelle als Tests: BTC Sa/So, EUR/USD Sa/Mo, US-Index Wochenende, Gold
Wochenende, Oel-Tagespause, Leitzins zwischen Beschluessen, DAX in Berliner Zeit.

## 15. Unit-System

INDEX_POINTS, PRICE_PER_OUNCE, PRICE_PER_BARREL, PRICE_PER_MMBTU,
PRICE_PER_POUND, PRICE_PER_METRIC_TON, PRICE_PER_UNIT, CRYPTO_QUOTE, CURRENCY,
FX_RATE, PERCENT, BASIS_POINTS; kanonische IDs wie `USD_PER_TROY_OUNCE`.

## 16. Currency-Integration

Currency Core unveraendert. `present()` ruft `VUFx.layer.price()` nur fuer
CONVERTIBLE (Rohstoffe, Metalle, Krypto); INDEX/YIELD/RATE NOT_CONVERTIBLE; FX
SELF. Im Browser gemessen: WTI 96,41 USD/bbl -> 83,91 €/bbl; US 10J bleibt 5,11 %.

## 17. Historical Coverage (MEASURED)

Siehe §10/§13; Metalle ab 2021-10 (Anfragetiefe), Krypto BTC ab 2011-08-19,
ETH ab 2015-08-08, EUR/USD ab 1999-01-04. Zeitraeume 1W…10Y, MAX je Instrument
im Vertrag (`history.intervals`), nur wo die Reihe sie traegt.

## 18. Intraday Coverage

MEASURED verfuegbar: Metalle und Krypto (5 min, Tiingo). Offizielle Quellen:
NOT_AVAILABLE (Tageswerte). Ausgeliefert: keine (Lizenz).

## 19. Realtime Coverage

MEASURED: Krypto-WebSocket (Ack 200, BTC/ETH-Ticks) und FX-WebSocket (xauusd,
eurusd). **Nicht aktiviert**: kein neuer Strom, der bestehende Worker ist nicht
ausgerollt; keine LIVE-Behauptung im Vertrag (Gate FRESHNESS).

## 20. Freshness

LIVE nur mit REALTIME-Frequenz; CURRENT, LAST_SESSION, STALE, UNAVAILABLE je
Profil; Neubewertung zur Anzeigezeit (`refresh()`).

## 21. Provenance

Jeder ausgelieferte Wert: source, provider, product, licenseState, attribution,
priceSemantics, fetchedAt, asOf; Gate PROVENANCE.

## 22. Product Contract

`quant/api/multi-asset-contract.js` (`multi-asset-contract-1.0.0`): instrument,
quote (value/range, unit, unitId, change mit PERCENT_OF_VALUE oder
BASIS_POINTS), market, data (freshness, sourceState, provenance), history,
performance, capabilities, displaySemantics, proxy, gap, license.

## 23. Discover Integration

**PASS** (dieser PR). Discover liest ausschliesslich den Product Contract
(`/quant/data/market/multi-asset/snapshot.json`) und baut keine Providerlogik:

- Route `#/maerkte` (`discover/ui/markets.js`, `discover/markets.css`), Gruppen
  Aktienmaerkte, Zinsen, Rohstoffe, Krypto, Devisen.
- Einstieg: eine Pill "Märkte" neben "Themenwelten" auf der Startseite und ein
  Fusszeilenlink; Dock, Layout und bestehende Flaechen unveraendert.
- Jede Karte: Name, Wert mit Einheit, Veraenderung (bp bei Zinsen, % bei
  Kursen), Stand, Frische, Assetklasse, Quellenangabe. Zinsbewegungen ohne
  Gewinn-/Verlustfarbe, Zins-Verlaeufe neutral.
- Frische wird zur Anzeigezeit neu bewertet (`VUMultiAssetContract.refresh`);
  EUR-Anzeige nur fuer monetaere Einheiten ueber `VUFx.layer`.
- Nikkei 225 mit Wert (Quelle Nikkei Inc. via FRED); uebrige Indizes, Kupfer: Hinweis statt Wert; Gold, Silber, BTC, ETH: "oeffentliche
  Anzeige noch nicht freigegeben".
- Gemessen im Browser (Chromium): 23 Karten, 0 Konsolenfehler, kein
  horizontaler Ueberlauf bei 320/390/1440 px, axe WCAG 2.1 AA ohne
  serious/critical in hell und dunkel; bestehende Discover-Browser-QA gruen.

## 24. Tests

| Suite | Ergebnis |
|---|---|
| `quant/tests/multi-asset-*.test.mjs` (Taxonomie, Sitzungen, Vertrag, Adapter) | 38/38 |
| `quant/tests/*.test.mjs` gesamt | 1472/1472 |
| `discover/tests/*.test.mjs` inkl. `markets.test.mjs` + Navigation | 242/242 |
| bestehende Sitzungs-/Freshness-/Realtime-Tests | 250/250 (unveraendert gruen) |
| Currency Regression Guard, Debt Register | unveraendert (33 / 2), Register byte-gleich |
| Public-Data-Hygiene (um Multi-Asset erweitert) | PASS |
| Discover Consolidation Gate, verify-discover-data (64.260 Pruefungen), Browser-QA | PASS |
| CI PR #200 | Quant CI, Multi-Asset Contract, Currency FX, Pages package/validate, Experience QA gruen |

## 25. Production Proof

Gegen **https://research.visionuniverse.de** (Actions-Dispatch auf `main`,
`quant/data/market/multi-asset/production-proof.json`, 2026-09-24T14:15Z):
alle 15 Gates **PASS**, Datenverfuegbarkeit PASS.

| Beispiel | Urteil | Einheit | Stand | Frische | Historie | Anmerkung |
|---|---|---|---|---|---|---|
| S&P 500 | CAPABILITY_GAP | POINTS | — | UNAVAILABLE | — | keine Quelle, kein Proxy |
| Nasdaq 100 | CAPABILITY_GAP | POINTS | — | UNAVAILABLE | — | dito |
| DAX | CAPABILITY_GAP | POINTS | — | UNAVAILABLE | — | dito |
| Gold | LICENSE_PENDING | USD_PER_TROY_OUNCE | Intraday | CURRENT | intern ab 2021-10-20 | technisch PASS im Ingest-Lauf |
| WTI | **PASS** | USD_PER_BARREL | 2026-09-22 | CURRENT | 1986-01-02 … (9.507) | EUR-Anzeige ueber Currency Core |
| BTC | LICENSE_PENDING | USD_PER_BTC | Intraday | CURRENT | intern ab 2011-08-19 | technisch PASS |
| ETH | LICENSE_PENDING | USD_PER_ETH | Intraday | CURRENT | intern ab 2015-08-08 | technisch PASS |
| US 10J | **PASS** | PERCENT | 2026-09-23 | CURRENT | 1990-01-02 … (9.188) | +15 bp, nicht umgerechnet |
| Bund 10J | **PASS** | PERCENT | 2026-09-24 | CURRENT | 1997-08-07 … (7.395) | +10 bp, nicht umgerechnet |
| EUR/USD | **PASS** | EUR_IN_USD | 2026-09-21 | CURRENT | 1999-01-04 … (7.097) | Currency-Core-Reihe, SELF |

Keine falsche LIVE-Behauptung (`realtimeClaim=false` ueberall), kein
Waehrungsformat auf Punkten oder Prozent.

## 26. Provider-/Lizenz-Gaps

1. Tiingo Krypto + FX-Edelmetalle: oeffentliche Anzeige nicht gedeckt.
2. Indexstaende: Nikkei 225 frei mit Quellenangabe; SPX/DJI/SX5E/UKX technisch
   ueber FMP, Anzeige-Erlaubnis UNKNOWN; NDX/DAX nur in Bezahltarifen.
3. Kupfer: Semantik der einzigen Tagesquelle unbekannt.
4. EIA-Spotpreise: Weiterverwendung erlaubt (EIA), Ursprung Refinitiv — vor
   kommerzieller Vermarktung bestaetigen.

## 27. Kosten

PAID_SERVICES_ENABLED = 0. Offizielle Quellen schluessellos; Tiingo im bestehenden
Paket (~32 Anfragen je Lauf, 8 Laeufe/Tag); GitHub Actions auf oeffentlichem
Repository; `xlrd` (Open Source).

## 28. Geaenderte Dateien

PR #200 (Data Core): `quant/config/multi-asset-instruments.json`,
`quant/config/multi-asset.json`, `quant/config/market-calendar.json` (erweitert),
`quant/engines/multi-asset/{asset-taxonomy,instrument-catalog}.js`,
`quant/engines/realtime/{session-profiles,asset-freshness}.js` (neu),
`quant/engines/realtime/{market-hours,trading-session}.js` (Abdeckung je Boerse),
`quant/api/multi-asset-contract.js`, `providers/tiingo/adapter.js` (erweitert),
`providers/ecb/adapter.js` (erweitert), `providers/{us-treasury,nyfed,bundesbank,eia}/adapter.js`,
`scripts/market/{probe-multi-asset,ingest-multi-asset}.mjs`, `scripts/market/eia-xls-to-csv.py`,
`scripts/quality/verify-multi-asset.mjs`, `scripts/market/assert-public-data-hygiene.mjs` (erweitert),
`.github/workflows/multi-asset-data.yml`, `.github/workflows/pages-release.yml` (ein Ausloeser),
`quant/tests/multi-asset-{taxonomy,sessions,contract,adapters}.test.mjs`,
`docs/VU_MULTI_ASSET_DATA_CORE.md`, Daten unter `quant/data/market/multi-asset/` und
`quant/data/market/capabilities/multi-asset-probe.json`.

Dieser PR (Discover): `discover/ui/markets.js`, `discover/markets.css`,
`discover/tests/markets.test.mjs`, `discover/index.html`, `discover/app.js`,
`discover/home.js`, `docs/VU_MULTI_ASSET_FINAL_REPORT.md`.

Nicht geaendert: `quant/engines/fx/*` (Currency Core), Quant-Scores, Faktoren,
Backtests, Quant-2.0-Vertraege, SEC, Social, Worker.

## 29. Commits / PR / Deployment

- PR #200 „Multi-Asset Data Core" — gemergt (Squash `7fe0b938f`), CI gruen
  (Vercel-Status rot wegen Kontingent des Vercel-Kontos, kein Required Check,
  im PR dokumentiert).
- Pages-Release nach dem Merge: Lauf 36010871364 erfolgreich.
- Production Proof: Actions-Dispatch auf `main`, Commit `e9f9df5df`.
- Laufender Betrieb: `multi-asset-data.yml` alle drei Stunden (Ingest +
  Nachweis), danach Pages-Release ueber `workflow_run`.
- Discover-Integration: dieser PR.

## 30. Verbleibende Owner-Entscheidungen

1. Lizenzfreigabe (oder Entwicklungs-Risikoakzeptanz) Tiingo Krypto + Edelmetalle
   -> `sourceRegistry.tiingo-crypto|tiingo-fx-metals.publicDisplay = true`.
2. Indexquelle: (a) FMP-Tagesschluss fuer SPX/DJI/SX5E/UKX zur Anzeige freigeben
   -> `sourceRegistry.fmp-index.publicDisplay = true` (nach Pruefung der
   FMP-Bedingungen); (b) fuer NDX/DAX ein Bezahltarif (FMP $22/$59/$149 oder
   Twelve Data Grow $29, Abdeckung vor Abschluss per `[ma-index-probe]` messen).
3. Kupfer: Tiingo-Referenz mit Kennzeichnung, IMF-Monatswert oder LME/COMEX.
4. Currency-Spur: Zeitplan fuer die EZB-Referenzreihe (EUR/USD wird sonst nach
   4 Tagen ehrlich STALE).

---

## Target State (§60)

| Ziel | Stand |
|---|---|
| ONE_DATA_CORE_PRINCIPLE | PRESERVED |
| INSTRUMENT_MASTER | PASS |
| EQUITY_SUPPORT | PRESERVED (1472 Quant-Tests, Discover-Daten unveraendert) |
| INDEX_SUPPORT | N225 PASS (ausgeliefert) · SPX/DJI/SX5E/UKX DATA_SOURCE_RESOLVED, LICENSE_PENDING · NDX/DAX BLOCKED_BY_PLAN (Owner-Matrix) |
| COMMODITY_SUPPORT | PASS (WTI, Brent, Henry Hub) · Kupfer CAPABILITY_GAP_DOCUMENTED |
| PRECIOUS_METALS_SUPPORT | technisch PASS, oeffentlich LICENSE_PENDING (Owner) |
| CRYPTO_SUPPORT | technisch PASS, oeffentlich LICENSE_PENDING (Owner) |
| YIELD_SUPPORT | PASS |
| FX_SUPPORT | PRESERVED |
| MARKET_HOURS_ASSET_AWARE | PASS |
| UNIT_SYSTEM | PASS |
| FRESHNESS_ASSET_AWARE | PASS |
| PROVENANCE | PASS |
| HISTORICAL_COVERAGE | MEASURED |
| INTRADAY_COVERAGE | MEASURED |
| REALTIME_COVERAGE | MEASURED (nicht aktiviert) |
| NO_SILENT_PROXIES | PASS |
| CURRENCY_CORE_REUSED | PASS |
| DISCOVER | CANONICAL_PRODUCT_PRESERVED (Maerkte als Route im bestehenden Discover) |
| QUANT | UNCHANGED |
| NEW_PARALLEL_DATA_ARCHITECTURES | 0 |
| NEW_UNNECESSARY_BRIDGES | 0 |
| PAID_SERVICES_ENABLED | 0 |
| CRITICAL_BLOCKERS | 0 — verbleibend sind dokumentierte Lizenz-/Capability-Entscheidungen des Owners |
