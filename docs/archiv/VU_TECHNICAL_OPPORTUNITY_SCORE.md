# VU Technical Opportunity Score

**Modul:** `quant/engines/technical/technical-score.js` · Version `tos-1.0.0` · Parameter: `technical-v1.json → opportunityScore`

## Interpretation

**0–100 = methodologischer Setup-Rang.** Keine Erfolgswahrscheinlichkeit, keine
Renditeerwartung. Der Score trägt `interpretation: "methodology_rank"`, `isProbability: false`
und einen Disclaimer; UI und Tests (`TX1`, Verify-Skript) verhindern Formulierungen wie
„74 % Chance“.

## Gewichte (Maximalbeiträge)

| Familie | max | Quelle |
|---|---:|---|
| TREND_STRUCTURE | 30 | Mittel aus Trend-Value und Struktur-Score, in Szenariorichtung |
| MOMENTUM | 20 | 0.6 × absolutes Momentum + 0.4 × Relative Stärke (fehlt RS: nur absolut, Notiz) |
| VOLUME | 10 | Up-Volume-Anteil / Breakout-Volumen (fehlt Volumen: 40 % des Maximums, Notiz) |
| VOLATILITY | 10 | Kompression positiv, Expansion/High-Regime negativ (Qualität, nicht Richtung) |
| SETUP | 20 | Setup Quality bei COMPLETE; 60 % davon bei COMPLETE_LOW_RR; 20 % bei Invalidation ohne Setup; 0 sonst |
| PROJECTION_AUXILIARY | **10** | Fibonacci + Elliott, Familienwert auf ±0.3 gekappt |

`score = Σ Beiträge × (1 − conflictPenalty)`. Bänder: ≥80 „Starkes Setup“, ≥60 „Konstruktiv“,
≥40 „Neutral“, sonst „Schwach“.

## Garantien (Tests TOS1, CF1)

* Beiträge überschreiten nie ihr Maximum; Summe × Penalty = Score.
* Ein schwacher Trend-/Strukturzustand mit voller Projektion bleibt < 50.
* Fib/Elliott-Boost verändert die Confluence um < 5 Punkte.

## Cross-Sectional

Der Scanner (`scanner.js`) ergänzt `scorePercentile` und `rsPercentile` innerhalb des
gescannten Universums (`universeId`, `universeVersion`). „84/100“ bleibt ein Rang; erst ein
separates, kalibriertes Evidence-Modell dürfte Aussagen wie „Target-1-vor-Invalidation-Rate“
erzeugen (siehe `VU_TECHNICAL_SNAPSHOT_SPEC.md`, Mindeststichprobe).

## Quant-Integration

Kein Megascore. `VU Quant Score` = Qualität („was besitze ich“), Technical Opportunity Score =
Timing/Struktur („wann“). Kombinierte Suche (`Quant > 80 UND Technical > 75 UND Struktur
bullisch`) ist als strukturierter Filter im Scanner vorbereitet; die Screener-Anbindung
verwendet dieselben Feldnamen (`technicalScore`, `riskReward`, `trend`, `structure`, …).
