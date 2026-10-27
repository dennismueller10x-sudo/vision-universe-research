# Quant V6 – Research- und Backtest-Implementierung

**Gesamtstatus: V6_IMPLEMENTED_WITH_EVIDENCE_GAPS.** Neue Offline-Berechnungen und Prüfmechanik für alle 13 Bereiche sind implementiert. Dies bedeutet weder 13 methodisch freigegebene historische Studien noch sechs zertifizierte Produktarten. Die aktive Zertifizierung bleibt unverändert **0/6 CERTIFIED**; alle neuen Ergebnisse tragen `NOT_CERTIFIED`, `productionApproved=false`.

Ausgangsbasis dieses Auftrags: tatsächlicher Main `675eeb97f2fbe924a991d32fa72387502ded67c5`, nach der gesicherten Übergabe `11ec4ef7ecfdbe8f6287224f454c47c500edc403`. Entwicklungsbranch: `codex/quant-v6-research-engine`. Kein automatischer Merge und keine Produktaktivierung.

## Implementierte Funktionalität

| Bereich | Tatsächlicher neuer Berechnungsumfang |
|---|---|
| Same Stock Replay | Bestehende deskriptive Ansicht unverändert; zusätzliche fixierte Pattern-Regel, Episode/Cooldown, verzögerter Entry, zeitgebundener Ausgang, Kosten und Benchmark als getrennte Ereignisstudie |
| Pattern Evidence | Bestehende Feature-/Pattern-Erkennung wiederverwendet; historische Fälle und zeitgleiche Kontrollen, fehlende Grundgesamtheit sichtbar, Überlappungs-/Verfügbarkeitsprüfung, Vergleichsstatistik |
| Signal Backtest | Alle fünf unveränderten Signaldefinitionen mit Ereignissen, Kosten, zeitgleichen Base Rates, Benchmarks und einzelnen Regelbefunden; weiterhin keine automatische Short-Interpretation negativer Signale |
| Setup Backtest | Bestehendes Setup-Mapping auf übergebenen historischen Eingaben; deduplizierte Setupereignisse; vorab definierte Entry-Verzögerungen sowie Zeit-, Invalidierungs- und Zielschluss-Exitvarianten |
| Strategy Backtest | Vorhandene Profilauswahl mit strengem neuem Buchführungsvertrag: PIT-Membership/Faktoren, Zielgewichte nach Kosten, Cash, Rechte auf Dividenden, belegte terminale Cash-/Aktienereignisse |
| Factor Ranking | Erst historisch zulässigen Querschnitt ranken, dann Forward-Outcomes messen; fehlende Outcomes behalten Rang und Nenner; Buckets, Rangkorrelation und paarweise Faktorabhängigkeit |
| Monte Carlo | Getrenntes Trade-IID und Circular-Block-Bootstrap; Seeds, alternative Kapitalpfade, Risikoverteilungen, bedingte Simulationsunsicherheit, Budgets und Hashes |
| Walk-Forward | Rollierende/expandierende Lern-, Validierungs- und Testfenster; Intervall-Purging, Embargo, Labelreife und registrierte Fit-/Auswahl-/Ausführungskette |
| Out-of-Sample | Expositionsledger, registrierte Holdouts, Bindung von Regel/Methode/Universum/Datendefinition, einmaliger Verbrauch, privater atomarer Registry-Store |
| Marktregime | Zusätzliche Trend-/Volatilitäts-/Stressklassifikation und Zustandsauswertung, ausdrücklich PIT-verfügbar oder ex post; keine Ersetzung der aktiven Produkt-Breadth-Regimehistorie |
| Sensitivität | Registriertes Parameter-/Kosten-/Entry-/Haltedauerraster, Auswertungsbindung, nominale Unsicherheit, Holm-p-Werte und Nachbarschaftsstabilität; kein Gewinnerparameter aus dem Holdout |
| Event-Driven | Unveränderliche Ereignisidentität, Publikations-/Verfügbarkeitszeit und Revision, nachfolgende explizite Session, Listing- und Outcomeprüfung |
| Portfolio-Rebalancing | Intervall-/Driftkalender, Zielgewichte, Turnover, Kosten, Cash, Corporate Actions, belegte Delisting-Endwerte und gleiche Benchmarkzeitachse |

Die ersten sechs Zeilen beschreiben neue Backend-Berechnungen mit bewusst begrenztem Scope. Eine Ereignisstudie ist keine finanzierte Portfolioausführung. Die bestehende finanzierte NEW_52W_HIGH-Wochenrechnung bleibt die unveränderte technische Referenz; die neue Portfoliobuchführung ist ein eigener versionierter Vertrag für Rohkurse und explizite Kapitalmaßnahmen.

Die Ergänzung der Buchführung war erforderlich: Legacy-Pfade können unbekannte terminale Fälle zum letzten Kurs/Null ausbuchen und die bisherige Quintilauswertung kann fehlende spätere Kurse vor dem Ranking entfernen. V6 umgeht diese fachlich unzulässigen Fallbacks in seinen neuen Einstiegspunkten, ohne historische Legacy-Ergebnisse still umzuschreiben. Alte Einstiegspunkte werden dadurch nicht zertifiziert.

## Gemeinsame Infrastruktur und Verwendung

`quant/engines/research-*.cjs` sind Node-Module für Offline-Research. Sie lesen keine Provider, aktivieren keine Produktregistry und liefern keinen HTTP-Endpunkt. `run-research.cjs` stellt alle 13 Bereiche als Offline-CLI bereit; vollständige APIs und Eingabegrenzen stehen in [studies.md](v6/studies.md), [portfolio.md](v6/portfolio.md), [validation-methods.md](v6/validation-methods.md) und [Monte Carlo](BACKTEST_V6_MONTE_CARLO.md).

```sh
node scripts/quant/run-research.cjs --help
node scripts/quant/run-research.cjs --method signal --input /private/registered-signal-input.json --out /private/quant-v6-results
node scripts/quant/validate-research-v6.cjs --out /private/quant-v6-validation
```

`node` muss Node 22 bezeichnen. Exakte Hash-Reproduktion erfordert zusätzlich die tatsächlich aufgezeichnete Binärdatei, V8, Plattform, Architektur und glibc. Ein anderer Runtime-Stand ist ein neuer Berechnungskontext, kein toleranter Hash-Pass.

Die CLI `walk-forward` erzeugt die Partition; vollständige Fit-/Auswahl-/Testausführung bietet `research-validation.runWalkForward`. Die CLI `regime` wertet Regimebeobachtungen aus; die zusätzliche Klassifikation bietet `research-studies.classifyRegimes`. OOS-Aggregation ist vom Registry-Verbrauch getrennt. Für VU-Studien `research-exposure.openVisionUniverseHoldoutStore` verwenden: Dieser Einstieg registriert die bereits veröffentlichte Signalhistorie automatisch als betrachtet. Ein leeres generisches Ledger beweist keine Unabhängigkeit.

Die Sensitivitäts-CLI liest registrierte, bereits berechnete Rasterwerte. Ihre Registrierung bindet `hash(recordedSensitivityEvaluator(new Map()).toString())` aus `run-research.cjs`. Die Herkunft des ursprünglichen statistischen Evaluators bleibt zusätzlich zu prüfen; die CLI rechnet die ursprüngliche Studie nicht aus ihren Rasterwerten nach. Für direkte Ausführung eigener geprüfter Evaluatoren steht `research-validation.runSensitivity` bereit.

Neue Generationen liegen ausschließlich außerhalb des Repositorys. Sie sind mit Writer-Lock, unveränderlichen Inhaltsdateien, atomarem Pointer, Parent-Vergleich, Hashprüfung und geprüftem Rollback gesichert. Dieser Store ist absichtlich nicht das Schema des produktnahen V5.1-Lesedienstes. Bestehende Reader/Modelle/Ergebnisse bleiben unverändert; neue Forschungsdaten werden dort nicht automatisch sichtbar.

## Methodische Grenzen und nächste Abnahmen

Die [Zertifizierungsmatrix](BACKTEST_V6_CERTIFICATION_MATRIX.md) trennt Implementierung, Datenfähigkeit, methodische Abnahme, unabhängige Evidenz und wirtschaftlichen Vorteil. Die [Datenlücken](BACKTEST_V6_DATA_GAPS.md) benennen tatsächliche Bestände, Bezugsoptionen und bestehende Rechte. [Methodikvorschläge](v6/methodology-proposal.json) sind ausdrücklich nicht aktiv.

Keine pauschale fünfjährige Wartezeit wurde eingeführt. Geeignete historische Daten werden maximal genutzt. Bereits bekannte Ergebnisse werden nicht zum neuen Holdout. Prospektive Beobachtung ist nur erforderlich, wenn geeignete historische Eingaben oder tatsächlich unabhängige Bestätigung fehlen; ein offener M6-Horizont bleibt offen.

Bis zur vollständigen fachlichen Abnahme verbleiben insbesondere:

1. Vollständige historische US-Listingpopulation samt zeitlicher Klassifikation, Wiedervergaben und terminalen Werten beschaffen/prüfen; indexbezogene Studien zusätzlich mit damaliger Indexmitgliedschaft.
2. Corporate-Action-/Dividenden-/TR-Lücken, historische Fundamentaldatenvintages und geeignete Benchmarkdaten schließen; vorhandene Rechte je zusätzlicher Nutzung bestätigen. Kein Kauf ausgelöst.
3. Historische Setup-/Membership-/Faktor-/Regimearchive qualifizieren. Rekonstruktionen bleiben von damals veröffentlichten Originalsnapshots getrennt.
4. Vorregistrierte bestätigende Studien nach unabhängigem Design durchführen. Python-Rechenparität ist keine unabhängige Vorhersageevidenz.
5. Coverage-, Cluster-, Power- und wirtschaftliche Mindestwirkungsvorschläge fachlich ratifizieren; Setup-Wochen/Monate-Abweichung ausdrücklich entscheiden. Bestehende strengere Gates bleiben erhalten.
6. Quellen-/Rechteaudit und unabhängige Studienprüfung je Version abschließen; anschließend gesonderte Zertifizierungsentscheidung. Produktfreigabe und Frontend-Anbindung sind eigene spätere Aufträge.

Keine Frontend-, Navigations-, Theme-, Chart-, Layout-, anderen Produktwelt- oder Produktionsscheduleränderungen. Keine neue Vorschau, kein öffentlicher Backtest-Endpunkt, keine automatische Zertifizierung und kein Merge.
