# Technical-Indikatoren gegen eine externe Referenz (Audit B7)

Stand 26.10.2026. Die bestehenden Referenztests (`technical-indicators.test.mjs`, `technical-indicators-ext.test.mjs`) vergleichen die Engine mit naiven Formeln aus demselben Haus. Die naive Formel und die Engine können dieselbe Konvention falsch haben. Dieser Abschnitt prüft deshalb gegen eine fremde Implementierung.

## Aufbau

| Teil | Datei |
|---|---|
| Referenzreihe | `quant/tests/fixtures/technical-reference-aapl.json` (eingefroren, 315 Tagesbars AAPL 02.10.2023 bis 31.12.2024) |
| externe Werte | `quant/tests/fixtures/technical-talib-reference-aapl.json` (TA-Lib 0.8.2, C-Kern 0.8.1, eingefroren) |
| Erzeuger | `scripts/technical/build-talib-reference.py` |
| Test | `quant/tests/technical-indicators-talib.test.mjs` |

**TA-Lib ist keine Projektabhängigkeit.** Die Werte sind eingefroren. Der Erzeuger läuft nur, wenn jemand die Fixture bewusst neu baut, in einer eigenen Umgebung (Anleitung im Kopf des Skripts). Es fallen keine Kosten an und es gibt keinen Datenanbieter.

Toleranz: relativ 1e-8. Die Fixture speichert 10 signifikante Stellen.

## Ergebnis

| Indikator | Ergebnis |
|---|---|
| SMA, EMA (20, 200), WMA, RSI, ROC, CCI, Williams %R, MFI | an jeder Bar gleich, auch die erste Bar |
| Bollinger (Populationsstreuung), Aroon Up/Down/Oszillator, Donchian, Ichimoku Tenkan/Kijun/Senkou B | an jeder Bar gleich |
| Stochastik (langsam) | %D gleich. %K gleich ab Bar 17; TA-Lib gibt %K erst ab der ersten %D-Bar aus, die Engine schon ab Bar 15. |
| ATR 14 / ATR 10 | **Startwert-Konvention.** TA-Lib lässt die erste True Range (H−L ohne Vorschluss) weg und startet eine Bar später. Die Abweichung klingt ab und liegt ab Bar 190 bzw. 138 unter 1e-8. |
| ADX 14 | wie ATR (gleiche Glättung), gleich ab Bar 264 |
| MACD, Signal, Histogramm | **Startwert-Konvention.** TA-Lib startet die schnelle EMA erst mit der langsamen. Gleich ab Bar 137 / 151 / 170. |
| OBV | gleicher Verlauf. TA-Lib startet bei V₀, die Engine bei 0; die Differenz ist konstant V₀. |
| Parabolic SAR | seit 1.2.1 gleich bis auf die Startbar 2 (Konvention). Bis 1.2.0 wichen zwei Umkehrbars ab (173, 308), siehe Befund und Korrektur. |
| Supertrend, VWMA, CMF, relative Volumenstärke, Volumenspitzen, Keltner-Kanal (ganz) | kein TA-Lib-Gegenstück. Keltner besteht aus EMA und ATR, die beide oben geprüft sind. |

Die Startwert-Konventionen sind dokumentiert, keine Fehler. Der Test prüft dreierlei: dass sie abklingen, dass die Werte ab der festgehaltenen Bar gleich sind und dass die Startabweichung überhaupt existiert. Ändert jemand die Konvention, fällt der Test auf.

## Befund: Parabolic SAR an Umkehrbars

Bei einer Umkehr setzt die Engine den neuen SAR auf den alten Extrempunkt. Erreicht die Umkehrbar selbst ein neues Extrem, bleibt dieses unberücksichtigt. Der SAR liegt dann innerhalb der Spanne der Umkehrbar:

| Bar | Datum | Umkehr | Hoch / Tief der Bar | Engine-SAR | TA-Lib-SAR |
|---|---|---|---|---|---|
| 173 | 2024-06-10 | lang → kurz | Hoch 197,30 | 196,94 | 197,30 |
| 308 | 2024-12-20 | kurz → lang | Tief 245,69 | 247,09 | 245,69 |

Nach Wilder liegt der SAR nie innerhalb der Spanne der aktuellen Bar. TA-Lib setzt deshalb das Extrem der Umkehrbar.

## Korrektur (indicators 1.2.1, eigener Fachmodell-PR)

Bei einer Umkehr gilt jetzt:
- neu kurz: SAR = max(alter Extrempunkt, Hoch der Umkehrbar);
- neu lang: SAR = min(alter Extrempunkt, Tief der Umkehrbar).

Das ist die Regel von Wilder und TA-Lib. Die Engine stimmt danach an jeder Bar mit TA-Lib überein, nur die Startbar 2 folgt einer eigenen Konvention. Der bisher ausgenommene Prüffall „SAR liegt nie im Kursbereich“ (`technical-indicators-ext.test.mjs`) gilt jetzt auch an Umkehrbars. Er schlägt mit 1.2.0 (wie 1.1.0) genau an den Bars 173 und 308 fehl.

### Vorher/Nachher über das materialisierte Universum

Grundlage: `technical-signals-v1`, alle 5.655 Instrumente mit echten, splitbereinigten Tagesbars, 1.521.195 SAR-Bars.

| Kennzahl | bis 1.2.0 | 1.2.1 |
|---|---|---|
| Umkehrbars | 127.470 | 127.470 |
| davon SAR innerhalb der Bar-Spanne | 3.837 | **0** |
| Bars mit geändertem SAR-Wert | – | 3.837 (genau diese Umkehrbars) |
| Bars mit geänderter Richtung | – | **0** |
| `psarUp` am letzten Bar geändert | – | **0 von 5.655** |

Die Korrektur pflanzt sich nicht fort. Schon an der Folgebar begrenzen beide Fassungen den SAR auf dasselbe Extrem der Umkehrbar.

Die Änderung je betroffenem Wert liegt im Median bei 1,1 %. Große relative Sprünge gibt es nur an Bars mit extremer Spanne, etwa ZSTK am 19.08.2026: Hoch 12,40, Tief 1,52. Dort lag der alte SAR mit 2,10 tief in der Bar; neu sind es 12,40.

**Wirkung:**
- Screener-Filter, KI-Suche und materialisierte Daten ändern sich nicht.
- Im Chart Studio sitzt der SAR-Punkt an solchen Umkehrbars künftig am Bar-Extrem statt in der Kerze.
