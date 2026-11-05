# E3 – Edge-Studie: Bericht

**Forschung, nicht zertifiziert.** Ausführung nach dem eingefrorenen [Protokoll](PROTOKOLL.md) (SHA-256 `9d4c41e36418e1d4df4d020ec4c7fb015bbc91a7df8bb193eb629e397da6e818`). Keine Empfehlung, keine Renditewerbung.

## Ergebnis

- Vorab gewählte Variante **Q-momentum-leader-N20-W13-F0** im Prüfteil 2020-01-03 bis 2026-10-02: CAGR 9,3 % gegen SPY 15,4 % (RSP 11,2 %, IWM 9,6 %), Sharpe 0,52 gegen 0,85, maximaler Verlust -36,7 % gegen -31,8 %. Urteil: **schlägt nicht**.
- Urteile über alle 96 Varianten: 12× „nicht bestimmbar (blockiert)“, 84× „schlägt nicht“. Keine Variante erreicht Holm-p ≤ 0,05.
- Roh (ohne Signifikanz) über der SPY-Gesamtrendite im Prüfteil: Q-value-momentum-N20-W13-F0 (17,1 %), Q-value-momentum-N20-W26-F0 (16,6 %). Diese Varianten waren nicht die vorab gewählten; eine nachträgliche Auswahl ist nach Protokoll ausgeschlossen.
- Befund: kein robuster Nachweis, dass eine der geprüften Methoden den S&P 500 nach Kosten schlägt. Das ist keine bewiesene Gleichheit.
- Hypothese für später (nicht ausgewählt, keine Aussage): Value Momentum mit 20 Titeln lag im Prüfteil roh über SPY. Prüfbar nur in einer neu vorregistrierten Studie auf dem reservierten Holdout 2008–2015, nicht durch Nachauswahl in E3.

## Stand

- Status: **vollständig**.
- Entwicklung Quant: 2012-01-01 bis 2019-12-31, Anker 2012-01-06, Datei `runs/dev-quant.json`.
- Auswahl (vor Öffnen des Prüfteils festgeschrieben): **Q-momentum-leader-N20-W13-F0**, Regel: höchster Netto-Sharpe (rf=0), dann Netto-CAGR, dann Varianten-ID. Hashes: dev-quant `2d7a4924891b03ab…`, dev-st `f78065c0396c3ff4…`.
- Hypothesen in der Holm-Familie: 192 (fehlende oder blockierte Tests mit p = 1, die Familie wird nie verkleinert).

## Daten

- Population: Heute vorhandene Kursdateien (R2-Tagesbalken) mit heutigem SIC-Code plus qualifizierte V13-Ketten delisteter Titel (Register 1.0.0); keine vollständige damalige Population, keine historische Indexmitgliedschaft.
- Titel im Panel: 6870 (mit Fundamentaldaten 6817); Fundamentaldaten PIT_ORIGINAL_FILING.
- Ausschlüsse: {"candidates":6225,"noSector":972,"notReal":0,"noBars":0,"notInFinalWeek":0,"delisted":1675,"delistedNoSector":58,"delistedExcludedNoTotalReturn":0,"delistedExcludedRawMissing":0,"delistedExcludedRawMismatch":0,"delistedRawFiles":3}
- Benchmarks (Gesamtrendite, Wochenraster ohne Auffüllen): SPY `vorsorge/data/series/SPY.json` `92980c690d9e…`, RSP `vorsorge/data/series/RSP.json` `662f99adb33b…`, IWM `vorsorge/data/series/IWM.json` `02516fa77f61…`.
- Marktfilter: SPY-Tagesschluss `quant/data/market/multi-asset/series/SPY.json` (`25366d61d2b4…`), Schluss > SMA200 inklusive Tag, Gleichstand = Cash.

## Entwicklung (alle 96 Varianten)

Supertrader-Entwicklung nur 2016–2019 (Lücke 2012–2015, siehe Grenzen); Quant 2012–2019.

| Variante | Status | CAGR | SPY | Sharpe | SPY Sharpe | Max. Verlust | Vol | Turnover | Kosten | Titel | zu wenige | Terminal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ST-C01-F0 | RUN | -20,7 % | 16,3 % | -0,19 | 1,29 | -74,2 % | 52,4 % | – | 24,7 % | – | undefined | MERGER:3,UNKNOWN:5 |
| ST-C01-F1 | RUN | -16,7 % | 16,3 % | -0,13 | 1,29 | -65,8 % | 50,0 % | – | 24,6 % | – | undefined | UNKNOWN:5,MERGER:1 |
| ST-C02-F0 | RUN | 23,6 % | 16,3 % | 0,69 | 1,29 | -60,5 % | 45,2 % | – | 32,6 % | – | undefined | MERGER:4,UNKNOWN:1 |
| ST-C02-F1 | RUN | 13,0 % | 16,3 % | 0,49 | 1,29 | -62,2 % | 43,6 % | – | 26,5 % | – | undefined | UNKNOWN:1,MERGER:1 |
| ST-C03-F0 | RUN | -54,0 % | 16,3 % | -5,70 | 1,29 | -95,5 % | 13,3 % | – | 91,2 % | – | undefined | MERGER:7,UNKNOWN:2 |
| ST-C03-F1 | RUN | -52,3 % | 16,3 % | -5,31 | 1,29 | -94,8 % | 13,6 % | – | 90,7 % | – | undefined | UNKNOWN:2,MERGER:5 |
| ST-C08-F0 | RUN | -51,2 % | 16,3 % | -2,80 | 1,29 | -94,9 % | 24,3 % | – | 43,3 % | – | undefined | MERGER:9,UNKNOWN:2 |
| ST-C08-F1 | RUN | -48,1 % | 16,3 % | -2,73 | 1,29 | -93,4 % | 22,8 % | – | 42,3 % | – | undefined | MERGER:5,UNKNOWN:1 |
| ST-C12-F0 | RUN | -14,0 % | 16,3 % | -0,71 | 1,29 | -52,7 % | 18,7 % | – | 21,6 % | – | undefined | UNKNOWN:5,MERGER:5,SERIES_END:1 |
| ST-C12-F1 | RUN | -15,0 % | 16,3 % | -0,87 | 1,29 | -55,6 % | 17,0 % | – | 20,6 % | – | undefined | UNKNOWN:5,MERGER:4,SERIES_END:1 |
| ST-TOP5-F0 | RUN | -9,5 % | 16,3 % | -0,17 | 1,29 | -59,2 % | 30,9 % | – | 42,8 % | – | undefined | MERGER:28,UNKNOWN:15,SERIES_END:1 |
| ST-TOP5-F1 | RUN | -13,9 % | 16,3 % | -0,39 | 1,29 | -58,2 % | 28,3 % | – | 40,9 % | – | undefined | UNKNOWN:14,MERGER:16,SERIES_END:1 |
| Q-quality-compounder-N10-W13-F0 | RUN | 14,0 % | 14,6 % | 1,07 | 1,18 | -21,0 % | 13,0 % | 140,7 % | 4,6 % | 10,00 | 0 | MERGER:7,UNKNOWN:1 |
| Q-quality-compounder-N10-W13-F1 | RUN | 11,2 % | 14,6 % | 0,99 | 1,18 | -15,0 % | 11,4 % | 250,4 % | 7,3 % | 10,00 | 0 | MERGER:7,UNKNOWN:1 |
| Q-quality-compounder-N10-W26-F0 | RUN | 13,1 % | 14,6 % | 1,03 | 1,18 | -17,2 % | 12,7 % | 92,3 % | 2,7 % | 10,00 | 0 | MERGER:7,UNKNOWN:1 |
| Q-quality-compounder-N10-W26-F1 | RUN | 9,4 % | 14,6 % | 0,86 | 1,18 | -17,1 % | 11,2 % | 213,1 % | 5,5 % | 10,00 | 0 | MERGER:7,UNKNOWN:1 |
| Q-quality-compounder-N15-W13-F0 | RUN | 13,7 % | 14,6 % | 1,02 | 1,18 | -20,4 % | 13,5 % | 147,2 % | 5,1 % | 15,00 | 0 | MERGER:8,UNKNOWN:1 |
| Q-quality-compounder-N15-W13-F1 | RUN | 10,1 % | 14,6 % | 0,87 | 1,18 | -14,6 % | 11,8 % | 268,3 % | 7,9 % | 15,00 | 0 | MERGER:8,UNKNOWN:1 |
| Q-quality-compounder-N15-W26-F0 | RUN | 14,4 % | 14,6 % | 1,07 | 1,18 | -15,6 % | 13,5 % | 96,4 % | 3,1 % | 15,00 | 0 | MERGER:7,UNKNOWN:1 |
| Q-quality-compounder-N15-W26-F1 | RUN | 10,3 % | 14,6 % | 0,89 | 1,18 | -13,8 % | 11,8 % | 225,8 % | 6,3 % | 15,00 | 0 | MERGER:7,UNKNOWN:1 |
| Q-quality-compounder-N20-W13-F0 | RUN | 13,7 % | 14,6 % | 1,05 | 1,18 | -19,3 % | 13,0 % | 133,2 % | 4,5 % | 20,00 | 0 | MERGER:10,UNKNOWN:1 |
| Q-quality-compounder-N20-W13-F1 | RUN | 10,0 % | 14,6 % | 0,90 | 1,18 | -12,9 % | 11,2 % | 256,5 % | 7,5 % | 20,00 | 0 | MERGER:10,UNKNOWN:1 |
| Q-quality-compounder-N20-W26-F0 | RUN | 13,6 % | 14,6 % | 1,05 | 1,18 | -16,6 % | 12,9 % | 93,8 % | 3,0 % | 20,00 | 0 | MERGER:8,UNKNOWN:1 |
| Q-quality-compounder-N20-W26-F1 | RUN | 9,6 % | 14,6 % | 0,88 | 1,18 | -11,7 % | 11,1 % | 223,3 % | 6,2 % | 20,00 | 0 | MERGER:8,UNKNOWN:1 |
| Q-momentum-leader-N10-W13-F0 | RUN | 13,3 % | 14,6 % | 1,05 | 1,18 | -14,5 % | 12,6 % | 215,7 % | 7,3 % | 10,00 | 0 | MERGER:12,UNKNOWN:1 |
| Q-momentum-leader-N10-W13-F1 | RUN | 10,8 % | 14,6 % | 0,97 | 1,18 | -13,8 % | 11,2 % | 311,9 % | 9,7 % | 10,00 | 0 | MERGER:12 |
| Q-momentum-leader-N10-W26-F0 | RUN | 11,5 % | 14,6 % | 0,91 | 1,18 | -22,4 % | 12,8 % | 138,1 % | 4,2 % | 10,00 | 0 | MERGER:10,UNKNOWN:1 |
| Q-momentum-leader-N10-W26-F1 | RUN | 9,6 % | 14,6 % | 0,88 | 1,18 | -13,6 % | 11,1 % | 239,5 % | 6,5 % | 10,00 | 0 | MERGER:10 |
| Q-momentum-leader-N15-W13-F0 | RUN | 14,0 % | 14,6 % | 1,01 | 1,18 | -16,9 % | 13,8 % | 235,5 % | 9,1 % | 15,00 | 0 | MERGER:16,UNKNOWN:2 |
| Q-momentum-leader-N15-W13-F1 | RUN | 11,4 % | 14,6 % | 0,95 | 1,18 | -18,3 % | 12,2 % | 343,5 % | 12,0 % | 15,00 | 0 | MERGER:16,UNKNOWN:1 |
| Q-momentum-leader-N15-W26-F0 | RUN | 11,6 % | 14,6 % | 0,87 | 1,18 | -21,0 % | 13,7 % | 154,0 % | 4,9 % | 15,00 | 0 | MERGER:13,UNKNOWN:1 |
| Q-momentum-leader-N15-W26-F1 | RUN | 9,0 % | 14,6 % | 0,78 | 1,18 | -17,0 % | 12,0 % | 271,3 % | 7,5 % | 15,00 | 0 | MERGER:13 |
| Q-momentum-leader-N20-W13-F0 | RUN | 16,9 % | 14,6 % | 1,23 | 1,18 | -14,7 % | 13,4 % | 227,4 % | 10,3 % | 20,00 | 0 | MERGER:20,UNKNOWN:2 |
| Q-momentum-leader-N20-W13-F1 | RUN | 13,8 % | 14,6 % | 1,13 | 1,18 | -15,1 % | 12,0 % | 338,8 % | 13,8 % | 20,00 | 0 | MERGER:20,UNKNOWN:1 |
| Q-momentum-leader-N20-W26-F0 | RUN | 14,5 % | 14,6 % | 1,08 | 1,18 | -19,4 % | 13,4 % | 146,4 % | 5,5 % | 20,00 | 0 | MERGER:18,UNKNOWN:1 |
| Q-momentum-leader-N20-W26-F1 | RUN | 11,5 % | 14,6 % | 0,98 | 1,18 | -14,1 % | 11,8 % | 266,6 % | 8,8 % | 20,00 | 0 | MERGER:18 |
| Q-quality-momentum-N10-W13-F0 | RUN | 14,1 % | 14,6 % | 0,81 | 1,18 | -33,5 % | 18,2 % | 197,7 % | 7,5 % | 10,00 | 0 | MERGER:10,UNKNOWN:2 |
| Q-quality-momentum-N10-W13-F1 | RUN | 12,3 % | 14,6 % | 0,81 | 1,18 | -19,8 % | 15,8 % | 294,2 % | 10,2 % | 10,00 | 0 | MERGER:10,UNKNOWN:2 |
| Q-quality-momentum-N10-W26-F0 | RUN | 12,2 % | 14,6 % | 0,73 | 1,18 | -37,5 % | 18,0 % | 129,2 % | 4,4 % | 10,00 | 0 | MERGER:7 |
| Q-quality-momentum-N10-W26-F1 | RUN | 10,5 % | 14,6 % | 0,72 | 1,18 | -25,0 % | 15,5 % | 237,4 % | 7,4 % | 10,00 | 0 | MERGER:7 |
| Q-quality-momentum-N15-W13-F0 | RUN | 12,3 % | 14,6 % | 0,68 | 1,18 | -35,1 % | 19,8 % | 206,1 % | 7,5 % | 15,00 | 0 | MERGER:12,UNKNOWN:4 |
| Q-quality-momentum-N15-W13-F1 | RUN | 8,9 % | 14,6 % | 0,59 | 1,18 | -24,1 % | 17,0 % | 321,6 % | 10,0 % | 15,00 | 0 | MERGER:12,UNKNOWN:4 |
| Q-quality-momentum-N15-W26-F0 | RUN | 13,6 % | 14,6 % | 0,74 | 1,18 | -38,3 % | 19,9 % | 137,2 % | 5,2 % | 15,00 | 0 | MERGER:8,UNKNOWN:1 |
| Q-quality-momentum-N15-W26-F1 | RUN | 10,6 % | 14,6 % | 0,68 | 1,18 | -25,8 % | 17,0 % | 266,1 % | 8,7 % | 15,00 | 0 | MERGER:8,UNKNOWN:1 |
| Q-quality-momentum-N20-W13-F0 | RUN | 11,4 % | 14,6 % | 0,66 | 1,18 | -33,0 % | 19,3 % | 200,9 % | 7,8 % | 20,00 | 0 | MERGER:17,UNKNOWN:4 |
| Q-quality-momentum-N20-W13-F1 | RUN | 9,0 % | 14,6 % | 0,60 | 1,18 | -25,8 % | 16,8 % | 317,7 % | 10,7 % | 20,00 | 0 | MERGER:17,UNKNOWN:4 |
| Q-quality-momentum-N20-W26-F0 | RUN | 13,1 % | 14,6 % | 0,74 | 1,18 | -30,9 % | 19,2 % | 129,5 % | 5,3 % | 20,00 | 0 | MERGER:14,UNKNOWN:1 |
| Q-quality-momentum-N20-W26-F1 | RUN | 10,5 % | 14,6 % | 0,69 | 1,18 | -21,8 % | 16,3 % | 257,0 % | 9,2 % | 20,00 | 0 | MERGER:14,UNKNOWN:1 |
| Q-garp-N10-W13-F0 | RUN | 5,2 % | 14,6 % | 0,39 | 1,18 | -34,7 % | 16,2 % | 132,7 % | 4,3 % | 10,00 | 0 | MERGER:9 |
| Q-garp-N10-W13-F1 | RUN | 2,5 % | 14,6 % | 0,24 | 1,18 | -36,1 % | 14,5 % | 214,2 % | 5,8 % | 10,00 | 0 | MERGER:9 |
| Q-garp-N10-W26-F0 | RUN | 6,1 % | 14,6 % | 0,45 | 1,18 | -31,6 % | 15,9 % | 92,3 % | 2,9 % | 10,00 | 0 | MERGER:7 |
| Q-garp-N10-W26-F1 | RUN | 3,1 % | 14,6 % | 0,28 | 1,18 | -30,3 % | 14,4 % | 183,7 % | 4,8 % | 10,00 | 0 | MERGER:7 |
| Q-garp-N15-W13-F0 | RUN | 4,7 % | 14,6 % | 0,34 | 1,18 | -38,9 % | 18,7 % | 147,0 % | 4,9 % | 15,00 | 0 | MERGER:15,UNKNOWN:2 |
| Q-garp-N15-W13-F1 | RUN | 0,5 % | 14,6 % | 0,11 | 1,18 | -40,8 % | 16,1 % | 254,6 % | 6,6 % | 15,00 | 0 | MERGER:15,UNKNOWN:2 |
| Q-garp-N15-W26-F0 | RUN | 6,4 % | 14,6 % | 0,43 | 1,18 | -34,6 % | 18,6 % | 108,1 % | 3,5 % | 15,00 | 0 | MERGER:14,UNKNOWN:2 |
| Q-garp-N15-W26-F1 | RUN | 1,7 % | 14,6 % | 0,18 | 1,18 | -34,1 % | 16,2 % | 226,1 % | 5,6 % | 15,00 | 0 | MERGER:14,UNKNOWN:2 |
| Q-garp-N20-W13-F0 | RUN | 5,0 % | 14,6 % | 0,34 | 1,18 | -37,1 % | 19,7 % | 153,6 % | 5,7 % | 20,00 | 0 | MERGER:18,UNKNOWN:2 |
| Q-garp-N20-W13-F1 | RUN | 0,8 % | 14,6 % | 0,13 | 1,18 | -39,4 % | 17,3 % | 274,6 % | 7,7 % | 20,00 | 0 | MERGER:18,UNKNOWN:2 |
| Q-garp-N20-W26-F0 | RUN | 5,2 % | 14,6 % | 0,36 | 1,18 | -32,8 % | 19,3 % | 112,2 % | 3,9 % | 20,00 | 0 | MERGER:17,UNKNOWN:2 |
| Q-garp-N20-W26-F1 | RUN | 0,4 % | 14,6 % | 0,11 | 1,18 | -35,6 % | 17,0 % | 241,8 % | 6,2 % | 20,00 | 0 | MERGER:17,UNKNOWN:2 |
| Q-future-leader-N10-W13-F0 | RUN | 10,6 % | 14,6 % | 0,60 | 1,18 | -47,4 % | 20,3 % | 188,6 % | 8,0 % | 10,00 | 0 | MERGER:6,DISTRESS:1 |
| Q-future-leader-N10-W13-F1 | RUN | 11,1 % | 14,6 % | 0,69 | 1,18 | -32,6 % | 17,3 % | 284,6 % | 11,4 % | 10,00 | 0 | MERGER:6,DISTRESS:1 |
| Q-future-leader-N10-W26-F0 | RUN | 14,2 % | 14,6 % | 0,77 | 1,18 | -32,4 % | 19,9 % | 120,5 % | 4,8 % | 10,00 | 0 | MERGER:2,DISTRESS:1 |
| Q-future-leader-N10-W26-F1 | RUN | 11,0 % | 14,6 % | 0,69 | 1,18 | -30,0 % | 17,2 % | 223,2 % | 8,1 % | 10,00 | 0 | MERGER:2,DISTRESS:1 |
| Q-future-leader-N15-W13-F0 | RUN | 13,3 % | 14,6 % | 0,68 | 1,18 | -44,0 % | 21,7 % | 204,4 % | 9,6 % | 15,00 | 0 | MERGER:9,DISTRESS:1,UNKNOWN:1 |
| Q-future-leader-N15-W13-F1 | RUN | 12,6 % | 14,6 % | 0,73 | 1,18 | -33,5 % | 18,5 % | 319,5 % | 14,0 % | 15,00 | 0 | MERGER:9,DISTRESS:1,UNKNOWN:1 |
| Q-future-leader-N15-W26-F0 | RUN | 17,0 % | 14,6 % | 0,86 | 1,18 | -33,6 % | 20,7 % | 130,5 % | 5,8 % | 15,00 | 0 | MERGER:3,DISTRESS:1 |
| Q-future-leader-N15-W26-F1 | RUN | 14,2 % | 14,6 % | 0,82 | 1,18 | -27,6 % | 18,1 % | 249,0 % | 10,3 % | 15,00 | 0 | MERGER:3,DISTRESS:1 |
| Q-future-leader-N20-W13-F0 | RUN | 13,7 % | 14,6 % | 0,73 | 1,18 | -39,8 % | 20,5 % | 196,7 % | 8,9 % | 20,00 | 0 | MERGER:16,UNKNOWN:3,DISTRESS:1 |
| Q-future-leader-N20-W13-F1 | RUN | 11,9 % | 14,6 % | 0,73 | 1,18 | -32,2 % | 17,5 % | 314,6 % | 12,8 % | 20,00 | 0 | MERGER:16,UNKNOWN:3,DISTRESS:1 |
| Q-future-leader-N20-W26-F0 | RUN | 15,1 % | 14,6 % | 0,80 | 1,18 | -33,7 % | 20,1 % | 125,7 % | 5,2 % | 20,00 | 0 | MERGER:7,UNKNOWN:3,DISTRESS:1 |
| Q-future-leader-N20-W26-F1 | RUN | 11,9 % | 14,6 % | 0,73 | 1,18 | -26,7 % | 17,4 % | 247,8 % | 9,3 % | 20,00 | 0 | MERGER:7,UNKNOWN:3,DISTRESS:1 |
| Q-defensive-quality-N10-W13-F0 | RUN | 10,8 % | 14,6 % | 0,87 | 1,18 | -18,7 % | 12,7 % | 199,3 % | 5,8 % | 10,00 | 0 | MERGER:8,UNKNOWN:1 |
| Q-defensive-quality-N10-W13-F1 | RUN | 8,0 % | 14,6 % | 0,73 | 1,18 | -14,1 % | 11,3 % | 299,4 % | 7,5 % | 10,00 | 0 | MERGER:8,UNKNOWN:1 |
| Q-defensive-quality-N10-W26-F0 | RUN | 12,7 % | 14,6 % | 1,03 | 1,18 | -15,6 % | 12,3 % | 116,9 % | 3,7 % | 10,00 | 0 | MERGER:6 |
| Q-defensive-quality-N10-W26-F1 | RUN | 10,1 % | 14,6 % | 0,93 | 1,18 | -11,6 % | 11,0 % | 224,1 % | 6,5 % | 10,00 | 0 | MERGER:5 |
| Q-defensive-quality-N15-W13-F0 | RUN | 15,4 % | 14,6 % | 1,16 | 1,18 | -19,0 % | 13,1 % | 205,1 % | 7,2 % | 15,00 | 0 | MERGER:8,UNKNOWN:2 |
| Q-defensive-quality-N15-W13-F1 | RUN | 11,6 % | 14,6 % | 1,00 | 1,18 | -14,9 % | 11,6 % | 319,9 % | 9,6 % | 15,00 | 0 | MERGER:8,UNKNOWN:2 |
| Q-defensive-quality-N15-W26-F0 | RUN | 16,4 % | 14,6 % | 1,23 | 1,18 | -20,5 % | 13,0 % | 130,5 % | 4,9 % | 15,00 | 0 | MERGER:6,UNKNOWN:1 |
| Q-defensive-quality-N15-W26-F1 | RUN | 13,0 % | 14,6 % | 1,12 | 1,18 | -14,2 % | 11,5 % | 250,6 % | 8,4 % | 15,00 | 0 | MERGER:6,UNKNOWN:1 |
| Q-defensive-quality-N20-W13-F0 | RUN | 15,3 % | 14,6 % | 1,21 | 1,18 | -17,5 % | 12,4 % | 186,6 % | 6,9 % | 20,00 | 0 | MERGER:9,UNKNOWN:2 |
| Q-defensive-quality-N20-W13-F1 | RUN | 11,7 % | 14,6 % | 1,06 | 1,18 | -12,6 % | 11,0 % | 306,8 % | 9,8 % | 20,00 | 0 | MERGER:9,UNKNOWN:2 |
| Q-defensive-quality-N20-W26-F0 | RUN | 15,5 % | 14,6 % | 1,21 | 1,18 | -17,7 % | 12,5 % | 124,7 % | 4,4 % | 20,00 | 0 | MERGER:7,UNKNOWN:2 |
| Q-defensive-quality-N20-W26-F1 | RUN | 11,5 % | 14,6 % | 1,05 | 1,18 | -12,6 % | 10,9 % | 248,6 % | 7,6 % | 20,00 | 0 | MERGER:7,UNKNOWN:2 |
| Q-value-momentum-N10-W13-F0 | RUN | 4,4 % | 14,6 % | 0,40 | 1,18 | -31,1 % | 12,5 % | 182,5 % | 6,0 % | 10,00 | 0 | MERGER:15,UNKNOWN:2 |
| Q-value-momentum-N10-W13-F1 | RUN | 2,5 % | 14,6 % | 0,27 | 1,18 | -29,5 % | 11,4 % | 248,5 % | 7,4 % | 10,00 | 0 | MERGER:15,UNKNOWN:2 |
| Q-value-momentum-N10-W26-F0 | RUN | 7,2 % | 14,6 % | 0,61 | 1,18 | -26,3 % | 12,7 % | 102,2 % | 3,5 % | 10,00 | 0 | MERGER:10,UNKNOWN:1 |
| Q-value-momentum-N10-W26-F1 | RUN | 5,3 % | 14,6 % | 0,50 | 1,18 | -21,7 % | 11,5 % | 182,4 % | 5,9 % | 10,00 | 0 | MERGER:10,UNKNOWN:1 |
| Q-value-momentum-N15-W13-F0 | RUN | 5,1 % | 14,6 % | 0,41 | 1,18 | -30,8 % | 14,9 % | 217,7 % | 7,5 % | 15,00 | 0 | MERGER:21,UNKNOWN:2 |
| Q-value-momentum-N15-W13-F1 | RUN | 2,2 % | 14,6 % | 0,23 | 1,18 | -33,5 % | 13,3 % | 307,2 % | 9,2 % | 15,00 | 0 | MERGER:21,UNKNOWN:2 |
| Q-value-momentum-N15-W26-F0 | RUN | 8,5 % | 14,6 % | 0,63 | 1,18 | -29,6 % | 14,8 % | 129,9 % | 5,0 % | 15,00 | 0 | MERGER:13,UNKNOWN:2 |
| Q-value-momentum-N15-W26-F1 | RUN | 4,8 % | 14,6 % | 0,41 | 1,18 | -25,0 % | 13,3 % | 231,5 % | 7,6 % | 15,00 | 0 | MERGER:13,UNKNOWN:2 |
| Q-value-momentum-N20-W13-F0 | RUN | 6,2 % | 14,6 % | 0,46 | 1,18 | -33,0 % | 15,6 % | 240,0 % | 9,1 % | 20,00 | 0 | MERGER:24,UNKNOWN:3 |
| Q-value-momentum-N20-W13-F1 | RUN | 2,6 % | 14,6 % | 0,26 | 1,18 | -34,0 % | 13,8 % | 345,6 % | 11,2 % | 20,00 | 0 | MERGER:24,UNKNOWN:3 |
| Q-value-momentum-N20-W26-F0 | RUN | 9,5 % | 14,6 % | 0,66 | 1,18 | -30,9 % | 15,7 % | 146,9 % | 6,2 % | 20,00 | 0 | MERGER:13,UNKNOWN:3 |
| Q-value-momentum-N20-W26-F1 | RUN | 5,1 % | 14,6 % | 0,43 | 1,18 | -30,0 % | 13,9 % | 263,0 % | 9,3 % | 20,00 | 0 | MERGER:13,UNKNOWN:3 |

## Prüfung 2020-01-01 bis 2026-10-02 (alle 96 Varianten, Cash-Start)

| Variante | CAGR | SPY | RSP | IWM | Sharpe | SPY Sharpe | Max. Verlust | SPY Max. Verlust | p Log roh / Holm | p Sharpe roh / Holm | Urteil |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ST-C01-F0 (beschreibend, bis 2026-09-25) | -52,0 % | 15,5 % | 11,3 % | 9,6 % | -1,33 | 0,85 | -99,3 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-C01-F1 (beschreibend, bis 2026-09-25) | -42,4 % | 15,5 % | 11,3 % | 9,6 % | -1,28 | 0,85 | -97,6 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-C02-F0 (beschreibend, bis 2026-09-25) | -42,6 % | 15,5 % | 11,3 % | 9,6 % | -1,14 | 0,85 | -97,6 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-C02-F1 (beschreibend, bis 2026-09-25) | -31,3 % | 15,5 % | 11,3 % | 9,6 % | -0,78 | 0,85 | -92,0 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-C03-F0 (beschreibend, bis 2026-09-25) | -42,7 % | 15,5 % | 11,3 % | 9,6 % | -3,22 | 0,85 | -97,6 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-C03-F1 (beschreibend, bis 2026-09-25) | -39,0 % | 15,5 % | 11,3 % | 9,6 % | -2,88 | 0,85 | -96,4 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-C08-F0 (beschreibend, bis 2026-09-25) | -48,0 % | 15,5 % | 11,3 % | 9,6 % | -1,71 | 0,85 | -98,8 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-C08-F1 (beschreibend, bis 2026-09-25) | -41,3 % | 15,5 % | 11,3 % | 9,6 % | -1,66 | 0,85 | -97,4 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-C12-F0 (beschreibend, bis 2026-09-25) | -24,4 % | 15,5 % | 11,3 % | 9,6 % | -0,75 | 0,85 | -89,1 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-C12-F1 (beschreibend, bis 2026-09-25) | -11,9 % | 15,5 % | 11,3 % | 9,6 % | -0,37 | 0,85 | -74,9 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-TOP5-F0 (beschreibend, bis 2026-09-25) | -37,2 % | 15,5 % | 11,3 % | 9,6 % | -1,82 | 0,85 | -95,6 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| ST-TOP5-F1 (beschreibend, bis 2026-09-25) | -27,1 % | 15,5 % | 11,3 % | 9,6 % | -1,37 | 0,85 | -88,1 % | -31,8 % | – / 1,0000 | – / 1,0000 | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N10-W13-F0 | 4,7 % | 15,4 % | 11,2 % | 9,6 % | 0,35 | 0,85 | -30,4 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N10-W13-F1 | 0,9 % | 15,4 % | 11,2 % | 9,6 % | 0,14 | 0,85 | -20,5 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N10-W26-F0 | 9,1 % | 15,4 % | 11,2 % | 9,6 % | 0,59 | 0,85 | -30,4 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N10-W26-F1 | 2,5 % | 15,4 % | 11,2 % | 9,6 % | 0,27 | 0,85 | -25,5 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N15-W13-F0 | 6,5 % | 15,4 % | 11,2 % | 9,6 % | 0,43 | 0,85 | -33,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N15-W13-F1 | 2,1 % | 15,4 % | 11,2 % | 9,6 % | 0,23 | 0,85 | -22,5 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N15-W26-F0 | 8,3 % | 15,4 % | 11,2 % | 9,6 % | 0,52 | 0,85 | -33,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N15-W26-F1 | 1,9 % | 15,4 % | 11,2 % | 9,6 % | 0,21 | 0,85 | -25,8 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N20-W13-F0 | 7,3 % | 15,4 % | 11,2 % | 9,6 % | 0,48 | 0,85 | -35,0 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N20-W13-F1 | 3,5 % | 15,4 % | 11,2 % | 9,6 % | 0,33 | 0,85 | -28,2 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N20-W26-F0 | 7,0 % | 15,4 % | 11,2 % | 9,6 % | 0,45 | 0,85 | -35,0 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-compounder-N20-W26-F1 | 1,2 % | 15,4 % | 11,2 % | 9,6 % | 0,15 | 0,85 | -31,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N10-W13-F0 | 7,3 % | 15,4 % | 11,2 % | 9,6 % | 0,46 | 0,85 | -32,2 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N10-W13-F1 | 4,1 % | 15,4 % | 11,2 % | 9,6 % | 0,34 | 0,85 | -23,8 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N10-W26-F0 | 5,2 % | 15,4 % | 11,2 % | 9,6 % | 0,35 | 0,85 | -32,2 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N10-W26-F1 | 2,3 % | 15,4 % | 11,2 % | 9,6 % | 0,22 | 0,85 | -24,1 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N15-W13-F0 | 7,6 % | 15,4 % | 11,2 % | 9,6 % | 0,45 | 0,85 | -38,0 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N15-W13-F1 | 6,2 % | 15,4 % | 11,2 % | 9,6 % | 0,45 | 0,85 | -23,9 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N15-W26-F0 | 3,1 % | 15,4 % | 11,2 % | 9,6 % | 0,25 | 0,85 | -38,0 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N15-W26-F1 | 1,4 % | 15,4 % | 11,2 % | 9,6 % | 0,16 | 0,85 | -30,7 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| **Q-momentum-leader-N20-W13-F0** (Auswahl) | 9,3 % | 15,4 % | 11,2 % | 9,6 % | 0,52 | 0,85 | -36,7 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N20-W13-F1 | 7,1 % | 15,4 % | 11,2 % | 9,6 % | 0,51 | 0,85 | -25,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N20-W26-F0 | 6,8 % | 15,4 % | 11,2 % | 9,6 % | 0,40 | 0,85 | -36,7 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-momentum-leader-N20-W26-F1 | 4,2 % | 15,4 % | 11,2 % | 9,6 % | 0,33 | 0,85 | -28,8 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N10-W13-F0 | 3,2 % | 15,4 % | 11,2 % | 9,6 % | 0,25 | 0,85 | -44,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N10-W13-F1 | -3,8 % | 15,4 % | 11,2 % | 9,6 % | -0,13 | 0,85 | -45,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N10-W26-F0 | -0,1 % | 15,4 % | 11,2 % | 9,6 % | 0,10 | 0,85 | -45,5 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N10-W26-F1 | -5,7 % | 15,4 % | 11,2 % | 9,6 % | -0,26 | 0,85 | -51,1 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N15-W13-F0 | 8,7 % | 15,4 % | 11,2 % | 9,6 % | 0,45 | 0,85 | -34,8 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N15-W13-F1 | -1,3 % | 15,4 % | 11,2 % | 9,6 % | 0,03 | 0,85 | -41,5 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N15-W26-F0 | 4,4 % | 15,4 % | 11,2 % | 9,6 % | 0,30 | 0,85 | -41,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N15-W26-F1 | -3,6 % | 15,4 % | 11,2 % | 9,6 % | -0,10 | 0,85 | -51,4 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N20-W13-F0 | 9,3 % | 15,4 % | 11,2 % | 9,6 % | 0,47 | 0,85 | -33,4 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N20-W13-F1 | 0,2 % | 15,4 % | 11,2 % | 9,6 % | 0,11 | 0,85 | -38,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N20-W26-F0 | 3,8 % | 15,4 % | 11,2 % | 9,6 % | 0,27 | 0,85 | -35,7 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-quality-momentum-N20-W26-F1 | -4,0 % | 15,4 % | 11,2 % | 9,6 % | -0,12 | 0,85 | -46,9 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N10-W13-F0 | 3,3 % | 15,4 % | 11,2 % | 9,6 % | 0,26 | 0,85 | -43,2 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N10-W13-F1 | -0,6 % | 15,4 % | 11,2 % | 9,6 % | 0,03 | 0,85 | -42,7 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N10-W26-F0 | 6,8 % | 15,4 % | 11,2 % | 9,6 % | 0,43 | 0,85 | -39,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N10-W26-F1 | 1,3 % | 15,4 % | 11,2 % | 9,6 % | 0,16 | 0,85 | -42,9 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N15-W13-F0 | 9,1 % | 15,4 % | 11,2 % | 9,6 % | 0,47 | 0,85 | -41,9 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N15-W13-F1 | 2,2 % | 15,4 % | 11,2 % | 9,6 % | 0,21 | 0,85 | -44,7 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N15-W26-F0 | 13,0 % | 15,4 % | 11,2 % | 9,6 % | 0,64 | 0,85 | -36,0 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N15-W26-F1 | 5,1 % | 15,4 % | 11,2 % | 9,6 % | 0,38 | 0,85 | -35,7 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N20-W13-F0 | 6,3 % | 15,4 % | 11,2 % | 9,6 % | 0,36 | 0,85 | -43,9 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N20-W13-F1 | 1,0 % | 15,4 % | 11,2 % | 9,6 % | 0,15 | 0,85 | -50,0 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N20-W26-F0 | 10,2 % | 15,4 % | 11,2 % | 9,6 % | 0,52 | 0,85 | -39,8 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-garp-N20-W26-F1 | 3,6 % | 15,4 % | 11,2 % | 9,6 % | 0,28 | 0,85 | -42,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N10-W13-F0 | 3,4 % | 15,4 % | 11,2 % | 9,6 % | 0,26 | 0,85 | -60,8 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N10-W13-F1 | -4,1 % | 15,4 % | 11,2 % | 9,6 % | -0,07 | 0,85 | -61,9 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N10-W26-F0 | 0,8 % | 15,4 % | 11,2 % | 9,6 % | 0,17 | 0,85 | -61,7 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N10-W26-F1 | -6,0 % | 15,4 % | 11,2 % | 9,6 % | -0,18 | 0,85 | -66,5 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N15-W13-F0 | 4,8 % | 15,4 % | 11,2 % | 9,6 % | 0,31 | 0,85 | -60,2 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N15-W13-F1 | -2,0 % | 15,4 % | 11,2 % | 9,6 % | 0,03 | 0,85 | -59,4 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N15-W26-F0 | 2,4 % | 15,4 % | 11,2 % | 9,6 % | 0,23 | 0,85 | -61,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N15-W26-F1 | -3,8 % | 15,4 % | 11,2 % | 9,6 % | -0,05 | 0,85 | -64,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N20-W13-F0 | 5,5 % | 15,4 % | 11,2 % | 9,6 % | 0,33 | 0,85 | -61,0 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N20-W13-F1 | -0,1 % | 15,4 % | 11,2 % | 9,6 % | 0,12 | 0,85 | -58,2 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N20-W26-F0 | 3,5 % | 15,4 % | 11,2 % | 9,6 % | 0,27 | 0,85 | -61,0 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-future-leader-N20-W26-F1 | -0,7 % | 15,4 % | 11,2 % | 9,6 % | 0,09 | 0,85 | -59,4 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N10-W13-F0 | 7,0 % | 15,4 % | 11,2 % | 9,6 % | 0,47 | 0,85 | -29,2 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N10-W13-F1 | 3,0 % | 15,4 % | 11,2 % | 9,6 % | 0,29 | 0,85 | -24,1 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N10-W26-F0 | 6,9 % | 15,4 % | 11,2 % | 9,6 % | 0,47 | 0,85 | -29,2 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N10-W26-F1 | 3,6 % | 15,4 % | 11,2 % | 9,6 % | 0,34 | 0,85 | -24,1 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N15-W13-F0 | 6,2 % | 15,4 % | 11,2 % | 9,6 % | 0,43 | 0,85 | -29,6 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N15-W13-F1 | 2,9 % | 15,4 % | 11,2 % | 9,6 % | 0,29 | 0,85 | -24,1 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N15-W26-F0 | 8,2 % | 15,4 % | 11,2 % | 9,6 % | 0,52 | 0,85 | -30,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N15-W26-F1 | 4,0 % | 15,4 % | 11,2 % | 9,6 % | 0,37 | 0,85 | -26,2 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N20-W13-F0 | 8,2 % | 15,4 % | 11,2 % | 9,6 % | 0,53 | 0,85 | -31,4 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N20-W13-F1 | 4,4 % | 15,4 % | 11,2 % | 9,6 % | 0,40 | 0,85 | -23,6 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N20-W26-F0 | 7,4 % | 15,4 % | 11,2 % | 9,6 % | 0,47 | 0,85 | -31,4 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-defensive-quality-N20-W26-F1 | 3,0 % | 15,4 % | 11,2 % | 9,6 % | 0,30 | 0,85 | -27,6 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N10-W13-F0 | 11,7 % | 15,4 % | 11,2 % | 9,6 % | 0,59 | 0,85 | -36,1 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N10-W13-F1 | 6,0 % | 15,4 % | 11,2 % | 9,6 % | 0,48 | 0,85 | -24,4 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N10-W26-F0 | 13,1 % | 15,4 % | 11,2 % | 9,6 % | 0,67 | 0,85 | -36,0 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N10-W26-F1 | 8,5 % | 15,4 % | 11,2 % | 9,6 % | 0,65 | 0,85 | -25,9 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N15-W13-F0 | 13,6 % | 15,4 % | 11,2 % | 9,6 % | 0,63 | 0,85 | -41,3 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N15-W13-F1 | 8,5 % | 15,4 % | 11,2 % | 9,6 % | 0,57 | 0,85 | -25,9 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N15-W26-F0 | 15,2 % | 15,4 % | 11,2 % | 9,6 % | 0,69 | 0,85 | -41,2 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N15-W26-F1 | 10,8 % | 15,4 % | 11,2 % | 9,6 % | 0,71 | 0,85 | -25,1 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N20-W13-F0 | 17,1 % | 15,4 % | 11,2 % | 9,6 % | 0,74 | 0,85 | -42,6 % | -31,8 % | 0,4190 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N20-W13-F1 | 11,6 % | 15,4 % | 11,2 % | 9,6 % | 0,71 | 0,85 | -24,7 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N20-W26-F0 | 16,6 % | 15,4 % | 11,2 % | 9,6 % | 0,71 | 0,85 | -42,5 % | -31,8 % | 0,4421 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |
| Q-value-momentum-N20-W26-F1 | 11,9 % | 15,4 % | 11,2 % | 9,6 % | 0,73 | 0,85 | -26,1 % | -31,8 % | 1,0000 / 1,0000 | 1,0000 / 1,0000 | schlägt nicht |

## Nachtrag nach Einsicht (05.11.2026): Supertrader mit Prüfende 2026-09-30

**Außerhalb der vorregistrierten Familie.** Entschieden nach Einsicht in die blockierten Supertrader-Prüfwerte. Begründung: Der eingefrorene Snapshot von Strang B endet am 2026-09-30; eine Verlängerung würde den gepinnten Papierhandel gefährden. SPY, RSP und IWM sind auf dieselben Wochenstichtage gekürzt. Die p-Werte sind unkorrigiert, sie gehen nicht in die Holm-Familie der Studie ein, und es gibt kein Urteil „schlägt“. Die vorregistrierten Urteile oben bleiben „nicht bestimmbar (blockiert)“.

| Variante | Zeitraum | CAGR | SPY | RSP | IWM | Sharpe | SPY Sharpe | Max. Verlust | p Log (roh) | p Sharpe (roh) |
|---|---|---|---|---|---|---|---|---|---|---|
| ST-C01-F0 | 2020-01-03 bis 2026-09-25 | -52,0 % | 15,5 % | 11,3 % | 9,6 % | -1,33 | 0,85 | -99,3 % | 1,0000 | 1,0000 |
| ST-C01-F1 | 2020-01-03 bis 2026-09-25 | -42,4 % | 15,5 % | 11,3 % | 9,6 % | -1,28 | 0,85 | -97,6 % | 1,0000 | 1,0000 |
| ST-C02-F0 | 2020-01-03 bis 2026-09-25 | -42,6 % | 15,5 % | 11,3 % | 9,6 % | -1,14 | 0,85 | -97,6 % | 1,0000 | 1,0000 |
| ST-C02-F1 | 2020-01-03 bis 2026-09-25 | -31,3 % | 15,5 % | 11,3 % | 9,6 % | -0,78 | 0,85 | -92,0 % | 1,0000 | 1,0000 |
| ST-C03-F0 | 2020-01-03 bis 2026-09-25 | -42,7 % | 15,5 % | 11,3 % | 9,6 % | -3,22 | 0,85 | -97,6 % | 1,0000 | 1,0000 |
| ST-C03-F1 | 2020-01-03 bis 2026-09-25 | -39,0 % | 15,5 % | 11,3 % | 9,6 % | -2,88 | 0,85 | -96,4 % | 1,0000 | 1,0000 |
| ST-C08-F0 | 2020-01-03 bis 2026-09-25 | -48,0 % | 15,5 % | 11,3 % | 9,6 % | -1,71 | 0,85 | -98,8 % | 1,0000 | 1,0000 |
| ST-C08-F1 | 2020-01-03 bis 2026-09-25 | -41,3 % | 15,5 % | 11,3 % | 9,6 % | -1,66 | 0,85 | -97,4 % | 1,0000 | 1,0000 |
| ST-C12-F0 | 2020-01-03 bis 2026-09-25 | -24,4 % | 15,5 % | 11,3 % | 9,6 % | -0,75 | 0,85 | -89,1 % | 1,0000 | 1,0000 |
| ST-C12-F1 | 2020-01-03 bis 2026-09-25 | -11,9 % | 15,5 % | 11,3 % | 9,6 % | -0,37 | 0,85 | -74,9 % | 1,0000 | 1,0000 |
| ST-TOP5-F0 | 2020-01-03 bis 2026-09-25 | -37,2 % | 15,5 % | 11,3 % | 9,6 % | -1,82 | 0,85 | -95,6 % | 1,0000 | 1,0000 |
| ST-TOP5-F1 | 2020-01-03 bis 2026-09-25 | -27,1 % | 15,5 % | 11,3 % | 9,6 % | -1,37 | 0,85 | -88,1 % | 1,0000 | 1,0000 |

Prüfhinweis: Schon die kostenfreien Kurven von Strang B zeigen im Prüfteil maximale Verluste von −80 % bis −98 % (Turtle S1 −98,3 %, Turtle S2 −96,8 %, KK Breakout −89,7 %, Buyable Gap Up −79,4 %; Darvas −29,7 %). Das liegt vor dem Overlay und ist für Long-only-Regeln auffällig; Strang B prüft. Bis dahin sind diese Werte nicht belastbar.

C03 Darvas: auf Tagesbalken nicht bestimmbar (Annahme dominiert). Spannweite nach Strang B (Diagnoselauf 42015841514, Entwicklung 2016–2026, Referenzkosten): Referenz −31,7 % p. a., vorregistrierte Gegenvariante ALT-INTRABAR-OPTIMISTIC −10,6 % p. a. (7.526 Trades, Trefferquote 7,3 %), in beiden Lesarten negativ.

## Grenzen

- Das Prüffenster 2020–2026 wurde in früheren Projektstudien verwendet: vorab fixierte Replikation mit zeitlicher Trennung, kein unberührter Holdout. Bestätigung nur mit neuen Vorwärtsdaten.
- Supertrader-Prüfung: Der eingefrorene Snapshot von Strang B endet am 2026-09-30; für den Stichtag 2026-10-02 fehlt der Wochenwert. Nach Protokoll wird das Fenster nicht verkürzt: alle zwölf Supertrader-Varianten sind im Prüfteil „nicht bestimmbar (blockiert)“ (Tests mit p = 1 in der Holm-Familie); ihre Kennzahlen bis 2026-09-25 stehen nur beschreibend in der Tabelle.
- Tiefe kostenfreie Drawdowns der Supertrader-Varianten (−80 bis −98 %) von Strang B geprüft (Diagnoselauf 42015841514): kein Hebel (Exposure ≤ 1,0, Cash ≥ 0), keine Split- oder Datenfehler (schlechteste Einzeltrades sind echte Zusammenbrüche von Kleinstwerten), sondern gleichmäßiger Abfluss über alle Jahre (z. B. Turtle S1: Trefferquote 19,5 %, Profit-Faktor 0,68). Eine Liquiditätsgrenze wäre eine neue Variante und gehört nicht in E3.
- Supertrader-Kurven: kostenfreie Läufe von Strang B mit unveränderten REF-Regeln; Protokollkosten, Endwerte und SMA200-Filter als anteiliges Positions-Overlay (scripts/research/edge/st-e3.cjs), keine Neurechnung der Strategie. Der Snapshot kennt keine Insolvenz-Delistings (distress überall false).
- Nachrechnung Supertrader nach Verlängerung des Snapshots bis 2026-10-02 vorgesehen (ohne Protokolländerung). Ändern sich dabei die Entwicklungsergebnisse (z. B. nach Prüfung des Umschlags von C03/C08), wird das hier mit altem und neuem Hash ausgewiesen; die festgeschriebene Auswahl bleibt bestehen.
- Supertrader-Entwicklung beginnt 2016 (Lieferung Strang B); 2012–2015 fehlt für Supertrader. Der für eine spätere Bestätigung reservierte Holdout 2008–2015 wird in E3 nicht verwendet; die Quant-Entwicklung 2012–2019 ist protokollgemäß und war bereits Teil früherer Quant-Läufe (Musterportfolios #1332/#1383).
- Lokaler Rauchtest vor dem Lauf (05.11.2026): zwei Quant-Varianten auf einer Teilmenge (Kursrendite, 1.500 heutige Titel) auch im Prüffenster ausgeführt, um Programmfehler auszuschließen. Keine Regel-, Parameter- oder Auswahländerung folgte; die Auswahl erfolgt mechanisch nach Protokoll.
- Population: heutige Kursdateien plus qualifizierte V13-Ketten, heutiger SIC-Code; keine historische Indexmitgliedschaft.
- Marktfilter: bewertet am letzten Tagesschluss jeder Entscheidungswoche, ausgeführt zum Schluss der Folgewoche (Engine-Takt); ein Wechsel und Rückwechsel innerhalb derselben Woche löst keinen Handel aus.
- Monte-Carlo-p-Werte (9.999 Replikate) haben eine Auflösung von 1/10.000; Stichprobe der Prüfung rund 350 Wochen.
- „schlägt nicht“ heißt bei gültigen Daten: kein robuster Nachweis, nicht bewiesene Gleichheit. Fehlende Daten: „nicht bestimmbar (blockiert)“.
