# Technical Intelligence v3: Produktmigration nach main (Manifest)

Stand: 08.10.2026.

* **Quelle:** Branch `claude/vision-universe-mission-viii-7hjwma` (Commit `eb7b150`).
* **Ziel:** `main` (Basis `1f480e7`).
* **Branch:** `feature/technical-intelligence-v3-production`.

Dieses Manifest wurde **vor** der Migration geschrieben. Es legt fest, was das Live-Produkt braucht und was Forschung bleibt. Es gibt keinen Merge der Forschungshistorie und keine Änderung an Engine, Regeln, Szenario- und Ziellogik, Gewichten oder Evidenz.

## 1. Geprüfte Versionen (aus dem Code, nicht aus Notizen)

| Bestandteil | Version | Quelle |
|---|---|---|
| Elliott-Engine | `elliott-3.2.2` | `quant/engines/technical/elliott/elliott-v3.js` `ENGINE_VERSION` |
| Elliott-Regelwerk | `elliott-rules-3.1.0` | `elliott/patterns.js` `RULE_SET_VERSION` |
| Szenario-Engine | `ti-scenario-1.2.1` | `ti/scenario.js` `ENGINE_VERSION` |
| Analyse-Bundle / Ergebnisschema | `ti-bundle-2.0.0` / `vu-technical-analysis-2.0.0` | `ti/engine.js` |
| Daten-API | `vu-ti-api-3.0.0` | `build-technical-intelligence.mjs` `API_VERSION` |
| Produkt-Methodik | `{ elliottEngine: "v3" }`, Persistenzkette 26 + 26 | `scripts/technical/lib/ti-product.mjs` |
| Methodik-Vertrag | `technical-intelligence-v2.0.0` | `quant/methodology/technical-intelligence-v2.json` |
| Methoden-Evidenz | `vu-technical-method-evidence-1.0.0` | `quant/methodology/technical-method-evidence.json` |

Die Engine-Dateien werden **unverändert** übernommen. Ihre SHA-256 werden im PR gegen den Mission-VIII-Freeze (`scripts/technical/hsab/protocol9.json` → `freeze.engineFiles`) geprüft.

## 2. Abhängigkeitsgraph (vom Kunden rückwärts)

```
Kursstruktur / Chartbild (#/aktie/T/chartbild, #/aktie/T/technik → Chartbild, #/chartlagen)
  → quant/app/page-chartbild.js + chartbild.css + quant/ui/ti-chart.js + ti/explain.js
  → quant/api/technical-intelligence-workspace.js   (liest quant/data/technical-intelligence/v3/*)
      meta.json · index.json.gz · shards/<XX>.json.gz · discover-rows.json · rules-catalog.json
      alerts.json · evidence-summary.json · method-evidence.json
  ← erzeugt von scripts/technical/build-technical-intelligence.mjs
      → scripts/technical/lib/ti-product.mjs (analyzeProduct, Persistenzkette) → lib/ti-data.mjs
      → quant/engines/technical/ti/{engine,context,dow-trend,momentum-volatility,volume-intelligence,
                                    levels,chart-patterns,wyckoff,scenario,alerts,explain,outcomes*}.js
      → quant/engines/technical/elliott/{elliott-v3,elliott-v2,patterns,sources}.js
      → schon auf main: feature-store, pivot-engine, timeframe, canonical-bars, hash
      → Eingaben: quant/data/market/discover-series-long (Woche), golden-preview/daily (5 Tagestitel),
                  technical-intelligence/evidence/* (Szenario-Evidenz), elliott-validation/report-*-v22-sticky.json,
                  quant/methodology/technical-method-evidence.json
Aktienseite (Teaser, Setup-Links)      → technical-intelligence-workspace.js
Startseite Beobachtungsliste (Ereignisse) → technical-intelligence-workspace.js (alerts.json)
Screener (Ausblick, Kursstruktur, Elliott-Klarheit) → scripts/screener/build-universe.mjs liest v3/index.json.gz
VU Ask / AI Atlas (getChartbildLage)    → ti/ai-tools.js + Workspace (Browser) · workers/vu-ask (Schema)
Discover-Detail                          → nur Link ins Chartbild (keine eigene Zählung)
Startseite (index.html)                  → scripts/home/build-home.mjs: Elliott-Teil aus v3
Prospektives Register (Kundensicht)     → analyzeProduct + productOpts + slim (Phase 2, siehe §9)
```

`*` `outcomes.js` braucht das Produkt zur Laufzeit nicht. `context.js` lädt es nicht; es gehört aber zum TI-Engine-Satz und wird für die Evidenz-Reproduzierbarkeit unverändert mitgeführt.

## 3. Manifest

| Komponente | Ort (Branch) | Abhängigkeiten | auf main nötig | kundensichtbar | Laufzeit | Daten | Tests | Entscheidung | Grund |
|---|---|---|---|---|---|---|---|---|---|
| TI-Engine | `quant/engines/technical/ti/*.js` (13) | elliott-v2/v3, feature-store, pivot-engine, timeframe, hash | ja | indirekt | Build + Browser (`explain.js`, `ai-tools.js`) | – | ti-engine, ti-product, ti-mission4 | **MUST** | rechnet das Chartbild |
| Elliott 3.2.2 | `elliott/elliott-v3.js`, `elliott-v2.js`, `patterns.js`, `sources.js` | hash | ja | indirekt | Build | – | ti-elliott-v2/v3 | **MUST** | v3 baut auf v2-Gerüst und Regelwerk |
| Produktanalyse | `scripts/technical/lib/ti-product.mjs`, `ti-data.mjs` | Engines, canonical-bars | ja | indirekt | Build, Register | – | ti-product | **MUST** | einzige Produktfunktion |
| Produkt-Build | `scripts/technical/build-technical-intelligence.mjs` | Produktanalyse, Evidenz-Eingaben | ja | indirekt | Build | erzeugt v3 | ti-ui (Daten) | **MUST** | erzeugt die veröffentlichten Daten |
| Drift-Prüfung | `scripts/technical/verify-technical-intelligence.mjs` | Produktanalyse | ja | – | CI | liest v3 | Quant CI | **MUST** | Engine ≙ veröffentlichte Daten |
| Lese-API | `quant/api/technical-intelligence-workspace.js` | v3-Daten | ja | ja | Browser | v3 | ti-ui | **MUST** | einzige Leseschicht |
| UI | `quant/app/page-chartbild.js`, `chartbild.css`, `quant/ui/ti-chart.js`; Hunks in `app.js`, `ui.js`, `pages.js`, `page-stock.js`, `page-method.js`, `quant/index.html` | API | ja | ja | Browser | – | ti-ui, internal-links | **MUST** | Kundenoberfläche |
| Legacy-Seite `/quant/technical/` | `quant/technical/index.html` (Weiterleitung) | – | ja | ja | Browser | – | – | **MUST** | alte Deep-Links → Chartbild |
| Methodik-Verträge | `quant/methodology/technical-intelligence-v2.json`, `technical-method-evidence.json`; Zweck-Text `elliott-v1.json`; `index.html` neu erzeugt | – | ja | ja (Methodikseite) | Browser | – | – | **MUST** | Versionen und Grenzen sichtbar |
| Methodik-Index-Generator | `scripts/quant/build-methodology-index.mjs` (Überschriften) | – | ja | – | Build | – | – | **MUST** | damit die Methodikseite beim nächsten Erzeugen erhalten bleibt |
| Szenario-Evidenz-Tabellen | `quant/data/technical-intelligence/evidence/{evidence-1W,evidence-1D-golden}.json`, `cases-1W.json.gz`, `cases-1D-golden.json.gz` | – | ja | ja (Evidenz-Badges, Fälle) | Build | Eingabe | – | **MUST (Kopie)** | Eingaben des Produkts, unverändert; Neuberechnung wäre neue Evidenz |
| Elliott-Validierungsberichte | `elliott-validation/report-confirmatory-v22-sticky.json`, `report-exploratory-v22-sticky.json` | – | ja | ja (Methodik-Evidenz) | Build | Eingabe | – | **MUST (Kopie)** | Eingaben von `evidence-summary.json` |
| v3-Produktdaten | `quant/data/technical-intelligence/v3/*` | Build | ja | ja | Browser | Ausgabe | ti-ui, verify | **MUST (neu gebaut)** | auf main mit main-Daten neu erzeugt, nicht kopiert (§6) |
| Aktienseite: v1-Elliott-Kachel | `quant/app/page-stock.js` (Abschnitt Kursstruktur) | – | ja | ja | Browser | – | ti-ui | **MUST (neu, Bugfix)** | zeigte „Validierte Zählung / Method Fit“ der V1-Engine neben dem v3-Teaser → entfernt |
| Startseite: Elliott | `scripts/home/build-home.mjs`, `index.html` | v3-Shard | ja | ja | Build | – | home-Test | **MUST (neu, Bugfix)** | zeigte „NVDA Welle 3“ und Wellenpunkte aus V1; v3 enthält sich für NVDA |
| Discover-Detail | `discover/ui/detail.js` (Technical-Intelligence-Block) | – | ja | ja | Browser | – | discover-Tests | **MUST (eigener PR)** | keine zweite Zählung mit „Method Fit“, nur Link ins Chartbild. Discover CI erlaubt keine Discover-Änderung im selben PR wie Quant-Dateien (Modulgrenze) → unmittelbar nach diesem PR als eigener PR |
| Screener-Felder | `screener/engine/fields.js`, `screener/app.js`, `scripts/screener/build-universe.mjs` | v3/index | ja | ja | Browser + Build | Spalten `tiOut/tiStr/tiEw` | screener-Tests | **MUST** | eine Quelle für Lage und Elliott-Klarheit |
| VU Ask (Browser) | `ask/{app,engine}.js`, `ask/index.html` | ai-tools, Workspace | ja | ja | Browser | v3/index | ask-engine | **MUST** | strukturierte Werte statt Freitext |
| VU Ask (Worker) | `workers/vu-ask/src/{catalog,gate,translate}.mjs`, README | fields.js, ai-tools | ja | ja | Cloudflare Worker | – | vu-ask | **MUST** | Schema mit `chartbild` und TI-Feldern |
| Produkt-Dienste | Hunks in `quant/api/product-services.js` (Golden-/Discover-Index-Abfragen) | – | ja | ja (keine 404 in der Konsole) | Browser | – | product-services | **MAY** | Mission-IV-Fehlerbehebungen der Produktseiten |
| Produktions-Smoke | `scripts/vu2/production-smoke.mjs` (Ansichten) | – | ja | – | CI | – | – | **MAY** | Chartbild-Routen im Smoke |
| Quant CI | `.github/workflows/quant-ci.yml` (Schritt verify) | verify | ja | – | CI | – | – | **MAY** | Drift-Prüfung in jedem Lauf |
| Produkt-Build-Workflow | neu: `.github/workflows/technical-intelligence-build.yml` | Build | ja | – | CI | schreibt v3 | – | **MAY (neu)** | ohne ihn veraltet das Produkt auf main; die Golden-Tagesdaten ändern sich jede Nacht |
| Tests | `quant/tests/ti-{engine,elliott-v2,elliott-v3,product,ui,mission4}.test.mjs`, Fixtures `elliott-corpus.mjs`, `elliott-synthetic.mjs`; Anpassungen internal-links, ask, vu-ask, screener | – | ja | – | CI | – | – | **MUST** | Regressionsschutz; die Fixtures sind Testdaten der Engine, kein Forschungskorpus |
| Produkt-Doku | `docs/technical-intelligence/{API_V3_MIGRATION,ELLIOTT_ENGINE32_REPORT,ELLIOTT_VALIDATION_REPORT,METHOD_RESEARCH,PREREGISTRATION,TECHNICAL_INTELLIGENCE_ARCHITECTURE}.md` | – | ja | über Verweise | – | – | – | **MAY** | vom Produkt und den Verträgen referenziert (Herkunft) |
| Prospektives Register | `scripts/technical/elliott-registry/*`, `elliott-setups/{setup-library.mjs,ELLIOTT_SETUP_SPEC.json}`, `hsab/lib/replay-core.mjs`, Register-Daten | Produktanalyse | ja (Phase 2) | – | CI (Woche) | Ledger | elliott-registry-product-view | **MAY (eigener PR nach Phase 1)** | siehe §9 |
| `technical-signals-v1` (Daten, Signale) | main | – | ja | ja (Signale, Setups, Radar, Faktoren, Supertrader-Chart) | Build + Browser | ja | bestehend | **REQUIRED LEGACY** | Datenschicht vieler Produkte, nicht Elliott |
| Elliott V1 (`elliott-engine.js`, `elliott-v1.0.0-beta`) | main | – | ja (in `technical-signals-v1`) | nein (nach Migration) | Build | im Bundle | bestehend | **REQUIRED LEGACY (unsichtbar)** | im Bundle von Setups, Radar und Faktoren mitgerechnet; keine Kundenanzeige mehr |
| Forschung | Mission I–X: `scripts/technical/{hsab,practitioner,elliott-forensics,elliott-calibration,elliott-setups/*-eval*,…}`, `elliott-33-research`, Holdouts, Korpora, Workbenches, `quant/research/**`, `technical-intelligence/{historical-accuracy,practitioner-v1,elliott-forensics,elliott-validation/* außer 2 Berichten}`, Mission-Berichte, UI-Audit-Screenshots, Mission-Workflows | – | nein | nein | nein | – | – | **DO NOT** | Forschung bleibt auf dem Forschungsbranch |
| Evidenz-Neuberechnung | `scripts/technical/ti-evidence.mjs`, `derive-method-evidence.mjs`, `technical-intelligence-evidence.yml` | – | nein | nein | nein | – | – | **DO NOT** | würde neue Evidenz erzeugen; die Eingaben werden als feste Kopie übernommen |
| Andere Arbeitsstränge des Branches | Supertrader R8, Social, Firmenlogos, Gesamtrendite-Reparatur, `market-data-refresh.yml`, `product-intelligence-materialization.yml` (Universums-Tagesanalyse) | – | nein | – | – | – | – | **DO NOT** | gehören nicht zur TI-Migration. Der Universums-Tageslauf wäre eine Verhaltensänderung (heute 5 Tagestitel und rund 5.100–5.300 Wochentitel, je nach Datenstand; Neubau auf main: 5.125). |

## 4. Routenkarte (vorher → nachher)

| Einstieg | main vorher | main nachher |
|---|---|---|
| `/quant/#/aktie/T/technik` | V1-Technikseite (`QXTools.technical`, Elliott V1) | Chartbild (gleiche Route, Lesezeichen bleiben) |
| `/quant/#/aktie/T/technik?elliott=1` | V1-Elliott-Ansicht | Chartbild, Profi-Ansicht |
| `/quant/#/aktie/T/chartbild` | – (notfound) | Chartbild |
| `/quant/#/chartlagen` | – | Übersicht der Chartlagen |
| `/quant/#/methodik/chartbild` | – | Methodik „Chartbild & Wellen“ |
| `/quant/technical/?symbol=T` | V1-Technical-Intelligence-App | Weiterleitung → `/quant/#/aktie/T/chartbild` (ohne Symbol → `#/chartlagen`) |
| Aktienseite, Abschnitt Kursstruktur | Trend/Dynamik/Schwankung + **Elliott-Wellen (V1)**, Knopf „Technische Analyse & Elliott öffnen“ | Trend/Dynamik/Schwankung ohne V1-Elliott, Knopf „Chartbild öffnen“, dazu der Chartbild-Teaser |
| Startseite (`/`) | Elliott-Kacheln und Wellenpunkte aus V1 | Elliott-Kacheln aus v3 (bei Enthaltung keine Wellenpunkte) |
| Discover-Detail | „Technical Intelligence — Elliott Wave“ mit V1-Zählung und Method Fit | „Chartbild — Kursstruktur“ mit Link |
| Screener | ohne TI-Felder | Ausblick, Kursstruktur, Elliott-Klarheit (v3-Index) |
| AI Atlas / VU Ask | ohne Chartbild | Werkzeug `getChartbildLage` (strukturierte v3-Werte) |
| Startseite der App, Beobachtungsliste | – | Chartbild-Ereignisse nur aus sauberen Vergleichsläufen |

## 5. Legacy V1: Klassifikation jedes Vorkommens

| Vorkommen | Klasse | Behandlung |
|---|---|---|
| `quant/data/product/technical-signals-v1/*` und alle Leser (Signale, Setups, Faktoren, Radar, Marktregime, Supertrader-Chart, Startseite Kurse/Zonen, Hygiene-Prüfung) | REQUIRED LEGACY | bleibt; Datenschicht, kein Elliott in der Anzeige |
| `quant/engines/technical/elliott/elliott-engine.js`, `elliott-v1.json` | REQUIRED LEGACY | bleibt (im Bundle mitgerechnet). Der Vertragstext sagt jetzt „nicht mehr die Elliott-Schicht des Produkts“. |
| `product-services.js` Feld `elliott` im Technical Workspace, `capabilities.elliott` | REQUIRED LEGACY (API, nicht angezeigt) | bleibt; einziger Anzeigeort (Aktienseite) entfernt; Links zeigen auf die umgeleitete Route |
| `quant/app/page-tools.js` `technical()` | STALE, NICHT MEHR GEROUTET | Route zeigt aufs Chartbild; Code bleibt bis zu einem eigenen Aufräumen |
| `quant/technical/app.js` | STALE, NICHT MEHR ERREICHBAR | Seite leitet weiter |
| `discover/engines/technical-intelligence.js` (`layers.elliottWave`) | REQUIRED LEGACY (Daten) | nicht mehr angezeigt |
| `quant/engines/technical/technical-tools.js` `getElliottAnalysis` | REQUIRED LEGACY (interne Werkzeugliste) | kein Kundenpfad |
| Quant-Pro-Screener-Feld `elliottCountStatus` (`quant/api/screener-workspace.js`, Katalog, Backtest-Vorpruefung) | REQUIRED LEGACY (gespeicherte Abfragen loesen darauf auf) | bleibt; Etikett jetzt „Elliott V1 (alte Methode) · Status“, damit es nicht als Elliott-Aussage des Produkts gelesen wird (Befund der unabhaengigen Pruefung) |
| Startseite `NVDA_WAVE_*`, Wellenpunkte | STALE → umgestellt | aus v3 |
| Aktienseite „Elliott-Wellen“-Kachel | STALE → entfernt | – |

## 6. Daten: neu bauen statt kopieren

* **Neu gebaut:** `v3/*` auf main mit dem migrierten Code und den Daten von main (Langreihen Stand 07.10.2026, Golden-Preview).
* **Fest kopiert:** Evidenz-Tabellen, zwei Validierungsberichte, Methodik-Verträge (Eingaben, keine Ausgaben).
* **Drift-Prüfung in zwei Stufen:**
  1. Code-Identität: derselbe Code auf den Branch-Daten ergibt Byte für Byte die veröffentlichten Branch-Shards.
  2. Datenstand: Die Unterschiede zwischen Neubau und Branch-Shards entstehen nur aus neueren Kursen.

## 7. Betrieb auf main

* **Laden im Browser:**
  * Im Bündel jeder Quant-Ansicht stehen nur die Lese-API und die Texte (`explain.js`, rund 10 KB).
  * Chartbild-Seite, Chart und Stile (rund 130 KB) lädt `app.js` erst auf den Chartbild-Routen; die Stile auch für den Teaser.
  * Grund: Ressourcen-Budget der Startseite und des Screeners in der Quant-Browser-QA.

* `technical-intelligence-build.yml`:
  * täglich nach dem Marktlauf und manuell;
  * baut v3 neu, wenn sich Langreihen, Golden-Tagesdaten oder Code geändert haben, sonst No-Op;
  * prüft, committet nur v3.
* Quant CI prüft die Drift nur bei gleichem Datenstand. Eine nicht nachgezogene Nacht ist kein Engine-Wechsel.

## 8. Ausdrücklich nicht Teil

* Keine Projektions-Engine (Welle 3/5/C), keine neue Elliott-Forschung, keine Methodik-Änderung.
* Keine Universums-Tagesanalyse (wäre eine Produktänderung).

## 9. Register (Phase 2, nach verifiziertem Live-Stand)

* Register-Code, seine Laufzeit-Abhängigkeiten (`setup-library.mjs` + Spec, `replay-core.mjs`) und die Register-Daten (Ledger, Snapshots, Berichte) werden **byte-gleich** nach main übernommen. Die Kette bleibt unverändert, `verify.mjs --against-git` prüft das.
* Der Register-Workflow läuft dann direkt auf main, gegen das Produkt von main.
* Der Dispatcher wird erst entfernt, wenn ein direkter Lauf auf main verifiziert ist. Der Mission-Branch registriert danach nicht mehr (kein zweiter Schreiber).
