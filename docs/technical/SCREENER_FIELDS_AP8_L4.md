# Screener-Feld AP8 L4: RS-Rang

**Fachmodell, Owner-Freigabe nötig.** Teil von S2 der Strategie-Vorlagen ([STRATEGY_TEMPLATES_PLAN.md](STRATEGY_TEMPLATES_PLAN.md)). Gebraucht für Kriterium 8 der Vorlage „Etablierter Aufwärtstrend“: „Relative Stärke im oberen Drittel des Universums“ (S3).
Owner-Entscheidung 30.10.: Perzentilrang der bestehenden Kennzahl `rs6m` über aktuelle, gültig auswertbare Aktien, exakt dokumentiert, nicht als proprietäre IBD-RS-Bewertung bezeichnet.
Versionen: `technical-screen-row-1.12.0`, `technical-query-1.12.0`, `technical-query-text-1.9.0`.

## 1. Definition

| Bestandteil | Festlegung |
|---|---|
| Kennzahl | `rs6m` = Kursveränderung des Titels über 126 Handelstage minus Kursveränderung von SPY über dieselben Handelstage (Schlusskurse, gleicher Stichtag; bestehendes Feld, unverändert) |
| Universum | alle Zeilen des Screeners mit `fresh = true` (Kurs am Stichtag, nicht eingefroren) **und** endlichem `rs6m` |
| Fehlende Werte | Titel ohne `rs6m` (zu kurze Historie, kein passender SPY-Tag), hinter dem Stichtag oder mit eingefrorener Reihe: `rsRank = null`. Sie zählen nicht zum Universum und verschieben keinen Rang |
| Richtung | höheres `rs6m` = höherer Rang |
| Rang | `100 · (B + (E − 1) / 2) / (N − 1)`; B = Zahl der Titel mit kleinerem `rs6m`, E = Zahl mit gleichem `rs6m` (einschließlich des Titels selbst), N = Größe des Universums |
| Ränder | schwächster Titel 0, stärkster 100; Gleichstände erhalten denselben (mittleren) Rang; N = 1 ergibt 50 |
| Rundung | eine Nachkommastelle |
| Zeitrahmen | nur Tag |
| Ort | `screen-row.js#rankRs`, aufgerufen von `build-screener.mjs` nach der Frische-Markierung (Querschnitt über das ganze Universum, deterministisch) |

- Der RS-Rang ist eine Kennzahl dieses Produkts, gerechnet aus veröffentlichten Kursen. Er ist keine Bewertung eines Drittanbieters und wird nicht so genannt (Test: kein „IBD“ in der Beschriftung).
- Beschriftung: „RS-Rang 6 Monate (0 = schwächster, 100 = stärkster Titel)“.
- Chart Studio: Unterfenster „Rel. Stärke“ (zeigt `rs6m` und `rs3m` gegenüber SPY).
- Suche in Worten: „RS-Rang mindestens 70“, „Rang der relativen Stärke über 80“.

## 2. Vorher/Nachher (Neubau mit dem Erzeuger, Stichtag 28.10.2026, 5.659 Titel)

- **Bestehende 150 Spalten:** byte-gleich.
- **Geändert in den Metadaten:** nur `versions` und `benchmark.asOf` (neuere SPY-Reihe des Marktlaufs vom 30.10.; `rs6m` unverändert).

| | Titel | `rsRank` |
|---|---|---|
| Universum (aktuell, `rs6m` vorhanden) | 5.332 | 0 … 100, Median 50 |
| aktuell ohne `rs6m` | 15 | leer |
| hinter dem Stichtag | 80 | leer |
| eingefroren | 232 | leer |

- Rang ≥ 70: 1.602 Titel (30,0 % des Universums), wie es ein Perzentil verlangt.
- Beispiele: AAPL `rs6m` +18,7 % → Rang 86,6; TSLA −0,1 % → 71,7; NVDA −5,6 % → 64,8.

## 3. Prüfung

- `quant/tests/technical-ap8-l4.test.mjs`:
  - Definition an einem kleinen Universum: Richtung, Gleichstand, Ränder, N = 1, leeres Universum;
  - ohne `rs6m` und hinter dem Stichtag kein Rang;
  - Wortsuche;
  - Datensatz = Neuberechnung;
  - monoton in `rs6m`;
  - nur aktuelle Titel;
  - Anteil ≥ 70 bei 30 %.
- Vertrag erweitert (Bereich 0–100), `DATA_CONTRACT.md` neu erzeugt.
- **Suiten:** technical 35/35, quant technical/ti 541/541.
