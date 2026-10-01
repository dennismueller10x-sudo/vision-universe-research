# Provider routing

> This document records the accepted PR #330 baseline. Current scale measurements, expanded branch data and deferred provider decision are documented in [MARKETSTACK_SCALE_ENGINEERING_REPORT](MARKETSTACK_SCALE_ENGINEERING_REPORT.md). Production Tiingo/SEC/ESEF routing remains unchanged.

## Current source rules

| Data/domain | Authoritative production source | Marketstack role |
| --- | --- | --- |
| Existing US security universe and eligibility | Existing US security master | Complete catalog benchmark and identity diagnostics |
| Existing US EOD/history | Existing Tiingo pipeline | Candidate provider; isolated ingestion and comparison |
| Existing US live/intraday | Existing Tiingo runtime and workers | Empirical endpoint/session/freshness probes |
| Global company/security/listing identity | Accepted PR #324 architecture and verified evidence | Additional provider mappings; no ticker-only global identity |
| New international equity/ETF market data | Verified listings plus canonical working data | 58 real canonical listings with permission-scoped EOD close-chart delivery |
| US/foreign SEC-registrant fundamentals | Existing SEC EDGAR pipeline | Secondary access-path crosscheck only |
| European official fundamentals | Existing official filing/ESEF architecture | Market-data source only; does not bypass official filings |
| Company logos | Existing central logo pipeline | No separate provider logo system |

The current bounded import contains 46 equities and 12 ETFs, with 23,016
accepted candles and 1,394 quarantined observations. Public product delivery
contains scoped EOD close charts, not raw OHLC or certified strategy history.
All imported histories remain partial and newly imported equity issuers remain
unlinked. Full-US latest-price observations are diagnostic only: 6,278 valid
observations and 460 flags do not authorize a production-routing change.

No Marketstack import automatically changes US routing or removes Tiingo. There
is no per-product Marketstack fallback, hidden runtime API call or automatic
provider winner selection. A future provider decision must use the complete US
coverage benchmark, material price/action discrepancies, history, intraday
quality, request economics and rollback evidence.

## Canonical boundary

`quant/engines/provider.js` remains the shared provider-interface contract.
Market-data ingestion currently uses the existing Tiingo-compatible operation
seam; the Marketstack adapter does not claim complete Quant bulk-panel or
`MarketDataProvider` capability merely because daily bars can be normalized.
SEC and official filings continue implementing `FundamentalDataProvider`.

Provider symbols and payload shapes belong in ingestion adapters. Products
consume canonical identity, market data, metadata and coverage. Quant, Discover,
Screener, SuperTrader and Markets must not know Marketstack response fields or
make authenticated Marketstack requests.

The existing US product universe remains derived from
`quant/data/market/security-master/eligibility.json` via
`scripts/market/universe-source.mjs`. Its membership rule and established IDs
remain unchanged. Global listing/fund data is additive and uses explicit
listing/security IDs. Company fundamentals stay company-owned; ETF metadata
stays fund-owned. ETFs are not automatically admitted to equity fundamental
scores, CANSLIM or company rankings.

New equities currently marked `ISSUER_UNLINKED` retain null company identity,
company country/region and reporting currency. Listing country/region describe
the venue independently. Local listings therefore do not automatically inherit
an existing US ADR's issuer facts or valuations. The additive layer supports
shared Search/Charts/Watchlists without entering Discover equity recommendations,
Quant scores, Factor DNA or fundamental-dependent SuperTrader strategies.

## Deterministic identity and freshness

A provider mapping must specify the provider symbol, venue/MIC, original
trading currency and asset type. A ticker collision is resolved through the
listing ID or venue, never a global ticker-only key. Symbol punctuation
alternatives are review candidates until identity has been verified.

New local listings must not inherit US exchange sessions or holidays. Original
trading currency is preserved; reporting and display currency are separate.
Existing ADR ratio, share-basis and EPS-basis safeguards continue to gate
valuation. Discovery metadata or a liquid-looking ticker cannot establish an
ADR ratio or permit ordinary-share counts to multiply an ADR quote.

Coverage and freshness are separate:

- Coverage uses `FULL`, `PARTIAL`, `NONE` and `UNKNOWN` by capability.
- Price freshness supports `REALTIME`, `NEAR_REALTIME`, `DELAYED`, `INTRADAY`,
  `EOD_ONLY`, `UNAVAILABLE` and `UNKNOWN`.
- Retrieval time does not make an old market timestamp current.
- Marketstack intraday/snapshot delay stays unknown until venue-specific
  observations substantiate a stronger label.

## Rollback and future providers

Marketstack requests and unpublished histories can be stopped without deleting
Tiingo data, SEC facts, ESEF documents or existing production schedules. The
probe uses read-only GitHub permissions, and ingestion writes its selected
working store rather than the US production datasets. No Cloudflare Marketstack
secret or Tiingo runtime reconfiguration is needed for this architecture.

The new ingestion workflow supports manual dispatch and an opt-in weekday
schedule. Its 100-credit run cap and 5,000-credit monthly working-cache ledger
bound new ingestion separately from all existing jobs. Incremental mode starts
from stored history, or requests only a 14-day repair window on an empty cache.
It does not repeat a six-year initial backfill each day. These client-side
ceilings are distinct from the Professional account's 100,000-credit allowance.

Any later publication or routing switch should identify the exact listing
scope, validated datasets, freshness capability and rollback source. Retain
Tiingo until that decision is proven. A future EODHD adapter may reuse the
existing canonical boundary; EODHD is not integrated here.
