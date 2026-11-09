# KI-Depot B – Entscheidungsprompt B v3 (nur vorwärts, ohne Backtest)

Version: B v3 (06.11.2026), ersetzt B v1 ab der zweiten Entscheidung (Ergänzung 2, `KI_ERGAENZUNG_2.json`). Begründung: Owner-Entscheidung vom 06.11.2026. Der Nachrichten-Feed des Repositorys deckt die Kandidaten kaum ab (erste Entscheidung: 0 von 50), deshalb recherchiert die entscheidende Sitzung selbst aktuelle Nachrichten. B v2 gibt es nicht. Depot A bleibt unverändert blind (Prompt v2).

---

Du bekommst ein Paket mit 25 Aktien-Kandidaten. Stelle daraus ein Depot zusammen, das bis zur nächsten Entscheidung in etwa einem Monat gehalten wird. Ziel ist eine möglichst hohe Gesamtrendite nach Kosten über viele solche Monate, besser als ein breiter Aktienindex.

Schritt 1 – Nachrichten: Suche für **jeden** Kandidaten (`context.ticker`) aktuelle Nachrichten der letzten 7 bis 30 Tage. Höchstens 3 Websuchen je Titel. Nutze nur seriöse Quellen: Unternehmensmitteilungen, SEC-Meldungen, große Wirtschaftsmedien und Nachrichtenagenturen, keine Foren, keine bezahlten Werbeseiten, keine Kursziel-Blogs. Notiere je Fund Datum, Titel, Quelle und URL. Findest du nichts Belastbares, bleibt die Liste leer.

Schritt 2 – Auswahl: Wähle **zwischen 4 und 20 Titel**, je nachdem, wie viele dich überzeugen. Jede Position bekommt ein Gewicht.

Daten je Kandidat: `group` (Branchenbuchstabe, nur im Paket gültig), `relativePath` (14 Werte im Abstand von 4 Wochen über 52 Wochen, Gesamtrendite relativ zum gleichgewichteten Markt, Startwert 100), `deciles` (Rang 1–10 im Universum: momentum12_1, volatility52, marketCap, earningsYield, fcfYield, bookToPrice, grossMargin, netMargin, fcfMargin, revenueGrowthYoy, revenueCagr3y, equityToAssets), `context` (ticker, Analysten-Konsens heute und vor etwa 3 Monaten).

Regeln:
1. Allgemeines Wissen über ein Unternehmen ist erlaubt. Wissen über Kursverläufe nach heute gibt es nicht.
2. 4 bis 20 verschiedene Labels. Gewichte zwischen 0,02 und 0,25, Summe 1. Höchstens 0,30 Gesamtgewicht je `group`.
3. Antworte nur mit JSON:

```json
{"packetId": "<ID>", "count": 7, "countReason": "ein Satz", "research": [{"label": "K03", "news": [{"date": "2026-11-02", "title": "…", "source": "…", "url": "https://…"}]}, ...], "picks": [{"label": "K07", "weight": 0.15, "reason": "ein kurzer Satz, Nachricht nennen, wenn sie zählt"}, ...]}
```

`research` enthält alle 25 Kandidaten, auch die mit leerer Liste.
