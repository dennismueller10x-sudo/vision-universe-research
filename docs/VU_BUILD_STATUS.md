# VU INVESTMENT INTELLIGENCE — BUILD STATUS

Letzte Aktualisierung: Phase 6 abgeschlossen.

## Completed

**Phase 0 — Audit**
- `docs/VU_INVESTMENT_INTELLIGENCE_IMPLEMENTATION_PLAN.md` (Repository Audit, Gap Analysis,
  Architektur, Migration, Phasen, Risiken, Dateiliste, dokumentierte Abweichungen)

**Phase 1 — Foundation**
- `quant/engines/hash.js` — deterministischer Hash + PRNG (Reproduzierbarkeit)
- `quant/engines/schema.js` — kanonisches Financial Data Model, 26 Entitaeten,
  Laufzeitvalidatoren, Point-in-Time-Zugriff (`latestKnownFact`, `latestKnownSeries`)
- `quant/engines/catalog.js` — Financial Ontology, 52 Felder, VUQL-Tokens, Einheiten
- `quant/engines/provider.js` — 7 Provider-Interfaces, Registry, Health, Vendor-Leakage-Guard
- `quant/engines/methodology.js` — zentrale Methodik-Registry
- `quant/methodology/quant-v1.json`, `backtest-v1.json`, `trust-score-v1.json`,
  `strategies-v1.json` — alle Gewichte und Schwellen zentral und versioniert
- `quant/engines/query.js` — versionierter Query-AST, Validierung, Screener-Engine
- `quant/engines/vuql.js` — VUQL-Parser und -Serializer
- `quant/engines/strategy.js` — Strategy Schema, Validierung, Versionierung, Lineage, Diff

**Phase 2 — Mock Core**
- `quant/engines/mock-generator.js` — 500 synthetische Securities + 11 Edge-Case-Fixtures,
  deterministisch aus einem Seed; Preismodell Fundamentalanker x Bewertungsmultiplikator;
  bitemporale Fundamentaldaten; Corporate Actions; sieben modellierte Krisenfenster
- `quant/engines/mock-provider.js` — Adapter fuer alle sieben Provider-Interfaces
- `quant/tests/provider.test.mjs` — 21 Tests (Determinismus, PIT, Fixtures, Provenance)

**Phase 3 — Quant Core**
- `quant/engines/normalization.js` — Winsorization, Perzentile, robuste Z-Scores,
  Peer-Normalisierung mit Fallback-Kette
- `quant/engines/factors.js` — Quality/Momentum/Value/Growth/Risk aus Kursen und
  PIT-Fundamentaldaten; eine Funktion fuer Heute und fuer jeden Backtest-Stichtag
- `quant/engines/quant-score.js` — Composite, Coverage, Confidence, Faktorbeitraege,
  Universums-Perzentil, Screener-Zeilen
- `quant/engines/radar.js` — Score-Historie, Velocity, Acceleration, Intelligence Events,
  sieben Radar-Module
- `scripts/quant/build-quant-data.mjs` — Praekomputation nach `quant/data/**`
  (53 wochentliche Score-Snapshots, Rankings, Radar, Events, geshardete Factor DNA)
- `quant/tests/quant.test.mjs` — 25 Tests

Tests gesamt: **46 / 46 gruen** (`node --test "quant/tests/*.test.mjs"`).

**Phase 4 — Discovery**
- `quant/ui/quant.css`, `shell.js`, `charts.js`, `components.js` — Designsystem auf Basis
  der bestehenden Vision-Universe-Tokens, Datenladen, ein gemeinsames SVG-Chartmodul
- Seiten: Quant Home, Ranking, Screener (mit VUQL-Editor), Radar, Stock Quant Detail
- Menuepunkt `Quant` in `assets/site-navigation.js`

**Phase 5 — Strategy Engine (UI)**
- `quant/api/client.js` — die v1-API-Contracts als Funktionsschicht; Seiten und AI-Tools
  rufen ausschliesslich diese Grenze auf, nie eine Engine direkt
- `quant/strategies/` — Bibliothek mit fuenf Strategien, Detailansicht mit Regelwerk,
  Lineage, VUQL- und JSON-Darstellung
- `quant/strategies/builder/` — Strategy Lab; erzeugt exakt dasselbe Objekt wie die AI

**Phase 6 — Backtest Engine**
- `quant/engines/backtest.js` — PIT-Universum je Rebalancing-Termin, Ausfuehrung T+1,
  Kosten und Slippage, Positions- und Sektorgrenzen, Delisting-Glattstellung,
  vollstaendige Kennzahlen, Teilperioden, Reproduktionshash, Current Holdings
- `quant/engines/trust-score.js` — evidenzbasierte Bewertung aus den gemeldeten
  Kapabilitaeten des Laufs, mit harten Obergrenzen
- `quant/ui/backtest-worker.js` — Ausfuehrung im Web Worker (ein 20-Jahres-Lauf mit
  monatlichem Rebalancing rechnet rund 19 Sekunden; im Hauptthread waere die Seite so
  lange eingefroren)
- `quant/backtests/` — Ergebnisseite mit Equity-Kurve, Drawdown, Risiko, Jahresrenditen,
  Trust Score, Robustheit, aktuellem Modellportfolio, Portfolio-Historie, Trades und
  vollstaendiger Methodik

Tests gesamt: **90 / 90 gruen**.

## In Progress

Phase 7 — AI Foundation.

## Pending

Phase 7 AI Foundation · Phase 8 Watchlist Intelligence · Phase 9 Quality Pass

## Known Limitations

- Analyst Revisions sind im Schema vorgesehen, aber bewusst ohne Daten (§16). Der Faktor
  ist in `quant-v1.json` als `available: false` markiert und wird von der Strategy-
  Validierung abgelehnt, solange keine lizenzierten PIT-Estimates vorliegen.
- Nur ein Universum (`US_EQUITIES`, Mock). Europa ist Extension Point.
- Deflated Sharpe Ratio und Probability of Backtest Overfitting sind nicht implementiert;
  der Trust Score vergibt fuer diesen Block bewusst null Punkte statt ihn zu ueberspringen.
- Backtests werden im `localStorage` des Browsers gespeichert (kein Nutzerkonto).
- Ein 20-Jahres-Lauf mit monatlichem Rebalancing dauert rund 19 Sekunden. Der Web Worker
  haelt die Oberflaeche bedienbar, beschleunigt die Rechnung aber nicht.

## Next Phase

Phase 7 — AI Foundation: AIProvider-Abstraktion, MockAIProvider, Tool Registry mit
Sicherheitsgrenze, Natural Language → Query-/Strategy-AST, AI-Oberflaeche.
