# Backtest 2.0 – Protokoll (Entwurf, Fassung 2 vom 21.11.2026)

**Forschung, nicht zertifiziert.** Status: **ENTWURF**. Eingefroren wird vor dem ersten Lauf (SHA-256 im Lauf-Manifest und hier).
Anlass: [BEFUND-POSITIONSGROESSE.md](BEFUND-POSITIONSGROESSE.md).

Fassung 2 (Owner 21.11.2026: „Wir müssen das machen, was funktioniert“): kein fester Depotrahmen mehr. Positionszahl, Gewichtung,
Haltedauer, Stopps und Marktfilter sind **freie Stellschrauben**, die die Suche selbst einstellt. Fassung 1 legte 10 Positionen zu
höchstens 10 % fest; das war eine Faustregel, kein Befund, und ist entfallen.

## 1. Frage

Welche Regel, gebaut aus den Methoden von Supertrader und Quant mit frei gewählter Depotführung, hätte nach Kosten mehr erzielt als ein
gewöhnlicher Index-ETF (SPY, QQQ), und **hält dieser Vorsprung auf Jahren, die die Suche nicht gesehen hat?**

## 2. Suchraum (frei)

| Stellschraube | Werte |
|---|---|
| Signalquelle | jede auf Tagesbalken rechenbare Methode aus C01–C13; jedes Quant-Profil; Referenz „Marktführer“ (relative Stärke 6 Monate, über der 200-Tage-Linie); Kombinationen aus zwei Quellen (Schnittmenge oder Vereinigung) |
| Positionen | 1, 3, 5, 8, 10, 15, 20, 30 |
| Gewichtung | gleich; nach Risiko bis zur Stopp-Marke; nach Signalstärke; Kappe je Titel 100 %, 50 %, 25 %, 15 % |
| Nachkauf | aus, wie Quelle |
| Ausstieg | Regel der Methode; nachgezogener Stopp 10 / 15 / 25 / 35 % ab Hoch; Schluss unter 50- bzw. 200-Tage-Linie; feste Haltedauer 1 Woche, 1, 3, 6, 12, 24 Monate |
| Marktfilter | keiner; SPY über SMA200; SPY über SMA50 |
| Universum | Top 500, 1.000, 3.000 nach Ø Dollarumsatz 20 Sitzungen; Kurs ≥ 5 $ oder ≥ 10 $ |

Fest bleiben nur Dinge, die keine Wahl sind, sondern Wirklichkeit: Kosten (1 bp Gebühr + 5 bp Slippage + halber Spread nach ADV20 je
Seite, `quant/engines/portfolio-construction.cjs#halfSpreadBps`), Endwerte delisteter Titel (Übernahme 100 %, unbekannt 70 %, Insolvenz 0 %),
kein Hebel, kein Blick in die Zukunft (Entscheidung zum Schluss, Ausführung zur nächsten Eröffnung), Tagesbalken-Mehrdeutigkeit in beiden
Lesarten (Urteil nur, wenn beide gleich ausfallen).

Die Suche ist ein Gitter über diese Werte, ergänzt um eine zufällige Stichprobe; die Zahl aller geprüften Kombinationen wird gezählt und
geht in die Korrektur (§4) ein.

## 3. Finden und Bestätigen (Walk-forward)

Die Suche darf alles einstellen, aber nur auf den Lernjahren. Bestätigt wird auf den folgenden Jahren, die sie nicht gesehen hat:

| Runde | Lernen | Bestätigen |
|---|---|---|
| 1 | 2008–2013 | 2014–2016 |
| 2 | 2008–2016 | 2017–2019 |
| 3 | 2008–2019 | 2020–2022 |
| 4 | 2008–2022 | 2023–Ende |

Je Runde wählt eine feste Regel die beste Kombination der Lernjahre (höchste Rendite nach Kosten über SPY bei einem maximalen Verlust,
der nicht schlechter als −50 % ist). Gezählt wird nur die aneinandergereihte Bestätigungskurve 2014–Ende: Sie zeigt, was ein Kunde mit
diesem Vorgehen tatsächlich erlebt hätte. Zusätzlich je Kombination die Ergebnisse über den Gesamtzeitraum, beschreibend.

Ehrlicher Vermerk: Alle Jahre ab 2008 wurden in früheren Studien schon geöffnet (Holdout 06.11.2026, E3, Labor). Die Unabhängigkeit kommt
aus dem Walk-forward selbst: Die Auswahl jeder Runde sieht die Bestätigungsjahre nicht.

### Stresstest 1995–2007 und Langfrist-Faktoren (Owner 21.11.2026)

- **Stresstest 1995–2007** (Dotcom-Blase und -Crash): dieselbe Suche, gekennzeichnet „nur heutige Überlebende, zu gut gerechnet“,
  weil delistete Titel erst ab 2005 im Archiv liegen. Er fließt nicht ins Urteil ein und dient nur als Ausschluss: Verliert eine
  Kombination selbst mit diesem geschönten Datensatz stark, ist das ein Warnsignal.
- **Langfrist-Faktoren 1926–heute** aus der Kenneth R. French Data Library (frei verfügbar; Owner-Freigabe der Quelle 21.11.2026):
  eigene Auswertung auf Faktor-Ebene, getrennt von dieser Suche ([../longrun/BERICHT.md](../longrun/BERICHT.md)).

## 4. Urteil

- **schlägt den Index:** Die Bestätigungskurve 2014–Ende liegt nach Kosten über SPY, mit p ≤ 0,05 nach Korrektur für die Zahl aller
  geprüften Kombinationen (Deflated Sharpe und Monte-Carlo wie E3).
- **schlägt nur in Phasen:** Vorsprung belegt nur, wenn SPY über bzw. unter seiner 200-Tage-Linie liegt.
- **nur risikobereinigt:** Sharpe höher und Verlust kleiner, Rendite nicht.
- **schlägt nicht.**

Berichtet werden: die Bestätigungskurve, die je Runde gewählte Kombination (zeigt, ob die Wahl stabil ist), die besten 20 Kombinationen des
Gesamtzeitraums mit Spannweite, und welche Stellschrauben am meisten ausmachen. Alle Ergebnisse, auch die schlechten.

## 4a. Fassung 3: zweiter Versuch mit robuster Auswahl (21.11.2026, nach Einsicht)

**Offen gekennzeichnet als zweiter Versuch, nach Einsicht in das Ergebnis von Lauf 44918416065.** Dort wählte die Regel aus §3 in drei
von vier Runden Depots mit einer bis drei Aktien (Lern-Überrendite bis +54 % p. a.), die auf den Bestätigungsjahren zusammenbrachen
(Bestätigungskurve −19,9 % p. a.); Urteil Fassung 2: schlägt nicht. Dieses Urteil bleibt stehen.

Neue Auswahlregel (Owner 21.11.2026), gerechnet auf denselben Jahreskennzahlen, im selben Lauf neben Fassung 2 berichtet:
- nur Kombinationen mit mindestens 10 Positionen und max. Verlust in den Lernjahren ≥ −50 %;
- Wert = Median der Lern-Überrendite über SPY von Kombination und ihren Nachbarn (eine geordnete Stellschraube eine Stufe verschoben:
  Positionen, Gewichtung, Universum, Ausstieg innerhalb derselben Art; Signalquelle und Filter fest); höchster Wert gewinnt.

Begründung: Eine Einstellung, deren Nachbarn ebenfalls gut sind, ist weniger wahrscheinlich ein Zufallstreffer. Urteil und Statistik wie §4;
weil die Regel nach Einsicht festgelegt wurde, gilt ein positives Ergebnis nur als Hinweis, der vorwärts bestätigt werden muss.

**Datenprüfung im selben Lauf:** Sitzungssprünge ×2 bis ×5 (unterhalb DQ-K5) je Gruppe heutige / delistete Titel und die Spalten der
delisteten Rohreihen; dazu Modus `backtest2-survivors` ohne delistete Titel als Vergleich (zu gut gerechnet, nicht für das Urteil).

## 4b. Stufe 2 Ergebnis und Stufe 3: Faktor-Depots im Walk-forward (22.11.2026, vor dem ersten Lauf festgelegt)

**Ergebnis Stufe 2** (Lauf 45004821417, 201 Monate 2010–09/2026, nach Kosten): phasenfest gegen das Universum sind nur
Momentum + Bruttogewinn je Bilanzsumme (17,0 % p. a., SPY 14,5 %), dieselbe Kombination mit Rückkäufen (16,3 %) und Rückkäufe allein
(15,2 %). Rule of 40, Bewertung, Wachstum, niedrige Schwankung, Nähe zum 52-Wochen-Hoch und kurzfristige Umkehr tragen nicht. Bei 30
Versuchen ist das ein Hinweis, kein Beweis: die Auswahl kannte alle Jahre.

**Stufe 3** prüft deshalb, ob eine Auswahl, die nur die Lernjahre kennt, SPY auf den folgenden Jahren schlägt
(`scripts/research/backtest2/faktor-wf.mjs`, Modus `merkmale-wf-smoke` / `merkmale-wf`). Festgelegt vor dem ersten Lauf:
- Raster 512 Depots: Signal (22 Merkmale, 7 Kombinationen der Stufe 2, Trend + Bruttogewinn/Bilanz, 52-Wochen-Hoch +
  Bruttogewinn/Bilanz, Näherung des Quant-Scores) × bestes Zehntel/Fünftel × Top 500/1.000 × gleich/nach Börsenwert gewichtet ×
  ohne/mit Marktfilter (SPY über 200-Tage-Linie, sonst Kasse ohne Zins). Monatlich neu, Kosten = Umschlag × Kosten je Seite.
- Runden: Lernen 2010–2013/2016/2019/2022, Bestätigen 2014–2016, 2017–2019, 2020–2022, 2023–Ende; Bestätigungsjahre verkettet.
- **Fassung A** (das Urteil): zugelassen sind Depots, die in den Lernjahren in beiden Hälften und in ≥ 60 % der Jahre vor SPY lagen und
  höchstens 50 % verloren; gewählt wird der höchste Median der Lern-Überrendite aus Depot und Nachbarn (eine Einstellung anders,
  Signal fest). Ohne Kandidat hält die Runde SPY.
- **Fassung B** (Hypothese, vor 2014 veröffentlicht: Momentum, Jegadeesh/Titman 1993; Bruttogewinn je Bilanzsumme, Novy-Marx 2013):
  Momentum + Bruttogewinn/Bilanz, bestes Fünftel, Top 1.000, gleich gewichtet, ohne Filter; dazu alle 16 Einstellungen dieses Signals.
- **Vergleich Quant:** Näherung von quant-v2.4.1 (Faktorgewichte des Vertrags, nur hier verfügbare Bausteine, ohne Revisionen).
- Urteil „schlägt SPY“ nur, wenn Fassung A auf den verketteten Bestätigungsjahren nach Kosten vor SPY liegt und der Block-Bootstrap
  p < 0,10 ergibt; sonst „nicht belegt“. Folgen für den Quant-Score nur in einem eigenen PR mit Vorher/Nachher.

**Ergebnis Stufe 3** (Lauf 45050488159, Bestätigung 2014–09/2026 verkettet, SPY 14,1 % p. a., QQQ 19,4 %, RSP 10,9 %):
- Fassung A 12,9 % p. a. (−1,1 Pp gegen SPY, p 0,44): **nicht belegt.** Aus vier bis dreizehn Lernjahren findet die Auswahl keine
  stabile Regel (Runde 2 ohne Kandidat, Runde 3 niedrige Schwankung).
- Fassung B 16,4 % p. a. (+2,3 Pp, max. Verlust −25,6 % gegen −23,9 %, 7 von 13 Jahren vorn, p 0,15): **Hinweis, nicht belegt.**
  Ohne Marktfilter liegen 7 der 8 Einstellungen vor SPY (+2,3 bis +5,5 Pp; bestes Zehntel der Top 500 p 0,07); **mit** Marktfilter
  liegen alle 8 dahinter (−2,8 bis −6,5 Pp).
- Quant-Näherung 12,7 % p. a. (−1,3 Pp): Bewertung, Wachstum und niedrige Schwankung ziehen den Score auf diesen Jahren nach unten;
  Bruttogewinn je Bilanzsumme trägt heute nur 3 % des Gesamtgewichts.
- Folgerung (eigene PRs): Quant-Variante „Momentum + Profitabilität“ gegen quant-v2.4.1 auf den PIT-Dokumenten vergleichen;
  Supertrader-Marktfilter und Profitabilitätsfilter prüfen; Kurssignale allein (200-Tage-Linie, 52-Wochen-Hoch, Umkehr) schlagen
  SPY nicht.

## 5. Ausführung und Veröffentlichung

- Umsetzung: `scripts/research/backtest2/` (Markt, Signale, Depotführung, Suche, Lauf mit Workern). Workflow `research.yml`, Teil
  `portfolio`, Modus `backtest2-smoke` (400 Titel, kleines Gitter, nur Funktionsprobe) und `backtest2` (voller Lauf).
- **Stufe 1** (dieser Stand): Signalquellen nur aus Kursen: Marktführer (relative Stärke), Trendvorlage nach Minervini in
  veröffentlichter Lesart, Ausbruch 20 und 55 Tage (Turtle-Einstieg auf Schlussbasis), Trendvorlage mit 55-Tage-Ausbruch.
  **Stufe 2** (Owner 22.11.2026, „den Spieß umdrehen“; eigener PR, eingefrorener Datenstand, eine Woche): zuerst eine
  **Merkmals-Studie** auf unseren Daten (Point-in-Time, delistete Titel, liquide Top 1.000): je Merkmal monatlich das beste Fünftel
  gegen das Universum und gegen SPY, getrennt 2008–2016 und 2017–Ende, mit Kosten. Merkmale: die 11 Bestandteile der Quant-Profile
  und neu Rule of 40 (Umsatzwachstum + FCF-Marge), Bruttogewinn je Bilanzsumme, Eigenkapitalrendite, Bilanzwachstum, Accruals,
  Nettoemission/Rückkäufe, Abstand zum 52-Wochen-Hoch, Lage zur 200-Tage-Linie, kurzfristige Umkehr, „S&P-ähnlich“ (groß und
  profitabel). Vorrang nach dem Merkmals-Atlas 1963–heute ([../longrun/MERKMALE.md](../longrun/MERKMALE.md)). Danach die
  Merkmale, die in beiden Hälften halten, als Signalquellen im Gitter dieser Suche, dazu die zertifizierten Supertrader-Module.
- Vorher: Gegentests der Depotführung auf künstlichen Kursen mit bekanntem Ergebnis (`scripts/research/backtest2/backtest2.test.mjs`:
  Kauf zur Folgeeröffnung, Kosten, Stopp-Kurs, Insolvenz, Filter, Positionszahl, Universum, Walk-forward sieht nur Lernjahre).
- Läufe über GitHub Actions auf dem eingefrorenen Snapshot (R2); Ergebnisse zuerst versiegelt an den Owner.
- Öffentliche Renditezahlen nur nach Owner-Freigabe und Abstimmung mit der Rechtsberatung; Rechte an abgeleiteten Kennzahlen (Tiingo) vorher klären.
