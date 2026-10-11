# Supertrader – Portfolio-Triage (Breadth First)

Stand: 11.10.2026 · Status: Research/Triage, **nichts live geändert** · Daten: **SEEN DATA** (alle Perioden bereits gesehen, kein Out-of-Sample-Anspruch)

Strukturierte Artefakte (`scripts/supertrader/triage/`): `SUPERTRADER-METHOD-MATRIX.json`, `SUPERTRADER-TIERING.json`, `SUPERTRADER-DEEP-DIVE-CANDIDATES.json`, `SUPERTRADER-METHOD-OVERLAP.json`, `SUPERTRADER-FIDELITY-SUMMARY.json` (erzeugt von `build-triage.mjs` aus den Dossiers, den öffentlichen Klassen der Standardmessung und `TIER-DECISIONS.json`).

## 0. Zusammenfassung

| | |
|---|---|
| **Methods Reviewed** | **16 Dossiers = 13 Inventareinträge + 3 Referenzzeilen** (nicht 30; das Repo enthält nicht mehr, es wurde nicht aufgefüllt). 6 davon im gemeinsamen Rahmen gemessen. |
| **Tier A – Deep Dive** | **0** |
| **Tier B – Keep / Secondary** | 1: `MOMENTUM_BREAKOUT` (mit Exit-Vorbehalt) |
| **Tier C – Experimental / Educational** | 11: `VU_TREND_52W` (Forward-Prioritaet HIGH), `PIOTROSKI_F`, `WEINSTEIN_STAGE`, `DARVAS_BOX`, `DONCHIAN_TURTLE`, `MINERVINI_VCP`, `CANSLIM`, `GREENBLATT_VALUE`, `KK_EPISODIC_PIVOT`, `KK_PARABOLIC_SHORT`, `VU_HOUSE_HS4_V03` |
| **Tier D – Remove/Archive-Kandidat (nur Empfehlung)** | 4: `MARKET_WIZARDS_NEXT` (Sammelkarte), `TURTLE_ORIGINAL_FUTURES`, `DARVAS_ORIGINAL`, `NEO_DARVAS` (Referenzzeilen ohne VU-Implementierung) |
| **Top Deep-Dive Candidates** | Keine Tier-A-Methode. Zwei **bedingte** Klärungsfragen (§6), keine Empfehlungen: `MOMENTUM_BREAKOUT` (Exit-Vorbehalt isoliert messen) und `VU_TREND_52W` (Forward-Beobachtung); `PIOTROSKI_F` erst nach PIT-Fundamentals. |
| **Strongest Signal Evidence** | Keine positive. Gegen SPY (63 Sitzungen): NEUTRAL bei Momentum, Darvas, Minervini, Trend52; NEGATIV bei Weinstein und Turtle. |
| **Flachster Drawdown (exposurebedingt)** | Momentum, Weinstein, Minervini (flacher als SPY) – überwiegend ein **Cash-Effekt** (Exposure MID, Portfolio trotzdem BELOW), kein Risikovorteil. |
| **Klarste Quelle / Most Reproducible** | Quelle: Piotroski (Primärquelle), Greenblatt (offizielle Methodenseite; die VU-Engine rechnet aber kein Ranking). Umsetzung: Momentum und Trend52 (Implementierungs-Fidelity MEDIUM). |
| **Most Redundant** | **Nicht bestimmbar** (§9): alle 15 Paare LOW, aber Jaccard durch Mengengrößen begrenzt und Korrelation ausreißerempfindlich. Kein Diversifikationsbeleg. |
| **Least Reproducible** | `MARKET_WIZARDS_NEXT`, Original-Turtle (Futures), Original-Darvas, Neo-Darvas (Rang nicht öffentlich), danach Minervini. |

**Kernaussage:** Im gemeinsamen Rahmen (DEV, 8.908 Reihen, PIT-Universum, Delistings, Splits, gleiche Kosten, SPY Total Return) liegt **jedes** der sechs gemessenen Live-Depots unter SPY. Kein Signal ist positiv. Das deckt sich mit den bisherigen Runden R11–R14 („kein historischer Vorteil belegt“). Die Triage ergibt deshalb kein Tier A, sondern eine ehrliche Rangfolge nach **Reproduzierbarkeit, Fidelity und Forward-Tauglichkeit**, nicht nach Rendite.

## 1. Methodeninventar (aus dem Repo, nicht aus Erinnerung)

Quellen: `supertrader/data/registry.json`, `scripts/supertrader/engine/**`, `registry*.mjs`, `docs/SUPERTRADER_*.md`, repo-weite Suche. Vollständig mit Belegzeilen in `INVENTORY.json`.

- **Registry: 12 `strategy_id`**, dazu 1 Hausstrategie außerhalb (`VU_HOUSE_HS4_V03`, Faktormodell, kein Trader) = **13**.
- **LIVE (7):** Momentum Breakout 3.2.0, Weinstein 4.0.0, Darvas 3.0.2, Minervini 2.0.0, Turtle 2.0.2 (`build.mjs` `LIVE_ENGINES`), `VU_TREND_52W` 1.0.0, `VU_HOUSE_HS4_V03`.
- **RESEARCH/Teilprüfung (3):** CAN SLIM 0.9.0, Piotroski 0.9.0, Greenblatt 1.0.0 (rechnet kein Ranking).
- **Namenskarten (3):** Episodic Pivot, Parabolic Short, Market Wizards.
- **Referenzzeilen (3, nicht in der Registry):** Original-Turtle (Futures), Original-Darvas, Neo-Darvas (TraderFox) – getrennt bewertet, ausdrücklich nicht repliziert.
- **Engine-Versionen sind keine Methoden:** 23 der 24 Dateien in `engine/strategies` sind Versionen von nur fünf Methoden (KK 6, Weinstein 4, Darvas 5, Minervini 3, Turtle 5); die 24. ist `greenblatt.mjs`.
- **Repo-weite Suche** nach Livermore, Elder, Ritchie, Morales, Kacher, Zanger, Raschke: keine Methode. (Kacher/Greenblatt kommen nur als Fondsmanager-Metadaten vor.)
- **Nicht gezählt:** 5 Quant-Stilstrategien (`strategies-v1.json`), Rule-Pack-Tokens, Elliott, Weinstein-Stufe in `dow-trend.js` (Referenz/dokumentiert, keine Supertrader-Methoden).

Dokumentationsdrift (Auswahl): Weinstein 4.0.0 ist in `DECISION-R11` RESEARCH, in `DECISION-R13` LIVE; `PRODUCT_MATRIX` nennt noch „vier Methoden live“ und Turtle v1.1.0; Registry-Varianten von Weinstein/Darvas/Minervini zeigen ältere Texte; CAN SLIM „M fehlt“ und Piotroski „B/M fehlt“ stimmen im Code nicht mehr.

## 2. Vorgehen und Freeze

- **Dossiers** (Code- und Quellenprüfung, nur Lesen) durch sechs Sonnet-Agenten (A Momentum/Breakout, B Trendfolge, C Fundamental, D Stage + Minervini-Referenz, E1 Inventar, E2 Shared Defaults + Messrahmen), Schema `dossiers` + `DOSSIER-SCHEMA` (Provenienz je Bereich, Fidelity, Daten, Risiken). Hartes Zeitbudget pro Methode, bei Unsicherheit: Confidence LOW, Tier B/C.
- **Standardmessung:** neues `scripts/supertrader/validation/standard-frame.mjs` (nur Supertrader-Pfade, Gate A), vorab festgelegt in `PREREGISTRATION-TRIAGE.json` (Maße, Klassenschwellen, Tier-Regeln, Gewichte), Amendment A1 **vor dem ersten Lauf** (Kostenprobe entfällt, HOLDOUT gesperrt, Definitionen präzisiert). Baut auf dem Rahmen von `audit-r14.mjs` auf (Live-Konfiguration, PIT-Universum, S1C-Delistings, Splits, SPY Total Return, Kosten 10/1 bp); keine Parameteränderung, kein Tuning.
- **Freeze:** Lauf `standard` (Run 38126161777) auf Commit `2af6651e9ee7`, Datenfingerabdruck `fp_d5a33d623961d638`, 8.908 Reihen. Smoke-Lauf (Run 38125556362, 598 Reihen) nur technisch, in kein Urteil eingegangen.
- **Review:** Opus-Review des Messskripts vor dem Lauf (kein Blocker; behoben: Commit per `git rev-parse HEAD`, Drawdown-Überlappung, HOLDOUT-Sperre, `tradeSetBasis`). Danach Opus-Red-Team der Tier-Entscheidungen (§10), das zwei Herabstufungen und eine Offenlegung (Amendment A2) auslöste.
- **Datenrechte:** Kennzahlen nur verschlüsselt; hier stehen nur Klassen und Zähler.
- **Fundamental-Core:** nicht migriert, nicht gestartet (#481 eigener Track). CAN SLIM, Piotroski und Greenblatt lesen den restated-Consumer (`quant/data/sec/consumer`, `as_of_latest`); ihre Confidence ist dadurch auf LOW begrenzt.

## 3. Standardmessung – öffentliche Klassen (DEV, gesehen)

Klassen nach vorab festgelegten Schwellen (`PREREGISTRATION-TRIAGE.json`). Signal = Überrendite gegen SPY nach 63 Sitzungen (Cluster-t nach Einstiegsmonat).

| Methode | Trades (Engine / genommen) | Signal 63d | Portfolio vs SPY (CAGR) | Drawdown vs SPY | Exposure | Regime-Konsistenz (Segmente n≥30) |
|---|---|---|---|---|---|---|
| Momentum Breakout 3.2.0 | 1.207 / 1.146 | NEUTRAL | BELOW | SHALLOWER | MID | 3 von 6 |
| Weinstein 4.0.0 | 4.105 / 1.050 | **NEGATIVE** | BELOW | SHALLOWER | MID | 5 von 5 |
| Darvas 3.0.2 | 18.597 / 2.455 | NEUTRAL | BELOW | DEEPER | HIGH | 5 von 6 |
| Minervini 2.0.0 | 294 / 263 | NEUTRAL | BELOW | SHALLOWER | MID | 4 von 5 |
| Turtle 2.0.2 | 67.620 / 1.330 | **NEGATIVE** | BELOW | DEEPER | HIGH | 6 von 6 |
| VU Trend 52W 1.0.0 | 231 / 231 (nur ausgeführte Trades) | NEUTRAL | BELOW | DEEPER | HIGH | 3 von 5 |

Paare: alle 15 mit Überlappung LOW (Jaccard < 0,10) und Depotkorrelation LOW (< 0,50).

**Lesegrenzen (verbindlich):**
1. Signal **und** Portfolio werden gegen SPY gemessen, nicht gegen das liquide Universum (8.908 Reihen inkl. kleiner Werte; Gleichgewichtung/Small-Cap-Effekt; 2016–2026 war SPY ungewöhnlich stark, R14). NEUTRAL/NEGATIV und BELOW mischen Selektions- und Universumswirkung. Die Universumsbereinigung liegt für R14 vor (verschlüsselt, hier nicht wiederholt): danach war Weinstein gegen das Universum neutral und Turtle ohne Vorteil. „NEGATIV“ gilt daher **nur gegen SPY**.
2. „SHALLOWER“ bei Exposure MID ist überwiegend Cash, kein Edge (Portfolio bleibt BELOW).
3. Überlappung und Korrelation: siehe §9 (Überlappung ist für 9 von 15 Paaren rechnerisch auf LOW erzwungen; Pearson ist ausreißerempfindlich).
4. Trend52 wird nur über ausgeführte, **geschlossene** Trades gemessen (Engines: alle Signale; offene Endpositionen fehlen); Signal- und Überlappungsvergleich dazu ist eingeschränkt.
5. Fallzahl Minervini 294 Signale: Aussagen unsicherer als bei den anderen.
6. DEV ist gesehen, und die Live-Konfigurationen wurden in R10–R13 auf demselben Fenster gewählt oder zurückgenommen. Es gibt keinen Out-of-Sample-Anspruch; der einzige ungesehene Raum ist das Forward-Ledger.
7. Der Rahmen nutzt das geerbte `lib.mjs#adjustSeries` statt `quant/engines/return-series.js#splitFactors` (ADR-002: geerbt, nicht neu abgeleitet). Kurssprünge > 50 % ohne Split sind laut R14 nicht bereinigt; die Delisting-Klassifikation ist unvollständig (Auslandsemittenten, SPACs, CIK ohne Zuordnung), der Pauschalfaktor trifft Micro-Cap-lastige Signalmengen (Turtle, Darvas) stärker.

## 4. Rangfolge (interner Score, Teilkomponenten sichtbar)

Gewichte aus der Prereg: Signal 20 %, Portfolio 20 %, Robustheit 15 %, Fidelity 15 %, Daten 10 %, Risiko 10 %, Produkt 10 %. Der Score ist nur ein Ranginstrument; Teilkomponenten stehen in `SUPERTRADER-METHOD-MATRIX.json`.

| Rang | Methode | Score | Tier |
|---|---|---|---|
| 1 | Momentum Breakout | 0,48 | B |
| 2 | VU Trend 52W | 0,42 | **C** (Forward-Priorität HIGH) |
| 3 | Minervini | 0,37 | **C** (Fidelity LOW, Recall 3/15, NOT_FEASIBLE_FROM_PUBLIC_RULES) |
| 4 | Darvas | 0,35 | C |
| 5 | Weinstein | 0,31 | C |
| 6 | Turtle (Equity Adaptation) | 0,27 | C |

Der Robustheits-Teilscore ist nach dem Ergebnis festgelegt (Amendment A2: NEUTRAL pauschal 0,3, NEGATIV 0, POSITIV Konsistenzanteil), weil das Vorzeichen der Segmente öffentlich unbekannt ist. Der Abstand zwischen den Plätzen 1–4 ist klein und liegt im Rauschen der groben Klassen; er begründet keine Rangfolge der Edge, nur der Qualität der Umsetzung.

## 5. Tiering und Begründung

Tier A verlangt: keine bekannten CRITICAL-Implementierungsfehler, keine versteckten fremden Defaults mit Wirkung, ausreichende Daten, reproduzierbare Analyse, kein Lookahead, keine reine Backtest-Optimierung, Confidence mindestens MEDIUM **und** einen datenbasierten Grund. Eine Methode muss SPY nicht schlagen; ein anderer datenbasierter Grund (Signal, Risiko, Regime, Korrelation) würde genügen. Forward-Testbarkeit allein genügt nicht (Amendment A2).

**Offenlegung (Amendment A2, nach dem Ergebnis):** Die vorab festgelegte Prereg enthielt nur die A-Gates und die Gewichte. Die Definitionen von Tier B/C/D, der Zusatz „datenbasierter Grund“ und der Robustheits-Teilscore wurden nach dem Messergebnis präzisiert. Die Tier-Entscheidungen sind Setzungen nach Ergebnis und so zu lesen.

**Tier A ist leer.** Kein Signal ist positiv, kein Portfolio erreicht SPY, kein Risikovorteil ist vom Cash-Effekt trennbar, und die Methoden mit Fremd-Defaults (Weinstein, Darvas, Turtle) scheitern ohnehin an den Gates. Die Triage erzwingt keine Tier-A-Auswahl.

### Tier B (nur Momentum)
- **MOMENTUM_BREAKOUT (Confidence MEDIUM):** nächste Quelltreue der Live-Methoden (Exit/Sizing quellnah, Basiserkennung und Trigger sind VU), Signal NEUTRAL, Regime nur 3 von 6. **Vorbehalt:** Der Exit nimmt das Tagestief des ganzen Tages statt des Tiefs bis zum Kauf (systematisch zu günstig, laut `METHOD_FIDELITY` selbst bestätigt).

### Tier C
- **VU_TREND_52W (MEDIUM, Forward-Priorität HIGH):** Messprofil wie Darvas (Signal NEUTRAL, Portfolio BELOW, Drawdown DEEPER, Exposure HIGH), R12/R14 ohne Vorteil. Die Provenienz ist sauber, aber keine Evidenz: Regeln fast vollständig von TraderFox, Rang von Clenow, Universum VU-Ersatz. Das Forward-Ledger ist der einzige ungesehene Raum und kostet wenig; die HIGH-Priorität ist eine Beobachtungs-, keine Empfehlungsaussage.
- **PIOTROSKI_F (LOW):** Primärquelle mit neun klaren Signalen, 8 von 9 prüfbar. **Nicht gemessen** (keine PIT-Fundamentals, kein Handelsmodell), Fundamental-Core nicht migriert. Voll prüfbar nur 732 von 2.564 Titeln; Kandidaten brauchen alle 8 Signale (Auswahlverzerrung). Im Code bestätigt: Buch-/Marktwert nutzt die Aktienzahl des letzten GJ mal den heutigen split-adjustierten Kurs (`build.mjs` ~660/669; Wirkung nicht gemessen) und die Ticker-zu-CIK-Zuordnung per erstem Treffer umgeht `core/identity.js` (ADR-001). Daher C, konsistent zu CAN SLIM.
- **WEINSTEIN_STAGE:** erbt still das Kullamägi-Sizing (0,5 % Risiko, 20 % je Position, 10 Plätze) → Portfolio-Evidenz stark kontaminiert; Signal gegen SPY NEGATIV in allen Segmenten mit n≥30 (gegen das Universum laut R14 neutral).
- **DARVAS_BOX:** Quelle LOW, Boxdefinition VU, fremde Marktampel (TraderFox) und kopierte 0,5-%-Zahl; Signal NEUTRAL, Drawdown DEEPER.
- **DONCHIAN_TURTLE (Equity Adaptation):** alphabetische Auswahl statt Stärke-Rang, kein Gewichtsdeckel; Signal gegen SPY NEGATIV in 6/6 Segmenten (gegen das Universum laut R14 ohne Vorteil). **Bewertet als eigene VU-Methode, keine Originalreplikation.**
- **MINERVINI_VCP:** bestehendes Urteil übernommen (siehe §7).
- **CANSLIM, GREENBLATT_VALUE, KK_EPISODIC_PIVOT, KK_PARABOLIC_SHORT, VU_HOUSE_HS4_V03:** Teilprüfung/Karten ohne Messung bzw. kein Trader-Modell; Datenbasis fehlt (Greenblatt: Bilanzfelder bei 0 von 6.293 Titeln; Engine rechnet nur eine Feldabdeckungsprüfung).

### Tier D (nur Empfehlung, kein Löschauftrag)
Sammelkarte Market Wizards und die drei Referenzzeilen (Original-Turtle, Original-Darvas, Neo-Darvas): keine VU-Implementierung, nicht replizierbar mit vorhandenen Daten. Sie dürfen als Lernhinweis stehen, nicht als Methode.

## 6. Bedingte Klärungsfragen (kein Tier A, keine Empfehlungen)

| Kandidat | Warum interessant | Größtes Risiko | Deep Dive müsste klären | Daten | Aufwand |
|---|---|---|---|---|---|
| `MOMENTUM_BREAKOUT` (Tier B) | nächste Quelltreue, klare Setups, erklärbar | Exit-Vorbehalt (Tagestief des ganzen Tages, nahe an einem Lookahead), nur Teil der Setups, Margin/Diskretion fehlen | Wirkung des Exit-Preises (Tief bis Kauf) isoliert messen (Diagnose, keine neue Regel); Signalvollständigkeit mit Intraday | Intraday-Cache (teilweise) | mittel |
| `VU_TREND_52W` (Tier C, Forward HIGH) | Forward-Ledger, eigenständige Rotation | kein Vorteil in R12–R14; Drawdown DEEPER; Regeln von Dritten | Forward-Beobachtung gegen SPY Total Return; Signal gegen das liquide Universum; ungefilterte Signale statt nur ausgeführter geschlossener Trades | Forward-Ledger, vorhandene Kurse | gering (Beobachtung) |
| `PIOTROSKI_F` (Tier C) | Primärquelle, klare Regeln | Datenbasis; Core nicht migriert; B/M-Verdacht; ADR-001 | PIT-Fundamentals nach Core-Migration; B/M-Berechnung prüfen | PIT-SEC | blockiert durch Datenspur |

Keine Optimierung, kein Tuning, kein neues Fenster ohne Freeze.

## 7. Sonderfälle

- **Kullamägi:** R15 „am nächsten am Original“ bestätigt: Exit-Stop (Tagestief ≤ 1 ADR), Teilverkauf und Trailing sind Quelle; Basiserkennung, 5-Tage-Hoch-Trigger, Schwellen, 10 Plätze, RS-Rang und 5-Sitzungen-Cooldown sind VU. Fidelity MEDIUM. Offen: Exit-Tief über den ganzen Tag (Vorbehalt), `KK-BO-PORT-01` (30 %) und `KK-BO-REGIME-01` gelten als aktiv, werden im Code aber nicht erzwungen (`gates.mjs:105` hat `EXECUTION_MODEL` fest auf `pass`).
- **Weinstein:** gültig bleibt die Signal-/Einstiegsebene und die Buchungs-/Datenintegrität. Teilweise kontaminiert sind die Einzeltrade-Ergebnisse und die „Exit-Zerstörung“ (gelten nur für unsere Kombination aus Volumenregel, Wochenschluss unter MA30 und Basis-Stop). Stark kontaminiert sind alle Portfolioaussagen („Rückstand durch Cash“: bei etwa 30 % Maximalquote ist in Aufwärtsmärkten der größere Teil des Abstands zum Markt eine Sizing-Folge). Die Evidenz trägt „kein belegter Signalvorteil der VU-Einstiegsidee“, nicht ein Urteil über Weinstein. Eine Dekontaminationsmessung ist eine offene Frage, keine Priorität.
- **Darvas getrennt:** `DARVAS_BOX` (VU Adaptation, live 3.0.2), `DARVAS_ORIGINAL` (nicht repliziert), `NEO_DARVAS` (TraderFox 2018/2019; Rang „Trendstabilität“ nicht öffentlich), `VU_TREND_52W` (eigene VU-Methode auf Basis der Neo-Darvas-Beschreibung, mit Clenow-Rang und Umsatz-Universum als Ersatz). Kein vermischtes Urteil.
- **Turtle getrennt:** `TURTLE_ORIGINAL_FUTURES` (Referenz, nicht repliziert) und `DONCHIAN_TURTLE` (VU Equity Adaptation: Aktien statt Futures, nur long, kein Aufstocken, keine Korrelationsgrenzen, alphabetische Auswahl). Keine Behauptung einer Originalreplikation.
- **Minervini:** keine neue Analyse. Übernommen: VU Adaptation, Fidelity LOW, Ground-Truth-Recall 3/15 = 20 %, Core-Datenfehler erklären den Recall nicht, private Kursdiagnose: Power Play erklärt höchstens einen zusätzlichen Fall (hypothetisch 4/15 = 26,7 %), Entscheidung `NOT_FEASIBLE_FROM_PUBLIC_RULES` bleibt. (Der 15er-Fallsatz liegt auf dem Branch `claude/minervini-rule-fidelity`, nicht auf `main`.) Standardmessung: Signal NEUTRAL, Portfolio BELOW (294 Signale).

## 8. Shared-Default-Audit (Querbefunde)

Details mit `Datei:Zeile` in `SHARED-DEFAULTS.json` (16 Funde).
- **Weinstein erbt Kullamägi-Sizing still** (`weinstein-v2/v3` `portfolio: null`, `backtest.mjs:9-16` `PORTFOLIO_DEFAULTS`); einzige Live-Methode ohne eigenes `portfolio`.
- **Darvas** trägt die 0,5 % kopiert (`darvas-v3.mjs:35`, FOREIGN_RULE), praktisch selten bindend (1/6-Kappe); SPY-GD200-Ampel ist TraderFox-, keine Darvas-Regel.
- **Turtle** wählt bei gleichzeitigen Signalen alphabetisch (`model-portfolio.mjs:32,35`, `portfolio.mjs:47`); `maxPositionPct` 1,0.
- **Alle Einzelaktien-Methoden** erben Cooldown 5 (`simulator.mjs:28`), eine Position je Titel, Long-only, 10 bp Slippage + 1 bp Kommission (`execution.mjs:15`, an drei Stellen dupliziert). `VU_TREND_52W` erbt nichts davon.
- **Turtle-Aufnahme:** Code nimmt nur `ENTRY_READY` (≤ 3 % unter dem Trigger), Doku/Registry sagen ≤ 6 % (aus Codelesung, nicht gemessen).
- **Kein Ledger, keine Registry-Produktion und keine Live-Strategie wurde verändert.**
- **Datenschutz-Befund (nicht still geändert):** `audit-r14.mjs:409` schreibt Überrendite und Exposure je Methode ins öffentliche Actions-Log und widerspricht damit der Kopfzeile des Workflows. Der neue Modus loggt nur Klassen und Zähler.
- **Fidelity-Penalty** (Prereg-Regel „hidden foreign default“): Weinstein, Darvas, Turtle, Momentum (Cooldown) sind im Fidelity-Teilscore abgezogen.

## 9. Duplizierung und Diversifikation

Alle 15 Paare: Überlappung der Einstiege (Titel × Kalenderwoche) LOW, Depotkorrelation (Pearson) LOW. **Redundanz ist damit nicht bestimmbar, nicht ausgeschlossen:** Der Jaccard ist durch das Größenverhältnis der Signalmengen begrenzt (für 9 von 15 Paaren ist LOW rechnerisch erzwungen, HIGH für 14 von 15 unmöglich); der Pearson-Wert ist ausreißerempfindlich (ein Ausreißertag kann ihn stark drücken; Turtle hat keinen Gewichtsdeckel, R14 zählt Kurssprünge > 50 % ohne Split). Ein Berechnungsfehler wurde nicht gefunden. Minimale Kontrolle (nicht ausgeführt): versiegelte Diagnose mit Spearman, winsorisiertem Pearson, Korrelation gegen SPY und den größten Tagesrenditen; die Rohwerte (inkl. `sameTitleShare`) liegen bereits verschlüsselt vor. Weitere Einschränkungen: Depots mit wenigen Positionen erzeugen niedrige Korrelation allein durch idiosynkratische Varianz; Trend52 ist auf ausgeführte Trades beschränkt; Diversifikationsnutzen setzt eine Edge voraus – ohne Edge senkt Diversifikation die Streuung, nicht den Rückstand zu SPY. **Ein Supertrader Composite ist in diesem Stand nicht begründbar.** Kandidaten für eine spätere Prüfung wären nur Methoden, die zuerst eine Einzel-Edge zeigen.

## 10. Final Red Team (Opus)

Ergebnis: **kein Blocker; „kein Tier A“ bestätigt.** Sechs MAJOR-Befunde, 13 MINOR; alle in diesem Bericht berücksichtigt.
- **Übernommen:** Piotroski B → C (B/M-Verdacht und ADR-001-Verstoß im Code bestätigt, Datenbasis LOW); Trend52 B → C (Messprofil wie Darvas, Provenienz ≠ Evidenz; Forward-Priorität HIGH bleibt); Überlappung „keine Redundanz“ → „nicht bestimmbar“; Weinstein/Turtle „NEGATIV“ nur gegen SPY; Amendment A2 (Tier-Definitionen nach Ergebnis, Forward-Testbarkeit allein kein A-Grund, Robustheits-Teilscore); Lesegrenzen zu Portfolio-Benchmark, ADR-002, Survivorship, offenen Trend52-Positionen; „Best Risk Profile“ umbenannt in „exposurebedingt“; „Most Reproducible“ in „Klarste Quelle“; „nur in bestimmten Regimes“ in „kein stabiles Vorzeichen“ (3/6 bzw. 3/5 bei Mittel nahe null ist Rauschen).
- **Nicht übernommen / offen:** die Spearman/winsorisierte Korrelationskontrolle (§9) wurde nicht gelaufen, weil kein Tier davon abhängt; Momentum bleibt B, weil der Exit-Vorbehalt als Vorbehalt benannt ist (für Tier A wäre er ein Gate-Problem).
- **Bestätigt:** Kein Out-of-Sample-Anspruch; neun stichprobenartig geprüfte `Datei:Zeile`-Behauptungen aus den Dossiers stimmen mit dem Code überein; Zählung (16 Dossiers, 6 gemessen) vollständig; Gate A, Datenrechte und Workflow-Regeln eingehalten.

## 11. Produktempfehlung (keine Umsetzung in diesem Auftrag)

- **Hero / Featured:** keine. Keine Methode hat einen belegten Vorteil; „Hero“ würde ihn suggerieren.
- **Standard:** `MOMENTUM_BREAKOUT` (mit Exit-Hinweis und ohne Vorteilsaussage).
- **Experimental (klar so benennen):** `VU_TREND_52W` (Forward-Beobachtungsmodell), Weinstein, Darvas, Turtle (Equity Adaptation), Minervini, Piotroski, Hausstrategie HS4-V03.
- **Educational / Legacy:** CAN SLIM, Greenblatt, Episodic Pivot, Parabolic Short, Market Wizards, Original-Referenzen.

Pflicht in jeder Darstellung: „VU-Umsetzung, nicht die Methode des Traders“; „historisch kein Vorteil gegenüber SPY belegt“; „Daten gesehen“.

## 12. Antworten auf die Schlussfragen

1. **Deep Dive:** Keine Methode erreicht Tier A. Bedingte Klärungsfragen: `MOMENTUM_BREAKOUT` (Exit-Vorbehalt), `VU_TREND_52W` (Forward-Beobachtung), `PIOTROSKI_F` (erst nach PIT-Daten).
2. **Fünf bis sieben interessanteste:** Nur drei tragen eine Rechtfertigung (s. o.); weitere nur als Lern-/Produktfragen: Weinstein (Dekontamination), Darvas, Turtle, Minervini – ohne Priorität. Eine Liste von fünf bis sieben „interessantesten“ wäre nicht datengestützt.
3. **Klarste Quelle:** Piotroski (Primärquelle) und Greenblatt (offizielle Methodenseite, aber Engine rechnet nichts); unter den Live-Methoden Momentum.
4. **Stärkste Signalqualität:** keine positive; Momentum, Darvas, Minervini, Trend52 NEUTRAL gegen SPY.
5. **Bestes Portfolioergebnis:** keine; alle BELOW.
6. **Flachster Drawdown (exposurebedingt):** Momentum, Weinstein, Minervini (flacher als SPY), überwiegend Cash-Effekt.
7. **Nur in bestimmten Regimes:** Kein stabiles Vorzeichen bei Momentum und Trend52 (3 von 6 bzw. 3 von 5 Segmenten, Mittel nahe null = Rauschen); Weinstein und Turtle gegen SPY durchgehend negativ.
8. **Redundant:** nicht bestimmbar (§9); kein Paar zeigt HIGH, aber HIGH ist für 14 von 15 Paaren rechnerisch ausgeschlossen.
9. **Nicht seriös reproduzierbar:** Market Wizards, Original-Turtle/Darvas, Neo-Darvas, Episodic Pivot/Parabolic Short (keine Regeln/Daten), Minervini (öffentliche Regeln nicht mechanisch abbildbar), Greenblatt (Engine/Daten fehlen).
10. **Hervorheben:** niemand als „Hero“.
11. **Sekundär:** Momentum (Standard, mit Vorbehalt).
12. **Nur experimentell:** Trend52 (Forward-Beobachtung), Weinstein, Darvas, Turtle, Minervini, Piotroski, HS4-V03.
13. **Forward-Testing:** `VU_TREND_52W` (HIGH), `MOMENTUM_BREAKOUT` (MEDIUM); alle Versionen erst seit etwa 02.–03.10.2026 live, Vorwärtsevidenz praktisch null.
14. **Nicht weiterentwickeln:** Minervini, Turtle-Adaptation, Darvas, Weinstein-Neuimplementierung, CAN SLIM/Greenblatt-Datenprojekte vor Core-Migration.
15. **Reihenfolge:** (1) Forward-Beobachtung Trend52 und Momentum ausbauen (ohne Regeländerung), (2) Momentum-Exit-Vorbehalt isoliert messen, (3) Piotroski nach PIT-Core, (4) Weinstein-Dekontamination nur bei Produktbedarf.

## 13. Reproduktion und Grenzen

- Branch `claude/supertrader-portfolio-triage` (von `origin/main` `579e6338e9d`); Gate A: nur `scripts/supertrader/**`, `docs/SUPERTRADER_*.md`, `.github/workflows/supertrader-validation.yml`.
- Tests: `node --test scripts/supertrader/tests/standard-frame.test.mjs` (14 Tests).
- Artefakte neu erzeugen: `node scripts/supertrader/triage/build-triage.mjs`.
- Messung: Commit-Marker `[supertrader-validation:standard]` bzw. `…:standard-smoke]` auf einem `claude/**`-Branch; Ergebnis verschlüsselt auf `claude/supertrader-validation-results`.
- **Grenzen:** Alle Perioden gesehen; keine Kostenprobe in dieser Runde (R14 hat 20/2 bp bereits gemessen); Signal nur gegen SPY; Trend52-Vergleichbarkeit; Fundamentalmethoden ohne Messung; Tier-Regeln und Klassenschwellen sind Setzungen der Prereg, keine Naturkonstanten.
- Nicht getan, nach Auftrag: keine Live-Änderung, kein Ledger, keine Registry-Umstellung, keine UI-Priorisierung, keine Parameteroptimierung, kein Merge.
