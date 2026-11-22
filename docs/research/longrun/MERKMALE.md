# Merkmals-Atlas: Welche Aktienmerkmale lagen vor dem Markt?

**Forschung, nicht zertifiziert.** Quelle: Kenneth R. French Data Library (Dartmouth), Daten bis 09/2026; Owner-Freigabe der Quelle 21.11.2026. Erzeuger: `scripts/research/longrun/atlas.mjs`.

Je Merkmal das wertgewichtete Zehntel aller US-Aktien auf der „guten Seite“ gegen den Gesamtmarkt, ohne Handelskosten. Sortiert nach dem Vorsprung **nach der Veröffentlichung** – das ist der ehrlichste Maßstab, denn vorher wusste niemand davon.

| Merkmal (gute Seite) | ab | Vorsprung gesamt | veröffentlicht | Vorsprung danach | seit 2008 (Merkmal / Markt) | 10-J.-Fenster vorn | Jahrzehnte vorn | max. Verlust (Markt) | nach 1 % Kosten |
|---|---|---|---|---|---|---|---|---|---|
| Momentum 12 Monate (Marktführer) | 01/1927 | +6,6 Pp | 1993 (Jegadeesh/Titman) | +4,1 Pp | 13,2 % / 11,3 % | 96 % | 9 von 9 | -75,8 % (-83,7 %) | +5,4 Pp |
| Kombination Momentum + Profitabilität | 07/1963 | +4,0 Pp | 2013 (beide veröffentlicht) | +3,7 Pp | 14,0 % / 11,3 % | 100 % | 5 von 5 | -45,9 % (-50,3 %) | +2,9 Pp |
| Kombination Momentum + Günstig nach Buchwert | 01/1927 | +5,0 Pp | 1993 (beide veröffentlicht) | +3,6 Pp | 11,7 % / 11,3 % | 83 % | 7 von 9 | -83,1 % (-83,7 %) | +3,8 Pp |
| Günstig nach Buchwert | 07/1926 | +2,0 Pp | 1992 (Fama/French) | +2,7 Pp | 8,9 % / 11,3 % | 68 % | 6 von 9 | -91,4 % (-83,7 %) | +0,9 Pp |
| Günstig nach Gewinn (KGV niedrig) | 07/1951 | +4,0 Pp | 1977 (Basu) | +2,6 Pp | 9,6 % / 11,3 % | 85 % | 5 von 6 | -47,2 % (-50,3 %) | +2,9 Pp |
| Hohe operative Profitabilität | 07/1963 | +1,2 Pp | 2013 (Novy-Marx) | +2,5 Pp | 14,1 % / 11,3 % | 70 % | 3 von 5 | -52,2 % (-50,3 %) | +0,1 Pp |
| Kombination Momentum + Rückkäufe | 07/1963 | +4,6 Pp | 2008 (beide veröffentlicht) | +1,6 Pp | 12,9 % / 11,3 % | 99 % | 5 von 5 | -49,2 % (-50,3 %) | +3,5 Pp |
| Langfristige Umkehr (Verlierer der letzten 5 Jahre) | 01/1931 | +3,2 Pp | 1985 (De Bondt/Thaler) | +0,9 Pp | 9,9 % / 11,3 % | 64 % | 5 von 8 | -72,3 % (-71,4 %) | +2,0 Pp |
| Saubere Gewinne (niedrige Accruals) | 07/1963 | +1,3 Pp | 1996 (Sloan) | +0,7 Pp | 12,9 % / 11,3 % | 60 % | 2 von 5 | -57,1 % (-50,3 %) | +0,2 Pp |
| Aktienrückkäufe (Nettoemission < 0) | 07/1963 | +2,3 Pp | 2008 (Pontiff/Woodgate) | +0,6 Pp | 11,9 % / 11,3 % | 93 % | 5 von 5 | -48,3 % (-50,3 %) | +1,2 Pp |
| Hohe Dividendenrendite | 07/1927 | +0,4 Pp | 1979 (Litzenberger/Ramaswamy) | +0,4 Pp | 9,7 % / 11,3 % | 60 % | 5 von 9 | -86,9 % (-83,7 %) | −0,7 Pp |
| Günstig nach Cashflow | 07/1951 | +3,5 Pp | 1994 (Lakonishok/Shleifer/Vishny) | +0,3 Pp | 7,9 % / 11,3 % | 84 % | 4 von 6 | -50,6 % (-50,3 %) | +2,3 Pp |
| Niedriges Beta | 07/1963 | −0,0 Pp | 1972 (Black/Jensen/Scholes) | +0,2 Pp | 8,9 % / 11,3 % | 62 % | 3 von 5 | -38,5 % (-50,3 %) | −1,1 Pp |
| Wenig Investition (geringes Bilanzwachstum) | 07/1963 | +2,0 Pp | 2008 (Cooper/Gulen/Schill) | +0,1 Pp | 11,4 % / 11,3 % | 71 % | 3 von 5 | -56,3 % (-50,3 %) | +0,9 Pp |
| Kombination Profitabilität + Günstig nach Gewinn | 07/1963 | +2,3 Pp | 2013 (beide veröffentlicht) | −0,1 Pp | 12,1 % / 11,3 % | 93 % | 4 von 5 | -44,9 % (-50,3 %) | +1,2 Pp |
| Größte Firmen (wie S&P 500) | 07/1926 | −0,3 Pp | – | – | 11,8 % / 11,3 % | 35 % | 5 von 9 | -82,0 % (-83,7 %) | −1,4 Pp |
| Niedrige Eigen-Schwankung | 07/1963 | +0,5 Pp | 2006 (Ang/Hodrick/Xing/Zhang) | −0,3 Pp | 10,8 % / 11,3 % | 75 % | 3 von 5 | -43,7 % (-50,3 %) | −0,6 Pp |
| Niedrige Schwankung | 07/1963 | −0,9 Pp | 2006 (Ang/Hodrick/Xing/Zhang) | −1,6 Pp | 9,3 % / 11,3 % | 56 % | 3 von 5 | -39,0 % (-50,3 %) | −1,9 Pp |
| Kleine Firmen | 07/1926 | +1,7 Pp | 1981 (Banz) | −2,1 Pp | 7,1 % / 11,3 % | 63 % | 5 von 9 | -88,5 % (-83,7 %) | +0,6 Pp |
| Kurzfristige Umkehr (Verlierer des letzten Monats) | 07/1926 | +3,1 Pp | 1990 (Jegadeesh) | −4,2 Pp | 7,3 % / 11,3 % | 61 % | 6 von 9 | -82,4 % (-83,7 %) | +2,0 Pp |

## Phasenfestigkeit: Vorsprung je Jahrzehnt (Prozentpunkte p. a. gegenüber dem Gesamtmarkt)

Ein Merkmal, das nur in einer Ära funktioniert, taugt nicht als Grundlage für eine Strategie, die in jeder Phase bestehen soll. Laufendes Jahrzehnt (2020er) beschreibend, nicht in „Jahrzehnte vorn“ gezählt.

| Merkmal | 1930er | 1940er | 1950er | 1960er | 1970er | 1980er | 1990er | 2000er | 2010er | 2020er |
|---|---|---|---|---|---|---|---|---|---|---|
| Momentum 12 Monate (Marktführer) | +4,0 Pp | +8,0 Pp | +7,6 Pp | +13,4 Pp | +10,6 Pp | +1,8 Pp | +10,9 Pp | +0,5 Pp | +1,7 Pp | +6,7 Pp |
| Kombination Momentum + Profitabilität | – | – | – | – | +4,3 Pp | +0,7 Pp | +5,8 Pp | +2,6 Pp | +1,5 Pp | +5,7 Pp |
| Kombination Momentum + Günstig nach Buchwert | −0,2 Pp | +8,6 Pp | +5,1 Pp | +7,9 Pp | +9,8 Pp | +4,5 Pp | +5,3 Pp | +4,6 Pp | −1,7 Pp | +7,1 Pp |
| Günstig nach Buchwert | −9,3 Pp | +8,5 Pp | +2,1 Pp | +2,2 Pp | +8,5 Pp | +6,7 Pp | −0,7 Pp | +7,6 Pp | −5,6 Pp | +5,4 Pp |
| Günstig nach Gewinn (KGV niedrig) | – | – | – | +4,2 Pp | +6,6 Pp | +0,8 Pp | +2,1 Pp | +11,5 Pp | −3,3 Pp | −2,8 Pp |
| Hohe operative Profitabilität | – | – | – | – | −2,1 Pp | −0,7 Pp | +0,3 Pp | +3,7 Pp | +1,1 Pp | +3,7 Pp |
| Kombination Momentum + Rückkäufe | – | – | – | – | +7,5 Pp | +3,4 Pp | +6,0 Pp | +2,3 Pp | +1,3 Pp | +4,0 Pp |
| Langfristige Umkehr (Verlierer der letzten 5 Jahre) | – | +12,1 Pp | −4,1 Pp | +3,0 Pp | +5,7 Pp | −4,1 Pp | +5,5 Pp | +8,7 Pp | −8,5 Pp | +4,2 Pp |
| Saubere Gewinne (niedrige Accruals) | – | – | – | – | +3,3 Pp | −2,8 Pp | −0,1 Pp | −1,4 Pp | +5,8 Pp | −3,0 Pp |
| Aktienrückkäufe (Nettoemission < 0) | – | – | – | – | +4,1 Pp | +4,7 Pp | +0,7 Pp | +3,1 Pp | +0,7 Pp | +0,4 Pp |
| Hohe Dividendenrendite | −0,9 Pp | +3,4 Pp | −0,7 Pp | −0,6 Pp | +1,6 Pp | +4,8 Pp | −8,3 Pp | +5,8 Pp | +0,7 Pp | +0,8 Pp |
| Günstig nach Cashflow | – | – | – | +7,0 Pp | +8,0 Pp | +1,8 Pp | −0,7 Pp | +10,3 Pp | −5,0 Pp | −4,7 Pp |
| Niedriges Beta | – | – | – | – | +2,4 Pp | +3,5 Pp | −5,0 Pp | +4,5 Pp | −0,6 Pp | −5,8 Pp |
| Wenig Investition (geringes Bilanzwachstum) | – | – | – | – | +7,8 Pp | −0,9 Pp | +0,2 Pp | +4,5 Pp | −1,5 Pp | +1,7 Pp |
| Kombination Profitabilität + Günstig nach Gewinn | – | – | – | – | +2,4 Pp | +0,2 Pp | +1,3 Pp | +7,8 Pp | −1,0 Pp | +0,8 Pp |
| Größte Firmen (wie S&P 500) | +0,1 Pp | −1,5 Pp | +0,1 Pp | −1,3 Pp | −1,4 Pp | +0,3 Pp | +1,2 Pp | −1,9 Pp | +0,0 Pp | +1,5 Pp |
| Niedrige Eigen-Schwankung | – | – | – | – | −1,8 Pp | +2,7 Pp | −0,4 Pp | +5,5 Pp | +0,5 Pp | −3,4 Pp |
| Niedrige Schwankung | – | – | – | – | −0,6 Pp | +2,9 Pp | −6,0 Pp | +4,7 Pp | +0,3 Pp | −7,0 Pp |
| Kleine Firmen | +5,1 Pp | +15,0 Pp | −0,8 Pp | +9,4 Pp | +3,0 Pp | −6,3 Pp | −4,7 Pp | +9,3 Pp | −5,0 Pp | −4,5 Pp |
| Kurzfristige Umkehr (Verlierer des letzten Monats) | +34,0 Pp | +10,3 Pp | +3,4 Pp | +2,5 Pp | +7,6 Pp | −1,2 Pp | −5,9 Pp | −6,1 Pp | +0,5 Pp | −5,4 Pp |

## Lesehilfe

- „Vorsprung danach“: Rendite p. a. des Merkmals minus Gesamtmarkt ab dem Jahr der ersten Veröffentlichung. Hält ein Merkmal dort, war es vermutlich kein Zufallsfund.
- „seit 2008“: derselbe Zeitraum wie Backtest 2.0; zeigt, ob das Merkmal in der Ära der Mega-Caps noch funktionierte.
- „Jahrzehnte vorn“: in wie vielen abgeschlossenen Jahrzehnten das Merkmal vor dem Markt lag. Kriterium für die Merkmals-Studie (Backtest 2.0, Stufe 2): ein Merkmal gilt als phasenfest, wenn es in mindestens zwei Dritteln der Jahrzehnte vorn lag und nach der Veröffentlichung nicht verschwand.
- Kosten: Momentum und kurzfristige Umkehr schichten monatlich viel um (realistisch 1–3 % p. a., bei kurzfristiger Umkehr mehr); Bewertung, Profitabilität, Investition, Accruals und Rückkäufe jährlich (deutlich unter 1 % p. a.).
- Portfolios über alle US-Aktien (CRSP) mit Pleiten und Delistings; „Zehntel“ heißt Hunderte Titel, wertgewichtet. Keine Einzelaktien aus der App.

