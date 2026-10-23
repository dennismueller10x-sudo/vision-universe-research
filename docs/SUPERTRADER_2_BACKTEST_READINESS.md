# Supertrader 2.0 – Backtest Readiness

Generiert aus `scripts/supertrader/source-faithful/artifacts/` mit `node scripts/supertrader/source-faithful/completion/build-completion-docs.mjs`. Nicht von Hand bearbeiten. Alle historischen Aussagen `DIAGNOSTIC_NOT_CERTIFIED`; keine Methode ist live oder handelbar. Bericht: [SUPERTRADER_2_COMPLETE_TRADING_SYSTEMS_REPORT.md](SUPERTRADER_2_COMPLETE_TRADING_SYSTEMS_REPORT.md).

Regel: a full diagnostic method measurement only when all eight answers are YES (mandate section 14); a runnable engine with a declared data exception may run only as DIAGNOSTIC_RUN_WITH_DECLARED_DATA_EXCEPTION (the unenforced rule is named in every result); otherwise component studies at most, never reported as a method return.

Bindung: Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, `--accounting research-v1`.

| Strategie | completeEntries | completeExits | positionSizeDefined | stopsComplete | requiredDataPresent | accountingValid | signalsCausal | dataSufficient | erlaubt | deklarierte Grenzen |
|---|---|---|---|---|---|---|---|---|---|---|
| `SF_TURTLE_S1` | ja | ja | ja | ja | **nein** | ja | ja | ja | **DIAGNOSTIC_RUN_WITH_DECLARED_DATA_EXCEPTION** | TUR-SF-LIMIT-CORR (DATA, not enforced), TUR-SF-S1-OPEN-BREAKOUT (SOURCE, readings as scenarios), TUR-SF-FAILSAFE-EXIT (SOURCE, readings as scenarios) |
| `SF_TURTLE_S2` | ja | ja | ja | ja | **nein** | ja | ja | ja | **DIAGNOSTIC_RUN_WITH_DECLARED_DATA_EXCEPTION** | TUR-SF-LIMIT-CORR (DATA, not enforced) |
| `SF_DARVAS_BOX` | ja | **nein** | **nein** | ja | ja | **nein** | ja | ja | **COMPONENT_SIGNAL_STUDY_ONLY** | – |
| `SF_WEINSTEIN_INVESTOR` | ja | **nein** | **nein** | **nein** | **nein** | **nein** | ja | ja | **NONE** | – |
| `SF_WEINSTEIN_TRADER` | ja | **nein** | **nein** | **nein** | **nein** | **nein** | ja | ja | **NONE** | – |
| `SF_MINERVINI_SEPA_VCP` | **nein** | **nein** | **nein** | **nein** | **nein** | **nein** | ja | ja | **NONE** | – |
| `SF_MINERVINI_POWER_PLAY` | **nein** | **nein** | **nein** | **nein** | ja | **nein** | ja | ja | **NONE** | – |
| `SF_KK_BREAKOUT` | **nein** | **nein** | **nein** | ja | ja | **nein** | ja | ja | **NONE** | – |
| `SF_KK_EPISODIC_PIVOT` | **nein** | **nein** | **nein** | ja | **nein** | **nein** | ja | **nein** | **NONE** | – |
| `SF_KK_PARABOLIC_SHORT` | **nein** | **nein** | **nein** | **nein** | **nein** | **nein** | ja | **nein** | **NONE** | – |
| `SF_MOKA_POCKET_PIVOT` | **nein** | **nein** | **nein** | **nein** | ja | **nein** | ja | ja | **NONE** | – |
| `SF_MOKA_BUYABLE_GAP_UP` | **nein** | **nein** | **nein** | **nein** | ja | **nein** | ja | ja | **NONE** | – |
| `SF_RASCHKE_HOLY_GRAIL` | **nein** | **nein** | **nein** | **nein** | ja | **nein** | ja | ja | **NONE** | – |

Bekannte Befunde, die jede historische Zahl erbt: V4-D1 (nicht deklarierte Reverse-Splits), V4-D2 (Aktiengattungen). Sie verhindern eine Zertifizierung, keine diagnostische Messung.

## Snapshot-Läufe (nur öffentliche Belege)

| Methode | Art | Lauf | Datum | Engine | Beleg | Ergebnisse | Abstimmung | Rolle |
|---|---|---|---|---|---|---|---|---|
| `SF_TURTLE_S1` | METHOD | 39271055007 | 2026-10-19 | sf-turtle-1.0.0 | `64b9aece4cb32f43` | BASE_S0 827, DELIST_S1_MINUS_30 789, DELIST_S2_DISTRESS_ZERO 789, COST2_S1 805, DATA_EVENT_MINUS_30 796 | PASS | REGRESSION_REFERENCE |
| `SF_TURTLE_S2` | METHOD | 39271055007 | 2026-10-19 | sf-turtle-1.0.0 | `d32dd805a3a4429b` | BASE_S0 609, DELIST_S1_MINUS_30 578, DELIST_S2_DISTRESS_ZERO 578, COST2_S1 578, DATA_EVENT_MINUS_30 659 | PASS | REGRESSION_REFERENCE |
| `SF_TURTLE_S1` | METHOD | 39397517900 | 2026-10-20 | sf-turtle-1.2.0 | `23f3c932e2ef3213` | BASE_S0 820, DELIST_S1_MINUS_30 980, DELIST_S2_DISTRESS_ZERO 980, COST2_S1 841, DATA_EVENT_MINUS_30 747, FAILSAFE_EXIT_20D 574, ENTRY_BAR_OPTIMISTIC 786, S1_OPEN_BREAKOUT_TAKEN 803 | PASS | CURRENT_ENGINE |
| `SF_TURTLE_S2` | METHOD | 39397517900 | 2026-10-20 | sf-turtle-1.2.0 | `3d72a153e41f27be` | BASE_S0 559, DELIST_S1_MINUS_30 524, DELIST_S2_DISTRESS_ZERO 524, COST2_S1 604, DATA_EVENT_MINUS_30 586, FAILSAFE_EXIT_20D 559, ENTRY_BAR_OPTIMISTIC 528, S1_OPEN_BREAKOUT_TAKEN 559 | PASS | CURRENT_ENGINE |
| `SF_DARVAS_BOX` | COMPONENT_STUDY | 39397517900 | 2026-10-20 | sf-darvas-1.1.0 | `b11a5fd25920419f` | 22577 Signale | – | CURRENT_ENGINE |
| `SF_TURTLE_S1` | METHOD | 39392734794 | 2026-10-20 | sf-turtle-1.1.0 | `6b860bb6d72836bd` | BASE_S0 820, DELIST_S1_MINUS_30 980, DELIST_S2_DISTRESS_ZERO 980, COST2_S1 841, DATA_EVENT_MINUS_30 747, FAILSAFE_EXIT_20D 574 | PASS | REGRESSION_REFERENCE |
| `SF_TURTLE_S2` | METHOD | 39392734794 | 2026-10-20 | sf-turtle-1.1.0 | `4cc089e9e5fdc640` | BASE_S0 559, DELIST_S1_MINUS_30 524, DELIST_S2_DISTRESS_ZERO 524, COST2_S1 604, DATA_EVENT_MINUS_30 586, FAILSAFE_EXIT_20D 559 | PASS | REGRESSION_REFERENCE |
| `SF_DARVAS_BOX` | COMPONENT_STUDY | 39392734794 | 2026-10-20 | sf-darvas-1.1.0 | `f6c0386da496e2d9` | 22577 Signale | – | REGRESSION_REFERENCE |
| `SF_DARVAS_BOX` | COMPONENT_STUDY | 39271055007 | 2026-10-19 | sf-darvas-1.0.0 | `2fd60c5965c7e6c9` | 22577 Signale | – | REGRESSION_REFERENCE |

Kennzahlen (Rendite, Drawdown usw.) liegen nur versiegelt beim Owner. Eine Komponentenstudie ist nie eine Methodenrendite.

## Modellannahmen (keine Quellenregeln)

Was die Quelle nicht entscheidet oder Tagesbalken nicht zeigen. Jede Annahme hat eine Referenzlesart; die Gegenlesart läuft als eigenes Szenario. Keine Lesart wird nach Ergebnis gewählt.

| Annahme | Art | offene Frage | warum nicht entschieden | Referenz | Gegenlesart (Szenario) | auflösbar mit |
|---|---|---|---|---|---|---|
| MA-TUR-INTRABAR-ORDER | EXECUTION_ON_DAILY_BARS | On a bar that reaches an entry or add level AND a stop or exit level, which came first? | not decidable: the source trades intraday (TUR-INTRADAY, TUR-ADDFAST); daily OHLC bars do not record the order | entryBarOrder=PESSIMISTIC: the low comes after the entry and the adds (unit stops and channel level checked after them; the S1 filter resolves its hypothetical breakout on the breakout bar the same way) | entryBarOrder=OPTIMISTIC: the low comes before the entry: no same-bar stop or channel exit after an entry or add (ENTRY_BAR_OPTIMISTIC) | intraday bars of the trigger days (IEX minutes from 2017 exist privately for the r9 study; not frozen in the snapshot) |
| MA-TUR-HELD-BAR-ORDER | EXECUTION_ON_DAILY_BARS | On a held bar with several levels in range, which is reached first? | not decidable on daily bars | fixed: the level nearer the open first (unit stops above the channel level before it); exits before adds; no add on a bar on which a unit was stopped | keine (feste, deklarierte Konvention) | intraday bars |
| MA-TUR-S1-OPEN-BREAKOUT | SOURCE_SILENT | Does a still unresolved (open) hypothetical last breakout make System 1 skip the next 20-day breakout? | TUR-S1SKIP defines a skip after a winning last breakout; the source does not say how an open one counts (#709 VU-TUR lists "open breakout assumed a winner" as a VU formalization) | openBreakout=SKIP: an open breakout counts as not losing: skip (the 55-day failsafe can still enter) | openBreakout=TAKE: only a resolved winning breakout skips; an open one does not (S1_OPEN_BREAKOUT_TAKEN) | no further source in #709 / #712 |
| MA-TUR-FAILSAFE-EXIT | SOURCE_SILENT | Which exit does a 55-day failsafe position use? | TUR-FAILSAFE states only the entry; #709 VU-TUR: "Failsafe-Exit10 ist Auslegung, nicht ausdrücklich veröffentlichte Failsafe-Regel"; #709 revalidation TUR-F-FAILSAFE-55: "Ausstiegsregel für Failsafe-Positionen nicht ausdrücklich genannt"; #712 spec V4 T4-FAILSAFE: "exit like S1 (interpretation)" | failsafeExit='10D': System 1 exit (10-day low); the reading of the earlier VU engines, an interpretation | failsafeExit='20D': System 2 exit (20-day low), the exit of the system whose entry channel the failsafe uses; equally an interpretation (FAILSAFE_EXIT_20D) | no further source in #709 / #712 |

## Ausführungskonventionen

- `SF_TURTLE_S1` (RESEARCH_EXECUTABLE): Signal intraday on the bar whose high reaches the trigger (stop order resting from the prior close); frühestens ausführbar same bar: fill = max(open, trigger); every level uses only bars up to the prior close; Konventionen: liquidity: no participation limit in the source ("liquid markets" = research universe protocol); every run reports fill participation of bar volume and of the 20-session mean as a diagnostic; daily bars: the order of intrabar events is a convention: on a held bar exits come before adds and a raised stop is re-checked pessimistically; on the entry bar the order is entry -> adds -> unit stops above the channel level -> channel exit, even if the low was traded at the open (pessimistic, counted); model assumptions are reported, never decided by result: MA-TUR-INTRABAR-ORDER (scenario ENTRY_BAR_OPTIMISTIC), MA-TUR-HELD-BAR-ORDER (fixed convention, no bound)
- `SF_TURTLE_S2` (RESEARCH_EXECUTABLE): Signal intraday on the bar whose high reaches the trigger (stop order resting from the prior close); frühestens ausführbar same bar: fill = max(open, trigger); every level uses only bars up to the prior close; Konventionen: liquidity: no participation limit in the source ("liquid markets" = research universe protocol); every run reports fill participation of bar volume and of the 20-session mean as a diagnostic; daily bars: the order of intrabar events is a convention: on a held bar exits come before adds and a raised stop is re-checked pessimistically; on the entry bar the order is entry -> adds -> unit stops above the channel level -> channel exit, even if the low was traded at the open (pessimistic, counted); model assumptions are reported, never decided by result: MA-TUR-INTRABAR-ORDER (scenario ENTRY_BAR_OPTIMISTIC), MA-TUR-HELD-BAR-ORDER (fixed convention, no bound)
- `SF_DARVAS_BOX` (MANUAL_REVIEW_SCREEN): Signal buy stop resting a fraction above a COMPLETED box top (both boundaries confirmed by the close of the confirming session); frühestens ausführbar the first session after the box is complete whose high reaches the trigger; fill = max(open, trigger); Konventionen: component study population: the pre-registered research universe of #705 (raw close >= 5, 20-session dollar volume >= 1M at the prior session), a measurement convention, not a Darvas rule (DAR-Q10: no general minimum)
- `SF_WEINSTEIN_INVESTOR` (MANUAL_REVIEW_SCREEN): Signal the completed week whose high exceeds the base resistance (buy-stop prepared from the prior week); frühestens ausführbar a reviewer decision after the week closes; never back-filled into history
- `SF_WEINSTEIN_TRADER` (MANUAL_REVIEW_SCREEN): Signal the completed week whose high exceeds the high of the consolidation; frühestens ausführbar a reviewer decision after the week closes; never back-filled into history
- `SF_MINERVINI_SEPA_VCP` (MANUAL_REVIEW_SCREEN): Signal the daily close on which all machine Trend Template criteria hold; frühestens ausführbar a reviewer decision after the close; never back-filled into history
- `SF_MINERVINI_POWER_PLAY` (MANUAL_REVIEW_SCREEN): Signal the daily close on which the measured run-up and consolidation criteria hold; frühestens ausführbar a reviewer decision after the close
- `SF_KK_BREAKOUT` (MANUAL_REVIEW_SCREEN): Signal daily close (screen); the daily breakout entry is the breakout-day close, at which the low of day is final; frühestens ausführbar breakout-day close (market-on-close) after the reviewer accepts the level; Konventionen: the opening-range-high entry (his main entry) is DATA_BLOCKED; the daily close variant is the written alternative (KK-011), not the same execution; the final low of day is unknown during an intraday entry; the daily variant enters at the close so that the stop rule can be evaluated exactly
- `SF_KK_EPISODIC_PIVOT` (COMPONENTS_ONLY_DATA_BLOCKED): Signal catalyst timestamp and the first intraday minutes (not available); frühestens ausführbar not executable on the snapshot
- `SF_KK_PARABOLIC_SHORT` (COMPONENTS_ONLY_DATA_BLOCKED): Signal intraday (not available); frühestens ausführbar not executable on the snapshot; Konventionen: short side and intraday execution are DATA_BLOCKED; nothing in this method can be measured on history
- `SF_MOKA_POCKET_PIVOT` (MANUAL_REVIEW_SCREEN): Signal daily close of the candidate day (its full volume is known only then); frühestens ausführbar reviewer decision after the close; intraday projected volume is not available
- `SF_MOKA_BUYABLE_GAP_UP` (MANUAL_REVIEW_SCREEN): Signal daily close of the gap day (full-day volume); frühestens ausführbar reviewer decision after the close; intraday projected volume is not available; Konventionen: daily variant only: evaluated with full-day volume after the close
- `SF_RASCHKE_HOLY_GRAIL` (MANUAL_REVIEW_SCREEN): Signal daily close of the first bar whose low touches the 20 EMA after ADX(14) > 30; frühestens ausführbar reviewer decision after the close (entry order not disclosed); Konventionen: the primary source W-RAS04 discloses neither entry order nor stop (#709 C13); both rest on the secondary source W-RAS97 (D-RAS97), trailing and size stay undisclosed, so no historical method return can be computed; intraday timeframes DATA_BLOCKED; the daily component is the disclosed rule on one allowed timeframe (RAS04-006). #712 rated Holy Grail DATA_BLOCKED for the intraday case; the daily case is computable
