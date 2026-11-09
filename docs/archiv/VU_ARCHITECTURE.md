# VU INVESTMENT INTELLIGENCE — ARCHITEKTUR

## Leitprinzip

> **AI ist nicht die Wahrheitsschicht.**
> Die Wahrheitsschicht ist Financial Data Core + Quant Engine + Strategy Engine + Backtest Engine.
> AI ist Interpretation, Orchestrierung und Erklaerung.

Investmentzahlen entstehen ausschliesslich in deterministischen Engines. Ein Sprachmodell
darf sie uebersetzen und erlaeutern — niemals erzeugen.

## Einordnung im Repository

Vision Universe ist eine statische Website (GitHub Pages, `research.visionuniverse.de`)
ohne Build-Pipeline und ohne Server-Runtime. Der Quant-Bereich folgt exakt dem Muster der
bestehenden Produktverzeichnisse `macro/` und `academy/`: UI, reine Berechnungslogik,
Daten und Konfiguration sind getrennt, Engines laufen in Browser **und** Node, Tests
laufen mit `node --test`.

Die im Research beschriebene Zielarchitektur (Next.js, FastAPI, PostgreSQL, Parquet,
Redis) ist die Architektur fuer den spaeteren produktiven Multi-User-Betrieb mit echten
Daten. Sie ist bewusst **nicht** die Architektur dieses Builds; die Begruendung steht in
`VU_INVESTMENT_INTELLIGENCE_IMPLEMENTATION_PLAN.md`, Abschnitt C.

## Schichten

```
quant/**/index.html + quant/ui/*        PRODUCT LAYER — nur Darstellung
            |
quant/api/client.js                     PRODUCT API — die v1-Contracts
            |
quant/engines/ai-provider.js            AI RESEARCH LAYER
quant/engines/ai-tools.js               Tool Registry (Sicherheitsgrenze)
            |
quant/engines/factors.js                DOMAIN ENGINES
quant/engines/quant-score.js
quant/engines/strategy.js
quant/engines/query.js  vuql.js  radar.js
            |
quant/engines/backtest.js               BACKTEST ENGINE
quant/engines/trust-score.js
            |
quant/engines/schema.js                 FINANCIAL DATA CORE
            |
quant/engines/provider.js               PROVIDER ABSTRACTION
            |
quant/engines/mock-provider.js          Mock (V1) · spaeter Twelve Data, Intrinio, EODHD
```

Jede Schicht kennt nur die direkt darunter. Eine Seite ruft nie eine Engine direkt auf,
sondern immer `quant/api/client.js`. Genau an dieser Grenze wird spaeter ein echter
HTTP-Service eingesetzt.

## Datenfluss

```
Vendor-Payload
   -> Provider-Adapter          einziger Ort mit Vendor-Kenntnis
   -> Validierung
   -> Kanonisches Schema
   -> Quant Engine
   -> Product API
   -> UI
```

Das verbotene Muster — ein Vendor-Feld oberhalb der Adapter-Schicht — wird durch
`Provider.findVendorLeakage()` und einen Acceptance-Test aktiv verhindert.

## Zwei Datenpfade

| Pfad | Wofuer | Woher |
|---|---|---|
| praekomputiert | Home, Ranking, Screener, Radar, Stock Detail, Watchlist | `quant/data/**`, erzeugt von `scripts/quant/build-quant-data.mjs` |
| live gerechnet | Backtests, aktuelles Modellportfolio | Mock-Dataset im Web Worker |

Beide leiten aus demselben deterministischen Generator und denselben Engines ab.
`scripts/quant/verify-quant-data.mjs` prueft in der CI, dass sie nicht auseinanderdriften —
eine stille Abweichung zwischen Uebersicht und Backtest waere der gefaehrlichste
Datenfehler des Systems.

## Verzeichnisse

```
quant/
  engines/       Reine Logik, Browser + Node, ohne DOM
  methodology/   Versionierte Konfiguration (Gewichte, Schwellen, Strategien)
  api/           Product-API-Schicht (v1-Contracts)
  ui/            Designsystem, Shell, Charts, Komponenten, Backtest-Worker
  data/          Praekomputierte Artefakte (generiert, nicht von Hand gepflegt)
  tests/         node:test — Engine-, Integritaets- und Acceptance-Tests
  <seite>/       index.html + app.js je Produktseite
providers/       Adapter-Vorbereitung + Lizenz-/PIT-Pruefpunkte je Anbieter
scripts/quant/   Praekomputation und Datenpruefung
docs/            Diese Dokumentation
```

## Routen

GitHub Pages kennt keine dynamischen Segmente. Die kanonischen Routen des Produkts werden
deshalb so abgebildet — die kanonische Form bleibt in `api/client.js` als Konstante
erhalten, damit ein spaeterer Server-Renderer sie unveraendert uebernehmen kann:

| Kanonisch | Statisch |
|---|---|
| `/quant` | `/quant/` |
| `/quant/ranking` | `/quant/ranking/` |
| `/screener` | `/quant/screener/` |
| `/stocks/{ticker}/quant` | `/quant/stock/?ticker={ticker}` |
| `/strategies` | `/quant/strategies/` |
| `/strategies/builder` | `/quant/strategies/builder/` |
| `/backtests/{id}` | `/quant/backtests/?id={id}` |
| `/ai` | `/quant/ai/` |
| `/watchlist` | `/quant/watchlist/` |

## Nebenlaeufigkeit

Ein 20-Jahres-Backtest mit monatlichem Rebalancing berechnet rund 250 vollstaendige
Faktor- und Score-Panels ueber 480 Titel: etwa 19 Sekunden Rechenzeit. Er laeuft deshalb
in `quant/ui/backtest-worker.js`. Die Engines sind als UMD-Module geschrieben
(`globalThis` statt `window`) und laufen dort per `importScripts` unveraendert.

## Bewusste Abweichungen von den Vorgaben

| Vorgabe | Umsetzung | Grund |
|---|---|---|
| Python, Polars, DuckDB, FastAPI, PostgreSQL | JavaScript-Engines im bestehenden UMD-Muster | Das Repository hat keine Server-Runtime; ein Python-Service waere auf GitHub Pages nicht erreichbar. Die Engine-Schnitte entsprechen dem Research-Modell und sind portierbar. |
| Bestehende Chart-Library | ein gemeinsames SVG-Modul `quant/ui/charts.js` | Kein Bundler ⇒ Library nur per CDN, also Laufzeit-Fremdabhaengigkeit und Stilbruch zur bestehenden CI. Der Kern der Vorgabe (nicht pro Seite neu erfinden) ist durch **ein** Modul erfuellt; ein Austausch bleibt lokal. |
| Docker Compose | nicht eingefuehrt | Es gibt keine Services zu orchestrieren. |

## Erweiterungspunkte

Vorbereitet, aber bewusst nicht gebaut: Analyst Revisions (Schema vorhanden, als
`available: false` markiert), Macro Regime (`MacroDataProvider` definiert), News
(`NewsDataProvider` definiert), Institutional Holdings, Similarity Engine, europaeische
Titel (`Universe`-Modell mehrmandantenfaehig), Realtime (Provider-Interface trennt
bereits Bulk- von Einzelabruf).
