/**
 * Vision Universe market-data worker.
 *
 * The only server-side piece in this proof of concept. It holds the Twelve Data API
 * key as a Cloudflare secret (never shipped to the browser) and exposes three public,
 * key-free endpoints to the static dashboard:
 *
 *   GET  /health                                        - liveness check
 *   GET  /history?symbol=NVDA&interval=1min&outputsize=N - proxies Twelve Data time_series,
 *                                                           normalized to HistoricalBar[]
 *   GET  /quote?symbol=NVDA                              - proxies Twelve Data quote
 *                                                           (also carries is_market_open)
 *   GET  /stream?symbol=NVDA  (Upgrade: websocket)        - proxies one client <-> one
 *                                                           upstream Twelve Data websocket
 *
 * Twelve Data → this worker → dashboard frontend → live chart. The browser never talks
 * to Twelve Data directly and never sees TWELVE_DATA_API_KEY.
 */

const TD_REST_BASE = 'https://api.twelvedata.com';
const TD_WS_BASE = 'https://ws.twelvedata.com/v1/quotes/price';
const SYMBOL_RE = /^[A-Z0-9:./-]{1,20}$/;
const HEARTBEAT_INTERVAL_MS = 10_000;

// Close codes >= 4001 tell the frontend "don't keep retrying the websocket, fall
// back to REST polling" (see dashboard/services/market-data/TwelveDataProvider.js).
const CLOSE_UPSTREAM_UNAVAILABLE = 4001; // upstream refused the websocket upgrade (plan/auth)
const CLOSE_SUBSCRIBE_REJECTED = 4002;   // Twelve Data rejected the symbol subscription
const CLOSE_SERVER_MISCONFIGURED = 4003; // TWELVE_DATA_API_KEY missing

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://research.visionuniverse.de')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const isDev = /^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  const allow = allowed.includes(origin) || isDev ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function normalizeSymbol(raw) {
  const symbol = String(raw || '').trim().toUpperCase();
  return SYMBOL_RE.test(symbol) ? symbol : null;
}

async function handleHistory(url, env, headers) {
  const symbol = normalizeSymbol(url.searchParams.get('symbol'));
  if (!symbol) return json({ error: 'invalid symbol' }, 400, headers);
  const interval = url.searchParams.get('interval') || '1min';
  const outputsize = Math.min(5000, Math.max(1, Number(url.searchParams.get('outputsize')) || 390));
  if (!env.TWELVE_DATA_API_KEY) return json({ error: 'server not configured' }, 503, headers);

  const tdUrl = `${TD_REST_BASE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${outputsize}&apikey=${env.TWELVE_DATA_API_KEY}`;
  let payload;
  try {
    const res = await fetch(tdUrl);
    payload = await res.json();
  } catch {
    return json({ error: 'upstream request failed' }, 502, headers);
  }
  if (payload.status === 'error' || !Array.isArray(payload.values)) {
    return json({ error: payload.message || 'no time series available' }, 502, headers);
  }

  const bars = payload.values
    .map((v) => ({
      symbol,
      timestamp: Date.parse(v.datetime.length <= 10 ? `${v.datetime}T00:00:00Z` : `${v.datetime.replace(' ', 'T')}Z`),
      open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close),
      volume: Number(v.volume || 0),
    }))
    .filter((bar) => Number.isFinite(bar.timestamp) && Number.isFinite(bar.close) && bar.close > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  return json({ symbol, interval, bars, source: 'twelvedata', generated_at: new Date().toISOString() }, 200, headers);
}

async function handleQuote(url, env, headers) {
  const symbol = normalizeSymbol(url.searchParams.get('symbol'));
  if (!symbol) return json({ error: 'invalid symbol' }, 400, headers);
  if (!env.TWELVE_DATA_API_KEY) return json({ error: 'server not configured' }, 503, headers);

  const tdUrl = `${TD_REST_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${env.TWELVE_DATA_API_KEY}`;
  let payload;
  try {
    const res = await fetch(tdUrl);
    payload = await res.json();
  } catch {
    return json({ error: 'upstream request failed' }, 502, headers);
  }
  if (payload.status === 'error') {
    return json({ error: payload.message || 'quote unavailable' }, 502, headers);
  }

  return json({
    symbol: payload.symbol || symbol,
    price: Number(payload.close),
    close: Number(payload.close),
    previous_close: Number(payload.previous_close),
    percent_change: Number(payload.percent_change),
    is_market_open: payload.is_market_open === true,
    timestamp: Number(payload.timestamp) || Math.floor(Date.now() / 1000),
  }, 200, headers);
}

async function handleStream(request, url, env) {
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
    return new Response('Expected websocket', { status: 426 });
  }
  const symbol = normalizeSymbol(url.searchParams.get('symbol'));
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  if (!symbol) {
    server.close(1008, 'invalid-symbol');
    return new Response(null, { status: 101, webSocket: client });
  }
  if (!env.TWELVE_DATA_API_KEY) {
    server.close(CLOSE_SERVER_MISCONFIGURED, 'server-not-configured');
    return new Response(null, { status: 101, webSocket: client });
  }

  let upstream;
  try {
    const upstreamUrl = `${TD_WS_BASE}?apikey=${encodeURIComponent(env.TWELVE_DATA_API_KEY)}`;
    const upstreamResp = await fetch(upstreamUrl, { headers: { Upgrade: 'websocket' } });
    upstream = upstreamResp.webSocket;
    if (!upstream) {
      server.close(CLOSE_UPSTREAM_UNAVAILABLE, 'upstream-upgrade-failed');
      return new Response(null, { status: 101, webSocket: client });
    }
    upstream.accept();
  } catch {
    server.close(CLOSE_UPSTREAM_UNAVAILABLE, 'upstream-connect-error');
    return new Response(null, { status: 101, webSocket: client });
  }

  let heartbeatTimer = null;
  let closed = false;
  const closeAll = (code, reason) => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    try { server.close(code, reason); } catch { /* already closed */ }
    try { upstream.close(); } catch { /* already closed */ }
  };

  upstream.addEventListener('open', () => {
    upstream.send(JSON.stringify({ action: 'subscribe', params: { symbols: symbol } }));
    heartbeatTimer = setInterval(() => {
      try { upstream.send(JSON.stringify({ action: 'heartbeat' })); } catch { /* connection closing */ }
    }, HEARTBEAT_INTERVAL_MS);
  });

  upstream.addEventListener('message', (event) => {
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }

    if (payload.event === 'price' && payload.symbol) {
      server.send(JSON.stringify({
        type: 'price',
        symbol: payload.symbol,
        price: Number(payload.price),
        timestamp: Number(payload.timestamp) ? Number(payload.timestamp) * 1000 : Date.now(),
        volume: payload.day_volume != null ? Number(payload.day_volume) : null,
      }));
      return;
    }

    if (payload.event === 'subscribe-status') {
      server.send(JSON.stringify({ type: 'subscribe-status', status: payload.status, fails: payload.fails || null }));
      const rejected = payload.status !== 'ok' || (Array.isArray(payload.fails) && payload.fails.length > 0);
      if (rejected) closeAll(CLOSE_SUBSCRIBE_REJECTED, 'subscribe-rejected');
    }
  });

  upstream.addEventListener('close', () => closeAll(4000, 'upstream-closed'));
  upstream.addEventListener('error', () => closeAll(4004, 'upstream-error'));
  server.addEventListener('close', () => closeAll(1000, 'client-closed'));
  server.addEventListener('error', () => closeAll(1011, 'client-error'));

  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (url.pathname === '/health') return json({ ok: true, service: 'vision-universe-market-data' }, 200, headers);
    if (url.pathname === '/history') return handleHistory(url, env, headers);
    if (url.pathname === '/quote') return handleQuote(url, env, headers);
    if (url.pathname === '/stream') return handleStream(request, url, env);

    return json({ error: 'not found' }, 404, headers);
  },
};
