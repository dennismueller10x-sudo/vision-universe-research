import { TwelveDataProvider } from './TwelveDataProvider.js';
import { MockProvider } from './MockProvider.js';

let cachedConfig = null;

/** Loads the public (non-secret) market-data config: just the worker's base URL. */
export async function loadMarketDataConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch('/dashboard/config/market-data.json', { cache: 'no-store' });
    cachedConfig = res.ok ? await res.json() : {};
  } catch {
    cachedConfig = {};
  }
  return cachedConfig;
}

/** Mock mode is opt-in only (?mock=1) so it can never silently replace real data. */
export function isMockRequested() {
  try {
    return new URLSearchParams(location.search).get('mock') === '1';
  } catch {
    return false;
  }
}

/**
 * Provider factory. This is the single place that decides which MarketDataProvider
 * implementation the app talks to — swapping Twelve Data for another provider later
 * only touches this file plus a new *Provider.js, never chart or dashboard code.
 * @returns {Promise<{provider: import('./MarketDataProvider.js').MarketDataProvider|null, mode: 'mock'|'live'|'unconfigured'}>}
 */
export async function createMarketDataProvider() {
  if (isMockRequested()) {
    return { provider: new MockProvider(), mode: 'mock' };
  }
  const config = await loadMarketDataConfig();
  const workerBaseUrl = ((config && config.worker_base_url) || '').trim();
  if (!workerBaseUrl) {
    return { provider: null, mode: 'unconfigured' };
  }
  return { provider: new TwelveDataProvider({ workerBaseUrl }), mode: 'live' };
}

export { isValidPriceUpdate } from './MarketDataProvider.js';
