# Research-Backtest-Runner (`backtest-runner-1.0.0`)

Stand 2026-10-29 · Status: **Research-Werkzeug, nicht verdrahtet, nicht zertifiziert.** `productionApproved` ist immer `false`.
Kein Produktpfad, kein Endpunkt, keine Ansicht und kein Workflow liest den Runner (Test `isolation`).

Der Runner ist **ein** Einstieg für alle sechs Backtest-Arten. Er baut keine neue Backtest-Architektur, sondern setzt
vorhandene Bausteine zusammen:

```
Population (research-population-Profil) → Art-Engine → optionale Methoden → Kennzahlen → Ergebnisvertrag v2 (validiert)
```

| Datei | Rolle |
|---|---|
| `scripts/quant/research/backtest-runner.cjs` | `runBacktest(spec, options)`, `validateSpec`, `specHash`, `kindEvents` (Test-Naht) |
| `scripts/quant/research/run-backtest.cjs` | CLI `--spec <json> --out <datei>` |
| `scripts/quant/research/build-backtest-demos.cjs` | rechnet die Demonstrationsfälle `docs/quant/backtest-demos/cases.json` |
| `scripts/quant/verify-backtest-runner.py` | unabhängige Python-Gegenrechnung (stdlib, `python3 -I`) |
| `quant/tests/backtest-runner.test.mjs` | schnelle Tests (synthetische Eingaben über die Test-Naht `deps`, Python-Gegenrechnung, Demo-Konsistenz) |
| `quant/tests/backtest-runner-real.test.mjs` | Echtdatenläufe aller Demofälle, nur mit `BACKTEST_RUNNER_FULL=1` |

Ort: `scripts/quant/research/` wie die Populationsfassade. In `quant/engines/` würde der Runner als produktiver Aufrufer des
Research-Loaders zählen (Guard-Tests in `quant/tests/research-{ca,identity}-evidence.test.mjs`).

## 1. API

```js
const R = require('scripts/quant/research/backtest-runner.cjs');
const result = R.runBacktest(spec, {
  cacheDir,                                   // optional, privat, außerhalb des Repositorys (sonst CACHE_DIR_INSIDE_REPOSITORY)
  privateDirs: { delistedSeries, factorPanel } // optional; fehlen sie, endet ein Fall, der sie braucht, in Zustand B
});
result.schemaVersion   // 'backtest-runner-result-1.0.0'
result.state           // RESEARCH_EXECUTED | PREPARED_DATA_LIMITED | PRODUCT_CERTIFIED
result.envelope        // backtest-result-2.0.0, mit Contract.validate geprüft (fail-closed)
result.specHash, result.inputHashes, result.inputHash, result.envelopeHash, result.resultHash
result.kindPath        // tatsächlich benutzte Engine und Adapter
result.population      // Listings, Ausschlüsse mit Grund, Kalender, Populations-Hash
result.extras          // z. B. vollständiges backtest-metrics-Dokument, Fensterzählung, finanzierte Variante
result.pit             // asOf, letzter Eingabebalken, Eingaben nach asOf (immer 0), Einstieg ≤ Signal, Ausstieg > asOf
result.qa              // Ereigniszeilen bzw. Portfolio-Plan für die Python-Gegenrechnung (in committeten Demos: null)
result.diagnostics     // nicht aufzählbar, nicht im Hash: runtimeMs, rssMb, Populations- und Ergebnis-Cache
```

CLI: `node scripts/quant/research/run-backtest.cjs --spec s.json --out r.json [--cache <dir>] [--private-delisted <dir>]
[--private-factor-panel <panel.jsonl.gz>] [--no-qa]`. Schreibt nur `--out` (und den Cache), verweigert Ziele unter
`quant/data`, `discover/data`, `supertrader/data`, `social/data` (`OUT_INSIDE_GENERATED_DATA`) und druckt eine Zeile mit
Laufzeit und Speicher.

### Spec (`backtest-runner-spec-1.0.0`, unbekannte Schlüssel sind Fehler)

| Feld | Inhalt |
|---|---|
| `id`, `version`, `description` | Kennung; `description` landet im Umschlag und unterliegt der Alpha-Regel |
| `kind` | eine der sechs Arten (`UNKNOWN_KIND` sonst) |
| `asOf` | Datenstand: kein Balken nach `asOf` geht in eine Engine ein (auch keine Ausgänge) |
| `window {from,to}` | Signal-/Entscheidungsfenster, `to ≤ asOf` |
| `registeredAt` | Einfrierzeitpunkt der Regel (Engine-`registration.frozenAt`, Sensitivitäts-Registrierung) |
| `population` | `profile` (research-population), `tickers` (über `core/identity.js#securityIdForTicker`) oder `securityIds` (`ref_…`, `dl_…`), optional `sample {size, seed}` (deterministisch per sha256), `privateInputs` |
| `engine` | artspezifisch, siehe Abschnitt 3 |
| `costs {feeBps, slippageBps}` | je Seite (`PER_SIDE_NOTIONAL`) |
| `benchmark` | `SPY` (weekly-benchmark, Kursrendite, exakte Daten) oder `NONE` |
| `methods` | optionale Methoden; unbekannt → `UNKNOWN_METHOD`, nicht passend → `METHOD_NOT_APPLICABLE_TO_KIND` |
| `status.requestProductCertifiedState` | nur damit kann Zustand C überhaupt entstehen (Abschnitt 2) |

## 2. Zustände

- **A `RESEARCH_EXECUTED`**: historische Research-Studie im dokumentierten Scope mit mindestens einem beobachteten Ausgang
  (Zuordnung durch die bestehenden Adapter).
- **B `PREPARED_DATA_LIMITED`**: Engine bereit, Eingaben fehlen. Der Umschlag hat keine Zahlen (`metrics.basis = NONE`) und
  nennt jede fehlende Eingabe als `MISSING_INPUT:<…>` (z. B. `PRIVATE_DATA_UNAVAILABLE:delistedSeries`,
  `PRIVATE_FACTOR_PANEL …`, `TR_WINDOW_NOT_COVERED:<id>:<fenster>`, `NO_ADMISSIBLE_LISTING:ref_X=<Grund>`).
- **C `PRODUCT_CERTIFIED`**: nur wenn (1) das Zertifizierungsartefakt `quant/data/product/backtest-certification-v1.json`
  die Art `CERTIFIED` meldet, (2) `certificationViolations()` leer ist, (3) der Lauf A ist und (4) die Spec
  `requestProductCertifiedState: true` setzt. Sonst `PRODUCT_CERTIFIED_STATE_REFUSED`. A wird nie automatisch C.
  Ein Artefakt, dessen Status nicht aus seinen eigenen Gates folgt (Spoof), wird vor jedem Lauf verworfen
  (`CERTIFICATION_ARTIFACT_VIOLATES_ITS_CONTRACT`). **Heute zertifiziert das Artefakt keine Art**; alle Demos sind A oder B.

## 3. Arten: Pfad, Zustand, Methoden, Kennzahlen

| Art | Engine-Pfad (bestehend) | Zustand heute | Methoden (passend) | Kennzahlen |
|---|---|---|---|---|
| SAME_STOCK_REPLAY | `RULE_EVENTS`: `research-studies.runReplayValidation` (feste Musterregel, eine Aktie); `REAL_WEEKLY_LEDGER`: `run-real-weekly-backtest.run` (NEW_52W_HIGH, eine finanzierte Position, Profil `PRODUCT_DEFAULT`) | A (öffentliche Reihen), A privat (Delisted) | Monte Carlo (TRADE_IID auf nicht überlappenden Ausgängen bzw. Ledger-Trades), Walk-Forward/OOS, Regime, Sensitivität (Regel), Ereignisstudie | je Ereignis (Trefferquote, Median/Mittel netto, Median-Drawdown, Überschuss ggü. SPY) bzw. Pfad (Gesamtrendite, CAGR, Vol, MDD, Jahresrenditen, Sharpe rf 0) |
| PATTERN_EVIDENCE | `runPatternStudy` (Muster + Kontrollen desselben Datums) | A | Walk-Forward/OOS, Regime, Sensitivität, Ereignisstudie | je Ereignis; Kontrollstatistik im Engine-Ergebnis |
| SIGNAL_BACKTEST | `runSignalStudy` (alle oder gewählte der fünf Regeln); finanzierte Variante `engine.funded` über `signal-study.fundedSchedule/fundedInput` → `runPortfolio` | A | Walk-Forward/OOS, Regime, Sensitivität, Ereignisstudie, Rebalancing (= finanzierte Variante), Monte Carlo (nur auf dem finanzierten Ledger) | je Ereignis; finanziert: Pfadkennzahlen in `methods.PORTFOLIO_REBALANCING` |
| SETUP_BACKTEST | `runSetupStudy` auf **rekonstruierten** Zuständen (`quant/data/product/setup-replay-v1` + `run-setup-reconstruction.eventStream/listingOf`) | A, Evidenzart RECONSTRUCTION | Walk-Forward (Mechanik); OOS bewusst `NOT_RUN` mit dem Setup-OOS-Status aus dem Zertifizierungspfad (`setup-oos.evaluateSetupOos`, heute `FAIL / OOS_NOT_MEASURABLE_YET`, 0 abgeschlossene M6) | je Ereignis |
| STRATEGY_BACKTEST | `runPortfolio` mit `buildSchedule` (`FIXED_WEIGHTS`, Rebalancing `sessions`/`monthly`/`quarterly`); `dividends: TR_REGISTER` = Gesamtrendite mit Registerdividenden (HISTORICAL_OBSERVED, echte Börsenschlusszeiten); `PROFILE` (`buildProfileTargets`) → B | A (Preis- und TR-Variante), B (Profil) | Monte Carlo (Blockbootstrap Wochenrenditen), Regime, Sensitivität (Kosten, Rebalancing-Takt), Ereignisstudie, Rebalancing | Pfad (fromPortfolio) + `backtest-metrics` (Beta, Tracking Error, IR, Sharpe rf 0); TR: Vergleich mit derselben Strategie ohne Dividenden |
| FACTOR_RANKING_BACKTEST | `runFactorStudy` auf dem **privaten** V10-PIT-Panel (`scripts/quant/v10/factor/panel.cjs`, Hash gebunden) | A nur mit privatem Panel; ohne Panel B (`MISSING_INPUT:PRIVATE_FACTOR_PANEL …`) | Regime, Walk-Forward/OOS (scheitert bei großen Querschnitten am Operationsbudget der Engine → `NOT_RUN` mit Grund) | je Ereignis + `perEvent.factor` (mittlerer Spearman, Q5−Q1 vollständiger Kohorten) |

Methoden im Einzelnen (alle bestehend): Monte Carlo `research-monte-carlo.runMonteCarlo`; Walk-Forward/OOS
`research-validation.buildWalkForward` + `aggregateOos` (feste Regel, kein Fitten: `FIXED_RULE_NO_FITTING_PARTITION_MECHANICS`);
Regime `classifyRegimes` (PIT_AVAILABLE auf SPY-Wochenschlüssen) + `analyzeRegimes`; Sensitivität `runSensitivity` nur über
ein **aufgezeichnetes Raster**: jeder Rasterpunkt wird mit derselben Art-Engine gerechnet, mit `inferTemporalBlockMean`
bewertet und über den Recorded-Grid-Evaluator von `scripts/quant/run-research.cjs` eingelesen (Holm innerhalb des Rasters,
kein Parameter ausgewählt); Ereignisstudie `runEventStudy` auf den Dividendenmeldungen des TR-Registers
(`informationAvailableAt` = Veröffentlichung); Rebalancing `runPortfolio`.

Fensteransicht: Die Engine läuft über die ganze Historie bis `asOf`; der Umschlag zeigt die Ereignisse mit Signaldatum im
Fenster, Zählungen und Statistik werden mit der Engine-eigenen `inference()` neu gebildet (`engineResultHash` verweist auf
den vollen Lauf). Für Signalregeln werden Balken vor `Fensterbeginn − (53 + 13 + 52)` Wochen weggelassen, um die
Engine-Budgets einzuhalten; die Regeln lesen höchstens Aufwärmphase plus Cooldown-Gedächtnis, das Ergebnis im Fenster ist
identisch (Test). Muster-/Replay-Merkmale (laufendes Hoch) behalten die volle Historie.

## 4. Hashes, Determinismus, Cache

- `specHash` = sha256(kanonisches JSON der Spec). `inputHashes`: Code-Hashes aller beteiligten Module, Zertifizierungsartefakt,
  Benchmark-Bytes, Population (Profil-, Populations-, Kalender-, Manifest-, Register-Hashes), je Listing Quelldatei-Hash bzw.
  Register-Punkte-Hash und As-of-Abschnitt (ab 100 Listings als Wurzel-Hash), private Eingaben (Delisted-Register, Panel-sha256,
  Setup-Replays, TR-Register). Beides steht im Ergebnis und in `envelope.spec.parameters`.
- Gleiche Spec + gleiche Eingaben + gleiche Laufzeit ⇒ gleicher `envelopeHash` und `resultHash` (Test; im Echtdatentest für
  alle Demofälle zweimal gerechnet). Die Engines binden die Laufzeit (Node-Binary-Hash) in ihre eigenen `resultHash`; auf einer
  anderen Node-Binärdatei ändern sich die Hashes, nicht die Zahlen (der Echtdatentest vergleicht deshalb die Kennzahlen mit
  der committeten Zusammenfassung).
- Cache (optional, privat): Populations-Cache (Zusammenfassung des Frames, Schlüssel = Profil-Spec + Daten-Fingerabdruck aller
  Reihenbytes, Loader-Register, Frame-Code, private Delisted-Dateien) und Ergebnis-Cache (Schlüssel = `specHash` + `inputHash`).

## 5. Demonstrationsfälle (`docs/quant/backtest-demos/`)

`cases.json` (Zweck, Szenarien, Ersatz), `specs/*.json`, `results/*.json` (Ergebnis ohne QA-Zeilen: nur abgeleitete Zahlen
und Umschläge), `summary.json` (Kennzahlen), `performance.json` (Messung). Neu rechnen:
`node scripts/quant/research/build-backtest-demos.cjs --out docs/quant/backtest-demos --cache <privat> [--private-delisted <dir>] [--private-factor-panel <datei>]`.
Alle Fälle: Datenstand `asOf = 2025-12-31`, Wochenschlüsse split-bereinigt (ADR-002, Loader-CA-Evidenz), Kursrendite außer
dem TR-Fall, Kosten 5 + 5 Bp je Seite (TR-Fall 0), Population = konditionale Überlebenden-Kohorte des Profils (außer den
privaten Delisted-Fällen). Identität: `ref_<TICKER>` über `core/identity.js`, Delisted `dl_<chainId>` (Register gebunden).

| Fall | Art | Szenario | Zustand | Ereignisse beob./ges. (zens.) | Trefferquote | Median netto | Ø Überschuss SPY | Pfad: Gesamt / CAGR / MDD | Bemerkung |
|---|---|---|---|---|---|---|---|---|---|
| replay-nvda-winner-splits | SAME_STOCK_REPLAY | starker Gewinner, Splits 2021/2024 | A | 37/37 (0) | 86,5 % | +18,9 % | +23,3 % | – / – / Median-Ereignis-DD −16,4 % | OOS 5 Folds, n 29, Ø +32,7 %; Sensitivität 13/26/52 Wochen; AAPL nicht zulässig (s. u.) |
| replay-intc-loser | SAME_STOCK_REPLAY | starker Verlierer | A | 6/6 (0) | 33,3 % | −11,3 % | −15,4 % | – | 2019–2025 |
| ledger-smci-winner-split | SAME_STOCK_REPLAY (Ledger) | Gewinner, Split 10:1 2024 | A | 6 Trades (+2 Ausschlüsse) | 100 % | – | – | +580,8 % / 21,2 % / −41,5 % | Kauf und Halten derselben Aktie +1150,6 % |
| pattern-2015-sideways | PATTERN_EVIDENCE | seitwärts 2015 | A | 62/62 (0) | 50,0 % | −0,1 % | +1,4 % | – | 30 Large Caps, 13 Wochen |
| signal-2008-crash | SIGNAL_BACKTEST | Bär/Crash | A | 201/201 (0) | 26,9 % | −11,2 % | +2,0 % | finanziert TREND_UP −33,8 % / −18,7 % / −40,4 % | SPY gleicher Zeitraum −34,2 % |
| signal-2009-recovery | SIGNAL_BACKTEST | Erholung | A | 315/315 (0) | 80,3 % | +9,4 % | −0,6 % | – | Sensitivität Horizont × Kosten (6 Punkte) |
| signal-2020-covid | SIGNAL_BACKTEST | Crash + Erholung | A | 196/196 (0) | 64,3 % | +3,5 % | −0,5 % | finanziert NEW_52W_HIGH +13,6 % | SPY +27,6 % |
| signal-2022-bear | SIGNAL_BACKTEST | Bär | A | 156/156 (0) | 29,5 % | −6,3 % | −1,1 % | – | |
| setup-reconstruction-2016-2024 | SETUP_BACKTEST | Rekonstruktion | A (RECONSTRUCTION) | 2.750/2.750 (0) | 53,6 % | +1,5 % | −1,0 % | – | 111 Replay-Titel im Frame, 49 ausgeschlossen; Setup-OOS heute FAIL/`OOS_NOT_MEASURABLE_YET` |
| strategy-2019-bull | STRATEGY_BACKTEST | Bulle | A | 130 Trades | – | – | – | +27,8 % / 28,5 % / −8,9 % | SPY +27,9 %; MC p5/p50/p95 +7,0 %/+29,0 %/+51,6 % |
| strategy-2013-2014-bull | STRATEGY_BACKTEST | Bulle | A | 690 Trades | – | – | – | +30,9 % / 14,6 % / −6,1 % | SPY +42,4 % |
| strategy-dividends-tr | STRATEGY_BACKTEST | Dividenden, Crash 2020 | A | 3 Trades | – | – | – | +174,4 % / 22,5 % / −19,7 % | ohne Dividenden +155,3 %, Beitrag +19,2 Pp, 60 Dividenden; Ereignisstudie 60/60 |
| strategy-profile-prepared | STRATEGY_BACKTEST | Zustand B | B | – | – | – | – | – | fehlend: PIT-Faktor-Snapshots, beobachtete Provenienz |
| factor-momentum-v10-panel | FACTOR_RANKING_BACKTEST | Rekonstruktion 2019–2020 | A (privat) | 65.200/65.200 (0) | 56,7 % | +2,9 % | +2,4 % | – | 3.088 Listings, 24 Rangtage; Ø Spearman +0,036, Ø Q5−Q1 −1,6 %; ohne Panel B |
| delisted-xco-bankruptcy | SAME_STOCK_REPLAY | delistet (Insolvenz 2017-12) | A (privat) | 22/24 (2) | 31,8 % | −25,4 % | −25,1 % | – | 2 Ereignisse nach dem letzten Handel zensiert; Szenarien nur dokumentiert |
| acquisition-agn | SIGNAL_BACKTEST | Übernahme (2020-05) | A (privat) | 28/30 (2) | 17,9 % | −14,7 % | −16,7 % | – | offene Ausgänge nach dem letzten Handel zensiert |

Die Zahlen beschreiben die Rechenwege auf einer bedingten, nachträglich gewählten Auswahl; sie sind kein Strategiebefund.
Einzelfälle (NVDA, SMCI, INTC) sind ex post ausgewählt; die nominellen p-Werte im Sensitivitätsraster des NVDA-Falls sind
deshalb keine Evidenz. Alle Fälle tragen `NO_ALPHA_OR_CERTIFICATION_CLAIM`.

**Ersatz.** AAPL (Split 2020) ist nicht zulässig: der Research-Loader verweigert `ref_AAPL` mit `CORPORATE_ACTION_UNRESOLVED`
(Woche 2000-09-29). Ersatz: NVDA (Splits 2021-07-20 4:1 und 2024-06-10 10:1 im Fenster) und SMCI (2024-10-01 10:1). Der
Dividendenfall ist Kauf und Halten statt quartalsweisem Rebalancing: der Ledger verweigert Entscheidungen vor später
veröffentlichten Dividendeninformationen (`DECISION_BEFORE_EVENT_INFORMATION`, z. B. WMT 2017-03-10) – korrektes PIT-Verhalten.
TR-Fenster des Registers decken 2016–2020 nur für MSFT, WMT, IBM ab (JPM bis 2018, XOM ab 2023, NVDA ab 2020-07).

**Private Fälle** (`privateData` in `cases.json`): delisted (EXCO Resources, `dl_2ad5c4a973ce5a19`), Übernahme (Allergan,
`dl_392eb87953a4f307`) und Faktor (V10-Panel). Sie laufen nur mit den privaten, hash-gebundenen Eingaben; ohne sie ist das
Ergebnis B, und ihre Echtdatentests werden übersprungen (als übersprungen gemeldet, nicht als bestanden). Committet sind nur
abgeleitete Statistiken (keine Kurse).

## 6. QA (Agent F)

- **Python-Gegenrechnung** (`scripts/quant/verify-backtest-runner.py`, stdlib, `python3 -I`, eigener Code): Envelope-Zählungen
  und Ereigniskennzahlen, Netto aus Brutto je Ereignis, Signalregeln NEW_52W_HIGH und TREND_UP aus dem Regeltext (Erkennung,
  Einstieg nächster Wochenschluss, Ausstieg nach h Wochen, Brutto/Netto, SPY-Rendite), Portfolio-Pfad der Festgewichts-
  Strategien (Bisektion für das Zielvermögen nach Kosten, Kosten je Seite, Registerdividenden am ersten Sitzungstag ab
  Zahltag), Pfadkennzahlen (Gesamtrendite, CAGR, MDD ab Startkapital, Volatilität nach beobachteter Frequenz, Jahresrenditen,
  Cash-Quote), Ledger-Trades (Signal = Regelereignis, Kurse, Netto), PIT. Ergebnis für alle 16 Demofälle: **276.924 Prüfungen,
  0 Abweichungen** (relative Toleranz 1e-9, Pfad 1e-8). Der schnelle Test führt dieselbe Prüfung auf synthetischen Läufen aus.
- **Negativtests**: unbekannte Art/Methode/Schlüssel, Methode passt nicht zur Art, Fenster nach `asOf`, unbekanntes Profil,
  fehlende Reihe, private Daten fehlen bzw. liegen im Repository, fehlendes Faktorpanel, Profil-Strategie (B),
  Zertifizierungs-Spoof (offenes Gate, zu geringes Vertrauen), C ohne Anforderung, Alpha-Formulierung in der Spec
  (`ALPHA_CLAIM_WITHOUT_HOLM_ADJUSTED_EVIDENCE`), Cache im Repository, CLI-Ziel in generierten Daten.
- **PIT**: kein Balken nach `asOf`; Einstieg strikt nach dem Signal; kein Ausstieg nach `asOf`; Signale nur im Fenster;
  zusätzliche spätere Daten ändern keinen bereits beobachteten Ausgang (Test mit späterem `asOf`).
- **Isolation**: CLI schreibt nur `--out` (git-Status unverändert); `backtest-runner` wird von keinem Produktpfad referenziert;
  `node scripts/quality/check-test-isolation.mjs`.

## 7. Laufzeit und Speicher (gemessen 2026-10-29, Node 22, dieser Container)

| Schritt | Laufzeit | RSS |
|---|---|---|
| Population bauen (V10_PRIMARY / PRODUCT_DEFAULT, kalt) | ≈ 40 s | ≈ 680–700 MB |
| Population delisted F1 (kalt, privat) | ≈ 46 s | ≈ 1 GB |
| Einzelaktie (Regel, warmer Populations-Cache) | 1,1–2,7 s | ≈ 220 MB |
| Signal, 30 Titel, mit finanzierter Variante | 3–9 s | ≈ 300–500 MB |
| Signal mit Sensitivitätsraster (6 Punkte) | ≈ 53 s | ≈ 520 MB |
| Setup-Rekonstruktion (111 Titel) | ≈ 5 s | – |
| Strategie (10–30 Titel) | 0,8–1,5 s | – |
| Faktor (3.088 Listings, privates Panel 124 MB gz) | 27–48 s | ≈ 1,4–1,9 GB |
| Ergebnis-Cache-Treffer | ≈ 1,4 s (Fingerabdruck über 6.191 Reihendateien) | – |
| Alle 16 Demofälle, kalte Caches | ≈ 4,5 min | Spitze ≈ 2,3 GB (ein Prozess) |

## 8. Grenzen und Befunde

- Population: Frame-Regel und Kalender werden auf den vollen Daten bestimmt (`FRAME_RULE_USES_FULL_DATA_MODAL_WEEK_LABELS`);
  öffentliche Profile sind Überlebenden-Kohorten mit heutiger Klassifikation; nur Kursrendite außer TR-Register-Fällen.
- Konventionsunterschied: der reale Wochen-Ledger rechnet CAGR mit 365,2425-Tage-Jahren, `research-portfolio` und
  `backtest-metrics` mit 365,25 (in der Python-Gegenrechnung je Pfad berücksichtigt, nicht vereinheitlicht).
- Der reale Wochen-Ledger kennt nur NEW_52W_HIGH und den Produkt-Default-Loader.
- Setup: nur rekonstruierte Zustände 2015+ (160 Produkt-Replays, davon 111 im V10-Frame); veröffentlichte Stände haben 0
  abgeschlossene M6-Ergebnisse; Rekonstruktion ist kein OOS-Nachweis.
- Faktor: nur mit privatem Panel; Revisions-Faktor ohne lizenzierte PIT-Konsensquelle nicht rekonstruierbar; Walk-Forward auf
  65.000 Ereignissen überschreitet das Purge-Budget der Engine (`NOT_RUN`).
- Sensitivität: bei wenigen Ereignissen kann der Kalenderblock-Bootstrap eines Rasterpunkts leer ziehen
  (`GRID_POINT_INFERENCE_REFUSED:EMPTY_BOOTSTRAP_SAMPLE` → `NOT_RUN`).
- Delisted/Übernahme: Abfindungs- und Insolvenzwerte sind nur Szenarien des Registers; Ereignisse nach dem letzten Handel
  sind zensiert, nicht bewertet.
- Monte Carlo ist bedingte Neuziehung, keine Prognose; überlappende Signalereignisse werden nicht als unabhängig gezogen.

## 9. Vorbereitet, bewusst nicht verdrahtet

- Keine Anzeige im Produkt, kein Endpunkt, kein Artefakt unter `quant/data`, kein Workflow. `quant/api/backtest-research-adapter.js`
  (Vorschlag aus P2-D) könnte Runner-Umschläge lesen; das wäre eine eigene Owner-Entscheidung.
- Profil-Strategien (`buildProfileTargets`) und Faktor-Strategien brauchen PIT-Faktor-Snapshots mit Zeilen-Verfügbarkeit und
  beobachtete Provenienz (B mit genauen fehlenden Eingaben).
- Zertifizierungsvertrag, Gates, Setup-Freigabe und OOS-Norm sind unverändert; der Runner liest das Artefakt nur.

## Tests

```bash
node --test quant/tests/backtest-runner.test.mjs                       # ~10 s, synthetisch + Demo-Konsistenz + Python
BACKTEST_RUNNER_FULL=1 [VU_BACKTEST_CACHE=<privat>] [VU_PRIVATE_DELISTED_SERIES=<dir>] [VU_PRIVATE_FACTOR_PANEL=<datei>] \
  node --test quant/tests/backtest-runner-real.test.mjs                 # ~4–5 min kalt; private Fälle sonst übersprungen
python3 -I scripts/quant/verify-backtest-runner.py --qa-dir <volle Ergebnisse> [--private-delisted <dir>] --out report.json
```
