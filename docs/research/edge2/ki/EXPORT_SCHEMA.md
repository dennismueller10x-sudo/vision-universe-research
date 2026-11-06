# Öffentlicher Export `quant/data/product/ki-depots-v1.json` (Schema `ki-depots-1.0.0`)

Rechenmodell, kein echtes Geld. Erzeuger: `scripts/research/edge2/ki-export.cjs` (werktags `ki-depots-daily.yml` und nach jeder Entscheidung im Wochenlauf). Keine Backtest-Zahlen. Owner-Entscheidung 06.11.2026 (Plan §11).

```text
{
  schemaVersion: "ki-depots-1.0.0",
  label: "Rechenmodell, kein echtes Geld",
  notice: { key: "modelPortfolio", label, text, links[] },      // Pflichthinweis aus assets/legal-notices.json, so anzeigen
  research: "Forschung, nicht zertifiziert. Keine Backtest-Zahlen.",
  liveStart: "2026-11-06",
  asOf: "YYYY-MM-DD",                                           // letzter veröffentlichter Schluss
  contentSha256,
  depots: [{
    id: "EDGE2-KI-A-PAPER" | "EDGE2-KI-B-PAPER", name, method,   // method: ein Absatz in Alltagssprache
    prompt: "v2" | "B v3", lastDecision: "YYYY-MM-DD"|null, decisions, invalidDecisions,
    count, countReason,                                          // Zahl der Titel und Begründung der Zahl (letzte Entscheidung mit Einstieg)
    positions: [{ ticker, securityId, targetWeight, currentWeight, since, entryPrice, lastPrice, lastDate,
                  changeSinceEntry,                              // Anteil, z. B. 0.0312 = +3,12 %
                  reason,                                        // ein Satz der KI
                  news: [{ date, title, source, url }] }],       // nur Depot B, höchstens 3
    cashWeight,
    pending: null | { decisionDate, entry, count, countReason,   // Entscheidung, deren Einstiegskurs (Schluss nächster Handelstag) noch fehlt
                      positions: [{ ticker, securityId, targetWeight, reason, news[] }] },
    performance: { start, index: [[date, value]],               // Index 100 am ersten Einstiegstag, nach pauschalen Kosten
                   changeSinceStart, costModel },
    protocol: [{ date, action: "REIN"|"RAUS"|"OHNE_KURS", ticker, weight, price }],
    ledger: { file, entries, lastHash }                          // Nachweis: hash-verkettetes Ledger im Repository
  }]
}
```

Wortwahl nach `docs/legal/WORTWAHL.md`: „Bestand laut Methode“, „aufgenommen am“, nicht „Kaufempfehlung“.
