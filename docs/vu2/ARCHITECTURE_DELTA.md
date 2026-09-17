# Architecture delta and feature parity

| System | Decision | Current → target / migration |
|---|---|---|
| Tiingo adapter/store | KEEP + HARDEN | Working incremental path → durable daily continuation; scoped checkpoints, fail-closed reads, action reconciliation, dependency updates. No rebackfill schedule. |
| SEC/PIT | KEEP | Validated five + independent scaling PR → consume compatible validated snapshots only. |
| Metric engines | ADAPT | Divergent units/bases → versioned ownership registry then explicit compatibility adapters. |
| Query/VUQL | KEEP + HARDEN | Shared synthetic screen AST → same semantics over eligible real service rows; no separate recipe engine. |
| Product API | ADAPT | Synthetic and direct-file compositions → provider-neutral typed intelligence contract, source/rights guards. |
| Chart/Technical/Elliott | KEEP + MIGRATE | Existing complete engine/layers → meaning-first entry plus full workspace access. |
| Global shell | MIGRATE | Flat module list → Home/Markets/Discover/Research/Strategies/Portfolio, all old routes remain reachable. |
| Home/Markets | MIGRATE | Landing/dashboard → explicit market state, explanation, evidence and next action. Restricted data must be honest. |
| Discover/Leaders | ADAPT | Radar/rankings → transparent recipes, evidence and editable screener. No invented leader score. |
| Stock/Fundamentals/Quant | MIGRATE | Raw modules → company intelligence first, historical/professional depth retained. |
| Strategy/Backtests | KEEP + HARDEN | Existing builder/engine → structured reproducible rules, visible trust dimensions; no professional claim without universe/execution/PIT gates. |
| Watchlist/Portfolio | ADAPT | Existing watchlist and builder → exposure and change intelligence when data supports it. |
| AI | KEEP + HARDEN | Existing tools → explanations from validated contracts; no independent truth. |
| News | PRESERVE → IMPROVE | news/ + dashboard/news feed → Research + contextual stock/market links. |
| ETF | PRESERVE → IMPROVE | etf/ comparison → Research/ETFs, preserve supported cost/exposure/history features; source audit before new claims. |
| Macro | PRESERVE → IMPROVE | macro/ snapshots + calculation engine → Markets context and standalone research. |
| Hedge funds | PRESERVE → IMPROVE | hedgefonds/ + SEC 13F → Ownership deep dive; filing lag remains explicit. |
| Analyst ratings | PRESERVE → IMPROVE | analysten/ Finnhub/FMP snapshots → stock context and standalone deep dive. |
| Morning briefing | PRESERVE | morning/ + generated dated content → editorial access. |
| Weekly magazine | PRESERVE | magazin/ and historical issues → editorial access. |
| Stock reports | PRESERVE | reports/xpeng/ → Research reports, historical links preserved. |
| Academy/Guide/Budget | PRESERVE | Existing learning/tools → accessible secondary navigation; original Academy identity. |
| Storage/hosting | KEEP pending measurement | File store + Pages → no new database by preference. Full private persistence remains a deployment gap. |

No REMOVE or REPLACE approved. Parity above is a migration obligation, not proof of a finished redesign. Completion requires reachable routes plus actual desktop/mobile journey validation.
