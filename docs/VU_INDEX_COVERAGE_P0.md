# VISION UNIVERSE® — Index Coverage P0

Stand: 2026-09-24. Messgrundlage: `quant/data/market/capabilities/index-source-probe.json`, erzeugt von `scripts/market/probe-index-sources.mjs` in GitHub Actions (Job `measure-indices`, sechs Runden). Der Bericht enthält keine Kurswerte, nur Form, Abdeckung, Identität (Name plus Größenordnung) und Lizenztexte.

Regeln dieser Erweiterung:
- keine ETF-Proxys, keine Futures als Index, keine Eigenberechnung, keine symbolbasierten Annahmen;
- keine neue Architektur, keine kostenpflichtige Quelle aktiviert;
- Quant unverändert.

Die Kennzeichnung der Befunde:
- **MEASURED** – in einem echten Abruf festgestellt.
- **INFERRED** – abgeleitet, nicht einzeln gemessen.
- **UNKNOWN** – nicht feststellbar.

## 1. Ergebnis je Pflichtindex

| Index | Status | Tagesschluss / Historie | Intraday | Anzeige | Nächste Option |
|---|---|---|---|---|---|
| S&P 500 | **DATA_SOURCE_RESOLVED** (technisch) | FMP `^GSPC`, vorhandener Zugang, 10 J. (MEASURED) | nicht im Tarif (MEASURED) | LICENSE_PENDING | Owner-Freigabe FMP oder Anzeige-Tarif |
| Nasdaq 100 | **BLOCKED_BY_PLAN** | FMP 402, Twelve Data „ab Grow" (MEASURED) | – | – | Twelve Data Grow oder FMP-Bezahltarif |
| Dow Jones Industrial Average | **DATA_SOURCE_RESOLVED** (technisch) | FMP `^DJI`, 10 J. (MEASURED) | nicht im Tarif | LICENSE_PENDING | wie S&P 500 |
| DAX | **BLOCKED_BY_PLAN** | FMP 402; Twelve Data Basic 404; STOXX-API 401 (MEASURED) | – | – | FMP-Bezahltarif oder EODHD; STOXX-Lizenz |
| Euro Stoxx 50 | **DATA_SOURCE_RESOLVED** (technisch) | FMP `^STOXX50E`, 10 J. (MEASURED) | nicht im Tarif | LICENSE_PENDING | wie S&P 500 |
| FTSE 100 | **DATA_SOURCE_RESOLVED** (technisch) | FMP `^FTSE`, 10 J. (MEASURED) | nicht im Tarif | LICENSE_PENDING | wie S&P 500 |
| Nikkei 225 | **ACTIVE – ausgeliefert** | FRED `NIKKEI225`, ab 1949, Gegenprobe Nikkei Inc. (MEASURED) | kein freier Pfad (MEASURED) | **erlaubt mit Quellenangabe** (MEASURED) | – |

- **Technisch aufgelöst:** 5 von 7. Das heißt: echte Indexstände, Identität je Lauf geprüft, eingebunden in den bestehenden Multi-Asset-Ingest und denselben Product Contract.
- **Öffentlich angezeigt:** 1 von 7 (Nikkei 225), weil nur dort eine Anzeige-Erlaubnis gemessen ist.
- **Blockiert:** 2 von 7 (Nasdaq 100, DAX). Beide sind im vorhandenen Tarif ausdrücklich gesperrt.

Optionale Indizes:
- **Hang Seng, Russell 2000:** über FMP technisch aufgelöst (LICENSE_PENDING).
- **CAC 40, SMI:** FMP 402.
- **Shanghai Composite:** siehe §4, Symbolfalle.
- **MSCI World:** offizielle MSCI-Seite mit 10 Jahren messbar, Nutzungsbedingungen nicht lesbar, nicht eingebunden.

## 2. Messfelder je Pflichtindex

| Feld | S&P 500 | Dow Jones | Euro Stoxx 50 | FTSE 100 | Nikkei 225 |
|---|---|---|---|---|---|
| SOURCE | FMP (vorhanden) | FMP (vorhanden) | FMP (vorhanden) | FMP (vorhanden) | FRED (Fed St. Louis) |
| OFFICIAL_NAME (Quelle) | „S&P 500" | „Dow Jones Industrial Average" | „Euro STOXX 50" | „FTSE 100" | „Nikkei Stock Average, Nikkei 225" |
| PROVIDER_IDENTIFIER | `^GSPC` | `^DJI` | `^STOXX50E` | `^FTSE` | `NIKKEI225` |
| PRICE / TR / NR | Kursindex (INFERRED aus Name und Größenordnung) | Kursindex | Kursindex (INFERRED) | Kursindex (INFERRED) | Kursindex |
| HISTORICAL_COVERAGE | 2016-09-26…heute (angefragt 10 J.) | 2016-09-26…heute | 2016-09-26…heute | 2016-09-26…heute | 1949-05-16…heute |
| DAILY | ja | ja | ja | ja | ja |
| INTRADAY | nein („Restricted Endpoint") | nein | nein | nein | nein |
| REALTIME | nein | nein | nein | nein | nein |
| DELAY | Tagesschluss | Tagesschluss | Tagesschluss | Tagesschluss | Tagesschluss, gleicher Tag gemessen |
| MARKET_HOURS / TZ | XNYS, America/New_York | XNYS | XETR, Europe/Berlin | XLON, Europe/London | XTKS, Asia/Tokyo |
| LICENSE / DISPLAY | UNKNOWN → LICENSE_PENDING | UNKNOWN | UNKNOWN | UNKNOWN | „Citation required" (MEASURED) |
| COST | 0 (vorhandener freier Tarif, 250 Anfragen/Tag) | 0 | 0 | 0 | 0 |
| API | REST/JSON, dokumentiert | REST/JSON | REST/JSON | REST/JSON | CSV, dokumentiert |
| PRODUCTION SUITABILITY | technisch ja, Anzeige nein | technisch ja, Anzeige nein | technisch ja, Anzeige nein | technisch ja, Anzeige nein | **ja** |

Nasdaq 100 und DAX: siehe §1 und §3.

## 3. Quellen — was gemessen wurde

**Vorhandene Zugänge (Vorrang 1)**

- **Tiingo:** führt keine Indexstände (multi-asset-probe.json, Vorlauf).
- **Twelve Data** (Tarif „basic", 8/min, 800/Tag, MEASURED):
  - Die Liste `/indices` führt 1.297 Einträge, darunter N225, FTSE, GDAXI, FCHI und HSI.
  - Jeder Datenabruf dieser Kürzel liefert 404, auch mit `country` oder `mic_code`.
  - SPX und NDX: „This symbol is available starting with the Grow or Venture plan."
- **FMP:** Tagesschluss für `^GSPC`, `^DJI`, `^STOXX50E`, `^FTSE`, `^N225`, `^HSI`, `^RUT`.
  - Name über die FMP-Indexliste geprüft, Größenordnung im Katalogbereich.
  - `^NDX`, `^GDAXI`, `^FCHI`, `^SSMI`: HTTP 402 „Premium Query Parameter".
  - Intraday: „Restricted Endpoint".
  - Die Nutzungsbedingungen sind per JavaScript gerendert und nicht lesbar. Die Seite trennt „Personal Use" und „Commercial Use".
- **Finnhub** (vorhandener Zugang): „Market data subscription required for CFD indices."

**Offizielle Index- und Börsenquellen (Vorrang 2)**

- **Nikkei Inc.:**
  - Tagesdatei ab 2023, Name und Größenordnung passend.
  - Die Seiten mit Nutzungsbedingungen liefern 403/404, die Lizenz ist UNKNOWN.
  - Die Datei dient deshalb nur als Gegenprobe der FRED-Reihe.
- **Nasdaq (api.nasdaq.com):**
  - NDX: 10 Jahre täglich, `isRealTime: false`, verzögerter Zeitstempel.
  - Die API ist eine undokumentierte Website-Schnittstelle, die Browser-Header verlangt. Nutzungsbedingungen 404.
  - Nicht produktionstauglich.
  - SPX, INDU, DJIA: „Symbol not exists".
- **Cboe (cdn.cboe.com):**
  - SPX-Historie ab 1975, RUT ab 2020.
  - Der „verzögerte" Kurs trug am 2026-09-24 den Zeitstempel 2026-09-22: veraltet.
  - DJX ist der Dow geteilt durch 100, also ein anderes Instrument, und wird nicht verwendet.
- **S&P DJI:** 403.
- **STOXX / Qontigo:**
  - `www.stoxx.com` ist vom Runner nicht auflösbar, `stoxx.com` antwortet.
  - Die historischen Dateien sind unter den bekannten Pfaden nicht vorhanden.
  - Die Indexseiten verwenden `quotes.stoxx.com/api/v2/quote/delayed/series`, Antwort **401**, also nur mit Zugang.
- **Deutsche Börse:** leeres JSON.
- **LSEG:** 404.
- **SIX:** 400.
- **SSE:** 403.
- **Hang Seng Indexes:** Performance-JSON 200, Name vorhanden, Bedingungen nicht gemessen.
- **Euronext:**
  - CAC 40 zwei Jahre, Identität passend.
  - Nutzungsbedingungen (MEASURED): „without the express written permission of Euronext".
- **MSCI:** World STRD USD 10 Jahre, Bedingungen nicht lesbar.
- **EZB FM** (Datastream):
  - Euro Stoxx 50, S&P 500 und Nikkei als **Monatsreihen** bis 2026-08, keine Tagesreihe.
  - FTSE 100 und DAX nicht vorhanden.
- **SNB:** Aktienindex-Würfel ohne eindeutig benannte SMI-Reihe.

**Institutioneller Spiegel (Vorrang 3)**

FRED, Lizenzklassen gemessen auf `fred.stlouisfed.org/legal`:
- „Copyrighted: Citation required … you may use these data series with proper attribution … when displaying or publishing it" → NIKKEI225.
- „Copyrighted: Pre-approval required … only … non-commercial educational or personal use" → SP500, DJIA, NASDAQ100. Diese Reihen werden nicht verwendet.

**Nur gemessen:**
- Stooq 403.
- EODHD-Demo-Schlüssel: 403 für alle Indizes.
- FMP-Demo: 401.

## 4. Symbolfalle (MEASURED)

Twelve Data `000001` mit `country=China` lieferte eine **Aktie an der Börse Shenzhen (SZSE)**, nicht den Shanghai Composite. Die Größenordnungsprüfung hat das verworfen. Genau deshalb prüft der Ingest bei jedem Lauf den Namen aus der Indexliste des Anbieters (`providers/fmp/adapter.js#identity`) und nicht nur das Kürzel.

## 5. Tagesschluss und Intraday getrennt?

Ja, das ist zulässig und vorbereitet: Ein Instrument trägt `role: PRIMARY_EOD`, und der Contract führt `capabilities.intraday` getrennt.

Gemessen gibt es aber **keine** freie Intraday-Quelle für einen Pflichtindex:
- FMP: Restricted.
- Twelve Data: gesperrt.
- Nasdaq-Website-API: nicht produktionstauglich.
- Cboe-CDN: veraltet.

Heute ist die Anzeige deshalb überall Tagesschluss. Ein Intraday-Pfad käme über denselben Instrument-Master und denselben Contract hinzu, sobald ein Tarif ihn liefert.

## 6. Anbieter-Matrix für die Owner-Entscheidung

Preise sind von den Preisseiten gelesen (MEASURED als Zahl). Die Zuordnung von Preis zu Tarifname und die Indexabdeckung je Tarif sind **INFERRED**, solange kein Schlüssel des Tarifs gemessen hat.

| Anbieter | Preise gelesen (Monat) | Pflichtindizes | Intraday | Hinweis |
|---|---|---|---|---|
| FMP (vorhanden) | frei; $22 / $59 / $149 | frei: 5 von 7 (MEASURED); NDX, DAX erst in Bezahltarifen (402, MEASURED) | nicht im freien Tarif (MEASURED) | kleinster Schritt: vorhandene Anbindung, nur Tarif; Anzeige-Bedingungen „Commercial Use" prüfen |
| Twelve Data (vorhanden) | $29 / $99 / $329 | SPX, NDX „ab Grow" (MEASURED); übrige INFERRED | INFERRED ja | Schlüssel vorhanden; Grow-Tarif nötig |
| EODHD | $19.99 / $29.99 / $59.99 / $99.99 | INFERRED (Index-Kürzel `.INDX`) | INFERRED | Demo-Schlüssel sperrt Indizes (403, MEASURED) |
| Massive (vormals Polygon), Indices | $0 / $29 / $49 / $99 / $199 | INFERRED US-Indizes | INFERRED | Europa/Asien UNKNOWN |
| Marketstack | $9.99 / $49.99 / $149.99 | INFERRED | INFERRED | – |
| Alpha Vantage | ab $49.99 | UNKNOWN | UNKNOWN | – |
| Index-Anbieter direkt (S&P DJI, STOXX, FTSE Russell, Nikkei) | UNKNOWN (Angebot) | vollständig | ja | öffentliche Anzeige von Indexständen ist in der Regel lizenzpflichtig (INFERRED) |

**Empfehlung für die Entscheidung:**

1. **Kostenlos, sofort:** Freigabe der fünf FMP-Tagesschlussreihen für die Anzeige, falls die FMP-Bedingungen das für den vorhandenen Zugang zulassen. Das ist eine Owner- und Rechtsprüfung, keine Technik. Umgesetzt wird es mit einer Zeile, `sourceRegistry.fmp-index.publicDisplay: true`.
2. **Kleinste Kosten für 7 von 7:** ein FMP-Bezahltarif auf der vorhandenen Anbindung, wenn er NDX und DAX freischaltet. Welcher Tarif das tut, ist INFERRED und vor dem Abschluss mit dem Schlüssel zu messen: Ein Probe-Lauf `[ma-index-probe]` zeigt es sofort.
3. **Alternativ:** Twelve Data Grow für SPX und NDX. Für DAX ist die Abdeckung UNKNOWN.

## 7. Was bewusst nicht getan wurde

- **Kein ETF als Index:** SPY, QQQ, EXS1 bleiben als `knownProxiesNotUsed` benannt.
- **Kein Future als Index**, und DJX wird nicht mit 100 multipliziert.
- **Keine Eigenberechnung** aus Bestandteilen.
- **Keine Pre-approval-Reihe von FRED.**
- **Keine undokumentierte Website-API im Ingest** (Nasdaq, Cboe, STOXX).
- **Kein kostenpflichtiger Tarif aktiviert.**

## 8. Umsetzung im bestehenden Core

- `providers/fred/adapter.js`:
  - Enthält nur Reihen der Klasse „Citation required".
  - Die Klasse wird bei jedem Lauf auf der Reihenseite neu gelesen. Weicht sie ab, wird nichts ausgeliefert.
- `providers/nikkei/adapter.js`: Gegenprobe (Toleranz 0,05 %, die letzten 60 gemeinsamen Tage). Eine Abweichung ist ein Befund, und die Reihe wird dann nicht veröffentlicht.
- `providers/fmp/adapter.js`: Tagesschluss; Identität über die FMP-Indexliste bei jedem Lauf.
- `scripts/market/ingest-multi-asset.mjs`:
  - Neue Fälle `fred-index` und `fmp-index`.
  - Eine FMP-Anfrage je Index und Lauf plus einmal die Indexliste.
- `quant/config/multi-asset.json`:
  - Neue Registry-Einträge `fred-index` (publicDisplay true, CITATION_REQUIRED) und `fmp-index` (publicDisplay false, OWNER_DECISION_REQUIRED).
  - Quellenentscheidungen je Index.
- Tests: `quant/tests/multi-asset-adapters.test.mjs` und `multi-asset-contract.test.mjs`.
- Gate `INDEX_SEMANTICS`: Ein lizenzausstehender Index gilt als begründet, wie bei Rohstoffen.
