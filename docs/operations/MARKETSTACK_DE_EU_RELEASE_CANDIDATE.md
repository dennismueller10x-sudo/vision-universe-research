# Europe Consumer private release candidate — 2026-10-06

This run starts from main `1d56daf897ed7374c6f44c9cdc22faaf1e49b192` and has refreshed its protected baseline to `1a79b9b01e2ba86bfbabb4235ffa2a3641d2000c`. Normal intervening US daily data updates were merged, never restored backwards. #324/#330/#334/#341 are historical unmerged drafts; this candidate ports required implementation only. Core, Discover and Screener form separate code boundaries. No production merge, public market-data release or recurring schedule is activated.

## Frozen selection and actual execution

The current selection contains 192 core share classes, 184 additional German-domiciled A/B candidates and 745 additional European A/B candidates: 1,121 selected ISIN/listings. The larger offline candidate directory is not provider-approved coverage. Company, share class, issuer domicile and listing venue remain distinct. There are no US, ETF or Vorsorge requests. UK-domiciled EUR secondary listings are labelled as such; GBP/GBX without independent unit proof remains blocked. Index membership is a current relevance signal, never historical PIT membership.

DAX40, MDAX50, SDAX70, TecDAX30 and EURO STOXX50 are the priority core. Accessible complete German alternative tables and the official STOXX component table are documented in the private reference input. Effective dates remain unresolved; contradictory alternatives are retained as evidence. No current membership list is generated from memory or exposed as licensed raw evidence.

Live queries run server-side in a same-repository owner draft PR using the existing GitHub Actions secret. API v2 and host are pinned; every pagination/retry reservation precedes fetch. All agents share one append-only deterministic ledger. The expanded user's explicit bounded-run authorization uses a 15,000-credit target and 20,000 absolute ceiling when account consumption is unavailable. It does not claim an account balance or change a subscription. A proven smaller remaining balance reduces the allowance. The earlier account-bound preflight remains unchanged and still requires account evidence. A saved execution lease and exact encrypted counter-cache continuity are mandatory before paid work; stale/replayed requests fail before fetch.

At this intermediate checkpoint, the core import, bounded twelve-identity recheck and two expansion probes consumed 849 estimated symbol credits / 849 HTTP attempts. They yielded 178 real normalized histories, including successful exact-ISIN Vestas and DSV DKK listings. This is an intermediate checkpoint, not the final full-import coverage. Final totals and per-listing readiness come from the private registered report generator and final execution ledger.

The latest EOD is predominantly 2026-10-02, with five materially older core series. These are neither current-session approvals nor realtime quotes. Original invalid OHLC rows, gaps, currencies, adjustment observations and quarantines are retained. Dedicated EU splits/dividends endpoints returned empty responses despite embedded dividends; current v2 documentation excludes these venues. The mandatory remainder avoids repeating unsupported dedicated calls, preserves embedded observations and never declares complete corporate actions. Adjusted fields are observations until their basis is verified; no additional split is applied to already adjusted fields.

Missing metadata ISINs require an independently hashed exact historical ISIN/MIC/provider-symbol response. Ticker suffix stripping, fuzzy names or an official listing alone cannot prove the provider mapping. HAMBORNER's provider ETF classification conflicts with official shares and remains blocked. Alzchem's September ISIN change is explicit; old and new histories are not stitched.

## Product and publication boundary

Public source contains only an empty DISABLED local directory. Private references, licensed responses, normalized histories, price matrices, account evidence and screenshots stay outside the repository. Actions caches are authenticated encrypted PR-specific ciphertext. Result artifacts contain authenticated ciphertext only; large results are split into separate bounded ciphertext artifacts, verified and reassembled before private decryption. RSA private recipient keys never leave their authorized private storage.

Search, detail, chart, watchlist and the private Europe Screener use the existing product and central contract. All displayed close prices derive from the registered materializer and published-close rounding. Close charts with dated quality limitations can be PARTIAL independently of Quant. LEI issuer references are separate from existing canonical Company links; an unverified CIK/ADR relation is never invented. Logos run through the existing reviewed/cache producer; missing official-domain proof uses its fallback.

Technical readiness uses existing engines and function-specific calendars/windows/basis gates. Historical diagnostics on current constituents are RESEARCH_ONLY. No missing factors become zero, no weights change, and no European securities enter existing US percentiles/rankings. Full Quant, SuperTrader and published backtest performance require their unchanged contracts. A data-ready field whose product projection is unimplemented remains PRODUCT_INTEGRATION_MISSING. Fundamentals are checked against existing SEC/ESEF files without rematerializing them or assuming an ADR share/FX basis.

## Private build and validation

Node22 is required. On the dependent final product branch, use the authorized private checkpoint's producer input, never an old global manifest:

```bash
node scripts/vu2/build-release.mjs --output=/workspace/scratch/europe-consumer-preview-release
node scripts/marketstack/materialize-de-eu.mjs \
  --input=/workspace/scratch/europe-consumer-private/expansion-overlay-input.json \
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

## Incremental refresh and apply/rollback

The refresh phase requests only selected listings, a ten-calendar-day EOD overlap and monthly metadata. It retains older quarantines unless an actual returned corrected bar resolves that date. Corporate-action observations and identity changes remain independently gated. No daily complete-history downloads, minutely directory requests or provider calls per user occur. No automatic schedule is installed. Monthly credit cost is modelled for actual accepted histories, not the larger candidate directory: accepted count * (22 EOD pages +1 metadata page) plus10% retries, with dedicated unsupported EU action feeds excluded and incomplete action coverage explicit. Pagination, calendars and restatements may change that model; operational account quota and rights approval are still required before activation.

Review Core code first, then rebase the isolated Discover and Screener code PRs onto the accepted Core/main revision and rerun affected gates. Data application is a separate private registered-producer operation. Re-read main and current private storage before apply; compare protected semantic outputs on identical inputs. A CAS mismatch requires re-reading the relevant baseline and rebuilding only the Europe delta. Never disable isolation/CAS or restore old US total hashes.

Rollback only the private output's core/data/de-eu tree with the registered disabled producer, then revert product code before Core if required. Do not restore US, Tiingo, Quant rankings, SEC/ESEF, Vorsorge, workers, passwords, schedules or secrets from this run. The exact final PRs, SHAs, ledger and preview/test status are recorded in the final private checkpoint.
