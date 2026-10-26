# V7 – Validierung

Node v22.23.4. [Suitebericht](v7/validation.json), [vollständige Produktionsdaten-Isolation](v7/isolation.json), [unabhängige Realrechnungen](v7/independent-validation.json), [Wiederholung und Scopeprüfungen](v7/scope-validation.json). Baselinebezug im V6-Runner enthält dessen historische feste baseMain-Konstante; tatsächlicher V7-Stand wird durch gitHead und neue Quelldependenzhashes belegt, nicht durch diese alte Konstante.

- quant: PASS, 3059 bestanden
- core: PASS, 239 bestanden
- sec-python: PASS
- sec-pit-python: PASS
- consumers: PASS, 66 bestanden
- real-NVDA-1Y-determinism: PASS
- real-NVDA-1Y-python: PASS
- real-NVDA-3Y-determinism: PASS
- real-NVDA-3Y-python: PASS
- real-NVDA-5Y-determinism: PASS
- real-NVDA-5Y-python: PASS
- real-NVDA-10Y-determinism: PASS
- real-NVDA-10Y-python: PASS
- real-NVDA-MAX-determinism: PASS
- real-NVDA-MAX-python: PASS
- mc-TRADE_IID-source: PASS
- mc-TRADE_IID-python: PASS
- mc-CIRCULAR_BLOCK-source: PASS
- mc-CIRCULAR_BLOCK-python: PASS
- blocked-ref_AAPL: PASS
- blocked-ref_BGC: PASS
- blocked-ref_AAAC: PASS
- blocked-ref_AACT: PASS
- young-ARM-1Y: PASS
- young-ARM-3Y: PASS
- young-ARM-5Y: PASS
- young-ARM-10Y: PASS
- young-ARM-MAX: PASS

Isolation: 275/275 Testdateien, 23 Teilmengen, originale 900-Sekunden-Kindgrenze, Zustand PASS. Kein laufender/abgebrochener Check als bestanden gezählt.

Unabhängiges Python: 40 reale Prüfgruppen, Signaldefinitionen/Datumsauswahl, Nettooutcomes, Drawdown/Benchmark, Portfolio-Cash/Stückzahlen über alle Zeitpunkte, WF-Intervalle und OOS-Aggregation sowie sämtliche MC-Pfade/Verteilungen. Zusätzlich V6-Studienreferenz 526 Vergleiche/25 Fixture-Signalereignisse und vier Decimal-Portfoliofälle. Fixturebelege sind separat und keine Realstudien.

MC: 16 reale Szenariokonfigurationen, IID bzw. Circular Blocks 4/13/26, zwei Seeds, 1.000/10.000 Simulationen. Acht Seedpaare liegen innerhalb der bedingten per-Metrik-DKW-Vergleichsschranke. [Diagnostik](v7/monte-carlo-diagnostics.json.gz) enthält ACF, lediglich diagnostische Mean-ESS, quantilbezogene Unsicherheiten, Endkapital, Drawdown und Verlustserien. DKW-Epsilon fällt von ca. 0,04295 auf 0,01358. Keine gemeinsame Familienfehlerzusage über alle Vergleiche; äußerste Quantilbänder können unbeschränkt bleiben. IID-Austauschbarkeit/Stationarität werden nicht als empirisch bewiesen bezeichnet. Simulationserror ist nicht Marktmodellunsicherheit.

Alle gespeicherten Resultate wurden exakt wiederholt; zusätzlich bekannte Historie als Holdout sowie unzulässige TR-/CA-/Terminal-/Profilverwendung im Preisportfoliomodus abgewiesen. Die Rechenparität beweist keine unabhängige Vorhersagekraft. Keine Daten-/Formeländerung, um einen positiven Effekt zu erzwingen.

Geänderte Bereiche: zwei Research-Engines, Offline-Skripte, Research-Tests und quant-recovery-Dokumentation. Keine Produktionsdaten, keine UI-/Frontend-/Navigation-/Schedulerdatei geändert. Keine Tiingo-/Marketstack-Abfrage, 22 begrenzte SEC-HTTP-Zugriffe einschließlich Entwicklungsproben; kein Deployment, keine neue Preview, keine Aktivierung.

SEC-Original-PoC: acht Accessions, 23/23 originale Faktenparitäten, Original-Acceptance-Gegenprobe für einen NVDA-Accession. Erneute Offlineauswertung aller acht lokal wiedergewonnenen XML-Dateien identisch, null Netzrequests. Die aktiven Consumerdateien bleiben unverändert. SEC-Python **554**, SEC/PIT **32**, abschließende Research-Teilmenge **116/116**, Core **239/239**, Consumer **66/66** bestanden. [Zusätzliche Abschlusschecks](v7/final-checks.json).
