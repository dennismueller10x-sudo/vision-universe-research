(function () {
  'use strict';
  const contract = window.VUCompanyIntelligence;
  const params = new URLSearchParams(location.search);
  const enabled = params.get('preview') === '1';
  const status = document.getElementById('status'), results = document.getElementById('results'), ticker = document.getElementById('ticker');
  let controller;
  function text(tag, value, className) { const e = document.createElement(tag); e.textContent = String(value ?? 'Unavailable'); if (className) e.className = className; return e; }
  function link(parent, label, url) { const safe = contract.safeLink(url); if (!safe) return; const a = text('a', label); a.href = safe; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a); }
  function section(title, items, render) { if (!items.length) return; const s = document.createElement('section'); s.append(text('h2', title)); for (const item of items) s.append(render(item)); results.append(s); }
  function card(item) { const a = document.createElement('article'); a.append(text('h3', item.headline)); const date = item.timestampPrecision === 'DISCOVERY_TIME' ? 'Observed ' + item.observedAt : item.timestampPrecision === 'SOURCE_UPDATED_TIME' ? 'Source updated ' + item.observedAt : item.publishedAt || item.publishedDate || item.date || 'Date unavailable'; a.append(text('p', date, 'meta')); if (item.importance) a.append(text('p', item.importance + ' · ' + item.categories.join(', '), 'meta')); link(a, 'Open original source', item.canonicalUrl || item.sourceUrl); if (item.provenance?.length) { const ref = item.provenance[0]; a.append(text('p', 'Source: ' + ref.originalSource + (ref.distributor ? ' · distributed by ' + ref.distributor : ''), 'meta')); } if (item.provenance) a.append(text('p', item.provenance.length + ' source reference(s) · match confidence ' + Math.round(item.confidence * 100) + '%', 'meta')); return a; }
  async function load() {
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal;
    results.replaceChildren(); status.textContent = 'Loading…';
    const payload = await contract.load(ticker.value, { enabled, signal });
    if (signal.aborted) return;
    if (payload.state !== 'AVAILABLE') { status.textContent = 'Intelligence unavailable: ' + payload.reason; return; }
    status.textContent = payload.companyName + ' · ' + payload.ticker + ' · ' + (payload.stale ? 'Snapshot is stale. ' : '') + 'Preview · Updated ' + payload.generatedAt;
    if (payload.companyProfile?.state === 'AVAILABLE') section('Company', [payload.companyProfile], p => {
      const a = document.createElement('article'), description = text('p', p.description); description.lang = p.language;
      a.append(description); link(a, 'Company website', p.officialWebsite);
      for (const source of p.sources) link(a, source.type === 'SEC' ? 'Source: annual report' : 'Source: company', source.url);
      if (p.stale) { const filing = p.sources.find(source => source.type === 'SEC' && source.filedAt); a.append(text('p', 'Older company description · ' + (filing ? 'Annual report filed ' + filing.filedAt : 'Last verified ' + p.lastVerifiedAt), 'meta')); }
      return a;
    });
    const materialSince = new Date(Date.parse(payload.generatedAt) - 90 * 86400000).toISOString().slice(0, 10);
    section('Recent material SEC disclosures', (payload.materialEvents || []).filter(e => e.date >= materialSince && e.date <= payload.generatedAt.slice(0, 10)).slice(0, 5), e => { const a = card(e); a.append(text('p', 'Filing date · Verified filing categories · Open the filing for transaction terms and people involved.', 'meta')); return a; });
    section('News', payload.news, card);
    section('Upcoming events', payload.events, e => { const a = card(e); a.prepend(text('p', e.confirmationStatus === 'ESTIMATED' ? 'ESTIMATED · ' + e.dateStart + ' – ' + e.dateEnd : e.confirmationStatus + ' · ' + e.date + (e.time ? ' ' + e.time + ' ' + (e.timezone || '') : ''), 'meta')); return a; });
    section('Earnings releases & periodic reports', payload.earnings.filter(e => e.eventType !== 'EARNINGS_CANDIDATE').slice(0, 3), e => { const a = card(e); a.append(text('p', e.fiscalQuarter && e.fiscalYear ? e.fiscalQuarter + ' · FY ' + e.fiscalYear : 'Reporting period not verified', 'meta')); const s = e.summary; if (s?.state === 'AVAILABLE') { a.append(text('p', 'Latest known reported values · source snapshot ' + s.sourceAsOf, 'meta')); const values = document.createElement('div'); values.className = 'values'; for (const [name, m] of Object.entries(s.metrics)) { const v = m.current; values.append(text('div', name.replaceAll('_', ' ') + ': ' + (v ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v.value) + ' ' + v.unit : 'Unavailable'), 'value')); } a.append(values); } else a.append(text('p', 'Metrics unavailable: ' + (s?.reason || 'No verified summary'))); for (const g of e.guidance?.ranges || []) { a.append(text('p', 'Guidance evidence · ' + g.period.fiscalQuarter + ' FY ' + g.period.fiscalYear + ': ' + new Intl.NumberFormat('en-US', {notation: 'compact'}).format(g.low) + ' – ' + new Intl.NumberFormat('en-US', {notation: 'compact'}).format(g.high) + ' ' + (g.currency || 'currency unverified') + ' · ' + g.verificationState, 'meta')); link(a, 'Guidance source', g.sourceUrl); } return a; });
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
        a.append(text('p', c.comparison.replaceAll('_', ' ') + (c.interpretation === 'BALANCE_CHANGE_HAS_NO_UNIVERSAL_GOOD_DIRECTION' ? ' · Context needed to interpret balance change' : c.interpretation === 'SHARE_COUNT_CHANGE_REQUIRES_SPLIT_ISSUANCE_BUYBACK_CONTEXT' ? ' · Split, issuance and buyback context needed' : ''), 'meta')); return a;
      });
    }
    section('Materials & report links (10 references)', (payload.materials || []).slice(0, 10), d => { const a = document.createElement('article'); a.append(text('h3', d.label || (d.type || 'Source document').replaceAll('_', ' '))); a.append(text('p', d.fiscalQuarter && d.fiscalYear ? d.fiscalQuarter + ' · FY ' + d.fiscalYear : d.date || 'Period/date unavailable', 'meta')); link(a, 'Open source document', d.url); return a; });
    section('Filings', payload.filings.slice(0, 10), card);
    section('Calls & webcasts', payload.calls, e => { const a = card(e); if (e.fiscalQuarter) a.append(text('p', e.fiscalQuarter + ' · FY ' + e.fiscalYear, 'meta')); link(a, 'Webcast', e.webcastUrl); link(a, 'Company transcript', e.transcriptUrl); return a; });
  }
  document.getElementById('search').addEventListener('submit', e => { e.preventDefault(); load(); });
  if (params.has('ticker')) ticker.value = params.get('ticker');
  if (enabled) load();
})();
