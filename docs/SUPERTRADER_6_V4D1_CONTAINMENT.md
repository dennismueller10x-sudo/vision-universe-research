# Supertrader 6.0 – V4-D1: Eingrenzung nicht deklarierter Kurssprünge in der Research-Pipeline

Stand: 23. Oktober 2026. Ergebnis von `DIAGNOSTIC_NOT_CERTIFIED`, ohne Datenkorrektur. Code: [`integrity/discontinuity.mjs`](../scripts/supertrader/source-faithful/integrity/discontinuity.mjs) und [`research/run-sf6-integrity.mjs`](../scripts/supertrader/source-faithful/research/run-sf6-integrity.mjs). Workflow-Modus `sf6-integrity`.

## Ausgangslage

Supertrader hat V4-D1 seit #705 als offenen Zertifizierungsblocker geerbt: In einem kleinen Teil der Kursdaten fehlen Split-Faktoren für (Reverse-)Splits.
- Drei Quant-Protokolle versuchten, das in der Datenschicht zu korrigieren: #721/#722, #737 und #758. Alle endeten mit `NOT_READY`, denn mit freien Quellen sind Fehlalarme und echte Kursbewegungen nicht trennbar.
- #763 zeigte für die alten Turnier-Methoden: Die belegten Fehler bewegen die Ergebnisse nicht.
- Für die buchgetreuen Lifecycles aus Supertrader 2.0 bis 5.0 war bisher nicht gemessen, wie stark sie betroffen sind.

## Vorgehen

Diese Arbeit **korrigiert keine Kurse** und behauptet für keine einzelne Sitzung einen Fehler. Sie markiert eine **Obermenge verdächtiger Sitzungen** und misst, wie stark jede Referenz davon abhängt.

1. **Markierung (kausal):** Eine Sitzung wird markiert, wenn ihr Gesamtrendite-Relativ auf den bereinigten Kursen bei ≥ k oder ≤ 1/k liegt. Ein konsistent erklärter Split ergibt etwa 1 und wird daher nicht markiert. Die Markierung von Sitzung i nutzt nur die Balken i−1 und i.
   - **k = 5** stammt aus #722 (core 1.2.0). Dort wurde der Wert nach dem 1.1.0-Datenaudit nachträglich gesetzt; kein Strategieergebnis floss ein. #722 kombiniert ihn zusätzlich mit Verhältnis- und Volumenbedingungen. Hier wird nur die nackte Schwelle verwendet, also eine weitere Obermenge.
   - **k = 3** ist die Auswahlschranke aus #758 und dient als Sensitivität.
   - Nicht erklärte 2:1-Splits erfasst keine der beiden Schwellen. Die Eingrenzung ist daher konstruktionsbedingt unvollständig.
2. **Quarantäne:** Jedes Wertpapier wird an jeder markierten Sitzung geschnitten.
   - Die bereinigten Balken werden nur zerschnitten, nie neu bereinigt. Alle Kursniveaus außerhalb einer Markierung bleiben identisch mit BASE.
   - Das spätere Stück braucht seinen eigenen Vorlauf. Kein Indikator, Setup oder Stop reicht über den Sprung zurück.
   - Kürzere Stücke als 30 Balken fallen weg.
   - Ein Delisting bleibt ein Delisting.
3. **Zwei vorregistrierte Behandlungen des markierten Tages:** Sie klammern die unbekannte Wahrheit ein, nämlich ob es ein Fehler oder eine echte Bewegung war.
   - `DQ-K5-BOOK` (primär): Eine über den Sprung gehaltene Position wird zum Kurs des Tages abgerechnet, so wie in BASE.
   - `DQ-K5-PRIOR`: Die Abrechnung erfolgt zum Vortagesschluss. Damit wird ein falscher Sprung entfernt, ein echter Absturz aber ebenfalls.
4. **Alle 11 messbaren Referenzen laufen unverändert** auf BASE, DQ-K5-BOOK, DQ-K5-PRIOR und DQ-K3-BOOK. Danach folgt ein trade-genauer Abgleich.

## Maßgeblicher Lauf

[40001276389](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40001276389), Commit `0592cfbf3`, Snapshot `sts1-134d…`, Datensatz `EXACT`. Die Kennzahlen liegen versiegelt beim Eigentümer.
- **BASE reproduziert alle 11 maßgeblichen Referenzen** in der Tradezahl: Turtle 820/559 (`CURRENT_ENGINE` 39397517900), Minervini 954/1.007 (39746264325) und die sieben sf5-Referenzen (39937731507).
- Alle Läufe sind abgestimmt (Ledger-Replay).

### Zensus der markierten Sitzungen

| | DQ-K5 | DQ-K3 |
|---|---|---|
| markierte Sitzungen | 1.210 | 2.521 |
| betroffene Wertpapiere (von 9.211 Segmenten) | 454 | 1.001 |
| davon Rohkurs am Vortag < 1 $ / 1–5 $ / ≥ 5 $ | 867 / 166 / 177 | 1.556 / 516 / 449 |
| im Research-Universum am Vortag (≥ 5 $, ≥ 1 Mio. $ Umsatz) | 109 | 278 |
| aufwärts / abwärts | 585 / 625 | 1.287 / 1.234 |
| Residuum eines erklärten Splits (falscher Tag oder falsches Verhältnis) | 14 | 30 |
| Umkehr am Folgetag (nur beschreibend, ex post) | 190 | 295 |

**Jahre (DQ-K5):**
- 2015: 115, 2016: 35, 2017: 121, 2018: 207, 2019: 121, 2020: 103
- 2021: 72, 2022: 75, 2023: 60, 2024: 81, 2025: 104, 2026: 116

Die markierten Sitzungen liegen überwiegend bei Pennystocks außerhalb des Research-Universums. Das deckt sich mit #763.

### Exposition der Referenzen

**Direkt exponiert** heißt: Eine markierte Sitzung liegt im Rückblick von 400 Kalendertagen vor dem Einstieg oder in der Haltedauer. **Über den Sprung gehalten** heißt: Die markierte Sitzung liegt zwischen Einstieg und Ausstieg.

| Referenz | Trades BASE | direkt exponiert DQ-K5 | über den Sprung gehalten | direkt exponiert DQ-K3 |
|---|---|---|---|---|
| Turtle S1 | 820 | 15 (1,83 %) | 2 | 40 (4,88 %) |
| Turtle S2 | 559 | 11 (1,97 %) | 1 | 28 (5,01 %) |
| Minervini SEPA | 954 | 0 (0,00 %) | 0 | 0 |
| Minervini Power Play | 1.007 | 10 (0,99 %) | 1 | 39 (3,87 %) |
| Darvas | 19.556 | 20 (0,10 %) | 0 | 34 (0,17 %) |
| Kullamägi Breakout | 9.114 | 31 (0,34 %) | 3 | 113 (1,24 %) |
| Pocket Pivot | 1.872 | 7 (0,37 %) | 2 | 18 (0,96 %) |
| Buyable Gap-Up | 3.415 | 15 (0,44 %) | 1 | 68 (1,99 %) |
| Weinstein Investor | 1.348 | 0 (0,00 %) | 0 | 5 (0,37 %) |
| Weinstein Trader | 1.808 | 4 (0,22 %) | 2 | 9 (0,50 %) |
| Holy Grail (W-RAS97) | 4.025 | 30 (0,75 %) | 3 | 103 (2,56 %) |

Das vorab festgelegte Kriterium CC-5 lautet: höchstens 1 % direkt exponiert unter DQ-K5.
- **Erfüllt:** neun Referenzen.
- **Nicht erfüllt:** Turtle S1 und S2, bei 1,8 % bzw. 2,0 %.
- Auch dort wurden nur 1 bis 2 Trades tatsächlich über einen Sprung gehalten. Die Exposition entsteht fast nur über den Rückblick der Kanäle.

### Pfadabhängigkeit (Nebenbefund)

Die Quarantäne entfernt nur wenige direkt exponierte Trades. Trotzdem ändert sich in den Portfolioläufen ein großer Teil der übrigen Trades:
- Unverändert unter DQ-K5-BOOK bleiben bei Minervini SEPA 94 % und bei Darvas 92 %.
- Bei Kullamägi sind es 31 %, bei Turtle S1 16 %, bei Pocket Pivot 10 % und bei Holy Grail 9 %.

Ursache ist Knock-on: Ein entfallener oder neuer Trade verschiebt Kapital und belegte Positionsplätze, und daraus folgen alle späteren Füllungen. Bei Minervini Power Play ändert sich zusätzlich die Querschnitts-Population des RS-Perzentils.

Daraus folgt: **Die einzelnen Trades der kapazitätsgebundenen Modellstudien sind gegenüber kleinen Eingabeänderungen nicht stabil.** Belastbar sind nur Verteilungsaussagen. Die versiegelten Kennzahlen von BASE und DQ erlauben den Vergleich auf Kennzahlebene.

## Antwort auf die Frage des Auftrags

- **Gelöst ist V4-D1 nicht.** Eine Korrektur der Daten wäre ohne zweite lizenzierte Corporate-Action-Quelle nicht belegbar; drei Quant-Protokolle sind daran gescheitert.
- **Eindeutig eingegrenzt ist V4-D1:**
  - 1.210 Sitzungen in 454 Wertpapieren, zu 72 % unter 1 $.
  - Exposition der Referenzen 0–2 %.
  - Über den Sprung gehaltene Trades: höchstens 3 je Referenz.
  - Eine Quarantäne-Sensitivität in zwei Lesarten läuft jetzt für jede Referenz mit.
- **Nicht abgedeckt:**
  - nicht erklärte 2:1-Splits;
  - ebenso nicht erklärte 3:1- bis 5:1-Splits in der K5-Lesart;
  - reine Niveaufehler ohne Sprung.

Voraussetzungen für eine Entsperrung:
- eine zweite, lizenzierte Corporate-Action-Quelle mit Historie, also eine Eigentümerentscheidung zu einem kostenpflichtigen Anbieter, oder
- eine Eigentümerentscheidung, die DQ-K5-BOOK als Research-Konvention für zertifizierungsfähige Messungen annimmt, mit DQ-K3 und DQ-K5-PRIOR als Pflicht-Sensitivitäten.
