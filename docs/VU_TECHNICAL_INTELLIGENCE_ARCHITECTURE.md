# VU Technical Intelligence — Architektur (V1)

**Workstream:** `claude/technical-intelligence-v1` · Basis `origin/main` @ `da69113`
**Stand:** 7. September 2026 · Status: Checkpoint 0 → 10 (siehe `VU_TECHNICAL_PHASE1_REPORT.md`)

Fachliche Source of Truth: *VISION UNIVERSE® TECHNICAL INTELLIGENCE ENGINE — RESEARCH &
METHODOLOGY MASTER* (Research-Stand 7. September 2026). Technische Source of Truth des
Bestands: `VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md`.

---

## 1. Grundsatz

```
MARKET DATA → DETERMINISTIC / STATISTICAL ENGINES → STRUCTURED SIGNALS
           → SCENARIO ENGINE → EVIDENCE → RENDERING → AI EXPLANATION
```

AI ist nicht die Wahrheitsschicht. Kein LLM bestimmt Pivots, Wellen, Kursniveaus oder
Scores. Jede Zahl im Produkt stammt aus einem strukturierten, versionierten Engine-Objekt
mit Provenienz (`dataCutoff`, `dataVersion`, `engineVersion`, `methodologyVersion`,
`parametersHash`).

## 2. Repository-Audit (Checkpoint 0)

| Frage | Befund |
|---|---|
| Aktueller `main` | `da69113` (PR #45, Master-MD), 232/232 Tests grün (selbst nachgerechnet, 28 s) |
| Bestehende Quant-Architektur | statische Site, UMD-Engines in `quant/engines/`, `node --test`, keine Build-Pipeline |
| Provider-Abstraction | `provider.js` (7 Interfaces, Registry, Vendor-Leakage-Guard) — wird **wiederverwendet**, nicht dupliziert |
| Price Semantics | `price-semantics.js` + `methodology/price-adjustment-v1.json`: RAW / SPLIT_ADJUSTED / TOTAL_RETURN — wird wiederverwendet |
| Bar-Modell | `schema.js` `PriceBar`: `close` = RAW-Print, `adjustedClose` = TOTAL_RETURN. **Es gibt keine SPLIT_ADJUSTED-Reihe** → wird in `canonical-bars.js` aus RAW + Split-Corporate-Actions abgeleitet |
| Backtest Engine | `backtest.js` (PIT, availableAt ≤ decisionTime). Wird nicht angefasst; die Technical Engine übernimmt dieselbe Cutoff-Disziplin |
| Data Provenance | `hash.js` (FNV-1a, kanonisches JSON) — Basis für `dataHash`, `parametersHash`, `snapshotId` |
| Vorhandenes Technical Tool | `scripts/dashboard/calculate_technicals.py` + `calculate_scenarios.py` (Python, Dashboard-JSON). `technical_scenarios.json` ist leer (`awaiting_next_data_run`). Wird **nicht** verändert und **nicht** dupliziert; die Dashboard-Kette bleibt eigenständig |
| Chart-Komponenten | `quant/ui/charts.js` (SVG, Linien/Balken, tokenkonform). Wird um einen Technical-Renderer erweitert (`ui/technical-chart.js` registriert sich auf `QuantCharts`) |
| Tiingo | **kein Code in main** (nur `.env.example`-Platzhalter + Sperrlisteneintrag) → keine Tiingo-Abhängigkeit, kein zweiter Adapter |
| SEC | separater Branch, nicht in main → nicht verwendet |
| Reale Kurse | `dashboard/data/market_data.json` (Twelve Data, deklariert SPLIT_ADJUSTED, 13 Symbole, 2020-09 bis 2026-09, u. a. NVDA/MSFT/SPY/QQQ/AMZN/AMD). **Nicht** AAPL/TSLA |
| Tests-Regeln | Acceptance verbietet Vendor-Feldzugriffe und Formulierungen wie „Kursziel“, „BUY“, „SELL“ in UI-Code; jede Quant-Seite muss `ui/shell.js` + `vu-navigation` laden; kein `process.env` in Browser-Code (auch `quant/engines/`) |

**Dokumentierter Widerspruch (Master-MD §3 vs. Golden Test):** Die Master-MD legt fest,
dass `quant/` keine Daten aus `dashboard/` liest. Der Golden-Test (NVIDIA 5Y) braucht
reale Kurse. Lösung ohne Regelbruch im Frontend: ein **Build-Skript** (`scripts/technical/
build-technical-data.mjs`, Node) liest die Dashboard-Marktdaten einmalig, übersetzt sie in
CanonicalBars und schreibt sie nach `quant/data/technical/`. Das Frontend liest weiterhin
ausschließlich `quant/data/**`. Der Import ist vendor-neutral (generischer
„declared OHLCV“-Adapter, keine Vendor-Felder).

## 3. Pipeline

```
Provider Data (PriceBar / declared OHLCV)
  ↓  canonical-bars.js      Corporate Action Normalization, RAW | SPLIT_ADJUSTED | TOTAL_RETURN, dataVersion/dataHash
CanonicalBarSeries (columnar)
  ↓  timeframe.js           Exchange-Kalender-bewusste Aggregation 1D → 1W / 1M, Intraday-Policy (4h) versioniert
  ↓  feature-store.js       deterministische, versionierte Features (returns, ATR, MA, RSI, MACD, 52W, RVOL, …)
  ↓  pivot-engine.js        kausale, volatilitätsadaptive Multi-Scale-ZigZag-State-Machine (pivotTime ≠ confirmedAt)
  ↓  market-structure.js    HH/HL/LH/LL, BOS, Continuation, Failure (Structure Change), Range, Compression, Expansion
  ↓  trend / momentum / relative-strength / volatility / volume  (unabhängige Engines)
  ↓  support-resistance.js  gewichtetes 1-D-Clustering bestätigter Pivots + Gaps + Periodenlevel → PriceZone
  ↓  fibonacci.js           AUXILIARY — nur objektive Pivot-Anker, Level + Cluster
  ↓  scenario-engine.js     PRIMARY / ALTERNATIVE / BEAR mit Entry Zone, Invalidation, Target Zones, Evidence
  ↓  trade-setup.js         Risk, Reward, RR (Range), Setup Quality — nur mit vollständiger Kette
  ↓  confluence.js          Signal-Familien, kein Double Counting
  ↓  technical-score.js     VU Technical Opportunity Score 0–100 (Methodology Rank, keine Wahrscheinlichkeit)
  ↓  snapshot.js            unveränderliche AnalysisSnapshots, Evidence-Record-Modell (Projected vs. Actual)
  ↓  annotations.js         renderer-neutrale ChartAnnotation (Layer AUTO/STRUCTURE/TREND/…)
  ↓  elliott/*              V0 (Segment-Graph, Status, Degree-Mapping) + V1 Beta (Impulse, Zigzag, Historical Map, Projection)
  ↓  technical-analysis.js  Orchestrator: analyze(series, opts) → Bundle; analyzeAsOf(series, cutoff) → Walk-Forward
  ↓  scanner.js             dieselben Engines über ein Universum
  ↓  technical-tools.js     AI-Tool-Contracts (nur strukturierte Outputs)
  ↓  ui/technical-chart.js  Renderer (SVG) interpretiert ausschließlich ChartAnnotation
```

## 4. Module und Verantwortung

| Datei | Verantwortung | Repainting-Policy |
|---|---|---|
| `engines/technical/canonical-bars.js` | CanonicalBar-Modell, Serien, Adjustment, Hash, Cutoff-Slice | HISTORICAL_ONLY (Daten, nicht Signale) |
| `engines/technical/timeframe.js` | Timeframe-Registry, Aggregation, Kalender-/Session-Policy | NON_REPAINTING (letzte Bar DEVELOPING) |
| `engines/technical/feature-store.js` | Features, versioniert | NON_REPAINTING |
| `engines/technical/pivot-engine.js` | Multi-Scale-Pivots | CONFIRMS_WITH_DELAY (Extrem DEVELOPING bis Bestätigung) |
| `engines/technical/market-structure.js` | Strukturzustände, Events | CONFIRMS_WITH_DELAY |
| `engines/technical/trend-engine.js` … `volume-engine.js` | Zustandsengines | NON_REPAINTING |
| `engines/technical/support-resistance.js` | PriceZones | CAN_REVISE (Zonen wachsen mit neuen Touches; Historie im Snapshot fix) |
| `engines/technical/fibonacci.js` | FibLevel/FibCluster | CONFIRMS_WITH_DELAY (Anker = bestätigte Pivots) |
| `engines/technical/scenario-engine.js`, `trade-setup.js`, `confluence.js`, `technical-score.js` | Scenario-Layer | DEVELOPING (je Snapshot fix) |
| `engines/technical/snapshot.js`, `storage.js` | Snapshots, Evidence, Storage-Interface | immutable |
| `engines/technical/annotations.js` | ChartAnnotation | trägt Status je Objekt |
| `engines/technical/elliott/*` | Wave-Graph, Regeln, Kandidaten, Historical Map, Projection | CONFIRMED stabil, DEVELOPING/PROJECTED veränderlich |
| `engines/technical/technical-analysis.js` | Orchestrator, Provenienz, Walk-Forward | — |
| `engines/technical/scanner.js` | Universe Scan | — |
| `engines/technical/technical-tools.js` | AI-Tools | — |
| `engines/technical/strategy-packs.js` | Plugin-Architektur für spätere Rule Packs (Minervini/VCP/Darvas/Donchian/Stage) — nur Interface | — |
| `methodology/technical-v1.json`, `methodology/elliott-v1.json` | alle Parameter, Gewichte, Schwellen | versioniert |
| `ui/technical-chart.js`, `technical/index.html`, `technical/app.js` | Produktseite | — |
| `scripts/technical/build-technical-data.mjs` / `verify-technical-data.mjs` | Präkomputation + Drift-Prüfung | — |

## 5. Zeit- und Kausalitätsmodell

* **Bar-Index ≙ Zeit.** Alle Engines arbeiten auf Indizes einer kausal geordneten Serie.
  `analyzeAsOf(series, cutoff)` schneidet die Serie **vor** jeder Berechnung. Eine Engine
  sieht nie Bars nach dem Cutoff — nicht als Parameter, sondern durch Konstruktion.
* **pivotTime ≠ confirmedAt.** Ein Pivot trägt beide; Backtests/Walk-Forward filtern auf
  `confirmedIndex ≤ cutoff`.
* **Prefix-Eigenschaft (No-Look-Ahead-Test):** `hash(analyze(bars[0:T]))` ≡
  `hash(analyzeAsOf(bars[0:T+k], T))` — bit-identisch.
* **displayWindow ≠ analysisLookback.** Die UI zeigt 5Y; die Analyse nutzt die gesamte
  verfügbare Historie (`analysisLookback: "MAX"`).

## 6. Speicher- und Skalierungsmodell

* Präkomputiert (EOD, Build/CI): Features, Pivots, Struktur, Engine-Zustände, Score,
  einfache Szenarien, Annotationen, Elliott-Beta-Ergebnis für Referenztitel, Universe-Scan.
* On demand (Browser): Layer-Wechsel, Rendering, alternative Counts (bereits im Bundle).
* Storage-Interface (`storage.js`): `SnapshotStore { put, get, list, latestFor }` —
  `MemoryStore` (Browser/Tests), `JsonFileStore` (Node/CI). DuckDB/Parquet/PostgreSQL/
  Object Storage später hinter demselben Interface. Engines kennen kein Storage.

## 7. Nicht in V1 (Architektur-Erweiterungspunkte vorgesehen)

W-X-Y-X-Z, Diagonals/Triangles/Flats, ML-Ranking, Probability Claims, Minervini/VCP/
Darvas/Wyckoff-Produktions-Engines, Volume Profile, AVWAP, Chart-Pattern-Sammlung,
Realtime, Public-Tiingo-Display.
