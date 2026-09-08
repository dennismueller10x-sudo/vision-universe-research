# VISION UNIVERSE® QUANT & AI — PROJECT MASTER
## Zentrale technische und fachliche Source of Truth

**Stand: 8. September 2026 · geprüft gegen `origin/main` Commit `252dec5` (PR #49 gemerged)**
**Node: 444/444 · SEC Python: 249/249 · Academy: 8/8 — alle drei Runner eigenständig
neu ausgeführt, nicht aus einer PR-Beschreibung übernommen**

> Dieses Dokument ist für einen neuen Claude-Code-, Codex- oder ChatGPT-Chat geschrieben,
> der das Projekt fortsetzen soll, ohne die bisherige Chat-Historie zu kennen. Es ist
> eine Verdichtung, keine Kopie der Fachdokumente unter `docs/`. Wo Doku und
> tatsächlicher Code/Git-Stand auseinanderlaufen, gilt **Code + Tests + Git vor Prosa** —
> jeder gefundene Widerspruch ist unten explizit vermerkt, nicht stillschweigend
> aufgelöst.
>
> Diese Datei ist reine Dokumentation. Bei ihrer Bearbeitung wurde kein produktiver Code,
> keine Architektur und keine Produktionsdaten verändert.

### Source-of-Truth-Regeln — vor jeder Nutzung dieser Datei lesen

1. **`origin/main` ist die technische Source of Truth** — nicht diese Datei, nicht ein
   alter Chat-Report, nicht ein lokal veralteter `main`-Branch.
2. **Vor jedem größeren Audit: `git fetch origin`.** Ein lokaler `main` ohne Fetch ist
   eine Falle — genau dieser Fehler (§0 dieses Audits) hätte beinahe zu einem falschen
   Ausgangs-Commit geführt.
3. Branches dürfen nie anhand eines veralteten lokalen `main` bewertet werden.
4. **Generierte Daten sind nicht automatisch gleichbedeutend mit lizenzierter
   öffentlicher Distribution.** Ein funktionierender Adapter mit echten Testdaten ist
   keine Freigabe — siehe `LEGAL_REVIEW_REQUIRED` bei Tiingo ([§22](#22-tiingo-market-data)).
5. **Tests beweisen nur das, was sie tatsächlich testen.** 444/444 grün heißt nicht
   „alles funktioniert", es heißt „444 konkrete Behauptungen wurden nicht widerlegt".
6. **Synthetische Fixtures sind kein Ersatz für Live-Provider-Validierung.** Wo eine
   Behauptung nur gegen den MockProvider bzw. eine Fixture geprüft ist, steht das
   ausdrücklich dabei — Beispiel: SEC Gate A/C sind `RUNTIME_VERIFIED` gegen echte
   `data.sec.gov`-Antworten, das ist der Unterschied zu einer bloßen Fixture-Prüfung.
7. **Point-in-Time und Survivorship Bias sind getrennte Probleme.** SEC liefert PIT-korrekte
   Fundamentaldaten (Gate A/C bestehen) und trotzdem kein survivorship-freies Universum
   (Gate B fällt durch) — das eine repariert das andere nicht.
8. **UNKNOWN bleibt UNKNOWN.** Eine ungeprüfte Fähigkeit wird nie zu `false` (nicht
   vorhanden) und nie zu `true` (vorhanden) umgedeutet.
9. **FAIL darf nicht in PASS umformuliert werden.** Gate B (SEC, Survivorship) ist FAIL,
   5/5, dauerhaft — das ist ein strukturelles Merkmal von SEC/EDGAR als Quelle, keine
   offene Baustelle, die diese Datei schönreden darf.
10. **Dokumentation muss nach großen Merge-Phasen synchronisiert werden.** Dieses
    Dokument selbst war nach PR #46/#47/#48/#49 vier Merges im Rückstand, bevor dieser
    Audit es nachgezogen hat — siehe [Master Document Changelog](#37-master-document-changelog)
    am Dateiende.

---

## Inhalt

1. [Was ist Vision Universe Quant & AI](#1-was-ist-vision-universe-quant--ai)
2. [Product Vision](#2-product-vision)
3. [Das Gesamtprodukt Vision Universe](#3-das-gesamtprodukt-vision-universe)
4. [Repository-Architektur](#4-repository-architektur)
5. [Phase 1 — Foundation](#5-phase-1--foundation)
6. [Phase 2 — Production Audit](#6-phase-2--production-audit)
7. [Phase 3 — Data Qualification](#7-phase-3--data-qualification)
8. [Release-Status](#8-release-status)
9. [Release-Audit-Funde und Guardrails](#9-release-audit-funde-und-guardrails)
10. [Quant Engine — VU Quant Score](#10-quant-engine--vu-quant-score)
11. [Factor DNA](#11-factor-dna)
12. [Score Momentum / Quant Radar](#12-score-momentum--quant-radar)
13. [Strategy Engine](#13-strategy-engine)
14. [Backtest Engine](#14-backtest-engine)
15. [Point-in-Time (PIT)](#15-point-in-time-pit)
16. [Backtest Trust Score](#16-backtest-trust-score)
17. [AI Architecture](#17-ai-architecture)
18. [VUQL](#18-vuql)
19. [Provider Abstraction](#19-provider-abstraction)
20. [Aktuelle Data Strategy](#20-aktuelle-data-strategy)
21. [SEC Financial Data Core](#21-sec-financial-data-core)
22. [Tiingo Market Data](#22-tiingo-market-data)
23. [Technical Intelligence & Elliott Wave](#23-technical-intelligence--elliott-wave)
24. [Data Licensing](#24-data-licensing)
25. [Mock / Hybrid / Live](#25-mock--hybrid--live)
26. [Security](#26-security)
27. [Storage Strategy](#27-storage-strategy)
28. [Cost Philosophy](#28-cost-philosophy)
29. [Was VU kauft vs. selbst berechnet](#29-was-vu-kauft-vs-selbst-berechnet)
30. [Known Limitations](#30-known-limitations)
31. [DO NOT BREAK THESE RULES](#31-do-not-break-these-rules)
32. [Aktueller Status je Modul](#32-aktueller-status-je-modul)
33. [Roadmap](#33-roadmap)
34. [Decision Gates](#34-decision-gates)
35. [How to Continue This Project](#35-how-to-continue-this-project)
36. [Changelog](#36-changelog)
37. [Master Document Changelog](#37-master-document-changelog)

---

## 1. Was ist Vision Universe Quant & AI

`/quant/` ist der Investment-Intelligence-Bereich von Vision Universe: eine
faktorbasierte Aktienanalyse (VU Quant Score), ein Screener mit eigener Abfragesprache
(VUQL), eine Strategy Engine mit versionierten Regelwerken, eine Point-in-Time-Backtest-
Engine mit methodischem Trust Score, eine Watchlist Intelligence, eine Technical-
Intelligence-Schicht mit Elliott-Wave-Beta und eine AI-Oberfläche, die alle diese
Bausteine als Werkzeuge aufruft, ohne selbst eine einzige Finanzkennzahl zu erzeugen.

Gebaut in fünf großen, nacheinander gemergten Arbeitssträngen zwischen dem 6. und
8. September 2026 (siehe [Changelog](#36-changelog)): Quant & AI V1 (PR #43, Phase 1–3),
Tiingo Market Data (PR #46, Phase 4A), SEC Financial Data Core (PR #48), Technical
Intelligence V1 mit Elliott-Wave-Beta (PR #49). **Der Datenstand ist gemischt, nicht
mehr einheitlich synthetisch:**

| Datenklasse | Stand |
|---|---|
| Quant Score, Factor DNA, Ranking, Screener, Strategy Lab, Backtest | **synthetisch** (511 Mock-Securities) |
| Marktdaten (Tiingo) | **echt, laufzeitgeprüft** — aber intern, nicht öffentlich ausgeliefert ([§22](#22-tiingo-market-data)) |
| Fundamentaldaten (SEC) | **echt, laufzeitgeprüft**, 5 Unternehmen (NVDA, AAPL, MSFT, JPM, XOM) — PIT-korrekt, aber nicht survivorship-frei ([§21](#21-sec-financial-data-core)) |
| Technical Intelligence, Elliott Wave | **echte Kursreihen** (13 Symbole aus dem bestehenden Dashboard-Bestand), Engine-Ausgabe production-grade bzw. Beta ([§23](#23-technical-intelligence--elliott-wave)) |

Die Quant Engine selbst (Score, Faktoren, Strategien, Backtest) bleibt auf dem
synthetischen 511-Titel-Universum — SEC und Tiingo sind bislang **parallele, geprüfte
Datenquellen**, noch nicht in den Quant-Score-Pfad integriert (siehe Roadmap,
[§33](#33-roadmap)).

---

## 2. Product Vision

**VISION UNIVERSE® = INVESTMENT INTELLIGENCE LAYER.** Broker wie Trade Republic sind der
**Execution Layer**. Vision Universe bildet den Weg davor ab:

```
IDEA → DISCOVERY → RESEARCH → QUANT → SCREENING → STRATEGY → BACKTEST
     → UNDERSTANDING → MONITORING
```

**North Star: FROM INVESTMENT IDEA TO EVIDENCE.**

Vision Universe soll **nicht** werden: Broker, Autotrading-System, klassisches
Bloomberg-Terminal, reiner Aktien-Screener, reine Finanznews-Seite.

Ziel: **institutional depth, consumer UX.**

---

## 3. Das Gesamtprodukt Vision Universe

Bestehende Bereiche (zentrale Navigation in `assets/site-navigation.js`, 13 Einträge):

| Bereich | Pfad | Inhalt |
|---|---|---|
| News | `/news/` | Newsdesk, mehrere Quellen |
| **Quant** | `/quant/` | dieser Bereich |
| Dashboard | `/dashboard/` | Aktien-Dashboard: Research, Charting, Discover, Watchlist (V6.3, echte Twelve-Data-Kurse) |
| Guide | `/guide/` | — |
| ETF | `/etf/` | ETF-Dashboard |
| Hedgefonds | `/hedgefonds/` | 13F-Auswertung aus SEC EDGAR (eigenständig, siehe [§21](#21-sec-financial-data-core)) |
| Analysten | `/analysten/` | Analystenbewertungen/Kursziele |
| Macro | `/macro/` | Macro-Intelligence-Dashboard, ~52 Indikatoren, sauberste Referenzarchitektur |
| Magazin | `/magazin/` | redaktionelle Ausgaben |
| Morning | `/morning/` | Morning Briefing |
| Reports | `/reports/xpeng/` | Einzelreports |
| Academy | `/academy/` | Experience-System (Lernstrecken), eigene Engines + Node-Tests |
| Budget | `/budget/` | Platzhalter |

Innerhalb von `/quant/` sind mittlerweile **12 Produktseiten** erreichbar (Navigation in
`quant/ui/shell.js`): Quant Home, Ranking, Screener, Radar, Stock Detail, Strategien,
Strategy Lab, Backtests, Watchlist, Ask Vision Universe, Marktdaten (`/quant/markt/`)
und seit PR #49 **Technical** (`/quant/technical/?symbol=NVDA`) — Charts, Marktstruktur,
Szenarien und Elliott-Wave-Beta für ein reales, wenn auch kleines Symbol-Universum.

Quant & AI ist **kein isolierter Bereich**, sondern langfristig die gemeinsame
Intelligence-Schicht: dieselbe Faktor-, Score- und Backtest-Logik soll perspektivisch
auch Dashboard, Hedgefonds-Bereich und Reports speisen. Aktuell ist die Trennung
noch strikt: **`quant/` liest keine Daten aus `dashboard/`, `macro/`, `hedgefonds/` oder
`academy/` und schreibt dort nichts hinein** — außer den zwei Zeilen Navigation. Die
einzige Ausnahme ist eine **lesende** Übernahme: Technical Intelligence importiert reale
OHLCV-Reihen aus dem bestehenden, bereits splitbereinigten Dashboard-Datenbestand (13
Symbole) über einen generischen `MarketDataProvider`-Adapter — kein Schreibzugriff,
keine zweite Vendor-Anbindung.

---

## 4. Repository-Architektur

### 4.1 Ausgangslage

Das Repository ist eine **statische GitHub-Pages-Site** (`research.visionuniverse.de`,
`CNAME`): kein `package.json`, kein Bundler, keine Server-Runtime, Auslieferung direkt
vom Default-Branch. Alle 12 bestehenden Produktbereiche (Dashboard, Macro, Academy, …)
folgen demselben Muster: reine Berechnungslogik getrennt von UI, Daten als
präkomputiertes JSON, Tests mit `node --test`.

### 4.2 Die Leitentscheidung: Erweiterung statt Rewrite

Die im ursprünglichen Research vorgesehene Zielarchitektur (**Next.js, FastAPI,
PostgreSQL, Parquet, Redis**) wäre die Architektur für einen späteren produktiven
Multi-User-Betrieb mit echten Daten. Sie wurde **bewusst nicht** für diesen Build
gewählt:

- Das Repository hat weder Build-Pipeline noch Server-Runtime; ein Next.js/FastAPI-Umbau
  wäre ein Rewrite aller zwölf bestehenden, funktionierenden Produktbereiche gewesen.
- V1 läuft ausschließlich auf deterministisch erzeugbaren Mock-Daten — dafür ist weder
  eine Datenbank noch ein Python-Service nötig.
- Bestehende CI, bestehendes Design-System, bestehende Navigation sollten unverändert
  weiterlaufen.

**Stattdessen:** `/quant/` wurde als neuer, eigenständiger Produktbereich nach exakt dem
Muster von `macro/` und `academy/` gebaut. Die Schichten des Research-Modells wurden
**eins zu eins abgebildet, nur mit anderer Laufzeittechnologie**:

| Research-Schicht | Umsetzung hier |
|---|---|
| Provider Abstraction | `quant/engines/provider.js` |
| Financial Data Core | `quant/engines/schema.js` |
| Quant Engine | `factors.js`, `normalization.js`, `quant-score.js`, `radar.js` |
| Strategy Engine | `strategy.js` |
| Backtest Engine | `backtest.js`, `trust-score.js` |
| AI Research Layer | `ai-provider.js`, `ai-tools.js` |
| Product API (`/v1/...`) | `quant/api/client.js` — dieselben Contracts als Funktionsaufrufe |
| Product Layer | `quant/**/index.html` + `quant/ui/*` |

Die Grenze zwischen Product API und Engines ist so geschnitten, dass `api/client.js`
später gegen `fetch('/v1/...')` gegen einen echten HTTP-Service ausgetauscht werden
kann, **ohne dass eine Seite angefasst werden muss** — das ist der Migrationspfad zu
Next.js/FastAPI/PostgreSQL, wenn Multi-User-Betrieb mit echten Daten ansteht.

### 4.3 Schichtenmodell

```
quant/**/index.html + quant/ui/*        PRODUCT LAYER — nur Darstellung
            │
quant/api/client.js                     PRODUCT API — die v1-Contracts
            │
ai-provider.js, ai-tools.js             AI RESEARCH LAYER (Tool Registry = Sicherheitsgrenze)
            │
factors.js, quant-score.js, strategy.js DOMAIN ENGINES
query.js, vuql.js, radar.js
            │
backtest.js, trust-score.js             BACKTEST ENGINE
            │
schema.js                               FINANCIAL DATA CORE
            │
provider.js                             PROVIDER ABSTRACTION
            │
mock-provider.js                        Mock (V1) · später Twelve Data, Intrinio, EODHD
```

Jede Schicht kennt nur die direkt darunterliegende. Eine Seite ruft **nie** eine Engine
direkt auf, immer `quant/api/client.js`.

### 4.4 Verzeichnisse

Stand nach PR #46 (Tiingo), #48 (SEC) und #49 (Technical Intelligence):

```
quant/
  engines/            reine Logik, Browser + Node, UMD (globalThis statt window), ohne DOM
    technical/         27 Engine-Module Technical Intelligence (siehe §23), inkl.
                        technical/elliott/ (elliott-engine.js, rules.js, wave-graph.js)
  methodology/        versionierte Konfiguration (Gewichte, Schwellen, Strategien)
  api/                Product-API-Schicht (v1-Contracts)
  ui/                 Designsystem, Shell, SVG-Chartmodul (+ technical-chart.js), Backtest-Worker
  data/               präkomputierte Artefakte — generiert, NICHT von Hand pflegen
    sec/               kanonische SEC-Fundamentaldaten, Coverage-/Gate-Berichte (5,8 MB, 5 Firmen)
    technical/         Snapshots, Evidence Records (~17 MB, 26 Instrumente)
    market/            Tiingo-Cache-Status, Marktdatenherkunft
  config/             market-universe.json, provider-profiles.json (8 Anbieter),
                      feature-gates.json, sec-metric-registry.json
  data-inspector/     interne Prüfoberfläche für jede normalisierte SEC-Kennzahl mit
                      Herkunft (SEC-Concept, Accession Number, Filing-Datum)
  tests/              27 Testdateien (JS) + Fixture-Helfer, node:test — 444 Tests
  technical/          index.html + app.js — Produktseite Technical Intelligence
  <seite>/            index.html + app.js je weitere Produktseite (11 Seiten)
providers/            Adapter je Anbieter: mock/ (aktiv), twelve-data/ (aktiv, Adapter),
                      tiingo/ (aktiv, Adapter, echte Daten), sec/ (aktiv, Adapter, echte
                      Daten), intrinio/, eodhd/ (nur Vorbereitung, kein Adapter)
scripts/quant/        build-quant-data.mjs, verify-quant-data.mjs (Mock-Konsistenz),
                      sec/ (14 Python-Module, siehe §21), cli.py, run-sec-gates.mjs,
                      audit_primary_source.py, check_company_agnostic.py,
                      tests/ (249 Python-Tests, unittest)
scripts/market/       Marktdatenabruf, ingest-tiingo.mjs, verify-tiingo-runtime.mjs,
                      Provider-Bewertung, Secrets-Prüfung
docs/                 54 Fachdokumente: VU_*.md (V1–V3), SEC_*.md, TIINGO_*.md,
                      VU_TECHNICAL_*.md (Detailtiefe zu jedem Thema unten)
```

### 4.5 Zwei Datenpfade — dieselbe Quelle

| Pfad | Wofür | Woher |
|---|---|---|
| präkomputiert | Home, Ranking, Screener, Radar, Stock Detail, Watchlist | `quant/data/**`, erzeugt von `build-quant-data.mjs` |
| live gerechnet | Backtests, aktuelles Modellportfolio | Mock-Dataset im Web Worker (`backtest-worker.js`) |

Beide leiten aus demselben deterministischen Generator und denselben Engines ab.
`verify-quant-data.mjs` prüft in der CI, dass sie nicht auseinanderdriften — **eine
stille Abweichung zwischen Übersicht und Backtest wäre der gefährlichste Datenfehler des
Systems.** Ein 20-Jahres-Backtest mit monatlichem Rebalancing über 511 Titel dauert ca.
19 Sekunden — deshalb der Web Worker.

### 4.6 Lokale Entwicklung

```bash
node scripts/quant/build-quant-data.mjs      # Mock-Daten erzeugen (~6 s)
node scripts/quant/verify-quant-data.mjs     # gegen Engines prüfen
node --test "quant/tests/*.test.mjs"         # JS-Tests (~26 s, 444 grün)
python3 -m unittest discover -s scripts/quant/tests -p "test_*.py"   # SEC-Python (~9 s, 249 grün)
node --test "academy/**/*.test.mjs"          # Academy (8 grün)
python3 -m http.server 8765                  # Website lokal
```

Kein API-Key nötig, um die Website oder die Mock-Engines lokal zu betreiben. Die
Tiingo- und SEC-**Live**-Abrufe brauchen einen echten Zugang (`TIINGO_API_KEY` per
GitHub Secret bzw. gar keinen Key für SEC, siehe [§21](#21-sec-financial-data-core)/
[§22](#22-tiingo-market-data)) und laufen ausschließlich in GitHub Actions
(`workflow_dispatch`), nie lokal gegen die echte API in der Testsuite. Kein
`npm install` — kein `package.json` im Repository.

### 4.7 Bewusst nicht gebaut

Broker-Integration, Orderausführung, autonomes AI-Trading, native Apps, Realtime,
Optionen, Krypto, Intraday-Backtesting, Portfolio-Optimierer, historische
Analystenrevisionen ohne lizenzierte Daten.

---

## 5. Phase 1 — Foundation

Branch `claude/vision-universe-v1-build-uyp8qp`, gebaut 6.–7. September 2026, ~6.700
Zeilen in 23 Engine-Dateien.

**Financial Data Model** (`schema.js`): 26 kanonische Entitäten, Laufzeitvalidatoren,
bitemporaler Point-in-Time-Zugriff. **Field Catalog** (`catalog.js`): 52 Felder mit
Einheit, Richtung (`higherIsBetter`), Kategorie und VUQL-Token — ein Feld wird einmal
definiert und steht danach automatisch in Screener-UI, VUQL, Strategiefiltern und
AI-Tool-Beschreibung zur Verfügung.

**Mock Provider** (`mock-generator.js`, `mock-provider.js`): 511 synthetische
Securities (500 + 11 Edge-Case-Fixtures), deterministisch aus Seed
`vision-universe-quant-v1` über einen Mulberry32-PRNG — gleicher Seed erzeugt bitgleiche
Daten in Browser und Node. Zeitraum 2006-01-02 bis 2026-09-04, ~20.000 Corporate
Actions. Preismodell: `Kurs = Startkurs × Ertragsanker × exp(Rerating + OU-Abweichung +
Momentum-Rückkopplung)` — bewusst kein reiner Random Walk, weil Kurs sonst von der
Ertragslage entkoppelt und die Faktoren bedeutungslos würden (siehe §29 unten). Sieben
modellierte Krisenfenster; Benchmark ~12 % CAGR bei ~−54 % Max Drawdown.

**Quant Engine, VU Quant Score, Factor DNA, Quant Ranking, Quant Radar**: siehe
[§10–§12](#10-quant-engine--vu-quant-score).

**Screener + VUQL**: siehe [§18](#18-vuql).

**Strategy Engine + Strategy Lab**: siehe [§13](#13-strategy-engine).

**Backtest Engine + Trust Score + Current Strategy Holdings**: siehe
[§14](#14-backtest-engine) und [§16](#16-backtest-trust-score).

**AI Tool Layer + Mock AI**: siehe [§17](#17-ai-architecture).

**Watchlist Intelligence**: Deltas und Faktorbewegungen auf der Watchlist,
Intelligence Events (siehe [§12](#12-score-momentum--quant-radar)).

**11 Produktseiten nach Phase 1–3** (10 aus V1 + `/quant/markt/` aus Phase 2): Quant Home,
Ranking, Screener, Radar, Stock Detail, Strategien, Strategy Lab, Backtests, Watchlist,
Ask Vision Universe, Marktdaten. Eine zwölfte Seite (`/quant/technical/`) kam mit PR #49
dazu — siehe [§3](#3-das-gesamtprodukt-vision-universe) für den aktuellen Gesamtstand.

**Vier Entscheidungen, die das gesamte System tragen** (aus dem Implementation Report,
weiterhin gültig und Teil der [DO-NOT-BREAK-Regeln](#31-do-not-break-these-rules)):

1. **Ein kanonisches Datenmodell, kein Vendor-Modell.** Vendor-Felder existieren
   ausschließlich in Provider-Adaptern; ein Acceptance-Test scannt Product Layer und UI
   auf Vendor-Feldzugriffe.
2. **Point-in-Time ohne Ausweg.** `availableAt <= decisionTime` ist die einzige
   Zugriffsregel; kein Parameter schaltet sie ab.
3. **Eine Filterlogik, eine Strategy Engine.** Screener, VUQL-Editor, AI-Tool und
   Backtest erzeugen denselben typisierten AST und rufen dieselbe `Query.execute()` auf.
4. **Fehlende Daten sind fehlend.** Kein Ersatzperzentil, keine neutrale 50, keine 0 —
   stattdessen `INCOMPLETE` mit Begründung.

Am bestehenden Repository geändert: **zwei Zeilen** (Menüpunkt in
`assets/site-navigation.js`, Positionierungsregel in `assets/site-navigation.css`). Kein
bestehender Produktbereich wurde angefasst.

---

## 6. Phase 2 — Production Audit

Systematische Prüfung dessen, was unter echten Bedingungen bricht — nicht was fehlt,
sondern was falsch oder stillschweigend falsch ist. Grundlage: 134 Tests aus Phase 1,
danach 177 Tests.

**Ergebnis: 0 CRITICAL, 2 HIGH (beide behoben), 6 MEDIUM (5 behoben, 1 offen mit
Begründung), 4 LOW (1 behoben, 3 offen ohne Auswirkung auf Richtigkeit).**

### HIGH-1 — die wichtigste dauerhafte Qualitätsregel des Systems

**Ein Backtest ohne eine einzige gehaltene Position galt als gültiges Ergebnis.** Eine
Strategie mit nie erfüllbaren Filtern lief vollständig durch: null Titel je Rebalancing,
Kapital blieb in bar — Ergebnis CAGR 0,0 %, Trust Score **61** ("Eingeschränkt
belastbar"), plus die irreführende Aussage "Diese Unternehmen erfüllen aktuell die
Regeln der Strategie" über einer leeren Tabelle.

**Behoben** durch vier Maßnahmen, seither dauerhafte Regel (siehe auch [§16](#16-backtest-trust-score)):

1. `backtest.js` zählt `investedDays`, meldet `capabilities.everInvested`,
   `timeInvestedPct`, `emptyRebalances`, typisierte `warnings`.
2. Zwei harte Kappungen in `trust-score-v1.json`: `neverInvested`
   (`everInvested === false`) → **max. 5 Punkte**; `mostlyCash`
   (`timeInvestedPct < 50`) → **max. 40 Punkte**.
3. Der leere Fall wird explizit ausformuliert, keine leere Tabelle.
4. Warnungen erscheinen **vor** den Kennzahlen, kritische mit `role="alert"`.

Derselbe Backtest ergibt seitdem Trust Score **5** statt **61**.

> **Dauerhafte Qualitätsregel:** No-position / invalid result → drastisch reduzierter
> Trust Score → explizite Warnung → keine scheinpräzise Interpretation. Diese Regel darf
> in keinem künftigen Build aufgeweicht werden.

### HIGH-2 — Netzhänger-Resilienz

`shell.js` cachte auch abgelehnte Promises — ein einziger fehlgeschlagener Abruf machte
eine Seite dauerhaft unbrauchbar. Behoben: drei Versuche mit wachsendem Abstand,
Unterscheidung dauerhafter (4xx außer 408/429) von vorübergehenden Fehlern, kein
Konservieren von Fehlschlägen im Cache. Derselbe Fehler im Backtest-Worker (synchrones
XHR ohne Wiederholung) ebenfalls behoben.

### MEDIUM-Befunde (kurz)

| # | Fund | Status |
|---|---|---|
| 1 | Fehlgeschlagenes `localStorage.setItem` galt als Erfolg | behoben |
| 2 | Ungenutzte `innerHTML`-Hintertür in `el()` | entfernt |
| 3 | Adapter-Transport konnte echte Antworten nicht lesen (`res.body` statt geparstem JSON) | behoben |
| 4 | Veralteter Cache-Fallback löschte sich selbst beim Ablauf | behoben, `maxStaleMs` 4h |
| 5 | Capability-Matrix schrieb `null` (ungeprüft) fälschlich als `false` (nicht vorhanden) | behoben |
| 6 | Symbol-Mapping-Prüfung überging den häufigsten Fall (`"inferred"`) | behoben |
| **7** | **Alt-Pipeline (Dashboard) kennzeichnet ihre Bereinigungsstufe nicht** | **offen, siehe unten** |

**MEDIUM-7 — bis Phase 3 offen, dann behoben.** Das Dashboard rechnet auf splitbereinigten
(nicht dividendenbereinigten) Kursen und nannte das Ergebnis unspezifisch "Rendite". Kein
Rechenfehler — verifiziert an NVDA/AMZN-Splits, keine falschen Zahlen. Gelöst in Phase 3
(siehe [§7](#7-phase-3--data-qualification)).

### Sicherheitsbefunde: keine

Kein Schlüssel, Token oder Zugangsdatum im Repository gefunden. Acht dauerhafte Tests
(`quant/tests/secrets.test.mjs`) halten diesen Zustand:

| Test | Prüft |
|---|---|
| S1 | Kein schlüsselartiges Literal in ~400 committeten Dateien |
| S2 | Kein Browser-Code liest `process.env`/`import.meta.env` |
| S3 | Adapter ist Node-only, in keiner HTML-Seite eingebunden |
| S4 | Keine ausgelieferte JSON-Datei trägt URL oder Auth-Feld |
| S5 | Workflows reichen Credentials nur über `secrets.`/`github.token` |
| S6 | `.gitignore` deckt `.env`/`*.key`/`secrets.json`; `.env.example` leer |
| S7 | Keine echte Zugangsdatei im Arbeitsverzeichnis |
| S8 | Adapter reicht Schlüssel nicht durch, selbst wenn Anbieter ihn in Fehlermeldung spiegelt |

Zusätzlich: `scripts/market/assert-no-secrets.mjs` als letzte Prüfung vor jedem Commit.

**Neu in Phase 2 gebaut:** Fähigkeitsmatrix (`capabilities.js`), Symbolzuordnung
(`symbol-mapping.js`), Transportschicht mit Kontingentverwaltung (`market-client.js`),
Betriebsmodi mock/hybrid/live (`data-mode.js`), Twelve-Data-Adapter (serverseitig,
Node-only, `providers/twelve-data/adapter.js`), neue Seite `/quant/markt/`.

---

## 7. Phase 3 — Data Qualification

Branch `claude/vision-universe-v1-build-uyp8qp`, 7. September 2026, 22 Dateien, ~6.250
Zeilen, **232 Tests grün (177 aus Phase 2 + 55 neu)**.

### MEDIUM-7 endgültig behoben: eine gemeinsame Bereinigungssemantik

Beide Systemteile rechneten richtig und nannten zwei verschiedene Dinge gleich:

| | rechnet auf | nannte das Ergebnis |
|---|---|---|
| Quant-Bereich | total-return-bereinigt | „Rendite" |
| Dashboard | splitbereinigt | „Rendite" |

Gelöst über eine **gemeinsame Definition, nicht eine gemeinsame Bibliothek** (JS↔Python
wäre zu teuer gekoppelt):

```
quant/methodology/price-adjustment-v1.json    ← die Wahrheit
   ├── quant/engines/price-semantics.js        liest sie (JS)
   └── scripts/dashboard/price_semantics.py    liest dieselbe Datei (Python)
```

Vier Stufen, aufsteigend geordnet: **`UNKNOWN` (−1) < `RAW` (0) < `SPLIT_ADJUSTED` (1) <
`TOTAL_RETURN` (2)** — `UNKNOWN` liegt bewusst *unter* `RAW`: bei `RAW` weiß man
wenigstens, was fehlt. Je Kennzahl eine Mindeststufe: `RAW` genügt für Ordergröße/Volumen,
`SPLIT_ADJUSTED` für Momentum/Volatilität/Drawdown/Kursrendite, **`TOTAL_RETURN` ist
zwingend für `total_return`, `cagr` und jede Backtest-Evidenz.** Das Wort „Rendite" ohne
Zusatz ist ausschließlich für `TOTAL_RETURN` zulässig.

Die Migration änderte **keine einzige Zahl** — geprüft an NVDA (2021 4:1, 2024 10:1) und
AMZN (2022 20:1). Nachgelagerte Skripte verweigern seither die Berechnung, wenn die
Stufe fehlt.

### Die drei Gates als ausführbarer Code (`gate-tests.js`)

| Gate | Prüft | Bestehensbedingung |
|---|---|---|
| **A — Restatement** | Werden Original- und korrigierte Werte unterscheidbar geführt? | Wert zu zwei `asOf`-Zeitpunkten unterschiedlich UND der frühere trägt `restatementStatus: "original"` |
| **B — Delisting** | Bleiben delistete Titel mit Fundamentaldaten im historischen Universum? | Titel im historischen, nicht im aktuellen Universum, UND besitzt Fundamentaldatensätze (fängt "Kurse ja, Fundamentaldaten nein" ab) |
| **C — Future Data Leak / Verfügbarkeitszeitpunkt** | Trägt jede Tatsache `availableAt`/`filedAt`/`publishedAt`, und ist sie nie `> asOf`? | Kein fehlender Zeitstempel, kein Zeitstempel in der Zukunft des Abfragezeitpunkts, UND mindestens ein Zeitstempel liegt nach `periodEnd` (fängt "periodEnd als availableAt ausgegeben" ab) |

Der MockProvider besteht alle drei Gates. Sechs absichtlich fehlerhafte Adapter fallen
mit benanntem Grund durch (Gegenprobe).

### Der Qualifikationsprüfstand (`provider-qualification.js`)

Trennt **Befund** (`value`) von **Belegstufe** (`level`): `RUNTIME_VERIFIED` >
`DOCUMENTATION_VERIFIED` > `THIRD_PARTY_REPORTED` > `UNKNOWN`. Ein Gate gilt nur als
`PASSED`, wenn alle Anforderungen `true` sind **und** die Belegstufe mindestens
`DOCUMENTATION_VERIFIED` erreicht — sonst `UNKNOWN`, nie stillschweigend `false`.
Widerlegte Befunde werden `FAILED`, nicht `UNKNOWN`. Diese Schwelle war die wichtigste
Einzelentscheidung: ohne sie wären EODHD, FMP und Polygon auf Basis je eines
Blogartikels als qualifiziert durchgegangen.

### Ergebnis der Qualifikation (Stand 7. September 2026)

| Anbieter | Beste Rolle | Gate C (PIT) | Gate B (Delisted) | Gate A (Restatements) | Lizenz | Qualifikation | Laufzeit |
|---|---|---|---|---|---|---|---|
| Sharadar | Research | + | ? | ? | offen | `PARTIALLY_QUALIFIED` | 0/15 |
| Intrinio | Research | ? | ? | ? | offen | `PARTIALLY_QUALIFIED` | 0/15 |
| Twelve Data | Marktdaten | **−** | **−** | **−** | offen | `PARTIALLY_QUALIFIED` | 0/15 |
| EODHD | — | ? | +* | ? | offen | `UNKNOWN` | 0/15 |
| FMP | — | ? | ? | ? | offen | `UNKNOWN` | 0/15 |
| Polygon | — | ? | ? | ? | offen | `UNKNOWN` | 0/15 |

`*` EODHD führt delistete Fundamentaldaten nur ab 2018 — ein dokumentierter,
wahrscheinlicher Gate-B-Fehlerfall.

**Kein Anbieter besteht alle drei Gates. Kein einziger Befund ist `RUNTIME_VERIFIED`** —
gegen keinen der fünf externen Anbieter wurde in dieser Phase auch nur eine Anfrage
gestellt (Egress-Proxy blockierte `sharadar.com`, `data.nasdaq.com`,
`docs.intrinio.com`). Twelve Data ist der einzige mit **widerlegten** statt unbekannten
Befunden für die Evidenz-Rolle — ein Fortschritt gegenüber Unwissen, kein Mangel; die
Rolle, die er im System hat (Marktdaten für ein kleines Referenzuniversum), erfüllt er
weiterhin (`MARKET_DATA_PROVIDER: QUALIFIED`).

**Alle Lizenzfragen sind bei allen sechs Anbietern offen** (`LEGAL_REVIEW_REQUIRED`).

### Mehrere Anbieter nebeneinander (`data-precedence.js`)

Vorrangregeln, deren erstes Kriterium **nicht** die Anbietergüte ist, sondern die
Eignung für den Zweck — für eine historische Abfrage schlägt eine zeitpunktgenaue Quelle
jede aktuellere. Ein einzelner Kandidat wird nicht automatisch durchgewinkt. Dazu
`DataQualityScore` (ausdrücklich `internalOnly` — eine Zahl wie „Datenqualität 72" wirkt
präziser, als sie ist) und `dataSnapshotId` mit kalendarischer Prüfung.

### Empfohlener nächster Schritt (kostet nichts)

**Intrinio Developer Sandbox** (Dow 30) anfragen und Gate A + C gegen echte Daten laufen
lassen — schließt zwei von drei Gates kostenlos. **Gate B nicht**: die Dow 30 sind per
Definition Überlebende. Details und Kostenmodell: [§21](#21-sec-financial-data-core),
[§28](#28-cost-philosophy).

**Tatsächlich gewählter Weg (Phase 4, siehe [§21](#21-sec-financial-data-core)):** nicht
Intrinio, sondern eine direkte, generische SEC/EDGAR-Anbindung — kostenlos, weil SEC
keinen API-Key verlangt. Ergebnis deckt sich mit der hier getroffenen Vorhersage: Gate A
und C bestehen (jetzt sogar `RUNTIME_VERIFIED` gegen echte Daten), Gate B fällt weiterhin
durch, aus demselben Grund — fehlende Survivorship-Historie.

---

## 8. Release-Status

Fünf Pull Requests, alle gemerged, alle innerhalb von 24 Stunden (7.–8. September 2026):

| PR | Titel | Merge (UTC) | Umfang | Tests bei Merge |
|---|---|---|---|---|
| **#43** | Vision Universe® Quant & AI — V1 Preview | 07.09. 10:59 | 152 Dateien, +29.873/−99, 17 Commits | 232/232 |
| **#45** | Project Master Documentation (diese Datei, Erstfassung) | 07.09. ~18:00 | 1 Datei | 232/232 |
| **#46** | Phase 4A Tiingo Market Data PoC | 08.09. 04:03 | 37 Dateien, +7.928/−271, 23 Commits | 332/332 |
| **#47** | SEC-Fundamentals-Workflow auf `main` registrieren (nur Workflow-Datei) | 07.09. 18:37 | 1 Datei, rein additiv | — (keine Codeänderung) |
| **#48** | SEC Financial Data Core | 08.09. 05:02 | 73 Dateien, +242.000/−44, 36 Commits | 612 grün (237 Py, 367 JS, 8 Academy — Zwischenstand vor #49) |
| **#49** | Technical Intelligence V1 — Elliott Wave Beta | 08.09. 05:32 | 127 Dateien, +7.807/−2, 12 Commits | 444 JS + 249 Py + 8 Academy = 701 |

**Aktueller `main`-Stand: `252dec5`.** Dieses Dokument wurde gegen genau diesen Commit
verifiziert (`git fetch origin`, `git status` sauber, `origin/main` == geprüfter
Branch-Stand, 0 Commits Differenz zum Zeitpunkt des Audits).

**Reihenfolge-Besonderheit:** PR #48 (SEC) hat #46 (Tiingo) in seinen eigenen Branch
gemerged, bevor er selbst nach `main` gemerged wurde — beide Arbeitsstränge sind daher
vollständig in `main` enthalten, ohne dass einer den anderen überschrieben hat (drei
additive Konflikte in `.gitignore`, `provider-profiles.json`,
`provider-qualification.test.mjs`, laut PR #48 sauber aufgelöst). PR #47 war eine reine
Freischaltung der Workflow-Datei auf `main`, damit `workflow_dispatch` für den
SEC-Live-Lauf überhaupt startbar wurde (GitHub erlaubt das nur für Workflows, die auf
dem Default-Branch liegen) — sie enthielt noch keine Pipeline.

**Änderungen an bestehenden Bereichen laut PR #43**, bewusst minimal:

| Datei | Änderung |
|---|---|
| `assets/site-navigation.js`/`.css` | je eine Zeile (Menüpunkt „Quant", Positionierung) |
| `dashboard/data/market_data.json` | Bereinigungsstufe ergänzt, keine Kurszahl geändert |
| `dashboard/data/backtest_results.json` | `return_semantics` ergänzt |
| `dashboard/data/technical_scores.json` | `return_semantics` ergänzt; 36 Werte um 6,5e-16 abweichend (Neuberechnung auf anderer Plattform, kein Logikunterschied) |
| `scripts/dashboard/*.py` | Bereinigungsstufe wird deklariert und geprüft; Berechnung verweigert, wenn sie fehlt |

Unverändert: ETF, Macro, Academy, Magazin, Reports, News, Morning, Hedgefonds,
Analysten, Budget, Guide, Content.

**PR #46/#48/#49 blieben bei diesem Grundsatz.** Einzige bestehende Dateien, die PR #49
(Technical Intelligence) anfasste: `quant/ui/shell.js` (ein Tab-Eintrag),
`quant/ui/quant.css` (angehängte Styles), `quant/ARCHITECTURE.md` (ein Abschnitt),
`.github/workflows/quant-ci.yml` (ein Verify-Schritt) — keine Änderung an Quant-,
Tiingo- oder SEC-Engines. PR #46 änderte 32 Zeilen in `backtest.js`
(`capabilities.isMock` wird seither aus der tatsächlichen Titelherkunft abgeleitet statt
fest auf `true` zu stehen); `factors.js`, `quant-score.js`, `strategy.js` blieben
unverändert. PR #48 führte keine Änderung an bestehenden Kern-Engines durch, sondern
ausschließlich Ergänzung (achtes Provider-Profil neben den bestehenden sieben).

---

## 9. Release-Audit-Funde und Guardrails

Zwei Funde aus dem Freigabe-Audit vor dem Merge sind als **dauerhafte Engineering
Guardrails** zu behandeln, nicht als erledigte Einzelfälle:

### 1. `technical_scenarios.json` — beinahe unbeabsichtigt veröffentlichte Kursziele

Ein Verifikationslauf hätte **13 Szenarien mit Einstiegszonen, Invalidierungsmarken und
Kurszielen** in Produktion veröffentlicht — ein Nebenprodukt der eigenen
Verifikationsläufe, nicht Teil des beabsichtigten Release. `main` zeigt diese Datei
bewusst noch nicht. Dies wurde vor dem Merge erkannt und **zurückgenommen** (Commit
`410df85`).

> **Guardrail:** Ein Verifikations- oder Testlauf darf niemals Artefakte erzeugen, die
> versehentlich mitcommittet werden und in Produktion landen. Vor jedem Merge: `git
> diff` gegen den Zielbranch genau prüfen, nicht nur die eigenen beabsichtigten Dateien.

### 2. Tests dürfen Produktionsdatendateien nicht verändern

Verification-Läufe müssen auf temporären Kopien laufen, niemals auf den committeten
Produktionsdaten selbst.

> **Guardrail:** CI und lokale Verifikation laufen gegen Kopien oder generieren in ein
> Verzeichnis, das nicht committet wird, außer es ist der ausdrückliche Zweck des Laufs
> (z. B. `build-quant-data.mjs`, dessen Output bewusst committet wird). Ein Prüflauf, der
> „nur prüfen" soll, darf keine Datei verändern.

Diese beiden Regeln sind Teil von [§31 DO NOT BREAK](#31-do-not-break-these-rules).

---

## 10. Quant Engine — VU Quant Score

Konfiguration: `quant/methodology/quant-v1.json` (Version `quant-v1.0.0`, `effectiveFrom:
2026-09-06`). Implementierung: `factors.js`, `normalization.js`, `quant-score.js`.
**Diese Gewichte stammen direkt aus der Methodikdatei — Code ist Wahrheit, nicht
Erinnerung.**

### Was der Score ist — und was nicht

„Quality 94" heißt: besser als 94 % der Vergleichsgruppe. Es heißt **nicht**: 94 %
Wahrscheinlichkeit auf steigende Kurse.

### Pipeline

```
Rohkennzahl → Validierung (nicht endliche Werte → null, nicht 0)
   → Winsorization (2./98. Perzentil)
   → Peer-Normalisierung (Industry → Sector → Universe, min. Peer-Gruppe 12)
   → Perzentil je Komponente
   → Faktorscore (gewichteter Mittelwert der Komponenten)
   → Composite (gewichteter Mittelwert der Faktoren)
   → Universums-Perzentil
   → VU Quant Score 0–100
```

Der letzte Perzentilschritt ist notwendig: ein reiner gewichteter Mittelwert aus fünf
Perzentilen zieht sich durch den zentralen Grenzwertsatz zur Mitte zusammen — der beste
Titel läge bei ~78 statt 99. **Beide Werte werden ausgewiesen**: `compositeScore`
(Summe der Faktorbeiträge) und `score` (Perzentilrang).

### Faktorgewichte V1 (aus `quant-v1.json`)

| Faktor | Gewicht | Forschungsbasis |
|---|---:|---|
| Quality | 30 % | Novy-Marx (Gross Profitability), Asness/Frazzini/Pedersen (QMJ) |
| Momentum | 30 % | Jegadeesh/Titman, George/Hwang (52W-Hoch) |
| Growth | 20 % | Stock-Selection-Komponente, keine eigenständige akademische Faktorprämie |
| Value | 15 % | Fama/French |
| Risk | 5 % | Frazzini/Pedersen (Betting Against Beta) |
| *Revisions* | *0 % (vorgesehen: 15 %)* | *`available: false`, siehe unten* |

**Wichtige Entscheidung — Revisions-Gewicht:** Das Research sieht zusätzlich 15 %
Analyst Revisions vor. Ohne lizenzierte historische PIT-Konsensdaten wird dieses Gewicht
**nicht mit erfundenen Daten gefüllt**, sondern auf Quality, Momentum und Growth
verteilt. Sobald belastbare PIT-Estimates vorliegen, entsteht `quant-v2` mit eigener
Methodikversion — **keine stille Änderung**.

### Komponenten je Faktor

| Faktor | Komponenten (Gewicht) |
|---|---|
| Quality | ROIC 25 · Gross Profitability 20 · FCF-Marge 20 · Operative Marge 15 · Bilanzqualität 10 · Verschuldung 10 |
| Momentum | 12-1-Monats-Momentum 25 · 6M 20 · Relative Stärke 15 · Abstand 52W-Hoch 12 · 3M 10 · Kurs/200DMA 10 · Kurs/50DMA 8 |
| Value | FCF-Rendite 30 · Earnings Yield 25 · EV/EBITDA 20 · Kurs/FCF 15 · EV/Sales 10 |
| Growth | Umsatzwachstum 35 · EPS-Wachstum 25 · FCF-Wachstum 25 · Margenausweitung 15 |
| Risk | Volatilität 35 · Downside-Volatilität 25 · Max. Drawdown 25 · Beta 15 (höherer Score = geringeres Risiko) |
| Revisions | — (Schema vorhanden, `available: false`, keine Komponenten befüllt) |

### Normalisierung, Coverage, Bänder

- **Winsorization:** 2./98. Perzentil.
- **Peer-Gewichte:** 70 % Peer, 30 % Universum; Fallback-Kette Industry → Sector →
  Universe; Mindest-Peer-Gruppengröße 12.
- **Coverage:** mind. 50 % der Komponenten je Faktor, mind. 60 % Gesamtabdeckung, max.
  20 % Renormalisierung des Faktorgewichts. Konfidenzbänder: ≥90 % `high`, ≥75 %
  `medium`, ≥60 % `low`, darunter `insufficient`.
- **Rating-Bänder:** ≥90 „Top 10 %" · ≥75 „Überdurchschnittlich" · ≥45 „Durchschnittlich"
  · ≥25 „Unterdurchschnittlich" · sonst „Unteres Quartil". Hysterese: mind. 1,5 Punkte
  Bewegung für einen Bandwechsel (verhindert 89,9→90,1 als falsches Signal).

Ein Titel ohne ausreichende Faktorabdeckung bekommt `INCOMPLETE` statt einer Zahl — auch
im Hybridmodus, ohne Sonderregel.

---

## 11. Factor DNA

UI-Konzept auf der Stock-Detail-Seite: Zerlegung des Composite Score in die fünf
Faktoren (Quality, Momentum, Value, Growth, Risk), je mit:

- **Percentile** (Universums- und Peer-Rang)
- **Contributions** (gewichteter Beitrag zum Composite, aufsummierbar)
- **Raw Metrics** (die zugrundeliegenden Rohkennzahlen vor Normalisierung)
- **Methodology** (Version, Gewichte, Stand)
- **Data Coverage** (Anteil verfügbarer Komponenten, Konfidenzband)

AI-Tool `explainQuantScore()` liefert dieselbe Zerlegung als strukturierte Daten für die
KI-Erklärung (siehe [§17](#17-ai-architecture)) — **dieselbe Quelle**, nicht eine
zweite Berechnung.

---

## 12. Score Momentum / Quant Radar

Implementiert in `radar.js`, Parameter in `quant-v1.json` unter `scoreMomentum` und
`radar`:

- **Velocity:** `scoreVelocity30d`, `scoreVelocity60d` (Veränderung über 30/60 Tage)
- **Acceleration:** `scoreAcceleration` über ein 30-Tage-Fenster
- **factorVelocity:** dieselbe Bewegung je Einzelfaktor
- Snapshot alle 7 Tage, Historienfenster 365 Tage

**Radar-Schwellen** (aus `quant-v1.json`): Quant Upgrade ab Δ≥6, Downgrade ab Δ≤−6,
Momentum-/Quality-Leader ab Score ≥90, Nähe zum 52W-Hoch bei ≤3 % Abstand und
Quant-Score ≥70, Emerging Compounder ab Faktor-Δ≥4, Factor Breakout ab 2 Faktoren mit
Δ≥8.

**Event-Typen:** Quant Upgrade, Quant Downgrade, Momentum Acceleration, Quality
Deterioration, Factor Breakout, Near-52W-High, Emerging Compounder (sieben
Radar-Module laut Implementation Report). Watchlist Intelligence nutzt dieselbe Engine
für Deltas auf den beobachteten Titeln.

---

## 13. Strategy Engine

Implementiert in `strategy.js`, Constraints/Defaults in `methodology/backtest-v1.json`,
vordefinierte Strategien in `methodology/strategies-v1.json`.

### Schema

`StrategyDefinition = { schemaVersion, universe, filters[], ranking: { factors: [{factor,
weight}] }, portfolio, rebalance, execution }`.

- Rankbare Faktoren: Quality, Momentum, Value, Growth, Risk — Gewichte müssen auf 1,0
  (±0,005) summieren, keine Duplikate; **`revisions` wird explizit abgelehnt**, solange
  PIT-Estimates nicht lizenziert sind.
- Portfolio-Constraints: 5–200 Positionen; `positions × maxPositionWeight ≥ 1` (muss
  vollständig investierbar sein); `maxSectorWeight ≥ maxPositionWeight`; Gewichtung
  `equal` / `score` / `volatility`.
- Rebalancing: nur `monthly` oder `quarterly` (Default `quarterly`).
- Execution: Timing `next_open`/`next_close`; Transaktionskosten/Slippage je max. 200
  bps; eine Warnung (kein Fehler), wenn beide 0 sind.
- Unbekannte Top-Level-Felder werden abgelehnt.

### StrategyVersion, Lineage, Hash

- `createStrategy()` erzeugt V1 mit `parentVersion: null`.
- `addVersion()` **mutiert nie** eine vorherige Version, verlangt eine nicht-leere
  `changeReason`, lehnt eine zu ihrem Elternteil identische Version ab (Vergleich über
  `definitionHash`, stabil gegenüber Feldreihenfolge).
- `lineage()` baut einen Baum (nicht nur eine Kette) über `parentVersion`.
- `diff()` liefert exakte feldweise Unterschiede zwischen zwei Definitionen.

### Vordefinierte Strategien (aus `strategies-v1.json`)

| Strategie | Universe | Kernfilter | Ranking-Gewichte | Gewichtung | Positionen | Max. Pos./Sektor | Rebalancing |
|---|---|---|---|---|---|---|---|
| VU Quality Compounders | US_EQUITIES | MktCap≥1.000, AvgDollarVol≥5, FCF>0, ROIC≥10 | Quality 70 · Growth 30 | equal | 30 | 6 % / 30 % | quarterly |
| VU Momentum Leaders | US_EQUITIES | MktCap≥2.000, AvgDollarVol≥10, Kurs>200DMA | Momentum 100 | equal | 25 | 6 % / 35 % | monthly |
| VU Quality Momentum | US_EQUITIES | MktCap≥1.000, AvgDollarVol≥5, FCF>0 | Quality 50 · Momentum 50 | equal | 25 | 6 % / 30 % | monthly |
| VU GARP | US_EQUITIES | MktCap≥1.000, AvgDollarVol≥5, RevGrowth≥8 %, FCF>0, EV/EBITDA≤25 | Growth 40 · Quality 35 · Value 25 | equal | 30 | 6 % / 30 % | quarterly |
| VU Future Leaders | US_EQUITIES | MktCap≥500, AvgDollarVol≥5, RevGrowth≥15 %, FCF>0 | Growth 45 · Momentum 35 · Quality 20 | equal | 20 | 8 % / 40 % | monthly |

Alle fünf: `execution.timing: next_open`, Transaktionskosten 5 bps; Slippage 5 bps
(Momentum Leaders und Future Leaders: 8 bps).

### Warum eine gemeinsame Filterlogik

Der manuelle Strategy Builder, die AI und der Screener erzeugen **dasselbe**
`StrategyDefinition`- bzw. Query-AST-Objekt und benutzen denselben Validator
(`strategy.js` baut zur Validierung eine Probe-Query und ruft `Query.validate()` auf —
denselben Pfad wie Screener-UI, VUQL und AI-Tool). Zwei Implementierungen wären der
sicherste Weg, Screener-Ergebnis und Backtest-Universum auseinanderlaufen zu lassen.

---

## 14. Backtest Engine

Implementiert in `backtest.js`. **Nur tatsächlich vorhandene Merkmale sind hier als
implementiert gekennzeichnet.**

- **Long-only, Tagesdaten.** Gewichte sind stets nicht-negativ; kein Short-, Leverage-
  oder Derivate-Pfad.
- **Rebalancing:** monatlich oder quartalsweise, am letzten Handelstag der Periode; ein
  Termin außerhalb des Testfensters wird ausgelassen, nicht verschoben.
- **Ausführungszeitpunkt:** Signal am Schluss von T, Ausführung frühestens T+1. Zwei
  Preismodi: `next_close` (Schlusskurs T+1) oder `next_open` (Default) — Letzterer ist
  eine **deterministische Interpolation** (`prev + (close_T+1 − prev) × 0,35`), **kein
  echter Eröffnungskurs**, ausdrücklich als Mock-Daten-Vereinfachung dokumentiert.
- **Transaktionskosten + Slippage:** eine gemeinsame Rate (`(transactionCostsBps +
  slippageBps) / 10000`) auf den Bruttowert jeder Order sowie auf Delisting-Glattstellung.
  Kein separates Market-Impact-Modell.
- **Corporate Actions:** implizit über eine bereits total-return-adjustierte Kursreihe
  (`adjustedClose`), nicht über explizite Split-/Dividenden-Einzelbuchungen in dieser
  Datei.
- **Delisting:** eine Position, deren Kursreihe endet, wird zum letzten verfügbaren Kurs
  zwangsglattgestellt; Erlös bleibt in bar — kein Survivorship-Verlust im historischen
  Universum.
- **Current Strategy Holdings:** `currentHoldings()` wendet die Strategie auf den
  aktuellen Datenstand an — ausdrücklich als „erfüllt heute die Regeln", nicht als
  Anlageempfehlung; expliziter Leerzustand, wenn kein Titel qualifiziert.
- **Reproduzierbarkeit:** `reproductionHash` hasht ausschließlich die Eingaben
  (Strategie-Hash, `dataSnapshotId`, Engine-/Methodikversionen, Execution-Annahmen,
  Zeitraum, Rebalancing) — bewusst **nicht** aus dem Ergebnis abgeleitet, also ein
  Reproduktionsschlüssel, kein Ergebnis-Checksum.

### Implementierte Metriken

CAGR, Total Return, Volatilität (annualisiert), Max Drawdown, Sharpe, Sortino, Calmar,
bestes/schlechtestes Jahr, Recovery-Tage, jährliche Renditen, Drawdown-Serie,
Benchmark-Vergleich (Total Return/CAGR/Max Drawdown/Jahresrenditen), Excess Return
(CAGR ggü. Benchmark), Turnover (einseitig, annualisiert), durchschnittliche
Positionszahl, Rebalance-/Trade-Anzahl, Gesamtkosten, Hit Rate, `investedDays`,
`timeInvestedPct`.

**Nicht implementiert:** Deflated Sharpe Ratio, Probability of Backtest Overfitting
(PBO) — siehe [§16](#16-backtest-trust-score).

Typisierte Warnungen im Ergebnisobjekt: `never_invested`, `mostly_cash`,
`empty_rebalances`, `few_rebalances` — sie speisen direkt den Trust Score.

---

## 15. Point-in-Time (PIT)

**Dies ist der kritischste Abschnitt des gesamten Systems.**

Point-in-Time bedeutet: Ein Backtest darf ausschließlich Informationen verwenden, die am
damaligen Entscheidungszeitpunkt tatsächlich bekannt waren.

**Grundregel: `availableAt <= decisionTime`.**

Dies ist die **einzige** Zugriffsregel auf Fundamentaldaten im gesamten System. Es gibt
**keinen Parameter, der sie abschaltet** — der einzige Effekt wäre Look-Ahead Bias.
Faktoren, Scores und Filter laufen im Backtest über **dieselben Funktionen** wie die
heutige Anzeige; ein zweiter Pfad könnte versehentlich mehr sehen.

### Was konkret geprüft wird

- **Filing Dates:** Jede Fundamentaltatsache trägt `availableAt`/`filedAt`/`publishedAt`
  — fehlt das, ist die Tatsache für einen Backtest nicht nutzbar (Gate C).
- **Fundamental Publication Lag:** `periodEnd` (Ende der Berichtsperiode) und
  `availableAt` (tatsächliche Veröffentlichung) sind getrennte Felder — ein Anbieter, der
  `periodEnd` als `availableAt` ausgibt, fällt durch Gate C.
- **Restatements:** Originale und rückwirkend korrigierte Werte müssen unterscheidbar
  geführt werden (`restatementStatus: "original"` vs. korrigiert) — ein Backtest vor der
  Korrektur darf ausschließlich die Originalzahlen sehen (Gate A).
- **Amendments:** dieselbe bitemporale Behandlung wie Restatements.
- **Future Data Leakage:** kein Zeitstempel darf in der Zukunft des Abfragezeitpunkts
  liegen (Gate C, siehe [§7](#7-phase-3--data-qualification)).

### Mock-Fixtures, die genau das prüfen

`MOCK_RESTATEMENT` (VUF009, meldet 2017 zu hohe Zahlen, korrigiert 2018),
`MOCK_FUTURE_DATA_LEAK` (VUF010, trägt einen Datensatz mit `availableAt` in der Zukunft
— darf heute nirgendwo auftauchen), `MOCK_DELISTED` (VUF008, delistet 2019, bleibt im
historischen Universum).

**Diese Methodik darf in zukünftigen Builds nicht aufgeweicht werden** — sie ist Teil
der [DO-NOT-BREAK-Regeln](#31-do-not-break-these-rules) (Regel 3).

---

## 16. Backtest Trust Score

Konfiguration: `methodology/trust-score-v1.json` (Version `trust-score-v1.0.0`),
Implementierung `trust-score.js`.

> **Zweck:** Der Trust Score bewertet die **methodische Qualität** eines Backtests,
> nicht seine Rendite. Ein optisch starkes Ergebnis mit methodischen Mängeln darf keinen
> hohen Trust Score erhalten.

### Blöcke (0–100)

| Block | Punkte | Prüfungen |
|---|---:|---|
| Data Integrity | 35 | PIT-Fundamentaldaten (12) · Delistete Titel (7) · Original vs. korrigiert (6) · Corporate Actions (5) · Historische Universumszugehörigkeit (5) |
| Execution Realism | 20 | Transaktionskosten (7) · Slippage (5) · Liquiditätsgrenzen (5) · Ausführung nach Signalzeitpunkt (3) |
| Statistical Validation | 30 | Out-of-Sample/Walk-Forward (10) · Parameter-Sensitivität (7) · Multiple Testing/Deflated Sharpe/PBO (7) · Teilperioden-/Cross-Market-Validierung (6) |
| Sample Quality | 15 | Historie über mehrere Zyklen (6) · Ausreichende Beobachtungen (4) · Breite/Turnover-Qualität (5) |

### Harte Obergrenzen (Hard Caps)

| ID | Bedingung | Max. Score |
|---|---|---:|
| `noPointInTime` | keine PIT-Fundamentaldaten | 60 |
| `noDelisted` | keine delisteten Titel im Universum | 70 |
| `optimizedNoOos` | optimierte Strategie ohne Out-of-Sample | 75 |
| `neverInvested` | nie eine Position gehalten | **5** |
| `mostlyCash` | `timeInvestedPct < 50` | **40** |

**Wichtig:** Die letzten beiden Caps (`neverInvested`, `mostlyCash`) stammen aus dem
HIGH-1-Befund in Phase 2 ([§6](#6-phase-2--production-audit)) und sind im Code
first-class Hard Caps mit eigener `buildLimitations()`-Meldung — **das Prosadokument
`docs/VU_BACKTEST_TRUST_SCORE.md` listet in seiner Tabelle nur die ersten drei; dies ist
eine bekannte Doku-Lücke, kein Code-Fehler.** Wer diese Datei weiterpflegt, sollte die
Tabelle ergänzen.

### Bekannte Einschränkungen, weiterhin aktuell

- **Deflated Sharpe Ratio und PBO sind nicht implementiert** — der Block „Statistical
  Validation" vergibt für diese Prüfung **null Punkte statt sie zu überspringen**. Der
  Trust Score verschleiert damit keine Lücke, sondern bestraft sie sichtbar.
- Rating-Bänder: ≥85 „Hohe methodische Güte" · ≥70 „Solide, mit benannten
  Einschränkungen" · ≥50 „Eingeschränkt belastbar" · sonst „Nicht als Evidenz geeignet".

**Der Trust Score darf Datenlücken niemals verschleiern** — das ist der Leitsatz, der
die gesamte Konstruktion (Hard Caps statt Punktabzug allein, explizite Null-Punkte statt
Auslassung) begründet.

---

## 17. AI Architecture

> **AI ist nicht die Wahrheitsschicht.**
> Wahrheitsschicht: Financial Data Core + Quant Engine + Strategy Engine + Backtest
> Engine. AI ist Interpretation, Orchestrierung und Erklärung — sie berechnet keine
> einzige Kennzahl selbst.

### MockAIProvider (`ai-provider.js`)

Ist **explizit kein LLM** und behauptet das nicht zu sein (`healthCheck()` sagt es
wörtlich) — ein deterministischer, regelbasierter Parser ohne Netzwerkzugriff, ohne
API-Key:

```
Natürliche Sprache → detectIntent() (Regex/Keywords, DE+EN)
   → extractEntities() (Sektoren, Faktoren, Ticker, Zahlen inkl. ausgeschriebener
     deutscher Zahlwörter, Booleans)
   → buildQuery()/buildStrategy()
   → Schema-Validierung (Query bzw. Strategy)
   → planTools()
```

**10 Intents** (`INTENTS`): screen, strategy, backtest, explain, compare, rank,
watchlist, methodology, **forecast**, unknown. Ein zukünftiges reales LLM (Interface
`AI_PROVIDER_METHODS` bereits vorbereitet für `OpenAIProvider`/`ClaudeProvider`) würde
denselben Vertrag erfüllen müssen.

**Die "AI ist nicht die Wahrheitsschicht"-Regel ist im Code erzwungen, nicht nur
dokumentiert:**

- `explain()` komponiert Text **ausschließlich** aus `toolResults`, die `ok && data`
  sind; ohne Daten: `dataUnavailable: true` und eine feste Meldung, dass keine berechnete
  Quelle vorliegt — **nie eine Schätzung**.
- Fragen nach Kurszielen/Prognosen werden über `FORECAST_PATTERNS` erkannt und mit einer
  festen Ablehnung beantwortet, statt stillschweigend in den Screener-Fallback zu
  rutschen.
- `reviseStrategy()` kann nicht rückwärts nach besser aussehenden Parametern suchen —
  nur benannte, begründete Regeländerungen.

### Tool Registry (`ai-tools.js`) — 15 Werkzeuge

| Werkzeug | Kategorie | Zweck |
|---|---|---|
| `screenStocks` | discovery | strukturierte Abfrage ausführen (validierter Query-AST) |
| `getStockSnapshot` | discovery | Kennzahlen/Scores für einen Ticker |
| `compareStocks` | discovery | bis zu 8 Ticker vergleichen |
| `getQuantScore` | quant | Score/Faktoren/Coverage/Konfidenz |
| `explainQuantScore` | quant | Faktorbeiträge, die zum Composite aufsummieren |
| `getFactorHistory` | quant | Score-/Faktor-Zeitreihe |
| `rankStocks` | quant | Ranking nach Score oder Score-Velocity |
| `createStrategy` | strategy | Strategie aus validierter Definition |
| `validateStrategy` | strategy | validieren ohne auszuführen |
| `runBacktest` | strategy | Backtest ausführen (nur validierte Definition, nie ein String) |
| `compareBacktests` | strategy | zwei gespeicherte Backtests vergleichen |
| `getCurrentStrategyHoldings` | strategy | Strategie auf aktuelle Daten anwenden |
| `getWatchlistChanges` | monitoring | Score-/Faktor-Deltas und Events |
| `getMethodology` | meta | versionierte Methodikbeschreibung |
| `listFields` | meta | alle abfragbaren Felder |

**Guardrails, im Code erzwungen (nicht nur Konvention):**

- `FORBIDDEN_TOOL_NAMES` (`sql`, `exec`, `eval`, `shell`, `fetch`, `readFile`, `db`, …) —
  Registrierung wirft, wenn versucht.
- `validateArgs()` lehnt fehlende **und** unbekannte Argumente ab.
- Nicht registrierte Tool-Aufrufe werden abgelehnt, kein dynamischer Fallback.
- `runBacktest` wirft ausdrücklich, wenn `definition` ein String ist — natürliche
  Sprache erreicht nie die Backtest-Engine direkt.
- Der Datei-Header verbietet ausdrücklich, jemals SQL-, JS-Eval-, beliebige-URL- oder
  Datei-Zugriffs-Werkzeuge zu ergänzen — als Sicherheitsgrenze, nicht als Konfiguration.

**Keine willkürlichen SQL-Abfragen durch AI. Keine vom LLM erfundenen Finanzdaten.**

---

## 18. VUQL

**Vision Universe Query Language.** Grundsatz: **VUQL ist die menschenlesbare
Repräsentation, der typisierte JSON-AST (`query.js`) ist die kanonische interne
Repräsentation.**

```
Natural Language
   ↓ (AI, ai-provider.js)
Validated AST (query.js)
   ↔ VUQL (vuql.js, Parser + Serializer, nur Darstellung)
   ↓
Screener / Strategy Engine (Query.execute())
```

VUQL ist niemals das, was ausgeführt wird — nur eine austauschbare Textform des AST.

### Grammatik (zeilenbasiert, `#`/`--` Kommentare)

```
UNIVERSE <id>
<FIELD> [PCTL] <op> <value>
<FIELD> IN (...)
<FIELD> NOT IN (...)
<FIELD> BETWEEN x AND y
<FIELD> <value>              # Kurzform für "eq"
SORT <field> [ASC|DESC]
LIMIT <n>
```

Operatoren: `>= <= > < = != <>`. Zahlensuffixe: `%` (unverändert), `B` (×1000), `M`
(×1), `K` (×0,001) — gemappt auf die Katalog-Einheit `usd_m`. Felder werden über
`Catalog.fieldByToken` aufgelöst (derselbe 52-Felder-Katalog wie überall sonst im
System, siehe [§4.4](#4-repository-architektur)).

### Zweifache Validierung

Ein syntaktisch korrekter Parse durchläuft zusätzlich die **vollständige
`Query.validate()`** — Feld/Operator/Typ/Einheit/Bereich/Universum/Sort/Limit-Prüfung
sowie Widerspruchserkennung (z. B. `x >= 30` und `x <= 5` gleichzeitig). **Ungültiges
VUQL erzeugt niemals eine ausführbare Abfrage.**

Screener-UI, VUQL-Editor, Strategy Builder und AI-Tool erzeugen alle **denselben** AST
und rufen **dieselbe** `Query.execute()` auf — siehe [§13](#13-strategy-engine).

---

## 19. Provider Abstraction

Implementiert in `quant/engines/provider.js` (Interfaces + Registry),
`capabilities.js` (Fähigkeitsmatrix), `data-mode.js` (mock/hybrid/live),
`data-precedence.js` (Vorrangregeln bei mehreren Anbietern).

### Sieben Provider-Interfaces (`provider.js`), zur Laufzeit erzwungen

Keine TypeScript-Interfaces — `registry.register()` lehnt einen Adapter ab, dem eine
geforderte Methode fehlt:

| Interface | Methoden (Auszug) |
|---|---|
| `ReferenceDataProvider` | `getSecurities`, `getSecurity`, `getExchanges`, `getUniverse`, `getUniverseMembership`, `healthCheck` |
| `MarketDataProvider` | `getPriceBars`, `getLatestPrice`, `getBenchmarkBars`, `getPricePanel`, `healthCheck` |
| `FundamentalDataProvider` | `getFacts` (muss Point-in-Time unterstützen), `getFilings`, `getFactPanel`, `healthCheck` |
| `EstimateDataProvider` | `getEstimates`, `getRevisionHistory`, `healthCheck` — **bewusst ohne Daten in V1** |
| `CorporateActionsProvider` | `getCorporateActions`, `healthCheck` |
| `MacroDataProvider` | `getIndicator(s)`, `healthCheck` — **Erweiterungspunkt, nicht angebunden** |
| `NewsDataProvider` | `getNews`, `healthCheck` — **Erweiterungspunkt, nicht angebunden** |

Rückgabe-Umschlag durchgängig `ok(data, provenance)` / `unavailable(reason,
provenance)` — ein fehlender Wert wird nie zu `null`/`0` degradiert, sondern trägt eine
Begründung.

### Vendor-Leakage-Guard

`findVendorLeakage(value, path, out)` durchsucht rekursiv (bis 50 Array-Elemente tief)
ein kanonisches Objekt/Array nach Schlüsseln, deren kleingeschriebener Name eine
`VENDOR_MARKERS`-Teilzeichenkette enthält: `twelve_data`, `intrinio`, `eodhd`,
`tiingo`, `polygon`, `alphavantage`, `refinitiv`, `lseg`, `factset`, `bloomberg`,
`capitaliq`, `morningstar`, `yfinance` u. a. Ein Acceptance-Test lässt diesen Scanner
über Product Layer und UI laufen. **Seit PR #46 ist Tiingo kein reiner Sperrlisteneintrag
mehr** — der reale Adapter (`providers/tiingo/adapter.js`) liefert jetzt echte Bars, und
`tiingo.test.mjs` (T4) prüft genau diese Ausgabe explizit gegen `findVendorLeakage()`:
`assert.deepEqual(Provider.findVendorLeakage(bar), [])`. Der Guard wird also nicht mehr
nur gegen synthetische Daten, sondern gegen echte Vendor-Antworten scharf getestet.

### Capability-Matrix, Data Modes, Precedence

- **`capabilities.js`:** vier Fähigkeits-Sets (`market`, `fundamental`, `reference`,
  `estimate`), strikt dreiwertig (`true`/`false`/`null` — „nicht geprüft" wird nie zu
  „nicht vorhanden", MEDIUM-5-Lehre aus [§6](#6-phase-2--production-audit)).
  `capabilityMissing()` liefert einen eigenen Fehlertyp, getrennt von schlichter
  Datenabwesenheit — eine fehlende Fähigkeit ist nur durch Plan-/Anbieterwechsel lösbar,
  ein fehlender Wert nicht.
- **`data-mode.js`:** `mock` (V1-Default, nichts real) · `hybrid` (echte Marktdaten,
  synthetische Fundamentaldaten) · `live` (noch nicht erreichbar — kein lizenzierter
  Fundamentaldaten-Anbieter). Steuerung über `DATA_MODE`/`VU_DATA_MODE`; ein unbekannter
  Wert fällt auf `mock` zurück (der sichere Zustand). `resolveSources()` bestimmt die
  Herkunft je Datenklasse (`live`/`delayed`/`endOfDay`/`stale`/`mock`/`unavailable`/
  `capabilityMissing`) und markiert einen Live-Datenausfall sichtbar als `degraded`.
  `backtestEligibility()` markiert jeden Backtest auf synthetischen Fundamentaldaten als
  keine echte Evidenz — unabhängig davon, ob die Kurse echt sind.
- **`data-precedence.js`:** Entscheidungskette bei widersprechenden Anbietern:
  `pitSuitability → capability → confidence → freshness → providerPriority →
  timestamp` — die konfigurierte Anbieterpriorität steht bewusst fast am Ende, nicht am
  Anfang. Historische Abfragen schließen nicht-PIT-fähige Quellen ganz aus, statt sie nur
  abzuwerten. `dataQualityScore()` (`internalOnly`, Gewichte: PIT-Konfidenz 25,
  Vollständigkeit 20, Quellenzuverlässigkeit 15, Identifikator-Konfidenz 15, Aktualität
  15, Corporate-Actions-Abdeckung 10) und `createSnapshotId()` (Format
  `VU-US-EQUITY-2026-09-07-v1`) mit `evidenceEligible`-Flag.

### Transport, Qualität, Symbolzuordnung

- **`market-client.js`:** anbieterneutrale Transportschicht — Warteschlange mit
  Nebenläufigkeitsgrenze, Anfrage-Deduplizierung, TTL-Cache je Datenklasse,
  Retry/Backoff nur für als vorübergehend klassifizierte Fehler, Kontingentprüfung
  (pro Minute/Tag) **vor** dem Versand. Das Freikontingent ist der Normalfall, keine
  Ausnahme. `fetchImpl` ist injizierbar — das Modul selbst öffnet nie eine
  Netzwerkverbindung (testbar ohne Netzwerk).
- **`market-quality.js`:** prüft eingehende Kursreihen vor der Übergabe an die Quant
  Engine — unangekündigte Splits (Ratio-Abgleich gegen gängige Split-Verhältnisse),
  anomale Tagesbewegungen (>35 % Standardschwelle), Lücken in der Handelstagsfolge.
  Befunde als `error`/`warning`/`info`.
- **`symbol-mapping.js`:** bildet die kanonische `securityId` auf anbieterspezifische
  Symbole ab, disambiguiert über Exchange/MIC/Währung/Land/ISIN (ein blanker Ticker ist
  mehrdeutig, z. B. „SAN" = Sanofi oder Banco Santander). Konfidenz `verified` /
  `inferred` / `unverified` (Default `unverified`); Konflikte werden erfasst, nie
  stillschweigend überschrieben.

### Financial Data Core (`schema.js`)

Kanonische Entitäten in fünf Gruppen (Implementation Report nennt 26 Entitäten
insgesamt; namentlich verifiziert u. a.): Reference (`Security`,
`SecurityIdentifier`, `Exchange`, `Sector`, `Industry`) · Market (`PriceBar`,
`CorporateAction`) · Fundamentals (`Filing`, `FundamentalFact`, `EstimateSnapshot`) ·
Quant (`FactorDefinition`, `FactorSnapshot`, `QuantScoreSnapshot`) · Universe
(`Universe`, `UniverseMembership`) · Strategy (`StrategyDefinition`,
`StrategyVersion`) · Backtest (`BacktestRun`, `BacktestPosition`, `BacktestTrade`,
`BacktestMetric`) · Portfolio (`Portfolio`, `PortfolioHolding`, `Watchlist`,
`IntelligenceEvent`) · Provenance (`DataSource`, `DataProvenance`). Der
Validator lehnt unbekannte Felder ab.

### Provider-Vorbereitung unter `providers/` — tatsächlicher Stand (aktualisiert nach PR #46/#48)

| Anbieter | Status | Realer Code |
|---|---|---|
| `mock/` | aktiv | einziger vollsynthetische-Daten-Adapter, Grundlage der gesamten Quant-Engine-Oberfläche |
| `twelve-data/` | aktiv, intern | vollständiger, getesteter 7-Methoden-Adapter (`adapter.js`); macht ohne `TWELVE_DATA_API_KEY` keine Anfrage; Node-only |
| **`tiingo/`** | **aktiv, laufzeitgeprüft, intern** | `adapter.js` erfüllt `MarketDataProvider` **und** `CorporateActionsProvider`; echte Daten in CI gemessen (Historical EOD, RAW/SPLIT_ADJUSTED/TOTAL_RETURN, Splits, Dividenden, Intraday/IEX); **kein öffentlicher Ausgabepfad** ([§22](#22-tiingo-market-data)) |
| **`sec/`** | **aktiv, laufzeitgeprüft** | `adapter.js` erfüllt ausschließlich `FundamentalDataProvider` (CI erzwingt, dass er `MarketDataProvider`/`EstimateDataProvider`/`CorporateActionsProvider` NICHT beansprucht); echte Daten aus `data.sec.gov` für 5 Unternehmen ([§21](#21-sec-financial-data-core)) |
| `intrinio/` | nicht angeschlossen | nur README/Vorbereitung, kein Adapter-Code |
| `eodhd/` | nicht angeschlossen | nur README/Vorbereitung, kein Adapter-Code |
| FMP, Finnhub, Polygon | — | kein `providers/`-Ordner, kein Adapter, keine README — trotz vorbereiteter `.env.example`-Variable |

**Acht Provider-Profile** in `quant/config/provider-profiles.json`: `sharadar`,
`intrinio`, `twelve-data`, `eodhd`, `fmp`, `polygon`, `tiingo`, `sec-edgar`. Sieben davon
tragen `licensing.status: LEGAL_REVIEW_REQUIRED`. **`sec-edgar` allein hat keinen
Lizenzblock** — SEC/EDGAR ist US-Behördendaten ohne die kommerzielle
Nutzungsbeschränkung, die bei den übrigen sieben offen ist.

Twelve Datas Selbstauskunft in der Fähigkeitsmatrix: Kurse 29 % (eingeschränkt),
Fundamentaldaten-für-Backtest 0 % (ungeeignet — kein PIT/Delisted-Support), Estimates
0 % (ungeprüft), Referenzdaten 60 % (geeignet). Kandidat für die Live-Produktschicht,
nicht für Backtests.

**Kleiner, weiterhin bestehender Doku-Widerspruch:** `providers/intrinio/README.md`
dokumentiert `INTRINIO_API_KEY` als benötigte Umgebungsvariable — sie fehlt in
`.env.example` vollständig (dort stattdessen `TWELVE_DATA_API_KEY`, `EODHD_API_KEY`,
`TIINGO_API_KEY`, `FMP_API_KEY`, `FINNHUB_API_KEY`, `POLYGON_API_KEY`).

---

## 20. Aktuelle Data Strategy

Strategischer Datenplan aus dem ursprünglichen Research:

```
SEC          → US Fundamentals, Filings, PIT, 13F / weitere öffentliche SEC-Daten
FRED / ECB   → Macro
Tiingo       → Market Data, Historical EOD, Raw/Adjusted Prices, Splits, Dividenden,
               Intraday/IEX für interne Entwicklung
Vision Universe → Derived Metrics: Quant, Technical Indicators, Backtests, Signals, Rankings
```

**Realitätsabgleich (8. September 2026): Dieser Plan ist inzwischen weitgehend
umgesetzt — mit einer wichtigen Einschränkung.**

| Baustein | Stand |
|---|---|
| SEC → US Fundamentals, Filings, PIT | **implementiert, laufzeitgeprüft**, 5 Unternehmen — kein 13F (das bleibt der separate `hedgefonds/`-Scraper) ([§21](#21-sec-financial-data-core)) |
| Tiingo → Market Data, EOD, Raw/Adjusted, Splits, Dividenden, Intraday | **implementiert, laufzeitgeprüft** — aber intern, nicht öffentlich ausgeliefert ([§22](#22-tiingo-market-data)) |
| FRED/ECB → Macro | weiterhin nicht angebunden; `/macro/` bleibt ein eigenständiges Produkt mit eigener, redaktionell gepflegter Datenbasis |
| Vision Universe → Derived Metrics: Technical Indicators | **implementiert** ([§23](#23-technical-intelligence--elliott-wave)) |
| Vision Universe → Derived Metrics: Quant, Backtests, Signals, Rankings aus echten Daten | **noch nicht verbunden** — SEC und Tiingo sind geprüfte, aber parallele Datenquellen; der Quant-Score-/Backtest-Pfad läuft weiterhin ausschließlich auf dem synthetischen 511-Titel-Mock-Universum |

Die **wichtigste verbleibende Lücke** ist nicht mehr „fehlender Anbieter", sondern
**fehlende Integration**: SEC liefert echte PIT-Fundamentaldaten, Tiingo liefert echte
Kurse mit belegtem `TOTAL_RETURN` — aber `factors.js`, `quant-score.js` und
`backtest.js` lesen davon noch nichts. Das ist eine bewusste, nicht eine versehentliche
Lücke (siehe [§21](#21-sec-financial-data-core), „Kein Duplikat entstanden").

---

## 21. SEC Financial Data Core

**Status: IMPLEMENTED für Einzeltitel-Fundamentaldaten — BLOCKED für survivorship-freie
Universumskonstruktion.** Gemerged PR #48 (8. September 2026, `7630e6c`). Live gegen
`data.sec.gov` validiert (16 GitHub-Actions-Läufe), nicht nur gegen Fixtures.

### Architektur — ein weiterer Provider, keine zweite Architektur

```
data.sec.gov → scripts/quant/sec/** (14 Python-Module, Stdlib) → quant/data/sec/canonical/*.json
                                                                          ↓
                                            providers/sec/adapter.js
                                            FundamentalDataProvider (engines/provider.js) — GENAU
                                            dieses eine Interface, CI erzwingt „nicht mehr"
                                                                          ↓
                                            engines/schema.js (PIT-Regel) · factors.js · gate-tests.js
```

- **`providers/sec/adapter.js`** implementiert `FundamentalDataProvider` (`getFacts`,
  `getFilings`, `getFactPanel`, `healthCheck`) plus `getFactsAsOf`/`getUniverseAsOf` für
  `gate-tests.js`. `sec-fundamentals-ci.yml` prüft aktiv, dass der Adapter **nicht**
  `MarketDataProvider`, `EstimateDataProvider` oder `CorporateActionsProvider`
  beansprucht — SEC liefert keine Kurse, keine Marktkapitalisierung, keine Corporate
  Actions.
- **Die PIT-Regel ist die des Systems**, nicht mitgebracht: `availableAt <=
  decisionTime` aus `engines/schema.js`.
- **Kein Duplikat.** `factors.js`, `quant-score.js` und `backtest.js` enthalten keine
  einzige SEC-spezifische Referenz. Die SEC-Schicht berechnet ausschließlich sechs
  Bilanzaggregate aus gemeldeten Positionen (`derived.py`) — ROE, ROIC, Margen, Growth,
  Value, Momentum bleiben ausschließlich in `factors.js`/`quant-score.js`. `quant/config/
  provider-profiles.json` bekam ein **achtes** Profil (`sec-edgar`) neben den
  bestehenden sieben, ohne diese zu verändern.
- **Pipeline** (`scripts/quant/sec/`, 14 Module): Fair-Access-HTTP mit deklariertem
  User-Agent, gelernte Fiskalkalender (nie `fy`/`fp` blind als Periode übernommen —
  genau das war ein realer Bug, siehe unten), YTD-De-Akkumulation innerhalb des
  PIT-Fensters, bitemporale Restatement-Historie (`revisionId`/`restatementStatus`),
  Data-Quality-Engine (12 Regeln, die **markieren, nie korrigieren**), Checkpointing,
  Coverage-Matrix, CLI (`ingest · update · retry · resolve · export · coverage · gates ·
  canonical · inspect · test`).
- **Data Inspector** (`quant/data-inspector/`): interne Prüfoberfläche, kein
  Konsumenten-Dashboard — zeigt jede normalisierte Kennzahl mit SEC-Concept, Accession
  Number, Filing-Datum und dem Zeitpunkt, ab dem sie im Backtest sichtbar sein darf.

### Gate-Ergebnisse — Lauf #16, Normalisierungslogik 1.5.0, echte Daten

| Gate | Ergebnis | Bedeutung |
|---|---|---|
| **A — Restatement** | **PASS 5/5, `RUNTIME_VERIFIED`** | gegen echte, im Live-Lauf beobachtete Korrekturen |
| **B — Delisting/Survivorship** | **FAIL 5/5** | `universeSizeDuring: 0` — strukturell, nicht behebbar aus SEC-Daten allein |
| **C — Verfügbarkeitszeitpunkt** | **PASS 5/5** | 27.385 PIT-Beobachtungen geprüft, 3.636 Datensätze, 0 ohne Zeitstempel |

**Gate B bleibt FAIL — das ist ein dauerhaftes strukturelles Merkmal der Quelle, keine
zu behebende Baustelle.** SEC/EDGAR führt keinen Security Master und keinen
Delisting-Feed; `company_tickers.json` listet nur Registranten mit *aktuell*
zugeteiltem Ticker. `getUniverseAsOf()` gibt deshalb bewusst `unavailable` zurück,
statt das heutige Universum stillschweigend als historisches auszugeben — genau der
Survivorship Bias, den Gate B aufdecken soll. **Für ein survivorship-freies
Backtest-Universum bleibt eine externe Indexhistorie (Sharadar, CRSP oder gleichwertig)
notwendig.** Point-in-Time-Korrektheit (Gate A/C) und Survivorship-Freiheit (Gate B)
sind zwei getrennte Probleme — SEC löst nur das erste.

**Primärquellen-Abgleich:** `audit_primary_source.py` holt `companyfacts` erneut ab und
vergleicht gegen die kanonischen Werte — 240 Prüfungen über 6 Kennzahlen, **0
Abweichungen**. 5/5 Unternehmen (NVDA, AAPL, MSFT, JPM, XOM) geladen, 4.271 kanonische
Fakten, 604 Restatements mit vollständiger Revisionskette, 5,8 MB committete Artefakte
unter `quant/data/sec/` (keine `status: "not_generated"`-Platzhalter mehr — die Daten
existieren real, geprüft am 8. September 2026).

**Elf reale Fehler in dieser Phase gefunden und mit Regressionstest behoben**, keiner
davon in einer zuvor grünen Testsuite entdeckt. Die schwersten zwei: (1) FY- und
Q4-Zeilen kollidierten in derselben Zelle, weil `fiscalPeriod` nicht Teil des
Schlüssels war — ein Backtest wäre um Faktor vier danebengelegen; (2) 252 Fakten (6 %)
waren bis zu eine Handelssitzung zu früh sichtbar, weil `acceptanceDateTime` regulär am
Vortag des offiziellen Filing-Datums liegt.

### Bekannte Grenzen (wörtlich aus `docs/SEC_RELEASE_AUDIT.md`)

1. **Survivorship-Bias — Gate B bleibt FAIL, 5/5** (siehe oben, unveränderlich ohne
   externe Indexhistorie).
2. Strukturierte Daten erst ab 2007/2008; 1993–2006 ist `FILING_ONLY` (Zahlen existieren
   nur im Dokument, nicht normalisiert).
3. 5 unterdrückte Zellen (NVDA 4, XOM 1), Grund `AMBIGUOUS_PERIOD_END` — gemeldet, nicht
   geraten.
4. **`ebitda` und `dividendPerShare` sind aus SEC-XBRL nicht verlustfrei ableitbar** und
   stehen in `UNSUPPORTED_METRICS`. `factors.js` nutzt `ebitda` an 15 Stellen: **EV/EBITDA,
   Leverage und Balance-Sheet-Quality bleiben damit unvollständig, solange nur SEC als
   Quelle dient.**
5. 5 `FUTURE_DATA_LEAK`-Rohfakten bei NVDA (Dividendenerklärungen,
   Rückkaufautorisierungen, Public Float) — markiert, nicht korrigiert, erreichen nicht
   die kanonische Schicht.
6. `securityId = sec_<TICKER>` — ein Tickerwechsel ändert die ID.
7. **Nur fünf Unternehmen gemessen.** Die Pipeline ist CIK-parametrisiert und per
   AST-Guard (`check_company_agnostic.py`) gegen Ticker-Branching abgesichert — Skalierung
   ist ein größerer Lauf, keine Codeänderung.
8. **Speicher-/Skalierungsgrenze, ausdrücklich ungelöst:** 5,8 MB für fünf Unternehmen
   skalieren linear; bei 500 Unternehmen wären das rund 590 MB committete Artefakte —
   „für ein öffentliches Repository nicht tragbar" (`SEC_RELEASE_AUDIT.md`). Lösungsansätze
   (Parquet/DuckDB, On-demand-Inspector) sind benannt, nicht implementiert.

**Nicht unterstützt:** OHLCV, Marktkapitalisierung (bleibt `MarketDataProvider`-Domäne),
Corporate Actions/Split-Historie, Analystenschätzungen/Revisionen, Realtime/Intraday,
europäische Fundamentaldaten, historisches Universum.

### Nächster Schritt

Skalierung über 5 Unternehmen hinaus setzt zuerst eine Lösung für die
Speicherskalierung voraus (Punkt 8 oben), nicht umgekehrt. Details:
`docs/SEC_DATA_ARCHITECTURE.md`, `docs/SEC_NORMALIZATION.md`,
`docs/SEC_PIT_METHODOLOGY.md`, `docs/SEC_COVERAGE_REPORT.md`,
`docs/SEC_LIVE_VALIDATION.md`, `docs/SEC_RELEASE_AUDIT.md`, `docs/SEC_PHASE4_REPORT.md`.

Unberührt bleibt `scripts/hedgefonds/fetch_edgar_data.py`: ein 13F-Scraper für den
eigenständigen `hedgefonds/`-Produktbereich — dieselbe Primärquelle (SEC EDGAR),
kein gemeinsamer Code, kein Teil der Quant-Provider-Architektur.

---

## 22. Tiingo Market Data

**Status: IMPLEMENTED (technisch vollständig) — LEGAL REVIEW REQUIRED für öffentliche
Anzeige.** Gemerged PR #46 (8. September 2026, `1a6e49e`). Live gegen die echte Tiingo-API
validiert (55 Anfragen, 20 MB über die gesamte Phase — 0,98 % des Monatsbudgets).

### Was gebaut und laufzeitgeprüft wurde

`providers/tiingo/adapter.js` (Node-only, CommonJS, im Browser nicht ladbar) erfüllt
**`MarketDataProvider`** (inkl. `getIntradayBars`, `adjustmentStatus`, `quota`) und
**`CorporateActionsProvider`** (Splits/Dividenden werden aus `splitFactor`/`divCash`
derselben Tagesreihe abgeleitet, kein separater Endpunkt). Dazu:
`quant/engines/panel-builder.js` (Brücke Bars → Panelformat), `market-store.js`
(Arbeitsablage getrennt von ausgeliefertem Ausschnitt), `display-policy.js`
(„abrufbar" ≠ „anzeigbar" — siehe Lizenz unten), `chart-ranges.js`,
`quant/ui/charts.js` (Kerzenchart ohne Chartbibliothek).

| Fähigkeit | Live-Messung |
|---|---|
| Historical EOD | AAPL-Historie ab 1980-12-12, 2.936 Bars ab 2015, eine Anfrage je Titel |
| RAW / SPLIT_ADJUSTED | beide Spalten liegen nebeneinander vor; NVDA-4:1-Split (2021-07-20) bestätigt: rohe Reihe springt, bereinigte bleibt stetig |
| **TOTAL_RETURN** | KO Ex-Tag 2024-03-14 — **erster laufzeitbelegter Total-Return-Bestand des Projekts**, kostenlos |
| Splits / Dividenden | 3 Split-Ereignisse, 46–47 Ausschüttungen je Dividendentitel im Testuniversum |
| Intraday (IEX) | 78 Bars gemessen — technisch funktionsfähig, aber per Feature-Gate abgeschaltet (siehe unten) |
| Rate-Limit-Verhalten | Stundengrenze real erreicht (5 Läufe/Stunde, 42 Anfragen, 6. Lauf erhielt 429) und korrekt behandelt |

Free-Tier-Limits, aus dem Adapter (`FREE_LIMITS`) und `docs/TIINGO_FREE_LIMITS.md`:
**20/Minute, 50/Stunde (die eigentliche Bindungsgrenze, nicht die Tagesgrenze),
1.000/Tag, 2 GB/Monat, Concurrency 1.** Kommerzielle Tarifwerte (`COMMERCIAL_LIMITS`)
sind ausdrücklich als **ungeprüfter Platzhalter** markiert (`verified: false`).

### Was ausdrücklich NICHT öffentlich freigeschaltet ist

**`quant/config/feature-gates.json` — beide Gates auf `false`:**

```
ENABLE_LIVE_MARKET_DATA:        false  (Intraday/IEX-Nutzungsbedingungen ungeprüft)
ENABLE_PUBLIC_LIVE_MARKET_DATA: false  (keine geprüfte Erlaubnis zur öffentlichen Anzeige)
```

**Ein Feature-Gate allein genügt nicht** — `display-policy.js`
(`MarketDataDisplayPolicy`) verlangt zusätzlich einen eingetragenen, datierten
Lizenzeintrag; ohne ihn gilt der strengste Standard, unabhängig vom Gate-Zustand.
`licensing.status` in `provider-profiles.json` steht unverändert auf
**`LEGAL_REVIEW_REQUIRED`**, mit praktisch jeder Nutzungsfrage (externe Anzeige,
Redistribution, öffentliche GitHub-Speicherung, Caching) auf `UNKNOWN`. **Kein
Tiingo-Kurs liegt heute in einem ausgelieferten Pfad** — ein CI-Schritt in
`tiingo-verify.yml` lässt den Build aktiv fehlschlagen, falls echte Bars in
`quant/data/market` landen. Der Schlüssel existiert nur als GitHub-Secret
(`TIINGO_API_KEY`, Name hier dokumentiert, niemals ein Wert), geht per
`Authorization: Token <key>`-Header, nie in der URL.

**Weiterhin unbekannt/ungeprüft:** Fundamentaldaten (bleiben synthetisch), PIT-
Fundamentaldaten, Gates A/B/C für Backtest-Evidenz (alle `UNKNOWN` — Tiingo ist
Marktdaten-, kein Evidenzanbieter), delistete Wertpapiere, Realtime, WebSocket (nicht
implementiert), wöchentliche/monatliche Bar-Aggregation.

### Gefundene und behobene Fehler (aus `TIINGO_PHASE4A_REPORT.md`, 10 Befunde in 8 Gruppen)

Zwei mit Produktrisiko: **`publish()` schrieb ursprünglich echte Bars in den
ausgelieferten Pfad, gesteuert nur über ein CLI-Flag statt eine echte Lizenzprüfung** —
behoben, verlangt jetzt eine explizite, begründete Erlaubnis. Und: **Intraday-Bars
trugen den Handelstag unter `timestamp` statt dem kanonischen `date`-Feld** — der
1-Tages-Chart zeigte auf echten Adapterdaten null Punkte, während der Browsertest grün
blieb, weil seine Fixture zufällig `date` benutzte; jetzt validieren drei Tests jede
Adapterausgabe gegen das kanonische Schema.

### Nächster Schritt

**Technisch ist alles fertig — was fehlt, ist keine Codeänderung, sondern die
Lizenzfrage.** Details: `docs/TIINGO_PHASE4A_REPORT.md`, `docs/TIINGO_INTEGRATION.md`,
`docs/TIINGO_DATA_SEMANTICS.md`, `docs/TIINGO_LIVE_ARCHITECTURE.md`,
`docs/TIINGO_SCALING_PLAN.md`.

---

## 23. Technical Intelligence & Elliott Wave

**Status Technical Intelligence V1 (Kern-Engines): IMPLEMENTED.**
**Status Elliott Wave: IMPLEMENTED — BETA** (Code selbst trägt `elliott-1.0.0-beta`,
`role: "BETA"`). Gemerged PR #49 (8. September 2026, `252dec5`). Release-Audit-Urteil:
**„SAFE TO MERGE AS BETA"** (`docs/VU_TECHNICAL_RELEASE_AUDIT.md`).

Reale, wenn auch begrenzte Datenbasis: 13 Symbole aus dem bestehenden, bereits
splitbereinigten Dashboard-Kursbestand — keine zweite Vendor-Anbindung, ein generischer
`MarketDataProvider`-Adapter liest den vorhandenen Bestand einmalig ein.

### Architektur — kanonische Bars → Engines → Szenarien → Evidenz → Rendering

27 Engine-Module unter `quant/engines/technical/`, production-grade und Beta getrennt
gekennzeichnet:

**Production-grade Kern:**
- **`canonical-bars.js`** — RAW/SPLIT_ADJUSTED/TOTAL_RETURN, leitet Split-Bereinigung
  selbst aus Corporate-Action-Daten ab.
- **`timeframe.js`** — kalenderbewusste Aggregation 1D→1W/1M, sessionverankertes
  Intraday; die letzte Bar trägt immer `DEVELOPING`.
- **`feature-store.js`** — deterministische, kausale, versionierte Kennzahlen (Returns,
  ATR, gleitende Durchschnitte, RSI, MACD, 52W, RVOL); fehlend = `NaN`, nie 0.
- **`pivot-engine.js`** — kausale, volatilitätsadaptive Multi-Scale-ZigZag-Engine
  (4 Skalen); **`pivotTime ≠ confirmedAt`** — die Grundlage jeder Anti-Repainting-
  Garantie im System.
- **`market-structure.js`** — HH/HL/LH/LL, close-basierter Break of Structure,
  Structure Failure, Range, Compression.
- **`trend-engine.js`, `momentum-engine.js`, `relative-strength-engine.js`,
  `volatility-engine.js`, `volume-engine.js`** — je ein 0–100-Score aus mehreren
  Komponenten; `relative-strength` und `volume` geben explizit `UNAVAILABLE` zurück
  statt eines Ersatzwerts, wenn Benchmark bzw. Volumen fehlen.
- **`support-resistance.js`** — Preiszonen aus gewichtetem Pivot-Clustering (Zonen,
  keine Einzellinien).
- **`fibonacci.js`** — nur Hilfsgröße, ausschließlich an bestätigten Pivots verankert.
- **`scenario-engine.js`** — PRIMARY/ALTERNATIVE/BEAR mit Entry Zone, struktureller
  Invalidation, Zielzonen mit Quellenangabe.
- **`trade-setup.js`** — Risk/Reward als Spanne plus Setup-Quality-Gate;
  `INCOMPLETE`, wenn Entry/Invalidation/Target fehlen.
- **`confluence.js`** — familienbasierte, abhängigkeitsbewusste Signalaggregation ohne
  Doppelzählung.
- **`technical-score.js`** — VU Technical Opportunity Score 0–100, ausdrücklich
  `isProbability: false`.
- **`snapshot.js`/`storage.js`** — unveränderliche Snapshots mit Supersedes-Kette,
  Evidence-Records (projiziert vs. tatsächlich eingetreten).
- **`annotations.js`** — renderer-neutrales `ChartAnnotation`-Schema (Zeit/Preis, keine
  Pixel/SVG).
- **`scanner.js`** — Universe-Scan mit strukturiertem Filter-DSL.
- **`technical-tools.js`** — registriert 12 AI-Werkzeuge auf **derselben**
  Tool-Registry wie `ai-tools.js` (`FORBIDDEN_TOOL_NAMES`, `validateArgs` — dieselbe
  Sicherheitsgrenze, kein Sondermechanismus).
- **`strategy-packs.js`** — nur ein Plugin-Interface für künftige benannte Strategien
  (z. B. Minervini/VCP/Darvas); **keine einzige Regel implementiert** —
  regulatorisch noch zu prüfen.

**Renderer:** `quant/ui/technical-chart.js` — reines SVG, interpretiert ausschließlich
`ChartAnnotation`-Objekte, keine Berechnungslogik. **Produktseite:**
`quant/technical/{index.html,app.js}`, eingebunden in Shell/Navigation wie jede andere
Quant-Seite (`?symbol=NVDA`).

### Elliott Wave — Beta, was real implementiert ist

`quant/engines/technical/elliott/{elliott-engine.js, rules.js, wave-graph.js}`:

- **Grammatik:** ausschließlich **Standard-Impuls (5 Beine) und einfacher Zigzag
  (3 Beine)** — Flats, Triangles, Diagonals, W-X-Y-Kombinationen sind **nicht
  implementiert**, kein Codepfad erzeugt sie.
- **Harte Regeln (Gates, keine weichen Scores):** Impuls —
  Richtungswechsel-Alternierung, `W2_NOT_BEYOND_W1_ORIGIN`, `W3_BEYOND_W1_END`,
  `W4_NO_W1_OVERLAP`, `W4_NOT_BEYOND_W3_ORIGIN`, `W3_NOT_SHORTEST`. Zigzag —
  Alternierung, `B_NOT_BEYOND_A_ORIGIN`, `C_BEYOND_B_END`. Eine verletzte harte Regel
  setzt `score = 0, valid: false` — geprüft in Tests R1/R2.
- **Weiche Richtlinien** (Fibonacci-Verhältnisse für W2/W3/W4/W5, Kanal-Fit,
  Momentum/Volumen auf W3) fließen in `guidelineFit`, **überschreiben nie** eine harte
  Regel.
- **Kausale historische Wave Map:** Labels ausschließlich an bereits bestätigten
  Pivots; eine einmal bestätigte Welle wird **nie umgeschrieben** — durch Konstruktion,
  nicht durch nachträgliche Prüfung.
- **Primary/Alternative Count, objektive Invalidation** (direkt aus den harten Regeln
  abgeleitet, nicht diskretionär), **Projection Zones** (Zieldichte-Clustering,
  ATR-toleranzbasiert, auf ~3 Phasen begrenzt, immer als `PROJECTED` markiert).
- **Confidence = Method Fit** (`ECS = 0,8 × fit + 0,2 × stability`), ausdrücklich
  `isProbability: false` — Counts sind häufig `AMBIGUOUS`/`LOW_CONFIDENCE` und werden
  so ausgewiesen, nicht beschönigt.
- **Stabilitätsmetrik:** real — testet, ob eine ±10-%-Störung der Pivot-Schwellen den
  aktuellen Count ändert. Testet nur Pivot-Schwellen, nicht zusätzliche Bars — bekannte
  Einschränkung.
- **Ein Feld existiert, ohne real berechnet zu werden:** `abortConditions.dataGap` ist
  in jedem Ergebnisobjekt vorhanden, aber in allen Pfaden fest auf `false` gesetzt —
  nicht tatsächlich ausgewertet.

### Anti-Repainting — real getestet, nicht nur behauptet

Bei einer musterbasierten Engine ist Repainting (ein Signal, das sich rückwirkend
ändert) das klassische Warnsignal. Hier real geprüft: `technical-pivots.test.mjs` P2
(„Präfix-Lauf und geschnittener Voll-Lauf sind bit-identisch") und P6
(Repainting-Policy); `technical-elliott.test.mjs` E3 (Walk-Forward-Hash-Identität) und
**E6** — ein Bar-für-Bar-Walk-Forward über >40 Beine, gezielt dimensioniert, um einen
**echten, gefundenen und behobenen Repainting-Bug** zu reproduzieren: ein gleitendes
40-Leg-Fenster und eine verfrühte 3-Leg-Zigzag-Entscheidung schrieben zuvor bestätigte
Labels um. Gemessen an NVDA über 300 Schritte: **vorher 3, nachher 0 Umschreibungen.**
Dieser Fund-und-Fix-Zyklus steht offen im Release-Audit, nicht verschwiegen.

### Bekannte Grenzen (wörtlich, nicht beschönigt)

- **„Elliott-Grammatik V1 ist zweimustrig"** — auf feinen Skalen fragmentiert die
  Historie mancher Titel (z. B. NVDA, PLTR) in Zigzag-Ketten mit unlabeled Spans, weil
  Impulse die Overlap-Regel verletzen. Multi-Degree-Nesting ist als **V1.5-„MUST"**
  benannt, nicht implementiert.
- **Flats, Triangles, Diagonals, Kombinationen: nicht implementiert und nicht als
  erfüllt behauptet.**
- **Projection Clipping:** bei weit entfernten Zielzonen (z. B. SPY, W3 > 1.000) stößt
  die Darstellung an die Preisskala.
- **JSON-Größe:** ~0,49 MB je Instrument, ~15 MB für 26 Instrumente; für 500+ Titel
  fehlen On-demand-Auslieferung und Columnar Storage (Interface vorbereitet, nicht
  angebunden).
- **Volles Neuberechnen statt inkrementell:** V1 rechnet bei jedem Build die komplette
  Historie neu.
- **Regulatorisches Review (MAR/MiFID) der Szenario-Darstellung steht aus** — separates
  Gate vor jedem öffentlichen Launch, unabhängig vom technischen Status.
- AI-Werkzeuge sind registriert und getestet, aber **noch nicht an die laufende
  `/quant/ai/`-Seite angebunden**.

Details: `docs/VU_TECHNICAL_PHASE1_REPORT.md`, `docs/VU_TECHNICAL_RELEASE_AUDIT.md`,
`docs/VU_TECHNICAL_INTELLIGENCE_ARCHITECTURE.md`, `docs/VU_TECHNICAL_OPPORTUNITY_SCORE.md`,
`docs/VU_TECHNICAL_SNAPSHOT_SPEC.md`, `docs/VU_TECHNICAL_DATA_SEMANTICS.md`,
`docs/VU_TECHNICAL_VALIDATION.md`.

---

## 24. Data Licensing

**Aktuelle Provider-Lizenzfragen sind bei sieben von acht geprüften Anbietern offen**
(`LEGAL_REVIEW_REQUIRED`) — die ursprünglichen sechs aus Phase 3 (siehe
[§7](#7-phase-3--data-qualification)) plus Tiingo, seit Phase 4A ebenfalls geprüft und
ebenfalls offen ([§22](#22-tiingo-market-data)). **Einzige Ausnahme: SEC/EDGAR.** Als
US-Behördendatenquelle trägt `sec-edgar` in `provider-profiles.json` keinen
Lizenzblock — das ist kein Freibrief für beliebige Weiterverwendung, aber ein anderer
rechtlicher Ausgangspunkt als bei den sieben kommerziellen Anbietern. Zu unterscheiden
bei den kommerziellen Anbietern: Internal Use, External Display, Redistribution,
Derived Data, Storage, Post-Termination, Commercial Use. Die häufigste teure
Überraschung: Sobald Daten öffentlich angezeigt werden, gilt der Betreiber bei vielen
Anbietern/Börsen als professioneller Nutzer — unabhängig davon, ob damit Geld verdient
wird ([§28](#28-cost-philosophy)).

**Aktuelle Strategie, jetzt mit einem funktionierenden Beispiel:** erst intern
entwickeln, Public Display erst nach entsprechender Lizenzentscheidung. Tiingo zeigt,
wie das in der Praxis aussieht — ein technisch vollständiger, laufzeitgeprüfter Adapter,
zwei Feature-Gates (`ENABLE_LIVE_MARKET_DATA`, `ENABLE_PUBLIC_LIVE_MARKET_DATA`) beide
auf `false`, plus ein CI-Guard, der den Build fehlschlagen lässt, falls trotzdem echte
Daten in einen ausgelieferten Pfad gelangen ([§22](#22-tiingo-market-data)). Konkret bei
Sharadar (weiterhin unverändert): professionelle Nutzer müssen über Nasdaq Data Link
beziehen; eine öffentliche Website ist mit hoher Wahrscheinlichkeit professionelle
Nutzung — die recherchierten 29/69 USD/Monat sind damit vermutlich **nicht** der
zutreffende Tarif.

Dieses Dokument ist **keine Rechtsberatung** und behauptet das nicht.

---

## 25. Mock / Hybrid / Live

Implementiert in `quant/engines/data-mode.js`, Betriebsmodi über `VU_DATA_MODE`:

| Modus | Bedeutung |
|---|---|
| `mock` | ausschließlich synthetische Daten (Standard, immer lauffähig, kein Netzwerk) |
| `hybrid` | echte Kurse für das Referenzuniversum, alles andere synthetisch |
| `live` | nur echte Daten; **scheitert bewusst**, wenn etwas fehlt |

**Grundregel: Datenherkunft wird pro Datenklasse ausgewiesen**, nicht pauschal fürs
ganze Produkt. Beispiel aus `/quant/markt/`: „Kurse: Demo / Fundamentaldaten: Demo" im
Mock-Modus; im Hybrid-Modus je Datenklasse einzeln. **Kein stiller Mock-Fallback als
echte Daten** — jeder Datensatz trägt `isMock: true`, jede Modellseite ein sichtbares
Demo-Banner, jeder Ticker-Präfix `VU Mock`.

`quant/data/market/status.json` steht produktiv auf `configured: false` — es sind keine
echten Kursdaten committet. Aktueller Datenumfang (`quant/data/meta.json`): 511
Securities (482 aktiv, 29 historisch delistet), 5.395 Handelstage (2006-01-02 bis
2026-09-04), Seed `vision-universe-quant-v1`.

---

## 26. Security

- **Keine API-Keys im Client.** Alle Abrufe laufen serverseitig (GitHub Actions); der
  Browser sieht nie einen Schlüssel — die Website ist statisch, alles im Browser ist
  öffentlich.
- **Keine Secrets im Repository, keine Secrets in JSON, keine Secrets in Logs.**
  Acht dauerhafte Tests plus eine Pre-Commit-Prüfung erzwingen das (Details in
  [§6](#6-phase-2--production-audit)).
- **Provider-Zugriff ausschließlich serverseitig/workflow-/proxyseitig.**
- **GitHub Secrets `TWELVE_DATA_API_KEY` und `TIINGO_API_KEY`** sind aktiv genutzt
  (Phase 2 bzw. Phase 4A), korrekt über `secrets.` in den jeweiligen Workflow gereicht.
  Der Tiingo-Schlüssel geht per `Authorization: Token <key>`-Header, nie in der URL; ein
  Test (`tiingo.test.mjs` T13) prüft, dass er in keiner Antwort oder Diagnosemeldung
  gespiegelt wird — dieselbe S8-Disziplin wie beim Twelve-Data-Adapter (siehe
  [§6](#6-phase-2--production-audit)). **SEC/EDGAR braucht keinen API-Key** — nur einen
  sich ausweisenden User-Agent mit der öffentlichen Repository-Kontaktadresse, wie es
  die Fair-Access-Policy der Behörde verlangt. **In diesem Dokument wird ausschließlich
  der Name eines Secrets dokumentiert, niemals ein Wert.**
- Kein `eval`, kein `document.write`, kein `new Function` im gesamten Quant-Bereich
  (geprüft).
- **Tiingo-Publish-Guard:** `tiingo-verify.yml` lässt den Build aktiv fehlschlagen,
  falls ein echter Kurs-Bar in den ausgelieferten Pfad (`quant/data/market`) gelangt —
  eine zusätzliche, spezifisch für Phase 4A gebaute Absicherung gegen versehentliche
  Veröffentlichung nicht lizenzierter Daten (vgl. die `technical_scenarios.json`-Lehre
  in [§9](#9-release-audit-funde-und-guardrails)).

---

## 27. Storage Strategy

**Aktueller Stand:** Alle Daten liegen als präkomputiertes, committetes JSON —
kein Datenbanksystem, weder für Mock- noch für echte Daten.

| Datensatz | Größe | Umfang | Skalierungsstatus |
|---|---|---|---|
| `quant/data/securities.json` (Mock) | 945 KB (175 KB gzip) | 511 Titel × 60 Felder | angemessen bis ~2.000 Titel, danach Sharding wie Factor DNA |
| `quant/data/sec/` (echte SEC-Daten) | 5,8 MB | 5 Unternehmen | **ausdrücklich ungelöst:** skaliert linear, ~590 MB bei 500 Unternehmen — laut `SEC_RELEASE_AUDIT.md` „für ein öffentliches Repository nicht tragbar" |
| `quant/data/technical/` (echte Kurse) | ~17 MB | 26 Instrumente, ~0,5 MB/Instrument | für 500+ Titel fehlen On-demand-Auslieferung und Columnar Storage (Interface vorbereitet) |

**Das ist die konkreteste, unmittelbarste Storage-Frage des gesamten Projekts** — nicht
mehr eine ferne Migrationsüberlegung: SEC und Technical Intelligence liefern bereits
heute echte Daten, und ihre Speicherform skaliert nachweislich nicht auf ein
produktionsreifes Universum. Eine Lösung (Parquet/DuckDB, Object Storage,
On-demand-Auslieferung statt Full-Commit) ist Voraussetzung für jede Skalierung über die
heutigen 5 Unternehmen bzw. 26 Instrumente hinaus — nicht optional, nicht „später".

**Prinzip für echte Daten (Ingestion-Seite bereits umgesetzt):** SEC und Tiingo
importieren einmal, cachen (Checkpointing bzw. `.market-cache`) und aktualisieren
inkrementell über die Filing-Signatur bzw. Quota-bewusste Wiederaufnahme — keine
tägliche Komplett-Neuladung. Technical Intelligence rechnet dagegen **noch die volle
Historie bei jedem Build neu** ([§23](#23-technical-intelligence--elliott-wave)),
inkrementelle Berechnung ist dort offen.

**Langfristig mögliche Storage-Systeme** (weiterhin Planung, für den *committeten
Endzustand* nicht umgesetzt): Parquet, DuckDB, PostgreSQL, Object Storage — passend zur
in [§4](#4-repository-architektur) beschriebenen späteren Migration.

---

## 28. Cost Philosophy

> **Vision Universe soll vor Product-Market-Fit keine hohen fixen Datenkosten
> produzieren.**

**Aktuelles Ziel:** ca. 50–100 EUR/USD monatliche externe Datenkosten während
Development/früher Phase. Kosten sollen mit Usage, Kundenzahl und Umsatz skalieren.
**Keine institutionellen Datenverträge ohne wirtschaftliche Begründung.**

### Drei Kostenkategorien (`docs/VU_DATA_PROVIDER_COST_MODEL.md`, Recherchestand
7. September 2026 — **keine dieser Zahlen ist eine Vertragsgrundlage**, alle vor jeder
Entscheidung neu zu erheben)

| Kategorie | Zweck |
|---|---|
| `DEVELOPMENT` | Bauen und prüfen, nicht veröffentlichen |
| `GROWTH` | Öffentlicher Betrieb, überschaubare Nutzerzahl |
| `SCALE` | Kommerzieller Betrieb |

**Der Sprung von DEVELOPMENT zu GROWTH ist meist kein Preissprung, sondern ein
Lizenzsprung** — derselbe Zugang, andere Nutzungsart, anderer Vertrag.

| Zweck | Zugang | Kosten (Stand 2026-09-07) |
|---|---|---|
| Gate A + C, kostenlos | Intrinio Developer Sandbox (Dow 30) | 0 USD |
| Sharadar, alle drei Gates | Full History Bundle | 69 USD/Monat bzw. 499 USD/Jahr (`THIRD_PARTY_REPORTED`, Lizenzfrage offen) |
| Twelve Data (aktiv) | Free Plan | 0 USD (`DOCUMENTATION_VERIFIED`) |

`SCALE` wurde bewusst nicht recherchiert — Skalierungspreise bei Finanzdaten hängen von
Nutzerzahlen, Anzeigeart, Rechtsordnung und Verhandlung ab und werden praktisch nie
öffentlich genannt. Nicht enthalten in den obigen Zahlen: Börsengebühren,
Professionell-Einstufung, Redistribution, abgeleitete Werte, Enterprise-Zwang.

### Erste reale Verbrauchszahlen (Phase 4A, Tiingo Free Plan)

Über die gesamte Tiingo-Validierungsphase gemessen: **55 Anfragen, 20 MB — 0,98 % des
monatlichen Free-Plan-Kontingents (2 GB).** Das ist der erste Beleg im Projekt, dass die
Kostenphilosophie aus §28 in der Praxis hält: eine vollständige Laufzeitvalidierung
inklusive Historical EOD, Splits, Dividenden und Intraday-Stichproben für ein kleines
Testuniversum passt bequem in einen kostenlosen Tarif. SEC/EDGAR verlangt ohnehin keinen
kostenpflichtigen Zugang. **Beide bislang produktiv genutzten echten Datenquellen (SEC,
Tiingo) liegen damit weiterhin bei 0 USD/Monat** — die 50–100-EUR/USD-Zielmarke aus
diesem Abschnitt ist bislang nicht einmal erreicht, geschweige denn überschritten.

---

## 29. Was VU kauft vs. selbst berechnet

**Wir kaufen möglichst nicht:** RSI, MACD, SMA, EMA, Momentum, 52W High, Volatilität,
Drawdown, Quant Score, Factor DNA, Rankings, Strategy Signals.

**Wir kaufen/beziehen:** Rohdaten (Kurse, Fundamentaldaten, Corporate Actions).

**Wir erzeugen:** Derived Intelligence — die gesamte Quant Engine, Factor DNA, Radar,
Backtest, Trust Score.

Dies ist bereits heute im Mock-Modus so umgesetzt: der Mock-Generator liefert nur
Rohkennzahlen und Kursreihen; jede Kennzahl (Faktoren, Score, Momentum, Radar-Events)
wird von den Engines aus diesen Rohdaten abgeleitet — genau der Pfad, der für echte
Anbieterdaten identisch bleiben soll.

**Seit Phase 4 gilt dieser Grundsatz auch für echte Daten, nicht mehr nur als Prinzip
für später:** SEC liefert ausschließlich gemeldete Bilanzpositionen — die sechs
abgeleiteten Aggregate (u. a. `freeCashFlow`, `accruals`) berechnet `derived.py`
selbst, jede als `VISION_UNIVERSE_DERIVED` mit Formelversion gekennzeichnet; ROE, ROIC,
Margen, Growth, Value, Momentum bleiben ausschließlich in `factors.js`/`quant-score.js`.
Tiingo liefert ausschließlich Kurs-Rohdaten (inkl. Split-/Dividenden-Ereignisse) — SMA,
EMA, RSI, MACD, ATR, Bollinger, Trend Strength, Marktstruktur und die gesamte
Elliott-Wave-Analyse berechnet die Technical-Intelligence-Schicht selbst
([§23](#23-technical-intelligence--elliott-wave)). Kein Provider liefert einen
fertigen Score, eine fertige Struktur oder ein fertiges Signal.

---

## 30. Known Limitations

Ehrliche Liste, Stand 8. September 2026 — nichts beschönigt:

**Quant Engine (Score, Screener, Strategy, Backtest)**
- **Der Quant-Score-/Backtest-Pfad läuft weiterhin ausschließlich auf dem synthetischen
  511-Titel-Mock-Universum.** SEC und Tiingo liefern seit Phase 4 echte, laufzeitgeprüfte
  Daten — aber `factors.js`, `quant-score.js` und `backtest.js` lesen davon noch nichts.
  `backtestEligibility()` gibt für jeden heutigen Quant-Backtest weiterhin
  `realEvidence: false` zurück.
- **Kein Anbieter ist als vollständige Backtest-Evidenzquelle qualifiziert.** SEC besteht
  Gate A/C, fällt aber strukturell bei Gate B durch ([§21](#21-sec-financial-data-core));
  Tiingo ist Marktdaten-, kein Evidenzanbieter (Gates A/B/C bei Tiingo alle `UNKNOWN`,
  [§22](#22-tiingo-market-data)).
- **Revisions-Faktor ohne echte Daten** — Schema vorhanden, `available: false`.
- Deflated Sharpe Ratio und PBO nicht implementiert — Trust Score vergibt dafür 0 Punkte
  statt die Prüfung zu überspringen.
- Ein Universum (`US_EQUITIES`), eine Währung im Quant-Score-Pfad. Kein Nutzerkonto:
  Strategien, Backtests und Watchlist liegen im `localStorage`.

**SEC Financial Data Core**
- **Gate B (Survivorship) bleibt FAIL, 5/5 — strukturell, nicht behebbar aus SEC-Daten
  allein.** Kein Security Master, kein Delisting-Feed bei SEC/EDGAR.
- Nur 5 Unternehmen gemessen (NVDA, AAPL, MSFT, JPM, XOM); Skalierung ist ein größerer
  Lauf, aber die Speicherskalierung (linear, ~590 MB bei 500 Unternehmen) ist
  ausdrücklich ungelöst.
- `ebitda` und `dividendPerShare` aus SEC-XBRL nicht verlustfrei ableitbar —
  EV/EBITDA, Leverage und Balance-Sheet-Quality bleiben unvollständig, solange nur SEC
  als Quelle dient.
- Strukturierte Daten erst ab 2007/2008; keine Corporate Actions, keine Analysten-
  schätzungen, kein OHLCV aus dieser Quelle (bleibt bewusst `MarketDataProvider`-Domäne).

**Tiingo Market Data**
- **Öffentliche Anzeige ist rechtlich nicht geklärt** (`LEGAL_REVIEW_REQUIRED`,
  beide Feature-Gates `false`) — technisch vollständig, aber intern.
- Fundamentaldaten bleiben synthetisch; Realtime/WebSocket nicht implementiert;
  delistete Wertpapiere ungeprüft; kommerzielle Tarifzahlen sind Platzhalter.

**Technical Intelligence & Elliott Wave**
- **Elliott-Grammatik ist V1-BETA und zweimustrig** (nur Impuls + Zigzag) — Flats,
  Triangles, Diagonals, Kombinationen fehlen; Multi-Degree-Nesting ist V1.5, nicht
  implementiert.
- Reale Datenbasis auf 13 Symbole begrenzt (bestehender Dashboard-Kursbestand).
- Volles Neuberechnen statt inkrementell; JSON-Größe (~0,5 MB/Instrument) skaliert nicht
  ohne Weiteres auf 500+ Titel.
- **Regulatorisches Review (MAR/MiFID) der Szenario-Darstellung steht vollständig aus** —
  eigenes Gate vor jedem öffentlichen Launch.
- AI-Werkzeuge registriert und getestet, aber noch nicht an `/quant/ai/` angebunden.

**Übergreifend**
- **Public Live Chart/Market-Data-Licensing ist bei sieben von acht Providern offen**
  (`LEGAL_REVIEW_REQUIRED`); nur SEC/EDGAR hat als Behördendatenquelle keinen
  Lizenzblock.
- Ticker-Links in Datentabellen liegen bei Textzeilenhöhe (~15 px) — auf dem Telefon
  klein (LOW-3, nicht behoben). Tabellen ohne `<caption>`-Elemente (LOW-2, nicht
  behoben — keine Falschaussage).
- Regulatorische Prüfung (MiFID II, WpIG, WpHG, MAR, EU AI Act, Datenlizenzen) steht für
  das Gesamtprodukt weiterhin vollständig aus.
- **Dokumentationslücke, weiterhin offen:** `docs/VU_BACKTEST_TRUST_SCORE.md` listet nur
  3 der 5 Hard Caps ([§16](#16-backtest-trust-score)) — im Code korrekt, im Prosadokument
  unvollständig.

---

## 31. DO NOT BREAK THESE RULES

Diese Regeln sind das Ergebnis konkreter, im Betrieb gefundener Fehler
([§6](#6-phase-2--production-audit), [§9](#9-release-audit-funde-und-guardrails)) — sie
sind keine Stilfragen.

1. **Kein Vendor Lock-in.** Der Provider-Wechsel berührt genau eine Adapterdatei.
2. **Keine Vendor-Payloads außerhalb des Adapters.** Erzwungen durch
   `Provider.findVendorLeakage()` + Acceptance-Test.
3. **Kein Future Data Leak.** `availableAt <= decisionTime` ohne Ausnahme, ohne
   Abschaltparameter.
4. **Kein stiller Mock-Fallback.** Jeder Mock-Datensatz trägt `isMock: true`, jede
   Modellseite ein sichtbares Banner.
5. **Missing ≠ Zero.** Ein fehlender Wert senkt die Coverage, wird nie durch 0 oder eine
   neutrale 50 ersetzt.
6. **Unknown ≠ False.** Die Capability-Matrix und die Belegstufen-Logik kennen drei
   Zustände; „nicht geprüft" darf nie zu „nicht vorhanden" werden (MEDIUM-5-Lehre).
7. **Keine erfundenen Revisionsdaten.** Der Revisions-Faktor bleibt `available: false`,
   bis lizenzierte PIT-Konsensdaten vorliegen.
8. **AI berechnet keine Finanzperformance selbst.** Sie ruft ausschließlich registrierte
   Tools auf und erklärt deren Ergebnisse.
9. **Backtest nutzt validierte Daten.** Ein Backtest ohne gehaltene Position ist ein
   Hard Cap (max. 5 Punkte Trust Score), keine normale Kennzahl.
10. **Tests dürfen Produktionsdaten nicht verändern.** Verifikationsläufe laufen auf
    Kopien, nie auf committeten Produktionsdateien (Lehre aus
    `technical_scenarios.json`, [§9](#9-release-audit-funde-und-guardrails)).
11. **Secrets niemals clientseitig.** Alle Abrufe serverseitig, acht dauerhafte Tests
    plus Pre-Commit-Prüfung.
12. **Existing Vision Universe architecture first.** Statisches HTML/CSS/JS, UMD-Module,
    `node --test`, GitHub Pages — kein Rewrite auf Next.js/FastAPI/PostgreSQL ohne
    expliziten, separaten Beschluss.
13. **Kein unnötiger Rewrite.** Erweiterung statt Parallelarchitektur.
14. **Provider-Abstraction erhalten.** Sieben Provider-Interfaces, eine Registry, ein
    Vendor-Leakage-Guard — nicht umgehen, auch nicht „nur für einen Test".
15. **Public Data Licensing getrennt von Internal Development betrachten.** Eine
    Fähigkeit intern zu nutzen heißt nicht, sie anzeigen zu dürfen — siehe Tiingo:
    technisch fertig, beide Feature-Gates trotzdem `false` ([§22](#22-tiingo-market-data)).
16. **Ein Feature-Gate allein ist keine Freigabe.** `ENABLE_PUBLIC_LIVE_MARKET_DATA:
    true` würde ohne einen zusätzlichen, eingetragenen Lizenzeintrag in der
    `MarketDataDisplayPolicy` trotzdem nichts freischalten — die Anzeigerichtlinie
    verlangt beides. Ein CI-Guard (`tiingo-verify.yml`) lässt den Build fehlschlagen,
    falls trotzdem echte Kurse in einen ausgelieferten Pfad gelangen.
17. **Ein Adapter beansprucht nur die Interfaces, die er tatsächlich erfüllt.** Der
    SEC-Adapter implementiert ausschließlich `FundamentalDataProvider`; CI
    (`sec-fundamentals-ci.yml`) prüft aktiv, dass er kein `MarketDataProvider`,
    `EstimateDataProvider` oder `CorporateActionsProvider` vortäuscht.
18. **Ein durchgefallenes Gate bleibt durchgefallen, bis eine externe Datenquelle es
    löst — es wird nicht als Formulierungsfrage behandelt.** SEC Gate B (Survivorship)
    ist FAIL, 5/5, dauerhaft, weil SEC/EDGAR strukturell keinen Security Master führt;
    das ist keine offene Aufgabe für die SEC-Pipeline selbst, sondern eine Grenze der
    Quelle, die nur eine zusätzliche Indexhistorie beheben kann.
19. **Company-Agnostik in Datenpipelines ist erzwungen, nicht Konvention.** Die
    SEC-Pipeline ist CIK-parametrisiert; `check_company_agnostic.py` prüft per
    AST-Analyse, dass kein Ticker/CIK im ausführbaren Code verzweigt (Kommentare/
    Docstrings ausgenommen) — eine Skalierung auf mehr Unternehmen ist ein Datenlauf,
    keine Codeänderung, und das muss so bleiben.
20. **Kausalität (No-Look-Ahead) bei musterbasierten Engines ist testpflichtig, nicht
    optional.** Die Technical-/Elliott-Engine hatte einen realen Repainting-Bug
    (rückwirkend umgeschriebene Wellen-Labels); der Regressionstest dafür
    (`technical-elliott.test.mjs` E6, Bar-für-Bar-Walk-Forward über >40 Beine) darf
    nie entfernt oder abgeschwächt werden.

---

## 32. Aktueller Status je Modul

**Statussystem** (konsistent verwendet): `IMPLEMENTED` · `IMPLEMENTED — BETA` ·
`PARTIALLY IMPLEMENTED` · `ARCHITECTURE READY` · `RESEARCH COMPLETE` · `PLANNED` ·
`BLOCKED` · `LEGAL REVIEW REQUIRED` · `NOT IMPLEMENTED`.

| Modul | Status | Datenmodus | Teststatus | Bekannte Einschränkung | Nächster Schritt |
|---|---|---|---|---|---|
| Quant Score / Ranking | **IMPLEMENTED** (auf Mock-Universum) | Mock | grün (`quant.test.mjs`, 25) | Revisions-Faktor `available:false`; läuft nicht auf SEC/Tiingo-Daten | Integration mit realen Fundamentaldaten ist eine bewusste Entscheidung, kein Automatismus |
| Screener / VUQL | **IMPLEMENTED** | Mock | grün (`acceptance.test.mjs` u. a.) | ein Universum, eine Währung | Universe-Modell ist bereits mehrmandantenfähig angelegt |
| Factor DNA / Quant Radar | **IMPLEMENTED** | Mock | grün | — | — |
| Strategy Lab | **IMPLEMENTED** | Mock | grün (`strategy.test.mjs`, 22) | 5 vordefinierte Strategien, kein User-Konto | Persistenz jenseits `localStorage` |
| Backtest Engine | **IMPLEMENTED**, methodisch vollständig, **BLOCKED** für evidenzbasierte Aussagen | Mock | grün (`backtest.test.mjs`, 22) | kein Deflated Sharpe/PBO; kein Anbieter besteht alle drei Gates | Kapitalmaßnahmen als erste produktive Datenklasse in den Backtest-Pfad |
| AI (Ask Vision Universe) | **IMPLEMENTED**, deterministisch | Mock | grün (`ai.test.mjs`, 22) | kein reales LLM angebunden | `AI_PROVIDER_METHODS`-Interface bereit |
| Watchlist Intelligence | **IMPLEMENTED** | Mock | grün | `localStorage`-basiert | — |
| **SEC Financial Data Core** | **IMPLEMENTED** (Einzeltitel-Fundamentaldaten) · **BLOCKED** (survivorship-freies Universum) | echt, 5 Unternehmen | grün (`sec-adapter.test.mjs` 34 JS + 249 Python) | Gate B FAIL 5/5 strukturell; `ebitda`/`dividendPerShare` unsupported; Speicherskalierung ungelöst | externe Indexhistorie für Gate B; Speicherlösung vor Skalierung >5 Unternehmen |
| **Tiingo Market Data** | **IMPLEMENTED** (technisch) · **LEGAL REVIEW REQUIRED** (öffentliche Anzeige) | echt, intern | grün (`tiingo.test.mjs` 34 + 4 weitere Dateien, 100 gesamt) | beide Feature-Gates `false`; Fundamentaldaten synthetisch; Gates A/B/C `UNKNOWN` | Lizenzfrage klären — keine Codearbeit offen |
| **Technical Intelligence V1** (Kern) | **IMPLEMENTED** | echt, 13 Symbole | grün (77 Tests über 9 Dateien) | volle Neuberechnung, JSON-Skalierung, Regulatory Review aus | Skalierung auf mehr Symbole, AI-Anbindung an `/quant/ai/` |
| **Elliott Wave** | **IMPLEMENTED — BETA** | echt, 13 Symbole | grün (`technical-elliott.test.mjs`, 11, inkl. Anti-Repainting-Audit E6) | nur Impuls+Zigzag; kein Multi-Degree; keine komplexen Korrekturen | V1.5: Multi-Degree-Nesting (als „MUST" benannt) |
| Marktdaten (Twelve Data) | **IMPLEMENTED**, Phase 2 | Hybrid (Referenzuniversum) | grün (`market-data.test.mjs`, 35) | Free-Plan-Limits, `configured:false` | Lizenzfragen klären |
| Macro (Quant-Anbindung) | **NOT IMPLEMENTED** | eigenständig (`/macro/`, echte Daten) | — | kein `MacroDataProvider` angebunden | Interface bereits definiert (`ARCHITECTURE READY`) |
| Hedgefonds (Quant-Anbindung) | **NOT IMPLEMENTED**, bewusst getrennt | eigenständig (`/hedgefonds/`, echte SEC-13F-Daten) | eigene CI (`hedgefonds-dashboard-ci.yml`) | völlig getrennt vom Quant-Bereich, teilt nur die Primärquelle SEC EDGAR | kein Zusammenführen geplant |

### Gesamt-Teststand (drei unabhängige Runner, eigenständig nachgerechnet — keine Zahl aus einer PR-Beschreibung übernommen)

| Runner | Ergebnis | Aufschlüsselung |
|---|---|---|
| **Node** (`node --test "quant/tests/*.test.mjs"`) | **444/444** | Quant-Kern 232 (unverändert seit Phase 3) + Tiingo 100 (`tiingo.test.mjs` 34, `market-store.test.mjs` 20, `adjustment-consistency.test.mjs` 19, `chart-ranges.test.mjs` 15, `panel-builder.test.mjs` 12) + SEC 35 (`sec-adapter.test.mjs` 34 + 1 Gate-Ergänzung) + Technical 77 (9 Dateien: audit 11, canonical 11, elliott 11, engines 7, pivots 10, scenario 9, snapshot 7, ui 5, zones 6) |
| **SEC Python** (`unittest discover scripts/quant/tests`) | **249/249** | eigenständiger Runner, kein Überlapp mit Node — testet die Python-Ingestion-Pipeline |
| **Academy** (`node --test academy/**/*.test.mjs`) | **8/8** | unverändert, unabhängig vom Quant-Bereich |
| **Gesamt über alle drei Runner** | **701/701**, keine Doppelzählung (drei getrennte Codebasen: JS-Quant-Engines, Python-SEC-Pipeline, Academy-Engine) | |

---

## 33. Roadmap

**COMPLETED**
- Phase 1–3 — Foundation, Production Audit, Data Qualification (PR #43, 6.–7.09.2026)
- Project Master Documentation, Erstfassung (PR #45)
- **Tiingo Market Data — Phase 4A** (PR #46, 8.09.2026) — technisch fertig, real
  laufzeitgeprüft, intern
- **SEC Financial Data Core** (PR #48, 8.09.2026) — Gate A/C real bestanden, Gate B
  strukturell durchgefallen
- **Technical Intelligence V1 + Elliott Wave Beta** (PR #49, 8.09.2026)

**CURRENT FOUNDATION — nichts in aktiver Entwicklung.** Fünf große Arbeitsstränge sind
abgeschlossen und gemerged. Der nächste Schritt ist eine bewusste Entscheidung an einem
der [Decision Gates](#34-decision-gates), keine automatische Fortsetzung — insbesondere
**kein Phase 4B, kein Technical Intelligence V1.5, kein neuer Provider** ohne
ausdrücklichen separaten Auftrag.

**NEXT (nach Nutzen, nicht nach Aufwand sortiert — was jeweils tatsächlich noch fehlt)**
1. **Lizenzfrage Tiingo klären** — reine Rechtsfrage, keine Codearbeit; ohne Klärung
   bleibt jede weitere Marktdatenarbeit intern.
2. **SEC-Speicherskalierung lösen** (Parquet/DuckDB oder On-demand-Inspector), *bevor*
   über 5 Unternehmen hinaus skaliert wird — sonst wächst das Repository unkontrolliert.
3. **Externe Indexhistorie für Gate B evaluieren** (Sharadar/CRSP oder gleichwertig) —
   der einzige Weg zu einem survivorship-freien Backtest-Universum.
4. **SEC/Tiingo → Quant-Score-Integration** — beide Datenquellen sind geprüft und liegen
   bisher parallel zur Quant Engine, nicht darin.
5. **Technical Intelligence: AI-Anbindung an `/quant/ai/`** — Werkzeuge sind registriert
   und getestet, aber nicht verdrahtet.
6. **Elliott Wave V1.5** — Multi-Degree-Nesting, danach komplexe Korrekturen (Flats,
   Triangles, Diagonals, Kombinationen).
7. Regulatorisches Review (MAR/MiFID) der Technical-Szenario-Darstellung vor jedem
   öffentlichen Launch.

**LATER**
- AI-Anbindung an ein reales LLM
- Analyst Revisions (nach lizenzierten PIT-Konsensdaten)
- Europäische Fundamentaldaten
- Portfolio Intelligence
- Public Live Market Data (setzt Gate 4 unten voraus)
- Native Apps

**BLOCKED / EXTERNAL DEPENDENCY**
- **Survivorship-freies historisches Universum** — blockiert auf eine externe
  Indexhistorie; SEC allein kann das strukturell nicht liefern (Gate B).
- **Öffentliche Anzeige von Tiingo- oder anderen Vendor-Daten** — blockiert auf eine
  externe Rechtsentscheidung, nicht auf Code.
- **Regulatorische Freigabe der Technical-Szenarien** — blockiert auf Kapitalmarktrecht-
  Prüfung (MAR/MiFID), außerhalb dieses Repositories.

---

## 34. Decision Gates

Konkrete Entscheidungspunkte, an denen ein Mensch (nicht ein Agent) entscheiden muss —
aktualisiert gegenüber dem Stand nach Phase 3, mehrere sind jetzt präziser beantwortbar:

| Gate | Frage | Heutiger Stand |
|---|---|---|
| **1** | Ist die SEC-Pipeline-Qualität ausreichend? | **Teilweise beantwortet:** Ja für PIT-korrekte Einzeltitel-Fundamentaldaten (Gate A/C `RUNTIME_VERIFIED`). Nein für survivorship-freie Universumskonstruktion (Gate B FAIL, strukturell). |
| **2** | Ist Tiingo technisch geeignet? | **Ja, laufzeitbelegt** — Historical EOD, Splits, Dividenden, `TOTAL_RETURN`. Nicht mehr offen. |
| **3** | Tiingo Commercial-Internal-Upgrade? | Weiterhin verfrüht — die Lizenzfrage (Gate 4) steht davor, unabhängig vom Tarif. |
| **4** | Ist Derived-/Public-Display-Licensing geklärt? | **Nein** — bei 7 von 8 Anbietern `LEGAL_REVIEW_REQUIRED`, inkl. Tiingo trotz vollständiger technischer Umsetzung. |
| **5** | Sind Quant Scores mit echten Daten validiert? | **Nein** — der Quant-Score-Pfad läuft weiterhin nur auf dem Mock-Universum; SEC/Tiingo sind noch nicht integriert. |
| **6** | Sind Backtests mit echten Daten belastbar? | **Nein** — `realEvidence: false` bei jedem heutigen Lauf; SEC besteht nicht alle drei Gates (Gate B strukturell offen). |
| **7** | Ist die Survivorship-Bias-Frage für ein historisches Universum gelöst? *(neu)* | **Nein, strukturell blockiert** — SEC/EDGAR kann das nicht liefern; externe Indexhistorie nötig. |
| **8** | Ist Technical Intelligence/Elliott Wave regulatorisch für einen öffentlichen Launch geprüft? *(neu)* | **Nein** — MAR/MiFID-Review steht vollständig aus, unabhängig vom technischen BETA-Status. |
| **9** | Public Beta? | Weiterhin verfrüht vor Gate 4–8. |

---

## 35. How to Continue This Project

Ein neuer Claude/Codex/ChatGPT-Agent soll, in dieser Reihenfolge:

1. **`git fetch origin` zuerst, immer.** Ein lokal veralteter `main` war der Grund,
   warum diese Datei nach PR #46/#47/#48/#49 vier Merges im Rückstand geriet, bevor der
   Audit vom 8. September 2026 sie nachgezogen hat (siehe
   [Master Document Changelog](#37-master-document-changelog)).
2. **Diese Master-Datei vollständig lesen** — sie ersetzt nicht die 54 Fachdokumente
   unter `docs/`, verweist aber darauf, wo Detailtiefe gebraucht wird.
3. **Repository analysieren**, insbesondere `git log --oneline --merges`, `git status`,
   aktuellen Branch-Stand gegen `origin/main`.
4. **Tatsächlichen Status verifizieren, nicht aus dieser Datei übernehmen:**
   `node --test "quant/tests/*.test.mjs"`, `python3 -m unittest discover -s
   scripts/quant/tests -p "test_*.py"`, `node --test "academy/**/*.test.mjs"` — alle
   drei Runner, nicht nur den ersten.
5. **Bestehende Architektur respektieren** — siehe [§31](#31-do-not-break-these-rules).
   Kein Next.js-/FastAPI-Umbau ohne expliziten, separaten Beschluss.
6. **Nur den aktuellen Decision Gate bearbeiten** (siehe [§34](#34-decision-gates)),
   keine bereits abgeschlossene Phase wiederholen, kein noch nicht beauftragtes Gate
   vorwegnehmen (kein Phase 4B, kein Technical Intelligence V1.5, kein neuer Provider
   ohne ausdrücklichen Auftrag).
7. **Ein FAIL bleibt ein FAIL**, bis eine externe Datenquelle es tatsächlich löst — SEC
   Gate B ist ein strukturelles Merkmal der Quelle, keine Formulierungsfrage.
8. **Tests vor und nach jeder Änderung laufen lassen.** `verify-quant-data.mjs` für den
   Mock-Pfad, `run-sec-gates.mjs` für SEC, die Anti-Repainting-Tests
   (`technical-elliott.test.mjs` E6 u. a.) für Technical Intelligence — keiner davon
   ist optional.
9. **Abschlussbericht erzeugen**, wie es PR #43/#46/#48/#49 vorgemacht haben (jede
   dieser PR-Beschreibungen ist selbst ein Muster für Ehrlichkeit über Grenzen und
   offene Punkte).
10. **Diese Master-Datei nach wesentlichen Meilensteinen aktualisieren** — insbesondere
    nach jedem Decision Gate, jeder neuen Provider-Anbindung, jedem großen Merge. Nicht
    erst, wenn vier PRs Rückstand aufgelaufen sind.

---

## 36. Changelog

Ausschließlich aus `git log` rekonstruiert — keine erfundenen Daten.

| Datum | Commit | Ereignis |
|---|---|---|
| 2026-09-06 | `2c865d6` | Quant V1 Phase 0–1: Audit, kanonisches Datenmodell, Provider-Abstraktion, Query/VUQL/Strategy |
| 2026-09-06 | `fec274b` | Quant V1 Phase 2: Mock Core — deterministisches synthetisches Universum, MockProvider |
| 2026-09-06 | `0a9706b` | Quant V1 Phase 3: Quant Core — Normalisierung, Faktoren, VU Quant Score, Radar |
| 2026-09-06 | `eb54a61` | Quant V1 Phase 4: Discovery — Quant Home, Ranking, Screener mit VUQL, Stock Detail, Radar |
| 2026-09-06 | `0d76fb0` | Quant V1 Phase 5+6: Strategy Engine UI, Backtest Engine, Trust Score |
| 2026-09-07 | `cccdbe2` | Quant V1 Phase 7+8: AI Foundation, Watchlist Intelligence |
| 2026-09-07 | `ad3849b` | Quant V1 Phase 9: Quality Pass, Abschlussbericht |
| 2026-09-07 | `e26c579` | Quant V1: Dokumentation, Provider-Vorbereitung, CI |
| 2026-09-07 | `2b08575` | Phase 2: Providerschicht, Schlüsselsicherheit, Auditkorrekturen |
| 2026-09-07 | `bafb625` | Phase 2: Datenherkunft in der Oberfläche, Marktdatenseite |
| 2026-09-07 | `d74a567` | Phase 2: Prüfstand, CI-Erweiterung, sieben Dokumente |
| 2026-09-07 | `eaaa956` | Phase 2: Zeitreihenantwort ohne `values` als Fehler behandelt |
| 2026-09-07 | `3316134` | Phase 3 §2: Zentrale Bereinigungssemantik — MEDIUM-7 behoben |
| 2026-09-07 | `e9cbecc` | Phase 3 §5–§13: Qualifikationsprüfstand, drei Gate-Tests |
| 2026-09-07 | `6c43ba1` | Phase 3 §18–§20: Vorrangregeln, Qualitätswert, Datenstandskennung |
| 2026-09-07 | `0e32110` | Phase 3 §25: sieben Dokumente, Paritätsprüfung, CI-Erweiterung |
| 2026-09-07 | `410df85` | Release-Vorbereitung: unbeabsichtigte Dashboard-Änderung zurückgenommen (`technical_scenarios.json`) |
| 2026-09-07 10:59 UTC | `0499868` | **Merge PR #43** „Vision Universe® Quant & AI — V1 Preview" nach `main` |
| 2026-09-07 | `9878cdc` | `main`, + reguläre `chore: update dashboard news` |
| 2026-09-07 ~18:00 UTC | `da69113` | **Merge PR #45** — Project Master Documentation, Erstfassung |
| 2026-09-07 18:37 UTC | `bfccd50` | **Merge PR #47** — SEC-Fundamentals-Workflow-Datei auf `main` registriert (noch keine Pipeline) |
| 2026-09-08 04:03 UTC | `1a6e49e` | **Merge PR #46** — Phase 4A Tiingo Market Data PoC: Adapter, echte Laufzeitvalidierung, 332/332 Tests |
| 2026-09-08 05:02 UTC | `7630e6c` | **Merge PR #48** — SEC Financial Data Core: 14-Modul-Python-Pipeline, Adapter, Gate A/C `RUNTIME_VERIFIED`, Gate B FAIL |
| 2026-09-08 05:32 UTC | `252dec5` | **Merge PR #49** — Technical Intelligence V1 + Elliott Wave Beta: 27 Engine-Module, 444/444 JS + 249/249 Python + 8/8 Academy |

**SEC-Workstream:** implementiert seit PR #48 — siehe [§21](#21-sec-financial-data-core).
**Tiingo-Workstream:** implementiert seit PR #46 — siehe [§22](#22-tiingo-market-data).
**Technical-Intelligence-Workstream:** implementiert seit PR #49 — siehe
[§23](#23-technical-intelligence--elliott-wave).

---

## 37. Master Document Changelog

Nur strategisch relevante Änderungen an dieser Datei selbst — kein Commit-Tagebuch.

| Datum | Änderung |
|---|---|
| 2026-09-07 | Erstfassung (PR #45): Quant-Phase-1–3 synchronisiert, PR #43 dokumentiert, Provider-Architektur, PIT/Trust-Score/AI/VUQL, Known Limitations, DO-NOT-BREAK-Regeln, Roadmap, Decision Gates. |
| 2026-09-08 | **Vollständiger Audit gegen `origin/main @ 252dec5`** (dieser Durchgang): vier gemergte PRs (#46 Tiingo, #47 SEC-Workflow-Registrierung, #48 SEC Financial Data Core, #49 Technical Intelligence + Elliott Wave) nachgezogen, die die Datei zuvor nicht kannte oder — im Fall von §21 — nur teilweise und mit einem veralteten „noch nicht gemerged"-Stand beschrieb. Im Einzelnen: §21 (SEC) und §22 (Tiingo) vollständig neu geschrieben — beide waren als „nicht begonnen" dokumentiert, sind aber tatsächlich implementiert und laufzeitgeprüft; §23 (Technical Intelligence & Elliott Wave) von „kein Code" auf den tatsächlichen, umfangreichen Implementierungsstand korrigiert; Testinventar neu gemessen statt übernommen (Node 444, SEC-Python 249, Academy 8 — alle drei Runner selbst ausgeführt); §32-Statustabelle auf das neue neunteilige Statussystem umgestellt; §33 Roadmap konsolidiert (erledigte Punkte entfernt, neue BLOCKED/EXTERNAL-DEPENDENCY-Kategorie ergänzt); §34 Decision Gates aktualisiert (Gates 1–2 teilweise beantwortet, Gates 7–8 neu); §19 Provider Abstraction um SEC-/Tiingo-Adapter und das achte Provider-Profil ergänzt; §31 DO-NOT-BREAK-Regeln um fünf neue, aus dieser Phase gelernte Regeln erweitert (Feature-Gate ≠ Freigabe, Adapter-Interface-Ehrlichkeit, FAIL bleibt FAIL, Company-Agnostik erzwungen, Anti-Repainting-Tests sind Pflicht); neue Source-of-Truth-Regeln direkt nach dem Dateikopf ergänzt. Zwei dokumentierte, weiterhin ungelöste Diskrepanzen aus der Vorfassung (`VU_BACKTEST_TRUST_SCORE.md` Hard-Cap-Lücke) unverändert übernommen, da sie weiterhin zutreffen. |

---

*Ende der Master-Dokumentation. Bei Widersprüchen zwischen diesem Dokument und dem
tatsächlichen Repository-Stand gilt immer: Code + Tests + Git vor diesem Dokument. Bitte
diese Datei nach jeder wesentlichen Änderung — insbesondere nach jedem großen
Merge — aktualisieren.*
