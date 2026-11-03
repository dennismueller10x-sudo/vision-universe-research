# Marketstack support request (ready to send)

**Subject:** v2 EOD: missing historical sessions on European exchanges, Paris symbols `.PA` returning 406/422, and billing of error responses

Hello Marketstack team,

We use the Marketstack v2 API for end-of-day histories of 449 European equities and have found systematic gaps. We have done our own analysis and need your confirmation on the points below. Request examples use `access_key=<REDACTED>`. Each example lists the `x-apilayer-transaction-id` so you can find it in your logs.

## Account context (no secrets)

- API v2, `https://api.marketstack.com/v2`, key sent as the `access_key` query parameter. Plan: Professional. Response headers show `x-quota-limit: 100000` and `x-ratelimit-limit-second: 5`.
- Endpoints in use: `GET /v2/eod` with `symbols` (one symbol per request), `exchange=<MIC>`, `date_from`, `date_to`, `sort=ASC`, `limit=1000`, `offset` pagination; plus `/v2/tickers/{symbol}` and `/v2/exchanges/{mic}/tickers`.
- Universe: 449 primary listings on XETR (319), XPAR (39), XAMS (20), XCSE (17), XSWX (14), XWBO (12), XMAD (10), XMIL (10), XBRU (6), XSTO (2).

## What we observe

1. **Missing sessions inside otherwise complete histories.** We checked offsets, counts, totals, sorting, and exact symbol/MIC on every page. The histories still lack 15,498 regular trading sessions, plus 23 since 10 Oct 2026, and the gaps reproduce in three query variants: exact symbol+MIC, a wider date window, and no `exchange` filter. 11,463 of them fall on 420 exchange-dates where at least 90 % of the listings on that exchange are missing at once. On 7,925 of these sessions, other listings on the same exchange did return a bar for the same date, so the session exists in your data.
   - Dates missing on (almost) every European exchange: **2023-06-13, 2023-06-27, 2023-06-29, 2023-07-11, 2023-07-31, 2023-08-03, 2023-08-10, 2024-06-11, 2026-01-06, 2026-09-07, 2026-09-17** (371–442 of 449 listings each).
   - A contiguous block from **2025-05-09 to 2025-08-28** (35–39 sessions per exchange) on XAMS, XBRU, XCSE, XMAD, XMIL, XPAR, XSWX and XWBO.
   - XETR: 2023-04-11, 2023-05-08, 2023-05-23, 2023-05-30, 2023-06-01, 2023-06-12, 2023-06-28, 2023-08-07, 2024-01-04, as well as 2011-10-03, 2012-10-03 and 2013-10-03 (Xetra was officially open on those three dates).
   - XPAR additionally: 2010-12-24, 2010-12-31, 2012-12-24, 2012-12-31, 2015-12-31 (half-day sessions).
2. **Paris symbol change.** For 13 of our 39 Paris listings (AC, AI, AIR, CDI, CS, DG, EL, ERF, MC, SOI, SU, TEP, VIE), `.PA` stopped working after 9 Oct 2026. `/v2/tickers/{X}.PA` returns **HTTP 406**, while `/v2/exchanges/XPAR/tickers` now lists `{X}.XPAR`, and `/v2/tickers/{X}.XPAR` returns 200. The other 26 `.PA` symbols (e.g. BN.PA, OR.PA, SAN.PA) still work.
3. **Single-date routes return nothing on gap dates.** `/v2/eod/{date}` and `/v2/tickers/{symbol}/eod/{date}` return empty results. `/v2/exchanges/{mic}/eod/{date}` returns **HTTP 422 `no_valid_exchange_provided`**. On the preceding trading day, all three routes return the expected bar.
4. **Corporate actions.** `/v2/tickers/EUZ.DE/splits` for August 2025 returns 0 rows, although Eckert & Ziegler carried out an official 3:1 split that month. The OpenAPI lists `/splits` and `/dividends` coverage for US venues and SHG only.

## Reproducible examples (sent 2026-11-03, UTC)

| # | Request | HTTP / response | Credits (`x-increment-usage`) | transaction id |
| - | --- | --- | ---: | --- |
| 1 | `GET /v2/eod?symbols=AC.PA&exchange=XPAR&date_from=2026-09-28&date_to=2026-11-02&limit=100&access_key=<REDACTED>` | 422 `no_valid_symbols_provided` | 1 | `7533d3a8-4d44-41bd-a324-5081b7f72ff3` |
| 2 | `GET /v2/eod?symbols=BN.PA,OR.PA,SAN.PA&exchange=XPAR&date_from=2026-09-28&date_to=2026-11-02&limit=100&access_key=<REDACTED>` (control) | 200, 78 rows (3 × 26), pagination total 78 | 3 | `a02f953b-a4c2-449e-8a09-6ac96b1032c3` |
| 3 | `GET /v2/tickers/MC.PA?access_key=<REDACTED>` vs `GET /v2/tickers/MC.XPAR?access_key=<REDACTED>` | 406 `the_requested_data_is_not_available` vs 200 (897 bytes) | 1 + 1 | `949f41d6-02cc-491a-8df7-ca7c0399ff00` / `f3bcbcf0-ce4c-4676-a692-0d67602ec938` |
| 4 | `GET /v2/eod/2026-09-17?symbols=1U1.DE&exchange=XETR&access_key=<REDACTED>` vs the same for `2026-09-16` | 200, 0 rows (total 0) vs 200, 1 row | 1 + 1 | `0ed65eb0-39f0-4b1a-8304-7ffda5387699` / `04e75cee-0b64-4aa9-bf15-4cb3cdac5d8f` |
| 5 | `GET /v2/exchanges/XETR/eod/2026-09-17?symbols=1U1.DE&access_key=<REDACTED>` vs the same for `2026-09-16` | 422 `no_valid_exchange_provided` vs 200, 1 row | 1 + 1 | `44fc685e-3238-421d-a66e-07c09d28737d` / `f9ad1fa3-4f2b-4ca7-99ff-3bef4267f368` |
| 6 | `GET /v2/tickers/1U1.DE/eod/2026-09-17?access_key=<REDACTED>` vs the same for `2026-09-16` | 200 `{}` vs 200, 1 bar | 1 + 1 | `c4f702ad-5400-405f-9325-064bc793c51d` / `0d71cb7d-95ca-488b-bc1b-ff08ac5f0349` |
| 7 | `GET /v2/exchanges/XAMS/eod/2023-06-13?symbols=AD.AS&access_key=<REDACTED>` and `GET /v2/eod/2023-06-13?symbols=AD.AS&exchange=XAMS&access_key=<REDACTED>` | 422 `no_valid_exchange_provided` and 200, 0 rows | 1 + 1 | `821c0f32-9b92-4f96-a5a8-2c4d05847f8d` / `f0e02f51-e945-4b35-994a-bc001c1af8f8` |
| 8 | `GET /v2/tickers/EUZ.DE/splits?date_from=2025-08-01&date_to=2025-08-31&access_key=<REDACTED>` | 200, 0 rows (total 0) | 1 | `a5acef7f-0d12-43fe-9d8a-4e7fcc004c81` |

The same ranged pattern, `GET /v2/eod?symbols=<X>&exchange=<MIC>&date_from=…&date_to=…&sort=ASC&limit=1000&offset=…`, returns complete pagination for every listing but leaves out the dates above.

## Questions

1. **Coverage of the dates above.** Do you hold EOD data for these European exchange-dates, in particular 2023-06-13, 2023-06-29, 2024-06-11, 2026-01-06, 2026-09-07, 2026-09-17 and the 2025-05-09 to 2025-08-28 block? If yes, can the history be backfilled, and when? If no, please confirm that the data is not available, so that we do not keep re-querying.
2. **Symbol migration `.PA` → `.XPAR`.** When did it happen, and which symbols does it cover (only some Paris listings, or other exchanges as well, e.g. `.DE` → `.XETRA`/`.XETR`, `.AS` → `.XAMS`)? Is the full history attached to the new symbol, back to the first listing date, and is there a mapping table (old symbol → new symbol, with ISIN and MIC)? Will the old symbols return 406 permanently?
3. **Meaning of HTTP 422 `no_valid_exchange_provided`** on `/v2/exchanges/{mic}/eod/{date}`. Does it mean "no data for this exchange on this date"? The documentation says a holiday returns no data, not an error. Also, HTTP 406 `the_requested_data_is_not_available` and the error types `no_valid_symbols_provided` and `no_valid_exchange_provided` are not in the OpenAPI. Please document them.
4. **European splits and dividends.** Do `/v2/splits`, `/v2/dividends` or `/v2/tickers/{symbol}/splits|dividends` cover any European exchange? If not, are the `split_factor`, `dividend` and `adj_*` fields in `/v2/eod` for European symbols based on a complete corporate-action history?
5. **Billing of error responses.** Every 406 and 422 response was charged 1 credit (`x-increment-usage: 1`). Is that intended? Are requests rejected because of your symbol migration refundable? Is billing per symbol per page for multi-page `/eod` histories? Request 2 cost 3 for 3 symbols on one page.
6. **Recommended query form for European histories.** Which symbol format, which `exchange` usage (MIC, required or optional) and which route (ranged `/eod`, or `/tickers/{symbol}/eod`) should we use for complete, gap-free European EOD histories? Is there a maximum number of symbols per request? Is there a status page or changelog that announces symbol migrations and data outages?

Thank you. We can provide further request ids on request.
