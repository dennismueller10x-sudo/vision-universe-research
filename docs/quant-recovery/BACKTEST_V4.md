# Quant Backtest V4 — protected local review and incremental refresh

## Acceptance and hosting boundary

A real NVDA preview is implemented at **`http://127.0.0.1:PORT/quant/internal-backtest/`**, served by the **local authenticated harness**, not the production site. It reads actual V3 precomputed results through **`quant/api/product-services.js#getRealBacktest()`**. It creates no second backtest engine or production API.

The fallback is intentional: GitHub Pages is static. `api/history.js`, `api/intraday.js`, `api/status.js` and `server/http.js` are public market-data/CORS services, without an appropriate private reviewer session. The `worker/` realtime relay is a separate public-origin service without the Node filesystem store or a configured private Quant reviewer identity/storage binding. The task environment exposed no configured private hosting identity. No production configuration, worker, password gate, scheduler, domain or paid infrastructure is changed.

The existing development password mask is not read, changed or accepted as a credential. Production Quant routes, shell, navigation, product menu, Dock, hero, charts/renderers, CSS, icons, fonts and breakpoints remain unchanged. The standalone review pane uses the existing Quant CSS and unmodified `QuantCharts` renderer. It has minimal local form controls and two existing-style pair comparisons rather than a new dashboard/chart implementation.

Initial Main: `6878c21f6`; final tested base: `ff547b723` after a clean rebase onto upstream SEC/universe/benchmark updates. No parallel product/pipeline edits are introduced by this branch. #862/#872/#882/#894/#895 were all verified OPEN/unmerged. Four prerequisite commits from #882/#894/#895 are preserved separately on this branch; those PR branches are untouched. The new feature remains PRICE_RETURN / NOT_CERTIFIED / productionApproved=false.

## Run locally

Node 22 and Python 3; only built-in Node modules are needed for the harness/refresh. Run from repository root:

```sh
VU_REVIEW_ROOT="$(mktemp -d /tmp/vu-quant-review.XXXXXX)"
node scripts/quant/refresh-real-backtest.cjs --output "$VU_REVIEW_ROOT/results"
node scripts/quant/preview-real-backtest.cjs --init-credential "$VU_REVIEW_ROOT/access.key"
node scripts/quant/preview-real-backtest.cjs --directory "$VU_REVIEW_ROOT/results" --credential-file "$VU_REVIEW_ROOT/access.key" --port 8794
```

Open `http://127.0.0.1:8794/quant/internal-backtest/`. Read the new key **locally** from `access.key` and enter it in the login form. Do not put it in a URL, command argument, source file, screenshot, Git, CI log or chat. The CLI never prints it. The file must be outside the repository, a regular non-symlink private file with no group/other permissions. Initialization uses exclusive creation and mode 0600. Use a fresh private browser context for internal review.

Default access and initial refresh scope are **NVDA only**. For the eight-case internal QA, start with a different output directory and explicitly set:

```sh
node scripts/quant/refresh-real-backtest.cjs --output /tmp/vu-review-eight --ids ref_NVDA,ref_MSFT,ref_XOM,ref_ARM,ref_AAPL,ref_BGC,ref_AAAC,ref_AACT
node scripts/quant/preview-real-backtest.cjs --directory /tmp/vu-review-eight --credential-file /tmp/vu-review-access.key --allow-list NVDA,MSFT,XOM,ARM,AAPL,BGC,AAAC,AACT --port 8794
```

The CLI key file in the second example must first be initialized with `--init-credential`. Artifact scope and server access scope are independent: a full 6,174-listing store does not grant the reviewer access to all listings.

## Authentication and delivery contract

Transport implementation: `server/quant-backtest-preview.cjs`; private file delivery: existing `server/quant-backtest-store.cjs`.

- Binds to **127.0.0.1 only**. No public-bind option, cloud route or deployment entry is added.
- Separate random 256-bit access key, timing-safe hash comparison; never injected into HTML/JavaScript or client storage.
- Login is same-origin JSON POST, bounded to 4 KiB. Failed attempts are rate limited. At most 32 in-memory sessions; default absolute lifetime 10 minutes, maximum 15 minutes.
- Opaque random session cookie, HttpOnly, SameSite=Strict, host-only and restricted to the internal prefix. Every data/detail request is authorized server-side; expiry/revocation is rechecked after asynchronous reads. Logout revokes the session in memory. Restart revokes all sessions; key rotation requires restarting with the replacement private key file.
- HTTP is restricted to local loopback. This is **not** a remote multi-user/TLS/SSO deployment and must not be exposed as one. OS account and browser process are part of the local trust boundary.
- Host, Origin and browser fetch-site checks reject foreign requests. No CORS grant. CSP disallows inline scripts, framing, service workers, external connections and base URL changes. Existing chart style attributes are permitted; scripts and stylesheets remain same-origin. Dynamic content uses DOM text, not untrusted HTML.
- Every response is private/no-store, including errors. No ETag/304 shortcut. No raw storage paths, directory listing, private index, credential file or generation blob is served by the HTTP router.
- `/data` accepts only ticker/period/section/generation/listingId; other or duplicate parameters are rejected. The server's allow-list is authoritative. Detail requests require a pinned listing and generation. A refreshed pointer causes 409 GENERATION_CHANGED instead of mixed generations.
- Summary, Quality, Equity and Trades remain separate. No computation or batch job runs on page requests. JSON/gzip/decompressed limits and result hashes remain enforced; response payloads are additionally bounded (256 KiB default).
- Logs contain startup URL and aggregate operation status only. No request logger, headers, cookies, request bodies, private price/trade data or credential values are emitted.

Routes are local only: GET review pane/assets; POST login/logout; authenticated GET session/data. There is **no HTTP refresh/rollback route**.

## What the reviewer sees

- Canonical/source/listing identities, period and actual source As-of, calculation timestamp, immutable generation, strategy/model versions and result hashes.
- USD 100,000 initial capital, final capital, CAGR, weekly drawdown, complete/open trade counts, paid fees and slippage.
- Strategy/own-stock and strategy/SPY curves with unchanged chart renderer/styles. Gross zero-cost passive benchmarks are explicitly separated from the net strategy cost model. No Total Return comparison is fabricated.
- Lazy trade details with signal/entry/exit dates, source price precision, costs, net return and an explicitly incomplete final open position. Tables remain horizontally scrollable on mobile.
- PRICE_RETURN, NOT_CERTIFIED, excluded dividends, ex-post adjustments, modeled next-week close without a guaranteed live fill, source/provenance limitations and no market-wide/positive-edge claim.
- Current local-input consistency versus stale input generation, actual source age and source As-of. CURRENT_INPUT_SNAPSHOT does **not** mean current market quotes, PIT certification or commercial approval. NVDA's stored source currently ends on 2026-10-16; the pane discloses its age rather than fabricating 2026-10-23 data.

`server/quant-backtest-freshness.cjs` checks the frozen snapshot hash and selected source, master, model, code, product identity and benchmark dependencies. Content hashes are cached by inode/size/mtime/ctime, bounded to 128 entries. Changed stored inputs produce STALE_INPUT_SNAPSHOT while the last complete generation remains available and explicitly labeled. The browser polls session/quality metadata; a generation change clears/reloads the result, and stale detailed responses cannot overwrite a newer selection. Pagehide/logout/expiry clears private DOM state.

## Local refresh and rollback policy

```sh
# Explicitly start local observation, in another terminal; no production cron:
node scripts/quant/refresh-real-backtest.cjs --output "$VU_REVIEW_ROOT/results" --watch --interval-seconds 60
# Explicit one-shot validation/refresh:
node scripts/quant/refresh-real-backtest.cjs --output "$VU_REVIEW_ROOT/results"
# Explicit local rollback to a retained COMPLETE generation:
node scripts/quant/rollback-real-backtest.cjs --output "$VU_REVIEW_ROOT/results" --generation PREVIOUS_64_HEX_GENERATION
```

The watcher reacts to **local stored input changes** after the existing long-series publisher (`scripts/market/publish-long-series.mjs`) or an approved input checkout update. It neither fetches provider data nor pulls Git or changes production workflows. It polls at >=30 seconds; unchanged fingerprints cause no refresh process. Actual refreshes use a fresh Node child process so a modified module cannot be mislabeled with new hashes while executing an old require cache.

The existing materializer now provides:

1. Immutable generation inputs: source bytes, security master, product identity, benchmark inputs, mechanics and code hashes.
2. A private integrity-checked calculation cache keyed per listing by its source and required dependencies. An isolated one-file correction calculates **one** listing and reuses **seven** in the eight-case test. New wrapper generations rebind metadata/detail hashes without recomputing unchanged ledgers. Returning to an already completed identical snapshot reuses its checkpoint directly.
3. Global master/model/benchmark/calculation-code changes conservatively invalidate affected calculations globally. This preserves identity/admission safety; no optimal row-specific master/benchmark invalidation is claimed.
4. Unsupported model versions/cost changes fail closed. Execution-mechanics validation remains distinct from certification.
5. Verification of frozen dependencies again immediately before publication. A changing source aborts the build; no partially observed generation is activated.
6. A writer lock **and serialized lock acquisition**, including stale-PID recovery under that acquisition gate. Concurrent writers cannot race to steal the recovered lock. A corrupted lock or crash inside the short acquisition gate fails closed and requires operator inspection, not blind deletion.
7. Atomic complete release pointer, retained complete release manifests and old generation files. Partial, invalid or corrupted-cache updates preserve the previous pointer. No automatic pruning.
8. Rollback verifies old indexes, summaries and detail hashes before atomically selecting the retained complete generation under the same writer lock. Old source As-of remains visible; rollback does not relabel old data as newly published.
9. Automated refresh preserves its established listing scope. An accidental scope reduction is rejected; choose a new private output directory for another scope.

Stop local watch/preview with Ctrl-C. For an abandoned acquisition gate, first stop/verify the owning process and inspect the private lock files; never remove the lock of an active writer. The CLI is not a distributed/NFS lock or a production scheduler.

## Actual validation

See `v4/VALIDATION.json`, `v4/delivery.json`, `v4/browser.json` and `v4/materialization.json`. Large artifacts, access keys and screenshots are **outside Git**.

- Complete real V4 materialization: 6,174 source listings; 4,445 class B, 1,729 class C; 3,609 complete MAX SPY comparisons; 42,748 closed MAX trades. Twenty-two thousand two hundred twenty-five period results, not an independent historical universe.
- Complete V3 reader revalidation over all 6,174: no financial payload on blocked replies. Independent Python cash reconstruction passes all five real NVDA periods.
- Authenticated HTTP delivery checks for NVDA/MSFT/XOM/ARM/AAPL/BGC/AAAC/AACT and 20 concurrent identical NVDA summaries. Source-price/return-basis separation and checksum bindings retained.
- Real-source append test: earlier actual stored weekly bars -> complete actual stored series; pending state is labeled stale, old pinned detail URLs return 409, new source As-of becomes visible. This is a local QA cutoff simulation, never an invented as-published PIT snapshot. Deliberately modified prices/corruption are isolated failure-injection fixtures only, never preview data or published results.
- Chromium desktop and actual WebKit with iPhone 13 profile: authentication, all periods, two comparisons, 21 trades/open position, eight cases, dark/light, mobile overflow, lazy details, logout/reload/expiry and unauthorized replay. Screenshots contain review data and are private local files only.
- WebKit on this worker uses the official Playwright 1.58.2 WebKit 2248 bundle with genuine Debian libraries extracted under the private scratch directory. System installation failed (`su: Authentication failure`). A local launcher supplies the actual library paths because the bundle wrapper overwrites LD_LIBRARY_PATH; no dependency/CI gate or browser result is patched or falsified. Normal machines can use standard Playwright browser dependencies.
- The public static release builds successfully and contains neither the local preview route/server/client nor private generations, calculation caches or credentials. The existing public browser QA retains its independent baseline finding; no public UI repair is included here.

## NVDA reference and methodological boundaries

Stored weekly prices: 1999-01-22 to 2026-10-16. Eligible signal start 2000-01-28, first actual signal 2000-02-11, first entry 2000-02-18. 21 completed trades and one open position, USD 4,926,635.79 final capital; fees USD 36,559.17 and slippage USD 18,279.58; CAGR 15.705%, weekly max drawdown -80.218%. SPY on exactly the same valuation dates: USD 561,729.53, CAGR 6.673%, drawdown -55.914%, PRICE_RETURN. NVDA buy-and-hold CAGR 34.503% is higher than the strategy; there is no confirmed positive signal edge.

AAPL's corporate-action hold remains. BGC's historical terminal listing and today's primary identity remain separate. AAAC warm-up and AACT weekly gaps remain blocked. XOM dividends are not included. Missing SPY does not block the price simulation or silently shorten MAX. Pattern/Setup/PIT Strategy/Factor Ranking integration and all methodological/certification gates remain unchanged.

## Next release decision

The local protected preview is usable now with the separate credential file; no additional engineering is needed to start that local review. A shared remote internal preview requires a separately approved TLS/identity/private-storage hosting boundary. Public Quant integration requires a separate rights, freshness/operations, product wording and UI-binding decision with normal reviews/mandatory checks. It must retain PRICE_RETURN / NOT_CERTIFIED unless independent methodology certification actually succeeds. No public activation, auto-merge or new provider contract is performed here.

The login form also declares POST at the HTML level: with JavaScript disabled or unavailable, it fails closed without putting the key into the URL. Protected browser QA includes this negative case in both engines.
