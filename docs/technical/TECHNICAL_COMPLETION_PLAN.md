# Technical – Completion-Matrix und Projektplan bis zur Produktreife

Verbindlicher Plan für den Owner-Auftrag „Autonomer Fertigstellungsauftrag“ (28.10.2026). Er ersetzt keine Fachdokumente, sondern ordnet sie:
- Stand und Verlauf: [TECHNICAL_WORLD_PROGRESS.md](TECHNICAL_WORLD_PROGRESS.md).
- Bibliothek: [TECHNICAL_LIBRARY.md](TECHNICAL_LIBRARY.md).
- Einzelheiten: in den verlinkten Spezifikationen.

**Regel für „erfüllt“:** Ein Kriterium ist erfüllt, wenn ein Test im Repository oder eine dokumentierte Produktprüfung (Lauf, Browser-QA, Universumsprüfung) es belegt. Es gibt keine geschätzten Prozentwerte. Ein Bereich ist fertig, wenn alle seine Abnahmekriterien erfüllt sind.

**Status:** ✔ erfüllt (mit Nachweis) · ◐ teilweise · ✘ fehlt · ⏸ vom Owner bewusst zurückgestellt (kein Blocker der Produktreife, eigenes späteres Paket).

**Priorität:**
- P0: falsche oder veraltete Daten, falsche Rechnung, rückdatierte Signale, gescheiterte produktive Verarbeitung, kaputte Kernfunktionen, instabile Schnittstellen.
- P1: Integration der wichtigsten vorhandenen Funktionen, Mehrfach-Zeitrahmen, E2E-Tests, Performance.
- P2: Spezialindikatoren, seltene Muster, Forschung.

**Ausgangsstand** (`main` = `db2bec0`, Daten-Stichtag 26.10.2026, 5.657 Titel):
- 92 Indikatoren, davon 24 in Chart oder Screener, 68 nur im Katalog;
- 62 Kerzenmuster, davon 27 im Screener, 0 im Chart;
- 24 Formationen, alle in Screener und Chart;
- 134 Screener-Spalten;
- 72 Abfragefelder, davon 25 auch für Woche und Monat.

---

## 1. Completion-Matrix

### A. Datenversorgung und automatische Aktualisierung

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| A1 Nächtliche Kette (market-data-refresh → Materialisierung → technical-world) läuft ohne Handeingriff und committet nach `main` | ✔ | 30.10.2026, ohne Handstart: Zeitplan-Lauf 41047225923 (Start 11:19 UTC) committet `b65def8`; schon um 11:08 UTC hatte der `workflow_run` nach „Lange Kursreihen“ `21ffbff` committet. Auch am 29.10. hat der Zeitplan-Lauf selbst committet (`26a0360`, 11:31 UTC). Einschränkung: Der Zeitplan (05:10 UTC) startet bei GitHub 5–6 h spät. Vorschlag gegen die Verspätung in TECHNICAL_READINESS_REPORT.md §4. | P0 |
| A2 Stichtag der Produktwelt ≤ 1 Sitzung hinter der letzten abgeschlossenen Sitzung | ✔ | 29.10.: Stichtag 28.10. = letzte abgeschlossene Sitzung; `system-health`: Technical (Produktwelt) OK. DQ-TW-1 PASS. | – |
| A3 Titel mit veraltetem oder eingefrorenem Kurs liefern keine Signale „von heute“ | ✔ | AP1 (#1077, `technical-screen-row-1.10.0`, SCREENER_FRESHNESS.md). Titel hinter dem Stichtag (77) haben keine Ereignis- und Stichtagsfelder. Eingefrorene Reihen (233, `frozenSince`, Datenqualitätshinweis, kein bestätigtes Delisting) haben keine Analysefelder. Neubau auf `main` (`a433f3e`): DQ-TW-6 PASS 0/310, 5.347 aktuelle Titel ohne Abweichung. Chart Studio wendet dieselbe Regel an (#1088). | – |
| A4 Ursache der beendeten Reihen bei aktivem Stamm | ⏸ | `diagnose.mjs AVB`: `MASTER_ACTIVE_SERIES_ENDED` (Reihe bis 17.08., Stamm ACTIVE). Zuständig ist die Marktdaten-Domäne (Erzeuger `market-data-refresh.yml`), nicht Technical. **Owner-Entscheidung 29.10.: keine zusätzlichen Anbieterabrufe.** Die Schutzmaßnahmen bleiben unverändert: Kennzeichnung veralteter und eingefrorener Titel (A3, AP1), Ereignisse veralteter Titel `null`, DQ-TW-6. Damit ist das Risiko „falsches Signal“ abgedeckt; offen bleibt nur die Ursache in der Marktdaten-Domäne. | P0 (Owner, zurückgestellt) |
| A5 Kein Eingriff in `*/data` von Hand. Neubau nur durch den Erzeuger | ✔ | `core-ci.yml` (Erzeuger-Eigentum), `producer-ownership.test.mjs` | – |

### B. Indikatorbibliothek und externe Referenzprüfungen

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| B1 Jeder Indikator mit naiver Referenzformel, Aufwärmphase, Kausalität und Determinismus getestet | ✔ | 92/92: `technical-indicators*.test.mjs` | – |
| B2 Jeder Indikator gegen eine fremde Implementierung auf echten Kursen geprüft (TA-Lib 0.8.2 oder pandas-ta) | ✔ | 92/92: INDICATORS_EXTERNAL_REFERENCE.md, Fixtures unter `quant/tests/fixtures` | – |
| B3 Eine Rechnung für Screener und Chart: Screener-Wert = `Indicators.compute` auf demselben Bündel | ✔ | Dauerhafter E2E-Test `technical/tests/technical-e2e-consistency.test.mjs` (#1080, erweitert in AP5b): 26 Indikatorspalten, Formationen und Kerzenmuster der Trefferzeile entsprechen Chart Studio. Universumsvergleich am 28.10.: Median der Abweichung 0,003; alle Ausreißer waren eingefrorene Reihen (AP1). | – |
| B4 Fachlich wichtige Katalogindikatoren sind im Produkt nutzbar (Screener-Feld und/oder Chart) | ✔ | Jedes Indikatorfeld des Screeners ist in Chart Studio darstellbar, seit #1095 auch die relative Stärke (`model.js#FIELD_CHART`, Test ohne offene Einträge). Weitere Katalogindikatoren kommen nur nach Relevanz (AP7, P2). | – |

### C. Candlestick-Erkennung

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| C1 62 Muster gegen TA-Lib bzw. konstruierte Fälle, Kausalität und Aufwärmphase | ✔ | `technical-candlesticks*.test.mjs`, CANDLESTICKS.md | – |
| C2 Muster im Screener (heute, Fenster, Tag/Woche/Monat) | ✔ | 27 Muster im Tages-Screener. Kerzen je Woche und Monat seit der Materialisierung vom 28.10. belegt (94,4 % bzw. 94,0 %, SCREENER_FIELDS_L7.md §2d). | – |
| C3 Muster im Chart sichtbar (Marker je Bar) | ✔ (nach Merge AP5) | Schicht „Kerzenmuster“ in Chart Studio, mit denselben 27 Mustern wie der Screener (`model.js#candleMarks`). Der E2E-Test prüft, dass die Marken am letzten Bar den Spalten der Trefferzeile entsprechen; die Browser-QA prüft Ein- und Ausschalten. Die übrigen 35 Muster stehen nur im Katalog (P2). | P1 |
| C4 Evidenz mit Grenzen dokumentiert | ✔ | CANDLESTICK_EVIDENCE.md inkl. Marktphasen (#1071) | – |

### D. Chartformationen und geometrische Korrektheit

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| D1 Jede Erkennung regelkonform (Geometrie je Typ, Kanten nach Typ) | ✔ | Validator: 11.387 / 11.387 (FORMATION_VALIDATION.md §1, §7) | – |
| D2 Keine Rückdatierung: sichtbar am Erkennungstag, Bestätigung/Invalidierung nicht davor, `LOOKAHEAD`-Abbruch | ✔ | Validator (B-F3), `formations.js`, Tests | – |
| D3 Bestätigung = erster Schluss jenseits der gezeichneten Linie (Bar-Raum wie Chart) | ✔ (nach Merge #1073) | FORMATION_VALIDATION.md §8: 1.856 / 1.856 | – |
| D4 Regeltexte entsprechen der Rechnung | ✔ | Keile: Bestätigung „mehr als 0,1 ATR (ATR des Erkennungsbars)“ mit Test (#1074). Die übrigen Typen sind geprüft; der Validator (#1073) prüft jede Bestätigung gegen die gezeichnete Linie. | – |
| D5 Formationen im Wochenchart | ◐ | Completion 2.0 (#1183, screen-row 1.14.0): dieselbe Formations-Engine auf abgeschlossenen Wochenbars aus den 270 Tagesbars. Screener-Spalten `formationActive@1W`/`formationConfirmed@1W`, Chart „1J·W“ mit denselben Wochen (Test: Spalte = Engine), kausal. Offen ist nur die lange Historie (5J/Max), die die Lizenz für Wochen-OHLC braucht (WEEKLY_FORMATIONS.md §4). | P2 |

### E. Multi-Timeframe-Analyse

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| E1 Woche/Monat aus der Tageshistorie, nur abgeschlossene Perioden, kausal | ✔ | MULTI_TIMEFRAME.md, `technical-mtf*.test.mjs` | – |
| E2 Alle W/M-Spalten nach der Materialisierung befüllt (Abdeckung wie in SCREENER_FIELDS_L7.md §2a vorhergesagt) | ✔ | 29.10. (`92b010e`): alle 18 L7-Spalten belegt (94–96 %). Leer sind nur Titel, die nach AP1 bewusst keine Stichtagswerte tragen. Vergleich mit der Näherung in §2d. DQ-TW-5 PASS (0/46). | – |
| E3 Zeitrahmen-Wechsel im Screener für alle Felder mit W/M-Bedeutung | ✔ | AP4 (#1106): Ereignisse je Woche und Monat (Linie, RSI 30/70) und 52-Wochen-Tief, Auswahl nach Evidenz; übrige Felder bewusst nur am Tag (SCREENER_FIELDS_AP4.md §1). Prüfung 30.10. 06:47 UTC: alle 21 Spalten belegt, DQ-TW-1..7 PASS (SCREENER_FIELDS_AP4.md §5a). | P1 |
| E4 Wochenchart mit OHLC und Indikatoren | ◐ | Completion 2.0 (#1183): Wochenkerzen (echte OHLC, nur abgeschlossene Wochen) mit SMA 10/40 W im Bereich „1J·W“, gebildet aus den veröffentlichten Tagesbars. 5J/Max bleiben die Schlusslinie: Lange Wochen-OHLC wären eine neue öffentliche Kursreihe; das wartet auf die Lizenzfreigabe (WEEKLY_FORMATIONS.md §4). | P2 |

### F. Universumsweiter Screener und Suchlogik

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| F1 Abfrage-Engine mit Schema, Validierung, Gruppen und/oder, Presets | ✔ | `technical-query.js` (`jsonSchema`, `validate`), Tests | – |
| F2 Gespeicherte Strategien mit Migration | ✔ | `technical-saved-migration.test.mjs` | – |
| F3 `/screener/` nutzt dieselben Spalten (eine Quelle) | ✔ | #936, 16 Spalten | – |
| F4 Ereignisfelder beziehen sich auf den Stichtag des Universums | ✔ | siehe A3. Für Titel hinter dem Stichtag gelten Ereignisfilter als „unbekannt“ (`null`) und sind kein Treffer. | – |
| F6 Jeder Spaltenwert ist im Abfragekatalog wählbar | ✔ (nach Merge AP2) | **Befund 28.10.:** Marktstruktur MIXED (629 Titel) und UNDETERMINED (61) waren nicht wählbar, „Neutral“ fand nie einen Titel. Behoben in `technical-query-1.10.0`; der Vertrag prüft das künftig für jede Enum-Spalte. | P0 |
| F5 Suche in Worten (KI) | ◐ | Completion 2.0 (#1182): `query-ai.js` übersetzt nur und ist standardmäßig aus; ausgeführt wird ausschließlich mit `technical-query.js`. Geprüft wird auf INVALID, ASSUMED_THRESHOLD, UNMAPPED und DIFFERS_FROM_RULES; bei Fehlern greift ein sicherer Rückfall auf die Regeln. Kostengrenzen sind eingebaut. Getestet mit Mock-Antworten (Gold-Set 88/88, 0 stille Fehlgriffe). Die übersetzte Abfrage ist vor dem Ausführen bearbeitbar. Freischaltung erst nach Owner-Entscheidung zu Anbieter, Kosten, Budget und Datenschutz (AI_SEARCH_EVAL.md). | P2 (Freischaltung beim Owner) |

### G. Chart Studio und visuelle Darstellung

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| G1 Kurs, 13 Schichten, 11 Unterfenster, Formationen mit Linien, Zeitraum, Hell/Dunkel, 390/1280 px | ✔ | Browser-QA in `technical-ci.yml` | – |
| G2 Gezeichnete Linien = Rechnung (Bar-Raum) | ✔ | `chart.js` x = Bar-Index. Validator §8 | – |
| G3 Kerzenmuster als Marker | ✔ (nach Merge AP5) | siehe C3 | P1 |
| G4 Relevante Katalogindikatoren wählbar | ✔ | 31 Indikatoren im Chart, zuletzt das Unterfenster „Rel. Stärke“ ggü. SPY (#1095; SPY wird erst beim Einschalten geladen). Alle 52 Indikatorfelder des Screeners haben eine Darstellung (`FIELD_CHART` ohne offene Einträge). Die Werte entsprechen der Trefferzeile (E2E: 26 Spalten sowie `rs3m`, `rs6m`, `rsPositive`). | – |

### H. Historische Evidenz und methodische Grenzen

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| H1 Definition, Stichprobe, Konfidenz (Datums-Cluster), Mehrfachtest (Bonferroni) | ✔ | INDICATOR_EVIDENCE.md, CANDLESTICK_EVIDENCE.md, formation-evidence, WEEKLY_EVIDENCE.md | – |
| H2 Stabilität über Marktphasen und Zeithälften | ✔ | #1071 | – |
| H3 Kein Look-ahead in der Evidenz (Ereignis nur mit Wissen bis t, Rendite ab t+1) | ✔ | Evidenz-Tests | – |
| H4 Evidenz im Produkt nur beschreibend und mit Grenzen | ✔ | Formations-Evidenz und seit #1109 (`ebf0bfc`, Owner-Freigabe 29.10. mit Auflage „kein statistisch gesicherter Unterschied nachgewiesen“) Indikator- und Kerzen-Evidenz (`signal-evidence.json`), nur auf der Methodik-Seite. Drei Ebenen getrennt: Ereignis, historische Beobachtung, kein nachgewiesener Handelsvorteil (SIGNAL_EVIDENCE.md). Live seit 29.10.; Browser-QA: Chart, Screener und Start ohne Evidenztext. | – |

### I. Performance, CI, Datenqualität und Zuverlässigkeit

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| I1 Erzeuger reproduzierbar (byte-gleich bei gleichem Input) | ✔ | #1032 und Erzeugerläufe `--out` | – |
| I2 DQ-Regeln Technical (DQ-TW-1..5) im Gesamt-DQ-Lauf | ✔ | `core/data-quality.js` | – |
| I3 Tests schreiben keine Produktionsdaten | ✔ | `check-test-isolation.mjs` | – |
| I4 Datenvertrag der Technical-Artefakte dokumentiert und durch Tests erzwungen (Feldtypen, Wertebereiche, Versionen) | ✔ (nach Merge AP2) | `screener-contract.js` und DATA_CONTRACT.md (Spaltentabelle aus dem Vertrag erzeugt). Durchgesetzt im Erzeuger (schreibt bei einem Verstoß nicht), in `technical-data-contract.test.mjs` und in DQ-TW-7. | – |
| I5 Laufzeitbudget: Erzeuger ≤ 120 s, Screener-Abfrage im Browser über 5.657 Titel ≤ 100 ms | ✔ | Erzeuger 47 s (Neubau 28.10.). Abfrage-Budget als dauerhafter Test (#1080): komplexe Abfrage über das ganze Universum, Median von 9 Läufen unter 100 ms. | – |

### J. End-to-End-Integration und Produktnutzbarkeit

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| J1 Screener → Treffer → Chart Studio zeigt dieselben Werte und Formationen wie die Trefferzeile | ✔ | Browser-QA klickt den Weg. E2E-Wertevergleich Zeile ↔ Chart (#1080, erweitert in #1082, #1088, #1095): 26 Indikatorspalten, relative Stärke, Formationen, Kerzenmuster und der Zustand „eingefroren“ (233/233). | – |
| J2 Stichtag und Aktualität für Nutzer sichtbar | ✔ | Trefferliste: „Kurs vom …“ bzw. „Kurs unverändert seit …“. Chart Studio: Hinweis mit Stichtag; bei eingefrorener Reihe keine Befunde und Niveaus (#1088). E2E-Test: Chart Studio und Screener erkennen dieselben eingefrorenen Titel (233/233). | – |
| J3 Leere, fehlerhafte und fehlende Daten mit verständlichem Zustand | ✔ | Browser-QA (Zustandsboxen) | – |

---

### K. Completion 2.0 (Auftrag 30.10.2026, Gesamtplan: [TECHNICAL_COMPLETION_2_0.md](TECHNICAL_COMPLETION_2_0.md))

| Kriterium | Status | Nachweis bzw. Lücke | Prio |
|---|---|---|---|
| K1 Auffällige Kurssprünge generisch gekennzeichnet; Verdacht und bestätigter Fehler getrennt; in Screener, Vorlagen und Chart Studio | ✔ | #1180 (screen-row 1.13.0, `price-jumps.js`): 181 Kennzeichnungen, 1 bestätigt (GIBO). Keine tickerbezogene Regel. | P0 |
| K2 Bestätigter Datenfehler (GIBO 25:1) ausschließlich in der Marktdaten-Pipeline bereinigt, mit Schutz gegen Doppelbereinigung | ◐ | #1177 (Beleg) und #1181 (Bereinigung, Status PIPELINE). Wirksam ab dem nächsten regulären Lauf; der Nachweis ist für den 31.10. geplant (CORPORATE_ACTION_GIBO_2026.md). | P0 |
| K3 Mobile Performance weiter verbessert ohne Architekturumbau | ◐ | #1184: `spark` als eigene Datei, Screener-Datensatz −21,5 %, erste Vorlage mobil 4,78 → 3,00 s (lokal gemessen). Ist offen, bis gemergt und live gemessen. | P1 |
| K4 Historische Tests der Vorlagen (S4) mit bestehender Backtest-Maschine, ehrlich eingestuft | ◐ | `scripts/technical/s4/template-study.mjs` über `runEventStudy`, `holm`, `buildWalkForward`, `classifyRegimes`. Status RESEARCH_LIMITED, nicht zertifiziert (S4_TEMPLATE_STUDY.md). Formations-Vorlagen sind mangels Tages-OHLC-Historie nicht testbar. | P1 |
| K5 Wochenkerzen und -formationen | ◐ | siehe D5, E4 | P2 |
| K6 KI-Suche vorbereitet, standardmäßig aus | ✔ (vorbereitet) | siehe F5 | P2 |

## 2. Arbeitspakete (Reihenfolge = Priorität)

Jedes Paket läuft in Zyklen: analysieren → umsetzen → testen → beheben → erneut prüfen → integrieren. Fachmodelländerungen kommen als eigener PR mit Vorher/Nachher zur Freigabe. Während einer Freigabe läuft das nächste unabhängige Paket weiter.

| AP | Inhalt | Kriterien | Prio | Freigabe |
|---|---|---|---|---|
| **AP1** | **Zeitbezug der Screener-Signale.** Ereignisse veralteter Titel werden auf den Universums-Stichtag bezogen: Tage plus Sitzungsrückstand, „heute“-Felder `null`. Dazu Vorher/Nachher und eine DQ-Regel. | A3, F4, J2 | P0 | ja (Feldsemantik) |
| **AP2** | **Datenvertrag Technical v1 und Konsistenz.** Ein Vertragsdokument für `screener-v1.json`, `meta.json`, `index-v1.json` und `formation-evidence.json` sowie die Engine-Ausgaben (Formation, Indikator, Kerze). Vertragstest über die echten Artefakte. Universumstest Screener-Spalte = Engine-Rechnung auf dem Bündel. | B3, I4 | P0 | nein (Tests/Doku) |
| **AP3** | **Nachtlauf, L7-Abdeckung, E2E und Budgets.** Prüfung am 29.10. (Aktualität, DQ-TW-1..5, L7-Füllraten gegen §2a). E2E-Wertevergleich Zeile ↔ Chart. Budget-Test für die Abfrage. | A1, A2, E2, I5, J1 | P0/P1 | nein |
| **AP4** | **Mehrfach-Zeitrahmen vervollständigen.** Nach bestandener L7-Prüfung: Auswahl weiterer W/M-Felder mit fachlicher Bedeutung (z. B. ADX- und MACD-Ereignisse, Formationen der Woche). | E3 | P1 | ja |
| **AP5** | **Chart-Integration vorhandener Funktionen.** Kerzenmarker (Auswahl mit Evidenz, siehe C4). Relevante Katalogindikatoren als Schicht oder Unterfenster und Screener-Feld. Auswahl nach Nutzung in der Praxis und nach Evidenz, nicht nach Anzahl. Keine Neugestaltung, nur Einhängen in bestehende Schichten und Unterfenster. | C3, G3, G4, B4 | P1 | ja, sobald Screener-Felder entstehen |
| AP6 | Evidenz im Produkt (beschreibend), Wochen-OHLC, Formationen im Wochenchart | H4, E4, D5 | P2 | ja |
| AP7 | weitere Spezialindikatoren und seltene Muster | – | P2 | je nach Fall |
| **AP8** | **Strategie-Vorlagen** (Owner-Auftrag 29.10.; S1–S3 umgesetzt 30.10., S4 offen): erklärte Kombinationen bestehender Filter mit Kriterien-Checkliste je Treffer, z. B. Trendvorlage (8 Kriterien), Dreiecke, Trendfilter. Architektur, Lücken (SMA 150, Steigung SMA 200, Abstand zum 52-Wochen-Tief, RS-Rang, Ausbruchsrichtung) und Pakete S1–S4: [STRATEGY_TEMPLATES_PLAN.md](STRATEGY_TEMPLATES_PLAN.md). | neues Produktpaket | P1 nach Readiness | ja (Auswahl, Texte; S2 Fachmodell) |

## 3. Blockaden und Eskalationen

| Thema | Wer entscheidet | Stand |
|---|---|---|
| 82 Titel mit beendeter Reihe bei aktivem Stamm (A4). Technical kennzeichnet sie seit AP1 (#1077). Die Ursache liegt in der Marktdaten-Domäne. | Owner (ein Anbieterabruf wäre nötig) | entschieden 29.10.: kein zusätzlicher Anbieterabruf; Schutzmaßnahmen bleiben |
| KI-Suche (F5): Modellaufruf ist kostenpflichtig | Owner | entschieden 29.10.: zurückgestellt; regelbasierte Wortsuche bleibt |
| Wochenchart mit Kerzen und Formationen (E4, D5). Die lange Wochenreihe enthält nur Schlusskurse. Echte Wochenkerzen über 5 Jahre oder Max wären neue öffentliche Kursdaten (Wochen-OHLC), die MULTI_TIMEFRAME.md bewusst ausschließt; Lizenz und Rechtsfrage liegen beim Owner. Optionen: **A** Status quo (Wochen-Schlusslinie mit SMA 10/40, ehrlich und ohne neue Daten). **B** Wochenkerzen nur im Zeitraum 1J, im Browser aus den 270 bereits veröffentlichten Tagesbars gebildet (rund 54 Kerzen, keine neuen Daten); für Formationen der Woche reicht das nicht (Aufwärmphase rund 120 Bars). **C** Wochen-OHLC der Vollhistorie veröffentlichen; erst damit wären E4 und D5 vollständig, Voraussetzung ist die Lizenzprüfung. Empfehlung: A beibehalten; C nur nach Lizenzklärung. B bringt wenig. | Owner | entschieden 29.10.: vorläufig A; späteres Paket unten |
| Neue Fachmodell-PRs | Owner | siehe TECHNICAL_WORLD_PROGRESS.md §6 |

**Späteres Paket „Wochenchart“ (E4 + D5, zurückgestellt am 29.10.2026, keine Absage).** Die Teile hängen zusammen und kommen nur gemeinsam:
1. Voraussetzung: Owner klärt Lizenz und Rechtsfrage für öffentliche Wochen-OHLC (Option C). Ohne diese Klärung beginnt das Paket nicht.
2. Daten: Wochen-OHLCV der Vollhistorie aus der Materialisierung (Bündel `multiTimeframe` rechnet sie bereits für den Screener), als eigenes Artefakt mit Vertrag, Erzeuger und DQ-Regel; kein zusätzlicher Anbieterabruf.
3. Chart: Wochenkerzen und Wochenindikatoren in der bestehenden Chart-Ansicht (keine Neugestaltung), Zeitraum 5J/Max.
4. Formationen der Woche: dieselbe Pattern-Engine auf Wochenbars, mit eigener Validierung (Geometrie, Bestätigung jenseits der Linie) und eigener Evidenz, bevor sie im Screener erscheinen (Fachmodell-PR).
5. Abnahme: Universumsprüfung Wochen-OHLC gegen Tagesbars, E2E Zeile ↔ Chart für Woche, mobile Browser-QA.

## 4. Wiederaufnahmepunkt

Wer die Arbeit fortsetzt, beginnt hier:
1. Offene PRs und ihre CI prüfen (TECHNICAL_WORLD_PROGRESS.md §10, letzte Einträge).
2. Nächstes offenes Arbeitspaket in §2 nehmen. Den Status in §1 erst mit Nachweis auf ✔ setzen.
3. Jede abgeschlossene Prüfung mit Datum, Commit und Ergebnis im Verlauf von TECHNICAL_WORLD_PROGRESS.md festhalten.

**Stand 30.10.2026, 23 Uhr UTC (Completion 2.0):** Plan, Stand und Übergabe stehen in [TECHNICAL_COMPLETION_2_0.md](TECHNICAL_COMPLETION_2_0.md).
- Gemergt: #1177, #1180, #1181, #1182, #1183.
- Offen: #1184 (B4) und der S4-PR.
- Nachweise am 31.10.: Nachtlauf #1168 und GIBO-Bereinigung (Kontrolltermine 08:30 und 12:45 UTC).

**Stand 30.10.2026, 16 Uhr UTC:**
- **Readiness:** A1 und E3 sind ✔. Kein P0/P1-Kriterium ist offen (TECHNICAL_READINESS_REPORT.md).
- **AP8 Strategie-Vorlagen:**
  - S2 (L1–L5, Owner-Freigabe 30.10.) gemergt: #1144, #1145, #1147, #1149, #1150. Je PR wurde mit dem Erzeuger neu gebaut; die bisherigen 150 Spalten blieben byte-gleich.
  - S1 (#1139) und S3 (#1151) gemergt.
  - DQ-TW-8 (#1155) überwacht Lunten-Tiefs bei Vorlagen-Treffern.
  - Zahlen und Prüfung: STRATEGY_TEMPLATE_S3.md §3–§5.
- **Offen:**
  - S4 (historische Prüfung der Vorlagen) braucht eine eigene Freigabe.
  - Die Verspätung des Zeitplans ist eine Workflow-Frage (Vorschlag im Readiness-Bericht §4).

**Stand 29.10.2026, 13 Uhr UTC:**
- Readiness-Bericht: [TECHNICAL_READINESS_REPORT.md](TECHNICAL_READINESS_REPORT.md). Offen sind nur A1 (P0) und E3 (P1); beide werden am 30.10. um 06:40 UTC geprüft, danach wird der Bericht ergänzt.
- #1109 (H4) gemergt und live. E4/D5, F5 und A4 sind vom Owner zurückgestellt (⏸).
- Nächstes Produktpaket AP8 (Strategie-Vorlagen) ist geplant und wartet auf die Owner-Entscheidungen in STRATEGY_TEMPLATES_PLAN.md §7.

**Stand 28.10.2026, 17 Uhr UTC:**
- AP1 ist abgeschlossen: #1077 (Owner-Freigabe mit Bedingungen, alle erfüllt) und #1088 (Chart Studio) sind gemergt. `technical/data` wurde mit dem Erzeuger neu gebaut (`a433f3e`, kein Anbieterabruf). DQ-TW-1..7 PASS.
- AP2, AP3 (E2E, Budget), AP5 und AP5b sind gemergt.
- Offen: Prüfung des Nachtlaufs mit L7-Abdeckung am 29.10. um 06:30 UTC (AP3). AP4 beginnt erst, wenn diese Prüfung bestanden ist.
- G4 (relative Stärke im Chart) ist mit #1095 abgeschlossen. B4, D4, I5 und J1 sind mit Nachweis auf ✔ gesetzt.
- L7-Prüfung am 29.10. bestanden: A2, C2 und E2 sind ✔ (SCREENER_FIELDS_L7.md §2d). AP4 (E3) kann beginnen.
- A1 bleibt ◐, bis ein Zeitplan-Lauf von technical-world selbst committet.
- A4 liegt beim Owner. Danach folgt P2 (AP6: Evidenz im Produkt, Wochen-OHLC). Die Ursache der eingefrorenen Reihen liegt bei der Marktdaten-Domäne (Owner).
