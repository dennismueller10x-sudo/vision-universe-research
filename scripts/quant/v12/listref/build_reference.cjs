'use strict';
// V12 LISTREF step 4: historical listing reference, CIK links, coverage matrix, reference completeness.
// Rules: docs/quant-recovery/v12/listref/protocol-1.0.0.json + protocol-amendment-1.0.1.json.
// Two passes:
//   node build_reference.cjs --private <dir> --emit-queries <dir>/work/fts-queries.json      (index links -> EDGAR full-text queries)
//   python3 fts_links.py --queries ... --out <dir>/work/fts-results.json                     (fair-access client)
//   node build_reference.cjs --private <dir> --fts <dir>/work/fts-results.json --out-dir docs/quant-recovery/v12/listref
// Inputs are private (Tiingo file, EDGAR index extract, holdings, public float); committed outputs carry only counts,
// identifiers, hashes and SEC facts.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const R = require('./reflib.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const YEARS = Array.from({ length: 2026 - 1995 + 1 }, (_, i) => 1995 + i);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const RULE_VERSION = '1.0.2';
const FTS_FORMS = '8-K,10-K,10-Q,DEF 14A,S-1,424B4,20-F,6-K,F-1';

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }
function readGzLines(file) { return zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean); }
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean), head = lines[0].split(',');
  return lines.slice(1).map(l => { const c = l.split(','); const o = {}; head.forEach((h, i) => { o[h] = c[i] ?? ''; }); return o; });
}
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const cmpDate = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const maxD = (a, b) => (a > b ? a : b), minD = (a, b) => (a < b ? a : b);

function loadInputs(priv, ftsFile) {
  const csvPath = path.join(priv, 'raw/tiingo/supported_tickers.csv'), zipPath = path.join(priv, 'raw/tiingo/supported_tickers.zip');
  const tiingo = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const events = readGzLines(path.join(priv, 'work/edgar-events.tsv.gz')).map(l => { const [form, cik, date, acc, name] = l.split('\t'); return { form, cik, date, acc, name }; });
  const annual = new Map();
  for (const l of readGzLines(path.join(priv, 'work/edgar-annual.tsv.gz'))) { const [y, cik, fam] = l.split('\t'); annual.set(y + ':' + cik, fam.split(',')); }
  const floats = new Map();
  for (const l of readGzLines(path.join(priv, 'work/public-float.tsv.gz'))) {
    const [cik, end, val, , filed, accn] = l.split('\t'); if (!floats.has(cik)) floats.set(cik, []); floats.get(cik).push([end, Number(val), filed, accn]);
  }
  // same period end reported more than once: the latest filing (then the larger accession) wins -> sort by end, filed, accession
  for (const v of floats.values()) v.sort((a, b) => cmpDate(a[0], b[0]) || cmpDate(a[2], b[2]) || cmpDate(a[3], b[3]));
  const holdings = JSON.parse(fs.readFileSync(path.join(priv, 'work/holdings.json'), 'utf8'));
  const cikmap = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/universe/cik-map.json'), 'utf8'));
  const lifecycle = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v10/population/lifecycle-cases.json'), 'utf8'));
  const identity = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v10/population/identity-cases.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(priv, 'work/edgar-index-manifest.json'), 'utf8'));
  const fts = ftsFile ? JSON.parse(fs.readFileSync(ftsFile, 'utf8')) : null;
  const agentsFile = path.join(priv, 'work/exchange-agents.json');
  const agents = fs.existsSync(agentsFile) ? JSON.parse(fs.readFileSync(agentsFile, 'utf8')) : { agents: {} };
  return { tiingo, events, annual, floats, holdings, cikmap, lifecycle, identity, manifest, fts, agents,
    hashes: { tiingoZipSha256: sha(fs.readFileSync(zipPath)), tiingoCsvSha256: sha(fs.readFileSync(csvPath)), holdingsSha256: sha(fs.readFileSync(path.join(priv, 'work/holdings.json'))),
      publicFloatTsvSha256: sha(fs.readFileSync(path.join(priv, 'work/public-float.tsv.gz'))), cikMapSha256: sha(fs.readFileSync(path.join(ROOT, 'quant/data/universe/cik-map.json'))),
      edgarIndexFilesSha256: sha(JSON.stringify(manifest.files.map(f => [f.url, f.sha256]))), ftsResultsSha256: ftsFile ? sha(fs.readFileSync(ftsFile)) : null } };
}

const DELIST_FORMS = new Set(['25', '25-NSE', '15-12B']);
const ANY_DELIST = new Set(['25', '25-NSE', '15-12B', '15-12G', '15-15D']);
const MERGER_FORMS = new Set(['DEFM14A', 'DEFM14C', 'PREM14A', 'SC 14D9', 'SC TO-T', 'SC 13E3']);
const ftsTicker = t => String(t).replace(/-/g, '.');
function ftsUrl(ticker, lo, hi, cik) {
  return 'https://efts.sec.gov/LATEST/search-index?q=' + encodeURIComponent('"' + ftsTicker(ticker) + '"') + (cik ? '&ciks=' + String(cik).padStart(10, '0') : '') +
    '&forms=' + encodeURIComponent(FTS_FORMS) + '&dateRange=custom&startdt=' + lo + '&enddt=' + hi;
}

function build(inp) {
  const { tiingo, events, annual, floats, holdings, cikmap, lifecycle, identity, fts } = inp;
  const agents = (inp.agents && inp.agents.agents) || {};
  // ---------- 1. reference rows ----------
  const excluded = {}, usStock = [];
  for (const r of tiingo) {
    if (r.assetType !== 'Stock') { inc(excluded, 'ASSET_TYPE_' + (r.assetType || 'EMPTY').toUpperCase().replace(/\s+/g, '_')); continue; }
    if (!R.US_EXCHANGES.has(r.exchange)) { inc(excluded, 'EXCHANGE_' + (r.exchange || 'EMPTY').replace(/\s+/g, '_')); continue; }
    if (r.priceCurrency !== 'USD') { inc(excluded, 'CURRENCY_NOT_USD'); continue; }
    if (!r.startDate || !r.endDate) { inc(excluded, 'MISSING_DATES'); continue; }
    usStock.push(r);
  }
  const symbolByTicker = new Map();
  for (const r of usStock) { if (!symbolByTicker.has(r.ticker)) symbolByTicker.set(r.ticker, []); symbolByTicker.get(r.ticker).push(r); }
  const rows = [];
  for (const r of usStock) {
    const c = R.classifySymbol(r.ticker, r.exchange);
    if (!c.keep) { inc(excluded, 'SYMBOL_' + c.reason); continue; }
    rows.push({ id: 'tiingo:' + r.exchange + ':' + r.ticker + ':' + r.startDate, ticker: r.ticker, exchange: r.exchange, startDate: r.startDate, endDate: r.endDate, fiveLetterKept: c.fiveLetterKept });
  }
  const idCount = {}; for (const x of rows) inc(idCount, x.id);
  const duplicateIds = Object.values(idCount).filter(v => v > 1).length;
  // ---------- 2. chains (A1) and ticker reuse ----------
  const byTickerRows = new Map();
  for (const x of rows) { if (!byTickerRows.has(x.ticker)) byTickerRows.set(x.ticker, []); byTickerRows.get(x.ticker).push(x); }
  const reuse = { tickersWithSeveralRows: 0, reuseGapPairs: 0, adjacentRestartPairs: 0, tickersWithReuseGap: 0, chains: 0, chainsWithSeveralRows: 0 };
  const chains = [];
  for (const [ticker, list] of byTickerRows) {
    list.sort((a, b) => cmpDate(a.startDate, b.startDate));
    if (list.length > 1) reuse.tickersWithSeveralRows++;
    let cur = null, gapHit = false;
    const tChains = [];
    for (const x of list) {
      if (cur && R.daysBetween(cur.endDate, x.startDate) <= 5) { reuse.adjacentRestartPairs++; cur.rows.push(x.id); cur.endDate = maxD(cur.endDate, x.endDate); cur.exchange = x.exchange; cur.fiveLetterKept ||= x.fiveLetterKept; continue; }
      if (cur) { reuse.reuseGapPairs++; gapHit = true; }
      cur = { id: x.id, ticker, exchange: x.exchange, startDate: x.startDate, endDate: x.endDate, providerEnd: null, rows: [x.id], fiveLetterKept: x.fiveLetterKept, reuseOfPrior: cur ? 'REUSE_GAP' : null };
      tChains.push(cur);
    }
    if (gapHit) reuse.tickersWithReuseGap++;
    tChains.forEach((c, i) => { c.latestOfTicker = i === tChains.length - 1; c.providerEnd = c.endDate; c.group = R.EXCHANGE_GROUP[c.exchange]; chains.push(c); if (c.rows.length > 1) reuse.chainsWithSeveralRows++; });
  }
  reuse.chains = chains.length;
  for (const x of chains) x.spacLikely = R.spacSiblings(x.ticker, x.exchange).some(s => (symbolByTicker.get(s) || []).some(o => o.startDate <= x.endDate && o.endDate >= x.startDate));
  const chainByRow = new Map(); for (const c of chains) for (const r of c.rows) chainByRow.set(r.replace(/^tiingo:NYSE MKT:/, 'tiingo:AMEX:'), c);
  const byTicker = new Map(); for (const c of chains) { if (!byTicker.has(c.ticker)) byTicker.set(c.ticker, []); byTicker.get(c.ticker).push(c); }
  // ---------- 3. holdings mapping + lifecycle effective end (A2) ----------
  const aliasCanon = c => String(c).replace(/^tiingo:NYSE MKT:/, 'tiingo:AMEX:');
  const sidToCanon = new Map();
  for (const s of holdings.series) for (const m of s.masterRows) if (m.baselineMember !== false) { if (!sidToCanon.has(s.securityId)) sidToCanon.set(s.securityId, []); sidToCanon.get(s.securityId).push(m.canonicalId); }
  const holdCounts = {};
  for (const s of holdings.series) {
    let target = null, how = null;
    for (const c of sidToCanon.get(s.securityId) || []) { const t = chainByRow.get(aliasCanon(c)); if (t) { target = t; how = 'CANONICAL_ID'; break; } }
    if (!target && s.listingId) { const t = chainByRow.get(aliasCanon(s.listingId)); if (t) { target = t; how = 'LOADER_LISTING_ID'; } }
    if (!target && s.rawFirst) {
      const cand = (byTicker.get(s.ticker) || []).filter(x => R.daysBetween(maxD(x.startDate, s.rawFirst), minD(x.endDate, s.rawLast)) >= 365);
      if (cand.length === 1) { target = cand[0]; how = 'TICKER_OVERLAP'; }
    }
    if (!target) {
      const any = symbolByTicker.get(s.ticker) || [];
      const why = any.length ? 'TICKER_ROW_EXCLUDED_BY_SYMBOL_RULE_OR_NO_UNIQUE_OVERLAP' : (tiingo.some(r => r.ticker === s.ticker) ? 'TICKER_ONLY_OUTSIDE_US_STOCK_SCOPE' : 'TICKER_NOT_IN_PROVIDER_FILE');
      inc(holdCounts, 'UNMAPPED:' + why + (s.inFrame ? ':IN_FRAME' : ''));
      continue;
    }
    inc(holdCounts, 'MAPPED:' + how + (s.inFrame ? ':IN_FRAME' : ''));
    (target.series = target.series || []).push(s);
  }
  for (const x of chains) if (x.series && x.series.length > 1) inc(holdCounts, 'CHAINS_WITH_SEVERAL_SERIES');
  for (const x of chains) {
    x.lifecycleDelisted = false; x.endSource = 'PROVIDER';
    for (const s of x.series || []) if (s.lifecycle && s.lifecycle.status === 'DELISTED_SOURCE_VERIFIED' && s.lifecycle.lastTradeDate) {
      x.lifecycleDelisted = true;
      if (s.lifecycle.lastTradeDate < x.endDate) { x.endDate = s.lifecycle.lastTradeDate; x.endSource = 'V10_LIFECYCLE_LAST_TRADE'; }
    }
    x.ended = R.isEnded(x);
  }
  // ---------- 4. EDGAR indices ----------
  const delistByDate = [], eightA = [], perCik = new Map();
  for (const e of events) {
    if (ANY_DELIST.has(e.form)) delistByDate.push(e);
    if (e.form === '8-A12B' || e.form === '8-A12G') eightA.push(e);
    if (ANY_DELIST.has(e.form) || MERGER_FORMS.has(e.form) || e.form === '8-A12B' || e.form === '8-A12G') { if (!perCik.has(e.cik)) perCik.set(e.cik, []); perCik.get(e.cik).push(e); }
  }
  delistByDate.sort((a, b) => cmpDate(a.date, b.date)); eightA.sort((a, b) => cmpDate(a.date, b.date));
  const dDates = delistByDate.map(e => e.date), aDates = eightA.map(e => e.date);
  const lowerBound = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; };
  const inWindow = (arr, ds, lo, hi) => { const out = []; for (let i = lowerBound(ds, lo); i < arr.length && ds[i] <= hi; i++) out.push(arr[i]); return out; };
  const nameOf = new Map(); for (const e of events) nameOf.set(e.cik, e.name);
  const cikByCik = new Map(); for (const [t, e] of Object.entries(cikmap.byTicker)) { const c = String(Number(e.cik)); if (!cikByCik.has(c) || /NYSE|Nasdaq/i.test(e.exchange || '')) cikByCik.set(c, { ...e, ticker: t }); }
  // ---------- 5. CIK links ----------
  const v10Cik = new Map();
  for (const c of lifecycle.cases) if (c.cik) for (const cid of sidToCanon.get(c.securityId) || []) v10Cik.set(aliasCanon(cid), { cik: String(Number(c.cik)), src: 'lifecycle-cases' });
  for (const c of identity.cases) if (c.cik && c.selectedCanonicalId) v10Cik.set(aliasCanon(c.selectedCanonicalId), { cik: String(Number(c.cik)), src: 'identity-cases' });
  const queries = [];
  const ftsGet = url => (fts ? fts.results[url] : undefined);
  const linkCounts = {};
  for (const x of chains) {
    let link = null;
    const v = x.rows.map(r => v10Cik.get(aliasCanon(r))).find(Boolean);
    const cm = cikmap.byTicker[x.ticker.replace(/-/g, '.')] || cikmap.byTicker[x.ticker];
    const frozenCandidate = !x.ended && x.latestOfTicker && (!cm || cm.exchange === 'OTC');
    if (!x.ended && x.latestOfTicker && cm && cm.exchange !== 'OTC') link = { grade: 'HIGH_CURRENT_MAP', cik: String(Number(cm.cik)), secExchangeNow: cm.exchange || null };
    else if (v) link = { grade: 'HIGH_V10_REGISTER', cik: v.cik, src: v.src };
    if (!link && x.ended) {
      // index match (1.0.0 rule) -> must be confirmed by full text (A3)
      const lo = R.addDays(x.endDate, -15), hi = R.addDays(x.endDate, 120);
      const cands = inWindow(delistByDate, dDates, lo, hi).filter(e => DELIST_FORMS.has(e.form) || (e.form === '15-12G' && x.exchange === 'NASDAQ' && e.date < '2007-01-01'));
      const best = new Map();
      for (const e of cands) {
        const a = R.affinity(x.ticker, e.name), cur = best.get(e.cik), dd = R.daysBetween(x.endDate, e.date);
        if (!cur || a > cur.a || (a === cur.a && Math.abs(dd) < Math.abs(cur.dd))) best.set(e.cik, { a, dd, e });
      }
      const a3 = [...best.values()].filter(b => b.a === 3);
      let idx = null;
      if (a3.length === 1) idx = { grade: 'MEDIUM_EDGAR_END', b: a3[0] };
      else if (x.startDate > R.CENSOR_START) {
        const startCiks = new Set(inWindow(eightA, aDates, R.addDays(x.startDate, -30), R.addDays(x.startDate, 10)).map(e => e.cik));
        const both = [...best.values()].filter(b => b.a >= 2 && startCiks.has(b.e.cik));
        if (new Set(both.map(b => b.e.cik)).size === 1) idx = { grade: 'MEDIUM_EDGAR_START_END', b: both[0] };
      }
      x.indexMatch = idx ? { grade: idx.grade, cik: idx.b.e.cik, form: idx.b.e.form, acc: idx.b.e.acc, date: idx.b.e.date, dayDiff: idx.b.dd } : (a3.length > 1 ? { ambiguous: a3.length } : null);
      if (idx) {
        const url = ftsUrl(x.ticker, maxD('2001-01-01', maxD(x.startDate, R.addDays(x.endDate, -3 * 365))), R.addDays(x.endDate, 30), idx.b.e.cik);
        if (x.endDate >= '2001-01-01') queries.push({ kind: 'confirm', url });
        const res = ftsGet(url);
        x.confirmPending = x.endDate >= '2001-01-01' && !res;
        if (res && res.total > 0) link = { grade: 'MEDIUM_FTS_CONFIRMED', cik: idx.b.e.cik, via: idx.grade, endForm: idx.b.e.form, endAcc: idx.b.e.acc, endEventDate: idx.b.e.date, dayDiff: idx.b.dd, ftsHits: res.total };
        else if (res) x.unconfirmed = true;
      }
      if (!link && x.endDate >= '2002-01-01' && !x.confirmPending) {
        // A4 discovery
        const url = ftsUrl(x.ticker, R.addDays(x.endDate, -730), R.addDays(x.endDate, 30));
        queries.push({ kind: 'discover', url });
        const res = ftsGet(url);
        if (res) {
          const allowed = new Map();
          for (const e of inWindow(delistByDate, dDates, R.addDays(x.endDate, -15), R.addDays(x.endDate, 120))) if (!allowed.has(e.cik)) allowed.set(e.cik, e);
          const pick = discoverPick(res, allowed, x.ticker);
          if (pick) link = { grade: 'MEDIUM_FTS_DISCOVERED', cik: pick.cik, endForm: pick.e.form, endAcc: pick.e.acc, endEventDate: pick.e.date, dayDiff: R.daysBetween(x.endDate, pick.e.date), ftsHits: pick.hits, ftsRunnerUp: pick.runnerUp };
        }
      }
    }
    if (!link && frozenCandidate) {
      const lo = maxD('2001-01-01', maxD(x.startDate, R.addDays(x.endDate, -3 * 365)));
      const url = ftsUrl(x.ticker, lo, x.endDate);
      queries.push({ kind: 'frozen', url });
      const res = ftsGet(url);
      if (res) {
        const allowed = new Map();
        for (const e of inWindow(delistByDate, dDates, x.startDate, x.endDate)) {
          const prev = allowed.get(e.cik);
          // first 25/25-NSE after start, else the first 15-type form
          const rank = f => (f === '25' || f === '25-NSE' ? 0 : 1);
          if (!prev || rank(e.form) < rank(prev.form)) allowed.set(e.cik, e);
        }
        const pick = discoverPick(res, allowed, x.ticker, cm ? String(Number(cm.cik)) : null);
        if (pick) {
          link = { grade: 'MEDIUM_FTS_DISCOVERED', cik: pick.cik, frozenTail: true, endForm: pick.e.form, endAcc: pick.e.acc, endEventDate: pick.e.date, ftsHits: pick.hits, ftsRunnerUp: pick.runnerUp };
          if (pick.e.date < x.endDate) { x.endDate = pick.e.date; x.endSource = 'DERIVED_FROM_SEC_DELISTING_FORM'; x.ended = R.isEnded(x); }
        }
      }
    }
    if (!link) link = { grade: 'UNLINKED', reason: x.ended ? (x.unconfirmed ? 'INDEX_MATCH_UNCONFIRMED' : x.indexMatch && x.indexMatch.ambiguous ? 'AMBIGUOUS_A3_CANDIDATES' : 'NO_UNIQUE_MATCH') : frozenCandidate ? 'ACTIVE_NOT_IN_SEC_MAP_NO_MATCH' : 'ACTIVE_SUPERSEDED_CHAIN' };
    x.link = link; inc(linkCounts, link.grade + (link.grade === 'UNLINKED' ? ':' + link.reason : '') + (link.frozenTail ? ':FROZEN_TAIL' : ''));
  }
  function discoverPick(res, allowed, ticker, preferCik) {
    const hits = new Map();
    for (const h of res.hits) for (const c of h[0]) { const k = String(Number(c)); hits.set(k, (hits.get(k) || 0) + 1); }
    const cands = [...hits].filter(([c]) => allowed.has(c) && R.affinity(ticker, allowed.get(c).name) >= 1 && (!preferCik || c === preferCik)).sort((a, b) => b[1] - a[1]);
    if (!cands.length || cands[0][1] < 2 || (cands[1] && cands[1][1] === cands[0][1])) return null;
    return { cik: cands[0][0], hits: cands[0][1], runnerUp: cands[1] ? cands[1][1] : 0, e: allowed.get(cands[0][0]) };
  }
  // ---------- 6. per-year matrix ----------
  const yearsWithBars = s => { const out = new Set(); if (!s.rawFirst) return out; for (let y = +s.rawFirst.slice(0, 4); y <= +s.rawLast.slice(0, 4); y++) out.add(y); return out; };
  const frameYears = s => { const out = new Set(); if (!s.inFrame || !s.frameFirst) return out; for (let y = +s.frameFirst.slice(0, 4); y <= +s.frameLast.slice(0, 4); y++) out.add(y); return out; };
  const issuerType = (cik, y) => {
    if (!cik) return 'UNKNOWN';
    let dom = false, fpi = false;
    for (const yy of [y - 1, y, y + 1]) { const f = annual.get(yy + ':' + cik); if (!f) continue; if (f.includes('10K') || f.includes('10KSB')) dom = true; if (f.includes('20F') || f.includes('40F')) fpi = true; }
    return dom ? 'DOMESTIC_FILER' : fpi ? 'FOREIGN_PRIVATE_ISSUER' : 'UNKNOWN';
  };
  const matrix = {}, segKeys = ['all', 'exchange', 'sizeClass', 'listingAge', 'issuerType', 'spacLikely', 'linkGrade', 'exchangeXsize', 'exchangeXage'];
  const cell = (y, seg, val) => { const k = String(y); matrix[k] = matrix[k] || {}; matrix[k][seg] = matrix[k][seg] || {}; const m = matrix[k][seg]; m[val] = m[val] || { ref: 0, withSeries: 0, frameQualified: 0, ended: 0, endedWithSeries: 0, endedWithLifecycle: 0 }; return m[val]; };
  let scaleSuspect = 0;
  for (const x of chains) {
    const cik = x.link.cik || null, fl = cik ? floats.get(cik) : null;
    const sYears = new Set(), fYears = new Set();
    for (const s of x.series || []) { for (const y of yearsWithBars(s)) sYears.add(y); for (const y of frameYears(s)) fYears.add(y); }
    x.years = {};
    for (const y of YEARS) {
      if (!R.activeIn(x, y)) continue;
      const f = R.floatFor(fl, y);
      if (f.flag) scaleSuspect++;
      const seg = { all: 'ALL', exchange: x.group, sizeClass: R.sizeClass(f.value), listingAge: R.ageBucket(x.startDate, y), issuerType: issuerType(cik, y), spacLikely: x.spacLikely ? 'SPAC_LIKELY' : 'NOT_SPAC_LIKELY', linkGrade: x.link.grade };
      seg.exchangeXsize = seg.exchange + '|' + seg.sizeClass; seg.exchangeXage = seg.exchange + '|' + seg.listingAge;
      const endedHere = x.ended && +x.endDate.slice(0, 4) === y, hasS = sYears.has(y), hasF = fYears.has(y);
      x.years[y] = [seg.sizeClass, seg.issuerType, hasS ? 1 : 0, hasF ? 1 : 0];
      for (const k of segKeys) {
        const c = cell(y, k, seg[k]);
        c.ref++; if (hasS) c.withSeries++; if (hasF) c.frameQualified++;
        if (endedHere) { c.ended++; if (hasS) c.endedWithSeries++; if (x.lifecycleDelisted) c.endedWithLifecycle++; }
      }
    }
  }
  // ---------- 7. EDGAR delisting events, completeness (A5), register ----------
  const operating = (cik, y) => [y - 2, y - 1, y].some(yy => annual.has(yy + ':' + cik));
  const stillListed = cik => { const e = cikByCik.get(cik); return !!(e && /^(NYSE|Nasdaq|NYSE American|NYSE MKT|AMEX)$/i.test(e.exchange || '')); };
  const evs = [];
  for (const [cik, list] of perCik) {
    const del = list.filter(e => DELIST_FORMS.has(e.form) && ((e.form !== '25' && e.form !== '25-NSE') || e.date >= '2001-01-01')).sort((a, b) => cmpDate(a.date, b.date));
    let cur = null;
    for (const e of del) {
      if (cur && R.daysBetween(cur.lastDate, e.date) <= 180) { cur.forms.push([e.form, e.date, e.acc]); cur.lastDate = e.date; continue; }
      cur = { cik, date: e.date, lastDate: e.date, name: e.name, forms: [[e.form, e.date, e.acc]] }; evs.push(cur);
    }
  }
  const linkByCik = new Map();
  for (const x of chains) if (x.link.cik) { if (!linkByCik.has(x.link.cik)) linkByCik.set(x.link.cik, []); linkByCik.get(x.link.cik).push(x); }
  const endedChains = chains.filter(x => x.ended).sort((a, b) => cmpDate(a.endDate, b.endDate));
  const endDates = endedChains.map(x => x.endDate);
  const completeness = {}, register = [], segComp = {};
  for (const ev of evs) {
    const y = +ev.date.slice(0, 4);
    if (y < 1995) continue;
    const c = completeness[y] = completeness[y] || { edgarEvents: 0, operatingIssuer: 0, excludedStillListed: 0, consideredEvents: 0, linkedToReferenceChain: 0, nameCandidateOnly: 0, linkedChainWithSeries: 0, linkedChainWithLifecycle: 0, byForm: {} };
    c.edgarEvents++;
    const op = operating(ev.cik, y);
    if (!op) continue;
    c.operatingIssuer++;
    if (stillListed(ev.cik)) { c.excludedStillListed++; continue; }
    c.consideredEvents++;
    const nseForm = ev.forms.find(f => f[0] === '25-NSE');
    const evExchange = nseForm ? ((agents[nseForm[2].slice(0, 10)] || {}).group || 'OTHER') : 'UNKNOWN';
    const evSize = R.sizeClass(R.floatFor(floats.get(ev.cik), y).value);
    const issuer25 = ev.forms.some(f => f[0] === '25'), nse = ev.forms.some(f => f[0] === '25-NSE');
    inc(c.byForm, nse ? '25-NSE' : issuer25 ? '25' : '15-12B');
    const linked = (linkByCik.get(ev.cik) || []).filter(x => x.ended && ev.forms.some(f => { const d = R.daysBetween(x.endDate, f[1]); return d >= -15 && d <= 120; }));
    let nameCand = false;
    if (!linked.length) {
      for (let i = lowerBound(endDates, R.addDays(ev.date, -120)); i < endedChains.length && endDates[i] <= R.addDays(ev.lastDate, 15); i++) if (R.affinity(endedChains[i].ticker, ev.name) >= 2) { nameCand = true; break; }
    }
    if (linked.length) { c.linkedToReferenceChain++; if (linked.some(x => x.series && x.series.length)) c.linkedChainWithSeries++; if (linked.some(x => x.lifecycleDelisted)) c.linkedChainWithLifecycle++; } else if (nameCand) c.nameCandidateOnly++;
    for (const [sk, sv] of [['exchange', evExchange], ['sizeClass', evSize], ['exchangeXsize', evExchange + '|' + evSize]]) {
      const ss = (segComp[y] = segComp[y] || {}); ss[sk] = ss[sk] || {}; const t = ss[sk][sv] = ss[sk][sv] || { considered: 0, linked: 0, nameCand: 0 };
      t.considered++; if (linked.length) t.linked++; else if (nameCand) t.nameCand++;
    }
    const merger = (perCik.get(ev.cik) || []).some(e => MERGER_FORMS.has(e.form) && R.daysBetween(e.date, ev.date) >= 0 && R.daysBetween(e.date, ev.date) <= 365);
    register.push({ cik: ev.cik, eventDate: ev.date, name: ev.name, forms: ev.forms, mergerProcessIndexed: merger, issuerForm25: issuer25, exchangeForm25NSE: nse,
      linkedChains: linked.map(x => ({ ticker: x.ticker, exchange: x.group, grade: x.link.grade, dayDiffEndToEvent: R.daysBetween(x.endDate, ev.date), endSource: x.endSource, withSeries: !!(x.series && x.series.length), lifecycleDelisted: x.lifecycleDelisted })), nameCandidateOnly: nameCand });
  }
  for (const c of Object.values(completeness)) {
    c.completenessLower = c.consideredEvents ? +(c.linkedToReferenceChain / c.consideredEvents).toFixed(4) : null;
    c.completenessUpper = c.consideredEvents ? +((c.linkedToReferenceChain + c.nameCandidateOnly) / c.consideredEvents).toFixed(4) : null;
  }
  const endedByYear = {};
  for (const x of chains) if (x.ended) { const y = x.endDate.slice(0, 4); const e = endedByYear[y] = endedByYear[y] || { endedChains: 0, byEndSource: {}, linked: 0, linkedToSecDelistingForm: 0, withSeries: 0, lifecycle: 0 }; e.endedChains++; inc(e.byEndSource, x.endSource); if (x.link.cik) e.linked++; if (x.link.endForm) e.linkedToSecDelistingForm++; if (x.series && x.series.length) e.withSeries++; if (x.lifecycleDelisted) e.lifecycle++; }
  for (const [y, e] of Object.entries(endedByYear)) { const c = completeness[y]; e.countRatioEndedChainsToEdgarEvents = c && c.consideredEvents ? +(e.endedChains / c.consideredEvents).toFixed(4) : null; }
  for (const ys of Object.values(segComp)) for (const vs of Object.values(ys)) for (const t of Object.values(vs)) { t.lower = t.considered ? +(t.linked / t.considered).toFixed(4) : null; t.upper = t.considered ? +((t.linked + t.nameCand) / t.considered).toFixed(4) : null; }
  return { rows, chains, excluded, duplicateIds, reuse, linkCounts, holdCounts, matrix, completeness, segComp, endedByYear, register, scaleSuspect, usStockRows: usStock.length, queries };
}

function shares(c) { return { ...c, seriesCoverage: c.ref ? +(c.withSeries / c.ref).toFixed(4) : null, frameCoverage: c.ref ? +(c.frameQualified / c.ref).toFixed(4) : null,
  delistingSeriesCoverage: c.ended ? +(c.endedWithSeries / c.ended).toFixed(4) : null, delistingLifecycleCoverage: c.ended ? +(c.endedWithLifecycle / c.ended).toFixed(4) : null }; }

function readiness(c, completenessUpper) {
  if (!c.ref || c.ref < 30) return 'INSUFFICIENT';
  if (completenessUpper === null || completenessUpper === undefined || completenessUpper < 0.8) return 'INSUFFICIENT';
  const cov = c.withSeries / c.ref;
  if (cov >= 0.95) return 'STUDY_READY_TRANSPARENT_GAP';
  if (cov >= 0.8) return 'PARTIAL';
  return 'INSUFFICIENT';
}

function main() {
  const priv = path.resolve(arg('--private'));
  const ftsFile = arg('--fts') ? path.resolve(arg('--fts')) : null;
  const inp = loadInputs(priv, ftsFile);
  const b = build(inp);
  if (arg('--emit-queries')) {
    const seen = new Set(), q = b.queries.filter(x => (seen.has(x.url) ? false : seen.add(x.url)));
    fs.writeFileSync(path.resolve(arg('--emit-queries')), JSON.stringify({ queries: q }));
    const k = {}; for (const x of q) inc(k, x.kind);
    console.log(JSON.stringify({ queries: q.length, byKind: k }));
    return;
  }
  if (!ftsFile) throw new Error('--fts required for the final build (amendment 1.0.1 A3/A4)');
  const outDir = path.resolve(arg('--out-dir'));
  const protocolSha = { 'protocol-amendment-1.0.2.json': sha(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v12/listref/protocol-amendment-1.0.2.json'))), 'protocol-1.0.0.json': sha(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v12/listref/protocol-1.0.0.json'))), 'protocol-amendment-1.0.1.json': sha(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v12/listref/protocol-amendment-1.0.1.json'))) };
  const codeSha = Object.fromEntries(['scripts/quant/v12/listref/build_reference.cjs', 'scripts/quant/v12/listref/reflib.cjs'].map(f => [f, sha(fs.readFileSync(path.join(ROOT, f)))]));
  const missing = b.queries.filter(q => !inp.fts.results[q.url]).length;
  const privRows = b.chains.map(x => ({ id: x.id, ticker: x.ticker, exchange: x.exchange, rows: x.rows, startDate: x.startDate, providerEnd: x.providerEnd, endDate: x.endDate, endSource: x.endSource, ended: x.ended,
    spacLikely: x.spacLikely, fiveLetterKept: x.fiveLetterKept, reuseOfPrior: x.reuseOfPrior, link: x.link, indexMatch: x.indexMatch || null, series: (x.series || []).map(s => s.securityId), lifecycleDelisted: x.lifecycleDelisted, years: x.years }));
  const privText = privRows.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(priv, 'work/reference-listings.jsonl.gz'), zlib.gzipSync(privText));
  fs.writeFileSync(path.join(priv, 'work/delisting-register.json'), JSON.stringify(b.register));
  const env = { ruleVersion: RULE_VERSION, protocolSha256: protocolSha, codeSha256: codeSha, inputs: inp.hashes, evidenceKind: 'SOURCE_EVIDENCE', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    dataAsOf: { tiingoFile: '2026-10-28', edgarIndexLastDataReceived: inp.manifest.files.at(-1).lastDataReceived, holdingsWeekly: inp.holdings.series.reduce((m, s) => (s.rawLast && s.rawLast > m ? s.rawLast : m), '') } };
  const refSummary = { schemaVersion: 'v12-listref-reference-summary-1.0.2', ...env,
    counts: { tiingoRows: inp.tiingo.length, usExchangeStockUsdRows: b.usStockRows, referenceRows: b.rows.length, referenceChains: b.chains.length, endedChains: b.chains.filter(x => x.ended).length,
      endSource: b.chains.filter(x => x.ended).reduce((o, x) => (inc(o, x.endSource), o), {}), duplicateRowIds: b.duplicateIds,
      fiveLetterKept: b.chains.filter(x => x.fiveLetterKept).length, spacLikely: b.chains.filter(x => x.spacLikely).length, excludedRowsByReason: Object.fromEntries(Object.entries(b.excluded).sort()) },
    tickerReuse: b.reuse, cikLinks: Object.fromEntries(Object.entries(b.linkCounts).sort()), ftsQueries: { total: b.queries.length, missingResults: missing },
    holdingsMapping: Object.fromEntries(Object.entries(b.holdCounts).sort()), publicFloatScaleSuspectChainYears: b.scaleSuspect,
    privateReference: { file: 'v12-private/listref/work/reference-listings.jsonl.gz', sha256: sha(privText), chains: privRows.length }, endedChainsByYear: b.endedByYear };
  const matrix = {};
  for (const [y, segs] of Object.entries(b.matrix)) { matrix[y] = {}; for (const [k, vals] of Object.entries(segs)) { matrix[y][k] = {}; for (const [v, c] of Object.entries(vals)) matrix[y][k][v] = shares(c); } }
  const coverageMatrix = { schemaVersion: 'v12-listref-coverage-matrix-1.0.2', ...env,
    definitions: { unit: 'listing chain (Tiingo rows of one ticker with gaps <= 5 days)', ref: 'reference chains active in year', withSeries: 'mapped weekly series with >= 1 bar in year', frameQualified: 'mapped series in V10/V11 frame with >= 1 loader bar in year',
      ended: 'chains whose effective end lies in year (effective end < 2026-09-28)', endedWithSeries: 'ended chains with a mapped series with a bar in that year', endedWithLifecycle: 'ended chains whose mapped series carries an SEC-sourced last trading day (DELISTED_SOURCE_VERIFIED)' },
    years: matrix };
  const completeness = { schemaVersion: 'v12-listref-reference-completeness-1.0.2', ...env,
    definition: 'EDGAR delisting events (25/25-NSE 2001+, 15-12B; one event per CIK within 180 days) of operating issuers (10-K/10-KSB/20-F/40-F in [Y-2,Y]) not mapped to NYSE/Nasdaq/NYSE American in the current SEC ticker map. completenessLower = share linked to an ended reference chain of the same CIK; completenessUpper = plus events for which an ended common chain with ticker affinity >= A2 ends within [event-120d, lastForm+15d].',
    perYear: b.completeness, perYearSegment: b.segComp, exchangeAgents: inp.agents, endedChainsByYear: b.endedByYear };
  const p4 = [];
  for (const y of YEARS) {
    const segs = b.matrix[String(y)] || {}, yc = b.completeness[y] || {}, sc = b.segComp[y] || {};
    for (const segKey of ['all', 'exchange', 'sizeClass', 'listingAge', 'exchangeXsize', 'exchangeXage']) for (const [val, c] of Object.entries(segs[segKey] || {})) {
      const s = shares(c);
      const compKey = segKey === 'exchangeXage' ? ['exchange', val.split('|')[0]] : ['exchange', 'sizeClass', 'exchangeXsize'].includes(segKey) ? [segKey, val] : null;
      const t = compKey && sc[compKey[0]] ? sc[compKey[0]][compKey[1]] : null;
      const comp = t && t.considered >= 10 ? { completenessLower: t.lower, completenessUpper: t.upper, source: compKey.join(':') + ' (n=' + t.considered + ')' } : { completenessLower: yc.completenessLower ?? null, completenessUpper: yc.completenessUpper ?? null, source: 'year (n=' + (yc.consideredEvents || 0) + ')' };
      p4.push([y, segKey, val, c.ref, c.withSeries, c.frameQualified, s.seriesCoverage, s.frameCoverage, c.ended, c.endedWithSeries, c.endedWithLifecycle, comp.completenessLower, comp.completenessUpper, readiness(c, comp.completenessUpper), readiness(c, comp.completenessLower), comp.source]);
    }
  }
  const p4doc = { schemaVersion: 'v12-listref-coverage-by-year-segment-1.0.2', ...env,
    readinessRule: 'n_ref >= 30 and referenceCompletenessUpper >= 0.80 required; then seriesCoverage >= 0.95 -> STUDY_READY_TRANSPARENT_GAP, >= 0.80 -> PARTIAL, else INSUFFICIENT (protocol 1.0.0 p4Readiness, amendment 1.0.1 A5, amendment 1.0.2 B1/B2: segment completeness when >= 10 EDGAR events, else year)',
    caveat: 'Reference = Tiingo listing chains (survivor-biased itself where completeness is low). Size class = 10-K public float of the linked CIK (UNKNOWN when unlinked or no XBRL float). Coverage counts our weekly series regardless of qualification; frameCoverage counts the V10/V11 research frame.',
    columns: ['year', 'segment', 'value', 'ref', 'withSeries', 'frameQualified', 'seriesCoverage', 'frameCoverage', 'refDelistings', 'delistingsWithSeries', 'delistingsWithLifecycle', 'referenceCompletenessLower', 'referenceCompletenessUpper', 'readiness', 'readinessAtLowerCompleteness', 'completenessSource'],
    rows: p4 };
  const registerDoc = { schemaVersion: 'v12-listref-delisting-register-1.0.2', ...env, source: 'EDGAR full-index form.gz 1995-2026; filing index https://www.sec.gov/Archives/edgar/data/<cik>/<accession without dashes>/<accession>-index.htm',
    columns: ['cik', 'eventDate', 'name', 'forms[[form,date,accession]]', 'mergerProcessIndexed', 'issuerForm25', 'exchangeForm25NSE', 'linkedChains', 'nameCandidateOnly'], count: b.register.length,
    events: b.register.map(e => [e.cik, e.eventDate, e.name, e.forms, e.mergerProcessIndexed, e.issuerForm25, e.exchangeForm25NSE, e.linkedChains, e.nameCandidateOnly]) };
  // owner-approval template: ended reference chains without a weekly series in our holdings (provider still lists them)
  const cand = b.chains.filter(x => x.ended && !(x.series && x.series.length)).sort((p, q) => cmpDate(p.endDate, q.endDate) || cmpDate(p.ticker, q.ticker));
  const candByYear = {}; for (const x of cand) { const y = x.endDate.slice(0, 4); candByYear[y] = candByYear[y] || { chains: 0, linkedCik: 0 }; candByYear[y].chains++; if (x.link.cik) candByYear[y].linkedCik++; }
  // what series coverage would be if every candidate (ended chain without series) were fetched for its active years
  const potential = {};
  for (const x of b.chains) for (const [y, v] of Object.entries(x.years)) {
    const p = potential[y] = potential[y] || { ref: 0, withSeries: 0, fetchableEnded: 0 };
    p.ref++; if (v[2]) p.withSeries++; else if (x.ended && !(x.series && x.series.length)) p.fetchableEnded++;
  }
  for (const p of Object.values(potential)) { p.coverageNow = +(p.withSeries / p.ref).toFixed(4); p.coverageIfFetched = +((p.withSeries + p.fetchableEnded) / p.ref).toFixed(4); }
  const fetchDoc = { schemaVersion: 'v12-listref-fetch-candidates-1.0.2', ...env, purpose: 'Approval template only (no fetch performed): delisted listings that the existing price provider still lists but our holdings lack. Fetching their history needs the provider key in Actions (owner decision).',
    columns: ['ticker', 'exchange', 'startYear', 'endYear', 'cik', 'linkGrade', 'endSource'], countsByEndYear: candByYear, potentialCoverageByYear: potential,
    potentialCaveat: 'Upper bound against the provider reference itself (which lacks most pre-2013 delistings); assumes full histories would be delivered.', count: cand.length,
    rows: cand.map(x => [x.ticker, x.group, +x.startDate.slice(0, 4), +x.endDate.slice(0, 4), x.link.cik || null, x.link.grade, x.endSource]) };
  fs.mkdirSync(outDir, { recursive: true });
  // correction after the independent V12 review (LISTREF MAJOR 6): the row-level files with provider metadata are written only to
  // the private directory (full 1.0.2); the repository receives the public redaction 1.0.3 (scripts/quant/v12/listref/redact.cjs).
  const X = require('./redact.cjs'), fullDir = path.join(priv, 'full'); fs.mkdirSync(fullDir, { recursive: true });
  const keyFile = path.join(priv, 'work/chain-hash-key.txt');
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, require('node:crypto').randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
  const hashKey = fs.readFileSync(keyFile, 'utf8').trim();
  fs.writeFileSync(path.join(fullDir, 'fetch-candidates-1.0.2.json'), JSON.stringify(fetchDoc) + '\n');
  fs.writeFileSync(path.join(fullDir, 'delisting-register-1.0.2.json.gz'), zlib.gzipSync(JSON.stringify(registerDoc) + '\n', { level: 9 }));
  const pubFetch = X.redactFetchCandidates(fetchDoc, hashKey), pubReg = X.redactDelistingRegister(registerDoc, hashKey);
  X.assertRedacted(pubFetch); X.assertRedacted(pubReg);
  fs.writeFileSync(path.join(outDir, 'fetch-candidates-1.0.3.json'), JSON.stringify(pubFetch) + '\n');
  fs.writeFileSync(path.join(outDir, 'reference-summary-1.0.2.json'), JSON.stringify(refSummary, null, 1) + '\n');
  fs.writeFileSync(path.join(outDir, 'coverage-matrix-1.0.2.json'), JSON.stringify(coverageMatrix) + '\n');
  fs.writeFileSync(path.join(outDir, 'reference-completeness-1.0.2.json'), JSON.stringify(completeness, null, 1) + '\n');
  fs.writeFileSync(path.join(outDir, 'coverage-by-year-segment.json'), JSON.stringify(p4doc) + '\n');
  fs.writeFileSync(path.join(outDir, 'delisting-register-1.0.3.json.gz'), zlib.gzipSync(JSON.stringify(pubReg) + '\n', { level: 9 }));
  console.log(JSON.stringify({ chains: b.chains.length, ended: refSummary.counts.endedChains, endSource: refSummary.counts.endSource, links: refSummary.cikLinks, fts: refSummary.ftsQueries, register: b.register.length }, null, 1));
  for (const y of YEARS) { const a = (b.matrix[String(y)] || {}).all?.ALL; const c = b.completeness[y]; if (a) console.log(y, JSON.stringify(shares(a)), c ? JSON.stringify({ ev: c.consideredEvents, lo: c.completenessLower, up: c.completenessUpper }) : ''); }
}

if (require.main === module) main();
module.exports = { build, readiness, shares, ftsUrl };
