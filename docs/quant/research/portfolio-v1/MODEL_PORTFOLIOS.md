# Musterportfolios nach dem VU-Portfolio-Standard (Forschung, nicht zertifiziert)

> Erzeugt von `scripts/quant/portfolio/render-model-portfolios.cjs` aus `model-portfolios.json` (vu-model-portfolios-1.0.0). Nicht von Hand ändern.

**Forschung, nicht zertifiziert.** Historische Rekonstruktion, keine Empfehlung, keine Renditezusage. Interne Vorschau; eine öffentliche Darstellung braucht die Owner-Freigabe (öffentliche Renditeaussage) und die Abstimmung mit der Rechtsberatung.

## Datenbasis

| Größe | Wert |
|---|---|
| Zeitraum angefragt | 2012-01-01 bis 2026-10-31 |
| Zeitraum realisiert | 2012-01-06 bis 2026-10-02 (**verkürzt:** Benchmark endet 2026-10-02, 4 Wochen fehlen) |
| Population | Heute vorhandene Kursdateien (R2-Tagesbalken) mit heutigem SIC-Code plus qualifizierte V13-Ketten delisteter Titel (Register 1.0.0); keine vollständige damalige Population, keine historische Indexmitgliedschaft. |
| Rendite-Basis | TOTAL_RETURN |
| Benchmark | SPY_TOTAL_RETURN_DIVIDENDS_REINVESTED |
| Kurse | R2_CANONICAL_DAILY_TIINGO |
| delistete Titel | V13_PRIVATE_ARCHIVE_REGISTER_1.0.0_QUALIFIED |
| Fundamentaldaten | PIT_ORIGINAL_FILING |
| Titel im Panel | 6870 (mit Fundamentaldaten 6817) |
| Gewichtung | RISK_PARITY (Risikoparität auf Ledoit/Wolf-geschrumpfter Kovarianz, 104 Wochen) |
| Standard | 15–30 Titel (Ziel 25), max. 8,0 % je Titel, max. 25,0 % je Branche (Fama/French 12 aus SIC), Kurs ≥ 5 USD, ADV ≥ 2 Mio. USD (ersatzweise Marktkap. ≥ 300 Mio.), höchstens 5,0 % des ADV bei 10 Mio. USD Vermögen |
| Kosten je Seite | Gebühr 1 bp + Slippage 5 bp + halber Spread nach Liquiditätsklasse (2–50 bp) |
| Rebalancing | alle 4 Wochen, Entscheidung zum Wochenschluss, Ausführung zum Schluss der Folgewoche |
| Endwert delisteter Titel | Übernahme 100 %, unbekannt 70 %, Notlage 0 % des letzten Schlusses: Klassenannahme, kein beobachteter Erlös (Sensitivität unten) |

Ausgeschlossen: 972 heutige Titel ohne Branche, 58 delistete ohne Branche, 0 delistete ohne Gesamtrendite, 0 delistete ohne passende Tagesbalken.

## Ergebnis je Musterportfolio

| Portfolio | CAGR | Benchmark CAGR | Differenz | Volatilität | Max. Drawdown | Beta | Sharpe (rf 0) | Turnover p. a. | Ø Titel |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Quality Compounder | 10,9 % | 14,9 % | -4,0 % | 15,1 % | -35,1 % | 0,86 | 0,76 | 215,9 % | 25,00 |
| Momentum Leader | 13,0 % | 14,9 % | -2,0 % | 16,6 % | -33,8 % | 0,87 | 0,82 | 482,2 % | 25,00 |
| GARP | 6,0 % | 14,9 % | -9,0 % | 21,6 % | -50,5 % | 1,10 | 0,38 | 299,3 % | 25,00 |
| Defensive Quality | 13,4 % | 14,9 % | -1,5 % | 15,0 % | -30,6 % | 0,81 | 0,92 | 376,0 % | 25,00 |
| Value Momentum | 12,6 % | 14,9 % | -2,3 % | 19,3 % | -45,1 % | 0,99 | 0,71 | 515,3 % | 25,00 |

Benchmark: Volatilität und Max. Drawdown je Lauf in `model-portfolios.json` (`benchmarkVolatility`, `benchmarkMaxDrawdown`).

## Walk-forward: je Testfenster

Die Regeln sind vorab festgelegt und werden nicht angepasst; Risikomodell und Scores werden je Stichtag nur aus der Vergangenheit geschätzt. Die Tabelle zeigt jedes Drei-Jahres-Fenster für sich.

| Portfolio | Fenster | CAGR | Benchmark | Differenz | Max. Drawdown | Beta |
|---|---|--:|--:|--:|--:|--:|
| Quality Compounder | 2012-01-06 bis 2014-12-26 | 18,7 % | 20,4 % | -1,7 % | -7,7 % | 0,92 |
| Quality Compounder | 2015-01-02 bis 2017-12-29 | 13,4 % | 11,4 % | 2,0 % | -13,4 % | 0,90 |
| Quality Compounder | 2018-01-05 bis 2020-12-31 | 10,6 % | 13,2 % | -2,6 % | -35,1 % | 0,94 |
| Quality Compounder | 2021-01-08 bis 2023-12-29 | 2,9 % | 9,3 % | -6,4 % | -19,5 % | 0,83 |
| Quality Compounder | 2024-01-05 bis 2026-10-02 | 8,5 % | 21,3 % | -12,8 % | -11,5 % | 0,64 |
| Momentum Leader | 2012-01-06 bis 2014-12-26 | 27,1 % | 20,4 % | 6,7 % | -7,9 % | 0,90 |
| Momentum Leader | 2015-01-02 bis 2017-12-29 | 11,9 % | 11,4 % | 0,5 % | -10,7 % | 0,87 |
| Momentum Leader | 2018-01-05 bis 2020-12-31 | 13,4 % | 13,2 % | 0,3 % | -33,8 % | 0,94 |
| Momentum Leader | 2021-01-08 bis 2023-12-29 | 1,6 % | 9,3 % | -7,7 % | -26,8 % | 0,82 |
| Momentum Leader | 2024-01-05 bis 2026-10-02 | 12,5 % | 21,3 % | -8,8 % | -17,8 % | 0,74 |
| GARP | 2012-01-06 bis 2014-12-26 | 13,1 % | 20,4 % | -7,2 % | -17,7 % | 1,24 |
| GARP | 2015-01-02 bis 2017-12-29 | 13,5 % | 11,4 % | 2,1 % | -23,9 % | 1,30 |
| GARP | 2018-01-05 bis 2020-12-31 | -3,9 % | 13,2 % | -17,1 % | -50,5 % | 1,17 |
| GARP | 2021-01-08 bis 2023-12-29 | -4,9 % | 9,3 % | -14,2 % | -38,1 % | 1,02 |
| GARP | 2024-01-05 bis 2026-10-02 | 12,2 % | 21,3 % | -9,1 % | -19,6 % | 0,79 |
| Defensive Quality | 2012-01-06 bis 2014-12-26 | 21,7 % | 20,4 % | 1,3 % | -7,6 % | 0,91 |
| Defensive Quality | 2015-01-02 bis 2017-12-29 | 15,9 % | 11,4 % | 4,5 % | -10,0 % | 0,85 |
| Defensive Quality | 2018-01-05 bis 2020-12-31 | 14,0 % | 13,2 % | 0,9 % | -30,6 % | 0,89 |
| Defensive Quality | 2021-01-08 bis 2023-12-29 | 1,6 % | 9,3 % | -7,7 % | -25,0 % | 0,77 |
| Defensive Quality | 2024-01-05 bis 2026-10-02 | 14,7 % | 21,3 % | -6,6 % | -8,5 % | 0,57 |
| Value Momentum | 2012-01-06 bis 2014-12-26 | 23,4 % | 20,4 % | 3,0 % | -12,2 % | 1,14 |
| Value Momentum | 2015-01-02 bis 2017-12-29 | 8,0 % | 11,4 % | -3,4 % | -15,2 % | 1,09 |
| Value Momentum | 2018-01-05 bis 2020-12-31 | -2,7 % | 13,2 % | -15,9 % | -45,1 % | 1,07 |
| Value Momentum | 2021-01-08 bis 2023-12-29 | 13,3 % | 9,3 % | 4,0 % | -19,7 % | 0,85 |
| Value Momentum | 2024-01-05 bis 2026-10-02 | 21,0 % | 21,3 % | -0,3 % | -18,8 % | 0,81 |

## Sensitivität

Varianten gegen den Standardlauf: Gleichgewichtung, Umschlag-Puffer (gehaltene Titel bleiben, solange sie unter den besten 50 liegen), Quartalsrhythmus (13 Wochen) und Endwertannahmen.

| Portfolio | Variante | CAGR | Benchmark | Volatilität | Max. Drawdown | Beta | Turnover p. a. |
|---|---|--:|--:|--:|--:|--:|--:|
| Quality Compounder | WEIGHTING_EQUAL | 11,3 % | 14,9 % | 15,4 % | -34,3 % | 0,88 | 216,4 % |
| Quality Compounder | TURNOVER_BUFFER_50 | 11,5 % | 14,9 % | 15,1 % | -34,9 % | 0,86 | 138,9 % |
| Quality Compounder | TURNOVER_QUARTERLY | 11,3 % | 14,9 % | 15,1 % | -34,2 % | 0,86 | 127,3 % |
| Quality Compounder | TURNOVER_BUFFER_50_QUARTERLY | 13,9 % | 14,9 % | 15,0 % | -33,5 % | 0,85 | 88,2 % |
| Quality Compounder | TERMINAL_LAST_CLOSE | 11,1 % | 14,9 % | 15,1 % | -35,1 % | 0,86 | 215,8 % |
| Quality Compounder | TERMINAL_HARSH | 10,6 % | 14,9 % | 15,2 % | -35,1 % | 0,86 | 216,0 % |
| Momentum Leader | WEIGHTING_EQUAL | 14,3 % | 14,9 % | 17,0 % | -33,8 % | 0,89 | 475,3 % |
| Momentum Leader | TURNOVER_BUFFER_50 | 12,3 % | 14,9 % | 16,8 % | -36,2 % | 0,89 | 321,6 % |
| Momentum Leader | TURNOVER_QUARTERLY | 11,8 % | 14,9 % | 16,9 % | -36,9 % | 0,90 | 239,0 % |
| Momentum Leader | TURNOVER_BUFFER_50_QUARTERLY | 12,6 % | 14,9 % | 17,0 % | -38,5 % | 0,92 | 190,8 % |
| Momentum Leader | TERMINAL_LAST_CLOSE | 13,1 % | 14,9 % | 16,6 % | -33,8 % | 0,87 | 482,1 % |
| Momentum Leader | TERMINAL_HARSH | 12,8 % | 14,9 % | 16,5 % | -33,8 % | 0,87 | 482,3 % |
| GARP | WEIGHTING_EQUAL | 6,8 % | 14,9 % | 22,6 % | -51,0 % | 1,13 | 297,5 % |
| GARP | TURNOVER_BUFFER_50 | 6,1 % | 14,9 % | 20,9 % | -48,1 % | 1,06 | 185,4 % |
| GARP | TURNOVER_QUARTERLY | 5,1 % | 14,9 % | 21,0 % | -51,5 % | 1,05 | 155,0 % |
| GARP | TURNOVER_BUFFER_50_QUARTERLY | 6,5 % | 14,9 % | 20,5 % | -48,1 % | 1,01 | 116,9 % |
| GARP | TERMINAL_LAST_CLOSE | 6,3 % | 14,9 % | 21,5 % | -50,5 % | 1,09 | 299,3 % |
| GARP | TERMINAL_HARSH | 5,5 % | 14,9 % | 21,6 % | -50,5 % | 1,10 | 299,4 % |
| Defensive Quality | WEIGHTING_EQUAL | 14,1 % | 14,9 % | 15,2 % | -30,7 % | 0,83 | 373,2 % |
| Defensive Quality | TURNOVER_BUFFER_50 | 13,2 % | 14,9 % | 14,9 % | -30,4 % | 0,82 | 227,6 % |
| Defensive Quality | TURNOVER_QUARTERLY | 12,6 % | 14,9 % | 14,8 % | -30,8 % | 0,81 | 190,7 % |
| Defensive Quality | TURNOVER_BUFFER_50_QUARTERLY | 13,4 % | 14,9 % | 14,8 % | -28,3 % | 0,82 | 143,5 % |
| Defensive Quality | TERMINAL_LAST_CLOSE | 13,6 % | 14,9 % | 14,9 % | -30,6 % | 0,81 | 376,0 % |
| Defensive Quality | TERMINAL_HARSH | 13,2 % | 14,9 % | 15,0 % | -30,6 % | 0,81 | 376,1 % |
| Value Momentum | WEIGHTING_EQUAL | 13,6 % | 14,9 % | 20,3 % | -48,4 % | 1,01 | 507,9 % |
| Value Momentum | TURNOVER_BUFFER_50 | 13,1 % | 14,9 % | 19,1 % | -39,3 % | 0,97 | 306,4 % |
| Value Momentum | TURNOVER_QUARTERLY | 11,9 % | 14,9 % | 19,6 % | -46,9 % | 1,02 | 226,1 % |
| Value Momentum | TURNOVER_BUFFER_50_QUARTERLY | 13,7 % | 14,9 % | 19,9 % | -47,6 % | 1,02 | 170,8 % |
| Value Momentum | TERMINAL_LAST_CLOSE | 12,9 % | 14,9 % | 19,3 % | -45,1 % | 0,98 | 515,3 % |
| Value Momentum | TERMINAL_HARSH | 12,3 % | 14,9 % | 19,3 % | -45,1 % | 0,99 | 515,4 % |

## Abdeckung je Jahr (Stichtag 30.06.)

| Jahr | Titel mit Kurs | mit frischen Fundamentaldaten | davon später delistet |
|--:|--:|--:|--:|
| 2012 | 3106 | 1960 | 788 |
| 2013 | 3215 | 2219 | 804 |
| 2014 | 3419 | 2374 | 844 |
| 2015 | 3553 | 2519 | 838 |
| 2016 | 3637 | 2598 | 774 |
| 2017 | 3745 | 2635 | 735 |
| 2018 | 3871 | 2856 | 661 |
| 2019 | 3947 | 3183 | 574 |
| 2020 | 4034 | 3303 | 503 |
| 2021 | 4598 | 3445 | 622 |
| 2022 | 4924 | 3845 | 651 |
| 2023 | 4821 | 3935 | 402 |
| 2024 | 4832 | 3969 | 226 |
| 2025 | 5047 | 4143 | 138 |
| 2026 | 5270 | 4308 | 17 |

## Offene Grenzen

- Keine historische Indexmitgliedschaft: Universum sind alle damals handelbaren US-Stammaktien mit SIC, Kurs- und Liquiditätsfilter, nicht der S&P 500 von damals.
- Population: heute vorhandene Kursdateien mit heutigem SIC-Code plus qualifizierte V13-Ketten delisteter Titel. Das ist keine vollständige damalige Population; Titel ohne SIC und nicht qualifizierte Delistings fehlen (Zählung in model-portfolios.json, data.counts).
- Die je Stichtag gespeicherte Mitgliedschaft enthält nur in der Folgewoche ausführbare Titel; nicht ausgeführte Ziele stehen getrennt (unfilledAtExecution) und bleiben Cash.
- Walk-forward heißt hier rollierende Schätzung mit festen Regeln. Es gibt keine unberührte OOS-Periode, die Testfenster teilen denselben Pfad, und über die fünf Profile wird nicht für Mehrfachtests korrigiert.
- Der realisierte Zeitraum endet früher als angefragt, weil die Benchmark-Reihe früher endet (siehe Datenbasis).
- Branche aus dem heutigen SIC-Code (SEC), keine historische Klassifikation.
- Spread aus Liquiditätsklassen modelliert, keine beobachteten Geld-Brief-Kurse.
- Endwert delisteter Titel ist eine vorab festgelegte Annahme je Klasse (Sensitivität oben).
- Delistete Titel nur mit vollständiger Gesamtrendite-Reihe und passenden Tagesbalken (Rohschluss je Datum über splitFactors, Tagesumsatz aus den Balken); andere werden ausgeschlossen und gezählt.
- Faktoren sind eine dokumentierte Rekonstruktion (`portfolio-pit-factors-1.0.0`), nicht die Live-Faktorevidenz; earnings-revision-leader fehlt (keine historischen Analystenrevisionen).
- Ein Ergebnis über oder unter dem Index ist kein Beleg für eine dauerhafte Kante; die Quant-Forschung V10–V13c fand nach Mehrfachtest-Korrektur keinen robusten Vorsprung gegenüber dem S&P 500.
