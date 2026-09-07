# VISION UNIVERSE® QUANT & AI — SEC Financial Data Core V1

Phase 4. Architektur, Integrationspunkte und Betrieb der SEC-/EDGAR-Fundamental-Pipeline.

## 0. Repository-Audit und Integrationskorrektur

### Der erste Audit war falsch — und warum

Der erste Durchgang dieser Phase kam zu dem Schluss, Phase 1–3 existiere nicht im
Repository. **Das war falsch.** Die Ursache ist rein zeitlich und im Git-Verlauf
nachweisbar:

| Zeitpunkt (UTC, 7. Sep. 2026) | Ereignis |
| --- | --- |
| 10:11 | `0c4fb06` ist `main`-HEAD. Der SEC-Branch wird hier abgezweigt. |
| 10:59 | PR **#43** bringt Phase 1–3 (`quant/**`, `providers/**`, `scripts/market/**`) nach `main`. |
| 17:16 | SEC-Commit `785a9c2` — auf dem Stand von 10:11 gebaut. |
| 17:25 | PR **#45** bringt `VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md` nach `main`. |

Phase 1–3 landete **48 Minuten nach dem Abzweig** auf `main`, während die
SEC-Arbeit bereits lief. Der Container arbeitet auf einem beim Start erzeugten
Klon; ohne erneutes `git fetch` bleibt dieser Stand eingefroren. `git merge-base
HEAD origin/main` bestätigt `0c4fb06`, und `git merge-base --is-ancestor 0e32110
0c4fb06` schlägt fehl — die Phase-3-Commits waren vom Branchpoint aus
nachweislich nicht erreichbar.

Der Audit war also für den Baum, auf dem er lief, korrekt und für `main` veraltet.
**Die Lehre für die Arbeitsweise: vor dem Audit `git fetch origin` ausführen, nicht
nur `git log`.** Ein Audit ohne Fetch beschreibt den Container, nicht das Projekt.

### Was tatsächlich auf `main` liegt

`VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md` ist die Source of Truth. Relevant für
diese Phase:

| Ebene | Ort auf `main` |
| --- | --- |
| Provider-Abstraction (7 Interfaces, Registry, Vendor-Leakage-Guard) | `quant/engines/provider.js` |
| Kanonisches Modell (26 Entitäten, Validator, PIT-Zugriff) | `quant/engines/schema.js` |
| Capability-Matrix (dreiwertig) | `quant/engines/capabilities.js` |
| Data Mode / Precedence / Price Semantics | `data-mode.js`, `data-precedence.js`, `price-semantics.js` |
| Qualifikations-Gates A/B/C | `quant/engines/gate-tests.js` |
| Quant Engine, Strategy Engine, Backtest Engine | `factors.js`, `quant-score.js`, `strategy.js`, `backtest.js`, `trust-score.js` |
| Provider-Profile (Belegstufen) | `quant/config/provider-profiles.json` |
| Adaptermuster | `providers/twelve-data/adapter.js` |
| Tests | `quant/tests/*.test.mjs` — 232 grün vor dieser Phase |

`main` sagt selbst (§21): „Phase 4 / SEC Financial Data Core ist ausdrücklich NICHT
enthalten". Diese Phase liefert genau das — als **Quelle unterhalb der bestehenden
Abstraktion**, nicht als zweites System daneben.

### Die zentrale Regel dieser Integration

> **`availableAt <= decisionTime` aus `quant/engines/schema.js` ist die einzige
> Zugriffsregel auf Fundamentaldaten. Der SEC-Adapter bringt keine eigene mit.**

Die SEC-seitige PIT-Logik bleibt vollständig erhalten, aber sie wirkt dort, wo sie
hingehört: **beim Ingest**, wo Quartale aus Year-to-date-Werten rekonstruiert
werden und ein rekonstruierter Wert nie früher verfügbar sein darf als seine
letzte Zutat. Was den Adapter verlässt, ist kanonisch und wird von der bestehenden
Regel gelesen.

### Duplikate: Entscheidung je Komponente

| SEC-Komponente | Entscheidung | Begründung |
| --- | --- | --- |
| `http_client.py` (SEC Fair Access) | **KEEP AS SEC-SPECIFIC** | `market-client.js` ist die Transportschicht für Marktdaten-Anbieter; SEC-User-Agent-Pflicht und Bulk-ZIP sind quellspezifisch |
| `provider.py` (Abruf) | **ADAPT** | bleibt Adapter-Unterbau; die eigene `CAPABILITIES`-Konstante wurde **entfernt** |
| `registry.py`, `fiscal.py`, `periods.py`, `normalize.py` | **KEEP AS SEC-SPECIFIC** | XBRL-Normalisierung, Fiskalkalender, YTD-Rekonstruktion — kein Gegenstück auf `main` |
| `restatements.py` | **MERGE** | Timeline bleibt für den Ingest; nach außen `revisionId` + `restatementStatus` gemäß `schema.js` |
| `model.py` | **ADAPT** | `RawFact` bleibt SEC-intern; `NormalizedFact` wird an der Grenze zu `FundamentalFact` |
| `derived.py` | **REDUCE** | Margen, ROE, ROIC, Growth, CAGR **entfernt** — `engines/factors.js` besitzt sie. Es bleibt die Rekonstruktion kanonischer Kennzahlen (FCF, Gross Profit, Net Debt, Invested Capital, Accruals) |
| `factors.py` | **REMOVE DUPLICATE** | `engines/factors.js` + `quant-score.js` sind die Quant Engine |
| `backtest_bridge.py` | **REMOVE DUPLICATE** | `engines/backtest.js` ist die PIT-Backtest-Engine; die Bridge zielte auf den technischen Dashboard-Baseline-Backtest |
| `gates.py` | **MERGE** | die drei MOCK-Gates **entfernt** (`engines/gate-tests.js` ist die eine Qualifikationsinstanz); es bleiben die Ingest-Integritätsprüfungen |
| Capability-Deklaration | **MERGE** | steht genau einmal in `quant/config/provider-profiles.json`; Python und JS lesen dieselbe Datei |
| `store.py`, `pipeline.py`, `coverage.py`, `quality.py` | **KEEP AS SEC-SPECIFIC** | Ingest-Infrastruktur ohne Gegenstück |
| `canonical.py` | **NEU** | die Grenze: SEC-Fakten → `FundamentalFact` / `Filing` / `Security` |
| `providers/sec/adapter.js` | **NEU** | implementiert `FundamentalDataProvider` |
| Data Inspector | **ADAPT** | nutzt jetzt `quant/ui/shell.js` und `quant/ui/quant.css`, kein eigenes Designsystem |

Nach der Integration gibt es **je genau eine** Provider-Abstraction,
Provenance-Schicht, PIT-Architektur, Capability-Matrix, Quant-Datenstruktur und
Backtest-Engine.

## 1. Schichtenmodell

```
SEC / EDGAR (data.sec.gov, www.sec.gov)
        │  http_client.py    Fair Access: UA, Rate-Limit, Retry, Backoff, Cache, Dedup, Logging
        ▼
SECProvider (provider.py)    Ticker→CIK, Submissions, CompanyFacts, Filing-Metadaten
        ▼
SEC RAW LAYER (store.py)     unveraenderliches Payload-Archiv, inhaltsadressiert
        ▼
NORMALIZATION                registry.py (Concept-Mapping) · fiscal.py (Kalender)
(normalize.py)               periods.py (YTD/TTM) · restatements.py (Revisionen)
        ▼
SEC FACTBOOK (model.py)      + quality.py — markiert Probleme, veraendert nie Werte
        ▼
canonical.py  ══════════ DIE GRENZE ══════════════════════════════════════════
        ▼                 ab hier kein SEC-Begriff mehr
quant/data/sec/canonical/<TICKER>.json    FundamentalFact · Filing · Security
        ▼
providers/sec/adapter.js     implementiert FundamentalDataProvider
        ▼
quant/engines/provider.js    Registry · ok()/unavailable() · Vendor-Leakage-Guard
quant/engines/schema.js      availableAt <= decisionTime  ← DIE Zugriffsregel
        ▼
factors.js · quant-score.js · strategy.js · backtest.js · trust-score.js
        ▼
Screener · Ranking · Backtest · AI · Data Inspector
```

Zwei Grenzen, die das Ganze tragen:

1. **Kein SEC-Fetch außerhalb von `http_client.py`/`provider.py`.**
2. **Kein SEC-Feld oberhalb von `canonical.py` / `adapter.js`.** `schema.js`
   erzwingt das aktiv: der Validator lehnt unbekannte Felder ab, und
   `findVendorLeakage()` durchsucht Records zusätzlich auf Anbieter-Marker. Beides
   wird in `quant/tests/sec-adapter.test.mjs` geprüft.

Alles, was `main` schon besitzt — Provider-Abstraction, Capability-Matrix,
Provenance, PIT-Regel, Quant Engine, Backtest Engine — wird **benutzt**, nicht
nachgebaut.

## 2. Module

### Ingest (Python, Standard-Library, `scripts/quant/sec/`)

| Datei | Verantwortung |
| --- | --- |
| `version.py` | Versionsstempel: Normalization-Schema, Metric-Mapping, Formeln, Adapter, Quality-Regeln |
| `http_client.py` | SEC Fair Access: sich ausweisender User-Agent, Token-Bucket (5 req/s), Retry mit exponentiellem Backoff + Jitter, Timeouts, Fehlerklassifikation, gzip-Disk-Cache mit TTL, In-Flight-Deduplizierung, strukturiertes Logging |
| `provider.py` | `SECProvider`: `resolve_ticker`, `get_submissions` (inkl. gemergter älterer Filing-Seiten), `get_company_facts`, `get_filing_metadata`, `get_company_profile`, `iter_raw_facts`, `iter_bulk_company_facts`. Deklariert **keine** eigenen Capabilities |
| `registry.py` | Canonical Metric Registry: Laden, Validieren, Concept-Auflösung nach Priorität |
| `fiscal.py` | Fiskalkalender je Unternehmen: FY-Anker aus 10-K-Fakten, gelernter Label-Offset, 52/53-Wochen, Quartalszuordnung |
| `periods.py` | Perioden-Klassifikation, YTD-Deakkumulation, TTM — alles innerhalb des PIT-Fensters |
| `normalize.py` | Roh-XBRL → SEC-Factbook inkl. vollständiger Provenance |
| `restatements.py` | Versionierte Fact-Timeline, `as_of`-Auflösung, Restatement-Policies |
| `quality.py` | 12 Prüfungen; markiert Probleme, verändert nie Werte |
| `derived.py` | Rekonstruktion **kanonischer** Kennzahlen (FCF, Gross Profit, Net Debt, Invested Capital, Accruals). Keine Ratios, kein Growth — das ist `engines/factors.js` |
| `canonical.py` | Die Grenze: SEC-Fakten → `FundamentalFact` / `Filing` / `Security` nach `schema.js` |
| `gates.py` | Ingest-Integritätsprüfungen. **Nicht** die Qualifikations-Gates — die stehen in `engines/gate-tests.js` |
| `store.py` | `RawStore` / `FactStore`-Abstraktion + JSON-Implementierungen + `CheckpointStore` |
| `pipeline.py` | `ingest_company`, `ingest_universe`, `refresh_since`, `retry_failed`, Checkpointing, Retry-Queue, Failure-Log |
| `coverage.py` | Coverage-Matrix (STRUCTURED / DERIVABLE / FILING_ONLY / MISSING) |
| `cli.py` | Einziger Einstiegspunkt |

### Anbindung (JavaScript)

| Datei | Verantwortung |
| --- | --- |
| `providers/sec/adapter.js` | Implementiert `FundamentalDataProvider`; liest die kanonischen Artefakte; `getFactsAsOf`/`getUniverseAsOf` für `gate-tests.js`; Capabilities aus dem gemeinsamen Profil |
| `scripts/quant/run-sec-gates.mjs` | Fährt Gate A/B/C aus `engines/gate-tests.js` gegen den Adapter und schreibt das Ergebnis |
| `quant/tests/sec-adapter.test.mjs` | 28 Tests: Interface, Schema-Konformität, Vendor-Leakage, PIT, Restatements, Gates, Capabilities, Sektorregeln |

## 3. Betrieb

```bash
# Ingest (benoetigt data.sec.gov — laeuft in GitHub Actions)
python3 scripts/quant/cli.py ingest    --universe quant/config/sec-universe.json
python3 scripts/quant/cli.py update    --since 2026-01-01
python3 scripts/quant/cli.py retry

# Ableitungen (offline, aus dem lokalen Factbook)
python3 scripts/quant/cli.py canonical    # -> quant/data/sec/canonical/*.json
python3 scripts/quant/cli.py coverage
python3 scripts/quant/cli.py gates        # Ingest-Pruefungen
python3 scripts/quant/cli.py export       # Data-Inspector-Sichten
python3 scripts/quant/cli.py inspect --ticker NVDA --metric revenue

# Qualifikation und Tests (offline)
node scripts/quant/run-sec-gates.mjs      # Gate A/B/C gegen den Adapter
python3 scripts/quant/cli.py test         # SEC-Ingest-Suite
node --test "quant/tests/*.test.mjs"      # gesamte Quant-Suite
```

## 4. Datenhygiene

- `.sec-cache/`, `quant/data/sec/raw/`, `quant/data/sec/facts/` und `.quant-state/`
  sind gitignored: gross und jederzeit reproduzierbar.
- `quant/data/sec/canonical/` wird **committet** — es ist die Datenschicht, die der
  Adapter ausliefert, genau wie `quant/data/securities.json`.
- Die CI erzwingt: keine Datei unter `quant/data/` größer als 2 MB, Summe unter 10 MB.
- Keine Secrets: die SEC-APIs brauchen keinen API-Key, nur einen Kontakt-User-Agent.
  Dieser ist die bereits öffentliche Repository-Kontaktadresse, konfigurierbar über
  `SEC_USER_AGENT`.

## 5. Skalierung

Siehe `docs/SEC_PHASE4_REPORT.md` § Rollout. Kurz: `ingest_universe` ist über CIK
parametrisiert und kennt keine Ticker-Sonderfälle; Checkpointing macht Läufe über
tausende Unternehmen fortsetzbar; ab ~500 Unternehmen ersetzt der Bulk-Pfad
(`companyfacts.zip`) die Einzelabrufe, ab ~5.000 wird `JsonFactStore` gegen eine
DuckDB-/Parquet-Implementierung des gleichen `FactStore`-Interfaces getauscht.
Weder Normalisierung noch Adapter noch Quant Engine noch Backtest ändern sich
dabei — der Adapter kennt nur `loadAll()`, und das Interface dahinter ist
austauschbar.

## 6. Verhältnis zu Tiingo

`main` führt Tiingo bisher ausschließlich als Eintrag in der
Vendor-Leakage-Sperrliste (`VENDOR_MARKERS`) — es gibt keinen Adapter. Die
Zielarchitektur bleibt davon unberührt und ist arbeitsteilig:

```
SEC     → PIT-Fundamentaldaten, Filings, Restatements   (FundamentalDataProvider)
Tiingo  → OHLCV, Corporate Actions, soweit validiert     (MarketDataProvider,
                                                          CorporateActionsProvider)
VU      → kanonische Schicht, Quant, Strategy, Backtest
```

Der SEC-Adapter beansprucht `MarketDataProvider`, `EstimateDataProvider` und
`CorporateActionsProvider` **ausdrücklich nicht**; ein Test prüft das. Damit kann
ein späterer Tiingo-Adapter dieselben Interfaces belegen, ohne mit SEC zu
kollidieren, und die Regeln aus `data-precedence.js` entscheiden bei
Überschneidungen. Es wird hier bewusst keine SEC-Logik für Datenklassen gebaut,
die von einem Marktdaten-Anbieter kommen sollen.
