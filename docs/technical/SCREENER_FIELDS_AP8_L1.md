# Screener-Felder AP8 L1: SMA 150

**Fachmodell, Owner-Freigabe nötig.** Teil von S2 der Strategie-Vorlagen ([STRATEGY_TEMPLATES_PLAN.md](STRATEGY_TEMPLATES_PLAN.md)). Gebraucht für die Kriterien 1, 2 und 4 der Vorlage „Etablierter Aufwärtstrend“ (S3).
Versionen: `technical-screen-row-1.12.0`, `technical-query-1.12.0`, `technical-query-text-1.9.0`.

## 1. Felder (nur Tag)

| Feld | Typ | Definition |
|---|---|---|
| `aboveSma150` | ja/nein | Schlusskurs am Stichtag > SMA 150 |
| `sma150AboveSma200` | ja/nein | SMA 150 > SMA 200 |
| `sma50AboveSma150` | ja/nein | SMA 50 > SMA 150 |
| `distSma150` | Anteil | Schlusskurs / SMA 150 − 1 |

- **SMA 150** = einfacher Durchschnitt der letzten 150 Schlusskurse (`indicators.js`, `sma`, mit TA-Lib geprüft).
- **Quelle:** die veröffentlichten Tagesbars des Titels (`technical-signals-v1`, SPLIT_ADJUSTED, 270 Bars).
  - Die Materialisierung liefert keine SMA 150, und sie bleibt unverändert.
- **Eine Quelle je Vergleich:** In `sma150AboveSma200` und `sma50AboveSma150` kommen beide Seiten aus denselben Tagesbars.
  - Die bestehenden Felder `aboveSma200`, `aboveSma50` und `sma50AboveSma200` bleiben auf der Vollhistorie der Materialisierung.
  - Abgleich über das ganze Universum (30.10.2026), SMA aus den Bars gegen die Vollhistorie:

| | Median der Abweichung | 99. Perzentil | Titel über 0,01 % |
|---|---|---|---|
| SMA 50 | 4 · 10⁻¹⁶ | 9 · 10⁻⁸ | – |
| SMA 200 | 7 · 10⁻¹⁶ | 6 · 10⁻⁷ | 4 von 5.659 (TOPS 33 %, GROM 0,35 %, NUWE 0,11 %, PPCB 0,02 %) |

  Bei keinem der vier wechselt der Kurs die Seite der SMA 200.
- **Leer (`null`):**
  - bei weniger als 150 Bars (für SMA 200: 200 Bars);
  - bei eingefrorener Reihe (AP1, alle Analysefelder).
  - Titel hinter dem Stichtag behalten den Zustand ihres letzten Kurses, wie alle anderen Trendzustände (SCREENER_FRESHNESS.md). Die Vorlagen schließen diese Titel ohnehin aus.
- **Chart Studio:** Die Schicht „SMA“ zeigt zusätzlich die SMA 150, gerechnet aus denselben Bars wie die Spalte (gestrichelt).
- **Suche in Worten:**
  - „über der SMA 150“, „unter der 150-Tage-Linie“;
  - „SMA 150 über SMA 200“, „SMA 50 über SMA 150“;
  - „Abstand zur SMA 150 kleiner 5 %“.

## 2. Vorher/Nachher (Neubau mit dem Erzeuger, Stichtag 28.10.2026, 5.659 Titel)

- **Bestehende 150 Spalten:** byte-gleich.
- **Geändert in den Metadaten:** nur `versions` und `benchmark.asOf`. Letzteres kommt von der neueren SPY-Reihe des Marktlaufs vom 30.10.; der Wert stammt nicht aus dieser Änderung, `rs3m`/`rs6m` sind unverändert.

| Feld | aktuell (5.347) | hinter dem Stichtag (80) | eingefroren (232) |
|---|---|---|---|
| `aboveSma150` | ja 1.898 · nein 3.449 · leer 0 | ja 46 · nein 34 | leer 232 |
| `sma150AboveSma200` | ja 2.498 · nein 2.849 · leer 0 | ja 40 · nein 40 | leer 232 |
| `sma50AboveSma150` | ja 2.175 · nein 3.172 · leer 0 | ja 39 · nein 41 | leer 232 |
| `distSma150` | Median −5,7 %, min −99,97 %, max +353 % | Median +1,9 % | leer 232 |

Zum Vergleich: `aboveSma200` aktuell ja 1.975.

## 3. Prüfung

- `quant/tests/technical-ap8-l1.test.mjs`:
  - Rechnung gegen `Indicators.compute`;
  - leer ohne Historie;
  - Wortsuche, auch bestehende Begriffe unverändert;
  - Datensatzspalte = SMA 150 der Bars für über 200 Titel;
  - eingefroren leer.
- Vertrag (`screener-contract.js`, `DATA_CONTRACT.md` neu erzeugt), Rundlauf der Wortsuche für jedes Feld, Chart-Darstellung für jedes Feld (`FIELD_CHART`).
- **Suiten:** technical 35/35, quant technical/ti 542/542.
