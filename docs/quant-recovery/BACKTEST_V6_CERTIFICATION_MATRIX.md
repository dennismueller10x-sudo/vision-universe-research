# Quant V6 – technische und fachliche Abnahmematrix

**Gesamtstatus: V6_IMPLEMENTED_WITH_EVIDENCE_GAPS. Aktiver Produktstatus: 0/6 CERTIFIED.**

„Implementiert“ bezieht sich auf den ausdrücklich benannten neuen Backend-Scope, nicht auf eine fertig qualifizierte historische Marktstudie. „Rechenprüfung“ bezeichnet deterministische/negative Tests und unabhängige Python-Referenzen. „Unabhängige Evidenz“ verlangt dagegen eine tatsächlich unabhängige bestätigende Ergebnisstichprobe; eine zweite Implementierung derselben bekannten Daten genügt dafür nicht.

| Bereich | Implementiert | Datenfähig | Methodisch validiert | Unabhängige Evidenz | Offen |
|---|---|---|---|---|---|
| Same Stock Replay | Ja: eigene fixierte Regel-/Episodenstudie; deskriptiver Bestand erhalten | Einzelaktien-Preisreferenz eingeschränkt; vollständige Studienpopulation nicht qualifiziert | Rechenprüfung bestanden; formale Regelvalidierung offen | Nicht nachgewiesen | Historische Identität/Population, TR, feste bestätigende Auswahl und neuer Holdout |
| Pattern Evidence | Ja: Fälle, Kontrollen, Überlappung, Outcomes | Historische Population/TR unvollständig | Rechenprüfung bestanden; vollständige Studienabnahme offen | Nicht nachgewiesen | Kontrollpopulation, Ausschlüsse/Biasgrenzen, Fehlerkontrolle über gesamte Suche |
| Signal Backtest | Ja: fünf unveränderte Regeln als Long-Ereignisstudien; finanzierte NEW_52W_HIGH-Referenz unverändert | 4.451 begrenzte Preisreplays; keine vollständige historische Hauptpopulation | Mechanik nachgerechnet; bestehende Regelgates nicht bestanden | Kein neuer Holdout | Delistings in Hauptstudie, Regimenachweis, OOS/WF-Regelbefunde und TR |
| Setup Backtest | Ja: historisches Mapping, Deduplizierung, registrierte Entry-/Exitvarianten | Veröffentlichtes Archiv zu kurz; offene Horizonte bleiben offen | Rechenprüfung bestanden; aktive Historien-/Segment-/Ownergates offen | Nicht nachgewiesen | Original-/Rekonstruktionsnachweise, M6-Reife, Cluster und Wochen-/Monatsvertrag |
| Strategy Backtest | Ja: vorhandene Auswahl plus strenge finanzierte Buchführung | Historische Membership/Faktoren/CA-Terminalwerte unvollständig | Buchführung unabhängig nachgerechnet; historische Strategieabnahme offen | Nicht nachgewiesen | Vollständiger PIT-Datensatz, Liquiditätskalibrierung, Kosten und unabhängige Studie |
| Factor Ranking | Ja: PIT-Ranking vor Outcomeauswahl, Buckets, Rang-/Faktorabhängigkeiten | Faktorvintages, Membership und gereifte Forward-Monate unvollständig | Rechenprüfung bestanden; aktive Historiengates offen | Nicht nachgewiesen | Vollständige historische Querschnitte und präregistrierte Bestätigung |
| Monte Carlo | Ja: Trade-IID/Circular-Block, Pfade, Verteilungen, Unsicherheit, Budgets | Reale begrenzte NVDA-Quelle verwendbar; Eignung/Unabhängigkeit des Resamplingmodells nicht bewiesen | Bedingte Modellmechanik geprüft; Quellen-/Annahmenabnahme separat | Durch Simulation nicht erzeugbar | Block-/IID-Eignung, Stichproben-/Regimeunsicherheit; keine Prognose oder Edge-Behauptung |
| Walk-Forward | Ja: Partition und registrierte Fit-/Auswahl-/Testausführung | Funktioniert mit qualifizierten Intervall-/Labeldaten; reale Zielstudien bleiben begrenzt | Mechanik geprüft; studienspezifischer Fenster-/Clustervertrag offen | Bereits betrachtete Historie bleibt Entwicklung | Freigegebene Auswahlregeln, ausreichende gereifte Folds, Quellen-/Callbackaudit |
| Out-of-Sample | Ja: Register, Vorregistrierung, einmaliger Verbrauch, Aggregation | Bekannte Signalhistorie ist gesperrte Exploration; kein neuer qualifizierter Holdout vorhanden | Mechanik geprüft; echte Unberührtheit braucht externen Nachweis | Nicht nachgewiesen | Unabhängiger Bestand, kontrollierte Zugriffe, Präregistrierung, Entsiegelungsprüfung |
| Marktregime | Ja: zusätzliche Trend-/Vol-/Stressklassifikation und Analyse | Historische aktive Produktregime nicht qualifiziert; Zusatzlabels ersetzen sie nicht | Rechenprüfung bestanden; Regimeabnahme offen | Nicht nachgewiesen | PIT-Quellen/Universum, genügend Episoden/Cluster, freigegebene Aussagegrenzen |
| Sensitivität | Ja: registriertes Raster, Kosten/Delay/Haltedauer, Holm und Nachbarschaft | Abhängig von qualifizierter Ausgangsstudie | Raster-/Korrekturmechanik geprüft; statistischer Evaluator benötigt Audit | Keine nachträgliche Bestätigung aus demselben Raster | Gesamter Suchraum, nominale vs simultane Intervalle, unabhängige Bestätigung |
| Event-Driven | Ja: Publikations-/Revisions-/Sessionlogik und Ereignisoutcomes | Engine-/Fixturefähig; kein vollständiges qualifiziertes historisches Eventuniversum | Rechenprüfung bestanden; reale Quellen-/Eventklassenabnahme offen | Nicht nachgewiesen | Originalereignisse, Zeitstempel, Listingbezug, Ausführbarkeit und Outcomeabdeckung |
| Portfolio-Rebalancing | Ja: Kalender, Drift, Zielgewichte, Cash, Turnover, CA/Delisting | Historische Portfoliodaten und Kosten-/Liquiditätskalibrierung unvollständig | Buchführung unabhängig nachgerechnet; reale Portfolioabnahme offen | Nicht nachgewiesen | PIT-Universum/Faktoren, vollständige terminale Werte und Benchmark-/Kapazitätsstudie |

## Maschinenlesbare Achsen

[assessment.json](v6/assessment.json) führt je Bereich `IMPLEMENTATION_COMPLETE`, `DATA_ELIGIBLE`, `METHOD_VALIDATED`, `INDEPENDENT_EVIDENCE`, `ECONOMIC_ADVANTAGE` und `PRODUCTION_APPROVED`. Technische Implementierung erhält nur für den beschriebenen Scope PASS. Fehlende historische Daten werden FAIL oder UNKNOWN; formale methodische Abnahme und unabhängiger wirtschaftlicher Vorteil werden nicht aus Unit-Tests abgeleitet. Produktion ist überall NOT_APPROVED.

Die aktive Engine `backtest-certification.js`, ihr Methodenvertrag und ihr erzeugtes Statusartefakt wurden nicht geändert. Neue Offline-Befunde überschreiben keinen aktiven Gatewert. Ein negatives Ergebnis kann rechnerisch korrekt sein; bestehende aktive Vorteil-/OOS-Gates werden deshalb nicht gelöscht oder umbenannt.

Die bestehenden konkreten Mindestanforderungen bleiben zusätzlich wirksam:

| Art / Vertrag | Weiterhin erforderliche aktive Nachweise |
|---|---|
| Same Stock Replay | Survivor-by-construction und deskriptiver Regeltest bleiben offene Produktgates; der neue Studiencontainer setzt sie nicht auf PASS |
| Pattern Evidence | Historische Population/Survivorship, geeignete TR-Basis und formaler Studien-/Backtest-Nachweis |
| Signal Backtest | Je Regel sämtliche PIT-, Look-ahead-, Stichproben-, OOS-, Walk-Forward-, Survivorship-, TR-, Kosten-, Benchmark-, Regime-, Unabhängigkeits-, Stabilitäts-, Vollständigkeits- und bestehenden Vorteilsgates; keine Regel pauschal zertifiziert |
| Setup Backtest | Mindestens 120 Stichtage, 180 Tage Spanne, 100 abgeschlossene M6-Outcomes, 20 Titel; OOS mindestens 30 je Segment, Entryvarianten-Mediandifferenz höchstens 1 Prozentpunkt und Ownerfreigabe. Der Vertrag nennt 20 unabhängige Wochen, der bestehende Erzeuger zählt tatsächlich 20 Monate; die strengere bestehende Auswertung wird nicht still reduziert |
| Strategy Backtest | Mindestens 24 Monatsstände für Membership und Faktoren; maximal 45 Tage Lücke; weitere PIT-/Ausführungs-/Datenqualitätsgates bleiben erforderlich |
| Factor Ranking | Mindestens 24 Monatsstände für Faktoren, 12 Monate mit abgeschlossenem M3-Forward-Ausgang und ausreichende historische Membership; maximal 45 Tage Lücke |
| Aktive pfadabhängige Regime | Mindestens 12 geordnete Beobachtungen über 90 Tage sind notwendige bestehende Bedingungen, keine hinreichende historische Zertifizierung; Aktivierung verlangt zusätzlich die bestehenden gemessenen Prüfungen und ausdrückliche Vertragsfreigabe |

Die archivierten Vorschläge zu 99,5 % Coverage, fünf Jahren, 20 Episoden/Quartalen, 80 % Power und +0,50 Prozentpunkten Mindestwirkung sind keine erteilten Freigaben. [methodology-proposal.json](v6/methodology-proposal.json) enthält Begründungen und die unveränderte Setup-Wochen/Monate-Abweichung. Bis zu einer ausdrücklichen versionierten Entscheidung gelten bestehende strengere Gates.

## Verbleibende Abnahmeentscheidungen

1. Zulässige Quellen-/Lizenzpakete gemäß [Datenbericht](BACKTEST_V6_DATA_GAPS.md) auswählen; erst nach Nutzerfreigabe kostenpflichtig beschaffen.
2. Unabhängig qualifizierten historischen Datensatz je Studie abnehmen; heutige Werte oder aktuelle Universen dürfen Originalhistorien nicht ersetzen.
3. Primärendpunkte, Unsicherheit, Abhängigkeiten, Power, wirtschaftliche Mindestwirkung und Entsiegelungsplan je bestätigender Studie vorab freigeben.
4. Vollständigen Quellen-/Berechnungs-/Studienaudit durchführen und anschließend Art-/Regelzertifizierung separat entscheiden.
5. Produktfreigabe bleibt unabhängig davon offen. Dieser Auftrag enthält keine Frontend-Anbindung und keine öffentliche Aktivierung.
