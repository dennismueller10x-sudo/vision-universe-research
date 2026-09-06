# Vision Universe Market Data Worker

Server-side layer between Twelve Data and the static dashboard. It is the only
place the Twelve Data API key exists outside GitHub Actions secrets — the
browser only ever talks to this worker's public URL.

```
Twelve Data → this Cloudflare Worker → dashboard frontend → live chart
```

## Why a Cloudflare Worker

The dashboard is a static site (GitHub Pages, no build step, no server). Cloudflare
Workers were chosen because they need no separate hosting account beyond a free
Cloudflare account, support outbound WebSocket connections (needed to proxy Twelve
Data's `wss://` stream), and have a generous free tier — the simplest, cheapest
option that fits the existing all-static architecture without adding a database,
queue, or long-running server.

## Deploy

Requires a free Cloudflare account and [wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

```bash
cd workers/market-data-stream
npx wrangler login
npx wrangler secret put TWELVE_DATA_API_KEY   # paste the Twelve Data API key when prompted
npx wrangler deploy
```

`wrangler deploy` prints the worker's URL, e.g. `https://vu-market-data-stream.<your-subdomain>.workers.dev`.

## Wire it up to the dashboard

Put that URL into `dashboard/config/market-data.json`:

```json
{
  "schema_version": 1,
  "worker_base_url": "https://vu-market-data-stream.<your-subdomain>.workers.dev"
}
```

This file is public (committed to the repo) — it holds no secret, only the
worker's address. Commit and push; the live chart on `/dashboard/charting/`
picks it up on the next page load.

## Endpoints

- `GET /health` — liveness check.
- `GET /history?symbol=NVDA&interval=1min&outputsize=390` — proxies Twelve Data
  `time_series`, returns normalized `HistoricalBar[]`.
- `GET /quote?symbol=NVDA` — proxies Twelve Data `quote` (includes `is_market_open`,
  used to detect market-closed state and to poll as a websocket fallback).
- `GET /stream?symbol=NVDA` (`Upgrade: websocket`) — proxies exactly one client
  connection to one upstream Twelve Data websocket connection, subscribes to the
  symbol, forwards `price` events, and sends a `heartbeat` upstream every 10s.
  Closes with a 4xxx code (see `src/index.js`) when the upstream refuses the
  websocket (plan/auth) or rejects the subscription, so the frontend knows to
  fall back to REST polling instead of retrying forever.

## Secrets

| Secret | Where | Purpose |
| --- | --- | --- |
| `TWELVE_DATA_API_KEY` | Cloudflare Worker secret (`wrangler secret put`) | Same key already used by `scripts/dashboard/fetch_market_data.py` / GitHub Actions. Set it independently here — this does not read or change the GitHub Actions secret. |

Optional environment variable (`wrangler.toml` `[vars]` or `wrangler secret put`
if you'd rather not commit it): `ALLOWED_ORIGINS`, comma-separated list of
origins allowed to call the worker. Defaults to
`https://research.visionuniverse.de`; `localhost`/`127.0.0.1` origins are
always allowed for local development.

## Plan limits observed

Twelve Data's websocket is documented as a Pro-plan feature, but every plan
(including the free Basic plan) ships 8 trial websocket credits, one
connection and up to 8 subscribed symbols — enough to stream one actively
viewed chart. If the account's websocket access is exhausted or unavailable,
the worker's `/stream` endpoint closes with a 4xxx code and the frontend
provider (`dashboard/services/market-data/TwelveDataProvider.js`) automatically
falls back to REST polling of `/quote` every 30 seconds — the dashboard never
crashes, it just shows `DELAYED` instead of `LIVE`.
