# Aktienzahl und Börsenwert – Audit JPMorgan (P0) und Vertrag market-cap-1.0.0

Stand 05.10.2026. Quelle aller Werte: SEC EDGAR companyfacts (`quant/data/sec/inspector/JPM.json`,
`quant/data/sec/consumer/CIK0000019617.json`).

## Befund

Das Produkt rechnete JPMorgan mit **4.104.933.895 Aktien** (Börsenwert ≈ 1,36 Bio. $ bei 332,38 $).
Ausstehend sind rund **2,66 Mrd** Aktien. Der verwendete Wert ist `us-gaap:CommonStockSharesIssued`:
ausgegebene Aktien **einschließlich der eigenen im Bestand** (treasury stock), kein Bestand im Umlauf.

| Periode | Wert | Konzept | Klasse | Formular | Eingereicht | Accession |
|---|---|---|---|---|---|---|
| 2024 Q1 | 2.845.164.727 | dei:EntityCommonStockSharesOutstanding | ausstehend | 10-Q | 2024-08-02 | 0000019617-24-000453 |
| 2024 Q2 | 4.104.933.895 | us-gaap:CommonStockSharesIssued | **ausgegeben** | 10-Q | 2024-08-02 | 0000019617-24-000453 |
| 2024 Q3 | 2.815.340.422 | dei:EntityCommonStockSharesOutstanding | ausstehend | 10-Q | 2024-10-30 | 0000019617-24-000611 |
| 2024 FY/Q4 | 2.797.600.000 | us-gaap:CommonStockSharesOutstanding | ausstehend | 10-K | 2026-02-13 | 0001628280-26-008131 |
| 2025 Q1 | 2.749.753.854 | dei:EntityCommonStockSharesOutstanding | ausstehend | 10-Q | 2025-08-05 | 0000019617-25-000615 |
| 2025 Q2 | 2.722.262.295 | dei:EntityCommonStockSharesOutstanding | ausstehend | 10-Q | 2025-11-04 | 0001628280-25-048859 |
| 2025 Q3 | 4.104.933.895 | us-gaap:CommonStockSharesIssued | **ausgegeben** | 10-Q | 2025-11-04 | 0001628280-25-048859 |
| 2025 FY/Q4 | 4.104.933.895 | us-gaap:CommonStockSharesIssued | **ausgegeben** | 10-Q | 2026-08-06 | 0001628280-26-054343 |
| 2026 Q1 | 2.658.186.195 | dei:EntityCommonStockSharesOutstanding | ausstehend | 10-Q | 2026-08-06 | 0001628280-26-054343 |
| **2026 Q2 (jüngster)** | **4.104.933.895** | **us-gaap:CommonStockSharesIssued** | **ausgegeben** | 10-Q | 2026-08-06 | 0001628280-26-054343 |

Zur Einordnung (gleiche Einreichungen): gewichteter Durchschnitt unverwässert 2026 Q2 2.689.900.000,
verwässert 2.694.200.000 (`WeightedAverageNumberOf…SharesOutstanding`) – ein Periodendurchschnitt,
für den Börsenwert nicht zulässig, bestätigt aber die Größenordnung 2,7 Mrd.

## Ursache

`quant/config/sec-metric-registry.json` (Mapping 1.5.0) definierte `shares_outstanding` als
Prioritätenliste je Periode: `dei:EntityCommonStockSharesOutstanding` (10) →
`us-gaap:CommonStockSharesOutstanding` (20) → **`us-gaap:CommonStockSharesIssued` (30)**.
Die Deckblattangabe (dei) gehört zum Deckblattdatum und wird der letzten abgeschlossenen Periode
zugeordnet; für die übrigen Perioden fand der Resolver nur die Bilanzangabe „ausgegeben“ und nahm sie.
Die Reihe wechselte so je Periode die Konzeptklasse – und der jüngste Wert, den der Börsenwert
benutzt, war der ausgegebene. Kein JPM-Sonderfall: jeder Emittent mit eigenen Aktien im Bestand,
der auf dem Deckblatt meldet, ist betroffen. Die Konsumschicht verwarf das Konzept je Wert, deshalb
war die Vermischung unsichtbar (`share-count-provenance-v1`: DATA_CONTRACT_GAP OPEN).

## Korrektur (keine Sonderregel)

1. **Registry Mapping 1.6.0:** `CommonStockSharesIssued` ist aus `shares_outstanding` entfernt und
   als `excludedConcepts` mit Begründung dokumentiert. Fehlt eine ausstehende Zahl, fehlt der Wert.
2. **Konsumschicht:** der jüngste Wert trägt sein Konzept (`ttm.shares_outstanding.concept`), jedes
   Bündel nennt je Kennzahl die verwendeten Konzepte (`conceptsUsed`). Damit ist die Vermischung
   universumsweit messbar (`scripts/quant/audit-share-count-provenance.mjs` →
   `SHARE_COUNT_PROVENANCE_AUDIT`).
3. **Faktorbau (market-cap-1.0.0):** nennt die Konsumschicht ein Konzept, das keine ausstehende Zahl
   ist, wird der Börsenwert zurückgehalten (`SHARE_COUNT_NOT_OUTSTANDING`) – mit Satz in der
   Oberfläche, ohne Ersatzwert. Alle Bewertungskennzahlen, die am Börsenwert hängen, bleiben dann offen.
4. **Tests:** synthetischer Emittent mit „ausstehend“ in früheren und nur „ausgegeben“ in der jüngsten
   Periode; Gegenprobe mit dem alten Rückfall zeigt die Vermischung (`test_consumer.ShareCountConceptTest`),
   Vertragstests in `quant/tests/market-cap-contract.test.mjs`.

Erwartet für JPM nach dem SEC-Lauf: jüngster ausstehender Wert 2026 Q1 = 2.658.186.195
(Börsenwert ≈ 0,88 Bio. $). Gemessen wird nach dem Lauf, nicht hier behauptet.

## Messung vor der Korrektur (Konsumschicht ohne Konzeptangabe)

5.069 Emittenten · 4.454 mit Aktienzahl · 615 ohne · 405 mit einem jüngsten Wert älter als 400 Tage
(werden bereits verworfen: `periodAligned`, STALE_INSTANT_DAYS gegen den Stichtag der Geschäftszahlen).
Konzeptherkunft: 0 von 4.454 – genau die Lücke, die Punkt 2 schließt.
