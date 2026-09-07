# VISION UNIVERSE® QUANT — SEC Financial Data Core

Product directory for the SEC fundamental pipeline, following the same pattern as
`dashboard/`, `macro/`, `academy/` and `hedgefonds/`: static HTML/CSS/JS, no build
step, no frameworks, data as generated JSON, pipelines as stdlib Python under
`scripts/`.

## Contents

```
quant/
  config/metric_registry.json   Canonical Metric Registry (VU metric -> SEC concepts)
  config/sec_universe.json      Validation universe (input, not a special case)
  data/                         Generated artifacts, committed
    inspector_index.json          company list for the inspector
    inspector/<TICKER>.json       per-company fact rows with full provenance
    coverage_matrix.json          STRUCTURED / DERIVABLE / FILING_ONLY / MISSING
    pit_gates.json                qualification gate results
    factor_snapshot.json          quant factors at an as-of date
    raw/    (gitignored)          immutable SEC payload archive
    facts/  (gitignored)          full normalized factbooks
  data-inspector/               internal validation UI
  ARCHITECTURE.md               this file
```

Pipeline code lives in `scripts/quant/` — see `docs/SEC_DATA_ARCHITECTURE.md`.

## Data flow

```
data.sec.gov ──> scripts/quant/sec/ ──> quant/data/*.json ──> quant/data-inspector/
   (Actions)        (Python, stdlib)       (static, committed)     (browser, fetch only)
```

The browser never calls the SEC. It cannot: the SEC asks automated clients for a
declaring User-Agent, and JavaScript is not permitted to set that header. All SEC
access is server-side in GitHub Actions, exactly as `scripts/hedgefonds/` already
does for 13F data.

## Generated files

Only `quant/data/**` may be written by `update-sec-fundamentals.yml`, and its
scope guard fails the run if anything else changed. The seed files carry
`status: "not_generated"` until the first successful run — the same convention as
`dashboard/data/market_data.json`.

`quant/data/raw/` and `quant/data/facts/` are gitignored: raw SEC payloads run to
tens of megabytes per company and are fully regenerable. CI fails if either
becomes tracked, if any committed artifact exceeds 2 MB, or if `quant/data`
exceeds 10 MB in total.

## Boundaries

- This pipeline does not read, write or modify `dashboard/`, `scripts/dashboard/`,
  `hedgefonds/` or `reports/`. CI enforces the `scripts/dashboard/` half of that.
- `scripts/quant/sec/backtest_bridge.py` **imports**
  `scripts/dashboard/backtest_technicals.py` and leaves it untouched. A test
  asserts the bridge reproduces that engine's output exactly when its fundamental
  filter is disabled, so the two cannot drift.
- The data inspector is an engineering tool, marked `noindex`. It is not part of
  the consumer product surface.

## Adding a company

Add an entry to `quant/config/sec_universe.json`. Nothing else. The pipeline
resolves the ticker against the SEC's own map at ingest time and aborts on a
mismatch with the configured CIK hint. CI fails the build if any company
identifier appears in `scripts/quant/sec/`.
