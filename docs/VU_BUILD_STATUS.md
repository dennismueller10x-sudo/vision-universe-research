# VU INVESTMENT INTELLIGENCE — BUILD STATUS

Letzte Aktualisierung: Phase 1 abgeschlossen.

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

## In Progress

Phase 2 — Mock Core.

## Pending

Phase 2 Mock Core · Phase 3 Quant Core · Phase 4 Discovery · Phase 5 Strategy Engine UI ·
Phase 6 Backtest Engine · Phase 7 AI Foundation · Phase 8 Watchlist Intelligence ·
Phase 9 Quality Pass

## Known Limitations

- Analyst Revisions sind im Schema vorgesehen, aber bewusst ohne Daten (§16). Der Faktor
  ist in `quant-v1.json` als `available: false` markiert und wird von der Strategy-
  Validierung abgelehnt, solange keine lizenzierten PIT-Estimates vorliegen.
- Nur ein Universum (`US_EQUITIES`, Mock). Europa ist Extension Point.

## Next Phase

Phase 2 — Mock Core: 500 synthetische Securities, Edge-Case-Fixtures, Preise,
bitemporale Fundamentaldaten, Corporate Actions, MockProvider.
