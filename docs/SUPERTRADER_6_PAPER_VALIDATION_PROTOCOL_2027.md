# Supertrader 6.0 – prospektives Paper-Validierungsprotokoll SF6-PAPER-2027

Stand: 24. Oktober 2026, Eigentümerentscheidung E2. Protokoll `SF6-PAPER-2027` 1.0.0 in `scripts/supertrader/source-faithful/completion/sf6-paper-protocol-2027.mjs`. Der Fingerabdruck `c90c30bcf018…` ist in `scripts/supertrader/tests/sf-sf6-readiness.test.mjs` gepinnt.

**Status: `PREPARED_NOT_ACTIVE`.** Das Protokoll ist vorbereitet, aber nicht aktiviert.
- Supertrader 6.0 legt keinen Scheduler, keinen Workflow und keinen Aufzeichnungsjob an. Ein Test prüft, dass kein Workflow das Protokoll referenziert.
- Es gibt keine Orders und keinen Broker. Kein Signal erscheint auf einer Produktseite. Alle Strategien bleiben `LIVE_NOT_APPROVED`.
- Die Aufzeichnung beginnt erst nach einer gesonderten, ausdrücklichen Freigabe des Eigentümers in einem eigenen PR. Dieser PR regelt den Aufzeichnungs-Workflow, die Ablage und die Aufbewahrung.

## Warum ein prospektives Fenster

Alle historischen Zeiträume sind verbraucht:
- **2016–2026** ist der Entwicklungszeitraum.
- **2008–2015** wurde in R14 einmal geöffnet und ist survivorship-belastet (siehe [SUPERTRADER_6_VALIDATION_AND_HOLDOUT.md](SUPERTRADER_6_VALIDATION_AND_HOLDOUT.md)).

Keiner dieser Zeiträume wird rückwirkend als unberührter Holdout bezeichnet. Unberührt sind nur Sitzungen, die noch nicht stattgefunden haben. Das Protokoll wird festgeschrieben, bevor das Fenster beginnt.

## Festlegungen

| Punkt | Festlegung |
|---|---|
| Fenster | ab **01.01.2027** |
| Mindestdauer | 250 Sitzungen; frühestens danach ausgewertet (etwa 31.12.2027) |
| Zwischenstände | nur Zählungen; keine Kennzahl wird geöffnet und keine Entscheidung getroffen |
| Referenzen | die 11 Snapshot-Referenzen von 6.0, unverändert: Turtle S1/S2 (BASE_S0), Minervini SEPA und Power Play, Darvas, Kullamägi Breakout, Pocket Pivot, BGU, Weinstein Investor/Trader, Holy Grail W-RAS97 |
| Fingerabdrücke | Turtle-Engine `ae2a51ed86ae…`, Minervini-Code `b1d81fb8…`, Minervini-Varianten `f13ea350…`, sf5-Varianten `0a1260e9…`; Abrechnung `research-v1` |
| nicht enthalten | SF6-Modellvarianten (E3), Episodic Pivot / Parabolic Short (bräuchten neue Intraday-Abrufe, E5), SIC-Korrelationsgruppen (E4) |
| Daten | die bestehende tägliche Kurspipeline; kein neuer Anbieter, keine neuen Kosten |
| Einfrieren | über den bestehenden Capture-/Restore-Pfad als Research-Snapshot-Generationen. Vor der Aktivierung braucht es eine Entscheidung zur Aufbewahrung, weil von 3 Generationen 2 belegt sind. |
| PIT | Entscheidungen der Sitzung t nutzen nur Daten bis zum Schluss von t. Kapitalmaßnahmen gehen nur so ein, wie sie zu t bekannt waren. |
| Aufzeichnung | Nach jedem Schluss werden Setups, die für die nächste Sitzung vorgemerkten Orders und die offenen Positionen je Referenz erfasst. Das Protokoll ist hash-verkettet und versiegelt. Es wird vor der nächsten Eröffnung geschrieben und nie überschrieben; eine Korrektur ist ein neuer Eintrag. |
| Prüfungen | **FORWARD_LOG_EQUALS_BATCH_REPLAY**: Ein Batch-Lauf auf dem eingefrorenen Forward-Snapshot reproduziert das Protokoll. **NO_MISSING_SESSIONS**: Jede Sitzung ist erfasst. **RESEARCH_V1_RECONCILED**: Ledger-Replay je Referenz. **V4D1_FORWARD_CENSUS**: Diagnose mit dem SF6-Detektor. |
| Auswertung | Die Kennzahlen bleiben versiegelt. Verglichen wird mit den Verteilungen der DEV- und Holdout-Läufe, auf Ebene von Kennzahlen und Verteilungen (E6). |
| CC-8 | CC-8 ist belegt, wenn das Fenster die Mindestdauer erreicht hat und alle Prüfungen bestanden sind. Performance ist nie Teil von CC-8. |
| kein Tuning | Während des Fensters ändern sich keine Parameter, kein Universum, keine Kosten und keine Policy. |

Jede Änderung an einer Referenz, an ihrem Code oder an diesem Protokoll nach dem 01.01.2027 macht das Fenster ungültig. Es startet dann mit einer neuen Protokollversion neu, nie durch stille Bearbeitung.

## Verhältnis zur Readiness-Matrix

Die Kriterien 1.2.0 werten CC-8 nur aus Belegen dieses Protokolls aus. Dabei muss der Fingerabdruck des Protokolls übereinstimmen; Belege unter einer anderen Version zählen nicht. Bis zur Auswertung ist CC-8 für alle 13 Strategien nicht erfüllt.
