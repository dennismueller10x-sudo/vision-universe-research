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

Der Nachweis besteht aus drei echten Läufen des Workflows auf dem
Entwicklungszweig (ausgelöst durch Pushes auf den Lifecycle, siehe
Workflow-Kommentar zum Dispatch vor dem Merge) und aus
`scripts/quant/tests/test_daily.py` (22 Fälle nach §17).

| Lauf | Fenster | Filings im Index | Emittenten geprüft / geändert / aktualisiert | SEC-Anfragen | R2 | Reload |
|---|---|---|---|---|---|---|
| 34808756359 (Lauf 2) | 09-08 … 09-14 | 97 (92 neu, 5 Amendments) | 5.479 / 1 / 1 (CIK 0002115436) | 7 Index + 2 je Emittent | 1 Objekt geschrieben | PASS 1/1 |
| 34810787817 (Lauf 3) | 09-08 … 09-14 | 97 | 5.479 / 1 / 0 (Übersicht = Speicher) | 7 Index + 1 Übersicht | 0 geschrieben, 5.480 unverändert | — |
| 34812797630 (Lauf 4) | 09-14 | 0 (noch kein Index) | 5.479 / 0 / 0 | 1 | 0 geschrieben, 5.480 unverändert | NOT_NEEDED |

Lauf 2 und 3 endeten im Downstream (NameError, fehlender Parser-Default);
die Erkennung, der Ingest, die Persistenz und der Reload davor waren
vollständig. Lauf 4 lief durch und committete State, Health Report und
Manifest (`quant/data/fundamentals/daily/`).

| Kriterium | Ergebnis | Beleg |
|---|---|---|
| `DAILY_INCREMENTAL_READY` | PASS | Lauf 4 `STATUS: SUCCESS`, `TOTAL_RUNTIME 2,9 s`; Cron `15 6 * * *` und `workflow_dispatch` im Workflow |
| `FULL_BACKFILL_REQUIRED_FOR_NORMAL_OPERATION` | false | Kein Lauf las das Universum von der SEC; Basis kommt aus dem Actions-Cache oder per `--restore` aus R2 (sha256-geprüft) |
| `UNCHANGED_ISSUERS_REPROCESSED` | 0 | Lauf 3: 5.478 Emittenten ohne Anfrage, der eine genannte nur per Übersicht geprüft (`UNCHANGED_ISSUERS_CHECKED_AGAINST_SEC 1`); Lauf 4: 0 Anfragen an Emittenten |
| `PIT_PRESERVED` | PASS | Test `AmendmentTests`: ursprünglicher Fakt und Akzession bleiben, as-of vor dem Amendment unverändert; Lauf 2 `ACCESSION_DUPLICATES 0` |
| `R2_PERSISTENCE` | PASS | Lauf 2: 1 geändertes Objekt geschrieben; Lauf 3/4: 0 geschrieben, 5.480 unverändert (Index-Skip per sha256); Daily State zusätzlich als `_daily-state.json` |
| `RELOAD_WITHOUT_SEC_REFETCH` | PASS | Lauf 2: Reload der aktualisierten Stichprobe 1/1 bei gesperrtem Netz; ohne Updates `NOT_NEEDED` mit Verweis auf den letzten Nachweis |
| `IDEMPOTENCY` | PASS | Lauf 3 wiederholte das Fenster von Lauf 2: dieselben 97 Filings, 0 Aktualisierungen; Test: zwei Läufe, byte-gleiches Dokument, keine doppelten Perioden oder Akzessionen |
| `RETRY_QUEUE` | PASS | Test `TeilfehlerUndRetryTests`: Teilfehler → `PARTIAL_SUCCESS` → nächster Lauf leert die Schlange; Deckel `MAX_ATTEMPTS = 5` gegen Endlosschleifen; reale Läufe `RETRY_QUEUE 0` |
| `DOWNSTREAM_INVALIDATION_MANIFEST` | PASS | `updated-issuers.json` je Lauf mit `UPDATED_ISSUERS` und `INVALIDATE`-Zielen; Downstream rechnet nur die genannten Emittenten neu |

Was der Nachweis nicht zeigt: einen Lauf, der Erkennung, Update UND
Downstream in einem Durchgang abschließt, weil zwischen Lauf 2 und
Lauf 4 kein neues Filing eines Universumsmitglieds im Index stand. Die
Teile sind je einzeln real belegt; der nächste Handelstag liefert den
Durchgang in einem Stück. Der Cron wird erst aktiv, wenn der Workflow
auf dem Standardzweig liegt; bis dahin löst ein Push auf
`sec-fundamentals-daily.yml`, `daily.py` oder `cli.py` einen Lauf aus.

## 8 — Produktionsbetrieb auf main

Integriert mit PR #93 (Merge-Commit `4ed2003d`, 2026-09-14 10:51 UTC).
Der erste Lauf auf `main` war ein manueller `workflow_dispatch`
(Lauf 34835251753, 10:51–10:58 UTC, Ergebnis-Commit `87f62e92`):

| Schritt | Ergebnis |
|---|---|
| Actions-Cache | leer (Caches anderer Zweige sind auf `main` nicht sichtbar) |
| Wiederherstellung aus R2 | 5.480 von 5.480 Objekten, 0 lokal vorhanden, 0 sha256-Abweichungen, 4,5 min |
| Daily State | aus `_daily-state.json` in R2 (`STATE_BOOTSTRAPPED 0`, `LAST_SEC_CHECK 2026-09-14`) |
| Erkennung | 2 SEC-Anfragen, Tagesindex 2026-09-14 noch nicht veröffentlicht, 0 Änderungen |
| Emittenten | 5.479 geprüft, 0 geändert, 0 aktualisiert, `UNCHANGED_ISSUERS_REPROCESSED 0` |
| R2-Push | 0 geschrieben, 5.480 unverändert |
| Downstream | 0 Invalidierungen, Manifest geschrieben |
| Laufzeit | 2,6 s Incremental (plus 4,5 min einmalige Wiederherstellung) |
| Commit | State, Health Report, Manifest auf `main` |

Damit ist auch der Verlust des Zwischenspeichers real geprobt: der
Faktenspeicher kommt aus R2, nicht von der SEC. Kein Full Backfill im
Normalbetrieb.

| Produktionsprüfung | Stand |
|---|---|
| Workflow auf `main` | `.github/workflows/sec-fundamentals-daily.yml`, Status `active` |
| Cron | `15 6 * * *` UTC, wird von GitHub ab dem Merge ausgewertet; erste planmäßige Auslösung 2026-09-15 06:15 UTC |
| Manueller Dispatch | verfügbar (Inputs `since`, `ciks`, `dry_run`); mit Lauf 34835251753 belegt |
| Secrets | `VU_HISTORY_S3_ENDPOINT/BUCKET/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY` als Repository-Secrets; Prüfschritt grün |
| R2 erreichbar | Restore 5.480/5.480 und Push-Index gelesen |
| CI auf dem Merge-Commit | Quant CI, SEC Fundamentals CI, Discover CI, Company Master, Universum: grün |
| Architektur | Price-R2-Store, Eligibility-Regeln und Frontend-Logik unverändert; der Lauf schreibt nur `quant/data/fundamentals`, `quant/data/universe`, `quant/data/sec` |

Der Push-Trigger für `claude/**`-Zweige bleibt als Entwicklungsweg
bestehen: ein Push auf den Lifecycle löst dort weiterhin einen echten
Lauf aus, ohne den Betrieb auf `main` zu berühren.

**SEC_DAILY_PRODUCTION_READY = PASS**
