'use strict';
// V12 LISTREF step 4: historical listing reference, CIK links, coverage matrix, reference completeness.
// Rules: docs/quant-recovery/v12/listref/protocol-1.0.0.json (+ amendments). Inputs are private files produced by
// fetch_indices.py, export_holdings.cjs, extract_float.py and the Tiingo file; committed outputs carry only counts,
// identifiers, hashes and SEC facts.
//   node scripts/quant/v12/listref/build_reference.cjs --private <dir> --out-dir docs/quant-recovery/v12/listref [--reasons <private>/work/reasons.json]
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const R = require('./reflib.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const YEARS = Array.from({ length: 2026 - 1995 + 1 }, (_, i) => 1995 + i);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const RULE_VERSION = '1.0.0';

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }
function readGzLines(file) { return zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean); }
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean), head = lines[0].split(',');
  return lines.slice(1).map(l => { const c = l.split(','); const o = {}; head.forEach((h, i) => { o[h] = c[i] ?? ''; }); return o; });
}
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

function loadInputs(priv) {
  const csvPath = path.join(priv, 'raw/tiingo/supported_tickers.csv'), zipPath = path.join(priv, 'raw/tiingo/supported_tickers.zip');
  const tiingo = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const events = readGzLines(path.join(priv, 'work/edgar-events.tsv.gz')).map(l => { const [form, cik, date, acc, name] = l.split('\t'); return { form, cik, date, acc, name }; });
  const annual = new Map();
  for (const l of readGzLines(path.join(priv, 'work/edgar-annual.tsv.gz'))) { const [y, cik, fam] = l.split('\t'); annual.set(y + ':' + cik, fam.split(',')); }
  const floats = new Map();
  for (const l of readGzLines(path.join(priv, 'work/public-float.tsv.gz'))) {
    const [cik, end, val] = l.split('\t'); if (!floats.has(cik)) floats.set(cik, []); floats.get(cik).push([end, Number(val)]);
  }
  for (const v of floats.values()) v.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const holdings = JSON.parse(fs.readFileSync(path.join(priv, 'work/holdings.json'), 'utf8'));
  const cikmap = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/universe/cik-map.json'), 'utf8'));
  const lifecycle = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v10/population/lifecycle-cases.json'), 'utf8'));
  const identity = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v10/population/identity-cases.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(priv, 'work/edgar-index-manifest.json'), 'utf8'));
  return { tiingo, events, annual, floats, holdings, cikmap, lifecycle, identity, manifest,
    hashes: { tiingoZipSha256: sha(fs.readFileSync(zipPath)), tiingoCsvSha256: sha(fs.readFileSync(csvPath)), holdingsSha256: sha(fs.readFileSync(path.join(priv, 'work/holdings.json'))),
      publicFloatTsvSha256: sha(fs.readFileSync(path.join(priv, 'work/public-float.tsv.gz'))), cikMapSha256: sha(fs.readFileSync(path.join(ROOT, 'quant/data/universe/cik-map.json'))),
      edgarIndexFilesSha256: sha(JSON.stringify(manifest.files.map(f => [f.url, f.sha256]))) } };
}

const normTicker = t => String(t).toUpperCase().replace(/\./g, '-');
const DELIST_FORMS = new Set(['25', '25-NSE', '15-12B']);
const MERGER_FORMS = new Set(['DEFM14A', 'DEFM14C', 'PREM14A', 'SC 14D9', 'SC TO-T', 'SC 13E3']);

function build(inp, opts = {}) {
  const { tiingo, events, annual, floats, holdings, cikmap, lifecycle, identity } = inp;
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
  const ref = [];
  for (const r of usStock) {
    const c = R.classifySymbol(r.ticker, r.exchange);
    if (!c.keep) { inc(excluded, 'SYMBOL_' + c.reason); continue; }
    const id = 'tiingo:' + r.exchange + ':' + r.ticker + ':' + r.startDate;
    ref.push({ id, ticker: r.ticker, exchange: r.exchange, group: R.EXCHANGE_GROUP[r.exchange], startDate: r.startDate, endDate: r.endDate, ended: R.isEnded(r), fiveLetterKept: c.fiveLetterKept });
  }
  const idCount = {}; for (const x of ref) inc(idCount, x.id);
  const duplicateIds = Object.values(idCount).filter(v => v > 1).length;
  // ---------- 2. ticker reuse ----------
  const byTicker = new Map();
  for (const x of ref) { if (!byTicker.has(x.ticker)) byTicker.set(x.ticker, []); byTicker.get(x.ticker).push(x); }
  const reuse = { tickersWithSeveralRows: 0, reuseGapPairs: 0, adjacentRestartPairs: 0, tickersWithReuseGap: 0 };
  for (const [, rows] of byTicker) {
    rows.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
    if (rows.length > 1) reuse.tickersWithSeveralRows++;
    let gapHit = false;
    rows.forEach((x, i) => { x.tickerRowIndex = i; x.tickerRows = rows.length; x.latestOfTicker = i === rows.length - 1; });
    for (let i = 1; i < rows.length; i++) {
      const gap = R.daysBetween(rows[i - 1].endDate, rows[i].startDate);
      if (gap > 5) { reuse.reuseGapPairs++; gapHit = true; rows[i].reuseOfPrior = 'REUSE_GAP'; } else { reuse.adjacentRestartPairs++; rows[i].reuseOfPrior = 'ADJACENT_RESTART'; }
    }
    if (gapHit) reuse.tickersWithReuseGap++;
  }
  // ---------- 3. SPAC-likely ----------
  for (const x of ref) {
    x.spacLikely = R.spacSiblings(x.ticker, x.exchange).some(s => (symbolByTicker.get(s) || []).some(o => o.startDate <= x.endDate && o.endDate >= x.startDate));
  }
  // ---------- 4. EDGAR event indices ----------
  const delistByDate = [], eightA = [], perCik = new Map();
  for (const e of events) {
    if (DELIST_FORMS.has(e.form) || e.form === '15-12G') delistByDate.push(e);
    if (e.form === '8-A12B' || e.form === '8-A12G') eightA.push(e);
    if (DELIST_FORMS.has(e.form) || e.form === '15-12G' || MERGER_FORMS.has(e.form) || e.form === '8-A12B' || e.form === '8-A12G') {
      if (!perCik.has(e.cik)) perCik.set(e.cik, []); perCik.get(e.cik).push(e);
    }
  }
  const byDateSort = a => a.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  byDateSort(delistByDate); byDateSort(eightA);
  const dates = a => a.map(e => e.date);
  const dDates = dates(delistByDate), aDates = dates(eightA);
  const lowerBound = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; };
  const inWindow = (arr, ds, lo, hi) => { const out = []; for (let i = lowerBound(ds, lo); i < arr.length && ds[i] <= hi; i++) out.push(arr[i]); return out; };
  // ---------- 5. CIK links ----------
  const sidToCanon = new Map(), canonToSeries = new Map();
  for (const s of holdings.series) for (const m of s.masterRows) if (m.baselineMember !== false) { sidToCanon.set(s.securityId, sidToCanon.get(s.securityId) || []); sidToCanon.get(s.securityId).push(m.canonicalId); }
  const aliasCanon = c => c.replace(/^tiingo:NYSE MKT:/, 'tiingo:AMEX:');
  const v10Cik = new Map();
  for (const c of lifecycle.cases) if (c.cik) for (const cid of sidToCanon.get(c.securityId) || []) v10Cik.set(aliasCanon(cid), { cik: String(Number(c.cik)), src: 'lifecycle-cases', securityId: c.securityId });
  for (const c of identity.cases) if (c.cik && c.selectedCanonicalId) v10Cik.set(aliasCanon(c.selectedCanonicalId), { cik: String(Number(c.cik)), src: 'identity-cases', securityId: c.securityId });
  const linkCounts = {};
  for (const x of ref) {
    let link = null;
    const v = v10Cik.get(aliasCanon(x.id));
    const cm = cikmap.byTicker[x.ticker.replace(/-/g, '.')] || cikmap.byTicker[x.ticker];
    if (!x.ended && x.latestOfTicker && cm) link = { grade: 'HIGH_CURRENT_MAP', cik: String(Number(cm.cik)), secExchangeNow: cm.exchange || null, secNameNow: cm.name };
    else if (v) link = { grade: 'HIGH_V10_REGISTER', cik: v.cik, src: v.src };
    else if (x.ended) {
      const lo = R.addDays(x.endDate, -15), hi = R.addDays(x.endDate, 120);
      const cands = inWindow(delistByDate, dDates, lo, hi).filter(e => e.form !== '15-12G' || (x.exchange === 'NASDAQ' && e.date < '2007-01-01'));
      const best = new Map();
      for (const e of cands) {
        const a = R.affinity(x.ticker, e.name);
        const cur = best.get(e.cik);
        if (!cur || a > cur.a || (a === cur.a && Math.abs(R.daysBetween(x.endDate, e.date)) < Math.abs(cur.dd))) best.set(e.cik, { a, dd: R.daysBetween(x.endDate, e.date), e });
      }
      const a3 = [...best.values()].filter(b => b.a === 3);
      if (a3.length === 1) link = { grade: 'MEDIUM_EDGAR_END', cik: a3[0].e.cik, endForm: a3[0].e.form, endAcc: a3[0].e.acc, endDate: a3[0].e.date, dayDiff: a3[0].dd, name: a3[0].e.name, competingCandidates: best.size - 1 };
      else if (x.startDate > R.CENSOR_START) {
        const starts = inWindow(eightA, aDates, R.addDays(x.startDate, -30), R.addDays(x.startDate, 10));
        const startCiks = new Set(starts.map(e => e.cik));
        const both = [...best.values()].filter(b => b.a >= 2 && startCiks.has(b.e.cik));
        const ciks = new Set(both.map(b => b.e.cik));
        if (ciks.size === 1) { const b = both[0]; link = { grade: 'MEDIUM_EDGAR_START_END', cik: b.e.cik, endForm: b.e.form, endAcc: b.e.acc, endDate: b.e.date, dayDiff: b.dd, name: b.e.name, affinity: b.a }; }
        else if (a3.length > 1) link = { grade: 'UNLINKED', reason: 'AMBIGUOUS_A3_CANDIDATES', candidates: a3.length };
      } else if (a3.length > 1) link = { grade: 'UNLINKED', reason: 'AMBIGUOUS_A3_CANDIDATES', candidates: a3.length };
    }
    if (!link) link = { grade: 'UNLINKED', reason: x.ended ? 'NO_UNIQUE_EDGAR_MATCH' : (x.latestOfTicker ? 'NOT_IN_SEC_TICKER_MAP' : 'ACTIVE_BUT_SUPERSEDED_ROW') };
    x.link = link; inc(linkCounts, link.grade + (link.grade === 'UNLINKED' ? ':' + link.reason : ''));
  }
  // ---------- 6. holdings mapping ----------
  const refById = new Map(ref.map(x => [aliasCanon(x.id), x]));
  const holdCounts = {};
  for (const s of holdings.series) {
    let target = null, how = null;
    for (const c of sidToCanon.get(s.securityId) || []) { const t = refById.get(aliasCanon(c)); if (t) { target = t; how = 'CANONICAL_ID'; break; } }
    if (!target && s.listingId) { const t = refById.get(aliasCanon(s.listingId)); if (t) { target = t; how = 'LOADER_LISTING_ID'; } }
    if (!target && s.rawFirst) {
      const cand = (byTicker.get(s.ticker) || []).filter(x => R.daysBetween(x.startDate > s.rawFirst ? x.startDate : s.rawFirst, x.endDate < s.rawLast ? x.endDate : s.rawLast) >= 365);
      if (cand.length === 1) { target = cand[0]; how = 'TICKER_OVERLAP'; }
    }
    if (!target) {
      const any = (symbolByTicker.get(s.ticker) || []);
      const why = any.length ? 'TICKER_ROW_EXCLUDED_BY_SYMBOL_RULE_OR_NO_UNIQUE_OVERLAP' : (tiingo.some(r => r.ticker === s.ticker) ? 'TICKER_ONLY_OUTSIDE_US_STOCK_SCOPE' : 'TICKER_NOT_IN_PROVIDER_FILE');
      inc(holdCounts, 'UNMAPPED:' + why + (s.inFrame ? ':IN_FRAME' : ''));
      continue;
    }
    inc(holdCounts, 'MAPPED:' + how + (s.inFrame ? ':IN_FRAME' : ''));
    if (!target.series) target.series = [];
    target.series.push(s);
  }
  for (const x of ref) if (x.series && x.series.length > 1) inc(holdCounts, 'REF_ROWS_WITH_SEVERAL_SERIES');
  // ---------- 7. per-year matrix ----------
  const yearsWithBars = s => { const out = new Set(); if (!s.rawFirst) return out; for (let y = +s.rawFirst.slice(0, 4); y <= +s.rawLast.slice(0, 4); y++) out.add(y); return out; };
  const frameYears = s => { const out = new Set(); if (!s.inFrame || !s.frameFirst) return out; for (let y = +s.frameFirst.slice(0, 4); y <= +s.frameLast.slice(0, 4); y++) out.add(y); return out; };
  const issuerType = (cik, y) => {
    if (!cik) return 'UNKNOWN';
    let dom = false, fpi = false;
    for (const yy of [y - 1, y, y + 1]) { const f = annual.get(yy + ':' + cik); if (!f) continue; if (f.includes('10K') || f.includes('10KSB')) dom = true; if (f.includes('20F') || f.includes('40F')) fpi = true; }
    return dom ? 'DOMESTIC_FILER' : fpi ? 'FOREIGN_PRIVATE_ISSUER' : 'UNKNOWN';
  };
  const matrix = {}, segKeys = ['all', 'exchange', 'sizeClass', 'listingAge', 'issuerType', 'spacLikely', 'exchangeXsize'];
  const cell = (y, seg, val) => { const k = String(y); matrix[k] = matrix[k] || {}; matrix[k][seg] = matrix[k][seg] || {}; const m = matrix[k][seg]; m[val] = m[val] || { ref: 0, withSeries: 0, frameQualified: 0, ended: 0, endedWithSeries: 0, endedWithLifecycle: 0 }; return m[val]; };
  const scaleSuspect = new Set();
  for (const x of ref) {
    const cik = x.link.cik || null;
    const fl = cik ? floats.get(cik) : null;
    const sYears = new Set(), fYears = new Set();
    let lifecycleDelisted = false;
    for (const s of x.series || []) { for (const y of yearsWithBars(s)) sYears.add(y); for (const y of frameYears(s)) fYears.add(y); if (s.lifecycle && s.lifecycle.status === 'DELISTED_SOURCE_VERIFIED') lifecycleDelisted = true; }
    x.lifecycleDelisted = lifecycleDelisted;
    x.years = {};
    for (const y of YEARS) {
      if (!R.activeIn(x, y)) continue;
      const f = R.floatFor(fl, y);
      if (f.flag) scaleSuspect.add(cik + ':' + y);
      const seg = { all: 'ALL', exchange: x.group, sizeClass: R.sizeClass(f.value), listingAge: R.ageBucket(x.startDate, y), issuerType: issuerType(cik, y), spacLikely: x.spacLikely ? 'SPAC_LIKELY' : 'NOT_SPAC_LIKELY' };
      seg.exchangeXsize = seg.exchange + '|' + seg.sizeClass;
      const endedHere = x.ended && +x.endDate.slice(0, 4) === y;
      const hasS = sYears.has(y), hasF = fYears.has(y);
      x.years[y] = [seg.sizeClass, seg.issuerType, hasS ? 1 : 0, hasF ? 1 : 0];
      for (const k of segKeys) {
        const c = cell(y, k, seg[k]);
        c.ref++; if (hasS) c.withSeries++; if (hasF) c.frameQualified++;
        if (endedHere) { c.ended++; if (hasS) c.endedWithSeries++; if (lifecycleDelisted) c.endedWithLifecycle++; }
      }
    }
  }
  // ---------- 8. EDGAR delisting events + reference completeness ----------
  const operating = (cik, y) => [y - 2, y - 1, y].some(yy => annual.has(yy + ':' + cik));
  const stillListed = cik => { const e = cikByCik.get(cik); return e && /^(NYSE|Nasdaq|NYSE American|NYSE MKT|AMEX)$/i.test(e.exchange || ''); };
  const cikByCik = new Map(); for (const [t, e] of Object.entries(cikmap.byTicker)) { const c = String(Number(e.cik)); if (!cikByCik.has(c) || /NYSE|Nasdaq/i.test(e.exchange || '')) cikByCik.set(c, { ...e, ticker: t }); }
  const evs = [];
  for (const [cik, list] of perCik) {
    const del = list.filter(e => DELIST_FORMS.has(e.form) && (e.form !== '25' && e.form !== '25-NSE' || e.date >= '2001-01-01')).sort((a, b) => (a.date < b.date ? -1 : 1));
    let cur = null;
    for (const e of del) {
      if (cur && R.daysBetween(cur.lastDate, e.date) <= 180) { cur.forms.push([e.form, e.date, e.acc]); cur.lastDate = e.date; continue; }
      cur = { cik, date: e.date, lastDate: e.date, name: e.name, forms: [[e.form, e.date, e.acc]] }; evs.push(cur);
    }
  }
  const linkByCik = new Map();
  for (const x of ref) if (x.link.cik) { if (!linkByCik.has(x.link.cik)) linkByCik.set(x.link.cik, []); linkByCik.get(x.link.cik).push(x); }
  const completeness = {}, register = [];
  for (const ev of evs) {
    const y = +ev.date.slice(0, 4);
    if (y < 1995) continue;
    const op = operating(ev.cik, y), still = stillListed(ev.cik);
    // event is linked when a reference row of this CIK ends within [event-120d, event+15d] (mirror of the END window)
    const rows = (linkByCik.get(ev.cik) || []).filter(x => x.ended && ev.forms.some(f => R.daysBetween(x.endDate, f[1]) >= -15 && R.daysBetween(x.endDate, f[1]) <= 120));
    const merger = (perCik.get(ev.cik) || []).some(e => MERGER_FORMS.has(e.form) && R.daysBetween(e.date, ev.date) >= 0 && R.daysBetween(e.date, ev.date) <= 365);
    const issuer25 = ev.forms.some(f => f[0] === '25'), nse = ev.forms.some(f => f[0] === '25-NSE');
    const c = completeness[y] = completeness[y] || { edgarEvents: 0, operatingIssuer: 0, excludedStillListed: 0, consideredEvents: 0, linkedToReferenceRow: 0, linkedRowWithSeries: 0, linkedRowWithLifecycle: 0, byForm: {} };
    c.edgarEvents++;
    if (!op) continue;
    c.operatingIssuer++;
    if (still) { c.excludedStillListed++; continue; }
    c.consideredEvents++;
    inc(c.byForm, nse ? '25-NSE' : issuer25 ? '25' : '15-12B');
    if (rows.length) { c.linkedToReferenceRow++; if (rows.some(x => x.series && x.series.length)) c.linkedRowWithSeries++; if (rows.some(x => x.lifecycleDelisted)) c.linkedRowWithLifecycle++; }
    register.push({ cik: ev.cik, eventDate: ev.date, name: ev.name, forms: ev.forms, operatingIssuer: op, mergerProcessIndexed: merger, issuerForm25: issuer25, exchangeForm25NSE: nse,
      linkedRows: rows.map(x => ({ ticker: x.ticker, exchange: x.group, grade: x.link.grade, dayDiffEndToEvent: R.daysBetween(x.endDate, ev.date), withSeries: !!(x.series && x.series.length), lifecycleDelisted: x.lifecycleDelisted })) });
  }
  for (const c of Object.values(completeness)) c.linkedShare = c.consideredEvents ? +(c.linkedToReferenceRow / c.consideredEvents).toFixed(4) : null;
  // reference-side: ended rows and their link status per year
  const endedRows = {};
  for (const x of ref) if (x.ended) { const y = x.endDate.slice(0, 4); const e = endedRows[y] = endedRows[y] || { ended: 0, linkedAnyGrade: 0, linkedToEdgarDelisting: 0, withSeries: 0, lifecycle: 0 }; e.ended++; if (x.link.cik) e.linkedAnyGrade++; if (x.link.endForm) e.linkedToEdgarDelisting++; if (x.series && x.series.length) e.withSeries++; if (x.lifecycleDelisted) e.lifecycle++; }
  return { ref, excluded, duplicateIds, reuse, linkCounts, holdCounts, matrix, completeness, endedRows, register, scaleSuspect: scaleSuspect.size, usStockRows: usStock.length };
}

function shares(c) { return { ...c, seriesCoverage: c.ref ? +(c.withSeries / c.ref).toFixed(4) : null, frameCoverage: c.ref ? +(c.frameQualified / c.ref).toFixed(4) : null,
  delistingSeriesCoverage: c.ended ? +(c.endedWithSeries / c.ended).toFixed(4) : null, delistingLifecycleCoverage: c.ended ? +(c.endedWithLifecycle / c.ended).toFixed(4) : null }; }

function readiness(c, completenessShare) {
  if (!c.ref || c.ref < 30) return 'INSUFFICIENT';
  const cov = c.withSeries / c.ref;
  if (completenessShare === null || completenessShare < 0.8) return 'INSUFFICIENT';
  if (cov >= 0.95) return 'STUDY_READY_TRANSPARENT_GAP';
  if (cov >= 0.8) return 'PARTIAL';
  return 'INSUFFICIENT';
}

function main() {
  const priv = path.resolve(arg('--private'));
  const outDir = path.resolve(arg('--out-dir'));
  const inp = loadInputs(priv);
  const b = build(inp);
  const protocolSha = sha(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v12/listref/protocol-1.0.0.json')));
  const codeSha = Object.fromEntries(['scripts/quant/v12/listref/build_reference.cjs', 'scripts/quant/v12/listref/reflib.cjs'].map(f => [f, sha(fs.readFileSync(path.join(ROOT, f)))]));
  // private full reference
  const privRows = b.ref.map(x => ({ id: x.id, ticker: x.ticker, exchange: x.exchange, startDate: x.startDate, endDate: x.endDate, ended: x.ended, spacLikely: x.spacLikely, fiveLetterKept: x.fiveLetterKept,
    reuseOfPrior: x.reuseOfPrior || null, link: x.link, series: (x.series || []).map(s => s.securityId), lifecycleDelisted: x.lifecycleDelisted, years: x.years }));
  const privText = privRows.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.mkdirSync(path.join(priv, 'work'), { recursive: true });
  fs.writeFileSync(path.join(priv, 'work/reference-listings.jsonl.gz'), zlib.gzipSync(privText));
  const env = { ruleVersion: RULE_VERSION, protocolSha256: protocolSha, codeSha256: codeSha, inputs: inp.hashes, evidenceKind: 'SOURCE_EVIDENCE', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    dataAsOf: { tiingoFile: '2026-10-28', edgarIndexLastDataReceived: inp.manifest.files.at(-1).lastDataReceived, holdingsWeekly: inp.holdings.series.reduce((m, s) => (s.rawLast && s.rawLast > m ? s.rawLast : m), '') } };
  const refSummary = { schemaVersion: 'v12-listref-reference-summary-1.0.0', ...env,
    counts: { tiingoRows: inp.tiingo.length, usExchangeStockUsdRows: b.usStockRows, referenceRows: b.ref.length, referenceRowsEnded: b.ref.filter(x => x.ended).length, duplicateRowIds: b.duplicateIds,
      fiveLetterKept: b.ref.filter(x => x.fiveLetterKept).length, spacLikely: b.ref.filter(x => x.spacLikely).length, excludedByReason: Object.fromEntries(Object.entries(b.excluded).sort()) },
    tickerReuse: b.reuse, cikLinks: Object.fromEntries(Object.entries(b.linkCounts).sort()), holdingsMapping: Object.fromEntries(Object.entries(b.holdCounts).sort()),
    publicFloatScaleSuspectCikYears: b.scaleSuspect, privateReference: { file: 'v12-private/listref/work/reference-listings.jsonl.gz', sha256: sha(privText), rows: privRows.length },
    endedReferenceRowsByYear: b.endedRows };
  const matrix = {};
  for (const [y, segs] of Object.entries(b.matrix)) { matrix[y] = {}; for (const [k, vals] of Object.entries(segs)) { matrix[y][k] = {}; for (const [v, c] of Object.entries(vals)) matrix[y][k][v] = shares(c); } }
  const coverageMatrix = { schemaVersion: 'v12-listref-coverage-matrix-1.0.0', ...env, definitions: { ref: 'reference rows active in year', withSeries: 'mapped weekly series with >= 1 bar in year', frameQualified: 'mapped series in V10/V11 frame with >= 1 loader bar in year', ended: 'reference rows ending in year (endDate < 2026-09-28)', endedWithSeries: 'ended rows with a mapped series with a bar in that year', endedWithLifecycle: 'ended rows whose mapped series carries an SEC-sourced last trading day (DELISTED_SOURCE_VERIFIED)' }, years: matrix };
  const completeness = { schemaVersion: 'v12-listref-reference-completeness-1.0.0', ...env,
    definition: 'EDGAR delisting events (25/25-NSE 2001+, 15-12B; one event per CIK within 180 days) of operating issuers (10-K/10-KSB/20-F/40-F in [Y-2,Y]), excluding CIKs still mapped to NYSE/Nasdaq/NYSE American in the current SEC ticker map; linkedShare = share linked to an ended Tiingo reference row of the same CIK',
    perYear: b.completeness };
  // P4 table
  const p4 = [];
  for (const y of YEARS) {
    const segs = b.matrix[String(y)] || {};
    const comp = b.completeness[y] ? b.completeness[y].linkedShare : null;
    for (const [segKey, vals] of Object.entries(segs)) for (const [val, c] of Object.entries(vals)) {
      if (segKey === 'exchangeXsize' || segKey === 'spacLikely' || segKey === 'issuerType') continue;
      const s = shares(c);
      p4.push({ year: y, segment: segKey, value: val, ref: c.ref, withSeries: c.withSeries, frameQualified: c.frameQualified, seriesCoverage: s.seriesCoverage, frameCoverage: s.frameCoverage,
        refDelistings: c.ended, delistingsWithSeries: c.endedWithSeries, delistingsWithLifecycle: c.endedWithLifecycle, referenceCompleteness: comp, readiness: readiness(c, comp) });
    }
    for (const [val, c] of Object.entries(segs.exchangeXsize || {})) {
      const s = shares(c);
      p4.push({ year: y, segment: 'exchangeXsize', value: val, ref: c.ref, withSeries: c.withSeries, frameQualified: c.frameQualified, seriesCoverage: s.seriesCoverage, frameCoverage: s.frameCoverage,
        refDelistings: c.ended, delistingsWithSeries: c.endedWithSeries, delistingsWithLifecycle: c.endedWithLifecycle, referenceCompleteness: comp, readiness: readiness(c, comp) });
    }
  }
  const p4doc = { schemaVersion: 'v12-listref-coverage-by-year-segment-1.0.0', ...env, readinessRule: 'protocol-1.0.0 p4Readiness: n_ref >= 30, referenceCompleteness (EDGAR linkedShare of the year) >= 0.80, seriesCoverage >= 0.95 -> STUDY_READY_TRANSPARENT_GAP; >= 0.80 -> PARTIAL; else INSUFFICIENT',
    columns: ['year', 'segment', 'value', 'ref', 'withSeries', 'frameQualified', 'seriesCoverage', 'frameCoverage', 'refDelistings', 'delistingsWithSeries', 'delistingsWithLifecycle', 'referenceCompleteness', 'readiness'],
    rows: p4.map(r => [r.year, r.segment, r.value, r.ref, r.withSeries, r.frameQualified, r.seriesCoverage, r.frameCoverage, r.refDelistings, r.delistingsWithSeries, r.delistingsWithLifecycle, r.referenceCompleteness, r.readiness]) };
  const registerDoc = { schemaVersion: 'v12-listref-delisting-register-1.0.0', ...env, source: 'EDGAR full-index form.gz 1995-2026 (accession numbers resolve to https://www.sec.gov/Archives/edgar/data/<cik>/<accession-no-dashes>/)',
    columns: ['cik', 'eventDate', 'name', 'forms[[form,date,accession]]', 'mergerProcessIndexed', 'issuerForm25', 'exchangeForm25NSE', 'linkedRows'], count: b.register.length,
    events: b.register.map(e => [e.cik, e.eventDate, e.name, e.forms, e.mergerProcessIndexed, e.issuerForm25, e.exchangeForm25NSE, e.linkedRows]) };
  fs.mkdirSync(outDir, { recursive: true });
  const w = (f, o) => fs.writeFileSync(path.join(outDir, f), JSON.stringify(o, null, f.endsWith('.json') && o.rows ? 0 : 1) + '\n');
  w('reference-summary-1.0.0.json', refSummary);
  fs.writeFileSync(path.join(outDir, 'coverage-matrix-1.0.0.json'), JSON.stringify(coverageMatrix) + '\n');
  w('reference-completeness-1.0.0.json', completeness);
  fs.writeFileSync(path.join(outDir, 'coverage-by-year-segment.json'), JSON.stringify(p4doc) + '\n');
  fs.writeFileSync(path.join(outDir, 'delisting-register-1.0.0.json.gz'), zlib.gzipSync(JSON.stringify(registerDoc) + '\n', { level: 9 }));
  // private register with full objects for later steps
  fs.writeFileSync(path.join(priv, 'work/delisting-register.json'), JSON.stringify(b.register));
  console.log(JSON.stringify({ referenceRows: b.ref.length, ended: refSummary.counts.referenceRowsEnded, links: refSummary.cikLinks, holdings: refSummary.holdingsMapping, reuse: b.reuse, register: b.register.length }, null, 1));
  for (const y of YEARS) { const a = (b.matrix[String(y)] || {}).all?.ALL; const c = b.completeness[y]; if (a) console.log(y, JSON.stringify(shares(a)), c ? JSON.stringify({ ev: c.consideredEvents, linked: c.linkedToReferenceRow, share: c.linkedShare }) : ''); }
}

if (require.main === module) main();
module.exports = { build, readiness, shares };
