# Mission X: Setup-Tabellen

Automatisch erzeugt (`render-m10.mjs`) aus `quant/data/technical-intelligence/elliott-setups/`. Woche, Überlebende; DEV = Titelhälfte 0/2 (Entwicklung), VAL = Titelhälfte 1/2 (Validierung nach Freeze). Beides sind verbrauchte Daten.

## Einstufung (mechanisch, `decide-setups.mjs`)

| Setup | Variante | n DEV | n VAL | Einstufung | Begründung |
|---|---|---|---|---|---|
| S1_EARLY_WAVE3 | ENGINE_PRIMARY | 2 | 2 | **INSUFFICIENT_EVIDENCE** | n VAL = 2 < 100 |
| S1_EARLY_WAVE3 | PURE | 0 | 0 | **INSUFFICIENT_EVIDENCE** | n VAL = 0 < 100 |
| S1_EARLY_WAVE3 | PURE_RS | 0 | 0 | **INSUFFICIENT_EVIDENCE** | n VAL = 0 < 100 |
| S1_EARLY_WAVE3 | CONFIRMED | 0 | 0 | **INSUFFICIENT_EVIDENCE** | n VAL = 0 < 100 |
| S1_EARLY_WAVE3 | PURE_HD | 0 | 0 | **INSUFFICIENT_EVIDENCE** | n VAL = 0 < 100 |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | 58 | 51 | **INSUFFICIENT_EVIDENCE** | n VAL = 51 < 100 |
| S2_WAVE4_TO_5 | PURE | 0 | 0 | **INSUFFICIENT_EVIDENCE** | n VAL = 0 < 100 |
| S2_WAVE4_TO_5 | PURE_RS | 0 | 0 | **INSUFFICIENT_EVIDENCE** | n VAL = 0 < 100 |
| S2_WAVE4_TO_5 | CONFIRMED | 0 | 0 | **INSUFFICIENT_EVIDENCE** | n VAL = 0 < 100 |
| S2_WAVE4_TO_5 | PURE_HD | 0 | 0 | **INSUFFICIENT_EVIDENCE** | n VAL = 0 < 100 |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | 13777 | 15010 | **REJECT** | Lift gegen dieselbe Geometrie (D) mit Obergrenze < 0 auf DEV und VAL |
| S3_CORRECTION_COMPLETE | PURE | 172 | 182 | **STRUCTURAL_ONLY** | tritt auf, Invalidation und Projektion definiert, aber weder LEVEL 1 noch LEVEL 2 |
| S3_CORRECTION_COMPLETE | PURE_RS | 39 | 40 | **INSUFFICIENT_EVIDENCE** | n VAL = 40 < 100 |
| S3_CORRECTION_COMPLETE | CONFIRMED | 24 | 24 | **INSUFFICIENT_EVIDENCE** | n VAL = 24 < 100 |
| S3_CORRECTION_COMPLETE | PURE_HD | 0 | 0 | **INSUFFICIENT_EVIDENCE** | n VAL = 0 < 100 |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | 1811 | 2081 | **STRUCTURAL_ONLY** | tritt auf, Invalidation und Projektion definiert, aber weder LEVEL 1 noch LEVEL 2 |
| S4_TRIANGLE_THRUST | PURE | 15 | 17 | **INSUFFICIENT_EVIDENCE** | n VAL = 17 < 100 |
| S4_TRIANGLE_THRUST | PURE_RS | 2 | 4 | **INSUFFICIENT_EVIDENCE** | n VAL = 4 < 100 |
| S4_TRIANGLE_THRUST | CONFIRMED | 1 | 3 | **INSUFFICIENT_EVIDENCE** | n VAL = 3 < 100 |
| S4_TRIANGLE_THRUST | PURE_HD | 0 | 0 | **INSUFFICIENT_EVIDENCE** | n VAL = 0 < 100 |

## VAL: kurzer Horizont (26 Wochen), Ziel 1 vor Invalidation

Aufgelöste Ereignisse 17236; Erkennungspunkte 188236. Status: S3_CORRECTION_COMPLETE|QUALIFIED 15394, S4_TRIANGLE_THRUST|NO_PROJECTION_BEYOND_PRICE 1715, S3_CORRECTION_COMPLETE|NO_PROJECTION_BEYOND_PRICE 3841, S4_TRIANGLE_THRUST|QUALIFIED 2135, OUTCOME_CENSORED 291, S2_WAVE4_TO_5|QUALIFIED 53, ANOMALY_PAST_JUMP 57, S1_EARLY_WAVE3|QUALIFIED 2.

| Setup | Variante | Richtung | n | Treffer [95 %] | Kontrolle D | Lift D | Lift Trend | Lift Trend+RS | Lift gleiche Aktie (C) | Ziel / Inv. (ATR) | CRV | Payoff | E[R] | Invalidiert zuerst | Umdeutung | Bestätigung | Abdeckung |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1_EARLY_WAVE3 | ENGINE_PRIMARY | all | 2 | 50.0 % | 20.0 % | +30.0 | +20.0 | +20.0 | +33.3 | 6.09 / 1.37 | 15.58 | 0.47 | -1.32 | 50.0 % | 50.0 % | 50.0 % | 0.00 % |
| S1_EARLY_WAVE3 | ENGINE_PRIMARY | up | 2 | 50.0 % | 20.0 % | +30.0 | +20.0 | +20.0 | +33.3 | 6.09 / 1.37 | 15.58 | 0.47 | -1.32 | 50.0 % | 50.0 % | 50.0 % | 0.00 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | all | 51 | 35.3 % [20.6; 50.0] | 39.2 % | -3.9 [-17.4; +9.6] | -2.1 | -7.6 [-21.9; +6.6] | -1.3 | 4.05 / 3.12 | 1.45 | 1.20 | -0.26 [-0.69; 0.18] | 49.0 % | 52.9 % | 41.2 % | 0.03 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | up | 34 | 38.2 % [20.2; 56.3] | 39.4 % | -1.2 [-17.2; +14.8] | -0.5 | -6.5 [-24.6; +11.7] | +3.9 | 3.99 / 2.95 | 1.67 | 0.99 | -0.34 [-0.95; 0.28] | 52.9 % | 52.9 % | 41.2 % | 0.02 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | down | 17 | 29.4 % [8.7; 52.9] | 38.8 % | -9.4 [-33.3; +18.7] | -5.2 | -10.6 [-35.7; +14.5] | -11.8 | 4.14 / 3.19 | 1.29 | 1.92 | -0.09 [-0.66; 0.49] | 41.2 % | 52.9 % | 41.2 % | 0.01 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | all | 15010 | 35.1 % [33.2; 36.9] | 37.2 % | -2.2 [-3.0; -1.3] | -2.3 | -2.2 [-3.1; -1.3] | -5.7 | 4.49 / 3.53 | 1.13 | 1.24 | -0.13 [-0.16; -0.10] | 35.5 % | 40.0 % | 40.4 % | 7.97 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | up | 8349 | 38.7 % [35.6; 41.8] | 41.1 % | -2.4 [-3.4; -1.4] | -2.3 | -2.1 [-3.2; -1.0] | -5.5 | 4.53 / 3.67 | 1.13 | 1.47 | -0.02 [-0.11; 0.07] | 31.8 % | 38.5 % | 43.3 % | 4.44 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | down | 6661 | 30.6 % [27.1; 34.1] | 32.5 % | -1.9 [-2.9; -0.9] | -2.2 | -2.2 [-3.1; -1.0] | -5.8 | 4.45 / 3.35 | 1.12 | 1.05 | -0.26 [-0.35; -0.16] | 40.1 % | 42.0 % | 36.9 % | 3.54 % |
| S3_CORRECTION_COMPLETE | PURE | all | 182 | 36.8 % [30.4; 43.7] | 36.1 % | +0.7 [-6.0; +7.0] | +1.7 | +0.5 [-5.6; +6.7] | -2.2 | 3.84 / 5.21 | 0.75 | 0.91 | -0.15 [-0.31; -0.00] | 28.0 % | 24.2 % | 29.6 % | 0.10 % |
| S3_CORRECTION_COMPLETE | PURE | up | 80 | 36.3 % [24.5; 48.0] | 36.0 % | +0.3 [-8.7; +9.2] | -3.6 | -5.0 [-13.1; +3.0] | -5.4 | 4.74 / 5.29 | 0.94 | 1.55 | -0.03 [-0.24; 0.18] | 23.8 % | 23.8 % | 28.8 % | 0.04 % |
| S3_CORRECTION_COMPLETE | PURE | down | 102 | 37.3 % [27.5; 47.1] | 36.3 % | +1.0 [-7.6; +9.6] | +5.9 | +4.9 [-4.0; +13.8] | +0.3 | 3.57 / 5.03 | 0.57 | 0.62 | -0.25 [-0.47; -0.02] | 31.4 % | 24.5 % | 30.3 % | 0.05 % |
| S3_CORRECTION_COMPLETE | PURE_RS | all | 40 | 50.0 % [33.3; 66.7] | 43.5 % | +6.5 [-10.5; +23.5] | +9.7 | +13.5 [-1.8; +28.8] | +12.5 | 3.79 / 10.13 | 0.44 | 1.50 | 0.06 [-0.17; 0.30] | 12.5 % | 25.0 % | 44.4 % | 0.02 % |
| S3_CORRECTION_COMPLETE | PURE_RS | up | 17 | 41.2 % [17.6; 64.7] | 34.1 % | +7.1 [-15.6; +29.7] | +2.6 | +1.2 [-20.3; +22.7] | +7.8 | 7.73 / 7.61 | 1.01 | 3.55 | 0.16 [-0.30; 0.61] | 17.6 % | 23.5 % | 37.5 % | 0.01 % |
| S3_CORRECTION_COMPLETE | PURE_RS | down | 23 | 56.5 % [35.0; 78.0] | 50.4 % | +6.1 [-16.3; +28.5] | +14.9 | +22.4 [+2.4; +42.3] | +15.9 | 3.75 / 11.52 | 0.26 | 0.74 | -0.01 [-0.18; 0.17] | 8.7 % | 26.1 % | 54.5 % | 0.01 % |
| S3_CORRECTION_COMPLETE | CONFIRMED | all | 24 | 58.3 % [37.5; 79.2] | 45.0 % | +13.3 [-4.2; +30.9] | +12.6 | +21.3 [+3.1; +39.5] | +13.9 | 2.82 / 13.22 | 0.27 | 1.29 | 0.07 [-0.14; 0.27] | 8.3 % | 29.2 % | 53.3 % | 0.01 % |
| S3_CORRECTION_COMPLETE | CONFIRMED | up | 8 | 37.5 % | 27.5 % | +10.0 | -12.5 | +4.2 | +0.0 | 6.47 / 12.01 | 0.88 | 1.62 | -0.00 | 25.0 % | 37.5 % | 42.9 % | 0.00 % |
| S3_CORRECTION_COMPLETE | CONFIRMED | down | 16 | 68.8 % [45.6; 91.9] | 53.8 % | +15.0 [-5.3; +38.7] | +25.2 | +30.2 [+8.5; +51.8] | +20.8 | 2.82 / 13.82 | 0.26 | 1.40 | 0.11 [-0.01; 0.22] | 0.0 % | 25.0 % | 62.5 % | 0.01 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | all | 2081 | 25.4 % [23.0; 27.8] | 24.0 % | +1.5 [-0.4; +3.3] | -0.1 | -0.7 [-2.8; +1.5] | -2.3 | 8.64 / 3.31 | 2.41 | 3.04 | 0.01 [-0.07; 0.09] | 39.5 % | 46.5 % | 51.8 % | 1.11 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | up | 1220 | 28.3 % [24.9; 31.6] | 26.7 % | +1.6 [-1.0; +4.1] | -0.7 | +0.2 [-2.5; +2.9] | -2.1 | 8.88 / 3.39 | 2.46 | 3.81 | 0.11 [-0.04; 0.25] | 38.9 % | 44.8 % | 51.4 % | 0.65 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | down | 861 | 21.4 % [16.8; 25.9] | 20.1 % | +1.3 [-1.6; +4.2] | +0.8 | -1.5 [-5.0; +2.0] | -2.5 | 8.39 / 3.15 | 2.31 | 2.17 | -0.13 [-0.28; 0.02] | 40.2 % | 48.8 % | 52.3 % | 0.46 % |
| S4_TRIANGLE_THRUST | PURE | all | 17 | 5.9 % [-6.0; 17.7] | 18.8 % | -12.9 [-23.8; -2.1] | -6.5 | -7.5 [-23.2; +8.1] | -10.4 | 17.06 / 4.86 | 2.57 | 1.97 | -0.33 [-0.91; 0.24] | 47.1 % | 35.3 % | 57.1 % | 0.01 % |
| S4_TRIANGLE_THRUST | PURE | up | 8 | 0.0 % | 2.5 % | -2.5 | -5.1 | -6.1 | -4.2 | 19.15 / 4.28 | 5.99 | – | -0.20 | 62.5 % | 25.0 % | 66.7 % | 0.00 % |
| S4_TRIANGLE_THRUST | PURE | down | 9 | 11.1 % | 33.3 % | -22.2 | -7.9 | -9.5 | -16.9 | 8.56 / 10.77 | 0.79 | 1.31 | -0.45 | 33.3 % | 44.4 % | 0.0 % | 0.00 % |
| S4_TRIANGLE_THRUST | PURE_RS | all | 4 | 25.0 % | 30.0 % | -5.0 | +5.0 | +6.3 | -8.3 | 9.03 / 11.17 | 0.81 | 3.31 | 0.02 | 25.0 % | 50.0 % | 0.0 % | 0.00 % |
| S4_TRIANGLE_THRUST | PURE_RS | up | 2 | 0.0 % | 0.0 % | +0.0 | +0.0 | -12.5 | -16.7 | 13.28 / 7.09 | 3.68 | – | -0.37 | 50.0 % | 50.0 % | 0.0 % | 0.00 % |
| S4_TRIANGLE_THRUST | PURE_RS | down | 2 | 50.0 % | 60.0 % | -10.0 | +10.0 | +25.0 | +0.0 | 5.06 / 12.16 | 0.45 | – | 0.40 | 0.0 % | 50.0 % | – | 0.00 % |
| S4_TRIANGLE_THRUST | CONFIRMED | all | 3 | 33.3 % | 20.0 % | +13.3 | +26.7 | +15.2 | +11.1 | 9.50 / 10.77 | 0.82 | 2.17 | 0.02 | 33.3 % | 33.3 % | 0.0 % | 0.00 % |
| S4_TRIANGLE_THRUST | CONFIRMED | up | 2 | 0.0 % | 0.0 % | +0.0 | +0.0 | -12.5 | -16.7 | 13.28 / 7.09 | 3.68 | – | -0.37 | 50.0 % | 50.0 % | 0.0 % | 0.00 % |
| S4_TRIANGLE_THRUST | CONFIRMED | down | 1 | 100.0 % | 60.0 % | +40.0 | +80.0 | +66.7 | +66.7 | 8.56 / 10.77 | 0.79 | – | 0.79 | 0.0 % | 0.0 % | – | 0.00 % |

## VAL: lange Horizonte (nur Aufwärts-Setups)

| Setup | Variante | Horizont | n | Median | Mittel (4× gedeckelt) | Überschuss gg. Datum [95 %] | gg. Trend×RS [95 %] | 2× / 3× / 5× | 2× gg. Datum [95 %] | 2× gg. Trend×RS | MFE / MAE (Median) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | 6M | 33 | -3.0 % | 19.0 % | +13.2 [-12.4; +38.8] | +11.9 [-13.7; +37.5] | 12.1 % / 6.1 % / 0.0 % | 2.58 [-0.16; 5.32] | 2.16 | 24.1 % / -18.1 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | 12M | 30 | -1.6 % | 21.7 % | +11.1 [-12.4; +39.0] | +8.7 [-15.0; +36.6] | 23.3 % / 10.0 % / 3.3 % | 2.46 [0.87; 4.05] | 2.01 | 28.7 % / -32.3 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | 24M | 28 | 0.6 % | 35.4 % | +18.8 [-22.5; +60.1] | +16.5 [-25.3; +58.4] | 25.0 % / 21.4 % / 10.7 % | 1.43 [0.35; 2.42] | 1.22 | 62.9 % / -50.2 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | 36M | 26 | 10.2 % | 51.8 % | +13.6 [-61.1; +88.3] | +10.6 [-62.6; +83.9] | 30.8 % / 23.1 % / 15.4 % | 1.12 [0.51; 1.73] | 1.00 | 69.6 % / -51.5 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | 6M | 8220 | 2.1 % | 4.6 % | -2.0 [-3.1; -0.8] | -2.3 [-3.5; -1.2] | 1.9 % / 0.3 % / 0.1 % | 0.49 [0.40; 0.58] | 0.46 | 13.0 % / -10.4 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | 12M | 8013 | 4.8 % | 9.6 % | -2.7 [-4.8; -0.6] | -3.1 [-5.1; -1.0] | 5.6 % / 1.2 % / 0.2 % | 0.62 [0.55; 0.70] | 0.60 | 20.6 % / -15.1 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | 24M | 7614 | 10.9 % | 20.8 % | -2.6 [-5.1; -0.1] | -2.9 [-5.3; -0.5] | 14.8 % / 3.9 % / 0.9 % | 0.80 [0.74; 0.87] | 0.78 | 34.2 % / -21.1 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | 36M | 7218 | 16.7 % | 31.1 % | -2.7 [-5.8; +0.5] | -2.9 [-6.0; +0.2] | 23.8 % / 7.3 % / 2.0 % | 0.87 [0.82; 0.93] | 0.86 | 48.0 % / -25.1 % |
| S3_CORRECTION_COMPLETE | PURE | 6M | 77 | 1.3 % | 4.8 % | +0.4 [-6.0; +6.8] | +0.0 [-5.9; +6.0] | 1.3 % / 1.3 % / 1.3 % | 0.45 [-0.42; 1.32] | 0.42 | 11.4 % / -9.4 % |
| S3_CORRECTION_COMPLETE | PURE | 12M | 77 | 4.3 % | 6.0 % | -4.3 [-13.0; +4.3] | -4.9 [-13.0; +3.9] | 2.6 % / 1.3 % / 1.3 % | 0.36 [-0.15; 0.87] | 0.34 | 16.7 % / -11.7 % |
| S3_CORRECTION_COMPLETE | PURE | 24M | 74 | 12.9 % | 18.6 % | -4.9 [-19.2; +9.4] | -5.0 [-19.1; +9.1] | 10.8 % / 2.7 % / 1.4 % | 0.64 [0.26; 1.10] | 0.62 | 35.0 % / -16.6 % |
| S3_CORRECTION_COMPLETE | PURE | 36M | 74 | 13.5 % | 20.5 % | -13.9 [-29.1; +1.4] | -14.4 [-29.6; +0.8] | 21.6 % / 5.4 % / 1.4 % | 0.82 [0.46; 1.22] | 0.80 | 42.6 % / -20.6 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | 6M | 1204 | 3.1 % | 5.5 % | -0.2 [-2.2; +1.8] | -0.6 [-2.6; +1.5] | 1.7 % / 0.3 % / 0.2 % | 0.45 [0.25; 0.64] | 0.43 | 13.6 % / -10.2 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | 12M | 1161 | 6.9 % | 12.0 % | -0.1 [-2.9; +2.4] | -0.6 [-3.3; +1.8] | 5.3 % / 1.0 % / 0.4 % | 0.61 [0.44; 0.79] | 0.59 | 21.8 % / -13.7 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | 24M | 1081 | 14.0 % | 23.5 % | -0.9 [-4.7; +2.9] | -1.4 [-5.2; +2.4] | 15.1 % / 4.0 % / 0.9 % | 0.82 [0.70; 0.94] | 0.79 | 38.3 % / -19.6 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | 36M | 997 | 20.3 % | 35.8 % | +1.9 [-3.6; +7.4] | +1.4 [-3.9; +6.6] | 25.7 % / 8.2 % / 2.2 % | 0.94 [0.83; 1.05] | 0.92 | 51.1 % / -23.6 % |

## DEV: kurzer Horizont (26 Wochen), Ziel 1 vor Invalidation

Aufgelöste Ereignisse 15738; Erkennungspunkte 193826. Status: S3_CORRECTION_COMPLETE|NO_PROJECTION_BEYOND_PRICE 3956, S4_TRIANGLE_THRUST|QUALIFIED 2053, EXCLUDED_PERBAR_CHAIN_SYMBOL 1559, S3_CORRECTION_COMPLETE|QUALIFIED 15531, NONE 389, OUTCOME_CENSORED 255, S4_TRIANGLE_THRUST|NO_PROJECTION_BEYOND_PRICE 1703, S2_WAVE4_TO_5|QUALIFIED 63, ANOMALY_PAST_JUMP 97, S2_WAVE4_TO_5|NO_PROJECTION_BEYOND_PRICE 2, S1_EARLY_WAVE3|QUALIFIED 2, S1_EARLY_WAVE3|NO_PROJECTION_BEYOND_PRICE 1.

| Setup | Variante | Richtung | n | Treffer [95 %] | Kontrolle D | Lift D | Lift Trend | Lift Trend+RS | Lift gleiche Aktie (C) | Ziel / Inv. (ATR) | CRV | Payoff | E[R] | Invalidiert zuerst | Umdeutung | Bestätigung | Abdeckung |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1_EARLY_WAVE3 | ENGINE_PRIMARY | all | 2 | 100.0 % | 60.0 % | +40.0 | +40.0 | +0.0 | +0.0 | 0.60 / 4.89 | 0.12 | – | 0.12 | 0.0 % | 0.0 % | 100.0 % | 0.00 % |
| S1_EARLY_WAVE3 | ENGINE_PRIMARY | up | 2 | 100.0 % | 60.0 % | +40.0 | +40.0 | +0.0 | +0.0 | 0.60 / 4.89 | 0.12 | – | 0.12 | 0.0 % | 0.0 % | 100.0 % | 0.00 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | all | 58 | 41.4 % [29.6; 53.2] | 40.3 % | +1.0 [-10.3; +12.4] | +7.6 | +5.5 [-5.5; +16.6] | +6.3 | 4.14 / 5.51 | 0.85 | 1.98 | 0.18 [-0.26; 0.66] | 32.8 % | 63.8 % | 43.1 % | 0.03 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | up | 32 | 56.3 % [39.0; 74.2] | 47.5 % | +8.8 [-9.4; +25.6] | +14.2 | +14.8 [-4.2; +31.4] | +17.7 | 4.37 / 5.05 | 0.89 | 1.79 | 0.49 [-0.15; 1.13] | 28.1 % | 62.5 % | 53.1 % | 0.02 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | down | 26 | 23.1 % [7.7; 42.6] | 31.5 % | -8.5 [-26.0; +9.1] | -0.5 | -5.9 [-20.9; +9.1] | -7.7 | 3.98 / 5.71 | 0.76 | 2.19 | -0.19 [-0.71; 0.47] | 38.5 % | 65.4 % | 30.8 % | 0.01 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | all | 13777 | 36.0 % [34.0; 37.5] | 36.9 % | -1.0 [-1.8; -0.2] | -1.1 | -1.0 [-1.9; -0.1] | -4.7 | 4.49 / 3.53 | 1.13 | 1.28 | -0.11 [-0.14; -0.07] | 35.0 % | 39.5 % | 41.0 % | 7.11 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | up | 7522 | 38.8 % [35.9; 41.6] | 41.0 % | -2.2 [-3.3; -1.0] | -2.0 | -1.6 [-2.7; -0.4] | -5.2 | 4.60 / 3.68 | 1.15 | 1.59 | 0.00 [-0.08; 0.09] | 31.2 % | 38.1 % | 43.7 % | 3.88 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | down | 6255 | 32.6 % [29.1; 36.1] | 32.1 % | +0.5 [-0.8; +1.7] | -0.0 | -0.2 [-1.5; +1.0] | -4.0 | 4.40 / 3.35 | 1.10 | 1.03 | -0.24 [-0.33; -0.15] | 39.7 % | 41.1 % | 37.9 % | 3.23 % |
| S3_CORRECTION_COMPLETE | PURE | all | 172 | 40.1 % [32.0; 48.1] | 40.9 % | -0.8 [-7.6; +5.9] | -1.9 | -2.7 [-9.3; +3.9] | -4.3 | 3.72 / 4.47 | 0.63 | 0.87 | -0.15 [-0.30; -0.01] | 27.3 % | 25.0 % | 30.6 % | 0.09 % |
| S3_CORRECTION_COMPLETE | PURE | up | 88 | 40.9 % [29.7; 51.6] | 42.3 % | -1.4 [-10.3; +7.6] | -1.4 | -1.8 [-11.8; +8.2] | -4.9 | 4.13 / 4.47 | 0.69 | 0.91 | -0.13 [-0.39; 0.13] | 25.0 % | 25.0 % | 36.4 % | 0.05 % |
| S3_CORRECTION_COMPLETE | PURE | down | 84 | 39.3 % [28.9; 50.6] | 39.5 % | -0.2 [-10.0; +9.6] | -2.5 | -3.6 [-13.4; +6.1] | -3.6 | 3.49 / 4.80 | 0.59 | 0.84 | -0.18 [-0.38; 0.02] | 29.8 % | 25.0 % | 23.9 % | 0.04 % |
| S3_CORRECTION_COMPLETE | PURE_RS | all | 39 | 41.0 % [26.6; 55.4] | 50.8 % | -9.7 [-22.4; +2.9] | -4.8 | -16.9 [-29.7; -4.1] | -5.1 | 2.58 / 7.68 | 0.44 | 0.63 | -0.14 [-0.41; 0.13] | 20.5 % | 20.5 % | 31.0 % | 0.02 % |
| S3_CORRECTION_COMPLETE | PURE_RS | up | 21 | 47.6 % [25.7; 69.6] | 59.1 % | -11.4 [-30.2; +7.4] | -2.4 | -20.7 [-39.5; -2.0] | -4.8 | 2.27 / 4.61 | 0.42 | 0.51 | -0.17 [-0.55; 0.21] | 19.1 % | 19.1 % | 35.3 % | 0.01 % |
| S3_CORRECTION_COMPLETE | PURE_RS | down | 18 | 33.3 % [11.8; 52.9] | 41.1 % | -7.8 [-25.9; +6.8] | -7.6 | -12.1 [-30.7; +6.4] | -5.6 | 3.47 / 8.66 | 0.56 | 0.74 | -0.11 [-0.48; 0.28] | 22.2 % | 22.2 % | 25.0 % | 0.01 % |
| S3_CORRECTION_COMPLETE | CONFIRMED | all | 24 | 50.0 % [30.0; 70.0] | 54.2 % | -4.2 [-21.8; +12.7] | +1.7 | -11.2 [-29.0; +6.7] | -2.8 | 2.05 / 4.53 | 0.46 | 0.46 | -0.17 [-0.50; 0.17] | 25.0 % | 16.7 % | 31.6 % | 0.01 % |
| S3_CORRECTION_COMPLETE | CONFIRMED | up | 12 | 58.3 % [29.8; 86.9] | 66.7 % | -8.3 [-40.0; +19.4] | +6.7 | -12.0 [-43.9; +10.4] | -2.8 | 1.11 / 4.24 | 0.40 | 0.33 | -0.23 [-0.70; 0.25] | 25.0 % | 16.7 % | 40.0 % | 0.01 % |
| S3_CORRECTION_COMPLETE | CONFIRMED | down | 12 | 41.7 % [16.4; 66.9] | 41.7 % | +0.0 [-18.6; +18.6] | -3.2 | -9.3 [-35.8; +17.1] | -2.8 | 2.37 / 8.66 | 0.56 | 0.63 | -0.11 [-0.60; 0.38] | 25.0 % | 16.7 % | 22.2 % | 0.01 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | all | 1811 | 24.2 % [21.9; 26.6] | 23.8 % | +0.4 [-1.3; +2.1] | +0.3 | -0.7 [-2.4; +0.9] | -1.4 | 8.70 / 3.16 | 2.43 | 2.33 | -0.07 [-0.14; -0.01] | 41.0 % | 48.8 % | 50.6 % | 0.93 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | up | 1032 | 26.3 % [23.0; 30.0] | 27.2 % | -1.0 [-3.3; +1.5] | -0.9 | -1.6 [-4.0; +0.6] | -0.9 | 9.48 / 3.33 | 2.43 | 3.15 | 0.03 [-0.09; 0.18] | 37.5 % | 46.4 % | 51.3 % | 0.53 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | down | 779 | 21.6 % [18.4; 24.7] | 19.3 % | +2.3 [-0.4; +4.8] | +2.0 | +0.9 [-2.1; +3.6] | -2.0 | 8.08 / 2.93 | 2.43 | 1.72 | -0.21 [-0.34; -0.08] | 45.6 % | 51.9 % | 49.6 % | 0.40 % |
| S4_TRIANGLE_THRUST | PURE | all | 15 | 13.3 % [-5.1; 31.8] | 13.3 % | +0.0 [-14.3; +14.3] | -4.9 | -2.7 [-21.9; +16.4] | +6.7 | 12.45 / 5.26 | 2.23 | 1.09 | -0.43 [-0.90; 0.03] | 40.0 % | 20.0 % | 33.3 % | 0.01 % |
| S4_TRIANGLE_THRUST | PURE | up | 8 | 12.5 % | 20.0 % | -7.5 | -19.9 | -10.4 | +0.0 | 15.43 / 4.34 | 3.55 | 0.86 | -0.28 | 25.0 % | 37.5 % | 40.0 % | 0.00 % |
| S4_TRIANGLE_THRUST | PURE | down | 7 | 14.3 % | 5.7 % | +8.6 | +11.2 | +9.5 | +14.3 | 12.45 / 7.49 | 1.53 | 1.13 | -0.62 | 57.1 % | 0.0 % | 0.0 % | 0.00 % |
| S4_TRIANGLE_THRUST | PURE_RS | all | 2 | 0.0 % | 0.0 % | +0.0 | +0.0 | +0.0 | +0.0 | 10.97 / 6.56 | 1.74 | – | -1.25 | 100.0 % | 0.0 % | – | 0.00 % |
| S4_TRIANGLE_THRUST | PURE_RS | down | 2 | 0.0 % | 0.0 % | +0.0 | +0.0 | +0.0 | +0.0 | 10.97 / 6.56 | 1.74 | – | -1.25 | 100.0 % | 0.0 % | – | 0.00 % |
| S4_TRIANGLE_THRUST | CONFIRMED | all | 1 | 0.0 % | 0.0 % | +0.0 | +0.0 | +0.0 | +0.0 | 13.34 / 8.70 | 1.53 | – | -1.09 | 100.0 % | 0.0 % | – | 0.00 % |
| S4_TRIANGLE_THRUST | CONFIRMED | down | 1 | 0.0 % | 0.0 % | +0.0 | +0.0 | +0.0 | +0.0 | 13.34 / 8.70 | 1.53 | – | -1.09 | 100.0 % | 0.0 % | – | 0.00 % |

## DEV: lange Horizonte (nur Aufwärts-Setups)

| Setup | Variante | Horizont | n | Median | Mittel (4× gedeckelt) | Überschuss gg. Datum [95 %] | gg. Trend×RS [95 %] | 2× / 3× / 5× | 2× gg. Datum [95 %] | 2× gg. Trend×RS | MFE / MAE (Median) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | 6M | 32 | 9.1 % | 14.4 % | +4.4 [-12.9; +21.7] | +3.7 [-13.5; +20.9] | 9.4 % / 0.0 % / 0.0 % | 1.84 [0.00; 5.03] | 1.44 | 26.3 % / -12.7 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | 12M | 32 | 16.9 % | 27.5 % | +6.5 [-14.4; +27.4] | +6.3 [-14.7; +27.2] | 25.0 % / 6.3 % / 0.0 % | 2.10 [0.94; 3.66] | 1.76 | 40.2 % / -14.9 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | 24M | 31 | 21.2 % | 31.6 % | +1.4 [-30.3; +33.0] | +1.3 [-29.9; +32.6] | 29.0 % / 9.7 % / 6.5 % | 1.30 [0.66; 2.10] | 1.13 | 50.7 % / -23.1 % |
| S2_WAVE4_TO_5 | ENGINE_PRIMARY | 36M | 28 | 11.4 % | 28.2 % | -7.1 [-40.0; +35.1] | -5.1 [-38.1; +35.5] | 39.3 % / 7.1 % / 3.6 % | 1.28 [0.69; 1.85] | 1.13 | 71.4 % / -43.9 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | 6M | 7407 | 2.3 % | 4.9 % | -1.8 [-3.3; -0.4] | -2.2 [-3.6; -0.7] | 2.1 % / 0.5 % / 0.2 % | 0.52 [0.42; 0.61] | 0.49 | 13.6 % / -10.5 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | 12M | 7242 | 4.3 % | 9.8 % | -3.3 [-5.6; -1.0] | -3.6 [-5.8; -1.4] | 5.9 % / 1.5 % / 0.4 % | 0.63 [0.56; 0.71] | 0.61 | 21.1 % / -15.3 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | 24M | 6853 | 9.8 % | 21.3 % | -3.2 [-5.8; -0.6] | -3.5 [-5.8; -1.2] | 14.9 % / 4.4 % / 1.4 % | 0.78 [0.72; 0.84] | 0.75 | 34.8 % / -21.4 % |
| S3_CORRECTION_COMPLETE | ENGINE_PRIMARY | 36M | 6475 | 15.2 % | 30.8 % | -3.7 [-6.6; -0.8] | -3.9 [-6.7; -1.1] | 23.6 % / 7.9 % / 2.7 % | 0.84 [0.79; 0.89] | 0.82 | 48.1 % / -26.7 % |
| S3_CORRECTION_COMPLETE | PURE | 6M | 88 | -0.6 % | 1.7 % | -2.7 [-8.0; +2.5] | -2.9 [-8.3; +2.4] | 0.0 % / 0.0 % / 0.0 % | 0.00 | 0.00 | 11.3 % / -10.0 % |
| S3_CORRECTION_COMPLETE | PURE | 12M | 86 | 6.0 % | 11.2 % | +2.5 [-9.2; +14.3] | +2.2 [-9.4; +13.8] | 4.7 % / 2.3 % / 0.0 % | 0.67 [0.06; 1.27] | 0.64 | 17.0 % / -14.6 % |
| S3_CORRECTION_COMPLETE | PURE | 24M | 81 | 21.9 % | 30.5 % | +9.2 [-8.5; +26.9] | +8.7 [-8.4; +25.9] | 11.1 % / 4.9 % / 3.7 % | 0.71 [0.30; 1.15] | 0.68 | 37.8 % / -17.8 % |
| S3_CORRECTION_COMPLETE | PURE | 36M | 77 | 22.9 % | 32.9 % | -1.0 [-19.6; +17.7] | -1.7 [-19.6; +16.1] | 23.4 % / 6.5 % / 5.2 % | 0.91 [0.56; 1.28] | 0.88 | 56.8 % / -21.7 % |
| S3_CORRECTION_COMPLETE | PURE_RS | 6M | 21 | -5.9 % | 1.1 % | -3.2 [-16.9; +8.4] | -4.1 [-17.1; +8.9] | 0.0 % / 0.0 % / 0.0 % | 0.00 | 0.00 | 8.6 % / -14.8 % |
| S3_CORRECTION_COMPLETE | PURE_RS | 12M | 20 | 24.1 % | 16.9 % | +5.8 [-11.1; +22.7] | +4.2 [-11.9; +20.3] | 5.0 % / 0.0 % / 0.0 % | 0.76 [-0.76; 2.28] | 0.63 | 34.4 % / -21.9 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | 6M | 1021 | 2.2 % | 3.9 % | -2.4 [-5.3; +0.4] | -2.9 [-5.8; -0.0] | 2.0 % / 0.4 % / 0.1 % | 0.48 [0.27; 0.71] | 0.45 | 13.5 % / -10.2 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | 12M | 981 | 4.9 % | 8.6 % | -4.3 [-7.8; -0.8] | -4.9 [-8.6; -1.3] | 5.2 % / 1.4 % / 0.3 % | 0.56 [0.38; 0.74] | 0.53 | 20.7 % / -15.4 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | 24M | 933 | 8.7 % | 18.1 % | -5.0 [-10.0; +0.1] | -5.6 [-10.6; -0.6] | 15.3 % / 4.0 % / 0.8 % | 0.80 [0.66; 0.94] | 0.77 | 33.6 % / -20.8 % |
| S4_TRIANGLE_THRUST | ENGINE_PRIMARY | 36M | 880 | 12.5 % | 27.0 % | -6.4 [-11.7; -1.1] | -7.2 [-12.5; -1.8] | 24.3 % / 7.3 % / 1.7 % | 0.87 [0.76; 0.98] | 0.84 | 44.3 % / -27.1 % |

## Fallstudie PLTR unter Library V1 (nur Erklärung)

| Datum | VU-Ausblick | Primärzählung | Setup (Status, angezeigt) | Trend | RS26-Rang | Marktstruktur | interne Welle 3 | danach 26W / 52W / 104W |
|---|---|---|---|---|---|---|---|---|
| 2021-06-04 | TOO_SHORT | | | | | | | |
| 2022-12-30 | BEARISH / CLEAR | WXY fertig, weiter DOWN, enthält sich | S3_CORRECTION_COMPLETE QUALIFIED, nicht angezeigt | -1 | 0.17 | -1.00 | nein (Rang 14) | 2.39 / 2.67 / 12.32 |
| 2023-01-20 | BEARISH / CLEAR | WXY fertig, weiter DOWN, enthält sich | S3_CORRECTION_COMPLETE QUALIFIED, nicht angezeigt | -1 | 0.14 | -1.00 | nein (Rang 21) | 2.34 / 2.39 / 10.22 |
| 2023-03-31 | BEARISH / CLEAR | WXY Welle Y, weiter DOWN, enthält sich | – | 0 | 0.50 | -1.00 | ja (Rang 20) | 1.89 / 2.72 / 10.16 |
| 2023-06-30 | MIXED / AMBIGUOUS | WXY Welle Y, weiter DOWN, enthält sich | – | 1 | 0.98 | -0.30 | nein (Rang 26) | 1.12 / 1.65 / 8.53 |
| 2023-09-29 | MIXED / AMBIGUOUS | ZIGZAG Welle C, weiter DOWN, enthält sich | – | 1 | 0.98 | 0.35 | nein (Rang 9) | 1.44 / 2.30 / 11.10 |
| 2024-03-28 | NEUTRAL / AMBIGUOUS | WXY fertig, weiter UP, enthält sich | S3_CORRECTION_COMPLETE QUALIFIED, nicht angezeigt | 1 | 0.86 | 1.00 | nein (Rang 21) | 1.60 / 3.73 / 6.22 |
| 2024-09-27 | BULLISH / CLEAR | WXY Welle Y, weiter DOWN, enthält sich | – | 1 | 0.96 | 1.00 | nein (Rang 23) | 2.33 / 4.82 / 5.15 |
