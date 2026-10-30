# Backtest-Engineering – Übergabe v1 (Stand 29./30.10.2026)

Branch `claude/quant-backtest-engineering-4ho3rd`, Draft-PR #1133, Basis main `e62d7268e1`.

Rahmen:
- **Nichts ist verdrahtet oder aktiviert.** Kein Frontend, kein öffentlicher Endpunkt, kein Workflow, kein Scheduler.
- Keine Änderung an Zertifizierungsverträgen oder Gates (`quant/methodology/backtest-certification-v1.json` unverändert).
- `productionApproved=false`, **0/6 Arten zertifiziert.**
- Die negativen V10–V13-Befunde gelten unverändert.

Einzeldokumente:
- [BACKTEST_RESULT_CONTRACT_V2.md](BACKTEST_RESULT_CONTRACT_V2.md)
- [RESEARCH_POPULATION_AND_PORTFOLIO.md](RESEARCH_POPULATION_AND_PORTFOLIO.md)
- [SETUP_OOS_EVALUATION.md](SETUP_OOS_EVALUATION.md)
- [BACKTEST_RUNNER.md](BACKTEST_RUNNER.md)
- Demonstrationsfälle: [backtest-demos/](backtest-demos/)

## 1. Ausführbarer Research-Pfad je Art

| Art | Pfad (nur bestehende Engines) | Zustand |
|---|---|---|
| SAME_STOCK_REPLAY | `runReplayValidation` oder Wochen-Ledger `run-real-weekly-backtest` | **A** (RESEARCH_EXECUTED); auch mit privaten delisteten Reihen |
| PATTERN_EVIDENCE | `runPatternStudy` | **A** |
| SIGNAL_BACKTEST | `runSignalStudy`; finanzierte Variante über `runPortfolio` | **A** (alle 5 Regeln) |
| SETUP_BACKTEST | `runSetupStudy` auf rekonstruierten Zuständen (Kennzeichnung RECONSTRUCTION, nie Nachweis veröffentlichter Zustände) | **A** als Rekonstruktion. Der Zertifizierungspfad bleibt FAIL (`OOS_NOT_MEASURABLE_YET`) |
| STRATEGY_BACKTEST | `runPortfolio` + `buildSchedule` (feste Gewichte, TR-Dividenden) | **A**. Profil-Strategie (`buildProfileTargets`): **B**, PIT-Faktor-Snapshots fehlen |
| FACTOR_RANKING_BACKTEST | `runFactorStudy` auf dem privaten V10-PIT-Panel (hashgebunden) | **A** mit Panel, **B** ohne |

C (PRODUCT_CERTIFIED) ist nur zulässig, wenn alle vier Bedingungen gelten:
1. Das Zertifizierungsartefakt meldet die Art als CERTIFIED.
2. Das Artefakt besteht `certificationViolations`.
3. Der Lauf ist A.
4. Die Spezifikation verlangt C ausdrücklich.

Heute trifft das auf keine Art zu. A wird nie automatisch zu C.

## 2. Gemeinsame Backend-Schnittstellen (neu)

- `quant/engines/backtest-kinds.cjs`: kanonische 6 Arten und 7 Methoden, Abbildung aller vier Taxonomien (Zertifizierung, Readiness A–F, Evidence-Status, Research-Bereiche), gegen die echten Dateien getestet.
- `quant/engines/backtest-result-contract.cjs`, Schema `docs/quant/backtest-result-v2.schema.json`: ein Ergebnisumschlag für alle Arten, fail-closed geprüft, mit Hashes. Keine Alpha-Sprache ohne Holm-Beleg.
- `quant/engines/backtest-result-adapters.cjs`: Adapter für alle bestehenden Ergebnisformen (Signal-, Setup- und Pattern-Artefakte, Research-`finish()`, Portfolio, Wochen-Ledger, Zertifizierung).
- `quant/engines/backtest-metrics.cjs`: Portfolio- und Ledger-Kennzahlen.
- `quant/engines/setup-oos.cjs`: technischer OOS-Auswerter.
- `scripts/quant/research/research-population.cjs`: benannte Populationsprofile.
  - Profile: PRODUCT_DEFAULT = Default-Loader byte-identisch; V10_PRIMARY, V10_LIFECYCLE, V12/V13-Large-Cap, V13-delisted F1/F1c/F1w.
  - Private Daten fallen nie still weg.
- `scripts/quant/research/backtest-runner.cjs` mit CLI `run-backtest.cjs --spec --out`: ein Einstieg für alle 6 Arten.
  - Ablauf: Population → Art-Engine → passende Methoden → Kennzahlen → v2-Umschlag.
  - Deterministisch, mit Cache.
- `research-portfolio.cjs` (opt-in): Stop auf Wochenschluss und maximale Haltedauer. Ohne Optionen byte-identisch, per Golden-Hashes geprüft.

## 3. Reproduzierbare echte Beispiele ([backtest-demos/](backtest-demos/), 16 Fälle)

Basis: asOf 2025-12-31, wöchentlich, 5 + 5 bp je Seite.

| Fall | Situation | Kernzahl |
|---|---|---|
| NVDA Replay 2010–24 | Gewinner, Splits 2021/2024 | 37 Ereignisse, Trefferquote 86,5 % |
| INTC Replay | Verlierer | 6 Ereignisse, Trefferquote 33 %, Median −11,3 % |
| SMCI Ledger 10 J. | Gewinner, Split 2024 | +580,8 %, max. Drawdown −41,5 % (Kaufen und Halten +1.150,6 %) |
| Pattern 2015 | seitwärts | 62 Ereignisse, Trefferquote 50 % |
| Signale 2008 | Crash | finanziert TREND_UP −33,8 % vs. SPY −34,2 % |
| Signale 2009 | Erholung | Trefferquote 80,3 %, Sensitivitätsgitter mit 6 Punkten |
| Signale 2020 | COVID | finanziert NEW_52W_HIGH +13,6 % vs. SPY +27,6 % |
| Signale 2022 | Bärenmarkt | Trefferquote 29,5 % |
| Setup-Rekonstruktion 2016–24 | – | 2.750 Ereignisse, 111 Titel |
| Strategie 2019 und 2013–14 | Bullenmarkt | +27,8 % vs. +27,9 % bzw. +30,9 % vs. +42,4 % |
| Dividenden MSFT/WMT/IBM 2016–20 | Gesamtrendite | +174,4 % vs. +155,3 % reiner Kurs (60 Dividenden) |
| Faktor-Momentum 2019–20 | privates Panel | Spearman im Mittel +0,036, Q5−Q1 im Mittel −1,6 % |
| EXCO | delistet, privat | 22/24 Ereignisse, 2 nach dem letzten Handel zensiert |
| Allergan | Übernahme, privat | 28/30 Ereignisse, 2 zensiert |
| Profil-Strategie | – | B (fehlende Eingaben benannt) |

Ersetzt und begründet:
- AAPL ist nicht zulässig (`CORPORATE_ACTION_UNRESOLVED`, Woche 2000-09-29); NVDA und SMCI decken die Splits ab.
- Der Dividendenfall läuft als Kaufen-und-Halten, weil der Ledger Entscheidungen vor späten Dividendeninformationen ablehnt.

Alle Fälle tragen `NO_ALPHA_OR_CERTIFICATION_CLAIM`. Es sind Research-Zahlen auf Survivor-Kohorten, teils nachträglich ausgewählt; keine Strategieempfehlung.

Prüfung:
- Zweiter Lauf: alle Umschlag-Hashes identisch.
- Python-Gegenrechnung: 276.924 Prüfungen, 0 Fehler.

## 4. Verfügbare Kennzahlen

Gesamt- und Jahresrendite, CAGR, annualisierte Volatilität, max. Drawdown (Peak, Trough, Erholung, Dauer), Trefferquote, Zahl der Trades und Haltedauer, Turnover, Kosten, durchschnittlicher Cash-Anteil.

Benchmark auf identischen Daten: Überrendite, Tracking Error, Beta, Korrelation, Information Ratio. Sharpe immer mit ausgewiesener Risk-free-Annahme.

Unsicherheit: Blockbootstrap bzw. Wilson-Intervalle aus den bestehenden Engines, Holm-Familien. Datenqualität und Abdeckung kommen aus der Population.

## 5. Tatsächlich integrierte Methoden

Alle aus bestehenden Modulen, nur wo sie zur Art passen:
- Monte Carlo: Portfoliopfade, Replay-Ergebnisse, finanzierter Ledger.
- Walk-Forward und OOS: Partitionsmechanik mit fester Regel.
- Regime: PIT über SPY.
- Sensitivität: nur aufgezeichnetes Gitter.
- Event: Dividenden aus dem TR-Register.
- Rebalancing: `runPortfolio`.

Eine unpassende Methode wird abgelehnt. Fällt eine Methode im Lauf aus, steht sie mit Grund als NOT_RUN im Ergebnis, z. B. Walk-Forward über 65.000 Faktorereignisse jenseits des Purge-Budgets. Keine neue Methodenabnahme außerhalb der bestehenden Scopes.

## 6. Reparierte Defekte (diese Runde und V13-Abschluss)

- Paritäts-Text im Zertifizierungsbauer: `checked/checked` → `(checked − mismatches)/checked`. Heute ohne Wirkung (3327/3327).
- Bereits gemergt: Vollverkauf ohne Rundungsrest (#1117), consumer-Ausgabepfad (#1118), Börsenwert bei XBRL-Skalenfehler zurückgehalten (#1120), Spin-off nicht als Split (#1121).
- Offen und dokumentiert: derselbe Paritäts-Fehler in `scripts/quant/measure-backtest-signal-intelligence.mjs:86`, nicht angefasst.

## 7. Verbleibende Datenqualitätsfehler

- Doppelte OOS-, Walk-Forward-, Regime- und Sensitivitätslogik mit abweichenden Schwellen in den Produkt-Buildern (Signal 2010/2018 n ≥ 100, Setup 2020/2023 n ≥ 30). Bewusst nicht vereinheitlicht, das wäre eine Fachmodell-Änderung mit eigenem PR.
- Uneinheitliche Jahreslänge für CAGR: Ledger 365,2425 Tage, Portfolio und Kennzahlen 365,25.
- Öffentliche Profile sind Survivor-Kohorten mit Kursrendite. Delisting-Abdeckung nur ab 2010; vor 2009 kaum beobachtbar.
- `quant/data` driftet auf main gegenüber den V13-Läufen: V10_LIFECYCLE hat 4.327 statt 4.329 Listings (ref_NUWE, ref_SCAG).
- Security Master: 132 belegte Delistings weiter ACTIVE. Der Lauf 1.1.0 → 1.3.0 ist durch G6/G7/G9 blockiert; Entscheidungsvorlage in #1119.
- Unbelegte Spin-offs (z. B. FTV 2025), Börsenwert nur zurückgehalten statt korrigiert.

## 8. Noch nicht erfüllte Zertifizierungsvoraussetzungen

| Art | Status im Artefakt | offene Voraussetzung |
|---|---|---|
| Same Stock Replay | LIMITED | strukturell: Survivorship der Einzelaktienansicht, kein Regeltest |
| Pattern Evidence | LIMITED | Survivorship, Kursrendite, `certifiedAsBacktest` |
| Signal Backtest | LIMITED | keine Regel mit belegtem Überschuss (`ruleCertified` 0/5) |
| Setup Backtest | COLLECTING_HISTORY | veröffentlichte Historie (22 Stichtage, 48 Tage), 0 abgeschlossene M6, OOS-Segmentdefinition, Owner-Freigabe |
| Strategy Backtest | COLLECTING_HISTORY | Membership- und Faktorhistorie (Monate, frühestens ~2028-08) |
| Factor Ranking | COLLECTING_HISTORY | Original-Vintages und 12 abgeschlossene Forward-Monate (frühestens 2028) |

## 9. Technisch vorbereitet, bewusst nicht aktiviert

- `quant/api/backtest-research-adapter.js` übersetzt v2-Umschläge in genau die Felder, die `page-backtest.js` heute liest.
  - Standardmäßig aus, zeigt nie Zahlen, lehnt C ohne Zertifizierung ab.
  - Kein Import durch `product-services.js` oder Views; ein Test erzwingt das.
- Der Runner kann künftig Produktartefakte für Strategy/Factor erzeugen. Das ist nicht umgesetzt: Es braucht Owner-Entscheidung, eigenes Produktartefakt und eigenen PR.
- Das Schema liegt in `docs/quant/`, nicht in `quant/methodology/`. Dort verlangt ein Test die Aufnahme in die öffentliche Methodikseite (Frontend).

## 10. PRs und Commits

- **#1133 (Draft, CI grün):**
  - P2-D `9753040776`, Ergebnisvertrag;
  - P2-E `938dd9ed0e`, Setup-OOS;
  - P2-B/C `23f4db82d8`, Population, Kennzahlen, Ausstiegsregeln;
  - P2-A/F `39fb86e058`, Runner, Demos, QA;
  - dazu diese Übergabe.
- **#1132 (Draft, CI grün):** V13c-Studie, Archiv-Werkzeuge, Übergabe-Nachtrag.
- **Gemergt diese Nacht:** #1129 (`0e28622a35`).
- **Gemergt in der V13-Runde:** #1091, #1117, #1118, #1120, #1121.
- **Zurückgehalten:** #1119.

## 11. Tests

Integrationsbranch vor dem Runner-Merge:
- quant 3.612 bestanden / 0 fehlgeschlagen / 4 übersprungen, davon 3 private Daten und 1 Opt-in-Realdatenlauf. Alle vier wurden separat ausgeführt und bestanden.
- core + fundamental 373/373, Python 588 OK.

Nach dem Runner-Merge: siehe PR-Kommentar #1133. Runner-Realdatenlauf (`BACKTEST_RUNNER_FULL=1`, mit privaten Daten): 18/18.

Übersprungen gilt nicht als bestanden; die Läufe mit Opt-in-Flag wurden jeweils separat ausgeführt.

## 12. Erforderliche Owner-Freigaben

1. Setup-OOS: Segmentdefinition, Embargo, Erfolgskriterium, roh oder effektiv; Export der Ereigniszeilen. Ohne Freigabe bleibt das Gate FAIL.
2. Anzeige von Research-Ergebnissen im Produkt über den isolierten Adapter.
3. Produktartefakte für Strategy/Factor und Profil-Strategien.
4. Vereinheitlichung der doppelten OOS-/Walk-Forward-Logik der Produkt-Builder (Fachmodell-PR).
5. Ort des Schemas (Methodikseite) und Aufnahme der Populationsfassade in die Allowlist der Guard-Tests, falls gewünscht.
6. Aus V13: Security Master (#1119, erweitertes Freigabeschema), R2-Host-Freigabe für den Archiv-Upload, Archivschlüssel als Secret, GitHub-Support-Antrag, Merge von #1132 und #1133.

## 13. Privates V13-Archiv

**Nicht dauerhaft gesichert.**
- Das Archiv 1.1.0 ist gebaut: 7 Teile, 11.615 Dateien, 1,38 GB. Es ist verschlüsselt, das Manifest liegt im Repo.
- Lokal vollständig wiederhergestellt: hash-identisch, Reihen laden hashgebunden.
- R2-Lesezugriff und Kapazität geprüft (6,15 GB mit Archiv, unter der Schranke von 8 GB).
- Upload blockiert, weil die Sitzungsumgebung `*.r2.cloudflarestorage.com` nicht erreicht.
- Nach Freigabe des Hosts: `[v13-archive:put]` → `transfer.sh put` → `[v13-archive:verify]` → `[v13-archive:get]` → `restore-archive.sh` (Anleitung: `docs/quant-recovery/v13/archive/README.md`).
- Der private Archivschlüssel wurde dem Owner übergeben; er gehört als Secret `V13_ARCHIVE_PRIVATE_KEY` und offline abgelegt.

## 14. Nächster technisch sinnvoller Schritt

1. Archiv-Upload und Restore-Probe in R2 (sobald der Host freigegeben ist).
2. Fachmodell-PR: Die Produkt-Builder (Signal, Setup) übernehmen OOS-, Walk-Forward- und Regime-Logik aus `research-validation.cjs`, mit Vorher/Nachher.
3. Owner-Entscheidung zur Setup-OOS-Segmentierung und Export der Ereigniszeilen, damit das Gate ab ~März 2027 messbar wird.
4. Produktartefakte `strategy-backtest-v1` und `factor-ranking-backtest-v1` aus dem Runner, sobald Membership- und Faktorhistorie reichen. Bis dahin als Research-Artefakte ohne Anzeige.
5. Freigegebene, nur lesende Einbindung des Adapters in `getBacktest` (Status, Grenzen, keine Zahlen ohne Zertifizierung).
