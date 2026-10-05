# Prüfpaket — Extraktions-Audit — blind, ohne VU-Ausgaben

**PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.** Geprüft wird ausschließlich, ob die extrahierte Zeile die Praktikerquelle richtig wiedergibt — nicht, ob der Praktiker recht hatte. Keine VU-Ausgaben.

Paket `409400e8fec5ec30` · Datensatz PRACTITIONER_REFERENCE_V1 (SHA-256 `7af25c9b5d61…`) · 20 Fälle · Auswahl aufsteigend SHA-256("20261005|human-audit|" + caseId)

Urteile: `CORRECT` = Extrahierter Wert entspricht der Quelle; `INCORRECT` = Wert widerspricht der Quelle — correctedValue PFLICHT (Wert laut Quelle oder UNKNOWN); `PARTIALLY_CORRECT` = teilweise richtig (z. B. Preis stimmt, Richtung nicht) — correctedValue optional; `UNKNOWN` = aus der Quelle nicht entscheidbar / Quelle nicht erreichbar.

Prüfer-Code (pseudonym): ____________  Datum: ____-__-__

## Schichtung der Auswahl

| Merkmal | geöffnet (35) | ausgewählt (20) |
|---|---|---|
| sourceFamily = ewf | 18 | 13 |
| sourceFamily = tv-cryptoknee | 7 | 3 |
| sourceFamily = tv-thefifthwave | 5 | 2 |
| sourceFamily = tv-yuchaosng | 5 | 2 |
| timeframe = 1D | 15 | 8 |
| timeframe = 1W | 20 | 12 |
| family = CORRECTIVE | 8 | 4 |
| family = MOTIVE | 27 | 16 |
| confidence = HIGH | 9 | 9 |
| confidence = MEDIUM | 26 | 11 |
| btc = BTC | 11 | 4 |
| btc = NON_BTC | 24 | 16 |
| split = DEVELOPMENT | 26 | 14 |
| split = VALIDATION | 9 | 6 |

## 1. ewf|CAT|2023-01-08|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/caterpillar-cat-bounce-made-new-time-highs-whats-next/
* Veröffentlicht: 2023-01-08T19:53:46+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_ewf_20230108_cat` · Aufteilung DEVELOPMENT · Auswahlgrund HIGH · Sicherheit **HIGH** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): (II) ended 160.59 (WXY, w-x-y) in blue box 169.66-127.98; ((1)) up from there still developing to ~258 (drawn), then ((2)) 3/7-swing pullback (~204 drawn), then higher.

Fundstellen:
* `primary.currentWave` [image 2 / paragraph after charts] A: ((1)) label at projected peak above last bar; text says once ((1)) completes expect pullback
* `primary.waveStartPrice` [image 2 / text] A: (II) low 160.59 on 09.26.2022
* `invalidation` [image 2] A: green line 160.59 labelled Invalidation level
* `keySupportZones` [image 2] A: blue box 1 (169.66) to 1.618 (127.98)
* `primary.nextMoveAfterCurrent` [text final paragraph / image 2 path] A: pullback ((2)) in 3 or 7 swings, then continuation higher
* `timeframe` [image 2 header] A: CAT, W (Dynamic)
* `primary.currentWave` [image 2, projected path labels ((1)) then ((2))] B: ((1)) top projected near 258 above last price, then ((2)) dip near 205
* `primary.waveStartPrice` [paragraph after images; image 2 green line 160.59] B: (II) low 160.59 on 09.26.2022, line labelled Invalidation level
* `nextMoveAfterCurrent` [final paragraph] B: pullback expected after ((1)) completes, buyers expected thereafter

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Target ((1)) ~258 and ((2)) ~204 only from drawn path, no numbers stated
* A/B: Degree of new cycle after (II) not labelled ((III) not shown); degreeRank left null
* A/B: Text says blue box $170-128, chart box 169.66-127.98
* A/B: Text gives low as 160.59 and bounce from 160.60; chart line says 160.59.
* A/B: Degree of the impulse containing ((1)) (presumably (III)) not labelled on chart.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"CAT","vuSymbol":"CAT","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2023-01-08T19:53:46+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"((1))","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `((1))` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":258,"label":"approx. drawn projection end of ((1)), not stated in text (read from path)","low":258}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":160.59}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 2. tv-thefifthwave|BTCUSD|2024-08-31|1

* Quelle: TradingView-Autor Thefifthwave (`tv-thefifthwave`, WEBSITE) — https://www.tradingview.com/chart/BTCUSDT/cSMSsEmp-BTC-USDT/
* Veröffentlicht: 2024-08-31T06:53:27+00:00 (MINUTE, TradingView-API created_at (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_tv-thefifthwave_20240831_btcusd` · Aufteilung DEVELOPMENT · Auswahlgrund HIGH · Sicherheit **HIGH** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Big 1-2 in early 2023; wave 3 subdivides (1)-(5); (3) top Mar 2024; (4) = triangle ended at (E) Aug 2024; (5) of 3 now starting, projected path up beyond prior high by Oct.

Fundstellen:
* `primary.currentWave` [description sentence 1-2] A: author: start of sub-waves of 5 of 3; 4 of 3 done as triangle
* `primary.pattern` [image 1 labels] A: 1,2 then (1)(2)(3)(4) with (3) marked at Mar 2024 top and (4) under triangle ending at (E)
* `directionalBias` [image 1 grey projection path; description last sentence] A: path projected up off the chart top; market expected to pump
* `keySupportZones` [image 1 horizontal line] A: 0.236 fib at 53,994.71
* `primary.waveStartDate` [image 1 (E) label] A: (E)/(4) low early Aug 2024 by x-axis; price only approx (~49-50k on log axis), not recorded
* `primary.currentWave` [description sentence 1-2] B: Author says micro-waves of 5 of 3 are beginning and wave 4 of 3 finished as a triangle.
* `primary.pattern` [snapshot image] B: Labels 1,2 then (1)-(2) ... (3) at Mar-2024 high, (A)-(E) triangle labelled (4) below.
* `primary.waveStartPrice` [chart drawing JSON (ElliottTriangle last point)] B: E anchor 2024-08-04/05 ~49617; matches (E) label on image.

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Exact (E) low price not labelled; date read approximately from x-axis (early Aug 2024).
* A/B: nextMoveAfterCurrent DOWN inferred from labelling ((5) of 3 implies a later wave 4), not stated by author.
* A/B: Triangle trendlines diverge (looks expanding), author just calls it a triangle.
* A/B: Snapshot header shows publisher name BERYLLIUM_ while page user is Thefifthwave (likely username change).
* A/B: Projected bars pattern extends off-chart (anchor ~144k) but no explicit target stated; not recorded as target.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"BTC/USDT","vuSymbol":"BTCUSD","instrumentType":"CRYPTO_SPOT","mappingQuality":"PROXY_SAME_UNDERLYING"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1D` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2024-08-31T06:53:27+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"(5)","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `(5)` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `null` | NOT_STATED | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 3. tv-yuchaosng|QQQ|2024-01-21|1

* Quelle: TradingView-Autor yuchaosng (`tv-yuchaosng`, WEBSITE) — https://www.tradingview.com/chart/NDQ/guICzdg7-Nasdaq-Long-Target-18000-then-Short-Last-Wave-Up/
* Veröffentlicht: 2024-01-21T17:30:22+00:00 (MINUTE, TradingView-API created_at (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_tv-yuchaosng_20240121_qqq` · Aufteilung VALIDATION · Auswahlgrund HIGH · Sicherheit **HIGH** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Impulse 0-1-2-3-4 done; wave 5 up from 14058 (26 Oct 2023) heading to ~18000 (confluence 1.618 of 0-3 retrace tool and 2.618 ext); then a short/decline after 5 completes.

Fundstellen:
* `primary.currentWave` [snapshot image; video ~03:58 frame] A: Labels 1,2,3,4 on pivots, label 5 placed at projected endpoint near 18000 on trendline
* `primary.waveStartPrice` [video ~01:28 frame] A: Cursor on wave 4 pivot shows 26 Oct 2023 bar low 14058.33, also Fib 0 level
* `targetZones` [title + description + snapshot image] A: Title/description name 18000 target; lines 1.618 (18006.81) and 2.618 (17996.30)
* `primary.nextMoveAfterCurrent` [title] A: Title: long to 18000 then short, last wave up
* `timeframe` [snapshot image header] A: US 100 INDEX, 1D, TVC
* `primary.currentWave` [snapshot image, label 5 at top right with projection line] B: Labels 1,2,3,4 placed; 5 drawn as projection ending near 18000
* `targetZones` [snapshot image fib labels; title; description] B: 1.618 (18006.81) and 2.618 (17996.30) coincide; title/description give target 18000
* `primary.nextMoveAfterCurrent` [title] B: Title says long to 18000 then short, last wave up

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Video audio not transcribed (no ASR tool available); subwave labels inside wave 5 not visible on frames, only an inner Fib extension from ~16249.
* A/B: Degree of the count not indicated.
* A/B: Wave 0 start (Oct 2022 low ~10440) read from chart only, approximate.
* A/B: Video audio not transcribed (no speech tool); only frames and short description used
* A/B: Exact wave-4 low date not labelled; visually late Oct 2023

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"US 100","vuSymbol":"QQQ","instrumentType":"INDEX_CASH","mappingQuality":"PROXY_DIFFERENT_INSTRUMENT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1D` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2024-01-21T17:30:22+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"5","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `5` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":18006.81,"label":"wave 5 target ~18000 (2.618 ext 17996.30 / 1.618 18006.81)","low":17996.3},{"high":18663.64,"label":"3.618 extension drawn (higher ext., not named as target)","low":18663.64}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `null` | NOT_STATED | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 4. ewf|ABNB|2023-09-05|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/airbnb-nesting-acceleration/
* Veröffentlicht: 2023-09-05T21:14:44+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_ewf_20230905_abnb` · Aufteilung DEVELOPMENT · Auswahlgrund HIGH · Sicherheit **HIGH** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Flat (II) ended 81.91 Dec 2022; (III) underway with nests ((1))-((2)), (1)-(2); (2) done ~Aug 2023, acceleration in (3) of ((3)) expected toward 166/205/229, later (4),(5),((4)),((5)) = I

Fundstellen:
* `primary.currentWave` [paragraph 3 + image 1] A: text says acceleration within blue (3) of ((3)) soon; chart shows (2) completed, projected path up
* `targetZones` [paragraph 3 + image 1 fib lines] A: 166.11, 204.93, 228.92 lines; (III) 300-435 in text
* `invalidation` [image 1, green line] A: Invalidation Level at 81.91 drawn
* `chartLastPrice` [image 1 right axis] A: 143.15 tag
* `primary.nextMoveAfterCurrent` [image 1 projected path] A: after (3) a (4) pullback drawn
* `primary.currentWave` [paragraph 'From the December 2022 lows' / image 1] B: author says acceleration soon within blue (3) of black ((3)); chart shows (2) completed in Aug 2023 and projected path upward
* `invalidation` [image 1, green line right side] B: line at 81.91 labelled Invalidation Level
* `targetZones` [paragraph 3 / image 1 fib lines] B: ((3)) targets 166.11, 204.93, 228.92; (III) 300-435

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* levelScale 0.92693 = VU-Schluss 132.69 (2023-09-01) / Chart-Schluss 143.15 (A und B); VU-Reihe heute splitbereinigt, Chart zum Veroeffentlichungszeitpunkt nicht (README: kumulierter Splitfaktor)
* A/B: Exact low/date of blue (2) not stated; chart suggests roughly 124 in Aug 2023
* A/B: Whether (3) has begun or (2) still finishing not explicit; text says acceleration should occur soon, chart path shows small zigzag before surge
* A/B: Text calls long-term target 'blue wave ((III))' while chart labels (III)/I; typo
* A/B: Projected path on chart first shows a small up-down wiggle before the strong rally, so (3) may still be in early sub-waves; start of (3) at end of (2) (Aug 2023 low, approx. 124 read from chart) not stated numerically, left null
* A/B: Text writes target for blue wave ((III)) while chart/elsewhere it is (III) - typo

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"ABNB","vuSymbol":"ABNB","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2023-09-05T21:14:44+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"(3)","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `(3)` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":166.11,"label":"((3)) target 1.0 ext","low":166.11},{"high":204.93,"label":"((3)) target 1.618 ext","low":204.93},{"high":228.92,"label":"((3)) target 2.0 ext","low":228.92},{"high":435,"label":"long-run target blue (III)","low":300}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":81.91}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 5. ewf|RCL|2023-06-21|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/royal-caribbean-cruises-rcl-growth/
* Veröffentlicht: 2023-06-21T09:18:26+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_ewf_20230621_rcl` · Aufteilung VALIDATION · Auswahlgrund HIGH · Sicherheit **HIGH** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Weekly: ((II)) low 2020, (I)/(II) done (II end Jul 2022); now ((3)) of I of (III) rising; then ((4)),((5)) to end I near 111-129, then daily II pullback, then III higher

Fundstellen:
* `primary.currentWave` [image 1, right side] A: Price bars end just after ((2)) with projected path ((3)),((4)),((5)) forming red I, then II, then up
* `invalidation` [image 1, green line] A: Green horizontal line labelled Invalidation Level at 19.05 (2020 low)
* `targetZones` [paragraph 3] A: Upside potential 111-129 after higher high above 2021 peak
* `alternatives` [paragraph 4] A: Above 2018 peak, acceleration toward 160, III possibly underway in nest
* `timeframe` [image 1, header] A: Chart header shows W (weekly)
* `primary.currentWave` [image 1, right side] B: ((1)) and ((2)) labelled on bars; ((3)),((4)),((5)) drawn as projection path after last bar at 96.60, so ((3)) running
* `primary` [paragraph 4 + image 1] B: text names the current advance as wave I of (III); chart red I at ((5)) ~118
* `targetZones` [paragraph 3] B: upside range 111-129 after higher high vs 2021 peak

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Text calls the move wave I of (III); chart shows price inside ((3)) of I. Current sub-wave taken from chart.
* A/B: waveStartPrice/date of ((3)) not stated; chart ((2)) low roughly near 59-60 in spring 2023 (approximate read, left null)
* A/B: Degree notation nonstandard (((III)) grand supercycle per author), degreeRank left null
* A/B: Running label could be read as red I (text level) or ((3)) (chart level); chose smallest running label ((3)) per chart projection.
* A/B: Start of ((3)) = ((2)) low ~spring 2023 near 59-60 on chart; not stated, left null.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"RCL","vuSymbol":"RCL","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2023-06-21T09:18:26+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"((3))","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `((3))` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":129,"label":"Upside area for wave I after break above 2021 peak (text)","low":111},{"high":160,"label":"Alternative nest scenario target if 2018 ATH is exceeded (text)","low":160}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":19.05}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[{"currentWave":"III (nest, I and II already done)","directionalBias":"UP","note":"If price breaks above the 2018 ATH, wave III may already be running in a nest; acceleration toward ~160 without a larger II pullback. ATH level not given numerically.","pattern":"IMPULSE","trigger":null}]` |  | ☐C ☐I ☐P ☐U | | |

## 6. ewf|LLY|2024-02-20|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/lly-continue-bullish-rally/
* Veröffentlicht: 2024-02-20T06:40:31+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_ewf_20240220_lly` · Aufteilung DEVELOPMENT · Auswahlgrund HIGH · Sicherheit **HIGH** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Extended impulse: ((2)) ended 309.20, (1) of ((3)) 629.97, (2) 547.61; now red 3 of (3) up, then 4, 5 completing (3) near 869.47+, followed by (4).

Fundstellen:
* `primary.currentWave` [paragraph 2 (intro) and image 2] A: Author favors upside in 3 of (3); chart projects red 3, 4, 5 ending (3)
* `targetZones` [paragraph 'Latest Weekly View' / image 2] A: (3) of ((3)) expected toward 869.47 or higher; 1.0 extension line drawn at 869.47
* `invalidation` [image 2] A: Green 'Right Side' tag with line labelled Invalidation Level at 309.20 (((2)) low)
* `primary.nextMoveAfterCurrent` [image 2 / last paragraph of analysis] A: After 3 comes 4 pullback; after (3) a correction in (4)
* `timeframe` [image 1 and 2 headers] A: Both labelled LLY, W (Dynamic)
* `chartLastPrice` [image 2 right axis] A: 782.06 tag
* `primary.currentWave` [paragraph 2] B: Author favors upside in 3 of (3) within extended ((3)).
* `targetZones` [paragraph 4 / image 2] B: (3) of ((3)) expected toward 869.47 or higher; 1.0 extension line drawn at 869.47.
* `invalidation` [image 2] B: Green line labelled Invalidation Level at 309.20 with Right Side up tag.

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Start date/price of red wave 3 not stated in text; red 2 on chart roughly late Dec 2023 but price not readable precisely, left null.
* A/B: degreeRank 1 inferred from nesting 3 of (3) of ((3)) of III; EWF colour notation is practitioner-specific.
* A/B: Invalidation basis (close vs intraday) not specified.
* A/B: Start of red wave 3 (red 2 low, approx. late Dec 2023 / mid 500s on chart) not stated numerically; left null.
* A/B: degreeRank 1 inferred from EWF hierarchy III > ((3)) > (3) > 3; colour-coded practitioner notation.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"LLY","vuSymbol":"LLY","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2024-02-20T06:40:31+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"3 (red) of (3) of ((3)) of III","degreeRank":1}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `3` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":869.47,"label":"(3) of ((3)) target, 100% extension, 'or higher'","low":869.47}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":309.2}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 7. ewf|ZM|2022-08-16|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/zoom-zm-entering-bigger-extreme-area/
* Veröffentlicht: 2022-08-16T20:54:31+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_ewf_20220816_zm` · Aufteilung VALIDATION · Auswahlgrund HIGH · Sicherheit **HIGH** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Wave (II) zigzag from the (I) top: a 273.20, b 406.48, c in progress; ((4)) bounce done, ((5)) of c expected into blue box 89.11-14.25, then multi-year rally.

Fundstellen:
* `primary.currentWave` [image 1 / paragraph 2] A: a, b labelled; c shown as projected path below ((4)) into blue box; text says c leg lower
* `primary.waveStartPrice` [paragraph 2] A: b ended at 406.48 high
* `keySupportZones` [image 1] A: blue box labels 1 (89.11) and 1.236 (14.25)
* `invalidation` [image 1] A: green line at 14.00 labelled Invalidation Level below the box
* `alternatives` [image 2 / paragraph 3] A: Alternate View chart, 79.03 invalidation line, TurningUp tag
* `chartLastPrice` [image 1 right axis] A: 109.19
* `primary.pattern` [paragraph 2 / image 1] B: Text names the decline a zigzag with legs a, b, c; chart shows a-b-c ending as (II).
* `primary.currentWave` [image 1] B: Labels ((1))-((4)) printed inside c; projected path drops to ((5)) c (II) in blue box.
* `primary.waveStartPrice` [paragraph 2] B: b ended at 406.48 high, from which c started.

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Text dates the peak 19 Oct 2021 but chart places (I) top around Oct 2020; b appears around mid 2021.
* A/B: Start date of c (b high) not stated; left null.
* A/B: currentWave could also be given as ((5)) of c; c chosen as running label of the zigzag.
* A/B: Text dates the peak to 19 Oct 2021, but the chart places the (I) top in Oct 2020; date of b high (~mid-2021 on chart) not stated, so waveStartDate left null.
* A/B: Primary not explicitly called preferred; taken as first shown since second is labelled alternate.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"ZM","vuSymbol":"ZM","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2022-08-16T20:54:31+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `ZIGZAG` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `CORRECTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"c","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `c` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `DOWN` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `UP` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":14}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[{"currentWave":"((1)) of new cycle (after (II) complete)","directionalBias":"UP","note":"Alternate weekly chart: c/(II) already ended at 79.03 low with minimum swings; while above 79.03 rally can resume, ((1)) up then ((2)) dip projected.","pattern":"ZIGZAG","trigger":79.03}]` |  | ☐C ☐I ☐P ☐U | | |

## 8. ewf|NEE|2024-10-08|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/nextera-nee-continue-bullish-trend-correcting-lower/
* Veröffentlicht: 2024-10-08T08:43:01+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_ewf_20241008_nee` · Aufteilung DEVELOPMENT · Auswahlgrund HIGH · Sicherheit **HIGH** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): ((II)) ended 47.15 Oct-2023 (w-x-y, x triangle). Now ((5)) of I up from 68.97 (Jun-2024), small upside left with divergence; then II pullback in 3/7/11 swings, then III higher.

Fundstellen:
* `primary.currentWave` [paragraph 4 / image 1] A: Text: upside in ((5)) from June-2024 low to finish I; chart shows ((5)) and I projected above last bars
* `primary.waveStartPrice` [paragraph 4] A: ((4)) low stated at 68.97
* `primary.nextMoveAfterCurrent` [paragraph 4 / image 1] A: II correction in 3/7/11 swings; chart dashed ((A))((B))((C)) to II
* `invalidation` [image 1] A: Green line labelled Invalidation Level at 47.15
* `timeframe` [image 1 header] A: Chart titled NEE, W (Dynamic)
* `chartLastPrice` [image 1 right axis] A: Price tag 80.29
* `primary.currentWave` [paragraph 2 and 4 / image 1] B: Text and chart label ((5)) of red I as current upward wave; projected path to I then ((A))-((B))-((C)) of II
* `primary.waveStartPrice` [paragraph 4] B: ((4)) low stated at 68.97, ((5)) started from June-2024 low
* `invalidation` [image 1, green line] B: Green line labelled Invalidation Level at 47.15

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Exact date of ((4)) low only given as June 2024; waveStartDate left null
* A/B: Chart last price 80.29 sits below the ((5)) high already printed (~86); chart path implies a small dip before a final ((5)) high, so near-term direction is mixed although bias stated as upside
* A/B: No explicit price target for ((5)) / I given; 93.73 is a confirmation level, not a target
* A/B: Text says 'in daily' but only a weekly chart is shown; monthly sequence also referenced in text
* A/B: Last price 80.29 is below the drawn ((5)) projection; whether ((5)) already peaked (~86 area) is not stated; author says small upside remains

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"NEE","vuSymbol":"NEE","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2024-10-08T08:43:01+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"((5))","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `((5))` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":93.73,"label":"((I)) high Dec-2021; break confirms bullish sequence (not a stated target for ((5)))","low":93.73}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":47.15}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[{"currentWave":"I of (I) (nesting)","directionalBias":"UP","note":"If rally extends and erases momentum divergence, author sees nesting higher within (I) instead of an imminent II pullback","pattern":"IMPULSE","trigger":null},{"currentWave":"((II))","directionalBias":"DOWN","note":"Break below 47.15 would mean ((II)) is a larger double correction still unfolding; until above 93.73 it may stay choppy","pattern":"DOUBLE_ZIGZAG","trigger":47.15}]` |  | ☐C ☐I ☐P ☐U | | |

## 9. ewf|FCX|2023-07-25|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/freeport-mcmoran-fcx-expect/
* Veröffentlicht: 2023-07-25T05:46:47+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_ewf_20230725_fcx` · Aufteilung VALIDATION · Auswahlgrund HIGH · Sicherheit **HIGH** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Weekly: I ended 51.99, II ended 24.80; ((1)) of III at 46.73, ((2)) flat-ish ABC ended 33.06; now red 1 of (1) of ((3)) up, then 2 down, then higher; III confirmed above 51.99

Fundstellen:
* `primary.currentWave` [paragraph 3 (last sentences) / image 1 red 1 label right side] A: Text names current wave as 1 of (1) of ((3)); chart projects 1-2-3-4-5 to blue (1)
* `directionalBias` [paragraph 2 and 3] A: Expects small further upside before wave 2 correction
* `primary.nextMoveAfterCurrent` [image 1 projected path; paragraph 3] A: Red 2 pullback drawn after red 1
* `invalidation` [image 1 green line labelled Invalidation Level at 24.80] A: Explicitly drawn at II low
* `keySupportZones` [paragraph 2/3] A: Dips expected to stay above ((2)) low 33.06 (intro says 33.05)
* `timeframe` [image 1 header] A: W (Dynamic)
* `primary.currentWave` [paragraph 2 and 'Latest View' last paragraph; image 1 red 1 label near 43] B: author favours rally in 1 of (1) of ((3))
* `primary.nextMoveAfterCurrent` [Latest View last paragraph; image 1 projected red 2] B: small upside then wave 2 correction
* `primary.waveStartPrice` [Latest View paragraph 2; image 1 ((2)) label] B: ((2)) ended 33.06 (paragraph 2 says 33.05)

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: ((2)) low given as 33.05 in intro and 33.06 later
* A/B: Two candidate invalidations: chart line at 24.80 vs text condition above 33.06 (break of 33.06 only implies double correction, not invalidation of III)
* A/B: Wave 1 start date not stated; chart suggests ((2)) low around early/mid 2023 but not readable precisely
* A/B: ((2)) low given as 33.05 in intro but 33.06 in main text
* A/B: Text support 33.06 vs chart invalidation line 24.80; used drawn 24.80 as invalidation

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"FCX","vuSymbol":"FCX","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2023-07-25T05:46:47+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"1","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `1` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":24.8}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[{"currentWave":"((2))","directionalBias":"DOWN","note":"Author mentions a double correction in ((2)) if price breaks below the ((2)) low at 33.06; no detailed count shown","pattern":"WXY","trigger":33.06}]` |  | ☐C ☐I ☐P ☐U | | |

## 10. tv-cryptoknee|BTCUSD|2023-01-18|1

* Quelle: TradingView-Autor CryptoKnee (`tv-cryptoknee`, WEBSITE) — https://www.tradingview.com/chart/BTCUSD/9sLctUDU-BTC-Elliott-Wave-Prettiness/
* Veröffentlicht: 2023-01-18T23:44:21+00:00 (MINUTE, TradingView-API created_at (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_tv-cryptoknee_20230118_btcusd` · Aufteilung DEVELOPMENT · Auswahlgrund MIN:sourceFamily=tv-cryptoknee · Sicherheit **MEDIUM** · Schiedsdurchgang: ja
* Szenario (eigene Kurzfassung der Extraktion): Impulse up from Nov low; 3 topped ~21650 just above the 21478 lower-high line; 4th wave pullback now (20054/19559/18981 zones), then 5 up toward ~22000 (small) or ~23500 (circled 5)

Fundstellen:
* `primary.currentWave` [image 1, top right of price action] A: circled 3 and cyan 3 at the latest high; cyan 4 and circled 4 projected below, arrows pointing down then up
* `directionalBias` [image 1 arrows + description lines 2-3] A: text speaks of a possible retrace; cyan and green arrows both point down first
* `primary.nextMoveAfterCurrent` [image 1 circled 5 / cyan 5; idea metadata direction=long] A: fifth wave projected above current high
* `keySupportZones` [image 1 right-side labels] A: four horizontal levels annotated with W4 degree / impulse-doubt remarks
* `alternatives[0]` [image 1 red circled A,B,C] A: red ABC labels on same pivots as green 1,2,3; yellow 'Lower High' line at 21478.37
* `primary.currentWave` [image 1, blue labels 1-2-3 and projected 4/5 path] B: Blue 3 at recent top, blue zigzag arrow down to 4 then up to 5
* `directionalBias` [description para 2; image 1 arrows] B: Author asks whether market is ready for a retrace; both drawn paths go down first
* `keySupportZones` [image 1, right-side text labels] B: Levels 20054.54, 19559.29, 18981.51, 18400.87 annotated with W4 degree notes

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* Schiedsdurchgang C: currentWave=4 (VISIBLE_LABEL)
* A/B: Degree of the running 4th wave is not fixed: cyan 4 (smaller, inside circled 3) vs circled 4 (larger); author makes it depend on depth
* A/B: Red ABC alternative is drawn but not discussed in text; relative weight vs bullish count only inferred from 'bull possibilities' and long flag
* A/B: No explicit invalidation; 18400.87 'sus on impulse' line acts as doubt level, not labelled invalidation
* A/B: 18,400.87 marked as 'sus on impulse' - soft warning, not explicitly called invalidation; left invalidation null
* A/B: Primary vs larger-degree W4 path not explicitly ranked; smaller-degree W4 called 'ideal' so taken as primary

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"BTCUSD","vuSymbol":"BTCUSD","instrumentType":"CRYPTO_SPOT","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1D` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2023-01-18T23:44:21+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"4","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `4` | DISAGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `DOWN` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `UP` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":22100,"label":"cyan 5 arrow tip (approx, read from axis)","low":21900},{"high":23600,"label":"circled 5 placement (approx, read from axis)","low":23400}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `null` | NOT_STATED | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[{"currentWave":"C (red, complete at high)","directionalBias":"DOWN","note":"Red A-B-C labels share the points of circled 1-2-3: rise would be a corrective ABC ending at a lower high below 21478; doubt on impulse flagged below ~18400","pattern":"ZIGZAG","trigger":18400.87},{"currentWave":"cyan 4 (smaller degree inside circled 3)","directionalBias":"DOWN","note":"Cyan path: shallow dip to ~20050 as smaller W4, then cyan 5 to about 22000 before circled 3 finishes","pattern":"IMPULSE","trigger":null}]` |  | ☐C ☐I ☐P ☐U | | |

Spätere Revisionen (nur Kontext, nicht prüfen):
* v2 2023-01-26T02:25:28+00:00 1D — https://www.tradingview.com/chart/BTCUSD/hmTLJFAF-BTC-Elliott-wave-correction-patterns/ — Muster IMPULSE, Welle ((4)), Richtung SIDEWAYS, Invalidierung {"basis":"UNKNOWN","direction":"above","price":33021.59}

## 11. tv-cryptoknee|BTCUSD|2024-04-28|1

* Quelle: TradingView-Autor CryptoKnee (`tv-cryptoknee`, WEBSITE) — https://www.tradingview.com/chart/BTCUSD/2NnZOZkD-Bitcoin-walkiing-the-Elliott-Wave-Path/
* Veröffentlicht: 2024-04-28T13:56:35+00:00 (MINUTE, TradingView-API created_at (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_tv-cryptoknee_20240428_btcusd` · Aufteilung DEVELOPMENT · Auswahlgrund MIN:sourceFamily=tv-cryptoknee · Sicherheit **MEDIUM** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Circled 1,2 done (2023); circled 3 subdividing (1)(2)(3) done, (4) near 0.382-0.5 zone ~56-60k; then (5) ~80k+, circled 4 back into 59.6-69k box, circled 5 above ~92k

Fundstellen:
* `primary.currentWave` [image 1, label (4) inside red box below 0.382 line, right of (3) top] A: (4) placed in retracement box 0.382-0.5 after (3) high
* `primary.nextMoveAfterCurrent` [image 1, yellow zigzag path] A: path rises from current area to ~82k, drops to green box (circled 4), then rises past 92k (circled 5)
* `directionalBias` [description lines 3-4, 8; image 1 yellow path] A: text says bouncing off levels and holding 60k key; path goes up from about current zone
* `keySupportZones` [description line 4; image 1 labels 59598.21 / 59648.33] A: 60k emphasized as key level
* `timeframe` [image 1 header top right] A: BTC/USD 1D
* `primary.currentWave` [image 1, center] B: (4) label placed in 0.382-0.5 retrace box under (3) high; yellow projection starts at latest bars
* `targetZones` [image 1, yellow path] B: zigzag path up to (5) ~82k, down into green box labelled circled 4 (59.6k-69k), then up to circled 5
* `keySupportZones` [description line 4] B: author says holding 60k is key

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Whether (4) is complete is not stated; the (4) label sits in a box partly below last price and the yellow path starts slightly below last price (~58-59k), so a small further dip is possible before the rise
* A/B: 'Holding 60k is key' is not explicitly an invalidation; no invalidation line drawn
* A/B: Zone and target prices are approximate reads from axis except the boxed labels (69000, 59598.21, 59648.33)
* A/B: Unclear whether (4) is seen as complete (path drawn upward from current bars, text says bounces off levels) or still running into the 0.382-0.5 box; state UNKNOWN, bias UP from drawn path
* A/B: Triangle reference in text not drawn on this chart

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"BTC/USD","vuSymbol":"BTCUSD","instrumentType":"CRYPTO_SPOT","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1D` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2024-04-28T13:56:35+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"(4)","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `(4)` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `UNKNOWN` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `UP` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":82500,"label":"(5) of circled 3: yellow path peak near 2.0 ext line (approx)","low":79700},{"high":69000,"label":"later circled 4 correction box","low":59598.21},{"high":92000,"label":"circled 5 beyond 2.618 ext line (~92k, approx), arrow off chart","low":92000}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `null` | NOT_STATED | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 12. tv-thefifthwave|SPY|2022-12-03|1

* Quelle: TradingView-Autor Thefifthwave (`tv-thefifthwave`, WEBSITE) — https://www.tradingview.com/chart/SPXUSD/6WgXCBAu-SPXUSD/
* Veröffentlicht: 2022-12-03T09:05:44+00:00 (MINUTE, TradingView-API created_at (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_tv-thefifthwave_20221203_spy` · Aufteilung DEVELOPMENT · Auswahlgrund MIN:sourceFamily=tv-thefifthwave · Sicherheit **MEDIUM** · Schiedsdurchgang: ja
* Szenario (eigene Kurzfassung der Extraktion): 2022 decline A-B-C complete at Oct low (C=circled 5). New impulse up: 1,2 done, wave 3 underway, small 4 dip, wave 5 to ~4626.6; breakout above descending trendline.

Fundstellen:
* `primary.currentWave` [description sentence 2] A: author says the third wave from wave 1 is being completed
* `primary.pattern` [image 1, right half] A: circled 1 and 2 after C low, projected path with circled 3,4,5 up to 4626.6
* `directionalBias` [description sentence 1 + image 1] A: falling wave seen as over; long position box drawn
* `targetZones` [image 1, green box top / axis label] A: 4626.6 at projected circled 5
* `keySupportZones` [image 1, red box / axis label] A: stop 3896.2 below entry 4062.6
* `primary.currentWave` [description sentence 2] B: author says the third wave out of wave 1 is now being completed
* `directionalBias` [description sentence 1; image 1] B: falling wave considered over; projected path up, idea direction flag long
* `primary.pattern` [image 1] B: ABC with circled 1-5 subwaves in 2022, then circled 1,2 after C low, projected 3,4,5

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* Schiedsdurchgang C: currentWave=circled 3 (EXPLICIT_TEXT); invalidation=UNKNOWN (UNDECIDABLE); instrument=FOREXCOM:SPXUSD (S&P 500 CFD, SPX500) (VISIBLE_LABEL)
* A/B: Stop 3896.2 of the long-position tool is not labelled as wave invalidation; left invalidation null
* A/B: Wave 2 low (start of wave 3) only readable approximately (~3700, early Nov 2022); left null
* A/B: Wave 4 label sits inside red stop area while projected path dips only modestly; exact wave 3/4 levels not stated
* A/B: Invalidation is the stop-loss of a drawn long position, not a level named as invalidation in text.
* A/B: Wave 3 start (wave 2 low) only approximate from axis (~3700, early Nov 2022); left null.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"SPX500","vuSymbol":"SPY","instrumentType":"CFD","mappingQuality":"PROXY_DIFFERENT_INSTRUMENT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1D` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2022-12-03T09:05:44+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"((3))","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `((3))` | DISAGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":4626.6,"label":"green target of position box at projected circled 5","low":4626.6}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `null` | DISAGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 13. tv-yuchaosng|BTCUSD|2024-03-22|1

* Quelle: TradingView-Autor yuchaosng (`tv-yuchaosng`, WEBSITE) — https://www.tradingview.com/chart/BTCUSD/Ina5NJJc-BTC-short-Peak-reached-in-5-waves-structure/
* Veröffentlicht: 2024-03-22T06:55:53+00:00 (MINUTE, TradingView-API created_at (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_tv-yuchaosng_20240322_btcusd` · Aufteilung DEVELOPMENT · Auswahlgrund MIN:sourceFamily=tv-yuchaosng · Sicherheit **MEDIUM** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Green 5-wave impulse since late 2022 complete at ~73.8k; wave (5) itself a purple 5-wave; top confirmed by confluence of 3.618 ext (74594) and 1.0 ext (73785); short, decline from peak expected.

Fundstellen:
* `directionalBias` [title + description] A: Title says short; text states the peak is already in based on 5 waves and two fib extensions.
* `primary.state` [image 1 (snapshot), top right] A: Purple (5) label at the ~73.8k top coinciding with fib 1 (73785) just under green 3.618 (74594).
* `primary.pattern` [image 1, whole chart] A: Green (1) Jul-2023 ~31.8k, (2) Sep-2023 ~25k, (3) early Jan-2024 ~49k, (4) late Jan-2024 ~38.5k; purple (1)-(5) inside last leg.
* `chartLastPrice` [image 1, price axis tag] A: Last price 66342 after pullback from peak.
* `primary.pattern` [image 1 (snapshot)] B: green (1)-(4) and purple (1)-(5) labels, (5) at peak near 73785
* `directionalBias` [description + page metadata] B: title says short, peak made; idea direction flag = short
* `structuralScenario` [description items 1-2] B: reasons: 5-wave structure and two Fib extension levels

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: No label for the running post-peak wave; currentWave left null, role inferred as corrective from 'peak reached'/short.
* A/B: Green and purple degrees both use (n) notation; green (5) not separately labelled, its end coincides with purple (5); degreeRank left null.
* A/B: Purple fib grid 0 (59406) to 1 (73785) with intermediate levels drawn but not named as targets; not entered as targets.
* A/B: Running correction after (5) is unlabeled; currentWave null, its pattern/extent unknown
* A/B: Green wave (5) not labeled separately; purple (1)-(5) appears to subdivide it, so degree of (5) unclear

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"BTCUSD","vuSymbol":"BTCUSD","instrumentType":"CRYPTO_SPOT","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1D` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2024-03-22T06:55:53+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"(5)","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `null` | NOT_STATED | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `UNKNOWN` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `DOWN` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `UNKNOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `null` | NOT_STATED | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 14. ewf|QQQ|2022-10-25|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/qqq-shows-bearish-sequence-from-2021-peak/
* Veröffentlicht: 2022-10-25T03:43:32+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: UNKNOWN)
* referenceId `pr_ewf_20221025_qqq` · Aufteilung DEVELOPMENT · Auswahlgrund MIN:family=CORRECTIVE · Sicherheit **MEDIUM** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Double three down from Nov-2021 high: ((W)) 269.28, ((X)) 334.42; ((Y)) in progress: (A) done (swing 5), (B) small W-X-Y bounce toward ~290-295, then (C) into 194-161

Fundstellen:
* `primary.currentWave` [paragraph 3 / image 1] A: Text says ((Y)) in progress after ((X)) at 334.42
* `targetZones` [paragraph 3 / image 1 blue box] A: 161-194 area; box labelled 1 (194.47) and 1.236 (161.56)
* `invalidation` [image 1] A: Red horizontal line labelled Invalidation level at 408.91
* `primary.pattern` [paragraph 3] A: Decline described as double three structure
* `chartLastPrice` [image 1] A: Last price marker 275.42
* `primary.currentWave` [paragraph 2 / image 1] B: text says ((Y)) in progress after ((X)) top at 334.42; chart shows (A) done, (B) bounce, then path to blue box
* `primary.pattern` [paragraph 2] B: decline called a double three with (W)(X)(Y) inside ((W))
* `targetZones` [image 1 blue box / paragraph 2] B: box 1.0 at 194.47 and 1.236 at 161.56

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Chart shows a near-term (B) bounce (W-X-Y, path to ~293) before (C) down; short-term move from now is up, while text frames ((Y)) as running lower. Bias recorded DOWN per text-level running wave ((Y)).
* A/B: waveStartDate of ((Y)) not stated; chart places ((X)) top around mid-August 2022
* A/B: Price adjustment of the eSignal chart not stated
* A/B: Near-term chart path shows (B) of ((Y)) rally (W-X-Y in red) to ~293 before further decline; immediate move is up, overall ((Y)) bias down. Chose ((Y)) as current wave per text.
* A/B: currentWaveRole: ((Y)) is the trend-direction leg of a corrective double three; classified CORRECTIVE because the leg is itself a 3-wave structure.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"QQQ","vuSymbol":"QQQ","instrumentType":"ETF","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1D` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2022-10-25T03:43:32+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `WXY` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `CORRECTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"((Y))","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `((Y))` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `DOWN` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `UP` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":194.47,"label":"Blue box, 100%-123.6% extension for ((Y)) / swing #7; buyers expected there","low":161.56}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"above","price":408.91}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 15. ewf|MCD|2023-09-23|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/mcdonalds-mcd-buying-opportunities/
* Veröffentlicht: 2023-09-23T23:43:50+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_ewf_20230923_mcd` · Aufteilung VALIDATION · Auswahlgrund MIN:family=CORRECTIVE · Sicherheit **MEDIUM** · Schiedsdurchgang: ja
* Szenario (eigene Kurzfassung der Extraktion): Leading diagonal wave I ended 299.35; wave II zigzag: ((A)) 275.00, ((B)) 285.60, ((C)) impulse lower into 260.99-245.82, then rally above 300.

Fundstellen:
* `primary.currentWave` [paragraph 4 / image 2] A: Text says ((C)) of II should continue lower; chart shows projected path to ((C)) II.
* `targetZones` [paragraph 4] A: Ending zone 260.99-245.82 stated for ((C)).
* `invalidation` [paragraph 4 / image 2] A: View valid above 217.68; green line labelled invalidation level 217.68.
* `alternatives` [paragraph 5 / image 3] A: Alternative (2) count, invalidation line 259.51.
* `chartLastPrice` [image 2] A: Last price tag 272.22.
* `primary.currentWave` [paragraph 4 / image 2] B: Text and chart: wave II correction in progress, ((C)) of II projected lower with path into red II label.
* `targetZones` [paragraph 4] B: Zone 260.99-245.82 for end of ((C)), then resumption above 300.
* `invalidation` [paragraph 4 / image 2] B: View valid above 217.68; green line labelled Invalidation level 217.68.

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* Schiedsdurchgang C: family=CORRECTIVE (VISIBLE_LABEL); currentWave=((C)) (EXPLICIT_TEXT)
* A/B: No blue box drawn on chart 2; target zone only stated in text.
* A/B: Degree rank of ((C)) unclear in EWF notation (sub-degree of red II), left null.
* A/B: Wave start date of ((C)) not given; ((B)) price 285.60 from text, date roughly Aug 2023 from chart only.
* A/B: currentWave could also be read as ((C)) of zigzag II (then pattern ZIGZAG); chose II per containing-structure rule.
* A/B: Containing structure after (II) is not labelled with a higher degree (e.g. (III)) on the chart; IMPULSE inferred from I/II labels.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"MCD","vuSymbol":"MCD","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2023-09-23T23:43:50+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `ZIGZAG` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `CORRECTIVE` | DISAGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"((C))","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `((C))` | DISAGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `DOWN` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `UP` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":260.99,"label":"((C)) of II target zone","low":245.82},{"high":300,"label":"after II: rally above 300","low":300}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":217.68}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[{"currentWave":"(2)","directionalBias":"DOWN","note":"Old nest count kept as alternative: wave (2) pullback after (1), valid above 259.51 then rally resumes; break below 259.51 favours primary wave II.","pattern":"IMPULSE","trigger":259.51}]` |  | ☐C ☐I ☐P ☐U | | |

## 16. ewf|AXP|2024-08-12|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/last-buying-opportunity-axp/
* Veröffentlicht: 2024-08-12T13:32:03+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: UNKNOWN)
* referenceId `pr_ewf_20240812_axp` · Aufteilung DEVELOPMENT · Auswahlgrund FILL · Sicherheit **MEDIUM** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Wave ((4)) ended near 222.03; ((5)) of III now rising toward 264.28-277.31, then larger wave IV pullback (((A))((B))((C))) before further upside.

Fundstellen:
* `primary.currentWave` [paragraph 2 (after image 2)] A: Author states market now trades in wave ((5)) higher after ((4)) retested the (4) low near 222.03.
* `targetZones` [image 2, top right / paragraph 2] A: 1.236 (264.28) and 1.618 (277.31) lines drawn; text names the same area for ((5)) of III.
* `primary.nextMoveAfterCurrent` [image 2 right side / paragraph 2] A: Dashed projected path shows IV as ((A))((B))((C)) after III peak; text says large correction in IV may begin.
* `invalidation` [image 2, green line] A: Green horizontal line labelled Invalidation Level 130.43 with Right Side up tag.
* `timeframe` [image 2 header] A: Chart header reads AXP, W (Dynamic); footer update date 08.12.2024.
* `primary.currentWave` [paragraph 3 / image 2] B: Text says market now in wave ((5)) higher; chart shows ((4)) labelled at last low with projected ((5)) up
* `targetZones` [image 2 top right / paragraph 3] B: Fib lines 1.236 (264.28) and 1.618 (277.31) bracket the ((5)) / III label
* `invalidation` [image 2 green line] B: Line labelled Invalidation Level 130.43 from wave II low, Right Side up tag

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Text puts wave II low at 130.65, chart invalidation line reads 130.43; close vs intraday basis not stated.
* A/B: Text adds a caveat ('if no more extensions'), so ((5)) could extend beyond the target area; no separate alternative count drawn.
* A/B: Exact date of ((4)) low not stated; on weekly chart it is the early-August 2024 bar, so waveStartDate left null.
* A/B: Text puts wave II low at 130.65, chart invalidation line at 130.43.
* A/B: Text wording on ((4)): retesting wave (4) low 'around 222.03' - read 222.03 as the ((4)) low; wave (4) itself given as 220.74.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"AXP","vuSymbol":"AXP","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2024-08-12T13:32:03+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"((5))","degreeRank":3}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `((5))` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":277.31,"label":"((5)) of III, 1.236-1.618 ext","low":264.28}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":130.43}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 17. ewf|PHM|2023-06-13|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/pultegroup-phm-real-estate/
* Veröffentlicht: 2023-06-13T10:29:08+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: UNKNOWN)
* referenceId `pr_ewf_20230613_phm` · Aufteilung DEVELOPMENT · Auswahlgrund FILL · Sicherheit **MEDIUM** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): Wave II ended Jun 2022 near 35; III of (III) rising, currently in ((3)); after ((3)) a ((4)) pullback then ((5)) toward 81.71+; dips in 3/7/11 swings to be bought

Fundstellen:
* `primary.currentWave` [image 1 (weekly chart)] A: Projected ((3)) label just above last bar near 77, then ((4)) near 66; price 72.90 below projected ((3)) top
* `invalidation` [image 1, green line] A: Green horizontal labelled Invalidation Level at 35.02 with Right Side up marker
* `targetZones` [image 1 fib lines; paragraph 2] A: 1 (81.71) and 1.618 (110.61) lines; text names equal legs 81-110
* `directionalBias` [paragraph 3] A: Author says stock in strongest wave (III), can extend; buy daily pullbacks
* `primary.currentWave` [image 1, right side] B: ((1)),((2)) labelled after II; price at 72.90 just below projected ((3)) marker ~77, path then ((4)),((5))=III
* `invalidation` [image 1, green horizontal line] B: line labelled Invalidation Level at 35.02 with 'Right Side' up marker
* `targetZones` [image 1 fib lines + paragraph 2] B: 1 (81.71) and 1.618 (110.61) lines; text cites equal legs $81-$110

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* A/B: Text speaks only of wave III/(III); the ((3)) running label is read from chart projection only
* A/B: Exact start of ((3)) (wave ((2)) low, approx. Oct 2022 near 36) not stated numerically
* A/B: Text says wave II low 35 on 6/17/2022 while chart green line is 35.02
* A/B: Text first speaks of wave III, then of wave (III) as the current wave; chart shows both (running III inside (III)).
* A/B: Text dates II low 6/17/2022 at $35, chart places ((2)) in Oct 2022 near the 35.02 line; exact start of ((3)) not stated, so waveStartDate/price left null.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"PHM","vuSymbol":"PHM","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2023-06-13T10:29:08+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"((3))","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `((3))` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":110.61,"label":"Equal legs 1.0-1.618 extension from 2020 cycle (text: 81-110)","low":81.71}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":35.02}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 18. ewf|COIN|2023-12-05|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/coinbase-coin-bullish-cycle/
* Veröffentlicht: 2023-12-05T11:03:02+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_ewf_20231205_coin` · Aufteilung DEVELOPMENT · Auswahlgrund FILL · Sicherheit **MEDIUM** · Schiedsdurchgang: nein
* Szenario (eigene Kurzfassung der Extraktion): (II) zigzag low 31.55; new cycle up: I extending with nest, ((3)) running, (3) of ((3)) in progress; later (4),(5),((4)),((5)) end I, II pullback above 31.55, then rally

Fundstellen:
* `primary.currentWave` [image 1, right edge] A: last bars below projected (3) label; path (3)-(4)-(5)=((3)), ((4)), ((5))=I, then II
* `invalidation` [image 1, horizontal line] A: line at 31.55 labelled Invalidation Level
* `alternatives` [paragraph 2-4] A: two options listed; first = extended wave I with nesting, second = rally ends as ((1))
* `directionalBias` [image 1 'Turning Up' tag; final paragraph] A: bullish, buy pullbacks, start of wave (III)
* `primary.currentWave` [image 1] B: blue (1),(2) labelled on bars; projected path (3),(4),(5) of ((3)), then ((4)),((5)) = I, then II; last bar 141.09 before (3) label
* `primaryNamed` [paragraph 3-4 (two options) + image 1] B: author lists two options without stating preference; chart draws the first (extended I / nesting ((3)))
* `invalidation` [image 1, horizontal line] B: line at 31.55 labelled Invalidation Level

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* levelScale 0.948047 = VU-Schluss 133.76 (2023-12-01) / Chart-Schluss 141.09 (A und B); VU-Reihe heute splitbereinigt, Chart zum Veroeffentlichungszeitpunkt nicht (README: kumulierter Splitfaktor)
* A/B: Text presents two options without naming a preferred one; chart draws only option 1, so primary = first shown/drawn.
* A/B: Text labels in option 2 (((1)),((2)),((3))) differ in degree from chart labels; option 2 not drawn.
* A/B: Start of wave (3) (end of blue (2), roughly autumn 2023 near ~70) not stated; left null.
* A/B: Author gives two scenarios without naming a preferred one; primary chosen as the one drawn on chart and listed first.
* A/B: Under alternative the next move is a ((2)) pullback (DOWN) soon, conflicting with near-term UP of primary.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"COIN","vuSymbol":"COIN","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2023-12-05T11:03:02+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"(3)","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `(3)` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `UP` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `DOWN` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"below","price":31.55}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[{"currentWave":"((1))","directionalBias":"DOWN","note":"Text option 2: 12-month rally already 5 waves = ((1)) near end; ((2)) pullback in 3/7/11 swings follows, then ((3)) up. Not drawn on chart.","pattern":"IMPULSE","trigger":null}]` |  | ☐C ☐I ☐P ☐U | | |

## 19. ewf|DIS|2023-01-02|1

* Quelle: ElliottWave-Forecast (`ewf`, BLOG) — https://elliottwave-forecast.com/stock-market/disney-dis-opportunity-long-term-buying/
* Veröffentlicht: 2023-01-02T16:03:05+00:00 (MINUTE, WordPress-REST-API date_gmt (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_ewf_20230102_dis` · Aufteilung VALIDATION · Auswahlgrund FILL · Sicherheit **MEDIUM** · Schiedsdurchgang: ja
* Szenario (eigene Kurzfassung der Extraktion): ((I)) top 203.02; ((II)) as (w)-(x)-(y); (y) zigzag with b at 126.55; bearish impulse c still needed into 59.05-43.07 box, then long-term rally.

Fundstellen:
* `primary.currentWave` [image 3 (weekly) / paragraph under weekly chart] A: Text: zigzag 5-3-5 to finish (y) and ((II)); chart shows a,b done and c projected with ((1)),((2)) marked, path ((3))-((5)) into box
* `invalidation` [image 3] A: Red line at 126.55 labelled Invalidation Level with red Right Side down tag
* `targetZones` [image 3 / last paragraph] A: Blue box 59.05 (1.0) to 43.07 (1.236); next level 35.85 if broken
* `directionalBias` [paragraph under quarterly chart] A: Author says ((II)) still looks incomplete and needs more downside
* `primary.nextMoveAfterCurrent` [image 3 / last paragraph] A: Projected path rallies from blue box; long-term buying opportunity
* `primary.currentWave` [image 3 / paragraph weekly] B: a-b-c in red, b at 126.55, projected ((3))-((4))-((5)) path down to c/(y)/((II)) in blue box
* `invalidation` [image 3] B: red line at 126.55 labelled Invalidation Level with Right Side down tag
* `targetZones` [image 3 / final paragraph] B: blue box 1 (59.05) to 1.236 (43.07); 35.85 next level if broken

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* Schiedsdurchgang C: timeframe=1W (VISIBLE_LABEL)
* A/B: Choice of current-wave degree: could also be framed as (y) of WXY or ((II)) of a grand-supercycle impulse; chose c of zigzag (y) as the wave the author describes as running.
* A/B: Text calls 126.55 an alert level for correction end; chart labels it Invalidation Level. Close vs intraday basis not stated.
* A/B: Weekly chart counts ((1)) and ((2)) of c already complete, so the sub-wave running is ((3)); not stated in text.
* A/B: Wave b date not stated; from weekly chart it is roughly mid-Aug 2022, left null.
* A/B: Text says break above 126.55 only an alert that correction is over, while chart labels it invalidation; basis not stated.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"DIS","vuSymbol":"DIS","instrumentType":"STOCK","mappingQuality":"EXACT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1W` | DISAGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2023-01-02T16:03:05+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `ZIGZAG` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `CORRECTIVE` | AGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"c","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `c` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `DOWN` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `UP` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":59.05,"label":"target of bearish c wave / end of ((II))","low":43.07}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"above","price":126.55}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[]` |  | ☐C ☐I ☐P ☐U | | |

## 20. tv-cryptoknee|SPY|2022-12-06|1

* Quelle: TradingView-Autor CryptoKnee (`tv-cryptoknee`, WEBSITE) — https://www.tradingview.com/chart/SPX/f4pccgZV-SPX-hide-you-kids-hide-yo-wife/
* Veröffentlicht: 2022-12-06T23:48:17+00:00 (MINUTE, TradingView-API created_at (Plattform-Metadaten); bearbeitet: NO)
* referenceId `pr_tv-cryptoknee_20221206_spy` · Aufteilung DEVELOPMENT · Auswahlgrund FILL · Sicherheit **MEDIUM** · Schiedsdurchgang: ja
* Szenario (eigene Kurzfassung der Extraktion): A-B done (B = white 1-5 rally to ~4100 at Dec 1); new decline: green 1-2 done, 3 running toward ~3880-3910, then 4 bounce, 5 into gap ~3820-3855; red arrow to ~3360 by Feb 2023

Fundstellen:
* `primary.currentWave` [image 1, green numerals right of last candles] A: green 1 and 2 placed at recent highs, 3/4/5 projected ahead to the right
* `invalidation` [image 1, dashed white line labelled Impulse Inval] A: level 4027.09 on axis
* `keySupportZones` [description lines 6-7; image 1 green dashed line 3910.29] A: author watches 3910 area; break leads to retest view
* `targetZones` [image 1, Gap box and red arrow] A: gap ~3820-3855, arrow end ~3360
* `structuralScenario` [image 1, yellow circled A and B, white circled 1-5] A: rally from Oct low counted as five waves into B
* `primary.currentWave` [image 1, right half] B: circled B above circled 5 at ~4100; green 1/2 near top, projected green 3,4,5 below; red arrow down
* `invalidation` [image 1, white dashed line] B: dashed line at 4027.09 labelled Impulse Inval
* `keySupportZones` [description para 6; image 1 green dashed line] B: 3910 area watched for hold; green dashed line 3910.29

Unklarheiten:
* Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)
* Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)
* Schiedsdurchgang C: family=MOTIVE (VISIBLE_LABEL); currentWave=3 (VISIBLE_LABEL)
* A/B: Text is hedged (bigger move down vs. just a dip); bearish view taken from chart labels and red arrow
* A/B: Green 1 and 2 positions are unusual (2 drawn above 1 near the B high); start of wave 3 not determinable
* A/B: C wave not labelled explicitly; zigzag A-B-C inferred only
* A/B: Wave C not explicitly labelled; inferred from circled A/B plus red arrow and green down count.
* A/B: Text is hedged (bigger drop vs dip), chart is clearly bearish.

| Feld | Kern | extrahiert | A/B | Urteil | Korrektur | Notiz |
|---|---|---|---|---|---|---|
| Instrument (asShown → vuSymbol) | ja | `{"asShown":"SPX","vuSymbol":"SPY","instrumentType":"INDEX_CASH","mappingQuality":"PROXY_DIFFERENT_INSTRUMENT"}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Zeitrahmen | ja | `1D` | AGREE | ☐C ☐I ☐P ☐U | | |
| Veröffentlichung (Zeitstempel) |  | `2022-12-06T23:48:17+00:00` |  | ☐C ☐I ☐P ☐U | | |
| Primärmuster |  | `IMPULSE` |  | ☐C ☐I ☐P ☐U | | |
| Musterfamilie | ja | `MOTIVE` | DISAGREE | ☐C ☐I ☐P ☐U | | |
| Grad (degreeLabel / degreeRank) |  | `{"degreeLabel":"3","degreeRank":null}` |  | ☐C ☐I ☐P ☐U | | |
| Laufende Welle | ja | `3` | DISAGREE | ☐C ☐I ☐P ☐U | | |
| Zustand (laufend/abgeschlossen) |  | `DEVELOPING` |  | ☐C ☐I ☐P ☐U | | |
| Richtung ab jetzt (A1) | ja | `DOWN` | AGREE | ☐C ☐I ☐P ☐U | | |
| Bewegung nach der laufenden Welle (A2) |  | `UP` |  | ☐C ☐I ☐P ☐U | | |
| Zielzonen |  | `[{"high":3855,"label":"gap box, green wave 5 projection","low":3820},{"high":3380,"label":"red arrow end (~Feb 2023), approx. read","low":3340}]` |  | ☐C ☐I ☐P ☐U | | |
| Invalidierung | ja | `{"basis":"UNKNOWN","direction":"above","price":4027.09}` | AGREE | ☐C ☐I ☐P ☐U | | |
| Alternativszenarien |  | `[{"currentWave":null,"directionalBias":"UP","note":"dashed line 'Impulse Inval' at 4027.09: above it the bearish green impulse is invalid; text also asks whether this is only a dip","pattern":"UNKNOWN","trigger":4027.09},{"currentWave":null,"directionalBias":"UP","note":"top dashed line ~4325 'Impulse Inval/complete' (axis label partly hidden), meaning unclear","pattern":"UNKNOWN","trigger":null}]` |  | ☐C ☐I ☐P ☐U | | |
