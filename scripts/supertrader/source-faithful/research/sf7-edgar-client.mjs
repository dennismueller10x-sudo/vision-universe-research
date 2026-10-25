/**
 * Supertrader 7.0 – EDGAR client of rule set 1.4.0 (owner decision E7-1): free public SEC EDGAR only, sequential, at most
 * 2 requests per second, 30 s timeout, the User-Agent of validation/sec-pit.mjs, and a HARD total budget enforced fail
 * closed: a request beyond the budget is never sent (it returns { refused: true }); the counter can never pass it.
 *
 * Caches first: a private cache (bucket key EDGAR_CACHE_KEY, never committed) holds per CIK the merged index fields and
 * per accession number only the EXTRACTED statements (integrity/ca-edgar.mjs#extractStatements: ratio, dates, flags,
 * passage SHA-256) – never document text. Each accession keeps one extraction per parser version (1.4.1: the frozen
 * 1.4.0 parser and the 1.4.1 parser run on the same text for the before / after); a cached accession is reused only
 * when every requested parser version is present. Cache entries of schema 1.0.0 (one extraction) are migrated.
 *
 *   data.sec.gov/submissions/CIK##########.json      recent page (+ files[] older pages only when the window is not covered)
 *   www.sec.gov/Archives/edgar/data/<cik>/<acc>/<doc> the primary document of a selected filing
 */
import { EDGAR_BUDGET, DOC_PARSER_VERSION, extractStatements } from '../integrity/ca-edgar.mjs';

/** Default parser set: the current parser only. */
export const DEFAULT_EXTRACTORS = Object.freeze([Object.freeze({ parser: DOC_PARSER_VERSION, extract: extractStatements })]);

export const EDGAR_CLIENT_VERSION = 'sf7-edgar-client-1.1.0';
export const EDGAR_CACHE_KEY = '_validation/edgar-ca-r1.json.gz';
export const emptyCache = () => ({ schema: 'supertrader-edgar-ca-cache-1.1.0', submissions: {}, documents: {} });
/** Schema 1.0.0 stored one extraction per accession (with its parser field); 1.1.0 stores { byParser: { version: extraction } }. */
export function migrateCache(c) {
  if (!c) return emptyCache();
  const documents = {};
  for (const [acc, e] of Object.entries(c.documents || {})) documents[acc] = e?.byParser ? e : { form: e?.form, filingDate: e?.filingDate, cik: e?.cik, byParser: e?.parser ? { [e.parser]: e } : {} };
  return { schema: 'supertrader-edgar-ca-cache-1.1.0', submissions: c.submissions || {}, documents };
}
const pad = (cik) => String(cik).replace(/^0+/, '').padStart(10, '0');
const INDEX_FIELDS = ['form', 'filingDate', 'items', 'accessionNumber', 'primaryDocument'];
const pick = (rec) => Object.fromEntries(INDEX_FIELDS.map((f) => [f, [...(rec?.[f] || [])]]));
const oldestOf = (ix) => ix.filingDate.reduce((m, x) => (x && (!m || x < m) ? x : m), null);

export function createEdgarClient({ userAgent, fetchImpl = fetch, budget = EDGAR_BUDGET, cache = emptyCache(), extractors = DEFAULT_EXTRACTORS, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {}) {
  if (!userAgent) throw new Error('EDGAR_USER_AGENT_REQUIRED');
  cache = migrateCache(cache);
  const st = { requests: 0, byKind: { submissions: 0, olderPage: 0, document: 0 }, ok: 0, failed: 0, refused: 0, cacheHits: { submissions: 0, olderPage: 0, document: 0 }, starts: [] };
  let last = -Infinity;
  const exhausted = () => st.requests >= budget.totalRequests;
  /** One throttled request; never more than budget.totalRequests are sent (fail closed). */
  async function request(url, kind, as) {
    if (exhausted()) { st.refused++; return { refused: true }; }
    const wait = last + budget.minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    last = now(); st.starts.push(last); st.requests++; st.byKind[kind]++;
    if (st.requests > budget.totalRequests) throw new Error('EDGAR_BUDGET_BREACH'); // unreachable by construction
    try {
      const r = await fetchImpl(url, { headers: { 'User-Agent': userAgent, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(budget.timeoutMs) });
      if (!r.ok) { st.failed++; return { ok: false, status: r.status }; }
      const body = as === 'json' ? await r.json() : await r.text();
      st.ok++; return { ok: true, body };
    } catch { st.failed++; return { ok: false, status: 'ERROR' }; }
  }
  /** Recent index page (cached); the 1.3.0 view { form, filingDate, items } of that page only. */
  async function recent(cik) {
    const k = pad(cik);
    if (cache.submissions[k]) st.cacheHits.submissions++;
    else {
      const x = await request(`https://data.sec.gov/submissions/CIK${k}.json`, 'submissions', 'json');
      if (x.refused) return { refused: true };
      if (!x.ok) return null;
      cache.submissions[k] = { recent: pick(x.body?.filings?.recent), files: (x.body?.filings?.files || []).map((f) => ({ name: f.name, filingFrom: f.filingFrom, filingTo: f.filingTo })), pages: {} };
    }
    return cache.submissions[k];
  }
  return {
    stats: () => ({ client: EDGAR_CLIENT_VERSION, budget, requests: st.requests, byKind: { ...st.byKind }, ok: st.ok, failed: st.failed, refusedOverBudget: st.refused, cacheHits: { ...st.cacheHits } }),
    starts: () => [...st.starts],
    exhausted,
    exportCache: () => cache,
    /** 1.3.0 filing lookup (runner fetchFilings): the recent page, exactly the fields 1.3.0 read. */
    async submissions13(cik) { const s = await recent(cik); if (!s || s.refused) return null; return { form: [...s.recent.form], filingDate: [...s.recent.filingDate], items: [...s.recent.items] }; },
    /**
     * Index of the CIK covering [lo, hi]: the recent page plus, only when it does not reach back to lo, the older pages
     * that overlap the window (at most budget.indexPagesPerCik pages in all). { index, covered } or { refused } / null.
     */
    async indexCovering(cik, lo, hi) {
      const s = await recent(cik); if (!s || s.refused) return s;
      const parts = [s.recent];
      let oldest = oldestOf(s.recent), gap = false;
      if (!oldest || oldest > lo) {
        const need = s.files.filter((f) => f.filingTo >= lo && f.filingFrom <= hi).sort((a, b) => (a.filingTo < b.filingTo ? 1 : -1));
        // fail closed: an overlapping page beyond the page cap or one that could not be read leaves a gap -> not covered
        if (need.length > budget.indexPagesPerCik - 1) gap = true;
        for (const f of need.slice(0, budget.indexPagesPerCik - 1)) {
          if (s.pages[f.name]) { st.cacheHits.olderPage++; parts.push(s.pages[f.name]); continue; }
          const x = await request(`https://data.sec.gov/submissions/${f.name}`, 'olderPage', 'json');
          if (x.refused) return { refused: true };
          if (!x.ok) { gap = true; continue; }
          s.pages[f.name] = pick(x.body); parts.push(s.pages[f.name]);
        }
      }
      const index = Object.fromEntries(INDEX_FIELDS.map((f) => [f, parts.flatMap((p) => p[f] || [])]));
      oldest = oldestOf(index);
      return { index, covered: !gap && !!oldest && oldest <= lo };
    },
    /** Extracted statements of one filing's primary document (cached by accession; the text is parsed and dropped). */
    async document(cik, entry) {
      const acc = entry.accessionNumber, hit = cache.documents[acc];
      const out = (e, cached) => ({ ok: true, extractions: Object.fromEntries(extractors.map((x) => [x.parser, e.byParser[x.parser]])), extraction: e.byParser[extractors[0].parser], cached });
      if (hit && extractors.every((x) => hit.byParser?.[x.parser])) { st.cacheHits.document++; return out(hit, true); }
      const nod = acc.replace(/-/g, ''), cikInt = String(Number(String(cik).replace(/^0+/, '') || '0'));
      const file = entry.primaryDocument || `${acc}.txt`;
      const x = await request(`https://www.sec.gov/Archives/edgar/data/${cikInt}/${nod}/${file}`, 'document', 'text');
      if (x.refused) return { refused: true };
      if (!x.ok) return { ok: false };
      const e = { form: entry.form, filingDate: entry.filingDate, cik: pad(cik), byParser: { ...(hit?.byParser || {}) } };
      for (const ex of extractors) e.byParser[ex.parser] = ex.extract(x.body);
      cache.documents[acc] = e;
      return out(e, false);
    },
  };
}
