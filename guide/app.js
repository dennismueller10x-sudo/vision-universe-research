(async function () {
  const app = document.querySelector('#app');
  const params = new URLSearchParams(location.search);
  let rangeDays = [5, 22, 252, 756, 1260].includes(Number(params.get('days'))) ? Number(params.get('days')) : 252;
  const get = (path) => fetch('/dashboard/' + path, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(path); return r.json(); });
  const esc = (v) => String(v == null ? '—' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const norm = (v) => esc(String(v == null ? '—' : v).replace(/percent/gi, '%').replace(/ratio/gi, 'x'));
  const fmtMoney = (v) => { const n = Number(v); if (v == null || !Number.isFinite(n)) return '—'; const abs = Math.abs(n); if (abs >= 1e12) return fmt(n / 1e12, 2) + ' Bio. USD'; if (abs >= 1e9) return fmt(n / 1e9, 2) + ' Mrd. USD'; if (abs >= 1e6) return fmt(n / 1e6, 1) + ' Mio. USD'; return fmt(n, 2) + ' USD'; };
  const fmtRatio = (v) => v == null || !Number.isFinite(Number(v)) ? '—' : fmt(v, 2) + ' x';
  const fmtPct = (v) => v == null || !Number.isFinite(Number(v)) ? '—' : fmt(v, 1) + ' %';
  const fmtChange = (v) => v == null || !Number.isFinite(Number(v)) ? '' : (v >= 0 ? '+' : '') + fmt(v, 2) + ' %';
  const pick = (tdValue, legacyValue, formatter) => (tdValue != null && Number.isFinite(Number(tdValue))) ? formatter(tdValue) : (legacyValue != null ? norm(legacyValue) : '—');

  try {
    const [u, market, fundamentals] = await Promise.all([get('config/universe.json'), get('data/market_data.json'), get('data/fundamental_metrics.json')]);
    const stocks = u.stocks.filter((s) => s.active);
    const selected = params.get('symbol') || stocks[0].symbol;
    const stock = stocks.find((s) => s.symbol === selected) || stocks[0];
    const metric = (fundamentals.symbols && fundamentals.symbols[stock.symbol]) || {};
    const legacy = metric.legacy || {};
    const candles = (market.symbols && market.symbols[stock.symbol]) || [];
    const closes = candles.map((r) => Number(r.close));
    const sharesOut = Number(metric.shares_outstanding), hasMcap = Number.isFinite(sharesOut) && sharesOut > 0;
    let overlay = params.get('overlay') === 'mcap' && hasMcap;

    const picker = `<section class="picker"><input class="search" id="guideSearch" placeholder="Aktie oder Symbol suchen"><div class="stock-buttons">${stocks.map((s) => `<a class="stock-button ${s.symbol === stock.symbol ? 'selected' : ''}" data-search="${esc((s.symbol + ' ' + s.name).toLowerCase())}" href="?symbol=${s.symbol}&days=${rangeDays}"><b>${s.symbol}</b><span>${esc(s.name)}</span></a>`).join('')}</div></section>`;

    const buildChartBlock = (days, overlayOn) => {
      let chartHtml, legendHtml = '', noteHtml = '', pctChange = null, priceDir = 'up';
      if (closes.length >= 2) {
        const start = Math.max(0, candles.length - days), rows = candles.slice(start), rowCloses = closes.slice(start);
        pctChange = rowCloses[0] ? (rowCloses[rowCloses.length - 1] - rowCloses[0]) / rowCloses[0] * 100 : null;
        priceDir = (pctChange == null || pctChange >= 0) ? 'up' : 'down';
        const lo = Math.min(...rowCloses), hi = Math.max(...rowCloses), pad = (hi - lo) * .05 || 1;
        const domainLo = Math.max(0, lo - pad), domainHi = hi + pad;
        const W = 1000, H = 460, L = overlayOn ? 74 : 8, R = 48, T = 24, B = 60;
        const x = (i) => L + i * (W - L - R) / (rows.length - 1), y = (v) => T + (domainHi - v) * (H - T - B) / (domainHi - domainLo);
        const pathWith = (vals, yFn) => vals.map((v, i) => v == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yFn(v).toFixed(1)}`).join(' ');
        const yTicks = Array.from({ length: 5 }, (_, i) => domainLo + i * (domainHi - domainLo) / 4), xIdx = [0, .25, .5, .75, 1].map((v) => Math.round(v * (rows.length - 1)));
        const grid = yTicks.map((v) => `<text class="axis-label" x="${W - R + 10}" y="${y(v) + 4}">${fmt(v, 2)} USD</text>`).join('') + xIdx.map((i) => `<text class="axis-label x-label" x="${x(i)}" y="${H - 18}">${new Date(rows[i].date + 'T00:00:00').toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })}</text>`).join('');
        let mcapAxis = '', mcapPath = '';
        if (overlayOn) {
          const mcap = rowCloses.map((c) => c * sharesOut), lo2 = Math.min(...mcap), hi2 = Math.max(...mcap), pad2 = (hi2 - lo2) * .05 || 1;
          const y2 = (v) => T + (hi2 + pad2 - v) * (H - T - B) / (hi2 - lo2 + 2 * pad2);
          mcapPath = pathWith(mcap, y2);
          mcapAxis = Array.from({ length: 5 }, (_, i) => lo2 - pad2 + i * (hi2 - lo2 + 2 * pad2) / 4).map((v) => `<text class="axis-label" text-anchor="end" x="${L - 10}" y="${y2(v) + 4}">${fmtMoney(v).replace(' USD', '')}</text>`).join('');
          legendHtml = `<span class="lg-mcap">Marktkapitalisierung</span>`;
          noteHtml = `<p class="data-note">Marktkapitalisierung = Kurs × zuletzt gemeldete Aktien im Umlauf (${fmt(sharesOut / 1e6, 1)} Mio., Stand ${metric.data_as_of ? esc(new Date(metric.data_as_of).toLocaleDateString('de-DE')) : '—'}). Rückkäufe/Kapitalerhöhungen zwischen zwei Fundamental-Abrufen werden nicht berücksichtigt.</p>`;
        }
        chartHtml = `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}">${grid}${mcapAxis}${overlayOn ? `<path class="mcap" d="${mcapPath}"/>` : ''}<path class="price ${priceDir}" d="${pathWith(rowCloses, y)}"/></svg></div>`;
      } else {
        chartHtml = `<article class="notice">Für ${esc(stock.symbol)} liegen noch keine Kursdaten vor. Diese werden über den bestehenden wöchentlichen Dashboard-Workflow befüllt, sobald das Symbol dort mit läuft.</article>`;
      }
      return { chartHtml, legendHtml, noteHtml, pctChange, priceDir };
    };

    const initial = buildChartBlock(rangeDays, overlay);
    const lastClose = closes.length ? closes[closes.length - 1] : null;
    const rangeNav = `<nav class="range" id="rangeNav"><button class="${rangeDays === 5 ? 'on' : ''}" data-days="5">1 Woche</button><button class="${rangeDays === 22 ? 'on' : ''}" data-days="22">1 Monat</button><button class="${rangeDays === 252 ? 'on' : ''}" data-days="252">1 Jahr</button><button class="${rangeDays === 756 ? 'on' : ''}" data-days="756">3 Jahre</button><button class="${rangeDays === 1260 ? 'on' : ''}" data-days="1260">5 Jahre</button>${hasMcap ? `<button class="${overlay ? 'on' : ''}" id="mcapToggle">+ Marktkap.</button>` : `<span class="range-disabled" title="Fundamentaldaten für ${esc(stock.symbol)} noch nicht abgerufen">+ Marktkap.</span>`}</nav>`;

    const fcfYield = (metric.free_cash_flow_ttm != null && metric.market_capitalization) ? fmtPct(metric.free_cash_flow_ttm / metric.market_capitalization * 100) : (legacy.fcf_yield != null ? norm(legacy.fcf_yield) : '—');
    const metricRows = [
      ['Marktkapitalisierung', fmtMoney(metric.market_capitalization)],
      ['Enterprise Value', fmtMoney(metric.enterprise_value)],
      ['KGV (TTM)', pick(metric.pe_ratio_ttm, legacy.pe_ratio, fmtRatio)],
      ['KGV (erwartet)', fmtRatio(metric.pe_ratio_forward)],
      ['KUV', pick(metric.ps_ratio_ttm, legacy.ps_ratio, fmtRatio)],
      ['EV/Sales', fmtRatio(metric.ev_to_revenue)],
      ['EV/EBITDA', fmtRatio(metric.ev_to_ebitda)],
      ['EV/FCF', fmtRatio(metric.ev_to_fcf)],
      ['KBV', fmtRatio(metric.price_to_book)],
      ['PEG', fmtRatio(metric.peg_ratio)],
      ['Bruttomarge', pick(metric.gross_margin_pct, legacy.gross_margin, fmtPct)],
      ['Operative Marge', pick(metric.operating_margin_pct, legacy.operating_margin, fmtPct)],
      ['Nettomarge', fmtPct(metric.net_margin_pct)],
      ['Eigenkapitalrendite', fmtPct(metric.return_on_equity_pct)],
      ['ROIC', legacy.roic != null ? norm(legacy.roic) : '—'],
      ['Umsatzwachstum YoY', pick(metric.revenue_growth_yoy_pct, legacy.revenue_growth, fmtPct)],
      ['Gewinnwachstum YoY', fmtPct(metric.earnings_growth_yoy_pct)],
      ['FCF-Rendite', fcfYield],
      ['Verschuldungsgrad', fmtRatio(metric.debt_to_equity)],
      ['Dividendenrendite', fmtPct(metric.dividend_yield_pct)],
      ['Free Cashflow (TTM)', fmtMoney(metric.free_cash_flow_ttm)]
    ];

    app.innerHTML = `<div class="kicker">Aktien Guide</div><h1 class="heading">Guide</h1>${picker}<div class="stock-head"><div><h2>${stock.symbol} · ${esc(stock.name)}</h2>${lastClose != null ? `<b>${fmt(lastClose, 2)} USD</b><span id="priceBadge">${initial.pctChange != null ? `<span class="change-badge ${initial.priceDir}">${initial.priceDir === 'up' ? '▲' : '▼'} ${fmtChange(initial.pctChange)}</span>` : ''}</span>` : ''}</div>${rangeNav}</div><div id="chartArea">${initial.chartHtml}</div><div class="legend" id="legendArea"><span class="lg-price">Kurs</span>${initial.legendHtml}</div><div id="noteArea">${initial.noteHtml}</div><h2 class="section-title">Fundamentale Kennzahlen</h2><section class="metrics">${metricRows.map(([name, value]) => `<div class="metric"><span>${name}</span><b>${value}</b></div>`).join('')}</section><p class="data-note">Datenstand ${metric.data_as_of ? esc(new Date(metric.data_as_of).toLocaleDateString('de-DE')) : esc(fundamentals.legacy_data_as_of || 'unbekannt')} · Twelve-Data-Felder manuell angestoßen, übrige Kennzahlen recherchiert (${esc(fundamentals.legacy_sources || '—')}). Nicht verfügbare Werte werden nicht geschätzt.</p>`;

    const input = document.getElementById('guideSearch');
    if (input) input.oninput = () => document.querySelectorAll('.stock-button').forEach((el) => { el.hidden = !el.dataset.search.includes(input.value.toLowerCase()); });

    const rangeNavEl = document.getElementById('rangeNav');
    const redrawChart = () => {
      const c = buildChartBlock(rangeDays, overlay);
      document.getElementById('chartArea').innerHTML = c.chartHtml;
      document.getElementById('legendArea').innerHTML = `<span class="lg-price">Kurs</span>${c.legendHtml}`;
      document.getElementById('noteArea').innerHTML = c.noteHtml;
      const badge = document.getElementById('priceBadge');
      if (badge) badge.innerHTML = c.pctChange != null ? `<span class="change-badge ${c.priceDir}">${c.priceDir === 'up' ? '▲' : '▼'} ${fmtChange(c.pctChange)}</span>` : '';
      rangeNavEl.querySelectorAll('button[data-days]').forEach((b) => b.classList.toggle('on', Number(b.dataset.days) === rangeDays));
      const mcapBtn = document.getElementById('mcapToggle');
      if (mcapBtn) mcapBtn.classList.toggle('on', overlay);
      const url = new URL(location.href);
      url.searchParams.set('days', String(rangeDays));
      if (overlay) url.searchParams.set('overlay', 'mcap'); else url.searchParams.delete('overlay');
      history.replaceState(null, '', url);
    };
    rangeNavEl.onclick = (e) => {
      const daysBtn = e.target.closest('button[data-days]');
      if (daysBtn) { rangeDays = Number(daysBtn.dataset.days); redrawChart(); return; }
      if (e.target.closest('#mcapToggle')) { overlay = !overlay; redrawChart(); }
    };
  } catch (error) {
    console.error(error);
    app.innerHTML = '<p class="notice">Die Daten konnten nicht vollständig geladen werden. Bitte die Seite neu laden.</p>';
  }
}());
