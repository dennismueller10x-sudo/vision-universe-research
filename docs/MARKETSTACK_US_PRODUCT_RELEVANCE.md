# Marketstack US product relevance

This read-only audit reuses accepted PR #334 evidence from **2026-10-01**. It makes **zero provider requests**, spends **zero additional credits**, exports no raw price levels, and changes no production eligibility or provider routing. Its ten input files have byte-level SHA-256 provenance in `reports/marketstack/us_gap_relevance.json`.

## User impact

A Marketstack-only US EOD cutover would cause visible degradation in important VU securities under the measured, unchanged safety gates. This is not confined to obscure or nonconsumer instruments. META, AMD, CAT and Boeing have currency-contract rejection; PLTR and Walmart lack validated prices at their required listings. A currency defect does not establish that the numerical price is wrong, but admitting it without verified listing identity and native currency would be unsafe.

The protected consumer universe remains **6,419**, with **5,423 directory identities (84.483564%)** and **5,018 valid latest observations (78.174170%)**. There are **1,401 protected consumer identity/price gaps**. Four additional current-venue conflicts—FITB, KHC, OPAD and QBTS—have accepted legacy quotes at a different MIC and bring the current-listing fitness gap population to **1,405**. They do not change the frozen 84.48% / 78.17% benchmark.

The independently observed current common-class subset remains **4,755**, with **4,246 current listing identities (89.295478%)**, **3,968 valid latest observations (83.449001%)** and **787 current-listing gaps**. This is a bounded directory/common-class population, not a legally certified full active common-stock universe. The complete active-common denominator and genuinely globally unsupported common-stock total remain **null**. No global unsupported security has been proved; that is not evidence that none exists.

## Full gap classification

The audit covers all **1,065 nonexact retained records**, all **460 rejected exact latest observations**, and the four additional current-MIC conflicts: **1,529 uniquely named records**, without duplicate classifications.

| Relevance bucket | All audited retained gaps | Consumer gaps |
|---|---:|---:|
| A: major-index current common-class observations | 85 | 85 |
| B: active-baseline current common class with usable recent Tiingo activity | 333 | 333 |
| C: current common class with low measured average daily share volume | 9 | 9 |
| D: nonconsumer or explicit non-common company instrument | 516 | 398 |
| E: exact venue removal evidence or inactive baseline without current listing | 16 | 10 |
| F: independently proved duplication | 0 | 0 |
| G: unresolved role, activity, continuity, or basis | 570 | 570 |

A and B are relevance classifications, not approvals for Marketstack Quant or proof of legal issuer/security continuity. The C threshold is **10,000 average daily shares**, applied only to current-class records with passing existing Tiingo factors, at least 60 daily bars and a source date within 14 calendar days. It does not establish microcap status, dollar liquidity, or a new VU inclusion/exclusion policy. No missing activity evidence is interpreted as zero liquidity or delisting. ADRs remain user-relevant unresolved basis candidates; the artifact contains 50 such gaps. ETF/preferred/debt/etc. records are separated from common-company analysis, not deleted from the VU consumer baseline.

All 1,529 rows include available names, security/company/listing IDs, current and baseline venue/type, existing eligibility reason, gap cause, class evidence, existing Tiingo liquidity summary, aliases and index memberships. Aliases are not approved by this audit. Market capitalization and top-market-cap gap counts remain null because this audit does not validate the PIT share-class/ADR/currency basis needed to calculate them safely. Literal current class is never presented as independently proven historical legal continuity.

## Major-index evidence

The repository contains dated **2026-09-26** membership sources: Nasdaq-owner NDX membership and SPY/DIA holdings proxies for S&P 500/Dow. Their unmapped source rows remain separately visible; no complete official current index totals are asserted.

| Stored membership scope | Mapped retained members | Directory gaps | Legacy identity/latest gaps | Required current-listing fitness gaps |
|---|---:|---:|---:|---:|
| S&P 500 proxy: SPY holdings | 498 | 22 | 81 | 83 |
| Nasdaq-100: dated Nasdaq owner list | 100 | 16 | 27 | 27 |
| Dow proxy: DIA holdings | 30 | 2 | 6 | 6 |

The stored sources have six unmapped SPY and one unmapped Nasdaq rows. The union is **89 named consumer fitness gaps appearing in those mapped source memberships**. Four do not qualify for A because the required current common-role/continuity evidence is unresolved. Every named source gap remains in `namedHighRelevanceConsumerGaps`; every one of the 787 current-common-class gaps remains in `namedCurrentCommonClassConsumerGaps`.

## Reproduction and validation

```sh
node scripts/market/validate-marketstack-us-relevance.mjs
node --test quant/tests/marketstack-us-relevance.test.mjs
```

`--output=/private/path/us_gap_relevance.json` writes the same deterministic artifact elsewhere. Generation uses no clock-dependent timestamp, no private cache paths, no API client and no production writes. **28 tests pass, zero fail or skip**, including complete-population reconciliation, immutable input hashes, deterministic repeated generation, missing-vs-zero semantics, current-MIC conflicts, role/continuity rejection and dated index-proxy scope.

## Separate 25-US history retest

Run **36964230530** subsequently sampled 25 requested US listing histories, splits and dividends over **2024-01-01 through 2026-09-30**. Its **75 source requests / estimated credits** are shared evidence counted once by the central run ledger; this read-only relevance analysis spends zero additional requests or credits. `recentHistoryDiagnosticRetest` pins the private replay snapshot SHA-256 and preserves original response attribution/timestamps. It leaves all frozen coverage metrics, gap classifications and 460 baseline safety decisions unchanged.

The 25 bounded history requests return **21 nonempty histories, four empty responses and 13,804 bars**. The terminal 2026-09-30 bar passes basic symbol/MIC, USD, OHLC and nonnegative-volume contracts in all 21 nonempty histories. That is **not** a current quote test: the requested date ceiling excludes the latest endpoint on 2026-10-02. Earlier in those same histories there are **100 invalid OHLC bars, 4,356 bars missing currency and 2,804 bars declaring contradictory currencies**. Examples: NVDA has 51 ARS bars, Microsoft 37 EUR bars, JPMorgan 289 MXN bars and Exxon 290 MXN bars despite terminal bars declaring USD. Similar numerical prices do not authorize correcting currency or approving identity. Only VAI's 24-bar history passes the entire raw structural/currency checklist, which is too short and still has unverified identity/adjustment semantics for product admission.

The empty requests are **PANW, PLTR and WMT at XNAS**, plus **BRK.B at XNYS**. The BRK.B result does not prove unsupported Berkshire coverage: dot-notation symbol alternatives have not been exhausted. No aliases are approved and no identity proof is inferred from company-name or price similarity. These observations refine diagnostics; they neither repair the frozen consumer benchmark nor approve a new chart, Quant or backtest series.

Reproduce the additional diagnostic scope using the materialized private source snapshot:

```sh
node scripts/market/validate-marketstack-us-relevance.mjs \
  --retest-evidence=/workspace/scratch/marketstack-product-fitness-run-36964230530/probe-provenance.json
node --test quant/tests/marketstack-us-relevance.test.mjs
```

Without `--retest-evidence`, generation produces the unchanged frozen relevance scope alone. The test suite verifies the published diagnostic counters without requiring a provider key or access to the private cache, and exercises the diagnostic function with explicit synthetic test fixtures.
