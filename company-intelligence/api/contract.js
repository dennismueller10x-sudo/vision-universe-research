/* Static intelligence contract. Opt-in consumer; no production feature is changed. */
(function (global) {
  'use strict';
  const SCHEMA = 'vu-company-intelligence-1.0.0';
  const identity = /^(?:iss_cik_\d{10}|vu_[a-f0-9]{14})$/;
  function unavailable(reason, extra = {}) { return { schema: SCHEMA, state: 'UNAVAILABLE', reason, ...extra }; }
  const transientStatuses = new Set([429, 500, 502, 503, 504]);
  function retryPause(ms, signal) {
    return new Promise((resolve, reject) => {
      const aborted = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' })); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, ms);
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) aborted();
    });
  }
  // At most three attempts per static resource. Data/identity validation is never retried.
  async function fetchWithRetry(fetcher, url, init = {}, onRetry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (init.signal?.aborted) throw Object.assign(new Error('Request aborted'), { name: 'AbortError' });
      let response, error;
      try { response = await fetcher(url, init); }
      catch (caught) { error = caught; }
      if (!error && (!transientStatuses.has(response.status) || attempt === 3)) return response;
      if (error && (!['TypeError', 'TimeoutError'].includes(error.name) || init.signal?.aborted || attempt === 3)) throw error;
      onRetry?.({ attempt, status: response?.status || null, error: error?.name || null });
      // Release the failed response body before retrying the same immutable resource.
      if (response?.body?.cancel) await response.body.cancel().catch(() => {});
      await retryPause(attempt === 1 ? 250 : 750, init.signal);
    }
  }
  function validDay(value) { const parsed = Date.parse(value); return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value; }
  function safeLink(value) {
    try { const url = new URL(value); const host = url.hostname.toLowerCase().replace(/\.$/, ''); const privateHost = host.endsWith('.localhost') || /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|\[|metadata\.)/.test(host) || /\.(?:local|internal)$/.test(host); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !privateHost && (!url.port || ['80','443'].includes(url.port)) ? url.href : null; }
    catch { return null; }
  }
  function validProfile(p, companyId, generatedAt) {
    if (!p || p.schema !== 'company-profile-1.0.0' || p.state !== 'AVAILABLE' || p.companyId !== companyId ||
        typeof p.companyName !== 'string' || p.companyName.length > 200 || typeof p.description !== 'string' || p.description.length < 40 || p.description.length > 1200 ||
        !['en','de'].includes(p.language) || !['HIGH','MEDIUM'].includes(p.confidence) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(p.lastVerifiedAt) ||
        !Number.isFinite(Date.parse(p.lastVerifiedAt)) || p.lastVerifiedAt > generatedAt || (p.officialWebsite && !safeLink(p.officialWebsite))) return false;
    for (const key of ['businessActivities','productsServices','customerMarkets','majorSegments']) {
      if (!Array.isArray(p[key]) || p[key].length > 5 || p[key].some(v => typeof v !== 'string' || v.length > 700)) return false;
    }
    return Array.isArray(p.sources) && p.sources.length > 0 && p.sources.length <= 4 && p.sources.every(s => {
      if (!s || s.companyId !== companyId || !['SEC','FIRST_PARTY_WEB'].includes(s.type) || !safeLink(s.url) || !/^[a-f0-9]{64}$/.test(s.contentHash)) return false;
      if (s.type === 'SEC') { const cik = companyId.match(/^iss_cik_(\d{10})$/)?.[1]; const path = new URL(s.url); return Boolean(cik) && path.hostname === 'www.sec.gov' && path.pathname.startsWith('/Archives/edgar/data/' + Number(cik) + '/') && ['10-K','20-F','40-F'].includes(s.form); }
      return true;
    });
  }
  async function load(ticker, options = {}) {
    if (options.enabled !== true) return unavailable('FEATURE_DISABLED');
    const symbol = String(ticker || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) return unavailable('INVALID_TICKER');
    const fetcher = options.fetch || global.fetch.bind(global);
    const base = options.base || '/company-intelligence/data/';
    try {
      const response = await fetchWithRetry(fetcher, base + 'index.json', { signal: options.signal, cache: 'no-cache' });
      if (!response.ok) return unavailable('INDEX_UNAVAILABLE');
      const index = await response.json();
      if (index.schema !== SCHEMA || !['PREVIEW', 'AVAILABLE'].includes(index.state)) return unavailable('FEATURE_DISABLED');
      if (options.expectedGeneration && index.generation !== options.expectedGeneration) return unavailable('PRODUCTION_GENERATION_MISMATCH');
      let lookup = index;
      if (Array.isArray(index.lookupShards)) {
        if (!/^[a-f0-9]{24}$/.test(index.generation)) return unavailable('INVALID_GENERATION');
        const prefix = symbol.slice(0, 2);
        if (!index.lookupShards.includes(prefix)) return unavailable('UNKNOWN_TICKER');
        const shardResponse = await fetchWithRetry(fetcher, base + 'snapshots/' + index.generation + '/lookup/' + prefix + '.json', { signal: options.signal, cache: 'default' });
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
      const dataResponse = await fetchWithRetry(fetcher, base + path, { signal: options.signal, cache: 'default' });
      if (!dataResponse.ok) return unavailable('COMPANY_DATA_UNAVAILABLE');
      const payload = await dataResponse.json();
      if (index.generatedAt && payload.generatedAt !== index.generatedAt) return unavailable('COMPANY_GENERATION_MISMATCH');
      if (payload.schema !== SCHEMA || payload.companyId !== companyId || !['AVAILABLE', 'NO_DATA'].includes(payload.state) ||
          !payload.listings?.some(l => l.symbol === symbol && listings.some(m => m.instrumentId === l.instrumentId && m.companyId === companyId))) return unavailable('IDENTITY_MISMATCH');
      for (const key of ['news', 'events', 'earnings', 'filings', 'calls', 'timeline']) if (!Array.isArray(payload[key]) || payload[key].length > 200) return unavailable('INVALID_SECTIONS');
      if (['news', 'events', 'earnings', 'filings', 'calls', 'timeline'].some(key => payload[key].some(item => !item || item.companyId !== companyId))) return unavailable('SECTION_IDENTITY_MISMATCH');
      for (const key of ['materials', 'presentations', 'materialEvents', 'earningsBundles']) if (payload[key] !== undefined && (!Array.isArray(payload[key]) || payload[key].length > 200 || payload[key].some(item => !item || item.companyId !== companyId))) return unavailable('INVALID_MATERIALS');
      if (payload.latestFinancials !== undefined && (!payload.latestFinancials || !['AVAILABLE', 'UNAVAILABLE'].includes(payload.latestFinancials.state))) return unavailable('INVALID_FINANCIAL_SUMMARY');
      const generated = Date.parse(payload.generatedAt), now = options.now === undefined ? Date.now() : Date.parse(options.now);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload.generatedAt) || !Number.isFinite(generated) || !Number.isFinite(now) || generated > now + 300000 || new Date(generated).toISOString().replace('.000Z', 'Z') !== payload.generatedAt) return unavailable('INVALID_TIMESTAMP');
      if (payload.companyProfile !== undefined && !validProfile(payload.companyProfile, companyId, payload.generatedAt)) return unavailable('INVALID_COMPANY_PROFILE');
      if (now - generated > 7 * 86400000) return unavailable('SNAPSHOT_EXPIRED');
      // Estimated dates must never cross the data boundary as confirmed.
      if (payload.events.some(e => e.eventType === 'EARNINGS_ESTIMATED' && (e.confirmationStatus !== 'ESTIMATED' || !validDay(e.dateStart) || !validDay(e.dateEnd) || e.dateStart > e.dateEnd))) return unavailable('INVALID_CALENDAR_CONFIDENCE');
      if (payload.events.some(e => e.eventType !== 'EARNINGS_ESTIMATED' && (!validDay(e.date) || e.confirmationStatus !== 'CONFIRMED' || (e.startsAt && (!Number.isFinite(Date.parse(e.startsAt)) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(e.startsAt)))))) return unavailable('INVALID_CONFIRMED_EVENT');
      if (payload.earningsBundles?.some(b => !Array.isArray(b.eventIds) || !Array.isArray(b.materials) || b.materials.length > 20 || b.materials.some(d => d.companyId !== companyId))) return unavailable('INVALID_EARNINGS_BUNDLE');
      return { ...payload, ticker: symbol, preview: index.state === 'PREVIEW' && !options.expectedGeneration, stale: now - generated > 48 * 3600000 };
    } catch (error) { return unavailable(error?.name === 'AbortError' ? 'REQUEST_ABORTED' : 'FETCH_FAILED'); }
  }
  const api = { SCHEMA, load, safeLink, validProfile, fetchWithRetry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.VUCompanyIntelligence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
