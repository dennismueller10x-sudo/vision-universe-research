# Candlestick-Muster (`candlesticks.js`, L4)

Stand 27.10.2026, `technical-candlesticks-1.1.0` (58 Muster: 27 aus 1.0.0, 31 ab 1.1.0). Modul: `quant/engines/technical/candlesticks.js` (UMD, ohne Abhängigkeiten). Tests: `quant/tests/technical-candlesticks.test.mjs` (Muster aus 1.0.0), `quant/tests/technical-candlesticks-2.test.mjs` (Muster ab 1.1.0).

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

## Muster ab 1.1.0 (31)

Die Regeln folgen Bar für Bar den TA-Lib-Funktionen, einschließlich ihrer Eigenheiten. Keine dieser Funktionen prüft einen vorausgehenden Trend; die Engine tut es auch nicht. Bewusst nicht aufgenommen, weil Varianten oder trivial: CDLHIKKAKEMOD, CDLKICKINGBYLENGTH, CDLLONGLINE, CDLSHORTLINE.

| id | Kerzen | Richtung | TA-Lib | Regel (Kurzform) |
|---|---|---|---|---|
| `twoCrows` | 3 | bärisch | CDL2CROWS | lang weiß, schwarz mit Körperlücke nach oben, schwarz eröffnet im 2. und schließt im 1. Körper |
| `threeLineStrike` | 4 | Farbe der 3. | CDL3LINESTRIKE | drei gleichfarbige Kerzen (Eröffnung im Vorkörper ± Near), Gegenkerze löscht alle drei aus |
| `threeStarsInSouth` | 3 | bullisch | CDL3STARSINSOUTH | drei schwarze, kleiner werdende Kerzen mit steigenden Tiefs, letzte ohne Schatten |
| `advanceBlock` | 3 | bärisch | CDLADVANCEBLOCK | drei steigende weiße Kerzen mit schrumpfenden Körpern oder langen oberen Schatten |
| `beltHold` | 1 | Farbe | CDLBELTHOLD | langer Körper, eröffnet an seinem Extrem (kein Schatten auf der Eröffnungsseite) |
| `breakaway` | 5 | Farbe der 5. | CDLBREAKAWAY | lange Kerze, Lücke, zwei Fortsetzungen, Gegenkerze schließt in der Lücke |
| `closingMarubozu` | 1 | Farbe | CDLCLOSINGMARUBOZU | langer Körper, schließt an seinem Extrem |
| `concealingBabySwallow` | 4 | bullisch | CDLCONCEALBABYSWALL | zwei schwarze Marubozu, Lücke mit langem oberem Schatten, vierte umschließt die dritte |
| `counterattack` | 2 | Farbe der 2. | CDLCOUNTERATTACK | zwei lange Gegenkerzen mit gleichem Schluss (± Equal) |
| `dojiStar` | 2 | Gegenfarbe der 1. | CDLDOJISTAR | lange Kerze, Doji mit Körperlücke in ihrer Richtung |
| `gapSideBySideWhite` | 3 | Lückenrichtung | CDLGAPSIDESIDEWHITE | zwei gleiche weiße Kerzen nebeneinander hinter einer Körperlücke |
| `highWave` | 1 | neutral (Farbe) | CDLHIGHWAVE | kurzer Körper, beide Schatten > 2 × Körper |
| `hikkake` | 3 (liest 6) | beide | CDLHIKKAKE | Innenstab, falscher Ausbruch; Bestätigung bis 3 Bars später (siehe unten) |
| `homingPigeon` | 2 | bullisch | CDLHOMINGPIGEON | lange schwarze, kurze schwarze Kerze im ersten Körper |
| `identicalThreeCrows` | 3 | bärisch | CDLIDENTICAL3CROWS | drei schwarze Kerzen, jede eröffnet am Vortagesschluss (± Equal) |
| `inNeck` | 2 | bärisch | CDLINNECK | lange schwarze, weiße eröffnet unter dem Tief, schließt am Vortagesschluss (bis + Equal) |
| `ladderBottom` | 5 | bullisch | CDLLADDERBOTTOM | drei fallende schwarze, schwarze mit oberem Schatten, weiße schließt über deren Hoch |
| `matchingLow` | 2 | bullisch | CDLMATCHINGLOW | zwei schwarze Kerzen mit gleichem Schluss (± Equal) |
| `matHold` | 5 | bullisch | CDLMATHOLD | Rising Three Methods mit Lücke, Rücksetzer höchstens 50 % in den 1. Körper (TA-Lib-Standard 0,5) |
| `onNeck` | 2 | bärisch | CDLONNECK | lange schwarze, weiße eröffnet unter dem Tief, schließt an diesem Tief (± Equal) |
| `rickshawMan` | 1 | neutral | CDLRICKSHAWMAN | Doji mit zwei langen Schatten, Körper nahe der Spannenmitte (± Near) |
| `separatingLines` | 2 | Farbe der 2. | CDLSEPARATINGLINES | Gegenkerze eröffnet an der Vortageseröffnung, Belt Hold |
| `stalledPattern` | 3 | bärisch | CDLSTALLEDPATTERN | zwei lange weiße Kerzen, kurze weiße sitzt oben auf |
| `stickSandwich` | 3 | bullisch | CDLSTICKSANDWICH | schwarz, weiß darüber, schwarz mit gleichem Schluss wie die erste (± Equal) |
| `takuri` | 1 | bullisch | CDLTAKURI | Doji ohne oberen Schatten, unterer Schatten > 2 × Körper |
| `tasukiGap` | 3 | Farbe der 2. | CDLTASUKIGAP | Lücke, Gegenkerze schließt in der Lücke, ohne sie zu schließen |
| `thrusting` | 2 | bärisch | CDLTHRUSTING | lange schwarze, weiße eröffnet unter dem Tief, schließt über Schluss + Equal, höchstens in der Körpermitte |
| `triStar` | 3 | beide | CDLTRISTAR | drei Doji, mittlerer mit Körperlücke; TA-Lib misst alle drei am Doji-Maß der ersten Kerze |
| `uniqueThreeRiver` | 3 | bullisch | CDLUNIQUE3RIVER | lange schwarze, schwarzer Harami-Körper mit tieferem Tief, kurze weiße |
| `upsideGapTwoCrows` | 3 | bärisch | CDLUPSIDEGAP2CROWS | lang weiß, kurze schwarze mit Lücke, schwarze umschließt sie und bleibt über dem 1. Schluss |
| `xSideGapThreeMethods` | 3 | Farbe der 1. | CDLXSIDEGAP3METHODS | zwei gleichfarbige Kerzen mit Lücke, Gegenkerze schließt die Lücke |

**Hikkake** ist in TA-Lib zustandsbehaftet: Am Musterbar steht ±100, eine Bestätigung (Schluss jenseits von Hoch bzw. Tief des Innenstabs) innerhalb der drei folgenden Bars steht mit ±200 an der Bestätigungskerze; nur die erste Bestätigung zählt, ein neues Muster ersetzt das alte. Die Engine bestimmt diesen Zustand an jeder Bar aus den letzten 6 Bars neu (`span: 6`, Aufwärmphase 5 wie TA-Lib) und meldet Muster und Bestätigung mit `+1`/`−1` (Vorzeichen des Musters). Muster und Bestätigung sind im Wert nicht unterschieden; Position und Vorzeichen stimmen mit TA-Lib überein.

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

### Muster ab 1.1.0 gegen TA-Lib (ganzes Universum)

Gleiche Grundlage (5.657 Titel, 1.527.390 Bars, TA-Lib 0.8.2), verglichen ab der TA-Lib-Aufwärmphase, **mit Vorzeichen** (auch Hikkake-Bestätigungen ±200 und neutrale Muster). Übereinstimmung = gleich / (gleich + nur Engine + nur TA-Lib); Bars, an denen die Engine nicht entscheidet, sind getrennt gezählt.

| Muster | gleich | nur Engine | nur TA-Lib | TA-Lib, bei uns n. e. | Übereinstimmung | ohne Rundung |
|---|---|---|---|---|---|---|
| twoCrows | 695 | 0 | 2 | 0 | 99,71 % | 99,86 % |
| threeLineStrike | 1.275 | 0 | 0 | 0 | 100,00 % | 100,00 % |
| threeStarsInSouth | 1 | 0 | 0 | 0 | 100,00 % | 100,00 % |
| advanceBlock | 6.391 | 1 | 48 | 0 | 99,24 % | 99,92 % |
| beltHold | 257.784 | 0 | 435 | 591 | 99,83 % | 99,82 % |
| breakaway | 189 | 0 | 1 | 0 | 99,47 % | 100,00 % |
| closingMarubozu | 194.993 | 0 | 375 | 581 | 99,81 % | 99,78 % |
| concealingBabySwallow | 9 | 0 | 0 | 0 | 100,00 % | 100,00 % |
| counterattack | 1.929 | 0 | 11 | 10 | 99,43 % | 99,54 % |
| dojiStar | 31.855 | 3 | 57 | 47 | 99,81 % | 99,95 % |
| gapSideBySideWhite | 7.420 | 0 | 0 | 836 | 100,00 % | 100,00 % |
| highWave | 175.302 | 0 | 3.778 | 0 | 97,89 % | 100,00 % |
| hikkake | 175.418 | 0 | 0 | 0 | 100,00 % | 100,00 % |
| homingPigeon | 18.289 | 4 | 22 | 2 | 99,86 % | 99,93 % |
| identicalThreeCrows | 532 | 0 | 0 | 0 | 100,00 % | 100,00 % |
| inNeck | 2.295 | 0 | 4 | 2 | 99,83 % | 99,83 % |
| ladderBottom | 1.738 | 0 | 0 | 0 | 100,00 % | 100,00 % |
| matchingLow | 27.700 | 1 | 0 | 16 | 100,00 % | 100,00 % |
| matHold | 26 | 0 | 0 | 0 | 100,00 % | 100,00 % |
| onNeck | 4.040 | 0 | 3 | 1 | 99,93 % | 99,98 % |
| rickshawMan | 137.020 | 17 | 959 | 3 | 99,29 % | 100,00 % |
| separatingLines | 7.179 | 0 | 12 | 38 | 99,83 % | 99,87 % |
| stalledPattern | 2.356 | 0 | 9 | 2 | 99,62 % | 99,92 % |
| stickSandwich | 2.175 | 0 | 0 | 3 | 100,00 % | 100,00 % |
| takuri | 25.399 | 2 | 116 | 0 | 99,54 % | 100,00 % |
| tasukiGap | 6.214 | 2 | 0 | 0 | 99,97 % | 100,00 % |
| thrusting | 9.361 | 5 | 19 | 4 | 99,74 % | 99,99 % |
| triStar | 3.988 | 0 | 0 | 310 | 100,00 % | 100,00 % |
| uniqueThreeRiver | 1.863 | 0 | 2 | 1 | 99,89 % | 99,89 % |
| upsideGapTwoCrows | 462 | 0 | 1 | 0 | 99,78 % | 100,00 % |
| xSideGapThreeMethods | 8.254 | 0 | 0 | 0 | 100,00 % | 100,00 % |

In keinem Fall weicht die Richtung ab. Gesamt (Produktmodus) 99,47 %.

**Ursachen der Abweichungen:**
1. **Gleichstände** wie bei 1.0.0. Beispiel High Wave: oberer Schatten 0,02 bei Körper 0,01 ist für die Engine nicht „länger als 2 × Körper“, für TA-Lib je nach Gleitkommarest schon. Ohne Rundung erreichen High Wave, Rickshaw Man und Takuri 100,00 %.
2. **Summationsreihenfolge.** Ohne Rundung bleiben im Universum einzelne Abweichungen (Belt Hold und Closing Marubozu je rund 0,2 %, sonst ≤ 0,5 %). TA-Lib führt die Fenstersumme laufend (+ neu − alt), die Engine bildet sie aus Präfixsummen; bei Körper = Mittel entscheidet dann der Rest unterschiedlich. Auf der eingefrorenen Teilmenge verschwinden ohne Rundung alle Abweichungen (Test); für das ganze Universum ist die Ursache nicht einzeln nachgewiesen.
3. **Fenster ohne Bewegung.** TA-Lib-Treffer, an denen die Engine „nicht entscheidbar“ meldet (Spalte „bei uns n. e.“), liegen in Mittelungsfenstern der Spanne 0. TA-Lib wertet dort z. B. jeden Körper > 0 als „lang“.

**Eingefrorene Teilmenge im Test** (`technical-talib-candles-2.json`, 135 KB, `build-talib-reference.py --set candles2`): TA-Lib-Signale auf den 38 Titeln der ersten Fixture (Bars nur dort) und 27 konstruierte Kerzenfolgen für die seltenen Muster (Concealing Baby Swallow, Mat Hold einschließlich Gegenprobe mit 57 % Eindringtiefe, Upside Gap Two Crows, Three Stars in the South, Two Crows, Breakaway in beiden Richtungen). Jedes der 31 Muster hat dort mindestens drei TA-Lib-Treffer. Geprüft wird:
- Im Produktmodus Bar für Bar gleich bis auf 25 einzeln aufgezählte Gleichstände (Belt Hold 1, Closing Marubozu 2, High Wave 13, Homing Pigeon 1, Rickshaw Man 7, Takuri 1).
- Ohne Rundung keine einzige Abweichung.
- „Nicht entscheidbar“ nur bei einem Mittelungsfenster der Spanne 0 (unabhängig nachgerechnet).
- Hikkake: alle 1.078 TA-Lib-Signale (davon 231 Bestätigungen ±200) an derselben Bar mit demselben Vorzeichen.

Mutationsprobe: Thrusting-Schwelle 45 % statt 50 % der Körpermitte, Mat-Hold-Eindringtiefe 0,3 oder 0,7 statt 0,5, Hikkake-Bestätigungsfenster 2 statt 3 Bars und High Wave mit ShadowLong statt ShadowVeryLong lassen je zwei bis drei Tests scheitern.

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

Muster ab 1.1.0:

| Muster | bullisch | bärisch | am Stichtag | nicht entscheidbar |
|---|---|---|---|---|
| twoCrows | 0 | 695 | 4 | 36.826 |
| threeLineStrike | 615 | 660 | 4 | 44.002 |
| threeStarsInSouth | 1 | 0 | 0 | 38.205 |
| advanceBlock | 0 | 6.392 | 69 | 51.255 |
| beltHold | 129.689 | 128.095 | 775 | 37.230 |
| breakaway | 97 | 92 | 0 | 36.414 |
| closingMarubozu | 88.864 | 106.129 | 515 | 37.230 |
| concealingBabySwallow | 9 | 0 | 0 | 37.227 |
| counterattack | 915 | 1.014 | 7 | 42.625 |
| dojiStar | 16.755 | 15.103 | 124 | 37.604 |
| gapSideBySideWhite | 4.360 | 3.078 | 21 | 42.674 |
| highWave | 99.683 | 75.619 | 811 | 37.230 |
| hikkake | 89.597 | 85.821 | 861 | 0 |
| homingPigeon | 18.293 | 0 | 53 | 37.733 |
| identicalThreeCrows | 0 | 532 | 2 | 43.744 |
| inNeck | 0 | 2.295 | 3 | 42.566 |
| ladderBottom | 1.748 | 0 | 0 | 36.367 |
| matchingLow | 27.701 | 0 | 141 | 42.674 |
| matHold | 26 | 0 | 0 | 38.508 |
| onNeck | 0 | 4.040 | 5 | 42.566 |
| rickshawMan | 137.037 | 0 | 646 | 42.430 |
| separatingLines | 3.205 | 3.985 | 20 | 42.633 |
| stalledPattern | 0 | 2.356 | 19 | 44.164 |
| stickSandwich | 2.175 | 0 | 3 | 42.445 |
| takuri | 25.401 | 0 | 80 | 36.567 |
| tasukiGap | 2.914 | 3.315 | 28 | 42.674 |
| thrusting | 0 | 9.366 | 14 | 42.566 |
| triStar | 2.027 | 1.961 | 22 | 36.165 |
| uniqueThreeRiver | 1.863 | 0 | 8 | 38.136 |
| upsideGapTwoCrows | 0 | 462 | 2 | 37.529 |
| xSideGapThreeMethods | 3.838 | 4.416 | 20 | 0 |

Nicht entscheidbar sind je Muster rund 37.000 bis 44.000 Bars (2,4–2,9 %), meist durch Mittelungsfenster ohne Bewegung oder durch Kurslücken. Engulfing, Three Outside, Hikkake und Upside/Downside Gap Three Methods nutzen kein Mittel und haben 0. Advance Block nutzt neun Mittel und hat mit 51.255 die meisten.

Die Häufigkeit ist keine Aussage über die Wirkung. Trefferquoten mit Definition, Stichprobe und Mehrfachtest-Korrektur sind ein eigener Schritt (wie `formation-evidence.json`).
