#!/usr/bin/env node
'use strict';
// Edge 2 – Lauf nach docs/research/edge2/PROTOKOLL.json (SHA-256 gepinnt). Forschung, nicht zertifiziert.
//
//   node scripts/research/edge2/run-edge2.cjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D \
//        --out <Ordner außerhalb des Repos> [--reviewer-key <pem>]
//   Rauchtest ohne R2 (committete Wochenreihen, Tagesbalken der fünf Golden-Titel):
//   node scripts/research/edge2/run-edge2.cjs --smoke 1 --bars-dir quant/data/market/golden-preview/daily --out /tmp/x
//
// Schreibt nur nach --out: edge2.public.json (Zählungen, Hashes, Urteilszahlen, ID der Papiervariante, keine Kennzahl),
// edge2.sealed.owner.json und optional edge2.sealed.reviewer.json (alle Kennzahlen und Wochenrenditen).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const PIN = require('./protocol-pin.cjs');
const E2 = require('./edge2.cjs');
const Q = require('../edge/quant-e3.cjs');
const S = require('../edge/study.cjs');
const VERSION = 'edge2-run-1.0.0';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function args(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) { const k = argv[i]; if (!k.startsWith('--')) throw Error('ARG ' + k); a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1]; i++; }
  return a;
}
function protocol() {
  const bytes = fs.readFileSync(path.join(ROOT, PIN.PROTOCOL_FILE)), h = sha(bytes);
  if (h !== PIN.PROTOCOL_SHA256) throw Error('PROTOCOL_CHANGED ' + h);
  return { doc: JSON.parse(bytes), sha256: h };
}

// ------------------------------------------------------------ Tagesbalken (wie s2.mjs#r2Payload / #delistedPayload)
function r2Payload(dir, securityId) {
  const file = path.join(dir, securityId + '.json');
  if (!fs.existsSync(file)) return null;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bars = (d.bars || []).filter(b => b && typeof b.date === 'string').map(b => ({ date: b.date.slice(0, 10), open: +b.open, high: +b.high, low: +b.low, close: +b.close, volume: +b.volume, splitFactor: Number(b.splitFactor) > 0 ? +b.splitFactor : 1 }))
    .sort((x, y) => x.date < y.date ? -1 : 1).filter((b, i, arr) => !i || b.date !== arr[i - 1].date);
  return { ticker: d.ticker || securityId.replace(/^ref_/, ''), securityId, exchange: d.exchange || null, currency: 'USD', provider: 'tiingo', bars, delisted: false };
}
function delistedPayload(doc, rawSeries) {
  if (!rawSeries || !Array.isArray(rawSeries.rows)) return null;
  const ix = Object.fromEntries(rawSeries.cols.map((c, i) => [c, i]));
  const from = new Date(Date.parse(doc.points[0][0]) - 7 * 86400000).toISOString().slice(0, 10), to = doc.listingLifecycle?.lastTradeDate || doc.points.at(-1)[0];
  const bars = rawSeries.rows.filter(r => r[ix.close] !== null && r[0].slice(0, 10) >= from && r[0].slice(0, 10) <= to)
    .map(r => ({ date: r[0].slice(0, 10), open: +r[ix.open], high: +r[ix.high], low: +r[ix.low], close: +r[ix.close], volume: +r[ix.volume], splitFactor: Number(r[ix.splitFactor]) > 0 ? +r[ix.splitFactor] : 1 }));
  return { ticker: doc.ticker, securityId: doc.securityId, exchange: null, currency: 'USD', provider: 'tiingo', bars, delisted: true };
}
const goodBar = b => ['open', 'high', 'low', 'close', 'splitFactor'].every(k => Number.isFinite(b[k]) && b[k] > 0) && b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close);

/** zoneAt(id, t) mit Zwischenspeicher; id der DQ-Stücke (":dqN") nutzt die Tagesbalken des Grundtitels. */
function createZoneOracle({ calendar, barsDir, delistedDir, delistedRawDir, detect, Trade }) {
  const MP = require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs'));
  let docs = new Map(), raw = null;
  if (delistedDir) {
    const D = require(path.join(ROOT, 'quant/engines/research-delisted-series.cjs'));
    docs = D.loadDelisted(ROOT, { dir: delistedDir }).docs;
    raw = MP.loadRawByTicker(delistedRawDir, new Set([...docs.values()].map(d => d.ticker)));
  }
  const payloads = new Map(), cache = new Map(), counts = { analyses: 0, noData: 0, tooShort: 0, stale: 0, invalid: 0, hits: 0, ms: 0 };
  const payloadOf = id => {
    if (payloads.has(id)) return payloads.get(id);
    let p = null;
    if (docs.has(id)) p = delistedPayload(docs.get(id), raw.byTicker.get(docs.get(id).ticker));
    else p = r2Payload(barsDir, id);
    if (p) { p.firstBad = p.bars.findIndex(b => !goodBar(b)); p.dates = p.bars.map(b => b.date); }
    payloads.set(id, p);
    return p;
  };
  function zoneAt(id, t) {
    const base = id.replace(/:dq\d+$/, ''), key = base + '|' + t;
    if (cache.has(key)) return cache.get(key);
    const date = calendar[t], p = payloadOf(base);
    let z = null;
    if (!p) counts.noData++;
    else {
      let lo = 0, hi = p.dates.length - 1, k = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (p.dates[m] <= date) { k = m; lo = m + 1; } else hi = m - 1; }
      if (k < 299) counts.tooShort++;
      else if (Date.parse(date) - Date.parse(p.dates[k]) > 7 * 86400000) counts.stale++;
      else if (p.firstBad >= 0 && p.firstBad <= k) counts.invalid++;
      else {
        const t0 = Date.now(), cut = p.bars.slice(0, k + 1), b = detect(p, cut);
        counts.analyses++; counts.ms += Date.now() - t0;
        if (b.dataCutoff !== p.dates[k]) throw Error('LOOKAHEAD ' + base + '@' + date);
        z = E2.isZone(b, Trade);
        if (z) counts.hits++;
      }
    }
    cache.set(key, z);
    return z;
  }
  return { zoneAt, counts };
}

// ------------------------------------------------------------ Lauf aller Varianten auf einem Panel
function runAll(panel, ctx) {
  const { variants, window, anchorDate, filterStateAt, zoneAt, bm, MP, E3 } = ctx;
  const selector = Q.createSelector(panel), out = [];
  const base = Q.runVariant(panel, selector, E2.BASE, { window, anchorDate, filterStateAt: null });
  for (const v of variants) {
    const t0 = Date.now();
    let r;
    try {
      r = v.part === 'teil1' ? E2.runTeil1(panel, selector, v, { window, anchorDate, zoneAt })
        : E2.runTeil2(panel, selector, v.overlay, { window, anchorDate, filterStateAt, baseEquity: base.equity, id: v.id });
    } catch (e) { out.push({ id: v.id, part: v.part, state: 'FAILED', error: e.code || String(e.message).slice(0, 160) }); console.log(JSON.stringify({ id: v.id, state: 'FAILED' })); continue; }
    const ev = r.state === 'RUN' ? E3.evaluate(r.equity, bm, MP) : null;
    let test = null;
    if (ev) { try { test = S.pairedTest(ev.returns, ev.spyReturns); } catch { test = null; } }
    out.push({ id: v.id, part: v.part, state: r.state, window: r.window, evaluation: ev ? { ...ev, returns: undefined, spyReturns: undefined } : null, test,
      weeklyReturns: ev ? ev.returns : null, spyWeeklyReturns: ev ? ev.spyReturns : null, equity: r.equity,
      costs: r.costs, turnover: r.turnover, cashShare: r.cashShare, terminalEvents: r.terminalEvents, construction: r.construction, ledgerResultHash: r.ledgerResultHash || null, seconds: Math.round((Date.now() - t0) / 1000) });
    console.log(JSON.stringify({ id: v.id, state: r.state, seconds: Math.round((Date.now() - t0) / 1000) }));
  }
  const baseEv = base.state === 'RUN' ? E3.evaluate(base.equity, bm, MP) : null;
  return { results: out, baseReference: { id: E2.BASE.id, state: base.state, evaluation: baseEv ? { ...baseEv, returns: undefined, spyReturns: undefined } : null, ledgerResultHash: base.ledgerResultHash || null } };
}

/** Holm über alle 12 Varianten (getrennt Log/Sharpe), Urteile nach Protokoll. */
function judge(results) {
  const pl = results.map(r => (r.test ? r.test.pLog : 1)), ps = results.map(r => (r.test ? r.test.pSharpe : 1));
  const hl = S.holm(pl), hs = S.holm(ps);
  return results.map((r, i) => {
    const m = r.evaluation && r.evaluation.strategy, spy = r.evaluation && r.evaluation.SPY;
    const verdict = r.test ? S.verdict(m, spy, hl[i], hs[i]) : 'nicht bestimmbar (blockiert)';
    let teil2 = null;
    if (r.part === 'teil2') teil2 = r.test && m && spy && m.sharpe > spy.sharpe && hs[i] <= .05 && m.maxDrawdown > spy.maxDrawdown && m.cagr >= spy.cagr - 0.02 ? 'besseres Rendite-Risiko' : 'nicht bestätigt';
    return { id: r.id, part: r.part, pLogRaw: pl[i], pSharpeRaw: ps[i], pLogHolm: hl[i], pSharpeHolm: hs[i], verdict, verdictTeil2: teil2, rawAboveSpy: !!(m && spy && m.cagr > spy.cagr) };
  });
}
function paperChoice(results) {
  const ok = results.filter(r => r.part === 'teil1' && r.state === 'RUN' && r.evaluation && Number.isFinite(r.evaluation.strategy.sharpe));
  ok.sort((x, y) => y.evaluation.strategy.sharpe - x.evaluation.strategy.sharpe || y.evaluation.strategy.cagr - x.evaluation.strategy.cagr || (x.id < y.id ? -1 : 1));
  return ok.length ? ok[0].id : null;
}

async function main() {
  const a = args(process.argv);
  if (!a.out) throw Error('OUT_REQUIRED');
  const out = path.resolve(a.out);
  if (out === ROOT || out.startsWith(ROOT + path.sep)) throw Error('OUT_INSIDE_REPOSITORY');
  const reviewerPem = a.reviewerKey ? fs.readFileSync(a.reviewerKey, 'utf8') : null;
  if (reviewerPem && !/BEGIN PUBLIC KEY/.test(reviewerPem)) throw Error('REVIEWER_KEY_NOT_A_PUBLIC_KEY');
  const p = protocol(), smoke = !!a.smoke;
  if (!smoke && !a.workDir) throw Error('WORK_DIR_REQUIRED');
  const window = [p.doc.window.from, p.doc.window.to];
  const MP = require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')), E3 = require('../edge/run-e3.cjs');
  const t0 = Date.now();
  const panel = MP.buildPanel({ workDir: a.workDir, delistedDir: a.delistedDir, delistedRawDir: a.delistedRawDir, fundamentals: a.fundamentals, window, limit: Number(a.limit || 0) });
  if (!smoke && panel.basis !== 'TOTAL_RETURN') throw Error('TOTAL_RETURN_PANEL_REQUIRED');
  console.log(JSON.stringify({ panel: panel.securities.length, basis: panel.basis, seconds: Math.round((Date.now() - t0) / 1000) }));
  const bm = E3.benchmarks(MP), spy = E3.spyDaily(), filterStateAt = Q.marketFilter(spy.points);
  const anchorDate = panel.calendar.find(d => d >= window[0]);
  const S1 = await import(path.join(ROOT, 'scripts/research/signals/study.mjs'));
  const Trade = require(path.join(ROOT, 'quant/engines/technical/trade-setup.js'));
  const oracle = createZoneOracle({ calendar: panel.calendar, barsDir: a.barsDir ? path.resolve(a.barsDir) : path.join(a.workDir, 'tiingo/daily'), delistedDir: a.delistedDir, delistedRawDir: a.delistedRawDir, detect: S1.detect, Trade });
  const variants = p.doc.variants;
  const ctx = { variants, window, anchorDate, filterStateAt, zoneAt: oracle.zoneAt, bm, MP, E3 };
  const primary = runAll(panel, ctx);
  const { panel: dqPanel, census } = MP.applyDq(panel, 'DQ-K5-BOOK');
  const dq = runAll(dqPanel, ctx);
  const result = { schema: 'vu-edge2-result-1.0.0', label: p.doc.label, version: VERSION, adapter: E2.VERSION, protocolId: p.doc.id, protocolSha256: p.sha256, window, anchorDate, smoke,
    data: { ...panel.meta, population: panel.population, benchmarks: Object.fromEntries(Object.entries(bm).map(([k, v]) => [k, { file: v.file, sha256: v.sha256 }])), spyDaily: { file: spy.file, sha256: spy.sha256 } },
    zones: oracle.counts, primary: { ...primary, judgement: judge(primary.results) }, dqK5: { census, ...dq, judgement: judge(dq.results) } };
  result.paper = { id: p.doc.paper.id, variant: paperChoice(primary.results), rule: p.doc.selection.paperRule };
  result.receipt = { runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null, resultSha256: sha(JSON.stringify({ primary: result.primary, dqK5: result.dqK5 })) };
  const L = await import(path.join(ROOT, 'scripts/supertrader/validation/lib.mjs'));
  fs.mkdirSync(out, { recursive: true });
  const plain = Buffer.from(JSON.stringify(result));
  fs.writeFileSync(path.join(out, 'edge2.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plain));
  if (reviewerPem) fs.writeFileSync(path.join(out, 'edge2.sealed.reviewer.json'), L.encryptForOwner(reviewerPem, plain));
  const tally = j => j.reduce((o, r) => { o[r.verdict] = (o[r.verdict] || 0) + 1; if (r.verdictTeil2) o['teil2: ' + r.verdictTeil2] = (o['teil2: ' + r.verdictTeil2] || 0) + 1; return o; }, {});
  const pub = { schema: 'vu-edge2-public-1.0.0', label: p.doc.label, version: VERSION, protocolSha256: p.sha256, smoke, window,
    states: primary.results.map(r => [r.id, r.state]), tallyPrimary: tally(result.primary.judgement), tallyDqK5: tally(result.dqK5.judgement), dqK5Flags: census.flags,
    zones: { analyses: oracle.counts.analyses, hits: oracle.counts.hits, noData: oracle.counts.noData, tooShort: oracle.counts.tooShort },
    paper: result.paper, privateSha256: sha(plain), resultSha256: result.receipt.resultSha256, runId: result.receipt.runId };
  fs.writeFileSync(path.join(out, 'edge2.public.json'), JSON.stringify(pub, null, 1) + '\n');
  console.log(JSON.stringify({ paper: pub.paper.variant, tally: pub.tallyPrimary, privateSha256: pub.privateSha256, seconds: Math.round((Date.now() - t0) / 1000) }));
}
if (require.main === module) main().catch(e => { console.error(String(e && e.stack || e)); process.exit(1); });
module.exports = { VERSION, protocol, createZoneOracle, judge, paperChoice };
