# Testarten: wovon leben unsere Tests?

Stand 10.11.2026 (Strang S). **Diese Datei ist erzeugt:** `node scripts/quality/test-inputs.mjs --doc docs/quality/TESTARTEN.md`, nicht von Hand aendern.

Rote Tests sollen nur kommen, wenn Code kaputt ist, nicht weil sich taeglich Marktdaten aendern. Ausloeser waren OR14, model-depots, OV6/OV9/OV11, PF-8, vu2-chart, n-home (#1769–#1776).

## Regeln

1. **Regressions- und Rechentests** lesen eingefrorene echte Kopien unter `<produkt>/tests/fixtures/` (Quell-Commit in der README daneben). Die Assertions bleiben gleich streng.
2. **Zustandspruefungen** (Frische, Schema, Plausibilitaet des heutigen Standes) gehoeren in `scripts/core/data-quality.mjs` bzw. den Freshness-Monitor. Dort alarmieren sie und blockieren keinen Code-PR (CLAUDE.md).
3. **Zustaende wie INSUFFICIENT_SAMPLE, fehlende Daten, zurueckgehaltene Evidenz** bekommen je einen Fixture-Test mit eigener Eingabe (`quant/tests/evidence-states.test.mjs`), nie einen Ticker, der heute zufaellig in diesem Zustand ist.
4. **Rueckfallschutz:** `core/tests/test-inputs.test.mjs` verbietet neue Tests, die Live-Artefakte lesen, ausser mit Eintrag samt Grund in `core/registry/test-input-allowlist.json`. Die Liste darf nur kleiner werden.

## Messung

Die Liste stammt aus zwei Quellen: Text-Scan (`scripts/quality/test-inputs.mjs`, liefert Zeile und Risiko-Schaetzung) und Laufzeitmessung (`scripts/quality/test-input-tracer.mjs`: `TRACE_LOG=/pfad/trace.jsonl node --test --import ./scripts/quality/test-input-tracer.mjs "quant/tests/*.test.mjs"` protokolliert jede geoeffnete Datei unter den Datenordnern). Eintraege mit `dynamisch` liest der Test ueber einen Helfer, den der Text-Scan nicht sieht. Alle Suiten waren bei der Messung gruen (8.826 Tests).

**Art** ist die Kategorie aus der Registry; **Risiko** die Schaetzung des Scans: HOCH = Datum/Ticker/Frische in den Erwartungen einer Datei, die Live-Daten liest. Das ist eine Pruefliste, kein Urteil; ein Treffer kann in einem ganz anderen Test der Datei liegen.

## Stand

| Kategorie | Anzahl |
|---|---|
| datenzustand-offen (Ziel: Datenqualitaet) | 17 |
| fixture-offen (Ziel: eingefrorene Kopie) | 57 |
| schema-vertrag (darf lesen) | 183 |
| scan-fehlalarm (Scan meldet, Test liest nicht) | 27 |

Bereits umgestellt: `discover/tests/market-detail.test.mjs` und `core/tests/chart-standard.test.mjs` (Fixtures mit Quell-Commit), neu: `quant/tests/evidence-states.test.mjs`. Seit S2 (10.11.2026) zusaetzlich 26 Tests auf Fixtures umgestellt und 4 weitere durch Auslagerung der Zustandspruefungen als DQ-PQ-1..6 in der Datenqualitaet (`core/product-quality.js`).

## UI-geschuetzte Skripte

`scripts/vu2/browser-qa.mjs` und `scripts/discover/browser-qa.mjs` stehen unter UI-Schutz (`docs/quality/ui-protection-revisions.json`). Sie stehen in der Inventur, sind aber nicht umgestellt; eine Aenderung braucht eine Revision mit Owner-Freigabe.

## Inventur

| Testdatei | Zeile | Art | Risiko | liest |
|---|---|---|---|---|
| `core/tests/europe-discover-refresh.test.mjs` | 24 | datenzustand-offen | HOCH | discover/data |
| `core/tests/discover-universe.test.mjs` | 1 | fixture-offen | MITTEL | discover/data |
| `core/tests/europe-discover-known-invalid.test.mjs` | 67 | fixture-offen | HOCH | discover/data |
| `core/tests/europe-discover-schedule.test.mjs` | 28 | fixture-offen | MITTEL | discover/data |
| `core/tests/identity.test.mjs` | 31 | fixture-offen | HOCH | quant/data |
| `core/tests/industry-classification-sec.test.mjs` | 73 | fixture-offen | HOCH | quant/data |
| `core/tests/watchlist-view.test.mjs` | 111 | fixture-offen | HOCH | quant/data, supertrader/data, technical/data |
| `discover/tests/europe-continuity-rematerialization.test.mjs` | 8 | fixture-offen | MITTEL | discover/data |
| `core/tests/client.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data, quant/data |
| `core/tests/eligibility-gate.test.mjs` | 68 | schema-vertrag | NIEDRIG | quant/data |
| `core/tests/equity-quality.test.mjs` | 91 | scan-fehlalarm | HOCH | – |
| `core/tests/sf8-data-quality.test.mjs` | 89 | fixture-offen | HOCH | quant/data, supertrader/data |
| `core/tests/stock-availability.test.mjs` | 53 | fixture-offen | MITTEL | discover/data, quant/data, supertrader/data, technical/data |
| `core/tests/stock-context.test.mjs` | 16 | fixture-offen | HOCH | discover/data, quant/data, supertrader/data, technical/data |
| `core/tests/global-published-contract.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data |
| `core/tests/golden-paths.test.mjs` | 23 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `core/tests/health.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | core/data, discover/data, quant/data, supertrader/data, technical/data |
| `core/tests/legal-notices-frontend.test.mjs` | 81 | schema-vertrag | NIEDRIG | supertrader/data |
| `core/tests/long-series-repair.test.mjs` | 67 | schema-vertrag | NIEDRIG | – |
| `core/tests/product-contracts.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data, technical/data |
| `core/tests/query-engine-universe.test.mjs` | 37 | schema-vertrag | NIEDRIG | technical/data |
| `core/tests/state-gate.test.mjs` | 23 | schema-vertrag | NIEDRIG | – |
| `core/tests/state/supertrader-discover.test.mjs` | 6 | schema-vertrag | NIEDRIG | – |
| `core/tests/supertrader-chain.test.mjs` | 95 | scan-fehlalarm | HOCH | – |
| `core/tests/universe-follow-chain.test.mjs` | 21 | schema-vertrag | NIEDRIG | – |
| `core/tests/watchlist-fetch-published.test.mjs` | 17 | schema-vertrag | NIEDRIG | – |
| `core/tests/watchlist-identity-quarantine.test.mjs` | 37 | schema-vertrag | NIEDRIG | quant/data, supertrader/data, technical/data |
| `discover/tests/company-logos.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | social/data |
| `discover/tests/data.test.mjs` | 9 | schema-vertrag | NIEDRIG | discover/data |
| `discover/tests/direct-link-lib.test.mjs` | 116 | scan-fehlalarm | MITTEL | – |
| `discover/tests/einordnung.test.mjs` | 188 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `discover/tests/europe-bootstrap.test.mjs` | 13 | schema-vertrag | NIEDRIG | – |
| `discover/tests/fundamentals-no-cik.test.mjs` | 13 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `discover/tests/home-market.test.mjs` | 77 | schema-vertrag | NIEDRIG | quant/data |
| `discover/tests/identity-quarantine.test.mjs` | 11 | schema-vertrag | NIEDRIG | discover/data |
| `discover/tests/im-blick-live.test.mjs` | 47 | scan-fehlalarm | HOCH | – |
| `discover/tests/im-blick-nachtlauf.test.mjs` | 58 | scan-fehlalarm | HOCH | – |
| `discover/tests/im-blick-refresh.test.mjs` | 66 | scan-fehlalarm | HOCH | – |
| `discover/tests/v3.test.mjs` | 14 | fixture-offen | HOCH | discover/data, quant/data |
| `products/fundamental/tests/catalog.test.mjs` | 17 | fixture-offen | HOCH | discover/data, quant/data |
| `products/fundamental/tests/model.test.mjs` | 8 | fixture-offen | HOCH | discover/data |
| `products/fundamental/tests/spinoff-share-basis.test.mjs` | 93 | fixture-offen | MITTEL | discover/data, quant/data |
| `products/social/tests/final-public-text.test.mjs` | – | fixture-offen (dyn.) | unbekannt | social/data |
| `products/social/tests/manual-topic-in-cycle.test.mjs` | 228 | fixture-offen | MITTEL | quant/data, social/data |
| `discover/tests/indicators.test.mjs` | 18 | schema-vertrag | NIEDRIG | quant/data |
| `discover/tests/klartext.test.mjs` | 161 | schema-vertrag | NIEDRIG | discover/data |
| `discover/tests/known-defects.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data |
| `discover/tests/market-cap-basis.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data |
| `discover/tests/names.test.mjs` | 13 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `discover/tests/overview.test.mjs` | 43 | schema-vertrag | NIEDRIG | – |
| `discover/tests/price-rounding.test.mjs` | 16 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `discover/tests/producer-ownership.test.mjs` | 47 | schema-vertrag | NIEDRIG | discover/data |
| `discover/tests/scale.test.mjs` | 15 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `discover/tests/series-reason-honest.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data |
| `discover/tests/technical-intelligence.test.mjs` | 65 | schema-vertrag | NIEDRIG | quant/data |
| `discover/tests/unternehmen-currency.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data |
| `products/fundamental/tests/compare.test.mjs` | 20 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `products/fundamental/tests/history-extension.test.mjs` | 129 | scan-fehlalarm | HOCH | – |
| `products/social/tests/approval-decision.test.mjs` | 212 | schema-vertrag | NIEDRIG | social/data |
| `products/social/tests/approval-projection.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | social/data |
| `products/social/tests/asset-delivery.test.mjs` | 15 | schema-vertrag | NIEDRIG | – |
| `products/social/tests/asset-hashtag-done.test.mjs` | 41 | schema-vertrag | NIEDRIG | social/data |
| `products/social/tests/creative-job.test.mjs` | 22 | schema-vertrag | NIEDRIG | social/data |
| `products/social/tests/creative-reuse.test.mjs` | 191 | schema-vertrag | NIEDRIG | quant/data, social/data |
| `products/social/tests/creator-discovery.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data, social/data |
| `products/social/tests/discover-evidence.test.mjs` | 25 | schema-vertrag | NIEDRIG | discover/data |
| `products/social/tests/dryrun-evidence-classes.test.mjs` | 83 | schema-vertrag | NIEDRIG | discover/data, social/data |
| `products/social/tests/evidence-package.test.mjs` | 35 | schema-vertrag | NIEDRIG | quant/data |
| `products/social/tests/hashtags.test.mjs` | 63 | schema-vertrag | NIEDRIG | social/data |
| `products/social/tests/loop-closure.test.mjs` | 69 | scan-fehlalarm | MITTEL | – |
| `products/social/tests/opportunity-slate.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data, social/data |
| `products/social/tests/orchestrator.test.mjs` | 349 | scan-fehlalarm | MITTEL | – |
| `quant/tests/acceptance.test.mjs` | 396 | datenzustand-offen | HOCH | quant/data |
| `quant/tests/backtest-p2-deficits.test.mjs` | 110 | datenzustand-offen | HOCH | quant/data |
| `quant/tests/backtest-result-contract.test.mjs` | 18 | datenzustand-offen | MITTEL | quant/data |
| `quant/tests/backtest-runner.test.mjs` | 189 | datenzustand-offen | HOCH | quant/data |
| `quant/tests/benchmark-reference.test.mjs` | 65 | datenzustand-offen | HOCH | quant/data |
| `quant/tests/backtest-certification.test.mjs` | 33 | fixture-offen | HOCH | quant/data |
| `quant/tests/backtest-refresh.test.mjs` | 13 | fixture-offen | HOCH | quant/data |
| `quant/tests/canonical-product-search.test.mjs` | 22 | fixture-offen | HOCH | discover/data, quant/data |
| `quant/tests/company-master.test.mjs` | 324 | fixture-offen | HOCH | discover/data, quant/data |
| `products/social/tests/owner-decision.test.mjs` | 204 | schema-vertrag | NIEDRIG | social/data |
| `products/social/tests/performance-ingest.test.mjs` | 205 | schema-vertrag | NIEDRIG | – |
| `products/social/tests/product-readiness.test.mjs` | 129 | schema-vertrag | NIEDRIG | social/data |
| `products/social/tests/production-readiness.test.mjs` | 241 | schema-vertrag | NIEDRIG | – |
| `products/social/tests/publish-candidate.test.mjs` | 269 | schema-vertrag | NIEDRIG | social/data |
| `products/social/tests/request-creative-web-force-attempt.test.mjs` | 136 | schema-vertrag | NIEDRIG | social/data |
| `products/social/tests/revision-lookup.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | social/data |
| `products/social/tests/secrets.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | social/data |
| `products/social/tests/source-registry.test.mjs` | 161 | schema-vertrag | NIEDRIG | social/data |
| `products/social/tests/visual-motif.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/adjustment-consistency.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/assignment-change.test.mjs` | 53 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/backtest-artifact-consistency.test.mjs` | 17 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/backtest-catalog.test.mjs` | 54 | schema-vertrag | NIEDRIG | – |
| `quant/tests/backtest-certification-fv1.test.mjs` | 50 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/backtest-consolidation-boundary.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/backtest-coverage-matrix.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/backtest-demo-freshness.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/backtest-kinds.test.mjs` | 17 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/backtest-metrics.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/backtest-preview.test.mjs` | 17 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/backtest-review-bundle.test.mjs` | 22 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/backtest-run-cli-metrics-hash.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/benchmark-freshness.test.mjs` | 11 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/canonical-total-return.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/capability-matrix.test.mjs` | 12 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `quant/tests/classify-rejections-cli.test.mjs` | 9 | scan-fehlalarm | MITTEL | – |
| `quant/tests/debt-instrument-classification.test.mjs` | 82 | datenzustand-offen | HOCH | quant/data |
| `quant/tests/factor-evidence.test.mjs` | 16 | datenzustand-offen | HOCH | quant/data |
| `quant/tests/issuer-master.test.mjs` | 28 | datenzustand-offen | MITTEL | quant/data |
| `quant/tests/company-names.test.mjs` | 162 | fixture-offen | HOCH | quant/data |
| `quant/tests/currency-fx-matrix.test.mjs` | 323 | fixture-offen | HOCH | quant/data |
| `quant/tests/discover-series-hygiene.test.mjs` | 21 | fixture-offen | MITTEL | quant/data |
| `quant/tests/elliott-home.test.mjs` | 6 | fixture-offen | HOCH | quant/data |
| `quant/tests/elliott-registry-product-view.test.mjs` | 20 | fixture-offen | HOCH | quant/data |
| `quant/tests/elliott-registry.test.mjs` | 106 | fixture-offen | HOCH | quant/data |
| `quant/tests/frontend-transformation.test.mjs` | 73 | fixture-offen | MITTEL | discover/data, quant/data |
| `quant/tests/golden-five-pit-coverage.test.mjs` | 16 | fixture-offen | MITTEL | quant/data |
| `quant/tests/listing-continuity.test.mjs` | 68 | fixture-offen | HOCH | quant/data |
| `quant/tests/company-name-coverage.test.mjs` | 43 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `quant/tests/coverage-audits.test.mjs` | 21 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/development-preview.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data, quant/data, social/data, supertrader/data, technical/data |
| `quant/tests/direct-link-lib.test.mjs` | 127 | scan-fehlalarm | HOCH | – |
| `quant/tests/market-calendar.test.mjs` | 40 | fixture-offen | MITTEL | quant/data |
| `quant/tests/elliott-explore.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/elliott-projection.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/exchange-directory-class.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/factor-product-projection.test.mjs` | 18 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `quant/tests/golden-five-backtest-readiness.test.mjs` | 17 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/history-sync-boundary.test.mjs` | 22 | scan-fehlalarm | HOCH | – |
| `quant/tests/home-elliott-v3.test.mjs` | 14 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/intelligence-brief.test.mjs` | 64 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `quant/tests/intelligence-contract.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/internal-links.test.mjs` | 119 | schema-vertrag | NIEDRIG | – |
| `quant/tests/intraday-delivery-contract.test.mjs` | 131 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/journey-coverage.test.mjs` | 18 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/journey-shape.test.mjs` | 166 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `quant/tests/last-price-from-series.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data, quant/data |
| `quant/tests/launch-gates.test.mjs` | 34 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `quant/tests/market-data-freshness-p0.test.mjs` | 104 | scan-fehlalarm | HOCH | – |
| `quant/tests/market-eod-cli.test.mjs` | 34 | scan-fehlalarm | HOCH | – |
| `quant/tests/market-scale.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/market-signal-contract.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/market-store.test.mjs` | 175 | scan-fehlalarm | HOCH | – |
| `quant/tests/model-depots.test.mjs` | 14 | datenzustand-offen | HOCH | quant/data |
| `quant/tests/sec-universe-scale.test.mjs` | 24 | datenzustand-offen | MITTEL | quant/data |
| `quant/tests/security-master-approval-v110.test.mjs` | 243 | datenzustand-offen | MITTEL | quant/data |
| `quant/tests/security-master-content-hash.test.mjs` | 16 | datenzustand-offen | MITTEL | quant/data |
| `quant/tests/security-master-weekly.test.mjs` | 15 | datenzustand-offen | HOCH | quant/data |
| `quant/tests/universe-list.test.mjs` | 37 | datenzustand-offen | HOCH | discover/data, quant/data |
| `quant/tests/no-mock-in-product.test.mjs` | 7 | fixture-offen | MITTEL | discover/data, quant/data, social/data, supertrader/data, technical/data |
| `quant/tests/pit-snapshot-integrity.test.mjs` | 40 | fixture-offen | HOCH | quant/data |
| `quant/tests/portfolio-standard.test.mjs` | 209 | fixture-offen | HOCH | quant/data |
| `quant/tests/product-identity-release.test.mjs` | 13 | fixture-offen | HOCH | discover/data, quant/data |
| `quant/tests/product-intelligence-materialization.test.mjs` | – | fixture-offen (dyn.) | unbekannt | quant/data |
| `quant/tests/product-services.test.mjs` | 6 | fixture-offen | HOCH | discover/data, quant/data |
| `quant/tests/published-close.test.mjs` | 82 | fixture-offen | HOCH | quant/data |
| `quant/tests/real-backtest-read.test.mjs` | 91 | fixture-offen | HOCH | quant/data |
| `quant/tests/real-weekly-backtest.test.mjs` | 21 | fixture-offen | HOCH | quant/data |
| `quant/tests/return-series.test.mjs` | 12 | fixture-offen | MITTEL | quant/data |
| `quant/tests/security-type-safety.test.mjs` | 52 | fixture-offen | MITTEL | discover/data, quant/data |
| `quant/tests/split-evidence-supplements.test.mjs` | 86 | fixture-offen | HOCH | quant/data |
| `quant/tests/technical-unavailability.test.mjs` | 56 | fixture-offen | HOCH | quant/data |
| `quant/tests/tiingo.test.mjs` | 379 | fixture-offen | HOCH | quant/data |
| `quant/tests/total-return-contract.test.mjs` | 132 | fixture-offen | HOCH | quant/data |
| `quant/tests/v13-largecap.test.mjs` | 20 | fixture-offen | HOCH | quant/data |
| `quant/tests/v13b-largecap-strict.test.mjs` | 20 | fixture-offen | HOCH | quant/data |
| `quant/tests/weekly-benchmark-batch.test.mjs` | 42 | fixture-offen | HOCH | quant/data |
| `quant/tests/technical-ap8-l1.test.mjs` | 59 | schema-vertrag | NIEDRIG | quant/data, technical/data |
| `quant/tests/technical-ap8-l2.test.mjs` | 56 | schema-vertrag | NIEDRIG | quant/data, technical/data |
| `quant/tests/technical-ap8-l3.test.mjs` | 41 | schema-vertrag | NIEDRIG | quant/data, technical/data |
| `quant/tests/technical-ap8-l4.test.mjs` | 40 | schema-vertrag | NIEDRIG | technical/data |
| `quant/tests/technical-ap8-l5.test.mjs` | 31 | schema-vertrag | NIEDRIG | technical/data |
| `quant/tests/technical-ema200-materialization.test.mjs` | 31 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/technical-evidence-phases.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/technical-momentum-labels.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/technical-ui.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/technical-workspace-contract.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/ti-engine.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/ti-product.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/ti-shard-hygiene.test.mjs` | 41 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/ti-ui.test.mjs` | 67 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/ticker-reuse-consumers.test.mjs` | 52 | scan-fehlalarm | MITTEL | – |
| `quant/tests/ticker-reuse-quarantine.test.mjs` | 19 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/tiingo2-foundation-classifier-merge.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/tiingo2-publication.test.mjs` | 37 | schema-vertrag | NIEDRIG | – |
| `quant/tests/tiingo2-refresh.test.mjs` | 30 | scan-fehlalarm | HOCH | – |
| `quant/tests/total-return-verification.test.mjs` | 121 | scan-fehlalarm | HOCH | quant/data |
| `quant/tests/universe-source.test.mjs` | 17 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/us-security-master-artefacts.test.mjs` | 44 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/v10-corporate-actions.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/v10-population.test.mjs` | 16 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/v12-largecap.test.mjs` | 20 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/valuation-consistency.test.mjs` | 133 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `quant/tests/vercel-preview-boundary.test.mjs` | 44 | schema-vertrag | NIEDRIG | – |
| `screener/tests/europe-close-metrics.test.mjs` | 64 | schema-vertrag | NIEDRIG | discover/data |
| `scripts/supertrader/tests/artifacts.test.mjs` | 9 | schema-vertrag | NIEDRIG | supertrader/data |
| `scripts/supertrader/tests/discover-availability.test.mjs` | 18 | scan-fehlalarm | MITTEL | – |
| `scripts/supertrader/tests/sf-sf9-e2e.test.mjs` | 35 | datenzustand-offen | MITTEL | supertrader/data |
| `scripts/vu2/browser-qa.mjs` | 35 | datenzustand-offen | MITTEL | – |
| `scripts/supertrader/tests/payload-slices.test.mjs` | 13 | schema-vertrag | NIEDRIG | supertrader/data |
| `scripts/supertrader/tests/prune-dead-refs.test.mjs` | 19 | scan-fehlalarm | HOCH | – |
| `scripts/supertrader/tests/r10-cases.test.mjs` | 84 | fixture-offen | HOCH | discover/data, quant/data |
| `scripts/supertrader/tests/r4.test.mjs` | 15 | fixture-offen | HOCH | supertrader/data |
| `scripts/supertrader/tests/sf-sf8-candidates.test.mjs` | 250 | fixture-offen | HOCH | supertrader/data |
| `scripts/supertrader/tests/r5.test.mjs` | 9 | schema-vertrag | NIEDRIG | supertrader/data |
| `scripts/supertrader/tests/r6.test.mjs` | 13 | schema-vertrag | NIEDRIG | supertrader/data |
| `scripts/supertrader/tests/sf-completion.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | supertrader/data |
| `scripts/supertrader/tests/sf-mc3-evidence-matrix.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data, supertrader/data |
| `scripts/supertrader/tests/sf-mc3-product-wording.test.mjs` | 58 | schema-vertrag | NIEDRIG | quant/data, supertrader/data |
| `scripts/supertrader/tests/sf-product-contract.test.mjs` | 154 | scan-fehlalarm | HOCH | – |
| `technical/tests/technical-stock-summary.test.mjs` | 20 | fixture-offen | MITTEL | technical/data |
| `technical/tests/technical-templates.test.mjs` | 16 | fixture-offen | HOCH | technical/data |
| `technical/tests/technical-world.test.mjs` | 123 | fixture-offen | HOCH | technical/data |
| `quant/tests/methodology-change.test.mjs` | 9 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/multi-asset-market-environment.test.mjs` | 94 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/naming-contract.test.mjs` | 64 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `quant/tests/pattern-research.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/pattern-return-basis-check.test.mjs` | 163 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/pattern-unavailability.test.mjs` | 57 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/pit-fundamental-history.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/plain-verdict.test.mjs` | 139 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/product-capabilities.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/product-data-service.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/product-language.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data, quant/data |
| `quant/tests/push-with-retry.test.mjs` | 43 | scan-fehlalarm | MITTEL | – |
| `quant/tests/quant-app-view-model.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data, quant/data |
| `quant/tests/quant-home-golden-five.test.mjs` | 7 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/radar-event-quarantine.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/real-backtest-selection.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/realtime-integration.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/realtime-matrix.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/realtime-sessions.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/regime-observation-immutability.test.mjs` | 72 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/release-delivery.test.mjs` | 23 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/release-id.test.mjs` | 20 | schema-vertrag | NIEDRIG | supertrader/data |
| `quant/tests/release-packs.test.mjs` | 59 | schema-vertrag | NIEDRIG | – |
| `quant/tests/research-ca-evidence.test.mjs` | 18 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/research-exposure.test.mjs` | 5 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/research-identity-evidence.test.mjs` | 20 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/research-population.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/research-v8-archive-assessment.test.mjs` | 12 | schema-vertrag | NIEDRIG | – |
| `quant/tests/research-v8-classification.test.mjs` | 49 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/research-v8-r2-ca-cases.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/research-v8-sec-archive-schema.test.mjs` | 12 | schema-vertrag | NIEDRIG | – |
| `quant/tests/research-weekly-source.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/return-basis-study.test.mjs` | 64 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/return-semantics.test.mjs` | 158 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/scale-gate.test.mjs` | 549 | scan-fehlalarm | HOCH | – |
| `quant/tests/stock-page-shards.test.mjs` | 24 | fixture-offen | MITTEL | discover/data, quant/data |
| `quant/tests/survivorship-control.test.mjs` | 41 | fixture-offen | HOCH | quant/data |
| `quant/tests/screener-hit-row.test.mjs` | 54 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/screener-surface.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/screener-workspace.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/sec-panel-published-close.test.mjs` | 14 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/secrets.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data, quant/data, social/data, supertrader/data, technical/data |
| `quant/tests/security-master-generations.test.mjs` | 33 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/security-master-v130-freeze.test.mjs` | 12 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/setup-oos-rows-export.test.mjs` | 16 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/setup-state-contract.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/sic-peer-taxonomy.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/signal-backtest.test.mjs` | 13 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/signal-split-adjusted-bars.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | quant/data |
| `quant/tests/split-adjust-single-definition.test.mjs` | 26 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/stock-chart-basis.test.mjs` | 36 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/stock-page-payload.test.mjs` | 40 | schema-vertrag | NIEDRIG | discover/data, quant/data |
| `quant/tests/strategy-history.test.mjs` | 24 | schema-vertrag | NIEDRIG | quant/data |
| `quant/tests/strategy-match.test.mjs` | 18 | schema-vertrag | NIEDRIG | quant/data |
| `scripts/supertrader/tests/sf-screener-export.test.mjs` | 7 | schema-vertrag | NIEDRIG | supertrader/data |
| `scripts/supertrader/tests/sf-sf8-daily.test.mjs` | – | schema-vertrag (dyn.) | unbekannt | discover/data, quant/data |
| `scripts/supertrader/tests/sf-sf8-data-adapter.test.mjs` | 39 | scan-fehlalarm | HOCH | – |
| `scripts/supertrader/tests/sf-sf9-publication.test.mjs` | 13 | schema-vertrag | NIEDRIG | supertrader/data |
| `scripts/supertrader/tests/sf-st9-v13-delisted-study.test.mjs` | 265 | scan-fehlalarm | HOCH | – |
| `scripts/supertrader/tests/snapshot.test.mjs` | 39 | scan-fehlalarm | HOCH | – |
| `technical/tests/technical-world-context.test.mjs` | 25 | fixture-offen | HOCH | quant/data, supertrader/data |
| `scripts/supertrader/tests/st-recipe-names.test.mjs` | 28 | schema-vertrag | NIEDRIG | supertrader/data |
| `scripts/supertrader/tests/validation.test.mjs` | 161 | scan-fehlalarm | HOCH | – |
| `technical/tests/technical-assistant.test.mjs` | 18 | schema-vertrag | NIEDRIG | technical/data |
| `technical/tests/technical-data-contract.test.mjs` | 15 | schema-vertrag | NIEDRIG | technical/data |
| `technical/tests/technical-e2e-consistency.test.mjs` | 24 | schema-vertrag | NIEDRIG | quant/data, technical/data |
| `technical/tests/technical-identity-quarantine.test.mjs` | 21 | schema-vertrag | NIEDRIG | quant/data |
| `technical/tests/technical-templates-dq-order.test.mjs` | 15 | schema-vertrag | NIEDRIG | technical/data |
| `technical/tests/technical-world-workflow.test.mjs` | 42 | schema-vertrag | NIEDRIG | – |
