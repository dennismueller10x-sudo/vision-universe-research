# Supertrader 6.0 – Certification-Readiness-Matrix (generiert)

Erzeugt von `scripts/supertrader/source-faithful/completion/build-sf6-readiness.mjs` aus Artefakten und Lauf-Receipts. Kriterien `sf6-readiness-criteria-1.2.0` (Fingerabdruck `4fb413783c04…`), festgeschrieben vor dem ersten Supertrader-6.0-Ergebnis. Keine Note ist von Hand gesetzt; keine Kennzahl geht ein.

Eigentümerentscheidungen E1–E6 vom 24.10.2026 sind eingearbeitet: V4-D1 bleibt ein offener Datenintegritätsblocker (CC-5 nie durch die Quarantäne erfüllt); CC-8 nur aus dem prospektiven Paper-Protokoll `SF6-PAPER-2027` 1.0.0 ab 2027-01-01 (NOT_ACTIVATED, Fingerabdruck `c90c30bcf018…`); Modellvarianten und SIC-Proxys zählen nie.

Legende: PASS = belegt; PASS* = belegt mit deklarierten Grenzen; MA = nur unter deklarierter Modellannahme; TEIL = teilweise (manuell oder Lücke); GESPERRT = gesperrt; NICHT BELEGT = keine Evidenz.

| # | Strategie | Abschlusszustand | source fidelity | setup completeness | entry completeness | stop completeness | position management | exit completeness | portfolio accounting | pit data integrity | corporate action integrity | execution realism | backtest reproducibility | out of sample evidence | manual review requirements | certification readiness | live readiness |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 | SF_TURTLE_S1 | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | PASS* | PASS* | PASS* | PASS* | PASS* | PASS* | TEIL | TEIL | PASS* | PASS | PASS* | PASS | GESPERRT | GESPERRT |
| C02 | SF_TURTLE_S2 | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS | PASS* | PASS* | PASS* | PASS* | PASS* | PASS* | TEIL | TEIL | PASS* | PASS | PASS* | PASS | GESPERRT | GESPERRT |
| C03 | SF_DARVAS_BOX | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | MA | MA | MA | TEIL | PASS | PASS* | PASS* | TEIL | PASS* | PASS | PASS* | TEIL | GESPERRT | GESPERRT |
| C04 | SF_WEINSTEIN_INVESTOR | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | TEIL | MA | MA | TEIL | TEIL | PASS* | TEIL | TEIL | PASS* | PASS | PASS* | TEIL | GESPERRT | GESPERRT |
| C05 | SF_WEINSTEIN_TRADER | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | TEIL | MA | MA | TEIL | TEIL | PASS* | TEIL | TEIL | PASS* | PASS | PASS* | TEIL | GESPERRT | GESPERRT |
| C06 | SF_MINERVINI_SEPA_VCP | RESEARCH_COMPLETE_WITH_EXCEPTIONS | TEIL | TEIL | MA | MA | TEIL | TEIL | PASS* | TEIL | TEIL | PASS* | PASS | PASS* | TEIL | GESPERRT | GESPERRT |
| C07 | SF_MINERVINI_POWER_PLAY | RESEARCH_COMPLETE_WITH_EXCEPTIONS | TEIL | TEIL | MA | MA | TEIL | TEIL | PASS* | PASS* | TEIL | PASS* | PASS | PASS* | TEIL | GESPERRT | GESPERRT |
| C08 | SF_KK_BREAKOUT | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | MA | TEIL | PASS | MA | MA | PASS* | PASS* | TEIL | PASS* | PASS | PASS* | TEIL | GESPERRT | GESPERRT |
| C09 | SF_KK_EPISODIC_PIVOT | VALIDATION_BLOCKED | PASS* | MA | MA | MA | MA | MA | PASS* | TEIL | NICHT BELEGT | MA | PASS* | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C10 | SF_KK_PARABOLIC_SHORT | VALIDATION_BLOCKED | PASS* | MA | MA | MA | MA | MA | TEIL | TEIL | NICHT BELEGT | GESPERRT | PASS* | NICHT BELEGT | TEIL | GESPERRT | GESPERRT |
| C11 | SF_MOKA_POCKET_PIVOT | SOURCE_BLOCKED | PASS* | MA | TEIL | TEIL | MA | TEIL | PASS* | PASS* | TEIL | PASS* | PASS | PASS* | TEIL | GESPERRT | GESPERRT |
| C12 | SF_MOKA_BUYABLE_GAP_UP | RESEARCH_COMPLETE_WITH_EXCEPTIONS | PASS* | TEIL | TEIL | MA | MA | TEIL | PASS* | PASS* | TEIL | PASS* | PASS | PASS* | TEIL | GESPERRT | GESPERRT |
| C13 | SF_RASCHKE_HOLY_GRAIL | SOURCE_BLOCKED | PASS* | MA | TEIL | MA | TEIL | MA | PASS* | PASS* | TEIL | PASS* | PASS | PASS* | TEIL | GESPERRT | GESPERRT |

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
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 15 of 820 reference trades directly exposed (1.83 %, above the reported bound of 1 %); 128 unchanged, 646 removed, 46 changed (knock-on 678)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39397517900: ledger hash EQUAL, trade hash NOT_PUBLISHED_BY_REFERENCE
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 716 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: PASS – none
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_HASH_IDENTICAL; Trade-Stabilität 128 of 820 trades unchanged (16 %) unter DQ-K5, Kosten 50 bps 820 -> 923 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✓, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗

### C02 SF_TURTLE_S2 – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS – contract 1.2.0: 7 exact, 12 derived (0 from a secondary source), 0 manual, 2 data-blocked, 0 ambiguous
- **SETUP_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **ENTRY_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **STOP_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **POSITION_MANAGEMENT**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **EXIT_COMPLETENESS**: PASS* – RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION; acceptance gate AG-1..AG-7; data exception TUR-SF-LIMIT-CORR
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: TUR-SF-LIMIT-CORR
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 11 of 559 reference trades directly exposed (1.97 %, above the reported bound of 1 %); 324 unchanged, 223 removed, 12 changed (knock-on 224)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39397517900: ledger hash EQUAL, trade hash NOT_PUBLISHED_BY_REFERENCE
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 530 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: PASS – none
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_HASH_IDENTICAL; Trade-Stabilität 324 of 559 trades unchanged (58 %) unter DQ-K5, Kosten 50 bps 559 -> 466 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✓, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✓, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗

### C03 SF_DARVAS_BOX – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.3.1: 3 exact, 10 derived (0 from a secondary source), 6 manual, 0 data-blocked, 1 ambiguous
- **SETUP_COMPLETENESS**: MA – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 8 rows, 2 mechanical, 6 under model assumption, 0 manual, 0 blocked
- **ENTRY_COMPLETENESS**: MA – ENTRY_EXECUTION: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 3 rows, 1 mechanical, 1 under model assumption, 1 manual, 0 blocked
- **EXIT_COMPLETENESS**: PASS – EXIT_CONDITIONS: 1 rows, 1 mechanical, 0 under model assumption, 0 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 20 of 19556 reference trades directly exposed (0.10 %); 18058 unchanged, 88 removed, 1410 changed (knock-on 1493)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39939890956: ledger hash EQUAL, trade hash EQUAL
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 11869 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 8 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_AND_TRADE_HASH_IDENTICAL; Trade-Stabilität 18058 of 19556 trades unchanged (92 %) unter DQ-K5, Kosten 50 bps 19556 -> 7343 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗

### C04 SF_WEINSTEIN_INVESTOR – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.2.0: 1 exact, 5 derived (0 from a secondary source), 9 manual, 2 data-blocked, 0 ambiguous
- **SETUP_COMPLETENESS**: TEIL – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 7 rows, 3 mechanical, 2 under model assumption, 0 manual, 2 blocked
- **ENTRY_COMPLETENESS**: MA – ENTRY_EXECUTION: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 4 rows, 0 mechanical, 2 under model assumption, 2 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 3 rows, 1 mechanical, 1 under model assumption, 1 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: WEIN-SF-GROUP, WEIN-SF-MARKET
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 0 of 1348 reference trades directly exposed (0.00 %); 311 unchanged, 121 removed, 916 changed (knock-on 1037)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39939890956: ledger hash EQUAL, trade hash EQUAL
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 995 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 14 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_AND_TRADE_HASH_IDENTICAL; Trade-Stabilität 311 of 1348 trades unchanged (23 %) unter DQ-K5, Kosten 50 bps 1348 -> 1339 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✓, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗

### C05 SF_WEINSTEIN_TRADER – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.2.0: 1 exact, 5 derived (0 from a secondary source), 8 manual, 2 data-blocked, 0 ambiguous
- **SETUP_COMPLETENESS**: TEIL – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 7 rows, 3 mechanical, 2 under model assumption, 0 manual, 2 blocked
- **ENTRY_COMPLETENESS**: MA – ENTRY_EXECUTION: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 3 rows, 0 mechanical, 2 under model assumption, 1 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 4 rows, 1 mechanical, 1 under model assumption, 2 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: WEIN-SF-GROUP, WEIN-SF-MARKET
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 4 of 1808 reference trades directly exposed (0.22 %); 373 unchanged, 473 removed, 962 changed (knock-on 1431)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39939890956: ledger hash EQUAL, trade hash EQUAL
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 1296 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 12 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_AND_TRADE_HASH_IDENTICAL; Trade-Stabilität 373 of 1808 trades unchanged (21 %) unter DQ-K5, Kosten 50 bps 1808 -> 1859 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✓, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗

### C06 SF_MINERVINI_SEPA_VCP – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: TEIL – contract 1.3.0: 0 exact, 11 derived (0 from a secondary source), 7 manual, 1 data-blocked, 0 ambiguous; wording only via translation
- **SETUP_COMPLETENESS**: TEIL – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 19 rows, 4 mechanical, 6 under model assumption, 4 manual, 2 blocked
- **ENTRY_COMPLETENESS**: MA – ENTRY_EXECUTION: 5 rows, 0 mechanical, 5 under model assumption, 0 manual, 0 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 3 rows, 1 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 8 rows, 1 mechanical, 4 under model assumption, 3 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 5 rows, 0 mechanical, 3 under model assumption, 2 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: MIN-SF-TT-8
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 0 of 954 reference trades directly exposed (0.00 %); 901 unchanged, 14 removed, 39 changed (knock-on 53)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39746264325: ledger hash EQUAL, trade hash EQUAL
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 522 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 11 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_AND_TRADE_HASH_IDENTICAL; Trade-Stabilität 901 of 954 trades unchanged (94 %) unter DQ-K5, Kosten 50 bps 954 -> 983 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗

### C07 SF_MINERVINI_POWER_PLAY – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: TEIL – contract 1.4.0: 0 exact, 6 derived (0 from a secondary source), 4 manual, 0 data-blocked, 0 ambiguous; wording only via translation
- **SETUP_COMPLETENESS**: TEIL – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 15 rows, 7 mechanical, 5 under model assumption, 1 manual, 0 blocked
- **ENTRY_COMPLETENESS**: MA – ENTRY_EXECUTION: 5 rows, 0 mechanical, 5 under model assumption, 0 manual, 0 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 3 rows, 1 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 8 rows, 1 mechanical, 4 under model assumption, 3 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 5 rows, 0 mechanical, 3 under model assumption, 2 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 10 of 1007 reference trades directly exposed (0.99 %); 108 unchanged, 128 removed, 771 changed (knock-on 889)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39746264325: ledger hash EQUAL, trade hash EQUAL
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 425 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 6 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_AND_TRADE_HASH_IDENTICAL; Trade-Stabilität 108 of 1007 trades unchanged (11 %) unter DQ-K5, Kosten 50 bps 1007 -> 971 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗

### C08 SF_KK_BREAKOUT – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.2.1: 4 exact, 1 derived (0 from a secondary source), 6 manual, 1 data-blocked, 0 ambiguous
- **SETUP_COMPLETENESS**: MA – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 5 rows, 1 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **ENTRY_COMPLETENESS**: TEIL – ENTRY_EXECUTION: 3 rows, 0 mechanical, 2 under model assumption, 0 manual, 1 blocked
- **STOP_COMPLETENESS**: PASS – INITIAL_STOP: 1 rows, 1 mechanical, 0 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: MA – POSITION_SIZING+POSITION_MANAGEMENT: 3 rows, 1 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **EXIT_COMPLETENESS**: MA – EXIT_CONDITIONS: 2 rows, 1 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 31 of 9114 reference trades directly exposed (0.34 %); 2809 unchanged, 1521 removed, 4784 changed (knock-on 6278)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39939890956: ledger hash EQUAL, trade hash EQUAL
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 5722 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 7 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_AND_TRADE_HASH_IDENTICAL; Trade-Stabilität 2809 of 9114 trades unchanged (31 %) unter DQ-K5, Kosten 50 bps 9114 -> 5064 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✓, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗

### C09 SF_KK_EPISODIC_PIVOT – VALIDATION_BLOCKED

- **SOURCE_FIDELITY**: PASS* – contract 1.1.0: 4 exact, 1 derived (0 from a secondary source), 3 manual, 3 data-blocked, 1 ambiguous
- **SETUP_COMPLETENESS**: MA – CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT; CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **ENTRY_COMPLETENESS**: MA – CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT; CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **STOP_COMPLETENESS**: MA – CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT; CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **POSITION_MANAGEMENT**: MA – CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT; CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **EXIT_COMPLETENESS**: MA – CHART_EP_MODEL_STUDY_IEX_INTRADAY_NOT_AN_ORIGINAL_EPISODIC_PIVOT; CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: TEIL – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); data-blocked rules: KK-SF-EP-CATALYST, KK-SF-EP-VOLUME, KK-SF-EP-ENTRY
- **CORPORATE_ACTION_INTEGRITY**: NICHT BELEGT – not a snapshot lifecycle (EP / PS candidate days come from the same snapshot; not separately contained)
- **EXECUTION_REALISM**: MA – IEX venue minutes only (1-5 % of consolidated volume); buy stop resolved in time order
- **BACKTEST_REPRODUCIBILITY**: PASS* – snapshot + private IEX cache (not frozen in the snapshot)
- **OUT_OF_SAMPLE_EVIDENCE**: NICHT BELEGT – IEX minutes start 2017: no second period
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 2 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-4-DATA, CC-5-CORPORATE-ACTIONS, CC-6-REPRODUCIBLE, CC-7-EXECUTION, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit NOT_EVIDENCED; Trade-Stabilität NOT_EVIDENCED; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
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
- **E6**: numerische Reproduzierbarkeit NOT_EVIDENCED; Trade-Stabilität NOT_EVIDENCED; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✓, CC-2-LIFECYCLE ✗, CC-3-NO-MANUAL ✗, CC-4-DATA ✗, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✗, CC-7-EXECUTION ✗, CC-8-OOS ✗

### C11 SF_MOKA_POCKET_PIVOT – SOURCE_BLOCKED

- **SOURCE_FIDELITY**: PASS* – contract 1.3.0: 1 exact, 3 derived (0 from a secondary source), 5 manual, 0 data-blocked, 1 ambiguous
- **SETUP_COMPLETENESS**: MA – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 3 rows, 1 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **ENTRY_COMPLETENESS**: TEIL – ENTRY_EXECUTION: 2 rows, 0 mechanical, 1 under model assumption, 0 manual, 1 blocked
- **STOP_COMPLETENESS**: TEIL – INITIAL_STOP: 1 rows, 0 mechanical, 0 under model assumption, 1 manual, 0 blocked (SF6-Modellvariante MA6-PP-STOP-SIGNAL-DAY-LOW: Phase nur als Modellannahme geschlossen)
- **POSITION_MANAGEMENT**: MA – POSITION_SIZING+POSITION_MANAGEMENT: 2 rows, 0 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 2 rows, 0 mechanical, 1 under model assumption, 1 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 7 of 1872 reference trades directly exposed (0.37 %); 187 unchanged, 627 removed, 1058 changed (knock-on 1678)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39939890956: ledger hash EQUAL, trade hash EQUAL
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 1415 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 7 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_AND_TRADE_HASH_IDENTICAL; Trade-Stabilität 187 of 1872 trades unchanged (10 %) unter DQ-K5, Kosten 50 bps 1872 -> 1845 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✗, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗

### C12 SF_MOKA_BUYABLE_GAP_UP – RESEARCH_COMPLETE_WITH_EXCEPTIONS

- **SOURCE_FIDELITY**: PASS* – contract 1.3.0: 2 exact, 2 derived (0 from a secondary source), 6 manual, 0 data-blocked, 2 ambiguous
- **SETUP_COMPLETENESS**: TEIL – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 5 rows, 1 mechanical, 3 under model assumption, 1 manual, 0 blocked
- **ENTRY_COMPLETENESS**: TEIL – ENTRY_EXECUTION: 2 rows, 0 mechanical, 1 under model assumption, 0 manual, 1 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 1 rows, 0 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: MA – POSITION_SIZING+POSITION_MANAGEMENT: 2 rows, 0 mechanical, 2 under model assumption, 0 manual, 0 blocked
- **EXIT_COMPLETENESS**: TEIL – EXIT_CONDITIONS: 2 rows, 0 mechanical, 1 under model assumption, 1 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 15 of 3415 reference trades directly exposed (0.44 %); 1281 unchanged, 647 removed, 1487 changed (knock-on 2121)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39939890956: ledger hash EQUAL, trade hash EQUAL
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 2116 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 8 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_AND_TRADE_HASH_IDENTICAL; Trade-Stabilität 1281 of 3415 trades unchanged (38 %) unter DQ-K5, Kosten 50 bps 3415 -> 3467 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✓, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗

### C13 SF_RASCHKE_HOLY_GRAIL – SOURCE_BLOCKED

- **SOURCE_FIDELITY**: PASS* – contract 1.2.1: 2 exact, 4 derived (2 from a secondary source), 2 manual, 0 data-blocked, 1 ambiguous
- **SETUP_COMPLETENESS**: MA – SETUP_QUALIFICATION+ENTRY_ELIGIBILITY: 5 rows, 2 mechanical, 3 under model assumption, 0 manual, 0 blocked
- **ENTRY_COMPLETENESS**: TEIL – ENTRY_EXECUTION: 2 rows, 0 mechanical, 1 under model assumption, 0 manual, 1 blocked
- **STOP_COMPLETENESS**: MA – INITIAL_STOP: 1 rows, 0 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **POSITION_MANAGEMENT**: TEIL – POSITION_SIZING+POSITION_MANAGEMENT: 2 rows, 0 mechanical, 1 under model assumption, 1 manual, 0 blocked (SF6-Modellvariante MA6-HG-TRAIL-SWING-LOWS: Phase nur als Modellannahme geschlossen)
- **EXIT_COMPLETENESS**: MA – EXIT_CONDITIONS: 1 rows, 0 mechanical, 1 under model assumption, 0 manual, 0 blocked
- **PORTFOLIO_ACCOUNTING**: PASS* – research-v1 ledger replay reconciled in every snapshot run; platform portfolio policy VU-SF5 / VU-MIN (not an original rule)
- **PIT_DATA_INTEGRITY**: PASS* – snapshot sts1 incl. inactive listings (survivorship: Tiingo ticker list); causal indicators (prefix tests); no data-blocked essential rule
- **CORPORATE_ACTION_INTEGRITY**: TEIL – V4-D1 CONTAINED, NOT RESOLVED (owner decision E1: open data-integrity blocker); DQ-K5 diagnostic: 30 of 4025 reference trades directly exposed (0.75 %); 375 unchanged, 1250 removed, 2400 changed (knock-on 3622)
- **EXECUTION_REALISM**: PASS* – daily bars: PIT entry (next open / resting buy stop), pessimistic intrabar order declared; cost sensitivity 0 / 10 / 20 / 50 bps measured (sealed)
- **BACKTEST_REPRODUCIBILITY**: PASS – frozen snapshot sts1-134d4d62eb88b6ff8d98fe6e56b12a6d, research-v1, reconciled; BASE vs authoritative run 39939890956: ledger hash EQUAL, trade hash EQUAL
- **OUT_OF_SAMPLE_EVIDENCE**: PASS* – historical test period 2008-2015, NOT an untouched holdout (already used: opened once in R14; survivorship-burdened: ticker list incomplete for old delistings, results biased upwards): 3253 reference trades; untouched window only SF6-PAPER-2027 from 2027-01-01 (NOT_ACTIVATED)
- **MANUAL_REVIEW_REQUIREMENTS**: TEIL – 3 essential manual source decisions substituted by declared model assumptions
- **CERTIFICATION_READINESS**: GESPERRT – failed: CC-1-SOURCE, CC-2-LIFECYCLE, CC-3-NO-MANUAL, CC-5-CORPORATE-ACTIONS, CC-8-OOS
- **LIVE_READINESS**: GESPERRT – LIVE_NOT_APPROVED (no live activation, no broker, no orders)
- **E6**: numerische Reproduzierbarkeit LEDGER_AND_TRADE_HASH_IDENTICAL; Trade-Stabilität 375 of 4025 trades unchanged (9 %) unter DQ-K5, Kosten 50 bps 4025 -> 4041 trades; Robustheit NOT_ESTABLISHED (metrics sealed and not assessed; holdout historically used and survivorship-burdened; untouched window only SF6-PAPER-2027)
- Harte Kriterien: CC-1-SOURCE ✗, CC-2-LIFECYCLE ✗, CC-3-NO-MANUAL ✗, CC-4-DATA ✓, CC-5-CORPORATE-ACTIONS ✗, CC-6-REPRODUCIBLE ✓, CC-7-EXECUTION ✓, CC-8-OOS ✗
