# VU Technical Intelligence V1 — Phase-1-Report

**Branch:** `claude/technical-intelligence-v1-mfjkd3` · **Basis:** `origin/main` @ `da69113` (PR #45)
**Stand:** 7. September 2026 · **Release-Audit:** 8. September 2026 → `VU_TECHNICAL_RELEASE_AUDIT.md` (14 Befunde behoben, 309/309 Tests) · **Tests (vor Audit):** 297/297 grün (`node --test "quant/tests/*.test.mjs"`), davon 232 bestehende unverändert und 65 neue
**Datenprüfung:** `node scripts/technical/verify-technical-data.mjs` → 26 Instrumente gegen die Engines nachgerechnet, OK

Fachliche Quelle: *VISION UNIVERSE® TECHNICAL INTELLIGENCE ENGINE — RESEARCH & METHODOLOGY MASTER* · Technische Quelle: `VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md` (nicht verändert, siehe §44 Update-Vorschlag).

---

## 1–5 · Base, Branch, Commits, Dateien

| | |
|---|---|
| Base main Commit | `da69113cd9d851ca3b834fe0cd6eb9759f351037` |
| Branch | `claude/technical-intelligence-v1-mfjkd3` |
| Commits | CP0+1 `f9f7b0f` · CP2 `af45ee5` · CP3 `b371535` · CP4 `339889a` · CP5 `0cfb82f` · CP6–9 Engines `461c0d6` · CP6/7 Delivery `62d8bfb` · CP10 (dieser Report) |
| Neue Dateien | 121: `quant/engines/technical/**` (23 Engines), `quant/methodology/technical-v1.json`, `elliott-v1.json`, `quant/ui/technical-chart.js`, `quant/technical/{index.html,app.js}`, `scripts/technical/{build,verify}-technical-data.mjs`, `quant/tests/technical-*.test.mjs` (8) + `technical-fixtures.mjs`, `quant/data/technical/**` (26 Instrumente, Scan, 36 Snapshots, Evidence, Index, Meta), 12 Dokumente `docs/VU_TECHNICAL_*.md`, `VU_PIVOT_*`, `VU_MARKET_STRUCTURE_*`, `VU_SCENARIO_*`, `VU_REPAINTING_*`, `VU_ELLIOTT_*` |
| Geänderte bestehende Dateien | **3 + 1**: `.github/workflows/quant-ci.yml` (Pfade + Verify-Schritt), `quant/ui/shell.js` (Tab „Technical“), `quant/ui/quant.css` (Chart-/Layer-Styles angehängt), `quant/ARCHITECTURE.md` (Abschnitt). Keine Änderung an Engines der Phasen 1–3, keine an Dashboard, SEC oder Tiingo. |

## 6 · Architektur

Provider Data → `canonical-bars.js` (Corporate-Action-Normalisierung, RAW/SPLIT_ADJUSTED/TOTAL_RETURN) → `feature-store.js` → `pivot-engine.js` (kausal, 4 Skalen) → `market-structure.js` → Trend/Momentum/RS/Volatilität/Volumen → `support-resistance.js` + `fibonacci.js` (auxiliary) → `scenario-engine.js` → `trade-setup.js` → `confluence.js` → `technical-score.js` → `snapshot.js`/`storage.js` → `annotations.js` → `elliott/*` (Beta) → `technical-analysis.js` (Orchestrator, `analyzeAsOf`) → `scanner.js` → `technical-tools.js`. Renderer `ui/technical-chart.js` interpretiert nur Annotationen. Details: `VU_TECHNICAL_INTELLIGENCE_ARCHITECTURE.md`.

## 7–24 · Status Core

| # | Modul | Status | Nachweis |
|---|---|---|---|
| 7 | Canonical Data | ✅ CanonicalBar mit allen Pflichtfeldern, Split-Normalisierung aus RAW + Corporate Actions, Cutoff-Slice, Revision | C1–C5 |
| 8 | Feature Store | ✅ versioniert `features-1.0.0`, deterministisch, kausal, NaN statt 0 | F1–F3 |
| 9 | Pivot Engine | ✅ kausale ATR/%-ZigZag-Maschine, 4 Skalen, pivotTime ≠ confirmedAt, Hierarchie | P1–P6 |
| 10 | Market Structure | ✅ HH/HL/LH/LL, BOS close-basiert, Failure/Change formal, Range, Compression/Expansion, Sweep | S1–S4 |
| 11 | Trend | ✅ 5 Komponenten, 0–100 Methodology Score, Coverage statt Ersatzwert | T1–T2 |
| 12 | Momentum | ✅ Multi-Horizon-Log-Returns, Beschleunigung; RSI/MACD ohne Vote | M1 |
| 13 | Relative Strength | ✅ vs. Benchmark, Ratio-Trend, Universum-Rang; Sektor UNAVAILABLE (keine Sektorserie) | R1 |
| 14 | Volatility | ✅ ATR/%, Perzentile, Kompression/Expansion, Regime; kein Stop-Modell | V1 |
| 15 | Volume | ✅ RVOL (Median), Breakout, Dry-Up, Trend, Up-Volume-Anteil; UNAVAILABLE ohne Volumen | U1 |
| 16 | Support/Resistance | ✅ gewichtetes 1-D-Clustering, Zonen mit Touches/Cooldown, Gaps, Periodenlevel | Z1–Z4 |
| 17 | Fibonacci | ✅ nur bestätigte Anker, 50 % = half, Cluster aus verschiedenen Ankern, Familie gekappt | F1–F2 |
| 18 | Scenario Engine | ✅ PRIMARY/ALTERNATIVE/BEAR, Entry aus Retracement × Zone × ATR, Invalidation strukturell, Zonen mit Quellen, Range-Szenarien | SC1–SC2 |
| 19 | Trade Setup | ✅ Quality Gate, RR als Range, Setup Quality, getrennt von Analyse | SC3–SC4 |
| 20 | Confluence | ✅ 8 Familien, Aux-Kappung ±0.3, Conflict Penalty | CF1 |
| 21 | Technical Score | ✅ 0–100 Methodology Rank, Beiträge gekappt (Projektion max. 10), `isProbability: false` | TOS1, TX1 |
| 22 | Snapshots | ✅ unveränderlich, supersedes-Kette, Memory-/JsonFile-Store, walk-forward reproduzierbar | SN1–SN3 |
| 23 | Renderer | ✅ renderer-neutrale Annotationen (7 Layer), SVG-Renderer ohne Rechenlogik, Past/Developing/Projected | A1–A3, UI1–UI5 |
| 24 | Universe Scan | ✅ 482 synthetische Titel, Perzentile, strukturierte Filter, 0 Fehler; Screener-Feldnamen vorbereitet | SC1 (snapshot) |

## 25–31 · Status Elliott

| # | | Status |
|---|---|---|
| 25 | Elliott V0 | ✅ Segment-Graph, Statusmodell, Degree-Mapping D0–D3 (E5) |
| 26 | Elliott V1 Beta | ✅ Standard-Impuls + einfacher Zigzag, versionierte Constraint Library `elliott-rules-1.0.0` (R1–R2) |
| 27 | Historical Wave Mapping | ✅ kausaler Links-nach-rechts-Parser, Labels an echten Pivots, Coverage-Maß; NVDA 5Y zeigt historische 1-2-3-4-5 / A-B-C-Labels vor der Projektion (E1, Screenshot) |
| 28 | Primary Count | ✅ NVDA: Welle 3 developing (Impuls, D1), Method Fit 68/100, Status AMBIGUOUS (ehrlich: Alternative nahe) |
| 29 | Alternative Count | ✅ NVDA: Zigzag C developing; per Toggle im Chart (E2) |
| 30 | Invalidation | ✅ aus Hard Rules je laufender Welle; keine Projektion ohne Invalidation |
| 31 | Projection Zones | ✅ Target-Density-Cluster (Wellenrelationen + S/R + ATR), Pfad max. 3 Phasen, alles PROJECTED |

## 32–38 · Validierung

| # | | |
|---|---|---|
| 32 | Walk-Forward | ✅ `analyzeAsOf` schneidet vor jeder Berechnung; Bundle/Snapshot/Elliott bei T bit-identisch aus Präfix vs. Vollserie (OR1, SN3, E3); 10 historische NVDA/MSFT-Snapshots mit walk-forward Outcome |
| 33 | No-Look-Ahead | ✅ P2 (8 Fälle × 4 Skalen), F1, E1 (Engines), OR1 |
| 34 | Repainting | ✅ P6 (Pivots), E3 (Elliott CONFIRMED stabil), Policy je Engine dokumentiert |
| 35 | Visual | ✅ Positions-Hash (A3) + Playwright/Chromium-Screenshots Desktop 1280 px: AUTO, STRUCTURE (1Y), S/R, ELLIOTT; Index; VUF011 |
| 36 | Mobile | ✅ 390 px: kein horizontaler Seiten-Overflow, Chart scrollt horizontal und startet am Now-Divider, Layer-Pills ≥ 40 px (UI4, Screenshots) |
| 37 | Tests gesamt | **297** (65 neue in 8 Dateien: canonical 11, pivots 10, engines 7, zones 6, scenario 9, elliott 10, snapshot 7, ui 5) |
| 38 | Bestehende Tests | ✅ 232/232 unverändert grün; `verify-quant-data.mjs`, `assert-no-secrets.mjs`, `verify-semantics-parity.mjs` bestanden |

## 39 · CRITICAL Issues

Keine.

## 40 · HIGH Issues

1. **Elliott-Grammatik V1 ist zweimustrig.** Auf der feinen Degree-Skala (D1) zerfällt NVDAs Historie in aufeinanderfolgende Zigzags, weil Impulse dort die Overlap-Regel oft verletzen; ohne Multi-Degree-Nesting (V1.5) sind Wave-Maps Hypothesen einer bewusst engen Grammatik. Auf D2 liefert NVDA nur ein erstes Leg (ehrlich `FIRST_LEG_ONLY`), daher der dokumentierte Fallback auf D1.
2. **Regulatorik nicht geprüft.** Entry Zone / Invalidation / Target Zones / RR sind MAR-/MiFID-relevant (Research: LEGAL REVIEW REQUIRED). Die Seite lebt im Quant-Bereich mit Disclaimer, Methodology-Wording und ohne Suitability-Aussagen — ein Launch braucht die Prüfung durch Kapitalmarktrecht.
3. **Reale Daten schmal.** 13 Symbole ab 2020-09 (≈ 6 Jahre) aus dem Dashboard-Marktdatenbestand; AAPL/TSLA fehlen (Golden-Liste nur teilweise real, Rest synthetisch); TOTAL_RETURN für reale Titel nicht ableitbar; kein Tiingo-Code in main.

## 41 · MEDIUM Issues

1. Ausgelieferte Daten ≈ 15 MB (26 × ~0,5 MB) — vertretbar neben 47 MB `quant/data`, aber für 500+/5.000 Titel muss Precompute auf Instrument-on-demand + Columnar Storage umziehen (Interface vorhanden, nicht angebunden).
2. Stability-Maß perturbiert nur Pivot-Schwellen (±10 %), nicht zusätzliche Bars oder Nachbar-Counts.
3. Sektor-Benchmark überall UNAVAILABLE (keine Sektorserien im Datenbestand).
4. Intraday-Aggregation nur synthetisch getestet (1m-Session), keine realen Intraday-Daten.
5. Evidence-Stichprobe (10 Records) unter der Mindestgröße — Erfolgsquoten werden bewusst nicht angezeigt.
6. Visual Regression ohne Pixel-Diff in CI (Positions-Hash + manuelle Screenshots).
7. Chart: bei dichten Projektionszonen können Labels am oberen Rand clippen; MAX zeigt das Anzeigefenster (1.320 Bars), nicht 20 Jahre.
8. AI-Tools sind registrierbar (`technical-tools.js`, AI1), aber `/quant/ai/` ist noch nicht an die Technical-Daten angebunden; Screener-Filter existieren im Scanner, die Screener-Seite ist nicht verdrahtet.
9. Local-`main` des Arbeitsplatzes war veraltet — der Branch basiert korrekt auf `origin/main` (Diff gegen `origin/main`: 3 geänderte Bestandsdateien).

## 42 · Nicht implementierter Scope (bewusst, §7)

Komplexe Elliott-Kombinationen (W-X-Y-X-Z), Flats/Triangles/Diagonals, echtes Multi-Degree-Nesting, ML-Ranking, Probability Claims, Minervini/VCP/Darvas/Wyckoff-Produktions-Engines (nur Rule-Pack-Interface mit Legal-Gate), Volume Profile, AVWAP, Chart-Pattern-Sammlung, Realtime, Public-Tiingo-Display, Experiment-Registry-Datei, Screener-/AI-Seiten-Verdrahtung.

## 43 · Empfohlener nächster Schritt

1. Release Audit dieses Branches (Code-Review, Regulatorik-Sichtung der Scenario-Darstellung).
2. Tiingo-Workstream → `MarketDataProvider` mit RAW + Splits + Dividenden für die Golden-Liste (NVDA, AAPL, MSFT, TSLA, SPY, QQQ) über 10–20 Jahre; Technical liest dann Canonical Bars ohne Änderung.
3. Elliott V1.5: Multi-Degree-Reconciliation (D2-Historie + D1-Trailing), Flat-Support, Stability über Bars/Nachbar-Counts.
4. Screener + AI-Seite an Scanner/Tools anbinden (Feldnamen stehen).

## 44 · Vorschlag für die Master-MD (nicht ausgeführt)

Erst bei Merge einpflegen — `VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md`:

* **§23** ersetzen: „Future Workstream, nicht begonnen“ → Status dieses Reports (V1 Core production-grade, Elliott Beta), Verweis auf die 12 Dokumente.
* **§32 Tabelle**: Zeile „Technical (Quant-intern)“ → „V1 (Core) + Beta (Elliott) · Datenmodus: Reale Referenztitel (Dashboard-Bestand, splitbereinigt) + Mock · grün (8 Testdateien, 65 Fälle) · Einschränkung: zweimustrige Elliott-Grammatik, keine Legal Review · nächster Schritt: Tiingo → Canonical Bars, Elliott V1.5“.
* **Gesamt-Teststand** 232 → 297; Dateiliste um `technical-*.test.mjs` ergänzen.
* **§4.4/§4.5** Verzeichnisse: `quant/engines/technical/`, `quant/technical/`, `quant/data/technical/`, `scripts/technical/`.
* **§33 Roadmap**: Punkt 8 „Technical Engine Integration“ → erledigt (V1), neu „Elliott V1.5“, „Screener/AI-Anbindung Technical“.
* **§31 Regeln** ergänzen: „16. Technical Intelligence rechnet nur auf SPLIT_ADJUSTED; kein Score als Wahrscheinlichkeit; keine Projektion ohne Invalidation.“
* **Dokumentierter Widerspruch** (§3 „quant/ liest nichts aus dashboard/“): unverändert im Frontend; das Build-Skript liest den Dashboard-Marktdatenbestand einmalig (Node) — als Ausnahme festhalten oder durch den gemeinsamen Market Data Core ablösen.

---

## Abschluss

**TECHNICAL INTELLIGENCE V1: READY FOR RELEASE AUDIT.**

Begründung: alle Core-Acceptance-Kriterien (§89) erfüllt und getestet; Elliott V1 Beta erfüllt §90 (Historical Wave Map, Regeln als Gates, Primary/Alternative, Invalidation, Projection Zones, Walk-Forward, keine Probability Claims) mit den dokumentierten Beta-Grenzen (HIGH 1). Kein Auto-Merge; die HIGH-Punkte 2 und 3 sind Audit- bzw. Folge-Workstream-Themen, keine Blocker für den Audit selbst.
