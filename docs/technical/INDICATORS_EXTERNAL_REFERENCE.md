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

## Erweiterung ab indicators 1.3.0 (L2a, L3)

Zweite Fixture: `quant/tests/fixtures/technical-talib-reference-aapl-ext.json`, erzeugt mit `build-talib-reference.py --set ext`. Die Fixture aus B7 bleibt bytegleich, neu erzeugt und mit `cmp` geprüft. Test: `technical-indicators-catalog-l2.test.mjs`.

| Indikator | Ergebnis |
|---|---|
| DEMA, TEMA, TRIMA (20 und 15), T3, PPO (EMA), Momentum, Standardabweichung | an jeder Bar gleich |
| A/D-Linie, Balance of Power, Stochastic RSI | gleich. TA-Lib gibt den rohen StochRSI erst ab der ersten geglätteten Bar aus. |
| KAMA, Regressionskanal (LINEARREG, LINEARREG_SLOPE, R² = CORREL²), TRIX, Ultimate Oscillator | gleich (bisher nur naive Referenz) |
| NATR | Startwert-Konvention wie ATR, gleich ab Bar 190 |
| Chaikin-Oszillator (ADOSC 3/10) | Startwert-Konvention: TA-Lib startet beide EMA mit dem ersten A/D-Wert, die Engine mit dem SMA. Gleich ab Bar 119. |
| CMO | andere Definition: TA-Lib = 2·RSI − 100 (Wilder-Glättung), Engine = Chande/Kroll mit einfachen Summen |
| ZLEMA, ALMA, McGinley Dynamic | kein TA-Lib-Gegenstück, naive Referenz |

## Erweiterung 1.4.0 (L2b): Zusammensetzung aus TA-Lib-Grundbausteinen

Für Indikatoren ohne eigenes TA-Lib-Gegenstück ist die dokumentierte Formel ein zweites Mal aus TA-Lib-Grundfunktionen zusammengesetzt: `build-talib-reference.py --set ext2`, Fixture `technical-talib-reference-aapl-ext2.json`.

Vortex, Mass Index, Choppiness, Ulcer Index, Force Index, Elder Ray, Awesome Oscillator, Coppock, KST, TSI, DPO, historische Volatilität, Z-Score, PVO und Chaikin-Volatilität stimmen an jeder Bar, einschließlich der ersten (1e-8).

Damit sind die Rechenkerne der Engine (EMA-Start, Fenster, Summen) gegen fremde geprüft. Die Formel selbst bleibt die dokumentierte.

## Erweiterung L8: zweite fremde Referenz für die übrigen 26 Indikatoren

26 Katalogindikatoren haben kein eigenes TA-Lib-Gegenstück. Für sie gibt es jetzt eine zweite Referenz auf demselben AAPL-Ausschnitt (315 Tagesbars).
- Wo pandas-ta 0.4.71b0 die dokumentierte Definition hat, rechnet pandas-ta selbst.
- Sonst ist die dokumentierte Formel ein weiteres Mal aus TA-Lib-/numpy-Bausteinen zusammengesetzt, wie bei `ext2`.

Erzeuger: `scripts/technical/build-pandasta-reference.py`, Fixture `technical-pandasta-reference-aapl.json`, Test `technical-indicators-pandasta.test.mjs`. pandas-ta rechnet dabei mit `talib=False`, damit das Ergebnis nicht davon abhängt, ob TA-Lib installiert ist.

**Ergebnis: 57 Ausgabereihen, alle gleich (1e-8).** 56 Reihen stimmen ab der ersten Bar. Nur McGinley hat eine Startwert-Konvention.

| Indikator | Referenz | Ergebnis |
|---|---|---|
| VWMA, HMA, ZLEMA, CMF, Ease of Movement, Heikin-Ashi (4 Reihen), Keltner-Mittellinie | pandas-ta | gleich ab der ersten Bar |
| Chandelier (lang, kurz) | pandas-ta (`chandelier_exit`, RMA-ATR) | gleich ab der ersten Bar. Damit stimmt auch die Wilder-ATR der Engine mit der RMA von pandas-ta überein. |
| Keltner (oben, unten) | pandas-ta EMA 20 ± 2 · ATR 10 | gleich ab der ersten Bar |
| Supertrend | Pine `ta.supertrend` (TradingView) mit pandas-ta-ATR | gleich ab der ersten Bar |
| McGinley Dynamic | pandas-ta `mcgd` | **Startwert-Konvention:** pandas-ta startet an Bar 1 mit dem Schluss, die Engine an Bar 13 mit SMA 14. Die Differenz klingt ab, gleich ab Bar 215. |
| ALMA, NVI, PVI, Klinger (KVO, Signal), Connors RSI | Formel aus TA-Lib-/numpy-Bausteinen | gleich ab der ersten Bar |
| Pivot klassisch, Fibonacci, Camarilla, Woodie (26 Reihen) | Formel aus der Vorbar | gleich ab der ersten Bar |
| ROC 63/126/252, Inside Bar, NR7, Envelope (3 Reihen), Elder Impulse | TA-Lib ROC/SMA/EMA/MACD bzw. numpy | gleich ab der ersten Bar |

**Wo pandas-ta anders definiert (deshalb nicht direkt als Referenz):**
- **ALMA:** pandas-ta rundet den Offset ab (`m = ⌊offset·(n−1)⌋`). Legoux und TradingView (`floor=false`) runden nicht, die Engine auch nicht. Ein Mutationstest belegt die Trennschärfe: Rundet die Engine ab, wird der Test rot.
- **NVI/PVI:** pandas-ta addiert die Prozentänderung als Punkte. Fosback, und mit ihm die Engine, rechnet multiplikativ: `NVI·(1+r)`.
- **Klinger:** pandas-ta rechnet vereinfacht mit Volumen · Vorzeichen(ΔHLC3). Klinger und die Engine nutzen die Volumenkraft mit dm/cm.
- **Connors RSI:** Die Serie von pandas-ta 0.4.71b0 liefert nur ±1. Connors kumuliert sie (+1, +2, …), die Engine auch. Der Rang stimmt mit `percent_rank` überein; nur liefert pandas-ta schon an Bar 100 einen Wert mit 99 gültigen Renditen. Die Referenz beginnt wie die Definition an Bar 101.
- **Supertrend:** pandas-ta zieht die Bänder anders nach (nur ohne Richtungswechsel, gegen das Vorband). Die Engine folgt Pine. Pine startet abwärts, die Engine mit Schluss ≥ Mitte. Auf dieser Stichprobe ist das an der ersten Bar dasselbe.
- **CMF:** Mit `open` rechnet pandas-ta `(C − O)/(H − L)` statt `((C − L) − (H − C))/(H − L)`. Die Referenz ruft deshalb ohne `open` auf.
- **Keltner:** pandas-ta nimmt für die Bandbreite die Länge der Mittellinie. Die Engine hat eine eigene ATR-Länge (10).

Damit hat jeder der 78 Katalogindikatoren eine fremde Referenz auf echten Kursen.

## Erweiterung L12 (indicators 1.6.0): 14 neue Katalogindikatoren

Erzeuger: `scripts/technical/build-l12-reference.py`, Fixture `technical-l12-reference-aapl.json`, Test `technical-indicators-l12.test.mjs`. Die Stichprobe ist derselbe AAPL-Ausschnitt (315 Tagesbars). Die Bibliotheken sind TA-Lib 0.8.2 und pandas-ta 0.4.71b0, beide nur in einer temporären Umgebung, keine Projektabhängigkeit.

**Ergebnis: 20 Ausgabereihen, alle gleich (1e-8).** 18 Reihen stimmen ab ihrer ersten Bar.

| Indikator | Referenz | Ergebnis |
|---|---|---|
| APO, MIDPRICE, TSF | TA-Lib | gleich ab der ersten Bar |
| schnelle Stochastik %D | TA-Lib STOCHF | gleich ab der ersten Bar |
| schnelle Stochastik %K | TA-Lib STOCHF | gleich ab Bar 15. TA-Lib gibt %K erst ab der ersten %D-Bar aus, die Engine ab Bar 13 (wie bei der langsamen Stochastik) |
| ADXR | TA-Lib ADXR | **geerbte Startwert-Konvention:** ADXR nutzt ADX und ADX₋₁₃. ADX ist gleich ab Bar 264 (siehe oben), ADXR daher ab Bar 274. Die Formel selbst prüft der Test an jeder Bar gegen die ADX-Reihe der Engine. |
| Fisher (Wert, Signal), RVGI (Wert, Signal), VHF, Efficiency Ratio, QStick | pandas-ta | gleich ab der ersten Bar |
| PVT | pandas-ta pvt / 100 | gleich ab der ersten Bar. pandas-ta nimmt die Tagesrendite in Prozent; die übliche Definition (TradingView) und die Engine nehmen den Anteil. |
| Schaff Trend Cycle | TA-Lib EMA + numpy nach Schaff | gleich ab der ersten Bar |
| Williams Alligator (3 Reihen), Williams Fractals (Preise) | numpy nach Formel | gleich ab der ersten Bar |

**Wo pandas-ta anders rechnet (deshalb nicht direkt als Referenz):**
- **Schaff Trend Cycle:** pandas-ta berechnet den ersten Stochastik-Schritt nur, wenn das MACD-Tief des Fensters positiv ist, sonst friert er den Vorwert ein. Bei negativem MACD bewegt sich der STC deshalb nicht. Schaff, und mit ihm die Engine, verlangt nur eine Spanne > 0.
- **PVT:** Faktor 100, siehe oben.

Damit haben alle 92 Katalogindikatoren eine fremde Referenz auf echten Kursen.
