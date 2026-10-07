# Quality Gates

| Gate | Kriterium | Nachweis | Status |
|---|---|---|---|
| G1 Research | Primärquellen je Methode, Evidenzgrade, Entscheidung angenommen/abgelehnt | METHOD_RESEARCH.md §1–4 | ✅ |
| G2 Spezifikation | jede Regel mit Klasse (HARD/DEF/GUIDE), Quelle, Algorithmus | ELLIOTT_SPECIFICATION.md, Traceability Matrix | ✅ |
| G3 Core Engines | Elliott V2 (8 Musterklassen, Grade), Trend, Momentum, Volatilität, Volumen, Niveaus, Formationen, Wyckoff, Szenarien | `ti-elliott-v2.test.mjs` (18), `ti-engine.test.mjs` (23) | ✅ |
| G4 No-Look-Ahead | Ergebnis an t == abgeschnittene Serie; vergiftete Zukunft ohne Wirkung; Outcome ab t+1; kein Repainting historischer Labels | EV2-C1/C2/C3, TI-C1/C2/C3, TI-O1/O2/O4, TI-R1/R2 (Pivot-Gleichstand, Datenlage je t) | ✅ |
| G5 Kalibrierung | Gate definiert und geprüft; ohne Bestehen keine Wahrscheinlichkeit | BACKTEST_METHODOLOGY §6, TI-I2 | ✅ (Gate geprüft: **nicht bestanden** → keine Prozentwerte) |
| G6 Consumer UI | Ergebnis vor Methode, Zonen, Szenarien, Evidenz mit Baseline, Mobil ohne Überlauf | Screenshots Desktop/Mobil, `ti-ui.test.mjs` | ✅ |
| G7 Profi UI | Zählungen, Alternativen, Regelprüfung mit Quelle, Niveaus, Konfluenz, Methodik | Screenshot AAPL `?ansicht=profi` | ✅ |
| G8 Integration | Routen, Aktienseiten-Teaser, Methodik-Thema, API v2, Discover-Reihen, Alerts-Modell, KI-Werkzeuge, CI (Materialisierung, Drift-Prüfung, Evidenz-Workflow) | internal-links, smoke-view-coverage, verify-technical-intelligence | ✅ (Zustellung Alerts/VU Ask offen) |
| G9 Regression | gesamte Quant-Testsuite grün; bestehende Technical-V1-Tests unverändert | `node --test quant/tests/*.test.mjs` | ✅ |
| G10 Dokumentation | 9 geforderte Dokumente + Gates | dieses Verzeichnis | ✅ |
| G11 Adversarialer Review | Quant-/Methoden-Review der Messung; Befunde behoben oder dokumentiert; Neuberechnung ohne Parameteränderung | TECHNICAL_EVIDENCE §0, `protocol.postFreezeMeasurementFixes`, EV2-R9/R10, TI-R3 | ✅ (Ergebnis: kein Vorteil gegenüber Zufall — offen berichtet) |
| G12 Elliott-Forensik | Fehlerklassen A–H getrennt, Regelkarte Quelle → Spezifikation → Code → Test | ELLIOTT_AUDIT.md | ✅ |
| G13 Quellengebundene Qualität | jede Regel/Guideline mit Quelle, Qualität A/B/V, Klasse; harte Regeln nicht kompensierbar (INVALID); VU-Empirie nie als Elliott-Regel | ELLIOTT_RULE_MATRIX.md, `sources.js`, EV2-Q1/Q2/Q3 | ✅ |
| G14 Referenzset | Lehrbuchstrukturen (synthetisch) mit Erwartung, Engine-Ergebnis, Abweichung, Grund | `reference-set.json`: 8/15 primär, 1 alternativ, 6 verfehlt (Flats, Truncation, expand. Dreieck) | ⚠️ dokumentiert, nicht bestanden für Flats |
| G15 Vorab registrierte Validierung | H1–H7 auf Bestätigungsstichprobe, CI und Holm; Replikation exploratorisch | ELLIOTT_VALIDATION_REPORT.md | ✅ (Ergebnis: nur H6 bestätigt → Kontext) |
| G16 Qualitätskalibrierung | Count Quality und Ergebnis getrennt; Enthaltungsquote; selektive Anwendung | `quality-calibration.json` | ✅ (kein Gefälle → Qualität bleibt methodische Aussage) |
| G17 Audit-Stichprobe | 80 geschichtete Fälle mit Chart bis Erkennung, Regel-Audit, späterem Ergebnis | `quant/research/elliott-audit/` | ✅ (menschliche Bewertung offen) |
| G18 Produkt v3 | Overlay-Vertrag, Strukturklarheit statt Konfidenz, Evidenzbadges, Wave Inspector, Zeitreise, Relabeling-Risiko | API_V3_MIGRATION.md, `ti-product.test.mjs`, Screenshots | ✅ |
| G19 Elliott Engine Quality (Remediation) | vorab registriertes Gate G1–G11 auf getrennten Fällen, hohes Rauschen getrennt | ELLIOTT_ENGINE_QUALITY_PREREG.md, ELLIOTT_ENGINE3_REPORT.md, `ti-elliott-v3.test.mjs` | ❌ HOLDOUT-2: G1–G4, G6–G11 bestanden; G5 (29 %) und hohes Rauschen verfehlt → kein Prognose-Backtest |
| G20 Elliott Engine Quality HOLDOUT-3 (Mission III) | vorab registriert (ELLIOTT_HOLDOUT3_PREREG.md), C1/C2/C3 + echte Charts | holdout3/holdout3-result-v32.json, ELLIOTT_ENGINE32_REPORT.md | ❌ G1, G6–G8, G10–G12, G14, G15 bestanden; G2–G5, G9, G13, D2 verfehlt → kein Prognose-Backtest |

## Stand nach Mission IV

* Elliott-Qualitäts-Gate: HOLDOUT-3 **FAIL** (Engine 3.2.0). 3.2.1/3.2.2 ohne Holdout-Urteil; kein HOLDOUT-4 (Begründung: MISSION4_FINAL_REPORT.md §4).
* Generator-Audit 2: Der synthetische Korpus taugt nicht als Qualitäts-Gate, nur als Regressions-/Plausibilitätsprüfung. Ein künftiges Gate braucht einen unabhängigen Maßstab (Expertenannotation über die Werkbank).
* Prognose-Gate: nicht bestanden (TEST-Lift −0,36 pp, Cluster-KI −1,81 … +1,09); kein Prognose-Backtest der Elliott-Schicht.

## Mission VIII (Historical Structural Accuracy Benchmark)

| Gate | Kriterium | Nachweis | Status |
|---|---|---|---|
| G21 Kausales Replay | Präfix-Identität aller Record-Felder, vergiftete Zukunft, Siegel vor Outcomes, Panel-Abgleich | HSAB-C1/C2/C3, S2, Review-Prüfung (1.294 Stichproben) | ✅ (Ausnahmen: Split-Rundung, Shard-Siegel) |
| G22 Regression bekannter Produktfehler | über alle historischen Ausgaben (564.191 Records): keine Niveaus ≤ 0, keine Ziele > Faktor 3, CRV > 20 = 0, kein Szenario auf toter Reihe, keine Elliott-Formung bei Enthaltung, stabile Szenario-IDs | `local/w-surv-record-audit.json`; Quant-Suite 2.316/2.316 | ✅ (neu: 9,8 % Ziel 1 bei Anzeige erreicht) |
| G23 Unabhängiger Code-Review | Befunde behoben oder offengelegt | `reviews/MISSION8_CODE_REVIEW.md` (4 HIGH, 10 MEDIUM) | ✅ |
| G24 Methoden-Red-Team | Befunde vor dem Holdout umgesetzt | `reviews/MISSION8_METHODOLOGY_REDTEAM.md` | ✅ |
| G25 Präregistrierung | eingefroren im Eltern-Commit, Hash im Protokoll, Engine-Freeze, einmalige Öffnung | `HISTORICAL_ACCURACY_PREREGISTRATION.md`, `HOLDOUT_OPENING_LOG.md`, CI-Guards | ✅ |
| G26 Prognosevorteil (vorab registriert) | H1 + H2 + Relevanz + G1–G5 | `technical-intelligence-evidence-v2.json` | ❌ **DETECTABLE BUT NEGLIGIBLE** (G2/G4 verfehlt, Tag unter Relevanzschwelle) |

## Mission IX

| Gate | Kriterium | Nachweis | Status |
|---|---|---|---|
| G27 Disjunkte Bestätigungsstichprobe | Ränge 0–1199 der Titelliste = veröffentlichte Mission-VIII-Stichprobe, sonst Abbruch; Bestätigung = Dev-Stage-1-Symbolhash | `replay.mjs --disjoint-from`, Test M9-S1, CI-Schritt „Same sample“ | ✅ |
| G28 Methoden-Red-Team vor dem Freeze | Befunde behoben oder offengelegt | `reviews/MISSION9_METHODOLOGY_REDTEAM.md` (4 HIGH, 6 MEDIUM, alle umgesetzt) | ✅ |
| G29 Präregistrierung und einmalige Öffnung | Freeze-Commit mit Hash, leerer Diff bis zur Öffnung, Marke vor Stage 2, Einmaligkeit über alle Branches | `MISSION9_PREREGISTRATION.md`, `MISSION9_OPENING_LOG.md`, CI-Guards | ✅ |
| G30 Kausalität Track B | Merkmale nur bis t, Anomalie-Tor nur [t−52, t], kein Kursfilter auf bereinigten Kursen | Test M9-B2, Red Team H3/H4 | ✅ |
| G31 Track A hohe Genauigkeit (vorab registriert) | HAC gegen D und E bei CRV ≥ 0,75 | `mission9/ci/a9-confirm-tracka.json` | ❌ **NO HIGH-ACCURACY EDGE** (einmal geöffnet; HAC überall ausgeschlossen) |
| G32 Track B asymmetrischer Vorteil | VU-Signal 5×/24M > 1 auf DEV und VAL mit gedeckeltem Überschuss > 0 | `mission9/local/decision-trackb-elliott.json` | ❌ NO ASYMMETRIC EDGE (explorativ, verbrauchte Daten) |
