# VU INVESTMENT INTELLIGENCE — BUILD STATUS

Letzte Aktualisierung: Phase 3 abgeschlossen.

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

## In Progress

Phase 4 — Discovery (Quant Home, Ranking, Screener, Stock Detail, Radar).

## Pending

Phase 4 Discovery · Phase 5 Strategy Engine UI · Phase 6 Backtest Engine ·
Phase 7 AI Foundation · Phase 8 Watchlist Intelligence · Phase 9 Quality Pass

## Known Limitations

- Analyst Revisions sind im Schema vorgesehen, aber bewusst ohne Daten (§16). Der Faktor
  ist in `quant-v1.json` als `available: false` markiert und wird von der Strategy-
  Validierung abgelehnt, solange keine lizenzierten PIT-Estimates vorliegen.
- Nur ein Universum (`US_EQUITIES`, Mock). Europa ist Extension Point.

## Next Phase

Phase 4 — Discovery: Quant Home, VU Quant Ranking, Screener mit VUQL, Stock Quant Detail,
Quant Radar. Dazu das gemeinsame UI-Fundament (`quant/ui/*`) auf Basis der bestehenden
Vision-Universe-Design-Tokens.
