# VU Technical Validation

Testdateien: `quant/tests/technical-*.test.mjs` (9 Dateien, 77 Tests) + Fixtures
`technical-fixtures.mjs`. Aufruf: `node --test "quant/tests/*.test.mjs"`. Datenprüfung:
`node scripts/technical/verify-technical-data.mjs`.

| Ebene | Tests | Was gesichert ist |
|---|---|---|
| Unit | C1–C8, F1–F3 | CanonicalBar-Felder, Split-Normalisierung (Fixture + VUF011), Cutoff-Slice, Datenrevision, Kalender-Aggregation 1W/1M, session-verankerte 4h-Bars, Feature-Werte (SMA, ATR, RSI, Drawdown, 52W), Missing = NaN |
| Synthetic Pattern | P1–P6, S1–S4 | clean up/down, range, gap, high/low vol, fake vs. confirmed reversal; HH/HL/LH/LL, BOS, Range, Compression/Expansion |
| **No-Look-Ahead / Prefix** | P2, F1, E1(engines), OR1, SN3, E3 | Ergebnis an T aus `bars[0:T]` ≡ Ergebnis aus `bars[0:T+k]` mit Cutoff T — **bit-identisch** (Hash) für Pivots, Features, Zustandsengines, Bundle, Snapshot, Elliott |
| Repainting | P6, E3 | bestätigte Pivots/Wellen stabil, Developing beweglich |
| Corporate Action | C2, C3, P5 | Split erzeugt weder falschen Crash noch Pivot noch bearischen BOS auf SPLIT_ADJUSTED (Kontrollfall RAW) |
| Engines | T1–T2, M1, R1, V1, U1, E1 | Richtungen, Coverage statt Ersatzwerte, RSI/MACD ohne Vote, RS ≠ RSI, Kompression, Breakout-/Dry-Up-Volumen, UNAVAILABLE ohne Volumen |
| Zonen / Fib | Z1–Z4, F1–F2 | Zonen statt Linien, Touch-Cooldown, Gaps, Periodenlevel, Fib nur auf bestätigten Ankern, 50 % = half, Cluster nur aus verschiedenen Ankern |
| Scenario / Setup / Score | SC1–SC4, CF1, TOS1, TX1 | PRIMARY/ALTERNATIVE/BEAR, Zonen mit Quellen, Invalidation unter Entry, Quality Gate, RR-Range-Formeln (bullish + bearish), Familien-Confluence, gekappte Projektion, keine Wahrscheinlichkeits-/Kaufformulierung, Rundungsschritt |
| Elliott Rules | R1–R2 | gültiger Impuls, W2-Verletzung, W3 kürzeste, W4-Overlap, gültiger/ungültiger Zigzag, bearish gespiegelt; Guidelines legitimieren keine Verletzung |
| Elliott Walk-Forward | E1–E5 | Historical Map an echten Pivots (1-2-3-4-5, A-B-C), Primary/Alternative, Invalidation, Projection Zones, Abort Conditions, Segment-Graph |
| Rendering | A1–A3 | Schema, Layer, Zeit statt Pixel, Positions-Hash (Visual Regression) |
| Snapshot / Evidence / Scanner / Tools | SN1–SN3, EV1, SC1, AI1, SP1 | Unveränderlichkeit, supersedes, Same-Bar-Policy, keine Quote ohne Stichprobe, strukturierte Filter, Tool-Registry, Rule-Pack-Interface |
| Datendrift | verify-technical-data.mjs | 26 ausgelieferte Instrumente gegen die Engines nachgerechnet (dataVersion, parametersHash, Score, Scenario-ID, Snapshot) |
| Cross-Timeframe | C6, C7 | 1D→1W/1M, 1m→1h/4h |
| Cross-Market | Build | 13 reale Titel (Halbleiter, Software, Index-ETFs) + 482 synthetische Titel, 0 Fehler |

**Nicht automatisiert:** pixelbasierte Screenshot-Diffs (nur manuelle Playwright-Screenshots im
Audit), Multiple-Testing-Kontrolle (keine Parameteroptimierung in V1 erfolgt), Out-of-Sample-
Evidenz (Stichprobe zu klein — bewusst nicht angezeigt).

| Release-Audit | AU1–AU11, E6 | Polarität von Structure Failure, Elliott-Entscheidbarkeit (kein Repainting), Fib-Pocket-Richtung, bearische T2, Pivot-Extrem zwischen Pivot und Bestätigung, Same-Bar-Entry, UNDETERMINED ohne Vote, Entry-Nähe, laufende Hard Rules, zweiseitige Range, Renderer-Clipping |

**Bestehende Tests:** 232/232 weiterhin grün; Gesamt 309/309 (Release-Audit).
