# Marketstack product-fitness evidence reproduction

The accepted PR334 head is `bf84b7ae99b1d291de6b61d1f7ba42ef262c6eb1`. This branch adds offline audit runners, tests and reports; it does not modify production data, engines, routing or Cloudflare configuration. The release build excludes research reports and private response caches.

All validators below use stored evidence and make zero network requests. No local Marketstack key is required. Raw response bodies and full provider portfolios stay in private artifacts, with public source hashes and diagnostic aggregates. Missing credentials/caches fail explicitly; no network fallback invents evidence.

## Private evidence inputs

- Accepted PR334 provenance cache: `/workspace/scratch/marketstack-scale-36912587006/probe-provenance.json`, SHA256 `1fef933ea8ec83f49cde047bf980ef52c4bd1b400caf4efbea12cbf1e5ac8b6c`.
- Original PR330 controls: `/workspace/scratch/marketstack-probe-{1..5}/probe.json` and probe5 `us-latest.json`.
- Accepted private ETF census: `/workspace/scratch/marketstack-etf-full-private-finalization.json`, SHA256 `8dcd07e5f968d7959ba62fb27627300e110873468881f9f082e0f869b3123370`.
- New fixed capped Actions run [36964230530](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/36964230530), artifact ID11209305805: 25 US symbols, three endpoints,75 requests/credits. Extraction root `/workspace/scratch/marketstack-product-fitness-run-36964230530`. The workflow uses the existing server-side client and Actions secret, private runner cache and no production ingestion.
- Public issuer documents: exact source URLs and SHA256 in `marketstack_issuer_role_controls.json`; private cached source bodies support three issuer-association contradictions. These are public source requests, not Marketstack calls.

To restore a downloaded new workflow cache, run the existing materializer:

```sh
node scripts/market/materialize-marketstack-evidence.mjs \
  --working-directory=/workspace/scratch/marketstack-product-fitness-run-36964230530 \
  --out=/workspace/scratch/marketstack-product-fitness-run-36964230530/probe-provenance.json
```

The resulting SHA256 is `ee9e01bc276927ecd1d562ed90f6ff419ec0d4367b380c236a341a759b73dd90`. Endpoint origins retain original source run IDs instead of treating the replay-container ID as request provenance. The fusion-specific original private `probe.json` remains bound separately by its own report hash.

## Offline artifact generation

Run from the repository root. Existing accepted artifacts are input-only. Company production is deterministic from accepted references, canonical coverage, companion fusion validation and issuer-role controls; evaluation date remains2026-10-02 while generatedAt follows the latest source evidence timestamp.

```sh
node scripts/market/validate-marketstack-us-relevance.mjs \
  --retest-evidence=/workspace/scratch/marketstack-product-fitness-run-36964230530/probe-provenance.json
node scripts/market/build-marketstack-company-product-masters.mjs
node scripts/market/validate-marketstack-screener-fitness.mjs
node scripts/market/validate-marketstack-product-engines.mjs \
  --probe=/workspace/scratch/marketstack-scale-36912587006/probe-provenance.json \
  --probe=/workspace/scratch/marketstack-product-fitness-run-36964230530/probe-provenance.json \
  --probe=/workspace/scratch/marketstack-probe-1/probe.json \
  --probe=/workspace/scratch/marketstack-probe-2/probe.json \
  --probe=/workspace/scratch/marketstack-probe-3/probe.json \
  --probe=/workspace/scratch/marketstack-probe-4/probe.json \
  --probe=/workspace/scratch/marketstack-probe-5/probe.json
node scripts/market/validate-marketstack-product-adjustments.mjs \
  --probe=/workspace/scratch/marketstack-scale-36912587006/probe-provenance.json \
  --probe=/workspace/scratch/marketstack-probe-5/probe.json \
  --us-probe=/workspace/scratch/marketstack-product-fitness-run-36964230530/probe-provenance.json
node scripts/market/validate-marketstack-global-etf-fitness.mjs \
  --probe=/workspace/scratch/marketstack-scale-36912587006/probe-provenance.json \
  --full-audit=/workspace/scratch/marketstack-etf-full-private-finalization.json \
  --as-of=2026-10-02
```

The adjustment controls from original PR330 are additionally supplied as repeated `--probe` arguments when reproducing the published report; its exact complete command is in [MARKETSTACK_CANONICAL_ADJUSTMENT_SPEC.md](MARKETSTACK_CANONICAL_ADJUSTMENT_SPEC.md). The fusion validator and real offline LVMH replay commands are in [MARKETSTACK_FUNDAMENTAL_PRICE_FUSION.md](MARKETSTACK_FUNDAMENTAL_PRICE_FUSION.md). Reproduce fusion before company masters, because those masters hash the final fusion input.

Compare output bytes from an alternate private `--out`/`--out-dir` to committed reports. Engine inputs use full content hashes, fixed selection, source-derived time and sorted identities; no request repeats are necessary. Research estimates and source references are not production primary-listing assignments.

Europe uses a lossless dictionary encoding to avoid repeating long evidence strings. Consumers must expand it before reading per-row product values:

```js
import {readFileSync} from 'node:fs';
import {expandCompanyCoverage} from './scripts/market/build-marketstack-company-product-masters.mjs';
const report=expandCompanyCoverage(JSON.parse(readFileSync('reports/marketstack/europe_company_coverage.json')));
// report.companies and report.listings now contain complete original fields.
```

## Regression and browser evidence

Exact broad-suite commands:

```sh
node --test quant/tests/*.test.mjs
node --test discover/tests/*.test.mjs screener/tests/*.test.mjs scripts/supertrader/tests/*.test.mjs worker/tests/*.test.mjs
python3 -m unittest discover -s scripts/quant/tests
python3 -m unittest discover -s scripts/fundamentals/tests
python3 -m unittest discover -s scripts/vu2
node --test scripts/vu2/resource-budget.test.mjs
node scripts/market/assert-public-data-hygiene.mjs
```

The existing release builder and browser scripts run on a private built release, with Playwright1.58.2, Chromium145 and axe4.10.3. Quant cold resource budgets include all initially fetched subresources, explicit font readiness and isolated browser contexts; accepted budget and QA source files are unchanged. Discover/browser source, production smoke, named journeys and native-currency chart/watchlist/API checks are measured separately. A successful delivery test never certifies fresh or split-adjusted prices.

`marketstack_product_fitness_tests.json` binds exact commands, source/log hashes, measured suite/browser counts and protected output manifests. The existing five Product skips remain visible. The test materializer requires completed local JSON/log evidence, reconciles counters/hashes, and rejects malformed/empty evidence or failed gates:

```sh
node scripts/market/materialize-marketstack-product-test-evidence.mjs \
  --evidence-root=/workspace/scratch
node scripts/market/summarize-marketstack-product-fitness.mjs \
  --accounting=/workspace/scratch/marketstack-product-fitness-run-36964230530/checkpoint.json \
  --tests=reports/marketstack/marketstack_product_fitness_tests.json
```

The independent review binds the final rollup and tests. Its review outputs are final audit leaves; they are not fed back into hashed inputs, avoiding provenance cycles. The engineering report documents numerical versus production-admission scopes.
