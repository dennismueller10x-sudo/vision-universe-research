# Supertrader 6.0 – Certification-Readiness-Matrix (generiert)

Erzeugt von `scripts/supertrader/source-faithful/completion/build-sf6-readiness.mjs` aus Artefakten und Lauf-Receipts. Kriterien `sf6-readiness-criteria-1.1.0` (Fingerabdruck `469ea7d12789…`), festgeschrieben vor dem ersten Supertrader-6.0-Ergebnis. Keine Note ist von Hand gesetzt; keine Kennzahl geht ein.

Legende: PASS = belegt; PASS* = belegt mit deklarierten Grenzen; MA = nur unter deklarierter Modellannahme; TEIL = teilweise (manuell oder Lücke); GESPERRT = gesperrt; NICHT BELEGT = keine Evidenz.

| # | Strategie | Abschlusszustand | source fidelity | setup completeness | entry completeness | stop completeness | position management | exit completeness | portfolio accounting | pit data integrity | corporate action integrity | execution realism | backtest reproducibility | out of sample evidence | manual review requirements | certification readiness | live readiness |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 | SF_TURTLE_S1 | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | PASS* | PASS* | PASS* | PASS* | PASS* | PASS* | TEIL | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | PASS | GESPERRT | GESPERRT |
| C02 | SF_TURTLE_S2 | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS | PASS* | PASS* | PASS* | PASS* | PASS* | PASS* | TEIL | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | PASS | GESPERRT | GESPERRT |
| C03 | SF_DARVAS_BOX | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | MA | MA | MA | TEIL | PASS | PASS* | PASS* | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C04 | SF_WEINSTEIN_INVESTOR | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | TEIL | MA | MA | TEIL | TEIL | PASS* | TEIL | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C05 | SF_WEINSTEIN_TRADER | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | TEIL | MA | MA | TEIL | TEIL | PASS* | TEIL | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C06 | SF_MINERVINI_SEPA_VCP | RESEARCH_COMPLETE_WITH_EXCEPTIONS | TEIL | TEIL | MA | MA | TEIL | TEIL | PASS* | TEIL | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C07 | SF_MINERVINI_POWER_PLAY | RESEARCH_COMPLETE_WITH_EXCEPTIONS | TEIL | TEIL | MA | MA | TEIL | TEIL | PASS* | PASS* | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C08 | SF_KK_BREAKOUT | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | MA | TEIL | PASS | MA | MA | PASS* | PASS* | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C09 | SF_KK_EPISODIC_PIVOT | VALIDATION_BLOCKED | PASS* | MA | MA | MA | MA | MA | NICHT BELEGT | TEIL | NICHT BELEGT | MA | PASS* | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C10 | SF_KK_PARABOLIC_SHORT | VALIDATION_BLOCKED | PASS* | MA | MA | MA | MA | MA | TEIL | TEIL | NICHT BELEGT | GESPERRT | PASS* | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C11 | SF_MOKA_POCKET_PIVOT | SOURCE_BLOCKED | PASS* | MA | TEIL | TEIL | MA | TEIL | PASS* | PASS* | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C12 | SF_MOKA_BUYABLE_GAP_UP | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | TEIL | TEIL | MA | MA | TEIL | PASS* | PASS* | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C13 | SF_RASCHKE_HOLY_GRAIL | SOURCE_BLOCKED | PASS* | MA | TEIL | MA | TEIL | MA | PASS* | PASS* | NICHT BELEGT | MA | NICHT BELEGT | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |

## Evidenz je Strategie

### C01 SF_TURTLE_S1 – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.2.0: 7 exact, 13 derived (0 from a secondary source), 0 manual, 2 data-blocked, 2 ambiguous
- **SETUP_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **ENTRY_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **STOP_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **POSITION_MANAGEMENT**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **EXIT_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: TUR-SF-LIMIT-CORR
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: PASS – none
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✓, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C02 SF_TURTLE_S2 – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS – contract 1.2.0: 7 exact, 12 derived (0 from a secondary source), 0 manual, 2 data-blocked, 0 ambiguous
- **SETUP_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **ENTRY_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **STOP_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **POSITION_MANAGEMENT**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **EXIT_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: TUR-SF-LIMIT-CORR
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: PASS – none
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✓, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✓, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C03 SF_DARVAS_BOX – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.3.1: 3 exact, 10 derived (0 from a secondary source), 6 manual, 0 data-blocked, 1 ambiguous
- **SETUP_COMPLETENESS**: MA – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 8 rows, 2 mechanical, 6 under model assumption, 0 manual, 0 blocked
- **ENTRY_COMPLETENESS**: MA – ENTRY_EXECUTION: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 3 rows, 1 mechanical, 1 under model assumption, 1 manual, 0 blocked
- **EXIT_COMPLETENESS**: PASS – EXIT_CONDITIONS: 1 rows, 1 mechanical, 0 under model assumption, 0 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 8 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C04 SF_WEINSTEIN_INVESTOR – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.2.0: 1 exact, 5 derived (0 from a secondary source), 9 manual, 2 data-blocked, 0 ambiguous
- **SETUP_COMPLETENESS**: TEIL – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 7 rows, 3 mechanical, 2 under model assumption, 0 manual, 2 blocked
- **ENTRY_COMPLETENESS**: MA – ENTRY_EXECUTION: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 4 rows, 0 mechanical, 2 under model assumption, 2 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 3 rows, 1 mechanical, 1 under model assumption, 1 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: WEIN-SF-GROUP, WEIN-SF-MARKET
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 14 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✓, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C05 SF_WEINSTEIN_TRADER – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.2.0: 1 exact, 5 derived (0 from a secondary source), 8 manual, 2 data-blocked, 0 ambiguous
- **SETUP_COMPLETENESS**: TEIL – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 7 rows, 3 mechanical, 2 under model assumption, 0 manual, 2 blocked
- **ENTRY_COMPLETENESS**: MA – ENTRY_EXECUTION: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 3 rows, 0 mechanical, 2 under model assumption, 1 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 4 rows, 1 mechanical, 1 under model assumption, 2 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: WEIN-SF-GROUP, WEIN-SF-MARKET
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 12 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✓, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C06 SF_MINERVINI_SEPA_VCP – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: TEIL – contract 1.2.0: 0 exact, 9 derived (0 from a secondary source), 7 manual, 1 data-blocked, 0 ambiguous; wording only via translation
- **SETUP_COMPLETENESS**: TEIL – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 19 rows, 4 mechanical, 6 under model assumption, 4 manual, 2 blocked
- **ENTRY_COMPLETENESS**: MA – ENTRY_EXECUTION: 5 rows, 0 mechanical, 5 under model assumption, 0 manual, 0 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 3 rows, 1 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 8 rows, 1 mechanical, 4 under model assumption, 3 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 5 rows, 0 mechanical, 3 under model assumption, 2 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: MIN-SF-TT-8
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 11 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C07 SF_MINERVINI_POWER_PLAY – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: TEIL – contract 1.3.0: 0 exact, 5 derived (0 from a secondary source), 4 manual, 0 data-blocked, 0 ambiguous; wording only via translation
- **SETUP_COMPLETENESS**: TEIL – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 15 rows, 7 mechanical, 5 under model assumption, 1 manual, 0 blocked
- **ENTRY_COMPLETENESS**: MA – ENTRY_EXECUTION: 5 rows, 0 mechanical, 5 under model assumption, 0 manual, 0 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 3 rows, 1 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 8 rows, 1 mechanical, 4 under model assumption, 3 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 5 rows, 0 mechanical, 3 under model assumption, 2 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 6 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C08 SF_KK_BREAKOUT – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.2.1: 4 exact, 1 derived (0 from a secondary source), 6 manual, 1 data-blocked, 0 ambiguous
- **SETUP_COMPLETENESS**: MA – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 5 rows, 1 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **ENTRY_COMPLETENESS**: TEIL – ENTRY_EXECUTION: 3 rows, 0 mechanical, 2 under model assumption, 0 manual, 1 blocked
- **STOP_COMPLETENESS**: PASS – INITIAL_STOP: 1 rows, 1 mechanical, 0 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: MA – POSITION_SIZING+POSITION_MANAGEMENT: 3 rows, 1 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **EXIT_COMPLETENESS**: MA – EXIT_CONDITIONS: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 7 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✓, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C09 SF_KK_EPISODIC_PIVOT – VALIDATION_BLOCKED

- **SOURCE_FIDELITY**: PASS* – contract 1.1.0: 4 exact, 1 derived (0 from a secondary source), 3 manual, 3 data-blocked, 1 ambiguous
- **SETUP_COMPLETENESS**: MA – CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT; CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **ENTRY_COMPLETENESS**: MA – CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT; CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **STOP_COMPLETENESS**: MA – CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT; CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **POSITION_MANAGEMENT**: MA – CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT; CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **EXIT_COMPLETENESS**: MA – CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT; CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **PORTFOLIO_ACCOUNTING**: NICHT BELEGT – -
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: KK-SF-EP-CATALYST, KK-SF-EP-VOLUME, KK-SF-EP-ENTRY
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – not a snapshot lifecycle (EP / PS candidate days come from the same snapshot; not separately contained)
- **EXECUTION_REALISM**: MA – IEX venue minutes only (1-5 % of consolidated volume); buy stop resolved in time order
- **BACKTEST_REPRODUCIBILITY**: PASS* – snapshot + private IEX cache (not frozen in the snapshot)
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – IEX minutes start 2017: no second period
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 2 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✗, CC-3-NO-MANUAL ✗, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C10 SF_KK_PARABOLIC_SHORT – VALIDATION_BLOCKED

- **SOURCE_FIDELITY**: PASS* – contract 1.1.0: 3 exact, 0 derived (0 from a secondary source), 4 manual, 3 data-blocked, 0 ambiguous
- **SETUP_COMPLETENESS**: MA – CHART_PS_SHORT_MODEL_STUDY_TRADE_LEVEL_NO_BORROW_DATA_NOT_EXECUTABLE; CHART_PS_TRADE_LEVEL_SHORT_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **ENTRY_COMPLETENESS**: MA – CHART_PS_SHORT_MODEL_STUDY_TRADE_LEVEL_NO_BORROW_DATA_NOT_EXECUTABLE; CHART_PS_TRADE_LEVEL_SHORT_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **STOP_COMPLETENESS**: MA – CHART_PS_SHORT_MODEL_STUDY_TRADE_LEVEL_NO_BORROW_DATA_NOT_EXECUTABLE; CHART_PS_TRADE_LEVEL_SHORT_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **POSITION_MANAGEMENT**: MA – CHART_PS_SHORT_MODEL_STUDY_TRADE_LEVEL_NO_BORROW_DATA_NOT_EXECUTABLE; CHART_PS_TRADE_LEVEL_SHORT_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **EXIT_COMPLETENESS**: MA – CHART_PS_SHORT_MODEL_STUDY_TRADE_LEVEL_NO_BORROW_DATA_NOT_EXECUTABLE; CHART_PS_TRADE_LEVEL_SHORT_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **PORTFOLIO_ACCOUNTING**: TEIL – hypothetical one-unit short single-trade study; no portfolio
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: KK-SF-PS-BORROW, KK-SF-PS-ENTRY, KK-SF-PS-STOP
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – not a snapshot lifecycle (EP / PS candidate days come from the same snapshot; not separately contained)
- **EXECUTION_REALISM**: GESPERRT – short execution hypothetical: no historical borrow, locates or fees
- **BACKTEST_REPRODUCIBILITY**: PASS* – snapshot + private IEX cache (not frozen in the snapshot)
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – IEX minutes start 2017: no second period
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 4 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✓, CC-2-LIFECYCLE ✗, CC-3-NO-MANUAL ✗, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C11 SF_MOKA_POCKET_PIVOT – SOURCE_BLOCKED

- **SOURCE_FIDELITY**: PASS* – contract 1.3.0: 1 exact, 3 derived (0 from a secondary source), 5 manual, 0 data-blocked, 1 ambiguous
- **SETUP_COMPLETENESS**: MA – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 3 rows, 1 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **ENTRY_COMPLETENESS**: TEIL – ENTRY_EXECUTION: 2 rows, 0 mechanical, 1 under model assumption, 0 manual, 1 blocked
- **STOP_COMPLETENESS**: TEIL – INITIAL_STOP: 1 rows, 0 mechanical, 0 under model assumption, 1 manual, 0 blocked
- **POSITION_MANAGEMENT**: MA – POSITION_SIZING+POSITION_MANAGEMENT: 2 rows, 0 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 2 rows, 0 mechanical, 1 under model assumption, 1 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 7 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✗, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C12 SF_MOKA_BUYABLE_GAP_UP – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.3.0: 2 exact, 2 derived (0 from a secondary source), 6 manual, 0 data-blocked, 2 ambiguous
- **SETUP_COMPLETENESS**: TEIL – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 5 rows, 1 mechanical, 3 under model assumption, 1 manual, 0 blocked
- **ENTRY_COMPLETENESS**: TEIL – ENTRY_EXECUTION: 2 rows, 0 mechanical, 1 under model assumption, 0 manual, 1 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 1 rows, 0 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: MA – POSITION_SIZING+POSITION_MANAGEMENT: 2 rows, 0 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 2 rows, 0 mechanical, 1 under model assumption, 1 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 8 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C13 SF_RASCHKE_HOLY_GRAIL – SOURCE_BLOCKED

- **SOURCE_FIDELITY**: PASS* – contract 1.2.1: 2 exact, 4 derived (2 from a secondary source), 2 manual, 0 data-blocked, 1 ambiguous
- **SETUP_COMPLETENESS**: MA – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 5 rows, 2 mechanical, 3 under model assumption, 0 manual, 0 blocked
- **ENTRY_COMPLETENESS**: TEIL – ENTRY_EXECUTION: 2 rows, 0 mechanical, 1 under model assumption, 0 manual, 1 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 1 rows, 0 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 2 rows, 0 mechanical, 1 under model assumption, 1 manual, 0 blocked
- **EXIT_COMPLETENESS**: MA – EXIT_CONDITIONS: 1 rows, 0 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – no SF6 integrity run recorded
- **EXECUTION_REALISM**: MA – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity not yet measured
- **BACKTEST_REPRODUCIBILITY**: NICHT BELEGT – -
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – no untouched holdout; DEV 2016-2026 read by earlier rounds
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 3 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✗, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗
