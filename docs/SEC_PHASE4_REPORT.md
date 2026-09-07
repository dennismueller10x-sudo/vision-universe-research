# Phase 4 Report — SEC Financial Data Core V1

What was built, what works, what does not, and what it cost.

## 1. Der erste Audit war falsch — Korrektur

Der erste Durchgang berichtete: „Phase 1–3 existiert in diesem Repository nicht."
**Das war falsch.** Nachweis im Git-Verlauf:

- `git merge-base HEAD origin/main` → `0c4fb06` (7. Sep. 2026, 10:11 UTC)
- PR **#43** mit Phase 1–3 wurde 10:59 UTC nach `main` gemergt — **48 Minuten nach
  dem Abzweig**, während die SEC-Arbeit lief
- `git merge-base --is-ancestor 0e32110 0c4fb06` schlägt fehl: die Phase-3-Commits
  waren vom Branchpoint aus nicht erreichbar
- PR **#45** (`VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md`) folgte 17:25 UTC, neun
  Minuten nach dem SEC-Commit `785a9c2`

Der Container arbeitet auf einem beim Sitzungsstart erzeugten Klon. Ohne erneutes
`git fetch` bleibt dieser Stand eingefroren, und `git log` zeigt genau den
eingefrorenen Stand — überzeugend und veraltet. Der Audit war für den Baum, auf dem
er lief, korrekt und für das Projekt falsch.

**Konsequenz für die Arbeitsweise: ein Repository-Audit beginnt mit `git fetch
origin`, nicht mit `git log`.** Ohne Fetch beschreibt ein Audit den Container.

## 2. Was die Integration geändert hat

Die SEC-Arbeit wurde nicht verworfen und nicht neu geschrieben, sondern unter die
bestehende Architektur gehängt. Vier Duplikate sind dabei entfallen:

| Entfernt | Weil auf `main` bereits vorhanden |
| --- | --- |
| `scripts/quant/sec/factors.py` (Faktor-Scoring) | `quant/engines/factors.js` + `quant-score.js` |
| `scripts/quant/sec/backtest_bridge.py` | `quant/engines/backtest.js` (PIT-Backtest-Engine) |
| `MOCK_RESTATEMENT` / `MOCK_DELISTED` / `MOCK_FUTURE_DATA_LEAK` in `gates.py` | `quant/engines/gate-tests.js` (Gate A/B/C) |
| `SECProvider.CAPABILITIES` | `quant/config/provider-profiles.json` + `engines/capabilities.js` |

Zusätzlich reduziert: `derived.py` hat Margen, ROE, ROIC, Growth und CAGR verloren —
das sind Faktor-Eingaben, und die Quant Engine besitzt sie. Geblieben ist die
Rekonstruktion kanonischer Kennzahlen, die kein Emittent als Zeile meldet
(Free Cash Flow, Gross Profit, Net Debt, Invested Capital, Accruals).

Neu hinzugekommen sind genau zwei Dinge, beide an der Grenze:

- `scripts/quant/sec/canonical.py` — SEC-Fakten → `FundamentalFact` / `Filing` /
  `Security` nach `quant/engines/schema.js`, mit `revisionId` und
  `restatementStatus` statt einer eigenen Timeline-Form.
- `providers/sec/adapter.js` — implementiert `FundamentalDataProvider` nach dem
  Muster von `providers/twelve-data/adapter.js`.

Der Data Inspector nutzt jetzt `quant/ui/shell.js` und `quant/ui/quant.css` statt
eines eigenen Designsystems.

**Was bewusst erhalten blieb**, weil es der wertvollste Teil der SEC-Arbeit ist:
die vollständige PIT-Semantik beim Ingest (Tagesgenauigkeit zwischen Periodenende
und Veröffentlichung, Restatement-Zeitachse, YTD-Rekonstruktion innerhalb des
PIT-Fensters, Provenance, Trennung gemeldet/abgeleitet), sämtliche Regressionstests
dazu, und die ehrlichen FAIL-Zustände bei Delisting und Survivorship.

## 3. Der Live-Validierungs-Blocker (unverändert)

`data.sec.gov` und `www.sec.gov` sind durch die Egress-Policy dieser Umgebung
blockiert (HTTP 403 auf CONNECT). Das ist eine Organisationsrichtlinie dieser
Sandbox, keine SEC-Sperre; GitHub-Actions-Runner sind nicht betroffen
(`scripts/hedgefonds/fetch_edgar_data.py` holt dort seit Längerem 13F-Daten).

Es wurde **keine einzige Anfrage an die SEC gestellt**. Alles, was davon abhängt —
Coverage-Matrix, gemessene Gate-Ergebnisse je Unternehmen, historische
Reichweite — trägt `status: "not_generated"` bzw. im Provider-Profil die Belegstufe
`RUNTIME_VERIFICATION_REQUIRED` oder `UNKNOWN`. Es wurde nichts erfunden, um die
Lücke zu füllen.

## 4. Antworten auf die Abschlussfragen

**1. Is SECProvider implemented production-near?**
Yes, with one caveat. `scripts/quant/sec/provider.py` is the single SEC access
point: ticker→CIK, submissions (with older filing pages merged in — without that,
pre-2015 filing history is silently invisible), company facts, company concept,
filing metadata with acceptance timestamps, raw fact iteration, and bulk
`companyfacts.zip` import. Fair access lives in `http_client.py`: declaring
User-Agent (refuses to construct without a contact address), 5 req/s token bucket
(SEC allows ~10), retry with exponential backoff + jitter on retryable statuses
only, bounded retries, request de-duplication, gzipped disk cache with TTL,
structured logging. Caveat: it has never executed against the live SEC (§2).

**2. Which five companies were actually tested?**
None against live SEC data. The universe is configured
(`quant/config/sec-universe.json`: NVDA, AAPL, MSFT, JPM, XOM, with CIK hints the
pipeline verifies against the SEC ticker map and aborts on mismatch). Validation
instead ran against synthetic issuers built to reproduce the structural cases
those five represent: calendar-year, June year-end, 52/53-week September
year-end, and a SIC 6021 bank. Every fixture is labelled synthetic and no fixture
claims to be a real company's real financials.

**3. Which fundamentals work reliably?**
On the tested structures: revenue, cost of revenue, operating income, pretax
income, tax expense, net income, EPS basic/diluted, operating cash flow, capex,
cash, total assets, total liabilities, stockholders' equity, long/short-term
debt, shares outstanding, weighted average shares, R&D, SG&A, interest expense,
dividends, stock-based compensation — 27 canonical metrics, annual and quarterly,
including reconstruction of quarters a company never reports standalone.

**4. Which work with limitations?**
`gross_profit` (usually reconstructed from revenue − cost of revenue, since many
filers omit the line); `shares_outstanding` from `dei` is a **cover-date**
instant, not a balance-sheet-date one, and is flagged `COVER_DATE_INSTANT`;
`total_debt` is usually reconstructed from components; ROIC needs six inputs and
is refused whenever the effective tax rate falls outside [0,1]; everything
financial-sector-specific per § 15 of the brief.

**5. How far back does usable history reach?**
**Not measured — see `docs/SEC_COVERAGE_REPORT.md`.** The measurement machinery
is built and tested; the network is not available here. Do not quote a start year
until the workflow has run.

**6. Does point-in-time work?**
Yes, and it is the most heavily tested part of the system. Semantics and worked
examples in `docs/SEC_PIT_METHODOLOGY.md`. Enforced at four independent layers:
resolution requires an `as_of`; the quality engine flags impossible filings; two
gates re-check stored data and a constructed leak scenario; and the test suite
includes a day-by-day loop asserting invisibility across every day between a
period's end and its filing date.

**7. How are restatements handled?**
Each `(metric, fiscal_year, fiscal_period)` cell is a timeline of observations,
never overwritten. Default policy `as_of_latest` returns the most recent value
*published by* `as_of` — so a 2020 restatement is invisible to a 2019 backtest and
applies from its own publication date, flagged `RESTATED`. Policy `original`
returns the as-first-reported value (still PIT-filtered). Policy `latest_known`
ignores `as_of` and is reachable only from reporting paths, never the backtester.
Same-instant conflicts: amendment wins, flagged `CONFLICTING_FACTS`, quality
downgraded to MEDIUM, nothing averaged.

**8. Which gates pass?**
Die Qualifikations-Gates sind jetzt die des Systems (`quant/engines/gate-tests.js`),
gefahren gegen den SEC-Adapter — nicht mehr SEC-eigene Nachbauten. Gegen eine
synthetische Fixture: **Gate A (Restatement) PASSED**, **Gate C (Verfügbarkeit)
PASSED**. Dazu die Ingest-Prüfungen `PIT_NO_FUTURE_DATA_LEAK`,
`PROVENANCE_COMPLETE`, `PERIOD_INTEGRITY`, `UNIT_INTEGRITY`, `NO_INVENTED_VALUES`,
`DERIVED_SEPARATION` — alle PASS. `MARKET_DATA_AVAILABLE` ist `NOT_APPLICABLE`.

Wichtige Einschränkung: „bestanden gegen eine synthetische Fixture" ist nicht
„bestanden". Das Provider-Profil führt SEC deshalb durchgängig auf
`RUNTIME_VERIFICATION_REQUIRED`, und ein eigener Test (Q15) stellt sicher, dass SEC
dadurch **nicht** als qualifizierte Evidenzquelle gilt.

**9. Which gates fail?**
**Gate B (Delisting) — FAILED**, und zwar erzeugt vom echten Gate: der Adapter
liefert für ein Universum zum Stichtag ausdrücklich `unavailable`, weil die SEC
keinen Security Master und keinen Delisting-Ereignisstrom führt. Ebenso
`SURVIVORSHIP_FREE_UNIVERSE` — **FAIL**. Kein Gate wurde künstlich angehoben; der
Gate-Runner meldet einen nicht ausführbaren Fall als `SKIPPED`, nie als `PASSED`.

**10. What is still missing for professional backtests?**
Prices (OHLCV), a point-in-time universe / index constituent history, corporate
action and split history, analyst estimates, and a delisting event feed.
Fundamentals are timed correctly; membership is not.

**11. Can SEC replace EODHD / FMP for US fundamentals?**
**PARTIALLY.** For the fundamental *values* themselves, SEC is strictly better:
it is the primary source those vendors resell, it carries the filing dates a
vendor snapshot throws away, and it preserves restatement history — none of which
`dashboard/data/fundamental_metrics.json` has today. What SEC cannot replace is
the vendor's convenience layer: a security master, delisting history, corporate
actions, per-share normalisation across splits, and analyst data. For a
point-in-time fundamental backtest of currently listed US issuers, SEC is
sufficient and better. For a survivorship-free universe, it is not, and no amount
of engineering on the SEC side changes that.

**12. What is still needed from an external market-data provider?**
Daily/intraday OHLCV, split- and dividend-adjusted price series, corporate
actions, index membership history, and market capitalisation. Momentum and Value
factors are explicitly *not* computed from SEC data and are declared
`NOT_AVAILABLE_FROM_PROVIDER` rather than approximated.

**13. Rollout from 5 to 500 companies?**
No code change. Extend `quant/config/sec-universe.json` (or feed CIKs from the
SEC ticker map directly). ~2 requests per company for the incremental check, ~3
for a full ingest. At 5 req/s that is roughly 5 minutes of wall time for a full
pass and far less for an incremental one. Checkpointing already makes the run
resumable. Switch `JsonFactStore` to `compress=True` (already the default in the
pipeline) and keep only the compact inspector views committed.

**14. From 500 to 5,000?**
Two changes, both anticipated by the interfaces: (a) use
`SECProvider.iter_bulk_company_facts()` for the initial import — one
`companyfacts.zip` instead of 5,000 individual fetches, which is what SEC fair
access actually asks for — then keep the weekly incremental path per company;
(b) replace `JsonFactStore` with a DuckDB or Parquet implementation of the same
`FactStore` interface. Normalization, PIT resolution, derived metrics, factors and
the backtest bridge do not change, because none of them knows how storage works.

**15. Storage and compute?**
Measured on the synthetic end-to-end run: normalized factbook ≈ 55 KB gzipped per
company-decade; committed inspector view ≈ 380 KB per company. Extrapolated: raw
SEC payloads ≈ 10–40 MB per company uncompressed (gitignored, cached), so ~50–200
GB for 5,000 companies at full history — which is exactly why the bulk path and a
columnar store are the 5,000-company answer. Normalization is CPU-light and
embarrassingly parallel per company; the 174-test suite runs in ~6 seconds.
Committed artifacts stay under the CI budget of 2 MB per file and 10 MB total.

**16. Which real data quality problems were found?**
Four in the pipeline's own design, each caught by a test and fixed, each with a
regression test added:
(a) the fair-access token bucket could spin forever on a floating-point refill
landing a hair below one token — fixed with an epsilon;
(b) sector rules were applied only to a formula's *inputs*, so debt-to-equity was
being computed for a bank from its available components — fixed by applying the
rule to the formula's *output* metric too;
(c) a fact whose `filed` value is not a date has no point-in-time anchor and was
passing through — the provider now validates it and drops it for the quality
engine to report;
(d) **the most consequential one**: the retrieval timestamp was wall-clock, so it
entered the raw-payload content hash and the per-observation provenance. An
unchanged SEC payload therefore looked new on every run — the immutable raw
archive would have grown a fresh snapshot weekly forever, and no factbook diff
would ever have been meaningful. Retrieval time is now taken from when the
payload was *first* seen in the archive, so re-normalizing unchanged SEC data is
byte-identical. Found only because an idempotency test failed intermittently
(1 run in ~6); it would have been invisible in a single green run.
Structural problems the design anticipates and the engine flags — the `fy`/`fp`
filing-vs-fact trap, year-to-date double counting, cover-date share counts,
concept disagreement within one filing — are covered by tests but have not yet
been *observed* on live SEC data, because that data has not been fetched.

**17. What changed in the existing repository?**
Nach der Integration vier Dateien, jede mit Grund:

| Datei | Änderung |
| --- | --- |
| `.gitignore` | SEC-Cache, Laufzeit-State, Raw- und Factbook-Verzeichnisse ergänzt (additiv; der bestehende Secrets-Block bleibt) |
| `quant/ARCHITECTURE.md` | ein Abschnitt zum SEC-Core ergänzt; der bestehende Text unverändert |
| `quant/config/provider-profiles.json` | Provider `sec-edgar` ergänzt |
| `quant/tests/provider-qualification.test.mjs` | zwei Inventar-Counts 6→7 und ein neuer Test Q15 |

Nicht angefasst: `scripts/dashboard/`, `dashboard/data/`, `scripts/hedgefonds/`,
`quant/engines/**`, `quant/ui/**`, `providers/twelve-data/`, alle bestehenden
Workflows und Seiten. Kein bestehender Test wurde gelöscht oder abgeschwächt.

**18. How many tests run?**
429 insgesamt: 160 SEC-Ingest-Tests (Python), 261 Quant-Tests (JS, davon 232
Phase 1–3 unverändert, 28 neue SEC-Adapter-Tests, 1 neuer
Provider-Qualifikationstest) und 8 Academy-Tests.

**19. Are all pre-existing tests still green?**
Ja. Die 232 Phase-1–3-Tests laufen unverändert grün — nachgerechnet vor dem Merge
(232/232 auf `origin/main`) und danach. Academy 8/8, Hedgefonds-Logik grün,
36 HTML-Seiten parsen, 57 JSON-Dateien valide, alles unter `scripts/` kompiliert.

**20. Exact recommended next step?**
Den Workflow **„Update SEC fundamentals"** per `workflow_dispatch` auf diesem
Branch starten. Das ist der erste Live-SEC-Kontakt und das Einzige, was die
Coverage-Matrix, die gemessenen Gate-Ergebnisse je Unternehmen und die Frage nach
der historischen Reichweite beantworten kann. Der Lauf erzeugt in dieser
Reihenfolge: Ingest → `canonical` → `coverage` → Ingest-Prüfungen →
`run-sec-gates.mjs` (Gate A/B/C gegen echte Daten) → `export`.

Danach `quant/data/sec/coverage_matrix.json` und `pit_gates.json` lesen und das
Startjahr des Backtesters aus gemessenen Daten festlegen. Erst wenn diese Zahlen
existieren, lohnt der nächste Schritt (Tiingo-Adapter für Marktdaten, damit Value
und Momentum überhaupt entstehen können).

## 5. Deliverables

| Pfad | Was |
| --- | --- |
| `scripts/quant/sec/` | 15 Module: Fair-Access-HTTP, Provider, Modell, Fiskalkalender, Registry, Normalisierung, Perioden/TTM, Restatements, Quality, kanonische Rekonstruktion, **canonical.py (die Grenze)**, Store, Pipeline, Coverage, Ingest-Prüfungen |
| `scripts/quant/cli.py` | `ingest · update · retry · canonical · coverage · gates · export · inspect · test` |
| `scripts/quant/run-sec-gates.mjs` | fährt Gate A/B/C aus `engines/gate-tests.js` gegen den Adapter |
| `scripts/quant/tests/` | 160 Offline-Tests + als synthetisch gekennzeichnete Fixtures |
| `providers/sec/adapter.js` | `FundamentalDataProvider`-Implementierung |
| `quant/tests/sec-adapter.test.mjs` | 28 Integrationstests an der Architekturgrenze |
| `quant/tests/fixtures/sec-canonical-synthetic.json` | synthetische, aus der Pipeline erzeugte Fixture |
| `quant/config/sec-metric-registry.json`, `sec-universe.json` | Metric Registry, Validierungsuniversum |
| `quant/data-inspector/` | internes Validierungswerkzeug auf der gemeinsamen Quant-Shell |
| `docs/SEC_*.md` | Architektur + Audit, Normalisierung, PIT-Methodik, Coverage-Report, dieser Report |
| `.github/workflows/sec-fundamentals-ci.yml` | beide Testsuiten, Interface-Vertrag, Guard gegen Parallelarchitektur, Datenhygiene, Secret-Guard |
| `.github/workflows/update-sec-fundamentals.yml` | Live-SEC-Ingest mit Scope-Guard, wöchentlich + manuell |

## 5.1 Gefundene und behobene Fehler

Sechs, jeder mit Regressionstest:

1. **Token-Bucket-Endlosschleife** — ein Refill konnte durch Fließkomma knapp unter
   einem Token landen; die Schleife wartete in immer kleineren Schritten ewig.
2. **Sektorregeln nur auf Eingaben angewandt** — Debt/Equity wurde für eine Bank aus
   vorhandenen Komponenten berechnet. Die Regel gilt jetzt auch für die
   Ausgabe-Kennzahl.
3. **Fakten ohne gültiges Einreichungsdatum** — ohne PIT-Anker durchgelassen; der
   Provider validiert das Feld jetzt.
4. **Wall-Clock-Zeitstempel im Content-Hash** — unveränderte SEC-Daten sahen bei
   jedem Lauf neu aus. Das Raw-Archiv wäre wöchentlich gewachsen und kein
   Factbook-Diff wäre aussagekräftig gewesen. Gefunden nur, weil ein
   Idempotenz-Test in etwa jedem sechsten Lauf fehlschlug.
5. **Fiskalkalender ging beim Rehydrieren verloren** — dadurch war die Filing-Liste
   im kanonischen Export leer.
6. **Checkpoint ohne Store-Abgleich** — ein „fertig" im Checkpoint übersprang ein
   Unternehmen, dessen Dokument gar nicht mehr existierte, und hinterließ eine
   stille Lücke im Store.

## 6. Was diese Phase bewusst nicht gebaut hat

No realtime, no intraday, no Elliott waves, no analyst estimates, no news, no
portfolio AI, no mobile app, no new frontend design, no new backtester, no data
warehouse, no European fundamentals. The existing backtest engine was imported,
not replaced, and a regression test asserts the bridge reproduces its output
exactly when the fundamental filter is disabled.
