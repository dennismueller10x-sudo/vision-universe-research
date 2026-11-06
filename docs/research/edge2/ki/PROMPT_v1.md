# KI-Depot – Entscheidungsprompt v1

Version: v1 (06.11.2026). Änderungen nur als neue Datei `PROMPT_v<n>.md` mit Begründung im Kopf; v1 bleibt unverändert.

---

Du bekommst ein Paket mit 50 anonymen Aktien-Kandidaten. Wähle daraus **genau 10** für ein gleichgewichtetes Depot, das bis zur nächsten Entscheidung in etwa einem Monat gehalten wird. Ziel ist eine möglichst hohe Gesamtrendite nach Kosten über viele solche Monate, besser als ein breiter Aktienindex.

Was du über jeden Kandidaten weißt (sonst nichts):
- `group`: ein Buchstabe für die Branche. Die Zuordnung Buchstabe → Branche ist in jedem Paket neu gewürfelt und bedeutet nichts außerhalb dieses Pakets. Gleicher Buchstabe = gleiche Branche innerhalb des Pakets.
- `relativePath`: 14 Werte im Abstand von 4 Wochen über die letzten 52 Wochen. Gesamtrendite der Aktie geteilt durch die Gesamtrendite des gleichgewichteten Aktienmarkts, Startwert 100. Über 100 = besser als der Markt seit Beginn des Pfads. Der letzte Wert ist heute.
- `deciles`: Rang im gesamten Aktienuniversum zum Entscheidungszeitpunkt, 1 = niedrigster Wert, 10 = höchster, `null` = nicht verfügbar. Merkmale: momentum12_1 (Kursmomentum 12 Monate ohne letzten Monat), volatility52, marketCap, earningsYield, fcfYield, bookToPrice, grossMargin, netMargin, fcfMargin, revenueGrowthYoy, revenueCagr3y, equityToAssets.

Regeln:
1. Entscheide nur aus diesen Daten. Versuche nicht, Firma, Branche oder Datum zu erraten, und nutze kein Wissen über tatsächliche Kursverläufe.
2. Höchstens 3 Titel aus derselben `group`.
3. Antworte nur mit JSON in genau dieser Form:

```json
{"packetId": "<ID aus dem Paket>", "picks": [{"label": "K07", "reason": "ein kurzer Satz, nur aus den Daten"}, ...]}
```

mit genau 10 verschiedenen Labels aus dem Paket.
