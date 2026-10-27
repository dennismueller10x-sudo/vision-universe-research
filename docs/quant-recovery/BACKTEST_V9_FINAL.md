# V9 – Abschluss

**V9_METHODS_ACCEPTED_WITH_LIMITED_SCOPE.** Technisch implementiert **13/13**. Im definierten Scope abgenommen **7/13**, davon **7/7 Erweiterungsmethoden**. Offiziell zertifizierte Backtest-Arten **0/6**. `productionApproved=false`, keine Produktaktivierung, kein Merge.

Der Status bedeutet: Alle sieben Erweiterungsmethoden sind methodisch in einem ausdrücklich begrenzten Geltungsbereich abgenommen. Er bedeutet **nicht**, dass eine Handelsregel, eine Strategie oder ein Produkt zertifiziert wäre. Die sechs Backtest-Arten bleiben PARTIAL; ihre Blocker sind überwiegend vorwärts zu sammelnde Historie, die keine Rückrechnung ersetzen kann.

## Ausgangsbasis

Entwicklungsbasis ist Main `e490982f2b` (nach dem Brief-Referenzpunkt `99116ae8` weiterentwickelt). Alle 88 hashgesicherten V8-Pfade und alle 57 Research-Abhängigkeiten sind dort unverändert; die Wochenqualifikation reproduziert exakt 4.449/6.190 ([Baseline](v9/baseline-1.0.0.json)). V9 ändert **keine** Engine, keine Produktionsdaten, keinen Workflow, kein Frontend und keinen aktiven Vertrag. Alle Ergebnisse liegen als eigene Skripte unter `scripts/quant/v9/` und Belege unter `docs/quant-recovery/v9/`.

Die wichtigste Erschließung: **SEC EDGAR ist aus der Arbeitsumgebung direkt erreichbar** (bestehender Fair-Access-Client, ≤ 2 Anfragen/s je Strang). Damit wurden Originalquellen statt neuer Anbieter genutzt. Die privaten Actions-Caches/R2 waren nicht nötig; ihr Zugangsweg (manuelle Jobs in `quant-ci.yml`) bleibt dokumentiert und unverändert.

## Kennzahlen

| # | Kennzahl | V9 |
|---|---|---|
| 1 | Technisch implementierte Bereiche | 13/13 |
| 2 | Im definierten Scope abgenommen | 7/13 (V8: 4/13) |
| 3 | Erweiterungsmethoden | 7/7 (neu: Parameter-Sensitivität, Event-Driven, Portfolio-Rebalancing-Buchführung) |
| 4 | Zertifizierte Backtest-Arten | 0/6 |
| 5 | Neu qualifizierte historische Listings (aktiv im Adapter) | **0**; quellenbelegt vorbereitet: +116 Identitätsbindungen und +81 CA-Auflösungen (Trockenlauf, nicht aktiviert) |
| 6 | Reparierte Identitätsfälle | 5 quellenbelegte Korrekturen vorbereitet (COHR, BGC, DCOM, SGI, TRAK – Tickerwiedervergabe); nicht in den Adapter übernommen (Produktpfad) |
| 7 | Reparierte CA-/TR-Fälle | 1 echter Anbieterfehler belegt (PZZA, unbereinigter 2:1-Split 2013) + 4 belegte Ausschüttungen; Reparatur benötigt den Reihen-Erzeuger |
| 8 | Neu qualifizierte SEC-/PIT-Vintages | 60 Originalakzessionen, 1.105/1.105 Wertparitäten, 10/10 Restatement-Paare; 904 Vor-Periodenende-Fälle klassifiziert; FY 43830 aufgeklärt |
| 9 | Realstudien | Sensitivität P1 1.000 / P2 3.255 Listings 2000–2025; 11.888 8-K-Ereignisse aus 2.730 Listings; drei Dividenden-Ledger + ein Terminal-Ledger |
| 10 | Unabhängige Nachweise | Python-Paritäten: 1.420.112 (Sensitivität), 732.449 (Events), 22/22 Ledger, 180/180 + 7/7 Identität, 1.391 CA-Entscheidungen, SEC/PIT vollständig – Rechenparität, kein Holdout |
| 11–15 | Datenlücken, Zugänge, Normfragen, Tests, PR | siehe [Datenrettung](BACKTEST_V9_DATA_RECOVERY.md), [Validierung](BACKTEST_V9_VALIDATION.md) |

## Was sich fachlich verändert hat

- **Parameter-Sensitivität** – abgenommen für den Primärendpunkt auf zwei vorab registrierten, breiten Populationen. Die V8-Lücke (Stationarität/Blocklänge ungeprüft, nur Survivor-Trio) ist mit vorregistrierten Diagnosen geschlossen. Die Benchmark-Überschussrendite zeigt **keinen** Vorteil und ist instationär – ausdrücklich aus dem Scope ausgeschlossen. [Methoden](BACKTEST_V9_METHOD_VALIDATION.md).
- **Event-Driven** – von 12 auf 11.888 originale Ereignisse; registrierte Positivkontrolle (erhöhte Absolutreaktion am Folgetag) nachgewiesen; die Ankündigungsreaktion liegt überwiegend **vor** dem frühesten zulässigen Einstieg. Eine prospektive Bestätigungskohorte ist registriert und ab 2027-04-29 auswertbar.
- **Portfolio-Rebalancing** – Buchführung läuft mit realen SEC-belegten Zahlungstagen, Splits, einem Bar- und einem Aktien-Terminalereignis. Ex-Tag-Cash bleibt verboten; der Schutz greift nachweislich.
- **SEC/PIT** – beide offenen V8-Anomalien sind Filerfehler im Original-XBRL, die die Pipeline ungeschützt übernimmt; sie erreichen veröffentlichte Werte (u. a. STX Marktkapitalisierung 137,0 statt 146,0 Mrd., ASLE ca. +11 %). Korrekturen P1–P4 vorgeschlagen, nicht umgesetzt.
- **Identität und CA** – die vier „inaktiven Terminalfälle“ sind keine Terminalfälle, sondern Fehlbindungen durch Tickerwiedervergabe. Neue Befunde: 96 qualifizierte Reihen mit eingefrorenem Schlusskurs-Ende (z. B. CHL), nachlaufende Wiederholungsschlüsse nach dem letzten Handelstag.

## Offene Entscheidungen für den Owner

1. **Setup-Unabhängigkeit** ([Empfehlung](v9/setup-decision-recommendation-1.0.0.json)): ISO-Wochenzähler (Vertrag 1.1.0) statt Monatszähler. Verschiebt den frühesten möglichen Zertifizierungszeitpunkt um über ein Jahr. Nicht genehmigt, nicht aktiviert.
2. **Folge-PRs mit Vorher/Nachher** (je eigene Produktwelt): SEC-Pipeline P1–P4; Adapter-Integration der Identitäts-Registry (zunächst die fünf Dossierfälle) und der CA-Registry; Stale-Tail-/Delisting-Prüfung; PZZA-Neubau durch den Erzeuger; Ledger-Erweiterungen (Spin-off, ADS, Informations- vs. Anspruchszeit).
3. **Abnahme-Lesart Portfolio**: V9 zählt die Buchführungsmechanik als abgenommen; der Strang selbst empfahl die engere Lesart „Methode insgesamt PARTIAL“. Bei engerer Lesart: 6/7 bzw. 6/13.

[Evidenzmatrix](BACKTEST_V9_EVIDENCE_MATRIX.md) · [Datenrettung](BACKTEST_V9_DATA_RECOVERY.md) · [Methoden](BACKTEST_V9_METHOD_VALIDATION.md) · [Realstudien](BACKTEST_V9_REAL_STUDIES.md) · [Validierung](BACKTEST_V9_VALIDATION.md) · [Manifest](v9/artifact-manifest-1.0.0.json)
