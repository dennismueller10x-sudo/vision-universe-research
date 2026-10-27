# V8 – Evidenzmatrix

**V8_PARTIALLY_VALIDATED: 13/13 technisch implementiert; 4/13 im definierten Methodenscope abgenommen; 4/7 Erweiterungsmethoden; 0/6 offiziell zertifizierte Backtest-Arten.** Alle Produktstatus und aktiven Verträge bleiben unverändert.

| Bereich | Methodischer Stand | Nachweis und Grenze |
|---|---|---|
| SAME_STOCK_REPLAY | PARTIAL | Existing descriptive/replay evidence preserved; source-bound conditional survivor cohort; no untouched confirmation. |
| PATTERN_EVIDENCE | PARTIAL | Existing contemporaneous controls preserved; historical population, overlapping outcomes and confirmation remain limited. |
| SIGNAL_BACKTEST | PARTIAL | All five existing definitions preserved; full developmental selection study added; event opportunities are not a funded strategy. |
| SETUP_BACKTEST | PARTIAL | Original outcomes and reconstructions remain separate. Concrete two-month/five-ISO-week discrepancy measured; proposed decision only, M6 gates unchanged. |
| STRATEGY_BACKTEST | PARTIAL | Existing strict PIT/TR ledger preserved; price-only portfolio study cannot qualify historical factor selection or unknown terminal values. |
| FACTOR_RANKING_BACKTEST | PARTIAL | Existing accession-constrained margin reconstruction preserved; additional original SEC acceptance provenance improves timing audit, not full original vintage denominator. |
| MONTE_CARLO | ACCEPTED_WITH_DEFINED_SCOPE | V7 acceptance preserved: conditional empirical resampling, not empirical proof of exchangeability/stationarity or future profits. |
| WALK_FORWARD | ACCEPTED_WITH_DEFINED_SCOPE | Complete developmental fit/select/test in six nonempty folds per rolling/expanding mode; independent Python verifies partitions, exclusions, selections and876 test opportunities per mode. Known survivor data; not independent confirmation. |
| OUT_OF_SAMPLE | ACCEPTED_WITH_DEFINED_SCOPE | V7 acceptance preserved: exposure administration and holdout reuse protection, not trading-rule confirmation. |
| MARKET_REGIME | ACCEPTED_WITH_DEFINED_SCOPE | All7880 daily labels and581 trend/47 volatility episodes independently reproduced. Accepted descriptive ex-post scope only; episodes not claimed independent and no PIT trading approval. |
| PARAMETER_SENSITIVITY | PARTIAL | 36 actual parameter points x2 block designs, dependence-aware conditional bootstrap, nominal vs Holm separated, Python parity. Stationarity/mixing and block sufficiency unverified: no full inferential acceptance. |
| EVENT_DRIVEN | PARTIAL | 12 original SEC acceptance headers,4 recent daily20-bar outcomes,8 pre-daily exclusions. SEC acceptance is not company publication/earnings; modeled sessions and limited categories remain. |
| PORTFOLIO_REBALANCING | PARTIAL | V7 real price portfolio cash/drift/cost parity preserved; complete real dividend/CA/TR/terminal historical evidence remains open. |

Die maschinenlesbare [Matrix](v8/evidence-matrix.json) trennt Implementierung, Datenumfang, Rechenprüfung, Methodik, unabhängige Evidenz, wirtschaftlichen Effekt und Produktfreigabe. Abgenommen sind Monte Carlo und OOS-Verwaltung aus V7 sowie vollständige entwicklungsbezogene Walk-Forward-Ausführung und beschreibende ex-post-Regimeanalyse aus V8. Die sechs Backtest-Arten erhalten keine Produktzertifizierung.

Rechenparität und Originalquellenproben sind unabhängige Prüfwege derselben historischen Beobachtungen. Keine Studie wird dadurch zu einer unangetasteten Bestätigung einer Handelsregel. Unveränderte V7-Ergebnisse bleiben an ihre ursprünglichen Inputs gebunden; V8 schreibt diese Artefakte nicht um.

[Methodische Abnahme](BACKTEST_V8_METHOD_VALIDATION.md) · [Realstudien](BACKTEST_V8_REAL_STUDIES.md) · [Datenrettung](BACKTEST_V8_DATA_RECOVERY.md) · [Validierung](BACKTEST_V8_VALIDATION.md).
