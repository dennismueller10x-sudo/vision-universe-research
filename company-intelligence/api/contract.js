/* Static intelligence contract. Opt-in consumer; no production feature is changed. */
(function (global) {
  'use strict';
  const SCHEMA = 'vu-company-intelligence-1.0.0';
  const identity = /^(?:iss_cik_\d{10}|vu_[a-f0-9]{14})$/;
  function unavailable(reason, extra = {}) { return { schema: SCHEMA, state: 'UNAVAILABLE', reason, ...extra }; }
  function validDay(value) { const parsed = Date.parse(value); return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value; }
  function safeLink(value) {
    try { const url = new URL(value); const host = url.hostname.toLowerCase(); const privateHost = /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|\[|metadata\.)/.test(host) || /\.(?:local|internal)$/.test(host); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !privateHost && (!url.port || ['80','443'].includes(url.port)) ? url.href : null; }
    catch { return null; }
  }
  async function load(ticker, options = {}) {
    if (options.enabled !== true) return unavailable('FEATURE_DISABLED');
    const symbol = String(ticker || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) return unavailable('INVALID_TICKER');
    const fetcher = options.fetch || global.fetch.bind(global);
    const base = options.base || '/company-intelligence/data/';
    try {
      const response = await fetcher(base + 'index.json', { signal: options.signal, cache: 'no-cache' });
      if (!response.ok) return unavailable('INDEX_UNAVAILABLE');
      const index = await response.json();
      if (index.schema !== SCHEMA || !['PREVIEW', 'AVAILABLE'].includes(index.state)) return unavailable('FEATURE_DISABLED');
      let lookup = index;
      if (Array.isArray(index.lookupShards)) {
        if (!/^[a-f0-9]{24}$/.test(index.generation)) return unavailable('INVALID_GENERATION');
        const prefix = symbol.slice(0, 2);
        if (!index.lookupShards.includes(prefix)) return unavailable('UNKNOWN_TICKER');
        const shardResponse = await fetcher(base + 'snapshots/' + index.generation + '/lookup/' + prefix + '.json', { signal: options.signal, cache: 'default' });
        if (!shardResponse.ok) return unavailable('LOOKUP_UNAVAILABLE');
        lookup = await shardResponse.json();
        if (lookup.schema !== SCHEMA || lookup.generation !== index.generation) return unavailable('LOOKUP_GENERATION_MISMATCH');
      }
      const listings = lookup.tickers?.[symbol];
      if (!Array.isArray(listings) || !listings.length) return unavailable('UNKNOWN_TICKER');
      const companies = [...new Set(listings.map(l => l.companyId))];
      if (companies.length !== 1) return unavailable('AMBIGUOUS_TICKER', { listings });
      const companyId = companies[0];
      if (!identity.test(companyId)) return unavailable('INVALID_IDENTITY');
      const path = lookup.companies?.[companyId];
      if (!path) return unavailable('NO_COMPANY_DATA', { ticker: symbol, companyId });
      if (!/^snapshots\/[a-f0-9]{24}\/(?:iss_cik_\d{10}|vu_[a-f0-9]{14})\.json$/.test(path) || !path.endsWith('/' + companyId + '.json')) return unavailable('INVALID_DATA_PATH');
      if (Array.isArray(index.lookupShards) && !path.startsWith('snapshots/' + index.generation + '/')) return unavailable('LOOKUP_GENERATION_MISMATCH');
      const dataResponse = await fetcher(base + path, { signal: options.signal, cache: 'default' });
      if (!dataResponse.ok) return unavailable('COMPANY_DATA_UNAVAILABLE');
      const payload = await dataResponse.json();
      if (payload.schema !== SCHEMA || payload.companyId !== companyId || !['AVAILABLE', 'NO_DATA'].includes(payload.state) ||
          !payload.listings?.some(l => l.symbol === symbol && listings.some(m => m.instrumentId === l.instrumentId && m.companyId === companyId))) return unavailable('IDENTITY_MISMATCH');
      for (const key of ['news', 'events', 'earnings', 'filings', 'calls', 'timeline']) if (!Array.isArray(payload[key]) || payload[key].length > 200) return unavailable('INVALID_SECTIONS');
      if (['news', 'events', 'earnings', 'filings', 'calls', 'timeline'].some(key => payload[key].some(item => !item || item.companyId !== companyId))) return unavailable('SECTION_IDENTITY_MISMATCH');
      for (const key of ['materials', 'presentations', 'materialEvents', 'earningsBundles']) if (payload[key] !== undefined && (!Array.isArray(payload[key]) || payload[key].length > 200 || payload[key].some(item => !item || item.companyId !== companyId))) return unavailable('INVALID_MATERIALS');
      if (payload.latestFinancials !== undefined && (!payload.latestFinancials || !['AVAILABLE', 'UNAVAILABLE'].includes(payload.latestFinancials.state))) return unavailable('INVALID_FINANCIAL_SUMMARY');
      const generated = Date.parse(payload.generatedAt), now = options.now === undefined ? Date.now() : Date.parse(options.now);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload.generatedAt) || !Number.isFinite(generated) || !Number.isFinite(now) || generated > now + 300000 || new Date(generated).toISOString().replace('.000Z', 'Z') !== payload.generatedAt) return unavailable('INVALID_TIMESTAMP');
      if (now - generated > 7 * 86400000) return unavailable('SNAPSHOT_EXPIRED');
      // Estimated dates must never cross the data boundary as confirmed.
      if (payload.events.some(e => e.eventType === 'EARNINGS_ESTIMATED' && (e.confirmationStatus !== 'ESTIMATED' || !validDay(e.dateStart) || !validDay(e.dateEnd) || e.dateStart > e.dateEnd))) return unavailable('INVALID_CALENDAR_CONFIDENCE');
      if (payload.events.some(e => e.eventType !== 'EARNINGS_ESTIMATED' && (!validDay(e.date) || e.confirmationStatus !== 'CONFIRMED' || (e.startsAt && (!Number.isFinite(Date.parse(e.startsAt)) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(e.startsAt)))))) return unavailable('INVALID_CONFIRMED_EVENT');
      if (payload.earningsBundles?.some(b => !Array.isArray(b.eventIds) || !Array.isArray(b.materials) || b.materials.length > 20 || b.materials.some(d => d.companyId !== companyId))) return unavailable('INVALID_EARNINGS_BUNDLE');
      return { ...payload, ticker: symbol, preview: index.state === 'PREVIEW', stale: now - generated > 48 * 3600000 };
    } catch (error) { return unavailable(error?.name === 'AbortError' ? 'REQUEST_ABORTED' : 'FETCH_FAILED'); }
  }
  const api = { SCHEMA, load, safeLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.VUCompanyIntelligence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
