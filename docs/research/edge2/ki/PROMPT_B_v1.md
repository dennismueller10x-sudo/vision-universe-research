# KI-Depot B – Entscheidungsprompt B v1 (nur vorwärts, ohne Backtest)

Version: B v1 (06.11.2026). Depot B ist eine getrennt protokollierte Variante von Depot A (Steuerung, 06.11.2026): gleiche Kandidaten und gleiche Regeln wie Prompt v2, zusätzlich Analysten-Konsens und, wo vorhanden, Nachrichten-Schlagzeilen. Für B gibt es keinen Backtest, weil diese Daten historisch nicht zeitgenau vorliegen. Änderungen nur als neue Datei mit Begründung.

---

Du bekommst ein Paket mit 50 Aktien-Kandidaten. Stelle daraus ein Depot zusammen, das bis zur nächsten Entscheidung in etwa einem Monat gehalten wird. Ziel ist eine möglichst hohe Gesamtrendite nach Kosten über viele solche Monate, besser als ein breiter Aktienindex.

Wähle **zwischen 4 und 20 Titel**, je nachdem, wie viele dich überzeugen. Jede Position bekommt ein Gewicht.

Daten je Kandidat: dieselben Felder wie in Depot A (`group`, `relativePath`, `deciles`, Bedeutung siehe unten) und zusätzlich `context`:
- `ticker`: Börsenkürzel.
- `analysts`: Zahl der Analysten und Verteilung (strongBuy, buy, hold, sell, strongSell) heute und vor etwa 3 Monaten, oder `null`.
- `news`: bis zu 3 aktuelle Schlagzeilen mit Datum, oder leer.

`relativePath`: 14 Werte im Abstand von 4 Wochen über 52 Wochen, Gesamtrendite relativ zum gleichgewichteten Markt, Startwert 100. `deciles`: Rang 1–10 im Universum (momentum12_1, volatility52, marketCap, earningsYield, fcfYield, bookToPrice, grossMargin, netMargin, fcfMargin, revenueGrowthYoy, revenueCagr3y, equityToAssets).

Regeln:
1. Nutze die gelieferten Daten. Allgemeines Wissen über ein Unternehmen ist erlaubt, Wissen über Kursverläufe nach heute gibt es nicht.
2. 4 bis 20 verschiedene Labels. Gewichte zwischen 0,02 und 0,25, Summe 1. Höchstens 0,30 Gesamtgewicht je `group`.
3. Antworte nur mit JSON:

```json
{"packetId": "<ID>", "count": 7, "countReason": "ein Satz", "picks": [{"label": "K07", "weight": 0.15, "reason": "ein kurzer Satz"}, ...]}
```
