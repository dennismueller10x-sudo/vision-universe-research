# Technical – Indikator-Katalog

Stand: `technical-indicators-1.4.0` (1.4.0: Katalogerweiterung L2b; 1.3.0: L2a; 1.2.1: Parabolic SAR an Umkehrbars, siehe INDICATORS_EXTERNAL_REFERENCE.md) (`quant/engines/technical/indicators.js`, `CATALOG`).

Alle Indikatoren werden über `compute(series, id, params)` berechnet. `series` ist ein Spaltenobjekt `{open, high, low, close, volume}`. Gemeinsame Regeln:

- **kausal:** Der Wert an Bar *t* nutzt nur Bars ≤ *t*.
- **Aufwärmphase:** `warmup` ist der 0-basierte Index der ersten Bar mit Wert, wenn die Eingabe keine Lücken hat. Davor steht `NaN`, serialisiert als `null`, nie 0.
- **Lücken:** Ein fehlender Eingabewert ergibt an dieser Bar `NaN`. Rekursive Glättungen (EMA, Wilder, KAMA, Heikin-Ashi) rechnen mit dem letzten gültigen Zustand weiter.
- **Perioden** zählen Bars. Für Wochen- oder Monatswerte aggregiert man vorher mit `timeframe.js#aggregate`.

Spalte „Verwendet in“:

- **Screener:** `screen-row.js`, also Felder in `technical/data/screener-v1.json`.
- **Chart Studio:** Ebenen in `technical/app.js`.
- **Methodik:** die Seite `/technical/#/methodik`. Sie listet alle Einträge ohne `catalogOnly`.
- **nur Katalog:** Der Indikator ist definiert, getestet und über `compute()` berechenbar. Er erscheint aber in keiner Produktfläche.

Wer einen „nur Katalog“-Indikator als Screener-Feld, Abfragefeld, Vorlage oder Chart-Ebene freigibt, ändert ein Fachmodell (CLAUDE.md). Das braucht einen eigenen PR mit Vorher/Nachher-Vergleich. Danach entfällt `catalogOnly` am Eintrag.

Testdateien (alle unter `quant/tests/`):

- **T1:** `technical-indicators.test.mjs`
- **T2:** `technical-indicators-ext.test.mjs`
- **T3:** `technical-indicators-catalog-b6.test.mjs`

Alle drei rechnen gegen naive Referenzen auf `fixtures/technical-reference-aapl.json`. Zusätzlich prüft T1 für **jeden** Katalogeintrag die Aufwärmphase, die Kausalität und den Determinismus.

## Bestand (1.0.0 / 1.1.0)

| id | Familie | Standardparameter | Aufwärmphase (Index) | Ausgaben | Verwendet in | Test |
|---|---|---|---|---|---|---|
| `sma` | Trend | period 50 | n−1 | Reihe | Screener (über `I.sma`), Chart Studio, Methodik | T1 |
| `ema` | Trend | period 200 | n−1 | Reihe | Chart Studio (EMA 20/50), Methodik | T1 |
| `wma` | Trend | period 20 | n−1 | Reihe | Methodik | T1 |
| `adx` | Trend | period 14 | 2n−1 | adx, plusDI, minusDI | Chart Studio, Methodik | T1 |
| `supertrend` | Trend | period 10, multiplier 3 | n−1 | line, direction, upper, lower | Screener, Chart Studio, Methodik | T1 |
| `donchian` | Trend | period 20 | n−1 | upper, lower, middle | Chart Studio, Methodik | T1 |
| `psar` | Trend | step 0,02, max 0,2 | 1 | sar, direction | Screener, Chart Studio, Methodik | T2 |
| `ichimoku` | Trend | 9 / 26 / 52, Verschiebung 26 | spanB−1+Verschiebung | tenkan, kijun, spanA, spanB, cloudA, cloudB | Screener, Chart Studio, Methodik | T2 |
| `vwma` | Trend | period 20 | n−1 | Reihe | Chart Studio, Methodik | T2 |
| `rsi` | Momentum | period 14 | n | Reihe | Screener (über `I.rsi`), Chart Studio, Methodik | T1 |
| `macd` | Momentum | 12 / 26 / 9 | slow+signal−2 (Signal) | macd, signal, histogram | Chart Studio, Methodik | T1 |
| `stochastic` | Momentum | 14 / 3 / 3 | k+smooth+d−3 (%D) | k, d, raw | Screener, Chart Studio, Methodik | T1 |
| `roc` | Momentum | period 21 | n | Reihe | Methodik | T1 |
| `cci` | Momentum | period 20 | n−1 | Reihe | Screener, Chart Studio, Methodik | T1 |
| `williamsR` | Momentum | period 14 | n−1 | Reihe | Screener, Chart Studio, Methodik | T2 |
| `aroon` | Momentum | period 25 | n | up, down, oscillator | Screener, Chart Studio, Methodik | T2 |
| `atr` | Volatilität | period 14 | n−1 | Reihe | Chart Studio, Methodik | T1 |
| `bollinger` | Volatilität | period 20, k 2 | n−1 | middle, upper, lower, width, percentB | Screener, Chart Studio, Methodik | T1 |
| `keltner` | Volatilität | 20 / 2 / ATR 10 | max(n, a)−1 | middle, upper, lower | Chart Studio, Methodik | T1 |
| `obv` | Volumen | – | 0 | Reihe | Screener, Chart Studio, Methodik | T1 |
| `mfi` | Volumen | period 14 | n | Reihe | Screener, Chart Studio, Methodik | T1 |
| `cmf` | Volumen | period 20 | n−1 | Reihe | Screener, Chart Studio, Methodik | T2 |
| `relativeVolume` | Volumen | period 20 | n | Reihe | Methodik (Screener rechnet `relVol` in `feature-store.js` mit derselben Formel) | T1 |
| `volumeSpikes` | Volumen | period 20, threshold 2 | n | 1/0 | Methodik | T1 |

## Neu in 1.2.0 (Backlog B6, nur Katalog)

| id | Familie | Standardparameter | Aufwärmphase (Index) | Ausgaben | Definition | Test |
|---|---|---|---|---|---|---|
| `pivots` | Trend | – | 1 | pivot, r1, r2, s1, s2 | Aus H, L, C der **Vorbar**: P = (H+L+C)/3, R1 = 2P−L, S1 = 2P−H, R2 = P+(H−L), S2 = P−(H−L). | T3 |
| `kama` | Trend | period 10, fast 2, slow 30 | n | Reihe | ER = \|C−C₋ₙ\| / Σ\|ΔC\|; SC = (ER·(2/(f+1)−2/(s+1)) + 2/(s+1))²; KAMA += SC·(C−KAMA). Startwert C₍ₙ₋₁₎ wird nicht ausgegeben. | T3 |
| `hma` | Trend | period 20 | n+⌊√n⌋−2 (= 22) | Reihe | WMA₍⌊√n⌋₎(2·WMA₍⌊n/2⌋₎ − WMAₙ) | T3 |
| `linreg` | Trend | period 50, k 2 | n−1 | value, slope, upper, lower, r2 | KQ-Gerade durch die letzten n Schlüsse. Ausgaben: Endwert, Steigung je Bar, ± k·σ der Residuen (Population) und seit 1.3.0 das Bestimmtheitsmaß R² (konstante Reihe: kein Wert). | T3, T4 |
| `heikinAshi` | Trend | – | 0 | open, high, low, close | HC = (O+H+L+C)/4; HO = (HO₋₁+HC₋₁)/2, Start (O+C)/2; HH = max(H, HO, HC); HL = min(L, HO, HC) | T3 |
| `roc63` | Momentum | period 63 | 63 | Reihe | Voreinstellung von `roc` (`base: "roc"`) | T3 |
| `roc126` | Momentum | period 126 | 126 | Reihe | Voreinstellung von `roc` | T3 |
| `roc252` | Momentum | period 252 | 252 | Reihe | Voreinstellung von `roc` | T3 |
| `trix` | Momentum | period 15, signal 9 | 3(n−1)+1 (= 43); Signal +8 | trix, signal | 100·(E3ᵢ/E3ᵢ₋₁ − 1), E3 = EMA(EMA(EMA(C))); Signal = EMAₛ(TRIX) | T3 |
| `ultimateOscillator` | Momentum | short 7, medium 14, long 28 | long (= 28) | Reihe | 100·(4A₇ + 2A₁₄ + A₂₈)/7 mit A = ΣBP/ΣTR, BP = C − min(L, C₋₁), TR = max(H, C₋₁) − min(L, C₋₁). Ohne Spanne: 50. | T3 |
| `cmo` | Momentum | period 14 | n | Reihe | 100·(Su−Sd)/(Su+Sd) über n Schlussänderungen, ungeglättet nach Chande. TA-Lib glättet dagegen nach Wilder. | T3 |
| `chandelier` | Volatilität | period 22, multiplier 3 | n−1 | long, short | long = HHₙ − m·ATRₙ, short = LLₙ + m·ATRₙ (ATR nach Wilder) | T3 |
| `insideBar` | Volatilität | – | 1 | 1/0 | H < H₋₁ und L > L₋₁ (strikt) | T3 |
| `nr7` | Volatilität | period 7 | n−1 | 1/0 | Die Spanne H−L ist die kleinste der letzten n Bars. Ein Gleichstand zählt als kleinste. | T3 |

Die direkten Funktionen stehen zusätzlich in der API: `pivots`, `trix`, `ultimateOscillator`, `cmo`, `kama`, `hma`, `chandelier`, `linreg`, `insideBar`, `narrowRange` und `heikinAshi`.

Prüfungen in T3 für jeden neuen Indikator:

- **(a)** Eine naive Referenz auf AAPL mit Toleranz 1e-9 relativ.
- **(b)** Ein Handbeispiel mit festen Zahlen.
- **(c)** Kausalität: Der Wert an *t* ist auf der vollen, der bei *t* abgeschnittenen und der nach *t* vergifteten Reihe gleich.
- **(d)** Die Zahl der NaN je Ausgabe entspricht der dokumentierten Aufwärmphase.

Die Ausgaben aller Indikatoren aus 1.1.0 sind bitgleich geblieben. Geprüft wurde das gegen 1.1.0 auf AAPL und auf einer Lückenreihe, jeweils mit Standard- und Kurzperiode.

## Neu in 1.3.0 (L2a, nur Katalog)

Quelle: Ausbauplan in TECHNICAL_LIBRARY.md. Alle Einträge tragen `catalogOnly: true`; keine Produktfläche ändert sich (weiter 24 gelistete Indikatoren). Testdatei **T4**: `technical-indicators-catalog-l2.test.mjs`.

| id | Familie | Standardparameter | Aufwärmphase (Index) | Ausgaben | Definition | Referenz |
|---|---|---|---|---|---|---|
| `dema` | Trend | period 20 | 2(n−1) | Reihe | 2·EMA − EMA(EMA) | TA-Lib DEMA, exakt |
| `tema` | Trend | period 20 | 3(n−1) | Reihe | 3·E1 − 3·E2 + E3 | TA-Lib TEMA, exakt |
| `trima` | Trend | period 20 | n−1 | Reihe | SMA über SMA, Gewichte 1, 2, …, 2, 1 | TA-Lib TRIMA 20 und 15, exakt |
| `t3` | Trend | period 5, vfactor 0,7 | 6(n−1) | Reihe | Tillson: Gewichtung der EMA-Ketten 3 bis 6 | TA-Lib T3, exakt |
| `zlema` | Trend | period 20 | ⌊(n−1)/2⌋ + n − 1 | Reihe | EMA(2·C − C₋ₗₐ𝓰) | naive Referenz |
| `alma` | Trend | period 9, offset 0,85, sigma 6 | n−1 | Reihe | Gauss-Gewichte um offset·(n−1) | naive Referenz |
| `mcginley` | Trend | period 14 | n−1 | Reihe | MD += (C − MD)/(n·(C/MD)⁴), Start SMA | naive Referenz |
| `ppo` | Momentum | 12 / 26 / 9 | slow+signal−2 (PPO ab slow−1) | ppo, signal, histogram | 100·(EMA_f − EMA_s)/EMA_s | TA-Lib PPO (EMA), exakt |
| `stochRsi` | Momentum | 14 / 14 / 3 / 3 | rsi+stoch+k+d−3 | k, d, raw | Stochastik des RSI; keine Spanne: 50 | TA-Lib STOCHRSI, exakt |
| `natr` | Volatilität | period 14 | n−1 | Reihe | 100·ATR/C | TA-Lib NATR, Startkonvention wie ATR, gleich ab Bar 190 |
| `adLine` | Volumen | – | 0 | Reihe | kumuliert V·CLV | TA-Lib AD, exakt |
| `chaikinOsc` | Volumen | fast 3, slow 10 | slow−1 | Reihe | EMA₃(AD) − EMA₁₀(AD) | TA-Lib ADOSC, Startkonvention, gleich ab Bar 119 |
| `balanceOfPower` | Momentum | period 14 | 0 (geglättet n−1) | bop, smoothed | (C − O)/(H − L) | TA-Lib BOP, exakt |
| `momentum` | Momentum | period 10 | n | Reihe | C − C₋ₙ | TA-Lib MOM, exakt |
| `stdDev` | Volatilität | period 20 | n−1 | Reihe | Populationsstreuung | TA-Lib STDDEV, exakt |

**TA-Lib-Abgleich der 1.2.0-Einträge (L3):**
- **Exakt gleich:** `kama`, `linreg` (Wert, Steigung, R² = CORREL²), `trix` und `ultimateOscillator`.
- **`cmo` folgt einer anderen Definition.** TA-Lib glättet nach Wilder und ist damit identisch mit 2·RSI − 100. Die Engine rechnet nach Chande/Kroll mit einfachen Summen. T4 hält beides fest.

Die Ausgaben aller Einträge bis 1.2.1 sind unverändert. `linreg` bekommt nur die zusätzliche Ausgabe `r2`.

## Neu in 1.4.0 (L2b, nur Katalog)

24 Einträge, alle `catalogOnly: true`. Weiter gelistet: 24 Indikatoren, der Katalog umfasst 77. Testdatei **T5**: `technical-indicators-catalog-l2b.test.mjs`.

**Referenz „Bausteine“:** Die Formel ist ein zweites Mal aus TA-Lib-Grundfunktionen zusammengesetzt (SMA, EMA, WMA, ROC, SUM, MAX, MIN, STDDEV, MEDPRICE, PPO). Grundlage sind echte AAPL-Kurse, eingefroren in `technical-talib-reference-aapl-ext2.json`. Für die Einträge mit dieser Referenz stimmt jede Bar, auch die erste.

| id | Familie | Standard | Aufwärmphase | Ausgaben | Definition | Referenz |
|---|---|---|---|---|---|---|
| `vortex` | Trend | 14 | n | plus, minus | VI± = Σ\|H − L₋₁\| bzw. Σ\|L − H₋₁\| / ΣTR | Bausteine |
| `massIndex` | Volatilität | 9 / 25 | 2(e−1)+s−1 | Reihe | Σ_s EMA(H−L)/EMA(EMA(H−L)) | Bausteine |
| `choppiness` | Trend | 14 | n | Reihe | 100·log10(ΣTR/(HH−LL))/log10(n) | Bausteine |
| `ulcerIndex` | Volatilität | 14 | 2(n−1) | Reihe | √ Mittel der quadrierten %-Rückgänge vom n-Hoch | Bausteine |
| `forceIndex` | Volumen | 13 | n | Reihe | EMA((C − C₋₁)·V) | Bausteine |
| `elderRay` | Momentum | 13 | n−1 | bull, bear | H bzw. L − EMA(C) | Bausteine |
| `easeOfMovement` | Volumen | 14, scale 1e8 | n | Reihe | SMA(ΔMittelpreis/((V/scale)/(H−L))); H = L oder V = 0: nicht definiert | naive Referenz |
| `awesomeOscillator` | Momentum | 5 / 34 | s−1 | Reihe | SMA₅ − SMA₃₄ des Mittelpreises | Bausteine |
| `coppock` | Momentum | 14 / 11 / 10 | a+w−1 | Reihe | WMA(ROC₁₄ + ROC₁₁) | Bausteine |
| `kst` | Momentum | Pring | 44 (Signal +8) | kst, signal | 1·SMA10(ROC10) + 2·SMA10(ROC15) + 3·SMA10(ROC20) + 4·SMA15(ROC30) | Bausteine |
| `tsi` | Momentum | 25 / 13 / 7 | l+s−1 | tsi, signal | 100·EMA(EMA(ΔC))/EMA(EMA(\|ΔC\|)) | Bausteine |
| `dpo` | Momentum | 20 | n−1 | Reihe | **kausal:** C₋₍⌊n/2⌋₊₁₎ − SMA_n. Die zentrierte Form braucht Zukunft und fehlt bewusst. | Bausteine |
| `historicalVolatility` | Volatilität | 20, 252 | n | Reihe | Stichprobenstreuung der Log-Renditen · √252, in % | Bausteine |
| `zScore` | Volatilität | 20 | n−1 | Reihe | (C − SMA)/σ (Population) | Bausteine |
| `nvi` / `pvi` | Volumen | – | 0 | Reihe | Fosback, Start 1000 | naive Referenz |
| `pvo` | Volumen | 12 / 26 / 9 | wie PPO | pvo, signal, histogram | PPO auf dem Volumen | Bausteine (TA-Lib PPO) |
| `connorsRsi` | Momentum | 3 / 2 / 100 | 101 | Reihe | (RSI₃ + RSI₂(Serie) + Perzentilrang₁₀₀(ROC1))/3 | naive Referenz |
| `elderImpulse` | Momentum | 13 / 12 / 26 / 9 | 34 | +1/0/−1 | Steigung von EMA13 und MACD-Histogramm gleichgerichtet | naive Referenz |
| `chaikinVolatility` | Volatilität | 10 / 10 | n−1+r | Reihe | 100·(EMA(H−L)/EMA(H−L)₋ᵣ − 1) | Bausteine |
| `envelope` | Trend | 20, 2,5 % | n−1 | middle, upper, lower | SMA ± pct % | naive Referenz |
| `pivotsFib` / `pivotsCamarilla` / `pivotsWoodie` | Trend | – | 1 | p, r…, s… | Varianten aus der Vorbar | naive Referenz |

## Neu in 1.5.0 (L2 abgeschlossen, nur Katalog)

| id | Name | Definition | Referenz |
|---|---|---|---|
| `klinger` | Klinger Volume Oscillator | Trend = +1, wenn H+L+C über dem Vortag liegt, sonst −1; dm = H − L; cm kumuliert dm bei gleichem Trend, sonst cm = dm₋₁ + dm; VF = V·\|2·dm/cm − 1\|·Trend·100; KVO = EMA₃₄(VF) − EMA₅₅(VF); Signal EMA₁₃(KVO) | TA-Lib hat kein Gegenstück. Eine zweite, naive Umsetzung mit eigener EMA stimmt auf echten AAPL-Kursen an jeder Bar überein (`technical-indicators-catalog-klinger.test.mjs`). Erster Wert an Bar 55, Signal an Bar 67. |
