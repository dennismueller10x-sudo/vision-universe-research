'use strict';
// V12 LISTREF: public redaction of the row-level outputs (correction after the independent V12 review, LISTREF MAJOR 6).
// The repository keeps only counts, CIKs, keyed-hash chain ids and coarsened years; provider row metadata (ticker, exchange,
// provider dates, endSource, link grade per row, day differences between provider end and SEC event) stays in the private full
// versions (<scratchpad>/v12-private/listref/full/). SEC data of the delisting events (CIK, event date, forms, accessions,
// issuer name) are public SEC facts and stay.
// chainId = HMAC-SHA256(privateKey, ticker|exchange|endYear) truncated to 16 hex: joinable across the two public files, not
// reversible by a ticker dictionary without the private key (<scratchpad>/v12-private/listref/work/chain-hash-key.txt).
const crypto = require('node:crypto');

const BUCKET_YEARS = 5;
const FORBIDDEN_FIELDS = Object.freeze(['ticker', 'exchange', 'endSource', 'dayDiff', 'dayDiffEndToEvent', 'linkGrade', 'startDate', 'endDate', 'providerEnd']);

function chainId(key, ticker, exchange, endYear) {
  if (!key || key.length < 32) throw Error('LISTREF_HASH_KEY_REQUIRED');
  return crypto.createHmac('sha256', key).update(String(ticker) + '|' + String(exchange) + '|' + String(endYear)).digest('hex').slice(0, 16);
}
function yearBucket(y) { if (!Number.isInteger(y)) return null; const a = y - (((y % BUCKET_YEARS) + BUCKET_YEARS) % BUCKET_YEARS); return a + '-' + (a + BUCKET_YEARS - 1); }
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; return o; };
const envOf = doc => { const { columns, rows, events, count, purpose, source, countsByEndYear, potentialCoverageByYear, potentialCaveat, schemaVersion, ...env } = doc; return env; };

/** fetch-candidates 1.0.2 (full, private) -> 1.0.3 (public). Full columns: ticker, exchange, startYear, endYear, cik, linkGrade, endSource. */
function redactFetchCandidates(full, key) {
  const C = full.columns, ix = n => { const i = C.indexOf(n); if (i < 0) throw Error('LISTREF_FULL_COLUMN:' + n); return i; };
  const [iT, iE, iS, iY, iC, iG, iSrc] = ['ticker', 'exchange', 'startYear', 'endYear', 'cik', 'linkGrade', 'endSource'].map(ix);
  const byBucket = {};
  const rows = full.rows.map(r => {
    const b = yearBucket(r[iY]), t = byBucket[b] = byBucket[b] || { chains: 0, withCik: 0, byExchange: {}, byLinkGrade: {}, byEndSource: {} };
    t.chains++; if (r[iC]) t.withCik++; inc(t.byExchange, r[iE]); inc(t.byLinkGrade, r[iG]); inc(t.byEndSource, r[iSrc]);
    return [chainId(key, r[iT], r[iE], r[iY]), r[iC] || null, yearBucket(r[iS]), b];
  }).sort((a, b) => (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : a[0] < b[0] ? -1 : 1));
  return { schemaVersion: 'v12-listref-fetch-candidates-1.0.3', ...envOf(full), redaction: 'public redaction 1.0.3 of fetch-candidates-1.0.2 (correction after independent review, LISTREF MAJOR 6): no provider row metadata; years coarsened to ' + BUCKET_YEARS + '-year buckets; chainId keyed hash (scripts/quant/v12/listref/redact.cjs). Full version private.',
    purpose: full.purpose, columns: ['chainId', 'cik', 'startYearBucket', 'endYearBucket'], count: rows.length, countsByEndYear: full.countsByEndYear, countsByEndYearBucket: byBucket,
    potentialCoverageByYear: full.potentialCoverageByYear, potentialCaveat: full.potentialCaveat, rows };
}

/** delisting-register 1.0.2 (full, private) -> 1.0.3 (public). linkedChains [{ticker, exchange, grade, dayDiffEndToEvent, endSource, withSeries, lifecycleDelisted}] -> counts + chain ids. */
function redactDelistingRegister(full, key) {
  const C = full.columns, i = n => C.indexOf(n);
  const iL = i('linkedChains'), iD = i('eventDate');
  if (iL < 0 || iD < 0) throw Error('LISTREF_FULL_COLUMN');
  const events = full.events.map(e => {
    const L = e[iL] || [], grades = {};
    const ids = L.map(x => { inc(grades, x.grade); const end = new Date(Date.parse(e[iD] + 'T00:00:00Z') - x.dayDiffEndToEvent * 864e5).getUTCFullYear(); return chainId(key, x.ticker, x.exchange, end); }).sort();
    const keep = e.slice(0, iL).concat(e.slice(iL + 1));
    return keep.concat([L.length, ids, L.filter(x => x.withSeries).length, L.filter(x => x.lifecycleDelisted).length, grades]);
  });
  const cols = C.filter((_, k) => k !== iL).concat(['linkedChainCount', 'linkedChainIds', 'linkedWithSeries', 'linkedWithLifecycle', 'linkGradeCounts']);
  return { schemaVersion: 'v12-listref-delisting-register-1.0.3', ...envOf(full), redaction: 'public redaction 1.0.3 of delisting-register-1.0.2 (correction after independent review, LISTREF MAJOR 6): SEC event data unchanged; linked provider chains only as counts and keyed-hash chain ids (no ticker, exchange, provider end, endSource or day difference). Full version private.',
    source: full.source, columns: cols, count: events.length, events };
}

/** Fail-closed check that a public document carries no provider row field (columns and object keys inside rows/events). */
function assertRedacted(doc) {
  const bad = new Set(FORBIDDEN_FIELDS);
  for (const c of doc.columns || []) if (bad.has(String(c).replace(/\[.*$/, ''))) throw Error('LISTREF_NOT_REDACTED:column:' + c);
  const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (bad.has(k)) throw Error('LISTREF_NOT_REDACTED:key:' + k); walk(x); } };
  walk(doc.rows || []); walk(doc.events || []);
  return true;
}

module.exports = { BUCKET_YEARS, FORBIDDEN_FIELDS, chainId, yearBucket, redactFetchCandidates, redactDelistingRegister, assertRedacted };
