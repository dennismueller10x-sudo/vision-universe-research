# Historische Evidenz der Kerzenmuster

Stand 28.10.2026 (Marktphasen ergänzt), `technical-candlesticks-1.1.0` (58 Muster), Datenstand 26.10.2026.
- Skript: `scripts/technical/candlestick-evidence.mjs`. Es schreibt nur mit `--out` und ist kein Produktartefakt.
- Test der Bausteine: `quant/tests/technical-candlestick-evidence.test.mjs`.

Die Bibliothek (CANDLESTICKS.md) beantwortet, ob ein Muster richtig **erkannt** wird. Diese Auswertung beschreibt, was danach im Mittel geschah. Sie empfiehlt nichts.

## Methode

**Stichprobe:**
- 5.657 Titel aus `technical-signals-v1`, je 270 Tagesbars, splitbereinigt.
- Für die meisten Titel umfasst das rund ein Jahr. Bei ruhenden Titeln mit Lücken reicht es weiter zurück, das gesamte Fenster läuft vom 27.01.2022 bis 26.10.2026.

**Ereignis:** ein Treffer von `candlesticks.js` am Schluss des letzten Musterbars i. Die Erkennung ist kausal; Bar i nutzt nur Bars bis i.

**Maß:** die Überrendite vom Schluss i bis zum Schluss i+H, für H = 5, 10 und 20 Handelstage.
- Davon abgezogen wird das Mittel aller Titel desselben Datums. Es zählt nur, wenn an dem Datum mindestens 50 Titel liegen.
- Bärische Muster gehen mit umgekehrtem Vorzeichen ein. Positiv heißt deshalb immer: „in Musterrichtung besser als der Markt“.
- Neutrale Muster gehen ohne Vorzeichenwechsel ein.

**Intervall:**
- Ereignisse desselben Tages sind nicht unabhängig, und die Renditefenster überlappen. Mittel und 95-%-Intervall werden deshalb über **Datums-Cluster** gerechnet: erst das Mittel je Tag, dann über die Tage.
- Ein naives Intervall über Einzelereignisse hätte bei H = 20 14 statt 6 Zeilen als signifikant ausgewiesen.

**Signifikanz:** Bonferroni über alle gemeldeten Zeilen und Horizonte (71 × 3, z = 3,68).

**Mindestgröße:** Gemeldet wird eine Zeile ab 100 Ereignissen.
- Nicht gemeldet sind Kicking, Breakaway, Abandoned Baby, Mat Hold, Concealing Baby Swallow und Three Stars in the South.
- Sie haben 1 bis 93 Ereignisse je Richtung.

## Ergebnis (H = 20 Handelstage)

**Gesamtbild:**
- 71 Zeilen werden gemeldet, 66 davon gerichtet.
- In Musterrichtung positiv: **33 von 66**, also genau die Hälfte.
- Signifikant nach Bonferroni: 6 Zeilen. **Fünf davon laufen gegen die Musterrichtung.**

| Muster | Richtung | Ereignisse | Tage | Überrendite 20 T (Datums-Mittel ± KI95) | Lesart |
|---|---|---|---|---|---|
| Dragonfly Doji | bullisch | 23.564 | 293 | −3,07 ± 0,77 % | gegen die Richtung |
| Takuri | bullisch | 23.404 | 293 | −3,00 ± 0,78 % | gegen die Richtung |
| Stick Sandwich | bullisch | 2.011 | 247 | −2,88 ± 1,48 % | gegen die Richtung |
| Tweezer | bullisch | 17.487 | 293 | −1,96 ± 0,87 % | gegen die Richtung |
| Matching Low | bullisch | 25.353 | 293 | −1,84 ± 0,80 % | gegen die Richtung |
| Gravestone Doji | bärisch | 31.294 | 293 | +1,98 ± 0,74 % | in Richtung (Kurs fiel relativ) |

Die übrigen 65 Zeilen haben kein signifikantes Ergebnis. Darunter sind Engulfing, Harami, Hammer, Morning/Evening Star, Three White Soldiers und Three Black Crows. Die vollständige Tabelle für alle drei Horizonte liefert `node scripts/technical/candlestick-evidence.mjs`.

## Einordnung

**Kein Beleg für eine Prognosekraft.**
- Gerichtete Muster liegen in diesem Fenster genau zur Hälfte in Musterrichtung.
- Die wenigen signifikanten Zeilen laufen überwiegend gegen die vom Namen versprochene Richtung. Eine Ursache ist damit nicht belegt.

**Mögliche Verzerrung durch Kleinwerte (nicht bereinigt):**
- Die Doji- und Schattenmuster sind bei Titeln unter 5 $ überrepräsentiert: 26,6–31,2 % ihrer Ereignisse gegenüber 22,8 % aller Ereignisse.
- Solche Titel haben oft flache Kerzen und eine eigene Renditeverteilung.
- Eine Aufteilung nach Liquidität oder Kursniveau ist nicht Teil dieser Auswertung.

**Ein Fenster, ein Regime:** Die Aussagen gelten für das gemessene Jahr. Eine Auswertung über längere Historie bräuchte die volle Tageshistorie aus dem Materialisierungslauf.

**Für den Screener (L6, #1004):** Die Kerzenfelder sind als **Beschreibung** sinnvoll: „Welche Titel zeigen heute ein Engulfing?“ Als Signal mit Erwartungswert sind sie es nicht. Labels und Doku dürfen keine Wirkung versprechen; das gilt wie für die Formationen.

## Marktphasen und Zeithälften (ab 1.1.0)

Diese Auswertung prüft, ob eine Aussage nur in einem Teil des Fensters gilt. `candlestick-evidence.mjs` meldet je Zeile zusätzlich die Überrendite +20 in vier Teilmengen (Modul `scripts/technical/evidence-phases.mjs`, Test `technical-evidence-phases.test.mjs`).

**Teilmengen:**
- **UP / DOWN:** SPY-Schluss am Ereignisdatum über bzw. unter seinem SMA 50, gerechnet nur aus Schlüssen bis zu diesem Datum.
  - Im Tagesfenster gab es 210 UP- und 61 DOWN-Tage mit 30 Wechseln.
  - Der SMA 200 taugt hier nicht: SPY lag nur an 13 von 271 Tagen darunter.
- **H1 / H2:** Ereignisse vor bzw. ab dem Median aller Ereignisdaten (hier 2026-04-20). Jede Hälfte enthält etwa gleich viele Ereignisse.

**Signifikanz und Stabilität:**
- Signifikanz (✱) nach Bonferroni über Zeilen × 4 Teilmengen (z = 3,75), mit Mittel und Intervall über Datums-Cluster wie oben.
- **Stabil** heißt: In allen vier Teilmengen (je ≥ 30 Ereignisse) hat das Mittel dasselbe Vorzeichen.

**Ergebnis:** Von den 71 gemeldeten Muster-Zeilen sind 35 widersprüchlich (Vorzeichen wechselt zwischen den Teilmengen). 35 sind stabil, davon 15 positiv und 20 negativ. Eine Zeile (Three Methods bullisch) hat zu wenige Ereignisse für die Prüfung.

Das wiederkehrende Bild der stabilen Zeilen: Alle 19 stabilen bullischen Muster haben in jeder Teilmenge eine negative, alle 15 stabilen bärischen eine positive richtungsbereinigte Überrendite. Dazu kommt Long-Legged Doji (neutral) mit stabil negativer Überrendite. Nach jedem Signal blieb der Titel also hinter dem Querschnitt zurück, unabhängig von der Richtung des Signals.

Das spricht eher für einen allgemeinen Effekt in diesem Jahr als für einen Wert des einzelnen Signals. Signale treten häufiger bei beweglichen, volatilen Titeln auf, und diese liefen schwächer. Die Teilmengen bestätigen damit die Einordnung oben: Kein Signal taugt hier als Kaufsignal. Die bärischen Lesarten wirken nur, weil ohnehin alles mit Signal schwächer lief.

Grenzen: Das ist weiterhin ein Fenster von rund einem Jahr. UP und DOWN sind kurze Phasen innerhalb eines Aufwärtsjahrs, kein Bärenmarkt. Survivorship ist wie oben nicht bereinigt. Längere Historie mit echten Marktphasen deckt die Wochen-Evidenz ab ([WEEKLY_EVIDENCE.md](WEEKLY_EVIDENCE.md)).

| Muster | Richtung | +20 alle | UP | DOWN | H1 | H2 | stabil |
|---|---|---|---|---|---|---|---|
| threeMethods | bullisch | +4,39 % | −2,10 % (125) | +32,48 % (18) | +7,92 % (88) | −0,15 % (55) | zu wenig |
| longLeggedDoji | neutral | −0,79 % | −0,94 % (150.831) | −0,13 % (43.677) | −1,16 % (104.317) | −0,19 % (90.191) | ja (−) |
| beltHold | bullisch | −0,47 % | −0,50 % (93.380) | −0,33 % (26.823) | −0,46 % (66.484) | −0,48 % (53.719) | ja (−) |
| closingMarubozu | bärisch | +0,35 % | +0,21 % (73.258) | +0,95 % (24.026) | +0,56 % (49.905) | +0,02 % (47.379) | ja (+) |
| closingMarubozu | bullisch | −1,16 % | −0,84 % (63.615) | −2,51 % ✱ (18.352) | −1,23 % (45.158) | −1,04 % ✱ (36.809) | ja (−) |
| hikkake | bärisch | +0,63 % | +0,68 % (63.527) | +0,44 % (16.070) | +0,94 % (44.519) | +0,14 % (35.078) | ja (+) |
| harami | bullisch | −0,95 % | −0,73 % (45.886) | −1,87 % (13.451) | −1,06 % (29.756) | −0,77 % (29.581) | ja (−) |
| harami | bärisch | +1,24 % | +1,13 % (41.737) | +1,70 % (13.837) | +1,35 % (30.129) | +1,07 % ✱ (25.445) | ja (+) |
| engulfing | bullisch | −0,42 % | −0,45 % (42.902) | −0,28 % (12.381) | −0,20 % (32.211) | −0,78 % (23.072) | ja (−) |
| marubozu | bullisch | −1,50 % | −1,15 % (28.480) | −2,95 % ✱ (7.880) | −1,74 % (19.800) | −1,10 % ✱ (16.560) | ja (−) |
| gravestoneDoji | bärisch | +1,98 % ✱ | +1,71 % ✱ (24.359) | +3,14 % ✱ (6.935) | +2,72 % ✱ (16.621) | +0,81 % (14.673) | ja (+) |
| invertedHammer | bullisch | −1,11 % | −0,69 % (21.913) | −2,79 % ✱ (7.318) | −1,30 % (15.378) | −0,82 % (13.853) | ja (−) |
| matchingLow | bullisch | −1,84 % ✱ | −1,75 % (20.230) | −2,22 % (5.123) | −2,75 % ✱ (13.030) | −0,47 % (12.323) | ja (−) |
| threeOutside | bärisch | +0,84 % | +0,59 % (18.881) | +1,83 % (5.188) | +1,25 % (13.137) | +0,24 % (10.932) | ja (+) |
| dragonflyDoji | bullisch | −3,07 % ✱ | −2,81 % ✱ (18.759) | −4,14 % ✱ (4.805) | −3,73 % ✱ (12.967) | −2,07 % ✱ (10.597) | ja (−) |
| takuri | bullisch | −3,00 % ✱ | −2,69 % ✱ (18.621) | −4,27 % ✱ (4.783) | −3,52 % ✱ (12.854) | −2,19 % ✱ (10.550) | ja (−) |
| hangingMan | bärisch | +1,88 % | +1,19 % (18.393) | +4,73 % ✱ (3.867) | +1,72 % (12.493) | +2,11 % ✱ (9.767) | ja (+) |
| haramiCross | bullisch | −1,20 % | −0,98 % (16.519) | −2,08 % (4.815) | −1,13 % (10.735) | −1,31 % ✱ (10.599) | ja (−) |
| haramiCross | bärisch | +1,59 % | +1,74 % (15.052) | +1,00 % (4.916) | +1,88 % (10.905) | +1,17 % ✱ (9.063) | ja (+) |
| threeOutside | bullisch | −1,79 % | −1,18 % (15.460) | −4,16 % ✱ (3.662) | −1,80 % (11.719) | −1,77 % ✱ (7.403) | ja (−) |
| tweezer | bullisch | −1,96 % ✱ | −1,74 % (13.389) | −2,85 % (4.098) | −2,30 % (9.358) | −1,45 % ✱ (8.129) | ja (−) |
| homingPigeon | bullisch | −1,02 % | −0,69 % (13.058) | −2,31 % (3.826) | −1,76 % (8.053) | −0,01 % (8.831) | ja (−) |
| dojiStar | bärisch | +0,91 % | +0,29 % (11.107) | +3,28 % (2.775) | +0,85 % (7.802) | +0,99 % (6.080) | ja (+) |
| threeInside | bärisch | +0,54 % | +0,24 % (5.922) | +1,60 % (2.350) | +0,17 % (4.165) | +1,00 % (4.107) | ja (+) |
| advanceBlock | bärisch | +1,19 % | +0,41 % (4.872) | +3,94 % ✱ (1.133) | +0,84 % (3.646) | +1,61 % (2.359) | ja (+) |
| darkCloudCover | bärisch | +1,52 % | +1,42 % (3.355) | +1,92 % (825) | +2,18 % (2.180) | +0,66 % (2.000) | ja (+) |
| gapSideBySideWhite | bullisch | −1,23 % | −0,39 % (3.156) | −4,24 % ✱ (834) | −0,90 % (2.184) | −1,65 % ✱ (1.806) | ja (−) |
| tasukiGap | bullisch | −1,20 % | −0,22 % (2.135) | −4,60 % (535) | −1,49 % (1.390) | −0,86 % (1.280) | ja (−) |
| eveningDojiStar | bärisch | +1,10 % | +0,79 % (1.641) | +2,20 % (472) | +0,62 % (1.186) | +1,64 % (927) | ja (+) |
| stickSandwich | bullisch | −2,88 % ✱ | −2,30 % (1.604) | −5,01 % (407) | −3,28 % (980) | −2,39 % (1.031) | ja (−) |
| uniqueThreeRiver | bullisch | −1,28 % | −0,90 % (1.302) | −2,61 % (430) | −1,48 % (844) | −1,06 % (888) | ja (−) |
| counterattack | bärisch | +1,65 % | +1,52 % (690) | +2,04 % (210) | +1,90 % (487) | +1,33 % (413) | ja (+) |
| counterattack | bullisch | −1,81 % | −0,57 % (518) | −5,57 % (281) | −2,43 % (461) | −1,12 % (338) | ja (−) |
| twoCrows | bärisch | +1,58 % | +0,45 % (528) | +5,81 % (99) | +2,46 % (347) | +0,60 % (280) | ja (+) |
| threeLineStrike | bullisch | −3,40 % | −3,87 % (462) | −1,82 % (114) | −2,17 % (355) | −4,94 % (221) | ja (−) |
| threeBlackCrows | bärisch | +1,31 % | +1,05 % (261) | +2,40 % (63) | +2,34 % (158) | +0,35 % (166) | ja (+) |
| spinningTop | neutral | −0,14 % | −0,24 % (206.615) | +0,30 % (61.927) | −0,11 % (142.991) | −0,18 % (125.551) | nein |
| doji | neutral | +0,10 % | −0,41 % (176.517) | +2,35 % (51.623) | +0,28 % (122.224) | −0,17 % (105.916) | nein |
| highWave | neutral | −0,35 % | −0,54 % (124.183) | +0,48 % (37.142) | −0,50 % (85.778) | −0,11 % (75.547) | nein |
| rickshawMan | neutral | +0,12 % | −0,28 % (97.944) | +1,80 % (28.463) | +0,32 % (67.963) | −0,22 % (58.444) | nein |
| beltHold | bärisch | +0,65 % | +0,68 % (89.645) | +0,52 % (26.985) | +1,10 % (61.002) | −0,08 % (55.628) | nein |
| hikkake | bullisch | −0,69 % | −1,14 % (64.146) | +1,21 % (18.660) | −0,82 % (44.905) | −0,48 % (37.901) | nein |
| engulfing | bärisch | +0,38 % | −0,04 % (54.728) | +2,18 % ✱ (13.820) | +0,31 % (37.925) | +0,48 % (30.623) | nein |
| marubozu | bärisch | +0,01 % | −0,26 % (30.913) | +1,16 % (9.530) | +0,15 % (21.033) | −0,22 % (19.410) | nein |
| hammer | bullisch | −0,63 % | −2,40 % ✱ (22.896) | +6,57 % (7.312) | +0,25 % (16.114) | −1,95 % ✱ (14.094) | nein |
| shootingStar | bärisch | −0,63 % | −1,40 % (13.610) | +2,35 % (3.633) | −1,29 % (9.498) | +0,29 % (7.745) | nein |
| dojiStar | bullisch | +0,83 % | +1,07 % (11.225) | −0,03 % (3.971) | +2,05 % (7.959) | −0,75 % (7.237) | nein |
| tweezer | bärisch | +0,39 % | −0,30 % (11.281) | +3,15 % ✱ (3.017) | +0,73 % (7.971) | −0,08 % (6.327) | nein |
| threeInside | bullisch | −0,34 % | +0,32 % (6.676) | −2,77 % (1.977) | −0,40 % (4.464) | −0,27 % (4.189) | nein |
| thrusting | bärisch | +0,35 % | −0,19 % (5.916) | +2,29 % (2.594) | −0,21 % (4.789) | +1,05 % (3.721) | nein |
| eveningStar | bärisch | −0,49 % | −1,45 % (4.500) | +2,81 % (1.247) | −0,49 % (3.256) | −0,50 % (2.491) | nein |
| morningStar | bullisch | +0,63 % | +1,45 % (4.412) | −2,25 % (1.151) | +2,78 % (2.951) | −1,98 % (2.612) | nein |
| xSideGapThreeMethods | bärisch | +1,13 % | +0,58 % (3.390) | +3,08 % (672) | +2,59 % (2.058) | −0,67 % (2.004) | nein |
| piercing | bullisch | −0,23 % | +0,39 % (2.595) | −2,41 % (1.221) | −1,35 % (2.247) | +1,09 % (1.569) | nein |
| separatingLines | bärisch | −1,67 % | −2,78 % (2.693) | +2,27 % (960) | −0,52 % (1.940) | −3,08 % (1.713) | nein |
| onNeck | bärisch | −1,39 % | −0,31 % (2.628) | −5,10 % (1.022) | −3,73 % (1.926) | +1,38 % (1.724) | nein |
| xSideGapThreeMethods | bullisch | −0,51 % | +0,02 % (2.895) | −2,44 % (721) | −0,99 % (1.985) | +0,11 % (1.631) | nein |
| tasukiGap | bärisch | +1,18 % | +3,16 % (2.506) | −5,83 % (544) | −1,25 % (1.515) | +4,19 % ✱ (1.535) | nein |
| separatingLines | bullisch | +0,13 % | +1,03 % (2.405) | −3,12 % (535) | +1,17 % (1.537) | −1,17 % (1.403) | nein |
| gapSideBySideWhite | bärisch | −1,84 % | −0,81 % (2.113) | −5,63 % (698) | −3,92 % (1.506) | +0,85 % (1.305) | nein |
| stalledPattern | bärisch | +0,88 % | −0,37 % (1.780) | +5,08 % (443) | +1,18 % (1.388) | +0,53 % (835) | nein |
| morningDojiStar | bullisch | −1,10 % | −0,40 % (1.685) | −3,44 % (446) | +0,08 % (1.153) | −2,44 % (978) | nein |
| inNeck | bärisch | +0,79 % | +0,09 % (1.453) | +3,20 % (613) | −0,56 % (1.167) | +2,32 % (899) | nein |
| triStar | bullisch | −1,35 % | −2,05 % (1.465) | +1,30 % (402) | −1,16 % (1.001) | −1,62 % (866) | nein |
| triStar | bärisch | +0,68 % | +0,46 % (1.380) | +1,52 % (408) | −0,13 % (988) | +1,77 % (800) | nein |
| ladderBottom | bullisch | −1,24 % | −2,15 % (1.163) | +2,06 % (494) | +0,46 % (842) | −3,05 % (815) | nein |
| threeLineStrike | bärisch | +1,81 % | +0,57 % (468) | +6,43 % (139) | +5,95 % ✱ (369) | −2,51 % (238) | nein |
| identicalThreeCrows | bärisch | +2,04 % | −1,76 % (368) | +15,31 % ✱ (109) | +12,98 % ✱ (254) | −10,15 % (223) | nein |
| threeWhiteSoldiers | bullisch | −0,46 % | −0,17 % (386) | −1,53 % (81) | +0,21 % (283) | −1,23 % (184) | nein |
| upsideGapTwoCrows | bärisch | +0,66 % | −0,65 % (345) | +5,95 % (75) | +2,59 % (219) | −1,06 % (201) | nein |
| threeMethods | bärisch | +0,24 % | +0,25 % (100) | +0,22 % (70) | −0,93 % (103) | +1,43 % (67) | nein |
