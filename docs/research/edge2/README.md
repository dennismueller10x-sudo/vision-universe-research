# Edge 2 – Quant + Technical, Risiko-Overlay, KI-Depot

**Forschung, nicht zertifiziert.** Owner-Auftrag vom 06.11.2026: eine Strategie suchen, die den S&P 500 schlägt. Nichts davon ist öffentlich; Renditezahlen nur versiegelt an den Owner.

## Teil 1 und 2 (historisch, vorregistriert)

- Protokoll: [PROTOKOLL.json](PROTOKOLL.json), SHA-256 gepinnt in `scripts/research/edge2/protocol-pin.cjs`. 12 Varianten, Holm über alle 12.
- Teil 1: Quant-Merkliste (Value Momentum, Momentum Leader, Defensive Quality), Kauf erst an einer Zone der Technical-Engine (dieselbe Erkennung wie S2), lange halten, 10 oder 20 Positionen; Kontrollen ohne Zone.
- Teil 2: Value Momentum N20 mit Risiko-Overlay (halbe Cash-Quote im Abwärtstrend, Volatilitätsziel 15 %, Kombination, absolutes Momentum).
- Kosten, delistete Titel, DQ-K5 und SPY-Gesamtrendite über den E3-Adapter (`scripts/research/edge/quant-e3.cjs`), wie E3 und Holdout H.
- Rechnung im Runner: `quant-portfolio-research.yml`, Marke `[edge2:dev]` auf `claude/**`. Code: `scripts/research/edge2/`.
- Ergebnis: `results/edge2.public.json` (nur Zählungen, Hashes, ID der Papiervariante), Kennzahlen in `results/edge2.sealed.owner.json` (Owner-Schlüssel `scripts/supertrader/validation/results-public-key.pem`) und `results/edge2.sealed.reviewer.json` (Schlüssel des Strangs, `reviewer-public.pem`).
- Grenze: DEV 2016–2026 ist nicht unberührt (E3-Prüfteil, S2). Bestätigung nur vorwärts im Papierdepot EDGE2-PAPER.
