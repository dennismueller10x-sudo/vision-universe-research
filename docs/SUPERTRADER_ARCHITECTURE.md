# SUPERTRADER — Architektur, Agent-Graph und Zielzustand

Route: `/supertrader/` · Registry `supertrader-registry-1.0.0` · Build `supertrader-build-1.0.0`

> See how great strategies think. Test what would have happened. Follow what is happening now.
> SIMPLE ON THE SURFACE. PROFESSIONAL UNDERNEATH.

## 1. Architekturentscheidung

Supertrader ist ein eigenständiges Produkt. Es teilt mit dem Rest der Seite nur die globale
Navigation (`/assets/site-navigation.*`, unverändert eingebunden) und die Schrift.

```
bestehende Discovery-Datenarchitektur (unverändert)
  → kanonische Consumer-/Product-Artefakte (read-only)
      discover/data/stock-index/US_REAL.json            Produktuniversum
      discover/data/stocks/US_REAL/<SYM>.json           Kennzahlen, Fundamentals (Anzeige)
      quant/data/product/technical-signals-v1/*.json.gz Tages-OHLCV (~1 Jahr), split-adjustiert
      quant/data/market/discover-series-long/ref_*.json Wochenschlusskurse (lange Historie)
      quant/data/market/multi-asset/series/SPY.json     Benchmark
      quant/data/product/market-regime-v1.json          Marktregime
      quant/data/market/freshness/health.json           Sitzung / Frische
      quant/data/market/intraday/index.json             letzter Kurs (nur Anzeige, Strategy Lens)
      quant/data/product/sic-peer-taxonomy-v1.json      SIC-Klassifikation
  → scripts/supertrader/build.mjs (Regeln, Lifecycle, Gates)
  → supertrader/data/*.json (Registry, Signale, Ledger, Backtests, Abdeckung, Quellen)
  → supertrader/ (Produktoberfläche)
```

- **Keine neue Datenpipeline**, keine zweite Fundamentals-Normalisierung, keine zweite Source of
  Truth: Supertrader rechnet ausschließlich Strategie-Regeln auf bereits veröffentlichten Reihen.
- **Keine neuen Secrets, Anbieter oder Kosten.** Der tägliche Lauf liest committete Artefakte.
- **Keine öffentliche PIT-/R2-API.** R2 wird nicht berührt.
- **Charts** laden dieselben kanonischen Artefakte wie Discovery/Quant, mit demselben
  Lademechanismus (`fetch` + `DecompressionStream`, wie `QuantShell.loadCompressedJSON`).
  Kursdaten werden nicht kopiert. Gleitende Durchschnitte werden zur Anzeige aus diesen Balken
  berechnet (wie `discover/engines/indicators.js`).
- **Realtime** nur dort, wo Discovery sie bereits sicher ausliefert: die Strategy Lens zeigt den
  letzten IEX-Kurs aus `intraday/index.json` mit dessen `freshnessState`. Signale bleiben auf
  Tagesschlussbasis; bei geschlossenem Markt wird der letzte vollständige Handelstag angezeigt.
- **Discovery und Quant 2.0 bleiben unverändert** — erzwungen durch
  `scripts/supertrader/guard-protected-paths.mjs` (Gate A in CI).

## 2. Datenrealität (gemessen, nicht angenommen)

`supertrader/data/coverage.json` wird bei jedem Lauf neu gemessen. Stand 28.09.2026:

| Feld | Befund | Folge |
|---|---|---|
| Tages-OHLCV öffentlich | ~1,07 Jahre, 5.079 Titel | Live-Signale möglich; Backtest-Historie unzureichend |
| Wochenschlusskurse | Median ~19,8 Jahre, ohne Volumen | Weinstein-Klassifikation möglich; Volumenregel nur im Tagesfenster prüfbar |
| Intraday | 2 Sitzungen, 5 Min., nur Schlusskurse | ORH-Varianten `DATA_COVERAGE_PENDING` |
| Survivorship-Kontrolle | `pit_gates.survivorshipBiasControls = false` | Kein Backtest besteht Gate E |
| Historische Indexzugehörigkeit | 2 Stichtage | Gate `UNIVERSE_PIT` offen |
| PIT-Revisionshistorie | 5 Titel | Greenblatt-Backtest nicht PIT-fähig |
| Greenblatt-Pflichtfelder | Umlaufvermögen, kurzfr. Verbindlichkeiten, Sachanlagen fehlen | Kein Magic-Formula-Ranking |

## 3. Strategy Engine

`scripts/supertrader/engine/` — reine, kausale Funktionen. **Derselbe Simulator** erzeugt die
Live-Signalhistorie (ein Tag pro Lauf) und die Trades eines Backtests.

- `indicators.mjs` — SMA, ADR (Kullamägi-Definition), ATR, 52-Wochen-Hoch/-Tief, Renditen, Perzentile
- `lifecycle.mjs` — `DISCOVERED → WATCH → SETUP → ENTRY_READY → TRIGGERED → ACTIVE → WARNING → EXIT → CLOSED`, `INVALIDATED`; unzulässige Übergänge werfen
- `execution.mjs` — Stop-Buy `max(Trigger, Open)`, Stop-Loss `min(Stop, Open)`, Schlusskurs-Entscheidung zur nächsten Eröffnung, Same-Bar ungünstig, Kosten/Slippage je Seite
- `simulator.mjs` — Balken-für-Balken-Zustandsmaschine; Split-Reskalierung gespeicherter Levels
- `backtest.mjs` — Portfolio (Risiko je Trade, Positions- und Auslastungsgrenzen, deterministische Reihenfolge), alle Pflichtkennzahlen, IS/OOS/Walk-forward-Teilung
- `gates.mjs` — Datengates je Variante; Kennzahlen nur bei bestandenen harten Gates
- `strategies/*.mjs` — Greenblatt (Abdeckungsprüfung), Momentum Breakout (Daily), Weinstein (Stage 2, Wochenbasis), Darvas (Box N=3, VU), Minervini (Trend Template + VU-VCP)

Registry: `scripts/supertrader/registry.mjs` → `supertrader/data/registry.json`. Jede Strategie
führt alle 47 DNA-Felder; jede Regel `rule_id`, Klartext, Maschinenfassung, Parameter, Quelle,
Evidenzstatus, VU-Flag und Version.

**Lifecycle-Grundsätze:** DISCOVERED/WATCH sind tägliche Momentaufnahmen. Ab SETUP wird jedes
Signal append-only im Ledger (`supertrader/data/ledger/<STRATEGY>.json`) protokolliert. Nichts wird
gelöscht. Der erste Live-Lauf rechnet nicht zurück (`liveSince`). Rangfilter gelten bei der
Entdeckung (`LC-RANK-AT-DISCOVERY`); ungültig wird ein Setup nur durch Strukturregeln.

### Darvas-Qualitätsstufen A/B (Version 1.1.0)

Innerhalb derselben Setup-Regeln klassifiziert Darvas jedes Setup als A oder B
(`DAR-Q-*`, alle `VU_FORMALIZATION`, nicht backtest-validiert):

| Kriterium | Regel |
|---|---|
| Marktregime | nicht `BROAD_WEAKNESS` (Regime zum Laufzeitpunkt, `market-regime-v1`) |
| Relative Stärke | 6-Monats-Perzentil ≥ 90 |
| Enge Box | Boxhöhe ≤ 12 % |
| Mindestabstand Stop | Boxhöhe ≥ max(4 %, 1 × ADR20) |
| Volumen am Trigger | Ausbruchstag ≥ 1,5 × 50-Tage-Volumen; vor dem Ausbruch offen, am Trigger endgültig |

Nur A-Setups erscheinen prominent auf der Startseite. B-Setups stehen ausschließlich im
eigenen Reiter des Signalzentrums und in der Darvas-World. Wartende Setups werden täglich neu
klassifiziert; ab dem Trigger ist die Stufe eingefroren.

## 4. Ausgeführter Agent-Graph

| Zustand | Agent / Funktion | Quality Gate | Recovery Path | Ergebnis |
|---|---|---|---|---|
| S0 Scope | Orchestrator | Nicht-Ziele fixiert (Discovery/Quant unverändert, keine Pipeline) | — | PASS |
| S1 Repo-Rekonstruktion | Explore-Agent Daten + Explore-Agent CI/Deploy | Artefakte, Deploy-Pfad, CI-Filter belegt | Lücken → direkte Dateiprüfung | PASS |
| S2 Source Ledger | Research-Agent (Websuche) | Keine Chat-Zitate, echte URLs | Seitenabruf blockiert → `SEARCH_RESULT_MATCH`, `content_retrieved_by_vu=false` | PASS mit Kennzeichnung |
| S3 Data-Fit | Orchestrator | Gate C: Abdeckung gemessen | Fehlende Felder → `DATA_COVERAGE_PENDING` statt Ersatzformel | PASS |
| S4 Engine | Engine-Build | Gate D: Unit-Tests (Look-ahead, Gap, Same-Bar, Determinismus) | Testfehler → Fix → Retest | PASS (40 Tests) |
| S5 Strategie-Validierung | Mehrtages-Simulation im Scratch (nicht veröffentlicht) | Churn-/Plausibilitätsanalyse der Übergänge | 3 Iterationen: Darvas-Oberkante (Zwischenhoch), Nähe-zum-Hoch innerhalb der Box, Rangfilter → `LC-RANK-AT-DISCOVERY`; Mindest-ADR/Boxhöhe gegen gepinnte Übernahmetitel | PASS |
| S6 Backtest-Gates | Gate-Evaluator | Gate E: keine Kennzahl ohne Gates | Gates offen → Status statt Zahl | PASS (alle Varianten ehrlich gesperrt) |
| S7 Produkt | UI-Build | Gate F: Browser-QA 390/1280, visuelle Prüfung der Screenshots | Überlauf/Beschriftung/Begründungstext korrigiert | PASS |
| S8 CI | Workflows | Gate G: Tests, Regression Discovery (294) + Quant 2.0 (2026), Release-Artefakt, Secrets-Grep | Fehlschlag → Root Cause → Push | siehe PR |
| S9 Deployment | Pages-Release + Production Smoke | Routen 200, Artefakte gültig, Browser-QA gegen Produktion | Rot → Fix | siehe PR |
| S10 Terminal | Orchestrator | Zielzustand oder echte Owner-Entscheidung | — | siehe §7 |

## 5. Quality Gates

| Gate | Prüfung | Ort |
|---|---|---|
| A Architecture | nur `supertrader/`, `scripts/supertrader/`, `docs/SUPERTRADER_*`, `supertrader-*.yml` geändert | `guard-protected-paths.mjs` |
| B Research Traceability | DNA vollständig, Regelfelder, Quellen existieren, keine Chat-Zitate, Schreibweise Kullamägi | `tests/registry.test.mjs` |
| C Data Health | Quellenpfad je Abdeckungszahl; Greenblatt ohne Ranking bei fehlenden Feldern | `tests/artifacts.test.mjs` |
| D Strategy Integrity | gültige Übergänge, Regel-IDs existieren, Kausalität, Determinismus | `tests/engine.test.mjs`, `tests/artifacts.test.mjs` |
| E Backtesting | `metrics = null` und kein Trust Score ohne Gates; ORH = `DATA_COVERAGE_PENDING` | `tests/artifacts.test.mjs` |
| F Product | 390/1280 px, kein Überlauf, keine Fehler, kein Kaufton, Chart zeichnet | `browser-qa.mjs` |
| G CI/Deploy | alles oben + Regression + Release-Artefakt + Production Smoke | `supertrader-ci.yml`, `supertrader-live-smoke.yml` |

## 6. Betrieb

- `supertrader-signals.yml` — Di–Sa 06:17 UTC, idempotent, committet nur `supertrader/`.
- Die bestehende Pages-Auslieferung nimmt den Stand im nächsten Release-Fenster mit.
- `supertrader-live-smoke.yml` — nach jeder Pages-Auslieferung und werktags 13:43 UTC.

## 7. Offene echte Owner-Entscheidungen

1. **Survivorship-freies historisches Universum** (delistete Titel mit Kurshistorie, historische
   Indexzugehörigkeit) und **mehrjährige Tages-OHLCV** als öffentliches oder build-internes
   Artefakt. Ohne das besteht kein Backtest Gate E. Die kanonische Tageshistorie liegt in R2; ein
   Zugriff aus dem Supertrader-Lauf würde vorhandene Secrets in einem neuen Workflow nutzen —
   das ist bewusst nicht ohne Freigabe geschehen.
2. **Greenblatt-Pflichtfelder** (AssetsCurrent, LiabilitiesCurrent, PropertyPlantAndEquipmentNet)
   im kanonischen SEC-Consumer-Vertrag. Das wäre eine Änderung an der Discovery-/SEC-Pipeline und
   liegt außerhalb dieses Auftrags.
3. **Historische Intraday-Balken** für Kullamägis ORH-Einstieg (heute 2 Sitzungen Aufbewahrung).
4. **Source-Fidelity-Pass** mit legal erworbenen Primärwerken (Minervini, Darvas, Weinstein,
   Greenblatt, Market Wizards: The Next Generation). Bis dahin bleiben Detailregeln als
   VU-Formalisierung oder DISPUTED markiert.
5. **Menüeintrag** in der globalen Navigation: bewusst nicht gesetzt, weil die Navigation auch in
   Discovery erscheint (Discovery bliebe sonst nicht visuell unverändert).
