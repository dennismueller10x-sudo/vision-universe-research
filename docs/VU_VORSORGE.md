# Vision Universe Altersvorsorge (Navigation: VORSORGE)

Branch `claude/vorsorge-altersvorsorge` · Stand des Dokuments: siehe Git-Historie

Vision Universe ist **kein Broker, kein Depotanbieter, kein Vermittler**. Die Produktsäule
ALTERSVORSORGE ist die Analyse-, Planungs-, Vergleichs- und Intelligence-Schicht zwischen
finanziellem Ziel und Umsetzung bei einem externen Anbieter. Das gesetzliche
„Altersvorsorgedepot“ ist ein **analysiertes Produkt**, nicht der Produktname von Vision Universe.

Einstieg `/vorsorge/` (statisch, Hash-Router, GitHub Pages). Globale Navigation: Menügruppe
„Vorsorge“ und Direktlink im Header (`assets/site-navigation.js`).

---

## 1. Architektur

```
vorsorge/
  index.html, app.css, app.js         Seite, Design-Tokens, Router, Store, Charts, Analytics-Vertrag
  ui/plan.js                          Home (Einstiegspfad), Planer, Vorsorgelücke, Kosten, Monitor
  ui/etf.js                           ETF-Welten, Screener, Suche, Detail (7 Tabs), Vergleich, Watchlist
  ui/portfolio.js                     Strategiemodelle, Portfolio-X-Ray (Datenzustände), Szenario-Lab
  ui/foerderung.js                    Förderrechner, Frühstart, Riester, Anbieter, Wissen, Datenqualität
  engines/                            deterministische UMD-Module (Browser + Node)
    vorsorge-math.js                  futureValue, realFutureValue, requiredSavingsRate, requiredCapital,
                                      retirementIncome, withdrawalScenario, feeImpact, goalProbability,
                                      plan, retirementGap, leverAnalysis
    etf-analytics.js                  Performance 1D…10Y/MAX, Volatilität, Downside, Max Drawdown
                                      (Start/Tief/Erholung/Dauer), Monate/Jahre, rollierend 1J/3J, Trend,
                                      relative Stärke, Korrelation, Portfolio-Reihe
    etf-taxonomy.js                   Produkttyp, Strategien, Vorsorge-Einordnung, Schichten, Anomalien
    etf-master.js                     ETF-Beleg, FUND → SHARE CLASS → LISTING, Duplikate, Overrides, DNA, Suche
    etf-provider.js                   ETFProviderAdapter, Statusmatrix, Mapping-Vertrag zweiter Anbieter
    series-codec.js                   kompakte Kursreihen (Datum als Tagesdifferenzen)
    xray.js                           Holdings-Vertrag v2, Overlap, Durchschau, X-Ray, Szenario-Lab
    funding.js                        versionierte Förder-Rules-Engine mit Prüfsumme
    monitor.js                        What changed (Produkt/Markt/Daten/Plan/Portfolio/Regeln), Ampel, Riester
  data/
    etf-index.json                    spaltenförmiger Index aller Listings (Screener, Suche)
    etf/<slug>.json                   Detail je Listing: Taxonomie, Metriken, DNA, Provenienz
    series/<SYM>.json                 kompakte Kursreihen (Kurs- und ggf. Gesamtrendite)
    ingest/                           Ergebnis des Tiingo-Ingests (universe, catalog-stats, report, failed)
    quality.json, ucits-coverage.json, data-gaps.json, changes.json
    funding-rules/*.json + sources/   Regeldateien + amtliche Primärtexte (Hash, Abrufzeit)
    overrides.json, model-portfolios.json (Strategiemodelle), providers.json (Schema, keine Fake-Zeilen)
  etf/<slug>/index.html, sitemap.xml  öffentliche ETF-Seiten (nur Public Analysis Universe, ≥ 1 Jahr)
  tests/*.test.mjs
scripts/vorsorge/
  ingest-tiingo-etfs.mjs              Tiingo-Volllauf (nur CI, Secret)
  tiingo-catalog.mjs                  Leser für supported_tickers.zip (Modulgrenze: scripts/market bleibt unberührt)
  build-etf-data.mjs                  deterministischer Build (keine Uhr, keine Arbeitsablage)
  assert-vorsorge-data.mjs            Qualitäts- und Regressions-Gates
  fetch-legal-sources.sh              Primärquellen der Förderregeln (nur CI)
.github/workflows/
  vorsorge-ci.yml                     Tests, Reproduzierbarkeit, Gates, Regeln, Hygiene
  vorsorge-etf-universe.yml           Tiingo-Volllauf
  vorsorge-legal-sources.yml          Rechtsquellen laden
```

## 2. Datenfluss

```
Tiingo supported_tickers.zip ─┐                         (GitHub Actions, Secret TIINGO_API_KEY)
Tiingo /daily/<t> + /prices ──┴─> ingest-tiingo-etfs.mjs ─> .market-cache/vorsorge (Cache, Checkpoint, Rohzeilen)
                                                         └> vorsorge/data/ingest + vorsorge/data/series (committet)
Repository-Auszug (quant/…) ─────────────┐
vorsorge/data/ingest + series ───────────┴─> build-etf-data.mjs ─> etf-index, etf/*, quality, ucits, gaps, changes, SEO
                                                                └> assert-vorsorge-data.mjs (Gates) ─> Commit ─> Pages
```

### Tiingo-Zugang
Der Schlüssel liegt ausschließlich als GitHub-Actions-Secret `TIINGO_API_KEY` vor. Er steht nur
im `Authorization`-Kopf, nie in einer URL, einem Log oder einer Datei. Ein Workflow-Schritt
durchsucht alle erzeugten Daten und Berichte nach dem Schlüssel und bricht ab, wenn er ihn findet.
`assert-vorsorge-data.mjs` prüft zusätzlich auf Token-Muster.

### Auslösen
`workflow_dispatch` ist erst möglich, wenn der Workflow auf `main` liegt. Auf `claude/**`-Branches
startet ein Push mit Marker in der Commit-Nachricht:
`[vorsorge-ingest-canary]` (40 Ticker), `[vorsorge-ingest]` (alle aktiven), `[vorsorge-legal]` (Rechtsquellen).

### Kontingent, Fortsetzen, Fehler
Zwei Anfragen je aktivem Ticker (Stammdaten + Kerzen), Drossel 4.500/h, 429/408/5xx/Timeout/
Verbindungsfehler mit exponentiellem Backoff, zwölf 429 in Folge beenden sauber (`QUOTA`).
Checkpoint (`processed`, `failed`, `lastSymbol`, `updatedAt`) und Reihen liegen in der gecachten
Arbeitsablage; ein Folgelauf setzt fort. Gescheiterte Ticker: `vorsorge/data/ingest/failed-etf-ingest.json`
(`symbol, endpoint, status, reason, retryable, attempts`).

### Generated-File-Policy
| Art | Ort | committet? |
|---|---|---|
| Rohzeilen der Tickerliste (alle ETF-Zeilen inkl. Archiv) | `.market-cache`, Workflow-Artefakt (30 Tage) | nein |
| Checkpoint | Actions-Cache | nein |
| Stammdaten aktiver, abgefragter ETFs | `vorsorge/data/ingest/universe.json` | ja |
| Kursreihen (nur Schlusskurse, kompakt) | `vorsorge/data/series/` | ja |
| abgeleitete Kennzahlen, Index, Detail, QA | `vorsorge/data/` | ja (deterministisch aus den obigen) |
| Primärtexte der Förderregeln | `vorsorge/data/funding-rules/sources/` | ja (amtliche Werke, § 5 UrhG) |

Keine OHLCV-Kerzen im öffentlichen Baum (`assert-public-data-hygiene.mjs`). Veröffentlicht werden
Schlusskurse und abgeleitete Werte des Produktuniversums wie bei `quant/data/market/discover-series`.

## 3. Entity-Modell

`FUND → SHARE CLASS → LISTING`. Ein Listing ist Ticker + Börse. Fonds werden **nur** zusammengeführt,
wenn Anbieter **und** normalisierter Name übereinstimmen (Methode `ISSUER_AND_NORMALIZED_NAME`,
Konfidenz MEDIUM); sonst bleibt jedes Listing ein eigener Fonds (`LISTING_ONLY`). Ohne ISIN kein
weitergehendes Mapping. Share Class aus Namensbestandteilen („ETF Shares“, „Class A“).
Slugs: Ticker, solange eindeutig; sonst `TICKER-BÖRSE`. Bestehende URLs `/vorsorge/etf/<TICKER>/`
bleiben dadurch gültig.

Provenienz je Entität: `source, sourceId, retrievedAt, asOf, classificationMethod,
classificationConfidence, coverage, missingFields, canonicalizationMethod, manualOverride`.

## 4. Klassifikation und Schichten

`etf-taxonomy.js` (Name + Anbietergattung, jede Entscheidung mit Grundlage):
- Produkttyp: ETF, ETN, ETC, ETP, CEF, MUTUAL_FUND, UNKNOWN
- Strategie: LEVERAGED, INVERSE, LEVERAGED_INVERSE, SINGLE_STOCK, OPTION_INCOME, COVERED_CALL, BUFFER,
  DEFINED_OUTCOME, CRYPTO, COMMODITY, THEMATIC, BOND, EQUITY, MULTI_ASSET, MONEY_MARKET, ALTERNATIVE, UNKNOWN
- Einzelaktie: `long/short <TICKER>`, `Daily <TICKER> Bull/Bear` (auch Großbuchstaben-Namen mit Wortsperrliste),
  `(<TICKER>)` bzw. `<TICKER> Option Income`; Markenzeichen `(R)`/`(TM)` und Krypto-Token sind keine Aktie
- Vorsorge-Einordnung (**keine Anlageempfehlung**): STANDARD · KOMPLEX · SEHR_KOMPLEX · NICHT_EINORDENBAR
- `COMMON_STOCK`-Fehlklassifikationen: ETF-Beleg auch aus dem Namen (ETF/ETN, iShares/ProShares/SPDR),
  REIT/BDC/Bank/geschlossene Fonds ausgeschlossen; manuelle Overrides in `overrides.json`.

Schichten:
| Schicht | Regel |
|---|---|
| RAW | alle ETF-Zeilen der Tiingo-Tickerliste (nur Zählung im Repo) |
| CANONICAL | alle Listings im Index |
| PUBLIC_ANALYSIS | aktiv, Name, Kursreihe, keine Kollision, kein OTC, Bauart STANDARD |
| COMPLEX | wie oben, aber KOMPLEX/SEHR_KOMPLEX (ausgeblendet, über Suche/Schalter erreichbar) |
| ARCHIVE | inaktiv/delistet (nicht gelöscht) |
| REVIEW | Kollision, OTC/Pink, kein Name, keine Kurse, Kursanomalie, CEF/Mutual Fund, nicht einordenbar |

Recycelte Ticker: Kurslücke > 120 Tage trennt Vorgänger ab; Anbieter-Startdatum ist nie Auflagedatum.

Auslieferung: `etf-index.json` enthält nur PUBLIC_ANALYSIS + COMPLEX (≈ 475 KB gzip), `etf-index-extra.json`
Archiv und Prüfschicht; der Browser lädt den Zusatzteil erst bei Bedarf (Schalter „inaktive“, Detail, Watchlist).

### Gemessener Stand (Tiingo-Vollingest, Datenstand 02.10.2026)
| Größe | Wert |
|---|---|
| Zeilen der Tiingo-Tickerliste / davon ETF | 108.934 / 9.777 |
| aktive ETF-Ticker / erfolgreich abgefragt / ohne Kurse / gescheitert | 7.273 / 7.266 / 7 / 7 |
| Listings / kanonische Fonds | 7.414 / 7.397 |
| mit Kursreihe / ≥ 1 / 3 / 5 / 10 Jahre / Gesamtrendite | 7.405 / 5.188 / 3.522 / 2.758 / 1.620 / 7.010 |
| PUBLIC_ANALYSIS / COMPLEX / REVIEW / ARCHIVE | 4.007 / 2.065 / 1.334 / 8 |
| STANDARD / KOMPLEX / SEHR_KOMPLEX / NICHT_EINORDENBAR | 4.600 / 1.333 / 852 / 629 |
| Hebel/Short · Einzelaktie erkannt | 773 · 434 |
| Börsen (Top) | NYSE 2.761, BATS 1.583, NASDAQ 1.382, PINK 523, SHG 416, SHE 376 |
| Währungen | USD 6.685, CNY 727, AUD 2 |
| europäische Listings / ISIN | 0 / 0 (427 UCITS-Fonds nur als US-OTC-Zeile) |

Workflow-Läufe: Canary 37143360935, Vollingest 37143602433 (Ingest 3 h 13 min, 0 × HTTP 429),
Fortsetzung 37155917225; Rechtsquellen 37143678724.

## 5. Mathematik

Monatliche Verzinsung, geometrisch (`(1+R)^(1/12)-1`); Kosten als laufender Abzug
(`(1+R)(1-K)-1`); Sparrate am Monatsende; Startkapital und Einmalanlage ab Tag 0; Inflation
diskontiert auf heutige Kaufkraft. Entnahme = gleichbleibende Kaufkraft über die gewählte Dauer,
Restkapital bleibt mit realer Rendite angelegt („modellierte Entnahme“, keine garantierte Rente).
Zielwahrscheinlichkeit: geseedete Monte-Carlo-Simulation, lognormal. Szenarien statt Prognose.

## 6. Risiko

Volatilität (5 J. Wochenwerte bzw. vorhandene Historie), Downside-Abweichung, Max Drawdown mit
Hoch, Tief, Erholungsdatum, Erholungsmonate, Dauer; bester/schlechtester Monat und Jahr (nur
vollständige Jahre); rollierende 1J/3J-Ergebnisse. Kursrendite und Gesamtrendite getrennt; Gesamtrendite
nur bei erfolgreicher Rekonstruktion aus Rohkurs, Split und Ausschüttung (`canonical-total-return.js`).

## 7. Förderregeln

Versioniert in `vorsorge/data/funding-rules/`, Pflichtfelder `country, jurisdiction, validFrom,
validUntil, ruleVersion, status, legalStatus, ruleSource, primarySource, verification
(primaryVerified, verifiedAt, fields), ruleHash`. Die Prüfsumme deckt alle rechnerisch relevanten
Teile ab; eine Änderung ohne neue Version scheitert in CI.

| Regel | Rechtsstand | primaryVerified |
|---|---|---|
| `2027-DE` Altersvorsorgedepot | Gesetz verkündet, BGBl. 2026 I Nr. 156 | **ja** – Wert für Wert gegen den Gesetzestext |
| `2026-DE-riester` Bestandsverträge | geltendes Recht + Übergang § 52 Abs. 50a EStG | nein (Altfassung nicht abrufbar) |
| `fruehstart-DE` Frühstartrente | Gesetzentwurf, BT-Drs. 21/7864 | nein (kein Gesetz) |

Verifiziert (BGBl. 2026 I Nr. 156): Grundzulage 50 % bis 360 € + 25 % bis 1.800 € (max. 540 €),
Berufseinsteigerbonus 200 € einmalig (< 25 J.), Ehegatte § 79 S. 2 max. 175 €, Kinderzulage 100 %
bis 1.800 € Beitrag, max. 300 €/Kind, Mindesteigenbeitrag 120 €, Sonderausgaben bis 1.800 € + Zulage,
zulässige Anlagen (OGAW/UCITS, Publikums-AIF, ELTIF mit KID-Risikoklasse ≤ 5, Euro-Staatsanleihen),
Effektivkosten Standarddepot ≤ 1,0 %, Auszahlung ab 65 bis spätestens 70, Auszahlungsplan bis
mindestens 85, Inkrafttreten 1.1.2027. **US-ETFs sind im Altersvorsorgedepot nicht zulässig.**

## 8. Bekannte Datenlücken und zweiter Anbieter

Siehe `vorsorge/data/data-gaps.json` und `ucits-coverage.json`. Tiingo liefert Kurse,
Ausschüttungen, Splits, Namen und Beschreibungen; **nicht**: ISIN/WKN, TER, Fondsvolumen,
Holdings, Replikation, Domizil/UCITS-Status, NAV, Indexstände für Tracking Difference.
Der Mapping-Vertrag (`etf-provider.js → MAPPING_CONTRACT`) beschreibt, was ein zweiter Anbieter
liefern muss; Holdings über `etf-holdings-2.0.0`. Kein Anbieter wird hier empfohlen.

### Datenvolumen und Auslieferung (gemessen 04.10.2026)
| Größe | Wert | Einordnung |
|---|---|---|
| Arbeitsbaum `vorsorge/` | 164 MB, 17.816 Dateien (Kursreihen 71 MB, Details 59 MB, SEO 3,6 MB) | |
| Git, gepackt (alle PR-Objekte inkl. Zwischenstände) | +37 MB auf 3,11 GiB | +1,2 % Clone |
| Pages-Artefakt (komprimiert) | ≈ +26 MB auf 486 MB (main) | +5 % |
| Pages-Site (unkomprimiert) | +147 MB auf ≈ 1,08 GB (main) | main liegt bereits über der 1-GB-Richtgröße |
| ein vollständiger Daten-Refresh (alle Reihen + Details) | ≈ +10 MB gepackt je Lauf | trotz Git-Deltas |

Bewertung: Für den Merge vertretbar. Das Muster entspricht Discover/Quant (veröffentlichte Reihen im Repo),
der Ingest läuft **nicht** zeitgesteuert (nur `workflow_dispatch` bzw. Marker auf `claude/**`), es gibt also
kein laufendes Wachstum. Ein **täglicher** Refresh wäre dagegen nicht vertretbar (≈ 2,5 GB/Jahr).
Refresh-Regel bis zur Umstellung: höchstens monatlich. Vor jedem häufigeren Takt die Reihen in
unveränderliche Jahresblöcke + kleine Ende-Datei teilen (ein Refresh berührt dann nur die Ende-Dateien)
oder die Reihen aus dem bestehenden R2-Speicher statt aus dem Repo ausliefern.

## 9. Release, QA

Gemessen (lokal, ungzippt ausgeliefert, Screener mit 6.072 Zeilen): Desktop Laden 0,8 s, erstes
Rendern 43 ms, Suche 4 ms; Mobil (4 × CPU-Drossel) 1,5 s / 206 ms / 20 ms. Risiko-Plausibilität:
SPY 10 J. 13,5 % p. a. Kurs / 15,3 % Gesamtrendite, Max. Rückgang −55,9 % (2007–2009, erholt 03/2013);
QQQ −82,7 % (erholt 09/2016); EEM −63,5 % (erholt 01/2021).

- `node --test "vorsorge/tests/*.test.mjs"`, `node scripts/vorsorge/assert-vorsorge-data.mjs`
- Reproduzierbarkeit: zwei Builds, identische Hashes
- Browser-QA (Playwright) über alle Routen bei 1440/1280/820/768/430/390 px, hell/dunkel
- Regression: Discover, Quant, SuperTrader, Screener, Worker, Release-Build, Datenhygiene
- Modulgrenzen: keine Änderungen an `quant/`, `scripts/market/`, `providers/`, `api/`, `server/`, `worker/`

## 10. ETF Intelligence: Fundamentals, Holdings, Change Intelligence

Quellenmatrix und Nutzungsbedingungen: `docs/ETF_PRIMARY_SOURCE_MATRIX.md`.

### Datenwege (alle in GitHub Actions, `vorsorge-etf-sources.yml`)
| Marker | Skript | Quelle | Ausgabe (Git) |
|---|---|---|---|
| `[vorsorge-etf-probe]` | `probe-etf-sources.mjs` | Nutzungsbedingungen, robots.txt, Form offener Quellen | `data/sources/etf-source-probe.json` |
| `[vorsorge-nport]` | `ingest-sec-nport.mjs` → `fetch-sec-sic.mjs` → `build-etf-intelligence.mjs` | SEC N-PORT (4 Quartale), SEC submissions (SIC) | `data/holdings/<SERIE>.json`, `data/holdings/index.json`, `data/sources/sec-sic.json`, `data/sources/nport-manifest.json` |
| `[vorsorge-fundamentals]` | `ingest-sec-rr.mjs`, `ingest-esma-firds.mjs` | SEC Risk/Return (Prospekt-XBRL), ESMA FIRDS, GLEIF | `data/sources/sec-rr-costs.json`, `data/eu/etf-eu-index.json` |

Beide Datenjobs bauen anschließend den ETF-Stamm (`build-etf-data.mjs`) neu und prüfen ihn mit
`assert-vorsorge-data.mjs`. Sie schreiben dieselben abgeleiteten Dateien und werden deshalb
nacheinander ausgelöst, nicht gleichzeitig. Neue Prüfregeln für Holdings greifen erst, wenn der
N-PORT-Job die Holdings mit dem passenden Code neu erzeugt hat; deshalb läuft nach einer Änderung an
den Holdings-Regeln zuerst `[vorsorge-nport]`.

Vollständige Snapshots bleiben in der CI-Arbeitsablage (`.market-cache/vorsorge/nport`). Ins Git
kommt je Fonds eine kompakte Datei: die 100 größten Positionen, Exposures und Konzentration aus allen
Positionen, Historie je Quartal, Änderungen im Spaltenformat und eine Zeitleiste.

### Verträge
- `etf-fundamentals.js`: ETF_FUNDAMENTALS_SCHEMA_VERSION 2.0.0 mit Herkunft je Feld (`value, source, sourceType,
  sourceUrl, asOf, retrievedAt, confidence, originalField`). Kosten sind Dezimalbrüche. TER, Ongoing Charges, Expense Ratio
  und Management Fee sind getrennte Felder. Beim Zusammenführen gewinnt die höhere Quellenart, Widersprüche werden
  gespeichert (`AS_OF_DIFFERS` | `VALUE_CONFLICT`).
- `etf-holdings.js`: ETF_HOLDINGS_SCHEMA_VERSION 2.0.0. Gewichte sind Dezimalbrüche; die Einheit gilt je Datei und
  wird nie je Zeile geraten. Anlagearten: EQUITY … UNKNOWN (inkl. N-PORT-Codes). Die Identität einer Position läuft über
  ISIN, dann CUSIP, dann SEDOL, dann Ticker+Börse. Der Snapshot-Hash umfasst nur Positionen und Gewichte.
- `etf-changes.js`: ETF_CHANGE_EVENT_VERSION 1.0.0. Der erste Snapshot ist die Baseline. Gleicher Inhalt erzeugt
  keine Ereignisse. Verglichen wird nur innerhalb desselben Fonds und derselben Quelle mit späterem Stichtag.
  Rauschen < 0,10 PP wird ignoriert. Die IDs sind deterministisch.

### Fachliche Regeln
- **Stichtag** = Berichtsdatum des Bestands (REPORT_DATE), nicht das Einreichungsdatum. Das Einreichungsdatum steht
  als `publishedAt` daneben.
- **Fondsvermögen (N-PORT NET_ASSETS)** gilt auf Fondsebene, also für alle Anteilklassen einer Serie (z. B.
  Vanguard-ETF-Klasse und Investmentfonds-Klassen). Ausgewiesen als `aumLevel = FUND`.
- **UCITS**: Ein N-PORT-Melder ist eine US-Investmentgesellschaft und deshalb **kein UCITS** (Quelle SEC, Konfidenz
  HIGH). Für EU-Anteilklassen gibt es nur den Hinweis „UCITS im amtlichen Namen“. Das ist kein Beleg.
- **Hebel-/Derivatefonds** (`derivativeHeavy`): N-PORT meldet in % des Nettovermögens, einzelne Positionen liegen
  über 100 %. Diese Fonds werden gekennzeichnet und bei Durchschau und Overlap nicht berücksichtigt.
  Optionsbeine (z. B. FLEX-Optionen von Floor-ETFs) werden mit Nominalwert gemeldet und dürfen dort einzeln weit über
  1000 % liegen; Wertpapiere bleiben auch in Derivatefonds auf ±1000 % begrenzt.
- **Änderungen zwischen Quartalen** (Change Event 1.0): Positionen werden zuerst über gemeinsame Kennungen
  zugeordnet (ISIN, CUSIP, aus US/CA-ISIN abgeleitete CUSIP, SEDOL, Ticker), danach verschwundene und neue
  Aktien/Fonds gleichen Namens und gleicher Anlageklasse, wenn der Name auf jeder Seite genau einmal vorkommt
  (ISIN-Wechsel nach Kapitalmaßnahme). Gleichnamige Gattungen mit eigener Kennung (Alphabet A/C) bleiben getrennt.
  Grenzen: ein vollständiger Tausch zweier gleichnamiger Gattungen ohne gemeinsame Kennung erscheint als
  Gewichtsänderung; wechselt die gemeldete Anlageklasse (z. B. Genussschein → Aktie), erscheint es als Zu- und Abgang.
  Unveränderte Stückzahl kennzeichnet eine Gewichtsänderung als Kursbewegung (`driver = PRICE`, eine Stufe niedriger).
  Rauschen: unter 0,10 Prozentpunkten kein Ereignis, unter 0,25 Prozentpunkten nicht angezeigt.
- **Wirtschaftszweig** über den SEC-SIC-Code des Emittenten, als Näherung auf elf Sektoren abgebildet und als
  „SEC-SIC“ beschriftet, nicht als GICS.
- **Kosten**: die Expense Ratio laut Gebührentabelle im Prospekt (US). Sie ist nicht identisch mit TER oder den
  laufenden Kosten im europäischen Basisinformationsblatt.

### Betrieb der Datenjobs
- `nport` und `fundamentals` teilen eine Concurrency-Gruppe und laufen nie parallel.
- Ein abgebrochener Lauf, der schon im Push-Schritt ist, schreibt trotzdem. Ein Lauf checkt den Branch-Kopf bei
  Start aus; landet danach ein anderer Datencommit, scheitert sein Push an Konflikten in `vorsorge/data`. Dann neu
  starten (Re-run), der neue Versuch baut auf dem aktuellen Kopf auf.
- Datenvolumen gegenüber main: Holdings rund 61 MB, ETF-Detaildateien +28 MB (Feldprovenienz), EU-Index und Quellen
  3 MB. Alles wird je ETF nachgeladen, nicht beim Seitenaufruf.

### Nicht verfügbar (benannt, nicht geschätzt)
Tagesaktuelle Bestände, Holdings und Kosten europäischer UCITS-ETFs, WKN, Replikation, NAV, Tracking Difference
und Kurse europäischer Listings. Die Gründe stehen in der Quellenmatrix.
