# Merkmals-Atlas: Welche Aktienmerkmale lagen vor dem Markt?

**Forschung, nicht zertifiziert.** Quelle: Kenneth R. French Data Library (Dartmouth), Daten bis 09/2026; Owner-Freigabe der Quelle 21.11.2026. Erzeuger: `scripts/research/longrun/atlas.mjs`.

Je Merkmal das wertgewichtete Zehntel aller US-Aktien auf der „guten Seite“ gegen den Gesamtmarkt, ohne Handelskosten. Sortiert nach dem Vorsprung **nach der Veröffentlichung** – das ist der ehrlichste Maßstab, denn vorher wusste niemand davon.

| Merkmal (gute Seite) | ab | Vorsprung gesamt | veröffentlicht | Vorsprung danach | seit 2008 (Merkmal / Markt) | 10-J.-Fenster vorn | max. Verlust (Markt) | nach 1 % Kosten |
|---|---|---|---|---|---|---|---|---|
| Momentum 12 Monate (Marktführer) | 01/1927 | +6,6 Pp | 1993 (Jegadeesh/Titman) | +4,1 Pp | 13,2 % / 11,3 % | 96 % | -75,8 % (-83,7 %) | +5,4 Pp |
| Günstig nach Buchwert | 07/1926 | +2,0 Pp | 1992 (Fama/French) | +2,7 Pp | 8,9 % / 11,3 % | 68 % | -91,4 % (-83,7 %) | +0,9 Pp |
| Günstig nach Gewinn (KGV niedrig) | 07/1951 | +4,0 Pp | 1977 (Basu) | +2,6 Pp | 9,6 % / 11,3 % | 85 % | -47,2 % (-50,3 %) | +2,9 Pp |
| Hohe operative Profitabilität | 07/1963 | +1,2 Pp | 2013 (Novy-Marx) | +2,5 Pp | 14,1 % / 11,3 % | 70 % | -52,2 % (-50,3 %) | +0,1 Pp |
| Langfristige Umkehr (Verlierer der letzten 5 Jahre) | 01/1931 | +3,2 Pp | 1985 (De Bondt/Thaler) | +0,9 Pp | 9,9 % / 11,3 % | 64 % | -72,3 % (-71,4 %) | +2,0 Pp |
| Saubere Gewinne (niedrige Accruals) | 07/1963 | +1,3 Pp | 1996 (Sloan) | +0,7 Pp | 12,9 % / 11,3 % | 60 % | -57,1 % (-50,3 %) | +0,2 Pp |
| Aktienrückkäufe (Nettoemission < 0) | 07/1963 | +2,3 Pp | 2008 (Pontiff/Woodgate) | +0,6 Pp | 11,9 % / 11,3 % | 93 % | -48,3 % (-50,3 %) | +1,2 Pp |
| Hohe Dividendenrendite | 07/1927 | +0,4 Pp | 1979 (Litzenberger/Ramaswamy) | +0,4 Pp | 9,7 % / 11,3 % | 60 % | -86,9 % (-83,7 %) | −0,7 Pp |
| Günstig nach Cashflow | 07/1951 | +3,5 Pp | 1994 (Lakonishok/Shleifer/Vishny) | +0,3 Pp | 7,9 % / 11,3 % | 84 % | -50,6 % (-50,3 %) | +2,3 Pp |
| Niedriges Beta | 07/1963 | −0,0 Pp | 1972 (Black/Jensen/Scholes) | +0,2 Pp | 8,9 % / 11,3 % | 62 % | -38,5 % (-50,3 %) | −1,1 Pp |
| Wenig Investition (geringes Bilanzwachstum) | 07/1963 | +2,0 Pp | 2008 (Cooper/Gulen/Schill) | +0,1 Pp | 11,4 % / 11,3 % | 71 % | -56,3 % (-50,3 %) | +0,9 Pp |
| Größte Firmen (wie S&P 500) | 07/1926 | −0,3 Pp | – | – | 11,8 % / 11,3 % | 35 % | -82,0 % (-83,7 %) | −1,4 Pp |
| Niedrige Eigen-Schwankung | 07/1963 | +0,5 Pp | 2006 (Ang/Hodrick/Xing/Zhang) | −0,3 Pp | 10,8 % / 11,3 % | 75 % | -43,7 % (-50,3 %) | −0,6 Pp |
| Niedrige Schwankung | 07/1963 | −0,9 Pp | 2006 (Ang/Hodrick/Xing/Zhang) | −1,6 Pp | 9,3 % / 11,3 % | 56 % | -39,0 % (-50,3 %) | −1,9 Pp |
| Kleine Firmen | 07/1926 | +1,7 Pp | 1981 (Banz) | −2,1 Pp | 7,1 % / 11,3 % | 63 % | -88,5 % (-83,7 %) | +0,6 Pp |
| Kurzfristige Umkehr (Verlierer des letzten Monats) | 07/1926 | +3,1 Pp | 1990 (Jegadeesh) | −4,2 Pp | 7,3 % / 11,3 % | 61 % | -82,4 % (-83,7 %) | +2,0 Pp |

## Lesehilfe

- „Vorsprung danach“: Rendite p. a. des Merkmals minus Gesamtmarkt ab dem Jahr der ersten Veröffentlichung. Hält ein Merkmal dort, war es vermutlich kein Zufallsfund.
- „seit 2008“: derselbe Zeitraum wie Backtest 2.0; zeigt, ob das Merkmal in der Ära der Mega-Caps noch funktionierte.
- Kosten: Momentum und kurzfristige Umkehr schichten monatlich viel um (realistisch 1–3 % p. a., bei kurzfristiger Umkehr mehr); Bewertung, Profitabilität, Investition, Accruals und Rückkäufe jährlich (deutlich unter 1 % p. a.).
- Portfolios über alle US-Aktien (CRSP) mit Pleiten und Delistings; „Zehntel“ heißt Hunderte Titel, wertgewichtet. Keine Einzelaktien aus der App.

