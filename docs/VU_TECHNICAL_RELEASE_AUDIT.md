# VU Technical Intelligence V1 — Release Audit & Methodology Validation

**Datum:** 8. September 2026 · **Auditor:** autonomer Release-Audit auf dem Technical-Branch
**Grundsatz:** alle Aussagen des Phase-1-Reports wurden als unverifizierte Claims behandelt; Wahrheit = Repository, Code, Tests, erzeugte Daten, Browser-Renderings.

## 1–8 · Git, Scope, Sicherheit

| # | Punkt | Befund |
|---|---|---|
| 1 | origin/main | `9576ddb` (vorher `da69113`; 4 neue Commits: SEC-Fundamentals-Workflow-Datei, Dashboard-News, Referenz-Tageskurse `quant/data/market/daily/ref_*.json` + `status.json`) |
| 2 | Technical Branch | `claude/technical-intelligence-v1-mfjkd3` |
| 3 | Merge Base | `da69113` |
| 4 | Branch synchron? | 8 (+1 Audit-Commit) voraus, 4 hinter main; Dry-Merge (`git merge-tree`) **0 Konflikte**; die Branch-Quelldatei `dashboard/data/market_data.json` ist auf main unverändert (0 revidierte historische Closes) → `verify-technical-data.mjs` bleibt nach Merge gültig |
| 5 | Geänderte Dateien | vs. origin/main: **4 bestehende** (`.github/workflows/quant-ci.yml`, `quant/ui/quant.css`, `quant/ui/shell.js`, `quant/ARCHITECTURE.md`), 121 neue (quant/data 66, quant/engines 27, tests 10, docs 13, scripts 2, technical 2, methodology 2, ui 1) |
| 6 | Unbeabsichtigte Änderungen | keine: Quant-Engines Phase 1–3, Dashboard, SEC, Tiingo, Produktionsdaten unberührt |
| 7 | Secrets | keine (Pattern-Scan über alle neuen Dateien, `secrets.test.mjs` S1–S5 grün, `assert-no-secrets.mjs` OK, keine lokalen Pfade) |
| 8 | Vendor Leakage | keine Vendor-Namen in `quant/engines/technical`, `quant/technical`, `quant/data/technical`; Acceptance-Test 1 grün |

## 9–11 · Daten und Kausalität

| # | Punkt | Befund |
|---|---|---|
| 9 | Price Semantics | Orchestrator lehnt RAW und TOTAL_RETURN ab (Laufzeit geprüft). **Alle** Engines (Pivots, Struktur, Trend, Momentum, RS, Vol, Volumen, S/R, Fib, Elliott, Szenarien, Rendering) rechnen auf der einen übergebenen SPLIT_ADJUSTED-Serie; es gibt keinen zweiten Serienzugriff. Reale Bars: deklariert SPLIT_ADJUSTED (`market_data.json`, `semantics_version price-adjustment-v1.0.0`) |
| 10 | Split Handling | NVDA 10:1 (2024-06-10), AMZN 20:1 (2022-06-06), AVGO 10:1 (2024-07-15): Close-Ratio 1.007/1.020/1.008, **keine** Struktur-Events und keine Pivots am Split-Tag; Mock-Fixture VUF011 (4:1): SPLIT-Flag am Ex-Tag, kein Fake-Crash; Kontrollfall RAW erzeugt den falschen Bruch (Test P5) |
| 11 | No-Look-Ahead | Präfix-Identität (Hash des gesamten Bundles inkl. Elliott + Annotationen) auf realen Daten NVDA/MSFT/AMD × 4 Cutoffs: **12/12 bit-identisch**; synthetisch P2/F1/OR1/SN3/E3; Subagent: 0 Abweichungen über 107 Cutoffs für Pivots/Struktur; Feature-Store-Primitive geprüft (alle Fenster ≤ i) |

## 12–13 · Pivot, Struktur

* **Pivot Engine:** 8 synthetische Regime (P1–P6), Adversarial-Edge-Cases (1/5/20 Bars, flat, Spike, Crash −50 %, Crash+Recovery, 3-Monats-Datenlücke, Null-/Nullvolumen, 3×-Wicks, unsortierte Duplikate) ohne Absturz und ohne `NaN` im Output. **Befund MEDIUM (behoben, AU5):** das Extrem zwischen Pivot und Bestätigungsbar ging verloren, wenn die Schwelle zwischen den Bars variierte.
* **Market Structure:** BOS ausschließlich close-basiert; Wick-Events heißen `LEVEL_SWEEP` und feuern einmal je Level (kein Spam). **Befund HIGH (behoben, AU1):** `STRUCTURE_FAILURE_BULLISH` (bearischer Bruch) wurde per Regex als bullisch gewertet — in Szenario-Evidenz und Chart-Stil.

## 14–19 · Elliott

| # | Punkt | Befund |
|---|---|---|
| 14 | Hard Rules | Implementiert und getestet (R1): W2 ≤ W1-Ursprung, W3 > W1-Ende, W3 nie kürzeste (nur mit W5), W4 kein W1-Overlap, W4 ≤ W3-Ursprung, Alternation; Zigzag: Alternation, B ≤ A-Ursprung, C über B-Ende. **Befund MEDIUM (behoben, AU9):** „überschreitet“-Regeln wurden auf ein laufendes Leg als Gate angewandt (kein „W3 developing“ möglich, bevor W3 das W1-Hoch überschritt). Nicht implementiert (und nicht als erfüllt behauptet): Flats, Triangles, Diagonals, Kombinationen. |
| 15 | Historical Map | Browser-Renderings NVDA/MSFT/AMZN/SPY/PLTR/VUF011 zeigen historische Labels an echten Pivots, Developing-Welle, NOW, Projektion. **Befund HIGH (behoben, E6 + AU2):** zwei Repainting-Pfade — gleitendes 40-Leg-Fenster und vorzeitige 3-Leg-Zigzag-Entscheidung — schrieben bestätigte Labels um; NVDA Bar-für-Bar (300 Schritte): vorher 3, nachher **0** Umschreibungen. |
| 16 | Primary vs. Alternative | NVDA: Primary Impuls Welle 3 developing (D2), Alternative Zigzag C developing — anderes Pattern, andere Projektionszonen (258–266 / 303–310 vs. W3/W4/W5-Cluster), **gleiche** Invalidation (189.8: beide hängen am selben Tief). Materiell verschieden, aber nicht in allen drei Dimensionen (Befund LOW, dokumentiert). |
| 17 | Confidence | `confidenceType: "method_fit"`, `isProbability: false`, UI „Method Fit, keine Wahrscheinlichkeit“; Komponenten: Regeln, Guideline-Fit, Pivot-Qualität, Struktur, Momentum/Volumen, Alternation/Kanal, Fib, Higher-Degree-Konsistenz; ECS = 0.8 Fit + 0.2 Stability. |
| 18 | Stability | NVDA Bar-für-Bar 2025-06 → 2026-09 (300 Schritte): Wellenwechsel 20, Primary↔Alternative-Switches 4, Invalidations-Änderungen 11, Projektionsänderungen 25, **CONFIRMED-Umschreibungen 0**, Degree-Wechsel 1; Label-Persistenz **93,3 %**; Status-Verteilung OK 132 / AMBIGUOUS 81 / LOW_CONFIDENCE 87 (ehrlich: Erst-Leg-Phasen). Perturbations-Stabilität NVDA jetzt 1.0 (vorher 0.33). |
| 19 | Multi-Asset | 13 reale Titel (Halbleiter, Software, ETFs; META/GOOGL/JPM/XOM/AAPL/TSLA **nicht** im Dashboard-Bestand — die neuen `ref_*.json` auf main sind unadjusted/RAW, 400 Bars, ohne Splits → korrekt nicht verwendbar). Ergebnis: Status OK 5, AMBIGUOUS 6, LOW_CONFIDENCE 2; Coverage 0.82–1.0; längste Zigzag-Kette 2–14 (PLTR 14, MSFT 7 auf D1). |

## 20–21 · NVDA Deep Dive (Methodology Validation Case, keine Empfehlung)

Stand 2026-09-04, Close 230.36, Degree D2 (scale-3), Status AMBIGUOUS, Method Fit 76/100 (Fit 0.70, Stability 1.0), Coverage 82 %.

* **Historical Map:** Zigzag↑ (2020), Impuls↑ 1–5 (2021), Zigzag↓, Zigzag↓ (2022), Impuls↑ 1@2023-08-24=50 → 2@2023-10-31=39 → 3@2024-03-08=97 → 4@2024-04-19=76 → 5@2024-06-20=141. 2024-06 bis 2026-03 bleibt **unlabeled** (keine der beiden V1-Formen valide) — ehrlich sichtbar als Lücke.
* **Trailing:** 1 = 2026-03-30→05-14 (164→237, CONFIRMED), 2 = 05-14→06-29 (237→190, CONFIRMED, Retrace 64 %), 3 developing seit 06-29 (190→235).
* **Warum Welle 3:** die letzten fünf Legs vor dem Trailing bilden kein valides Muster; ab 164 folgt Aufwärts-/Abwärts-/Aufwärts-Leg mit W2 > W1-Ursprung (Regel erfüllt), W3 noch offen (Regel `null`), Grammatik-Prior (nach Korrektur Motive), Struktur BULLISH (HH/HL), Trend 71.5/100, Momentum positiv → Impuls-Lesart rankt vor der Zigzag-Lesart (Zigzag hat besseren Guideline-Fit 1.0 vs 0.67, daher AMBIGUOUS).
* **Invalidation:** unter 189.8 (Regel W2_NOT_BEYOND_W1_ORIGIN). **Projection Zones:** W3 303–310 (1.618×W1) und 375–383 (2.618), W4 258–266 / 275–283, W5 320–327 / 348–355. **Alternative:** Zigzag C developing, Zonen 258–266 / 303–310.
* **Scenario:** BREAKOUT_RETEST, Entry 226–233 (Strukturbruch-Level + ATR), Invalidation 204 (Strukturtief 207.25 − 0.5 ATR), T1 257–264 (Measured Move 1.0), T2 272–283 (1.618); RR 0.83–1.73 → COMPLETE_LOW_RR; Technical Opportunity Score 61.3 (Trend/Struktur 24.2, Momentum 13.8, Volumen 4.2, Vol 5, Setup 7.2, Projektion 6.9).

## 22–26 · Szenario-Engine

Entry Zones entstehen aus Retracement-Band × Support-Zone × ATR bzw. Strukturbruch-Level (nie `Preis ± x %`; Quellen im Objekt). Invalidations sind strukturell (letztes ungebrochenes Strukturtief − Buffer oder Swing-Ursprung; Elliott: Hard Rule). Targets tragen `sources[]` (Zonen, Measured Move, Fib-Cluster, Elliott-Projektion). **Befunde behoben:** bearische T2-Fallback-Zone lag in T1 (AU4); Range-Szenario nur einseitig invalidierbar (AU10); Fib-Pocket immer bullisch gewertet (AU3). Bearische Geometrie über ~450 Fixture-Cutoffs: 0 Verletzungen (Subagent).

## 27 · Opportunity Score

Methodology Rank, `isProbability: false`, gekappte Projektion (max. 10). Missing Volume → 40 % des Maximums (4 Punkte) mit Notiz; RS fehlt → nur absolutes Momentum. **Befund MEDIUM (behoben, AU7):** UNDETERMINED-Engines (kurze Historie) lieferten trotz Coverage < 0.5 einen vollen Richtungswert in die Confluence. Saturation: Mock-Universum 0 Titel ≥ 80, 158 in 60–80. Ein Titel mit mehr Features wird nicht automatisch besser bewertet — fehlende Familien senken die Coverage, sie werden nicht zu 50 ergänzt.

## 28–31 · Annotationen, Renderer, UI, Responsive

* Annotation-Schema ohne Pixel/SVG/Library-Begriffe (Test A1); Engines kennen keinen Renderer.
* 36 Browser-Renderings (6 Instrumente × AUTO/ELLIOTT × 1280/768/390): 0 Seitenfehler, **0 Labels außerhalb des Zeichenbereichs**, 0 projizierte Objekte links von NOW, 0 historische Objekte rechts von NOW, 0 horizontaler Seiten-Overflow; Label-Überlappungen ≤ 3 je Ansicht. **Befunde behoben:** Segmente vor dem Fensterrand mit falscher Steigung, fehlendes Y-Clipping, Labels über dem Chart (AU11); Touch-Targets < 40 px auf 768 px.
* UX: Hero (Score, Trend, Struktur, Primary, RR, Confidence, Elliott) + ein Klartextsatz; Layer statt Indikator-Zoo; Szenarien als Karten; Details/Rohmetriken/Methodik als tiefere Ebenen. **Offen (MEDIUM):** bei weit entfernten Elliott-Projektionen (SPY: W3 > 1.000) begrenzt die Preisskala (+60 % der Bar-Spanne) die Sicht auf die Zonen — Labels sammeln sich am oberen Rand.

## 32–33 · Performance, Storage

| Messung | Wert |
|---|---|
| `analyze()` je realer Titel (1.500 Bars, inkl. Elliott + Annotationen) | 34–105 ms; Elliott-Anteil 13–39 ms |
| Mock 5.395 Bars | 164 ms voll, 96 ms Core |
| Universe-Scan 482 Titel (Core) + Fixtures + Reals | ≈ 75 s Precompute inkl. Mock-Generierung |
| JSON je Instrument | ≈ 0,49 MB (NVDA), gesamt 15 MB für 26 Instrumente; Scan 0,48 MB; Evidence 0,42 MB |
| Seite JS+CSS | 212 KB (+ Instrument-JSON) |

Hochrechnung: 5.000 Titel × ~0,1 s ≈ 8 min Core-Precompute single-threaded — architektonisch möglich, aber **V1 rechnet bei jedem Build die volle Historie neu (kein inkrementelles Update)** und liefert Bundles als Ganzes; für 500+ Titel sind Instrument-on-demand-Auslieferung und Columnar Storage nötig (Interface vorhanden). Snapshots unveränderlich (SN1–SN3), Supersedes-Kette geprüft, Drift-Verify grün.

## 34–36 · Scanner, AI-Tools, Rule Packs

* Scanner: reine Funktion auf Serien, kein Browser-Fanout; 482 Zeilen sortiert, Nullwerte nur bei RR ohne Setup (93), Perzentile vorhanden; Filter strukturiert (kein freier Ausdruck). Befund LOW behoben: `asOf` = jüngster Stand statt Top-Zeile. Anmerkung: Ranking ist richtungsagnostisch (Top-5 enthält bearische Setups) — Filter `primaryDirection` verfügbar.
* AI-Tools: registrieren sich auf der bestehenden Registry, verbotene Namen bleiben verboten, jedes Ergebnis trägt Provenienz; keine Berechnung im Tool (AI1). Noch nicht an `/quant/ai/` verdrahtet.
* Rule Packs: Interface erzwungen, Named Method ohne `legalReview` wird abgelehnt (SP1); keine proprietäre Regel implementiert.

## 37–40 · Lizenz, Regulatorik, Sicherheit, CI

* Der Technical-Bereich liefert dieselben splitbereinigten Tageskurse aus, die das Dashboard bereits öffentlich anzeigt; kein Tiingo, keine neuen Lizenzannahmen, Feature Gates unverändert.
* Produkttexte: kein „Buy now“, „garantiert“, „Probability of Profit“, „Kursziel“; nur in Docs als Negativbeispiele. Rechtliche Prüfung (MAR/MiFID) bleibt separates Gate.
* CI: nur Tests + Verify; Verify schreibt nichts; Build wird in CI nicht ausgeführt.

## 41–44 · Sync, Findings, Tests, Entscheidung

**CRITICAL:** keine.

**HIGH (alle behoben):** (1) Repainting bestätigter Elliott-Labels durch gleitendes Fenster und vorzeitige Zigzag-Entscheidung; (2) Polarität von `STRUCTURE_FAILURE_BULLISH`; (3) Fib-Pocket-Richtung; (4) bearische T2-Fallback-Zone.

**MEDIUM (behoben):** Pivot-Extrem zwischen Pivot und Bestätigung; laufende „überschreitet“-Regeln als Gate; UNDETERMINED-Vote in der Confluence; Entry-Nähe jenseits der Zone; Same-Bar Entry/Target in der Evidence; Renderer-Clipping/Interpolation/Label-Clamp; Touch-Targets 768 px.
**MEDIUM (offen, dokumentiert):** Zigzag-Fragmentierung/unlabeled Spans ohne Multi-Degree (PLTR Kette 14, NVDA D2-Lücke 2024–2026); Preisskala bei weit entfernten Projektionen; Alternative Count teilt bei gleichem Tief die Invalidation; Full-Recompute-Precompute; 0,5 MB JSON je Instrument; RS vs. Sektor überall UNAVAILABLE; Evidence-Stichprobe 10 (keine Quoten).
**LOW (behoben):** Range zweiseitig; Gap-Zonen-Distanz; Scanner `asOf`; Aux-Familie „verfügbar“ ohne Beitrag; Projektionspfad auf Bandmitte.
**INFO:** `minPatternScoreForMap` wirkungslos; `ref_*.json` auf main sind RAW (korrekt abgelehnt); 4h-Extended-Buckets werden rückwärts vom Session-Start verankert (Policy-Default: nur reguläre Session).

**Behobene Bugs:** 14 (alle mit Regressionstest AU1–AU11, E6).
**Tests vorher:** 297 (232 + 65). **Tests nachher:** **309** (232 bestehende unverändert + 77 technical). PASS 309 / FAIL 0. Bestehende Tests weder entfernt noch abgeschwächt.
**Datenprüfung:** `verify-technical-data.mjs` OK (26 Instrumente); `verify-quant-data.mjs`, `assert-no-secrets.mjs`, `verify-semantics-parity.mjs` OK; JSON-Validität und Seiten-Checks OK.

**PR-Empfehlung:** kein PR erstellt (Auftrag). Der Branch ist konfliktfrei gegen `origin/main @ 9576ddb` mergebar; nach Merge muss `build-technical-data.mjs` nur laufen, wenn sich `dashboard/data/market_data.json` ändert (Verify schlägt dann bewusst fehl).

### Release-Entscheidung

**SAFE TO MERGE AS BETA.**

Begründung: Der Core (Canonical Data, Pivots, Struktur, Zustandsengines, S/R, Fib, Szenarien, Setup, Score, Snapshots, Renderer, Scanner) hat keine offenen CRITICAL/HIGH-Befunde, ist kausal bewiesen (bit-identische Präfixe auf realen Daten), semantisch sauber (nur SPLIT_ADJUSTED, Splits neutral) und visuell belastbar (36 Renderings). Elliott ist als **BETA** zu kennzeichnen: zweimustrige Grammatik erzeugt Zigzag-Ketten und unlabeled Spans, Counts sind häufig AMBIGUOUS/LOW_CONFIDENCE (ehrlich ausgewiesen), Multi-Degree fehlt. Regulatorische Prüfung der Szenario-Darstellung bleibt ein separates Gate vor einem öffentlichen Launch.

---

## V1.5 Requirements — VISION UNIVERSE® ELLIOTT WAVE V1.5 (nicht implementiert)

| Anforderung | Priorität |
|---|---|
| Multi-Degree Wave Nesting: D2-Historie als Eltern, D1-Trailing als Kinder; Parent-Child-Beziehungen im Wave Tree | **MUST** |
| Degree Consistency: Kind-Muster müssen ein zulässiges Eltern-Muster bilden (bottom-up/top-down Reconciliation) | **MUST** |
| Hierarchical Wave Graph (Pivot-DAG statt einer Zickzacklinie je Skala) | **MUST** |
| Historical Map Persistence: Labels aus Snapshots übernehmen (nicht nur by construction stabil, sondern gespeichert) | **MUST** |
| Improved Corrective Grammar: Flat (3-3-5), Expanded Flat; danach Triangle (3-3-3-3-3) | **SHOULD** |
| Count Stability: Perturbation über Bars und Nachbar-Counts, nicht nur Pivot-Schwellen; Stabilitäts-Zeitreihe je Snapshot | **SHOULD** |
| Alternative Count Ranking mit Diversitäts-Clustering (Current State, Invalidation, Parent Degree) | **SHOULD** |
| Candidate Beam Search mit DP-Caching über den Pivot-DAG (statt greedy lokal) — nur wenn Walk-Forward-stabil | **SHOULD** |
| Degree-aware Fibonacci-Relationen (W3/W1, W5/W1, C/A je Degree) | **SHOULD** |
| Extension Handling (verlängerte Wellen, Truncation als Variante) | **SHOULD** |
| Primary/Intermediate/Minor als UI-Bezeichnung relativ zur Ansicht | **SHOULD** |
| Diagonals (Leading/Ending), Kombinationen W-X-Y(-X-Z), Running Flats | **LATER** |
| Evidence: Elliott-Setups gegen Trend+Pivots+S/R-Baseline (Red-Team-Gate) | **LATER** |

## Vorschlag Master-MD (nach Merge, nicht ausgeführt)

Wie im Phase-1-Report §44, ergänzt um: Teststand 232 → **309**; Release-Audit-Dokument als Referenz; Elliott-Status „BETA, Zwei-Muster-Grammatik, Multi-Degree V1.5“; Regel 16 „SPLIT_ADJUSTED only · Score ≠ Wahrscheinlichkeit · keine Projektion ohne Invalidation · bestätigte Labels werden nie umgeschrieben“; Hinweis, dass `quant/data/market/daily/ref_*.json` RAW sind und für Technical erst mit Split-Daten nutzbar werden.
