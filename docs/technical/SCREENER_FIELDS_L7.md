# Screener-Felder L7: ROC, Inside Bar, NR7 und Kerzenmuster je Woche und Monat

Stand 27.10.2026. Fachmodell-PR, braucht die Freigabe des Owners.

Versionen:
- `technical-mtf-1.1.0`
- `technical-screen-row-1.8.0`
- `technical-query-1.8.0`

Die Tagesfelder kommen aus L6 ([SCREENER_FIELDS_L6.md](SCREENER_FIELDS_L6.md)). L7 rechnet dieselben Größen an der letzten **abgeschlossenen** Wochen- bzw. Monatskerze.

## 1. Felder und Herkunft

Die Werte entstehen in der Materialisierung (`multi-timeframe.js`). Grundlage ist die volle Tageshistorie, im Median 2.903 Tagesbars. Daraus werden Wochen- und Monatsbars mit `timeframe.js#aggregate` und dem Handelskalender gebildet. Veröffentlicht wird nur die Kennzahl am letzten abgeschlossenen Bar, wie bei den bestehenden Wochen- und Monatsfeldern (Audit B8).

| Feld | Woche | Monat | Definition |
|---|---|---|---|
| `roc21` | 4 Wochen | 1 Monat | Schluss / Schluss vor h Bars − 1 |
| `roc63` | 13 Wochen | 3 Monate | wie oben |
| `roc126` | 26 Wochen | 6 Monate | wie oben |
| `roc252` | 52 Wochen | 12 Monate | wie oben |
| `insideBar` | Inside Week | Inside Month | Hoch < Vorbar-Hoch und Tief > Vorbar-Tief (Katalog `insideBar`) |
| `nr7` | engste Wochenspanne von 7 | engste Monatsspanne von 7 | Katalog `nr7`, Gleichstand zählt als engste |
| `candleBullish`, `candleBearish`, `candleNeutral` | Wochenkerze | Monatskerze | `candlesticks.js` mit der festen Liste des Screeners (27 Muster, `SCREEN_CANDLES`) |

**Spalten:** Die Felder heißen wie am Tag, mit dem Zeitrahmen als Suffix: `roc252@1W`, `insideBar@1M` usw. Die ROC-Felder bezeichnen dieselbe Kalenderspanne wie am Tag. `roc252@1W` ist also die 52-Wochen-Änderung. So deuten Tag, Woche und Monat ein Feld gleich, wie schon bei `aboveSma200` (40-Wochen- bzw. 10-Monats-Linie).

**Abgeschlossen:**
- Eine Woche ist abgeschlossen, wenn der Stichtag ein Freitag ist.
- Ein Monat ist abgeschlossen, wenn nach dem Stichtag kein Werktag mehr im Monat liegt.
- Eine offene Periode fällt weg, wie bisher (`closedAt`). Ein Test belegt das: Ein Stichtag am Mittwoch liefert genau die Werte des Vorfreitags.

**Kausalität:** Jede Kennzahl nutzt nur Bars bis zur bewerteten Kerze. Der Test rechnet dafür an 40 Stichtagen jeweils neu.

**Fehlende Werte sind `null`, nie geschätzt:**
- `null` steht, wenn die Historie zu kurz ist (z. B. `roc252@1M` vor 13 Monatsbars) oder Kerzenmuster nicht entscheidbar sind. Die Kerzenmuster brauchen 15 Bars.
- `null` steht auch, solange ein Bündel noch mit `technical-mtf-1.0.0` materialisiert ist.
- Ohne Bündel rechnet `screen-row.js` wie bisher aus Wochenschlüssen (`discover-series-long`). Daraus lässt sich ROC rechnen. Spanne und Kerze brauchen Hoch, Tief und Eröffnung; diese Felder bleiben `null`.

**Abfrage:** `technical-query.js` erlaubt die Felder jetzt für `1D`, `1W` und `1M`, mit eigenen Beschriftungen je Zeitrahmen. Der Abfragetext braucht keine Änderung. „Jahresperformance > 20 % auf Wochenbasis“ wird zu `roc252@1W > 0,2`, „Inside Bar Woche“ zu `insideBar@1W`.

## 2. Vorher/Nachher

### 2a. Rechnung über das Universum

Grundlage sind 5.657 Titel und je die 270 veröffentlichten Tagesbars. Die volle Tageshistorie gibt es nur im Materialisierungslauf; diese Rechnung ist deshalb eine Näherung mit kürzerer Historie.

Bestehende Wochen- und Monatsfelder: **11.314 von 11.314 Blöcken byte-gleich** zwischen `technical-mtf-1.0.0` (main) und 1.1.0. Das gilt für Werte, `asOf`, Bars und Abschlussregel.

Neue Felder:

| Feld | Woche | Monat |
|---|---|---|
| `roc21` (Median, 10.–90. Perzentil) | −2,2 % (−29,7 … +11,7 %) | −5,4 % (−21,0 … +7,3 %) |
| `roc252` (Median, 10.–90. Perzentil) | −6,1 % (−76,2 … +52,6 %) | −5,4 % (−70,2 … +60,7 %) |
| `insideBar` ja | 798 (14 %) | 820 (14 %) |
| `nr7` ja | 1.003 (18 %) | 1.609 (28 %) |
| bullisches / bärisches / neutrales Muster | 1.236 / 720 / 1.311 | in der Näherung nicht entscheidbar |
| Kerzen nicht entscheidbar (`null`) | 186 | 5.657 |

Die Monatskerzen sind in der Näherung nicht entscheidbar, weil 270 Tagesbars nur 13 bis 14 Monatsbars ergeben. Mit der vollen Historie (im Median rund 138 Monatsbars) sind sie entscheidbar.

### 2b. Erzeuger `build-screener.mjs`

Neubau mit `build-screener.mjs --no-evidence` auf `main` (f64f949, Stand 26.10.2026, 5.657 Titel). Der Vergleich läuft gegen die von `technical-world.yml` committeten Daten desselben Stands.

| | vorher (screen-row 1.7.0) | nachher (1.8.0) |
|---|---|---|
| Spalten | 105 | 123 (+18: 9 Felder × Woche/Monat) |
| bestehende Spalten | – | **alle 105 byte-gleich** |
| neue Spalten | – | alle `null`; kein `undefined`, kein `NaN` |
| `screener-v1.json` | 5.251.561 B | 5.760.981 B (+9,7 %, nur `null`-Einträge) |
| Laufzeit Erzeuger | 81 s | 84 s |

Die neuen Spalten sind heute `null`, weil alle 5.657 Bündel noch mit `technical-mtf-1.0.0` materialisiert sind. Schätzungen gibt es dafür nicht. Gefüllt werden sie mit der nächsten Materialisierung (2c).

### 2c. Ablauf nach dem Merge

1. Bis zur nächsten Materialisierung sind die neuen Wochen- und Monatsspalten für Titel mit Bündel `null`. Ausnahme: ROC aus Wochenschlüssen für Titel ohne Bündel.
2. Die nächste reguläre Materialisierung (`product-intelligence-materialization.yml`) schreibt Bündel mit `technical-mtf-1.1.0`. Ein zusätzlicher Anbieterabruf ist dafür nicht nötig.
3. Danach füllt der Erzeuger `technical-world.yml` die Spalten.

### 2d. Prüfung nach der ersten Materialisierung (29.10.2026)

Nachtlauf vom 28.10. ohne zusätzlichen Anbieterabruf:
- market-data-refresh, Lauf 40803128385, grün einschließlich der Discover-Prüfung (Korrektur #1044).
- Materialisierung (`94d7b46`): alle 5.659 Bündel tragen `technical-mtf-1.1.0`, 5.574 davon mit letztem Bar am 28.10.
- Den Screener (`92b010e`, Stichtag 28.10., 5.659 Titel) baute `technical-world.yml` per `workflow_dispatch`. Der Zeitplan 05:10 UTC startet bei GitHub mit Stunden Verzögerung (27. und 28.10.: 10:25 bzw. 11:15 UTC).
- Der lokale Neubau mit dem Erzeuger ist byte-gleich zu den committeten Daten.

**Füllgrad der 18 Spalten**

| Feld | Woche | Monat |
|---|---|---|
| `roc21`, `roc63`, `roc126`, `roc252` | 5.427 (95,9 %) | 5.427 (95,9 %) |
| `insideBar`, `nr7` | 5.347 (94,5 %) | 5.347 (94,5 %) |
| Kerzen (bullisch/bärisch/neutral) | 5.344 (94,4 %) | 5.321 (94,0 %) |

Leer sind fast nur die Titel, die nach AP1 (`technical-screen-row-1.10.0`) keine Stichtagswerte tragen:
- 232 Titel mit eingefrorener Reihe; bei ihnen sind alle Analysefelder leer, ROC eingeschlossen.
- 80 Titel hinter dem Stichtag; bei ihnen sind Inside Bar, NR7 und Kerzen leer.

Bei aktuellen Titeln fehlt ROC nie. Kerzen fehlen bei 3 Titeln (Woche) bzw. 26 Titeln (Monat), weil das Muster dort nicht entscheidbar ist.

**Vergleich mit der Näherung aus 2a** (Näherung in Klammern):

| Feld | Woche | Monat |
|---|---|---|
| `roc21` Median (10.–90. Perzentil) | −2,8 % (−30,1 … +12,2) [−2,2 %] | −5,8 % (−21,3 … +7,5) [−5,4 %] |
| `roc252` Median (10.–90. Perzentil) | −7,3 % (−76,6 … +52,5) [−6,1 %] | −6,5 % (−70,4 … +60,8) [−5,4 %] |
| `insideBar` ja | 783 [798] | 803 [820] |
| `nr7` ja | 763 [1.003] | 1.385 [1.609] |
| Kerzen bullisch / bärisch / neutral | 1.199 / 707 / 1.264 [1.236 / 720 / 1.311] | 717 / 1.578 / 1.159 [nicht entscheidbar] |

- Die Abweichungen erklärt der neue Stichtag 28.10. statt 26.10. Bei NR7 kommt hinzu, dass die Vollhistorie die Spanne des Vergleichsfensters anders setzt als die 270-Bar-Näherung. Die Monatskerzen sind mit der vollen Historie entscheidbar, wie in 2a erwartet.
- Prüfungen auf `main`:
  - DQ-TW-5 PASS mit allen 46 Wochen- und Monatsspalten, 0 Verstöße;
  - DQ-TW-1 bis DQ-TW-7 PASS;
  - Technical-Tests 34/34;
  - Formationen auf Stand `technical-formations-1.4.0` (#1047).

## 3. Tests

`quant/tests/technical-mtf-l7.test.mjs` rechnet an echten AAPL-Tagesbars (315). Die Wochen- und Monatsbars bildet der Test naiv und unabhängig von `timeframe.js`.
- Die Musterliste ist gleich `screen-row.js` `SCREEN_CANDLES`. Die Feldliste 1.1.0 ist vollständig.
- **Gleich der Nachrechnung an 40 Stichtagen je Zeitrahmen:**
  - ROC
  - Inside Bar und NR7 (von Hand nachgerechnet)
  - Kerzen (gleich `candlesticks.js` auf den naiven Bars)
  - Ein Zähler verhindert, dass die Prüfung leer läuft.
- **Offene Woche:** Ein Stichtag am Mittwoch liefert die Werte des Vorfreitags.
- **Bündel 1.0.0:** Die neuen Spalten existieren und sind `null`. Die bestehenden Wochen- und Monatsfelder hängen nicht von den neuen ab.
- **Schlusskurs-Rechnung:** ROC aus Wochenschlüssen, Spanne und Kerzen `null`. Bei zu kurzer Historie ist auch ROC `null`.
- **Abfrage:** Die Zeitrahmen `1W` und `1M` sind für alle neuen Felder zulässig.
