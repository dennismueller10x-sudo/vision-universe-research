/**
 * Internal Vision Universe market-data model. All providers (Twelve Data, a future
 * Polygon/Finnhub/Intrinio provider, the dev mock) normalize into these shapes so the
 * frontend never touches a provider-specific field name.
 *
 * @typedef {Object} MarketPriceUpdate
 * @property {string} symbol
 * @property {number} price
 * @property {number} timestamp - epoch milliseconds
 * @property {number|null} volume
 * @property {string} source - e.g. "twelvedata", "mock"
 *
 * @typedef {Object} HistoricalBar
 * @property {string} symbol
 * @property {number} timestamp - epoch milliseconds
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} volume
 *
 * @typedef {Object} ConnectionStatus
 * @property {string} provider
 * @property {string|null} symbol
 * @property {'idle'|'connecting'|'connected'|'reconnecting'|'error'} state
 * @property {'websocket'|'polling'|'mock'|'idle'} streamMode
 * @property {number} reconnects
 * @property {number|null} lastEventAt - epoch milliseconds
 * @property {number|null} lastPrice
 * @property {string} [lastError]
 */

/**
 * Base class every market data provider implements. The frontend (and the reusable
 * <LiveStockChart> component) only ever talks to this interface, never to a
 * provider-specific client, so a provider swap never touches chart code.
 */
export class MarketDataProvider extends EventTarget {
  constructor() {
    super();
    /** @type {string|null} */
    this.currentSymbol = null;
  }

  /**
   * @param {string} symbol
   * @param {{interval?: string, outputsize?: number}} [options]
   * @returns {Promise<{symbol: string, interval: string, bars: HistoricalBar[], source: string}>}
   */
  async getHistory(symbol, options) {
    throw new Error('getHistory() not implemented');
  }

  /**
   * @param {string} symbol
   * @returns {Promise<Object>}
   */
  async getQuote(symbol) {
    throw new Error('getQuote() not implemented');
  }

  /**
   * Start streaming updates for a symbol. Replaces any previous subscription
   * (never leaves a zombie connection to the old symbol behind).
   * @param {string} symbol
   */
  subscribe(symbol) {
    throw new Error('subscribe() not implemented');
  }

  /** Stop streaming and release the connection. */
  unsubscribe() {
    throw new Error('unsubscribe() not implemented');
  }

  dispose() {
    this.unsubscribe();
  }
}

/**
 * Shared validation so a malformed or stale tick from any provider can never reach
 * the chart: null/NaN/non-positive prices, invalid timestamps and symbol mismatches
 * are rejected here rather than in each provider implementation.
 * @param {MarketPriceUpdate} update
 * @param {string} [expectedSymbol]
 */
export function isValidPriceUpdate(update, expectedSymbol) {
  if (!update) return false;
  if (expectedSymbol && update.symbol && String(update.symbol).toUpperCase() !== String(expectedSymbol).toUpperCase()) return false;
  if (!Number.isFinite(update.price) || update.price <= 0) return false;
  if (!Number.isFinite(update.timestamp) || update.timestamp <= 0) return false;
  return true;
}
