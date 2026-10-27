# Candlestick-Muster (`candlesticks.js`, L4)

Stand 27.10.2026, `technical-candlesticks-1.0.0`. Modul: `quant/engines/technical/candlesticks.js` (UMD, ohne Abhängigkeiten). Test: `quant/tests/technical-candlesticks.test.mjs`.

**Bibliothek; Screener-Felder vorgeschlagen.** Keine Chartebene, keine Materialisierung. Die Screener-Felder (Muster am Stichtag, „Tage seit“) sind der Fachmodell-PR L6: [SCREENER_FIELDS_L6.md](SCREENER_FIELDS_L6.md).

## Schnittstelle

- `detect(series, {only?})` liefert `{version, patterns: {id: Reihe}}`. Je Bar steht `+1` (bullisch), `−1` (bärisch), `0` (kein Muster) oder `NaN` (nicht entscheidbar). Das Signal steht an der **letzten** Kerze des Musters.
- `atCutoff(series)` liefert die Treffer der letzten Bar (Stichtag).
- `PATTERNS` enthält je Muster `id`, `name`, Kerzenzahl, Richtung, TA-Lib-Gegenstück, Regel als Text und Aufwärmphase.

**Kausal:** Bar *i* nutzt nur Bars ≤ *i* (Test mit abgeschnittener und vergifteter Zukunft).

**Nicht entscheidbar:**
- Aufwärmphase.
- Fehlender Kurs in einer benutzten Kerze oder im Mittelungsfenster.
- Mittelungsfenster ohne Bewegung: Ist die mittlere Spanne 0, gibt es keinen Maßstab, etwa bei ruhenden Titeln. Eine Lücke wird nie als „kein Muster“ geraten.

## Maßstab

Körper- und Schattenlängen werden relativ zur jüngeren Kerzenhistorie bewertet. Verwendet werden die dokumentierten Standardeinstellungen von TA-Lib:

| Einstellung | Bezug | Fenster | Faktor |
|---|---|---|---|
| BodyLong / BodyShort | Körper | 10 Vorbars | 1,0 |
| BodyVeryLong | Körper | 10 | 3,0 |
| BodyDoji | Spanne H−L | 10 | 0,1 |
| ShadowLong / ShadowVeryLong | eigener Körper | – | 1,0 / 2,0 |
| ShadowShort | (oben + unten)/2 | 10 | 1,0 |
| ShadowVeryShort | Spanne H−L | 10 | 0,1 |
| Near / Far / Equal | Spanne H−L | 5 | 0,2 / 0,6 / 0,05 |

„Mittel“ ist das Mittel über die Fenster-Kerzen **vor** der Bezugskerze.

**Gleichstände:** Körper, Schatten und Mittel werden auf 10 signifikante Stellen gerundet. Ein Körper von 0,14 bei einem Mittel von 0,14 ist damit nicht „lang“. TA-Lib entscheidet solche Fälle nach dem Gleitkommarest der Subtraktion.

## Muster (27)

| id | Kerzen | Richtung | TA-Lib | Regel (Kurzform) |
|---|---|---|---|---|
| `doji` | 1 | neutral | CDLDOJI | Körper ≤ 10 % der mittleren Spanne |
| `dragonflyDoji` | 1 | bullisch | CDLDRAGONFLYDOJI | Doji, kein oberer, langer unterer Schatten |
| `gravestoneDoji` | 1 | bärisch | CDLGRAVESTONEDOJI | Doji, kein unterer, langer oberer Schatten (TA-Lib meldet +100) |
| `longLeggedDoji` | 1 | neutral | CDLLONGLEGGEDDOJI | Doji mit mindestens einem Schatten > Körper |
| `hammer` | 1 | bullisch | CDLHAMMER | kurzer Körper, unterer Schatten > Körper, kein oberer, am Vortagestief |
| `hangingMan` | 1 | bärisch | CDLHANGINGMAN | Hammerform am Vortageshoch |
| `invertedHammer` | 2 | bullisch | CDLINVERTEDHAMMER | kurzer Körper, langer oberer Schatten, Körperlücke nach unten |
| `shootingStar` | 2 | bärisch | CDLSHOOTINGSTAR | dieselbe Form mit Körperlücke nach oben |
| `marubozu` | 1 | Farbe | CDLMARUBOZU | langer Körper, keine Schatten |
| `spinningTop` | 1 | neutral (Farbe) | CDLSPINNINGTOP | kurzer Körper, beide Schatten länger als der Körper |
| `engulfing` | 2 | Farbe der 2. | CDLENGULFING | 2. Körper umschließt den 1., Gegenfarbe |
| `harami` | 2 | Gegenfarbe der 1. | CDLHARAMI | langer 1. Körper, kurzer 2. innerhalb |
| `haramiCross` | 2 | Gegenfarbe der 1. | CDLHARAMICROSS | Harami mit Doji |
| `piercing` | 2 | bullisch | CDLPIERCING | lange schwarze, lange weiße Kerze: Eröffnung unter dem Tief, Schluss über der Körpermitte |
| `darkCloudCover` | 2 | bärisch | CDLDARKCLOUDCOVER | Spiegelbild des Piercing |
| `tweezer` | 2 | beide | – | gleiches Tief (Bottom) bzw. gleiches Hoch (Top) nach langer Gegenkerze, Abstand ≤ Equal |
| `kicking` | 2 | Farbe der 2. | CDLKICKING | zwei gegenfarbige Marubozu mit Kerzenlücke |
| `morningStar` | 3 | bullisch | CDLMORNINGSTAR | lang schwarz, kurzer Stern mit Körperlücke, weiß bis 30 % in den 1. Körper |
| `eveningStar` | 3 | bärisch | CDLEVENINGSTAR | Spiegelbild |
| `morningDojiStar` | 3 | bullisch | CDLMORNINGDOJISTAR | Morning Star mit Doji |
| `eveningDojiStar` | 3 | bärisch | CDLEVENINGDOJISTAR | Evening Star mit Doji |
| `abandonedBaby` | 3 | beide | CDLABANDONEDBABY | Doji mit Kerzenlücken auf beiden Seiten |
| `threeWhiteSoldiers` | 3 | bullisch | CDL3WHITESOLDIERS | drei weiße Kerzen, steigend, kaum obere Schatten |
| `threeBlackCrows` | 4 | bärisch | CDL3BLACKCROWS | nach weißer Kerze drei schwarze, fallend, kaum untere Schatten |
| `threeInside` | 3 | beide | CDL3INSIDE | Harami plus Bestätigung |
| `threeOutside` | 3 | beide | CDL3OUTSIDE | Engulfing plus Bestätigung |
| `threeMethods` | 5 | beide | CDLRISEFALL3METHODS | Rising/Falling Three Methods |

Die vollständige Regel steht je Muster in `PATTERNS[].rule` und im Code.

## Prüfung

### Gegen TA-Lib auf echten Kursen (ganzes Universum)

Grundlage: 5.657 Titel × 270 echte Tagesbars aus `technical-signals-v1`, Stand 26.10.2026, zusammen 1.527.390 Bars. TA-Lib 0.8.2, verglichen ab der TA-Lib-Aufwärmphase.

| Muster | gleich | nur Engine | nur TA-Lib | Übereinstimmung |
|---|---|---|---|---|
| doji | 248.213 | 32 | 0 | 99,99 % |
| dragonflyDoji | 25.522 | 2 | 2 | 99,98 % |
| gravestoneDoji | 33.989 | 7 | 3 | 99,97 % |
| longLeggedDoji | 211.127 | 31 | 142 | 99,92 % |
| hammer | 32.948 | 1 | 477 | 98,57 % |
| hangingMan | 24.009 | 0 | 193 | 99,20 % |
| invertedHammer | 31.568 | 0 | 201 | 99,37 % |
| shootingStar | 18.589 | 0 | 133 | 99,29 % |
| marubozu | 83.707 | 0 | 166 | 99,80 % |
| spinningTop | 291.666 | 0 | 5.061 | 98,29 % |
| engulfing | 134.404 | 0 | 0 | 100 % |
| harami | 124.736 | 100 | 204 | 99,76 % |
| haramiCross | 44.958 | 5 | 85 | 99,80 % |
| piercing | 4.242 | 8 | 9 | 99,60 % |
| darkCloudCover | 4.639 | 15 | 10 | 99,46 % |
| kicking | 77 | 0 | 0 | 100 % |
| morningStar | 6.145 | 4 | 21 | 99,59 % |
| eveningStar | 6.177 | 7 | 13 | 99,68 % |
| morningDojiStar | 2.354 | 0 | 9 | 99,62 % |
| eveningDojiStar | 2.288 | 0 | 7 | 99,69 % |
| abandonedBaby | 132 | 0 | 0 | 100 % |
| threeWhiteSoldiers | 496 | 0 | 1 | 99,80 % |
| threeBlackCrows | 361 | 0 | 0 | 100 % |
| threeInside | 18.202 | 10 | 32 | 99,77 % |
| threeOutside | 46.933 | 0 | 0 | 100 % |
| threeMethods | 333 | 0 | 1 | 99,70 % |

In keinem Fall weicht die Richtung ab.

**Ursachen der Abweichungen:**
1. **Gleichstände.** Ein Beispiel: Spinning Top mit Körper 0,01 und unterem Schatten 0,01. TA-Lib wertet ihn je nach Gleitkommarest als „Schatten länger als Körper“. Die Engine wertet ihn nicht so.
   - Ohne Rundung (`roundTies: false`, nur für den Nachweis) steigt die Übereinstimmung bei allen Mustern auf ≥ 99,58 %.
   - Spinning Top erreicht dann 100,00 %, Hammer 99,98 %.
   - Die Regeln sind damit dieselben.
2. **Fenster ohne Bewegung.** 32.961 TA-Lib-Doji liegen in Fenstern mit mittlerer Spanne 0, also bei ruhenden Titeln. Die Engine meldet dort „nicht entscheidbar“ und kein Muster.
3. **Aufwärmphase.** Die Engine entscheidet teils eine Bar früher, wenn alle benutzten Mittel vorhanden sind. Verglichen wird erst ab der TA-Lib-Aufwärmphase.

**Eingefrorene Teilmenge im Test:** 38 Titel, darunter alle seltenen Muster. Geprüft wird:
- Ohne Rundung je Muster ≥ 99,5 %.
- Im Produktmodus je Muster mit ≥ 20 Fällen ≥ 98 %, gesamt ≥ 99 %.
- Nie eine abweichende Richtung.

Mutationsprobe: Eine auf 40 % gesenkte Piercing-Schwelle und eine 1,5-fache Doji-Schwelle lassen je drei Tests scheitern.

### Konstruierte Fälle, Kausalität, Lücken

- Je Muster mindestens ein positiver Fall, wo sinnvoll auch ein negativer.
- Kausalität an 4 Schnittpunkten auf AAPL mit abgeschnittener und vergifteter Zukunft.
- Determinismus.
- Aufwärmphase, Wertebereich und Lücken: Die betroffene Kerze und das 10er-Mittel sind nicht entscheidbar, danach wieder entscheidbar.

### Häufigkeit im Universum (Stand 26.10.2026)

| Muster | bullisch | bärisch | am Stichtag |
|---|---|---|---|
| doji | 248.245 (neutral) | – | 1.162 |
| spinningTop | 156.653 | 135.013 | 1.336 |
| engulfing | 60.217 | 74.731 | 464 |
| harami | 64.478 | 60.358 | 453 |
| marubozu | 39.238 | 44.469 | 230 |
| hammer / hangingMan | 33.044 | 24.074 | 113 / 89 |
| invertedHammer / shootingStar | 31.695 | 18.603 | 140 / 120 |
| tweezer | 19.164 | 15.598 | 101 |
| morningStar / eveningStar | 6.149 | 6.184 | 33 / 13 |
| piercing / darkCloudCover | 4.250 | 4.654 | 4 / 10 |
| threeWhiteSoldiers / threeBlackCrows | 496 | 363 | 3 / 2 |
| threeMethods | 153 | 180 | 2 |
| abandonedBaby | 66 | 66 | 1 |
| kicking | 34 | 43 | 1 |

Nicht entscheidbar sind je Muster rund 37.000 bis 44.000 Bars (2,4–2,9 %), meist durch Mittelungsfenster ohne Bewegung oder durch Kurslücken. Engulfing und Three Outside nutzen kein Mittel und haben 0.

Die Häufigkeit ist keine Aussage über die Wirkung. Trefferquoten mit Definition, Stichprobe und Mehrfachtest-Korrektur sind ein eigener Schritt (wie `formation-evidence.json`).
