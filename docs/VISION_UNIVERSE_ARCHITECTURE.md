# Vision Universe – Plattformarchitektur

**Stand:** 3. Oktober 2026, Plattform-Audit (Branch `claude/platform-hardening`).
**Zweck:** Das ist der Einstieg für alle, die an Vision Universe arbeiten, ob Mensch oder AI-Agent.
Wer nur eine Datei liest, liest diese.

> **One Security. One Identity. One Data Truth. One Core. Multiple Experiences.**

Bei Widersprüchen gilt: **Code und Tests vor Prosa**. Der aktuelle Datenstand steht nicht in einem Dokument, sondern wird gemessen (`node scripts/core/system-health.mjs`).

---

## 1. Die Plattform auf einer Seite

```
 PRODUKTE (statische Seiten, GitHub Pages: research.visionuniverse.de)
 Discover · Quant · Markets · Screener · Supertrader · Technical · News
 Company Pages (Discover-Aktienseite, Quant #/aktie) · Status (/status/)
                │                 (künftig: Portfolio, Retirement, App)
                ▼
 APPLICATION / API LAYER
   core/client.js                 Data Contracts (getSecurity, getPriceSeries, …)
   quant/api/product-services.js  Quant-2.0-Produktdienste (Workspaces, Evidenz)
   api/*.js (Vercel)              /api/intraday, /api/history, /api/status
   workers/, worker/              Cloudflare: vu-live (Realtime), vu-ask, social
                │
                ▼
 VISION UNIVERSE CORE
   Securities      core/identity.js · eligibility.json · Company Master (quant/data/universe)
   Market Data     Tiingo EOD/IEX → .market-cache + R2 → discover-series(-long), intraday
   Fundamentals    SEC companyfacts → quant/data/fundamentals, quant/data/sec (nicht ausgeliefert)
   Corp. Actions   splitFactor/divCash je Balken → canonical-total-return.js
   Index Data      quant/data/market/index-membership
   Intelligence    quant/engines/** (Faktoren, Technical, Elliott, Regime, Setups), scripts/supertrader
   Content         News, Morning, Magazin, Company Intelligence
   Data Quality    core/data-quality.js
   Monitoring      core/health.js · core/diagnose.js · /status/ · Freshness-Monitor
   Jobs            72 GitHub-Actions-Workflows (docs/pipelines/PIPELINES.md)
   Registry        core/registry/domains.json  ← Source of Truth je Datenart
```

Wichtige Grundsatzentscheidungen sind als ADRs festgehalten (`docs/architecture/`):

| ADR | Entscheidung |
|---|---|
| [ADR-001](architecture/ADR-001-canonical-security-id.md) | Eine Identitätsregel: `core/identity.js` |
| [ADR-002](architecture/ADR-002-market-data-source-of-truth.md) | Eine Preiswahrheit: die split-bereinigte Tagesreihe aus dem Tiingo-EOD-Bestand |
| [ADR-003](architecture/ADR-003-core-product-separation.md) | Core und Produkte sind getrennt; Produkte lesen über Verträge |
| [ADR-004](architecture/ADR-004-mobile-architecture.md) | App-Weg: zuerst PWA, dann Expo/React Native gegen dieselbe API |
| [ADR-005](architecture/ADR-005-pipeline-commit-protocol.md) | Datenläufe: Spitze auschecken, `push-with-retry.sh`, Erzeugerhoheit |

---

## 2. Laufzeit und Auslieferung

- **Statisch.** Es gibt keinen Bundler (Ausnahme: `scripts/vu2/build-release.mjs` bündelt die Quant-SPA beim Release) und keinen App-Server.
  Engines sind UMD-Module (`globalThis` + `module.exports`) und laufen gleich in Browser, Node und Web Worker.
- **GitHub Pages** liefert das Repository über `pages-release.yml` aus. Was ausgeliefert wird, entscheidet `build-release.mjs#permitted`:
  `scripts/`, `docs/`, `providers/`, Tests sowie `quant/data/sec` und `quant/data/fundamentals` werden **nicht** ausgeliefert.
- **Vercel** hostet nur die Funktionen unter `api/` (`vercel.json`). Die Daten liest es zur Laufzeit von der Pages-Auslieferung oder aus R2.
- **Cloudflare Workers** sind getrennte Deployments: `worker/` (vu-live, Realtime-WebSocket), `workers/vu-ask` (AI Atlas),
  `workers/vision-universe-social`, `worker-waker/`.
- **R2 (S3-kompatibel)** ist die dauerhafte Kurshistorie (`scripts/market/sync-history-store.mjs`, `quant/engines/history-store.js`).
  Die Arbeitsablage `.market-cache/` lebt im Actions-Cache und wird nicht committet.
- **Daten im Git.** Generierte Artefakte werden von Workflows nach `main` committet. Deshalb gilt das Commit-Protokoll aus ADR-005 für jeden Datenlauf.

---

## 3. Source of Truth je Datenart

Die maschinenlesbare Quelle ist **`core/registry/domains.json`**. Die Tabelle hier ist ihre Zusammenfassung.
Bei Abweichung gilt die Registry; ein Test prüft, dass jedes eingetragene Artefakt, jeder Workflow und jedes Erzeugerskript existiert.

| Datenart | Kanonisches Artefakt (Probe) | Erzeuger · Workflow · Zeitplan | Hauptverbraucher |
|---|---|---|---|
| Securities (Produktuniversum) | `quant/data/market/security-master/eligibility.json` | `build-us-eligibility.mjs` · manuell | Refresh-Umfang, Faktoren, Discover, Screener |
| Company Master | `quant/data/universe/master-manifest.json` + `instruments/*.json` | `build-company-master.mjs` · sec-fundamentals-daily, universe-master · täglich | Suche, Quant-Dienste, Company Intelligence |
| EOD-Kurse | Tiingo-EOD → `.market-cache`/R2 → `quant/data/market/discover-series/ref_*.json` | `ingest-tiingo.mjs` → `publish-discover-series.mjs` · market-data-refresh · Mo–Fr 22:30 UTC | Discover, Screener, Quant, Supertrader, Technical |
| Lange Reihen (5J/Max) | `quant/data/market/discover-series-long/` | `publish-long-series.mjs` · long-series + Materialisierung | Discover, Supertrader |
| Intraday | `quant/data/market/intraday/index.json` + `<Sitzung>/<securityId>.json` | `ingest-intraday.mjs` · intraday-pacemaker/-snapshots/-watchdog | Discover, Quant, Markets, `api/intraday` |
| Splits/Dividenden | im Rohbalken (`splitFactor`, `divCash`); Probe `listing-continuity-v1.json` | im Refresh | Split-Bereinigung, `canonical-total-return.js` |
| Fundamentals (SEC) | `quant/data/fundamentals/` (nicht ausgeliefert) | `cli.py daily` · sec-fundamentals-daily · täglich 06:15 | Discover-Geschäftszahlen, Quant, Supertrader |
| Fundamentals Consumer | `quant/data/sec/consumer*` (nicht ausgeliefert) | `cli.py consumer` · sec-consumer-fundamentals · Mo 07:30 | Discover, Screener |
| Index Membership | `quant/data/market/index-membership/` | `build-index-membership.mjs` · index-membership · Sa 07:20 | Discover, Screener |
| Faktoren | `quant/data/market/factors/factors-FULL_UNIVERSE.json` | `build-market-factors.mjs` · Refresh | Discover, Screener, Quant |
| Quant-Produktdaten | `quant/data/product/**` | Materialisierung (aus dem Refresh) | Quant 2.0 |
| Supertrader | `supertrader/data/*.json` | `scripts/supertrader/build.mjs` · supertrader-signals · Di–Sa 06:17 | /supertrader/, Ask |
| News | `dashboard/data/news_feed.json` | `update_news.mjs` · update-news · **nur manuell** | /news/ |

Die vollständige Kette **Quelle → Ingestion → Normalisierung → Speicher → abgeleitete Daten → API → Produkt → UI** steht je Datenart in [docs/data/DATA_FLOWS.md](data/DATA_FLOWS.md).

---

## 4. Identität (ADR-001)

| Kennung | Form | Bedeutung |
|---|---|---|
| `securityId` | `ref_<TICKER>`; jedes Zeichen außer A–Z/0–9 wird `_` | Schlüssel aller ausgelieferten Kursartefakte. Aus dem Ticker abgeleitet, also **nicht stabil** bei einer Tickeränderung. |
| `instrumentId` | `vu_<hash>` | Company Master: Anbieter + Börse + Symbol + Generation |
| `issuerId` | `iss_cik_<CIK>` | Emittent (Unternehmen) |

**Regel:** Keine Datei bildet `"ref_" + ticker` selbst. Die einzige Bildung ist `core/identity.js#securityIdForTicker`.
Sie ist byte-gleich zu `company-master.js#legacySecurityId` und gegen alle 7.803 Ticker getestet.
Vor dieser Regel gab es sieben verschiedene Bildungen. Deshalb fehlte BRK-B in Faktoren und Discover, und Supertrader-Charts für BRK-A, MOG-A, BF-B und PBR-A zeigten auf Dateien, die es nicht gibt.

---

## 5. Eine Preiswahrheit (ADR-002)

- **Quelle:** Tiingo EOD. Rohe OHLC, `splitFactor` und `divCash` je Balken.
- **Bereinigung:** Produkte zeigen **split-bereinigte** Schlusskurse. Die Bereinigung wird aus `splitFactor` rekonstruiert, nicht aus der `adjClose`-Spalte des Anbieters (`return-series.js#splitAdjustedColumn`).
- **Gesamtrendite:** `canonical-total-return.js` rechnet sie aus Rohkurs, Split und Dividende.
- **Kurs und Tagesänderung:** der letzte Punkt der Tagesreihe und der Punkt davor (`core/client.js#getLatestPrice`).
  Karte, Aktienseite und Contract nutzen dieselbe Reihe. `DQ-PX-5` und der Golden-Path-Test prüfen das.
- **Rundung:** ab 1 $ auf Cent, darunter vier signifikante Stellen (`published-close.js#roundClose`). Ein Kurs ist nie 0.
- **Bekannte Abweichungen** (siehe [Remaining Risks](PLATFORM_HARDENING_REPORT_2026-10-03.md#remaining-risks)):
  - Markets-Movers rechnen mit IEX-Intraday statt mit dem EOD-Schluss.
  - `market-factors.js#investorReturn` nutzt die Anbieterspalte statt `canonical-total-return.js`.
  - Der 52-Wochen-Hoch-Wert ist in vier Engines unterschiedlich definiert.

---

## 6. Wie debugge ich …

| Frage | Befehl / Ort |
|---|---|
| Läuft die Plattform? | `node scripts/core/system-health.mjs` (Repository) · `--site=https://research.visionuniverse.de` (live) · Browser: `/status/` |
| Warum ist die Aktie X falsch oder veraltet? | `node scripts/core/diagnose.mjs X` · Browser: `/status/#/X` |
| Sind die Daten in sich stimmig? | `node scripts/core/data-quality.mjs` |
| Wo kommen Kurse her? | Abschnitt 3, `docs/data/DATA_FLOWS.md#eod` |
| Wo entstehen Company Pages? | `scripts/discover/build-discover-data.mjs` → `discover/data/stocks/US_REAL/<T>.json`, gerendert von `discover/ui/detail.js` |
| Wie läuft Quant? | `docs/data/DATA_FLOWS.md#quant`, `quant/ARCHITECTURE.md` |
| Wie entsteht Discover? | `docs/data/DATA_FLOWS.md#discover` |
| Ein Datenlauf ist rot | `docs/operations/RUNBOOK.md` |

Das Betriebshandbuch mit konkreten Reparaturschritten steht in [docs/operations/RUNBOOK.md](operations/RUNBOOK.md).

---

## 7. Tests

| Suite | Befehl | Umfang (03.10.2026) |
|---|---|---|
| Core | `node --test "core/tests/*.test.mjs"` | 53 Tests: Identität, Health, Datenqualität, Diagnose, Contracts, Golden Paths |
| Quant und Plattform | `node --test "quant/tests/*.test.mjs"` | 2.315 Tests |
| Discover, Supertrader, Screener | `node --test "discover/tests/*.test.mjs" "scripts/supertrader/tests/*.test.mjs" "screener/tests/*.test.mjs"` | 494 Tests |
| Social | `node --test "social/tests/*.test.mjs" "workers/vision-universe-social/tests/*.test.mjs"` | 2.319 Tests |
| SEC (Python) | `python3 -m unittest discover -s scripts/quant/tests -p 'test_*.py'` | 486 Tests |
| Testisolation | `node scripts/quality/check-test-isolation.mjs` | Ändert ein Testlauf Produktionsdaten? |

**Regel:** Ein Test darf niemals Dateien unter `quant/data`, `discover/data` oder `social/data` schreiben.
Skripte, die Tests ausführen, bekommen dafür `--out` (Beispiel: `verify-total-return-capability.mjs`).

---

## 8. Lokale Entwicklung

```bash
node --version                       # 22.x, keine Abhängigkeiten zu installieren
python3 -m http.server 8765          # Website lokal: http://localhost:8765/discover/, /quant/, /status/
node scripts/core/system-health.mjs  # Zustand des lokalen Stands
node --test "core/tests/*.test.mjs"  # schnelle Plattformtests (~5 s)
```

Für Live-Abrufe (Tiingo, SEC) braucht es Schlüssel. Sie laufen ausschließlich in GitHub Actions.

---

## 9. Weiterführend

- Ist-Analyse, Befunde, Zielbild: [docs/architecture/README.md](architecture/README.md)
- Datenflüsse: [docs/data/DATA_FLOWS.md](data/DATA_FLOWS.md) · Datenqualität: [docs/data/DATA_QUALITY.md](data/DATA_QUALITY.md)
- Pipelines: [docs/pipelines/PIPELINES.md](pipelines/PIPELINES.md)
- Frontend: [docs/frontend/FRONTEND.md](frontend/FRONTEND.md)
- Betrieb: [docs/operations/RUNBOOK.md](operations/RUNBOOK.md) · Sicherheit: [docs/operations/SECURITY_REVIEW.md](operations/SECURITY_REVIEW.md)
- App Readiness: [docs/architecture/APP_READINESS.md](architecture/APP_READINESS.md)
- Abschlussbericht des Audits: [docs/PLATFORM_HARDENING_REPORT_2026-10-03.md](PLATFORM_HARDENING_REPORT_2026-10-03.md)
- Älteres Projekt-Master-Dokument (Quant & AI, Stand 08.09.2026): `VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md`. Es ist historisch wertvoll, beschreibt aber nicht mehr den Ist-Zustand der Plattform.
