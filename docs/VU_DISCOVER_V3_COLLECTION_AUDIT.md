# Discover V3 — Audit der Collections (US_REAL)

Erzeugt von `scripts/discover/audit-collections.mjs` aus `discover/data/**`,
Stand 2026-09-08. Jede Zahl hier ist nachrechenbar; nichts ist geschätzt.

## Das Universum, bevor irgendeine Reihe gerechnet wird

| | Titel |
|---|---|
| im Universum | 498 |
| discoverable (nicht stehengeblieben) | 497 |
| mit bekanntem Namen (Bekanntheitsliste Stufe 1 oder 2) | 302 |
| davon Stufe 1 (Alltagsmarke) | 76 |
| ohne bekannten Namen | 195 |
| mit kuratierter Sektorzuordnung | 100 |
| mit freigegebener Kursreihe | 5 |
| mit Marktkapitalisierung | 0 |

**Warum stehen unbekannte Titel vor bekannten?** Nicht, weil das Ranking
etwas falsch macht, sondern weil das Universum so zusammengesetzt ist:
195 von 497 discoverablen Titeln tragen keinen Namen, den ein
Privatanleger kennt — Royalty Trusts, Regionalbanken, Nebenwerte. Und die
Kennzahlen kennen keine Bekanntheit. Ein Blick auf die Verteilung:

| | bekannte Titel | unbekannte Titel |
|---|---|---|
| Median Leadership-Perzentil | 53 | 47 |
| Anteil in den obersten 10 % | 9 % | 11 % |
| Median Zwölfmonatsrendite | +12 % | +9 % |

Die bekannten Titel sind im Schnitt nicht schwächer. Aber es gibt 195 unbekannte
gegen 302 bekannte — bei gleicher Verteilung stehen in den obersten zehn
einer Rangliste rechnerisch mehr unbekannte. Das ist die Ursache. Sie lässt
sich nicht durch ein anderes Ranking beheben, ohne die Rangliste zu
verfälschen — wohl aber durch eine Discovery-Reihenfolge, die innerhalb der
qualifizierten Titel bekannte Namen nach vorn holt (relevance.js), und durch
Reihen, die von vornherein nach Bekanntheit fragen.

## Die Reihen

### NEUE JAHRESHOCHS

| | |
|---|---|
| Zweck | Aktien auf dem höchsten Stand seit zwölf Monaten. |
| Aufnahmeregel | `nearOrAtHigh` + Kennzahl distanceTo52wHigh vorhanden |
| Reihenfolge | `distanceTo52wHigh` absteigend, Signalträger `new52WeekHigh` zuerst, Gleichstand nach `leadershipScore` |
| Kandidaten | 53 von 498, ausgeliefert 30 |
| bekannte Namen unter den ausgelieferten | 20 von 30 — erster auf Platz 1 |

| # | Titel | Name | bekannt | distanceTo52wHigh | 12M | Aussage |
|---|---|---|---|---|---|---|
| 1 | VOD | Vodafone Group | Stufe 1 | -0.2 % | +53 % | Gehört zu den Marktführern |
| 2 | VLO | Valero Energy | Stufe 1 | -0.4 % | +150 % | Hat sich in zwölf Monaten mehr als verdoppelt |
| 3 | SHEL | Shell plc | Stufe 1 | -0.5 % | +38 % | Seit Monaten durchgehend im Aufwärtstrend |
| 4 | ABM | ABM Industries | – | -0.7 % | +8 % | Kommt gerade in Bewegung |
| 5 | PSX | Phillips 66 | Stufe 2 | -0.7 % | +103 % | Hat sich in zwölf Monaten mehr als verdoppelt |
| 6 | WTRG | Essential Utilities | – | -0.7 % | +10 % | Seit Monaten durchgehend im Aufwärtstrend |
| 7 | CVX | Chevron Corporation | Stufe 2 | -1.6 % | +42 % | Seit einem Jahr deutlich im Plus |
| 8 | COP | ConocoPhillips | Stufe 2 | -1.8 % | +50 % | Gehört zu den Marktführern |
| 9 | NX | Quanex Building Products | – | -4.8 % | +25 % | Nach schwachen Monaten wieder im Aufwind |
| 10 | ALOT | AstroNova Inc. | – | -0.0 % | +154 % | Eine der stärksten Aktien des Jahres |

**Warum diese Reihenfolge:** Zuerst stehen Titel mit belegtem Signal `new52WeekHigh`. Dann entscheidet `distanceTo52wHigh`: VOD führt mit -0.2 %.

### DIE STÄRKSTEN AKTIEN

| | |
|---|---|
| Zweck | Aktien, die den Markt über Monate anführen. |
| Aufnahmeregel | keine — alle discoverablen Titel + Kennzahl leadershipScore vorhanden |
| Reihenfolge | `leadershipScore` absteigend, Gleichstand nach `leadershipScore` |
| Kandidaten | 497 von 498, ausgeliefert 30 |
| bekannte Namen unter den ausgelieferten | 17 von 30 — erster auf Platz 1 |

| # | Titel | Name | bekannt | leadershipScore | 12M | Aussage |
|---|---|---|---|---|---|---|
| 1 | VLO | Valero Energy | Stufe 1 | 95.9 | +150 % | Hat sich in zwölf Monaten mehr als verdoppelt |
| 2 | PSX | Phillips 66 | Stufe 2 | 93.4 | +103 % | Hat sich in zwölf Monaten mehr als verdoppelt |
| 3 | ALOT | AstroNova Inc. | – | 93.0 | +154 % | Eine der stärksten Aktien des Jahres |
| 4 | PBT | Permian Basin Royalty Trust | – | 89.5 | +97 % | Eine der stärksten Aktien des Jahres |
| 5 | TGT | Target Corporation | Stufe 2 | 88.3 | +82 % | Seit Monaten im Aufwärtstrend |
| 6 | TWIN | Twin Disc Inc. | – | 87.7 | +89 % | Seit Monaten im Aufwärtstrend |
| 7 | BBVA | Banco Bilbao Vizcaya Argentaria | Stufe 2 | 87.1 | +68 % | Läuft dem Markt davon |
| 8 | STT | State Street Corporation | Stufe 2 | 86.5 | +74 % | Läuft dem Markt davon |
| 9 | MATX | Matson Inc. | Stufe 2 | 85.1 | +114 % | Fast wieder am Jahreshoch |
| 10 | SAN | Banco Santander | Stufe 1 | 84.5 | +60 % | Fast wieder am Jahreshoch |

**Warum diese Reihenfolge:** Dann entscheidet `leadershipScore`: VLO führt mit 95.9.

### SEIT MONATEN IM AUFWIND

| | |
|---|---|
| Zweck | Die stärkste Kursentwicklung der letzten Monate. |
| Aufnahmeregel | keine — alle discoverablen Titel + Kennzahl momentumScore vorhanden |
| Reihenfolge | `momentumScore` absteigend, Gleichstand nach `leadershipScore` |
| Kandidaten | 497 von 498, ausgeliefert 30 |
| bekannte Namen unter den ausgelieferten | 15 von 30 — erster auf Platz 1 |

| # | Titel | Name | bekannt | momentumScore | 12M | Aussage |
|---|---|---|---|---|---|---|
| 1 | VLO | Valero Energy | Stufe 1 | 99.0 | +150 % | Auf dem höchsten Stand des Jahres |
| 2 | PSX | Phillips 66 | Stufe 2 | 92.8 | +103 % | Auf dem höchsten Stand des Jahres |
| 3 | ALOT | AstroNova Inc. | – | 90.0 | +154 % | Hat sich in sechs Monaten mehr als verdreifacht |
| 4 | PBT | Permian Basin Royalty Trust | – | 87.6 | +97 % | Eine der stärksten Aktien des Jahres |
| 5 | MU | Micron Technology | Stufe 2 | 84.6 | +663 % | Hat sich in sechs Monaten mehr als verdoppelt |
| 6 | MEI | Methode Electronics | – | 83.4 | +103 % | Nach schwachen Monaten wieder im Aufwind |
| 7 | TWIN | Twin Disc Inc. | – | 82.2 | +89 % | Eine der stärksten Aktien des Jahres |
| 8 | MYE | Myers Industries | – | 82.0 | +101 % | Gehört zu den Marktführern |
| 9 | STT | State Street Corporation | Stufe 2 | 81.3 | +74 % | Gehört zu den Marktführern |
| 10 | MATX | Matson Inc. | Stufe 2 | 81.1 | +114 % | Läuft dem Markt davon |

**Warum diese Reihenfolge:** Dann entscheidet `momentumScore`: VLO führt mit 99.0.

### GERADE IN BEWEGUNG

| | |
|---|---|
| Zweck | Deutlich mehr Handel als sonst — und der Kurs zieht an. |
| Aufnahmeregel | `breakout` + Kennzahl breakoutScore vorhanden |
| Reihenfolge | `breakoutScore` absteigend, Signalträger `breakout` zuerst, Gleichstand nach `leadershipScore` |
| Kandidaten | 4 von 498, ausgeliefert 4 |
| bekannte Namen unter den ausgelieferten | 0 von 4 — erster auf Platz – |

| # | Titel | Name | bekannt | breakoutScore | 12M | Aussage |
|---|---|---|---|---|---|---|
| 1 | ABM | ABM Industries | – | 97.7 | +8 % | Auf dem höchsten Stand des Jahres |
| 2 | NX | Quanex Building Products | – | 84.1 | +25 % | Auf dem höchsten Stand des Jahres |
| 3 | NRT | North European Oil Royalty Trust | – | 81.9 | +111 % | Eine der stärksten Aktien des Jahres |
| 4 | AIRT | Air T Inc. | – | 72.1 | +26 % | Gehört zu den Marktführern |

**Warum diese Reihenfolge:** Zuerst stehen Titel mit belegtem Signal `breakout`. Dann entscheidet `breakoutScore`: ABM führt mit 97.7.

### DEM MARKT VORAUS

| | |
|---|---|
| Zweck | Aktien, die sich besser entwickeln als der Gesamtmarkt. |
| Aufnahmeregel | keine — alle discoverablen Titel + Kennzahl relativeStrengthScore vorhanden |
| Reihenfolge | `relativeStrengthScore` absteigend, Gleichstand nach `momentumScore` |
| Kandidaten | 497 von 498, ausgeliefert 30 |
| bekannte Namen unter den ausgelieferten | 14 von 30 — erster auf Platz 1 |

| # | Titel | Name | bekannt | relativeStrengthScore | 12M | Aussage |
|---|---|---|---|---|---|---|
| 1 | VLO | Valero Energy | Stufe 1 | 100.0 | +150 % | Hat sich in zwölf Monaten mehr als verdoppelt |
| 2 | ALOT | AstroNova Inc. | – | 100.0 | +154 % | Hat sich in zwölf Monaten mehr als verdoppelt |
| 3 | PSX | Phillips 66 | Stufe 2 | 99.9 | +103 % | Auf dem höchsten Stand des Jahres |
| 4 | MEI | Methode Electronics | – | 94.6 | +103 % | Nach schwachen Monaten wieder im Aufwind |
| 5 | MYE | Myers Industries | – | 93.9 | +101 % | Gehört zu den Marktführern |
| 6 | PBT | Permian Basin Royalty Trust | – | 92.5 | +97 % | Eine der stärksten Aktien des Jahres |
| 7 | TGT | Target Corporation | Stufe 2 | 90.8 | +82 % | Eine der stärksten Aktien des Jahres |
| 8 | TWIN | Twin Disc Inc. | – | 90.6 | +89 % | Gehört zu den Marktführern |
| 9 | STT | State Street Corporation | Stufe 2 | 89.3 | +74 % | Seit Monaten im Aufwärtstrend |
| 10 | MTRN | Materion Corporation | – | 87.9 | +128 % | Seit Monaten im Aufwärtstrend |

**Warum diese Reihenfolge:** Dann entscheidet `relativeStrengthScore`: VLO führt mit 100.0. 6 der ersten zehn sind unbekannte Namen — nicht weil die Regel sie bevorzugt, sondern weil sie die Mehrheit des Universums stellen (siehe oben).

### STABILE AUFWÄRTSTRENDS

| | |
|---|---|
| Zweck | Aktien, die seit Monaten über ihrem Durchschnittskurs liegen. |
| Aufnahmeregel | `trendIntact` + Kennzahl leadershipScore vorhanden |
| Reihenfolge | `leadershipScore` absteigend, Gleichstand nach `leadershipScore` |
| Kandidaten | 97 von 498, ausgeliefert 30 |
| bekannte Namen unter den ausgelieferten | 19 von 30 — erster auf Platz 1 |

| # | Titel | Name | bekannt | leadershipScore | 12M | Aussage |
|---|---|---|---|---|---|---|
| 1 | VLO | Valero Energy | Stufe 1 | 95.9 | +150 % | Auf dem höchsten Stand des Jahres |
| 2 | PSX | Phillips 66 | Stufe 2 | 93.4 | +103 % | Auf dem höchsten Stand des Jahres |
| 3 | ALOT | AstroNova Inc. | – | 93.0 | +154 % | Hat sich in sechs Monaten mehr als verdreifacht |
| 4 | PBT | Permian Basin Royalty Trust | – | 89.5 | +97 % | Eine der stärksten Aktien des Jahres |
| 5 | TGT | Target Corporation | Stufe 2 | 88.3 | +82 % | Eine der stärksten Aktien des Jahres |
| 6 | TWIN | Twin Disc Inc. | – | 87.7 | +89 % | Gehört zu den Marktführern |
| 7 | BBVA | Banco Bilbao Vizcaya Argentaria | Stufe 2 | 87.1 | +68 % | Gehört zu den Marktführern |
| 8 | STT | State Street Corporation | Stufe 2 | 86.5 | +74 % | Seit Monaten im Aufwärtstrend |
| 9 | MATX | Matson Inc. | Stufe 2 | 85.1 | +114 % | Seit Monaten im Aufwärtstrend |
| 10 | SAN | Banco Santander | Stufe 1 | 84.5 | +60 % | Läuft dem Markt davon |

**Warum diese Reihenfolge:** Dann entscheidet `leadershipScore`: VLO führt mit 95.9.

## Überschneidungen zwischen den Reihen (erste zehn)

Wie viele der ersten zehn Titel einer Reihe stehen auch unter den ersten zehn einer anderen?

| | new‑52‑week‑highs | market‑leaders | momentum‑leaders | breakout‑watch | relative‑strength | trend‑quality |
|---|---|---|---|---|---|---|
| new-52-week-highs | · | 3 | 3 | 2 | 3 | 3 |
| market-leaders | 3 | · | 7 | 0 | 7 | 10 |
| momentum-leaders | 3 | 7 | · | 0 | 8 | 7 |
| breakout-watch | 2 | 0 | 0 | · | 0 | 0 |
| relative-strength | 3 | 7 | 8 | 0 | · | 7 |
| trend-quality | 3 | 10 | 7 | 0 | 7 | · |

Titel, die in drei oder mehr Reihen unter den ersten zehn stehen: VLO (5×), PSX (5×), ALOT (5×), PBT (4×), TWIN (4×), STT (4×), TGT (3×), MATX (3×).

Das ist die Wiederholung, die auf der Startseite als "kleines Universum" wirkt. Sie ist kein Fehler der Ranglisten — ein Titel, der über zwölf Monate führt, führt meist auch über sechs — sondern eine Frage der Darstellung: welche Karten die Startseite je Reihe zuerst zeigt. Dafür gibt es in V3 die Cross-Collection-Diversity im Build (`buildHome`), nicht eine Änderung der Ranglisten.

## Bekannte Namen: wo stehen sie heute?

| Titel | Name | bekannt | Leadership-Perzentil | 12M | in Reihen (Rang) |
|---|---|---|---|---|---|
| VLO | Valero Energy | Stufe 1 | 100 | +150 % | NEUE JAHRESHOCHS #2, DIE STÄRKSTEN AKTIEN #1, SEIT MONATEN IM AUFWIND #1, DEM MARKT VORAUS #1, STABILE AUFWÄRTSTRENDS #1 |
| SAN | Banco Santander | Stufe 1 | 98 | +60 % | NEUE JAHRESHOCHS #14, DIE STÄRKSTEN AKTIEN #10, SEIT MONATEN IM AUFWIND #36, DEM MARKT VORAUS #26, STABILE AUFWÄRTSTRENDS #10 |
| MRK | Merck & Co. | Stufe 1 | 98 | +81 % | DIE STÄRKSTEN AKTIEN #11, SEIT MONATEN IM AUFWIND #27, DEM MARKT VORAUS #16, STABILE AUFWÄRTSTRENDS #11 |
| NEM | Newmont Corporation | Stufe 1 | 96 | +68 % | DIE STÄRKSTEN AKTIEN #18, SEIT MONATEN IM AUFWIND #55, DEM MARKT VORAUS #39, STABILE AUFWÄRTSTRENDS #18 |
| VOD | Vodafone Group | Stufe 1 | 95 | +53 % | NEUE JAHRESHOCHS #1, DIE STÄRKSTEN AKTIEN #26, DEM MARKT VORAUS #54, STABILE AUFWÄRTSTRENDS #22 |
| AMD | Advanced Micro Devices | Stufe 1 | 94 | +235 % | DIE STÄRKSTEN AKTIEN #29, SEIT MONATEN IM AUFWIND #11, DEM MARKT VORAUS #19, STABILE AUFWÄRTSTRENDS #23 |
| JNJ | Johnson & Johnson | Stufe 1 | 94 | +54 % | NEUE JAHRESHOCHS #39, DIE STÄRKSTEN AKTIEN #32, STABILE AUFWÄRTSTRENDS #25 |
| DE | Deere & Company | Stufe 1 | 93 | +46 % | NEUE JAHRESHOCHS #31, DIE STÄRKSTEN AKTIEN #34, STABILE AUFWÄRTSTRENDS #27 |
| SHEL | Shell plc | Stufe 1 | 89 | +38 % | NEUE JAHRESHOCHS #3, DIE STÄRKSTEN AKTIEN #53, STABILE AUFWÄRTSTRENDS #42 |
| HPQ | HP Inc. | Stufe 1 | 89 | +12 % | NEUE JAHRESHOCHS #53, DIE STÄRKSTEN AKTIEN #55, SEIT MONATEN IM AUFWIND #52, DEM MARKT VORAUS #57, STABILE AUFWÄRTSTRENDS #44 |
| NVDA | NVIDIA Corporation | Stufe 1 | 87 | +35 % | NEUE JAHRESHOCHS #42, STABILE AUFWÄRTSTRENDS #50 |
| BAC | Bank of America | Stufe 1 | 87 | +28 % | NEUE JAHRESHOCHS #33 |
| KO | Coca-Cola Company | Stufe 1 | 85 | +34 % | NEUE JAHRESHOCHS #43 |
| BP | BP plc | Stufe 1 | 84 | +39 % | NEUE JAHRESHOCHS #50, STABILE AUFWÄRTSTRENDS #56 |
| GM | General Motors | Stufe 1 | 84 | +49 % | — |
| XOM | Exxon Mobil Corporation | Stufe 1 | 83 | +51 % | — |
| INTC | Intel Corporation | Stufe 1 | 83 | +327 % | SEIT MONATEN IM AUFWIND #18, DEM MARKT VORAUS #34, STABILE AUFWÄRTSTRENDS #57 |
| JPM | JPMorgan Chase & Co. | Stufe 1 | 81 | +22 % | NEUE JAHRESHOCHS #30 |
| VZ | Verizon Communications | Stufe 1 | 80 | +21 % | NEUE JAHRESHOCHS #12 |
| AAPL | Apple Inc. | Stufe 1 | 80 | +32 % | — |
| FDX | FedEx Corporation | Stufe 1 | 79 | +75 % | — |
| GS | Goldman Sachs Group | Stufe 1 | 78 | +43 % | — |
| CRM | Salesforce Inc. | Stufe 1 | 76 | +0 % | — |
| CSCO | Cisco Systems | Stufe 1 | 75 | +67 % | SEIT MONATEN IM AUFWIND #48 |
| LLY | Eli Lilly and Company | Stufe 1 | 74 | +56 % | — |

Die 25 stärksten Alltagsmarken nach Leadership-Perzentil. Wer hier steht und trotzdem in keiner Reihe unter den ersten zwölf war, ist genau der Fall, den die Discovery-Reihenfolge behebt — ohne die Rangliste zu verändern.
