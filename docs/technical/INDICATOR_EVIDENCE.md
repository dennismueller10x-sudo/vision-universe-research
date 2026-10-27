# Historische Evidenz klassischer Indikator-Ereignisse

Stand 27.10.2026, `technical-indicators-1.5.0`, Datenstand 26.10.2026.
- Skript: `scripts/technical/indicator-evidence.mjs`. Es schreibt nur mit `--out` und ist kein Produktartefakt.
- Test der Bausteine: `quant/tests/technical-indicator-evidence.test.mjs`.

Diese Auswertung beschreibt, was nach 18 verbreiteten Indikator-Ereignissen im Mittel geschah. Sie empfiehlt nichts. Die Methode ist dieselbe wie bei den Kerzenmustern ([CANDLESTICK_EVIDENCE.md](CANDLESTICK_EVIDENCE.md)).

## Methode

**Stichprobe:**
- 5.657 Titel aus `technical-signals-v1`, je 270 Tagesbars, splitbereinigt.
- Das Fenster reicht bei ruhenden Titeln weiter zurück. Über alle Titel läuft es vom 27.01.2022 bis 26.10.2026; der Schwerpunkt liegt auf dem letzten Jahr.

**Ereignisse (9 Paare):**

| Paar | bullisch | bärisch | Linien |
|---|---|---|---|
| Golden/Death Cross | SMA 50 kreuzt SMA 200 aufwärts | abwärts | Vollhistorie |
| SMA 200 | Schluss kreuzt SMA 200 aufwärts | abwärts | Vollhistorie |
| RSI 14 | von unten über 30 | von oben unter 70 | Vollhistorie |
| MACD 12/26/9 | MACD kreuzt Signallinie aufwärts | abwärts | 270 Bars ab Bar 100 |
| Supertrend 10/3 | dreht aufwärts | dreht abwärts | 270 Bars ab Bar 100 |
| Parabolic SAR | dreht aufwärts | dreht abwärts | 270 Bars ab Bar 100 |
| Donchian 20 | erster Schluss über dem 20-Tage-Hoch der Vortage | erster Schluss unter dem 20-Tage-Tief | 270 Bars ab Bar 100 |
| Bollinger 20/2 (Mean-Reversion-Lesart) | Schluss kreuzt das untere Band abwärts | Schluss kreuzt das obere Band aufwärts | 270 Bars ab Bar 100 |
| Stochastik 14/3/3 | %K kreuzt %D aufwärts unter 20 | %K kreuzt %D abwärts über 80 | 270 Bars ab Bar 100 |

**Linien:**
- SMA 50/200 und RSI 14 stammen aus `bundle.chartSeries`. Die Materialisierung rechnet sie aus der vollen Tageshistorie, je Bar kausal. Es ist dieselbe Quelle wie für die Ereignisfelder des Screeners (B12).
- Alle übrigen Linien rechnet `indicators.js` auf den 270 Bars. Ihre Ereignisse zählen erst ab Bar 100, damit EMA- und Wilder-Startwerte keine Rolle spielen.
- Jedes Ereignis an Bar i nutzt nur Bars bis i. Der Test belegt das über abgeschnittene Reihen.

**Maß, Intervall, Signifikanz:**
- Wie bei den Kerzen: Rendite vom Schluss i bis zum Schluss i+H, minus dem Querschnittsmittel desselben Datums (mindestens 50 Titel), für H = 5, 10, 20 Tage.
- Bärische Ereignisse gehen mit umgekehrtem Vorzeichen ein.
- Mittel und 95-%-Intervall werden über Datums-Cluster gerechnet.
- Signifikanz nach Bonferroni über 18 Zeilen × 3 Horizonte: z = 3,31.

**Robustheit:** Ein zweiter Lauf zählt nur Ereignisse mit Schluss ≥ 5 $ (`--min-close 5`). Der Querschnitt bleibt dabei alle Titel.

## Ergebnis (H = 20 Handelstage)

| Ereignis | alle Titel: Ereignisse | alle: Überrendite in Richtung | ≥ 5 $: Ereignisse | ≥ 5 $: Überrendite in Richtung |
|---|---|---|---|---|
| Golden Cross | 3.601 | −0,69 ± 1,25 % | 2.955 | −0,53 ± 1,23 % |
| Death Cross | 4.117 | −2,56 ± 5,02 % | 3.193 | +0,26 ± 0,73 % |
| Schluss über SMA 200 | 22.917 | +0,24 ± 2,42 % | 18.625 | +0,36 ± 2,42 % |
| Schluss unter SMA 200 | 23.945 | −0,73 ± 1,99 % | 19.262 | −0,12 ± 1,75 % |
| RSI über 30 | 17.428 | −2,23 ± 1,87 % | 12.480 | **−3,87 ± 0,78 %** |
| RSI unter 70 | 20.044 | +1,11 ± 1,11 % | 17.323 | **+1,40 ± 0,72 %** |
| MACD aufwärts | 32.352 | **−2,17 ± 0,85 %** | 25.035 | **−1,77 ± 0,87 %** |
| MACD abwärts | 32.837 | +0,51 ± 1,37 % | 25.454 | +0,41 ± 1,01 % |
| Supertrend aufwärts | 10.384 | **−2,64 ± 1,12 %** | 8.229 | **−2,36 ± 1,07 %** |
| Supertrend abwärts | 11.338 | −0,90 ± 2,40 % | 9.120 | +0,58 ± 1,32 % |
| SAR aufwärts | 34.040 | −2,19 ± 1,56 % | 26.638 | −1,71 ± 1,46 % |
| SAR abwärts | 34.731 | +0,64 ± 1,18 % | 27.183 | +1,20 ± 0,91 % |
| Donchian-Ausbruch aufwärts | 27.907 | −1,51 ± 0,95 % | 23.961 | −1,31 ± 0,91 % |
| Donchian-Ausbruch abwärts | 33.491 | +2,16 ± 1,89 % | 24.299 | **+2,11 ± 1,07 %** |
| unteres Bollinger-Band | 23.852 | −0,65 ± 1,70 % | 17.995 | −0,96 ± 0,93 % |
| oberes Bollinger-Band | 24.841 | +2,04 ± 2,21 % | 20.057 | **+2,23 ± 0,84 %** |
| Stochastik aufwärts unter 20 | 44.157 | −0,72 ± 2,28 % | 31.458 | **−2,46 ± 0,98 %** |
| Stochastik abwärts über 80 | 32.805 | +0,12 ± 0,86 % | 28.362 | +0,39 ± 0,81 % |

**Fett:** signifikant nach Bonferroni. Alle Titel: 2 von 18 Zeilen. Ab 5 $: 7 von 18.

**Lesart:**
- „In Richtung“ heißt bei bärischen Ereignissen, dass der Titel relativ fiel.
- Die vollständigen Werte für 5, 10 und 20 Tage liefert das Skript.

## Einordnung

**Gemeinsamer Effekt, kein Richtungseffekt.**
- Nach fast jedem Ereignis liefen die Titel schlechter als der Querschnitt, egal in welche Richtung das Ereignis zeigt. Deshalb sind bullische Zeilen negativ und bärische Zeilen „in Richtung“ positiv.
- Das ist ein Auswahleffekt: Titel mit vielen Kreuzungen sind schwankungsreicher und liefen im Fenster schlechter. Mit der Signalrichtung hat das nichts zu tun.

**Richtung im Paarvergleich (≥ 5 $, H = 20).** Ob die Richtung etwas aussagt, zeigt erst die Differenz der Rohüberrenditen: bullisches minus bärisches Ereignis desselben Paars. Das Intervall ist genähert, aus unabhängigen Standardfehlern.

| Paar | bullisch − bärisch |
|---|---|
| Golden/Death Cross | −0,27 ± 1,43 % |
| SMA 200 | +0,24 ± 2,99 % |
| RSI 30/70 | **−2,47 ± 1,06 %** (t ≈ 4,6, auch nach Bonferroni) |
| MACD | −1,36 ± 1,33 % |
| Supertrend | −1,78 ± 1,70 % |
| SAR | −0,51 ± 1,72 % |
| Donchian | +0,80 ± 1,40 % |
| Bollinger (Mean-Reversion) | +1,27 ± 1,25 % |
| Stochastik | −2,07 ± 1,27 % |

**Kein Beleg für Prognosekraft in Signalrichtung:**
- Die Vorzeichen sind uneinheitlich.
- Nur das RSI-Paar ist nach Bonferroni signifikant, und es läuft gegen die Richtung: Titel, die die überverkaufte Zone verlassen, liefen schlechter als Titel, die die überkaufte verlassen.

**Grenzen:**
- Die Stichprobe umfasst im Kern ein Jahr und ein Regime.
- Die Linien der Bar-Ereignisse sind erst ab Bar 100 gezählt.
- Für Golden/Death Cross gibt es wenige Ereignisse an vielen Tagen; das Intervall ist entsprechend breit.

**Für Screener und Chart Studio:** Wie bei Kerzen und Formationen sind diese Ereignisse **Beschreibung** („Welche Titel haben heute einen MACD-Kreuz?“), kein Signal mit Erwartungswert. Labels und Doku versprechen keine Wirkung.
