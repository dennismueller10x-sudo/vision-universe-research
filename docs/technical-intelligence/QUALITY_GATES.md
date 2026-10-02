# Quality Gates

| Gate | Kriterium | Nachweis | Status |
|---|---|---|---|
| G1 Research | Primärquellen je Methode, Evidenzgrade, Entscheidung angenommen/abgelehnt | METHOD_RESEARCH.md §1–4 | ✅ |
| G2 Spezifikation | jede Regel mit Klasse (HARD/DEF/GUIDE), Quelle, Algorithmus | ELLIOTT_SPECIFICATION.md, Traceability Matrix | ✅ |
| G3 Core Engines | Elliott V2 (8 Musterklassen, Grade), Trend, Momentum, Volatilität, Volumen, Niveaus, Formationen, Wyckoff, Szenarien | `ti-elliott-v2.test.mjs` (17), `ti-engine.test.mjs` (19) | ✅ |
| G4 No-Look-Ahead | Ergebnis an t == abgeschnittene Serie; vergiftete Zukunft ohne Wirkung; Outcome ab t+1; kein Repainting historischer Labels | EV2-C1/C2/C3, TI-C1/C2/C3, TI-O1/O2 | ✅ |
| G5 Kalibrierung | Gate definiert und geprüft; ohne Bestehen keine Wahrscheinlichkeit | BACKTEST_METHODOLOGY §6, TI-I2 | ✅ (Gate geprüft: **nicht bestanden** → keine Prozentwerte) |
| G6 Consumer UI | Ergebnis vor Methode, Zonen, Szenarien, Evidenz mit Baseline, Mobil ohne Überlauf | Screenshots Desktop/Mobil, `ti-ui.test.mjs` | ✅ |
| G7 Profi UI | Zählungen, Alternativen, Regelprüfung mit Quelle, Niveaus, Konfluenz, Methodik | Screenshot AAPL `?ansicht=profi` | ✅ |
| G8 Integration | Routen, Aktienseiten-Teaser, Methodik-Thema, API v2, Discover-Reihen, Alerts-Modell, KI-Werkzeuge, CI (Materialisierung, Drift-Prüfung, Evidenz-Workflow) | internal-links, smoke-view-coverage, verify-technical-intelligence | ✅ (Zustellung Alerts/VU Ask offen) |
| G9 Regression | gesamte Quant-Testsuite grün; bestehende Technical-V1-Tests unverändert | `node --test quant/tests/*.test.mjs` | ✅ |
| G10 Dokumentation | 9 geforderte Dokumente + Gates | dieses Verzeichnis | ✅ |
