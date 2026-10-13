# Europe data integrity: all 449 securities

This document retains the offline baseline audit. The subsequent authenticated
revalidation ran successfully in [Actions run 38406637090](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38406637090):
8,828 requests and 8,828 conservatively reserved credits across all 449 securities.
Its licensed raw responses and per-security reports remain private. The later
run does not release prices, quarantined observations or analytical capabilities.
The historical NOT_CONFIGURED statement below describes the earlier offline
runtime, rather than the authenticated Actions follow-up.

Baseline: `af90e4b548585d45c527be1b2ffa583bd5dfa370`. The audit reconstructs existing authenticated evidence through RAW → NORMALIZED → QUARANTINE/ADMISSION → APPROVED CLOSE → private OHLC research candidates. It changes no display artifacts, prices, calendars, IDs, US/Tiingo data, analytical methods, product gates, Vorsorge or schedules. No analytical engine is invoked.

## Source scope and accounting

All 449 complete historical requests, 2,009 EOD pages and 1,688,229 original rows were checked. Offsets, count/total, exact symbol/MIC, requested 1900-01-01–2026-10-10 window, sorting and row/field preservation passed. The response's pagination completeness establishes the rows returned by that request; it does not certify economic-history completeness, history before the first observation, historical share-class identity or current provider-wide availability.

| Scope | Expected sessions | Approved Close | Delivered but excluded | Response-absent |
| --- | ---: | ---: | ---: | ---: |
| Earlier approved span | 1,626,347 | 1,579,639 | 31,210 | 15,498 |
| Entire returned historical span | 1,705,281 | 1,579,639 | 107,001 | 18,641 |

The expanded span adds 3,143 response-absent dates before historical admission. Their economic cause and historical identity remain unverified. Missing days before the first returned observation are not invented or classified as exchange-price failures. Every expected session is individually recorded in a private, hash-bound ledger; missing sessions remain absent from bar arrays.

The 108,590 original rows not present in the approved series reconcile exactly:

- 50,862 inherited immutable raw exclusions, with 93,556 original records verified. Full provider raw objects, price/listing tuples and original rule decisions match; no field revisions were found.
- 56,025 additional rows before safe suffixes in 33 securities. Unexplained close discontinuities caused those admission boundaries; valid prefix observations are not mislabeled invalid OHLC.
- 1,462 additional in-span non-session rows.
- 241 additional invalid Close observations: 151 zero and 90 missing/non-numeric. These explain all earlier UNKNOWN session omissions.

The earlier 30,969 missing-session quarantine subset has 18,098 identity-research holds, 12,345 invalid Close values and 526 positive-Close/OHLC review candidates. Those candidates are not certified false positives. The identity holds require historical issuer/share-class proof, so they are not labeled proven identity errors. Full inherited scope has 527 such candidates; none was released. The original 30,969 quarantined sessions remain held; the 241 separately explained invalid Close observations bring delivered exclusions in that same approved window to 31,210.

## Calendar and corporate-action evidence

Official FWB annual calendars 2011–2014 match the unchanged exact-MIC schedule. October 3, 2011–2013 was open: 675 absent security-sessions also lack observations in 1,138 original HTTP pages. These are provider-wire omissions, not calendar holidays or connector loss. Official 2015/2017/2018 calendars confirm 1,313 Xetra non-session raw rows, including all five 2G cases. Another 276 rows from other MICs remain supported only by library calendars; they are not certified provider mistakes.

All 449 stored split endpoint results are empty. Nine embedded factor rows and 5,846 dividend fields do not certify action coverage or adjustments. Of 47 strong raw Close discontinuities across 27 securities, 45 precede approved starts and two intersect immutable exclusions; none is safely explained. Approved series have none. Official E&Z reports confirm a 3:1 action in August 2025; they cannot explain the provider's May 2 price break. Dividends and splits never supply missing sessions.

## Analytical safety

The 1,579,639 approved Close values match raw Close exactly. Of them, 323 fail other OHLC checks. A separate private candidate series therefore has 1,579,316 actual OHLC-valid rows, preserving null/zero volume and source indices. No adjustment, interpolation, forward fill or guessed price is applied. Original source-window dates remain anchored when endpoint bars are excluded; missing sessions cannot disappear by shortening the audit window.

Raw-field semantics: MAX has 0 BASIS_CERTIFIED, 32 BASIS_PARTIAL and 417 BASIS_CONFLICTING securities. This includes unapproved raw rows and does not change Discover admission. Adjusted volume is absent everywhere. Complete adjusted O/H/L appears in 24,231 rows; 584 negative adjusted Close values occur in SB1.DE. All 449 analytical adjustment certifications remain UNKNOWN.

Technical Safe/Partial/Blocked: **0/0/449**. Backtest safe counts for 1Y/3Y/5Y/MAX: **0/0/0/0**. Each source-specific reason and required-session/indicator assessment is retained. All 449 trailing 200-observation windows span more than 200 scheduled sessions. Existing engines count observations and include benchmark/mark fallback behavior, so Europe must pass exact-session and independent identity/basis/OHLC/volume/action/benchmark/PIT/execution evidence gates before any engine use. This audit preserves those existing methods. OHLC and volume certificates bind the complete bar artifact and volume basis, so matching Close values alone cannot authenticate different OHLC/volume inputs. Split-adjusted prices require independently certified split-adjusted share volume. Quant fundamentals remain a separate SEC/ESEF/official-filings requirement.

2G Energy: 4,092 approved Close values and four display segments remain unchanged. Source-window counts: 1Y 208/254, 3Y 715/763, 5Y 1,211/1,275 and MAX 4,092/4,260 observations/sessions. All seven chart ranges and the existing UI are untouched. The separate analytical candidates also retain all 4,092 real 2G observations, while their missing-session and adjustment evidence still blocks engine admission. Rheinmetall, adesso, Allianz, SAP, Siemens, HelloFresh, ASML and LVMH use the same audit and admission rules; none receives a special release.

## Reproduction and private outputs

The nine requested JSON reports are produced in the explicitly selected private report directory. Original licensed RAW responses and all per-bar research candidates stay private; this directory publishes aggregate findings only. Every private artifact has SHA-256/byte bindings and directories/files use 0700/0600. Source overlap, symlink and hardlink writes are rejected.

Run `scripts/marketstack/europe-integrity-source-replay.mjs` with explicit `--root`, `--evidence`, `--calendarPath`, `--exclusionsPath`, `--qualitySourcesPath` and `--out`. The quality source descriptor must contain both original quality-file and manifest byte hashes. The runner reuses the existing Close evaluator verbatim and verifies source-input, approved point and segment hashes for all 449.

Then run `scripts/marketstack/europe-integrity-rebuild.mjs` with explicit `--root`, `--privateRoot`, `--evidence`, `--calendarPath`, `--exclusionsPath`, `--replayPath`, `--generatedAt` and `--out`. The private root contains the independent API, quarantine, action, field-semantics and official-calendar evidence. Output manifest binds all nine JSON reports and 898 private ledger/series artifacts. Inputs and code must be unchanged between deterministic repetitions. Two full final-code rebuilds of all 449 securities produced identical bytes for all 908 artifacts (nine reports, their manifest and 898 compressed ledgers/candidate series). Final artifact verification also independently reconciled every source-session category, candidate count, hash and private file mode.

New regressions cover source forgery, real dividends/splits versus missing sessions, invalid OHLC, immutable exclusions, missing volume, exact benchmark dates, source-window endpoints, split/price PIT, independent certificate bindings and private output protections. Independent baseline regression: 207 passed, 3 opt-in browser cases skipped. New audit tests: 49 passed. An independent final analytical review verified all 1,579,316 candidate bars, 1,796 window assessments, nine report hashes and the nine golden paths (35,834 actual raw-linked bars). Requested-window dates before the first source observation indicate short history; they are not claimed as proven economic/provider failures. Seven independent review areas are completed; current protected baseline is 6,126 US and 449 Europe securities.

Fresh authenticated targeted probes were not executed: the current runtime's Marketstack client reports NOT_CONFIGURED. Five earlier evidence runs were checked without recovering any of the earlier 15,498 response-absent dates. A controlled filtered/unfiltered probe plan estimates up to 13,112 credits before retries; it is not a refresh schedule and was not activated. This run incurred **0 new provider requests/credits**, recovered **0 unproven bars** and created **0 synthetic bars**.
