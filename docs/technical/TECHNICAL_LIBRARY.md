# Technical-Analysebibliothek – Inventur und Ausbaustand

Stand 28.10.2026, `main` nach #1037. Versionen: `indicators` 1.5.0, `candlesticks` 1.1.0 (Erkennung seit #1032 doppelt so schnell, Ausgabe byte-gleich), `formations` 1.3.0, `ti-chart-patterns` 1.2.0, `screen-row` 1.9.0 (L9, #1035), `technical-query` 1.9.0, `technical-mtf` 1.1.0.

Zur Freigabe offen (Fachmodell, mit Vorher/Nachher): #1047 (Dreieckskanten nach Typ, `ti-chart-patterns` 1.3.0, `formations` 1.4.0, FORMATION_VALIDATION.md §7).

Die Inventur unten (Abschnitte 1–3) ist der Stand vor dem Ausbau (nach #991). Der aktuelle Gesamtstand steht in Abschnitt 0, die Einzelheiten der neuen Einträge in INDICATORS_CATALOG.md, CANDLESTICKS.md und FORMATION_VALIDATION.md.

Ziel ist eine Bibliothek mit mindestens 100 sinnvollen Analysefunktionen: Indikatoren, Formationen und Candlestick-Muster. Gezählt wird nur, was eine eigene Definition hat. Eine Parametervariante zählt nur, wenn sie fachlich etabliert ist und eigens genutzt wird, etwa ROC 63/126/252 als 3-, 6- und 12-Monats-Momentum. Varianten nur für die Zahl gibt es nicht.

## 0. Gesamtstand nach dem Ausbau L1–L6

| Bereich | Code | Mathe | Markt | Screener | Chart |
|---|---|---|---|---|---|
| Indikatoren (`indicators.js` 1.5.0) | 78 | 78 | 78 | 26 | 20 ●, Rest ○ |
| Candlestick-Muster (`candlesticks.js` 1.2.0) | 62 | 62 | 61 | 27 (feste Liste) | 0 ●, 58 ○ (Marker je Bar) |
| Chartformationen (`formations.js` 1.2.3 + Alt) | 24 | 24 | 24 | 24 | 24 ● |
| **gesamt** | **164** | **164** | **163** | **77** | **44 ●** |

**Herkunft „Markt“:**
- **Indikatoren, 50 Wert für Wert gegen TA-Lib 0.8.2 auf echten AAPL-Kursen:**
  - 18 im Grundbestand.
  - 17 in `technical-talib-reference-aapl-ext.json`: 12 aus 1.3.0, dazu KAMA, LINEARREG, TRIX, Ultimate Oscillator und CMO (L3).
  - 15 in `…-ext2.json`, aus TA-Lib-Grundbausteinen zusammengesetzt (1.4.0).
- **Indikatoren, 2 Volumenmaße** im Universum nachgerechnet.
- **Indikatoren, 26 ohne TA-Lib-Gegenstück (L8):** Sie sind gegen eine zweite fremde Referenz geprüft, pandas-ta 0.4.71b0 oder die Formel aus TA-Lib-/numpy-Bausteinen (`technical-pandasta-reference-aapl.json`).
  - Darunter ZLEMA, ALMA, McGinley, Klinger, NVI/PVI, Connors RSI, Supertrend, Keltner, Chandelier, Elder Impulse, Envelope und die Pivot-Varianten.
  - Alle 57 Reihen stimmen. McGinley stimmt erst ab Bar 215 (Startwert-Konvention).
  - Wo pandas-ta anders definiert, ist es belegt (INDICATORS_EXTERNAL_REFERENCE.md, L8).
- **Candlesticks:** 57 Muster gegen TA-Lib auf 38 echten Titeln (10.260 Bars) und konstruierten Reihen. Tweezer hat kein TA-Lib-Gegenstück.
  - Übereinstimmung auf entscheidbaren Bars: 98–100 %.
  - Alle Abweichungen sind einzeln belegte Gleichstände.
  - Nie eine Richtungsabweichung.
- **Formationen:** historische Evidenz im Universum.
  - Dazu die Regelprüfung (L5): mit 1.2.3 sind 11.426 von 11.426 Erkennungen regelkonform. Jede Formation ist am Erkennungstag mit den damals vorhandenen Daten sichtbar (B-F3, 1.2.2).
  - Und der Spiegeltest (FORMATION_VALIDATION.md).

**Chart ○** heißt: Die Ausgabe ist als Overlay, Unterfenster oder Marker je Bar darstellbar, wird im Chart Studio aber noch nicht gezeigt. Die Darstellung ist Frontend-Arbeit und nicht Teil dieses Ausbaus.

## Status-Spalten

Jede Funktion trägt fünf getrennte Status. Kein Status folgt aus einem anderen.

| Spalte | Bedeutung | Nachweis |
|---|---|---|
| **Code** | Im Code implementiert und über die öffentliche Schnittstelle berechenbar (`Indicators.compute`, `formations.analyze`, `candlesticks.detect`) | Modul und Katalogeintrag |
| **Mathe** | Mathematisch getestet: gegen eine naive Referenzformel oder konstruierte Fälle, dazu Aufwärmphase, Kausalität und Determinismus | Testdatei |
| **Markt** | Mit echten Marktdaten verifiziert. Entweder Wert für Wert gegen eine fremde Implementierung (TA-Lib 0.8.2) auf echten AAPL-Tageskursen, oder im materialisierten Universum mit Gegenprobe (Formationen: historische Evidenz) | Fixture bzw. Lauf |
| **Screener** | Als Feld in `technical/data/screener-v1.json` und im Abfragekatalog (`technical-query`) | Spalte und Feld-ID |
| **Chart** | Für die Chartdarstellung vorbereitet. Die Ausgabe hat eine darstellbare Form (Overlay-Reihe, Unterfenster-Reihe oder Marker je Bar) und wird im Chart Studio bereits gezeigt (●) oder ist nur vorbereitet (○) | `technical/app.js` bzw. Katalog `overlay` |

Legende: ✔ erfüllt · – nicht erfüllt · (Zahl) = Anmerkung unten.

## 1. Indikatoren (`indicators.js`, 38 Katalogeinträge)

Testdateien: **T1** `technical-indicators.test.mjs`, **T2** `technical-indicators-ext.test.mjs`, **T3** `technical-indicators-catalog-b6.test.mjs`, **TL** `technical-indicators-talib.test.mjs` (TA-Lib-Referenz auf echten AAPL-Kursen).

| id | Familie | Code | Mathe | Markt | Screener (Feld) | Chart |
|---|---|---|---|---|---|---|
| `sma` | Trend | ✔ | T1 | TL | `aboveSma50/200`, `distSma50/200`, `sma50AboveSma200`, Kreuzungsereignisse; Tag/Woche/Monat | ● |
| `ema` | Trend | ✔ | T1 | TL, Universum (1) | `aboveEma20/50/200`, `distEma200` | ● |
| `wma` | Trend | ✔ | T1 | TL | – | ○ |
| `adx` | Trend | ✔ | T1 | TL (Startkonvention) | `adx` D/W/M | ● |
| `supertrend` | Trend | ✔ | T1 | – (kein TA-Lib-Gegenstück) | `supertrendUp` | ● |
| `donchian` | Trend | ✔ | T1 | TL | – | ● |
| `psar` | Trend | ✔ | T2 | TL | `psarUp` | ● |
| `ichimoku` | Trend | ✔ | T2 | TL (Tenkan, Kijun, Senkou B) | `aboveCloud` | ● |
| `vwma` | Trend | ✔ | T2 | – | – | ● |
| `rsi` | Momentum | ✔ | T1 | TL | `rsi14` D/W/M, RSI-Ereignisse | ● |
| `macd` | Momentum | ✔ | T1 | TL (Startkonvention) | `macdPositive` D/W/M | ● |
| `stochastic` | Momentum | ✔ | T1 | TL | `stochK` D/W/M | ● |
| `roc` | Momentum | ✔ | T1 | TL | `roc21` | ○ |
| `cci` | Momentum | ✔ | T1 | TL | `cci20` | ● |
| `williamsR` | Momentum | ✔ | T2 | TL | `williamsR` | ● |
| `aroon` | Momentum | ✔ | T2 | TL | `aroonOsc` | ● |
| `atr` | Volatilität | ✔ | T1 | TL (Startkonvention) | `atrPct` D/W/M | ● |
| `bollinger` | Volatilität | ✔ | T1 | TL | `bbPctB`, `bbSqueeze` | ● |
| `keltner` | Volatilität | ✔ | T1 | – (aus EMA und ATR, beide TL) | `bbSqueeze` (Teil) | ● |
| `obv` | Volumen | ✔ | T1 | TL (Startwert V₀) | `obvRising` | ● |
| `mfi` | Volumen | ✔ | T1 | TL | `mfi14` | ● |
| `cmf` | Volumen | ✔ | T2 | – | `cmf20` | ● |
| `relativeVolume` | Volumen | ✔ | T1 | Universum (2) | `relVol`, `volAboveAvg` D/W/M | ○ |
| `volumeSpikes` | Volumen | ✔ | T1 | Universum (2) | `volSpike` D/W/M | ○ |
| `pivots` | Trend | ✔ | T3 | – | – | ○ |
| `kama` | Trend | ✔ | T3 | – (3) | – | ○ |
| `hma` | Trend | ✔ | T3 | – | – | ○ |
| `linreg` | Trend | ✔ | T3 | – (3) | – | ○ |
| `heikinAshi` | Trend | ✔ | T3 | – | – | ○ |
| `roc63` / `roc126` / `roc252` | Momentum | ✔ | T3 | TL über `roc` | – | ○ |
| `trix` | Momentum | ✔ | T3 | – (3) | – | ○ |
| `ultimateOscillator` | Momentum | ✔ | T3 | – (3) | – | ○ |
| `cmo` | Momentum | ✔ | T3 | – (TA-Lib glättet anders) | – | ○ |
| `chandelier` | Volatilität | ✔ | T3 | – | – | ○ |
| `insideBar` | Muster | ✔ | T3 | – | – | ○ |
| `nr7` | Muster | ✔ | T3 | – | – | ○ |

**Anmerkungen:**
1. EMA 200 exakt materialisiert: 4.809 von 5.657 Titeln, Rekursions-Gegenprobe über das ganze Universum (EMA200_MATERIALIZATION.md, Abschnitt 8).
2. Im täglichen Universum gerechnet und über `verify-technical-data` gegen die Engine nachgerechnet; ohne fremde Referenz.
3. TA-Lib hat ein Gegenstück (KAMA, LINEARREG/LINEARREG_SLOPE, TRIX, ULTOSC). Der Abgleich ist der nächste Schritt für „Markt“.

**Zählung:** 38 Einträge, davon 24 in Produktflächen und 14 nur im Katalog.
- Mathe ✔: 38.
- Markt ✔: 20. Davon 18 Einträge Wert für Wert gegen TA-Lib, 4 davon mit dokumentierter Startkonvention. Dazu die zwei Volumenmaße im Universum.
- Screener: 21 Indikatoren speisen mindestens ein Feld.
- Chart ●: 20.

## 2. Eignung der 14 Katalogindikatoren

Bewertet wird, ob ein Screener-Feld, eine Materialisierung und eine Chartebene fachlich sinnvoll und mit den vorhandenen 270 Tagesbars rechenbar sind.

| id | Screener | Materialisierung | Chart | Empfehlung |
|---|---|---|---|---|
| `roc63/126/252` | **hoch:** absolutes 3/6/12-Monats-Momentum, ergänzt das relative `rs3m/rs6m` | im Lauf aus Tagesbars; 252 braucht 253 Bars, vorhanden (270) | Unterfenster | Screener-Felder `roc63`, `roc126`, `roc252` (Fachmodell-PR) |
| `insideBar` | **hoch:** Setup-Filter „Inside Day“ | trivial aus OHLC | Marker | Screener-Feld und Ereignis „Tage seit Inside Bar“ |
| `nr7` | **hoch:** Setup-Filter „NR7“, auch kombiniert mit Inside Bar (NR7-ID) | trivial | Marker | wie `insideBar` |
| `linreg` | **mittel:** Steigung je Bar normiert (%/Tag) als Trendstärke, dazu Bestimmtheitsmaß R² (fehlt noch) | aus Schluss | Overlay-Kanal | R² ergänzen, dann Feld `linregSlopePct50` |
| `chandelier` | **mittel:** „Schluss unter Chandelier lang“ als Ausstiegssignal | aus OHLC | Overlay | Feld `belowChandelierLong` |
| `ultimateOscillator` | **mittel:** überkauft/überverkauft mit drei Fenstern | aus OHLC | Unterfenster | Feld `uo` |
| `heikinAshi` | **mittel:** Zahl gleichfarbiger HA-Kerzen in Folge | aus OHLC | Kerzenmodus | Feld `haTrendBars` |
| `pivots` | **mittel:** Abstand zu R1/S1 | aus Vortag; für Wochen-/Monatspivots wird die Aggregation gebraucht | Linien | Wochen- und Monatspivots als Variante (Fibonacci, Camarilla, Woodie) |
| `trix` | **gering:** TRIX > 0 bzw. Signalkreuzung, überschneidet sich mit MACD | aus Schluss | Unterfenster | Chart zuerst |
| `kama` / `hma` | **gering:** „über KAMA/HMA“, überschneidet sich mit EMA-Feldern | aus Schluss | Overlay | nur Chart |
| `cmo` | **gering:** ungeglättet nahe an RSI | aus Schluss | Unterfenster | nur Chart |

Jede Freigabe als Screener-Feld ändert `screen-row`/`technical-query` und ist damit eine Fachmodelländerung mit eigenem PR und Vorher/Nachher.

## 3. Chartformationen (24 Typen)

Quellen: `formations.js` (13 Regeln, Lebenszyklus nach FORMATIONS_LIFECYCLE.md) und `ti/chart-patterns.js` (11 Altformationen, über `formations.LEGACY` mit Zuständen eingebunden). Testdatei: `technical-formations.test.mjs`. Marktdaten: `technical/data/formation-evidence.json`, historische Erkennungen im Universum mit Definition, Stichprobe und Bonferroni.

| Typ | Familie | Code | Mathe | Markt (Erkennungen in der Evidenz) | Screener | Chart |
|---|---|---|---|---|---|---|
| SUPPORT_TRENDLINE | Trendlinie | ✔ | ✔ | 9.252 | ✔ | ● |
| RESISTANCE_TRENDLINE | Trendlinie | ✔ | ✔ | 8.759 | ✔ | ● |
| ASCENDING_CHANNEL | Kanal | ✔ | ✔ | 2.313 | ✔ | ● |
| DESCENDING_CHANNEL | Kanal | ✔ | ✔ | 2.317 | ✔ | ● |
| RISING_WEDGE | Keil | ✔ | ✔ | 674 | ✔ | ● |
| FALLING_WEDGE | Keil | ✔ | ✔ | 1.463 | ✔ | ● |
| BULL_PENNANT | Wimpel | ✔ | ✔ | 793 | ✔ | ● |
| BEAR_PENNANT | Wimpel | ✔ | ✔ | 1.788 | ✔ | ● |
| RANGE_BREAKOUT | Ausbruch | ✔ | ✔ | 7.694 | ✔ | ● |
| RESISTANCE_BREAKOUT | Ausbruch | ✔ | ✔ | 11.388 | ✔ | ● |
| VOLATILITY_CONTRACTION | Kontraktion | ✔ | ✔ | 1.760 | ✔ | ● |
| GAP_UP | Lücke | ✔ | ✔ | 9.812 | ✔ | ● |
| GAP_DOWN | Lücke | ✔ | ✔ | 9.444 | ✔ | ● |
| DOUBLE_TOP | Umkehr | ✔ | ✔ | 2.628 | ✔ | ● |
| DOUBLE_BOTTOM | Umkehr | ✔ | ✔ | 2.690 | ✔ | ● |
| HEAD_AND_SHOULDERS | Umkehr | ✔ | ✔ | 1.258 | ✔ | ● |
| INVERSE_HEAD_AND_SHOULDERS | Umkehr | ✔ | ✔ | 1.350 | ✔ | ● |
| ASCENDING_TRIANGLE | Dreieck | ✔ | ✔ | 2.384 | ✔ | ● |
| DESCENDING_TRIANGLE | Dreieck | ✔ | ✔ | 2.850 | ✔ | ● |
| SYMMETRICAL_TRIANGLE | Dreieck | ✔ | ✔ | 2.265 | ✔ | ● |
| RECTANGLE | Range | ✔ | ✔ | 1.359 | ✔ | ● |
| BULL_FLAG | Flagge | ✔ | ✔ | 1.130 | ✔ | ● |
| BEAR_FLAG | Flagge | ✔ | ✔ | 2.069 | ✔ | ● |
| CUP_WITH_HANDLE | Fortsetzung | ✔ | ✔ | 60 | ✔ | ● |

„Markt“ belegt hier, dass die Erkennung auf echten Kursen läuft und Fälle findet. Ob eine Erkennung fachlich richtig ist, belegt das noch nicht. Die Validierung von Dreiecken, Flaggen, Keilen und Kanälen gegen manuell geprüfte Fälle und konstruierte Grenzfälle ist ein eigener Arbeitsschritt (Abschnitt 6).

## 4. Candlestick-Muster

**Stand (nach #996, #1006):** `candlesticks.js` 1.1.0 mit 58 Mustern. Einzelheiten in [CANDLESTICKS.md](CANDLESTICKS.md). Der folgende Text ist der ursprüngliche Plan aus L1.

Bestand vor L4: keine eigene Bibliothek. Vorhanden waren nur verwandte Bausteine: `insideBar`, `nr7`, `heikinAshi` und die Kurslücken GAP_UP/GAP_DOWN.

Geplant ist das Modul `candlesticks.js`. Es soll die etablierten Ein-, Zwei- und Dreikerzenmuster enthalten: Doji-Varianten, Hammer/Hanging Man, Inverted Hammer/Shooting Star, Marubozu, Spinning Top, Engulfing, Harami, Piercing/Dark Cloud, Tweezer, Morning/Evening Star, Three White Soldiers/Black Crows, Three Inside/Outside und weitere. Jedes Muster bekommt eine dokumentierte Regel mit relativen Kerzenmaßen (Körper, Schatten gegen die mittlere Spanne der Vorbars) und einen Trendkontext, der nur Vorbars nutzt. Abgeglichen wird gegen die TA-Lib-Funktionen `CDL*` auf echten Kursen. Die Übereinstimmungsquote wird als Kennzahl festgehalten, nicht als Gleichheit, weil sich die Schwellen beider Bibliotheken bewusst unterscheiden können.

## 5. Weitere Analysebausteine außerhalb der Kataloge

Sie werden nicht in die 100 eingerechnet, solange sie keine eigene Katalogdefinition haben.

| Modul | Inhalt | Screener | Chart |
|---|---|---|---|
| `market-structure.js`, `pivot-engine.js` | Swing-Hochs/-Tiefs, Trendstruktur HH/HL | `structure` | ● |
| `support-resistance.js`, `ti/levels.js` | Zonen aus Swing-Kontakten | (über Ausbruchsformationen) | ● |
| `fibonacci.js` | Retracements am letzten Impuls | – | ● |
| `relative-strength-engine.js` | relative Stärke gegen SPY | `rs3m`, `rs6m`, `rsPositive` | – |
| `ti/dow-trend.js`, `ti/wyckoff.js`, `ti/volume-intelligence.js` | Trend- und Phasenmodelle (Chartbild) | – | ● |
| `elliott/` | Wellenzählung (Beta) | – | ● |
| `multi-timeframe.js` | Woche/Monat aus der Tageshistorie | 14 Felder je W/M | – |

## 6. Ausbauplan

Die Schritte sind nach Nutzen und Risiko geordnet. Jeder ist ein eigener PR.

| Schritt | Inhalt | Art | Status |
|---|---|---|---|
| L1 | Diese Inventur | Doku | erledigt (#994) |
| L2 | Fehlende Standardindikatoren, nur Katalog: DEMA, TEMA, TRIMA, T3, PPO, StochRSI, NATR, A/D-Linie, Chaikin-Oszillator, Balance of Power, Momentum, Standardabweichung, Vortex, Mass Index, Choppiness, Ulcer Index, Force Index, Elder Ray, Ease of Movement, Awesome Oscillator, Coppock, KST, TSI, DPO, historische Volatilität, Z-Score, NVI/PVI, PVO, Klinger. Je Indikator TA-Lib-Abgleich, wo es ein Gegenstück gibt. | Katalog, kein Fachmodell | erledigt (#995: 15, #997: 24, #1015: Klinger) |
| L3 | TA-Lib-Abgleich für KAMA, LINEARREG, TRIX, ULTOSC (Status „Markt“ der Katalogindikatoren) | Test | erledigt (#995) |
| L4 | Candlestick-Bibliothek (Abschnitt 4), nur Katalog | Katalog | erledigt (#996: 27, #1006: +31) |
| L5 | Validierung der Formationen: konstruierte Grenzfälle je Typ, Stichprobe echter Erkennungen mit Begründung | Test/Doku | erledigt (#998); Korrekturen 1.2.1 (#1000) und 1.2.2 (#1008, Erkennungstag) mit Owner-Freigabe, 1.2.3 Rundung (#1013, keine Entscheidungsänderung) |
| L6 | Screener-Felder für geeignete Katalogindikatoren und Candlesticks: ROC 63/126/252, Inside Bar, NR7, Candlestick-Ereignisse „Tage seit …“, je mit Prüfraum | **Fachmodell**, eigener PR mit Vorher/Nachher | erledigt (#1004, Owner-Freigabe 27.10.2026): [SCREENER_FIELDS_L6.md](SCREENER_FIELDS_L6.md) |
| L7 | Woche/Monat: Verfügbarkeitsgrenzen je neuem Feld; aus der Tageshistorie im Materialisierungslauf | **Fachmodell** | erledigt (#1017, Owner-Freigabe 27.10.2026): [SCREENER_FIELDS_L7.md](SCREENER_FIELDS_L7.md). Abdeckungsprüfung offen: die Nachtläufe vom 28.10. scheiterten vor der Materialisierung (Discover-Prüfung), die 18 Spalten sind bis dahin `null`. |
| L8 | Zweite fremde Referenz für die 26 Indikatoren ohne TA-Lib-Gegenstück | Test | erledigt (#1021) |
| L9 | Weitere Tagesfelder im Screener: Vortex, Choppiness, 20-Tage-Hoch/-Tief (Donchian), Elder Impulse, Z-Score, Hull steigend, Ulcer, historische Volatilität, Connors RSI, Abstand zum Chandelier-Stopp | **Fachmodell** | erledigt (#1035, Owner-Freigabe 28.10.2026): [SCREENER_FIELDS_L9.md](SCREENER_FIELDS_L9.md); bestehende 123 Spalten byte-gleich |
| L10 | Dreiecksklassifikation: gelten aufsteigend und absteigend zugleich, ist das Muster symmetrisch (Spiegeltest) | **Fachmodell** | erledigt (#1037, Owner-Freigabe 28.10.2026): FORMATION_VALIDATION.md §6, 19 Titel |
| L11 | Dreieckskanten nach Typ: aufsteigend oben waagrecht/unten durch die Tiefs, absteigend umgekehrt; Kantenprüfung im Validator | **Fachmodell** | PR #1047 wartet auf Freigabe; FORMATION_VALIDATION.md §7 |
| L13 | Candlestick-Bibliothek vervollständigt: Long Line, Short Line, Kicking by Length, Modifizierter Hikkake (alle 61 TA-Lib-CDL-Funktionen abgedeckt) | Katalog, kein Fachmodell | erledigt (candlesticks 1.2.0): CANDLESTICKS.md |

**Verfügbarkeitsgrenzen nach Zeitrahmen:**
- **Tag:** Der Browser und `screen-row` sehen 270 Tagesbars. Indikatoren mit einer Aufwärmphase über 269 Bars sind auf Tagesbasis nur im Materialisierungslauf exakt rechenbar, der die volle Historie hat (Muster EMA 200).
- **Woche und Monat:** Werte gibt es nur aus der Materialisierung (`multi-timeframe.js`). Jede neue W/M-Kennzahl muss dort ergänzt werden. Ihre Mindesthistorie in Wochen bzw. Monaten wird je Feld dokumentiert.
