# VISION UNIVERSE — Tiingo capability, coverage and universe audit

Audit date: **2026-10-02 UTC**. Protected baseline: `ef666ab3d9b7c9aea3d6fb6e0aafd4a6349aa20d`. Tested implementation: `bba98cd83ca5314e8b30ca59069ec45eab88836a`. No deployment, provider cutover, universe publication or commercial decision occurred.

This public report contains derived findings and counts. The complete local audit includes all response payloads, exact observations and hashes. Existing repository rules in `.gitignore`, `docs/TIINGO_PHASE4A_REPORT.md` and `scripts/market/assert-public-data-hygiene.mjs` keep provider histories outside public Git. Future workflow artifacts use authenticated encryption with the existing secret. No credential was printed, extracted or committed. Cached provider documentation includes its own publicly served illustrative examples; these are distinct from private account observations.

## 1. EXECUTIVE RESULT

**507 distinct authenticated requests across six isolated runs** returned 422 HTTP200, 48 HTTP404 and 37 HTTP403 responses. US equity/ETF, mutual-fund NAV, mainland China, US foreign listings and OTC price access are real. Two archived LSE-labelled histories exist. Current native European coverage and a complete ETF research product are unverified.

The material provider finding is **BYD's omitted 2025 bonus-share adjustment**, independently confirmed against its issuer announcement and Shenzhen exchange index. Full historical Chinese Quant/SuperTrader/backtest activation is blocked. Three specific VU bugs are fixed and tested without publishing production data.

**Exact account-wide instrument and common-stock totals remain unknown.** No exhaustive account-specific EOD discovery route was found. Public discovery includes reserved planned symbols, search is capped, and fundamentals are a separate registry.

## 2. FULL TIINGO UNIVERSE

The fresh public ZIP has **108,925 listing/history records**, **106,557 ticker strings**, and 2,272 duplicated ticker strings. Provider labels: 49,270 Stock; 9,775 ETF; 49,880 MutualFund. These are discovery categories, not legal asset counts or account entitlements. Common/ADR/preferred/CEF/warrant/unit/SPAC and active/delisted totals remain unknown.

Venue records: 24,597 US primary, 26,969 US OTC, 49,829 NMFQS, 7,347 mainland China, 11 historical LSE and 172 unknown. Venue does not establish issuer domicile. The authenticated fundamentals registry has 20,332 records / 19,542 tickers; its activity/ADR flags and masked fields are not authoritative EOD identity or coverage.

[Public master](published/tiingo_full_symbol_master.json.gz) · [breakdown](published/tiingo_asset_type_breakdown.json) · [endpoint evidence metadata](published/tiingo_endpoint_inventory.json)

## 3. US STOCK COVERAGE

VU has 7,803 raw members, 6,875 product members, 6,419 consumer-policy members and 6,002 consumer factor rows. Internally classified common shares: 6,038; internally active: 5,941. Fresh primary common candidates: 6,645 rows / 6,643 symbols. Official exchange common-share form lower bound: 4,824, without proving account entitlement.

The 258 common candidate gaps include 225 duplicate-symbol reviews and 33 new eligible candidates. Prices were verified for 20 selected raw omissions: AIRO, ARX, BEPC, BIOA, BIPC, CAI, CART, CENN, CLMT, CRCL, CRTO, DEC, FIG, FLY, NRG, OS, Q, SKHY, SNDK and VLTO. Seventeen have explicit common-share forms; SKHY is an ADR, BIPC remains unresolved, and OS has inactive/sparse-data warnings. Provider NRG venue metadata conflicts with official NYSE evidence.

**Ginkgo DNA is already in raw/product/consumer policy.** Its 1,371-bar price sample is available, but VU falsely rejected its coherent reverse-split history, preventing factor materialization. Reused DNA also selected historic Genentech metadata. Production recovery has not been published. [US gap](published/tiingo_vs_vu_us_gap.json) · [Ginkgo](published/ginkgo_bioworks_case.json)

## 4. US UNIVERSE PIPELINE HEALTH

Canonical membership is a static September snapshot. Daily prices refresh; canonical membership does not have a scheduled refresh. The initial three-year history rule, skipped duplicate ticker reviews and append-only expansion explain many omissions. Historical ticker counts are not caps. No broad bank/REIT/SIC/share-class filter was found; Preferred Bank's name heuristic is a specific bug.

The diagnostic refresh proposal stages 258 candidates and blocks publication pending identity, adjustment, currency, consumer and QA gates. It preserves existing/historical IDs and prevents silent removals. SKHY's recent ADR has 59 bars and is absent from VU. Provider IPO first-appearance latency was not measured. [Freshness](published/tiingo_new_listing_freshness.json)

## 5. EUROPE

No current native European local listing was verified across the tested major venues. Bare SAP resolves to NYSE. Historical LSE-labelled AOF/HYVE return seven/ten archived 2019 bars; current windows are empty, and currency/original-feed semantics remain unvalidated. Do not claim that Tiingo has never held European history. [Exchanges](published/tiingo_europe_exchange_coverage.json)

## 6. TOP 500–1000 EUROPE COVERAGE

The deduplicated representative reference contains **774 operating companies**, using captured secondary index tables, aliases and fund exclusions. It is not an authoritative current top-774 ranking.

- Current local verified: **0**.
- Primary US bridges verified: **70 / 774 (9.04%)**.
- Primary plus reviewed OTC quote bridges: **102 / 774 (13.18%)**.
- Above with sampled positive volume: **100 / 774 (12.92%)**; this does not certify liquidity.

The 704 unvalidated primary bridges are **not an exact provider gap or maximum coverage**. The captured EuroStoxx50 reference has 28 quoted bridges, 27 with sampled positive volume. Current local top-500–1000 coverage is not established. [Coverage](published/tiingo_top_europe_coverage.json)

## 7. CHINA

Discovery has 7,347 rows / 7,346 symbols: 6,524 Stock-labelled and 823 ETF-labelled, including classification anomalies. All ten mainland samples return prices; eight reach the latest expected holiday-adjusted session, two B-share samples are stale. Moutai has 5,065 bars from 2007. Four Hong Kong spelling probes return404; no HK venue was discovered.

BYD's issuer-announced bonus/capitalization action is absent from Tiingo's adjusted price/volume semantics. This is a confirmed economic quality failure, even though declared cash-field algebra passes. Moutai concerns retain secondary-source confidence. Automatic full-history analytics are blocked; explicitly scoped clean windows require independent validation. [China](published/tiingo_china_coverage.json)

## 8. GLOBAL SELECT

All 18 requested companies have issuer-matched price responses: 14 canonical US primary listings and four OTC listings. SKHY adds a current Nasdaq ADR with 59 bars; legacy HXSCL and Samsung SSNLF have severe zero-volume/flat-price limitations. This is selective global research reach, not native Asian exchange coverage or an exhaustive global-company metric. [Global Select](published/tiingo_global_select_coverage.json)

## 9. ETFs

Public ETF labels comprise 9,775 rows / 9,537 symbols: 8,013 US exchange, 822 US OTC, 823 China, 117 unknown and zero European-venue rows. Exact legal/active/entitled counts remain unknown. All 18 requested US ETF/ETP samples have real raw/adjusted EOD data; SPY/QQQ have 8,476/6,934 bars. Snapshot access does not establish live freshness.

Seven native UCITS examples return404. Four OTC UCITS-labelled histories return prices, with identity conflicts and sparse/flat series; they do not establish Xetra/LSE support or usable share-class equivalence. VFINX returns 273 NAV-like bars with zero volume. [ETF universe](published/tiingo_etf_universe.json) · [UCITS](published/tiingo_ucits_probe.json)

## 10. ETF METADATA

All 32 fund-family requests are denied. A separately licensed enterprise/institutional fee product is documented; current access is absent. Structured TER/OCF/AUM/benchmark/domicile/distribution/replication/ISIN and related fields are unverified. Field keys and name searches do not prove readable data. [Metadata matrix](published/tiingo_etf_metadata_matrix.json)

## 11. ETF HOLDINGS

No documented holdings route or actual holdings response was found. Provider-wide availability is **UNKNOWN**; neither enterprise-only nor universal unavailability is established. Current verified holdings/overlap/true-exposure capability is unsupported. [Holdings audit](published/tiingo_etf_holdings_audit.json)

## 12. QUANT / SUPERTRADER / BACKTEST

Qualified US equities/ETFs and useful primary US foreign listings can use existing normalization and quality gates. Short histories are partial; sparse OTC/UCITS and NAV-only histories cannot support volume/range strategies. Mainland full-history activation is blocked by the confirmed action failure. Native current Europe is unverified.

SMA/history, OHLC/volume, currency, benchmark, PIT membership/fundamentals, delisting, execution and survivorship gates remain in force. Passing adjustment-field algebra cannot prove action-calendar completeness. [Fitness](published/tiingo_product_fitness_summary.json)

## 13. CURRENT VU FALSE EXCLUSIONS

Three tested compatible fixes: uniquely match existing listing start dates for recycled ticker metadata; correct Preferred Bank's issuer-name classification with precise cache invalidation preserving explicit preferred shares; check split-only adjustment-factor coherence instead of rejecting large market moves. Four implementation files and focused regressions changed. Existing tolerance, simultaneous-action path and artifact-version gates remain intact.

DNA/AMC/BIRD/AMWL are confirmed split-gate false positives. The remaining 340 are candidates. BNY/CHAI/DOO/CRTO/DEC/NRG/GOGL retain identity review. No automatic production restoration or mass import occurred. [False exclusions](published/vu_false_exclusions.json)

## 14. MINIMUM REMAINING DATA GAP

Verified sources are still needed for current native European equities/UCITS, reliable Chinese bonus/split/cash/volume adjustments, canonical listing identities, complete ETF research metadata and current holdings/exposure. No defensible exact remaining company count follows from incomplete cross-listing enumeration. A separately entitled Tiingo fee product could address fees; broader private offerings remain unknown. [Remaining capabilities](published/tiingo_remaining_provider_gap.json)

## 15. REQUEST ECONOMICS

507 requests completed without429 or auth-stop; quota headers were absent. The public ZIP refresh is one download. Advertised individual quotas are10k/hour and100k/day; commercial20k/hour and150k/day. Actual plan ceilings, bandwidth, unique-symbol and socket limits remain unknown.

Per-symbol updates require6k/10k/20k calls at those scales, before history/metadata/intraday costs. These advertised comparisons do not prove current plan capacity or throughput. No subscription/throttle changed.

## 16. TESTS

Combined suites: **2,586 passed, zero failed, five skipped**. SEC Python: **484 passed**; SEC/exporter/PIT guards:32. US focused:76; adjustment/provider/backtest focused:169; Europe:10; collector safety:3; authenticated encryption safety:3. Certified-source release build PASS; browser smoke CLEAN at1440/768/390. Currency/no-local-FX, recomputed Quant/technical artifacts, credential/public-data and cross-stack/dashboard adjustment gates PASS; open-session freshness was not certified.

The full packaged-input offline reproduction passes without provider requests. ESEF is absent from the protected main baseline; its unmerged prior branch was read only. [Exact test summary](published/test_results.json)

GitHub Quant CI, SEC Fundamentals CI, currency contract and release packaging passed. The separate full browser QA passed 88 functional checks and found no accessibility violations, but **failed four resource-budget checks**. A clean build of the untouched baseline reproduces the same Screener/Screener Pro overrun at both viewports. The existing 30.5 MB gate is unchanged; this audit does not fix that protected performance issue. See [baseline comparison](published/browser_budget_baseline_comparison.json).

## 17. REGRESSIONS

**48,207 protected tracked files are byte-identical to baseline.** No production data, routes, provider routing, Cloudflare configuration, existing workflows or IDs changed. One additive bounded read-only diagnostic workflow has no schedule/deployment/publication and uploads authenticated ciphertext only. Six initial diagnostic payload artifacts were unencrypted; after verified local preservation, only those task-created artifacts were removed. Credentials were never included. [Baseline verification](published/protected_baseline.json) · [independent review](published/independent_review.json)

## 18. DECISION INPUTS

Tiingo solves substantial US price requirements and selective global US-listing research. VU underuses supported securities and has specific correctable exclusions. Current native European coverage is not demonstrated; Chinese long-history action quality has a confirmed failure. US ETF pricing is useful, while complete UCITS/fund metadata/holdings research is not supported by this account's verified data. These are decision inputs, not a commercial recommendation.

## Reproduction

`publish_summary.py` produces only allowlisted counts, categorical findings and provenance from the full private audit. Public cache contents are separately sourced discovery/documentation metadata. Offline analysis requires the full retained private bundle, including `compressed_inputs.json` and its verified gzip caches; no raw account history is committed.

After restoring that private bundle to this audit directory:

```sh
python3 audits/tiingo-2026-10-02/materialize.py
node audits/tiingo-2026-10-02/us/build_audit.mjs audits/tiingo-2026-10-02/runtime/account_evidence.json
node audits/tiingo-2026-10-02/us/propose_refresh.mjs
python3 audits/tiingo-2026-10-02/europe/finalize_account_evidence.py audits/tiingo-2026-10-02/runtime/account_evidence.json
python3 audits/tiingo-2026-10-02/europe/build_otc_liquidity.py audits/tiingo-2026-10-02/runtime/account_evidence.json
python3 audits/tiingo-2026-10-02/global/analyze.py
python3 audits/tiingo-2026-10-02/etf/analyze.py
python3 audits/tiingo-2026-10-02/quality/analyze_quality.py --probes audits/tiingo-2026-10-02/runtime/account_evidence.json
node audits/tiingo-2026-10-02/quality/verify_gate.mjs
python3 audits/tiingo-2026-10-02/quality/finalize_summary.py
python3 audits/tiingo-2026-10-02/publish_summary.py
```

The manual workflow supports six bounded reviewed phases and uses the existing `TIINGO_API_KEY` Authorization convention. For a newly downloaded encrypted artifact, set that existing credential locally without logging it, then run `runtime/secure_evidence.py decrypt INPUT.enc OUTPUT.json`; keep its `.auth.json` sidecar beside it. HMAC verification happens before plaintext is written. Do not commit decrypted payloads. Most probe windows are pinned to the audit date.
