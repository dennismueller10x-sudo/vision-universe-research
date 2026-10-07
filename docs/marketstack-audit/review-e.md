# Independent review E — realtime semantics

Scope: read-only review of `PR461/providers/marketstack/{adapter,client}.js` and official Marketstack v2 Swagger saved as `current-swagger.json`. No paid API requests, no reference mutations. Current main is reported by lead as containing no Marketstack connector; observations below concern the separate reference checkout, not current-main deployment.

## Evidence and conclusion

The official v2 docs distinguish three capabilities:

| Endpoint | Documented scope / semantics | Required evidence |
|---|---|---|
| `/v2/eod/latest` | Last available trading day, global ticker/exchange filters, adjusted daily OHLCV | Raw trading date, requested/returned ticker and MIC, publication schedule |
| `/v2/intraday`, `/v2/intraday/latest` | US tickers in IEX; derived realtime reference prices after the February 2025 IEX policy change | Source venue, timestamp, interval, `marketstack_last`, null trade/bid/ask fields; do not infer interval candles from session OHLC |
| `/v2/stockprice` | Worldwide stock snapshots; docs explicitly name NYSE, Nasdaq and LSE; required `ticker`, optional `exchange` MIC | Returned `ticker`, `exchange_code`, `currency`, `price`, `trade_last`, request retrieval time |

Professional's “Real-Time Updates” means intraday intervals below 15 minutes are entitled. It does not establish Europe intraday coverage. “Real-Time Stock Market Prices” refers to the separately documented stockprice endpoint and must be tested separately for European listings. The stockprice schema describes `price` as **last known price** and `trade_last` as **timestamp of the last known trade**; a successful response is not alone evidence of low latency.

The stockprice operation prose advertises bid/ask/volume but its schema exposes only exchange_code, exchange_name, country, ticker, price, currency, trade_last. This documentation discrepancy must be resolved with raw API responses. Do not mark absent bid/ask/volume as connector bugs without observing fields.

The reference adapter uses `/eod/latest`, `/intraday/latest`, `/stockprice` for EOD, INTRADAY, SNAPSHOT respectively (adapter.js:155). This routing is correct. It explicitly keeps non-EOD `delay_state: UNKNOWN` (adapter.js:173) and capability realtime null (adapter.js:108), which is justified pending measured evidence. It gates intraday candle use behind verified candle semantics (adapter.js:121–123), avoiding a known reference-price/session-OHLC error.

## Concrete implementation findings

1. **VU connector parameter omission:** `getQuote(..., {frequency:'INTRADAY', interval:'1min', extendedHours:true})` silently discards interval and after-hours options. The request at adapter.js:157 includes only symbols, limit and exchange. The documented latest endpoint supports `interval` and `after_hours`; historical bars correctly propagate these at adapter.js:128. Forward supported options and test request shape. This can change the observed freshness and exclude after-hours observations; it cannot explain European intraday absence.
2. **VU normalization loss / semantic ambiguity:** adapter.js:172 assigns both market_timestamp and provider_timestamp to the same row date or trade_last. For stockprice the docs define trade_last solely as last-known-trade time. There is no documented provider update timestamp in StockPriceItem. Preserve the raw trade timestamp separately; leave provider-update time unknown unless a real update field exists. A retrieved_at value is local ingestion time and is not a provider market update.
3. **VU normalization loss:** getQuote at adapter.js:169–173 retains normalized price, OHLC, volume and timestamp but discards snapshot `exchange_name`, `country`, exact returned `ticker` and raw exchange_code. For intraday it retains `referencePrice` but discards `last`, `last_size`, `bid_price`, `bid_size`, `ask_price`, `ask_size`, `mid` if present. Preserve provider fields/raw row separately. Exact identity rejection is appropriate; data must not be silently promoted into a verified canonical listing.
4. **No proof of multi-day client cache bug:** client.js:25 defaults to 300,000 ms; request key includes full endpoint/parameters (client.js:123–126). getQuote does not expose a bypass or endpoint TTL option, so timing probes must use the underlying client with cache disabled or explicit TTL zero. A five-minute cache can blur a small latency test; it does not explain observations two calendar days behind unless a different persistent cache is involved.
5. **Potential identity mapping gap, not proven provider limitation:** identityProblem at adapter.js:58 and :64 demands literal requested symbol and accepted exchange codes. Snapshot responses may use a different raw ticker/venue code than EOD. This must be checked against real stockprice responses; preserve verified aliases by endpoint. Never solve by accepting arbitrary first matches.

## Classification requirements for live Europe probes

For SAP, Siemens, Allianz, Deutsche Telekom, ASML, LVMH and ABB collect exact raw identity, market/exchange, price/currency, trade_last or date, HTTP status/provider error, retrieved_at and cache status from each of the three endpoints. A stockprice response from a US ADR is not evidence for the European ordinary listing. A EUR quote with a stale trade_last is not proven realtime or delayed support.

Use REALTIME_SUPPORTED only with matching listing and measured current-session timestamp/delay evidence; DELAYED_SUPPORTED with documented or measured stable delay; EOD_ONLY when only genuine EOD retrieval works after all documented alternatives; ENDPOINT_NOT_ENTITLED for explicit access restriction; UNSUPPORTED only for fully tested exact/qualified/discovered identities; otherwise UNCLEAR.

Historical claims that “IEX is US-only, therefore Marketstack realtime is US-only” need correction. No live capability classification is asserted by this independent reviewer.
