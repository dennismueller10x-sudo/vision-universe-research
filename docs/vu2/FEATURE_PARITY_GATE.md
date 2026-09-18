# VU2 preservation gate — continued migration

Baseline/main:533245e8bb1b805c24c1ce9ba2051345ad215e24. Compared to PR76 tree6bd25cf18a1547ce68c3aa24021d822fc8e1f311. This is a migration parity checkpoint, not a new architecture audit or a claim that every legacy module has been redesigned.

| Required module | Status | Direct access / evidence |
|---|---|---|
| NEWS | PRESERVED | Research → /news/; module tree unchanged a7e792602cfea57678c7e198fe5b4bb119ca8230 |
| ETF | PRESERVED | Research → /etf/; module tree unchanged8560e3e36abc51311078c688f61a99b551b52f0b |
| MACRO | PRESERVED | Research → /macro/; module tree unchanged e15b75946b8c2210e4cffd00ad20ed61623f0d89 |
| HEDGE FUNDS | PRESERVED | Research → /hedgefonds/; module tree unchanged8c66dc3800dcdde55d1de4ae5ac2bbc9c786e0b9 |
| ANALYST RATINGS | PRESERVED | Research → /analysten/; module tree unchanged3b1d50c6eed0185a16089fa4ad138d18e2f96855 |
| MORNING BRIEFING | PRESERVED | Home/Research → /morning/; module tree unchanged1206e60e8f932f4f1f7bd58472f017c87e1e0f94 |
| WEEKLY MAGAZINE | PRESERVED | Home/Research → /magazin/; module tree unchanged633d2b4c9cc6b7e62195f8f20c43d3c9ada03fd0 |
| STOCK REPORTS | PRESERVED | Research → /reports/xpeng/; reports tree unchanged cd44ae61ed8f042529fe9f844288dc0b243a3b64 |
| ACADEMY / GUIDE | PRESERVED | Research → /academy/, /guide/; both module trees unchanged |
| Stocks / Full Chart | PRESERVED + additive experience | Original quant/stock tree unchanged0f0a02d66878da6296ab61200d13ba13ce76f727; direct Full Chart action retained |
| Technical / Elliott | MIGRATED + preserved depth | PR68 full counts, scenarios, targets/invalidation; original chart engine and legacy route exercised in every browser gate |
| Fundamentals / History | IMPROVED | PR66 annual/quarterly/TTM states and source timestamps; SEC-owned files untouched; unsupported TTM/quarter semantics explicitly gated |
| Quant | IMPROVED | PR69/73 existing18 factor values and definitions; no five-security ranking |
| Screener / Rankings | PRESERVED + additive experience | Existing module trees unchanged; Research has professional routes; PR67 canonical combined rules |
| Compare | ADDITIVE / PARTIAL | Current VU2 comparison has six shared metrics/two securities; full multi-security depth remains an open improvement |
| Strategy / Backtests | PRESERVED + guarded migration | Original module trees unchanged; PR70 versioned definition; real backtests remain gated. Stock action now enters guarded VU2 definition |
| Portfolio / Watchlist | ADDITIVE | PR71/74 personal data, no demo seed/import; old Watchlist tree/store unchanged |
| Ask Atlas | ADDITIVE / PARTIAL | PR76 guided evidence; original AI tree unchanged dd93f27e4b7bbf89da8385702ee50c471da9d420; free model integration pending |

Original Atlas and logo blobs unchanged: d51ec1eb767db0cd7f972bc1d1b7ff54bb76e8b8 and1d93eeba1eed9a8cf6ad1048436b643f76586076. Legacy quant/api/client.js unchanged56c8543d2742435f00e948fd10ded1e3690fed92.

Evidence scope: module-owned files and route preservation. Shared chart/style changes have their separate regression/browser gates; unchanged module hashes alone do not certify every interaction or external source availability. Existing Browser QA checks Research directory HTTP200; this phase adds explicit required-route assertions and a connected Home/search/stock/full-chart/technical/Elliott/history/Quant/strategy journey at1440/390. Performance measurements describe the Actions static server, not production latency.
