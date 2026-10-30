# Historische Evidenz klassischer Indikator-Ereignisse

Stand 28.10.2026 (Marktphasen ergänzt), Engine `technical-indicators-1.5.0`/1.6.0 (Ereignisse unverändert), Datenstand 26.10.2026.
- Skript: `scripts/technical/indicator-evidence.mjs`. Es schreibt nur mit `--out`. Für das Produkt verdichtet `scripts/technical/world/signal-evidence.mjs` das Ergebnis zu `technical/data/signal-evidence.json` (SIGNAL_EVIDENCE.md).
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

## Marktphasen und Zeithälften (ab 1.1.0)

Diese Auswertung prüft, ob eine Aussage nur in einem Teil des Fensters gilt. `indicator-evidence.mjs` meldet je Zeile zusätzlich die Überrendite +20 in vier Teilmengen (Modul `scripts/technical/evidence-phases.mjs`, Test `technical-evidence-phases.test.mjs`).

**Teilmengen:**
- **UP / DOWN:** SPY-Schluss am Ereignisdatum über bzw. unter seinem SMA 50, gerechnet nur aus Schlüssen bis zu diesem Datum.
  - Im Tagesfenster gab es 210 UP- und 61 DOWN-Tage mit 30 Wechseln.
  - Der SMA 200 taugt hier nicht: SPY lag nur an 13 von 271 Tagen darunter.
- **H1 / H2:** Ereignisse vor bzw. ab dem Median aller Ereignisdaten (hier 2026-06-15). Jede Hälfte enthält etwa gleich viele Ereignisse.

**Signifikanz und Stabilität:**
- Signifikanz (✱) nach Bonferroni über Zeilen × 4 Teilmengen (z = 3,39), mit Mittel und Intervall über Datums-Cluster wie oben.
- **Stabil** heißt: In allen vier Teilmengen (je ≥ 30 Ereignisse) hat das Mittel dasselbe Vorzeichen.

**Ergebnis:** Von den 18 gemeldeten Ereignis-Zeilen sind 10 widersprüchlich (Vorzeichen wechselt zwischen den Teilmengen). 8 sind stabil, davon 1 positiv und 7 negativ.

Das wiederkehrende Bild der stabilen Zeilen: Alle sechs stabilen bullischen Ereignisse haben in jeder Teilmenge eine negative richtungsbereinigte Überrendite. Das einzige stabile positive Ereignis ist bärisch (Bollinger über dem oberen Band). Nach einem Signal blieb der Titel also meist hinter dem Querschnitt zurück, unabhängig von der Richtung des Signals.

**Ausnahme Death Cross** (bärisch, stabil negativ): Nach dem Death Cross lief der Titel in allen vier Teilmengen besser als der Querschnitt. Der Fall passt nicht zum allgemeinen Effekt und ist mit 4.117 Ereignissen der kleinste stabile.

Das spricht eher für einen allgemeinen Effekt in diesem Jahr als für einen Wert des einzelnen Signals. Signale treten häufiger bei beweglichen, volatilen Titeln auf, und diese liefen schwächer. Die Teilmengen bestätigen damit die Einordnung oben: Kein Signal taugt hier als Kaufsignal. Die bärischen Lesarten wirken nur, weil ohnehin alles mit Signal schwächer lief.

Grenzen: Das ist weiterhin ein Fenster von rund einem Jahr. UP und DOWN sind kurze Phasen innerhalb eines Aufwärtsjahrs, kein Bärenmarkt. Survivorship ist wie oben nicht bereinigt. Längere Historie mit echten Marktphasen deckt die Wochen-Evidenz ab ([WEEKLY_EVIDENCE.md](WEEKLY_EVIDENCE.md)).

| Ereignis | Richtung | +20 alle | UP | DOWN | H1 | H2 | stabil |
|---|---|---|---|---|---|---|---|
| psarUp | bullisch | −2,19 % | −2,17 % (24.811) | −2,25 % (9.229) | −2,99 % (18.142) | −0,89 % (15.898) | ja (−) |
| macdCrossUp | bullisch | −2,17 % ✱ | −1,77 % (23.544) | −3,28 % ✱ (8.808) | −2,69 % ✱ (16.869) | −1,32 % ✱ (15.483) | ja (−) |
| donchianBreakUp | bullisch | −1,51 % | −1,13 % (22.822) | −2,67 % (5.085) | −1,45 % (15.222) | −1,60 % ✱ (12.685) | ja (−) |
| bollingerAboveUpper | bärisch | +2,04 % | +2,01 % ✱ (19.837) | +2,14 % (5.004) | +1,83 % (13.339) | +2,37 % ✱ (11.502) | ja (+) |
| rsiExitOversold | bullisch | −2,23 % | −2,04 % (11.551) | −2,95 % ✱ (5.877) | −2,92 % (12.980) | −0,37 % (4.448) | ja (−) |
| supertrendUp | bullisch | −2,64 % ✱ | −1,88 % (8.408) | −4,86 % ✱ (1.976) | −3,11 % (5.989) | −2,00 % ✱ (4.395) | ja (−) |
| deathCross | bärisch | −2,56 % | −0,29 % (3.011) | −10,84 % (1.106) | −2,89 % (3.016) | −1,75 % (1.101) | ja (−) |
| goldenCross | bullisch | −0,69 % | −0,08 % (2.975) | −3,03 % (626) | −0,16 % (2.403) | −2,09 % ✱ (1.198) | ja (−) |
| stochCrossUpOversold | bullisch | −0,72 % | −1,76 % (29.772) | +2,31 % (14.385) | −2,05 % (21.971) | +1,59 % (22.186) | nein |
| psarDown | bärisch | +0,64 % | −0,09 % (25.570) | +2,73 % (9.161) | +1,11 % (17.869) | −0,13 % (16.862) | nein |
| donchianBreakDown | bärisch | +2,16 % | +2,16 % (21.704) | +2,18 % (11.787) | +3,61 % (16.111) | −0,21 % (17.380) | nein |
| macdCrossDown | bärisch | +0,51 % | +0,26 % (24.653) | +1,28 % (8.184) | +1,04 % (16.584) | −0,39 % (16.253) | nein |
| stochCrossDownOverbought | bärisch | +0,12 % | −0,36 % (26.574) | +1,57 % (6.231) | +0,32 % (17.343) | −0,19 % (15.462) | nein |
| crossBelowSma200 | bärisch | −0,73 % | −0,97 % (18.007) | +0,24 % (5.938) | −0,51 % (17.011) | −1,33 % (6.934) | nein |
| bollingerBelowLower | bullisch | −0,65 % | −0,49 % (15.000) | −1,12 % (8.852) | −1,56 % (12.343) | +0,71 % (11.509) | nein |
| crossAboveSma200 | bullisch | +0,24 % | +1,05 % (18.520) | −3,14 % ✱ (4.397) | +0,61 % (16.498) | −0,83 % (6.419) | nein |
| rsiExitOverbought | bärisch | +1,11 % | +0,38 % (16.374) | +4,12 % ✱ (3.670) | +1,89 % ✱ (14.789) | −1,17 % (5.255) | nein |
| supertrendDown | bärisch | −0,90 % | −1,95 % (7.875) | +1,88 % (3.463) | +0,27 % (5.976) | −2,42 % (5.362) | nein |
