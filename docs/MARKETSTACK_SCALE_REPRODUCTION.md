# Marketstack scale evidence replay

Run these commands from the repository root with Node 22. They read retained evidence and existing protected datasets, and write audit reports or private plans. They make no provider requests, require no local Marketstack key, and do not change canonical prices, universe membership, fundamentals or provider routing. The accepted original 58 canonical records remain separate from the expanded candidate censuses, metadata-only admissions and quarantined histories; an audit match or quote observation does not promote a candidate into production.

## Evidence and recovery

New paid collection belongs to `.github/workflows/marketstack-scale-probe.yml`, using the existing `${{ secrets.MARKETSTACK_API_KEY }}`. Its recovery step runs `scripts/market/recover-marketstack-scale.mjs` before collection. No Cloudflare secret or frontend provider key is needed.

Keep the private `checkpoint.json` together with all four `responses/0/` through `responses/3/` partitions. The workflow uploads `marketstack-scale-core-<run-id>-<attempt>` and `marketstack-scale-part0-<run-id>-<attempt>` through `part3`, with seven-day retention. Preserve an authorized private copy for later replay. Recovery uses an existing authenticated GitHub session and read-only GitHub operations; it does not contact Marketstack:

```bash
node scripts/market/recover-marketstack-scale.mjs \
  --repo=OWNER/REPOSITORY \
  --branch=feat/marketstack-scale-coverage-20261001 \
  --run-id=CURRENT_WORKFLOW_RUN_ID \
  --run-attempt=1 \
  --out=/PRIVATE/RECOVERED/EVIDENCE
```

Supply the actual repository/run and a private working directory. Restore the current run's core and partitions into that directory before using it as the current-run exclusion. Recovery validates response references and fails closed when accounting/source artifacts are missing. Accounting merges maxima for the same run rather than adding overlapping snapshots; `estimatedCreditsConsumed` is conservative accounting, not independently verified provider billing.

For offline replay, materialize the validated private checkpoint and response partitions. Supply the five retained original PR #330 single-run probes to prove legacy seeded response origins by exact content; this makes no requests and never overwrites the source evidence:

```bash
VU_EVIDENCE_DIR=/PRIVATE/RECOVERED/EVIDENCE
node scripts/market/materialize-marketstack-evidence.mjs \
  --working-directory="$VU_EVIDENCE_DIR" \
  --original-probe=/PRIVATE/ORIGINAL-PROBE-1/probe.json \
  --original-probe=/PRIVATE/ORIGINAL-PROBE-2/probe.json \
  --original-probe=/PRIVATE/ORIGINAL-PROBE-3/probe.json \
  --original-probe=/PRIVATE/ORIGINAL-PROBE-4/probe.json \
  --original-probe=/PRIVATE/ORIGINAL-PROBE-5/probe.json \
  --out="$VU_EVIDENCE_DIR/probe-provenance.json"
```

Use this output wherever the replay commands below refer to `probe.json`. The final snapshot is **36912587006**: 3,275 cached responses, 335 exact original-content origin proofs, 2,934 explicitly interval-inferred origins and six explicit fresh origins. Unknown or ambiguous origins: zero. Original response bodies, timestamps and ledgers stay unchanged; a snapshot run ID never becomes an original retrieval ID. Snapshot **36908664526** added the three-credit COST special-dividend control; **36912587006** added three batches/44 estimated symbol credits for refined US common-share diagnostics. All prior requests were reused.

US replay also needs the original private full-US `us-latest.json` from accepted run **36858301835** and the retained October 1 public-source snapshots below. These auxiliary snapshots must be retained separately from the scale response partitions; their original workspace locations are listed only to identify the evidence used.

| Replay filename under the private directory | Original snapshot |
| --- | --- |
| `us-latest.json` | `/workspace/scratch/marketstack-probe-5/us-latest.json` |
| `current-sec-map.json` | `/workspace/scratch/marketstack-us-current-sec-map.json` |
| `current-sec-submissions.json` | `/workspace/scratch/marketstack-us-current-sec-submissions.json` |
| `form25-evidence.json` | `/workspace/scratch/marketstack-us-form25-evidence.json`, plus its referenced XML documents |
| `nasdaq-symbol-directories.json` | `/workspace/scratch/marketstack-us-nasdaq-symbol-directories.json` |

SEC ticker mapping originates at `https://www.sec.gov/files/company_tickers_exchange.json`; submissions and Form 25 source URLs/accessions remain in their evidence manifests. NasdaqTrader sources are `https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt` and `https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt`, retaining headers, creation footers and source descriptors. A newly downloaded current directory does not reproduce the historical snapshot.

Absolute `/workspace/scratch/...` references in collection evidence describe the engineering workspace, not production dependencies. Copy the evidence to any private directory and pass its paths below. Rebase Form 25 `localDocument` references when necessary; retain the original manifest and preserve source URLs, accession IDs and document SHA-256 values. The SEC summarizer checks the actual XML bytes against those hashes. Public reports retain source hashes/URLs and allowlisted identity/date/quality metadata; raw provider prices and holdings remain private. Finalizers use stored input times (or an explicit `--generated-at`) and serialize deterministically. Preserve original source bytes for source SHA verification; canonical content fingerprints separately tolerate JSON object-key order.

## US audit replay

Keep the committed `marketstack_tiingo_us_diff.json` as the protected 7,803-record comparison baseline. The following bootstrap generates the complete investigation row sets, then independent SEC/listing evidence, then final history/action and identity classifications. It writes no canonical data. `VU_EVIDENCE_DIR` is the private directory prepared above, containing the named snapshots.

```bash
node scripts/market/classify-marketstack-us-gaps.mjs \
  --probes="$VU_EVIDENCE_DIR/probe.json" \
  --latest="$VU_EVIDENCE_DIR/us-latest.json" \
  --sec-map="$VU_EVIDENCE_DIR/current-sec-map.json"

node scripts/market/summarize-marketstack-us-sec-evidence.mjs \
  --current="$VU_EVIDENCE_DIR/current-sec-map.json" \
  --submissions="$VU_EVIDENCE_DIR/current-sec-submissions.json" \
  --form25="$VU_EVIDENCE_DIR/form25-evidence.json"

node scripts/market/summarize-marketstack-us-listing-evidence.mjs \
  --directory="$VU_EVIDENCE_DIR/nasdaq-symbol-directories.json"

node scripts/market/classify-marketstack-us-gaps.mjs \
  --probes="$VU_EVIDENCE_DIR/probe.json" \
  --latest="$VU_EVIDENCE_DIR/us-latest.json" \
  --sec-map="$VU_EVIDENCE_DIR/current-sec-map.json" \
  --sec-evidence=reports/marketstack/us_sec_current_symbol_evidence.json \
  --listing-evidence=reports/marketstack/us_current_listing_evidence.json

node scripts/market/summarize-marketstack-us-resolved-history.mjs \
  --probes="$VU_EVIDENCE_DIR/probe.json" --today=2026-10-01

node scripts/market/classify-marketstack-us-gaps.mjs \
  --probes="$VU_EVIDENCE_DIR/probe.json" \
  --latest="$VU_EVIDENCE_DIR/us-latest.json" \
  --sec-map="$VU_EVIDENCE_DIR/current-sec-map.json" \
  --sec-evidence=reports/marketstack/us_sec_current_symbol_evidence.json \
  --listing-evidence=reports/marketstack/us_current_listing_evidence.json \
  --resolved-history=reports/marketstack/us_marketstack_resolved_history_quality.json

node scripts/market/plan-marketstack-us-current-common.mjs \
  --probes="$VU_EVIDENCE_DIR/probe.json" \
  --request-plan="$VU_EVIDENCE_DIR/us-current-common-remaining-plan.json"
```

The final cache inventory must contain 478/478 exact-current-MIC observations and zero remaining requests. It distinguishes required-listing failures from quotes returned at another provider MIC. The 1,065 non-exact baseline records and 460 original quality flags remain exhaustive; preferred alias discoveries do not increase the protected consumer denominator or coverage. Form 25 class/venue evidence, ETF/ETN role contradictions and ticker continuity concerns remain separate from automatic production changes. See the generated US reports and `MARKETSTACK_SCALE_ENGINEERING_REPORT.md` for measured results.

The original directory/latest benchmark can also be replayed into private comparison files without replacing the protected report:

```bash
node scripts/market/summarize-marketstack-us-directory.mjs \
  --probes="$VU_EVIDENCE_DIR/probe.json" \
  --out="$VU_EVIDENCE_DIR/us-directory-replay.json"
node scripts/market/summarize-marketstack-us-latest.mjs \
  --directory="$VU_EVIDENCE_DIR/us-directory-replay.json" \
  --latest="$VU_EVIDENCE_DIR/us-latest.json" \
  --out="$VU_EVIDENCE_DIR/us-baseline-replay.json"
```

These comparisons require the retained accepted directory/latest evidence and baseline hash. Public catalog matching is a separate coverage indicator; it must not replace API observations or empirical price validation. No replay command invokes the paid `benchmark-marketstack-us-latest.mjs` runner.

Run the ETF audit first when rebuilding `etf-joined-references.json`; the Europe reference builder consumes that output.

## Germany and Europe

The German manifest `quant/config/marketstack-germany-audit.json` records exact T7 source URLs/hashes, current index snapshot, supported/unsupported venue inventory and private-path conventions. Copy the retained T7 CSVs to its reference paths, retain the immutable accepted layer from commit `944b97c80d17c941c50d3e272f2070dfaed82490`, and point a private manifest copy's `workingDirectories` at the recovered evidence. Replayed source bytes must match the manifest hashes; a fresh rolling reference is a new census, not the original snapshot.

```bash
node scripts/market/build-marketstack-germany-reports.mjs \
  --config="$VU_EVIDENCE_DIR/germany-replay-config.json" \
  --out="$VU_EVIDENCE_DIR/germany-reports" \
  --foundation-out="$VU_EVIDENCE_DIR/germany-foundation.json"

node scripts/market/build-europe-reference.mjs \
  --official-directory="$VU_EVIDENCE_DIR/europe-reference" \
  --etf-references="$VU_EVIDENCE_DIR/etf-joined-references.json" \
  --xetra-classified=reports/marketstack/marketstack_xetra_classified_candidates.json \
  --out="$VU_EVIDENCE_DIR/europe-combined-reference.json"

node scripts/market/analyze-marketstack-europe.mjs \
  --working-directory="$VU_EVIDENCE_DIR" \
  --references="$VU_EVIDENCE_DIR/europe-combined-reference.json" \
  --operator-references=reports/marketstack/europe_official_operator_references.json \
  --operator-eod-label=scale-austria-official-prime-week \
  --canonical=quant/data/global-market/listings.json \
  --xetra=reports/marketstack/marketstack_xetra_classified_candidates.json \
  --german-census=reports/marketstack/germany_marketstack_universe.json \
  --out="$VU_EVIDENCE_DIR/europe-reports"
```

Retain the filtered Euronext POST responses and their source manifests, SIX references/manifests, exchange-specific Nordic references, and T7 references under the official-directory conventions consumed by `build-europe-reference.mjs`. Their exact source descriptors remain in the public reference reports. GET-only Euronext filtering, broad catalog categories, operator-mnemonic matches and venue-level currency defaults cannot replace these references. London/Vienna/BME operator candidates are a separate tier and never become canonical admissions through this command. GBX quote units stay distinct from GBP currency.

## ETFs, corporate actions and Global Select

```bash
node scripts/market/audit-marketstack-etfs.mjs \
  --probe="$VU_EVIDENCE_DIR/probe.json" \
  --reference="$VU_EVIDENCE_DIR/normalized-t7-references.json" \
  --six-reference="$VU_EVIDENCE_DIR/six-etfs-reference.json" \
  --six-source="$VU_EVIDENCE_DIR/six-etfs-reference-source.json" \
  --us-reference="$VU_EVIDENCE_DIR/nasdaq-symbol-directories.json" \
  --euronext-page="$VU_EVIDENCE_DIR/euronext-etf-filtered-page.json" \
  --out="$VU_EVIDENCE_DIR/etf-audit.json" \
  --matrix-out="$VU_EVIDENCE_DIR/etf-metadata-matrix.json" \
  --joined-reference-out="$VU_EVIDENCE_DIR/etf-joined-references.json"

node scripts/market/audit-marketstack-scale-adjustments.mjs \
  --probe="$VU_EVIDENCE_DIR/probe.json" \
  --listings=quant/data/global-market/listings.json \
  --baseline=quant/data/market/security-master/eligibility.json \
  --events="$VU_EVIDENCE_DIR/verified-corporate-action-events.json" \
  --dividend-controls="$VU_EVIDENCE_DIR/dividend-controls.json" \
  --us-latest="$VU_EVIDENCE_DIR/us-latest.json" \
  --out="$VU_EVIDENCE_DIR/adjustment-reports"
```

Repeat `--probe` for the five accepted private snapshots if the aggregate does not retain them, and repeat `--euronext-page` for every retained filtered page. Each Euronext page requires its sibling `-source.json` manifest. The action-event and dividend-control manifests contain official source dates and citations; omitting them loses independent event validation. ETF histories/holdings are private evidence, and usable partial fund-series holdings are never treated as complete current ETF portfolios.

## Canonical publication and rollup

The import and publisher are explicit mutations of a branch/preview foundation, unlike the read-only audits above. Use a private base/candidate/output while reviewing changes; never replay directly over protected production datasets. `scripts/market/import-marketstack-scale-history.mjs` reads complete retained response windows and exact identity/unit references without new calls. `scripts/universe/publish-global-market-foundation.mjs` preserves every base record and admits only guarded metadata/history under the existing identity model. Review identity conflicts and new coverage before selecting public preview output paths. The accepted original 58 remain immutable; metadata-only candidates receive no price/fundamental/technical coverage.

The final read-only rollup uses the committed per-objective artifacts, public preview foundation and complete private ledger:

```bash
node scripts/market/summarize-marketstack-scale.mjs \
  --accounting="$VU_EVIDENCE_DIR/checkpoint.json" \
  --tests=reports/marketstack/marketstack_scale_tests.json \
  --provenance="$VU_EVIDENCE_DIR/probe-provenance.json" \
  --out="$VU_EVIDENCE_DIR/marketstack-scale-summary.json"
```

This regenerates counts/source hashes and request estimates without reading a secret or contacting Marketstack. Actual account balance and other account usage remain unknown; venue-qualified HTTP estimates and symbol credits are separate. The provider decision remains deferred.


## Final company, quality and compatibility artifacts

The company enrichment CLI, exact issuer/type source prerequisites, source cache filenames and replay commands are documented in [MARKETSTACK_GERMANY_COMPANY_FINALIZATION.md](MARKETSTACK_GERMANY_COMPANY_FINALIZATION.md). The European read-only census uses the same frozen issuer/type references, plus official operator evidence; it does not republish the historical canonical-foundation creation artifact. Both references retain source URLs, exact ISIN/LEI evidence, hashes, source retrieval times and explicit reporting-operator/issuer-conflict quarantines.

US finalization commands and supplemental SEC cover-page/Form 25 proof are described in [MARKETSTACK_SCALE_US_FINALIZATION.md](MARKETSTACK_SCALE_US_FINALIZATION.md). The original 478 current-MIC gap observations and the 44 refined literal common-share diagnostics are separate cache inventories. Current symbol availability does not prove continuity of a historical issuer or globally unsupported status.

Adjustment replay is described in [MARKETSTACK_SCALE_ADJUSTMENTS.md](MARKETSTACK_SCALE_ADJUSTMENTS.md); the committed control manifest includes independent event evidence and hashes. The compatibility matrix distinguishes bounded numerical comparison, provider currency proof, full-history adjustment certification and product admission.

ETF reconciliation and its scoped metadata matrix are described in [MARKETSTACK_SCALE_ETF_AUDIT.md](MARKETSTACK_SCALE_ETF_AUDIT.md). An ISIN is a security/share-class key, not proof of a unique legal fund; UCITS labels are not regulatory authorization. No full current holdings claim is derived from partial SEC fund-series reports.
