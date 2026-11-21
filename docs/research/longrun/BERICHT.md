# Langfrist-Auswertung 1926–heute (Faktor-Ebene)

**Forschung, nicht zertifiziert.** Quelle: Kenneth R. French Data Library (Dartmouth), frei verfügbar, Daten bis 09/2026; Owner-Freigabe der Quelle 21.11.2026. Erzeuger: `scripts/research/longrun/french.mjs`.

Frage: Lagen die Prinzipien hinter unseren Methoden über fast 100 Jahre vor dem Gesamtmarkt, wie verlässlich, und blieb der Vorsprung nach der Veröffentlichung? Es sind Portfolios der Wissenschaft, keine Einzelaktien aus der App und **ohne Handelskosten** (Kosten unten als Empfindlichkeit).

## Gesamtzeitraum

| Strategie | ab | CAGR | Markt | Vorsprung | max. Verlust | Sharpe | 10-Jahres-Fenster vorn | längste Durststrecke |
|---|---|---|---|---|---|---|---|---|
| Gesamtmarkt (alle US-Aktien) | 07/1926 | 10,4 % | 10,4 % | – | -83,7 % | 0,45 | – | – |
| Momentum oberstes Zehntel | 01/1927 | 16,9 % | 10,3 % | +6,6 Pp | -75,8 % | 0,67 | 96 % | 12 Jahre (06/2008–07/2020) |
| Momentum große Firmen | 01/1927 | 13,6 % | 10,3 % | +3,2 Pp | -77,2 % | 0,60 | 91 % | 18 Jahre (06/2008–09/2026) |
| Value oberstes Zehntel | 07/1926 | 12,4 % | 10,4 % | +2,0 Pp | -91,4 % | 0,42 | 68 % | 39 Jahre (05/1927–01/1966) |
| Qualität oberstes Zehntel (ab 1963) | 07/1963 | 12,0 % | 10,9 % | +1,2 Pp | -52,2 % | 0,52 | 70 % | 32 Jahre (12/1969–07/2001) |
| Gesamtmarkt mit 10-Monats-Filter | 05/1927 | 9,8 % | 10,3 % | −0,5 Pp | -42,9 % | 0,55 | 37 % | 94 Jahre (06/1932–09/2026) |
| Momentum große Firmen mit Filter | 05/1927 | 12,4 % | 10,3 % | +2,1 Pp | -44,2 % | 0,65 | 66 % | 42 Jahre (06/1932–06/1974) |

Der 10-Monats-Filter war in 73 % der Monate investiert, sonst in Geldmarkt (T-Bills).

„10-Jahres-Fenster vorn“: Anteil aller rollierenden 10-Jahres-Zeiträume, in denen die Strategie mehr erzielte als der Markt. „Längste Durststrecke“: längste Zeit vom höchsten Vorsprung bis zum nächsten neuen Höchststand des Vorsprungs (läuft sie bis heute, ist der alte Höchststand noch nicht wieder erreicht). Beim Filter stammt der Höchststand aus dem Ausweichen vor dem Crash 1929–1932; seitdem hat der Filter in Summe keinen weiteren Vorsprung aufgebaut, aber Verluste begrenzt.

## Nach der Veröffentlichung

Ein Vorsprung, der nach der Veröffentlichung in der Wissenschaft verschwindet, war vermutlich Zufall oder wurde wegarbitriert.

| Strategie | veröffentlicht | vorher: Strategie / Markt | nachher: Strategie / Markt | nachher max. Verlust (Markt) |
|---|---|---|---|---|
| Momentum oberstes Zehntel | 1993 | 17,9 % / 10,0 % | 15,0 % / 10,9 % | -51,3 % (-50,3 %) |
| Momentum große Firmen | 1993 | 14,1 % / 10,0 % | 12,5 % / 10,9 % | -48,0 % (-50,3 %) |
| Value oberstes Zehntel | 1992 | 11,8 % / 10,1 % | 13,6 % / 10,9 % | -69,8 % (-50,3 %) |
| Qualität oberstes Zehntel (ab 1963) | 2013 | 10,6 % / 9,8 % | 17,3 % / 14,8 % | -19,5 % (-24,8 %) |
| Momentum große Firmen mit Filter | 1993 | 12,7 % / 10,0 % | 11,9 % / 10,9 % | -18,5 % (-50,3 %) |

## Je Jahrzehnt (CAGR Strategie / Markt)

| Strategie | 1930er | 1940er | 1950er | 1960er | 1970er | 1980er | 1990er | 2000er | 2010er | 2020er |
|---|---|---|---|---|---|---|---|---|---|---|
| Momentum oberstes Zehntel | 3,8 % / -0,3 % | 17,5 % / 9,5 % | 25,9 % / 18,3 % | 21,7 % / 8,3 % | 16,7 % / 6,1 % | 18,7 % / 16,9 % | 28,9 % / 18,0 % | 0,2 % / -0,4 % | 15,3 % / 13,6 % | 21,6 % / 15,0 % |
| Momentum große Firmen | 2,7 % / -0,3 % | 13,0 % / 9,5 % | 23,2 % / 18,3 % | 14,1 % / 8,3 % | 10,3 % / 6,1 % | 18,5 % / 16,9 % | 23,1 % / 18,0 % | 0,4 % / -0,4 % | 14,1 % / 13,6 % | 15,1 % / 15,0 % |
| Value oberstes Zehntel | -9,5 % / -0,3 % | 18,0 % / 9,5 % | 20,4 % / 18,3 % | 10,4 % / 8,3 % | 14,6 % / 6,1 % | 23,6 % / 16,9 % | 17,3 % / 18,0 % | 7,2 % / -0,4 % | 8,0 % / 13,6 % | 20,3 % / 15,0 % |
| Qualität oberstes Zehntel (ab 1963) | – | – | – | – | 4,0 % / 6,1 % | 16,1 % / 16,9 % | 18,3 % / 18,0 % | 3,4 % / -0,4 % | 14,7 % / 13,6 % | 18,7 % / 15,0 % |
| Gesamtmarkt mit 10-Monats-Filter | 2,7 % / -0,3 % | 6,8 % / 9,5 % | 16,1 % / 18,3 % | 7,1 % / 8,3 % | 8,8 % / 6,1 % | 14,4 % / 16,9 % | 13,3 % / 18,0 % | 7,6 % / -0,4 % | 8,2 % / 13,6 % | 11,2 % / 15,0 % |
| Momentum große Firmen mit Filter | 5,7 % / -0,3 % | 11,0 % / 9,5 % | 19,9 % / 18,3 % | 9,8 % / 8,3 % | 11,3 % / 6,1 % | 15,2 % / 16,9 % | 18,6 % / 18,0 % | 8,6 % / -0,4 % | 9,5 % / 13,6 % | 9,4 % / 15,0 % |

## Empfindlichkeit für Handelskosten (Vorsprung zum Markt nach Kostenabzug)

| Strategie | 1 % p. a. | 2 % p. a. | 3 % p. a. |
|---|---|---|---|
| Momentum oberstes Zehntel | +5,4 Pp | +4,3 Pp | +3,2 Pp |
| Momentum große Firmen | +2,1 Pp | +1,0 Pp | −0,1 Pp |
| Value oberstes Zehntel | +0,9 Pp | −0,2 Pp | −1,3 Pp |
| Qualität oberstes Zehntel (ab 1963) | +0,1 Pp | −1,0 Pp | −2,1 Pp |
| Gesamtmarkt mit 10-Monats-Filter | −1,6 Pp | −2,6 Pp | −3,7 Pp |
| Momentum große Firmen mit Filter | +1,0 Pp | −0,1 Pp | −1,1 Pp |

Größenordnung der Kosten: Momentum schichtet monatlich einen großen Teil des Portfolios um (bei großen Firmen grob 1–2 % p. a. Kosten, im obersten Zehntel aller Firmen mehr); Value und Qualität werden jährlich umgeschichtet (deutlich unter 1 % p. a.).

## Grenzen

- Portfolios über alle US-Aktien (CRSP: NYSE, AMEX, NASDAQ) mit Pleiten und Delistings, aber ohne Steuern und Handelskosten; „oberstes Zehntel“ heißt Hunderte Titel, wertgewichtet.
- Rückschau: Diese Faktoren sind genau deshalb bekannt, weil sie in der Vergangenheit funktioniert haben. Das Kapitel „Nach der Veröffentlichung“ ist der ehrlichste Teil.
- Kein Ersatz für Backtest 2.0: Dort werden unsere eigenen Regeln mit Kosten und Walk-forward geprüft (`docs/research/backtest2/PROTOKOLL.md`).
