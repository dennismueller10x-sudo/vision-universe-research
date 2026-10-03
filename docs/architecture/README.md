# Architektur: Ist-Zustand, Befunde, Zielbild

**Audit vom 03.10.2026**, Basis `main` @ `ea0ca6578b`. Die Quellen sind der Code, die Datenartefakte und die Laufhistorie der GitHub Actions.
Die Prosa älterer Dokumente zählt hier nicht als Quelle.

## 1. Ist-Architektur

| Schicht | Ist | Umfang |
|---|---|---|
| Produkte | statische Seiten je Verzeichnis: `discover/`, `quant/` (SPA + Legacy-Seiten), `supertrader/` (822 erzeugte Aktienseiten), `screener/`, `news/`, `dashboard/`, `macro/`, `etf/`, `academy/`, `magazin/`, `morning/`, `hedgefonds/`, `analysten/`, `ask/`, `company-intelligence/`, `social/` | 889 HTML-Seiten |
| Anwendung/API | `quant/api/product-services.js` (Quant 2.0), `api/*.js` (Vercel), Cloudflare Workers (`worker/`, `workers/*`, `worker-waker/`) | – |
| Engines | `quant/engines/**` (UMD, Browser + Node), `discover/engines/`, `scripts/supertrader/engine/` | ca. 110 Module |
| Daten | generierte JSON-Artefakte im Git (`quant/data` 747 MB, `discover/data` 375 MB), R2-Historie, Actions-Cache `.market-cache` | Repository 4,8 GB |
| Jobs | 72 GitHub-Actions-Workflows (+ core-ci.yml) | davon 39 mit `contents: write` |
| Tests | `node --test` (ca. 4.800), Python unittest (486) | – |

Die Datenflüsse je Datenart stehen in [../data/DATA_FLOWS.md](../data/DATA_FLOWS.md).

## 2. Befunde (Kurzfassung)

Die vollständigen Befunde mit Belegen und Severity stehen im [Abschlussbericht](../PLATFORM_HARDENING_REPORT_2026-10-03.md#gefundene-bugs).

### Identität
- Sieben Arten, die `securityId` aus dem Ticker zu bilden. BRK-B lief unter zwei Identitäten (behoben, ADR-001).
- Keine dauerhafte Identität: ISIN, FIGI und CUSIP sind in 0 von 7.809 Instrumenten befüllt. Umbenennungen werden nicht geliefert (`symbolActions=[]`).
- Produkt-Builder verknüpfen per Tickerstring („first match wins“).
- Der Company Master entsteht aus den Gate-Universen. Gemessen ist er also eine Projektion einer kuratierten Tickerliste (7.810 von 108.573 Anbieterzeilen).
- Das Produktuniversum (`eligibility.json`) wurde seit 15.09. nicht neu gebaut. 53 Reihen (z. B. AVB, LEG, WBS) stehen seit Wochen still, weil die Titel übernommen oder delistet sind, im Universum aber weiter als ACTIVE geführt werden.

### Preiswahrheit
- Eine Ablage (Tiingo EOD), aber mehrere Ableitungen: Split-Bereinigung fünfmal, 52-Wochen-Hoch viermal, Tagesänderung dreimal, Gesamtrendite zweimal (ADR-002).
- Die Cent-Rundung der Publisher erzeugte Kurse von 0 und verzerrte Kurse unter 1 $ (behoben).
- Ein eingefrorener Intraday-Stand wurde als „heute“ gezeigt, neben einem anderen EOD-Schlusskurs auf derselben Seite (behoben).

### Pipelines
- Der Marktdaten-Refresh war in 4 von 5 geplanten Läufen rot (Ursache: Checkout des Auslöse-Commits, behoben).
- Das Push-Werkzeug schob halb rebaste Stände (behoben).
- 20 ungeschützte Push-Stellen (behoben, ohne die Social-Workflows).
- Concurrency-Gruppen galten über Branches hinweg (behoben).
- Feature-PRs brachten pipeline-eigene Artefakte mit und ließen Datenläufe scheitern (Warnung in `core-ci.yml`).
- Daten vom Wochenende erreichten die Seite erst am Montag (behoben).

### Observability
- Freshness wurde nur für Intraday und Tageskurse gemessen (Freshness-Monitor, in 14 von 18 Läufen rot).
- Es gab keinen Systemzustand für Security Master, Fundamentals, Index, News, Quant oder Supertrader (jetzt `core/health.js`, `/status/`).

### UI
- 25 eigene Formatierungsfunktionen, 8 Kartenfamilien, 5 Rail-Implementierungen, 12 Chart-Module, je 7 bis 9 Varianten für Laden, Leer und Fehler.
- Behobene Fehler:
  - Scroll-Sprünge in Discover.
  - Elf tote Supertrader-Links.
  - Leere Academy-Seite bei einem Ladefehler.
  - News-Seite mit falscher Frische-Behauptung.
  - `javascript:`-URLs im News-Feed.
- Performance: siehe [../frontend/FRONTEND.md](../frontend/FRONTEND.md).

## 3. Zielbild

```
VISION UNIVERSE PRODUCTS   Discover · Quant · Markets · Screener · Supertrader · Technical · News
                           Company Pages · Future Portfolio · Future Retirement · Future App
            │  lesen nur über Verträge (ADR-003)
VISION UNIVERSE API        core/client.js  →  später /v1/... (ADR-004)
            │
VISION UNIVERSE CORE       Securities (core/identity.js, Company Master)
                           Market Data (Tiingo EOD/IEX, R2, eine Preiswahrheit, ADR-002)
                           Fundamentals (SEC) · Corporate Actions · Index Data
                           Intelligence (quant/engines, Supertrader-Engines)
                           Content (News, Company Intelligence)
                           User Data (Schema, getrennt)          core/contracts/user-data.schema.json
                           Data Quality (core/data-quality.js)
                           Jobs (ADR-005) · Monitoring (core/health.js, core/diagnose.js, /status/)
                           Registry: core/registry/domains.json
```

## 4. Migrationsstand

| Schritt | Status |
|---|---|
| Identitätsregel zentral, BRK-B-Fix | ✅ |
| Source-of-Truth-Registry, Health, DQ, Diagnose, Status-Seite | ✅ |
| Datenverträge (`core/client.js`), Golden-Path-Tests | ✅ |
| Commit-Protokoll für Datenläufe | ✅ (Social offen) |
| Produkte lesen über Verträge | ⏳ inkrementell (ADR-003 §Migration) |
| Eine Split-Bereinigung, eine 52W-Definition, eine Gesamtrendite | ⏳ braucht Vorher/Nachher-Vergleich je Produkt |
| Stabile Identität (`instrumentId`, ISIN/FIGI) | ⏳ eigenes Projekt |
| Universum aktuell halten (Neuemissionen, Delistings) | ⏳ geplanter Erzeuger für `eligibility.json` fehlt |
| PWA, `/v1`, User Data, App | ⏳ (APP_READINESS §7) |
