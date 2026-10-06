# VU Scenario Engine

**Module:** `scenario-engine.js` (`scenario-1.0.0`), `trade-setup.js` (`setup-1.0.0`), `confluence.js` (`confluence-1.0.0`) · Parameter: `technical-v1.json → scenario, confluence`

## 1. Output ist kein Signal

Kein BUY/SELL. Ein Szenario ist ein strukturiertes Objekt:

`scenarioId, instrumentId, analysisTime, dataCutoff, dataVersion, timeframe, setupScaleId, type
(PRIMARY|ALTERNATIVE|BEAR), direction, template, status, currentStructure, referenceSwing,
entryZone?, entryStatus, invalidation, tradeStop, targetZones[], confidence
(methodology_confidence), supportingEvidence[], conflictingEvidence[], whatMustHappen,
expiryRule, engineVersions, displayStep, projectionHorizonBars`.

`entryZone` ist optional: ein bullischer Chart darf `NO ACTIONABLE ENTRY` liefern
(`entryStatus: NONE`).

## 2. Richtung

`deriveDirection`: Trend ±2, Struktur-Regime ±2, Momentum ±1 (|value| > 0.3), Relative Stärke
±0.5. Bias ≥ 2 → BULLISH, ≤ −2 → BEARISH, sonst NEUTRAL bzw. RANGE (Struktur-Range). Kein
Indikator zählt einzeln — nur Familien.

## 3. Primary (gerichtet)

**Referenz-Swing** = letzter bestätigter Swing der Setup-Skala in Trendrichtung (bzw. der
laufende Swing zum Developing-Extrem).

**Entry Zone** = Retracement-Band 38.2–61.8 % des Referenz-Swings ∩ die am stärksten
überlappende Support-Zone (S/R-Engine); Breite auf 0.5–2.0 ATR normiert; Quellen dokumentiert
(`RETRACEMENT`, `SUPPORT_ZONE`, `VOLATILITY`). Template `PULLBACK_TO_SUPPORT`. Fand in den letzten
5 Bars ein close-basierter Strukturbruch nahe dem Kurs statt, gilt `BREAKOUT_RETEST`
(Zone um das gebrochene Level, −0.25/+0.75 ATR). Nie eine Zone aus einem einzelnen RSI-Wert.

**Invalidation** = letztes bestätigtes, ungebrochenes Strukturtief − 0.5 ATR Buffer (sonst
Swing-Ursprung − Buffer); immer unterhalb der Entry Zone; Basis `STRUCTURE`, `rule` als Text,
`refPivotId`. `tradeStop` wird getrennt gespeichert (V1: identisch; Count-Invalidation ≠ Trade
Stop bleibt als Feldtrennung vorbereitet).

**Target Zones** (immer Zonen, nie Einzelwerte, jede mit `sources[]`):
T1 = nächste Widerstandszone ≥ 1 ATR über der Entry Zone, sonst Measured Move 1.0 × Swing ± 0.5
ATR; T2 = übernächste Zone oder Measured Move 1.618 ± 0.75 ATR; T2 > T1 erzwungen.
Überlappende Fib-Cluster und Elliott-Projektionszonen werden als zusätzliche Quellen vermerkt.

**Status**: `ACTIVE` (Close in der Zone), `AWAITING_TRIGGER` (Kurs bis 4 ATR über der Zone bzw.
`EXTENDED`), `WEAKENED` (unter der Zone), `INVALIDATED` (Close ≤ Invalidation).

**Evidence**: alle Engine-Evidences mit Polarität in Szenariorichtung → supporting, Gegenrichtung
→ conflicting; Struktur-Events der letzten vier als Evidence.

## 4. Alternative und Bear

* **ALTERNATIVE `DEEPER_CORRECTION`**: Entry 61.8–78.6 % Retracement, Invalidation am
  Swing-Ursprung; gleiche Targets.
* **BEAR `STRUCTURE_FAILURE`**: der strukturelle Zustand *nach* Bruch der Primary-Invalidation.
  `trigger` = Close unter Invalidation, keine Entry Zone (Analyse, kein Setup), Zielzonen = nächste
  Unterstützungen bzw. Measured Move nach unten; eigene Invalidation = Rückeroberung des
  Referenz-Extrems.

Bearische Primärszenarien sind vollständig gespiegelt. Range-Zustände liefern `RANGE`
(Primary, ohne Entry, mit den Bruchbedingungen), `RANGE_BREAKOUT_UP` (bedingt) und
`RANGE_BREAKDOWN` (bedingt).

## 5. Trade Setup (Quality Gate)

Setup nur mit Entry + Invalidation + Target; sonst `INCOMPLETE` mit `missing[]`.

```
Risk_low  = EntryLow − Stop          Risk_high = EntryHigh − Stop
RR_low    = (TargetLow − EntryHigh) / Risk_high
RR_high   = (TargetHigh − EntryLow) / Risk_low
```

`potentialUpside` (T1 low … T2 high), `riskToInvalidation` (absolut, %, ATR), `setupQuality`
0–100 aus RR (45 %), Stop-Distanz-Sanity 0.75–6 ATR (20 %), Entry-Nähe (25 %), Liquidität (10 %).
`COMPLETE_LOW_RR`, wenn RR_low < 1.5. Keine Positionsgröße, keine Ausführung.

## 6. Confluence ohne Double Counting

Familien: STRUCTURE 0.25, TREND 0.25, MOMENTUM 0.15, RELATIVE_STRENGTH 0.10, VOLUME 0.10,
PRICE_ZONES 0.10, PROJECTION_AUXILIARY 0.05 (Wert auf ±0.3 gekappt). VOLATILITY wirkt nur auf
Setup-Qualität. Signed Score = gewichtetes Mittel verfügbarer Familien; Conflict Penalty =
0.15 × 2 × Minderheitsanteil der Vorzeichen. `confluenceScore = (50 + 50 × aligned) × (1 −
penalty)`; das ist die **Methodology Confidence** des Szenarios — ein Method-Fit, keine
Wahrscheinlichkeit.

## 7. Display Precision Policy

`priceStep(atr) = 10^floor(log10(ATR/4))`, mindestens 0.01. Zonen und Level werden auf diesen
Schritt gerundet — keine Cent-Präzision bei Dollar-Rauschen.
