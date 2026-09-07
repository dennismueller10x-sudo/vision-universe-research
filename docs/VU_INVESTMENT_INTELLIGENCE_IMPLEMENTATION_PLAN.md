# VU INVESTMENT INTELLIGENCE SYSTEM — Implementation Plan (Phase 0 Audit)

Grundlage: `Vision Universe® Quant & AI — Market Research, Quant Architecture & Product
Masterplan` (Research-Stand 6. September 2026) + Codex Master Build Prompt V1.

North Star: **FROM INVESTMENT IDEA TO EVIDENCE**. Vision Universe ist Investment
Intelligence Layer, der Broker bleibt Execution Layer. Keine Broker-Integration,
keine Orderausführung, kein autonomes AI-Trading in dieser V1.

---

## A. Repository Audit — was existiert bereits?

### A.1 Technische Grundlage

| Aspekt | Befund |
|---|---|
| Framework | **Keines.** Statisches HTML/CSS/JS, ausgeliefert über GitHub Pages (`CNAME` → `research.visionuniverse.de`) |
| Build-Pipeline | **Keine.** Kein `package.json`, kein `tsconfig.json`, kein Bundler, keine `node_modules` |
| Routing | Verzeichnisbasiert (`/macro/`, `/dashboard/research/`) + Hash-Routing innerhalb einer Seite (`macro/app.js`) |
| Modulformat | UMD-artige IIFE (`(function(global){…})(window)`), Engines zusätzlich `module.exports` → lauffähig in Browser **und** Node |
| Tests | `node --test <file>.test.mjs` mit Node-`node:test`, kein externes Framework (`academy/engines/financial-model-engine.test.mjs`) |
| Datenfluss | Python/Node-Skript in `scripts/**` → statisches JSON in `<produkt>/data/**` → Frontend liest ausschließlich JSON |
| CI | 9 Workflows in `.github/workflows/`: HTML-Syntax-Validierung, Marker-Grep, JSON-Validierung, Logik-Unit-Tests, Daten-Refresh, Navigations-Sync |
| Deployment | GitHub Pages vom Default-Branch, keine Server-Runtime |

### A.2 Bestehende Produktbereiche

| Verzeichnis | Inhalt |
|---|---|
| `/` (`index.html`) | Landingpage |
| `dashboard/` | Aktien-Dashboard: Research, Charting, Discover, News, Watchlist; Daten in `dashboard/data/*.json` (market, fundamentals, fundamental_scores, technical_scores, scenarios, analyst_ratings, backtest_results, research_profiles); Universe in `dashboard/config/universe.json` (11 Aktien + 2 Benchmarks) |
| `macro/` | Macro Regime Dashboard, ~52 Indikatoren; **sauberste Referenzarchitektur**: 4 Ebenen (UI / `calc.js` / Rohdaten / Redaktion), `ARCHITECTURE.md`, Monats-Archive für Nachvollziehbarkeit |
| `academy/` | Experience System: Shell + Engines + Registries; Engine mit Node-Tests |
| `hedgefonds/` | 13F-Auswertung aus SEC EDGAR (`scripts/hedgefonds/fetch_edgar_data.py`) |
| `etf/`, `analysten/`, `guide/`, `budget/`, `news/`, `magazin/`, `morning/`, `reports/xpeng/` | eigenständige Seiten/Produkte |
| `assets/` | `site-navigation.js` (Shadow-DOM Web Component, zentrale Menüliste), `site-navigation.css`, Logo |
| `scripts/` | `sync-navigation.mjs`, Dashboard-Fetcher (Python), Morning-Generator (Node) |

### A.3 Design-System (bestehende CI)

Aus `macro/styles.css` (aktuellste, vollständigste Fassung) und `dashboard/v2.css`:

```
--ink:#111114   --muted:#77777d   --muted-2:#9a9aa0   --line:#e7e7e4
--surface:#f7f7f5  --surface-2:#f1f1ef  --bg:#ffffff
--green:#14b85a  --red:#d84d43  --yellow:#c9930d  --blue:#3578d4  --purple:#7057d9
--radius-sm:10px --radius:16px --radius-lg:24px
Inter (Google Fonts), font-variant-numeric: tabular-nums, color-scheme: light
```

Charakter: hell, ruhig, viel Weißraum, Akzentfarbe nur als Signal, bewusst kein
Terminal-/Monospace-Look. Charts werden bereits durchgängig als handgeschriebenes,
CI-konformes SVG gerendert (`dashboard/app.js`, `macro/app.js`,
`academy/shell/experience-shell.js`).

### A.4 Vorhandene quant-nahe Bausteine

- `dashboard/data/fundamental_scores.json`: `fundamental_score_beta` + `quality/growth/value/risk` (0–100) für 11 Ticker, `data_as_of` je Symbol — **konzeptioneller Vorläufer des VU Quant Score**, aber ohne Faktor-Zerlegung, ohne Coverage, ohne Methodology-Version, ohne Historie, ohne Peer-Normalisierung.
- `dashboard/data/backtest_results.json`: Setup-Statistik einer einzelnen Regel (`schema_version: 0.1-baseline`), kein Portfolio-Backtest, keine PIT-Semantik, keine Kosten.
- `macro/calc.js`: bereits saubere, DOM-freie Berechnungsschicht mit zentraler Config (`macro/data/config.json`) — **Vorbild für die Quant Engine**.
- `academy/engines/*`: reine Engine + Node-Tests — **Vorbild für Engine-Testing**.

---

## B. Gap Analysis — was fehlt für Quant & AI?

| Baustein | Status | Lücke |
|---|---|---|
| Canonical Financial Data Model | ✗ | Kein `Security`/`PriceBar`/`FundamentalFact`-Schema; Daten sind je Produkt ad hoc geformt |
| Point-in-Time-Zeitachsen | ✗ | `data_as_of` existiert punktuell, aber kein `periodEnd`/`filedAt`/`availableAt`/`revisionId` |
| Provider Abstraction | ✗ | Python-Fetcher schreiben direkt vendor-nahe JSON-Strukturen |
| Data Provenance | teilweise | Quelle je Makro-Indikator vorhanden, aber kein maschinenlesbarer Provenance-Record je Datenpunkt |
| Faktor-Engine (Quality/Momentum/Value/Growth/Risk) | ✗ | Scores sind Ergebniswerte ohne nachvollziehbare Komponenten |
| Normalisierung / Peer Groups / Winsorization | ✗ | fehlt vollständig |
| Coverage & Confidence | ✗ | fehlende Daten sind heute unsichtbar |
| Methodology Versioning | ✗ | keine Versionierung der Berechnungsmethodik |
| Score History / Velocity / Radar | ✗ | keine Snapshot-Historie |
| Screener Engine mit Query-AST | ✗ | Filter existieren nur als UI-Zustand in `dashboard/discover` |
| VUQL | ✗ | existiert nicht |
| Strategy Schema + Versionierung + Lineage | ✗ | existiert nicht |
| Portfolio-Backtest mit PIT/Kosten/Delistings | ✗ | nur Einzel-Setup-Statistik |
| Backtest Trust Score | ✗ | existiert nicht |
| Reproduction Hash | ✗ | existiert nicht |
| AI Layer (Provider, Tool Registry, NL→AST) | ✗ | existiert nicht |
| Watchlist Intelligence (Deltas/Events) | teilweise | `dashboard/watchlist` zeigt Zustände, keine Veränderungen |
| Mock-Kennzeichnung | ✗ | bisher nur echte Daten, daher nie nötig |

**Kernproblem der bestehenden Struktur für Quant:** Es gibt keine gemeinsame
Wahrheitsschicht. Jedes Produktverzeichnis hat seine eigene Datenform. Ein Quant Score,
ein Screener und ein Backtest müssen aber zwingend dieselben Daten, dieselbe
Faktordefinition und dieselbe Query-Engine benutzen — sonst driften Screener-Ergebnis,
Score-Anzeige und Backtest auseinander.

---

## C. Proposed Architecture

### C.1 Leitentscheidung: Erweiterung statt Rewrite

Die im Research vorgeschlagene Zielarchitektur (Next.js + FastAPI + PostgreSQL + Parquet +
Redis) ist die **Zielarchitektur für den späteren produktiven Multi-User-Betrieb mit echten
Daten**. Sie ist ausdrücklich **nicht** die Architektur, in die dieses Repository jetzt
umgebaut wird:

- Das Repository hat heute keine Build-Pipeline und keine Server-Runtime. Ein Next.js-/
  FastAPI-Umbau wäre ein Rewrite aller 12 bestehenden, funktionierenden Produktbereiche.
- Master Build Prompt §1/§64/§68: bestehende Architektur zuerst, keine Parallelarchitektur,
  kein unnötiger Rewrite, bestehende CI verwenden.
- V1 läuft ausschließlich auf Mock-Daten (§7). Für deterministisch erzeugbare Mock-Daten
  wird weder eine Datenbank noch ein Python-Service benötigt.

**Also:** Das Investment Intelligence System wird als neuer, eigenständiger
Produktbereich `quant/` gebaut — nach exakt demselben Muster wie `macro/` und `academy/`,
mit derselben Schichtentrennung, denselben Design-Tokens, derselben Navigation, demselben
Testrunner. Die Schichten des Research-Modells werden dabei **eins zu eins abgebildet**,
nur mit anderer Laufzeit-Technologie:

| Research-Schicht | Umsetzung in diesem Repository |
|---|---|
| Provider Abstraction | `quant/engines/provider.js` (Interfaces + Registry) |
| Mock / Twelve Data / Intrinio / EODHD | `quant/engines/mock-provider.js`, `providers/*/README.md` |
| Financial Data Core | `quant/engines/schema.js` (kanonisches Modell + Validatoren) |
| Quant Engine | `quant/engines/factors.js`, `normalization.js`, `quant-score.js`, `radar.js` |
| Strategy Engine | `quant/engines/strategy.js` |
| Backtest Engine | `quant/engines/backtest.js`, `trust-score.js` |
| AI Research Layer | `quant/engines/ai-provider.js`, `ai-tools.js` |
| Product API (`/v1/...`) | `quant/api/client.js` — dieselben Contracts als Funktionsaufrufe |
| Product Layer / Client | `quant/**/index.html` + `quant/ui/*` |

Die Grenze zwischen Product API und Engines ist bewusst so geschnitten, dass
`quant/api/client.js` später gegen `fetch('/v1/...')` gegen einen echten HTTP-Service
ausgetauscht werden kann, **ohne dass eine einzige Seite angefasst werden muss**.

### C.2 Schichtenmodell (verbindlich)

```
quant/**/index.html + quant/ui/*        PRODUCT LAYER (nur Darstellung)
            │
quant/api/client.js                     PRODUCT API (v1 Contracts)
            │
quant/engines/ai-*.js                   AI RESEARCH LAYER (Interpretation/Orchestrierung)
            │
quant/engines/{factors,quant-score,     DOMAIN ENGINES
   strategy,radar,query,vuql}.js
            │
quant/engines/backtest.js               BACKTEST ENGINE
            │
quant/engines/schema.js                 FINANCIAL DATA CORE
            │
quant/engines/provider.js               PROVIDER ABSTRACTION
            │
quant/engines/mock-provider.js          Mock (V1) / später Twelve Data, Intrinio, EODHD
```

**Verbotenes Muster (§9):** Vendor-Felder oberhalb der Adapter-Schicht. Ein automatischer
Test scannt Product Layer, Engines und Seiten auf Vendor-Namen.

### C.3 AI ist nicht die Wahrheitsschicht (§5)

`ai-provider.js` liefert ausschließlich Interpretation (NL → Query-/Strategy-AST) und
Erklärung. Jede Zahl kommt aus einem registrierten Tool in `ai-tools.js`, das seinerseits
nur `quant/api/client.js` aufruft. Kein SQL, kein Datenbankzugriff, keine frei erfundenen
Kennzahlen. Fehlt ein Tool-Ergebnis, lautet die Antwort `data unavailable`.

### C.4 Statische Route-Contracts

GitHub Pages kann keine dynamischen Segmente. Die kanonischen Routen des Master Prompts
werden deshalb wie folgt auf statische Pfade abgebildet (dokumentiert in
`VU_ARCHITECTURE.md`); die kanonische Form bleibt im Code als Konstante erhalten, damit
ein späterer Server-Renderer sie unverändert übernehmen kann:

| Kanonische Route | Statischer Pfad |
|---|---|
| `/quant` | `/quant/` |
| `/quant/ranking` | `/quant/ranking/` |
| `/screener` | `/quant/screener/` |
| `/stocks/{ticker}/quant` | `/quant/stock/?ticker={ticker}` |
| `/strategies` | `/quant/strategies/` |
| `/strategies/builder` | `/quant/strategies/builder/` |
| `/backtests/{id}` | `/quant/backtests/?id={id}` |
| `/ai` | `/quant/ai/` |
| `/watchlist` | `/quant/watchlist/` |

### C.5 Mock-Daten: deterministische Generierung statt Riesen-JSON

500+ Securities × 20 Jahre Tagesdaten sind als JSON im Repository nicht sinnvoll
(dreistelliger MB-Bereich). Stattdessen:

- `quant/engines/mock-generator.js` erzeugt das gesamte Universum **deterministisch aus
  einem festen Seed** (Mulberry32-PRNG, typisierte Arrays für Preisreihen). Gleicher Seed →
  bitgleiche Daten in Browser und Node. Das ist die Voraussetzung dafür, dass ein
  `reproductionHash` überhaupt etwas wert ist.
- `scripts/quant/build-quant-data.mjs` präkomputiert daraus die Tagesartefakte
  (`quant/data/*.json`: Scores, Rankings, Radar, Screener-Feld-Katalog, Historie) — das ist
  die in §89/§90 geforderte Precomputation-Architektur, umgesetzt im Muster der bestehenden
  Repository-Pipelines (Skript → JSON → statisches Frontend).
- Backtests generieren die Preis-/Fundamentalpanels zur Laufzeit aus demselben Generator.

### C.6 Bewusste, dokumentierte Abweichungen vom Master Prompt

| § | Vorgabe | Umsetzung | Begründung |
|---|---|---|---|
| 35/68 | Python, Polars, NumPy, DuckDB, FastAPI, PostgreSQL | JavaScript-Engines im bestehenden UMD-Muster | §1/§68 haben Vorrang: „Passe dich zuerst dem bestehenden Repo an." Repository hat keine Server-Runtime; ein Python-Service wäre auf GitHub Pages nicht erreichbar und würde eine Parallelarchitektur erzeugen. Die Engine-Schnitte sind identisch zum Research-Modell und später 1:1 nach Python portierbar. |
| 67 | „Hochwertige bestehende Chart-Library, nicht selbst implementieren" | Ein **gemeinsames** Chart-Modul `quant/ui/charts.js` im bestehenden SVG-Stil | Kein Bundler ⇒ Library nur per CDN, was eine Laufzeit-Fremdabhängigkeit und einen Stilbruch zur bestehenden CI einführt. Der Kern der Vorgabe („nicht pro Seite neu erfinden") wird durch **ein** geteiltes Modul erfüllt; ein Austausch gegen eine Library ist lokal auf diese Datei begrenzt. |
| 71 | Docker Compose | nicht eingeführt | Es gibt keine Services zu orchestrieren (kein Server, keine DB). „Bestehendes Setup respektieren." |

---

## D. Migration Strategy

**Nicht angefasst werden:** `dashboard/`, `macro/`, `academy/`, `hedgefonds/`, `etf/`,
`analysten/`, `guide/`, `budget/`, `news/`, `magazin/`, `morning/`, `reports/`, alle
bestehenden `scripts/` und Workflows. Keine Datenmigration, kein Datenverlust.

**Angefasst wird:**

1. `assets/site-navigation.js` — **eine Zeile**: neuer Menüpunkt `Quant`. (Exakt das
   Vorgehen der Academy-Phase-1.)
2. Neues Verzeichnis `quant/` (gesamter neuer Produktbereich).
3. Neues Verzeichnis `providers/` (Adapter-Stubs + READMEs, ohne Laufzeitabhängigkeit).
4. Neues Skript `scripts/quant/build-quant-data.mjs`.
5. Neuer Workflow `.github/workflows/quant-ci.yml` im Muster der bestehenden CI-Workflows.
6. Neue Dokumente unter `docs/`.

**Bewusst keine Konsolidierung** von `dashboard/data/fundamental_scores.json` in die neue
Engine: Der bestehende Dashboard-Score arbeitet auf 11 echten Titeln mit echten Daten, der
VU Quant Score auf 511 synthetischen. Eine Zusammenführung wäre erst nach Anschluss echter
Provider sinnvoll und ist als späterer Schritt im Report vermerkt.

---

## E. Build Phases

| Phase | Inhalt | Abschlusskriterium |
|---|---|---|
| 0 | Audit + dieser Plan | Dokument liegt vor |
| 1 | Foundation: `schema.js`, `provider.js`, `hash.js`, Methodology-Configs, `strategy.js`, `query.js` (AST), `vuql.js` | Schema-/Strategy-/VUQL-Tests grün |
| 2 | Mock Core: `mock-generator.js` (500 Securities + 11 Edge-Fixtures, Preise, PIT-Fundamentals, Corporate Actions), `mock-provider.js` | Provider-Tests grün, PIT-Fixtures verhalten sich korrekt |
| 3 | Quant Core: `normalization.js`, `factors.js`, `quant-score.js`, Snapshots + `radar.js` | Contributions summieren zum Composite, Coverage-Logik greift |
| 4 | Discovery: Quant Home, Ranking, Screener, Stock Detail, Radar + `quant/ui/*` + Build-Skript | Seiten rendern aus präkomputiertem JSON |
| 5 | Strategy Engine: Library (5 Strategien), Builder, Versionierung, Lineage | Änderung erzeugt neue Version, Lineage sichtbar |
| 6 | Backtest Engine: PIT, Execution, Kosten, Portfolio, Metriken, Trust Score, Current Holdings | PIT-/Delisting-/Restatement-/Kosten-Tests grün |
| 7 | AI Foundation: `ai-provider.js`, `MockAIProvider`, Tool Registry, NL→AST, AI-Seite | AI kann nur registrierte Tools nutzen, Interpretation wird angezeigt |
| 8 | Watchlist Intelligence: Events, Deltas, Seite | Änderungen statt Zustände |
| 9 | Quality Pass: Tests, Responsive, Empty/Error States, Doku, CI | Alle Acceptance Tests (§76) grün |

Nach jeder Phase: Tests + JSON-/HTML-Validierung ausführen, `docs/VU_BUILD_STATUS.md`
aktualisieren.

---

## F. Risks

| Risiko | Bewertung | Gegenmaßnahme |
|---|---|---|
| **Mock-Daten werden für echte Investmentdaten gehalten** | existenziell (Reputation/Regulatorik) | IDs `VU0001…`, `isMock: true` in jedem Record, permanentes Demo-Banner auf jeder Seite, keine realen Firmennamen |
| **Look-Ahead Bias im Backtest** | existenziell | `availableAt <= decisionTime` als einzige Zugriffsfunktion; Fixtures `MOCK_RESTATEMENT`, `MOCK_FUTURE_DATA_LEAK`; Tests, die den Bias aktiv provozieren |
| **Survivorship Bias** | existenziell | Delistings im historischen Universum; `MOCK_DELISTED`-Fixture + Test |
| Browser-Performance beim Backtest (2,5 Mio. Preispunkte) | hoch | Float32-Panels, Generierung nur einmal je Session, Precomputation für alle Nicht-Backtest-Seiten |
| Score-Drift zwischen präkomputiertem JSON und Live-Engine | hoch | Beide leiten aus demselben deterministischen Generator + derselben Engine ab; CI prüft die Übereinstimmung |
| Repository-Größe durch generierte Daten | mittel | Nur Tagesartefakte als JSON, keine Rohpreisreihen |
| Regulatorische Sprache | hoch | Zentraler Vokabular-Guard + Test gegen `BUY`/`SELL`/`Kaufen`/`Kursziel` in allen Quant-Seiten |
| Aufblähen der Navigation | niedrig | Ein einziger neuer Menüpunkt |
| Kein Build-Step ⇒ kein TypeScript | mittel | Typisierung über JSDoc + Laufzeit-Validatoren in `schema.js`; Validierung an allen Query-/Strategy-Eingängen (§88) |

---

## G. Files To Create / Modify

### Zu ändern (1 Datei)

- `assets/site-navigation.js` — Menüpunkt `Quant` ergänzen.

### Zu erstellen

**Engines** (`quant/engines/`): `hash.js`, `schema.js`, `provider.js`, `mock-generator.js`,
`mock-provider.js`, `normalization.js`, `factors.js`, `quant-score.js`, `radar.js`,
`query.js`, `vuql.js`, `strategy.js`, `backtest.js`, `trust-score.js`, `ai-provider.js`,
`ai-tools.js`, `catalog.js` (Feld-/Metrik-Katalog als gemeinsame Ontologie).

**Methodology** (`quant/methodology/`): `quant-v1.json`, `backtest-v1.json`,
`trust-score-v1.json`, `strategies-v1.json`.

**Product API** (`quant/api/`): `client.js`.

**UI** (`quant/ui/`): `quant.css`, `shell.js`, `charts.js`, `components.js`.

**Seiten** (`quant/`): `index.html`+`app.js`, `ranking/`, `screener/`, `stock/`, `radar/`,
`strategies/`, `strategies/builder/`, `backtests/`, `ai/`, `watchlist/`.

**Daten** (`quant/data/`): generiert durch `scripts/quant/build-quant-data.mjs`.

**Tests** (`quant/tests/`): `normalization.test.mjs`, `factors.test.mjs`,
`quant-score.test.mjs`, `query.test.mjs`, `vuql.test.mjs`, `strategy.test.mjs`,
`backtest.test.mjs`, `point-in-time.test.mjs`, `trust-score.test.mjs`, `ai.test.mjs`,
`provider.test.mjs`, `acceptance.test.mjs` (die 22 Kriterien aus §76).

**Provider-Stubs** (`providers/`): `mock/README.md`, `twelve-data/README.md`,
`intrinio/README.md`, `eodhd/README.md` (Zweck, Daten, ENV-Variablen, Mapping, offene
Lizenz-/PIT-Prüfpunkte — keine Preise, keine Laufzeitabhängigkeit).

**Skripte / CI**: `scripts/quant/build-quant-data.mjs`,
`.github/workflows/quant-ci.yml`.

**Dokumentation** (`docs/`): `VU_ARCHITECTURE.md`, `VU_FINANCIAL_DATA_MODEL.md`,
`VU_QUANT_METHODOLOGY.md`, `VU_BACKTEST_METHODOLOGY.md`, `VU_BACKTEST_TRUST_SCORE.md`,
`VU_STRATEGY_SCHEMA.md`, `VU_VUQL_SPEC.md`, `VU_AI_TOOL_ARCHITECTURE.md`,
`VU_PROVIDER_ARCHITECTURE.md`, `VU_MOCK_DATA.md`, `VU_API_INTEGRATION_GUIDE.md`,
`VU_BUILD_STATUS.md`, `VU_IMPLEMENTATION_REPORT.md`.

---

## H. Blocker

Keine. Es muss keine bestehende Architektur zerstört werden, es droht kein Datenverlust,
und alle Produktentscheidungen sind aus Research + Master Prompt ableitbar. Die
Umsetzung beginnt unmittelbar mit Phase 1.
