# Backtest-Ergebnisvertrag v2 (`backtest-result-2.0.0`)

Stand 2026-10-29 · Status: **Vorschlag, nicht verdrahtet** · keine Zertifizierung, `productionApproved` immer `false`.

Ein art-unabhängiger Umschlag für Backtest-Ergebnisse aus den **bestehenden** Engines und Artefakten. Er ersetzt keinen Vertrag, ändert keine Quellform und wird von keinem Produktpfad gelesen.

| Datei | Rolle |
|---|---|
| `quant/engines/backtest-kinds.cjs` | kanonische Registry: 6 Arten, 7 Methoden, Abbildung aller Taxonomien |
| `docs/quant/backtest-result-v2.schema.json` | maschinenlesbare Beschreibung (Abschnitte, Enums, Regeln, Alpha-Muster) |
| `quant/engines/backtest-result-contract.cjs` | `validate()` (fail-closed), `seal()`, `hash()` |
| `quant/engines/backtest-result-adapters.cjs` | reine Adapter bestehender Formen → v2 |
| `quant/api/backtest-research-adapter.js` | isolierter View-Modell-Vorschlag (Standard: disabled) |
| `scripts/quant/verify-backtest-result-v2.py` | unabhängige Python-Gegenrechnung der neu abgeleiteten Pfadkennzahlen |

Abweichung vom Auftrag: Die Schema-Datei liegt unter `docs/quant/` statt `quant/methodology/`. Jede JSON-Datei in `quant/methodology/` muss auf der öffentlichen Methodik-Seite (`quant/methodology/index.html`) stehen (`quant/tests/methodology-page.test.mjs`); diese Seite zu ändern wäre eine Frontend-Änderung.

## Schema

| Abschnitt | Inhalt |
|---|---|
| `identity` | `kind` (6 Arten), `scope` `SINGLE_LISTING`/`POPULATION`, `listingId`+`listingHash` bzw. `populationId`+`populationHash` (sha256), `source` {adapter, schemaVersion, engineVersion, artifact, resultHash} |
| `period` | `from`, `to` (≤ `asOf`), `asOf`, `grain` `DAILY`/`WEEKLY`/`MONTHLY`/`UNSPECIFIED` |
| `spec` | Regel-ID, Version, Beschreibung, `parameters`, `specHash` = sha256(kanonisches JSON ohne `specHash`) |
| `events` | `form` `EVENTS`/`TRADES`/`FINDING`/`NONE`, occurrences, completed, immature, censored, ineligible, titles, entry, exit |
| `portfolio` | nur bei `metrics.basis = PORTFOLIO`: `dates`, `equity`, `cashShare` (gleich lang, aufsteigend), Start-/Endkapital |
| `metrics` | `basis` `PORTFOLIO`/`PER_EVENT`/`NONE`; totalReturn, cagr, annualReturns, volatility, maxDrawdown, hitRate, trades, turnover, costs, cashShare, benchmark, excess, perEvent |
| `uncertainty` | method, interval, level, p, family {size, correction `HOLM`/`BENJAMINI_HOCHBERG`/`NONE`, adjustedP, alpha} |
| `dataQuality` | coverage, censored, terminal, corporateActions, totalReturnBasis, survivorship, warnings |
| `methods` | genau die 7 Methoden je einmal: `EXECUTED` (mit eigenem Ergebnis) / `NOT_RUN` / `NOT_APPLICABLE` |
| `limitations` | nicht leer, Codes |
| `status` | `state`, `certificationStatus`, `certificationScope` `KIND`/`RULE`, `certificationRuleId`, `certificationSource`, `productionApproved: false`, `evidenceKind` `OBSERVED`/`TESTED`/`SIMULATED_LEDGER`/`SYNTHETIC_TEST` |
| `envelopeHash` | sha256 des kanonischen Umschlags ohne `envelopeHash` |

**Zustände.** A `RESEARCH_EXECUTED`: nicht-synthetische historische Studie mit ≥ 1 beobachtetem Ausgang. B `PREPARED_DATA_LIMITED`: synthetische Daten, keine Ausgänge oder nur Zertifizierungsstand. C `PRODUCT_CERTIFIED`: nur, wenn ein mitgeliefertes `backtest-certification-v1`-Artefakt für genau diese Art (bzw. Regel) `CERTIFIED` meldet **und** `certificationViolations()` leer ist. Kein Adapter setzt C; A wird nie automatisch zu C. Heute meldet das Artefakt für keine Art `CERTIFIED`.

**Wichtige Regeln von `validate()`.** Unbekannte Felder sind Fehler. Unbekannte Zahl = `null`, nie 0. `PER_EVENT` verbietet totalReturn, cagr, annualReturns, turnover, cashShare (Ereignisstatistik ist kein finanziertes Portfolio; `maxDrawdown` ist dann der Median der Einzelfall-Drawdowns). `SYNTHETIC_TEST` erzwingt B. Wird ein Zertifizierungsartefakt mitgegeben, muss `certificationStatus` (außer `NOT_ASSESSED`) ihm entsprechen.

**Alpha-Regel (bewusst einfach).** Kein Textwert irgendwo im Umschlag darf Alpha oder einen bewiesenen Vorteil behaupten (Muster: `alpha` als Wort, „edge proven/confirmed/bewiesen…“, „proven/guaranteed edge|alpha|outperformance“, „beats the market“, „Vorteil/Überrendite bewiesen…“). Erlaubt nur mit `uncertainty.family.correction = HOLM` und `adjustedP < alpha ≤ 0,1`. Benjamini-Hochberg reicht nicht. Codes wie `NO_ALPHA_OR_CERTIFICATION_CLAIM` treffen das Muster nicht (Unterstrich ist Wortzeichen).

## Abbildung der Arten

| Kanonisch | certification | readiness-v2 id / key | evidence-status | research AREAS | run-research | research-studies finish |
|---|---|---|---|---|---|---|
| SAME_STOCK_REPLAY | SAME_STOCK_REPLAY | A / SAME_STOCK_REPLAY | HISTORICAL_REPLAY | SAME_STOCK_REPLAY | replay | SAME_STOCK_REPLAY_RULE |
| PATTERN_EVIDENCE | PATTERN_EVIDENCE | F / MARKET_PATTERN_BACKTEST | PATTERN_EVIDENCE | PATTERN_EVIDENCE | pattern | PATTERN_EVIDENCE |
| SIGNAL_BACKTEST | SIGNAL_BACKTEST | C / SIGNAL_BACKTEST | SIGNAL_BACKTEST | SIGNAL_BACKTEST | signal | SIGNAL_BACKTEST |
| SETUP_BACKTEST | SETUP_BACKTEST | B / SETUP_BACKTEST | SETUP_BACKTEST | SETUP_BACKTEST | setup | SETUP_BACKTEST |
| STRATEGY_BACKTEST | STRATEGY_BACKTEST | D / STRATEGY_BACKTEST | STRATEGY_BACKTEST | STRATEGY_BACKTEST | strategy | – |
| FACTOR_RANKING_BACKTEST | FACTOR_RANKING_BACKTEST | E / FACTOR_RANKING_BACKTEST | – (nicht geführt) | FACTOR_RANKING_BACKTEST | factor | FACTOR_RANKING_BACKTEST |

Methoden: AREAS `MONTE_CARLO`, `WALK_FORWARD`, `OUT_OF_SAMPLE`, `MARKET_REGIME`, `PARAMETER_SENSITIVITY`, `EVENT_DRIVEN`, `PORTFOLIO_REBALANCING` ↔ run-research `monte-carlo`, `walk-forward`, `out-of-sample`, `regime`, `sensitivity`, `event`, `rebalancing`; finish-Art `EVENT_DRIVEN` ist eine Methode (Adapter verlangt dann `opts.kind`). `quant/tests/backtest-kinds.test.mjs` liest alle Kennungen aus den echten Dateien (Methodikvertrag, Build-Skripte, Produktartefakte, `research-contract.cjs`, `run-research.cjs`, `research-studies.cjs`) und verlangt Gleichheit mit der Registry; unbekannte Kennungen werfen.

## Adapter-Abdeckung

| Quelle (unverändert) | Adapter | Geprüft gegen | Basis | Zustand heute |
|---|---|---|---|---|
| `signal-backtest-v1` Regel (`signal-backtest-study-2.0.0`) | `fromSignalStudyRule` | alle 5 Regeln des Produktartefakts | PER_EVENT | A, Zertifizierung je Regel `LIMITED` |
| `setup-backtest-v1` Regel | `fromSetupStudyRule` | alle 3 Regeln | PER_EVENT | A, `COLLECTING_HISTORY`, Anzeige nicht erlaubt |
| `pattern-research-v1` Befund | `fromPatternFinding` | alle 163 Befunde | PER_EVENT | A, `LIMITED`, BH statt Holm |
| `research-studies` finish() (alle 6 Arten) und `run-research` execute() | `fromResearchStudy` | Forschungs-Fixtures (synthetisch → B; historische Simulation → A) | PER_EVENT/NONE | B bzw. A |
| `research-portfolio` runPortfolio | `fromPortfolio` | Fixture, Python-Gegenrechnung | PORTFOLIO | B (synthetisch) |
| Real-Weekly-Ledger (`run-real-weekly-backtest.cjs`) | `fromRealWeeklyLedger` | NVDA aus committeter Wochenhistorie, Python-Gegenrechnung | PORTFOLIO | A, `SIMULATED_LEDGER`, nur Kursrendite |
| `backtest-certification-v1` Art | `statusFromCertification`, `fromCertificationKind` | alle 6 Arten | NONE | B |

Neu abgeleitet werden nur Pfadkennzahlen aus vorhandenen Pfaden/Ereignissen (Jahresrenditen, annualisierte Volatilität nach beobachteter Zeilenfrequenz, Cash-Anteil, Trefferquote, Median-Drawdown, mittlere Benchmark-Differenz); `verify-backtest-result-v2.py` rechnet sie unabhängig nach (`python3 -I`).

## API-Vorschlag

`getResearchBacktest(kind, envelope, {enabled, certification})`: prüft den Umschlag, verweigert `PRODUCT_CERTIFIED` ohne passendes Zertifizierungsartefakt, liefert ohne `enabled: true` nur `{state: DISABLED, status, limitations}`. Eingeschaltet entsteht ein Objekt mit genau den Feldern, die `page-backtest.js` heute liest (`PAGE_BACKTEST_FIELDS`, per Test gegen den Seitenquelltext abgeglichen), immer mit `display.allowed = false` und `trust = NOT_READY` – die Seite würde also nur Gründe zeigen, keine Zahl.

## Bewusst nicht verdrahtet

- `quant/api/product-services.js`, `quant/index.html`, `quant/app/**`, Views und Navigation kennen keines der neuen Module (Test).
- Kein neuer Endpunkt, kein Artefakt unter `quant/data`, kein Workflow.
- Zertifizierungsvertrag, Gates, Setup-Freigabe und OOS-Norm unverändert; keine Regel, kein Score, kein Ranking geändert.
- Eine Anzeige von Research-Zahlen im Produkt wäre eine eigene Owner-Entscheidung mit eigenem PR.
