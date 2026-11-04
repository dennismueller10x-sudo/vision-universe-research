# Musterportfolios nach dem VU-Portfolio-Standard (Forschung, nicht zertifiziert)

> Erzeugt von `scripts/quant/portfolio/render-model-portfolios.cjs` aus `model-portfolios.json` (vu-model-portfolios-1.0.0). Nicht von Hand ändern.

**Forschung, nicht zertifiziert.** Historische Rekonstruktion, keine Empfehlung, keine Renditezusage. Interne Vorschau; eine öffentliche Darstellung braucht die Owner-Freigabe (öffentliche Renditeaussage) und die Abstimmung mit der Rechtsberatung.

## Datenbasis

| Größe | Wert |
|---|---|
| Zeitraum | 2012-01-01 bis 2026-10-31 |
| Rendite-Basis | TOTAL_RETURN |
| Benchmark | SPY_TOTAL_RETURN_DIVIDENDS_REINVESTED |
| Kurse | R2_CANONICAL_DAILY_TIINGO |
| delistete Titel | V13_PRIVATE_ARCHIVE_REGISTER_1.0.0_QUALIFIED |
| Fundamentaldaten | PIT_ORIGINAL_FILING |
| Titel im Panel | 6866 (mit Fundamentaldaten 6611) |
| Gewichtung | RISK_PARITY (Risikoparität auf Ledoit/Wolf-geschrumpfter Kovarianz, 104 Wochen) |
| Standard | 15–30 Titel (Ziel 25), max. 8,0 % je Titel, max. 25,0 % je Branche (Fama/French 12 aus SIC), Kurs ≥ 5 USD, ADV ≥ 2 Mio. USD (ersatzweise Marktkap. ≥ 300 Mio.), höchstens 5,0 % des ADV bei 10 Mio. USD Vermögen |
| Kosten je Seite | Gebühr 1 bp + Slippage 5 bp + halber Spread nach Liquiditätsklasse (2–50 bp) |
| Rebalancing | alle 4 Wochen, Entscheidung zum Wochenschluss, Ausführung zum Schluss der Folgewoche |
| Endwert delisteter Titel | Übernahme 100 %, unbekannt 70 %, Notlage 0 % des letzten Schlusses (Sensitivität unten) |

## Ergebnis je Musterportfolio

| Portfolio | CAGR | Benchmark CAGR | Differenz | Volatilität | Max. Drawdown | Beta | Sharpe (rf 0) | Turnover p. a. | Ø Titel |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Quality Compounder | 11,2 % | 14,9 % | -3,7 % | 15,1 % | -35,3 % | 0,86 | 0,78 | 221,9 % | 25,00 |
| Momentum Leader | 12,9 % | 14,9 % | -2,0 % | 16,4 % | -33,8 % | 0,86 | 0,82 | 477,9 % | 25,00 |
| GARP | 5,6 % | 14,9 % | -9,3 % | 20,9 % | -52,0 % | 1,07 | 0,37 | 280,1 % | 25,00 |
| Defensive Quality | 13,8 % | 14,9 % | -1,1 % | 14,9 % | -30,6 % | 0,81 | 0,94 | 372,2 % | 25,00 |
| Value Momentum | 13,0 % | 14,9 % | -1,9 % | 18,9 % | -45,6 % | 0,96 | 0,74 | 502,9 % | 25,00 |

Benchmark: Volatilität und Max. Drawdown je Lauf in `model-portfolios.json` (`benchmarkVolatility`, `benchmarkMaxDrawdown`).

## Walk-forward: je Testfenster

Die Regeln sind vorab festgelegt und werden nicht angepasst; Risikomodell und Scores werden je Stichtag nur aus der Vergangenheit geschätzt. Die Tabelle zeigt jedes Drei-Jahres-Fenster für sich.

| Portfolio | Fenster | CAGR | Benchmark | Differenz | Max. Drawdown | Beta |
|---|---|--:|--:|--:|--:|--:|
| Quality Compounder | 2012-01-06 bis 2014-12-26 | 20,5 % | 20,4 % | 0,1 % | -7,7 % | 0,91 |
| Quality Compounder | 2015-01-02 bis 2017-12-29 | 12,0 % | 11,4 % | 0,6 % | -13,2 % | 0,91 |
| Quality Compounder | 2018-01-05 bis 2020-12-31 | 11,9 % | 13,2 % | -1,3 % | -35,3 % | 0,93 |
| Quality Compounder | 2021-01-08 bis 2023-12-29 | 3,1 % | 9,3 % | -6,3 % | -18,9 % | 0,83 |
| Quality Compounder | 2024-01-05 bis 2026-10-02 | 8,1 % | 21,3 % | -13,3 % | -11,9 % | 0,64 |
| Momentum Leader | 2012-01-06 bis 2014-12-26 | 26,7 % | 20,4 % | 6,3 % | -8,2 % | 0,85 |
| Momentum Leader | 2015-01-02 bis 2017-12-29 | 11,6 % | 11,4 % | 0,2 % | -10,8 % | 0,86 |
| Momentum Leader | 2018-01-05 bis 2020-12-31 | 13,9 % | 13,2 % | 0,7 % | -33,8 % | 0,94 |
| Momentum Leader | 2021-01-08 bis 2023-12-29 | 1,6 % | 9,3 % | -7,7 % | -26,9 % | 0,81 |
| Momentum Leader | 2024-01-05 bis 2026-10-02 | 12,6 % | 21,3 % | -8,7 % | -17,8 % | 0,73 |
| GARP | 2012-01-06 bis 2014-12-26 | 16,4 % | 20,4 % | -4,0 % | -16,5 % | 1,14 |
| GARP | 2015-01-02 bis 2017-12-29 | 8,7 % | 11,4 % | -2,7 % | -24,7 % | 1,23 |
| GARP | 2018-01-05 bis 2020-12-31 | -5,0 % | 13,2 % | -18,1 % | -52,0 % | 1,16 |
| GARP | 2021-01-08 bis 2023-12-29 | -3,4 % | 9,3 % | -12,7 % | -35,5 % | 1,01 |
| GARP | 2024-01-05 bis 2026-10-02 | 11,4 % | 21,3 % | -10,0 % | -19,2 % | 0,76 |
| Defensive Quality | 2012-01-06 bis 2014-12-26 | 22,6 % | 20,4 % | 2,2 % | -7,5 % | 0,90 |
| Defensive Quality | 2015-01-02 bis 2017-12-29 | 15,4 % | 11,4 % | 4,1 % | -10,1 % | 0,84 |
| Defensive Quality | 2018-01-05 bis 2020-12-31 | 14,5 % | 13,2 % | 1,3 % | -30,6 % | 0,89 |
| Defensive Quality | 2021-01-08 bis 2023-12-29 | 1,9 % | 9,3 % | -7,4 % | -25,9 % | 0,77 |
| Defensive Quality | 2024-01-05 bis 2026-10-02 | 15,3 % | 21,3 % | -6,1 % | -8,5 % | 0,57 |
| Value Momentum | 2012-01-06 bis 2014-12-26 | 25,8 % | 20,4 % | 5,4 % | -11,4 % | 1,08 |
| Value Momentum | 2015-01-02 bis 2017-12-29 | 6,3 % | 11,4 % | -5,1 % | -16,7 % | 0,99 |
| Value Momentum | 2018-01-05 bis 2020-12-31 | -3,3 % | 13,2 % | -16,5 % | -45,6 % | 1,05 |
| Value Momentum | 2021-01-08 bis 2023-12-29 | 14,5 % | 9,3 % | 5,2 % | -19,7 % | 0,84 |
| Value Momentum | 2024-01-05 bis 2026-10-02 | 22,1 % | 21,3 % | 0,8 % | -18,9 % | 0,79 |

## Sensitivität

| Portfolio | Variante | CAGR | Benchmark | Volatilität | Max. Drawdown | Beta |
|---|---|--:|--:|--:|--:|--:|
| Quality Compounder | WEIGHTING_EQUAL | 11,6 % | 14,9 % | 15,5 % | -34,6 % | 0,87 |
| Quality Compounder | TERMINAL_LAST_CLOSE | 11,6 % | 14,9 % | 15,1 % | -35,3 % | 0,86 |
| Quality Compounder | TERMINAL_HARSH | 10,7 % | 14,9 % | 15,2 % | -35,3 % | 0,86 |
| Momentum Leader | WEIGHTING_EQUAL | 14,3 % | 14,9 % | 16,9 % | -33,8 % | 0,88 |
| Momentum Leader | TERMINAL_LAST_CLOSE | 13,1 % | 14,9 % | 16,4 % | -33,8 % | 0,86 |
| Momentum Leader | TERMINAL_HARSH | 12,6 % | 14,9 % | 16,4 % | -33,8 % | 0,86 |
| GARP | WEIGHTING_EQUAL | 6,6 % | 14,9 % | 22,0 % | -52,4 % | 1,10 |
| GARP | TERMINAL_LAST_CLOSE | 6,1 % | 14,9 % | 20,9 % | -52,0 % | 1,07 |
| GARP | TERMINAL_HARSH | 4,9 % | 14,9 % | 21,0 % | -52,0 % | 1,07 |
| Defensive Quality | WEIGHTING_EQUAL | 14,6 % | 14,9 % | 15,2 % | -30,7 % | 0,83 |
| Defensive Quality | TERMINAL_LAST_CLOSE | 13,9 % | 14,9 % | 14,9 % | -30,6 % | 0,81 |
| Defensive Quality | TERMINAL_HARSH | 13,6 % | 14,9 % | 15,0 % | -30,6 % | 0,81 |
| Value Momentum | WEIGHTING_EQUAL | 14,3 % | 14,9 % | 20,0 % | -48,6 % | 0,99 |
| Value Momentum | TERMINAL_LAST_CLOSE | 13,7 % | 14,9 % | 18,9 % | -45,6 % | 0,96 |
| Value Momentum | TERMINAL_HARSH | 12,1 % | 14,9 % | 19,0 % | -45,6 % | 0,96 |

## Abdeckung je Jahr (Stichtag 30.06.)

| Jahr | Titel mit Kurs | mit frischen Fundamentaldaten | davon später delistet |
|--:|--:|--:|--:|
| 2012 | 3105 | 1909 | 788 |
| 2013 | 3214 | 2154 | 804 |
| 2014 | 3418 | 2308 | 844 |
| 2015 | 3552 | 2450 | 838 |
| 2016 | 3636 | 2524 | 774 |
| 2017 | 3744 | 2559 | 735 |
| 2018 | 3870 | 2768 | 661 |
| 2019 | 3946 | 3088 | 574 |
| 2020 | 4033 | 3197 | 503 |
| 2021 | 4596 | 3338 | 622 |
| 2022 | 4922 | 3730 | 651 |
| 2023 | 4819 | 3811 | 402 |
| 2024 | 4829 | 3836 | 226 |
| 2025 | 5045 | 4000 | 138 |
| 2026 | 5266 | 4149 | 17 |

## Offene Grenzen

- Keine historische Indexmitgliedschaft: Universum sind alle damals handelbaren US-Stammaktien mit SIC, Kurs- und Liquiditätsfilter, nicht der S&P 500 von damals.
- Branche aus dem heutigen SIC-Code (SEC), keine historische Klassifikation.
- Spread aus Liquiditätsklassen modelliert, keine beobachteten Geld-Brief-Kurse.
- Endwert delisteter Titel ist eine vorab festgelegte Annahme je Klasse (Sensitivität oben).
- Delistete Titel ohne Tagesumsatz: Liquidität über die Marktkapitalisierung (SEC-Aktienzahl × Kurs).
- Faktoren sind eine dokumentierte Rekonstruktion (`portfolio-pit-factors-1.0.0`), nicht die Live-Faktorevidenz; earnings-revision-leader fehlt (keine historischen Analystenrevisionen).
- Ein Ergebnis über oder unter dem Index ist kein Beleg für eine dauerhafte Kante; die Quant-Forschung V10–V13c fand nach Mehrfachtest-Korrektur keinen robusten Vorsprung gegenüber dem S&P 500.
