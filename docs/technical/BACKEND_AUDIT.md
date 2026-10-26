# Vision Universe Technical – Backend-/Daten-Audit

**Stand:** 26.10.2026 · geprüft: `origin/main` (`0140bf23d0b`) **plus** Zweig `claude/technical-formations-lifecycle` (`16f05606418`, formations 1.2.0, Lebenszyklus und Statusfelder, als gemergt behandelt). Der Zweig enthält `main` bis auf 11 Commits ohne Technical-Bezug (Supertrader/SEC). Gelesen wurde in einem temporären Worktree, der danach entfernt wurde. Es wurde keine Repository-Datei geändert. Erzeuger liefen nur mit `--out` in den Scratchpad.

**Lesart:** „verifiziert“ heißt: selbst gezählt, gemessen oder getestet. „laut Doku“ heißt: nur aus `docs/technical/*.md` übernommen. **Vermutung** ist ausdrücklich so markiert.

---

## 0. Zusammenfassung in zehn Punkten

1. **Die Engines sind solide und gut getestet.** 294/294 Tests der Technical-Suiten sind grün: `quant/tests/technical-*`, `ti-*` und `technical/tests`. Es gibt 24 Indikatoren im Katalog und 24 Formationstypen mit einem Zustandsmodell aus drei Zuständen. Der Screener-Neubau ist **bitgleich reproduzierbar** (29 s).
2. **Der Engpass sind die Daten, nicht der Code.** Im Repository liegen je Titel nur **270 Tagesbars OHLCV**. Dazu kommen Wochen**schlüsse** ohne Hoch, Tief und Volumen. Die volle Tageshistorie (Median 2.903 Bars, bis 9.271 Bars ab 1990) liegt nur in R2 und ist nur im Actions-Runner lesbar. `assert-public-data-hygiene.mjs` begrenzt öffentliche OHLCV-Reihen hart auf 270 Bars und erlaubt in den langen Reihen nur Paare `[Datum, Schluss]`. Grund: `LEGAL_REVIEW_REQUIRED`.
3. **Die EMA 200 ist noch nirgends gefüllt.** Code und Filter sind gemergt (#927, #943). Die committeten Shards stammen aber vom 24.10. und tragen keine `ema200`. Deshalb sind `aboveEma200` und `distEma200` in allen 5.649 Zeilen `null`. Auch `/screener/` und `vu-ask` bieten das Feld schon an.
4. **Relative Stärke in der Materialisierung ist überall `UNAVAILABLE`.** SPY gehört nicht zum Produktuniversum, deshalb setzt `materialize-product-intelligence.mjs:206-209` keinen Benchmark. Das gilt für alle 1.705 geprüften Bundles, NVDA eingeschlossen. Die RS im Screener (ggü. SPY) rechnet `screen-row.js` separat aus `discover-series/ref_SPY`.
5. **Woche und Monat sind nur Schlusskurs-Felder.** Es gibt 9 von 43 Feldern je Zeitrahmen, ohne Formationen, ATR, Volumen oder EMA. Der **Monatsschluss ist in 50,7 % der Titel-Monate nicht der letzte Handelstag**: Median 1,9 %, p90 8,1 % daneben (verifiziert, Abschnitt 4).
6. **Die Formations-Evidenz umfasst nur rund sieben Monate Erkennungsfenster** (25.02. bis 25.09.2026), weil 270 Bars minus 120 Bars Aufwärmphase übrig bleiben. Die Standardfehler sind i.i.d. Querschnittscluster und überlappende Fenster werden ignoriert, die Signifikanz ist also eher überschätzt. Außerdem fehlen Survivorship-Korrektur, Kosten und Out-of-Sample.
7. **Der Automatik-Lauf von `technical-world.yml` ist nicht belegt.** 73 von 73 Läufen wurden übersprungen. Der Workflow hängt nur an `workflow_run`. Die Materialisierung läuft aber per `workflow_call` innerhalb von `market-data-refresh.yml`, und das löst kein `workflow_run` unter ihrem eigenen Namen aus. Übrig bleibt nur der Auslöser „Lange Kursreihen“ (Di bis Sa 04:20 UTC).
8. **Duplikate:** Es gibt drei Technical-Datenstapel: `quant/data/technical` (Golden 5), `technical-intelligence/v3` (Chartbild, Woche mit O=H=L=C) sowie `technical-signals-v1` mit `technical/data`. `/screener/` rechnet RSI, MACD, SMA und EMA ein zweites Mal selbst (`build-universe.mjs:71-110`). `relVol` und `rs6m` haben in `/screener/` und `/technical/` **gleiche Namen, aber verschiedene Definitionen**.
9. **Speicher:** Die Materialisierung baut jedes Mal alles neu (`rmSync(target)`, Zeile 198) und committet 646 Shards mit 238 MB gzip. Das Repository misst laut GitHub API ~16,5 GB. `AA.json.gz` hat 49 Commits.
10. **KI-Suche:** Parser, Schema (13,9 KB), Validierung und `contract()` (Status `VORBEREITET_NICHT_AKTIV`) sind fertig. Es fehlen Gold-Set und Evaluation, ein Worker-Pfad für das Technical-Schema, Mehrzeitrahmen-Abfragen und Ereignisfelder. **Hinweis:** Der *aktive* Worker `vu-ask` (`VU_ASK_ENABLED = "true"`) kennt 16 Technical-Felder bereits heute über `screener/engine/fields.js`, darunter `chartPattern*` und `aboveEma200`.

---

## 1. Inventar der Technical-Infrastruktur

### 1.1 Engines (`quant/engines/technical/`, UMD, 7.775 Zeilen in 42 Dateien, verifiziert mit `wc -l`)

| Datei | Version | Rolle | Wo gerechnet |
|---|---|---|---|
| `feature-store.js` | `features-1.0.0` | Primitive (SMA, EMA, `settledEma`, Wilder, TR, RSI, ADX, Regression, Perzentile) und `computeFeatures` (53 Spalten) | Vollhistorie im Runner und 270er-Fenster im Browser |
| `indicators.js` | `technical-indicators-1.1.0` | Katalog mit 24 Einträgen (Abschnitt 2) | 270er-Fenster (Screener, Chart Studio) |
| `technical-analysis.js` | `technical-bundle-1.0.0`, EMA-Block `ema-settled-1.1.0` | Bundle: Features, Pivots, Struktur, Trend, RS, Volumen, S/R, Fib, Elliott, Szenarien, Score; `featuresAtCutoff`, `chartSeries`, `emaSettlement` | Vollhistorie (Runner) |
| `product-materialization.js` | `technical-product-artifact-1.0.0` | Projektion auf 270 Bars (`DISPLAY_BARS`), eigener `shardKey` | Runner |
| `formations.js` | `technical-formations-1.2.0` | 24 Typen, Lebenszyklus, Statusfelder | 270er-Fenster |
| `ti/chart-patterns.js` | `ti-chart-patterns-1.1.0` | klassische Muster (Lebenszyklus-Modus abschaltbar) | 270er-Fenster bzw. TI |
| `screen-row.js` | `technical-screen-row-1.4.0` | eine Screener-Zeile je Titel (Tag, Woche, Monat) | Erzeuger, Node |
| `technical-query.js` | `technical-query-1.3.0` | Feldkatalog (43), Validierung, Auswertung, Trichter, `jsonSchema()` | Browser und Node |
| `query-text.js` | `technical-query-text-1.2.0` | deterministischer DE-Parser, `contract()` | Browser |
| `timeframe.js` | `tf-agg-1.0.0` | Aggregation 1D→1W/1M am Handelskalender (getestet) | genutzt von `ti/engine.js:52` und `support-resistance.js:118`, **nicht** vom Screener |
| `ti/*` (14 Dateien) | diverse | Chartbild (TI v3): Kontext, Levels, Dow, Wyckoff, Volumen inkl. **Anchored VWAP**/Volume Profile, Szenario, Outcomes | Build `technical-intelligence-build.yml` |
| `elliott/*`, `projection/*` | v2/v3 | Elliott (experimentell) | TI-Build und Materialisierung |

### 1.2 Datenartefakte (verifiziert)

| Artefakt | Inhalt | Größe | Stand |
|---|---|---|---|
| `quant/data/product/technical-signals-v1/<XX>.json.gz` | 646 Shards, 5.655 Bundles; je Titel **270 Tagesbars OHLCV** (SPLIT_ADJUSTED), `featuresAtCutoff` (53 Felder, Vollhistorie), `chartSeries` (sma20/50/200, atr, rsi14, relativeVolume), Pivots, Struktur, Annotationen | 238 MB gz / 1,56 GB roh | `generatedAt` 24.10. 02:33; Stichtag 23.10. (5.574), **81 Titel älter** |
| `…/summary.json` | Zählungen: Universum 6.686, Historien 6.685, `INSUFFICIENT_HISTORY` 998, Kalender-Ausschlüsse 32 | – | 24.10. |
| `…/signals-{5,20,60}.json.gz` | Signal-Payloads | – | 24.10. |
| `technical/data/screener-v1.json` | 5.649 Zeilen, **67 Spalten**, spaltenbasiert | 4,15 MB / 0,85 MB gz | asOf 23.10. |
| `technical/data/index-v1.json` | schlanker Index für Start und Chart Studio | 174 KB | 23.10. |
| `technical/data/meta.json` | Zählungen, Versionen, Formationszählungen | 2,8 KB | 23.10. |
| `technical/data/formation-evidence.json` | Evidenzstudie, 87.870 Erkennungen | 9,5 KB | Zweig |
| `quant/data/market/discover-series/ref_*.json` | 6.679 Titel, **Tagesschlüsse**, max 270 Punkte (1 J.) | 51 MB | 23.10. |
| `quant/data/market/discover-series-long/ref_*.json` | 6.190 Titel, **Wochenschlüsse** `[Datum, Schluss]`, Median 514 Wochen, max 1.921 | 112 MB | 24.10. |
| `quant/data/technical-intelligence/v3` | Chartbild: Tagesanalyse für 5 Titel, Wochenanalyse für 5.038 Titel (O=H=L=C) | 109 MB | 24.10. |
| `quant/data/technical` | Altbestand Golden 5 (`build-technical-data.mjs`) | 3,3 MB | – |
| `quant/data/market/intraday` | 5-Min-Verläufe, IEX, **nur 2 Sitzungen** | 41 MB | 23.10. |

### 1.3 Erzeuger und Workflows

| Workflow | Erzeuger | Auslöser | ADR-005 |
|---|---|---|---|
| `market-data-refresh.yml` | Tiingo → R2, Discover-Reihen; ruft per `uses:` (Zeile 512) `product-intelligence-materialization.yml` | cron `30 22 * * 1-5` | ok |
| `product-intelligence-materialization.yml` | `scripts/technical/materialize-product-intelligence.mjs` (`sync-history-store.mjs --pull`, Zeile 166) | `workflow_call`, `workflow_run`, dispatch, push `codex/**` | **Concurrency-Gruppe ohne `-${{ github.ref_name }}`** (Zeile 69) |
| `long-series.yml` | `publish-long-series.mjs` | cron `40 7 1-7 * 6` (voll) und `20 4 * * 2-6` (Reparatur) | ok |
| `technical-world.yml` | `scripts/technical/world/build-screener.mjs` inkl. Evidenz | **nur** `workflow_run` (Materialisierung, Lange Kursreihen) und dispatch | ok (`ref`, push-with-retry, Gruppe mit `ref_name`) |
| `technical-ci.yml` | Tests, Browser-QA | PR und push auf Technical-Pfade | `contents: read` ok |
| `technical-intelligence-build.yml` | `build-technical-intelligence.mjs` (**ohne** `--work-dir`, also Tagesanalyse nur Golden 5) | cron `35 5 * * *`, `workflow_run` | – |

**Befund Laufkette (verifiziert per `gh run list`):** `technical-world.yml` hat 73 Läufe, alle `skipped`, alle aus Fremdzweigen. Ein erfolgreicher Automatik-Lauf auf `main` ist nicht belegt; alle `technical/data`-Commits stammen von Claude-PRs. `long-series.yml:37` dokumentiert selbst, dass `workflow_run` auf `main` „nachweislich nie gefeuert“ hat. Mit großer Sicherheit ist der einzige wirksame Auslöser der Reparaturlauf von „Lange Kursreihen“ (Di bis Sa 04:20 UTC). Hängt die Materialisierung (Timeout 300 min) bis dahin noch, baut der Screener auf alten Shards. Das ist nicht verifiziert, weil seit dem Merge kein Handelstag-Lauf stattfand.

### 1.4 Gates und Prüfungen

- `assert-public-data-hygiene.mjs`: OHLCV höchstens 270 Bars je Titel (Zeile ~221), lange Reihen nur `[Datum, Schluss]` (~Zeile 116), Umfang nur Preview-Scope, Provenienz PASS.
- `verify-technical-data.mjs`: prüft **nur die 5 Golden-Instrumente** in `quant/data/technical` (lief grün), nicht `technical-signals-v1` und nicht `technical/data`.
- `technical/tests/technical-world.test.mjs` (15 Tests): Datensatz gegen Engines.
- `scripts/core/data-quality.mjs` (lief): Es gibt **keine DQ-Regel für `technical-signals-v1` oder `technical/data`**. Selbst geprüft: Die Schlusskurse von 1.525.400 Punkten aus `technical-signals-v1` stimmen mit `discover-series` überein, mit 0 Abweichungen über 0,5 %.
- Ein eigenes Isolations-Gate für Technical gibt es nicht (keins in der CLAUDE.md-Tabelle). `core/registry/domains.json` führt `technicalWorld` mit dem Erzeuger `build-screener.mjs`.

### 1.5 Tests (selbst ausgeführt)

| Suite | Tests |
|---|---|
| `technical-indicators` | 15/15 |
| `technical-indicators-ext` | 7/7 |
| `technical-formations` | 17/17 |
| `technical-query` | 9/9 |
| `technical-query-text` | 5/5 |
| `technical-ema200-materialization` | 12/12 |
| `technical-engines` 7, `technical-canonical` 11, `technical-pivots` 10, `split-adjust-technical-equivalence` 7 | alle grün |
| `technical/tests/*.test.mjs` | 15/15 |
| **gesamt** `quant/tests/technical-*` + `ti-*` + `technical/tests/*` | **294/294**, 25,8 s |
| `verify-technical-data.mjs` | OK (5 Instrumente) |
| `build-screener.mjs --out <scratch> --no-evidence` | 29 s, `screener-v1.json` und `index-v1.json` **bytegleich** mit dem Commit |

Nicht selbst ausgeführt: volle `quant/tests` (laut Doku 2.943/2.943), Browser-QA (laut Doku 54/54).

---

## 2. Indikatoren

### 2.1 Vorhanden (verifiziert in `indicators.js:320-372` und `feature-store.js:278-365`)

Alle Einträge sind laut Kopfkommentar und Kausalitätstest kausal (`technical-indicators.test.mjs`: „Werte an i hängen nicht von Bars nach i ab“).

| Indikator | Parameter | Aufwärmphase (Katalog) | Ort | Screener-Feld |
|---|---|---|---|---|
| SMA | 20/50/200 (Features), frei im Katalog | p−1 | **Vollhistorie** (`featuresAtCutoff`, `chartSeries`) | aboveSma50/200, distSma50/200, sma50AboveSma200 |
| EMA | 20/50 (Features), frei | p−1 | Vollhistorie (`featuresAtCutoff.ema20/50`, ungeprüfte Aufwärmphase); `chartSeries.ema20/50/200` mit `settledEma` | aboveEma20/50 |
| EMA 200 eingeschwungen | Regel `ema-settled-1.1.0` (Fehlerschranke ≤ 0,1 %, Startgewicht ≤ 5 %) | ≥ 500 Bars | Vollhistorie | aboveEma200, distEma200 (**heute überall null**) |
| WMA | 20 | p−1 | Katalog (Fenster) | – |
| ADX/+DI/−DI | 14 | 2p−1 | Vollhistorie | adx |
| Supertrend | 10/3 | p−1 | Fenster (pfadabhängig) | supertrendUp |
| Donchian | 20 | p−1 | Fenster; `donchianWidthPct` Vollhistorie | – |
| Parabolic SAR | 0,02/0,2 | 1 | Fenster (pfadabhängig) | psarUp |
| Ichimoku ohne Chikou | 9/26/52/26 | 77 | Fenster | aboveCloud |
| VWMA | 20 | p−1 | Fenster | – |
| RSI (Wilder) | 14 | p | Vollhistorie; Woche/Monat auf Schlüssen | rsi14 (1D/1W/1M) |
| MACD | 12/26/9 | 34 | Vollhistorie | macdPositive |
| Stochastik langsam | 14/3/3 | 17 | Fenster | stochK |
| ROC | 21 (Katalog), 10/21 Features | p | Vollhistorie | roc21 |
| CCI | 20 | p−1 | Fenster | cci20 |
| Williams %R | 14 | p−1 | Fenster | williamsR |
| Aroon | 25 | p | Fenster | aroonOsc |
| ATR (Wilder) | 14 | p−1 | Vollhistorie | atrPct |
| Bollinger | 20/2 | p−1 | Fenster (%B); Breitenperzentil Vollhistorie | bbPctB, bbSqueeze |
| **Keltner** | 20/2/10 | max−1 | Fenster | – (nur Chart) |
| OBV | – | 0 | Fenster (Start 0, nur Differenz sinnvoll) | obvRising |
| MFI | 14 | p | Fenster | mfi14 |
| CMF | 20 | p−1 | Fenster | cmf20 |
| Relatives Volumen | 20 (Median) | p | Vollhistorie | relVol, volAboveAvg, volSpike |
| Volumenspitzen | 20/2 | p | Fenster | – |

Weitere Features nur in `computeFeatures` (Vollhistorie, nicht im Katalog): realisierte Vola 20/60, Downside-Vola, 52W-Hoch/-Tief, Drawdown, Regressions-Steigung/R²/z (60), MA-Steigung in ATR, Momentum 1/3/6/12 M mit z-Werten, 12-1-Momentum, ATR%-Perzentil, Gap %.

Nur in TI (Chartbild), nicht im Katalog oder Screener: **Anchored VWAP** (typischer Preis, Tagesbars; `ti/volume-intelligence.js:28`), Volume Profile, Dow-Trend, Wyckoff, Fibonacci (`fibonacci.js`), ATR-ZigZag-Pivots (`pivot-engine.js`).

**Referenztests:**
- Jeder Katalogindikator wird gegen eine **eigene naive Formel** auf dem eingefrorenen AAPL-Ausschnitt geprüft (`quant/tests/fixtures/technical-reference-aapl.json`).
- Dazu kommen Handbeispiele für Parabolic SAR und Aroon, Gleichheit mit den Quant-Features (RSI, ADX), die Aufwärmphase gleich erstem Wert, Determinismus und Lücken.
- **Lücke:** Es gibt keinen Abgleich mit einer externen Referenz (z. B. TA-Lib- oder TradingView-Werte als eingefrorene Fixture). Naive Formel und Engine können denselben Konventionsfehler teilen.

**Pfadabhängigkeit im Fenster (selbst gemessen):**
- Parabolic SAR und Supertrend werden auf 270 Bars gerechnet.
- Startet das Fenster 100 Bars später, kippt die Richtung am letzten Bar bei 44 (SAR) bzw. 47 (Supertrend) von 5.655 Titeln (~0,8 %).
- Gegenüber der Vollhistorie ist die Abweichung bei 270 Bars vermutlich kleiner, aber nicht null. Messbar ist das nur im Runner (**Vermutung**).

### 2.2 Fehlende Standardindikatoren (geprüft per `grep` über `quant/engines`, `technical`, `screener/engine`)

| Fehlt | Datenbedarf | Machbar mit heutigen Daten? |
|---|---|---|
| Wochen-/Monats-EMA, Wochen-MACD, -ATR, -ADX, -Stochastik | Wochen-OHLC | EMA, MACD und RSI auf Schlusskursen ja. ATR, ADX, Stochastik und alles mit Hoch/Tief: nein (Abschnitt 4) |
| VWAP (Sitzung), rollierender VWAP | Intraday, konsolidiertes Volumen | nein (Intraday: 2 Sitzungen, IEX). Anchored VWAP auf Tagesbars gibt es in TI und könnte in den Katalog |
| Pivot Points (Floor/Camarilla/Fibonacci) | Vortages-H/L/C | **ja, trivial** |
| ROC-Varianten (5/10/63/126/252), Momentum-Perzentil | Schlüsse | ja; Features haben `roc10`, `momentum*` bereits, aber nicht im Screener |
| TRIX, Ultimate Oscillator, Ease of Movement, Chande (CMO), KAMA, Hull MA, DEMA/TEMA, Know Sure Thing, PPO, Elder Ray/Force Index, Chaikin Oscillator, A/D-Linie | OHLCV | ja, aus 270 Bars (TRIX und KAMA mit Aufwärmphase < 270) |
| Lineare Regressionskanal (±σ), Standardfehlerbänder | Schlüsse | ja; `regressionSlope/R2` existieren schon in den Features |
| ATR-Bänder/Chandelier Exit, Kaufman Efficiency Ratio, Choppiness Index, Vortex | OHLC | ja |
| Heikin-Ashi | OHLC | ja (Darstellung und Ableitung) |
| Historische Volatilität als Perzentil, NR7, Inside/Outside Day | OHLC | ja; `atrPctPercentile` und `bollingerWidthPercentile` existieren schon |
| **Relative Stärke ggü. Sektor/Branche** | Sektorreihen | Engine kann `vsSector` (`relative-strength-engine.js:5`). Es fehlen Sektorbenchmarks (SIC-Peer-Taxonomie liegt vor: `sic-peer-taxonomy-v1.json`). Gleichgewichtete Peer-Indizes aus `discover-series` wären ohne neuen Anbieter machbar (**Vermutung**: methodisch eine Owner-Entscheidung) |
| RS-Rang/Perzentil (IBD-Stil) | Querschnitt | ja; `/screener/` hat `rsPct` aus Quant |
| Kerzenmuster (Engulfing, Hammer, Doji …) | OHLC | ja; **komplett fehlend** |

---

## 3. Formationen

### 3.1 Bestand (verifiziert: `technical-query.js` FORMATION_TYPES, `formations.js`)

**Typen (24):**
- Symmetrisches, aufsteigendes und absteigendes Dreieck; Rechteck
- Bullische und bärische Flagge; bullischer und bärischer Wimpel
- Steigender und fallender Keil
- Doppeltop und Doppelboden; Schulter-Kopf-Schulter und inverse SKS
- Tasse mit Henkel
- Unterstützungs- und Widerstandstrendlinie; Auf- und Abwärtskanal
- Range-Ausbruch, Ausbruch über Widerstand (Zone mit ≥ 2 Kontakten)
- Volatilitätskontraktion
- Kurslücke nach oben und unten

**Zustände und Lebenszyklus:**
- Zustände: `DETECTED`, `CONFIRMED`, `INVALIDATED`.
- Seit 1.2.0 gibt es zusätzlich die Statusfelder `confirmedAtDetection`, `breakout{at,direction}`, `provisional` (Vier-Punkt-Kanal) und `directionOpen`.
- Lebenszyklus über Anker (`formations.js:518 legacy`): `LEGACY_KEEP` = 10 Bars; abgelöste, unaufgelöste Formationen höchstens 21 Bars; `maxAge` ⅓ Jahr.
- Grundlage sind nur bestätigte Pivots auf Skala 2 (`max(3 ATR, 4 %)`).
- Kausalitätstests mit „vergifteter Zukunft“ prüfen an 23 AAPL-Ständen und auf drei konstruierten Reihen.

**Heutige Zählung** (`meta.json`, 23.10.): Es gibt 5.649 Zeilen. Am häufigsten sind Widerstandstrendlinie (1.240 erkannt, 379 bestätigt) und Unterstützungstrendlinie (680/280). Am seltensten sind Tasse mit Henkel (2 bestätigt) und bullische Flagge (7 bestätigt).

**Evidenz** (`formation-evidence.json`):
- 87.870 Erkennungen; Horizont k+20; Überrendite gegen das Querschnittsmittel; Bonferroni über alle Typen.
- Belastbar sind nur die **bullische Flagge** (+1,90 % ± 1,09) und die **Lücke nach oben** (−0,54 % ± 0,28).

### 3.2 Schwächen

| # | Schwäche | Beleg | Art |
|---|---|---|---|
| F1 | Keile sind bei Erkennung zu 51 bis 55 % schon ausgebrochen, symmetrische Dreiecke zu 58 %. Strukturell: Die Restbreite liegt unter der Pivot-Schwelle. Der Owner hat sich für Etikettieren entschieden, nicht für Weglassen. | FORMATIONS_LIFECYCLE.md §3.3, §8 | Fachmodell |
| F2 | Vier-Punkt-Kanäle sind binnen 20 Bars zu 68 bis 75 % invalidiert, also viel „Rauschen“ | §4 | Fachmodell |
| F3 | Die Erkennung kommt grundsätzlich spät: bestätigte Pivots brauchen eine Gegenbewegung von `max(3 ATR, 4 %)`. Es gibt keine zweite, feinere Skala für Formationen (Skala 1 bleibt ungenutzt). | `formations.js` RULES | Fachmodell |
| F4 | Formationen nur im **Tageschart** und nur auf dem 270er-Fenster. Große Basen (Tasse mit Henkel über 6 bis 18 Monate, Mehrjahres-Dreiecke) sind kaum erfassbar. Tasse mit Henkel: n = 57 in einem Jahr | Evidenz | Datenlücke |
| F5 | Abgelöste, unaufgelöste Formationen „verfallen“ nach 21 Bars ohne eigenen Zustand (Rest bis 4,5 %) | §8 | Fachmodell |
| F6 | Die Browser-Historie (`Formations.history`, 252 Bars) ruft je Pivot `analyzeAt` auf. Eine Zeitmessung fehlt. | §8 | Technik |
| F7 | Keine Kennzahlen zur Qualität je Formation (Höhe in ATR, Volumenbestätigung beim Ausbruch, Kursziel nach Messregel), die filterbar wären. Nur die Lücke kennt einen Volumen-Faktor. | `screen-row.js` Tupel | Fachmodell |
| F8 | Datenverdacht: `suspectJump` (Split-Signatur oder Faktor außerhalb 0,2 bis 5) unterdrückt nur Lücken. Andere Formationen über einem nicht nachgezogenen Split bleiben (56 Titel mit `suspectJumpAt` in 60 Bars). | `screen-row.js:183`, `formations.js:403` | DQ |

### 3.3 Fehlende Typen

`ti/chart-patterns.js:9-10` schließt Broadening und Island Reversal bewusst aus („schwach formalisierbar“, „selten“).

| Fehlt | Bemerkung |
|---|---|
| Dreifachtop/-boden | direkte Erweiterung von Doppeltop/-boden (Pivots vorhanden), S |
| Rounding Bottom/Saucer | braucht > 270 Bars, sinnvoll erst mit Wochen-OHLC, M |
| Broadening (Megaphone), Diamond | schwach formalisierbar, M/L |
| Island Reversal | Lückenlogik existiert (zwei gegenläufige Lücken), S |
| Inside/Outside Bar, NR4/NR7, Pocket Pivot, Key Reversal | Bar-Muster, S |
| Kerzenmuster | fehlt komplett, M |
| Base-Zählung, Stage-Analyse (Weinstein) als Screener-Feld | Stage-Linie `sma150` liegt im TI-Profil, ist aber nicht im Screener, S/M |
| Formationen auf Woche/Monat | nur mit OHLC-Wochen sinnvoll; heute TI auf Wochenschlüssen O=H=L=C |

---

## 4. Mehrere Zeitrahmen

### 4.1 Heute (verifiziert)

**Tag:**
- 270 Bars OHLCV im Repository.
- Vollhistorien-Features nur als Wert am Stichtag (`featuresAtCutoff`) bzw. als 270 Werte in `chartSeries` (sma20/50/200, atr, rsi14, relVol; EMA 20/50/200 nach dem nächsten Lauf).

**Woche:**
- `screen-row.js:44 closeOnlyBlock(wc, 40, 10, 52)` auf `discover-series-long`, also nur Schlüsse.
- Felder `@1W`: über SMA 40 und SMA 10, 10 über 40, Abstand SMA 40, RSI 14, 52W-Schlusshoch, Abstand dazu (+ tf-unabhängig 200W-Hoch). Das sind **9 von 43 Feldern**.
- Der Feldname `aboveSma200@1W` meint die 40-Wochen-Linie. Das ist nur im Label erklärt.
- Die laufende Woche fällt weg, wenn der Stichtag kein Freitag ist (Zeile 165, Feiertagsfreitag eingeschlossen).

**Monat:**
- `monthlyFromWeekly` (Zeile 57): letzter **Wochen**schluss je Kalendermonat.
- Selbst gemessen über 72.344 Titel-Monate: Der so gebildete Monatsschluss ist in **50,7 %** nicht der Schluss des letzten Handelstags. Abweichung: Median 1,9 %, p90 8,1 %, p99 27,9 %.
- Ursache: Endet ein Monat vor Freitag, gehören dessen letzte Tage zur Woche des Folgemonats.
- Betroffen sind alle `@1M`-Felder (SMA 5/10, RSI 14, 12-Monats-Hoch).

**Chartbild (TI v3):**
- Wochenanalyse für 5.038 Titel auf `weeklySeriesFromPoints` mit **O=H=L=C** und ohne Volumen (`scripts/technical/lib/ti-data.mjs:31-36`).
- Spannen- und Volumenbefunde sind deshalb `UNAVAILABLE`.
- Die Wochen-Evidenz trägt `calibrationPassed: false` (`technical-intelligence/v3/meta.json`).

### 4.2 Datenlage je Titel (verifiziert)

| Quelle | Wo | Länge | Felder |
|---|---|---|---|
| R2-Tageshistorie (Tiingo, kanonisch) | nur im Runner (`sync-history-store.mjs --pull`) | `provenance.sourceBars`: p10 722, p25 1.413, **p50 2.903**, p75 6.913, max 9.271 (ab 1990); 4.895 Titel ≥ 1.000 Bars, 3.095 ≥ 2.500 | OHLCV + splitFactor + Dividende |
| `technical-signals-v1` | Repository | 270 Bars | OHLCV, SPLIT_ADJUSTED |
| `discover-series` | Repository | ≤ 270 | Schluss |
| `discover-series-long` | Repository | Median 514 Wochen, max 1.921 | Wochenschluss |
| `intraday` | Repository | 2 Sitzungen | 5 Min, IEX |

### 4.3 Wochen- und Monats-OHLCV ohne neuen Anbieter?

**Technisch ja.**
- `timeframe.js#aggregate` (getestet in `technical-canonical.test.mjs` und `ti-engine.test.mjs`) bildet Wochen- und Monatsbars am echten Handelskalender aus Tages-OHLCV.
- Im Runner liegt die volle Tageshistorie.

**Veröffentlichung:** Rohe Wochen- oder Monats-OHLCV-Reihen wären neue öffentliche Kursdaten jenseits der 270-Bar-Ausnahme. Das blockiert das Hygiene-Gate (`LEGAL_REVIEW_REQUIRED`). Das ist eine **Owner-/Rechtsentscheidung**.

**Ohne Rechtsfrage machbar:**
- **Abgeleitete Werte** im Runner rechnen: `featuresAtCutoff1W` und `featuresAtCutoff1M` (EMA, ATR, ADX, Stochastik, MACD, Volumen, 52W) sowie Formationen Stand Woche bzw. Monat, so wie heute die Tagesfeatures.
- Der Screener liest dann Werte statt Bars.
- Der korrekte Monatsschluss ließe sich ebenso als abgeleiteter Wert liefern.

**Aus dem Repository allein:** 270 Tagesbars ergeben rund 54 Wochen- und 12 Monats-OHLC-Bars. Für Wochen-EMA 40 oder Monats-RSI reicht das nicht.

---

## 5. Historische Validierung, Backtesting, Datenqualität

### Was es gibt (verifiziert)

**Formations-Evidenz** (`scripts/technical/world/formation-evidence.mjs`):
- `analyzeAt` an jedem Bar; Aufwärmphase 120; Horizont 20; Mindest-n 100; Bonferroni.
- Fenster: 25.02. bis 25.09.2026, also nur **~150 Erkennungs-Bars je Titel, ein Regime**.
- Es ist eine beschreibende Statistik **ohne Kosten** (steht so im Artefakt).

**`ti/outcomes.js`** (`ti-outcomes-1.0.0`):
- Echte Ausführungsregeln: Limit-Einstieg, Schluss-Invalidierung, Zeitablauf 126 Bars, **10 bp Kosten je Seite**, Zufalls-Baseline gleicher Geometrie.
- Genutzt wird es nur für TI-Szenarien (Golden 5 täglich bzw. Woche), **nicht für Formationen**.

**ADR-002:**
- `split-adjust-technical-equivalence.test.mjs` (7/7): `Canonical.fromPriceBars` ist gleich `return-series.js#splitFactors`.
- `screen-row.js` rundet über `published-close.js#roundClose`.

**DQ:**
- DQ-PX-3 meldet 303 Titel mit Sprung > 60 %.
- `suspectJumpAt` in der Screener-Zeile betrifft 56 Titel in 60 Bars.
- DQ-PX-4 (Tages- gegen Wochenschluss) ist PASS.

### Lücken und Risiken

| # | Lücke | Wirkung |
|---|---|---|
| V1 | **Nur rund sieben Monate Erkennungsfenster** | Evidenz gilt nur für ein Regime, keine Zyklen. Fast alle Typen sind „nicht belastbar“. |
| V2 | **Standardfehler i.i.d.** (`formation-evidence.mjs:75-77, 125`). Erkennungen am selben Tag sind über den Markt korreliert, und 20-Tage-Fenster je Titel überlappen. | Konfidenzintervalle eher zu eng, „signifikant“ eher zu optimistisch. Besser: nach Datum clustern oder Block-Bootstrap. |
| V3 | **Survivorship:** `technical-signals-v1` enthält nur das heutige Universum | Formationen auf später delisteten Titeln fehlen. Quant hat `delisted-weekly` und `survivorship-control-v1.json`, Technical nicht. |
| V4 | Keine Kosten und keine Handelssimulation für Formationen | Kein Nettoergebnis |
| V5 | **In-Sample:** Die Lebenszyklusregeln (1.2.0) wurden auf demselben Fenster entworfen und bewertet | Kein Out-of-Sample |
| V6 | Keine Evidenz für Indikator-Bedingungen oder Screener-Abfragen (z. B. „Was brachte Abfrage X historisch?“) | – |
| V7 | Keine DQ-Regel für `technical-signals-v1` und `technical/data`: Stichtag, Frische, 81 Titel mit altem Stichtag, Paritäten. `verify-technical-data.mjs` prüft nur die Golden 5. | Stille Drift möglich. Die Parität der Schlüsse habe ich selbst geprüft: 0 Abweichungen. |
| V8 | Splits/Abspaltungen in der Quelle nicht nachgezogen (DQ-PX-3). Technical korrigiert bewusst nichts. | Falsche Formationen und Indikatoren bei rund 56 Titeln |
| V9 | 6 Vorzugsaktien fehlen im Screener **ohne Grund in `meta.json`**: Das Regex in `build-screener.mjs:75` (`/^[A-Z0-9_]{2}\.json\.gz$/`) überspringt die Shards `C-`, `F-`, `T-` (C-P-N, F-P-B/C/D, T-P-A/C). Daher 5.649 statt 5.655. | Klein; entweder gewollt und dann als Grund melden, oder ein Fehler |

**Der Hebel für V1, V3 und V5:**
- Die Evidenz im Runner auf der **vollen R2-Historie** rechnen (Median 11 Jahre) und nur die Aggregate veröffentlichen.
- Die Infrastruktur dafür steht schon in `product-intelligence-materialization.yml`. `build-setup-backtest.mjs --work-dir "$RUNNER_TEMP/canonical-history"` macht es für Quant vor.

---

## 6. Screener über das ganze Universum

**Abdeckung** (`meta.json`, 23.10.):

| Kennzahl | Wert |
|---|---|
| Zeilen | 5.649 |
| fresh / stale | 5.570 / 79 |
| mit Volumen | 5.606 |
| mit Wochenreihe ≥ 40 | 5.642 |
| mit 200 Wochen | 4.892 |
| suspectJump60 | 56 |
| noBundle | 0 |

- Produktuniversum 6.686.
- Es fehlen 998 Titel mit `INSUFFICIENT_HISTORY` (< 300 Bars), 32 durch die Kalenderprüfung, 1 ohne Quelle (`summary.json`) und 6 durch das Shard-Regex (V9).

**Laufzeit:**

| Schritt | Zeit |
|---|---|
| Zeilen | 29 s (gemessen) |
| mit Evidenz | 2:20 min (laut Doku) |
| Auswertung einer Abfrage mit 2 Gruppen in Node, inkl. Laden des JSON | 34 ms (gemessen) |

**Felder:**
- 43 Felder: 9 für alle Zeitrahmen, 2 zeitrahmenunabhängig, Rest nur Tag; dazu 8 Vorlagen.
- Fehlende Werte (Spalte null, verifiziert): `aboveEma200`/`distEma200` 5.649, `newHigh200w` 757, `relVol` 205, `cmf20` 197, `bbPctB` 108, `rsi14@1M` 55, `rs6m` 39, `adx` 15.

**Grenzen der Abfrage** (`technical-query.js`):

| Grenze | Wert |
|---|---|
| Gruppen | max. 6 (`MAX_GROUPS`) |
| Filter | max. 30 |
| Limit | max. 500 |

- Zwei Ebenen: Gruppen sind intern UND/ODER, außen UND/ODER verknüpft.
- **Ein Zeitrahmen je Abfrage.** „Woche über 40W-Linie UND Tag RSI < 30“ ist nicht formulierbar. Der Parser meldet dann ehrlich `FIELD_NOT_AVAILABLE_FOR_TIMEFRAME` (selbst geprüft).
- Es gibt keine Negation (NICHT), keine Feld-gegen-Feld-Vergleiche (Kurs > EMA 20 der Woche) und keine **Ereignisfelder** („heute über SMA 200 gekreuzt“, „Ausbruch in den letzten N Tagen“, „Formation seit ≤ 5 Tagen“). Die Zeitpunkte stecken zwar im Tupel `formations`, sind aber nicht filterbar.
- Es gibt **keinen historischen Screener**: Nur der letzte Bar ist abfragbar.
- Kleinigkeit: Der Trichter zählt fehlende Werte nur in UND-Gruppen. ODER-Gruppen melden fest `missing: 0` (Zeilen 228 und 241).

**Integration in `/screener/`** (PR #936, verifiziert in `build-universe.mjs:168` und `fields.js:200-240`):
- 19 Spalten `tw*` werden übernommen und nicht neu gerechnet, darunter `twEma200`, `twDistEma200` und `twFormO`.
- Titel mit einem Technical-Stand älter als 7 Tage bleiben leer.
- **Aber:** `/screener/` rechnet RSI 14, MACD-Histogramm, SMA, EMA 21 und Bollinger %B selbst aus `discover-series` (`build-universe.mjs:71-110`). Selbst verglichen:
  - `distSma50/200` und `dist52wH` stimmen auf 5e-5 überein.
  - RSI: Median 0,003, p99 0,65, **max 50** Punkte Differenz.
  - `relVol` heißt in beiden Welten gleich, meint aber 20T/60T-Durchschnitt in `/screener/` und Volumen gegen 20T-Median in `/technical/`.
  - `rs6m`: Quant-RS gegen SPY-Renditedifferenz, p50-Differenz 0,02, p99 2,7.
  - Für Nutzer und für `vu-ask` ist das verwirrend.

---

## 7. Materialisierung, Speicher, Wiederverwendung

**Was wo gerechnet wird:**
- **Runner, volle R2-Historie:** `technical-analysis.js` (Bundle, Features, EMA settled), Projektion auf 270 Bars. Das sind die einzigen Vollhistorien-Werte.
- **Repository, `build-screener.mjs`:** `indicators.js` und `formations.js` auf 270 Bars, Woche und Monat aus `discover-series-long`, RS aus `discover-series/ref_SPY`.
- **Browser (Chart Studio):** Indikatoren und Formationshistorie erneut auf 270 Bars. SMA 10/40 W aus der langen Reihe.

**Duplikate:**
- **EMA:** `feature-store.js` (Quelle), `discover/engines/indicators.js`, `scripts/screener/build-universe.mjs#emaSeries`, `scripts/supertrader/source-faithful/common/series.mjs`.
- **SMA:** 13 Dateien.
- **RSI:** 3 Dateien.
- Laut Fortschrittsbericht: SMA ~14×, EMA 5×, ATR 5×.
- **Drei Technical-Datenstapel:** `quant/data/technical` (Golden 5, `build-technical-data.mjs`), `technical-intelligence/v3` (109 MB) und `technical-signals-v1` mit `technical/data`.
- **Zwei Shard-Schlüssel:** `product-materialization.js#shardKey` behält `-`/`.` (`C-P-N` → `C-`). `core/identity.js#shardKey` entfernt sie (`C-P-N` → `CP`). ADR-001 verlangt Identität nur über `core/identity.js`. Der Bestand ist älter. Eine Angleichung ändert Pfade (eigener PR, Release-Kopplung `by-ticker`).

**Benchmark (siehe 0.4):**
- `materialize-product-intelligence.mjs:206-209` sucht SPY im Produktuniversum, findet es nicht und setzt `benchmark = null`.
- Folge: `bundle.relativeStrength` ist durchgehend `UNAVAILABLE`, auch `vsSector`, und `benchmarkId` ist null.
- Der `summary.json`-Kommentar „SPY als Benchmark-Referenz, 02.10.2026“ wirkt hier also nicht.
- Eine Reparatur ändert Trend, Szenarien und Score, falls die RS einfließt. Das ist eine **Fachmodelländerung**.

**Größen:**

| Artefakt | Größe |
|---|---|
| Shards | 238 MB gz / 1,56 GB roh |
| EMA-Block | +20 MB gz (laut Doku) |
| `screener-v1` | 0,85 MB gz |
| `formation-evidence` | 2,3 KB gz |
| Repository laut GitHub | ~16,5 GB |
| lokaler flacher Klon (`git count-objects`) | 16,65 GiB |

**Inkrementell?**
- Nein. Die Materialisierung löscht und schreibt alle 646 Shards (`rmSync(target, …)`, Zeile 198) und committet sie bei neuem Stichtag. Da jeder Titel täglich einen Bar dazubekommt, ändern sich praktisch alle Blobs.
- Bei ~240 MB je Lauf wächst die Git-Historie ungebremst (`AA.json.gz` hat 49 Commits).
- Technical-world rechnet ebenfalls voll, ist mit 30 s aber billig.

**Chancen:**
- (a) Shards nicht mehr ins Git, sondern nur ins Release bzw. eine Artefaktablage. Der Release-Bau erzeugt `by-ticker` ohnehin selbst (`build-release.mjs:54`). Architekturentscheidung, L.
- (b) Das Anzeigefenster als Ringpuffer mit unverändertem Kopf; Bundle-Teile ohne Änderung wiederverwenden.
- (c) Screener-Zeilen aus `featuresAtCutoff` statt Neuberechnung auf 270 Bars, wo Vollhistorie vorliegt.
- (d) Wochen- und Monatsfeatures im selben Runner-Lauf mitrechnen. Die Historie ist dort schon geladen.

**Was Actions kann und das Repository nicht:**
- R2-Vollhistorie (`sync-history-store.mjs --pull`, Konkurrenz 24).
- `--work-dir` Kanonische Historie für Backtests.
- Tiingo-Schlüssel.
- Das Repository sieht nur Projektionen und Aggregate.

---

## 8. Vorbereitung der KI-Suche

**Fertig** (verifiziert):
- `technical-query.js#jsonSchema()`: 13.909 Bytes, `additionalProperties:false`, Feld-Enum aus dem Katalog.
- `validate()` mit stabilen Fehlercodes, `describe()`.
- `query-text.js#parse()` (DE-Begriffe, Vergleiche, UND/ODER, Formationslisten, Zeitrahmen, kanonische Schreibweise, `unknown[]`).
- `contract()` (`query-text.js:293`) mit Status `VORBEREITET_NICHT_AKTIV`, Anweisung, Schema und 4 Beispielen (15,8 KB).
- Rundreise-Test über alle Felder (`technical-query-text.test.mjs`, 5 Tests).

**Probe** (selbst):
- Gut erkannt: „über 200-Tage-Linie mit RSI unter 30“ und „bullische Flagge mit Volumenspitze“.
- Ehrlich als `unknown` gemeldet: „Hammer Kerze“, „stärker als Sektor“, „VWAP“, „Keltner“.
- „Ausbruch aus Doppelboden in den letzten 5 Tagen“ verliert die Zeitbedingung (`unknown: aus, letzten, 5, tagen`).

**Es fehlt (außer dem kostenpflichtigen Modellaufruf, der NICHT aktiviert wird):**

| # | Lücke | Größe |
|---|---|---|
| K1 | Gold-Set: 200 bis 500 reale DE-Formulierungen mit erwarteter Abfrage, als Regressionstest für Parser und künftiges Modell, mit Abdeckungsquote | M |
| K2 | Evaluation offline: Parser gegen Gold-Set (ohne Modell); Bericht über nicht abbildbare Wünsche → Feld-Backlog (wie der Lernbericht von `vu-ask`) | S |
| K3 | Ein Worker-Pfad bzw. Werkzeug für das Technical-Schema in `workers/vu-ask` (heute nur `screener/engine/fields.js` und Chartbild-Tool). Code und Test ohne Deploy, Schalter aus | M |
| K4 | Eine gemeinsame Abfrage-Engine `/screener/` ↔ `/technical/` (offene Aufgabe 6 im Fortschrittsbericht), sonst zwei Schemata für ein Modell | M/L |
| K5 | Schema-Erweiterungen: Zeitrahmen je Filter, Ereignisfelder (seit N Tagen), Negation, Feld-gegen-Feld | M, Schema-Version |
| K6 | Kostenmodell und Grenzen: Schemagröße in Tokens messen (rund 5k Token wie bei `vu-ask` ist eine **Vermutung**), Cache-Schlüssel auf der kanonischen Schreibweise | S |
| K7 | Englisch (`en`-Labels gibt es nur im `/screener/`-Katalog) | S |

**Hinweis zur Freischaltung:** `workers/vu-ask/wrangler.toml:45` hat `VU_ASK_ENABLED = "true"`. Der Katalog des Workers enthält schon die Technical-Felder `atr`, `aboveEma200`, `supertrendUp`, `chartPattern`, `chartPatternOpen` und `chartPatternConfirmed` usw., weil sie in `screener/engine/fields.js` stehen (selbst über `catalog.mjs#FIELD_IDS` geprüft). Die Technical-Suche in Worten selbst ruft kein Modell. Ob der Worker produktiv läuft, habe ich nicht geprüft.

---

## 9. Priorisierter Backlog

Sortierung: zuerst hoher Nutzen bei geringem Risiko.

| ID | Bereich | Aufgabe | Größe | Fachmodell | Abhängigkeit | Nutzen |
|---|---|---|---|---|---|---|
| B1 | Betrieb | Automatik-Lauf `technical-world.yml` absichern: als `workflow_call`-Schritt nach der Materialisierung in `market-data-refresh.yml` (oder eigenes cron nach dem Nachtlauf) statt nur `workflow_run`; ersten echten Lauf beobachten | S | nein | – | Screener veraltet sonst still; Voraussetzung für EMA 200 im Produkt |
| B2 | Betrieb | Nach dem nächsten Nachtlauf prüfen, dass `ema200` und `emaSettlement` in den Shards stehen; `measure-ema200-signal-effect.mjs` im Modus EXACT laufen lassen | S | nein | B1, Nachtlauf | Füllt die Felder `aboveEma200`/`distEma200` (heute 100 % null in Technical, `/screener/` und `vu-ask`) |
| B3 | DQ | DQ-Regeln für Technical: Stichtag Shards ↔ `technical/data`, Anteil stale, Parität der Schlüsse Shards ↔ `discover-series`, Felder komplett null (z. B. EMA 200), Zählung `skipped`; in `scripts/core/data-quality.mjs` und `system-health` | S | nein | – | Stille Drift wird sichtbar |
| B4 | Screener | Shard-Regex in `build-screener.mjs:75` an `product-materialization.shardKey` angleichen oder Vorzugsaktien mit Grund in `meta.skipped` melden | S | nein (Datensatz +6 Zeilen) | – | Ehrliche Abdeckung |
| B5 | Datenqualität | Monatsschluss korrigieren: abgeleitete Monatsschlüsse im Runner (letzter Handelstag) oder bis dahin `@1M` mit Hinweis | S/M | **ja** (`@1M`-Werte ändern sich; Vorher/Nachher) | Runner-Schritt oder Rechtsfreigabe für Monatsschlüsse | Behebt 50,7 % falsche Monatsschlüsse |
| B6 | Indikatoren | Billige Ergänzungen aus 270 Bars in den Katalog und optional in den Screener: Pivot Points, ROC 63/126/252, TRIX, Ultimate Oscillator, CMO, KAMA, Hull MA, ATR-Bänder/Chandelier, Regressionskanal, Inside/NR7, Heikin-Ashi; je mit naiver Referenz und Handbeispiel | M | nein für den Katalog; ja, sobald sie Screener-Filter oder Vorlagen werden | – | Breitere Abdeckung ohne neue Daten |
| B7 | Tests | Externe Referenzwerte (z. B. TA-Lib/TradingView offline, als eingefrorene Fixture) für die 24 Indikatoren | S | nein | – | Fängt Konventionsfehler, die naive Formel und Engine teilen |
| B8 | Mehrzeitrahmen | `featuresAtCutoff` für 1W und 1M im Runner aus `timeframe.js#aggregate` (EMA, ATR, ADX, Stochastik, MACD, Volumen) und als Felder `@1W`/`@1M` | M | **ja** (neue Screener-Felder, Materialisierungsinhalt) | B1 | Echte Wochen- und Monats-Technik ohne Rohdaten-Veröffentlichung |
| B9 | Evidenz | Formations-Evidenz im Runner auf der vollen R2-Historie (Median 11 J.), nur Aggregate veröffentlichen; Cluster-SE (nach Datum) oder Block-Bootstrap; Train/Test-Teilung nach Zeit | M/L | ja (Methodik der Evidenz) | Runner-Schritt | Belastbare Aussagen statt eines Regimes; Out-of-Sample |
| B10 | Evidenz | Survivorship: delistete Titel aus der R2-Historie in die Evidenz aufnehmen (Quant nutzt `delisted-weekly`) | M | ja | B9 | Weniger Verzerrung nach oben |
| B11 | Evidenz | Formationen mit `ti/outcomes.js` (Kosten 10 bp, Zufalls-Baseline) bewerten | M | ja | B9 | Netto-Aussagen |
| B12 | Screener | Ereignisfelder: Kreuzungen (SMA 50/200, Kurs/SMA 200, RSI 30/70) heute bzw. in N Tagen, „Formation seit ≤ N Tagen“, „Ausbruch seit ≤ N Tagen“ | M | ja (neue Felder) | – | Häufigste Nutzerfragen; Parser verliert heute „letzte 5 Tage“ |
| B13 | Screener | Zeitrahmen je Filter (Mehrzeitrahmen-Abfragen) und Negation; Schema-Version anheben | M | nein (Abfragemodell, keine Kennzahl) | – | „Woche bullisch und Tag überverkauft“ |
| B14 | Wiederverwendung | Definitionen vereinheitlichen: `/screener/` übernimmt RSI/MACD/SMA/EMA aus Technical **oder** benennt `relVol`/`rs6m` eindeutig um | M | ja (veröffentlichte Werte in `/screener/`) | Screener-Gate prüfen | Eine Wahrheit je Kennzahl, weniger Verwirrung für `vu-ask` |
| B15 | RS | Benchmark in der Materialisierung reparieren (SPY als Benchmark-Reihe auch außerhalb des Produktuniversums laden) und Sektor-RS über SIC-Peer-Indizes | M | **ja** (Bundle-RS, ggf. Score und Szenarien) | Owner-Entscheid Sektor-Methodik | RS-Engine wird überhaupt erst wirksam |
| B16 | Formationen | Dreifachtop/-boden, Island Reversal, Bar-Muster (Inside, Outside, NR7, Key Reversal) | M | ja | – | Fehlende Standardtypen |
| B17 | Formationen | Qualitätskennzahlen je Formation (Höhe/ATR, Ausbruchsvolumen, Messziel) als Filter | M | ja | – | Filtern nach „guten“ Formationen |
| B18 | KI | Gold-Set und Offline-Evaluation des Parsers (K1, K2) | M | nein | – | Grundlage jeder späteren Freischaltung |
| B19 | KI | Technical-Werkzeug im `vu-ask`-Code (Schema aus `technical-query.jsonSchema()`), Schalter aus, ohne Deploy | M | nein | B18, Owner-Freigabe Deploy | Freischaltung wird ein Schalter |
| B20 | Speicher | Shards aus dem Git herausnehmen (nur Release oder Artefaktablage) bzw. inkrementell schreiben | L | nein (Architektur, Owner) | Release-Bau `by-ticker` | Stoppt Repo-Wachstum von ~240 MB je Lauf |
| B21 | Mehrzeitrahmen | Rechtsprüfung: Wochen-/Monats-OHLCV öffentlich (5 J./Max)? Dann Wochenformationen und TI ohne O=H=L=C | L | ja | Rechtsfreigabe | Volle Wochentechnik im Browser |
| B22 | Konsolidierung | Drei Technical-Datenstapel (Golden-5-Altbestand, TI v3, technical-signals) zusammenführen bzw. Altbestand stilllegen; `shardKey` auf `core/identity.js` | L | teils | B20 | Weniger Pflege, ADR-001 |
| B23 | Betrieb | Concurrency-Gruppe der Materialisierung um `-${{ github.ref_name }}` ergänzen (ADR-005) oder Ausnahme dokumentieren | S | nein | – | Regelkonformität (push auf `codex/**` startet sie) |
| B24 | Daten | Pfadabhängige Fensterindikatoren (SAR, Supertrend) im Runner aus der Vollhistorie als `featuresAtCutoff` | S/M | ja (rund 0,8 % der Richtungen ändern sich) | – | Keine Fensterabhängigkeit |
| B25 | Intraday | Sitzungs-VWAP erst mit Intraday-Historie und konsolidiertem Volumen | L | – | neuer Datenbedarf | heute nicht machbar |

---

## 10. Was ich nicht verifizieren konnte

- Ob `technical-world.yml` nach dem nächsten Nachtlauf tatsächlich startet. Bisher gibt es keinen Handelstag-Lauf auf `main` seit Einführung, und alle 73 Läufe sind übersprungen. Ob die Materialisierung bis 04:20 UTC fertig ist.
- Ob der Nachtlauf `ema200` korrekt füllt. Die committeten Shards sind vom 24.10. und älter als #927.
- Die echte Abweichung von SAR und Supertrend auf 270 Bars gegenüber der Vollhistorie. Dafür braucht es R2 im Runner. Gemessen habe ich nur die Fensterverschiebung.
- Ob `vu-ask` produktiv ausgerollt und erreichbar ist. Im Code steht `VU_ASK_ENABLED = "true"`; einen Netzaufruf habe ich nicht gemacht.
- Die volle `quant/tests`-Suite (2.943) und die Browser-QA (54/54) habe ich nicht selbst laufen lassen, die Zahlen stammen aus der Doku.
- Die Laufzeit der Formationshistorie im Browser (laut Doku ohne Messung).
- Ob die 6 ausgelassenen Vorzugsaktien Absicht sind.
- Ob die fehlende Benchmark (SPY außerhalb des Universums) bekannt und gewollt ist. Der Methodik-Kommentar zu SPY vom 02.10. deutet auf einen anderen Pfad hin (Quant-Signale?). Das habe ich nicht weiter verfolgt.
- Wie stark die Git-Historie tatsächlich durch die Shards wächst. Belegt sind nur 49 Commits auf `AA.json.gz` und ~16,5 GB Repository-Größe, nicht der Anteil der Shards daran.

## Umsetzungsstand des Backlogs (fortgeschrieben)

Der Audit-Text oben ist eine Momentaufnahme vom 26.10.2026 und bleibt unverändert. Dieser Abschnitt hält fest, was daraus umgesetzt ist.

| Punkt | Stand | PR |
|---|---|---|
| B1 | erledigt: eigener Zeitplan 05:10 UTC Di–Sa, Testlauf grün | #947 |
| B3 | erledigt: DQ-TW-1..4 (Frische, leere Felder, Schlusskurs-Gleichheit als ERROR, Abdeckung) | #950 |
| B4 | erledigt: Shard-Regex angeglichen, 6 Vorzugsaktien aufgenommen | #950 |
| B6 | erledigt: 14 Katalogindikatoren, nur Katalog (`indicators` 1.2.0) | #955 |
| B5 | erledigt: Monatsschluss = Schluss des letzten Handelstags im Monat (über B8) | #966 |
| B7 | erledigt: TA-Lib 0.8.2 als eingefrorene Referenz. Befund Parabolic SAR an Umkehrbars, nach Owner-Freigabe korrigiert (`indicators` 1.2.1) | #962, #964 |
| B8 | erledigt: Wochen-/Monatskennzahlen aus der Tageshistorie, nur abgeschlossene Perioden (`technical-mtf-1.0.0`); Werte erscheinen mit dem nächsten Materialisierungslauf | #966 |
| B12 | erledigt: Ereignisfilter mit Prüfraum, Golden/Death Cross als Kreuzung, Migration gespeicherter Wortsuchen | #967 |
| B13 | erledigt: Zeitrahmen je Filter, `nin`, verneinte Formationen (`technical-query` 1.4.0) | #954 |
| B18 | erledigt: Goldsatz 80 + 14 Fälle, Offline-Evaluation, 80/80 exakt, 0/14 stille Fehlgriffe | #952, #954 |
| B2 | offen: Prüfung nach dem Materialisierungslauf vom 26./27.10.2026 | – |
