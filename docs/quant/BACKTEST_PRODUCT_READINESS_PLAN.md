# Quant Backtesting: Entwicklungsplan zur kontrollierten Produktreife (Stand 30.10.2026)

Grundlage ist der integrierte Stand auf `main` (`bd5bcf857f`). Abgeschlossene Forschung (V10–V13c) wird nicht wiederholt. Es gibt keine künstlichen Alpha-Ergebnisse und keine Änderung an Zertifizierungsgates oder Schwellen (`quant/methodology/backtest-certification-v1.json`). `productionApproved=false` bleibt, ebenso wie die Regel, dass ohne Owner-Freigabe nichts öffentlich aktiviert wird. Alle Fachmodelländerungen kommen in einen eigenen PR mit Vorher/Nachher-Vergleich (CLAUDE.md).

## 1. Integrierter Stand

### 1.1 Sechs Arten (Artefakt `quant/data/product/backtest-certification-v1.json`, 0/6 zertifiziert)

| Art | Engine / Runner-Pfad | Research | Produkt | blockierende Gates | Art der Blockade |
|---|---|---|---|---|---|
| SAME_STOCK_REPLAY | `research-studies.runReplayValidation`, Wochenbuch `scripts/quant/run-real-weekly-backtest.cjs` | A | LIMITED | `survivorship` (SURVIVOR_BY_CONSTRUCTION), `ruleTest` (DESCRIPTIVE_NOT_A_TEST) | strukturell: wird durch Warten nicht besser |
| PATTERN_EVIDENCE | `quant/engines/pattern-research.js` | A | LIMITED | `survivorship`, `returnBasis` (nur Kursrendite), `certifiedAsBacktest` | Daten (Delisted-Reihen, Gesamtrendite) |
| SIGNAL_BACKTEST | `signal-backtest.js`, `v10/studies/signal-study.cjs`, funded über `runPortfolio` | A | LIMITED | `survivorship` (nur teilweise Sensitivität), `ruleCertified` 0/5 | Daten und Befund: V10–V13 ohne belastbares Alpha |
| SETUP_BACKTEST | `runSetupStudy` auf `setup-replay-v1` (Rekonstruktion) | A (nur Rekonstruktion) | COLLECTING_HISTORY | historyDates 23/120, Spanne 49/180 Tage, M6-Ergebnisse 0/100, Titel 0/20, Unabhängigkeit 2/20, OOS nicht messbar | Zeit; Segmentierung braucht Owner-Entscheidung (A1–A6) |
| STRATEGY_BACKTEST | `runPortfolio` + `buildSchedule`, Profilvariante `buildProfileTargets` | A (feste Gewichte), B (Profil) | COLLECTING_HISTORY | Mitgliedschafts- und Faktorhistorie je 2/24 Monate | Zeit: frühestens ~2028-08 |
| FACTOR_RANKING_BACKTEST | `runFactorStudy` auf dem privaten V10-PIT-Panel | A nur mit Panel | COLLECTING_HISTORY | Faktorhistorie 2/24, Forward-Monate 0/12 | Zeit: frühestens ~2028-01/08 |

### 1.2 Sieben Zusatzmethoden (`quant/engines/backtest-kinds.cjs`, Zulassung `METHOD_FIT` in `scripts/quant/research/backtest-runner.cjs`)

| Methode | Umsetzung | Arten | Tests |
|---|---|---|---|
| MONTE_CARLO | `research-monte-carlo.runMonteCarlo` | Replay, Strategy, Signal (funded) | `research-monte-carlo.test.mjs` |
| WALK_FORWARD | `research-validation.buildWalkForward` | alle außer Strategy | `research-validation*.test.mjs` |
| OUT_OF_SAMPLE | `research-validation.aggregateOos`; bei Setup bewusst NOT_RUN (`setup-oos.evaluateSetupOos`) | alle außer Strategy | `setup-oos`, `research-validation` |
| MARKET_REGIME | `classifyRegimes`/`analyzeRegimes` (PIT auf SPY) | alle | Runner-Tests |
| PARAMETER_SENSITIVITY | `runSensitivity`, nur aufgezeichnetes Raster, Holm im Raster | Replay, Pattern, Signal, Strategy | Runner-Tests |
| EVENT_DRIVEN | `runEventStudy` auf TR-Register-Dividenden | alle | Runner-Tests |
| PORTFOLIO_REBALANCING | `research-portfolio.cjs` | Strategy, Signal (funded) | `research-portfolio*.test.mjs` |

Keine der sieben Methoden speist die Zertifizierung. Der Zertifizierungs-Builder rechnet seine Gates selbst. Die Produkt-Builder führen eine eigene OOS- und Walk-Forward-Logik mit anderen Schwellen; diese Doppelung ist bekannt (Engineering-Handover).

### 1.3 Adapter

- **`quant/api/backtest-research-adapter.js` (gemergt).** Prüft den Ergebnisvertrag v2 und gibt standardmäßig `DISABLED` zurück. Auch eingeschaltet setzt er immer `display.allowed=false` und `trust NOT_READY`. Kein Produktmodul importiert ihn; ein Isolationstest stellt das sicher.
- **Interne Vorschau (#1138, Draft, nicht gemergt).** Lesemodell `backtest-preview-1.0.0`, Schalter `options.backtestPreview {enabled, audience: INTERNAL_REVIEW}`. Nicht verdrahtet.
- **Produktadapter für Strategy/Factor:** existiert nicht. Er ist laut Entscheidungsvorlage B2/C2 bewusst zurückgestellt.

## 2. Was Produktreife hier bedeutet

Eine Art erreicht C nur über das Zertifizierungsartefakt (`scripts/quant/build-backtest-certification.mjs`, Workflow `product-intelligence-materialization.yml`). Zusätzlich braucht der Runner `requestProductCertifiedState=true` und einen Lauf im Zustand A. Der Plan verfolgt drei Ziele:
1. **Technik:** Die Kette Spezifikation → Runner → Ergebnis → Adapter → (später) Anzeige ist reproduzierbar, getestet und fail closed. Das ist unabhängig vom Befund erreichbar.
2. **Daten:** Die Historien laufen lückenlos und prüfbar weiter, denn sie sind die harte Zeitgrenze.
3. **Fachlich:** Wo der Befund negativ ist, zeigt das Produkt den Befund ehrlich als „kein belegter Vorteil“. Es wird kein Alpha erzeugt.

## 3. Arbeitspakete

### Phase P0 – Engineering-Hygiene (sofort, keine Zahlenänderung, autonom möglich)

| Nr. | Paket | Wirkung | Akzeptanz |
|---|---|---|---|
| P0.1 | Anzeigefehler Parität in `measure-backtest-signal-intelligence.mjs` (zeigte `checked/checked` statt `(checked−mismatches)/checked`) | Messwert ist auch bei Abweichungen korrekt | **erledigt in diesem PR**; heute `3478/3478`, Ausgabe unverändert |
| P0.2 | Test: JSON-Schema `docs/quant/backtest-result-v2.schema.json` stimmt mit `validate()` überein (Enums, Pflichtfelder) | verhindert eine stille Abweichung im Vertrag | **besteht bereits** (`backtest-result-contract.test.mjs`, Test „schema document and contract engine agree“) |
| P0.3 | Test: Runner-Pfad gegen das **committete** Zertifizierungsartefakt (`certificationViolations` = 0, keine Art C) | Runner und Artefakt können nicht auseinanderlaufen | **besteht bereits** (`backtest-certification.test.mjs` prüft das committete Artefakt; der Runner bricht bei Verstößen mit `CERTIFICATION_ARTIFACT_VIOLATES_ITS_CONTRACT` ab) |
| P0.4 | Veraltungswächter für die 16 Demofälle: Ergebnis-Hashes gegen `CODE_FILES` des Runners | Demos veralten nicht unbemerkt | **#1171**: Wächter `check-backtest-demo-freshness.cjs`. Befund: Alle 16 Demos zeichnen `research-delisted-series.cjs` im Stand `45d7a67c9e` auf, `main` hat `8315b0c82b`. **erledigt in #1178** (Neubau auf dem Runner aus dem R2-Archiv, Python 276.828 Prüfungen/0 Abweichungen, 15/16 Fälle ohne Kennzahländerung); mit #1171+#1178 meldet der Wächter `Code CURRENT`, danach `--strict` in CI möglich |
| P0.5 | `run-backtest.cjs`: `--help` und Prüfung der eigenen Ausgabe gegen den Vertrag | Bedienbarkeit, fail closed | Ausgabe nur nach `--out` |
| P0.6 | Opt-in-CI-Job (workflow_dispatch, `permissions: contents: read`) für `BACKTEST_RUNNER_FULL=1` | Echtdaten-Tests laufen regelmäßig, nicht nur lokal | kein Commit, nur Bericht |
| P0.7 | Reproduzierbarkeit über Laufzeiten: Kennzahlen-Hash ohne Node-Binär-Hash zusätzlich ausweisen | Determinismus in CI prüfbar | zwei Node-Versionen liefern denselben Kennzahlen-Hash |

### Phase P1 – Konsolidierung (je eigener PR mit Vorher/Nachher, da Zahlen sich bewegen können)

| Nr. | Paket | Risiko | Vorgehen |
|---|---|---|---|
| P1.1 | Eine Jahreslänge für CAGR (heute 365,25 in `backtest-metrics.cjs`, `backtest.js`, `research-portfolio.cjs`; 365,2425 in `run-real-weekly-backtest.cjs`, `weekly-benchmark.cjs`) | Abweichungen in der 4.–5. Stelle | gemeinsame Konstante; Vorher/Nachher je betroffenem Artefakt; Owner-Freigabe |
| P1.2 | OOS/Walk-Forward der Produkt-Builder auf `research-validation` zurückführen | Fachmodell | Paritätstest alt gegen neu, Schwellen unverändert übernommen |
| P1.3 | FACTOR_RANKING in die Evidenz-Taxonomie (`backtest-kinds.cjs`) | gering | reine Vollständigkeit, Test |
| P1.4 | V10_LIFECYCLE-Listingdrift (4.327 gegen 4.329) erklären oder einfrieren | gering | Diagnose über `scripts/core/diagnose.mjs` |

### Phase P2 – Datenhistorie absichern (Zeitkritisch: verlorene Monate holt man nicht nach)

| Nr. | Paket | Warum |
|---|---|---|
| P2.1 | Monatlicher Integritätsbericht der PIT-Snapshots (Faktor, Mitgliedschaft, Setup-Stichtage): Lücke, Hash-Kette, Zählerstand gegen das Gate (z. B. 2/24) | Strategy und Factor brauchen 24 lückenlose Monate; eine unbemerkte Lücke verschiebt C um Monate |
| P2.2 | Prognose je Art: frühestes Datum, an dem jedes HISTORY-Gate erfüllt sein kann, aus dem heutigen Takt | ehrliche Planung statt Schätzung |
| P2.3 | Alarm (bestehender `pipeline-alarm`), wenn ein Snapshot-Monat fehlt | fail closed im Betrieb |

### Phase P3 – Survivorship (strukturelle Blockade von Replay, Pattern, Signal)

Voraussetzungen: Security Master 1.3.0 ist produktiv, die Backtest-Identitätssperre (#1159, gemergt) ist aktiv und die Security-Master-Freigabe ist abgeschlossen.

| Nr. | Paket | Hinweis |
|---|---|---|
| P3.1 | Delisted-Register 1.0.0/1.1.0 (1.675/1.688 QUALIFIED, hashgebundener Loader `research-delisted-series.cjs`) als **zusätzliche** Population im Runner für Pattern und Signal; Ergebnis als Sensitivität neben dem Überlebenden-Ergebnis | Wiederverwendung, keine neue Forschung; Befund bleibt, was er ist |
| P3.2 | Owner-Klärung der Tiingo-Rechte für delistete Historie (Bestandsaufnahme `TIINGO_LICENSE_REVIEW.md`, #1179): interne Berechnung wahrscheinlich zulässig, öffentliche Ergebnisanzeige nicht belegt, Rohkurse nein | Voraussetzung für P3.3 |
| P3.3 | Gate `survivorship` liest die Sensitivität (bestehende Gate-Definition, keine neue Schwelle) | nur nach P3.2 |
| P3.4 | SAME_STOCK_REPLAY bleibt beschreibend (`ruleTest` strukturell). Produktziel ist eine klar beschriftete Beschreibung, keine Zertifizierung | keine Normänderung |

### Phase P4 – Gesamtrendite für Pattern

| Nr. | Paket |
|---|---|
| P4.1 | Pattern-Ergebnisse mit dem bestehenden TR-Register (canonical-total-return-1.0.0, 158/161 bestätigt) rechnen; Titel ohne Beleg werden ausgeschlossen und ausgewiesen |
| P4.2 | `returnBasis`-Gate liest das Ergebnis aus P4.1 (bestehende Definition) |

### Phase P5 – Owner-Entscheidungen (Vorlage `DECISIONS_SETUP_OOS_STRATEGY_FACTOR.md`)

| Nr. | Entscheidung | Wirkung | spätestens |
|---|---|---|---|
| A1–A6 | Setup-OOS-Segmentierung | ohne Entscheidung bleibt OOS aus | vor dem ersten M6-Ergebnis (etwa 2027-03-26); empfohlener Schnitt jetzt 2027-05-31 (#1179) |
| B1 | Strategy-Research-Artefakt | Research-Ablage unter `docs/` | ohne Frist |
| C1 | Factor-Rekonstruktion | Research-Ablage | ohne Frist |
| Vorschau | #1138 nur intern | interne Prüfansicht | ohne Frist |

### Phase P6 – Produktpfad (erst nach C einer Art und Owner-Freigabe)

1. #1138 nach `main` (intern, aus).
2. Produktadapter je zertifizierter Art: Er liest nur das Zertifizierungsartefakt und den v2-Umschlag und zeigt bei LIMITED nur beschreibende Texte.
3. Anzeige im Produkt über eigenen PR mit Owner-Freigabe; Frontend-Budgets und Gates gelten unverändert.

## 4. Zeitachse (realistisch)

| Zeitraum | Ergebnis |
|---|---|
| November 2026 | P0 vollständig; P2.1–P2.3; Security Master 1.3.0 produktiv (abhängig von G7, siehe #1167) |
| Dezember 2026 – Februar 2027 | P1 (mit Freigaben), P3.1, P4.1 als Research; Entscheidung A1–A6 |
| Ende März 2027 | erste M6-Setup-Ergebnisse; Setup-OOS messbar, sobald 30 effektive Fälle je Segment vorliegen |
| 2028-01 bis 2028-08 | Factor- und Strategy-Historien erfüllen die HISTORY-Gates frühestens |

Keine Art wird vor dem Erfüllen ihrer bestehenden Gates zertifiziert. Ein negatives Ergebnis ist ein gültiges Produktergebnis.

## 5. Wiederaufnahmepunkt

- Einstieg: dieses Dokument, dann `docs/quant/BACKTEST_ENGINEERING_HANDOVER_V1.md`.
- Nächste autonome Pakete: P0.5 (`run-backtest.cjs --help` und Ausgabeprüfung), P0.6 (Opt-in-CI-Job), P0.7 (Kennzahlen-Hash).
- P0.4 abgeschlossen mit #1171 und #1178. Owner-Vorlagen: Setup-OOS A1–A6 und Tiingo-Lizenz in #1179; Security Master in #1167/#1175.
