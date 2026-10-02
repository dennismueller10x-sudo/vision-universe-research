(function () {
  'use strict';
  const contract = window.VUCompanyIntelligence;
  const params = new URLSearchParams(location.search);
  const enabled = params.get('preview') === '1';
  const status = document.getElementById('status'), results = document.getElementById('results'), ticker = document.getElementById('ticker');
  let controller;
  function text(tag, value, className) { const e = document.createElement(tag); e.textContent = String(value ?? 'Unavailable'); if (className) e.className = className; return e; }
  function link(parent, label, url) { const safe = contract.safeLink(url); if (!safe) return; const a = text('a', label); a.href = safe; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a); }
  function section(title, items, render) { const s = document.createElement('section'); s.append(text('h2', title)); if (!items.length) s.append(text('p', 'No verified data available.')); for (const item of items) s.append(render(item)); results.append(s); }
  function card(item) { const a = document.createElement('article'); a.append(text('h3', item.headline)); const date = item.timestampPrecision === 'DISCOVERY_TIME' ? 'Observed ' + item.observedAt : item.timestampPrecision === 'SOURCE_UPDATED_TIME' ? 'Source updated ' + item.observedAt : item.publishedAt || item.publishedDate || item.date || 'Date unavailable'; a.append(text('p', date, 'meta')); if (item.importance) a.append(text('p', item.importance + ' · ' + item.categories.join(', '), 'meta')); link(a, 'Open original source', item.canonicalUrl || item.sourceUrl); if (item.provenance) a.append(text('p', item.provenance.length + ' source reference(s) · match confidence ' + Math.round(item.confidence * 100) + '%', 'meta')); return a; }
  async function load() {
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal;
    results.replaceChildren(); status.textContent = 'Loading…';
    const payload = await contract.load(ticker.value, { enabled, signal });
    if (signal.aborted) return;
    if (payload.state !== 'AVAILABLE') { status.textContent = 'Intelligence unavailable: ' + payload.reason; return; }
    status.textContent = payload.companyName + ' · ' + payload.ticker + ' · ' + (payload.stale ? 'Snapshot is stale. ' : '') + 'Preview · Updated ' + payload.generatedAt;
    section('News', payload.news, card);
    section('Upcoming events', payload.events, e => { const a = card(e); a.prepend(text('p', e.confirmationStatus === 'ESTIMATED' ? 'ESTIMATED · ' + e.dateStart + ' – ' + e.dateEnd : e.confirmationStatus + ' · ' + e.date + (e.time ? ' ' + e.time + ' ' + (e.timezone || '') : ''), 'meta')); return a; });
    section('Latest earnings & reports', payload.earnings.slice(0, 3), e => { const a = card(e); a.append(text('p', e.fiscalQuarter && e.fiscalYear ? e.fiscalQuarter + ' · FY ' + e.fiscalYear : 'Reporting period not verified', 'meta')); const s = e.summary; if (s?.state === 'AVAILABLE') { a.append(text('p', 'Latest known reported values · source snapshot ' + s.sourceAsOf, 'meta')); const values = document.createElement('div'); values.className = 'values'; for (const [name, m] of Object.entries(s.metrics)) { const v = m.current; values.append(text('div', name.replaceAll('_', ' ') + ': ' + (v ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v.value) + ' ' + v.unit : 'Unavailable'), 'value')); } a.append(values); } else a.append(text('p', 'Metrics unavailable: ' + (s?.reason || 'No verified summary'))); for (const g of e.guidance?.ranges || []) { a.append(text('p', 'Guidance evidence · ' + g.period.fiscalQuarter + ' FY ' + g.period.fiscalYear + ': ' + new Intl.NumberFormat('en-US', {notation: 'compact'}).format(g.low) + ' – ' + new Intl.NumberFormat('en-US', {notation: 'compact'}).format(g.high) + ' ' + (g.currency || 'currency unverified') + ' · ' + g.verificationState, 'meta')); link(a, 'Guidance source', g.sourceUrl); } return a; });
    const financial = payload.latestFinancials;
    if (financial?.state === 'AVAILABLE') {
      section('Latest reported financials', [financial], s => { const a = document.createElement('article');
        a.append(text('h3', s.fiscalQuarter + ' · FY ' + s.fiscalYear));
        a.append(text('p', 'SEC facts · Latest known values · ' + (s.stale ? 'Historical data is stale · ' : '') + 'Period end ' + (s.reportingPeriod || 'unavailable') + ' · Source snapshot ' + s.sourceAsOf, 'meta'));
        const values = document.createElement('div'); values.className = 'values';
        for (const name of ['revenue', 'eps_diluted', 'gross_margin', 'operating_margin', 'net_income', 'operating_cash_flow', 'free_cash_flow']) {
          const metric = s.metrics[name], v = metric?.current;
          values.append(text('div', name.replaceAll('_', ' ') + ': ' + (v ? new Intl.NumberFormat('en-US', {notation: Math.abs(v.value) >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: 2}).format(v.value) + ' ' + v.unit + (metric.yoy?.percent != null ? ' · ' + metric.yoy.percent.toFixed(1) + '% YoY' : '') : 'Unavailable'), 'value'));
        }
        a.append(values); return a;
      });
      section('What changed?', financial.whatChanged || [], c => { const a = document.createElement('article');
        a.append(text('h3', c.metric.replaceAll('_', ' ')));
        a.append(text('p', (c.classification || c.direction) + ' · ' + (c.previous != null ? new Intl.NumberFormat('en-US', {notation: 'compact', maximumFractionDigits: 2}).format(c.previous) + ' → ' + new Intl.NumberFormat('en-US', {notation: 'compact', maximumFractionDigits: 2}).format(c.current) : new Intl.NumberFormat('en-US', {notation: 'compact', maximumFractionDigits: 2}).format(c.absolute)) + ' ' + c.unit));
        a.append(text('p', c.comparison.replaceAll('_', ' ') + (c.interpretation === 'BALANCE_CHANGE_HAS_NO_UNIVERSAL_GOOD_DIRECTION' ? ' · Context needed to interpret balance change' : ''), 'meta')); return a;
      });
    }
    section('Materials & reports', payload.materials || [], d => { const a = document.createElement('article'); a.append(text('h3', (d.type || 'Source document').replaceAll('_', ' '))); link(a, 'Open source document', d.url); return a; });
    section('Filings', payload.filings.slice(0, 10), card);
    section('Calls & webcasts', payload.calls, e => { const a = card(e); if (e.fiscalQuarter) a.append(text('p', e.fiscalQuarter + ' · FY ' + e.fiscalYear, 'meta')); link(a, 'Webcast', e.webcastUrl); link(a, 'Company transcript', e.transcriptUrl); return a; });
  }
  document.getElementById('search').addEventListener('submit', e => { e.preventDefault(); load(); });
  if (params.has('ticker')) ticker.value = params.get('ticker');
  if (enabled) load();
})();
