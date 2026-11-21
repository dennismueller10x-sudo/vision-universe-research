# Backtest 2.0 – Befund: Positionsgröße der Supertrader-Läufe (21.11.2026)

**Forschung, nicht zertifiziert.** Vorprüfung zum [Protokoll Backtest 2.0](PROTOKOLL.md). Skript: `scripts/research/backtest2/sizing-check.mjs`.

## Anlass

Die Supertrader-Top-5 liegen in der Edge-Studie (`docs/research/edge/BERICHT.md`) im Prüfteil 2020–2026 bei −12 % bis −52 % pro Jahr,
mit maximalen Verlusten bis −99 % und 46 % Schwankung (Turtle S1), während der S&P 500 rund +15 % pro Jahr machte. Strang B fand
keinen Rechenfehler (kein Hebel, keine Split-Fehler). Offen war, ob die Zahlen die Methoden messen oder unsere Übertragung auf ein Aktiendepot.

## Gegentest

Die unveränderte Turtle-Engine (`scripts/supertrader/source-faithful/methods/turtle.mjs`, `sf-turtle-1.3.0`) läuft auf 60 künstlichen
Aktien mit bekanntem Kursprozess (geometrische Brownsche Bewegung, Kurs 50 $, Umsatz 100 Mio. $ pro Tag), 1.400 Handelstage, 10 Zufallsstarts.
Median, in Klammern die Spannweite über die Startwerte:

| Kursverlauf | Aktie Ø p. a. | Turtle S1 p. a. | Turtle S2 p. a. | Ø Positionen | Unit in % des Depots |
|---|---|---|---|---|---|
| starker Aufwärtstrend | +44,2 % | +33,0 % (+12,8 … +52,5) | +24,9 % (+2,1 … +63,2) | 1,5–1,6 | 37–39 % |
| moderater Trend | +7,5 % | −6,4 % (−19,5 … +14,3) | −2,8 % (−15,1 … +12,8) | 1,8–1,9 | 31–32 % |
| kein Trend | −4,6 % | −14,0 % (−21,5 … −3,6) | −8,2 % (−20,6 … +3,3) | 1,8–1,9 | 31 % |
| Abwärtstrend | −21,9 % | −28,3 % (−36,5 … −14,9) | −25,3 % (−33,8 … −0,8) | 1,9–2,2 | 27 % |

Kassenabgleich in allen Läufen bestanden.

## Befund

1. **Die Rechnung stimmt in der Richtung:** Gewinn im Trend, Verlust ohne Trend und im Abwärtstrend. Kein Hinweis auf einen Rechenfehler.
2. **Das Depot ist extrem konzentriert.** Die Turtle-Einheit (1 % Risiko je 1 N) ist für Futures mit Hebel gedacht. Auf Aktien ohne Hebel
   ist eine Einheit 27–39 % des Depots groß; das Geld reicht für knapp zwei Positionen, Tausende ausgelöste Einstiege werden mangels Cash
   abgelehnt. Weil die Engine die stärksten Ausbrecher zuerst nimmt, sind diese ein bis zwei Positionen die schwankungsreichsten Titel.
3. **Das Ergebnis ist deshalb zu einem großen Teil Zufall:** Bei identischem Kursprozess liegt S1 im moderaten Trend zwischen −19,5 % und +14,3 % pro Jahr.
4. Gegenprobe mit einem Viertel des Risikos je Einheit (S2, 0,25 %): rund 4,5 Positionen, Spannweite im moderaten Trend −9,0 … +5,9 %
   statt −15,1 … +12,8 %, Median +3,0 % statt −2,8 %. Ohne Trend bleibt der Verlust (Trendfolge braucht Trends; künstliche Zufallspfade
   haben keinen Momentum-Effekt). **Der Test prüft die Mechanik, nicht den Vorteil einer Methode.**
5. Dasselbe Muster ist bei anderen Methoden bereits belegt: Kapital gesättigt, belegte Trades abgelehnt, Auswahl nach Hash-Reihenfolge
   (Minervini C06/C07 FID-1, Kullamägi C08 FID-3; `docs/SUPERTRADER_9_HANDOVER.md`). Bei Darvas (C03) bucht die pessimistische Lesart
   einen Balken, der Einstieg (1 Cent über dem Box-Hoch) und Stopp (1 Cent darunter) erreicht, als Verlust; Trefferquote 7,3 %.
6. Das Forschungsuniversum (Kurs ≥ 5 $, Ø Umsatz 20 Tage ≥ 1 Mio. $; `RESEARCH_UNIVERSE` in `common/series.mjs`) lässt Kleinstwerte zu;
   die schlechtesten Einzeltrades der Edge-Studie sind Zusammenbrüche solcher Titel.

## Folge

Die bisherigen Supertrader-Backtests messen vor allem die Übertragung (Positionsgröße, Kapitalgrenze, Universum, Tagesbalken-Lesart),
nicht die Methoden. Sie sind als Urteil über C01–C13 nicht belastbar. Backtest 2.0 rechnet alle Methoden neu und lässt die
Depotführung (Positionszahl, Gewichtung, Ausstieg) frei suchen, mit Bestätigung auf ungesehenen Jahren ([PROTOKOLL.md](PROTOKOLL.md)).
Die bisherigen Ergebnisse bleiben unverändert stehen.
