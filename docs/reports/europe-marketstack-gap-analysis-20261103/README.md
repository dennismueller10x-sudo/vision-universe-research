# Europe history: unexploited Marketstack routes and gap clusters

Baseline: the Europe449 integrity audit (PR #644) and the authenticated live revalidation (PR #658). This analysis made **0 provider requests** and changes no price, session, quarantine, identity, calendar, analytical gate or display artifact. No session is recovered and no bar is created.

## 1. What the provider documents (v2 OpenAPI, SHA-256 `9136449e…ab4c8`)

The exact sentences are bound in `providers/marketstack/endpoint-coverage.json`.

| Route | Europe in documentation | Used by the audit | Consequence |
| --- | --- | --- | --- |
| `/splits`, `/dividends` | **No.** "Data covers symbols listed on NASDAQ, NYSE, NYSE ARCA, PINK, SHG, OTCQB, and BATS." | 449 + 40 + 98 requests, all empty | The empty responses carry no information. More requests on this route cannot explain the 47 breaks. |
| `/tickers/{symbol}/splits`, `/dividends` | silent (cross-referenced from `/splits`) | never | 2 test requests (EUZ.DE official 3:1 in August 2025, AI.PA October 2019) settle it. |
| `/eod` `split_factor`, `dividend`, `adj_*` | fields exist, CRSP method | fully replayed | 9 embedded factors, 5,846 dividend fields, 417 BASIS_CONFLICTING. Already exploited. |
| `/eod/{date}`, `/exchanges/{mic}/eod/{date}`, `/tickers/{symbol}/eod/{date}` | silent | **never** (only ranged `/eod`, in three variants) | The only untried price routes for the 18,641 absent sessions. |
| `/tickers/{symbol}`, `/tickerinfo` | ISIN, CUSIP, LEI, CIK, `ipo_date`, `previous_names` (company names) | 449 + 449 | Current metadata only. No FIGI, no symbol history, no ISIN history, no listing intervals in the schema. |
| `/intraday` | **No.** IEX/US only | — | No European closing auctions. |
| `/stockprice` | Professional plan and above | probed | Current price only, no history. |

The plan in the repository is Professional (100,000 requests a month, `scripts/marketstack/europe-credits.mjs`, user-stated, not verified). The client books 1 credit per symbol per page as a conservative estimate. Actual billing is not documented and remains UNKNOWN.

## 2. Problem classes before and after

| Class | Before | After | Effect |
| --- | ---: | ---: | --- |
| Strong price breaks | 47 unexplained | 47 unexplained, all `providerActionRoute: NONE_DOCUMENTED_FOR_VENUE` (expected on replay of the 98 empty action responses) | The required evidence is named: an official issuer or exchange document. Repeating the request is pointless. |
| Historical identity holds | 18,098 | 18,098 | Release needs OFFICIAL_EXCHANGE/ISSUER/REGISTER evidence (`europe-live-quarantine-review.mjs`). No Marketstack field supplies historical identity. |
| Provider-absent sessions (inherited public scope) | 15,498 `PROVIDER_MISSING_DAY` | 11,463 market-wide / 2,308 partial-market / 1,617 security-specific / 110 small-MIC | See section 3. |
| Quarantine | 30,969 | 30,969 | Unchanged. |

The public continuity ledger covers 15,498 of the 18,641 absent sessions. The other 3,143 are in the private expanded-span ledger, which has the same shape, so the same command applies to it.

## 3. Gap date clusters

`scripts/marketstack/europe-gap-date-clusters.mjs` classifies each provider-absent session by the share of that MIC's securities (within their returned raw span) that are absent on the same date:

- **MARKET_WIDE** (≥ 90 %, at least 5 eligible): 11,463 sessions, 420 MIC-dates, 85 distinct dates, 74 % of all absent sessions. 7,947 of them fall on dates where at least three national markets are absent together, for example 2023-06-13 and the contiguous 2025-05-09 to 2025-08-28 block on XBRU, XCSE, XMAD, XMIL, XSWX and XWBO. 7,925 sessions are on MIC-dates where at least one eligible security did deliver, so the provider demonstrably holds the session.
- **calendarRecheck**: 305 MIC-dates (3,538 sessions) on which every eligible security is absent. These stay indistinguishable from an unrecorded closure until an official calendar is checked. 19 of them (221 sessions) are single-market dates. This analysis does not change any calendar.

Cluster structure does not establish a cause. It shows where one request can test a whole date for many securities at once.

## 4. Test plan (≤ 50 requests, not executed)

`europe_gap_route_probe_plan.json`: **45 single-symbol requests / 45 conservatively reserved credits.**

- 3 action-route checks: US positive control `/splits` AAPL (4:1 on 2020-08-31), and `/tickers/EUZ.DE/splits` and `/tickers/AI.PA/splits` at dates with known official actions.
- 7 market-wide clusters, one per MIC: XETR 2026-09-17 (316/319), XPAR 2015-12-31, XAMS/XCSE/XWBO 2023-06-13, XSWX 2023-06-29, XMIL 2023-06-27. Each untried date route is tested for the absent date and for the symbol's last observed date. That second request is the positive route control: it must return the already approved raw bar unchanged.
- Decision rule: a cluster counts as recoverable only if the target row has the exact symbol, MIC and date **and** the control equals the approved raw bar. An empty target is never absence proof. Admission still runs through the unchanged quality, identity and calendar gates.

If confirmed, the follow-up covers 420 MIC-dates, batched at 100 symbols per request: **459 requests; 11,463 conservatively reserved credits** (459 if billed per request). The expanded private scope can add a little to this.

## Reproduction

```bash
node scripts/marketstack/europe-gap-date-clusters.mjs \
  --gaps=docs/reports/europe-continuity-449-20261012/europe_449_gap_classification.json \
  --inventory=docs/reports/europe-continuity-449-20261012/europe_449_gap_inventory.json \
  --out=/absolute/private/dir
```

Output is deterministic and bound to the SHA-256 of its inputs. The full per-cluster file (about 0.8 MB) is not committed.
