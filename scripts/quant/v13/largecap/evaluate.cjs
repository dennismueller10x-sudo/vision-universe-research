#!/usr/bin/env node
/* V13 LARGECAP step 3: band tests, identity, runs and intervals (protocol-1.0.0.json, amendment 1.0.1).
 * node scripts/quant/v13/largecap/evaluate.cjs --facts <private facts.jsonl> --version 1.0.1 --out <cases.json>
 * Reads the committed series and master (never writes them). Every threshold comes from the protocol file. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const CA = require(path.join(ROOT, 'quant/engines/corporate-action-evidence.js'));
const { hash } = require(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs'));

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const PROTO_PATH = path.join(ROOT, 'docs/quant-recovery/v13/largecap/protocol-1.0.0.json');
const AMEND_PATH = path.join(ROOT, 'docs/quant-recovery/v13/largecap/protocol-amendment-1.0.1.json');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const DAY = 86400000;
const t = d => Date.parse(d + 'T00:00:00Z');
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => iso(t(d) + n * DAY);
const days = (a, b) => Math.round((t(b) - t(a)) / DAY);

function params(version) {
  const P = JSON.parse(fs.readFileSync(PROTO_PATH, 'utf8'));
  const A = P.priceAnchors.A_QUARTERLY_RANGE, B = P.priceAnchors.B_REPURCHASE_AVERAGE_PRICE;
  return { P, version, tolA: A.tolerance, buffer: A.boundaryBufferDays, tolB: B.tolerance, minA: 3, minB: 2, bigDev: 0.10, gap: 366, eventWin: 120,
    maxFailShare: 0.05, minBars: 104, idWin: 400, formatC: version !== '1.0.0', fyeFromAnnual: version !== '1.0.0' };
}

function lastDay(y, m) { return iso(Date.UTC(y, m, 0)); } // m 1..12
function quarterPeriod(fy, q, fyeMonth) {
  const endIdx = fy * 12 + (fyeMonth - 1) - 3 * (4 - q), startIdx = endIdx - 2;
  return { start: iso(Date.UTC(Math.floor(startIdx / 12), startIdx % 12, 1)), end: lastDay(Math.floor(endIdx / 12), endIdx % 12 + 1) };
}
function ratioOf(f) {
  for (let q = 1; q <= 10; q++) { const p = Math.round(f * q); if (p >= 1 && p <= 10 && Math.abs(p / q - f) / f <= 1e-4) { const g = gcd(p, q); return [p / g, q / g]; } }
  return null;
}
function gcd(a, b) { return b ? gcd(b, a % b) : a; }

function evaluate(sid, docs, opt) {
  const P = opt.P, ticker = sid.slice(4), cands = P.listingIdentity.candidateSymbols[sid];
  const seriesPath = path.join(ROOT, 'quant/data/market/discover-series-long', sid + '.json');
  const seriesBytes = fs.readFileSync(seriesPath, 'utf8'), series = JSON.parse(seriesBytes), pts = series.points;
  const master = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/security-master/us-security-master.json'), 'utf8'));
  const rows = master.rows.filter(r => r.baseline_security_id === sid);
  // ---- filings (identity is a property of the filing = accession; all fetched documents of it)
  const byAcc = new Map();
  for (const d of docs) {
    if (!byAcc.has(d.accession)) byAcc.set(d.accession, { accession: d.accession, form: d.form, filingDate: d.filingDate, reportDate: d.reportDate, docs: [], symbols: new Set(), exchange: null, changes: [], splits: [], symbolQuotes: [] });
    const f = byAcc.get(d.accession);
    f.docs.push(d);
    for (const s of d.symbols) { f.symbols.add(s.symbol); f.symbolQuotes.push({ symbol: s.symbol, url: d.url, quote: s.quote }); }
    if (d.exchange && !f.exchange) f.exchange = { url: d.url, quote: d.exchange.quote };
    for (const c of d.changes) f.changes.push({ ...c, url: d.url, sha256: d.sha256 });
    for (const s of d.splits) f.splits.push({ ...s, url: d.url, sha256: d.sha256 });
  }
  const filings = [...byAcc.values()].sort((a, b) => a.filingDate < b.filingDate ? -1 : a.filingDate > b.filingDate ? 1 : 0);
  // ---- symbol chain
  const edges = new Map(cands.map(c => [c, new Set()])), changeAnchors = [];
  for (const f of filings) for (const c of f.changes) { edges.get(c.from).add(c.to); edges.get(c.to).add(c.from); changeAnchors.push({ pair: [c.from, c.to], accession: f.accession, filingDate: f.filingDate, url: c.url, sha256: c.sha256, quote: c.quote }); }
  const valid = new Set([ticker]); const stack = [ticker];
  while (stack.length) { const x = stack.pop(); for (const y of edges.get(x) || []) if (!valid.has(y)) { valid.add(y); stack.push(y); } }
  const idFilings = filings.filter(f => f.symbols.size === 1 && f.exchange && valid.has([...f.symbols][0]));
  const idDates = idFilings.map(f => f.filingDate);
  const identityOk = f => {
    if (idFilings.includes(f)) return 'OWN';
    const before = idDates.filter(d => d <= f.filingDate).at(-1), after = idDates.find(d => d >= f.filingDate);
    return before && after && days(before, after) <= opt.idWin ? 'BRACKETED' : null;
  };
  const idBound = idDates.length ? { from: addDays(idDates[0], -opt.idWin), to: addDays(idDates.at(-1), opt.idWin) } : null;
  // ---- factors
  const factors = (series.corporateActions?.splits || []).map(([date, f]) => {
    const r = ratioOf(f);
    let ev = null;
    if (r) for (const fl of filings) {
      if (fl.filingDate < addDays(date, -400) || fl.filingDate > addDays(date, 800)) continue;
      const s = fl.splits.find(x => x.ratio[0] / gcd(x.ratio[0], x.ratio[1]) === r[0] && x.ratio[1] / gcd(x.ratio[0], x.ratio[1]) === r[1]);
      if (s) { ev = { accession: fl.accession, filingDate: fl.filingDate, url: s.url, sha256: s.sha256, quote: s.quote }; break; }
    }
    return { date, factor: f, ratio: r, class: r && ev ? 'SPLIT' : 'NON_SPLIT', evidence: ev };
  });
  const conv = (i, filingDate) => {
    let m = 1;
    for (const f of factors) {
      if (f.class === 'SPLIT' ? f.date > filingDate : f.date > pts[i][0]) m *= f.factor;
    }
    return pts[i][1] * m;
  };
  const dates = pts.map(p => p[0]);
  // ---- fiscal year end month per FY label
  const fye = new Map();
  for (const f of filings) if (/^10-K/.test(f.form) && f.reportDate) fye.set(+f.reportDate.slice(0, 4), +f.reportDate.slice(5, 7));
  // ---- periods
  const periods = [], counts = { A: { parsed: 0, formatCIgnored: 0, identityMissing: 0, untested: 0, tested: 0, pass: 0, fail: 0 }, B: { parsed: 0, identityMissing: 0, untested: 0, tested: 0, pass: 0, fail: 0 } };
  const docRef = new Map();
  for (const f of filings) {
    const idk = identityOk(f);
    for (const d of f.docs) {
      for (const a of d.A) {
        counts.A.parsed++;
        if (a.format === 'C' && !opt.formatC) { counts.A.formatCIgnored++; continue; }
        if (!idk) { counts.A.identityMissing++; continue; }
        const m = opt.fyeFromAnnual && fye.has(a.fy) ? fye.get(a.fy) : +f.reportDate.slice(5, 7);
        const { start, end } = quarterPeriod(a.fy, a.q, m);
        const idx = dates.map((x, i) => [x, i]).filter(([x]) => days(start, x) > opt.buffer && days(x, end) > opt.buffer).map(([, i]) => i);
        if (idx.length < opt.minA) { counts.A.untested++; continue; }
        const cs = idx.map(i => conv(i, f.filingDate));
        const lo = Math.min(...cs), hi = Math.max(...cs);
        const pass = cs.every(c => c >= a.low * (1 - opt.tolA) && c <= a.high * (1 + opt.tolA));
        const dev = Math.max(0, ...cs.map(c => Math.max((a.low - c) / a.low, (c - a.high) / a.high)));
        counts.A.tested++; counts.A[pass ? 'pass' : 'fail']++;
        docRef.set(d.url, d);
        periods.push({ type: 'A', start, end, fy: a.fy, q: a.q, high: a.high, low: a.low, format: a.format, accession: f.accession, filingDate: f.filingDate, url: d.url, identity: idk,
          bars: idx.length, convMin: +lo.toFixed(4), convMax: +hi.toFixed(4), pass, deviation: +dev.toFixed(4), quote: a.quote });
      }
      for (const b of d.B) {
        counts.B.parsed++;
        if (!idk) { counts.B.identityMissing++; continue; }
        const s = b.start, e = b.end;
        const idx = []; let before = -1;
        dates.forEach((x, i) => { if (x < s) before = i; else if (x <= addDays(e, 6)) idx.push(i); });
        if (before >= 0) idx.unshift(before);
        if (idx.length < opt.minB) { counts.B.untested++; continue; }
        const cs = idx.map(i => conv(i, f.filingDate)), lo = Math.min(...cs), hi = Math.max(...cs);
        const pass = b.avgPrice >= lo * (1 - opt.tolB) && b.avgPrice <= hi * (1 + opt.tolB);
        const dev = Math.max(0, (lo - b.avgPrice) / lo, (b.avgPrice - hi) / hi);
        counts.B.tested++; counts.B[pass ? 'pass' : 'fail']++;
        docRef.set(d.url, d);
        periods.push({ type: 'B', start: s, end: e, avgPrice: b.avgPrice, shares: b.shares, accession: f.accession, filingDate: f.filingDate, url: d.url, identity: idk,
          bars: idx.length, convMin: +lo.toFixed(4), convMax: +hi.toFixed(4), pass, deviation: +dev.toFixed(4), quote: b.quote });
      }
    }
  }
  periods.sort((a, b) => a.end < b.end ? -1 : a.end > b.end ? 1 : a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  // ---- events
  const events = [];
  for (let i = 1; i < pts.length; i++) { const r = pts[i][1] / pts[i - 1][1]; if (CA.splitSized(r)) events.push({ kind: 'SPLIT_SIZED_MOVE', date: pts[i][0], prevWeek: pts[i - 1][0], close: pts[i][1], prevClose: pts[i - 1][1], weeklyRatio: +r.toFixed(6) }); }
  for (const f of factors) events.push({ kind: 'PROVIDER_FACTOR', date: f.date, factor: f.factor, class: f.class });
  events.sort((a, b) => a.date < b.date ? -1 : 1);
  // ---- runs
  const rawRuns = [], breaks = [];
  let cur = [];
  const close = () => { if (cur.length) rawRuns.push(cur); cur = []; };
  for (let k = 0; k < periods.length; k++) {
    const p = periods[k];
    if (!p.pass && p.deviation > opt.bigDev) { breaks.push({ reason: 'LARGE_DEVIATION', period: [p.start, p.end], type: p.type, deviation: p.deviation, accession: p.accession }); close(); continue; }
    if (!p.pass && periods[k + 1] && !periods[k + 1].pass) {
      breaks.push({ reason: 'CONSECUTIVE_FAILURES', period: [p.start, periods[k + 1].end], accession: p.accession }); close();
      k++; while (periods[k + 1] && !periods[k + 1].pass) k++;
      continue;
    }
    const lastPass = [...cur].reverse().find(x => x.pass);
    if (p.pass && lastPass && days(lastPass.end, p.start) > opt.gap) { breaks.push({ reason: 'GAP', between: [lastPass.end, p.start], days: days(lastPass.end, p.start) }); close(); }
    cur.push(p);
  }
  close();
  const splitByEvents = run => {
    const pass = run.filter(p => p.pass);
    if (!pass.length) return [run];
    const lo = pass.reduce((m, p) => p.start < m ? p.start : m, pass[0].start), hi = pass.reduce((m, p) => p.end > m ? p.end : m, pass[0].end);
    for (const ev of events) {
      if (ev.date <= lo || ev.date > hi) continue;
      const bef = pass.some(p => (p.start <= ev.date && ev.date <= p.end) || (ev.date > p.end && days(p.end, ev.date) <= opt.eventWin));
      const aft = pass.some(p => (p.start <= ev.date && ev.date <= p.end) || (p.start > ev.date && days(ev.date, p.start) <= opt.eventWin));
      if (!(bef && aft)) {
        breaks.push({ reason: 'EVENT_NOT_BRACKETED', event: ev.kind, date: ev.date });
        const a = run.filter(p => p.end < ev.date), b = run.filter(p => p.start > ev.date);
        return [...(a.length ? splitByEvents(a) : []), ...(b.length ? splitByEvents(b) : [])];
      }
    }
    return [run];
  };
  const runs = rawRuns.flatMap(splitByEvents).map(run => {
    const pass = run.filter(p => p.pass), fail = run.length - pass.length;
    const r = { periods: run.length, pass: pass.length, fail, failShare: +(fail / run.length).toFixed(4) };
    if (!pass.length) return { ...r, accepted: false, reason: 'NO_PASSING_PERIOD' };
    let start = pass.reduce((m, p) => p.start < m ? p.start : m, pass[0].start), end = pass.reduce((m, p) => p.end > m ? p.end : m, pass[0].end);
    r.anchoredStart = start; r.anchoredEnd = end;
    if (idBound) { if (start < idBound.from) start = idBound.from; if (end > idBound.to) end = idBound.to; }
    const inside = pts.filter(p => p[0] >= start && p[0] <= end);
    r.start = start; r.end = end; r.bars = inside.length;
    if (r.failShare > opt.maxFailShare) return { ...r, accepted: false, reason: 'FAIL_SHARE_ABOVE_LIMIT' };
    if (inside.length < opt.minBars) return { ...r, accepted: false, reason: 'TOO_FEW_BARS' };
    return { ...r, accepted: true, validFrom: inside[0][0], validTo: inside.at(-1)[0], _run: run };
  });
  const accepted = runs.filter(r => r.accepted).sort((a, b) => a.end < b.end ? 1 : -1);
  const chosen = accepted[0] || null;
  const reasons = [];
  if (!idFilings.length) reasons.push('NO_IDENTITY_FILING');
  if (!periods.length) reasons.push('NO_TESTED_ANCHOR');
  if (!chosen) reasons.push(runs.length ? 'NO_ACCEPTED_RUN' : 'NO_RUN');
  const active = rows.filter(r => r.active_status === 'ACTIVE' && r.ticker === ticker);
  let master = null;
  if (rows.length === 1 && rows[0].ticker === ticker && rows[0].active_status === 'ACTIVE') master = { masterRowAction: 'SINGLE_ROW_INTERVAL', selectedCanonicalId: rows[0].canonical_id, masterRowSet: [rows[0].canonical_id] };
  else if (rows.length === 2 && active.length === 1 && rows.filter(r => r.active_status === 'INACTIVE').length === 1) master = { masterRowAction: 'SELECT_EXISTING_ROW', selectedCanonicalId: active[0].canonical_id, masterRowSet: rows.map(r => r.canonical_id).sort() };
  else reasons.push('MASTER_ROWS_NOT_SELECTABLE');
  const out = { securityId: sid, ticker, cik: P.listingIdentity.cik[sid], protocolVersion: opt.version, status: chosen && master ? 'UNLOCKED' : 'LOCKED', reasons,
    series: { sha256: sha(seriesBytes), from: pts[0][0], to: pts.at(-1)[0], bars: pts.length, asOf: series.asOf },
    master, identity: { candidateSymbols: cands, validSymbols: [...valid].sort(), identityFilings: idFilings.length, firstIdentityFiling: idDates[0] || null, lastIdentityFiling: idDates.at(-1) || null, bound: idBound,
      firstIdentityQuote: idFilings[0] ? { accession: idFilings[0].accession, ...idFilings[0].symbolQuotes[0], exchangeQuote: idFilings[0].exchange.quote } : null,
      changeAnchors, filingsWithSymbol: filings.filter(f => f.symbols.size).length, filingsTotal: filings.length },
    factors, counts, breaks, runs: runs.map(({ _run, ...r }) => r), events: events.map(e => ({ ...e })) };
  if (chosen && master) {
    const vf = chosen.validFrom, vt = chosen.validTo, inside = pts.filter(p => p[0] >= vf && p[0] <= vt);
    out.interval = { validFrom: vf, validTo: vt, bars: inside.length, anchoredStart: chosen.anchoredStart, anchoredEnd: chosen.anchoredEnd };
    out.historyGuard = { checkedFrom: vf, checkedTo: vt, pointsSha256: hash(inside), bars: inside.length };
    out.bandConfirmedMoves = events.filter(e => e.kind === 'SPLIT_SIZED_MOVE' && e.prevWeek >= vf && e.date <= vt).map(e => ({ week: e.date, prevWeek: e.prevWeek, close: e.close, prevClose: e.prevClose, weeklyRatio: e.weeklyRatio }));
    out.factorsInside = factors.filter(f => f.date > vf && f.date <= vt).map(f => ({ date: f.date, factor: f.factor, class: f.class }));
    out.anchorsInside = { A: chosen._run.filter(p => p.type === 'A').length, B: chosen._run.filter(p => p.type === 'B').length, pass: chosen._run.filter(p => p.pass).length, fail: chosen._run.filter(p => !p.pass).length };
  }
  out.periods = periods;
  out.documents = [...docRef.values()].map(d => ({ url: d.url, accession: d.accession, form: d.form, filingDate: d.filingDate, kind: d.kind, sha256: d.sha256, sha256Normalized: d.sha256Normalized }))
    .sort((a, b) => a.filingDate < b.filingDate ? -1 : a.filingDate > b.filingDate ? 1 : a.url < b.url ? -1 : 1);
  return out;
}

function main() {
  const version = arg('version') || '1.0.1', opt = params(version);
  const facts = fs.readFileSync(arg('facts'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const sids = opt.P.scope.listings;
  const cases = sids.map(sid => evaluate(sid, facts.filter(d => d.sid === sid), opt));
  const doc = { schemaVersion: 'v13-largecap-cases-1.0.0', protocolVersion: version, protocolSha256: sha(fs.readFileSync(PROTO_PATH)),
    amendmentSha256: version === '1.0.0' ? null : sha(fs.readFileSync(AMEND_PATH)),
    resultStatus: version === '1.0.0' ? 'REGISTERED_PROTOCOL' : 'REGISTERED_AMENDMENT_BEFORE_OUTCOMES',
    codeSha256: { 'evaluate.cjs': sha(fs.readFileSync(__filename)), 'extract.py': sha(fs.readFileSync(path.join(__dirname, 'extract.py'))), 'build_facts.py': sha(fs.readFileSync(path.join(__dirname, 'build_facts.py'))) },
    factsSha256: sha(fs.readFileSync(arg('facts'))), certificationStatus: 'NOT_CERTIFIED', productionApproved: false, evidenceKind: 'SOURCE_EVIDENCE',
    summary: cases.map(c => ({ securityId: c.securityId, status: c.status, validFrom: c.interval?.validFrom || null, validTo: c.interval?.validTo || null, bars: c.interval?.bars || 0, reasons: c.reasons })),
    cases };
  fs.writeFileSync(arg('out'), JSON.stringify(doc, null, 1) + '\n');
  for (const s of doc.summary) console.log(JSON.stringify(s));
}
if (require.main === module) main();
module.exports = { evaluate, params, quarterPeriod, ratioOf };
