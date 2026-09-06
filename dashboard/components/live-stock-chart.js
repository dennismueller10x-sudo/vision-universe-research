import { createMarketDataProvider, isValidPriceUpdate } from '../services/market-data/index.js';

const LIVE_STALE_MS = 20_000;
const CLOSED_RECHECK_MS = 60_000;

const fmtPrice = (v) => (Number.isFinite(v) ? v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const fmtPct = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %` : '—');
const fmtClock = (ts) => (ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

/**
 * Reusable, dashboard-agnostic live chart. Mount it anywhere with:
 *
 *   const handle = mountLiveStockChart(container, { symbol: 'NVDA', name: 'NVIDIA' });
 *   handle.update({ symbol: 'PLTR', name: 'Palantir' }); // clean unsubscribe + resubscribe
 *   handle.dispose(); // unsubscribe, cancel timers
 *
 * It owns its own historical load, live subscription, throttled rendering and status
 * badge — a hosting page only passes a symbol, never provider or dashboard specifics.
 */
export function mountLiveStockChart(container, options) {
  const state = {
    container,
    symbol: options.symbol,
    name: options.name || '',
    provider: null,
    mode: 'unconfigured',
    bars: [],
    previousClose: null,
    marketOpen: null,
    status: { streamMode: 'idle', state: 'connecting', reconnects: 0, lastEventAt: null, lastPrice: null },
    debugOn: false,
    disposed: false,
    rafHandle: null,
    pendingPrice: null,
    closedPollTimer: null,
    dom: {},
  };

  buildSkeleton(state);
  boot(state);

  return {
    dispose: () => teardown(state),
    update: (opts) => {
      teardown(state, { keepDom: true });
      state.disposed = false;
      state.symbol = opts.symbol;
      state.name = opts.name || '';
      state.bars = [];
      state.previousClose = null;
      state.marketOpen = null;
      state.dom.symbol.textContent = state.symbol;
      state.dom.name.textContent = state.name;
      state.dom.price.textContent = '—';
      state.dom.change.textContent = '—';
      state.dom.change.className = 'lsc-change';
      state.dom.svg.innerHTML = '';
      state.dom.notice.hidden = true;
      boot(state);
    },
  };
}

function buildSkeleton(state) {
  state.container.innerHTML = `
    <div class="lsc">
      <div class="lsc-head">
        <div class="lsc-title">
          <b class="lsc-symbol"></b><span class="lsc-name"></span>
        </div>
        <div class="lsc-price-wrap">
          <b class="lsc-price">—</b>
          <span class="lsc-change">—</span>
        </div>
      </div>
      <div class="lsc-status-row">
        <span class="lsc-badge lsc-badge-offline"><i></i>OFFLINE</span>
        <span class="lsc-updated"></span>
        <button type="button" class="lsc-debug-toggle" aria-label="Debug-Informationen anzeigen">⋯</button>
      </div>
      <div class="lsc-chart-wrap">
        <svg class="lsc-svg" viewBox="0 0 600 220" preserveAspectRatio="none"></svg>
      </div>
      <p class="lsc-notice" hidden></p>
      <pre class="lsc-debug" hidden></pre>
    </div>`;
  const el = state.container.querySelector('.lsc');
  state.dom = {
    root: el,
    symbol: el.querySelector('.lsc-symbol'),
    name: el.querySelector('.lsc-name'),
    price: el.querySelector('.lsc-price'),
    change: el.querySelector('.lsc-change'),
    badge: el.querySelector('.lsc-badge'),
    updated: el.querySelector('.lsc-updated'),
    debugToggle: el.querySelector('.lsc-debug-toggle'),
    debugPanel: el.querySelector('.lsc-debug'),
    svg: el.querySelector('.lsc-svg'),
    notice: el.querySelector('.lsc-notice'),
  };
  state.dom.symbol.textContent = state.symbol;
  state.dom.name.textContent = state.name;
  state.dom.debugToggle.onclick = () => {
    state.debugOn = !state.debugOn;
    state.dom.debugPanel.hidden = !state.debugOn;
    renderDebug(state);
  };
}

async function boot(state) {
  const { provider, mode } = await createMarketDataProvider();
  if (state.disposed) return;
  state.provider = provider;
  state.mode = mode;

  if (mode === 'unconfigured') {
    setNotice(state, 'Live-Marktdaten-Layer ist noch nicht konfiguriert (dashboard/config/market-data.json → worker_base_url). Zum Testen ohne Deployment kann der Mock-Live-Modus verwendet werden: URL mit ?mock=1 aufrufen.');
    setBadge(state, 'offline', 'OFFLINE');
    return;
  }

  provider.addEventListener('update', (event) => onUpdate(state, event.detail));
  provider.addEventListener('status', (event) => onStatus(state, event.detail));

  try {
    const history = await provider.getHistory(state.symbol, { interval: '1min', outputsize: 240 });
    if (state.disposed) return;
    state.bars = (history.bars || []).filter((bar) => Number.isFinite(bar.close) && bar.close > 0);
    if (state.bars.length) {
      state.previousClose = state.bars[0].open;
      drawChart(state);
      updatePriceHeader(state, state.bars[state.bars.length - 1].close, state.bars[state.bars.length - 1].timestamp);
    }
  } catch (err) {
    setNotice(state, `Historische Intraday-Daten konnten nicht geladen werden: ${err.message || err}`);
  }

  try {
    const quote = mode === 'mock' ? await provider.getQuote(state.symbol) : await provider.getQuote(state.symbol);
    if (state.disposed) return;
    state.marketOpen = quote.is_market_open !== false;
  } catch {
    state.marketOpen = mode === 'mock' ? true : null;
  }

  if (state.marketOpen === false) {
    setBadge(state, 'closed', 'MARKET CLOSED');
    scheduleClosedRecheck(state);
    return;
  }

  provider.subscribe(state.symbol);
}

function scheduleClosedRecheck(state) {
  clearTimeout(state.closedPollTimer);
  state.closedPollTimer = setTimeout(async () => {
    if (state.disposed || !state.provider) return;
    try {
      const quote = await state.provider.getQuote(state.symbol);
      state.marketOpen = quote.is_market_open !== false;
    } catch { /* keep previous state, retry on next tick */ }
    if (state.disposed) return;
    if (state.marketOpen) {
      state.provider.subscribe(state.symbol);
    } else {
      scheduleClosedRecheck(state);
    }
  }, CLOSED_RECHECK_MS);
}

function onUpdate(state, update) {
  if (!isValidPriceUpdate(update, state.symbol)) return;
  state.marketOpen = true;
  state.pendingPrice = update;
  if (state.rafHandle) return;
  const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
  state.rafHandle = raf(() => {
    state.rafHandle = null;
    if (state.disposed || !state.pendingPrice) return;
    const px = state.pendingPrice;
    state.pendingPrice = null;
    appendTick(state, px);
    updatePriceHeader(state, px.price, px.timestamp);
    drawChart(state);
  });
}

function appendTick(state, update) {
  const bars = state.bars;
  const lastBar = bars[bars.length - 1];
  if (lastBar && update.timestamp - lastBar.timestamp < 60_000) {
    lastBar.close = update.price;
    lastBar.high = Math.max(lastBar.high, update.price);
    lastBar.low = Math.min(lastBar.low, update.price);
    if (update.volume != null) lastBar.volume = update.volume;
  } else {
    bars.push({ symbol: state.symbol, timestamp: update.timestamp, open: update.price, high: update.price, low: update.price, close: update.price, volume: update.volume || 0 });
    if (bars.length > 500) bars.shift();
  }
}

function onStatus(state, status) {
  state.status = status;
  if (status.isMarketOpen != null) state.marketOpen = status.isMarketOpen;
  const fresh = status.lastEventAt && Date.now() - status.lastEventAt < LIVE_STALE_MS;

  if (state.marketOpen === false) {
    setBadge(state, 'closed', 'MARKET CLOSED');
  } else if (status.state === 'error' || (status.state === 'reconnecting' && status.reconnects > 3)) {
    setBadge(state, 'offline', 'OFFLINE');
  } else if (status.streamMode === 'mock' && fresh) {
    setBadge(state, 'live', 'LIVE (Mock)');
  } else if (status.streamMode === 'websocket' && fresh) {
    setBadge(state, 'live', 'LIVE');
  } else if (status.streamMode === 'polling') {
    setBadge(state, 'delayed', 'DELAYED');
  } else if (status.state === 'connecting' || status.state === 'reconnecting') {
    setBadge(state, 'offline', 'VERBINDET…');
  } else {
    setBadge(state, 'offline', 'OFFLINE');
  }
  renderDebug(state);
}

function setBadge(state, kind, label) {
  const badge = state.dom.badge;
  badge.className = `lsc-badge lsc-badge-${kind}`;
  badge.innerHTML = `<i></i>${label}`;
  state.dom.updated.textContent = state.status.lastEventAt ? `Letztes Update: ${fmtClock(state.status.lastEventAt)}` : '';
}

function setNotice(state, text) {
  state.dom.notice.hidden = false;
  state.dom.notice.textContent = text;
}

function updatePriceHeader(state, price, timestamp) {
  state.dom.price.textContent = `${fmtPrice(price)} USD`;
  if (Number.isFinite(state.previousClose) && state.previousClose > 0) {
    const pct = ((price - state.previousClose) / state.previousClose) * 100;
    const change = state.dom.change;
    change.textContent = fmtPct(pct);
    change.className = `lsc-change ${pct >= 0 ? 'lsc-up' : 'lsc-down'}`;
  }
  state.dom.updated.textContent = `Letztes Update: ${fmtClock(timestamp)}`;
}

function drawChart(state) {
  const bars = state.bars;
  const svg = state.dom.svg;
  if (!bars.length) { svg.innerHTML = ''; return; }
  const closes = bars.map((b) => b.close);
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const pad = (hi - lo) * 0.1 || Math.max(hi * 0.01, 0.5);
  const W = 600, H = 220, L = 4, R = 4, T = 10, B = 10;
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, bars.length - 1);
  const y = (v) => T + (hi + pad - v) * (H - T - B) / (hi - lo + 2 * pad);
  const path = closes.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const areaPath = `${path} L${x(bars.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const up = closes[closes.length - 1] >= (state.previousClose ?? closes[0]);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<path class="lsc-area ${up ? 'lsc-up' : 'lsc-down'}" d="${areaPath}"/><path class="lsc-line ${up ? 'lsc-up' : 'lsc-down'}" d="${path}"/>`;
}

function renderDebug(state) {
  if (!state.debugOn) return;
  const s = state.status;
  state.dom.debugPanel.textContent = [
    `Provider: ${s.provider || state.mode}`,
    `Symbol: ${state.symbol}`,
    `Connection: ${s.state || '—'}`,
    `Mode: ${s.streamMode || 'idle'}`,
    `Last event: ${fmtClock(s.lastEventAt)}`,
    `Last price: ${fmtPrice(s.lastPrice)}`,
    `Reconnects: ${s.reconnects ?? 0}`,
    s.lastError ? `Last error: ${s.lastError}` : null,
  ].filter(Boolean).join('\n');
}

function teardown(state, { keepDom = false } = {}) {
  state.disposed = true;
  clearTimeout(state.closedPollTimer);
  if (state.rafHandle) {
    (window.cancelAnimationFrame || clearTimeout)(state.rafHandle);
    state.rafHandle = null;
  }
  if (state.provider) state.provider.dispose();
  if (!keepDom && state.container) state.container.innerHTML = '';
}
