# Historische Evidenz der Kerzenmuster

Stand 27.10.2026, `technical-candlesticks-1.1.0` (58 Muster), Datenstand 26.10.2026.
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
