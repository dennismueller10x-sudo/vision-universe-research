# Fundamental Data Integrity Audit – Bericht

> **Stand v4 (Kern 1.19.0, Freeze v4):** TTM-Integritaet, Umsatzbelege, Sichten, Red-Team-Korrekturen und TTM-Holdout (FAILED, offengelegt) - Zusammenfassung und Urteil (BLOCKED) in [FUNDAMENTAL_DATA_MIGRATION.md, Abschnitt 0](FUNDAMENTAL_DATA_MIGRATION.md).

Stand: 7. Oktober 2026.

- Branch `claude/fundamental-data-integrity-audit`, Basis `main` 829b35bdce4.
- Endstand des Kerns: Normalisierung **1.15.0**, Registry-Mapping **1.8.0**, Data-Freeze **v3**.
- Begleitdokumente: [Architektur](FUNDAMENTAL_DATA_ARCHITECTURE.md), [Migration](FUNDAMENTAL_DATA_MIGRATION.md).
- Artefakte unter `scripts/fundamentals-audit/artifacts/`: LINEAGE, CONSUMER-MATRIX, GROUND-TRUTH (+ MISMATCHES), ERRORS, HOLDOUT-PREREG, DATA-FREEZE v1/v2/v3, IMPACT, REBUILD-PLAN, DATA-MIGRATION-PLAN.

## FUNDAMENTAL DATA VERDICT

| | |
|---|---|
| **Systemweiter Fehler?** | **PARTIAL.** Der gemeinsame SEC-Kern hatte systematische Konzept- und Kalenderfehler (Abschnitt 2). Vor dem Fix war in der Entwicklungsstichprobe falsch, fehlend oder verspätet: 9,7 % der EPS-Quartale, 4,3 % der Umsatzquartale, 1,6 % der Nettogewinnquartale. Im ungesehenen Holdout waren es 15,5 % / 12,9 % / 2,3 %. Das betrifft breite Teile des Universums, aber nicht „alle Fundamentaldaten“. |
| **Point-in-Time verletzt?** | **Kern: NEIN.** In der Entwicklungsstichprobe gab es keinen Wert vor seiner Veröffentlichung. **Supertrader-Validierungsstore P7: JA.** Das Consumer-Bundle ist eine LATEST-Sicht: Es datiert historische Werte oft später, nie früher (E6). |
| **Lookahead vorhanden?** | **Kern: NEIN. P7: JA**, 3 von 4.711 Umsatzfakten. Holdout: 2 Fakten verletzen das Gate formal; Ursache ist eine 77-Tage-Rumpfperiode, kein Vorgriff (Abschnitt 5). |
| **Betroffene Kernmetriken** | EPS verwässert/unverwässert, Umsatz, Bruttogewinn (über Umsatz), Periodenzuordnung aller Kennzahlen bei Kalenderfehlern, Q4-Rekonstruktion, Geldbeträge mit Fremdwährungs-Kandidat. Nettogewinn-Ersatzkonzepte (E5) bleiben offen. |
| **Betroffene Produkte** | Discover (3.354 Titel), Screener (3.380), Quant-Faktor-Rohwerte (606), Company Intelligence (3.461 mit geänderter Eingangsreihe, 393 mit geändertem Wert), Supertrader CAN SLIM/Piotroski (845 / 616). Live-Minervini 2.0.0 nutzt keine SEC-Fundamentaldaten in Regeln. |
| **Historischer Rebuild notwendig?** | **JA**, kontrolliert über die Produzenten: Factbooks und Consumer-Bundles, danach die Produkte. Eingefrorene Research-Artefakte werden nicht neu gebaut. |
| **Fundamental v2 notwendig?** | **NEIN** als neues Datenmodell. **JA** zu Erweiterungen: Export-Sicht AS_REPORTED_AT_TIME (F4), Transformation und Konzept je Bundle-Zeile (F5), Abschlusszeile aus dem Filing-XBRL für mehrdeutigen Umsatz (F9). |
| **Minervini-Recall vorher** | **20 %** (3/15) |
| **Minervini-Recall nach ausschließlich Core-Datenfix** | **20 %** (3/15), unverändert. SEPA Pass/Fail ist an jedem Tag des ±12-Tage-Fensters identisch, für alle 35 auswertbaren Fälle. |
| **Verbleibendes Minervini-Problem** | **STRATEGY.** 0 von 12 Ablehnungen kippen durch korrigierte Daten. 7 Ablehnungen sind Strategie-Definition (GAAP-Basis negativ), 3 Fälle sind mit SEC-companyfacts nicht auswertbar. |
| **Produktionsklassifikation** | **READY_FOR_CONTROLLED_MIGRATION**, mit Vorbehalt: Das präregistrierte Holdout-Gate FALSE_AVAILABLE ist formal nicht bestanden (Rumpfperiode, kein Vorgriff; Abschnitt 5). Der Merge ist die Migrationsfreigabe (Abschnitt 10). |

**Leitfrage: „Sind unsere Fundamentaldaten falsch, oder haben wir teilweise korrekte Daten mit falschen Strategieannahmen verwendet?“**

**BEIDES, und getrennt messbar.**
- Die Daten hatten belegte Kernfehler. Für die Produkte wirken sie messbar: Umsatz, Wachstum, Margen, EPS-Abdeckung, KGV-Basis.
- Für Minervinis 20-%-Recall wirken sie zu **0 %**.

Die Audit-Arbeit hat eigene Fixes mehrfach widerlegt:
- **E2-R:** „Revenues zuerst“ war zu weit gefasst.
- **E10:** Ableitungen mischten Konzepte.
- **Red Team:** Meine erste Korrektur beider Punkte (1.13/1.14) verwarf auch korrekte Werte. Sie ist in 1.15.0 korrigiert.

Die Ground Truth enthält dieselbe Revenues-Annahme wie E2 und konnte das nicht allein sehen (Abschnitt 4).

## 1. Vorgehen

| Phase | Inhalt | Commit |
|---|---|---|
| A | Data Lineage, Consumer-Matrix, unabhängiger SEC-Ground-Truth-Extraktor | bd710d2ee4c |
| B | Ground Truth: 99 Entwicklungs-Emittenten (92 mit Daten), 18.250 Quartalsfakten. Pipeline-Vergleich P1/P7/P9, Fehler E1–E8 | 3730e2c4976 |
| – | Präregistrierung des Holdouts, vor jedem Fix und jedem Holdout-Abruf | 874ca57f338 |
| C | failing-first-Tests (17712f39f50), Fixes E1–E4 (5969a11a99a), Vorher/Nachher (c324afebc88), Freeze v1 (531360fe0a0) | |
| Holdout | 60 ungesehene Emittenten, 7.581 Fakten, gegen Freeze v1 | |
| D | Universumsweite Consumer-Wirkung. Dabei gefunden und je failing-first behoben: E9 (90fed77fb05 → 7921d6d98e8, Freeze v2 4a0351cd1f6), E2-R (185cc0d4263 → bc17e9f3ac7), E10 (60e1367dc6d → dc826000049). Cross-Consumer-Vertrag (e16d9edb59e, 7784f0439f3). Impact (2b720afd82e ff.) | |
| E | Red Team (F1–F10). Tests (011ef11b9da), Korrektur 1.15.0 (6d83e13efbf), Befunde eingearbeitet (00b4d3df200). CI-Prüfungen, Freeze v3, PR (kein Merge) | |

**Ground Truth** (`scripts/fundamentals-audit/sec-ground-truth.mjs`, unabhängig von P1)
- Quelle: SEC companyfacts und submissions (`acceptanceDateTime`), `companyfacts.zip` vom 7. Oktober 2026.
- Erstmeldung über alle Tags eines wirtschaftlichen Konzepts.
- Sichtbarkeit ab der frühesten periodischen Einreichung.
- Quartale werden auf ±7 Tage geclustert.
- Q4 = FY − 9M nur innerhalb eines Tags, nie für EPS.
- Dominante Einheit je Emittent.
- **Bekannte Grenze:** Bei Umsatz hat `Revenues` in derselben Einreichung Vorrang. Diese Annahme ist durch E2-R als nicht allgemein gültig belegt. Die GT blieb trotzdem unverändert, wie präregistriert. Betroffene Fakten werden einzeln geprüft und ausgewiesen.

## 2. Bewiesene Fehler

Schwere nach Abschnitt 87 des Auftrags, nicht nach Performance. Einzelfälle: `FUNDAMENTAL-GROUND-TRUTH-MISMATCHES.json`, `FUNDAMENTAL-ERRORS.json`.

| ID | Schicht | Fehler | Beleg | Schwere | Status |
|---|---|---|---|---|---|
| E1 | P1 Registry | `EarningsPerShareBasicAndDiluted` nicht als EPS registriert | TNDM Q1 2020 −0,25 (10-Q 2020-04-30), VU erst ab 10-K 2021. 255 MISSING + 101 LATE, 33 Emittenten | HIGH | behoben (Registry 1.7.0) |
| E2 | P1 Registry | Vertragsumsatz (ASC 606, Teilbetrag) vor `Revenues` (Gesamtumsatz) | AMT Q3 2019: 137,3 statt 1.953,6 Mio. (−93 %). 132 Quartale, 9 Emittenten | HIGH | behoben, revidiert durch E2-R |
| E2-R | P1 Registry/Normalisierung | Regression von E2: einige Einreicher taggen einen Teilbetrag oder 0 als `Revenues` | FLS `Revenues` = 0 in jedem 10-Q. PESI 642.000 neben 61,7 Mio. → abgeleitetes Q4 −45 Mio. Ebenso GEN, VRRM | HIGH | behoben (Registry 1.8.0, Kern 1.15.0): `Revenues` fällt nur weg, wenn er nicht positiv ist oder unter 50 % eines anderen Umsatzkonzepts derselben Einreichung und Währung liegt; dann gilt der Wert von `main`. Die erste Regel (1.13.0) war zu streng und vom Red Team widerlegt. Rest-Mehrdeutigkeit: Abschnitt 6 |
| E3 | P1 Kalender | Jahresende aus jeder Zwölfmonatsangabe gelernt | DE: Kalenderjahr-Steuersatz verschob alle FY2018-Quartale. 96 Fakten, 10 Emittenten | HIGH | behoben |
| E3b | P1 Kalender | doppelte Geschäftsjahreslabels bei 52/53-Wochen-Jahren um Neujahr | CERN FY2010 und FY2011 beide „2011“ | HIGH | behoben |
| E4 | P1 Perioden | EPS-Quartale aus Kumulwerten abgeleitet (FY − 9M) | REPL Q4 FY2021 −0,41 statt −0,42. Über 669 prüfbare Paare: nur 48,9 % innerhalb der Rundung, p90 15,8 %, 10 Vorzeichenwechsel | MEDIUM | behoben. Consumer-Folge: TTM-EPS entfällt (M-B1) |
| E5 | P1 Registry | `net_income` nimmt `ProfitLoss` (inkl. Minderheiten) als Ersatz | 43 bzw. 47 Fakten | MEDIUM | **nicht behoben**, bewusst (Abbruchbedingung „mehrdeutiges Mapping“), F3 |
| E6 | P2 Bundle | eine Fassung je Periode (LATEST) | ca. jede zweite Quartalszeile später datiert als die Erstverfügbarkeit, 0 früher | MEDIUM für PIT-Consumer | Architektur (C-PIT-1, F4) |
| E7 | P7 Supertrader-Validierung | ein EPS-Tag je Unternehmen, Tag-Priorität je Periode, Q4-Datum aus dem FY-Bericht, Basic als Ersatz | 3 Lookahead-Fakten (AMD Q4 2012, WFC Q4 2017, SHOP Q4 2024) | MEDIUM | nicht behoben: anderes Produkt (Gate A), F1 |
| E8 | P9 Minervini-Research | Tag-Priorität je Periode statt Erstmeldung | EPS 2,0 % LATE, Umsatz 4,0 % LATE, kein Lookahead | MEDIUM | nicht behoben: eingefroren |
| E9 | P1 Normalisierung | Kandidatenwahl ignoriert die Währung | CECO FY2025: `Revenues` 750 Mio. **EUR** statt 774,4 Mio. USD. Universum: 944 Zellen bei 152 Emittenten | MEDIUM | behoben (1.12.0) |
| E10 | P1 Perioden | Q4 = FY − 9M und YTD-Differenzen aus zwei verschiedenen Konzepten | NTRS Q4 2025: Gesamtertrag (10-K) minus 9M-Vertragsumsatz (10-Qs) = 4.376 Mio. bei Quartalen um 1,25 Mrd. | HIGH | behoben (1.15.0): Ableitung über das Konzept, das beide Einreichungen melden; ohne Beleg für einen Unterschied wie in `main`. Die Fassung 1.14.0 („sonst Lücke“) verwarf auch korrekte Quartale (Red Team F2). |

## 3. Was keine Fehler waren

| Verdacht | Ergebnis |
|---|---|
| GDDY: EPS 2017–2023 fehlt, „Custom-Tag“ | Standard-Tag mit Dimension `StatementClassOfStockAxis = CommonClassAMember`. companyfacts liefert keine dimensionalen Fakten, es ist also eine Quellenlücke. Eine heuristische Zuordnung wäre geraten (F6). |
| Quant „früher als die SEC“ (EARLY) | GT-Artefakte: UTC-Annahme am Vorabend, Quartalsenden ±7 Tage, Annahme vor dem amtlichen Einreichungsdatum, aus öffentlichen YTD ableitbar. Danach FALSE_AVAILABLE = 0. |
| RICK / TNDM `SEPA_STALE` als reiner Datenfehler | Teilweise: Die Daten waren veraltet (E1, P9-Tags). Mit korrekten Daten bleibt die Ablehnung trotzdem. |
| NLOK | Mit korrigierten Daten STALE statt NO_ACCELERATION (E4). Beides ist Fail. |
| Universum: Umsatz kleiner als `main` (35 Zellen) | Überwiegend Korrekturen von `main`-Fehlern. HY, IVT, CHSCL, FEIM zeigten in `main` das ganze Jahr als Q4. Dazu Gesamtumsatz nach Derivateffekten bei Versorgern und Energieunternehmen. TIPT ist schon in `main` negativ und bleibt offen. |

## 4. Ursachen und WHY TESTS DID NOT CATCH THIS

| Fehler | Ursache | Warum die Tests es nicht fanden |
|---|---|---|
| E1 | Konzeptliste aus Einzel-Tags; der Verlust-Tag `BasicAndDiluted` fehlte | Tests prüften Tags, nicht Konzepte. Keine echten SEC-Fixtures mit Tag-Wechsel. |
| E2 | Priorität „spezifischer Tag zuerst“ | Ein Test **erwartete** den Vertragsumsatz als Sieger und hielt damit den Fehler fest. |
| E2-R | Taxonomie-Semantik („Revenues = Gesamtumsatz“) als Tatsache behandelt | Die Ground Truth teilt die Annahme. Der Fix bestätigte sich per Konstruktion. Erst der Vergleich über das ganze Universum zeigte FLS = 0 und PESI negativ. |
| E3, E3b | Kalender lernte aus jeder Zwölfmonatsangabe; Labels über den Monat | Synthetische Kalendertests ohne Off-Cycle-Angaben und ohne 52/53-Wochen-Drift |
| E4 | De-Akkumulation behandelte jede Dauer-Kennzahl als additiv | Kein Test für nicht-additive Kennzahlen. Bundle-`derived` meint „Formel“, nicht „Periode abgeleitet“. |
| E9 | Priorität ohne Währungsprüfung | Fremdwährungs-Tests nur mit reinen EUR-Berichtern |
| E10 | Ableitung prüfte nur Zeitordnung, nicht Konzeptgleichheit | Keine Fixture mit Konzeptwechsel zwischen 10-K und 10-Q. Die GT hat die Regel und den Fehler daher nicht. |
| E6 | Das Bundle ist als aktuelle Sicht gebaut und wird historisch gelesen | Keine Verträge zur Sicht |
| E7, E8 | Parser-Duplikate außerhalb von P1 | Keine GT-Prüfung, keine gemeinsamen Fixtures |

Antworten auf die Testfragen:
- Echte SEC-Fixtures fehlten.
- Getestet wurde überwiegend synthetisch.
- Tests prüften Tags statt Konzepte (E1, E2).
- Tag-Wechsel fehlten.
- Custom-Tags sind nicht die Ursache, sondern dimensionale Fakten.
- Historische Sichtbarkeitstests fehlten; jetzt gibt es den GT-Harness.
- Consumer-Verträge fehlten; jetzt gibt es C-X-1.
- **Zusätzlich:** Eine Ground Truth, die eine Mapping-Annahme mit dem Kern teilt, kann diese Annahme nicht prüfen. Ein Konzeptfix braucht deshalb immer auch eine universumsweite Gegenprobe gegen den Ausgangsstand (`revenue-guarantee-check.mjs`).

**Neue permanente Tests**
- `scripts/quant/tests/test_sec_ground_truth_regressions.py`: 12 Tests auf echten SEC-Auszügen (TNDM, AMT, DE, CERN, REPL, CECO, FLS, PESI, NTRS, NVDA, UPST). Jeder Fehlertest schlug vor seinem Fix nachweislich fehl (eigene Commits); der AMT-Gegentest zu E2-R sichert den Gesamtumsatz ab.
- `scripts/quant/tests/test_normalize_periods.py`: Prioritätstest wieder mit der Erwartung von `main`, neuer Gegentest für den Gesamtumsatz.
- `core/tests/fundamental-cross-consumer.test.mjs`: 9 Tests auf echten 1.15.0-Bundles (AMT, CECO, FLS, TNDM, AAPL, BMI). Abgedeckt sind C-X-1, die Sicht, D2/D4/D6/D7, die erlaubte KGV-Abweichung und die Fallwerte E2/E9/E2-R.

## 5. Fehlerquoten (Ground Truth, unverändert)

### Entwicklungsstichprobe: `main` → Endstand 1.15.0

99 Emittenten (92 mit Daten), 18.250 Fakten.

| Konzept | Faktgenauigkeit vorher | nachher | FALSE_MISSING | FALSE_AVAILABLE | WRONG_CONCEPT |
|---|---|---|---|---|---|
| EPS verwässert | 90,30 % | 99,46 % | 0,42 % | 0 | 4 |
| EPS unverwässert | 90,52 % | 99,46 % | 0,42 % | 0 | 4 |
| Umsatz | 95,67 % | 99,47 % | 0,11 % | 0 | 18 |
| Nettogewinn | 98,40 % | 98,88 % | 0,06 % | 0 | 47 (E5) |

Wirkung je Schritt gegen die unveränderte GT (`FUNDAMENTAL-GROUND-TRUTH.json`, `coreFinal.stepEffects`):
- **E9:** 0 Zeilen.
- **E2-R (1.13):** 34 Umsatzfakten werden falsch.
- **E10 (1.14):** 34 richtige Fakten werden zu Lücken.
- **Red-Team-Korrektur (1.15):** 37 Lücken werden wieder richtig, 23 falsche werden richtig.
- **Endstand gegen Freeze v1, Umsatz:**
  - GEN (1): Die GT irrt; `Revenues` ist ein Teilbetrag.
  - GE (6): Beide Werte sind Teilbeträge.

Nach Jahresgruppe (nachher): 2009–2010 98,5 %, 2011–2014 98,6 %, 2015–2019 99,4 %, 2020–2026 99,7 %.

Nach Emittententyp (vorher → nachher):

| Typ | vorher | nachher |
|---|---|---|
| Small Cap | 83,8 % | 99,8 % |
| Delisted | 82,5 % | 99,95 % |
| REIT | 87,8 % | 96,4 % |
| Mega Cap | 98,3 % | 99,95 % |
| Banken, BDC | 100 % | 100 % |
| Auslandsemittent | 50 % | 50 % (6-K außerhalb des Kern-Scopes) |

Nach Formular (nachher): 10-Q 99,8 %, 10-K 98,4 %.

### Andere Parser (unverändert, nur gemessen)

| Pipeline | EPS | Umsatz | Lookahead |
|---|---|---|---|
| P7 Supertrader-Validierung | 91,1 % | 93,5 % | 3 Umsatzfakten (0,08 %) |
| P9 Minervini-Research | 97,6 % | 93,1 % | 0 |

### Holdout (präregistriert, 60 ungesehene Emittenten, 7.581 Fakten)

| Konzept | `main` | Freeze v1 (1.11.0) | 1.14.0 | Endstand 1.15.0 |
|---|---|---|---|---|
| EPS verwässert | 84,5 % | 99,15 % | 99,15 % | 99,15 % |
| Umsatz | 87,1 % | 98,8 % | 96,5 % | 98,2 % |
| Nettogewinn | 97,7 % | 98,1 % | 98,0 % | 98,1 % |

| Gate (präregistriert, Endstand) | Schwelle | Ergebnis | |
|---|---|---|---|
| FALSE_AVAILABLE | = 0 | NI 1, Umsatz 1 (OSW, 2019-03-19) | **formal nicht bestanden** (seit v1 unverändert) |
| VALUE_ACCURACY | ≥ 98 % | EPS 99,2 %, NI 98,2 %, Umsatz 98,3 % | bestanden |
| CONCEPT (WRONG_CONCEPT) | ≤ 1 % (NI 3 %) | EPS 0,53 %, NI 0,71 %, Umsatz 0,76 % | bestanden |
| PERIOD_MAPPING | ≤ 0,5 % | max. 0,06 % | bestanden |
| VISIBILITY_ACCURACY | ≥ 98 % | ≥ 99,85 % | bestanden |
| FALSE_MISSING | EPS ≤ 3 %, Umsatz/NI ≤ 2 % | 0,58 % / 0,47 % / 1,0 % | bestanden |

**Ehrliche Einordnung**
- **FALSE_AVAILABLE:** Eine 77-tägige Vorgänger-Rumpfperiode wurde im 10-Q vom 2019-08-15 veröffentlicht. Die GT-Mindestquartalslänge liegt bei 80 Tagen. Der Wert war öffentlich, also kein Vorgriff. Das Gate besteht schon vor jedem Fix.
- **Zwischenstände 1.13/1.14:** Dort schlugen auch die Umsatz-Gates VALUE (96,7 %) und CONCEPT (1,41 %) fehl. Ursache war die zu strenge erste E2-R/E10-Regel, die das Red Team widerlegt hat.
- **Endstand gegen Freeze v1, Umsatz:** VRRM (17 Fakten) wird nach der GT „falsch“; dort irrt die GT nachweislich (`Revenues` 21,9 Mio. neben 187,5 Mio. Gesamtumsatz). AHR: ein Fakt wahrscheinlich GT-Irrtum, ein Fakt jetzt richtig. NI (NiSource): 6 Fakten jetzt richtig.
- **Blindheit:** E9, E2-R, E10 und die Red-Team-Korrektur wurden **nach** der Öffnung des Holdouts gefunden, aus dem Universums-Diff bzw. dem Red Team, nicht aus dem Holdout. Für sie ist der Holdout nicht blind. Weder Gates noch Stichprobe wurden angepasst.

### Abdeckung nach Jahr (SEC-XBRL, ganzes Universum)

Emittenten des heutigen Universums mit XBRL-Einreichung im Jahr; darunter der Anteil mit Dreimonats-Quartalswert.

| Jahr | Emittenten mit XBRL | EPS | Umsatz | Nettogewinn |
|---|---|---|---|---|
| 2009 | 292 | 94 % | 82 % | 85 % |
| 2010 | 770 | 95 % | 75 % | 88 % |
| 2011 | 1.823 | 93 % | 69 % | 89 % |
| 2014 | 2.140 | 95 % | 72 % | 89 % |
| 2018 | 2.563 | 94 % | 86 % | 92 % |
| 2022 | 3.378 | 90 % | 83 % | 94 % |
| 2026 | 4.089 | 88 % | 79 % | 96 % |

**Lesart**
- Der Engpass vor Mitte 2011 ist die XBRL-Einführung, nicht der Parser. Die Pflicht kam stufenweise: Large Accelerated Filer ab Mitte 2009, alle übrigen ab Mitte 2011.
- Der Umsatzsprung 2018 kommt von ASC 606.
- Stichprobe gegen alle periodischen Einreicher (inkl. Nicht-XBRL), EPS-Abdeckung: 2009 48 %, 2010 68 %, ab 2011 81–85 %.

**Backtest-Eignung**
- Fundamentale PIT-Backtests auf SEC-Daten über das volle Universum: ab Juli 2011.
- 2009-06 bis 2011-06: nur Large Accelerated Filer, also Zusammensetzungs-Bias.
- Setups 2008–2010: überwiegend UNKNOWN. Lizenzpflichtige Daten wären nötig, und deren Einsatz ist eine Abbruchbedingung.

## 6. Umsatz: was bewiesen ist und was mehrdeutig bleibt

**Bewiesen**
- `Revenues` ist nicht immer der Gesamtumsatz. Gegenbelege für Teilbeträge: FLS 0 %, PESI 1 %, VTSI ~1 %, GEN 4 %, VRRM 12 % des Vertragsumsatzes.
- Der Vertragsumsatz ist nicht immer der Gesamtumsatz. Er kann ein Teilbetrag sein (AMT, BRK-B, CNA, ADM, CHTR) oder ein Bruttowert vor negativen Bestandteilen.
- Beispiele für Bruttowerte: UPST (ASC-606-Identität in derselben Einreichung: 258,3 − 30,2 = 228,2 Mio.), PXD (Derivate), FCX (Preisanpassungen), LNG, AEP, SO, WMB.
- Die Nettogesamtumsätze liegen bei 80–98 % des Vertragsumsatzes.

**Endstand-Regel (1.15.0)**
- `Revenues` gilt, außer er ist nicht positiv oder liegt unter 50 % eines anderen positiven Umsatzkonzepts derselben Einreichung und Währung. Dann gilt die Reihenfolge von `main`.
- Der Widerspruch bleibt in den Reconciliation-Berichten sichtbar (`CONCEPT_DISAGREEMENT`), im Bundle nicht (F5).
- Universumsweite Gegenprobe gegen `main`, 63.731 Umsatzzellen:

| Ergebnis | Zellen | Emittenten | Lesart |
|---|---|---|---|
| gleich | 59.452 | | |
| größer | 3.924 | 526 | Gesamtumsatz statt Teilbetrag |
| kleiner | 337 | 102 | Nettogesamtumsatz statt Bruttovertragsumsatz, sowie Q4-Korrekturen von `main`-Fehlern (Abschnitt 3) |
| kleiner mit Label- bzw. Währungswechsel | 18 | | |

- Stichprobe der kleineren Zellen: AEP 2024 19,72 Mrd. und LNG 2021 15,86 Mrd. sind die berichteten Gesamtumsätze. `main` zeigte dort den Bruttovertragsumsatz.

**Mehrdeutig, nicht gelöst**
- Für `Revenues` zwischen etwa 12 % und 50 % des Vertragsumsatzes liegt kein geprüfter Fall vor. Dazu gehören GE (46 %; beide Werte Teilbeträge) und AHR (46 %; wahrscheinlich Teilbetrag).
- Die 50-%-Schwelle liegt in der Lücke zwischen den belegten Klassen. Sie ist eine kalibrierte Regel, keine Identität.
- Die Lösung ohne Schwelle ist die Abschlusszeile aus dem Presentation-Linkbase des Filing-XBRL (F9, Blocker M-B4).

## 7. Minervini: Replay mit identischen eingefrorenen Fällen

Gleiche 15 MAIN-Fälle, gleiche Klassifikation, gleiche Timing-Toleranz (±12 Tage), gleiche Regeln. MR-SEPA-10 und die 15-Session-Basisregel sind unverändert. Getauscht wurden ausschließlich die Fundamentaldaten.

| | Datenquelle | Recall |
|---|---|---|
| vorher | P9 (Research-Parser, eingefroren) | 3/15 = 20 % |
| nachher | Kern 1.15.0 (`export_sepa_fund.py`, Erstmeldung, Erstverfügbarkeit) | 3/15 = 20 % |

- SEPA ist die einzige datenabhängige Schicht.
- Pass/Fail ist unter beiden Datenständen an **jedem Tag** des ±12-Tage-Fensters identisch, für alle 35 auswertbaren Fälle (`minervini-sepa-diagnosis.mjs --window 12`).
- Geprüft für jede Kernversion 1.11.0 bis 1.15.0: kein Fall ändert sein Ergebnis.

| Fall | Ticker | Eingefroren | SEPA P9 | Kern `main` | Kern 1.15.0 | SEC-GAAP-EPS q0 / Vorjahr | Endklassifikation |
|---|---|---|---|---|---|---|---|
| GT-001 | ZGNX | REJECTED | BASE_NOT_POSITIVE | STALE | BASE_NOT_POSITIVE | −0,87 / −0,86 | CORE_DATA_WAS_ALREADY_CORRECT (P9) · STRATEGY_DEFINITION_MISMATCH |
| GT-002 | MTLS | REJECTED | DATA_MISSING | DATA_MISSING | DATA_MISSING | – (20-F) | NOT_EVALUABLE (Auslandsemittent) · VCP nicht erfüllt |
| GT-003 | ROKU | REJECTED | BASE_NOT_POSITIVE | STALE | BASE_NOT_POSITIVE | −0,09 / −0,07 | CORE_DATA_WAS_ALREADY_CORRECT · STRATEGY_DEFINITION_MISMATCH |
| GT-004 | ACAD | REJECTED | BASE_NOT_POSITIVE | DATA_MISSING | BASE_NOT_POSITIVE | −0,38 / −0,51 | CORE_DATA_WAS_ALREADY_CORRECT · STRATEGY_DEFINITION_MISMATCH |
| GT-005 | AMD | DETECTED | ok | ok | ok | 0,14 / 0,01 | erkannt |
| GT-007 | TNDM | REJECTED | STALE | STALE | BASE_NOT_POSITIVE | −0,25 / −0,40 | CORE_DATA_FIXED_STILL_REJECTED · STRATEGY_DEFINITION_MISMATCH · VCP_FORMALIZATION_MISMATCH |
| GT-008 | AMD | DETECTED | ok | ok | ok | 0,14 / 0,01 | erkannt |
| GT-009 | AEM | REJECTED | STALE | DATA_MISSING | DATA_MISSING | (letzter 10-Q 2014) | NOT_EVALUABLE (40-F/6-K) |
| GT-010 | RVNC | REJECTED | STALE | STALE | BASE_NOT_POSITIVE | −1,12 / −0,86 | CORE_DATA_FIXED_STILL_REJECTED · STRATEGY_DEFINITION_MISMATCH · VCP_FORMALIZATION_MISMATCH |
| GT-011 | AMZN | DETECTED | ok | ok | ok | 10,30 / 5,22 | erkannt |
| GT-012 | REPL | REJECTED | STALE | DATA_MISSING | BASE_NOT_POSITIVE | −0,44 / −0,30 | CORE_DATA_FIXED_STILL_REJECTED · STRATEGY_DEFINITION_MISMATCH |
| GT-014 | DKL | REJECTED | DATA_MISSING | DATA_MISSING | DATA_MISSING | – (LP) | OTHER_FIDELITY_MISMATCH (Universum: LP) · Datenlücke |
| GT-016 | RICK | REJECTED | STALE | STALE | REVENUE_NOT_GROWING | 1,07 / 0,60 | CORE_DATA_FIXED_STILL_REJECTED · STRATEGY_DEFINITION_MISMATCH (Umsatzregel) · VCP_FORMALIZATION_MISMATCH |
| GT-018 | DECK | REJECTED | NO_ACCELERATION | NO_ACCELERATION | NO_ACCELERATION | 8,99 / 7,14 | CORE_DATA_WAS_ALREADY_CORRECT · VCP_FORMALIZATION_MISMATCH (Trend und VCP) |
| GT-026 | SG | REJECTED | BASE_NOT_POSITIVE | BASE_NOT_POSITIVE | BASE_NOT_POSITIVE | −0,13 / −0,24 | CORE_DATA_WAS_ALREADY_CORRECT · STRATEGY_DEFINITION_MISMATCH |
| GT-027 | RNA | NOT_EVALUABLE | – | – | – | – | NOT_EVALUABLE (Security-Mapping), nicht im Nenner |

| Klasse | Anzahl | Fälle |
|---|---|---|
| CORE_DATA_FIXED_AND_NOW_DETECTED | 0 | |
| erkannt | 3 | AMD ×2, AMZN |
| CORE_DATA_FIXED_STILL_REJECTED | 4 | TNDM, RVNC, REPL, RICK |
| CORE_DATA_WAS_ALREADY_CORRECT (abgelehnt) | 5 | ZGNX, ROKU, ACAD, SG, DECK |
| nicht mit SEC-companyfacts auswertbar | 3 | MTLS, AEM, DKL |

**GAAP gegen Minervini.** In 7 der 12 Ablehnungen ist der GAAP-Vorjahres-EPS negativ: ZGNX, ROKU, ACAD, TNDM, RVNC, REPL, SG. „Basis positiv“ verwirft diese Fälle mit korrekten SEC-Daten. Minervini kaufte sie trotzdem. Das ist eine Frage der Gewinndefinition (GAAP vs. bereinigt, Wendepunkt), keine Datenfrage.

**Folgeauftrag (nicht hier):** MR-SEPA-10 und die 15-Session-Basisregel prüfen. Beides bleibt unverändert.

## 8. Consumer-Wirkung (ganzes Universum)

**Methode**
- Gleiches SEC-Archiv (`companyfacts.zip`, 2026-10-07), Stichtag `as_of 2026-10-05`.
- `main` 829b35bdce4 gegen 1.15.0 (6d83e13efbf).
- Consumer-Engines unverändert; Börsenwert und Kurs fest.
- 5.072 Bundles je Seite, gleicher Universum-Hash; 3.744 Emittenten mit mindestens einer Änderung.
- Build-Identität (Builder-Hash, Fenster, Status) in `FUNDAMENTAL-IMPACT.json`.
- Der alte Build endete mit Exit 1 erst im Nachlauf: Die Pfadprüfung der Namensdatei liegt außerhalb des Worktrees. Alle Bundles waren geschrieben.
- Die Stände 1.12.0 (Universum vollständig) und 1.13.0 (`STALE_BUILD`) dienten nur der Fehlersuche.

### Bundle

| Kennzahl | Jahreswerte geändert | davon > 10 % | Quartalswerte geändert | TTM | Labelwechsel (E3/E3b) |
|---|---|---|---|---|---|
| Umsatz | 2.670 (574 Emittenten) | 1.523 (383) | 2.099 (329) | 309 geändert (164 > 10 %), 0 entfallen | 176 Emittenten |
| EPS verwässert | 166 (117) + 3.660 neue Jahre (1.094 Emittenten, E1) | 95 (77) | 6.575 Q4-Ableitungen entfallen (E4) | **3.394 → 159 Emittenten** mit TTM-EPS | 185 |
| Bruttogewinn | 634 (138) | 424 (106) | 462 (72) | – | 137 |
| Nettogewinn | 15 (10) | 15 (10) | 53 (34) | 30 geändert; 3.750 → 3.756 mit TTM | 194 |
| Aktienanzahl | 3 (3) | 0 | 13 (9) | – | 190 |

Berichtswährung (`units.*`, E9): Sie ändert sich bei 16 Emittenten. Das betrifft die Leser der Währungsschicht (`build-fx-pair-requirements.mjs`, `verify-currency-layer.mjs`).

### Produkte

| Consumer | Wirkung |
|---|---|
| **Quant** (`fundamental-inputs.js`) | **606** Emittenten mit geändertem Faktor-Rohwert. Querschnittsränge (Spearman alt/neu, Rangsprung > 10 Perzentilpunkte): Umsatzwachstum 3J 0,965 (125), Umsatzwachstum TTM 0,971 (99), Wachstumsbeschleunigung 0,966 (130), operative Marge Stabilität/Expansion 0,977/0,979 (71/66), Netto-/OCF-/FCF-Marge 0,993/0,992/0,994 (61/49/32), EPS-CAGR 0,995 (11), Rendite- und Qualitätsfaktoren ≈ 1,0. Kein Faktor, kein Gewicht, keine Schwelle verändert. |
| **Discover** (Aktienseite, Geschäftszahlen-Karte) | **3.354** Titel. KGV-Basis: 3.037 von TTM-EPS auf TTM-Gewinn / Aktien, 199 auf Jahres-EPS. KGV geändert bei 1.620 (287 > 10 %), 55 verlieren, 43 gewinnen ein KGV. TTM-Umsatz geändert bei 359 (205 > 10 %). Umsatzwachstum > 10 % verschoben bei 273 (62 Vorzeichenwechsel). |
| **Screener** | **3.380** Titel. Feld `eps` wechselt bei 3.236 von TTM auf Jahres-EPS, bleibt aber als TTM beschriftet (M-B1). Voreinstellungen (erfüllt alt → neu, verloren/gewonnen): `eps Positiv` 2.433 → 2.222 (332/121); Umsatzwachstum > 10 % 1.691 → 1.685 (38/32), > 20 % (35/28), > 50 % (18/14); EPS-Wachstum > 15 % (4/9); Bruttomarge > 40 % (6/23); operative Marge > 0 (0/17); Netto-Marge profitabel (2/46), > 10 % (21/41). |
| **Company Intelligence** | 3.461 Emittenten mit geänderter Eingangsreihe, 393 mit geändertem Wert: Quartalsumsatz 329, Bruttogewinn 72, Nettogewinn 34. Der Rest sind Labelwechsel und der Q4-EPS-Wegfall. CI summiert EPS schon heute nicht zu TTM. |
| **Supertrader** (CAN SLIM / Piotroski-Teilprüfungen) | 845 Emittenten mit geänderter Eingangsreihe, 616 mit geändertem Wert, vor allem Umsatz (574), Bruttogewinn (138) und Quartals-Nettogewinn (34). Keine Regel verändert. |
| **Weitere Leser** (Red Team F6) | Tiingo-2-Zulassung, Capability-Matrix (HAS_TTM), Quant-Quartals-API, VU2-Release, Pattern-Match, CI-Kalender-Backtest und Null-Faktor-Klassifikation lesen dieselben, oben gezählten Reihen. Pattern-Match, Pattern-Research und Faktor-Evidenz nennen das Bundle „PIT“, es ist aber LATEST (E6/C-PIT-1). |
| **Live-Minervini 2.0.0** | keine (keine SEC-Fundamentaldaten in Regeln) |

### Schweregrade der Wirkung

| Befund | Schwere | Grund |
|---|---|---|
| TTM-EPS-Wegfall (E4) | HIGH für Anzeige | KGV-Basis ändert sich still; der Screener zeigt einen Jahreswert unter TTM-Beschriftung. Entscheidung M-B1. |
| Umsatzkorrekturen (E2/E2-R/E9) | HIGH | Wachstum, Margen, KGV und Quant-Ränge von rund 570 Emittenten |
| Labelwechsel (E3/E3b) | MEDIUM | ca. 190 Emittenten, Jahresvergleiche |
| Berichtswährung (E9) | MEDIUM | 16 Emittenten, Währungsschicht |

## 9. Antworten auf die 20 Fragen

1. **Systemweiter Fundamental-Datenfehler?** Teilweise. Es gab systematische Kernfehler bei Konzepten, Kalender und Ableitung. Vor dem Fix waren in der Entwicklungsstichprobe 9,7 % der EPS-, 4,3 % der Umsatz- und 1,6 % der Nettogewinn-Quartale falsch, fehlend oder verspätet. Im Holdout waren es 15,5 / 12,9 / 2,3 %.
2. **Bewiesene Fehler:** E1, E2, E2-R, E3, E3b, E4, E9, E10 im Kern; E5 und E6 offen; E7 in P7; E8 in P9 (Abschnitt 2).
3. **Keine Fehler waren:** die GDDY-„Custom-Tags“ (dimensionale Fakten), Quant-„EARLY“ (GT-Artefakte), SEPA_STALE als alleinige Datenursache; kleinere Umsatzzellen im Universum sind überwiegend Nettogesamtumsätze bzw. Korrekturen von `main` (Abschnitte 3 und 6).
4. **Fehlerquote:** Quant-Kern vorher/nachher, Entwicklungsstichprobe: EPS 90,3 → 99,5 %, Umsatz 95,7 → 99,5 %, Nettogewinn 98,4 → 98,9 %. Holdout: EPS 84,5 → 99,2 %, Umsatz 87,1 → 98,2 %, Nettogewinn 97,7 → 98,1 %.
5. **Betroffene Metrics:** EPS (beide), Umsatz, Bruttogewinn, Periodenzuordnung aller Kennzahlen bei rund 190 Emittenten, abgeleitete Quartale, Berichtswährung bei 16 Emittenten.
6. **Betroffene Jahre:** alle. Vorher am stärksten 2011–2019 (92,9 % / 91,4 %). Vor 2011 begrenzt die XBRL-Einführung die Abdeckung, nicht der Parser.
7. **Besonders betroffene Emittententypen:** Small Caps (83,8 %), Delisted (82,5 %), REITs (87,8 %). Auslandsemittenten liegen außerhalb des Kern-Scopes (6-K).
8. **Point-in-Time verletzt?** Im Kern nein. P7 ja. Das Bundle ist eine LATEST-Sicht und wird von Faktor-Evidenz, Pattern-Research und Pattern-Match als „PIT“ gelesen (E6, C-PIT-1, F4).
9. **Lookahead?** Kern nein. P7 ja (3 Fakten). Die 2 formalen Holdout-Fälle sind eine Rumpfperiode, kein Vorgriff.
10. **Quant-Ergebnisse betroffen?** Ja, mäßig: 606 Emittenten mit geändertem Rohwert. Spürbar sind Rangverschiebungen in den Wachstumsfaktoren (rund 100–130 Emittenten > 10 Perzentilpunkte); Qualität und Bewertung praktisch unverändert.
11. **Screener betroffen?** Ja: `eps` (3.236 Titel wechseln still die Basis), Umsatzwachstum und Margen. Voreinstellungen kippen bei bis zu 453 Titeln (`eps Positiv`).
12. **Company Intelligence betroffen?** Ja, bei Quartalsumsatz (329 Emittenten), Bruttogewinn (72), Nettogewinn (34), Labels und Q4-EPS.
13. **Discover betroffen?** Ja: KGV-Basis (3.236), TTM-Umsatz (359), Umsatzwachstum, Margen.
14. **Betroffene Supertrader-Strategien:** CAN SLIM und Piotroski-Teilprüfungen über Umsatz, Bruttogewinn, Quartals-Nettogewinn und Jahreslabels (616 mit geändertem Wert). Minervini 2.0.0 live nicht. P7 hat eigene Fehler (E7).
15. **Minervini-Recall durch Core-Datenkorrektur:** unverändert 20 % (3/15). Pass/Fail ist an jedem Tag des ±12-Tage-Fensters identisch.
16. **Eindeutige Strategy/Fidelity-Probleme:** 7 Ablehnungen wegen negativer GAAP-Basis; RICK (Umsatzregel); VCP/Trend-Formalisierung (DECK, TNDM, RVNC, RICK); Universumsregel (DKL). Dazu Quellenlücken bei Auslandsemittenten (MTLS, AEM).
17. **Historische Daten neu bauen?** Ja, kontrolliert: Factbooks und Consumer-Bundles, danach die Produkte über ihre Produzenten. Eingefrorene Research-Stände bleiben unverändert.
18. **Quant neu materialisieren?** Ja, über die bestehenden Produzenten, nach dem Bundle-Rebuild, ohne Logikänderung.
19. **Fundamental-v2-Datenmodell?** Nein. Nötig sind Erweiterungen im bestehenden Modell: Sicht AS_REPORTED_AT_TIME (F4), Transformation und Konzept je Bundle-Zeile (F5), Abschlusszeile für mehrdeutigen Umsatz (F9), Konzeptmenge abgeleiteter Summen (F10).
20. **Vor einem Produktionsrelease:**
    1. Entscheidungen M-B1 (TTM-EPS, inklusive Screener-Beschriftung), M-B2 (Zeitpunkt) und M-B4 (Umsatz-Schwelle).
    2. Kenntnisnahme des formal nicht bestandenen FALSE_AVAILABLE-Gates.
    3. Branch auf `main` bringen, `freeze.mjs --check`.
    4. Merge, dann beobachteter Consumer-Lauf mit Diff gegen `FUNDAMENTAL-IMPACT.json`.
    5. Voll-Rebuild der Factbooks.
    6. Produktläufe mit grünen Gates.

## 10. Produktionsentscheidung

**READY_FOR_CONTROLLED_MIGRATION**, mit Vorbehalt (FALSE_AVAILABLE formal nicht bestanden, Abschnitt 5).

- Kein Merge und kein Rollout durch diesen Auftrag.
- Ein Merge ist die Migrationsfreigabe: Die SEC-Workflows laufen nach Zeitplan von `main` (täglich 06:15 UTC, Consumer montags 07:30 UTC).
- Plan, Schritte, Abbruchbedingungen und Rollback: [FUNDAMENTAL_DATA_MIGRATION.md](FUNDAMENTAL_DATA_MIGRATION.md).

## 11. Red Team (Abschnitt 100)

Ein unabhängiger Opus-Agent hat versucht, die zehn Kernaussagen zu widerlegen. Ergebnis und Umgang:

| Befund | Schwere | Umgang |
|---|---|---|
| F1: E2-R verwarf Nettogesamtumsätze (UPST, PXD, FCX) | HIGH | behoben in 1.15.0 (50-%-Regel, UPST-Test) |
| F2: E10 verwarf korrekte Quartale (NVDA Q4 FY2021) | HIGH | behoben in 1.15.0 (gemeinsames Konzept, NVDA-Test) |
| F3: Holdout-Gates des ausgelieferten Codes nicht berichtet | HIGH | berichtet (Abschnitt 5), auch die Zwischenstände |
| F4: Fixtures veraltet | MEDIUM | mit 1.15.0 neu gebaut |
| F5: Summen (TTM, Jahressumme) über gemischte Konzepte | MEDIUM | offen, unverändert gegenüber `main`, Folge-PR F10 |
| F6: Consumer-Matrix unvollständig | MEDIUM | neun Leser ergänzt, Währungswechsel gezählt |
| F7: Screener beschriftet FY-EPS als TTM | MEDIUM | Blocker M-B1 verschärft |
| F8: `CONCEPT_DISAGREEMENT` im Bundle unsichtbar | LOW | dokumentiert (F5) |
| F9: Gleichstand bei der Währungsmehrheit; erzeugte Folgelabels | LOW | dokumentiert |
| F10: veraltete Zahlen im Entwurf | LOW | Bericht auf Endstand |

Bestätigt wurden:
- kein Lookahead;
- keine aggressive Custom- oder Dimensions-Zuordnung;
- getrennte Sichten;
- Minervini und Quant nicht angepasst;
- Versionsdisziplin;
- keine generierten Artefakte im PR.

## 12. Nicht verändert

- Keine Quant-Faktoroptimierung: keine Faktor-, Gewichts- oder Schwellenänderung. Einzige Quant-Konfigurationsänderung ist die SEC-Metrik-Registry (Konzeptzuordnung).
- Keine Screener-Regel und keine Screener-Schwelle.
- Keine Supertrader-Regel. Kein Pfad unter `supertrader/**` oder `scripts/supertrader/**` verändert.
- Keine Minervini-Regel: MR-SEPA-10 und die 15-Session-Regel sind unverändert.
- Keine Performanceoptimierung. Keine Consumer-Logik.
- Kein generiertes Artefakt unter `quant/data`, `discover/data`, `supertrader/data` oder `social/data`.
- PR #471 und #475 sind nicht gemergt und nicht verändert; ihre eingefrorenen Artefakte sind unberührt.
- Weinstein ist nicht begonnen.
- Data-Freeze v1 und v2 sind unverändert. v3 ist der Endstand.
- Bereits rote Main-Tests (4 Quant-Tests: Golden Preview / Golden Five / Reproduzierbarkeit, SEC-unabhängig) sind identisch auf `main` 829b35bdce4 reproduziert und werden diesem PR nicht zugeschrieben.
