# Vision Universe – Plattformarchitektur

> **Einstieg Infrastruktur.** Aktuelle Arbeitsregeln: [CLAUDE.md](../CLAUDE.md); datierte Entscheidungen: [Neustart-Plan](PLAN_NEUSTART_2026-11.md). Bei Widersprüchen zu historischen Abschnitten gelten diese Quellen. Weitere Seiten sind Fachbelege, keine parallelen Einstiege. [Landkarte](README.md).


**Stand:** 3. Oktober 2026, Plattform-Audit (Branch `claude/platform-hardening`).
**Zweck:** Das ist der Einstieg für alle, die an Vision Universe arbeiten, ob Mensch oder AI-Agent.
Wer nur eine Datei liest, liest diese.

> **One Security. One Identity. One Data Truth. One Core. Multiple Experiences.**

Bei Widersprüchen gilt: **Code und Tests vor Prosa**. Der aktuelle Datenstand steht nicht in einem Dokument, sondern wird gemessen (`node scripts/core/system-health.mjs`).

---

## 1. Die Plattform auf einer Seite

```
 PRODUKTE (statische Seiten, GitHub Pages: research.visionuniverse.de)
 Discover · Quant · Elliott · Markets · Screener · Supertrader · Technical · News
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

Elliott ist ein eigenes Produkt (`/elliott/`, Aktienbild unter `#/elliott/<T>`): [ELLIOTT_PRODUCT_ARCHITECTURE.md](ELLIOTT_PRODUCT_ARCHITECTURE.md).
Technical ist ein eigenes Produkt (`/technical/`: Screener, Chart Studio unter `#/chart/<T>`): [technical/TECHNICAL_WORLD_PROGRESS.md](technical/TECHNICAL_WORLD_PROGRESS.md).

Wichtige Grundsatzentscheidungen sind als ADRs festgehalten (`docs/architecture/`):

| ADR | Entscheidung |
|---|---|
| [ADR-001](architecture/ADR-001-canonical-security-id.md) | Eine Identitätsregel: `core/identity.js` |
| [ADR-002](architecture/ADR-002-market-data-source-of-truth.md) | Eine Preiswahrheit: die split-bereinigte Tagesreihe aus dem Tiingo-EOD-Bestand |
| [ADR-003](architecture/ADR-003-core-product-separation.md) | Core und Produkte sind getrennt; Produkte lesen über Verträge |
| [ADR-004](architecture/ADR-004-mobile-architecture.md) | App-Weg: zuerst PWA, dann Expo/React Native gegen dieselbe API |
| [ADR-005](architecture/ADR-005-pipeline-commit-protocol.md) | Datenläufe: Spitze auschecken, `push-with-retry.sh`, Erzeugerhoheit |
| [ADR-006](architecture/ADR-006-accounts-and-billing.md) | Konten: Supabase Auth + Worker `vu-account` (BFF), Abos anbieterunabhängig, Stripe zuerst; gebaut, ausgeschaltet ([docs/accounts/](accounts/ACCOUNTS_AND_SUBSCRIPTIONS.md)) |

---

## 2. Laufzeit und Auslieferung

- **Statisch.** Es gibt keinen Bundler (Ausnahme: `scripts/vu2/build-release.mjs` bündelt die Quant-SPA beim Release) und keinen App-Server.
  Engines sind UMD-Module (`globalThis` + `module.exports`) und laufen gleich in Browser, Node und Web Worker.
- **GitHub Pages** liefert das Repository über `pages-release.yml` aus. Was ausgeliefert wird, entscheidet `build-release.mjs#permitted`:
  `scripts/`, `docs/`, `providers/`, Tests sowie `quant/data/sec` und `quant/data/fundamentals` werden **nicht** ausgeliefert.
- **Release-Ausschnitte (nur in der Auslieferung, nie committet).** Damit eine Aktienseite nicht Dateien für das ganze Universum lädt, schreibt
  `build-release.mjs` aus den committeten Erzeugerdateien kleinere Ansichten: `universe/capability-shards/`, `market/factors/product-shards/`,
  `product/technical-signals-v1/by-ticker/` (ersetzt dort die Zwei-Zeichen-Scherben), `product/universe-list-shards/`, `product/universe-names-v1.json.gz`
  und `market/golden-preview/daily/<id>.chart.json`. Sie tragen die Quellobjekte unverändert; fehlt eine Ansicht (lokal, älterer Stand), liest die Seite die
  volle Datei. Beleg: `quant/tests/stock-page-shards.test.mjs`, `quant/tests/stock-page-payload.test.mjs`. Ein Erzeuger wird dafür nicht angefasst.
- **Offene Tabs über ein Deployment hinweg.** Ein Tab behält den Code, mit dem er geöffnet wurde; GitHub Pages cached 10 Minuten (`max-age=600`). Entfernt oder
  tauscht ein Release danach Dateien (Release-Ausschnitte, nachgeladene Skripte), zeigte der alte Code „nicht verfügbar“ oder lief mit gemischtem Code.
  `scripts/vu2/release-id.mjs` (in `pages-release.yml` nach dem Verkleinern, vor der Passwortsperre) schreibt je Produkt (Quant, Discover) eine Code-Kennung
  nach `<meta name="vu-release">` und `/release-id.json` und stempelt jedes verlinkte JS/CSS mit `?v=<Hash>`. `quant/ui/release-guard.js` vergleicht beide,
  **bevor ein Tab Code nachlädt** (Quant `loadScript`, Discover `lazy.js`) und **nach einem 404** (`QuantShell.loadJSON`): ist ein neuer Code-Stand da, lädt er
  einmal neu (Route, Merkliste in Adresse/localStorage, geänderte Formularfelder in sessionStorage gesichert); nie mitten in einer Eingabe, nie in einer Schleife,
  ohne sessionStorage nur mit Hinweis. Reine Datenläufe ändern die Kennung nicht. **Folge für Autoren:** ein Release darf Dateipfade ändern oder entfernen, ohne
  die alten parallel auszuliefern (die Scherben allein kosteten +230 MB im Pages-Artefakt, Limit 1 GB). Beleg: `quant/tests/release-guard.test.mjs`,
  `quant/tests/release-id.test.mjs`, `scripts/vu2/deploy-switch-qa.mjs` (Browser, Chromium und WebKit, hinter der Sperre, mit Gegenprobe `--without-guard`).
  Die ~1.200 Supertrader-Seiten erhalten dieselben `?v=<Hash>`-Stempel (`STAMP_ONLY` in `release-id.mjs`), aber weder Meta-Tag noch Wächter noch Eintrag in `/release-id.json`:
  eine Navigation im offenen Tab holt so den neuen Code statt `st-chart.js` aus dem 10-Minuten-Cache (nur „Klick ohne Navigation“ bleibt unbehandelt).
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
| Fundamentals Consumer | `quant/data/sec/consumer*` (nicht ausgeliefert; Release-Projektion `fundamental/data/history/`, siehe [FUNDAMENTAL.md](FUNDAMENTAL.md)) | `cli.py consumer` · sec-consumer-fundamentals · Mo 07:30 | Discover, Screener, Fundamental |
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
- **Bekannte Abweichungen** (siehe [Remaining Risks](archiv/2026/PLATFORM_HARDENING_REPORT_2026-10-03.md#remaining-risks)):
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
| Core | `node --test "core/tests/*.test.mjs"` | 52 Tests: Identität, Health, Datenqualität, Diagnose, Contracts, Golden Paths |
| Core, Zustandstests | `node scripts/ci/state-gate.mjs --strict` | Querverträge über erzeugte Daten zweier Produkte (`core/tests/state/`); im PR nur blockierend, wenn der PR einen Eingang berührt, sonst streng (main, Zeitplan) |
| Supertrader-Kette | `node --test core/tests/supertrader-chain.test.mjs` | Anstoß nach dem Nachtlauf (nur bei validierten Daten, kein Doppellauf), Aktualitätsmonitor, tote Ticker-Verweise |
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

- **Produktwelt-Übergaben für die zentrale Entwicklung:** Quant (Backtests, Security-Master-Generationen, interne Vorschau, offene Entscheidungen): [docs/quant/QUANT_FINAL_HANDOVER.md](quant/QUANT_FINAL_HANDOVER.md), maschinenlesbar [docs/quant/quant-handover.json](quant/quant-handover.json). Supertrader (13 Methoden, Kandidaten-Tageslauf und Veröffentlichungsvertrag, V1 S1–S7, historische Infrastruktur, Zertifizierungsvorbereitung, offene PRs): [docs/SUPERTRADER_9_HANDOVER.md](SUPERTRADER_9_HANDOVER.md).

- Ist-Analyse, Befunde, Zielbild: [docs/architecture/README.md](architecture/README.md)
- Datenflüsse: [docs/data/DATA_FLOWS.md](data/DATA_FLOWS.md) · Datenqualität: [docs/data/DATA_QUALITY.md](data/DATA_QUALITY.md)
- Pipelines: [docs/pipelines/PIPELINES.md](pipelines/PIPELINES.md)
- Frontend: [docs/frontend/FRONTEND.md](frontend/FRONTEND.md)
- Betrieb: [docs/operations/RUNBOOK.md](operations/RUNBOOK.md) · Sicherheit: [docs/operations/SECURITY_REVIEW.md](operations/SECURITY_REVIEW.md)
- App Readiness: [docs/architecture/APP_READINESS.md](architecture/APP_READINESS.md)
- Abschlussbericht des Audits: [docs/archiv/2026/PLATFORM_HARDENING_REPORT_2026-10-03.md](archiv/2026/PLATFORM_HARDENING_REPORT_2026-10-03.md)
- Älteres Projekt-Master-Dokument (Quant & AI, Stand 08.09.2026): `VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md`. Es ist historisch wertvoll, beschreibt aber nicht mehr den Ist-Zustand der Plattform.

## Fachbelege und weiterführende Dokumentation

Die folgenden Quellen werden verlinkt, nicht zusammenkopiert. Bei datierten Berichten bezeichnet „gültig“ ihren Referenzwert; daraus folgt keine neue Freigabe.

- [EMERGING_LEADERS.md](EMERGING_LEADERS.md)
- [ETF_DATA_RIGHTS.md](ETF_DATA_RIGHTS.md)
- [ETF_EU_DATA_ARCHITECTURE.md](ETF_EU_DATA_ARCHITECTURE.md)
- [ETF_EU_FREE_SOURCE_SCORECARD.md](ETF_EU_FREE_SOURCE_SCORECARD.md)
- [ETF_EU_MARKET_DATA_GAPS.md](ETF_EU_MARKET_DATA_GAPS.md)
- [ETF_PRIMARY_SOURCE_MATRIX.md](ETF_PRIMARY_SOURCE_MATRIX.md)
- [HERO_VISUAL_FIDELITY_REPORT.md](HERO_VISUAL_FIDELITY_REPORT.md)
- [HISTORICAL_SIC_PIT_REPORT.md](HISTORICAL_SIC_PIT_REPORT.md)
- [PREMIUM_DESIGN_SYSTEM_2.md](PREMIUM_DESIGN_SYSTEM_2.md)
- [PREMIUM_DESIGN_SYSTEM_2_REPORT.md](PREMIUM_DESIGN_SYSTEM_2_REPORT.md)
- [PROTECTED_HOSTING_MIGRATION_DATA_HYGIENE_PHASE0_2026-09-08.md](PROTECTED_HOSTING_MIGRATION_DATA_HYGIENE_PHASE0_2026-09-08.md)
- [PROTECTED_PREVIEW_REAL_DATA_AUDIT_2026-09-08.md](PROTECTED_PREVIEW_REAL_DATA_AUDIT_2026-09-08.md)
- [RESEARCH_ACCESS_GATE.md](RESEARCH_ACCESS_GATE.md)
- [SECURITY_MASTER_CONTENT_HASH.md](SECURITY_MASTER_CONTENT_HASH.md)
- [SECURITY_MASTER_EXCHANGE_DIRECTORY.md](SECURITY_MASTER_EXCHANGE_DIRECTORY.md)
- [TIINGO_COMMERCIAL_PHASE1_ABSCHLUSSBERICHT.md](TIINGO_COMMERCIAL_PHASE1_ABSCHLUSSBERICHT.md)
- [TIINGO_COMMERCIAL_PHASE1_REMEDIATION.md](TIINGO_COMMERCIAL_PHASE1_REMEDIATION.md)
- [TIINGO_COMMERCIAL_SCALE_PHASE1.md](TIINGO_COMMERCIAL_SCALE_PHASE1.md)
- [TIINGO_DATA_SEMANTICS.md](TIINGO_DATA_SEMANTICS.md)
- [TIINGO_FREE_LIMITS.md](TIINGO_FREE_LIMITS.md)
- [TIINGO_INTEGRATION.md](TIINGO_INTEGRATION.md)
- [TIINGO_LIVE_ARCHITECTURE.md](TIINGO_LIVE_ARCHITECTURE.md)
- [TIINGO_PHASE4A_REPORT.md](TIINGO_PHASE4A_REPORT.md)
- [TIINGO_SCALING_PLAN.md](TIINGO_SCALING_PLAN.md)
- [VISION_UNIVERSE_3_MILESTONE.md](VISION_UNIVERSE_3_MILESTONE.md)
- [VU_AI_TOOL_ARCHITECTURE.md](VU_AI_TOOL_ARCHITECTURE.md)
- [VU_API_INTEGRATION_GUIDE.md](VU_API_INTEGRATION_GUIDE.md)
- [VU_ARCHITECTURE.md](VU_ARCHITECTURE.md)
- [VU_BUILD_STATUS.md](VU_BUILD_STATUS.md)
- [VU_CANONICAL_RECONCILIATION_REPORT.md](VU_CANONICAL_RECONCILIATION_REPORT.md)
- [VU_COMPANY_NAME_ENRICHMENT.md](VU_COMPANY_NAME_ENRICHMENT.md)
- [VU_CREATIVE_TRIGGER_PRODUCTION_READINESS.md](VU_CREATIVE_TRIGGER_PRODUCTION_READINESS.md)
- [VU_CURRENCY_FX_LAYER.md](VU_CURRENCY_FX_LAYER.md)
- [VU_DATA_PROVIDER_COST_MODEL.md](VU_DATA_PROVIDER_COST_MODEL.md)
- [VU_EOD_REJECTION_RECOVERY_2026-09-18.md](VU_EOD_REJECTION_RECOVERY_2026-09-18.md)
- [VU_FINANCIAL_DATA_MODEL.md](VU_FINANCIAL_DATA_MODEL.md)
- [VU_FREE_DATA_SOURCE_MAP.md](VU_FREE_DATA_SOURCE_MAP.md)
- [VU_HYBRID_DATA_MODE.md](VU_HYBRID_DATA_MODE.md)
- [VU_INDEX_COVERAGE_P0.md](VU_INDEX_COVERAGE_P0.md)
- [VU_INTRADAY_DELIVERY_RELIABILITY.md](VU_INTRADAY_DELIVERY_RELIABILITY.md)
- [VU_INVESTMENT_INTELLIGENCE_IMPLEMENTATION_PLAN.md](VU_INVESTMENT_INTELLIGENCE_IMPLEMENTATION_PLAN.md)
- [VU_MARKETS_2_MARKET_INTELLIGENCE.md](VU_MARKETS_2_MARKET_INTELLIGENCE.md)
- [VU_MARKETS_3_CONSUMER_INTELLIGENCE.md](VU_MARKETS_3_CONSUMER_INTELLIGENCE.md)
- [VU_MARKETS_PREMIUM_ART_DIRECTION.md](VU_MARKETS_PREMIUM_ART_DIRECTION.md)
- [VU_MARKET_DATA_ARCHITECTURE.md](VU_MARKET_DATA_ARCHITECTURE.md)
- [VU_MARKET_DATA_FRESHNESS_P0_ROOT_CAUSE_REPORT.md](VU_MARKET_DATA_FRESHNESS_P0_ROOT_CAUSE_REPORT.md)
- [VU_MARKET_STRUCTURE_METHODOLOGY.md](VU_MARKET_STRUCTURE_METHODOLOGY.md)
- [VU_MOCK_DATA.md](VU_MOCK_DATA.md)
- [VU_MULTI_ASSET_DATA_CORE.md](VU_MULTI_ASSET_DATA_CORE.md)
- [VU_MULTI_ASSET_FINAL_REPORT.md](VU_MULTI_ASSET_FINAL_REPORT.md)
- [VU_OWNER_STEP_A_META_REAUTH.md](VU_OWNER_STEP_A_META_REAUTH.md)
- [VU_OWNER_STEP_B_YOUTUBE.md](VU_OWNER_STEP_B_YOUTUBE.md)
- [VU_PHASE3_PROVIDER_QUALIFICATION.md](VU_PHASE3_PROVIDER_QUALIFICATION.md)
- [VU_PIT_DATA_REQUIREMENTS.md](VU_PIT_DATA_REQUIREMENTS.md)
- [VU_PIVOT_METHODOLOGY.md](VU_PIVOT_METHODOLOGY.md)
- [VU_PRICE_ADJUSTMENT_SEMANTICS.md](VU_PRICE_ADJUSTMENT_SEMANTICS.md)
- [VU_PRODUCTION_RELEASE_V41_ZERO_COST_REALTIME.md](VU_PRODUCTION_RELEASE_V41_ZERO_COST_REALTIME.md)
- [VU_PROVIDER_ARCHITECTURE.md](VU_PROVIDER_ARCHITECTURE.md)
- [VU_PROVIDER_CAPABILITIES.md](VU_PROVIDER_CAPABILITIES.md)
- [VU_PROVIDER_DECISION_MATRIX.md](VU_PROVIDER_DECISION_MATRIX.md)
- [VU_PROVIDER_LICENSE_CHECKLIST.md](VU_PROVIDER_LICENSE_CHECKLIST.md)
- [VU_REALTIME_MARKET_DATA_ARCHITECTURE.md](VU_REALTIME_MARKET_DATA_ARCHITECTURE.md)
- [VU_REALTIME_MARKET_DATA_VALIDATION.md](VU_REALTIME_MARKET_DATA_VALIDATION.md)
- [VU_REALTIME_PREVIEW_INTEGRATION.md](VU_REALTIME_PREVIEW_INTEGRATION.md)
- [VU_RECONCILIATION_ACCEPTANCE_REPORT.md](VU_RECONCILIATION_ACCEPTANCE_REPORT.md)
- [VU_REPAINTING_POLICY.md](VU_REPAINTING_POLICY.md)
- [VU_SCENARIO_ENGINE.md](VU_SCENARIO_ENGINE.md)
- [VU_SCREENER.md](VU_SCREENER.md)
- [VU_STOCK_PAGE_SESSION_TRUTH_2026-09-19.md](VU_STOCK_PAGE_SESSION_TRUTH_2026-09-19.md)
- [VU_STRATEGY_SCHEMA.md](VU_STRATEGY_SCHEMA.md)
- [VU_TIINGO_FIRST_MARKET_TRACKERS.md](VU_TIINGO_FIRST_MARKET_TRACKERS.md)
- [VU_TWELVE_DATA_ADAPTER.md](VU_TWELVE_DATA_ADAPTER.md)
- [VU_UNIVERSE_EXPANSION.md](VU_UNIVERSE_EXPANSION.md)
- [VU_UNIVERSE_EXPANSION_ABSCHLUSSBERICHT.md](VU_UNIVERSE_EXPANSION_ABSCHLUSSBERICHT.md)
- [VU_V41_ZERO_COST_REALTIME_FINAL_PRE_MERGE_ACCEPTANCE.md](VU_V41_ZERO_COST_REALTIME_FINAL_PRE_MERGE_ACCEPTANCE.md)
- [VU_VORSORGE.md](VU_VORSORGE.md)
- [VU_VUQL_SPEC.md](VU_VUQL_SPEC.md)
- [VU_ZERO_COST_REALTIME_V1.md](VU_ZERO_COST_REALTIME_V1.md)
- [architecture/ADR-001-canonical-security-id.md](architecture/ADR-001-canonical-security-id.md)
- [architecture/ADR-002-market-data-source-of-truth.md](architecture/ADR-002-market-data-source-of-truth.md)
- [architecture/ADR-003-core-product-separation.md](architecture/ADR-003-core-product-separation.md)
- [architecture/ADR-004-mobile-architecture.md](architecture/ADR-004-mobile-architecture.md)
- [architecture/ADR-005-pipeline-commit-protocol.md](architecture/ADR-005-pipeline-commit-protocol.md)
- [architecture/ADR-006-accounts-and-billing.md](architecture/ADR-006-accounts-and-billing.md)
- [architecture/ADR-007-capacitor-prototype.md](architecture/ADR-007-capacitor-prototype.md)
- [architecture/APP_READINESS.md](architecture/APP_READINESS.md)
- [architecture/CORE_ADOPTION.md](architecture/CORE_ADOPTION.md)
- [architecture/README.md](architecture/README.md)
- [audits/GATE_AUDIT_2026-10-23.md](audits/GATE_AUDIT_2026-10-23.md)
- [audits/VU3_FINALISIERUNG_2026-10-22.md](audits/VU3_FINALISIERUNG_2026-10-22.md)
- [audits/VU3_UI_REFRESH_ABSCHLUSS_2026-10-21.md](audits/VU3_UI_REFRESH_ABSCHLUSS_2026-10-21.md)
- [audits/VU3_VISUELLE_BESTANDSAUFNAHME_2026-10-21.md](audits/VU3_VISUELLE_BESTANDSAUFNAHME_2026-10-21.md)
- [charts/CHART_STANDARD.md](charts/CHART_STANDARD.md)
- [data/CORPORATE_ACTION_GIBO_2026.md](data/CORPORATE_ACTION_GIBO_2026.md)
- [data/DATA_FINDINGS_2026-10-04.md](data/DATA_FINDINGS_2026-10-04.md)
- [data/DATA_FLOWS.md](data/DATA_FLOWS.md)
- [data/DATA_QUALITY.md](data/DATA_QUALITY.md)
- [data/SECURITY_MASTER_DUPLICATE_RESOLUTION.md](data/SECURITY_MASTER_DUPLICATE_RESOLUTION.md)
- [data/SECURITY_MASTER_IDENTITY_BLOCKLIST.md](data/SECURITY_MASTER_IDENTITY_BLOCKLIST.md)
- [data/SECURITY_MASTER_WEEKLY.md](data/SECURITY_MASTER_WEEKLY.md)
- [data/TIINGO_LICENSE_REVIEW.md](data/TIINGO_LICENSE_REVIEW.md)
- [data/security-master/ELIGIBILITY_CATCHUP_2026-11.md](data/security-master/ELIGIBILITY_CATCHUP_2026-11.md)
- [data/security-master/ELIGIBILITY_CLEANUP_2026-11-06.md](data/security-master/ELIGIBILITY_CLEANUP_2026-11-06.md)
- [data/security-master/SECURITY_MASTER_1_3_0_FREIGABE.md](data/security-master/SECURITY_MASTER_1_3_0_FREIGABE.md)
- [data/security-master/SECURITY_MASTER_GENERATIONS.md](data/security-master/SECURITY_MASTER_GENERATIONS.md)
- [data/security-master/TICKER_REUSE_QUARANTINE.md](data/security-master/TICKER_REUSE_QUARANTINE.md)
- [data/security-master/V130_APPROVAL_2026-11-01.md](data/security-master/V130_APPROVAL_2026-11-01.md)
- [data/security-master/V130_APPROVAL_LISTS_RUN_41177449137.md](data/security-master/V130_APPROVAL_LISTS_RUN_41177449137.md)
- [data/security-master/V130_APPROVAL_LISTS_RUN_41285528656.md](data/security-master/V130_APPROVAL_LISTS_RUN_41285528656.md)
- [data/security-master/V130_APPROVAL_LISTS_RUN_41877792353.md](data/security-master/V130_APPROVAL_LISTS_RUN_41877792353.md)
- [data/security-master/V130_APPROVAL_LIST_RERUN_2026-10-30.md](data/security-master/V130_APPROVAL_LIST_RERUN_2026-10-30.md)
- [data/security-master/V130_APPROVAL_LIST_REVIEW.md](data/security-master/V130_APPROVAL_LIST_REVIEW.md)
- [data/security-master/V130_G7_CANONICAL_EVIDENCE.md](data/security-master/V130_G7_CANONICAL_EVIDENCE.md)
- [data/security-master/V130_OWNER_APPROVAL_2026-10-30.md](data/security-master/V130_OWNER_APPROVAL_2026-10-30.md)
- [data/security-master/V130_OWNER_APPROVAL_2026-10-31.md](data/security-master/V130_OWNER_APPROVAL_2026-10-31.md)
- [data/security-master/V130_SWITCH_FREIGABE.md](data/security-master/V130_SWITCH_FREIGABE.md)
- [data/security-master/v130-switch-lists.md](data/security-master/v130-switch-lists.md)
- [design/VU3_UI_SYSTEM.md](design/VU3_UI_SYSTEM.md)
- [design/redesign-2027/BAUKASTEN.md](design/redesign-2027/BAUKASTEN.md)
- [design/redesign-2027/HANDOVER.md](design/redesign-2027/HANDOVER.md)
- [design/redesign-2027/PROGRESS.md](design/redesign-2027/PROGRESS.md)
- [design/redesign-2027/README.md](design/redesign-2027/README.md)
- [europe21/LOGOS.md](europe21/LOGOS.md)
- [europe21/PRODUCTS.md](europe21/PRODUCTS.md)
- [europe21/REGRESSION_VALIDATION.md](europe21/REGRESSION_VALIDATION.md)
- [europe21/german-regional-primary-policy.md](europe21/german-regional-primary-policy.md)
- [europe21/review-a-classification.md](europe21/review-a-classification.md)
- [europe21/review-b-identity.md](europe21/review-b-identity.md)
- [europe21/review-c-quality.md](europe21/review-c-quality.md)
- [europe21/review-f-products.md](europe21/review-f-products.md)
- [europe21/review-g-credits.md](europe21/review-g-credits.md)
- [europe21/review-price-overlay.md](europe21/review-price-overlay.md)
- [europe21/review-resolution-contract.md](europe21/review-resolution-contract.md)
- [frontend/FRONTEND.md](frontend/FRONTEND.md)
- [handover/MASTERUEBERGABE_MOBILE_APP.md](handover/MASTERUEBERGABE_MOBILE_APP.md)
- [market-validation/README.md](market-validation/README.md)
- [marketstack-europe/BENCHMARKS.md](marketstack-europe/BENCHMARKS.md)
- [marketstack-europe21/corporate-actions.md](marketstack-europe21/corporate-actions.md)
- [marketstack-europe21/price-quality.md](marketstack-europe21/price-quality.md)
- [mobile/ANDROID_PLAN.md](mobile/ANDROID_PLAN.md)
- [mobile/ANDROID_STEP_BY_STEP.md](mobile/ANDROID_STEP_BY_STEP.md)
- [mobile/APPLE_DEVELOPER_NAME.md](mobile/APPLE_DEVELOPER_NAME.md)
- [mobile/PERFORMANCE.md](mobile/PERFORMANCE.md)
- [mobile/PHASE1_REPORT.md](mobile/PHASE1_REPORT.md)
- [mobile/PHASE2_REPORT.md](mobile/PHASE2_REPORT.md)
- [mobile/SECURITY_LOGIN.md](mobile/SECURITY_LOGIN.md)
- [mobile/TESTFLIGHT_PLAN.md](mobile/TESTFLIGHT_PLAN.md)
- [mobile/TESTFLIGHT_STEP_BY_STEP.md](mobile/TESTFLIGHT_STEP_BY_STEP.md)
- [mobile/UI_INTEGRATION.md](mobile/UI_INTEGRATION.md)
- [neustart/A-infrastruktur.md](neustart/A-infrastruktur.md)
- [neustart/D-frontend.md](neustart/D-frontend.md)
- [neustart/E-codex.md](neustart/E-codex.md)
- [neustart/G-labor.md](neustart/G-labor.md)
- [operations/BASELINE_TEST_ISOLATION.md](operations/BASELINE_TEST_ISOLATION.md)
- [operations/INSTAGRAM_CLAUDE_CODE.md](operations/INSTAGRAM_CLAUDE_CODE.md)
- [operations/INSTAGRAM_REELS.md](operations/INSTAGRAM_REELS.md)
- [operations/RUNBOOK.md](operations/RUNBOOK.md)
- [operations/SECURITY_REVIEW.md](operations/SECURITY_REVIEW.md)
- [pipelines/PIPELINES.md](pipelines/PIPELINES.md)
- [reports/europe-continuity-449-20261012/README.md](reports/europe-continuity-449-20261012/README.md)
- [reports/europe-historical-provider-review-20261103/README.md](reports/europe-historical-provider-review-20261103/README.md)
- [reports/europe-integrity-449-20261013/README.md](reports/europe-integrity-449-20261013/README.md)
- [reports/europe-live-revalidation-449-20261013/README.md](reports/europe-live-revalidation-449-20261013/README.md)
- [reports/europe-marketstack-diagnostics-20261103/README.md](reports/europe-marketstack-diagnostics-20261103/README.md)
- [reports/europe-marketstack-gap-analysis-20261103/README.md](reports/europe-marketstack-gap-analysis-20261103/README.md)
- [reports/europe-marketstack-support-report-20261103/README.md](reports/europe-marketstack-support-report-20261103/README.md)
- [reports/europe-marketstack-support-report-20261103/SUPPORT_REQUEST.md](reports/europe-marketstack-support-report-20261103/SUPPORT_REQUEST.md)
- [research/edge/BERICHT.md](research/edge/BERICHT.md)
- [research/edge/PROTOKOLL.md](research/edge/PROTOKOLL.md)
- [research/edge/README.md](research/edge/README.md)
- [research/edge/VALIDIERUNG.md](research/edge/VALIDIERUNG.md)
- [research/holdout/ERGEBNIS-2008-2015.md](research/holdout/ERGEBNIS-2008-2015.md)
- [research/labor/BERICHT.md](research/labor/BERICHT.md)
- [research/labor/E6-PROTOKOLL-REVIEW-CODEX.md](research/labor/E6-PROTOKOLL-REVIEW-CODEX.md)
- [research/labor/PROTOKOLL.md](research/labor/PROTOKOLL.md)
- [research/labor/README.md](research/labor/README.md)
- [research/signals/ERGEBNISSE.md](research/signals/ERGEBNISSE.md)
- [research/signals/PROTOKOLL.md](research/signals/PROTOKOLL.md)
- [research/signals/README.md](research/signals/README.md)
- [research/signals/S2_ERGEBNIS.md](research/signals/S2_ERGEBNIS.md)
- [research/signals/S2_REGISTRIERUNG.md](research/signals/S2_REGISTRIERUNG.md)
- [research/signals/VALIDIERUNG.md](research/signals/VALIDIERUNG.md)
- [tiingo2-finalization/README.md](tiingo2-finalization/README.md)
- [tiingo2/FINAL_REPORT.md](tiingo2/FINAL_REPORT.md)
- [tiingo2/README.md](tiingo2/README.md)
- [vu2/ARCHITECTURE_DELTA.md](vu2/ARCHITECTURE_DELTA.md)
- [vu2/BUILD_STATUS.md](vu2/BUILD_STATUS.md)
- [vu2/CURRENT_STATE.md](vu2/CURRENT_STATE.md)
- [vu2/EXECUTION_LEDGER.md](vu2/EXECUTION_LEDGER.md)
- [vu2/FEATURE_PARITY_GATE.md](vu2/FEATURE_PARITY_GATE.md)
- [vu2/OWNER_DECISION_FULL_PIT_DELIVERY.md](vu2/OWNER_DECISION_FULL_PIT_DELIVERY.md)
- [vu2/PHASE_EXISTING_ARTIFACT_INTEGRATION.md](vu2/PHASE_EXISTING_ARTIFACT_INTEGRATION.md)
- [vu2/PHASE_LIVE_RELAY_INTEGRATION.md](vu2/PHASE_LIVE_RELAY_INTEGRATION.md)
- [vu2/PHASE_PIT_ADAPTER_SCOPE.md](vu2/PHASE_PIT_ADAPTER_SCOPE.md)
- [vu2/PHASE_QUARTERLY_ARTIFACT_INTEGRATION.md](vu2/PHASE_QUARTERLY_ARTIFACT_INTEGRATION.md)
- [vu2/TRACEABILITY.md](vu2/TRACEABILITY.md)
- [vu2/phases/01a-lifecycle.md](vu2/phases/01a-lifecycle.md)
- [vu2/phases/01b-contracts.md](vu2/phases/01b-contracts.md)
- [vu2/phases/01c-strict-incremental.md](vu2/phases/01c-strict-incremental.md)
- [vu2/phases/02-experience.md](vu2/phases/02-experience.md)
- [vu2/phases/03-research-workspaces.md](vu2/phases/03-research-workspaces.md)
- [vu2/phases/04-screener-workspace.md](vu2/phases/04-screener-workspace.md)
- [vu2/phases/07-strategy-workspace.md](vu2/phases/07-strategy-workspace.md)
- [vu2/phases/08-portfolio-workspace.md](vu2/phases/08-portfolio-workspace.md)
- [vu2/phases/09-market-signals.md](vu2/phases/09-market-signals.md)
- [vu2/phases/10-metric-catalog.md](vu2/phases/10-metric-catalog.md)
- [vu2/phases/11-watchlist-workspace.md](vu2/phases/11-watchlist-workspace.md)
- [vu2/phases/12-home-integration.md](vu2/phases/12-home-integration.md)
- [vu2/phases/13-atlas-evidence.md](vu2/phases/13-atlas-evidence.md)
- [vu2/phases/14-journey-gate.md](vu2/phases/14-journey-gate.md)
- [vu2/phases/15-compare-workspace.md](vu2/phases/15-compare-workspace.md)
- [vu2/phases/16-shell-accessibility.md](vu2/phases/16-shell-accessibility.md)
- [vu2/phases/17-stock-evidence.md](vu2/phases/17-stock-evidence.md)
- [vu2/phases/18-recovery-navigation.md](vu2/phases/18-recovery-navigation.md)
- [vu2/phases/19-history-navigation.md](vu2/phases/19-history-navigation.md)
- [vu2/phases/20-lifecycle-integration.md](vu2/phases/20-lifecycle-integration.md)
- [vu2/phases/21-market-freshness.md](vu2/phases/21-market-freshness.md)
- [vu2/phases/22-main-drift-integration.md](vu2/phases/22-main-drift-integration.md)
- [vu2/phases/23-accessibility-validation.md](vu2/phases/23-accessibility-validation.md)
- [vu2/phases/24-resource-budget-validation.md](vu2/phases/24-resource-budget-validation.md)
- [vu2/phases/26-durable-history-handoff.md](vu2/phases/26-durable-history-handoff.md)
- [vu2/phases/27-history-sync-boundary.md](vu2/phases/27-history-sync-boundary.md)
- [vu2/phases/28-usage-state-contract.md](vu2/phases/28-usage-state-contract.md)
- [vu2/phases/29-operating-handoff.md](vu2/phases/29-operating-handoff.md)
- [vu2/phases/30-current-canonical-convergence.md](vu2/phases/30-current-canonical-convergence.md)
- [vu2/phases/31-canonical-product-integration.md](vu2/phases/31-canonical-product-integration.md)
- [vu2/phases/32-canonical-rule-contract.md](vu2/phases/32-canonical-rule-contract.md)
- [vu2/phases/35-setup-state-contract.md](vu2/phases/35-setup-state-contract.md)
- [vu2/release/POST_RELEASE_SCOPE_CORRECTION.md](vu2/release/POST_RELEASE_SCOPE_CORRECTION.md)

### Historische Arbeitsstände

Abgelöste Übergaben und Statusberichte; zur Nachvollziehbarkeit erhalten. Maßgeblich sind der Einstieg und der aktuelle Plan.

- [GAP_CHECK_2026-10-04.md](archiv/2026/GAP_CHECK_2026-10-04.md)
- [GAP_CHECK_2026-10-05.md](archiv/2026/GAP_CHECK_2026-10-05.md)
- [MASTER_COMPLETION_3_0.md](archiv/2026/MASTER_COMPLETION_3_0.md)
- [MISSION_FINAL_REPORT_2026-10-04.md](archiv/2026/MISSION_FINAL_REPORT_2026-10-04.md)
- [MISSION_FINAL_REPORT_2026-10-05.md](archiv/2026/MISSION_FINAL_REPORT_2026-10-05.md)
- [MISSION_STATUS_2026-10-03.md](archiv/2026/MISSION_STATUS_2026-10-03.md)
- [PLATFORM_HARDENING_REPORT_2026-10-03.md](archiv/2026/PLATFORM_HARDENING_REPORT_2026-10-03.md)
- [VU_IMPLEMENTATION_REPORT.md](archiv/2026/VU_IMPLEMENTATION_REPORT.md)
- [VU_PHASE2_IMPLEMENTATION_REPORT.md](archiv/2026/VU_PHASE2_IMPLEMENTATION_REPORT.md)
- [VU_PHASE2_PRODUCTION_AUDIT.md](archiv/2026/VU_PHASE2_PRODUCTION_AUDIT.md)
- [VU_PHASE3_IMPLEMENTATION_REPORT.md](archiv/2026/VU_PHASE3_IMPLEMENTATION_REPORT.md)
