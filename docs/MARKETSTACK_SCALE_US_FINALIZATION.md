# Marketstack US finalization — PR #334

This audit continues the accepted 7,803-record comparison. It changes no Tiingo records, consumer membership, production routing, SEC/ESEF fundamentals or product calculations. Provider choice remains deferred. The measured market snapshot is October 1, 2026; final report timestamps are the maximum stored input timestamps, not the time a replay happens.

## Consumer coverage and named gaps

The protected consumer denominator remains **6,419**. Exact directory plus accepted identity coverage remains **5,423 / 6,419 (84.48%)**; valid latest observations remain **5,018 / 6,419 (78.17%)**. These are the accepted exact-symbol/MIC directory semantics, not independently proven issuer/ISIN identity for every directory row.

`us_marketstack_consumer_final.json` exhaustively partitions all **1,401** protected consumer records without a passing latest observation:

| Primary gap | Records |
| --- | ---: |
| Missing verified listing identity | 656 |
| Security identified at a different provider venue | 329 |
| Wrong exchange/provider identity or contradictory price-row metadata | 348 |
| Baseline inactive; termination unverified | 23 |
| Unexplained stale latest price | 20 |
| Previously documented class/venue removal | 4 |
| Newly documented class/venue removal notification explains staleness | 6 |
| Documented symbol change; old price mapping unverified | 1 |
| Directory/resolved identity without a valid latest candle | 14 |

The independent current directory yields a **policy-filtered, current common/ordinary-class lower bound of 4,755** baseline-active consumer records. Of those, **4,246 (89.30%)** have matching current-venue directory/resolved coverage and **3,968 (83.45%)** have passing latest observations. The **787** remaining current-class records are listed by symbol, current security name, baseline company name, MIC, rejection and source evidence in `relevantCurrentCommonStockGaps`.

That subset contains **509** records lacking accepted current-listing identity and **278** identity-covered records without a valid latest price. Its mutually exclusive gap decomposition is 325 identified securities at a different provider venue, 180 missing current-listing identities, four passing protected quotes at a different current MIC and 278 identity-covered price rejections. Protected coverage and current-listing coverage are separate fields, so those four records are never described as covered current listings.

`ACTIVE_CONSUMER_COMMON_STOCKS_TOTAL` and `GENUINELY_UNSUPPORTED_ACTIVE_COMMON_STOCKS` remain **null**. The source inventory cannot establish complete legal issuer/instrument classification, historical ticker continuity or global provider unavailability. The lower bound is not an authoritative operating-company stock total. There are **623** protected consumer records with absent/unclassified current roles or unresolved fund/beneficial-interest company roles; 87 currently common-class records retain inactive baseline status. Their membership remains unchanged.

Only literal instrument descriptions refine roles: common shares, ordinary shares, explicit ADR/depository share descriptions and senior/subordinated debt. ETF/ETN flags retain priority. **77** fund/term-trust/beneficial-interest company-role ambiguities remain review candidates; they are not automatically classified as closed-end funds. Explicit REIT evidence is preserved. “Trust Bank,” “Fundamental” and “Funding” names do not trigger fund exclusions. No market-cap cutoff or production exclusion is introduced.

## Exhaustive quality/freshness classification

The original **460** rejected latest observations remain rejected. The previous **454** unsafe/unresolved records now have this mutually exclusive primary classification:

| Classification | Records | Evidence and limitation |
| --- | ---: | --- |
| `PROVIDER_DATA_QUALITY` | 358 | 342 currency contradictions and 16 undeclared currencies. This identifies a price-row contract defect; provider-internal currency metadata versus identity collision remains unproven. |
| `INVALID_OHLC` | 29 | Positive-price and OHLC boundary invariants fail. |
| `IDENTITY_MAPPING_ERROR` | 16 | Independently explicit current instrument role contradicts the protected role. Historical ticker continuity and responsibility for the mismatch remain unproven. |
| `PROVIDER_SYMBOL_ERROR` | 3 | Provider price-row instrument type contradicts a known current class. No substitute alias is approved. |
| `EXPECTED_STALE` | 10 | Independent pre-removal SEC coverpage symbol/class/venue contexts and exact class/venue Form 25 notifications corroborate a final historical listing context. Effective last trading dates remain unknown. |
| `CORPORATE_ACTION` | 1 | AIHS → VAI is explicitly declared in a SEC filing and corroborated by the current new-symbol SEC/Nasdaq identity. Its provider security identifiers remain unverified. |
| `UNKNOWN` | 37 | 36 stale records lack sufficient security-specific termination/suspension/last-trade proof; LMNX has unresolved type/identity attribution. |

Together with the six accepted baseline class/venue removals, **17** observations now have positive independent explanations, **406** have observable currency/type/OHLC defects and **37** retain unresolved primary causation. An explanation is not a repaired candle: **all 460 remain unsafe for new Marketstack EOD, Quant and chart use; zero safety promotions or canonical writes occurred**. These flags apply to the rejected Marketstack observations, not existing Tiingo charts.

Each `us_marketstack_quality_final.json` row records `listing_id`, legacy instrument ID, security ID, symbol, exchange/MIC, classification, reason, causal certainty, official identity/status evidence, Tiingo dates/hash, calendar coverage, volume state, action/history diagnostics and the three safety gates. `listing_id` remains null where the legacy US model has no explicit global listing ID; the legacy instrument ID is retained separately rather than invented as a listing ID.

Thirteen flags have zero reported volume. Zero volume alone never establishes suspension or an error. No stale flag is released through a holiday assumption; the covered repository exchange calendar distinguishes completed prior sessions from the unfinished audit-day session. Its unconfigured venues retain unverified calendar coverage. Local Tiingo series are split-adjusted reference closes, not an independent raw-OHLC or total-return truth source. None of the stale flags has a more recent eligible local reference candle.

## Independent class and corporate-action evidence

`us_marketstack_class_removal_crosscheck.json` corroborates **12** scoped class/venue removal contexts and provides **10 additional stale explanations**: AVB, BCARU, DRMAW, FBRX, LBRDA, LBRDK, LIDRW, MDV, MDV-P-A and TWO. The other two contexts concern undeclared-currency flags and do not excuse their price defects.

The join uses hashed official SEC documents: issuer CIK, exact trading symbol, security title and exchange within the **same iXBRL coverpage context**, followed by the exact matching Form 25 class and venue. Class A/C, preferred series, common stock, warrants and units remain distinct. TWO's preferred-only removal is explicitly rejected for its common stock; its common-stock notification is separately attributed. Form 25 does not prove cessation on other venues or a particular final trading date.

AIHS's August 26 SEC 8-K explicitly requests VAI in place of AIHS and states CUSIP 817225303 remains unchanged. The current official directory/SEC map corroborate VAI at the issuer/venue. Marketstack's old ISIN contains a different CUSIP component, 817225105, so this evidence is a corporate-action/mapping quarantine, not permission to redirect prices. An issuer's other tickers alone never prove a security alias.

Additional public-source context retains candidate issuer relationships without accepting them as canonical identity. UBS's named ETN removal context, for example, remains issuer/product review evidence where a complete independent target-symbol/class link is missing.

## Cache reuse, fresh request semantics and budget

The original 478 current-common candidate requests remain fully accounted for at their exact current MICs. Refining literal common-share classifications found 45 further candidate requests; BTX was removed from this diagnostic plan because its beneficial-interest fund/company role is unresolved. **44** retained candidates required **three** bounded current-MIC batches and **44 additional estimated Marketstack credits**. No raw quote or alias was automatically admitted.

Those responses were **not zero-row replies**:

| MIC | Requested symbols | Raw provider data entries | Identity-bearing objects |
| --- | ---: | ---: | ---: |
| XASE | 21 | 18 | 0 |
| XNAS | 15 | 14 | 0 |
| XNYS | 8 | 8 | 0 |

All **40** data entries are empty arrays, `[[], ...]`, without symbol, MIC or price fields. Their positions cannot be assigned to requested securities. The backwards-compatible `MISSING_LATEST` quality gate is augmented with `EMPTY_ARRAY_PLACEHOLDERS_WITHOUT_IDENTIFIERS` and `MALFORMED_IDENTITYLESS_BATCH_RESPONSE`, literal row counts and request fingerprints. It does not mean that 44 companies are absent from Marketstack. The refined inventory retains **44/44** exact-current-MIC observations, three unique batches and **zero remaining work**.

The US regulatory investigation made **108 public SEC HTTP attempts**, costing no Marketstack credits. This includes **62 unnecessary Form 425 archive reads** caused by an initial scratch collection filter matching “25” inside “425.” Those reads are honestly counted and excluded from removal classification; the replay generator accepts only exact `25`/`25-NSE` forms. All subsequent work reused stored bytes. The final global request ledger, including the separate three-credit adjustment probe, is maintained in `marketstack_scale_summary.json`; actual provider billing/balance is unverified.

## Deterministic private-evidence replay

The final aggregate is `/workspace/scratch/marketstack-scale-36912587006/probe-provenance.json`. Its 3,275 stored responses retain original per-response provenance: 335 seeds matched exactly to genuine original Action probes, 2,934 factual unique checkpoint intervals and six explicit fresh responses. Replay container IDs are not retrieval IDs. The snapshot ledger and raw responses remain private.

Preserve the following private inputs or relocate them together. These workspace paths identify evidence, not production dependencies:

- Original full-US observation artifact: `/workspace/scratch/marketstack-probe-5/us-latest.json`, accepted run 36858301835.
- Current SEC map: `/workspace/scratch/marketstack-us-current-sec-map.json`.
- Current NasdaqTrader directory: `/workspace/scratch/marketstack-us-nasdaq-symbol-directories.json`.
- Regulatory investigation directory: `/workspace/scratch/marketstack-us-quality-sec-final/`, including `evidence.json`, `cover-evidence.json`, `symbol-events-evidence.json` and the accession-named XML/HTML files.
- Previously retained SEC/listing crosschecks in `reports/marketstack/us_sec_current_symbol_evidence.json` and `us_current_listing_evidence.json`.

Use the existing private materializer to reconstruct source-run attribution as documented in `MARKETSTACK_SCALE_REPRODUCTION.md`. The public generators below make no requests. `VU_US_STAMP` is the maximum stored source timestamp for the snapshot, **2026-10-01T19:14:02.876Z**, not a freshly generated wall-clock time.

```bash
VU_US_PROBE=/private/evidence/probe-provenance.json
VU_US_ORIGINAL=/private/evidence/us-latest.json
VU_US_REGULATORY=/private/evidence/regulatory
VU_US_DIRECTORY=/private/evidence/nasdaq-symbol-directories.json
VU_US_SEC=/private/evidence/current-sec-map.json
VU_US_STAMP=2026-10-01T19:14:02.876Z

node scripts/market/summarize-marketstack-us-resolved-history.mjs \
  --probes="$VU_US_PROBE" --today=2026-10-01 --generated-at="$VU_US_STAMP"

node scripts/market/classify-marketstack-us-gaps.mjs \
  --probes="$VU_US_PROBE" --latest="$VU_US_ORIGINAL" --sec-map="$VU_US_SEC" \
  --sec-evidence=reports/marketstack/us_sec_current_symbol_evidence.json \
  --listing-evidence=reports/marketstack/us_current_listing_evidence.json \
  --resolved-history=reports/marketstack/us_marketstack_resolved_history_quality.json \
  --generated-at="$VU_US_STAMP"

node scripts/market/plan-marketstack-us-current-common.mjs \
  --probes="$VU_US_PROBE" --request-plan=/private/evidence/remaining-original-common-plan.json \
  --generated-at="$VU_US_STAMP"

node scripts/market/summarize-marketstack-us-class-removals.mjs \
  --submissions="$VU_US_REGULATORY/evidence.json" \
  --covers="$VU_US_REGULATORY/cover-evidence.json" \
  --events="$VU_US_REGULATORY/symbol-events-evidence.json" \
  --documents-dir="$VU_US_REGULATORY" --directory="$VU_US_DIRECTORY" \
  --current-sec-map="$VU_US_SEC" --generated-at="$VU_US_STAMP"

node scripts/market/finalize-marketstack-us-quality.mjs \
  --latest="$VU_US_ORIGINAL" --probes="$VU_US_PROBE" \
  --removals=reports/marketstack/us_marketstack_class_removal_crosscheck.json \
  --original-latest-run-id=36858301835 --generated-at="$VU_US_STAMP"

node scripts/market/finalize-marketstack-us-consumer.mjs \
  --directory="$VU_US_DIRECTORY" --probes="$VU_US_PROBE" \
  --removals=reports/marketstack/us_marketstack_class_removal_crosscheck.json \
  --generated-at="$VU_US_STAMP"

node scripts/market/plan-marketstack-us-consumer-refined.mjs \
  --probes="$VU_US_PROBE" --request-plan=/private/evidence/remaining-refined-common-plan.json \
  --generated-at="$VU_US_STAMP"
```

SEC XML and cover/event HTML bytes are checked against manifest hashes before parsing. A newer current directory does not reproduce the October 1 census. Metadata summaries intentionally publish no raw Marketstack prices or volumes.

**Validation:** all **98** targeted US audit tests pass, with zero failures/skips. Two sequential offline replays produced **byte-identical outputs for all nine finalized US artifacts**; source hashes and market snapshot dates remained fixed. The protected baseline retained 7,803 records, 6,738 exact matches, 1,065 classified non-exact records, 19 accepted preferred-series identity resolutions and unchanged consumer counts. Full regression results and protected-artifact comparisons are maintained by the final engineering report.
