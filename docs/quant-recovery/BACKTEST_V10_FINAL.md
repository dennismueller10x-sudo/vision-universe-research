# V10 – Abschluss

**Status: V10_DATA_AND_STUDIES_EXTENDED_NO_CERTIFICATION.** Technisch implementiert 13/13; im definierten Scope methodisch abgenommen 7/13 (7/7 Erweiterungsmethoden, unverändert); **zertifizierte Backtest-Arten 0/6**; `productionApproved=false`; keine Produktaktivierung, kein Merge, kein Frontend, keine Workflowänderung, keine Datei unter `*/data` geändert.

Eingangsübergabe: [BACKTEST_V10_HANDOFF.md](BACKTEST_V10_HANDOFF.md) (unverändert). Basis: main `a1a0dd972a` (V9-Referenz `e21bd8a59d` enthalten). Berichte: [Evidenzmatrix](BACKTEST_V10_EVIDENCE_MATRIX.md) · [Datenrettung](BACKTEST_V10_DATA_RECOVERY.md) · [Realstudien](BACKTEST_V10_REAL_STUDIES.md) · [Zertifizierungsreife](BACKTEST_V10_CERTIFICATION_READINESS.md) · [Validierung](BACKTEST_V10_VALIDATION.md) · [Manifest](v10/artifact-manifest-1.0.0.json).

## Antworten

1. **Im aktiven Datenbestand behobene Datenfehler:** keine durch V10 selbst – generierte Artefakte werden nur von ihren Erzeugern geschrieben. Der SEC-Faktbuch-Tageslauf vom 28.10. hat 68 Emittenten mit der korrigierten Logik geschrieben; die Consumer-Bundles (inkl. STX, PRTH, WTBA) und PZZA folgen in den regulären Läufen am 02.11. bzw. 31.10. Research-seitig (opt-in, nicht im Produkt) korrigiert: 30 Delisting-Enden, 122 fortgeschriebene Kursenden als zensiert, 6 zusätzliche CA-Auflösungen, NVDA-Dividende 04.06.2026 (0,25 $ statt 0,01 $).
2. **Nachweislich materialisierte Erzeuger-Korrekturen:** SEC P1–P4 im Faktbuch-Erzeuger (68 Emittenten, neue Prüfcodes); im Consumer-Erzeuger wirksam (Schatten auf aktuellen SEC-Daten), Bestand ausstehend. PZZA: Erzeuger-Schatten CLEAN, Bestand ausstehend. Nachprüfung eingeplant (02.11.2026, `materialization_status.py`).
3. **Reparierte Identitätsfälle:** 62 von 132 einzeln quellenbelegt qualifiziert (Same-Day-Preis + Cover), hinter Option `identityEvidenceProtocolV10` – Freigabe offen. 70 weiter ausgeschlossen mit Grund. TRAK bleibt ausgeschlossen. Die 5 V9-Dossierfälle unverändert.
4. **Reparierte Corporate-Action-Fälle:** 6 Reihen neu aufgelöst (ACAD, ARLO, MGNX, MOH, NSIT, RDN; Register 24 → 30 Ereignisse), VSTS durch verschärfte Regel zurückgenommen; 20 der 81 V9-Trockenlauffälle einzeln zugelassen. Total Return: IBM 47/47, JPM 16/47 belegte Quartale; TR-Register für 8 Titel.
5. **Zusätzlich qualifizierte historische Listings:** Research-Population `{identity, CA, lifecycle}` 4.526 gegenüber V9 4.476 (+50 netto; darin 150 jetzt korrekt beendete Reihen); mit V10-Identität 4.583. Der Frame bleibt das heutige Anbieteruniversum (Abdeckung der 10-K-Melder 2000: 14 %, 2026: 69 %).
6. **Vollständige reale Studien:** Signal Backtest (5 Regeln, 60 Tests, 4.329 Listings, 2000–2025) inkl. Survivorship-Schranken und finanzierter Long-Strategien; Pattern Evidence (15 Muster, 90 Tests, Kontrollgruppe); Same Stock Replay als Regelstudie (200 Hash-Stichprobe); Faktor-Rekonstruktion (192 PIT-Stichtage, 28 Tests) mit Top-50-Strategie; Setup-Rekonstruktion 2005–2025 (16 Tests) und Original-Reifekalender.
7. **Historische Vorteilhaftigkeit gegenüber Benchmarks:** keine nach Mehrfachtestkontrolle. Signifikant positiv nur gegenüber der gleichzeitigen Basisrate: strong-12m-momentum 13 W (+1,05 %), three-month-thrust 52 W (+6,26 %); kleine positive Rang-ICs (Momentum alle Horizonte, Profitability/Quality kurz). Die NEW_52W_HIGH-Long-Strategie (CAGR 16,4 % vs. SPY 5,9 %) ist nicht kostenrobust und eine Survivor-Kohorte – kein Vorteilsnachweis.
8. **Ohne Vorteil:** alle 20 SPY-Überschüsse des Signal Backtests, alle Pattern-SPY-Überschüsse, Same Stock Replay, alle Faktor-Quintil-Überschüsse, Top-50-Faktorstrategie (13,0 % vs. 12,3 %, schlechterer Sharpe), Setup-Rekonstruktion; TREND_UP 13 W unterperformt die Basisrate signifikant (−0,63 %). Der NEW_52W_HIGH-Überschuss sinkt über die Teilperioden auf −0,7 % (2020–25).
9. **Im definierten Scope fachlich validiert:** Signal Backtest und Pattern Evidence als registrierte historische Entwicklungsstudien (Survivor-Universum, Kursrendite, keine Bestätigung); Same Stock Replay als Regelstudie; Setup und Faktor/Strategie als gekennzeichnete Rekonstruktionen. Keine Validierung ersetzt eine Zertifizierung.
10. **Aktiven Zertifizierungsvertrag erfüllt:** keine Art.
11. **Offene aktive Voraussetzungen:** Signal – zertifizierte Regel (Überschuss), OOS; Pattern – vollständige Survivorship, TR, `certifiedAsBacktest`; Replay – strukturell; Setup – Zeit-Gates bis 30.03.2027/03.04.2028, OOS-Gate fest `false`, Normfrage; Strategy/Factor – Originalhistorie 24 Monate (~2028-08), 12 Forward-Monate (~2028-01).
12. **Heute belastbare Rekonstruktionen:** Rang-IC-Aussagen der Faktor-Rekonstruktion (PIT aus SEC, Quintile ohne Überschuss); Setup-N_eff-Analyse und Reifekalender; Total-Return-Ledger der 8 belegten Titel als Mechanik. Keine als Ersatz für Originalhistorie.
13. **Echte Datenprobleme vs. künftige Originalbeobachtungen:** Datenprobleme – fehlende historische Population mit Delistings (vor allem vor 2015), 185 ungeklärte eingefrorene Enden, 572 CA-Halte, fehlende Dividenden-/Ex-Tag-Quellen, Spin-off-Faktoren als Splits, XBRL-Skalenfehler (Citigroup 2009), 168 Master-Statusfehler, fehlende Tages-OHLCV für Setup-Rekonstruktion. Originalbeobachtungen nötig – Setup M6/OOS, VU-Faktor- und Membership-Vintages, Forward-Monate, prospektive 8-K-Kohorte.
14. **Später vertretbare Produktintegration:** allenfalls eine deskriptive Anzeige historischer Häufigkeiten/Rohrenditen mit klarer Kennzeichnung „Survivor-Kohorte, Kursrendite, inkl. Marktdrift, kein Vorteil belegt“; ein getrennter „rekonstruierter Research-Scope“ für Rang-IC-Aussagen nur nach den in der Zertifizierungsreife genannten Voraussetzungen und Owner-Entscheid. Keine Regel- oder Strategieempfehlung.
15. **Änderungen, Tests, PRs, Commits:** siehe unten.

## Offene Freigaben (Owner)

1. 62 Identitätsbindungen (`identityEvidenceProtocolV10`).
2. Annahme der nach Sicht geänderten Protokolle (CA 1.1.1/1.1.2, Dividenden 1.0.1–1.0.4, Population 1.0.1–1.0.3).
3. Setup-Unabhängigkeitsgate (Empfehlung Option B) und OOS-Segmentdefinition.
4. Eigene Produkt-PRs: Security-Master-Statuskorrektur (168 Reihen, Patch vorbereitet), `research-portfolio`-Vollverkauf (Patch vorbereitet), `cli.py consumer`-Ausgabepfad, Spin-off-Faktoren/XBRL-Skalenfehler.
5. Rekonstruierter Research-Scope Faktor/Strategie (nur Vorlage).

## Bestätigte Abnahmegrenzen

Die sieben Erweiterungsmethoden bleiben in ihrem V7–V9-Scope abgenommen; Portfolio-Rebalancing nur für die belegte Buchführungsmechanik. Rechen- und Quellenparität sind keine Bestätigung. Rekonstruktionen ersetzen keine Originalhistorie. 2000–2025 ist explorierte Historie.

## Arbeitsweise, Commits, Tests

Fünf parallele Stränge in getrennten Worktrees (Population, Corporate Actions, Studien, Faktor, Setup) plus Strang A und eine unabhängige adversariale Prüfung; Integration per Merge-Commit auf `claude/vision-quant-v10-backtest-4ho3rd`; alle Registrierungen vor Ergebnissen committet. Ein integrierter Draft-PR (Teil-PRs hätten weitere Branches erfordert; vorgeschlagene Trennstellen: Population/Loader, CA-Register, Studien, Faktor, Setup, Berichte).

Tests und Ressourcen: siehe [Validierung](BACKTEST_V10_VALIDATION.md) und den PR-Text.
