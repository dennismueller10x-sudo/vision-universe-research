import { MarketDataProvider, isValidPriceUpdate } from './MarketDataProvider.js';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const MAX_WS_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 30000;

// Close codes the market-data worker uses to signal "don't bother retrying the
// websocket, the upstream refused it" (auth failure, plan doesn't include
// websocket, subscribe rejected). Anything else is treated as a transient drop.
const PERMANENT_CLOSE_CODES = new Set([4001, 4002, 4003]);

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

/**
 * Talks only to the Vision Universe market-data worker (never to Twelve Data
 * directly from the browser, so the API key never reaches the frontend). The
 * worker's REST endpoints (/history, /quote) and websocket endpoint (/stream)
 * already return the normalized MarketPriceUpdate / HistoricalBar shapes.
 */
export class TwelveDataProvider extends MarketDataProvider {
  constructor({ workerBaseUrl }) {
    super();
    if (!workerBaseUrl) throw new Error('workerBaseUrl is required');
    this.workerBaseUrl = workerBaseUrl.replace(/\/$/, '');
    this.ws = null;
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.wsAttempts = 0;
    this.reconnectCount = 0;
    this.streamMode = 'idle';
    this.lastPrice = null;
    this.lastEventAt = null;
    this.disposed = true;
    this.wsPermanentlyUnavailable = false;
  }

  async getHistory(symbol, { interval = '1min', outputsize = 390 } = {}) {
    const url = `${this.workerBaseUrl}/history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${encodeURIComponent(outputsize)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await safeJson(res);
      throw new Error((body && body.error) || `history request failed (${res.status})`);
    }
    return res.json();
  }

  async getQuote(symbol) {
    const url = `${this.workerBaseUrl}/quote?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await safeJson(res);
      throw new Error((body && body.error) || `quote request failed (${res.status})`);
    }
    return res.json();
  }

  subscribe(symbol) {
    this.unsubscribe();
    this.currentSymbol = symbol;
    this.disposed = false;
    this.wsAttempts = 0;
    this.wsPermanentlyUnavailable = false;
    this._openWebSocket();
  }

  unsubscribe() {
    this.disposed = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pollTimer);
    this.reconnectTimer = null;
    this.pollTimer = null;
    if (this.ws) {
      try { this.ws.close(1000, 'unsubscribe'); } catch { /* already closed */ }
      this.ws = null;
    }
    this.streamMode = 'idle';
    this.currentSymbol = null;
  }

  _emitStatus(extra = {}) {
    this.dispatchEvent(new CustomEvent('status', {
      detail: {
        provider: 'twelvedata',
        symbol: this.currentSymbol,
        streamMode: this.streamMode,
        reconnects: this.reconnectCount,
        lastEventAt: this.lastEventAt,
        lastPrice: this.lastPrice,
        ...extra,
      },
    }));
  }

  _openWebSocket() {
    if (this.disposed) return;
    if (this.wsPermanentlyUnavailable) { this._startPolling(); return; }
    const symbol = this.currentSymbol;
    const wsUrl = `${this.workerBaseUrl.replace(/^http/, 'ws')}/stream?symbol=${encodeURIComponent(symbol)}`;
    this._emitStatus({ state: 'connecting' });

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      this._handleWsFailure();
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      if (this.disposed) return;
      this.streamMode = 'websocket';
      this.wsAttempts = 0;
      this._emitStatus({ state: 'connected' });
    });

    ws.addEventListener('message', (event) => {
      if (this.disposed) return;
      let payload;
      try { payload = JSON.parse(event.data); } catch { return; }

      if (payload.type === 'price') {
        const update = {
          symbol: payload.symbol,
          price: Number(payload.price),
          timestamp: Number(payload.timestamp),
          volume: payload.volume != null ? Number(payload.volume) : null,
          source: 'twelvedata',
        };
        if (!isValidPriceUpdate(update, symbol)) return;
        this.lastPrice = update.price;
        this.lastEventAt = Date.now();
        this.dispatchEvent(new CustomEvent('update', { detail: update }));
        this._emitStatus({ state: 'connected' });
      } else if (payload.type === 'subscribe-status') {
        this._emitStatus({ state: 'connected', subscribeStatus: payload.status });
      }
    });

    ws.addEventListener('close', (event) => {
      if (this.disposed) return;
      this.ws = null;
      if (PERMANENT_CLOSE_CODES.has(event.code)) {
        this.wsPermanentlyUnavailable = true;
        this._startPolling();
        return;
      }
      this._handleWsFailure();
    });

    ws.addEventListener('error', () => { /* the close event that follows drives reconnect */ });
  }

  _handleWsFailure() {
    if (this.disposed) return;
    this.wsAttempts += 1;
    this.reconnectCount += 1;
    if (this.wsAttempts > MAX_WS_ATTEMPTS) {
      this.wsPermanentlyUnavailable = true;
      this._startPolling();
      return;
    }
    this.streamMode = 'idle';
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (this.wsAttempts - 1));
    this._emitStatus({ state: 'reconnecting', nextRetryMs: delay });
    this.reconnectTimer = setTimeout(() => this._openWebSocket(), delay);
  }

  _startPolling() {
    if (this.disposed) return;
    clearInterval(this.pollTimer);
    this.streamMode = 'polling';
    const symbol = this.currentSymbol;

    const poll = async () => {
      if (this.disposed) return;
      try {
        const quote = await this.getQuote(symbol);
        const update = {
          symbol: quote.symbol || symbol,
          price: Number(quote.price != null ? quote.price : quote.close),
          timestamp: quote.timestamp ? Number(quote.timestamp) * 1000 : Date.now(),
          volume: quote.volume != null ? Number(quote.volume) : null,
          source: 'twelvedata',
        };
        if (isValidPriceUpdate(update, symbol)) {
          this.lastPrice = update.price;
          this.lastEventAt = Date.now();
          this.dispatchEvent(new CustomEvent('update', { detail: update }));
        }
        this._emitStatus({ state: 'connected', isMarketOpen: quote.is_market_open });
      } catch (err) {
        this._emitStatus({ state: 'error', lastError: String((err && err.message) || err) });
      }
    };
    poll();
    this.pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }
}
