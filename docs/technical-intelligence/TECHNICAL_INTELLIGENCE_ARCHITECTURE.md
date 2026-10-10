# VU Technical Intelligence V2 — Architektur

**Produktname in der Oberfläche:** „Chartbild" (die Produktsprache verbietet „Intelligence" in Überschriften, siehe `quant/methodology/product-language-v1.json`).
**Stand:** 02.10.2026 · Branch `claude/vision-universe-technical-intelligence-cxarnz` · Methodik `technical-intelligence-v2.0.0` (eingefroren auf Commit `ce9be420a`).

> Ziel: technische Marktstruktur deterministisch analysieren, mehrere Methoden kombinieren, alternative Szenarien erzeugen, sie historisch prüfen und das Ergebnis verständlich zeigen — **simple on the surface, powerful underneath.**

## 1. Grundsatz und Datenfluss

```
MARKET DATA (splitbereinigt, Tages-OHLCV oder Wochenschluss)
  ↓  ti/context.js            einmal je Serie: Features + Pivots (kausal)
  ↓  analyzeAt(t)             alle Engines lesen nur Bars ≤ t und bestätigte Pivots
     ├ ti/dow-trend.js        Primary/Secondary/Short-Term, Kipp-Niveaus, Weinstein-Stufe
     ├ ti/momentum-volatility Momentum als Bestätigung, Divergenz, ATR-Regime
     ├ ti/volume-intelligence Relatives Volumen, Akkumulation, Anchored VWAP, Volumenprofil
     ├ ti/levels.js           S/R-Zonen (geclusterte Swings, Lücken, 52W), Fibonacci-Konfluenz
     ├ ti/chart-patterns.js   Doppelboden/-top, SKS, Dreiecke, Rechteck, Flagge, Cup & Handle
     ├ ti/wyckoff.js          Handelsspanne, SC/AR/ST/Spring/SOS/LPS, Phasen A–E
     └ elliott/elliott-v2.js  Multi-Degree-Zählung (Regelwerk elliott/patterns.js)
  ↓  ti/scenario.js           Konfluenz → Haupt-/Alternativ-/Randszenario, Zonen, Invalidation,
                              Confidence-Modell (strukturell · Einigkeit · empirisch · kalibriert)
  ↓  Evidence-Lookup          Trefferquote vergleichbarer historischer Setups (Backtest-Tabellen)
  ↓  ti/engine.js             TechnicalAnalysisResult (Schema vu-technical-analysis-2.0.0)
  ↓  ti/explain.js            deutsche Sätze NUR aus Fakten; ti/ai-tools.js für VU Ask
  ↓  build-technical-intelligence.mjs → API v3 (statische JSON/gz; Persistenz-Replay über lib/ti-product.mjs)
  ↓  quant/app/page-chartbild.js + quant/ui/ti-chart.js (Oberfläche, rechnet nicht)
```

**Entscheidender Architekturgrundsatz:** Das Live-Produkt und der Backtest nutzen **denselben Code**. `analyzeAt(P, t)` ist die einzige Analysefunktion; der Backtest ruft sie an jedem Erkennungszeitpunkt auf. Damit gelten die gemessenen Trefferquoten genau für das, was der Nutzer sieht.

## 2. Kausalität (Event Time vs. Detection Time)

| Baustein | Garantie | Test |
|---|---|---|
| Features (`feature-store.js`) | Wert an i nutzt nur Bars ≤ i | bestehend (technical-engines) |
| Pivots (`pivot-engine.js`) | Pivot trägt `pivotIndex` (Event) und `confirmedIndex` (Detection) | technical-pivots |
| `pivotView(t)` | nur `confirmedIndex ≤ t`; Developing-Extrem aus Bars ≤ t rekonstruiert | EV2-C1 |
| Elliott V2 | Ergebnis an t == Ergebnis auf der bei t abgeschnittenen Serie | EV2-C1, EV2-C2 (vergiftete Zukunft) |
| Historische Elliott-Karte | lokale Entscheidungen, Unterteilung beim Bestätigungszeitpunkt eingefroren → kein Repainting | EV2-C3 |
| Gesamtergebnis TI | `analyzeAt(full, t)` == `analyze(slice(t))` inkl. Wochensicht | TI-C1, TI-C2 |
| Wochenkontext | nur **abgeschlossene** Wochen | TI-C3 |
| Chartformationen | Erkennungszeit = max(Ausbruchs-Bar, Bestätigung des letzten Pivots) | TI-E2 |
| Outcomes | Einstieg frühestens t+1, kein Same-Bar-Fill | TI-O1, TI-O2 |

## 3. Module

| Datei | Verantwortung |
|---|---|
| `quant/engines/technical/elliott/patterns.js` | Regelbibliothek `elliott-rules-2.0.1`: 8 Musterklassen, Regeln HARD/DEFINITION, Richtlinien, Invalidation (hart + Revision), Fibonacci-Projektionen mit Klartext-Relation |
| `quant/engines/technical/elliott/elliott-v2.js` (2.2) | Grade (Mehrskalenwahl), Verschachtelung, Unterteilung, historische Karte, Trailing-Kandidaten, Ranking, Alternativen, Klarheit, Count Quality, Anwendbarkeit/Enthaltung, Erkennungsverzug, Kandidatenbaum, Persistenz |
| `quant/engines/technical/ti/context.js` | Zeitrahmen-Profile (1D/1W), kausaler Kontext |
| `quant/engines/technical/ti/dow-trend.js` | Dow-Theorie, MA-Trend, Weinstein |
| `quant/engines/technical/ti/momentum-volatility.js` | Momentum-Bestätigung, Divergenz, Volatilitätsregime |
| `quant/engines/technical/ti/volume-intelligence.js` | Volumen, AVWAP, Volumenprofil |
| `quant/engines/technical/ti/levels.js` | S/R-Zonen, Fibonacci-Konfluenz |
| `quant/engines/technical/ti/chart-patterns.js` | Formationen mit Ausbruchsstatus |
| `quant/engines/technical/ti/wyckoff.js` | Wyckoff quantifiziert (beschreibend) |
| `quant/engines/technical/projection/elliott-projection.js` | Elliott Projection Engine `elliott-projection-1.0.0`: Projektionsleiter Basis/Erweitert/Extrem auf der eingefrorenen Elliott-Ausgabe, Invalidation, Bestätigung, Fahrplan, Leitplanken, Lebenszyklus (siehe ELLIOTT_PROJECTION_ENGINE.md) |
| `scripts/technical/lib/ti-projection.mjs` | Produktschicht der Projektion: Relative Stärke im Querschnitt, Lebenszyklus-Store `v3/projection-theses.json`, Registerform |
| `quant/engines/technical/ti/scenario.js` | Konfluenz, Szenarien, Confidence, Setup-Signatur |
| `quant/engines/technical/ti/engine.js` | Orchestrator, Multi-Timeframe, Ergebnis-Schema, Alert-Zustand |
| `quant/engines/technical/ti/outcomes.js` | Outcome-Simulation, Statistik (Wilson, Lift-KI, Reliability) |
| `quant/engines/technical/ti/explain.js` | deterministische Texte + abschließende Faktenliste |
| `quant/engines/technical/ti/alerts.js` | Alert-Ereignisse aus zwei Zuständen |
| `quant/engines/technical/ti/ai-tools.js` | VU-Ask-Werkzeuge (nur Fakten) |
| `scripts/technical/ti-evidence.mjs` | Backtest / Event-Studie |
| `scripts/technical/build-technical-intelligence.mjs` | API v3 bauen |
| `scripts/technical/lib/ti-product.mjs` | Produktschicht: Elliott-Persistenz-Replay, Datenvertrag `overlays`, Strukturklarheit, Evidenz-Status, Elliott-Transparenz, Replay-Schnappschüsse |
| `scripts/technical/elliott-validation.mjs` + `lib/validation-stats.cjs` | Elliott-Validierungsstudie (Benchmarks, Walk-forward, Cluster-Bootstrap, vorab registrierte Hypothesen) |
| `scripts/technical/elliott-synthetic-benchmark.mjs` | Erkennungsrate bekannter Strukturen (Synthetik) |
| `scripts/technical/verify-technical-intelligence.mjs` | Drift-Prüfung (CI) |
| `quant/api/technical-intelligence-workspace.js` | Lesezugriff mit Pfad-Whitelist |
| `quant/ui/ti-chart.js` | SVG-Szenario-Chart |
| `quant/app/page-chartbild.js`, `quant/app/chartbild.css` | Seiten `#/aktie/<T>/chartbild`, `#/chartlagen`, Methodik-Thema |

## 4. Ergebnis-Schema (`vu-technical-analysis-2.0.0`)

```
symbol, timeframe, asOf, asOfIndex, dataCutoff
price { close, atr, atrPct }
dataQuality { bars, closeOnly, hasVolume, priceSeriesType, dataVersion, source }
outlook { label: BULLISH|BEARISH|NEUTRAL|MIXED, structure, confidence }
regime { volatility, trendPhase, stage }
scenarios[]  { kind: PRIMARY|ALTERNATIVE|TAIL, direction, template, status,
               entryZone{zoneLow,zoneHigh,sources[],confluence,displayStep}, confirmation,
               invalidation{price,direction,basis,rule,ruleId,closeBasis},
               targets[≤3], riskZone, riskAtr, rewardRiskT1, expectedStructure, trigger? }
primaryScenario, alternativeScenario, tailScenario
confidence { overall, structural, agreement, agreementValue,
             empirical{status,n,t1HitRate,t1Ci,baselineRate,lift,liftCiLow,…}|null,
             calibrated{probability,method,brier}|null }
confluence { agreement, direction, outlook, mixed, level, coverage, families[], supporting[], opposing[] }
signature { timeframe, template, direction, agreement, key }   ← identisch im Backtest
evidence { checklist[{family,status,statement}], why[≤3], against[] }
timeframes { daily, weekly{…}, intraday{UNAVAILABLE}, alignment }
methods { trend, momentum, volatility, volume, supportResistance, fibonacci, patterns, wyckoff, elliott }
alerts { scenarioId, outlook, confidence, direction, levels{…}, flags{…} }
diagnostics { engineVersions, repaintingPolicy, isProbability, computeMs }
```

## 5. API v3 (statisch, versioniert; Migration: API_V3_MIGRATION.md)

| Pfad | Inhalt |
|---|---|
| `/quant/data/technical-intelligence/v3/meta.json` | Versionen, Zähler, Evidenzstand, Pfade |
| `…/v3/index.json.gz` | eine Zeile je Titel (Screener, Listen, Alerts): Ausblick, Status, Zonen, Distanz zur Zone in ATR, Elliott, Formationen, Indexmitgliedschaft |
| `…/v3/shards/<XX>.json.gz` | Ergebnis je Titel (Konsument + Profi + Chart + frühere Fälle + Erklärtexte) |
| `…/v3/discover-rows.json` | fertige Reihen für Discover/Startseite mit offengelegter Regel |
| `…/v3/alerts.json` | Ereignisse seit dem letzten Lauf |
| `…/v3/rules-catalog.json` | Regeltext + Quelle je Elliott-Regel |
| `…/v3/evidence-summary.json` | Kennzahlen der Evidenzstudie (Methodikseite) |
| `…/v3/method-evidence.json` | Evidenz-Status je Methode (Validierungsstudie) |
| `/quant/data/technical-intelligence/evidence/*.json` | vollständige Evidenzberichte |

Versionierung: neuer Pfad `v3/` bei inkompatiblem Schema; `schemaVersion` in jeder Datei. Konsumenten: Aktienseite (Teaser), Chartbild, Übersicht, Discover (Reihen), Screener (Index), Alerts, VU Ask (ai-tools), spätere Mobile-App (gleiche JSON).

## 6. Performance

| Messung (lokal, 1 Kern) | Wert |
|---|---|
| `prepare()` Tagesreihe 2.954 Bars (inkl. Wochenaggregat) | 70–160 ms |
| `analyzeAt()` je Zeitpunkt (Tag, inkl. Woche) | 6–30 ms |
| `analyzeAt()` Wochenreihe | 2–5 ms |
| Build API v2: 5 Tages- + 5.287 Wochentitel | ≈ 65 s |
| Evidenzstudie Wochenuniversum (6.348 Reihen, 206.481 Erkennungszeitpunkte, 4 Worker) | ≈ 210 s |
| Datenmenge API v2 | ≈ 28 MB (gz), Shard ≤ 260 KB |

Skalierung: Pivots/Features einmal je Serie, Analysen nur an Ereignissen (Pivot-Bestätigungen) — kein Neurechnen der Historie je Seitenaufruf; die Seite lädt einen Shard (~30–50 KB je Titel unkomprimiert). In CI rechnet die Materialisierung die Tagesanalyse für das ganze Universum (`--work-dir`).

## 7. Verhältnis zu bestehenden Systemen

* **Technical V1** (`technical-analysis.js`, `elliott-engine.js`, Workspace `/technik`) bleibt unverändert in Betrieb; V2 ist ein eigener, getesteter Pfad. Wiederverwendet: `canonical-bars`, `feature-store`, `pivot-engine`, `timeframe`, `hash`.
* **Supertrader**: methodenspezifische Handelssetups; Technical Intelligence: allgemeine Struktur und Szenarien. Gemeinsame Bausteine (Pivots, Features) werden geteilt, Produktlogik bleibt getrennt.
* **Quant/Factor DNA/Momentum**: Momentum wird nicht dupliziert; TI nutzt Momentum nur als Bestätigung. Technische, quantitative und fundamentale Sicht bleiben auf der Aktienseite getrennte Abschnitte und dürfen sich widersprechen.
* **Marktregime**: Backtest segmentiert nach SPY-26-Wochen-Trend (wie `signal-backtest.js`), weil die VU-Breitenregime-Historie erst seit 10.09.2026 existiert.
