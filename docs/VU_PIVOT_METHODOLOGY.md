# VU Pivot Methodology

**Modul:** `quant/engines/technical/pivot-engine.js` · Version `pivot-1.0.0` · Repainting-Policy `CONFIRMS_WITH_DELAY` · Parameter: `technical-v1.json → pivots`

## 1. Methode

Kausale, volatilitätsadaptive **ZigZag-State-Machine**, je Skala einmal über die Serie:

```
D_t = max( P_t × minPct , kAtr × ATR_t )
```

* Im Zustand UP wird das höchste High als **DEVELOPING** Swing High mitgeführt. Erst wenn
  `extremeHigh − low_t ≥ D_t`, wird es **CONFIRMED**: `pivotTime` = Zeitstempel des Extrems,
  `confirmedAt` = die Reversal-Bar. Danach Zustand DOWN, spiegelbildlich.
* Vor Verfügbarkeit des ATR (Warmup) gilt nur die Prozentschwelle — ebenfalls kausal.
* Der erste Pivot einer Serie ist das Extrem, von dem aus die Gegenbewegung die Schwelle zuerst
  überschreitet.

## 2. Skalen

| scaleId | kAtr | minPct | Rolle |
|---|---|---|---|
| scale-1 | 1.5 | 2 % | fein (S/R-Clustering, Hierarchie) |
| scale-2 | 3.0 | 4 % | **Setup-Skala** (Struktur, Szenarien, Fib-Anker) |
| scale-3 | 5.0 | 8 % | Kontext (Elliott-Primary-Degree, Fib-Anker) |
| scale-4 | 8.0 | 15 % | major |

Die Multiplikatoren sind Sensitivitäts-Designparameter, nicht per Backtest optimiert. Pivots
tragen keine Elliott-Namen; Elliott mappt Degrees auf Skalen (`elliott-v1.json → degreeMapping`).

## 3. Pivot-Objekt

`pivotId, side (HIGH|LOW), scaleId, pivotIndex, pivotTime, pivotPrice, confirmedIndex,
confirmedAt, status (CONFIRMED|DEVELOPING), amplitude, amplitudePct, amplitudeATR, durationBars,
confirmationLagBars, prominenceScore (= amplitudeATR / kAtr), sourceBarsHash`.

Das Developing-Extrem je Skala wird separat ausgegeben (`scales[id].developing`, inkl.
`reversalNeeded`). `INVALIDATED` ist im Statusmodell reserviert (Datenrevision), tritt bei der
ZigZag-Maschine nicht auf: ein bestätigter Pivot ist endgültig.

## 4. Hierarchie

Ein Extrem, das auf mehreren Skalen bestätigt ist (identischer `pivotIndex`), erhält
`significance = Anzahl Skalen` und `maxScaleId`. Persistenz über Skalen ist die einzige
Major/Minor-Definition — keine visuelle Einschätzung.

## 5. No-Look-Ahead — der wichtigste Test

`technical-pivots.test.mjs` P2: Für alle synthetischen Fälle (Uptrend, Downtrend, Range, Gap,
High-/Low-Vol, Fake Reversal, Confirmed Reversal) ist der Pivot-Satz aus `bars[0:T]`
bit-identisch mit dem Pivot-Satz aus `bars[0:T+k]` gefiltert auf `confirmedIndex ≤ T`.
P1 prüft zusätzlich, dass zwischen `pivotTime` und `confirmedAt` kein höheres High (tieferes
Low) existiert und `confirmedAt > pivotTime` gilt.

## 6. Verbotene Verfahren

Centered Rolling Extrema, symmetrische Prominence, rückwirkend „perfekte“ ZigZag-Endpunkte.
Diese dürfen ausschließlich als Offline-/Labeling-Werkzeuge existieren und sind in V1 nicht
implementiert.

## 7. Backtest-Regel

Ein Backtest oder Walk-Forward kennt einen Pivot erst ab `confirmedAt`. `confirmedAsOf(result,
scaleId, cutoffIndex)` liefert genau diese Sicht; der Orchestrator schneidet die Serie ohnehin vor
jeder Berechnung (`analyzeAsOf`).
