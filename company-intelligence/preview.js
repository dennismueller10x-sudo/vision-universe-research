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
    section('Latest earnings & reports', payload.earnings.slice(0, 3), e => { const a = card(e); a.append(text('p', e.fiscalQuarter && e.fiscalYear ? e.fiscalQuarter + ' · FY ' + e.fiscalYear : 'Reporting period not verified', 'meta')); const s = e.summary; if (s?.state === 'AVAILABLE') { a.append(text('p', 'Latest known reported values · source snapshot ' + s.sourceAsOf, 'meta')); const values = document.createElement('div'); values.className = 'values'; for (const [name, m] of Object.entries(s.metrics)) { const v = m.current; values.append(text('div', name.replaceAll('_', ' ') + ': ' + (v ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v.value) + ' ' + v.unit : 'Unavailable'), 'value')); } a.append(values); } else a.append(text('p', 'Metrics unavailable: ' + (s?.reason || 'No verified summary'))); return a; });
    section('Filings', payload.filings.slice(0, 10), card);
    section('Calls & webcasts', payload.calls, card);
  }
  document.getElementById('search').addEventListener('submit', e => { e.preventDefault(); load(); });
  if (params.has('ticker')) ticker.value = params.get('ticker');
  if (enabled) load();
})();
