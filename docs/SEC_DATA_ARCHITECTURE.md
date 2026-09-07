# VISION UNIVERSE® QUANT & AI — SEC Financial Data Core V1

Phase 4. Architektur, Integrationspunkte und Betrieb der SEC-/EDGAR-Fundamental-Pipeline.

## 0. Repository-Audit (vor der Implementierung durchgeführt)

### CURRENT ARCHITECTURE

Der Auftrag setzte voraus, dass „Phase 1–3 von Vision Universe Quant & AI" mit
Provider-Abstraction, Capability-Matrix, Data-Provenance, PIT-Gates,
Qualification-Tests, Quant Engine, Screener, Strategy Engine und Backtest Engine
bereits im Repository liegen. **Das ist nachweislich nicht der Fall.** Vollständige
Suche über das Repository (`provider`, `capability`, `provenance`, `qualification`,
`screener`, `point-in-time`, `trustScore`, `quant`) liefert ausschließlich Treffer in
redaktionellen Inhalten (`academy/*.json`, `magazin/01/index.html`,
`macro/data/*.json`, `hedgefonds/data/hedgefonds.json`) — kein Code, keine Interfaces,
keine Tests, keine Dokumentation.

Tatsächlich vorhanden ist eine statische GitHub-Pages-Site mit produktweise
getrennten, entkoppelten Daten-Pipelines:

| Ebene | Realität im Repo |
| --- | --- |
| Auslieferung | Statisches HTML/CSS/JS über GitHub Pages, kein Build, keine Frameworks |
| Produktverzeichnisse | `dashboard/`, `macro/`, `academy/`, `hedgefonds/`, `etf/`, `analysten/`, `morning/`, `news/`, `reports/` |
| Daten-Pipelines | `scripts/<produkt>/*.py`, Python 3, **ausschließlich Standard-Library** |
| Daten-Artefakte | Generiertes JSON unter `<produkt>/data/`, vom Browser direkt geladen |
| Orchestrierung | GitHub Actions pro Pipeline, mit Scope-Guard auf die erlaubten Ausgabedateien |
| Tests | Inline-Python-Assertions in den CI-Workflows + `academy/engines/financial-model-engine.test.mjs` |
| Marktdaten | Twelve Data → `dashboard/data/market_data.json` |
| Fundamentaldaten (bestehend) | FMP TTM-Snapshot → `dashboard/data/fundamental_metrics.json` — **kein Point-in-Time, keine Historie, keine Provenance** |
| Backtest | `scripts/dashboard/backtest_technicals.py` — rein technischer Baseline-Backtest auf Tageskerzen |
| SEC-Zugriff (bestehend) | `scripts/hedgefonds/fetch_edgar_data.py` — 13F-Holdings, korrekter SEC-User-Agent, Retry, Rate-Delay |

Es gibt also **keine bestehende Provider-Abstraktion, die wiederverwendet werden
könnte**, und keine PIT-Gates aus einer „Phase 3". Was existiert, sind Konventionen —
und die werden hier strikt eingehalten (Python-Stdlib-Pipelines unter `scripts/`,
statisches JSON unter `<produkt>/data/`, CI mit Scope-Guard, `ARCHITECTURE.md` je
Produkt).

Die Anweisung „nicht neu erfinden, keine Parallelarchitektur" wurde deshalb so
umgesetzt: **Konventionen** des Repos werden übernommen, die fehlenden
Quant-Abstraktionen (Provider-Interface, Provenance, PIT, Capability/Gates) werden
in Phase 4 erstmals gebaut — als *die eine* Quant-Datenschicht, nicht als zweite
neben einer bestehenden.

### SEC INTEGRATION POINTS

1. **Provider-Ebene** — neu: `scripts/quant/sec/provider.py` (`SECProvider`) als einzige
   Stelle im Repository, die `data.sec.gov` / `www.sec.gov` für Fundamentals anspricht.
2. **HTTP-Ebene** — neu: `scripts/quant/sec/http_client.py`. Der SEC-konforme
   User-Agent aus `fetch_edgar_data.py` (`VisionUniverseResearch info@visionuniverse.de`)
   wird als Konvention übernommen.
3. **Storage-Ebene** — neu: `scripts/quant/sec/store.py` mit abstraktem `FactStore`,
   JSON-Implementierung passend zur statischen Pages-Architektur.
4. **Quant-Ebene** — neu: `scripts/quant/sec/factors.py` konsumiert ausschließlich
   PIT-aufgelöste Snapshots.
5. **Backtest-Ebene** — `scripts/quant/sec/backtest_bridge.py` importiert die
   **bestehende** `scripts/dashboard/backtest_technicals.py` und legt einen
   PIT-Fundamentalfilter davor. Die bestehende Datei bleibt unverändert.
6. **UI-Ebene** — `quant/data-inspector/` als internes Validierungswerkzeug, nach dem
   Muster von `hedgefonds/index.html` (statisch, lädt nur generiertes JSON).

### FILES TO ADD

`scripts/quant/sec/*` (Pipeline), `scripts/quant/tests/*` (Testsuite),
`quant/config/metric_registry.json`, `quant/config/sec_universe.json`,
`quant/data-inspector/*`, `quant/ARCHITECTURE.md`, `docs/SEC_*.md`,
`.github/workflows/sec-fundamentals-ci.yml`, `.github/workflows/update-sec-fundamentals.yml`.

### FILES TO MODIFY

`.gitignore` (Raw-Cache und Laufzeit-State ausschließen). Sonst nichts. Insbesondere
werden `scripts/dashboard/*`, `dashboard/data/*`, `scripts/hedgefonds/*` und alle
bestehenden Workflows **nicht** angefasst.

### RISKS

| Risiko | Umgang |
| --- | --- |
| `fy`/`fp` in `companyfacts` beziehen sich auf die **Filing**-Periode, nicht auf die Faktenperiode | Fiskalperiode wird ausschließlich aus `start`/`end` + gelerntem Fiskalkalender abgeleitet (§ SEC_NORMALIZATION) |
| YTD-Kumulierung führt zu Double Counting | Period-aware Normalisierung mit YTD-Differenzbildung, nur aus zum Stichtag verfügbaren Filings |
| Restatements können rückwirkend in Backtests lecken | Fakten werden als versionierte Timeline gespeichert, Auflösung immer `as_of` |
| Große Raw-Datensätze im öffentlichen Repo | Raw-Layer und Cache sind gitignored, CI erzwingt Größen- und Scope-Guard |
| Egress-Policy dieser Session blockiert `data.sec.gov` | Live-Validierung läuft über GitHub Actions; alle Offline-Tests laufen ohne Netz |

## 1. Schichtenmodell

```
SEC / EDGAR (data.sec.gov, www.sec.gov)
        │  http_client.py   Fair Access: UA, Rate-Limit, Retry, Backoff, Cache, Dedup, Logging
        ▼
SECProvider (provider.py)          Ticker→CIK, Submissions, CompanyFacts, Filing-Metadaten
        │
        ▼
SEC RAW LAYER (raw_store.py)       unveränderliche Rohfakten + Provenance, niemals überschrieben
        │
        ▼
NORMALIZATION LAYER                registry.py (Concept-Mapping) · fiscal.py (Kalender)
(normalize.py)                     periods.py (YTD/TTM) · restatements.py (Versionierung)
        │
        ▼
VU FUNDAMENTAL DATA MODEL          model.py — kanonische Metriken, Provenance, Quality-State
        │
        ├──► quality.py            Data-Quality-Engine (markiert, verändert nie)
        │
        ▼
DERIVED METRICS (derived.py)       source = VISION_UNIVERSE_DERIVED, inputs, formula_version
        │
        ▼
QUANT ENGINE (factors.py)          Growth · Profitability · Quality · Capital Efficiency
        │
        ▼
Screener / Backtest (backtest_bridge.py) · AI · Data Inspector UI
```

Jede Ebene kennt nur die darunterliegende. Es gibt **keinen** SEC-Fetch außerhalb von
`http_client.py`/`provider.py`.

## 2. Module

| Datei | Verantwortung |
| --- | --- |
| `version.py` | Versionsstempel für Normalization-Schema, Metric-Mapping, Formeln, Provider-Adapter |
| `http_client.py` | SEC Fair Access: User-Agent, Token-Bucket-Rate-Limit, Retry mit exponentiellem Backoff + Jitter, Timeouts, HTTP-Fehlerklassifikation, Disk-Cache mit TTL, In-Flight-Deduplizierung, strukturiertes Logging |
| `provider.py` | `SECProvider`: `resolve_ticker`, `get_submissions`, `get_company_facts`, `get_filing_metadata`, `get_company_profile`, `iter_raw_facts` |
| `raw_store.py` | Append-only Raw-Layer, ein Snapshot je Abruf, Content-Hash, nie überschrieben |
| `registry.py` | Canonical Metric Registry: Laden, Validieren, Concept-Auflösung nach Priorität |
| `fiscal.py` | Fiskalkalender je Unternehmen: FY-Anker aus 10-K-Fakten, Offset-Lernen, 52/53-Wochen, Quartalszuordnung |
| `periods.py` | Perioden-Klassifikation (instant/quarter/half/ytd3/annual), YTD-Deakkumulation, TTM |
| `normalize.py` | Roh-XBRL → kanonische Fakten inkl. vollständiger Provenance |
| `restatements.py` | Versionierte Fact-Timeline, `as_of`-Auflösung, Restatement-Policies |
| `quality.py` | 12 Prüfungen, markiert Probleme, verändert nie Werte |
| `derived.py` | VU-Derived-Metriken mit `formula_version` und Input-Referenzen |
| `store.py` | `FactStore`-Abstraktion + `JsonFactStore` (Migrationspfad DuckDB/Parquet/Postgres) |
| `pipeline.py` | `ingest_company`, `ingest_universe`, `update_company`, `refresh_since`, Checkpointing, Retry-Queue, Failure-Log |
| `coverage.py` | Coverage-Matrix (STRUCTURED / DERIVABLE / FILING_ONLY / MISSING) |
| `gates.py` | PIT-Qualification-Gates inkl. `MOCK_FUTURE_DATA_LEAK`, `MOCK_RESTATEMENT`, `MOCK_DELISTED` |
| `factors.py` | Quant-Faktoren auf PIT-Snapshots |
| `backtest_bridge.py` | PIT-Fundamentalfilter vor dem bestehenden Backtest, blockiert bei unzureichender Datenlage |
| `cli.py` | Einziger Einstiegspunkt für alle Kommandos |

## 3. Betrieb

```bash
python3 scripts/quant/cli.py ingest       --universe quant/config/sec_universe.json
python3 scripts/quant/cli.py update       --since 2026-01-01
python3 scripts/quant/cli.py coverage     --out quant/data/coverage_matrix.json
python3 scripts/quant/cli.py gates        --out quant/data/pit_gates.json
python3 scripts/quant/cli.py inspect      --ticker NVDA --metric revenue
python3 scripts/quant/cli.py snapshot     --as-of 2024-06-30
python3 scripts/quant/cli.py test
```

Ohne Netzzugang laufen `test` und alle Offline-Kommandos vollständig; `ingest`,
`update`, `coverage` und `gates` benötigen Zugriff auf `data.sec.gov` und laufen
in GitHub Actions (`update-sec-fundamentals.yml`).

## 4. Datenhygiene

- `.sec-cache/`, `quant/data/raw/`, `.quant-state/` sind gitignored.
- Die CI erzwingt: keine Datei unter `quant/data/` größer als 2 MB, Summe unter 10 MB.
- Keine Secrets: die SEC-APIs brauchen keinen API-Key, nur einen Kontakt-User-Agent.
  Dieser ist die bereits öffentliche Repository-Kontaktadresse, konfigurierbar über
  `SEC_USER_AGENT`.

## 5. Skalierung

Siehe `docs/SEC_PHASE4_REPORT.md` § Rollout. Kurz: `ingest_universe` ist über CIK
parametrisiert und kennt keine Ticker-Sonderfälle; Checkpointing macht Läufe über
tausende Unternehmen fortsetzbar; ab ~500 Unternehmen ersetzt der Bulk-Pfad
(`companyfacts.zip`) die Einzelabrufe, ab ~5.000 wird `JsonFactStore` gegen eine
DuckDB-/Parquet-Implementierung des gleichen `FactStore`-Interfaces getauscht —
ohne Änderung an Normalisierung, Quant Engine oder Backtest.
