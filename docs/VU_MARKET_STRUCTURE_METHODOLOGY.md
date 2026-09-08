# VU Market Structure Methodology

**Modul:** `quant/engines/technical/market-structure.js` · Version `structure-1.0.0` · Policy `CONFIRMS_WITH_DELAY` · Parameter: `technical-v1.json → structure`

## 1. Grundlage

Bestätigte Pivots der Setup-Skala (`scale-2`), Toleranzband `ε_t = toleranceAtr × ATR_t` (0.25
ATR). Ein Swing High ist **HH** nur bei `H_i > H_{i−1} + ε`, **LH** bei `H_i < H_{i−1} − ε`, sonst
**EQH**; Tiefs analog (HL / LL / EQL).

## 2. Zustände

`regimeOf(lastHighLabel, lastLowLabel)`:

| Labels | confirmedRegime |
|---|---|
| HH + HL | BULLISH |
| LH + LL | BEARISH |
| (EQH oder LH) + (EQL oder HL) | RANGE |
| gemischt | MIXED |
| unvollständig | UNDETERMINED |

Der **effektive** `regime` berücksichtigt zusätzlich close-basierte Brüche (siehe 3): das
letzte bestätigte Strukturtief per Close zu unterschreiten *ist* der Strukturwechsel — nicht
erst der nächste bestätigte Pivot. `trendBias` merkt den letzten Trendzustand (Pivot oder
Bruch), `confirmedRegime` bleibt rein pivot-basiert.

## 3. Events (alle kausal, an Bar t nur mit Pivots `confirmedIndex ≤ t` und `close_t`)

| Event | Definition |
|---|---|
| `BOS_BULLISH` / `BOS_BEARISH` | Close > letztes bestätigtes Strukturhoch + 0.1 ATR bei Trendbias BULLISH (bzw. < Strukturtief − Buffer bei BEARISH). Einmal je Level. |
| `STRUCTURE_FAILURE_BULLISH` | Close unter dem letzten bestätigten Strukturtief bei zuvor bullischem Bias (formaler „Structure Change“; kein CHoCH-Narrativ). |
| `STRUCTURE_FAILURE_BEARISH` | spiegelbildlich |
| `BREAKOUT_UP` / `BREAKOUT_DOWN` | Close-Bruch ohne vorherigen Trendbias (aus Range/Mixed) |
| `STRUCTURE_CHANGE_BULLISH/BEARISH` | pivot-bestätigter Wechsel des Trendzustands (HH+HL nach LH+LL bzw. umgekehrt) |
| `STRUCTURE_CONTINUATION` | neuer HH/HL im bullischen bzw. LH/LL im bearischen Zustand |
| `RANGE_START` / `RANGE_END` | Hochs und Tiefs der letzten 4 Pivots jeweils innerhalb 1.5 ATR und Close innerhalb der Range ± ATR; endet bei Ausbruch |
| `COMPRESSION` / `EXPANSION` | Amplituden (ATR) der letzten 3 Swings streng fallend / steigend |
| `LEVEL_SWEEP_HIGH/LOW` | Docht über Level + 0.1 ATR, Close wieder darunter — messbare Rejection, einmal je Level, ohne Liquiditäts-Narration |

## 4. Output

`state`: `regime, confirmedRegime, trendBias, lastHighLabel, lastLowLabel, lastStructuralHigh
{price, pivotId, broken}, lastStructuralLow, range {top, bottom, since}, swingVolatility,
developingPivot, structureScore (−1..1)`; `swings[]` (gelabelte Pivots inkl. `confirmedAt`),
`events[]`, `timeline[]` (Regimewechsel mit `via: pivot | close-break`).

`structureScore` speist die Confluence-Familie STRUCTURE: ±0.6 Basis je Trendzustand, ±0.2 je
BOS/Breakout der letzten 60 Bars, ±0.4 je Structure Failure.

## 5. Tests

`technical-pivots.test.mjs` S1–S4: Uptrend → HH/HL/BULLISH mit BOS, Downtrend spiegelbildlich,
Range erkannt, Confirmed Reversal → Structure Failure/Change **nach** dem Extrem, kein Event vor
Bestätigung seines Pivots, Compression → Expansion in der richtigen Reihenfolge, Split erzeugt
keinen bearischen Bruch auf SPLIT_ADJUSTED (Kontrollfall: auf RAW schon).
