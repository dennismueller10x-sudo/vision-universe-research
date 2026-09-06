import { MarketDataProvider } from './MarketDataProvider.js';

const TICK_MIN_MS = 700;
const TICK_MAX_MS = 2200;

function hashSymbol(symbol) {
  let h = 0;
  for (const ch of String(symbol)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function pseudoRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Development-only provider that simulates a live tick stream so the chart can be
 * proven to move without a market being open or a worker being deployed yet. Never
 * used unless explicitly requested (see services/market-data/index.js) so it can
 * never silently stand in for real production data.
 */
export class MockProvider extends MarketDataProvider {
  constructor() {
    super();
    this.timer = null;
    this.basePrice = 100;
    this.lastPrice = 100;
  }

  async getHistory(symbol, { outputsize = 240 } = {}) {
    const seed = hashSymbol(symbol);
    const base = 40 + (seed % 400);
    this.basePrice = base;
    const now = Date.now();
    const bars = [];
    let price = base;
    for (let i = outputsize - 1; i >= 0; i--) {
      const t = now - i * 60_000;
      const drift = (pseudoRandom(seed + i) - 0.5) * base * 0.004;
      const open = Math.max(0.5, price + drift);
      const close = Math.max(0.5, open + (pseudoRandom(seed + i + 1000) - 0.5) * base * 0.002);
      const high = Math.max(open, close) + Math.abs(pseudoRandom(seed + i + 2000)) * base * 0.001;
      const low = Math.max(0.1, Math.min(open, close) - Math.abs(pseudoRandom(seed + i + 3000)) * base * 0.001);
      bars.push({ symbol, timestamp: t, open, high, low, close, volume: Math.round(1000 + pseudoRandom(seed + i + 4000) * 50000) });
      price = close;
    }
    this.lastPrice = bars[bars.length - 1].close;
    return { symbol, interval: '1min', bars, source: 'mock', generated_at: new Date().toISOString() };
  }

  async getQuote(symbol) {
    return { symbol, price: this.lastPrice, close: this.lastPrice, is_market_open: true, timestamp: Math.floor(Date.now() / 1000) };
  }

  subscribe(symbol) {
    this.unsubscribe();
    this.currentSymbol = symbol;
    this.streamMode = 'mock';
    this._emitStatus({ state: 'connected' });
    this._scheduleTick();
  }

  unsubscribe() {
    clearTimeout(this.timer);
    this.timer = null;
    this.currentSymbol = null;
  }

  dispose() { this.unsubscribe(); }

  _emitStatus(extra = {}) {
    this.dispatchEvent(new CustomEvent('status', {
      detail: {
        provider: 'mock',
        symbol: this.currentSymbol,
        streamMode: 'mock',
        reconnects: 0,
        lastEventAt: Date.now(),
        lastPrice: this.lastPrice,
        ...extra,
      },
    }));
  }

  _scheduleTick() {
    const delay = TICK_MIN_MS + Math.random() * (TICK_MAX_MS - TICK_MIN_MS);
    this.timer = setTimeout(() => {
      if (!this.currentSymbol) return;
      const drift = (Math.random() - 0.5) * this.basePrice * 0.003;
      this.lastPrice = Math.max(0.5, this.lastPrice + drift);
      const update = { symbol: this.currentSymbol, price: this.lastPrice, timestamp: Date.now(), volume: Math.round(Math.random() * 5000), source: 'mock' };
      this.dispatchEvent(new CustomEvent('update', { detail: update }));
      this._emitStatus({ state: 'connected' });
      this._scheduleTick();
    }, delay);
  }
}
