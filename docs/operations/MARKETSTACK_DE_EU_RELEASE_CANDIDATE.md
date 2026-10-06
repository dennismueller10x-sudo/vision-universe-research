# DE/EU selected-universe release candidate — 2026-10-06

Starting main: `61a0f5734246aa2b4917a984a5dac194e3e9672e`. Earlier #324/#330/#334/#341 remain unmerged drafts; none is a production baseline. This change ports only required transport and private-cache mechanisms, adds central ISIN/MIC identities without changing `ref_` identities, and registers the private local directory producer. Discover integration is a dependent, isolated PR. No production merge, public market-data release or recurring schedule is authorized here.

The privately frozen selection contains 240 memberships and 192 share classes/listings: DAX 40, MDAX 50, SDAX 70, TecDAX 30, EURO STOXX 50 50. German tables are complete accessible alternative references; their effective dates remain unresolved. The official EURO STOXX component table is preferred over the conflicting alternative table; its effective date also remains unresolved. This is today's selection, not a historical index universe. Alzchem's official September conversion is explicit; predecessor prices are not stitched. BBVA and Santander currently use verified Xetra alternatives, not a claim of primary Spanish listings. Selection, issuer domicile and venue remain distinct.

The release tree contains only an empty `DISABLED` directory. Raw responses, full reference input, provider cache, account evidence, detailed listing matrices and private screenshots remain outside the repository. Public packaging and public-data hygiene reject nonempty local directories or series. The private replay can select 29 old close-only series by exact ISIN/MIC from pinned historical cache commit `944b97c80d17c941c50d3e272f2070dfaed82490`; they are labelled stale, unverified basis, with gaps retained. They are neither current quotes nor indicator/strategy approval. None is imported into US routes.

There are 180 historical provider candidates and 12 unresolved provider identifiers. No current provider identity or current-session approval is claimed. LEI references do not prove linkage to an existing VU company: product `companyId` remains null until exact association is verified. All 192 logos use existing fallbacks; verified logos are zero. Missing company association is a concrete next step for the central reviewed-logo producer, not permission to choose a namesake asset. Quant factors, weights and ranking populations remain unchanged. Unknown adjustment/calendar/volume/fundamental/FX/share basis blocks the relevant technical and strategy functions individually.

## Private build and reproducible replay

Node 22 is required. Obtain the frozen reference and historical cache commit only from the authorized private checkpoint; the repository does not embed a fallback current membership list. On the dependent Discover branch:

```bash
node scripts/vu2/build-release.mjs --output=/workspace/scratch/de-eu-preview-release
node scripts/marketstack/build-de-eu-development.mjs \
  --source=/workspace/scratch/de-eu-private/frozen-reference.json \
  --cache-ref=944b97c80d17c941c50d3e272f2070dfaed82490 \
  --as-of=2026-10-06 --out=/workspace/scratch/de-eu-preview-release
python3 -m http.server 8780 --bind 127.0.0.1 --directory /workspace/scratch/de-eu-preview-release
# Open http://127.0.0.1:8780/discover/#/de-eu in the local/private environment.
node scripts/discover/de-eu-browser-qa.mjs --url http://127.0.0.1:8780 \
  --listing-id lst_XETR_DE0007164600 --engine chromium --out /workspace/scratch/de-eu-browser/chromium
```

Build output must start empty; remove only the prior private build before rebuilding. The same materializer updates only `core/data/de-eu` in this private output. All products read these central files; there are no browser provider requests. Never upload this private build to Pages, Vercel, public artifacts or a publicly reachable host. The existing client-side password screen alone grants no data protection.

## Tests and budget-gated execution

```bash
VU_DE_EU_REFERENCE_SOURCE=/workspace/scratch/de-eu-private/frozen-reference.json \
  node --test core/tests/*.test.mjs scripts/marketstack/tests/*.test.mjs \
  quant/tests/marketstack-*.test.mjs quant/tests/tiingo2-cache.test.mjs
node scripts/market/assert-public-data-hygiene.mjs
node scripts/market/assert-no-secrets.mjs --all
```

Without private reference input, nine real-reference tests explicitly skip; synthetic contract tests still execute. Fake transport tests do not demonstrate account entitlement. Full affected product suites and actual Chromium/WebKit preview checks are required on the final dependent branch. Existing browser accessibility failures must be compared with unchanged starting main rather than fixed incidentally.

No real Marketstack requests were made during cache replay. Current account remainder is unverified; incomplete October reports are insufficient. A fresh verified account remainder, reconciled with all other consumers, is required before paid work. Run ceiling 10,000, retained lower local monthly safety ceiling 5,000, account reserve 500; failures, pages and retries reserve credits before fetch. No tariff or overage change is authorized.

The workflow `marketstack-de-eu-preflight.yml` performs zero calls by default and on same-repository PRs. Its explicitly selected manual import requires private encrypted `listing-map.json`, current `account-budget-evidence.json`, and, after sample phase, `sample-proof.json`. Missing prerequisites fail closed. Secret presence is tested without exporting its value. Only ciphertext is cached; failed attempts are sealed to preserve reservations. No plaintext artifacts, data commits, public preview upload or schedule exist. Bootstrap of a missing private reference/cache is an explicit operational prerequisite, not permission to put licensed inputs into the public branch.

Execute `ingest-de-eu.mjs` with explicit `--listing-map`, `--account-evidence`, `--private-dir`, `--preview-out`, `--as-of`, `--run-id` and `--phase=sample`. Approximately 15 diverse listings are processed before `mandatory` is allowed. The latter requires real Chromium and WebKit proof for every selected sample, representative index/venue/preferred-class success or explicit venue quarantine, and matching normalized hashes. It processes the mandatory remainder, retaining failed sample decisions. No extra small-cap expansion is enabled.

The disabled incremental refresh uses one bounded history-EOD endpoint per listing, a ten-calendar-day overlap and monthly metadata checks. Latest display derives from that same history. `referenceAsOf` stays frozen while `dataAsOf` advances. The checkpoint updates current history hashes after legitimate refresh; external drift stops revalidation. No synthetic sessions or double adjustments are created. Calendar freshness remains unknown until local-calendar evidence is verified. A two-year first request is bounded to two pages; unavailable/short/gappy history remains partial rather than claimed five-year coverage.

Planning model for 192 listings: `192*(22 EOD pages + 1 monthly metadata page) + 10% retries = 4,858` estimated symbol credits/month. This assumes one page per refresh; actual calendars, pagination, metadata errors and retries may exceed it and trigger the 5,000 cap. Corporate-action fields come from the same returned EOD series; they remain observations until validated. No schedule is activated. Public raw/display rights remain unresolved; this implementation does not grant them.

## Apply, rollback and main drift

Review and merge Core code first only under the repository's existing merge rules. Rebase the dependent Discover PR on the newly current main; rerun protected-path checks and affected suites. Public outputs must remain disabled. Data application is a separate private operation through the registered materializer, never a cherry-pick of old data manifests.

Before any data apply, re-read current main and private storage baseline, verify source hashes and regenerate only the selected DE/EU delta. CAS failure means refresh the relevant baseline and regenerate; never disable the guard or restore an old total dataset. Baseline snapshots and semantic checksums are produced by `scripts/marketstack/de-eu-baseline.mjs`. Normal unrelated daily US updates must be compared separately.

Rollback private DE/EU data by removing only that private output's `core/data/de-eu` and rebuilding the empty disabled directory with the producer. Revert the Discover code commit before the Core commit if code rollback is needed. Do not restore US, Quant, SEC, Vorsorge, passwords, workers, schedules or secrets from this checkpoint. No production paths or existing generated financial datasets are changed by this candidate.
