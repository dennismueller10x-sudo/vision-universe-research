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

## 5. Ausführung und Veröffentlichung

- Umsetzung: `scripts/research/backtest2/` (Markt, Signale, Depotführung, Suche, Lauf mit Workern). Workflow `research.yml`, Teil
  `portfolio`, Modus `backtest2-smoke` (400 Titel, kleines Gitter, nur Funktionsprobe) und `backtest2` (voller Lauf).
- **Stufe 1** (dieser Stand): Signalquellen nur aus Kursen: Marktführer (relative Stärke), Trendvorlage nach Minervini in
  veröffentlichter Lesart, Ausbruch 20 und 55 Tage (Turtle-Einstieg auf Schlussbasis), Trendvorlage mit 55-Tage-Ausbruch.
  **Stufe 2** (eigener PR, vor einem Urteil über Supertrader oder Quant): die zertifizierten Supertrader-Module C01–C13 und die
  Quant-Profile mit Fundamentaldaten als weitere Quellen im selben Gitter.
- Vorher: Gegentests der Depotführung auf künstlichen Kursen mit bekanntem Ergebnis (`scripts/research/backtest2/backtest2.test.mjs`:
  Kauf zur Folgeeröffnung, Kosten, Stopp-Kurs, Insolvenz, Filter, Positionszahl, Universum, Walk-forward sieht nur Lernjahre).
- Läufe über GitHub Actions auf dem eingefrorenen Snapshot (R2); Ergebnisse zuerst versiegelt an den Owner.
- Öffentliche Renditezahlen nur nach Owner-Freigabe und Abstimmung mit der Rechtsberatung; Rechte an abgeleiteten Kennzahlen (Tiingo) vorher klären.
