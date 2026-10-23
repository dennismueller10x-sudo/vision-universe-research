# Supertrader 2.0 – Strategy Completion Matrix

Generiert aus `scripts/supertrader/source-faithful/artifacts/` mit `node scripts/supertrader/source-faithful/completion/build-completion-docs.mjs`. Nicht von Hand bearbeiten. Alle historischen Aussagen `DIAGNOSTIC_NOT_CERTIFIED`; keine Methode ist live oder handelbar. Bericht: [SUPERTRADER_2_COMPLETE_TRADING_SYSTEMS_REPORT.md](SUPERTRADER_2_COMPLETE_TRADING_SYSTEMS_REPORT.md).

## Status je Kandidat (getrennte Dimensionen)

| Kandidat | Strategie | Engine | Flags | Backtest | Live | blockierende Daten | quellenoffen | manuelle Entscheidungen |
|---|---|---|---|---|---|---|---|---|
| C01 | `SF_TURTLE_S1` | **RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION** | PARTIAL_DATA_BLOCKED, PARTIAL_SOURCE_BLOCKED, BACKTEST_DIAGNOSTIC_READY, LIVE_NOT_APPROVED | DIAGNOSTIC_READY | LIVE_NOT_APPROVED | TUR-SF-LIMIT-CORR | TUR-SF-S1-OPEN-BREAKOUT, TUR-SF-FAILSAFE-EXIT | 0 |
| C02 | `SF_TURTLE_S2` | **RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION** | PARTIAL_DATA_BLOCKED, BACKTEST_DIAGNOSTIC_READY, LIVE_NOT_APPROVED | DIAGNOSTIC_READY | LIVE_NOT_APPROVED | TUR-SF-LIMIT-CORR | – | 0 |
| C03 | `SF_DARVAS_BOX` | **MECHANICAL_SCREEN_COMPLETE** | PARTIAL_DATA_BLOCKED, PARTIAL_SOURCE_BLOCKED, MANUAL_REVIEW_REQUIRED, COMPONENT_STUDY_ONLY, LIVE_NOT_APPROVED | COMPONENT_SIGNAL_STUDY_ONLY | LIVE_NOT_APPROVED | – | DAR-SF-BOTTOM-START | 8 |
| C04 | `SF_WEINSTEIN_INVESTOR` | **MECHANICAL_SCREEN_COMPLETE** | PARTIAL_DATA_BLOCKED, MANUAL_REVIEW_REQUIRED, LIVE_NOT_APPROVED | NOT_READY | LIVE_NOT_APPROVED | WEIN-SF-GROUP, WEIN-SF-MARKET | – | 14 |
| C05 | `SF_WEINSTEIN_TRADER` | **MECHANICAL_SCREEN_COMPLETE** | PARTIAL_DATA_BLOCKED, MANUAL_REVIEW_REQUIRED, LIVE_NOT_APPROVED | NOT_READY | LIVE_NOT_APPROVED | WEIN-SF-GROUP, WEIN-SF-MARKET | – | 12 |
| C06 | `SF_MINERVINI_SEPA_VCP` | **MECHANICAL_SCREEN_COMPLETE** | PARTIAL_DATA_BLOCKED, MANUAL_REVIEW_REQUIRED, LIVE_NOT_APPROVED | NOT_READY | LIVE_NOT_APPROVED | MIN-SF-TT-8 | – | 11 |
| C07 | `SF_MINERVINI_POWER_PLAY` | **MECHANICAL_SCREEN_COMPLETE** | MANUAL_REVIEW_REQUIRED, LIVE_NOT_APPROVED | NOT_READY | LIVE_NOT_APPROVED | – | – | 6 |
| C08 | `SF_KK_BREAKOUT` | **MECHANICAL_SCREEN_COMPLETE** | PARTIAL_DATA_BLOCKED, MANUAL_REVIEW_REQUIRED, LIVE_NOT_APPROVED | NOT_READY | LIVE_NOT_APPROVED | – | – | 7 |
| C09 | `SF_KK_EPISODIC_PIVOT` | **MECHANICAL_COMPONENTS_ONLY** | PARTIAL_DATA_BLOCKED, PARTIAL_SOURCE_BLOCKED, MANUAL_REVIEW_REQUIRED, LIVE_NOT_APPROVED | NOT_READY | LIVE_NOT_APPROVED | KK-SF-EP-CATALYST, KK-SF-EP-VOLUME, KK-SF-EP-ENTRY | KK-SF-EP-EXIT | 2 |
| C10 | `SF_KK_PARABOLIC_SHORT` | **MECHANICAL_COMPONENTS_ONLY** | PARTIAL_DATA_BLOCKED, MANUAL_REVIEW_REQUIRED, LIVE_NOT_APPROVED | NOT_READY | LIVE_NOT_APPROVED | KK-SF-PS-BORROW, KK-SF-PS-ENTRY, KK-SF-PS-STOP | – | 4 |
| C11 | `SF_MOKA_POCKET_PIVOT` | **MECHANICAL_SCREEN_COMPLETE** | PARTIAL_SOURCE_BLOCKED, MANUAL_REVIEW_REQUIRED, LIVE_NOT_APPROVED | NOT_READY | LIVE_NOT_APPROVED | – | MOKA-SF-EXIT-VIOLATION | 7 |
| C12 | `SF_MOKA_BUYABLE_GAP_UP` | **MECHANICAL_SCREEN_COMPLETE** | PARTIAL_DATA_BLOCKED, PARTIAL_SOURCE_BLOCKED, MANUAL_REVIEW_REQUIRED, LIVE_NOT_APPROVED | NOT_READY | LIVE_NOT_APPROVED | – | MOKA-SF-BGU-VOLWINDOW, MOKA-SF-EXIT-VIOLATION | 8 |
| C13 | `SF_RASCHKE_HOLY_GRAIL` | **MECHANICAL_COMPONENTS_ONLY** | PARTIAL_SOURCE_BLOCKED, MANUAL_REVIEW_REQUIRED, LIVE_NOT_APPROVED | NOT_READY | LIVE_NOT_APPROVED | – | RAS-SF-ENTRY, RAS-SF-STOP, RAS-SF-SIZE | 3 |

Engine-Zustände: `RESEARCH_ENGINE_COMPLETE` nur mit bestandenem Acceptance Gate (Abschnitt 6 des Auftrags); `RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION` = Gate bestanden, aber eine wesentliche Regel ist datenblockiert (Mechanik umgesetzt und getestet, in keinem Lauf durchgesetzt); `MECHANICAL_SCREEN_COMPLETE` = jede maschinell entscheidbare, belegte Regel ist umgesetzt und getestet, der Rest ist laut Quelle manuell, datenblockiert oder quellenoffen (ein datenblockierter Filter erscheint als offene Review-Frage und in der Spalte „blockierende Daten“); `MECHANICAL_COMPONENTS_ONLY` = der wesentliche Einstieg ist datenblockiert, nur Komponenten laufen; `INCOMPLETE` = eine Implementierungslücke ist offen oder das Gate nicht bestanden.

## Turtle Acceptance Gate

| Strategie | Prüfung | Ergebnis | Detail |
|---|---|---|---|
| `SF_TURTLE_S1` | AG-1-RULES: every rule of the declared equity scope implemented; a data-blocked rule only with implemented and tested mechanics (declared data exception), an ambiguous rule only with every reading implemented | PASS | TUR-SF-S1-OPEN-BREAKOUT (SOURCE_GAP, readings all implemented); TUR-SF-FAILSAFE-EXIT (SOURCE_GAP, readings all implemented); TUR-SF-LIMIT-CORR (DATA_GAP, mechanics implemented, data missing) |
| `SF_TURTLE_S1` | AG-2-GOLDEN-AND-RULE-TESTS: all golden and rule tests of the method pass (#709 worked examples and synthetic rule cases) | PASS | 30/30 |
| `SF_TURTLE_S1` | AG-3-RECONCILED: execution and accounting reconciled: synthetic ledger replay and every scenario of a snapshot run of the CURRENT code fingerprint | PASS | SF_TURTLE_S1 run 39271055007 (sf-turtle-1.0.0, code n/a, other code: regression reference only): reconciliation PASS; SF_TURTLE_S1 run 39397517900 (sf-turtle-1.2.0, code ae2a51ed86ae, current): reconciliation PASS; SF_TURTLE_S1 run 39392734794 (sf-turtle-1.1.0, code 9372a8f8f92b, other code: regression reference only): reconciliation PASS |
| `SF_TURTLE_S1` | AG-4-NO-LOOKAHEAD: no look-ahead (temporal and warm-up tests) | PASS |  |
| `SF_TURTLE_S1` | AG-5-NO-UNSOURCED-PRICE: no unsourced price assumption: fills follow the source entry / gap rules; every model assumption (unknown intrabar order, source-silent reading) is declared with a reference reading, and each boundable one runs its alternative as a scenario | PASS | MA-TUR-INTRABAR-ORDER: reference entryBarOrder=PESSIMISTIC; alternative entryBarOrder=OPTIMISTIC (scenario ENTRY_BAR_OPTIMISTIC); MA-TUR-HELD-BAR-ORDER: reference fixed; alternative none (fixed convention, declared); MA-TUR-S1-OPEN-BREAKOUT: reference openBreakout=SKIP; alternative openBreakout=TAKE (scenario S1_OPEN_BREAKOUT_TAKEN); MA-TUR-FAILSAFE-EXIT: reference failsafeExit='10D'; alternative failsafeExit='20D' (scenario FAILSAFE_EXIT_20D) |
| `SF_TURTLE_S1` | AG-6-NO-IMPLEMENTATION-GAP: no known implementation gap | PASS |  |
| `SF_TURTLE_S1` | AG-7-REVIEWS: independent reviews: no open HIGH / CRITICAL finding | PASS | open HIGH/CRITICAL 0 |
| `SF_TURTLE_S2` | AG-1-RULES: every rule of the declared equity scope implemented; a data-blocked rule only with implemented and tested mechanics (declared data exception), an ambiguous rule only with every reading implemented | PASS | TUR-SF-LIMIT-CORR (DATA_GAP, mechanics implemented, data missing) |
| `SF_TURTLE_S2` | AG-2-GOLDEN-AND-RULE-TESTS: all golden and rule tests of the method pass (#709 worked examples and synthetic rule cases) | PASS | 23/23 |
| `SF_TURTLE_S2` | AG-3-RECONCILED: execution and accounting reconciled: synthetic ledger replay and every scenario of a snapshot run of the CURRENT code fingerprint | PASS | SF_TURTLE_S2 run 39271055007 (sf-turtle-1.0.0, code n/a, other code: regression reference only): reconciliation PASS; SF_TURTLE_S2 run 39397517900 (sf-turtle-1.2.0, code ae2a51ed86ae, current): reconciliation PASS; SF_TURTLE_S2 run 39392734794 (sf-turtle-1.1.0, code 9372a8f8f92b, other code: regression reference only): reconciliation PASS |
| `SF_TURTLE_S2` | AG-4-NO-LOOKAHEAD: no look-ahead (temporal and warm-up tests) | PASS |  |
| `SF_TURTLE_S2` | AG-5-NO-UNSOURCED-PRICE: no unsourced price assumption: fills follow the source entry / gap rules; every model assumption (unknown intrabar order, source-silent reading) is declared with a reference reading, and each boundable one runs its alternative as a scenario | PASS | MA-TUR-INTRABAR-ORDER: reference entryBarOrder=PESSIMISTIC; alternative entryBarOrder=OPTIMISTIC (scenario ENTRY_BAR_OPTIMISTIC); MA-TUR-HELD-BAR-ORDER: reference fixed; alternative none (fixed convention, declared) |
| `SF_TURTLE_S2` | AG-6-NO-IMPLEMENTATION-GAP: no known implementation gap | PASS |  |
| `SF_TURTLE_S2` | AG-7-REVIEWS: independent reviews: no open HIGH / CRITICAL finding | PASS | open HIGH/CRITICAL 0 |

## Matrix: 15 Dimensionen

ok = vollständig; ok* = vollständig mit deklarierten Grenzen (nicht wesentliche Regel, nur Futures-Original, oder Mechanik umgesetzt mit Daten-/Quellenausnahme); PARTIAL = eine wesentliche Lücke im deklarierten Umfang; n/a = die Quelle gibt der Methode keine Regel dieser Art. Lückenklassen: IMPL = IMPLEMENTATION_GAP, DATA = DATA_GAP, SOURCE = SOURCE_GAP, MANUAL = MANUAL_DECISION, MEAS = MEASUREMENT_GAP, PRODUCT = PRODUCT_GAP.

| Kandidat | D01 | D02 | D03 | D04 | D05 | D06 | D07 | D08 | D09 | D10 | D11 | D12 | D13 | D14 | D15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 | ok | ok* (SOURCE) | ok* (DATA) | ok* (SOURCE) | ok | ok | PARTIAL (DATA) | ok | PARTIAL (DATA) | ok* (MEAS) | ok* (MEAS) | ok | ok | PARTIAL (PRODUCT) | ok |
| C02 | ok | ok | ok* (DATA) | ok | ok | ok | PARTIAL (DATA) | ok | PARTIAL (DATA) | ok* (MEAS) | ok* (MEAS) | ok | ok | PARTIAL (PRODUCT) | ok |
| C03 | ok | PARTIAL (SOURCE/MANUAL) | ok* (MANUAL) | n/a | ok | PARTIAL (MANUAL) | ok* (MANUAL) | PARTIAL (MANUAL) | ok* (DATA) | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |
| C04 | ok | PARTIAL (MANUAL/DATA) | ok | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (DATA) | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |
| C05 | ok | PARTIAL (MANUAL/DATA) | ok | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (DATA) | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |
| C06 | ok | PARTIAL (DATA/MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | n/a | PARTIAL (MANUAL) | PARTIAL (DATA) | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |
| C07 | ok | ok | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | n/a | PARTIAL (MANUAL) | ok | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |
| C08 | ok | PARTIAL (MANUAL) | PARTIAL (MANUAL/DATA) | PARTIAL (MANUAL) | ok | PARTIAL (MANUAL) | n/a | PARTIAL (MANUAL) | ok* (DATA) | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |
| C09 | ok | PARTIAL (MANUAL/DATA) | PARTIAL (DATA) | PARTIAL (SOURCE) | ok | PARTIAL (MANUAL) | n/a | PARTIAL (DATA) | PARTIAL (DATA) | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |
| C10 | ok | PARTIAL (MANUAL/DATA) | PARTIAL (DATA) | PARTIAL (MANUAL) | PARTIAL (DATA) | PARTIAL (MANUAL) | n/a | PARTIAL (DATA) | PARTIAL (DATA) | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |
| C11 | ok | PARTIAL (MANUAL) | n/a | PARTIAL (MANUAL/SOURCE) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | n/a | PARTIAL (MANUAL) | ok | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |
| C12 | ok | PARTIAL (SOURCE/MANUAL) | n/a | PARTIAL (MANUAL/SOURCE) | PARTIAL (MANUAL) | PARTIAL (MANUAL) | n/a | PARTIAL (MANUAL) | ok* (DATA) | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |
| C13 | ok | ok* (MANUAL) | PARTIAL (SOURCE) | PARTIAL (MANUAL) | PARTIAL (SOURCE) | PARTIAL (SOURCE) | n/a | PARTIAL (MANUAL) | ok | ok* (MEAS) | ok* (MEAS) | PARTIAL (MANUAL) | PARTIAL (MEAS) | PARTIAL (PRODUCT) | ok |

D01 = Source Rule Coverage; D02 = Signal Completeness; D03 = Entry Completeness; D04 = Exit Completeness; D05 = Stop Completeness; D06 = Position Sizing; D07 = Portfolio Risk Limits; D08 = Execution Completeness; D09 = Required Data Coverage; D10 = Corporate-Action Handling; D11 = PIT Integrity; D12 = Manual Decision Dependencies; D13 = Backtest Readiness; D14 = Live Readiness; D15 = Missing Tests.

Vorkommen je Dimension über alle Kandidaten (eine Regel kann in mehreren Dimensionen erscheinen, z. B. eine datenblockierte Regel in ihrer Dimension und in D09): IMPLEMENTATION_GAP 0, DATA_GAP 37, SOURCE_GAP 10, MANUAL_DECISION 103, MEASUREMENT_GAP 37, PRODUCT_GAP 13. Offene Implementierungslücken: **0**.

## C01 `SF_TURTLE_S1` (Umfang: EQUITY_ADAPTATION)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 38 #709 rules in scope; HARD 23/27 implemented; 9 excluded with a written reason |
| Signal Completeness | COMPLETE_WITH_DECLARED_LIMITS | SOURCE_GAP | TUR-SF-S1-OPEN-BREAKOUT | ja | DECLARED | umgesetzt | TUR-S1SKIP names a winning last breakout; the source does not say how an open one counts. #709 VU-TUR lists "Hypothetischer noch offener Breakout als Gewinner angenommen" as a VU formalization. Both readings are implemented and reported (model assumption MA-TUR-S1-OPEN-BREAKOUT); neither is the source rule. |
| Entry Completeness | COMPLETE_WITH_DECLARED_LIMITS | DATA_GAP | TUR-SF-SHORT | ja | ORIGINAL_ONLY | – | short side needs historical borrow / locate availability and fees, which are not in the snapshot (#709 data requirement short_interest MISSING). The equity adaptation is long only; short breakouts still feed the System 1 filter. |
| Exit Completeness | COMPLETE_WITH_DECLARED_LIMITS | SOURCE_GAP | TUR-SF-FAILSAFE-EXIT | ja | DECLARED | umgesetzt | The source states only the failsafe ENTRY (TUR-FAILSAFE, HARD / HIGH, implemented as TUR-SF-FAILSAFE). Its exit is not published: #709 VU-TUR "Failsafe-Exit10 ist Auslegung, nicht ausdrücklich veröffentlichte Failsafe-Regel"; #709 revalidation TUR-F-FAILSAFE-55 "Ausstiegsregel für Failsafe-Positionen nicht ausdrücklich genannt"; #712 spec V4 T4-FAILSAFE "exit like S1 (interpretation)". Both readings are implemented and reported (model assumption MA-TUR-FAILSAFE-EXIT): 10-day (reference reading, path FAILSAFE_55 in every trade record) and 20-day (scenario FAILSAFE_EXIT_20D). Neither is SOURCE_EXACT; no reading is chosen by result. |
| Stop Completeness | COMPLETE | – | – | – | – | – |  |
| Position Sizing | COMPLETE | – | – | – | – | – |  |
| Portfolio Risk Limits | PARTIAL | DATA_GAP | TUR-SF-LIMIT-CORR | ja | DECLARED | umgesetzt | the engine enforces both limits whenever a point-in-time group provider is supplied (sf-turtle-1.1.0). The binding is DATA_BLOCKED: the groups are futures market groups; for equities they need point-in-time industry membership or a declared correlation measure. The snapshot has neither (SEC SIC in the repository is CURRENT_ONLY, sic-peer-taxonomy-v1 backtestEligible false), and choosing a correlation threshold would add an unsourced parameter. Research runs therefore report correlationLimits NOT_EVALUATED_NO_PIT_GROUPS. Supertrader 3.0: point-in-time price data allow causal correlation groups, and pre-registered EQUITY MODEL variants are implemented as research (research/turtle-correlation.mjs: RAW / market-residual returns, 63 / 126 / 252 sessions, complete / average / single linkage, absolute and pair-quantile thresholds, explicit unknown policies); the binding stays blocked because the source names no measure, window or threshold (source-open) and no variant is owner-approved. Owner decision 2026-10-21: none of the variants is activated as a trading rule; they stay documented equity research models, no runner change, no change of the Turtle acceptance. Reference runs stay without groups. |
| Execution Completeness | COMPLETE | – | – | – | – | – | signal: intraday on the bar whose high reaches the trigger (stop order resting from the prior close) |
| Required Data Coverage | PARTIAL | DATA_GAP | TUR-SF-LIMIT-CORR | ja | DECLARED | umgesetzt | the engine enforces both limits whenever a point-in-time group provider is supplied (sf-turtle-1.1.0). The binding is DATA_BLOCKED: the groups are futures market groups; for equities they need point-in-time industry membership or a declared correlation measure. The snapshot has neither (SEC SIC in the repository is CURRENT_ONLY, sic-peer-taxonomy-v1 backtestEligible false), and choosing a correlation threshold would add an unsourced parameter. Research runs therefore report correlationLimits NOT_EVALUATED_NO_PIT_GROUPS. Supertrader 3.0: point-in-time price data allow causal correlation groups, and pre-registered EQUITY MODEL variants are implemented as research (research/turtle-correlation.mjs: RAW / market-residual returns, 63 / 126 / 252 sessions, complete / average / single linkage, absolute and pair-quantile thresholds, explicit unknown policies); the binding stays blocked because the source names no measure, window or threshold (source-open) and no variant is owner-approved. Owner decision 2026-10-21: none of the variants is activated as a trading rule; they stay documented equity research models, no runner change, no change of the Turtle acceptance. Reference runs stay without groups. |
| Required Data Coverage | PARTIAL | DATA_GAP | TUR-SF-SHORT | ja | ORIGINAL_ONLY | – | short side needs historical borrow / locate availability and fees, which are not in the snapshot (#709 data requirement short_interest MISSING). The equity adaptation is long only; short breakouts still feed the System 1 filter. |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | COMPLETE | – | – | – | – | – |  |
| Backtest Readiness | COMPLETE | – | – | – | – | – |  |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C02 `SF_TURTLE_S2` (Umfang: EQUITY_ADAPTATION)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 35 #709 rules in scope; HARD 20/24 implemented; 9 excluded with a written reason |
| Signal Completeness | COMPLETE | – | – | – | – | – |  |
| Entry Completeness | COMPLETE_WITH_DECLARED_LIMITS | DATA_GAP | TUR-SF-SHORT | ja | ORIGINAL_ONLY | – | short side needs historical borrow / locate availability and fees, which are not in the snapshot (#709 data requirement short_interest MISSING). The equity adaptation is long only; short breakouts still feed the System 1 filter. |
| Exit Completeness | COMPLETE | – | – | – | – | – |  |
| Stop Completeness | COMPLETE | – | – | – | – | – |  |
| Position Sizing | COMPLETE | – | – | – | – | – |  |
| Portfolio Risk Limits | PARTIAL | DATA_GAP | TUR-SF-LIMIT-CORR | ja | DECLARED | umgesetzt | the engine enforces both limits whenever a point-in-time group provider is supplied (sf-turtle-1.1.0). The binding is DATA_BLOCKED: the groups are futures market groups; for equities they need point-in-time industry membership or a declared correlation measure. The snapshot has neither (SEC SIC in the repository is CURRENT_ONLY, sic-peer-taxonomy-v1 backtestEligible false), and choosing a correlation threshold would add an unsourced parameter. Research runs therefore report correlationLimits NOT_EVALUATED_NO_PIT_GROUPS. Supertrader 3.0: point-in-time price data allow causal correlation groups, and pre-registered EQUITY MODEL variants are implemented as research (research/turtle-correlation.mjs: RAW / market-residual returns, 63 / 126 / 252 sessions, complete / average / single linkage, absolute and pair-quantile thresholds, explicit unknown policies); the binding stays blocked because the source names no measure, window or threshold (source-open) and no variant is owner-approved. Owner decision 2026-10-21: none of the variants is activated as a trading rule; they stay documented equity research models, no runner change, no change of the Turtle acceptance. Reference runs stay without groups. |
| Execution Completeness | COMPLETE | – | – | – | – | – | signal: intraday on the bar whose high reaches the trigger (stop order resting from the prior close) |
| Required Data Coverage | PARTIAL | DATA_GAP | TUR-SF-LIMIT-CORR | ja | DECLARED | umgesetzt | the engine enforces both limits whenever a point-in-time group provider is supplied (sf-turtle-1.1.0). The binding is DATA_BLOCKED: the groups are futures market groups; for equities they need point-in-time industry membership or a declared correlation measure. The snapshot has neither (SEC SIC in the repository is CURRENT_ONLY, sic-peer-taxonomy-v1 backtestEligible false), and choosing a correlation threshold would add an unsourced parameter. Research runs therefore report correlationLimits NOT_EVALUATED_NO_PIT_GROUPS. Supertrader 3.0: point-in-time price data allow causal correlation groups, and pre-registered EQUITY MODEL variants are implemented as research (research/turtle-correlation.mjs: RAW / market-residual returns, 63 / 126 / 252 sessions, complete / average / single linkage, absolute and pair-quantile thresholds, explicit unknown policies); the binding stays blocked because the source names no measure, window or threshold (source-open) and no variant is owner-approved. Owner decision 2026-10-21: none of the variants is activated as a trading rule; they stay documented equity research models, no runner change, no change of the Turtle acceptance. Reference runs stay without groups. |
| Required Data Coverage | PARTIAL | DATA_GAP | TUR-SF-SHORT | ja | ORIGINAL_ONLY | – | short side needs historical borrow / locate availability and fees, which are not in the snapshot (#709 data requirement short_interest MISSING). The equity adaptation is long only; short breakouts still feed the System 1 filter. |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | COMPLETE | – | – | – | – | – |  |
| Backtest Readiness | COMPLETE | – | – | – | – | – |  |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C03 `SF_DARVAS_BOX` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 35 #709 rules in scope; HARD 10/10 implemented; 11 excluded with a written reason |
| Signal Completeness | PARTIAL | SOURCE_GAP | DAR-SF-BOTTOM-START | ja | DECLARED | umgesetzt | #709 VU-DAR records the start (after the top day vs after top confirmation) as UNRESOLVED; both are implemented and the record names the variant. Default AFTER_TOP_DAY: lows already traded after the top day are not discarded, so the bottom (and a stop raised under it) never lies inside the traded range (review SF-R1-04); AFTER_TOP_CONFIRMED is the variant |
| Signal Completeness | PARTIAL | MANUAL_DECISION | DAR-SF-SELECTION | ja | DECLARED | – | techno-fundamental selection (industry growth, strongest stock of the industry, earning power) |
| Signal Completeness | PARTIAL | MANUAL_DECISION | DAR-SF-VOLUME | ja | DECLARED | – | volume relative to the stock's own history; the machine reports breakout-day volume against its own prior sessions as evidence |
| Signal Completeness | PARTIAL | MANUAL_DECISION | DAR-SF-MARKET | ja | DECLARED | – | market trend and industry representatives |
| Entry Completeness | COMPLETE_WITH_DECLARED_LIMITS | MANUAL_DECISION | DAR-SF-REENTRY | nein | DECLARED | – | after a stop-out new all-time highs can allow a re-entry; the machine reports later boxes, the reviewer decides |
| Exit Completeness | NOT_APPLICABLE | – | – | – | – | – | the source assigns no rule of this kind to the method |
| Stop Completeness | COMPLETE | – | – | – | – | – |  |
| Position Sizing | PARTIAL | MANUAL_DECISION | DAR-SF-SIZING | ja | DECLARED | – | position size and pilot buys |
| Portfolio Risk Limits | COMPLETE_WITH_DECLARED_LIMITS | MANUAL_DECISION | DAR-SF-PYRAMID | nein | DECLARED | – | further buys while the confirmed up-trend continues (no absolute "every add above every earlier fill", DAR-C3) |
| Execution Completeness | PARTIAL | MANUAL_DECISION | – | ja | DECLARED | – | no mechanical order: the first session after the box is complete whose high reaches the trigger; fill = max(open, trigger) |
| Required Data Coverage | COMPLETE_WITH_DECLARED_LIMITS | DATA_GAP | DAR-Q9 | nein | DECLARED | – | DAR-Q9: the snapshot series start at the 2015-01-01 warm-up, not at the listing date; the all-time high is only checked within the available history and flagged ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | DAR-MR-SELECTION | ja | DECLARED | – | techno-fundamental selection: industry growth expectation, strongest stock of the industry, expected earning power |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | DAR-MR-VOLUME | ja | DECLARED | – | volume relative to the stock's own history (no general minimum) |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | DAR-MR-MARKET | ja | DECLARED | – | market trend and relevant industry representatives |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | DAR-MR-SIZING | ja | DECLARED | – | position size, pilot buys and adds are the reviewer's decision; personal exceptions (DAR-C1, DAR-C3, DAR-C6) are not generalized |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | DAR-MR-FRACTION | nein | DECLARED | – | "a fraction": the machine uses one raw cent; the reviewer may set another fraction per trade (DAR-C-THIO) |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | component signal study only: sizing / selection are manual, no method return can be measured |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C04 `SF_WEINSTEIN_INVESTOR` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 56 #709 rules in scope; HARD 4/14 implemented; 17 excluded with a written reason |
| Signal Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-STAGE | ja | DECLARED | – | stage classification (no Stage 3 buys, no Stage 4 buys or holds); the machine reports MA slope and price-to-MA as evidence, the stage is the reviewer's call |
| Signal Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-VOLUME | ja | DECLARED | umgesetzt | clear volume confirmation of the breakout; the machine evaluates the three printed alternatives and reports which hold; no single magic multiplier is enforced (WEIN-VOL4) |
| Signal Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-RS | ja | DECLARED | umgesetzt | relative strength vs a consistent market index: negative AND still poor RS = no buy; below zero but clearly improving may be bought; the machine reports the RS line, its 52-week-normalised level and its recent trend as evidence (no RS > 0 gate) |
| Signal Completeness | PARTIAL | DATA_GAP | WEIN-SF-GROUP | ja | DECLARED | – | point-in-time industry group membership and group charts are not in the snapshot (#709 industry PARTIAL); no substitute is invented. Supertrader 3.0: PIT SEC SIC membership and a VU PROXY group chart exist as research evidence (research/industry-strength.mjs: equal-weight chain index, group MA30w relation, group RS, breadth, volume, rotation; cap weighting DATA_BLOCKED without PIT shares); SIC is not Weinstein's group list, so the rule stays DATA_BLOCKED and the group stage stays the reviewer's call. Owner decision 2026-10-21: SIC3 with at least five members (SIC3-EW-MIN5-400D-WIDE) may be used as a clearly labelled research reference, never as SOURCE_EXACT and never as a binding trading gate |
| Signal Completeness | PARTIAL | DATA_GAP | WEIN-SF-MARKET | ja | DECLARED | umgesetzt | Weinstein judges the market with stage analysis plus breadth (Momentum Index, new highs / lows, foreign indices); NYSE advance / decline and new-high history is not in the snapshot. The SPY 30-week stage is reported as evidence only; Supertrader 3.0 adds research-universe breadth (research/market-breadth.mjs, labelled VU_UNIVERSE_BREADTH_PROXY_NOT_NYSE). |
| Signal Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-OVERHEAD | ja | DECLARED | – | avoid strong nearby overhead resistance; the machine reports the nearest higher weekly high in the available history and its age |
| Entry Completeness | COMPLETE | – | – | – | – | – |  |
| Exit Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-INV-TRAIL | ja | DECLARED | – | raise the stop after a significant correction and recovery; protect under the rising MA and the relevant low; a slight MA undercut with intact low is no forced sale; sell half in Stage 3 |
| Exit Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-VOL5 | nein | DECLARED | – | if the buy stop filled without volume confirmation, sell into the first small strength |
| Stop Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-INV-STOP | ja | DECLARED | umgesetzt | investor stop below a significant correction low; the machine proposes the lowest weekly low of the base, the reviewer decides |
| Position Sizing | PARTIAL | MANUAL_DECISION | WEIN-SF-INV-SIZE | ja | DECLARED | – | half of the planned position at the breakout, the other half on a constructive pullback with contracting volume; do not only wait for pullbacks; roughly equal dollar amounts per position |
| Portfolio Risk Limits | PARTIAL | MANUAL_DECISION | WEIN-SF-NO-AVG-DOWN | ja | DECLARED | – | never average down into a negative situation; add only on confirmation |
| Execution Completeness | PARTIAL | MANUAL_DECISION | – | ja | DECLARED | – | no mechanical order: a reviewer decision after the week closes; never back-filled into history |
| Required Data Coverage | PARTIAL | DATA_GAP | WEIN-SF-GROUP | ja | DECLARED | – | point-in-time industry group membership and group charts are not in the snapshot (#709 industry PARTIAL); no substitute is invented. Supertrader 3.0: PIT SEC SIC membership and a VU PROXY group chart exist as research evidence (research/industry-strength.mjs: equal-weight chain index, group MA30w relation, group RS, breadth, volume, rotation; cap weighting DATA_BLOCKED without PIT shares); SIC is not Weinstein's group list, so the rule stays DATA_BLOCKED and the group stage stays the reviewer's call. Owner decision 2026-10-21: SIC3 with at least five members (SIC3-EW-MIN5-400D-WIDE) may be used as a clearly labelled research reference, never as SOURCE_EXACT and never as a binding trading gate |
| Required Data Coverage | PARTIAL | DATA_GAP | WEIN-SF-MARKET | ja | DECLARED | umgesetzt | Weinstein judges the market with stage analysis plus breadth (Momentum Index, new highs / lows, foreign indices); NYSE advance / decline and new-high history is not in the snapshot. The SPY 30-week stage is reported as evidence only; Supertrader 3.0 adds research-universe breadth (research/market-breadth.mjs, labelled VU_UNIVERSE_BREADTH_PROXY_NOT_NYSE). |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | WEIN-MR-STAGE | ja | DECLARED | – | is this an early Stage 2 breakout out of a Stage 1 base? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | WEIN-MR-VOLUME | ja | DECLARED | – | is the volume confirmation clear (alternatives A / B / C reported)? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | WEIN-MR-RS | ja | DECLARED | – | is RS negative and still poor (no buy), or below zero but clearly improving? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | WEIN-MR-OVERHEAD | ja | DECLARED | – | strong overhead resistance nearby? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | WEIN-MR-GROUP | ja | DECLARED | – | industry group stage (no data in the machine) |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | WEIN-MR-STOP | ja | DECLARED | – | which correction low is significant for the initial stop? |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C05 `SF_WEINSTEIN_TRADER` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 63 #709 rules in scope; HARD 4/14 implemented; 31 excluded with a written reason |
| Signal Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-STAGE | ja | DECLARED | – | stage classification (no Stage 3 buys, no Stage 4 buys or holds); the machine reports MA slope and price-to-MA as evidence, the stage is the reviewer's call |
| Signal Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-VOLUME | ja | DECLARED | umgesetzt | clear volume confirmation of the breakout; the machine evaluates the three printed alternatives and reports which hold; no single magic multiplier is enforced (WEIN-VOL4) |
| Signal Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-RS | ja | DECLARED | umgesetzt | relative strength vs a consistent market index: negative AND still poor RS = no buy; below zero but clearly improving may be bought; the machine reports the RS line, its 52-week-normalised level and its recent trend as evidence (no RS > 0 gate) |
| Signal Completeness | PARTIAL | DATA_GAP | WEIN-SF-GROUP | ja | DECLARED | – | point-in-time industry group membership and group charts are not in the snapshot (#709 industry PARTIAL); no substitute is invented. Supertrader 3.0: PIT SEC SIC membership and a VU PROXY group chart exist as research evidence (research/industry-strength.mjs: equal-weight chain index, group MA30w relation, group RS, breadth, volume, rotation; cap weighting DATA_BLOCKED without PIT shares); SIC is not Weinstein's group list, so the rule stays DATA_BLOCKED and the group stage stays the reviewer's call. Owner decision 2026-10-21: SIC3 with at least five members (SIC3-EW-MIN5-400D-WIDE) may be used as a clearly labelled research reference, never as SOURCE_EXACT and never as a binding trading gate |
| Signal Completeness | PARTIAL | DATA_GAP | WEIN-SF-MARKET | ja | DECLARED | umgesetzt | Weinstein judges the market with stage analysis plus breadth (Momentum Index, new highs / lows, foreign indices); NYSE advance / decline and new-high history is not in the snapshot. The SPY 30-week stage is reported as evidence only; Supertrader 3.0 adds research-universe breadth (research/market-breadth.mjs, labelled VU_UNIVERSE_BREADTH_PROXY_NOT_NYSE). |
| Signal Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-OVERHEAD | ja | DECLARED | – | avoid strong nearby overhead resistance; the machine reports the nearest higher weekly high in the available history and its age |
| Entry Completeness | COMPLETE | – | – | – | – | – |  |
| Exit Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-TR-TRAIL | ja | DECLARED | – | ignore corrections under 7 %; after a significant correction and recovery raise the stop under the reaction low; do not wait for the MA break; exit earlier than investors at a Stage 3 top |
| Stop Completeness | PARTIAL | MANUAL_DECISION | WEIN-SF-TR-STOP | ja | DECLARED | umgesetzt | trader stop below the next relevant reaction low; the machine proposes the consolidation low, the reviewer decides |
| Position Sizing | PARTIAL | MANUAL_DECISION | WEIN-SF-TR-SIZE | ja | DECLARED | – | buy the full planned position at the continuation breakout (amount is the reviewer's) |
| Portfolio Risk Limits | PARTIAL | MANUAL_DECISION | WEIN-SF-NO-AVG-DOWN | ja | DECLARED | – | never average down into a negative situation; add only on confirmation |
| Execution Completeness | PARTIAL | MANUAL_DECISION | – | ja | DECLARED | – | no mechanical order: a reviewer decision after the week closes; never back-filled into history |
| Required Data Coverage | PARTIAL | DATA_GAP | WEIN-SF-GROUP | ja | DECLARED | – | point-in-time industry group membership and group charts are not in the snapshot (#709 industry PARTIAL); no substitute is invented. Supertrader 3.0: PIT SEC SIC membership and a VU PROXY group chart exist as research evidence (research/industry-strength.mjs: equal-weight chain index, group MA30w relation, group RS, breadth, volume, rotation; cap weighting DATA_BLOCKED without PIT shares); SIC is not Weinstein's group list, so the rule stays DATA_BLOCKED and the group stage stays the reviewer's call. Owner decision 2026-10-21: SIC3 with at least five members (SIC3-EW-MIN5-400D-WIDE) may be used as a clearly labelled research reference, never as SOURCE_EXACT and never as a binding trading gate |
| Required Data Coverage | PARTIAL | DATA_GAP | WEIN-SF-MARKET | ja | DECLARED | umgesetzt | Weinstein judges the market with stage analysis plus breadth (Momentum Index, new highs / lows, foreign indices); NYSE advance / decline and new-high history is not in the snapshot. The SPY 30-week stage is reported as evidence only; Supertrader 3.0 adds research-universe breadth (research/market-breadth.mjs, labelled VU_UNIVERSE_BREADTH_PROXY_NOT_NYSE). |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | WEIN-MR-STAGE | ja | DECLARED | – | is the stock in Stage 2 (not a Stage 3 top)? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | WEIN-MR-VOLUME | ja | DECLARED | – | is the volume confirmation clear? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | WEIN-MR-GROUP | ja | DECLARED | – | industry group stage (no data in the machine) |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | WEIN-MR-STOP | ja | DECLARED | – | which reaction low is relevant (else about 4-6 % below the breakout and below a round number)? |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C06 `SF_MINERVINI_SEPA_VCP` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 118 #709 rules in scope; HARD 8/16 implemented; 77 excluded with a written reason |
| Signal Completeness | PARTIAL | DATA_GAP | MIN-SF-TT-8 | ja | DECLARED | umgesetzt | the IBD rating is proprietary and not in the snapshot; a VU cross-sectional percentile is reported as a proxy and never gates (#709: "Ein VU-Perzentil mit ähnlicher Skala ist kein identischer IBD-Rang") |
| Signal Completeness | PARTIAL | MANUAL_DECISION | MIN-SF-PRIORITY | ja | DECLARED | – | manual relative-priority review of the remaining names |
| Signal Completeness | PARTIAL | MANUAL_DECISION | MIN-SF-FUNDAMENTALS | ja | DECLARED | – | earnings and sales growth and quality; no fixed percentage gate |
| Signal Completeness | PARTIAL | MANUAL_DECISION | MIN-SF-VCP | ja | DECLARED | umgesetzt | volatility contraction from left to right in a Stage 2 base; the machine reports the footprint (base length, largest and last correction, range contraction) as evidence |
| Entry Completeness | PARTIAL | MANUAL_DECISION | MIN-SF-PIVOT | ja | DECLARED | – | buy over the pivot with increasing volume; the fundamental thesis needs price confirmation |
| Exit Completeness | PARTIAL | MANUAL_DECISION | MIN-SF-SELL | ja | DECLARED | – | sell into strength, keep a remainder of early leaders with MA50 as an additional guide; no universal target |
| Stop Completeness | PARTIAL | MANUAL_DECISION | MIN-SF-STOP | ja | DECLARED | umgesetzt | loss exit set before the entry, executed regardless of volume, at most 10 % (usually sooner); about 3R almost always to break-even (no absolute 3R obligation); the machine flags a reviewer stop wider than 10 % |
| Position Sizing | PARTIAL | MANUAL_DECISION | MIN-SF-SIZE | ja | DECLARED | – | size from the accepted equity risk and the stop distance; at most 25 % per position (2015 answer) |
| Portfolio Risk Limits | NOT_APPLICABLE | – | – | – | – | – | the source assigns no rule of this kind to the method |
| Execution Completeness | PARTIAL | MANUAL_DECISION | – | ja | DECLARED | – | no mechanical order: a reviewer decision after the close; never back-filled into history |
| Required Data Coverage | PARTIAL | DATA_GAP | MIN-SF-TT-8 | ja | DECLARED | umgesetzt | the IBD rating is proprietary and not in the snapshot; a VU cross-sectional percentile is reported as a proxy and never gates (#709: "Ein VU-Perzentil mit ähnlicher Skala ist kein identischer IBD-Rang") |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MIN-MR-PRIORITY | ja | DECLARED | – | relative priority of the remaining names (results, surprises, guidance, industry position, peers, catalysts) |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MIN-MR-QUALITY | ja | DECLARED | – | earnings quality (core vs one-off), recent and prior quarters; 20-25 % is a common minimum, not a SEPA constant |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MIN-MR-VCP | ja | DECLARED | – | is there a valid contraction pattern (counts and halving are typical, not limits; flat bases / boxes allowed)? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MIN-MR-RS | ja | DECLARED | – | IBD RS rating >= 70 cannot be computed; the VU RS percentile is shown as a proxy, not as the IBD rating |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C07 `SF_MINERVINI_POWER_PLAY` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 20 #709 rules in scope; HARD 3/6 implemented; 11 excluded with a written reason |
| Signal Completeness | COMPLETE | – | – | – | – | – |  |
| Entry Completeness | PARTIAL | MANUAL_DECISION | MIN-SF-PP-ENTRY | ja | DECLARED | – | pivot entry decided by the reviewer |
| Exit Completeness | PARTIAL | MANUAL_DECISION | MIN-SF-PP-EXIT | ja | DECLARED | – | reviewer sell rules |
| Stop Completeness | PARTIAL | MANUAL_DECISION | MIN-SF-PP-STOP | ja | DECLARED | umgesetzt | loss exit before entry, at most 10 % |
| Position Sizing | PARTIAL | MANUAL_DECISION | MIN-SF-PP-SIZE | ja | DECLARED | – | reviewer sizing, at most 25 % per position |
| Portfolio Risk Limits | NOT_APPLICABLE | – | – | – | – | – | the source assigns no rule of this kind to the method |
| Execution Completeness | PARTIAL | MANUAL_DECISION | – | ja | DECLARED | – | no mechanical order: a reviewer decision after the close |
| Required Data Coverage | COMPLETE | – | – | – | – | – |  |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MIN-MR-PP-VOLUME | ja | DECLARED | – | did the run-up begin with strong volume? (the machine reports the volume ratio of the run-up start) |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MIN-MR-PP-CORR | ja | DECLARED | – | correction between 20 % and 25 %: within the printed 20-25 % range or not? |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C08 `SF_KK_BREAKOUT` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 36 #709 rules in scope; HARD 4/4 implemented; 15 excluded with a written reason |
| Signal Completeness | PARTIAL | MANUAL_DECISION | KK-SF-PRIORITY | nein | DECLARED | – | relative review priority: liquidity first, then prior move / MA and momentum together, then ADR, then volume and growth together; momentum matters most; no six-fold AND filter |
| Signal Completeness | PARTIAL | MANUAL_DECISION | KK-SF-BO-SETUP | ja | DECLARED | umgesetzt | prior move 30-100 % in 1-3 months, higher lows, orderly tightening over 2 weeks - 2 months, rising 10 / 20-day MA; the machine reports these measures as evidence |
| Entry Completeness | PARTIAL | MANUAL_DECISION | KK-SF-BO-ENTRY | ja | DECLARED | – | daily breakout entry allowed (anticipation is a harder variant); the level is the reviewer's |
| Entry Completeness | PARTIAL | DATA_GAP | KK-SF-BO-ORH | nein | DECLARED | – | no frozen intraday history in the snapshot (r9b minute cache is live and locked in snapshot mode) |
| Exit Completeness | PARTIAL | MANUAL_DECISION | KK-SF-BO-PARTIAL | ja | DECLARED | – | after 3-5 days sell 1/3-1/2, rest stop to break-even (preference) |
| Exit Completeness | PARTIAL | MANUAL_DECISION | KK-SF-BO-TRAIL | ja | DECLARED | – | trail the rest with the 10 / 20-day MA; beginners: first close below the 10-day MA (preference) |
| Stop Completeness | COMPLETE | – | – | – | – | – |  |
| Position Sizing | PARTIAL | MANUAL_DECISION | KK-SF-SIZE | ja | DECLARED | – | position size and risk per trade are context ranges (era-dependent, KK-C4), the reviewer decides within the 30 % cap |
| Portfolio Risk Limits | NOT_APPLICABLE | – | – | – | – | – | the source assigns no rule of this kind to the method |
| Execution Completeness | PARTIAL | MANUAL_DECISION | – | ja | DECLARED | – | no mechanical order: breakout-day close (market-on-close) after the reviewer accepts the level |
| Required Data Coverage | COMPLETE_WITH_DECLARED_LIMITS | DATA_GAP | KK-SF-BO-ORH | nein | DECLARED | – | no frozen intraday history in the snapshot (r9b minute cache is live and locked in snapshot mode) |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | KK-MR-SETUP | ja | DECLARED | – | strong prior move, higher lows, orderly tightening, rising 10 / 20-day MA? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | KK-MR-LEVEL | ja | DECLARED | – | which consolidation high is the breakout level? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | KK-MR-PRIORITY | nein | DECLARED | – | relative priority: liquidity first, then prior move / MA and momentum, then ADR, then volume and growth (no six-fold AND) |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C09 `SF_KK_EPISODIC_PIVOT` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 38 #709 rules in scope; HARD 4/4 implemented; 18 excluded with a written reason |
| Signal Completeness | PARTIAL | MANUAL_DECISION | KK-SF-PRIORITY | nein | DECLARED | – | relative review priority: liquidity first, then prior move / MA and momentum together, then ADR, then volume and growth together; momentum matters most; no six-fold AND filter |
| Signal Completeness | PARTIAL | MANUAL_DECISION | KK-SF-EP-SIDEWAYS | nein | DECLARED | umgesetzt | ideally 3-6 months sideways or longer without a big prior run; machine reports the prior range and prior move |
| Signal Completeness | PARTIAL | DATA_GAP | KK-SF-EP-CATALYST | ja | DECLARED | – | no timestamped catalyst / news / estimate / guidance history in the snapshot (#709 estimates, surprises, guidance MISSING) |
| Signal Completeness | PARTIAL | DATA_GAP | KK-SF-EP-VOLUME | ja | DECLARED | – | needs intraday volume; daily volume is reported as evidence only |
| Entry Completeness | PARTIAL | DATA_GAP | KK-SF-EP-ENTRY | ja | DECLARED | – | no frozen intraday history |
| Exit Completeness | PARTIAL | SOURCE_GAP | KK-SF-EP-EXIT | ja | DECLARED | – | the article names 20 / 50-day MAs and later 10 / 20-day MAs (KK-C2): exit choice discretionary, no universal MA; the breakout partial sale is not carried over |
| Stop Completeness | COMPLETE | – | – | – | – | – |  |
| Position Sizing | PARTIAL | MANUAL_DECISION | KK-SF-SIZE | ja | DECLARED | – | position size and risk per trade are context ranges (era-dependent, KK-C4), the reviewer decides within the 30 % cap |
| Portfolio Risk Limits | NOT_APPLICABLE | – | – | – | – | – | the source assigns no rule of this kind to the method |
| Execution Completeness | PARTIAL | DATA_GAP | KK-SF-EP-ENTRY | ja | DECLARED | – | the entry needs data the snapshot lacks: not executable on the snapshot |
| Required Data Coverage | PARTIAL | DATA_GAP | KK-SF-EP-CATALYST | ja | DECLARED | – | no timestamped catalyst / news / estimate / guidance history in the snapshot (#709 estimates, surprises, guidance MISSING) |
| Required Data Coverage | PARTIAL | DATA_GAP | KK-SF-EP-VOLUME | ja | DECLARED | – | needs intraday volume; daily volume is reported as evidence only |
| Required Data Coverage | PARTIAL | DATA_GAP | KK-SF-EP-ENTRY | ja | DECLARED | – | no frozen intraday history |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | KK-MR-CATALYST | ja | DECLARED | – | is there an unexpected significant catalyst (earnings / guidance, regulation, FDA, contract, sector repricing)? |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C10 `SF_KK_PARABOLIC_SHORT` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 34 #709 rules in scope; HARD 3/3 implemented; 18 excluded with a written reason |
| Signal Completeness | PARTIAL | MANUAL_DECISION | KK-SF-PRIORITY | nein | DECLARED | – | relative review priority: liquidity first, then prior move / MA and momentum together, then ADR, then volume and growth together; momentum matters most; no six-fold AND filter |
| Signal Completeness | PARTIAL | MANUAL_DECISION | KK-SF-PS-ACCEL | ja | DECLARED | umgesetzt | several strongly accelerated up days; the machine reports the streak of up days, their returns and whether they accelerate (evidence, no threshold) |
| Signal Completeness | PARTIAL | DATA_GAP | KK-SF-PS-BORROW | ja | DECLARED | – | no historical borrow / locate / fee data (#709 short_interest MISSING) |
| Entry Completeness | PARTIAL | DATA_GAP | KK-SF-PS-ENTRY | ja | DECLARED | – | needs intraday bars and VWAP |
| Exit Completeness | PARTIAL | MANUAL_DECISION | KK-SF-PS-TARGET | ja | DECLARED | umgesetzt | take profits toward the 10 / 20-day MA, early partials; the machine reports the distances |
| Stop Completeness | PARTIAL | DATA_GAP | KK-SF-PS-STOP | ja | DECLARED | – | VWAP needs intraday data; the high of day is only final after the close |
| Position Sizing | PARTIAL | MANUAL_DECISION | KK-SF-SIZE | ja | DECLARED | – | position size and risk per trade are context ranges (era-dependent, KK-C4), the reviewer decides within the 30 % cap |
| Portfolio Risk Limits | NOT_APPLICABLE | – | – | – | – | – | the source assigns no rule of this kind to the method |
| Execution Completeness | PARTIAL | DATA_GAP | KK-SF-PS-ENTRY | ja | DECLARED | – | the entry needs data the snapshot lacks: not executable on the snapshot |
| Required Data Coverage | PARTIAL | DATA_GAP | KK-SF-PS-ENTRY | ja | DECLARED | – | needs intraday bars and VWAP |
| Required Data Coverage | PARTIAL | DATA_GAP | KK-SF-PS-STOP | ja | DECLARED | – | VWAP needs intraday data; the high of day is only final after the close |
| Required Data Coverage | PARTIAL | DATA_GAP | KK-SF-PS-BORROW | ja | DECLARED | – | no historical borrow / locate / fee data (#709 short_interest MISSING) |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | KK-MR-PARABOLIC | ja | DECLARED | – | several strongly accelerated up days? (sizes are illustrative, not minimums) |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C11 `SF_MOKA_POCKET_PIVOT` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 22 #709 rules in scope; HARD 1/1 implemented; 6 excluded with a written reason |
| Signal Completeness | PARTIAL | MANUAL_DECISION | MOKA-SF-PP-CONTEXT | ja | DECLARED | umgesetzt | base, theme, 10DMA / critical MA position, no V-shape, no wedging, not extended; the machine reports the distances to the 10 / 50 / 200-day MAs as evidence |
| Entry Completeness | NOT_APPLICABLE | – | – | – | – | – | no separate entry rule: the entry is the screen signal (MOKA-SF-PP-VOLUME + MOKA-SF-PP-UPDAY (machine), MOKA-SF-PP-CONTEXT (manual)) |
| Exit Completeness | PARTIAL | MANUAL_DECISION | MOKA-SF-EXIT-MA | ja | DECLARED | – | sell guide: 10DMA if the stock respected it for >= 7 weeks, otherwise 50DMA (preference) |
| Exit Completeness | PARTIAL | SOURCE_GAP | MOKA-SF-EXIT-VIOLATION | ja | DECLARED | umgesetzt | MOKA-C2: the 2012 slide says the next day, the FAQ says later days; both readings kept, reported as evidence, no automatic exit |
| Exit Completeness | PARTIAL | MANUAL_DECISION | MOKA-SF-EXIT-CONTEXT | nein | DECLARED | – | weak market, partial vs full exit (Gil vs Chris), lagging names in a strong market are reviewer decisions |
| Stop Completeness | PARTIAL | MANUAL_DECISION | MOKA-SF-PP-STOP | ja | DECLARED | – | stop / sell guide decided by the reviewer (no numeric stop in the Pocket Pivot rules) |
| Position Sizing | PARTIAL | MANUAL_DECISION | MOKA-SF-PP-SIZE | ja | DECLARED | – | sizing not specified in #709; reviewer decision |
| Portfolio Risk Limits | NOT_APPLICABLE | – | – | – | – | – | the source assigns no rule of this kind to the method |
| Execution Completeness | PARTIAL | MANUAL_DECISION | – | ja | DECLARED | – | no mechanical order: reviewer decision after the close; intraday projected volume is not available |
| Required Data Coverage | COMPLETE | – | – | – | – | – |  |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MOKA-MR-BASE | ja | DECLARED | – | constructive base; no multi-month downtrend, no V-shape after a hard break, no wedging |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MOKA-MR-THEME | ja | DECLARED | – | strong fundamentals or a convincing theme |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MOKA-MR-EXT | ja | DECLARED | – | position relative to the 10DMA / critical MA; not extended |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C12 `SF_MOKA_BUYABLE_GAP_UP` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 15 #709 rules in scope; HARD 2/2 implemented; 3 excluded with a written reason |
| Signal Completeness | PARTIAL | SOURCE_GAP | MOKA-SF-BGU-VOLWINDOW | ja | DECLARED | umgesetzt | #709 does not record the window; the ratio over the 50 sessions before the gap day is reported (convention of the authors' daily charts, unverified in #709) and the reviewer confirms |
| Signal Completeness | PARTIAL | MANUAL_DECISION | MOKA-SF-BGU-MEGA | ja | DECLARED | umgesetzt | below the standard the record is not rejected: VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW |
| Signal Completeness | PARTIAL | MANUAL_DECISION | MOKA-SF-BGU-CONTEXT | ja | DECLARED | – | leadership / theme and uptrend or constructive consolidation before the gap |
| Entry Completeness | NOT_APPLICABLE | – | – | – | – | – | no separate entry rule: the entry is the screen signal (MOKA-SF-BGU-GAP + MOKA-SF-BGU-VOLUME (machine), MOKA-SF-BGU-CONTEXT (manual)) |
| Exit Completeness | PARTIAL | MANUAL_DECISION | MOKA-SF-EXIT-MA | ja | DECLARED | – | sell guide: 10DMA if the stock respected it for >= 7 weeks, otherwise 50DMA (preference) |
| Exit Completeness | PARTIAL | SOURCE_GAP | MOKA-SF-EXIT-VIOLATION | ja | DECLARED | umgesetzt | MOKA-C2: the 2012 slide says the next day, the FAQ says later days; both readings kept, reported as evidence, no automatic exit |
| Exit Completeness | PARTIAL | MANUAL_DECISION | MOKA-SF-EXIT-CONTEXT | nein | DECLARED | – | weak market, partial vs full exit (Gil vs Chris), lagging names in a strong market are reviewer decisions |
| Stop Completeness | PARTIAL | MANUAL_DECISION | MOKA-SF-BGU-SELLGUIDE | ja | DECLARED | umgesetzt | gap-day low as the risk reference; below it generally sell at least half (preference); the machine reports the level |
| Position Sizing | PARTIAL | MANUAL_DECISION | MOKA-SF-BGU-SIZE | ja | DECLARED | – | sizing not specified in #709; reviewer decision |
| Portfolio Risk Limits | NOT_APPLICABLE | – | – | – | – | – | the source assigns no rule of this kind to the method |
| Execution Completeness | PARTIAL | MANUAL_DECISION | – | ja | DECLARED | – | no mechanical order: reviewer decision after the close; intraday projected volume is not available |
| Required Data Coverage | COMPLETE_WITH_DECLARED_LIMITS | DATA_GAP | MOKA24-MEGA | nein | DECLARED | – | MOKA24-MEGA: point-in-time market capitalisation for the megacap exception is not in the snapshot; the reviewer judges it |
| Required Data Coverage | COMPLETE_WITH_DECLARED_LIMITS | DATA_GAP | intraday projected volume (daily variant only) | nein | DECLARED | – | intraday projected volume (daily variant only) |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MOKA-MR-LEAD | ja | DECLARED | – | strong leadership or theme; uptrend or constructive consolidation before the gap |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MOKA-MR-MEGA | ja | DECLARED | – | volume below 1.5x: does the megacap exception apply (MCD accepted at +47.09 %)? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | MOKA-MR-VOLWINDOW | ja | DECLARED | – | the averaging window of "average volume" is not recorded in #709; the 50-session ratio is shown with the 1.5x reading |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

## C13 `SF_RASCHKE_HOLY_GRAIL` (Umfang: SINGLE)

| Dimension | Status | Klasse | Regel | wesentlich | Umfang | Mechanik | Detail |
|---|---|---|---|---|---|---|---|
| Source Rule Coverage | COMPLETE | – | – | – | – | – | 6 #709 rules in scope; HARD 2/2 implemented; 0 excluded with a written reason |
| Signal Completeness | COMPLETE_WITH_DECLARED_LIMITS | MANUAL_DECISION | RAS-SF-OSC-HIGH | nein | DECLARED | – | best setups with new oscillator momentum highs; reported as evidence |
| Entry Completeness | PARTIAL | SOURCE_GAP | RAS-SF-ENTRY | ja | DECLARED | – | primary source silent; research reading from the secondary source W-RAS97 (D-RAS97 2026-10-23): entry order after the pullback: buy stop above the high of the previous bar |
| Exit Completeness | PARTIAL | MANUAL_DECISION | RAS-SF-EXIT | ja | DECLARED | – | a new high is an exit opportunity (preference) |
| Stop Completeness | PARTIAL | SOURCE_GAP | RAS-SF-STOP | ja | DECLARED | – | primary source silent; research reading from the secondary source W-RAS97 (D-RAS97 2026-10-23): initial stop: protective sell stop at the newly formed swing low |
| Position Sizing | PARTIAL | SOURCE_GAP | RAS-SF-SIZE | ja | DECLARED | – | not disclosed for the Holy Grail setup |
| Portfolio Risk Limits | NOT_APPLICABLE | – | – | – | – | – | the source assigns no rule of this kind to the method |
| Execution Completeness | PARTIAL | MANUAL_DECISION | – | ja | DECLARED | – | no mechanical order: reviewer decision after the close (primary source silent on the entry order; secondary source W-RAS97, D-RAS97) |
| Required Data Coverage | COMPLETE | – | – | – | – | – |  |
| Corporate-Action Handling | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D1 | nein | DECLARED | – | undeclared reverse splits in about 1 % of security-months of the canonical price core (#705); blocks certification of any historical number, not a diagnostic run; fix belongs to a Quant PR |
| PIT Integrity | COMPLETE_WITH_DECLARED_LIMITS | MEASUREMENT_GAP | V4-D2 | nein | DECLARED | – | share-class audit of the EW universe open (#705); a security id may combine share classes; no exclusion is applied to improve results |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | RAS-MR-IMPULSE | ja | DECLARED | – | strong impulse before the pullback? |
| Manual Decision Dependencies | PARTIAL | MANUAL_DECISION | RAS-MR-EXECUTION | ja | DECLARED | – | entry order and stop: primary source silent, secondary source W-RAS97 (D-RAS97); exit not disclosed |
| Backtest Readiness | PARTIAL | MEASUREMENT_GAP | – | ja | DECLARED | – | no diagnostic method backtest: entry, exit or stop is manual, source-ambiguous or data-blocked; a fixed holding period would be invented |
| Live Readiness | PARTIAL | PRODUCT_GAP | LIVE_NOT_APPROVED | ja | DECLARED | – | no live signal path, no order routing, no model-portfolio change; owner approval required (mandate non-negotiables) |
| Missing Tests | COMPLETE | – | – | – | – | – |  |

