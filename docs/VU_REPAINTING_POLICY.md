# VU Repainting Policy

Jede Engine deklariert ihre Policy im Output (`repaintingPolicy`); das Bundle sammelt sie unter
`repaintingPolicies`. Die UI unterscheidet je Objekt `CONFIRMED · DEVELOPING · PROJECTED ·
INVALIDATED · EXPIRED`.

| Engine | Policy | Bedeutung |
|---|---|---|
| Canonical Bars, Timeframe | HISTORICAL_ONLY / NON_REPAINTING | Daten; letzte aggregierte Bar DEVELOPING |
| Feature Store | NON_REPAINTING | Feature an i nutzt nur Bars ≤ i |
| Pivot Engine | **CONFIRMS_WITH_DELAY** | Extrem DEVELOPING bis Bestätigung; CONFIRMED danach endgültig |
| Market Structure | CONFIRMS_WITH_DELAY | Labels/Events entstehen mit Pivot-Bestätigung bzw. Close-Bruch |
| Trend / Momentum / Volatility / Volume / RS | NON_REPAINTING | Zustand je Bar aus vergangenen Bars |
| Support/Resistance | **CAN_REVISE** | Zonen wachsen mit neuen Touches; in einem Snapshot eingefroren |
| Fibonacci | CONFIRMS_WITH_DELAY | Anker = bestätigte Pivots |
| Scenario / Setup / Score | DEVELOPING | gilt je Snapshot; neuer Pivot → Neubewertung |
| Elliott | CONFIRMS_WITH_DELAY | CONFIRMED-Wellen stabil (kausaler Parser); Trailing DEVELOPING; Projektion PROJECTED |
| Annotations | trägt Status je Objekt | rechts des NOW_DIVIDER nur PROJECTED |

## Regeln

1. **DEVELOPING darf sich bewegen.** Developing-Extrem, laufende Welle, Entry-/Target-Zonen des
   aktuellen Szenarios.
2. **CONFIRMED wird innerhalb derselben `dataVersion` nie still umgeschrieben.** Pivots: durch
   die Maschine garantiert. Elliott: der Historical-Parser entscheidet lokal (nur Legs des
   jeweiligen Musters), daher ändert ein neuer Pivot keine früheren Labels
   (`technical-elliott.test.mjs` E3).
3. **INVALIDATED bleibt historisch sichtbar** (Snapshot-/Audit-Modus).
4. **EXPIRED**: ein Setup hat seine Zeit-/Strukturbedingung verloren (`expiryRule`).
5. **REVISED_DATA**: korrigiert ein Provider Bars, entsteht eine neue `dataVersion` und ein neuer
   Snapshot mit `supersedesSnapshotId`; der alte Snapshot bleibt.
6. Eine historische Performance-Darstellung verwendet nie den heute rekonstruierten ZigZag —
   nur den Snapshot des damaligen Datenstands (Projected vs Actual, `evidence-walkforward.json`).

## Ehrliches Repainting in der UI

Hover/Detail zeigt zu jedem Pivot und jeder Welle `pivotTime` **und** `confirmedAt`
(Annotation `meta.confirmedAt`). „Swing High am 12.03., bestätigt am 15.03.“ ist ein
Vertrauensmerkmal, kein Makel.
