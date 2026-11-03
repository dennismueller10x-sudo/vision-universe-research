# Marketstack diagnostics run, 03.11.2026 (owner-approved, one run)

[Run 41661792038](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/41661792038). Workflow `marketstack-diagnostics-once.yml` from #1287, commit `88c72f19`. **77 requests** against a hard limit of 90:

| Section | Limit | Sent |
| --- | ---: | ---: |
| a) Paris | 40 | 32 |
| b) Routes (#1285 plan) | 45 | 45 |
| c) Reserve | 5 | 0 |

There were no retries and no follow-up run. HTTP statuses: 50 × 200, 16 × 406, 11 × 422.

Raw responses are sealed (AES-256-GCM + RSA-OAEP, audit recipient key) in the artifact `marketstack-diagnostics-sealed-41661792038` (envelope SHA-256 `d206c71b…48e5`, kept until 2026-12-03). `marketstack_diagnostics_public_summary.json` (SHA-256 `06d58b29…41e3`) contains statuses, headers, hashes and counts only. It holds no prices. No production data, calendar, quarantine, identity or gate was changed. Nothing was interpolated and no analysis was released.

## Credits (observed, not estimated)

The response headers `x-increment-usage`, `x-quota-limit` (100,000) and `x-quota-remaining` show the following:

- **Billing is per symbol.** The request with `symbols=BN.PA,OR.PA,SAN.PA` was booked at 3. Every single-symbol request was booked at 1.
- **Errors cost credits.** Each 406 and 422 response was booked at 1.
- **Directory pages cost 1.** One `/exchanges/XPAR/tickers` page with 1,000 rows was booked at 1.
- **Usage for this run:** 79 credits. The quota fell from 99,089 before the run to 99,010 after it; the header shows the balance before the current request is booked.
- **Rate limit:** 5 requests per second.
- No usage endpoint exists in the v2 OpenAPI, so none was called.

## b) Single-date routes and splits

| Route | Control (last observed day) | Target (gap date) |
| --- | --- | --- |
| `/eod/{date}?symbols&exchange` | 6/6 rows, close identical to the stored close | 6/6 empty (200, 0 rows) |
| `/exchanges/{mic}/eod/{date}` | 6/6 rows, close identical | 6/6 HTTP 422 `no_valid_exchange_provided` |
| `/tickers/{symbol}/eod/{date}` | 6/6 rows, close identical | 6/6 empty `{}` |

These counts cover XETR, XAMS, XSWX, XMIL, XCSE and XWBO. The XPAR cluster could not be tested: AC.PA answers 422 or 406 on every route (see a).

- **Actually recovered missing prices: 0.**
- **Data still missing:** all 6 tested MIC-dates on all 3 routes.
- **Calendar deviations:** all 7 target dates are sessions under the rule calendar (`core/europe-exchange-calendar.js`, read only). The exchange route answers 422 only on the gap date and works on the control day, which means the provider has no exchange day for that date. XCSE and XWBO 2023-06-13 also carry `calendarRecheck` (every eligible security is absent). This needs an official closure check.
- **Identity problems:** AMP.MI and ANDR.VI are `identity.status = BLOCKED` in the catalog. Their controls still match.
- **Corporate actions:** `/splits` AAPL returns the 2020-08-31 event (positive control). `/tickers/EUZ.DE/splits` returns 200 with 0 rows, although the official 3:1 split was in August 2025. `/tickers/AI.PA/splits` returns 406 because of the symbol problem. **Unresolved: 47 of 47 breaks**, unchanged. Neither split route covers European venues verifiably.
- **OHLC:** the public store holds closes only. OHLC against the #658 archive needs the owner key, and those archives had 7-day retention.
- **Extrapolation:** 0 of 6 clusters recovered, and the exchange route shows the cause on the provider side. Expected recoverable through these routes: about 0 of 11,463 market-wide sessions. Uncertainty: one symbol per cluster, 6 of 10 MICs, and XPAR untested. By the rule of three, the upper 95 % bound is ≤ 39 % of clusters. The 459-request follow-up from #1285 is not recommended. It would also cost about 11,463 credits, not 459, because billing is per symbol.

## a) Paris (13 symbols)

- The 422 `no_valid_symbols_provided` on `/eod?symbols=AC.PA&exchange=XPAR` reproduces.
- **Positive control** with BN, OR and SAN.PA in one request: 3 × 26 rows. All 3 × 10 overlap days are identical to the stored closes, and 16 newer sessions up to 2026-11-02 are present. The route and the account work.
- **`/tickers/{X}.PA` returns HTTP 406 `the_requested_data_is_not_available` for 13/13.** The provider no longer serves the old symbol on any route. This is not an outage of the `/eod` filter.
- XPAR directory: 2 of 5 pages read, 2,000 of 4,607 rows. For 13/13 it contains a **`{X}.XPAR`** symbol (e.g. AC.XPAR, MC.XPAR) with the same name. `/tickers/{X}.XPAR` answers 200 (844–897 bytes).
- **Mapping not proven.** The collector did not unpack the flat v2 `TickerResponse`, which is a collector bug, not a provider answer. It therefore checked neither ISIN nor MIC and requested no overlap closes. The answers are in the sealed archive.
- Result: **13/13 `CANDIDATES_NOT_PROVEN`**, with a strong indication of a provider symbol change from `.PA` to `.XPAR`. Nothing was entered into the producer path.

## Recommendation

1. **Owner, offline, 0 requests:** unseal the archive and read ISIN and `stock_exchange.mic` from the 13 `/tickers/{X}.XPAR` answers.
2. **If all 13 match** (ISIN and XPAR): run one `/eod?symbols=<13 × .XPAR>&exchange=XPAR&date_from=2026-09-28&date_to=2026-11-02` request (13 credits). Count the mapping as proven only if the closes are identical on the 10 overlap days. Then hand it over to the Discover-refresh owner as an evidenced alias. Repeat the XPAR route check with AC.XPAR (≤ 3 credits).
3. **Gap sessions:** stop the date-route follow-up. The cause is a missing provider exchange day. Next steps are an official exchange or closure check for the 85 dates and a second source for real sessions. Do not interpolate.

## Conclusion (documentation and analysis close-out)

This run closes the Marketstack gap analysis from #1285. The negative findings are the result and stay recorded here:

- **0 recovered prices.** No missing session was filled, interpolated or released from quarantine.
- **Single-date routes deliver nothing on gap days.** `/eod/{date}` and `/tickers/{symbol}/eod/{date}` return empty answers. `/exchanges/{mic}/eod/{date}` returns HTTP 422 `no_valid_exchange_provided` on the gap date, while every control day returns the stored close unchanged.
- **`/splits` has no Europe coverage.** `/tickers/EUZ.DE/splits` returns 0 rows despite the official 3:1 split in August 2025. The 47 unexplained breaks need an official issuer or exchange document.
- **Billing is per symbol** (`x-increment-usage`), and every error response (406, 422) also costs 1 credit.
- **The 11,463-credit follow-up run is NOT approved.** The 459-request plan in `../europe-marketstack-gap-analysis-20261103/` stays unexecuted.
- **Paris:** a provider symbol change from `.PA` to `.XPAR` is suspected but not yet proven (ISIN, MIC and overlap closes are unchecked). It is being checked separately, and nothing enters the producer path before that proof exists.

No gate, test, calendar, identity, quarantine or generated artifact was changed by this report.
