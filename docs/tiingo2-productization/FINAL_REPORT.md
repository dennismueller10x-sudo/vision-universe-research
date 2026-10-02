# Verified Tiingo 2.0 productization result

Canonical/public product data is materialized in review PR #353, stacked on accepted PR #349. Production membership remains **6,419** until reviewed merge/deployment. No production storage writes occurred.

Verified workflow: [37036367074](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37036367074), source `029efa7cf8d30e98c72b540aef1f189e342465fe`. Exact publication manifest `3911665582ac1c44a60dd2d5636e8178612a7dffd7db9dd22d082f0baf447367`. Materialized review data: `663238b726a4a2e9264c97cba9e1ee82d7599bef`.

| Scope | Result |
|---|---|
| Accepted discovery baseline | 108,924 records / 106,557 tickers |
| Original 102 accepted | 102 canonical; 32 partial Quant; 11 technical-only; 59 Quant blocked; 0 full composite |
| Original 148 review | 11 additionally accepted; 128 remain review; 9 additionally rejected |
| Final proposal | 6,419 + 113 = **6,532**; 0 removals |
| All 113 Quant | 33 partial / 12 technical-only / 68 blocked / 0 full |
| Search / Watchlists | 113 / 113; exact canonical IDs persisted by the existing primary UI |
| Charts | 110; ACCV (2 sessions), ONEN (4), RZAI (2) have checked quotes and remain chart-unavailable |
| Discover / Screener | 93 / 70, through existing eligibility rules |
| SuperTrader / Markets | 25 / 70; no strategy or market-regime rule changes |
| SEC fundamentals | 23 full / 71 partial / 19 none; absent or empty PIT data is unavailable |
| New-title logos | 57 valid / 54 fallback / 2 suspect; suspect images use fallback |
| DNA | 1,371 actual bars; IDs preserved; fresh listing/SEC/PIT verified; 5 available factors; Search/Chart/Watchlist/Discover/Screener/SuperTrader/Markets ready; valid canonical logo |
| AMC / BIRD / AMWL | Historical false split checks corrected in #349; fresh action validation remains blocked; existing identities/capabilities/charts retained; SEC/PIT refreshed |
| QA | 270 focused + 57 master tests; 21 protected checks; 1,432 checks each in Chromium and WebKit across 117 titles; 88 legacy browser checks; 76 accessibility checks; 148 smoke checks; zero findings |

ADRX and RZAI retain their independently verified SEC company identities even though no periodic PIT facts exist yet. ASBH has no verified SEC issuer mapping and keeps an explicit unavailable company ID. No financial coverage is fabricated to fill identity gaps.

The existing full seven-factor Quant composite is globally disabled by the accepted methodology. Partial evidence is real canonical Factor DNA; missing factors stay typed unavailable. No full score or revision coverage was invented.

DNA's stale `UNCONFIRMED:LISTING_INACTIVE` product decision is corrected through the existing canonical eligibility function after listing, identity, price, corporate-action and SEC/PIT proof. The specific decision and eligibility fields change; IDs, URLs, company name and listing identity remain exact. This expected correction is explicitly bound to staged proof; other baseline instrument objects remain unchanged. Existing consumer membership already includes DNA, so this correction adds no member and removes none.

The weekday discovery → staging → canonical → prices/actions → SEC → factors → central assets → product projections → exact-byte QA → review-branch publication path ran end-to-end. Previously applied and empty increments are `NO_CHANGES`, with no historical rebuild or duplicate publication. Normal SEC/Quant/Discover/Screener/Master/browser CI and the existing Pages release build are checked on the final review branch; deployment remains guarded.

All eight unchanged resource budgets passed. Screener uses approximately 22.59 MB against 30.5 MB; Home below 1.82 MB and Stock below 5.7 MB. Limits were not raised. Release-only JSON compaction and visible artwork loading reduce delivery bytes while preserving parsed fields, nulls, identities and URLs.

Factor DNA population rises from 6,308 to 6,402, preserving every prior record. Population-dependent normalization, peers and ranks change explicitly; full numerical comparisons are in `results/tiingo2_product_shadow_qa.json` and the independent logical-diff report. Existing factor-score maximum deltas: quality 1.55, growth 1.31, momentum 1.58, value 6.64, profitability 2.34, revisions 0, risk 4.87 points. BIDWR gains one evidenced financial component through newly materialized BID sharing the same SEC issuer; share-count-dependent valuation remains unavailable. Other unscoped market-factor inputs and historical-price bytes are protected.

The verified transaction is committed only to the internal review branch. The encrypted publication package contains 113 private histories and rollback before-images. Before production deployment, merge ordering (#349 then #353), current baseline CAS, current history-store preflight/index CAS and additive-only storage writes must remain green. The encrypted artifact expires after 14 days and must be refreshed if stale. Canonical rollback retains additive histories for backtests. The external Vercel preview reports a deployment rate limit with retry after 24 hours; this remains an infrastructure blocker. No risky production publish was forced.

## Exact proposed additions

AAC, ACCL, ACCV, ADRX, AERO, AESP, AIBZ, AIRO, APAC, APC, APMC, ASBH, AXIN, AZUL, BACC, BID, BRBI, BRKH, CAE, CAI, CAPN, CART, CATL, CBAT, CCAQ, CHA, CLBK, CLMT, CNTB, CRAN, CRTO, CUB, DPC, EMIS, EROC, ETRA, FIG, FIGR, FJDI, FLY, FOIL, FTW, GLAS, GLXY, GOLD, GORO, GTES, HAWK, HLP, HOS, HOST, IGAC, IMSR, INR, ITG, JCAP, KTWO, LFAC, LGCY, LIME, LION, LSBK, MBGL, MOB, MOBI, MRX, MTAK, NP, NVA, NVRI, NWCL, OCLT, OIG, ONEN, OSPR, OTAI, PAAC, PAL, PASW, PNAQ, PNFP, Q, RBKB, RNA, RNAQ, ROC, RZAI, SAIL, SEG, SHOT, SIMA, SIND, SKHY, SMA, SNDK, SOLS, STRZ, SZZL, TACO, TDTH, TLAC, TMTS, TRLV, TTGT, TWLV, UROY, VIA, VII, VLTO, WLTH, WSTN, XIII, XPRO

Additional review acceptances: BRBI, CATL, EMIS, FTW, GLAS, GORO, HOST, KTWO, NVA, TRLV, WSTN.

The requested machine-readable reports are under `results/`; `tiingo2_final_report.json` groups final counts and product-specific blockers. `qa/final/` contains actual browser, WebKit, accessibility and resource evidence.
