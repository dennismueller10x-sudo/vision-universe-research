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
  DEFINED_OUTCOME, CRYPTO, COMMODITY, THEMATIC, BOND, EQUITY, MULTI_ASSET, MONEY_MARKET, UNKNOWN
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

## 9. Release, QA

- `node --test "vorsorge/tests/*.test.mjs"`, `node scripts/vorsorge/assert-vorsorge-data.mjs`
- Reproduzierbarkeit: zwei Builds, identische Hashes
- Browser-QA (Playwright) über alle Routen bei 1440/1280/820/430/390 px, hell/dunkel
- Regression: Discover, Quant, SuperTrader, Screener, Worker, Release-Build, Datenhygiene
- Modulgrenzen: keine Änderungen an `quant/`, `scripts/market/`, `providers/`, `api/`, `server/`, `worker/`
