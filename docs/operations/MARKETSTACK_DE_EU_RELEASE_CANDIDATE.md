# Europe Consumer private release candidate — 2026-10-06

This run starts from main `1d56daf897ed7374c6f44c9cdc22faaf1e49b192` and has refreshed its protected baseline to `50e94ae84e20e885d9bd2009ce582f629ef0ac8a`. Normal intervening US daily data updates were merged, never restored backwards. #324/#330/#334/#341 are historical unmerged drafts; this candidate ports required implementation only. Core, Discover and Screener form separate code boundaries. No production merge, public market-data release or recurring schedule is activated.

## Frozen selection and actual execution

The current selection contains 192 core share classes, 184 additional German-domiciled A/B candidates and 745 additional European A/B candidates and 23 separately frozen, officially active German Xetra long-tail candidates: 1,144 selected ISIN/listings. The larger offline candidate directory is not provider-approved coverage. Company, share class, issuer domicile and listing venue remain distinct. There are no US, ETF or Vorsorge requests. UK-domiciled EUR secondary listings are labelled as such; GBP/GBX without independent unit proof remains blocked. Index membership is a current relevance signal, never historical PIT membership.

DAX40, MDAX50, SDAX70, TecDAX30 and EURO STOXX50 are the priority core. Accessible complete German alternative tables and the official STOXX component table are documented in the private reference input. Effective dates remain unresolved; contradictory alternatives are retained as evidence. No current membership list is generated from memory or exposed as licensed raw evidence.

Live queries run server-side in a same-repository owner draft PR using the existing GitHub Actions secret. API v2 and host are pinned; every pagination/retry reservation precedes fetch. All agents share one append-only deterministic ledger. The expanded user's explicit bounded-run authorization uses a 15,000-credit target and 20,000 absolute ceiling when account consumption is unavailable. It does not claim an account balance or change a subscription. A proven smaller remaining balance reduces the allowance. The earlier account-bound preflight remains unchanged and still requires account evidence. A saved execution lease and exact encrypted counter-cache continuity are mandatory before paid work; stale/replayed requests fail before fetch.

Authenticated execution is complete: 3,702 conservatively reserved symbol credits / HTTP attempts, 3,700 distinct stored source responses and eight ledger authorization revisions. Two earlier attempts without a distinct stored response remain unresolved transport/deduplication uncertainty; no refund or counter reset is inferred. The final ledger is `07ea46621d53989f43e23bda2830c6f0bd3fdfbf3b493a103076fc84c89ff394`. Full expansion run `37485131362` and German long-tail sample/remainder runs `37492322112` / `37494134023` completed all import, lease, encrypted cache, ciphertext export and protected-artifact steps successfully. No additional requests or recurring costs are active.

There are 817 exact-mapped normalized histories covering 788 separate LEI issuer references and 978,454 valid original OHLCV bars. The selected 1,144 references retain 327 individually explained blocked ingestion cases. None of the LEI references is silently assigned to an existing US CIK Company. In Germany, 232 accepted securities from 224 separate LEI issuer references have proven German issuer domicile, out of 350 selected German-domiciled securities; 236 accepted listings use Xetra, including foreign issuers. Company domicile, venue and share-class counts are never interchangeable. This is bounded verified coverage, not a claim of complete Germany or complete Europe.

The newest observations are 771 series ending 2026-10-02, six ending 2026-10-05 and 40 older series. At the fixed audit times, 400 are provably stale and 417 lack a complete exact freshness-calendar basis. No series is certified CURRENT or realtime. A proven completed-session lower bound is stored separately from an exact expected session: observations below it are STALE, equal/newer dates remain UNKNOWN. No calendar date, earliest possible closing phase or fresh retrieval timestamp becomes an invented current-session approval.

All 978,454 retained bars were compared to original responses; 11,290 invalid source candles remain quarantined with their evidence, never synthetically filled. Dedicated EU splits/dividends endpoints returned empty responses despite embedded dividends; current v2 documentation does not cover these venues. The mandatory remainder avoided repeating unsupported dedicated calls, preserved embedded observations and never declared complete corporate actions. Adjusted fields remain observations until their basis is verified; no additional split is applied to already adjusted fields.

There are zero current technical, complete Quant, SuperTrader or published-backtest approvals. Existing engines produced 406 bounded historical RESEARCH_ONLY diagnostics. Separate blockers include adjustment/volume basis, dated holes, incomplete calendars, missing fundamentals/share/FX basis and the unimplemented technical-field product projection. Existing fundamentals inspection found 22 unlinked candidates and 795 missing inputs among accepted listings; no broad SEC/ESEF ingestion or new ranking population occurred.

Missing metadata ISINs require an independently hashed exact historical ISIN/MIC/provider-symbol response. Ticker suffix stripping, fuzzy names or an official listing alone cannot prove the provider mapping. HAMBORNER is narrowly classified as a current local corporate REIT share while retaining its actual CBCJXS regulatory classification; the provider ETF conflict still blocks its price import. No global ETF/fund or US eligibility rule was relaxed. Alzchem's September ISIN change is explicit; old and new histories are not stitched.

## Product and publication boundary

Public source contains only an empty DISABLED local directory. Private references, licensed responses, normalized histories, price matrices, account evidence and screenshots stay outside the repository. Actions caches are authenticated encrypted PR-specific ciphertext. Result artifacts contain authenticated ciphertext only; large results are split into separate bounded ciphertext artifacts, verified and reassembled before private decryption. RSA private recipient keys never leave their authorized private storage.

Search, detail, chart, watchlist and the private Europe Screener use the existing product and central contract. All displayed close prices derive from the registered materializer and published-close rounding. Close charts with dated quality limitations can be PARTIAL independently of Quant. LEI issuer references are separate from existing canonical Company links; an unverified CIK/ADR relation is never invented. The existing central reviewed/cache logo producer processed all 788 exact issuer groups. SAP, Allianz and Deutsche Telekom have verified 128×128 assets; 785 groups use honest fallbacks (784 unverified domains and one undersized ASML asset). Existing main logo assets, mappings, credits and current removal rules remain unchanged. A repeated producer run is byte-identical.

Technical readiness uses existing engines and function-specific calendars/windows/basis gates. Historical diagnostics on current constituents are RESEARCH_ONLY. No missing factors become zero, no weights change, and no European securities enter existing US percentiles/rankings. Full Quant, SuperTrader and published backtest performance require their unchanged contracts. A data-ready field whose product projection is unimplemented remains PRODUCT_INTEGRATION_MISSING. Fundamentals are checked against existing SEC/ESEF files without rematerializing them or assuming an ADR share/FX basis.

## Private build and validation

Node22 is required. On the dependent final product branch, use the authorized private checkpoint's producer input, never an old global manifest:

```bash
node scripts/vu2/build-release.mjs --output=/workspace/scratch/europe-consumer-preview-release
node scripts/marketstack/materialize-de-eu.mjs \
  --input=/workspace/scratch/europe-consumer-private/final-materializer-input.json \
  --out=/workspace/scratch/europe-consumer-preview-release --as-of=2026-10-06
python3 -m http.server 8782 --bind 127.0.0.1 --directory /workspace/scratch/europe-consumer-preview-release
# Local/private Discover: http://127.0.0.1:8782/discover/#/de-eu
# Local/private Screener: http://127.0.0.1:8782/screener/?u=EUROPE
```

Start a release build in an empty private output. The registered producer updates only its own core/data/de-eu tree. Identical inputs return changed:false without unnecessary rebuilds; real EOD changes replace the tree atomically. No browser request calls Marketstack or exposes its key. Do not upload this private build to Pages, Vercel, public artifacts or a publicly reachable server: the client-side password screen does not protect retrievable data files. Raw/display/public rights remain unresolved.

```bash
node --test core/tests/*.test.mjs scripts/marketstack/tests/*.test.mjs quant/tests/marketstack-*.test.mjs
node scripts/market/assert-public-data-hygiene.mjs
node scripts/market/assert-no-secrets.mjs --all
```

Supply explicit CLI input/output paths for audit/report commands; no hidden public outputs are generated. Real-reference tests require the private frozen reference and explicitly skip otherwise. Fake transport tests are separate from actual authenticated executions. Browser evidence distinguishes all-directory model checks from representative real Chromium/WebKit journeys. Existing unrelated accessibility defects must be reproduced on unchanged current main with identical inputs, not reported as new failures or silently fixed.

The actual private release built from Screener commit `76aa0eca14298f7549cdc5d96c690d637bc8d7ea` passed 1,144 central listing-model checks and 20 representative real Discover journeys in six Chromium/WebKit desktop/iPhone light/dark profiles. Watchlist model roundtrips on all 1,144 IDs are explicitly separate from the 20 real UI journeys. Europe Screener passed six browser profiles; existing US Screener passed eight fixed-input profiles. Actual frontend transfer is 179,450 bytes across seven resources, below the unchanged 180,000-byte gate. The three verified PNGs loaded in the real UI; missing-history rows retain their missing state.

Not every pre-existing CI gate is green. The unchanged Currency guard fails on the existing `morning/2026-10-06/index.html` hardcoded-currency occurrence; this was independently reproduced on main `c011ff8a2a68c83534d6d916cb712eeb7b3fe965` with the same guard, patterns and baseline, without updating that baseline. The existing Discover accessibility gate has 12 label/content-name failures on identical unchanged main inputs. Neither exception is silently waived or fixed in this scope. Actual browser/build SHAs are retained separately from later report-only commits and normal main data updates.

## Incremental refresh and apply/rollback

The refresh phase requests only accepted identity-consistent histories from the selected cohort; rejected mappings are carried explicitly as REFRESH_SKIPPED and require a separate deliberate revalidation. It uses a ten-calendar-day EOD overlap and monthly metadata. It retains older quarantines unless an actual returned corrected bar resolves that date. Corporate-action observations and identity changes remain independently gated. No daily complete-history downloads, minutely directory requests or provider calls per user occur. No automatic schedule is installed. Monthly credit cost is modelled for actual accepted histories, not the larger candidate directory: accepted count * (22 EOD pages +1 metadata page) plus10% retries, with dedicated unsupported EU action feeds excluded and incomplete action coverage explicit. For 817 accepted histories this is 18,791 base symbol credits plus 1,880 retry reserve: 20,671 modeled credits/month. This is not the account plan, balance or a monthly authorization. The existing account-bound 5,000 local monthly safety ceiling cannot admit this full refresh; no ceiling is silently loosened for operation. Pagination, calendars and restatements may change that model; operational account quota and rights approval are still required before activation.

Review Core code first, then rebase the isolated Discover and Screener code PRs onto the accepted Core/main revision and rerun affected gates. Data application is a separate private registered-producer operation. Re-read main and current private storage before apply; compare protected semantic outputs on identical inputs. A CAS mismatch requires re-reading the relevant baseline and rebuilding only the Europe delta. Never disable isolation/CAS or restore old US total hashes.

Rollback only the private output's core/data/de-eu tree with the registered disabled producer, then revert product code before Core if required. Do not restore US, Tiingo, Quant rankings, SEC/ESEF, Vorsorge, workers, passwords, schedules or secrets from this run. The exact final PRs, SHAs, ledger and preview/test status are recorded in the final private checkpoint.

```bash
# Disable only the registered private Europe output; leave the US tree untouched.
node scripts/marketstack/materialize-de-eu.mjs \
  --out=/workspace/scratch/europe-consumer-preview-release \
  --as-of=2026-10-06 --disabled
```

## Private evidence and reproducibility

Final live cache, registered producer input, per-listing certifications, source audits, CSV and readiness reports remain under the authorized private checkpoint. Superseded decrypted checkpoints were archived only after verifying all 6,665 member hashes; `prior-decrypted-checkpoints.manifest.json` records their original restore paths. The 814 large auxiliary certification evidence files are similarly preserved in a verified private archive; actual certification wrappers remain readable. Reports and product projections read histories/certificates individually rather than constructing a single oversized JSON input. No historical licensed artifact or old global CAS manifest is imported into main.
