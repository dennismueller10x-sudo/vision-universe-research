# SEC Fundamentals — Daily Incremental Lifecycle

Die historische Fundamentaldatenbasis ist **einmal** aufgebaut (5.479
Emittenten, Normalisierung 1.9.0, Registry 1.5.0) und liegt dauerhaft unter
`r2:vision-universe-history/v1/sec/fundamentals/`. Ab hier hält Vision
Universe sie **einmal täglich automatisch** aktuell. Kein Full Backfill im
Normalbetrieb, keine KI im Tagesbetrieb.

## 1 — Ablauf

Workflow `.github/workflows/sec-fundamentals-daily.yml`, täglich 06:15 UTC,
zusätzlich per `workflow_dispatch` (`since`, `ciks`, `dry_run`):

| Schritt | Was passiert | Anfragen an die SEC |
|---|---|---|
| Speicher laden | Actions-Cache; fehlt er, **Restore aus R2** (sha256 je Objekt) | 0 |
| Ticker-Zuordnung | `company_tickers.json` → Company Master, Emittentenstamm, SEC-Universum | 2 |
| Änderungen erkennen | `master.{YYYYMMDD}.idx` je Kalendertag seit `LAST_SEC_CHECK`; Formulare 10-K, 10-Q, 20-F, 40-F und Amendments; gefiltert auf das Produktuniversum; Vergleich mit `ISSUER_LAST_PROCESSED` | 1 je Tag |
| Verarbeiten | nur Emittenten mit neuem Filing, neue Emittenten, Retry-Schlange: Übersicht und Fakten **frisch** holen, normalisieren, speichern, State schreiben | 2 je Emittent |
| Persistieren | `persist-fundamentals.mjs --push`: nur Objekte mit geänderter sha256 | 0 |
| Reload | aktualisierte Stichprobe aus R2 zurück, `verify-reload` mit gesperrtem Netz | 0 |
| Downstream | Emittenten-Scherben nur für die Aktualisierten, Aggregate aus den Scherben, Abgleich, kanonische Bündel nur für vorhandene, Manifest, Health Report | 0 |
| Commit | State, Reports, Manifest, Scherben | 0 |

An einem normalen Tag sind das unter 300 Anfragen. Unveränderte Emittenten
kosten **keine** Anfrage: `UNCHANGED_ISSUERS_REPROCESSED = 0` ist gemessen,
nicht behauptet.

## 2 — State

`quant/data/fundamentals/daily/state.json` (committet, nach jedem
Emittenten geschrieben, fortsetzbar):

```
LAST_SUCCESSFUL_RUN, LAST_SEC_CHECK, NORMALIZATION_LOGIC_VERSION
ISSUER_LAST_PROCESSED[cik] = { LATEST_ACCESSION, LATEST_FILED_AT,
                               LATEST_ACCEPTED_AT, LATEST_FORM, PROCESSED_AT,
                               NORMALIZATION_LOGIC_VERSION, accessions[] }
runs[]  (die letzten 30 Läufe)
```

Der State wird beim ersten Lauf aus dem Speicher gebootstrappt: die Basis
wurde ohne ihn gebaut, und niemand holt sie dafür erneut. Ein Filing ist
neu, wenn seine Akzessionsnummer dem Emittenten noch nicht zugeordnet ist.
Derselbe Lauf zweimal ergibt denselben Zustand (Dokument und State
byte-gleich, zweiter Lauf ohne Emittentenanfrage).

## 3 — Point-in-Time und Amendments

Die Normalisierung ist deterministisch über den vollen `companyfacts`-Stand
des Emittenten. Ein neues Filing fügt Beobachtungen mit **seiner**
Akzessionsnummer, seinem `filed` und seinem `acceptanceDateTime` hinzu;
nichts Früheres wird überschrieben. Ein Amendment ist eine weitere,
später datierte Beobachtung derselben Zelle: `restated = true`, die
ursprüngliche Beobachtung bleibt, und eine Abfrage `as_of` vor dem
Amendment liefert den ursprünglichen Wert. `CURRENT_NORMALIZED_HISTORY`
(`POLICY_LATEST_KNOWN`) und `POINT_IN_TIME_HISTORY` (`POLICY_AS_OF_LATEST`)
sind getrennt rekonstruierbar — aus demselben Factbook.

## 4 — Fehler

Ein scheiternder Emittent kostet nicht den Lauf: `PARTIAL_SUCCESS`, der
Emittent landet in der Retry-Schlange (`.quant-state/checkpoint-daily.json`,
im Cache) und wird beim nächsten Lauf erneut versucht — höchstens fünf Mal,
danach steht er mit Grund im Bericht statt in einer Endlosschleife. Ein
`companyfacts`-404 ist keine Störung, sondern die Antwort der SEC: leeres
Factbook mit `companyfacts_status = NOT_AVAILABLE_404`.

## 5 — Downstream

`quant/data/fundamentals/daily/updated-issuers.json`:

```json
{ "UPDATED_ISSUERS": [ { "issuerId", "cik", "reason", "latestAccession",
                         "latestFiledAt", "latestAcceptedAt", "latestForm",
                         "metricsChanged", "wasNew" } ],
  "INVALIDATE": ["Fundamental History", "Quant", "Factor DNA", "Screener",
                 "Rankings", "Compare", "Strategy Lab", "Backtesting Data",
                 "Atlas / AI"] }
```

Module, die je Emittent zwischenspeichern, aktualisieren genau diese;
alles andere ist unverändert. Kein Frontend liest den Workflow.

## 6 — Health Report

`quant/data/fundamentals/daily/health-<RUN_DATE>.json` und `latest-run.json`
tragen die Felder aus §16: `RUN_DATE`, `LAST_SUCCESSFUL_RUN`,
`SEC_CHANGES_FOUND`, `NEW_FILINGS`, `AMENDMENTS_FOUND`, `ISSUERS_CHECKED`,
`ISSUERS_CHANGED`, `ISSUERS_UPDATED`, `NO_CHANGE`, `FAILED_ISSUERS`,
`RETRY_QUEUE`, `FACTBOOKS_UPDATED`, `ANNUAL_HISTORIES_UPDATED`,
`QUARTERLY_HISTORIES_UPDATED`, `PIT_HISTORIES_UPDATED`,
`R2_OBJECTS_WRITTEN`, `RELOAD_WITHOUT_SEC_REFETCH`,
`DOWNSTREAM_INVALIDATIONS`, `TOTAL_RUNTIME`, `STATUS`.

## 7 — Abnahme (§19)

Der Nachweis steht im Health Report des ersten echten Laufs und in
`scripts/quant/tests/test_daily.py` (15 Fälle nach §17):

| Kriterium | Beleg |
|---|---|
| `DAILY_INCREMENTAL_READY` | Workflow läuft per Cron und Dispatch; Health Report `STATUS` |
| `FULL_BACKFILL_REQUIRED_FOR_NORMAL_OPERATION = false` | Restore aus R2 statt SEC; Tagesindex statt Universumsabfrage |
| `UNCHANGED_ISSUERS_REPROCESSED = 0` | Health Report; Test: Emittent ohne Filing bekommt keine Anfrage |
| `PIT_PRESERVED` | Test: Amendment lässt den ursprünglichen Fakt und den as-of-Wert stehen |
| `R2_PERSISTENCE` | `persistence.json` push.changed ≥ aktualisierte Emittenten |
| `RELOAD_WITHOUT_SEC_REFETCH` | `reload-verification.json` für die aktualisierte Stichprobe |
| `IDEMPOTENCY` | Test: zwei Läufe, byte-gleiches Dokument, kein zweiter Abruf |
| `RETRY_QUEUE` | Test: Teilfehler → Schlange → nächster Lauf leert sie; Deckel gegen Endlosschleifen |
| `DOWNSTREAM_INVALIDATION_MANIFEST` | `updated-issuers.json` je Lauf |
