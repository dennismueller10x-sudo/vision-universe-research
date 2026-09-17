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
| Zweck | Seit Monaten über dem Durchschnittskurs — die ruhigsten zuerst. |
| Aufnahmeregel | `trendIntact` + Kennzahl leadershipScore, volatility252d vorhanden |
| Reihenfolge | `volatility252d` aufsteigend, Gleichstand nach `leadershipScore` |
| Kandidaten | 97 von 498, ausgeliefert 30 |
| bekannte Namen unter den ausgelieferten | 22 von 30 — erster auf Platz 2 |

| # | Titel | Name | bekannt | volatility252d | 12M | Aussage |
|---|---|---|---|---|---|---|
| 1 | TXNM | TXNM Energy | – | 5.1 % | +5 % | Fast wieder am Jahreshoch |
| 2 | BRK-A | Berkshire Hathaway | Stufe 1 | 14.2 % | +1 % | Über zwölf Monate im Plus |
| 3 | JNJ | Johnson & Johnson | Stufe 1 | 19.1 % | +54 % | Gehört zu den Marktführern |
| 4 | BCE | BCE Inc. | – | 19.7 % | +1 % | Zuletzt schwächer, über zwölf Monate im Plus |
| 5 | NFG | National Fuel Gas | – | 20.1 % | -1 % | Etwas unter dem Stand vor einem Jahr |
| 6 | CFR | Cullen/Frost Bankers | – | 20.7 % | +31 % | Gehört zu den Marktführern |
| 7 | BNY | Bank of New York Mellon | Stufe 2 | 21.2 % | +60 % | Seit Monaten im Aufwärtstrend |
| 8 | WTRG | Essential Utilities | – | 22.0 % | +10 % | Auf dem höchsten Stand des Jahres |
| 9 | HTO | H2O America | – | 22.4 % | +33 % | Fast wieder am Jahreshoch |
| 10 | SHEL | Shell plc | Stufe 1 | 22.5 % | +38 % | Auf dem höchsten Stand des Jahres |

**Warum diese Reihenfolge:** Dann entscheidet `volatility252d`: TXNM führt mit 5.1 %. 6 der ersten zehn sind unbekannte Namen — nicht weil die Regel sie bevorzugt, sondern weil sie die Mehrheit des Universums stellen (siehe oben).

### BEKANNTE NAMEN IN BEWEGUNG

| | |
|---|---|
| Zweck | Marken, die man aus dem Alltag kennt — und deren Kurs gerade etwas tut. |
| Aufnahmeregel | `bekannt` + Kennzahl return3M vorhanden |
| Reihenfolge | `return3M` absteigend, Gleichstand nach `leadershipScore` |
| Kandidaten | 36 von 498, ausgeliefert 30 |
| bekannte Namen unter den ausgelieferten | 30 von 30 — erster auf Platz 1 |

| # | Titel | Name | bekannt | return3M | 12M | Aussage |
|---|---|---|---|---|---|---|
| 1 | VLO | Valero Energy | Stufe 1 | 48.7 % | +150 % | Hat sich in zwölf Monaten mehr als verdoppelt |
| 2 | CRM | Salesforce Inc. | Stufe 1 | 36.8 % | +0 % | Nach schwachen Monaten wieder im Aufwind |
| 3 | NEM | Newmont Corporation | Stufe 1 | 28.6 % | +68 % | Gehört zu den Marktführern |
| 4 | MRK | Merck & Co. | Stufe 1 | 25.1 % | +81 % | Eine der stärksten Aktien des Jahres |
| 5 | HPQ | HP Inc. | Stufe 1 | 24.3 % | +12 % | Nach schwachen Monaten wieder im Aufwind |
| 6 | SAN | Banco Santander | Stufe 1 | 22.2 % | +60 % | Eine der stärksten Aktien des Jahres |
| 7 | MSFT | Microsoft Corporation | Stufe 1 | 20.2 % | +1 % | Über zwölf Monate im Plus |
| 8 | DE | Deere & Company | Stufe 1 | 19.0 % | +46 % | Gehört zu den Marktführern |
| 9 | BAC | Bank of America | Stufe 1 | 16.9 % | +28 % | Fast wieder am Jahreshoch |
| 10 | VOD | Vodafone Group | Stufe 1 | 16.9 % | +53 % | Auf dem höchsten Stand des Jahres |

**Warum diese Reihenfolge:** Dann entscheidet `return3M`: VLO führt mit 48.7 %.

### COMEBACK?

| | |
|---|---|
| Zweck | Deutlich gefallen — und seit drei Monaten wieder klar im Plus. |
| Aufnahmeregel | `comeback` + Kennzahl return3M, maxDrawdown252d, distanceTo52wHigh vorhanden |
| Reihenfolge | `return3M` absteigend, Gleichstand nach `leadershipScore` |
| Kandidaten | 56 von 498, ausgeliefert 30 |
| bekannte Namen unter den ausgelieferten | 14 von 30 — erster auf Platz 3 |

| # | Titel | Name | bekannt | return3M | 12M | Aussage |
|---|---|---|---|---|---|---|
| 1 | MAN | ManpowerGroup | – | 76.4 % | +45 % | Gehört zu den Marktführern |
| 2 | THC | Tenet Healthcare | – | 58.9 % | +32 % | Nach schwachen Monaten wieder im Aufwind |
| 3 | CBRL | Cracker Barrel | Stufe 2 | 54.9 % | +3 % | Nach schwachen Monaten wieder im Aufwind |
| 4 | NWL | Newell Brands | – | 52.3 % | +6 % | Seit Monaten durchgehend im Aufwärtstrend |
| 5 | EAT | Brinker International | Stufe 2 | 52.2 % | +41 % | Gehört zu den Marktführern |
| 6 | SIEB | Siebert Financial | – | 43.4 % | +4 % | Seit Monaten durchgehend im Aufwärtstrend |
| 7 | AIRT | Air T Inc. | – | 42.5 % | +26 % | Seit Monaten im Aufwärtstrend |
| 8 | GPC | Genuine Parts Company | Stufe 2 | 39.2 % | -0 % | Etwas unter dem Stand vor einem Jahr |
| 9 | PAR | PAR Technology | – | 38.5 % | -62 % | Deutlich unter dem Stand vor einem Jahr |
| 10 | HL | Hecla Mining | Stufe 2 | 37.4 % | +127 % | Hat sich in zwölf Monaten mehr als verdoppelt |

**Warum diese Reihenfolge:** Dann entscheidet `return3M`: MAN führt mit 76.4 %. 6 der ersten zehn sind unbekannte Namen — nicht weil die Regel sie bevorzugt, sondern weil sie die Mehrheit des Universums stellen (siehe oben).

### ÜBERRASCHUNGEN

| | |
|---|---|
| Zweck | Stark, aber kaum jemandem ein Begriff — Titel ohne bekannten Namen. |
| Aufnahmeregel | `ueberraschung` + Kennzahl leadershipScore vorhanden |
| Reihenfolge | `leadershipScore` absteigend, Gleichstand nach `leadershipScore` |
| Kandidaten | 31 von 498, ausgeliefert 30 |
| bekannte Namen unter den ausgelieferten | 0 von 30 — erster auf Platz – |

| # | Titel | Name | bekannt | leadershipScore | 12M | Aussage |
|---|---|---|---|---|---|---|
| 1 | ALOT | AstroNova Inc. | – | 93.0 | +154 % | Hat sich in zwölf Monaten mehr als verdoppelt |
| 2 | PBT | Permian Basin Royalty Trust | – | 89.5 | +97 % | Eine der stärksten Aktien des Jahres |
| 3 | TWIN | Twin Disc Inc. | – | 87.7 | +89 % | Eine der stärksten Aktien des Jahres |
| 4 | NRT | North European Oil Royalty Trust | – | 81.8 | +111 % | Hat sich in zwölf Monaten mehr als verdoppelt |
| 5 | AVT | Avnet Inc. | – | 79.2 | +76 % | Gehört zu den Marktführern |
| 6 | HP | Helmerich & Payne | – | 77.8 | +123 % | Gehört zu den Marktführern |
| 7 | NHC | National HealthCare Corporation | – | 76.7 | +96 % | Seit Monaten im Aufwärtstrend |
| 8 | CLDX | Celldex Therapeutics | – | 76.3 | +71 % | Seit Monaten im Aufwärtstrend |
| 9 | ACU | Acme United Corporation | – | 76.0 | +40 % | Läuft dem Markt davon |
| 10 | MYE | Myers Industries | – | 75.9 | +101 % | Läuft dem Markt davon |

**Warum diese Reihenfolge:** Dann entscheidet `leadershipScore`: ALOT führt mit 93.0. 10 der ersten zehn sind unbekannte Namen — nicht weil die Regel sie bevorzugt, sondern weil sie die Mehrheit des Universums stellen (siehe oben).

## Überschneidungen zwischen den Reihen (erste zehn)

Wie viele der ersten zehn Titel einer Reihe stehen auch unter den ersten zehn einer anderen?

| | new‑52‑week‑highs | market‑leaders | momentum‑leaders | breakout‑watch | relative‑strength | trend‑quality | bekannte‑namen | comeback | ueberraschungen |
|---|---|---|---|---|---|---|---|---|---|
| new-52-week-highs | · | 3 | 3 | 2 | 3 | 2 | 2 | 0 | 1 |
| market-leaders | 3 | · | 7 | 0 | 7 | 0 | 2 | 0 | 3 |
| momentum-leaders | 3 | 7 | · | 0 | 8 | 0 | 1 | 0 | 4 |
| breakout-watch | 2 | 0 | 0 | · | 0 | 0 | 0 | 1 | 1 |
| relative-strength | 3 | 7 | 8 | 0 | · | 0 | 1 | 0 | 4 |
| trend-quality | 2 | 0 | 0 | 0 | 0 | · | 0 | 0 | 0 |
| bekannte-namen | 2 | 2 | 1 | 0 | 1 | 0 | · | 0 | 0 |
| comeback | 0 | 0 | 0 | 1 | 0 | 0 | 0 | · | 0 |
| ueberraschungen | 1 | 3 | 4 | 1 | 4 | 0 | 0 | 0 | · |

Titel, die in drei oder mehr Reihen unter den ersten zehn stehen: VLO (5×), ALOT (5×), PSX (4×), PBT (4×), TWIN (4×), STT (3×), MYE (3×).

Das ist die Wiederholung, die auf der Startseite als "kleines Universum" wirkt. Sie ist kein Fehler der Ranglisten — ein Titel, der über zwölf Monate führt, führt meist auch über sechs — sondern eine Frage der Darstellung: welche Karten die Startseite je Reihe zuerst zeigt. Dafür gibt es in V3 die Cross-Collection-Diversity im Build (`buildHome`), nicht eine Änderung der Ranglisten.

## Bekannte Namen: wo stehen sie heute?

| Titel | Name | bekannt | Leadership-Perzentil | 12M | in Reihen (Rang) |
|---|---|---|---|---|---|
| VLO | Valero Energy | Stufe 1 | 100 | +150 % | NEUE JAHRESHOCHS #2, DIE STÄRKSTEN AKTIEN #1, SEIT MONATEN IM AUFWIND #1, DEM MARKT VORAUS #1, STABILE AUFWÄRTSTRENDS #53, BEKANNTE NAMEN IN BEWEGUNG #1 |
| SAN | Banco Santander | Stufe 1 | 98 | +60 % | NEUE JAHRESHOCHS #14, DIE STÄRKSTEN AKTIEN #10, SEIT MONATEN IM AUFWIND #36, DEM MARKT VORAUS #26, STABILE AUFWÄRTSTRENDS #45, BEKANNTE NAMEN IN BEWEGUNG #6 |
| MRK | Merck & Co. | Stufe 1 | 98 | +81 % | DIE STÄRKSTEN AKTIEN #11, SEIT MONATEN IM AUFWIND #27, DEM MARKT VORAUS #16, STABILE AUFWÄRTSTRENDS #37, BEKANNTE NAMEN IN BEWEGUNG #4 |
| NEM | Newmont Corporation | Stufe 1 | 96 | +68 % | DIE STÄRKSTEN AKTIEN #18, SEIT MONATEN IM AUFWIND #55, DEM MARKT VORAUS #39, BEKANNTE NAMEN IN BEWEGUNG #3 |
| VOD | Vodafone Group | Stufe 1 | 95 | +53 % | NEUE JAHRESHOCHS #1, DIE STÄRKSTEN AKTIEN #26, DEM MARKT VORAUS #54, STABILE AUFWÄRTSTRENDS #40, BEKANNTE NAMEN IN BEWEGUNG #10 |
| AMD | Advanced Micro Devices | Stufe 1 | 94 | +235 % | DIE STÄRKSTEN AKTIEN #29, SEIT MONATEN IM AUFWIND #11, DEM MARKT VORAUS #19, KÜNSTLICHE INTELLIGENZ #1 |
| JNJ | Johnson & Johnson | Stufe 1 | 94 | +54 % | NEUE JAHRESHOCHS #39, DIE STÄRKSTEN AKTIEN #32, STABILE AUFWÄRTSTRENDS #3, BEKANNTE NAMEN IN BEWEGUNG #11 |
| DE | Deere & Company | Stufe 1 | 93 | +46 % | NEUE JAHRESHOCHS #31, DIE STÄRKSTEN AKTIEN #34, STABILE AUFWÄRTSTRENDS #43, BEKANNTE NAMEN IN BEWEGUNG #8, ROBOTIK & AUTOMATION #1 |
| SHEL | Shell plc | Stufe 1 | 89 | +38 % | NEUE JAHRESHOCHS #3, DIE STÄRKSTEN AKTIEN #53, STABILE AUFWÄRTSTRENDS #10, BEKANNTE NAMEN IN BEWEGUNG #21 |
| HPQ | HP Inc. | Stufe 1 | 89 | +12 % | NEUE JAHRESHOCHS #53, DIE STÄRKSTEN AKTIEN #55, SEIT MONATEN IM AUFWIND #52, DEM MARKT VORAUS #57, BEKANNTE NAMEN IN BEWEGUNG #5 |
| NVDA | NVIDIA Corporation | Stufe 1 | 87 | +35 % | NEUE JAHRESHOCHS #42, STABILE AUFWÄRTSTRENDS #60, BEKANNTE NAMEN IN BEWEGUNG #28, KÜNSTLICHE INTELLIGENZ #3 |
| BAC | Bank of America | Stufe 1 | 87 | +28 % | NEUE JAHRESHOCHS #33, BEKANNTE NAMEN IN BEWEGUNG #9 |
| KO | Coca-Cola Company | Stufe 1 | 85 | +34 % | NEUE JAHRESHOCHS #43, BEKANNTE NAMEN IN BEWEGUNG #18 |
| BP | BP plc | Stufe 1 | 84 | +39 % | NEUE JAHRESHOCHS #50, STABILE AUFWÄRTSTRENDS #33, BEKANNTE NAMEN IN BEWEGUNG #36 |
| GM | General Motors | Stufe 1 | 84 | +49 % | AUTOS & MOBILITÄT #1 |
| XOM | Exxon Mobil Corporation | Stufe 1 | 83 | +51 % | BEKANNTE NAMEN IN BEWEGUNG #31 |
| INTC | Intel Corporation | Stufe 1 | 83 | +327 % | SEIT MONATEN IM AUFWIND #18, DEM MARKT VORAUS #34, KÜNSTLICHE INTELLIGENZ #4 |
| JPM | JPMorgan Chase & Co. | Stufe 1 | 81 | +22 % | NEUE JAHRESHOCHS #30, BEKANNTE NAMEN IN BEWEGUNG #15 |
| VZ | Verizon Communications | Stufe 1 | 80 | +21 % | NEUE JAHRESHOCHS #12, STABILE AUFWÄRTSTRENDS #20, BEKANNTE NAMEN IN BEWEGUNG #16 |
| AAPL | Apple Inc. | Stufe 1 | 80 | +32 % | STABILE AUFWÄRTSTRENDS #23, KÜNSTLICHE INTELLIGENZ #5 |
| FDX | FedEx Corporation | Stufe 1 | 79 | +75 % | — |
| GS | Goldman Sachs Group | Stufe 1 | 78 | +43 % | — |
| CRM | Salesforce Inc. | Stufe 1 | 76 | +0 % | BEKANNTE NAMEN IN BEWEGUNG #2, KÜNSTLICHE INTELLIGENZ #6 |
| CSCO | Cisco Systems | Stufe 1 | 75 | +67 % | SEIT MONATEN IM AUFWIND #48, KÜNSTLICHE INTELLIGENZ #7 |
| LLY | Eli Lilly and Company | Stufe 1 | 74 | +56 % | — |

Die 25 stärksten Alltagsmarken nach Leadership-Perzentil. Wer hier steht und trotzdem in keiner Reihe unter den ersten zwölf war, ist genau der Fall, den die Discovery-Reihenfolge behebt — ohne die Rangliste zu verändern.
