# V8 – Evidenzmatrix

**V8_PARTIALLY_VALIDATED: 13/13 technisch implementiert; 4/13 im definierten Methodenscope abgenommen; 4/7 Erweiterungsmethoden; 0/6 offiziell zertifizierte Backtest-Arten.** Aktive Verträge und Produktstatus bleiben unverändert.

| Bereich | Methodischer Stand | Nachweis und Grenze |
|---|---|---|
| SAME_STOCK_REPLAY | PARTIAL | Existing reference replays plus11 source-corrected private price-ledger cases;14 vintage conflicts independently explained,4 closed trades; no new universe coverage or untouched confirmation. |
| PATTERN_EVIDENCE | PARTIAL | Existing contemporaneous controls preserved; historical population, overlapping outcomes and confirmation remain limited. |
| SIGNAL_BACKTEST | PARTIAL | All five existing definitions preserved; full developmental selection study added; event opportunities are not a funded strategy. |
| SETUP_BACKTEST | PARTIAL | Published states remain separate from reconstructions;4137events/20dates/2months/6ISOweeks on finalMain; proposed normative correction only, M6/OOS/owner gates unchanged. |
| STRATEGY_BACKTEST | PARTIAL | Existing PIT/TR ledger preserved. Raw close/split/dividend data recovered, documented payment/announcement and long historical membership/lifecycle evidence still incomplete; no invented cash. |
| FACTOR_RANKING_BACKTEST | PARTIAL | Existing accession-constrained margin reconstruction preserved;12original SEC acceptance checks improve timing provenance. Restored normalizedfactbooks assessed separately; original complete vintages/ranking denominator remain open. |
| MONTE_CARLO | ACCEPTED_WITH_DEFINED_SCOPE | V7 acceptance preserved: conditional empirical resampling, not empirical proof of exchangeability/stationarity or future profits. |
| WALK_FORWARD | ACCEPTED_WITH_DEFINED_SCOPE | Complete developmental fit/select/test in six nonempty folds per rolling/expanding mode; independent Python verifies partitions, exclusions, selections and876 test opportunities per mode. Known survivor data; not independent confirmation. |
| OUT_OF_SAMPLE | ACCEPTED_WITH_DEFINED_SCOPE | V7 acceptance preserved: exposure administration and holdout reuse protection, not trading-rule confirmation. |
| MARKET_REGIME | ACCEPTED_WITH_DEFINED_SCOPE | All7880 daily labels and581 trend/47 volatility episodes independently reproduced. Accepted descriptive ex-post scope only; episodes not claimed independent and no PIT trading approval. |
| PARAMETER_SENSITIVITY | PARTIAL | 36 actual parameter points x2 block designs, dependence-aware conditional bootstrap, nominal vs Holm separated, Python parity. Stationarity/mixing and block sufficiency unverified: no full inferential acceptance. |
| EVENT_DRIVEN | PARTIAL | 12 original SEC acceptance headers and12 observed-weekly4-bar outcomes;4 ofthese also20-bar daily outcomes;8excluded fromdailycoverage. SEC acceptance is not company earnings publication; limited categories/modelclock remain. |
| PORTFOLIO_REBALANCING | PARTIAL | Existing real price-portfolio cash/drift/cost parity preserved; rawarchiveaccess now available. Required actual dividend payDate/announcement evidence absent from checked price formats, no exDate cash fallback. |

Die [maschinenlesbare Matrix](v8/evidence-matrix.json) bindet die Nachweise und trennt Implementierung, Datenumfang, Rechenprüfung, Methodik, Unabhängigkeit, wirtschaftlichen Effekt und Produktfreigabe. Neu abgenommen sind vollständige entwicklungsbezogene Walk-Forward-Ausführung und rein beschreibende ex-post-Regimeanalyse. Monte Carlo und OOS-Verwaltung behalten die beiden V7-Abnahmen. Keine Tradingregel erhält dadurch unangetastete Bestätigung oder Produktzertifizierung.

Die 14 R2-Vintageprüfungen und elf privaten Preisgenerationen sind zusätzliche Quellen-/Rechenbelege; sie erhöhen weder den Universumsnenner noch den Methodenzähler. Historische Original-Membership-/Faktor-/Terminal- und Dividendenauszahlungsdaten bleiben begrenzt. Frühere V5.1-/V6-/V7-Ergebnisse sind unverändert erhalten.

[Methoden](BACKTEST_V8_METHOD_VALIDATION.md) · [Realstudien](BACKTEST_V8_REAL_STUDIES.md) · [Datenrettung](BACKTEST_V8_DATA_RECOVERY.md) · [Validierung](BACKTEST_V8_VALIDATION.md).
