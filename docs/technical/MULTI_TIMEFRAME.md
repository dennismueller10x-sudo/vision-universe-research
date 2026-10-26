# Woche und Monat aus der vollen Tageshistorie (Audit B8, Fachmodell)

Stand 26.10.2026. Fachmodell-PR, wird erst nach Owner-Freigabe gemergt.

## Problem

Bisher entstanden die Felder `@1W` und `@1M` in `screen-row.js` nur aus Wochenschlüssen (`discover-series-long`):

- **Woche:** SMA 10/40, RSI 14 und das 52-Wochen-Schlusshoch. ADX, MACD, Stochastik, ATR und Volumen fehlen, weil Hoch, Tief und Volumen fehlen.
- **Monat:** Der Monatsschluss war der letzte *Wochen*schluss im Kalendermonat. Er ist in rund der Hälfte der Titel-Monate falsch (Audit B5).
- Die Rechnung im Repository allein reicht nicht: 270 Tagesbars ergeben nur rund 54 Wochen- und 12 Monatsbars.

## Lösung

**Neues Modul** `quant/engines/technical/multi-timeframe.js` (`technical-mtf-1.0.0`):
- Es läuft in der Materialisierung auf der vollen Tageshistorie (R2, Median 2.903 Bars).
- Es bildet Wochen- und Monatsbars mit `timeframe.js#aggregate` am Handelskalender.
- Es veröffentlicht **nur Kennzahlen am letzten abgeschlossenen Bar** als `bundle.multiTimeframe`, keine Wochen- oder Monatsreihen. Damit stellt sich keine neue Rechtsfrage zu Kursdaten.

**Abgeschlossen heißt:**
- Woche: Der Stichtag ist ein Freitag.
- Monat: Nach dem Stichtag liegt kein Werktag mehr im Monat.

Beide Regeln sind konservativ. Ein Feiertagsfreitag kostet eine Woche, ein Karfreitag am Monatsende einen Monat.

**Felder je Zeitrahmen.** Die Namen und die Bedeutung sind dieselben wie beim Tag.

| Feld | Woche | Monat |
|---|---|---|
| `aboveSma200`, `aboveSma50`, `sma50AboveSma200`, `distSma200` | 40- und 10-Wochen-Linie | 10- und 5-Monats-Linie |
| `rsi14`, `newHigh52w`, `distHigh52w` | RSI 14, 52-Wochen-Schlusshoch | RSI 14, 12-Monats-Schlusshoch |
| **neu:** `adx`, `macdPositive`, `stochK`, `atrPct` | ADX 14, MACD 12/26/9, Stochastik 14/3, ATR 14 / Schluss | ebenso |
| **neu:** `relVol`, `volAboveAvg`, `volSpike` | Wochenvolumen / Median der 20 Vorwochen | Monatsvolumen / Median der 20 Vormonate |

Fehlt Historie, ist der Wert `null`, nie 0.

**Weitere geänderte Dateien:**
- `technical-analysis.js`: legt den Block additiv an. `parametersHash` und alle bestehenden Bundle-Felder bleiben unverändert (Test).
- `screen-row.js` (1.5.0): liest den Block vorrangig. Ohne ihn bleibt die bisherige Schlusskurs-Rechnung; die neuen Felder sind dann `null`.
- `technical-query.js` (1.5.0): ADX, MACD, Stochastik, ATR %, relatives Volumen, Volumen über Durchschnitt und Volumenspitze gelten jetzt auch für Woche und Monat.
- `build-screener.mjs`: übergibt den Block. `meta.counts.weeklyMonthlyFromDailyHistory` zählt die Titel, deren Werte aus der Tageshistorie kommen.

## Vorher/Nachher

Grundlage: Repository-Stand vom 23.10.2026, 5.655 Titel. Die volle R2-Historie gibt es nur im Lauf. Was davon abhängt, ist als Erwartung aus `provenance.sourceBars` markiert.

**1. Monatsschluss (behebt B5):**

| | |
|---|---|
| geprüfte Titel-Monate (vollständige Monate im 270-Bar-Fenster) | 67.841 |
| bisheriger Monatsschluss falsch | **34.302 (50,6 %)** |
| Abweichung (Median / p90 / p99) | 2,0 % / 8,1 % / 27,6 % |

Ursache: Endet ein Monat vor Freitag, gehören seine letzten Tage zur Woche des Folgemonats.

Danach ist der Monatsschluss der Schluss des letzten Handelstags. Damit verschieben sich alle `@1M`-Werte entsprechend: SMA 5/10, RSI 14 und das 12-Monats-Hoch.

**2. Woche, bestehende Felder:**
- Wochenschlüsse aus Tagesbars und aus `discover-series-long` sind gleich. Bei 272 Titeln gibt es Rundungsabstände bis 0,005 USD, weil die lange Reihe zweistellig gespeichert ist.
- Auf demselben Fenster stimmen die SMA-Aussagen überein:

| Feld | gleich | Anteil |
|---|---|---|
| `aboveSma200@1W` | 5.641 / 5.646 | 99,9 % |
| `aboveSma50@1W` | 5.588 / 5.646 | 99,0 % |
| `sma50AboveSma200@1W` | 5.631 / 5.646 | 99,7 % |

Die Abweichungen liegen an der Rundung bei Kursen nahe der Linie.

RSI und 52-Wochen-Hoch bleiben inhaltlich gleich. Der RSI startet jetzt auf der vollen Tageshistorie statt auf der Wochenreihe; das ist bei Hunderten Wochen Vorlauf ohne praktische Wirkung.

**3. Neue Felder (erwartete Abdeckung im Lauf).** Gerechnet aus der Historienlänge je Titel, mit Mindestbars plus 25 Tage Puffer:

| Feld | Woche | Monat |
|---|---|---|
| ADX | 5.655 | 5.200 |
| MACD-Histogramm | 5.655 | 5.080 |
| Stochastik %K | 5.655 | 5.450 |
| ATR % | 5.655 | 5.602 |
| relatives Volumen | 5.655 | 5.358 |

Vorher waren alle diese Felder für Woche und Monat nicht verfügbar.

**4. Tag und alle bestehenden Spalten:** Nach dem Neubau mit dem Erzeuger hat sich kein einziger Wert in einer bestehenden Spalte geändert (5.649 gemeinsame Titel). Neu sind 14 Spalten (`…@1W`/`…@1M`); sie bleiben `null`, bis die Materialisierung den Block liefert. Dazu kommen 6 Vorzugsaktien aus #950, die der Erzeuger seitdem mitnimmt.

## Prüfung vor dem Merge (Owner-Freigabe 26.10.2026)

Geprüft auf allen 5.655 Titeln des Repository-Stands (270 Tagesbars je Titel):

- **Abschlussregel:** Eine Woche oder ein Monat gilt nur dann als abgeschlossen, wenn der Stichtag ein Freitag bzw. der letzte Werktag des Monats ist. 0 Verstöße. Kein `asOf` liegt nach dem Stichtag.
- **Feiertage (Test):** Am Gründonnerstag 28.03.2024 bleiben Woche und Monat offen, obwohl der Karfreitag börsenfrei ist. Ohne Börsenkalender ist das Ende nicht beweisbar. Die Regel behandelt eine unvollständige Periode deshalb nie als abgeschlossen; sie verliert im Zweifel eine Periode.
- **Kausalität:** Für jeden Titel und Zeitrahmen wurden die Werte am letzten abgeschlossenen Bar ein zweites Mal gerechnet, nur mit Daten bis zu dessen Datum. Ergebnis: 11.309 von 11.310 identisch.
  - Die eine Abweichung ist IPEX, Monat September. Der Titel hat am 29. und 30.09.2026 keine Bars.
  - Mit Daten bis 28.09. gilt der Monat zu Recht als offen. Mit dem Oktober ist er abgeschlossen; seine Werte nutzen weiterhin nur Bars bis 28.09.
  - Das ist kein Vorgriff, sondern eine Datenlücke im Titel.
- **Tagesindikatoren:** Nach dem Neubau ist bei 5.649 gemeinsamen Titeln keine bestehende Spalte verändert. Mitgeprüft ist `indicators` 1.2.1 nach #964.

## Ablauf nach der Freigabe

1. Merge.
2. Der nächste Materialisierungslauf schreibt `bundle.multiTimeframe` in die Shards.
3. technical-world baut den Screener neu (05:10 UTC).
4. `meta.counts.weeklyMonthlyFromDailyHistory` und die Spaltenabdeckung werden gegen die Erwartung in Tabelle 3 geprüft.

## Tests

`quant/tests/technical-multi-timeframe.test.mjs` (7 Tests):
- Abschlussregeln.
- Wochenwerte gleich einer naiven Wochenbildung (SMA, RSI, ADX, ATR, Stochastik, MACD, Volumen, 52W).
- Kausalität: Eine offene Woche ergibt die Werte des Vorfreitags.
- Monatsschluss am letzten Handelstag.
- `null` bei kurzer Historie.
- Bundle additiv mit unverändertem `parametersHash`.
- `screen-row` mit Vorrang und Rückfall.

Angepasste Tests:
- `relVol`/ADX waren bisher als Beispiele für „nur Tag“ benutzt. Jetzt sind es CCI und MFI.
- Neu geprüft wird, dass die sieben Felder alle drei Zeitrahmen haben.
