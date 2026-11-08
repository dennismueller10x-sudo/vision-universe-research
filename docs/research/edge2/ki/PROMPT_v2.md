# KI-Depot – Entscheidungsprompt v2

Version: v2 (06.11.2026). Ersetzt v1 vor der ersten Entscheidung (Ergänzung 1, `BLIND_ERGAENZUNG_1.json`). Begründung: Owner-Präzisierung vom 06.11.2026, die Positionszahl ist flexibel (4 bis 20), je nachdem, wie viele Kandidaten überzeugen. v1 bleibt unverändert im Repository und wurde nie verwendet.

---

Du bekommst ein Paket mit 50 anonymen Aktien-Kandidaten. Stelle daraus ein Depot zusammen, das bis zur nächsten Entscheidung in etwa einem Monat gehalten wird. Ziel ist eine möglichst hohe Gesamtrendite nach Kosten über viele solche Monate, besser als ein breiter Aktienindex.

Wähle **zwischen 4 und 20 Titel**, je nachdem, wie viele dich überzeugen. Lieber wenige gute als viele mittelmäßige. Jede Position bekommt ein Gewicht.

Was du über jeden Kandidaten weißt (sonst nichts):
- `group`: ein Buchstabe für die Branche. Die Zuordnung Buchstabe → Branche ist in jedem Paket neu gewürfelt und bedeutet nichts außerhalb dieses Pakets. Gleicher Buchstabe = gleiche Branche innerhalb des Pakets.
- `relativePath`: 14 Werte im Abstand von 4 Wochen über die letzten 52 Wochen. Gesamtrendite der Aktie geteilt durch die Gesamtrendite des gleichgewichteten Aktienmarkts, Startwert 100. Über 100 = besser als der Markt seit Beginn des Pfads. Der letzte Wert ist heute.
- `deciles`: Rang im gesamten Aktienuniversum zum Entscheidungszeitpunkt, 1 = niedrigster Wert, 10 = höchster, `null` = nicht verfügbar. Merkmale: momentum12_1 (Kursmomentum 12 Monate ohne letzten Monat), volatility52, marketCap, earningsYield, fcfYield, bookToPrice, grossMargin, netMargin, fcfMargin, revenueGrowthYoy, revenueCagr3y, equityToAssets.

Regeln:
1. Entscheide nur aus diesen Daten. Versuche nicht, Firma, Branche oder Datum zu erraten, und nutze kein Wissen über tatsächliche Kursverläufe.
2. 4 bis 20 verschiedene Labels. Gewichte zwischen 0,02 und 0,25, Summe 1. Höchstens 0,30 Gesamtgewicht je `group`.
3. Antworte nur mit JSON in genau dieser Form:

```json
{"packetId": "<ID aus dem Paket>", "count": 7, "countReason": "ein Satz, warum genau so viele", "picks": [{"label": "K07", "weight": 0.15, "reason": "ein kurzer Satz, nur aus den Daten"}, ...]}
```
