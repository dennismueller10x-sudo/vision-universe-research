# Europe Discover Admission 2.0 — final private integration

Baseline: `440a1645048d6b559988488f9a0f3148f21d3cdd` (current main fetched and independently reconstructed). Evaluation: `2026-10-10T07:40:26.728449+00:00`. No production data, public display gate, provider schedules, US population or strategy methodology changed.

## Admission and actual product result

The measured start was 261 Accepted / 2,907 Review / 2 Rejected. All 3,170 candidate query keys were reevaluated from original authenticated provider evidence and official identity sources. Final identity dispositions: **503 identity-ready, 2,022 Review, 645 excluded**. The original 2,907 Review cases split into 243 identity-ready, 2,021 still Review and 643 excluded. Identity acceptance grants no analytics publication.

**449 Discover-eligible securities representing 440 companies** have source-bound 1Y Close series and actual private Search, Detail, Chart and Watchlist proof. They comprise 260 retained securities and 189 newly admitted `DISCOVER_ONLY` securities. All 261 previous canonical IDs remain in the reference graph; IOS is retained but blocked after an explicit issuer conflict. Companies, share classes and listings remain separate.

| Capability | Germany | Europe total |
|---|---:|---:|
| Identity-ready companies | 330 | 494* |
| Identity-ready securities/listings | 338 | 503 |
| Discover companies | 311 | 440 |
| DISCOVER_ELIGIBLE | 319 | 449 |
| CHART_READY | 0 | 0 |
| CHART_LIMITED | 319 | 449 |
| CHART_BLOCKED among identity-ready securities | 19 | 54 |
| TECHNICAL_READY | 0 | 0 |
| TECHNICAL_PARTIAL | 153 | 259 |
| QUANT_READY | 0 | 0 |
| SUPERTRADER_READY | 0 | 0 |
| BACKTEST_READY | 0 | 0 |

*493 verified legal companies plus one security-scoped unresolved issuer group; these are not 494 fully certified financial reporting entities. The preserved blocked IOS reference adds one chart-blocked reference: full canonical graph 504 / Germany 339. All-candidate diagnostic chart counts are 451 LIMITED / 2,719 BLOCKED / 0 READY; two usable charts remain excluded by identity.

Every admitted chart ends 2026-10-08, one exchange trading session behind the completed 2026-10-09 session: **DELAYED**, not realtime. Minimum: 20 genuine positive closes over 30 days; ideal 200 observations over 330 days. Session lag 1 is disclosed, 2–3 remains LIMITED, >3 blocks. Current MIC-bound schedules, exact native currency/quote unit, unexpired proofs and absence of critical unresolved discontinuities are required. Quarantined dates remain excluded, gaps create separate SVG paths, no synthetic dates or estimated bars are inserted. Adjusted OHLC, volume, fundamentals and full analytics are not Discover gates. GBP/GBX uncertainty still blocks 24 XLON classes.

All prior accepted and review quarantines were reread: 56,152 protected listing-date entries, zero released and zero chart escapes. Raw versions are retained, including both versions of overlapping Eurofins metadata. New close-only latest observations cannot refresh older strict OHLC/volume/action certifications; their original strict evidence remains separately preserved.

## Index coverage

Membership is independently replayed exact-ISIN official evidence dated 2026-10-08. “Missing” means target members without a mapped source class; mapped source classes can still lack canonical issuer identity or chart eligibility. No nominal membership is invented where the roster is unverified.

| Index | Target | Mapped | Discover | Chart Ready | Chart Limited | Technical Ready | Quant Ready | Missing |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| DAX | 40 | 38 | 37 | 0 | 37 | 0 | 0 | 2 |
| MDAX | 50 | 45 | 43 | 0 | 43 | 0 | 0 | 5 |
| SDAX | 70 | 55 | 51 | 0 | 51 | 0 | 0 | 15 |
| TecDAX | 30 | 27 | 25 | 0 | 25 | 0 | 0 | 3 |
| EURO STOXX 50 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| CAC40 | 40 | 32 | 30 | 0 | 30 | 0 | 0 | 8 |
| AEX | 29 | 22 | 18 | 0 | 18 | 0 | 0 | 7 |
| SMI | 20 | 12 | 12 | 0 | 12 | 0 | 0 | 8 |
| FTSE100 | 100 | 24 | 0 | 0 | 0 | 0 | 0 | 76 |
| IBEX35 | 35 | 16 | 10 | 0 | 10 | 0 | 0 | 19 |
| FTSEMIB | 40 | 11 | 10 | 0 | 10 | 0 | 0 | 29 |
| ATX | 20 | 11 | 11 | 0 | 11 | 0 | 0 | 9 |
| Nordics | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

Nordic company coverage exists (17 Danish and two Swedish admitted classes), but no complete verified aggregate Nordic index roster. Finland and UK identity evidence alone does not grant chart admission. All index coverage files preserve unresolved source-class ISINs separately from actual canonical mapped IDs.

## Actual product and regression evidence

The canonical Core and actual Discover adapter independently replayed all 449 eligible classes: 449 real segmented RAW charts, 2,631 ticker/name/ISIN/alias queries without duplicate results, and 449 Add/Save/Reload/Remove cycles. Every blocked reference remains unavailable. The US watchlist storage sentinel was unchanged; zero US calls, provider UI calls or public series loads occurred.

The actual Screener adapter returns 449 base rows, country/exchange/index/native price/currency/chart filters, and null missing metrics. Existing separately bound technical projections provide drawdown for 259, SMA20 and volatility for five, SMA50 for four; other technical fields remain null. No scores, rank insertion or method recalculation occurs. Native currency remains explicit. A multi-segment Close series is never reused as an uninterrupted technical signal or sparkline.

Admitted company logos: 13 valid, 430 fallback, six suspect. Germany: four valid, 314 fallback, one suspect. The existing central registry, actual Core logo resolver and image hashes were replayed; no new asset acquisition or logo-based admission exclusion.

Actual Chromium mobile, WebKit desktop and WebKit iPhone emulation passed detail/chart/search/central logo/fallback, watchlist full reload/remove, keyboard, dark mode and accessibility. Fifteen actual Axe flows reported zero violations. The long legal-name containment defect found by actual mobile replay was fixed and rerun. Synthetic safety matrix: 19/19, zero skips. Discover critical asset budget remains 179,991 decoded JS+CSS bytes and seven requests (limits unchanged at 180,000/12).

Regression: Connector/ESEF 323 effective cases passed; Discover 354 passed / seven existing optional skips; Screener 40 passed / one existing optional artifact skip (actual 5,700-row US Screener replay separately verified); SuperTrader 241, Vorsorge 142, SEC 79, Market Data 84, Europe Quant adapter 11, currency/FX 77 all passed. Core 128/129 and full Quant 2,546/2,552 preserve one and six independently reproduced current-main baseline failures. They remain open; no green-CI or merge claim is made. All 64,162 protected data files and 4,637 protected existing method-source files retained their exact hashes. Twelve current source pins and all producer/consumer receipts were independently reviewed. Four adversarial report-binding tests passed.

Fundamentals remain SEC for actual SEC filers, ESEF, official filings and existing VU pipelines. The parallel official-filings follow-up covers 503 identities: 11 PARTIAL, 489 NONE, three require financial issuer mapping; FULL/Quant readiness zero. It retains 32 filing links and 80 genuine issuer facts. Marketstack fundamentals are OPTIONAL_SUPPLEMENT only and never automatically transferred into Quant. Discover does not depend on this follow-up.

## Cost, gates and merge order

This run used exactly two authenticated Marketstack requests and two conservatively reserved credits (Amplifon and Eurofins 1Y history). Actual invoiced credits and account remaining are UNKNOWN. No aggressive retry, recurring schedule or full-history bootstrap ran. The encrypted phase3 artifact, signature, immutable source commit, request journal and complete RAW bodies were independently authenticated.

Public licensed price display stays CLOSED pending concrete display/redistribution rights; commercial plan wording alone is insufficient. The product adapter defaults to public denial and requires explicit private research opt-in. Local browser servers and artifacts were private. All provider RAW and canonical data projections stay outside the repository and PRs.

Review/merge dependency order: Connector (#546), Eligibility/Core (#547), Evidence Foundation (#549), Identity/catalog/reclassification (#550), Discover/Search/Charts (#551), Screener (#552), separate Official-filings follow-up, Quant readiness (#553), SuperTrader readiness (#554), Integration/report proof (#556). The former empty metadata stage (#555) is superseded by ownership-correct source stages. Quant and SuperTrader PRs add readiness adapters only; engines, populations and methods remain unchanged. No merge is performed while current baseline checks fail.

## Private machine-readable outputs

All nine requested filenames are generated, original byte hashes and upstream graph bindings are recorded, and review clusters cover every original Review case. These files are not repository production data.

- `europe_discover_eligibility.json`: SHA256 `b79a296a0e3d1f50bc9f8f7a2dc71855ee4a6b9c1675ace50b2a094439238543`
- `europe_chart_eligibility.json`: SHA256 `7b98b39e2d2f5f032903d10baea6645f3b269f5d5def60caabacf66aa1e61c76`
- `europe_review_reclassification.json`: SHA256 `aa3d70be8b098c06e2643414b6504e0becd27cdc895b885d9d1385bedd88afa7`
- `europe_identity_status.json`: SHA256 `8fca36ccb477fc76b8a764c9febfb2413aae958cb7697badf5137cad376cf6d8`
- `europe_search_status.json`: SHA256 `beabe44f87c1e51299ef571fa264e203905c028c835f37905bc06b06480b5600`
- `europe_watchlist_status.json`: SHA256 `cabb19492cf26ddbd0df204bd09406ed704e7c84a81c7f193fa232d1de3657d9`
- `europe_logo_status.json`: SHA256 `be7cd48f6b88401edec72cb0c5ec8641c6bb5936ac2e4598eed930050677be4d`
- `europe_product_capabilities.json`: SHA256 `11b89d254b1c40ba984e3b9575b5282022aad630f84bf86420c79ae335908711`
- `europe_index_discover_coverage.json`: SHA256 `489c6b14bbc32a85e3dc48f933857006504bdccd0552d914075755c1713a98b5`

Final output manifest SHA256 `deb4968f2094bc2dcfb9f34135d1c7a6e74eb837505dbbc123624c8746df0a92`; report producer SHA256 `1cfda2dcf9f8fb1e9ff229295e2345e21097f8d566dc8d40a1bfadaf13971f3a`. Independent final receipts and actual browser/consumer evidence remain in the private workspace.
