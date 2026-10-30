# Screener-Felder AP8 L5: Ausbruchsrichtung bestätigter Formationen

**Fachmodell, Owner-Freigabe nötig.** Teil von S2 der Strategie-Vorlagen ([STRATEGY_TEMPLATES_PLAN.md](STRATEGY_TEMPLATES_PLAN.md)).
- Owner-Auflage vom 30.10.: „Bestätigter Dreiecksausbruch“ darf erst produktiv werden, wenn die Ausbruchsrichtung korrekt gefiltert oder eindeutig dargestellt wird.
- S1 liest die Richtung dafür aus der Spalte `formations`. Mit L5 wird sie ein Abfragefeld, das der Screener-Baukasten und die Suche in Worten kennen.

Versionen: `technical-screen-row-1.12.0`, `technical-query-1.12.0`, `technical-query-text-1.9.0`.

## 1. Felder (nur Tag)

| Feld | Typ | Definition |
|---|---|---|
| `formationConfirmedUp` | Liste von Formationstypen | bestätigte Formationen (wie `formationConfirmed`) mit Ausbruch **nach oben** |
| `formationConfirmedDown` | Liste von Formationstypen | bestätigte Formationen mit Ausbruch **nach unten** |

- **Quelle:** dieselbe Formationserkennung wie `formationConfirmed` (`formations.js`), aufgeteilt nach `breakout.direction`.
  - Es wird nichts neu erkannt. Die Richtung ist dieselbe, die schon in der Spalte `formations` (Feld 5) und im Chart steht.
- **Jede bestätigte Formation** steht in genau einer der beiden Listen, nie ohne Bestätigung (Test über das ganze Universum).
  - Kann ein Typ bei einem Titel zweimal bestätigt sein (einmal nach oben, einmal nach unten), steht er in beiden Listen.
- **Gerichtete Typen** stehen nur in ihrer Richtung: aufsteigendes Dreieck nur nach oben, absteigendes nur nach unten. Das symmetrische Dreieck und das Rechteck kommen in beiden vor.
- **Leer (`null`):** wie `formationConfirmed` (Fehler der Erkennung) und bei eingefrorener Reihe.
- **Titel hinter dem Stichtag** behalten ihre Formationen wie bisher bei `formationConfirmed`.
- **Suche in Worten** (Rundlauf): `bestaetigt-auf:symmetrical_triangle,…` bzw. `bestaetigt-ab:…`. Das bestehende `bestaetigt:` bleibt unverändert.
- **Treffersatz** (`model.js#wantedFormations`) nennt die Formation wie bei `formationConfirmed`.

## 2. Vorher/Nachher (Neubau mit dem Erzeuger, Stichtag 28.10.2026, 5.659 Titel)

- **Bestehende 150 Spalten:** byte-gleich.
- **Geändert in den Metadaten:** nur `versions` und `benchmark.asOf` (neuere SPY-Reihe des Marktlaufs vom 30.10.).

| | aktuell (5.347) | hinter dem Stichtag (80) | eingefroren (232) |
|---|---|---|---|
| mindestens eine Formation nach oben | 1.417 | 29 | leer |
| mindestens eine Formation nach unten | 1.292 | 12 | leer |

**Dreiecke** (symmetrisch, aufsteigend, absteigend):

| | Titel |
|---|---|
| bestätigt | 525 |
| davon nach oben | 155 |
| davon nach unten | 371 |

Das sind dieselben Zahlen wie die Auswertung der Spalte `formations` vom 29.10. (STRATEGY_TEMPLATES_PLAN.md §3, V2).

**Nach Typ (oben / unten), Auswahl:**

| Typ | nach oben | nach unten |
|---|---|---|
| Symmetrisches Dreieck | 107 | 193 |
| Aufsteigendes Dreieck | 49 | 0 |
| Absteigendes Dreieck | 0 | 179 |
| Rechteck | 31 | 55 |
| Ausbruch über Widerstand | 552 | 0 |
| Range-Ausbruch | 397 | 0 |
| Doppelboden | 101 | 0 |
| Doppeltop | 0 | 207 |

## 3. Prüfung

- `quant/tests/technical-ap8-l5.test.mjs`:
  - Abfragefelder;
  - Wortsuche im Rundlauf, das bestehende Präfix unverändert;
  - Datensatz: Aufteilung von `formationConfirmed`, deckungsgleich mit der Spalte `formations`, jede Bestätigung mit Richtung;
  - gerichtete Typen nur in ihrer Richtung;
  - eingefroren leer;
  - Abfrage „Dreieck nach oben“ ist eine Teilmenge der bestätigten Dreiecke.
- Vertrag erweitert (Listen von Formationstypen), `DATA_CONTRACT.md` neu erzeugt.
- **Suiten:** technical 35/35, quant technical/ti 541/541.
