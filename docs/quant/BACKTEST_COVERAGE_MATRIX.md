# Backtesting: Coverage-Matrix und Zertifizierungsstand

> Erzeugt von `scripts/quant/research/backtest-coverage-matrix.cjs` (`backtest-coverage-matrix-1.0.0`). **Nicht von Hand ändern.** Neubau: `node scripts/quant/research/backtest-coverage-matrix.cjs --out docs/quant/BACKTEST_COVERAGE_MATRIX.md`; Prüfung: `--check docs/quant/BACKTEST_COVERAGE_MATRIX.md` (Test `quant/tests/backtest-coverage-matrix.test.mjs`).

**Quellen (nur gelesen):** `quant/engines/backtest-kinds.cjs` (backtest-kinds-1.0.0), `METHOD_FIT`/`ENGINE_KEYS` aus `scripts/quant/research/backtest-runner.cjs` (backtest-runner-1.0.0), `quant/data/product/backtest-certification-v1.json` (backtest-certification-1.0.0), Schwellen aus `quant/methodology/backtest-certification-v1.json` (backtest-certification-1.0.0), Katalog `docs/quant/backtest-catalog/` (`catalogHash` `7ea6383e7260a5fb…`), Populationsprofile aus `research-population.cjs` (research-population-1.0.0), Kostenvorgaben aus `backtest-spec-builder.cjs`, PIT-Historien über `scripts/quant/research/pit-snapshot-integrity.cjs`.

**Stabilität:** Aus dem täglich neu gebauten Zertifizierungsartefakt gehen nur Status, Gate-Zustände, Gründe, Kategorien und Schwellen ein, keine Tageszählerstände. Zählerstände und Prognosen stehen in Abschnitt F zum festen Stichtag **2026-10-31**; den aktuellen Stand liefert `node scripts/quant/research/pit-snapshot-integrity.cjs --out <datei>`. Kippt ein Gate oder ein Grund, weicht das Dokument ab und der Test schlägt fehl: Dann hat sich die Abdeckung geändert, und das Dokument wird im selben PR mit dem Erzeuger neu gebaut.

## Kurzbefund

| Größe | Wert | Quelle |
|---|---|---|
| Backtest-Arten | 6 | backtest-kinds.cjs KINDS |
| Zusatzmethoden | 7 | backtest-kinds.cjs METHODS |
| zugelassene Kombinationen Art × Methode | 31 von 42 | METHOD_FIT |
| Katalog-Auswahlen | 21 (Zustand A: 20, B: 1, C: 0) | catalog.json |
| zertifizierte Arten laut Artefakt | 0 von 6 | backtest-certification-v1.json |
| Status der Arten | COLLECTING_HISTORY 3, LIMITED 3 | backtest-certification-v1.json |
| zertifizierte Signalregeln | 0 von 5 | SIGNAL_BACKTEST.rules |
| productionApproved | false | catalog.json |
| unabhängige Gegenrechnung des Katalogs | 21 Ergebnisse, 560.140 Prüfungen, 0 Abweichungen (Python 3.12.3, Toleranz 1e-9) | verify-report.json |

## A. Arten × Methoden

„ja“: im Runner zugelassen (`METHOD_FIT`), dahinter, wie oft die Methode in den 21 Katalog-Auswahlen tatsächlich ausgeführt wurde (EXECUTED). „nein“: der Runner lehnt die Kombination ab (`METHOD_NOT_APPLICABLE_TO_KIND`), Grund darunter. Keine der Methoden speist die Zertifizierung.

| Art (Katalog-Auswahlen) | MONTE_CARLO | WALK_FORWARD | OUT_OF_SAMPLE | MARKET_REGIME | PARAMETER_SENSITIVITY | EVENT_DRIVEN | PORTFOLIO_REBALANCING |
|---|---|---|---|---|---|---|---|
| SAME_STOCK_REPLAY (4) | ja · 2× | ja · 0× | ja · 0× | ja · 2× | ja · 0× | ja · 0× | nein |
| PATTERN_EVIDENCE (2) | nein | ja · 1× | ja · 1× | ja · 1× | ja · 0× | ja · 0× | nein |
| SIGNAL_BACKTEST (7) | ja · 2× | ja · 2× | ja · 2× | ja · 6× | ja · 0× | ja · 0× | ja · 3× |
| SETUP_BACKTEST (1) | nein | ja · 1× | ja · 0× | ja · 0× | nein | ja · 0× | nein |
| STRATEGY_BACKTEST (4) | ja · 0× | nein | nein | ja · 1× | ja · 0× | ja · 1× | ja · 3× |
| FACTOR_RANKING_BACKTEST (3) | nein | ja · 0× | ja · 0× | ja · 1× | nein | ja · 0× | nein |

**Nicht anwendbar, mit Grund:**

- `MONTE_CARLO` × `PATTERN_EVIDENCE`: Musterereignisse überlappen und bilden keinen Ledger; Resampling setzt nicht überlappende Trades oder eine Periodenreihe voraus.
- `MONTE_CARLO` × `SETUP_BACKTEST`: rekonstruierte Setup-Ereignisse ohne finanzierten Ledger; keine nicht überlappende Handelsfolge.
- `MONTE_CARLO` × `FACTOR_RANKING_BACKTEST`: Quintil-Spreads je Stichtag, kein Portfolio-Ledger zum Neuziehen.
- `WALK_FORWARD` × `STRATEGY_BACKTEST`: feste Gewichte ohne Anpassung: es gibt keinen Lernschritt, den eine Faltung prüfen könnte.
- `OUT_OF_SAMPLE` × `STRATEGY_BACKTEST`: feste Gewichte ohne Anpassung: kein Lernzeitraum, also kein Testzeitraum.
- `PARAMETER_SENSITIVITY` × `SETUP_BACKTEST`: kein registriertes Raster: die Setup-Zustandsmaschine (setup-mapping-1.0.0) ist fest.
- `PARAMETER_SENSITIVITY` × `FACTOR_RANKING_BACKTEST`: kein registriertes Raster: Faktordefinitionen liegen fest im privaten V10-PIT-Panel.
- `PORTFOLIO_REBALANCING` × `SAME_STOCK_REPLAY`: kein Portfolio: eine Aktie bzw. der echte Wochen-Ledger mit eigener Positionsführung.
- `PORTFOLIO_REBALANCING` × `PATTERN_EVIDENCE`: Häufigkeitsauswertung von Ereignissen, kein finanzierter Ledger.
- `PORTFOLIO_REBALANCING` × `SETUP_BACKTEST`: Ereignisstudie auf Setup-Zuständen, kein finanzierter Ledger.
- `PORTFOLIO_REBALANCING` × `FACTOR_RANKING_BACKTEST`: Quintilvergleich, kein finanzierter Ledger (Produktadapter B2/C2 zurückgestellt).

**Zugelassen, aber im Katalog nicht vorgerechnet (16):** `MONTE_CARLO` × `STRATEGY_BACKTEST`, `WALK_FORWARD` × `SAME_STOCK_REPLAY`, `WALK_FORWARD` × `FACTOR_RANKING_BACKTEST`, `OUT_OF_SAMPLE` × `SAME_STOCK_REPLAY`, `OUT_OF_SAMPLE` × `SETUP_BACKTEST`, `OUT_OF_SAMPLE` × `FACTOR_RANKING_BACKTEST`, `MARKET_REGIME` × `SETUP_BACKTEST`, `PARAMETER_SENSITIVITY` × `SAME_STOCK_REPLAY`, `PARAMETER_SENSITIVITY` × `PATTERN_EVIDENCE`, `PARAMETER_SENSITIVITY` × `SIGNAL_BACKTEST`, `PARAMETER_SENSITIVITY` × `STRATEGY_BACKTEST`, `EVENT_DRIVEN` × `SAME_STOCK_REPLAY`, `EVENT_DRIVEN` × `PATTERN_EVIDENCE`, `EVENT_DRIVEN` × `SIGNAL_BACKTEST`, `EVENT_DRIVEN` × `SETUP_BACKTEST`, `EVENT_DRIVEN` × `FACTOR_RANKING_BACKTEST`.

**Engine-Parameter je Art** (`ENGINE_KEYS`): `SAME_STOCK_REPLAY` variant, pattern, cooldownBars, horizonBars, period; `PATTERN_EVIDENCE` pattern, cooldownBars, horizonBars; `SIGNAL_BACKTEST` ruleIds, horizonBars, funded; `SETUP_BACKTEST` entryStates, entryVariants, exitVariants, horizonBars; `STRATEGY_BACKTEST` variant, weights, rebalance, initialCapital, dividends; `FACTOR_RANKING_BACKTEST` factorId, horizonBars, buckets.

## B. Katalog-Auswahlen (21)

Zustand A = RESEARCH_EXECUTED, B = PREPARED_DATA_LIMITED (Eingaben fehlen, keine Zahlen). Methoden: angefordert → ausgeführt. Kosten je Seite in Basispunkten (Gebühr + Slippage), Vorgaben aus `backtest-spec-builder.cjs` (NONE 0+0, STANDARD 5+5, HIGH 20+20). Zertifizierung: Status der Art beim Katalogbau. Kennzahlen-Hash: laufzeitfreier Hash der Zahlen (`backtest-metrics-hash.cjs`, P0.7), erste 16 Zeichen.

| # | Auswahl | Art | Zeitraum | Methoden | Zustand | Population | Kosten | Benchmark | Zertifizierung | Nachweisart | Kennzahlen-Hash |
|--:|---|---|---|---|:-:|---|---|---|---|---|---|
| 1 | Replay NVDA (Vorlage) | SAME_STOCK_REPLAY | 2010-01-01..2024-12-31 | keine → keine | A | V10_PRIMARY, NVDA | 5+5 bp (STANDARD) | SPY | LIMITED | OBSERVED | 157733cac0fad3c2 |
| 2 | Replay INTC, hohe Kosten | SAME_STOCK_REPLAY | 2019-01-01..2025-06-30 | MONTE_CARLO, MARKET_REGIME → MONTE_CARLO, MARKET_REGIME | A | V10_PRIMARY, INTC | 20+20 bp (HIGH) | SPY | LIMITED | OBSERVED | c14d983615e19518 |
| 3 | Ledger SMCI (Vorlage) | SAME_STOCK_REPLAY | 2016-01-01..2025-12-31 | MONTE_CARLO → MONTE_CARLO | A | PRODUCT_DEFAULT, SMCI | 5+5 bp (STANDARD) | SPY | LIMITED | SIMULATED_LEDGER | 00119329a48ce4a8 |
| 4 | Pattern 2015 seitwaerts | PATTERN_EVIDENCE | 2015-01-01..2015-12-31 | MARKET_REGIME, WALK_FORWARD → WALK_FORWARD, OUT_OF_SAMPLE, MARKET_REGIME | A | V10_PRIMARY, 30 Titel | 5+5 bp (STANDARD) | SPY | LIMITED | OBSERVED | fa29f9888f68f11f |
| 5 | Pattern 2015 ohne Benchmark | PATTERN_EVIDENCE | 2015-01-01..2015-12-31 | keine → keine | A | V10_PRIMARY, 30 Titel | 5+5 bp (STANDARD) | NONE | LIMITED | OBSERVED | cb364070c2e0b122 |
| 6 | Signal 2008 Crash | SIGNAL_BACKTEST | 2007-10-01..2009-03-31 | MARKET_REGIME, MONTE_CARLO, PORTFOLIO_REBALANCING, WALK_FORWARD → MONTE_CARLO, WALK_FORWARD, OUT_OF_SAMPLE, MARKET_REGIME, PORTFOLIO_REBALANCING | A | V10_PRIMARY, 30 Titel | 5+5 bp (STANDARD) | SPY | LIMITED | TESTED | cf4aa40bb4faa254 |
| 7 | Signal 2008 Crash, hohe Kosten | SIGNAL_BACKTEST | 2007-10-01..2009-03-31 | MARKET_REGIME, MONTE_CARLO, PORTFOLIO_REBALANCING, WALK_FORWARD → MONTE_CARLO, WALK_FORWARD, OUT_OF_SAMPLE, MARKET_REGIME, PORTFOLIO_REBALANCING | A | V10_PRIMARY, 30 Titel | 20+20 bp (HIGH) | SPY | LIMITED | TESTED | 6c6163e4bd81784f |
| 8 | Signal 2009 Erholung ohne Zusatzmethoden | SIGNAL_BACKTEST | 2009-03-01..2010-12-31 | keine → keine | A | V10_PRIMARY, 30 Titel | 5+5 bp (STANDARD) | SPY | LIMITED | TESTED | 81513dd6db6739c3 |
| 9 | Signal 2020 Covid | SIGNAL_BACKTEST | 2020-01-01..2020-12-31 | MARKET_REGIME, PORTFOLIO_REBALANCING → MARKET_REGIME, PORTFOLIO_REBALANCING | A | V10_PRIMARY, 30 Titel | 5+5 bp (STANDARD) | SPY | LIMITED | TESTED | e2cce4e997a0153b |
| 10 | Signal 2022 Baer, nur TREND_DOWN, 1. Halbjahr | SIGNAL_BACKTEST | 2022-01-01..2022-06-30 | MARKET_REGIME → MARKET_REGIME | A | V10_PRIMARY, 30 Titel | 5+5 bp (STANDARD) | SPY | LIMITED | TESTED | ecd4f7b70eaa6217 |
| 11 | Signal 2022 Baer, nur TREND_DOWN, 2. Halbjahr | SIGNAL_BACKTEST | 2022-07-01..2022-12-31 | MARKET_REGIME → MARKET_REGIME | A | V10_PRIMARY, 30 Titel | 5+5 bp (STANDARD) | SPY | LIMITED | TESTED | 2bd50da61998b96f |
| 12 | Setup-Rekonstruktion 2016-2024 | SETUP_BACKTEST | 2016-01-01..2024-12-31 | WALK_FORWARD → WALK_FORWARD | A | V10_PRIMARY, 160 Listings | 5+5 bp (STANDARD) | SPY | COLLECTING_HISTORY | TESTED | fbbd82c3d3772040 |
| 13 | Strategie 2019, hohe Kosten | STRATEGY_BACKTEST | 2019-01-01..2019-12-31 | keine → PORTFOLIO_REBALANCING | A | V10_PRIMARY, 10 Titel | 20+20 bp (HIGH) | SPY | COLLECTING_HISTORY | SIMULATED_LEDGER | 120fb6c64dcbe82f |
| 14 | Strategie 2013-2014 | STRATEGY_BACKTEST | 2013-01-01..2014-12-31 | MARKET_REGIME → MARKET_REGIME, PORTFOLIO_REBALANCING | A | V10_PRIMARY, 30 Titel | 5+5 bp (STANDARD) | SPY | COLLECTING_HISTORY | SIMULATED_LEDGER | 1dcf92db3606bdf8 |
| 15 | Strategie Dividenden (TR) | STRATEGY_BACKTEST | 2016-01-01..2020-12-31 | EVENT_DRIVEN → EVENT_DRIVEN, PORTFOLIO_REBALANCING | A | V10_PRIMARY, 3 Titel | 0+0 bp (NONE) | SPY | COLLECTING_HISTORY | SIMULATED_LEDGER | 91ad3eb86e62f9e2 |
| 16 | Strategie Profil (Zustand B) | STRATEGY_BACKTEST | 2019-01-01..2019-12-31 | keine → keine | B | V10_PRIMARY, 10 Titel | 5+5 bp (STANDARD) | SPY | COLLECTING_HISTORY | TESTED | 828d6c99607a9aaa |
| 17 | Faktor Momentum (privates Panel) | FACTOR_RANKING_BACKTEST | 2019-01-01..2020-12-31 | MARKET_REGIME → MARKET_REGIME | A | V10_PRIMARY, ganzer Rahmen, privat: factorPanel | 5+5 bp (STANDARD) | SPY | COLLECTING_HISTORY | TESTED | 5e89a2b4b9e02db0 |
| 18 | Faktor Value (privates Panel) | FACTOR_RANKING_BACKTEST | 2019-01-01..2020-12-31 | keine → keine | A | V10_PRIMARY, ganzer Rahmen, privat: factorPanel | 5+5 bp (STANDARD) | SPY | COLLECTING_HISTORY | TESTED | dc1ed86437f93a76 |
| 19 | Faktor Quality (privates Panel) | FACTOR_RANKING_BACKTEST | 2019-01-01..2020-12-31 | keine → keine | A | V10_PRIMARY, ganzer Rahmen, privat: factorPanel | 5+5 bp (STANDARD) | SPY | COLLECTING_HISTORY | TESTED | adc547dbbb674518 |
| 20 | Delistet: XCO Insolvenz | SAME_STOCK_REPLAY | 2012-01-01..2017-12-31 | MARKET_REGIME → MARKET_REGIME | A | V13_DELISTED_F1, 1 Listing, privat: delistedSeries | 5+5 bp (STANDARD) | SPY | LIMITED | OBSERVED | c5636cd0de905cd3 |
| 21 | Delistet: AGN Uebernahme | SIGNAL_BACKTEST | 2015-01-01..2020-05-08 | MARKET_REGIME → MARKET_REGIME | A | V13_DELISTED_F1, 1 Listing, privat: delistedSeries | 5+5 bp (STANDARD) | SPY | LIMITED | TESTED | 9c38a6f840b1842c |

## C. Zertifizierung je Art: Gates, Blocker, Lösungsweg

Kategorien laut Methodik: HARD (Verstoß macht jede Zahl wertlos), STRUCTURAL (Datenlücke, verschwindet nicht von allein), QUALITY (Prüfung der Evidenz), HISTORY (wächst mit der Zeit). Lösungsweg: **heute technisch**, **nur mit Owner-Entscheidung**, **nur durch Zeit/Daten**, **Befund (keine der drei)**. Die Zuordnung steht als Tabelle `SOLVABILITY` im Erzeuger; ein neuer Blocker ohne Zuordnung bricht den Bau ab.

### SAME_STOCK_REPLAY · Rückblick derselben Aktie

Status **LIMITED**, Stufe OBSERVED, Vertrauen LIMITED, Bereitschaft NOT_READY, Owner-Freigabe laut Methodik nicht nötig. Hauptgrund: `SURVIVOR_BY_CONSTRUCTION`.

| Gate | Kategorie | Zustand | Grund | Schwelle | Lösungsweg | Begründung |
|---|---|---|---|---|---|---|
| pit | HARD | PASS | – | – | – | – |
| survivorship | STRUCTURAL | FAIL | SURVIVOR_BY_CONSTRUCTION | – | nur mit Owner-Entscheidung | strukturell: eine Aktie mit langer Historie hat überlebt; Warten ändert nichts. Plan P3.4: die Art bleibt beschreibend. Eine Zertifizierung ginge nur über eine andere Norm (Gate-Änderung), die nicht vorgesehen ist. |
| ruleTest | QUALITY | FAIL | DESCRIPTIVE_NOT_A_TEST | – | nur mit Owner-Entscheidung | die Art beschreibt, sie prüft keine Regel (Stufe OBSERVED). Nur eine Produktentscheidung zur Kennzeichnung als Beschreibung, keine Zertifizierung. |

### PATTERN_EVIDENCE · Marktweite Muster

Status **LIMITED**, Stufe OBSERVED, Vertrauen LIMITED, Bereitschaft NOT_READY, Owner-Freigabe laut Methodik nicht nötig. Hauptgrund: `PRESENT_AND_UNQUANTIFIED_IN_PART`.

| Gate | Kategorie | Zustand | Grund | Schwelle | Lösungsweg | Begründung |
|---|---|---|---|---|---|---|
| pit | HARD | PASS | – | – | – | – |
| oos | QUALITY | PASS | – | – | – | – |
| survivorship | STRUCTURAL | FAIL | PRESENT_AND_UNQUANTIFIED_IN_PART | – | nur mit Owner-Entscheidung | technisch vorbereitbar (P3.1: Delisted-Register 1.0.0/1.1.0 als zusätzliche Population, Sensitivität neben dem Überlebenden-Ergebnis); das Gate liest die Sensitivität erst nach P3.3, das ändert die Gate-Eingabe und braucht die Freigabe sowie Security Master 1.3.0 (H1). Private Reihen nur über den Archivweg (Secret). |
| returnBasis | STRUCTURAL | FAIL | STUDY_RETURN_BASIS_NOT_TOTAL_RETURN | – | heute technisch | P4.1: Pattern-Ergebnisse mit dem vorhandenen TR-Register (canonical-total-return-1.0.0, 158/161 bestätigt) rechnen, Titel ohne Beleg ausschließen und ausweisen. Fachmodell-PR mit Vorher/Nachher; die Wirkung auf das Gate (P4.2) erst mit Freigabe. |
| certifiedAsBacktest | QUALITY | FAIL | STUDY_DECLARES_BACKTEST_NOT_CERTIFIED | – | nur mit Owner-Entscheidung | die Musterstudie erklärt sich selbst als Häufigkeitsauswertung. Sie als zertifizierbaren Backtest zu führen, ist eine Normentscheidung. |

### SIGNAL_BACKTEST · Signal-Backtest

Status **LIMITED**, Stufe TESTED, Vertrauen LIMITED, Bereitschaft NOT_READY, Owner-Freigabe laut Methodik nicht nötig. Hauptgrund: `PARTIAL_SENSITIVITY_ONLY`.

| Gate | Kategorie | Zustand | Grund | Schwelle | Lösungsweg | Begründung |
|---|---|---|---|---|---|---|
| pit | HARD | PASS | – | – | – | – |
| lookahead | HARD | PASS | – | – | – | – |
| survivorship | STRUCTURAL | FAIL | PARTIAL_SENSITIVITY_ONLY | – | nur durch Zeit/Daten | delistete Titel erst ab 2016 und nur in der Sensitivität; vor 2016 fehlen Reihen, der Delisting-Ausgang ist unbekannt (DELISTED_ONLY_FROM_2016, DELIST_OUTCOME_UNKNOWN). Kein neuer Anbieter erlaubt. D4 (finanzierter Zeitplan mit beendeten Listings) ist ein eigener Fachmodell-PR, schließt die Lücke vor 2016 aber nicht. |
| returnBasis | STRUCTURAL | PASS | – | – | – | – |
| ruleCertified | QUALITY | FAIL | NO_RULE_CERTIFIED | – | Befund (keine der drei) | V10–V13c: keine Regel mit robustem Überschuss gegen SPY nach Holm. Ein negatives Ergebnis ist ein gültiges Produktergebnis; keine neue Alpha-Suche. |

### SETUP_BACKTEST · Setup-Backtest

Status **COLLECTING_HISTORY**, Stufe TESTED, Vertrauen NOT_READY, Bereitschaft NOT_READY, Owner-Freigabe laut Methodik nötig. Hauptgrund: `SETUP_HISTORY_TOO_SHORT`.

| Gate | Kategorie | Zustand | Grund | Schwelle | Lösungsweg | Begründung |
|---|---|---|---|---|---|---|
| publishedOnly | HARD | PASS | – | – | – | – |
| pit | HARD | PASS | – | – | – | – |
| lookahead | HARD | PASS | – | – | – | – |
| historyDates | HISTORY | FAIL | SETUP_HISTORY_TOO_SHORT | 120 | nur durch Zeit/Daten | wächst mit jedem veröffentlichten Stichtag (Abschnitt F). |
| historySpan | HISTORY | FAIL | SETUP_HISTORY_SPAN_TOO_SHORT | 180 Tage | nur durch Zeit/Daten | wächst mit der Zeit (Abschnitt F). |
| completedOutcomes | HISTORY | FAIL | COMPLETED_OUTCOMES_TOO_FEW | 100 | nur durch Zeit/Daten | erste 6-Monats-Ergebnisse ab etwa 2027-03-26 (Abschnitt F). |
| titles | HISTORY | FAIL | TOO_FEW_TITLES | 20 | nur durch Zeit/Daten | folgt aus den ersten abgeschlossenen 6-Monats-Ergebnissen. |
| independence | HISTORY | FAIL | EVENTS_CLUSTERED_IN_TIME | 20 | nur durch Zeit/Daten | der Builder zählt verschiedene Monate mit Ereignissen (Schwellenname independentWeeks); früheste Erfüllung siehe Abschnitt F und Freigabevorlage FV-1. |
| returnBasis | STRUCTURAL | FAIL | TOTAL_RETURN_NOT_IN_THIS_RUN | – | heute technisch | das Setup-Ergebnisartefakt wurde mit Kursrendite gebaut (öffentliche Jahresreihe ohne Gesamtrendite); mit der kanonischen Historie (--work-dir, Pipeline) rechnet build-setup-outcomes.mjs Gesamtrendite. Lösung im Erzeuger-Lauf, kein Handeingriff in quant/data. |
| survivorship | STRUCTURAL | PASS | – | – | – | – |
| entryVariant | QUALITY | FAIL | VARIANTS_NOT_MEASURABLE_YET | Δ Median ≤ 1 Pp | nur durch Zeit/Daten | messbar erst mit abgeschlossenen Ergebnissen; ob die Varianten übereinstimmen, ist offen (bei Abweichung über 1 Pp: Owner-Entscheidung). |
| oos | QUALITY | FAIL | OOS_NOT_MEASURABLE_YET | – | nur mit Owner-Entscheidung | braucht die Segmentdefinition A1–A6 (SETUP_OOS_DECISION_A1_A6.md, spätestens vor etwa 2027-03-26) und danach 30 effektive Fälle je Segment (Zeit). |
| ownerApproval | OWNER | OFFEN | REQUIRED | – | nur mit Owner-Entscheidung | der Methodikvertrag (setup-state-v1.json requirements.backtestCertification) verlangt eine ausdrückliche Freigabe, auch wenn alle Gates bestehen. |

### STRATEGY_BACKTEST · Strategie-Backtest

Status **COLLECTING_HISTORY**, Stufe TESTED, Vertrauen NOT_READY, Bereitschaft NOT_READY, Owner-Freigabe laut Methodik nicht nötig. Hauptgrund: `HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING`.

| Gate | Kategorie | Zustand | Grund | Schwelle | Lösungsweg | Begründung |
|---|---|---|---|---|---|---|
| contract | HARD | PASS | – | – | – | – |
| pitGuards | HARD | PASS | – | – | – | – |
| membershipHistory | HISTORY | FAIL | HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING | 24 | nur durch Zeit/Daten | wächst mit den wöchentlichen Mitgliedschaftsständen; verlorene Monate holt man nicht nach (Abschnitt F). |
| factorHistory | HISTORY | FAIL | FACTOR_HISTORY_TOO_SHORT | 24 | nur durch Zeit/Daten | wächst mit den täglichen Faktor-Snapshots (Abschnitt F). |
| continuity | HISTORY | PASS | – | 45 Tage | – | – |
| returnBasis | STRUCTURAL | PASS | – | – | – | – |
| survivorship | STRUCTURAL | PASS | – | – | – | – |

### FACTOR_RANKING_BACKTEST · Faktor-/Ranking-Backtest

Status **COLLECTING_HISTORY**, Stufe TESTED, Vertrauen NOT_READY, Bereitschaft NOT_READY, Owner-Freigabe laut Methodik nicht nötig. Hauptgrund: `FACTOR_HISTORY_TOO_SHORT`.

| Gate | Kategorie | Zustand | Grund | Schwelle | Lösungsweg | Begründung |
|---|---|---|---|---|---|---|
| contract | HARD | PASS | – | – | – | – |
| pitGuards | HARD | PASS | – | – | – | – |
| factorHistory | HISTORY | FAIL | FACTOR_HISTORY_TOO_SHORT | 24 | nur durch Zeit/Daten | wie Strategy (Abschnitt F). |
| completedForward | HISTORY | FAIL | FORWARD_OUTCOMES_TOO_FEW | 12 | nur durch Zeit/Daten | Monate mit abgeschlossenem 3-Monats-Ergebnis = Faktormonate minus 3 (Abschnitt F). |
| membershipHistory | HISTORY | FAIL | HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING | 24 | nur durch Zeit/Daten | wie Strategy (Abschnitt F). |
| noRetroactive | HARD | PASS | – | – | – | – |

### Übersicht Blocker je Art

| Art | Status | Blocker | heute technisch | nur mit Owner-Entscheidung | nur durch Zeit/Daten | Befund (keine der drei) |
|---|---|--:|--:|--:|--:|--:|
| SAME_STOCK_REPLAY | LIMITED | 2 | 0 | 2 | 0 | 0 |
| PATTERN_EVIDENCE | LIMITED | 3 | 1 | 2 | 0 | 0 |
| SIGNAL_BACKTEST | LIMITED | 2 | 0 | 0 | 1 | 1 |
| SETUP_BACKTEST | COLLECTING_HISTORY | 9 | 1 | 2 | 6 | 0 |
| STRATEGY_BACKTEST | COLLECTING_HISTORY | 2 | 0 | 0 | 2 | 0 |
| FACTOR_RANKING_BACKTEST | COLLECTING_HISTORY | 3 | 0 | 0 | 3 | 0 |

Survivorship-Kontrolle des Artefakts: Gate PASS, Kontrolle PARTIAL (DELISTED_ONLY_FROM_2016, REUSED_TICKER_LISTINGS_UNFETCHABLE, DELIST_OUTCOME_UNKNOWN, MAIN_STUDY_SURVIVORS_ONLY).

## D. Abdeckung je Art: Survivorship, Delisting, Kapitalmaßnahmen, OOS, Walk-Forward, Kosten, Benchmark

| Art | Survivorship (Gate) | Delisting | Kapitalmaßnahmen und Renditebasis | Out-of-Sample | Walk-Forward | Kosten im Katalog | Benchmark im Katalog |
|---|---|---|---|---|---|---|---|
| SAME_STOCK_REPLAY | FAIL (SURVIVOR_BY_CONSTRUCTION) | Regel-Replay auf dl_-Reihen möglich (Profil V13_DELISTED_F1, privat); Wochen-Ledger nur Produktstamm ohne delistete Titel; Katalog mit delisteten Reihen: 1 | Split-bereinigte Wochenschlüsse (ADR-002, Loader-Evidenz); keine Dividenden in der Ereignisrendite; kein returnBasis-Gate | zugelassen, 0× ausgeführt | zugelassen, 0× ausgeführt | 20+20 bp (HIGH), 5+5 bp (STANDARD) | SPY |
| PATTERN_EVIDENCE | FAIL (PRESENT_AND_UNQUANTIFIED_IN_PART) | Überlebenden-Kohorte; delistete Population nur als geplante Sensitivität (P3.1); Katalog mit delisteten Reihen: 0 | Split-bereinigt; Kursrendite; Gate returnBasis FAIL (STUDY_RETURN_BASIS_NOT_TOTAL_RETURN) | zugelassen, 1× ausgeführt; Gate oos PASS | zugelassen, 1× ausgeführt | 5+5 bp (STANDARD) | NONE, SPY |
| SIGNAL_BACKTEST | FAIL (PARTIAL_SENSITIVITY_ONLY) | Ereignisse auf dl_-Reihen möglich (privat); finanziert: im Fenster delistete Titel fallen heraus (D4 offen); Ereignisse nach dem letzten Handelstag zensiert; Katalog mit delisteten Reihen: 1 | Gesamtrendite canonical-total-return-1.0.0; Gate returnBasis PASS | zugelassen, 2× ausgeführt | zugelassen, 2× ausgeführt | 20+20 bp (HIGH), 5+5 bp (STANDARD) | SPY |
| SETUP_BACKTEST | PASS | Rekonstruktion ohne delistete Titel (D6 offen); veröffentlichte Stände enthalten das Universum des Tages; Katalog mit delisteten Reihen: 0 | Rekonstruktion split-bereinigt; Ergebnisartefakt heute Kursrendite; Gate returnBasis FAIL (TOTAL_RETURN_NOT_IN_THIS_RUN) | zugelassen, 0× ausgeführt; Runner: RECONSTRUCTION_IS_NOT_OOS_EVIDENCE; Gate oos FAIL (OOS_NOT_MEASURABLE_YET) | zugelassen, 1× ausgeführt | 5+5 bp (STANDARD) | SPY |
| STRATEGY_BACKTEST | PASS | feste Gewichte auf der heutigen Kohorte; Verkauf zum letzten Schluss erst mit D5; Katalog mit delisteten Reihen: 0 | Dividenden aus dem TR-Register (Variante dividends), sonst Kurs; Split-bereinigt; Gate returnBasis PASS | nicht anwendbar | nicht anwendbar | 0+0 bp (NONE), 20+20 bp (HIGH), 5+5 bp (STANDARD) | SPY |
| FACTOR_RANKING_BACKTEST | kein survivorship-Gate | privates Panel nur ref_-Listings (D7 offen, dl_ werden ausgeschlossen); Katalog mit delisteten Reihen: 0 | Panelrenditen laut V10-Panel (privat); kein returnBasis-Gate | zugelassen, 0× ausgeführt | zugelassen, 0× ausgeführt | 5+5 bp (STANDARD) | SPY |

Delisting-Profile (`research-population.cjs`): `V13_DELISTED_F1` (F1), `V13_DELISTED_F1C` (F1c), `V13B_DELISTED_F1W` (F1w); alle privat, hashgebunden. Ereignisse nach dem letzten Handelstag werden zensiert, weder Totalverlust noch Abfindung angesetzt. Benchmark im Runner: `SPY_PRICE_RETURN` oder keiner.

## E. Nicht unterstützte, aber relevante Anwendungsfälle

| Anwendungsfall | Nutzwert | mit heutigen Engines und Daten machbar | braucht Freigabe | Bemerkung |
|---|---|---|---|---|
| Rechnen auf Abruf (beliebige Auswahl außerhalb des Katalogs) | hoch | Engine ja (Runner offline); Auslieferung nein: Pages ohne Node, Läufe bis 2,5 GB, private Archive | ja (Infrastruktur, Kosten) | heute heißt alles Nicht-Vorgerechnete „nicht vorgerechnet“ |
| Parametersensitivität im Katalog | mittel | ja: Methode zugelassen für Replay, Pattern, Signal, Strategy; im Katalog 0 Auswahlen | ja (Katalog-Generation 1 eingefroren, neue Generation H7) | nur registriertes Raster, Holm im Raster |
| Ereignisstudie außerhalb von Dividenden (Quartalszahlen, Einreichungen) | mittel | nein: EVENT_DRIVEN liest nur das TR-Dividendenregister | ja (neue Ereignisquelle = neue Forschung) | SEC-Daten wären frei, aber kein registriertes Ereignisregister |
| Delistete Titel in finanzierten Signal- und Strategy-Läufen | hoch | teilweise: Register und Reihen vorhanden (privat), Zeitplan fehlt (D4/D5) | ja (Fachmodell-PR, Archivweg mit Secret, nach H1) | schließt die Lücke vor 2016 nicht |
| Delistete Titel im Faktorpanel | hoch | nein: Panel nur ref_ (D7, größter Aufwand) | ja | Voraussetzung für ein überlebensfreies Faktor-Ranking vor 2028 |
| Strategy-Profilvariante (Zustand B im Katalog) | hoch | nein: braucht PIT-Faktor-Snapshots mit Zeilenverfügbarkeit | nein (Zeit) | die Snapshots wachsen seit 2026-09-23 |
| Benchmark außer SPY-Kursrendite (SPY TR, QQQ, gleichgewichtet) | mittel | nein: Spec kennt nur SPY und NONE | ja (Spec- und Vertragsänderung) | Wochenreihen weiterer ETFs wären zu prüfen |
| Backtest eines Nutzerportfolios oder der Watchlist | hoch | technisch ja (Strategy, feste Gewichte); fachlich mit Rückschaufehler (heute ausgewählt) | ja (Produkt, Kennzeichnung) | nur als Beschreibung, nie als Beleg |
| Tägliche Granularität | mittel | nein: Runner rechnet wöchentlich (grain WEEKLY) | ja (Fachmodell) | Tageskurse liegen vor |
| Short, Hebel, Steuern, Zins auf Kasse | gering bis mittel | nein: FRACTIONAL_LONG_ONLY, NO_CASH_INTEREST_OR_TAX | ja (Fachmodell) | bewusst ausgeschlossen |
| Märkte außerhalb der USA | mittel | nein: Security Master und Reihen nur US | ja (Daten) | Discover zeigt Europa als „noch nicht verfügbar“ |
| Öffentliche Anzeige der Ergebnisse auf #/backtest | hoch | technisch vorbereitet (Adapter, Vorschau), UI byte-gesperrt | ja (Praxistest, UI-Revision, Freigabe) | ohne Zertifizierung nur „Forschung, nicht zertifiziert“ |

## F. PIT-Historien: Integrität und frühestes Datum je Gate (Stichtag 2026-10-31)

Erzeugt mit `pit-snapshot-integrity.cjs` (`pit-snapshot-integrity-1.0.0`), Stände bis einschließlich Stichtag. Zählung wie der Zertifizierungs-Builder (`profile-backtest.js#historyCoverage`), Handelstage laut `quant/config/market-calendar.json` (XNYS-v1, abgedeckt bis 2027-12-31). Integrität gesamt: **PASS**.

| Reihe | Stände | Monate | erster | letzter | größte Lücke (Tage) | fehlend | contentHash | Index = Platte | Hash-Kette | Integrität |
|---|--:|--:|---|---|--:|---|---|---|---|---|
| Faktor-Snapshots vu-factor-evidence-2.0.0 | 24 | 2 | 2026-09-23 | 2026-10-30 | 3 | 4 von 28 Handelstagen: 2026-09-29, 2026-10-07, 2026-10-08, 2026-10-27 | 24/24 | ja | cee478d092fefd7e | PASS |
| Index-Mitgliedschaft SP500 | 7 | 2 | 2026-09-15 | 2026-10-31 | 11 | Wochen: 2026-09-15..2026-09-26 (11 Tage) | kein Feld (asOf geprüft) | kein Index | 12e239b29adee629 | PASS |
| Index-Mitgliedschaft NDX (nur Information) | 7 | 2 | 2026-09-15 | 2026-10-31 | 11 | Wochen: 2026-09-15..2026-09-26 (11 Tage) | kein Feld (asOf geprüft) | kein Index | 2a0e78ddc98e82d4 | PASS |
| Index-Mitgliedschaft DJIA (nur Information) | 7 | 2 | 2026-09-15 | 2026-10-31 | 11 | Wochen: 2026-09-15..2026-09-26 (11 Tage) | kein Feld (asOf geprüft) | kein Index | 82db247886be2105 | PASS |
| Setup-Stichtage setup-mapping-1.0.0 | 24 | 2 | 2026-09-10 | 2026-10-30 | 14 | 13 von 37 Handelstagen: 2026-09-11, 2026-09-14, 2026-09-15, 2026-09-16, 2026-09-17, 2026-09-18, 2026-09-21, 2026-09-22, 2026-09-23, 2026-09-29, 2026-10-07, 2026-10-08, 2026-10-27 | 24/24 | ja | 8a7d60dabb001e89 | PASS |

Fehlende Monate seit dem ersten Stand: keine.

| Art | Gate | Stand | Schwelle | erfüllt | frühestens | Regel |
|---|---|---|---|---|---|---|
| STRATEGY_BACKTEST | membershipHistory | 2 | 24 | nein | 2028-08 | ein Stand in jedem Folgemonat |
| STRATEGY_BACKTEST | factorHistory | 2 | 24 | nein | 2028-08 | ein Stand in jedem Folgemonat |
| STRATEGY_BACKTEST | continuity | 11 | 45 | ja | – | größte Lücke höchstens 45 Tage |
| FACTOR_RANKING_BACKTEST | factorHistory | 2 | 24 | nein | 2028-08 | ein Stand in jedem Folgemonat |
| FACTOR_RANKING_BACKTEST | completedForward | 0 | 12 | nein | 2027-11 | Faktormonate minus 3 ≥ 12, ein Stand in jedem Folgemonat |
| FACTOR_RANKING_BACKTEST | membershipHistory | 2 | 24 | nein | 2028-08 | ein Stand in jedem Folgemonat |
| SETUP_BACKTEST | historyDates | 24 | 120 | nein | 2027-03-22 (beobachteter Takt: 2027-06-04) | ein Stichtag je XNYS-Handelstag ab dem Stichtag; zweites Datum zum beobachteten Takt (0,649 Stände je Handelstag) |
| SETUP_BACKTEST | historySpan | 50 | 180 | nein | 2027-03-09 | erster Stichtag + 180 Tage, solange die Reihe weiterläuft |
| SETUP_BACKTEST | completedOutcomes | Ereignisse SETUP_CONFIRMED 170, SETUP_NEW 2084 | 100 | nein | 2027-03-26 (Untergrenze) | Datum des 100. Ereignisses einer Art + 183 Tage (Untergrenze: ein Ergebnis braucht auch Kurse) |
| SETUP_BACKTEST | titles | Titel SETUP_CONFIRMED 130, SETUP_NEW 1114 | 20 | nein | 2027-03-26 (Untergrenze) | erstes abgeschlossenes 6-Monats-Ergebnis einer Art mit mindestens 20 Titeln (Builder zählt dann alle Titel der Art) |
| SETUP_BACKTEST | independence | 2 | 20 | nein | 2028-04 | Ereignisse in jedem Folgemonat (der Builder zählt Monate mit Ereignissen) |
| SETUP_BACKTEST | entryVariant | – | – | nein | 2027-03-26 (Untergrenze) | erst mit abgeschlossenen Ergebnissen messbar; ob es besteht, ist offen |
| SETUP_BACKTEST | oos | – | 30 | nein | nicht prognostizierbar | nicht prognostizierbar: braucht die Owner-Entscheidung A1–A6 (Segmentdefinition) und 30 effektive Fälle je Segment |

| Art | offene zeitabhängige Gates | frühestens alle | nicht prognostizierbar | zusätzlich nötig (nicht zeitabhängig) |
|---|---|---|---|---|
| STRATEGY_BACKTEST | membershipHistory, factorHistory | 2028-08 | – | – |
| FACTOR_RANKING_BACKTEST | factorHistory, completedForward, membershipHistory | 2028-08 | – | – |
| SETUP_BACKTEST | historyDates, historySpan, completedOutcomes, titles, independence, entryVariant, oos | offen (bekannte Grenzen bis 2028-04) | oos | returnBasis (heute technisch), ownerApproval (nur mit Owner-Entscheidung) |

Replay, Pattern und Signal haben keine zeitabhängigen Gates: Ihre Blocker sind strukturell, normativ oder ein Befund (Abschnitt C). Monatsgates zählen Kalendermonate mit mindestens einem Stand; ein ausgelassener Monat verschiebt das Datum um einen Monat und wird nie nachgeholt.

## G. Reproduzierbarkeit

- **P0.5:** `run-backtest.cjs --help`; die eigene Ausgabe wird vor dem Schreiben gegen den Ergebnisvertrag v2 (`validate()`, mit dem committeten Zertifizierungsartefakt) und gegen `envelopeHash`/`resultHash` geprüft. Ein Verstoß schreibt nichts (Exit 1); geschrieben wird nur `--out`, atomar.
- **P0.7:** `envelopeHash` und `resultHash` binden mittelbar die Laufzeit: `research-portfolio.cjs` und `research-monte-carlo.cjs` nehmen Node-Version und Binär-Hash in ihr eigenes `resultHash` auf, das im Umschlag steht. Der Kennzahlen-Hash (`scripts/quant/research/backtest-metrics-hash.cjs`) lässt Hash-Felder und Laufzeitangaben weg und bindet nur Zahlen und Texte. Er ist zusätzlich: Runner, Demos, Katalog und Bundle bleiben bytegleich. Das Runner-Feld selbst braucht eine Freigabe (FV-2).

## H. Freigabevorlagen (Owner)

**FV-1 · Setup-Gate independence: Lesart der Schwelle**
- Lage: Die Methodik nennt die Schwelle independentWeeks: 20, der Builder zählt verschiedene Monate mit Ereignissen (Label „verschiedene Monate mit Ereignissen“). Zum heutigen Takt ist das Gate damit frühestens 2028-04 erfüllbar, alle anderen Setup-Zeitgates ab etwa 2027-03.
- Zur Entscheidung: A) Lesart „Monate“ bestätigen (keine Änderung; Setup frühestens 2028-04). B) Zählung auf Kalenderwochen umstellen (Gate-Änderung in build-backtest-certification.mjs, eigener PR mit Vorher/Nachher; frühestens etwa 2027-03).
- Hinweis: keine Empfehlung zur Schwelle; bis zur Entscheidung gilt A.

**FV-2 · Kennzahlen-Hash im Runner-Ergebnis (P0.7 vollständig)**
- Lage: Heute steht der laufzeitfreie Kennzahlen-Hash nur in der Hilfsfunktion backtest-metrics-hash.cjs und in der Zusammenfassungszeile von run-backtest.cjs. Ein Feld im Ergebnis ändert backtest-runner.cjs (CODE_FILES): alle 16 Demos veralten, Neubau über den Archivweg [v13-archive:demos] (Secret), danach Bundle-Export; der Katalog bleibt Generation 1 und bekäme das Feld erst mit Generation 2 (H7).
- Zur Entscheidung: Freigabe für: Runner-Feld metricsHash, Demo-Neubau über das Archiv, Bundle-Export im selben PR.
- Hinweis: empfohlen zusammen mit dem nächsten ohnehin nötigen Demo-Neubau.

**FV-3 · Determinismus-Prüfung in CI über zwei Node-Versionen (P0.6/P0.7)**
- Lage: Lokal belegt: gleicher Kennzahlen-Hash mit zwei verschiedenen Node-Binären (Test) und 16/16 öffentliche Katalogfälle mit gleichem Kennzahlen-Hash gegen den CI-Bau vom 31.10. Ein Workflow mit zwei Node-Versionen (workflow_dispatch, permissions: contents: read, ohne Secrets) fehlt.
- Zur Entscheidung: Freigabe für einen neuen Prüf-Workflow ohne Secrets; Laufzeit etwa 10 Minuten je Version.
- Hinweis: Minutenverbrauch prüfen.

**FV-4 · Gegenrechnung der 5 privaten Katalogfälle neu ausführen**
- Lage: Faktorpanel (3) und delistete Reihen (2) liegen nur im privaten R2-Archiv. Die committete Gegenrechnung (verify-report.json, 21 Fälle) bleibt gültig, solange der Code unverändert ist; lokal neu gerechnet wurden nur die 16 öffentlichen Fälle.
- Zur Entscheidung: Nur nötig nach einer Code-Änderung im Runner: [v13-archive:catalog] auf einem claude/**-Branch (Secret V13_ARCHIVE_PRIVATE_KEY).
- Hinweis: heute nicht nötig.

**FV-5 · Survivorship- und Renditebasis-Gates aus Sensitivitäten speisen (P3.3, P4.2)**
- Lage: Pattern und Signal bleiben LIMITED, bis die Gates die Sensitivität mit delisteten Titeln bzw. das Gesamtrendite-Ergebnis lesen. Das ändert die Eingabe der Zertifizierung.
- Zur Entscheidung: Freigabe je Gate, nach P3.1/P4.1 als Research-PR mit Vorher/Nachher und nach Security Master 1.3.0 (H1).
- Hinweis: Reihenfolge: H1, P4.1, P3.1, dann Freigabe.

**FV-6 · Setup-OOS A1–A6**
- Lage: Ohne Segmentdefinition bleibt das Setup-Gate oos FAIL.
- Zur Entscheidung: Entscheidung laut SETUP_OOS_DECISION_A1_A6.md.
- Hinweis: spätestens vor etwa 2027-03-26.

**FV-7 · Kennzeichnung der strukturell beschreibenden Arten (Replay, Pattern)**
- Lage: SAME_STOCK_REPLAY und PATTERN_EVIDENCE erreichen unter der geltenden Norm nie CERTIFIED (P3.4).
- Zur Entscheidung: Produktentscheidung: Anzeige als „Beschreibung, kein Test“ statt Warten auf Zertifizierung.
- Hinweis: Teil von H4.

**FV-8 · Alarm bei fehlendem Snapshot-Monat (P2.3)**
- Lage: pit-snapshot-integrity.cjs meldet Lücken mit Exit-Code und Bericht; eine Anbindung an den bestehenden Pipeline-Alarm ändert einen Workflow.
- Zur Entscheidung: Freigabe für die Workflow-Anbindung (ohne neue Secrets).
- Hinweis: die monatlichen Gates sind ab der ersten Lücke um einen Monat später.
