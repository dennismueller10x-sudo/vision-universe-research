#!/usr/bin/env node
// E4/S2. Forschung, nicht zertifiziert. Dieselbe Studie wie S1 (docs/research/signals/PROTOKOLL.md, scripts/research/signals/study.mjs):
// Erkennung, Replay, Kosten, Statistik und Urteil werden aus study.mjs importiert bzw. Zeile für Zeile übernommen
// (Pro-Titel-Schleife = study.mjs#run, Paritätstest gegen die S1-Trades). Geändert ist nur die Datenquelle (S2-Registrierung):
// kanonische Tagesbalken (R2-Historienablage) und delistete V13-Ketten (Archivteil v13-raw), dazu der exakte SPY-Vergleich
// (Open des Einstiegstags bis Schluss des Ausstiegstags), den S1 für S2 vorsieht.
//
//   node scripts/research/signals/s2.mjs --source golden --out DIR                      (Paritätslauf auf den fünf S1-Titeln)
//   node scripts/research/signals/s2.mjs --source r2 --work-dir D --delisted-dir D --delisted-raw-dir D --sample FILE --shard k/K --out DIR
//   node scripts/research/signals/s2.mjs --aggregate DIR1,DIR2,... --out DIR [--seal-to PEM]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import * as S1 from './study.mjs';
const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const Trade = require('../../../quant/engines/technical/trade-setup.js');
const { FAMILIES, HORIZON, net, seriesOf, detect, replay, stats, clusterP, holm } = S1;
const VERSION = 'e4-signals-s2-1.1.0';
// Ergänzung 1 der Registrierung (vor dem ersten Ergebnis): DQ-K5-Quarantäne. Ein Trade ist betroffen, wenn eine K5-Sitzung
// im Erkennungsfenster (300 Sitzungen bis zum Signal) oder bis zum Ausstieg liegt.
const DQ_K5 = 5, DQ_K5_LOOKBACK = 300;
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const goodBar = b => ['open', 'high', 'low', 'close', 'splitFactor'].every(k => Number.isFinite(b[k]) && b[k] > 0) && b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close);
const sha = x => createHash('sha256').update(x).digest('hex');

// ------------------------------------------------------------ SPY (Schluss für Marktphase; Open+Schluss für den exakten Vergleich)
export function spyContext({ ohlcBars = null } = {}) {
  const spy = JSON.parse(readFileSync(join(ROOT, 'quant/data/market/multi-asset/series/SPY.json'), 'utf8')).points;
  const spyMap = new Map(spy.map((p, i) => [p[0], i]));
  const regime = date => { const i = spyMap.get(date); return i === undefined || i < 199 ? 'UNAVAILABLE' : spy[i][1] >= mean(spy.slice(i - 199, i + 1).map(p => p[1])) ? 'ABOVE_200' : 'BELOW_200'; };
  let exact = null;
  if (ohlcBars && ohlcBars.length) {
    const f = require('../../../quant/engines/return-series.js').splitFactors(ohlcBars);
    exact = new Map(ohlcBars.map((b, i) => [b.date, { open: b.open / f[i], close: b.close / f[i] }]));
  }
  return { spy, spyMap, regime, exact };
}

// ------------------------------------------------------------ Pro-Titel-Schleife (aus study.mjs#run übernommen, unverändert bis auf spyExactR)
export function processStock(payload, ctx) {
  const { spy, spyMap, regime, exact } = ctx;
  const trades = [], counts = Object.fromEntries(FAMILIES.map(f => [f, { activeObservations: 0, conditionalObservations: 0, signals: 0, overlap: 0, incomplete: 0, gapEntry: 0, rightCensored: 0, invalidWindow: 0 }]));
  const bars = payload.bars, full = seriesOf(payload, bars), busy = {};
  // S2-Ergänzung 1 (DQ-K5, wie Supertrader): Sitzung mit splitbereinigtem Schlussverhältnis >= 5 oder <= 1/5 zum Vortag.
  const k5 = [];
  for (let t = 1; t < bars.length; t++) { const q = full.close[t] / full.close[t - 1]; if (q >= DQ_K5 || q <= 1 / DQ_K5) k5.push(t); }
  const touchesK5 = (from, to) => k5.some(t => t >= from && t <= to);
  for (let i = 299; i < bars.length; i++) {
    if (bars[i].date < '2016-01-01' || bars[i].date > '2026-12-31') continue;
    const cut = bars.slice(0, i + 1);
    if (!cut.every(goodBar)) return { trades, counts, error: 'INVALID_DETECTION_HISTORY', at: bars[i].date };
    const b = detect(payload, cut);
    if (b.dataCutoff !== bars[i].date) throw Error('LOOKAHEAD');
    for (const s of b.scenarios.scenarios) {
      if (s.direction !== 'BULLISH' || !FAMILIES.includes(s.template)) continue;
      const c = counts[s.template];
      if (s.status !== 'ACTIVE' || s.entryStatus !== 'ACTIVE') { c.conditionalObservations++; continue; }
      c.activeObservations++;
      const setup = Trade.buildTradeSetup(s, { close: b.lastBar.close, atr: b.featuresAtCutoff.atr, averageVolume: b.featuresAtCutoff.averageVolume });
      if (!['COMPLETE', 'COMPLETE_LOW_RR'].includes(setup.status)) { c.incomplete++; continue; }
      if (i <= (busy[s.template] ?? -1)) { c.overlap++; continue; }
      c.signals++;
      const e = i + 1, end = e + HORIZON - 1;
      if (end >= bars.length || bars[end].date > '2026-12-31') { c.rightCensored++; continue; }
      if (bars.slice(e, end + 1).some((bar, k) => !goodBar(bar) || Date.parse(bar.date) - Date.parse(bars[e + k - 1].date) > 7 * 86400000)) { c.invalidWindow++; continue; }
      const scale = full.close[i] / b.lastBar.close;
      const stop = setup.tradeStop.price * scale, target = setup.targets[0].zoneLow * scale;
      const r = replay(full, e, stop, target);
      if (r.reason) { c.gapEntry++; continue; }
      busy[s.template] = r.j;
      const entry = full.open[e], risk = entry - stop, netR = net(entry, r.exit) / risk;
      const holdR = net(entry, full.close[r.j]) / risk;
      const si = spyMap.get(bars[e - 1].date), sj = spyMap.get(bars[r.j].date);
      const spyProxyR = si === undefined || sj === undefined ? null : net(spy[si][1], spy[sj][1]) / spy[si][1] / (risk / entry);
      // S2: exakter SPY-Vergleich (Open des Einstiegstags bis Schluss des Ausstiegstags, gleiche Kosten, Aktien-Risikoanteil).
      const xo = exact && exact.get(bars[e].date), xc = exact && exact.get(bars[r.j].date);
      const spyExactR = xo && xc ? net(xo.open, xc.close) / xo.open / (risk / entry) : null;
      trades.push({ family: s.template, ticker: payload.ticker, securityId: payload.securityId, signal: bars[i].date, entryDate: bars[e].date, exitDate: bars[r.j].date,
        quarter: bars[e].date.slice(0, 4) + 'Q' + (Math.floor((+bars[e].date.slice(5, 7) - 1) / 3) + 1), regime: regime(bars[i].date),
        setupId: setup.setupId, setupStatus: setup.status, entry, stop, target, exit: r.exit, kind: r.kind, risk, grossR: (r.exit - entry) / risk, netR, netReturn: net(entry, r.exit) / entry,
        holdR, deltaHoldR: netR - holdR, spyProxyR, spyExactR, deltaSpyExactR: spyExactR === null ? null : netR - spyExactR, holdingDays: r.j - e + 1, ambiguous: r.ambiguous, delisted: !!payload.delisted,
        dqK5: touchesK5(Math.max(1, i - DQ_K5_LOOKBACK + 1), r.j) });
    }
  }
  return { trades, counts, k5Sessions: k5.length };
}

// ------------------------------------------------------------ Datenquellen
function goldenPayloads() {
  const dir = join(ROOT, 'quant/data/market/golden-preview/daily');
  return readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').sort().map(f => ({ id: f.slice(0, -5), load: () => JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
}
// Kanonische Tagesbalken der R2-Ablage (DIR/tiingo/daily/<securityId>.json, wie build-pattern-research.mjs).
function r2Payload(workDir, securityId) {
  const file = join(workDir, 'tiingo/daily', securityId + '.json');
  if (!existsSync(file)) return null;
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const bars = (d.bars || []).filter(b => b && typeof b.date === 'string').map(b => ({ date: b.date.slice(0, 10), open: +b.open, high: +b.high, low: +b.low, close: +b.close, volume: +b.volume, splitFactor: Number(b.splitFactor) > 0 ? +b.splitFactor : 1 }))
    .sort((a, b) => a.date < b.date ? -1 : 1).filter((b, i, a) => !i || b.date !== a[i - 1].date);
  return { ticker: d.ticker || securityId.replace(/^ref_/, ''), securityId, exchange: d.exchange || null, currency: 'USD', provider: 'tiingo', bars, delisted: false };
}
// Delistete V13-Kette: Tagesbalken des Tickers aus v13-raw im Kettenzeitraum (Register-gebunden über research-delisted-series.cjs).
function delistedPayload(doc, rawSeries) {
  if (!rawSeries || !Array.isArray(rawSeries.rows)) return null;
  const ix = Object.fromEntries(rawSeries.cols.map((c, i) => [c, i]));
  const from = new Date(Date.parse(doc.points[0][0]) - 7 * 86400000).toISOString().slice(0, 10), to = doc.listingLifecycle?.lastTradeDate || doc.points.at(-1)[0];
  const bars = rawSeries.rows.filter(r => r[ix.close] !== null && r[0].slice(0, 10) >= from && r[0].slice(0, 10) <= to)
    .map(r => ({ date: r[0].slice(0, 10), open: +r[ix.open], high: +r[ix.high], low: +r[ix.low], close: +r[ix.close], volume: +r[ix.volume], splitFactor: Number(r[ix.splitFactor]) > 0 ? +r[ix.splitFactor] : 1 }));
  return { ticker: doc.ticker, securityId: doc.securityId, exchange: null, currency: 'USD', provider: 'tiingo', bars, delisted: true };
}

// ------------------------------------------------------------ Lauf eines Shards (Worker-Pool)
async function runShard(a) {
  const ids = a.source === 'golden' ? goldenPayloads().map(x => x.id) : JSON.parse(readFileSync(a.sample, 'utf8')).ids;
  const [k, K] = (a.shard || '1/1').split('/').map(Number);
  const mine = ids.filter((_, i) => i % K === k - 1);
  const workers = Math.max(1, Number(a.workers || 1));
  const queue = mine.slice(), results = [];
  await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, () => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { args: a } });
    const next = () => { const id = queue.shift(); if (id === undefined) { w.postMessage(null); return; } w.postMessage(id); };
    w.on('message', m => { results.push(m); if (results.length % 25 === 0) console.log(JSON.stringify({ done: results.length, of: mine.length })); next(); });
    w.on('error', rej); w.on('exit', res); next();
  })));
  mkdirSync(a.out, { recursive: true });
  writeFileSync(join(a.out, 'shard.json'), JSON.stringify({ schema: VERSION, source: a.source, shard: a.shard || '1/1', ids: mine.length, results }));
  console.log(JSON.stringify({ shard: a.shard || '1/1', titles: mine.length, trades: results.reduce((s, r) => s + (r.trades ? r.trades.length : 0), 0) }));
}
function workerMain() {
  const a = workerData.args;
  let ctx, rawIndex = null, delistedDocs = null;
  const ensure = () => {
    if (ctx) return;
    let spyBars = null;
    if (a.source === 'r2') { const p = r2Payload(a.workDir, 'ref_SPY'); spyBars = p ? p.bars : null; }
    ctx = spyContext({ ohlcBars: spyBars });
    if (a.source === 'r2' && a.delistedDir) {
      const D = require('../../../quant/engines/research-delisted-series.cjs');
      delistedDocs = D.loadDelisted(ROOT, { dir: a.delistedDir }).docs;
      const MP = require('../../../scripts/quant/portfolio/model-portfolios.cjs');
      // Nur die Rohreihen der delisteten Titel dieses Teils laden (Speicher: vier Worker je Runner).
      const ids = JSON.parse(readFileSync(a.sample, 'utf8')).ids, [k, K] = (a.shard || '1/1').split('/').map(Number);
      const mineDl = new Set(ids.filter((id, i) => i % K === k - 1 && id.startsWith('dl_')));
      for (const id of [...delistedDocs.keys()]) if (!mineDl.has(id)) delistedDocs.delete(id);
      rawIndex = MP.loadRawByTicker(a.delistedRawDir, new Set([...delistedDocs.values()].map(d => d.ticker)));
    }
  };
  parentPort.on('message', id => {
    if (id === null) { process.exit(0); }
    ensure();
    let payload = null;
    try {
      if (a.source === 'golden') payload = goldenPayloads().find(x => x.id === id).load();
      else if (id.startsWith('dl_')) { const doc = delistedDocs.get(id); payload = doc ? delistedPayload(doc, rawIndex.byTicker.get(doc.ticker)) : null; }
      else payload = r2Payload(a.workDir, id);
      if (!payload || payload.bars.length < 300) { parentPort.postMessage({ id, state: 'NO_DATA', bars: payload ? payload.bars.length : 0 }); return; }
      const r = processStock(payload, ctx);
      parentPort.postMessage({ id, state: r.error ? 'INVALID_HISTORY' : 'RUN', error: r.error || null, bars: payload.bars.length, trades: r.trades, counts: r.counts, k5Sessions: r.k5Sessions });
    } catch (e) { parentPort.postMessage({ id, state: 'FAILED', error: String(e.message).slice(0, 160) }); }
  });
}

// ------------------------------------------------------------ Zusammenführen (wie study.mjs#run, plus exakter SPY-Test)
export function aggregate(shardDocs) {
  const trades = [], counts = Object.fromEntries(FAMILIES.map(f => [f, { activeObservations: 0, conditionalObservations: 0, signals: 0, overlap: 0, incomplete: 0, gapEntry: 0, rightCensored: 0, invalidWindow: 0 }]));
  const titles = { RUN: 0, NO_DATA: 0, INVALID_HISTORY: 0, FAILED: 0 }, delistedTitles = { RUN: 0, other: 0 };
  for (const d of shardDocs) for (const r of d.results) {
    titles[r.state] = (titles[r.state] || 0) + 1;
    if (String(r.id).startsWith('dl_')) delistedTitles[r.state === 'RUN' ? 'RUN' : 'other']++;
    if (!r.trades) continue;
    trades.push(...r.trades);
    for (const f of FAMILIES) for (const [k, v] of Object.entries(r.counts[f])) counts[f][k] += v;
  }
  const k5Titles = shardDocs.reduce((n, d) => n + d.results.filter(r => r.k5Sessions > 0).length, 0);
  const primary = familiesOf(trades.filter(r => !r.dqK5), counts), registered = familiesOf(trades, counts);
  for (const f of primary) f.dqK5Excluded = trades.filter(r => r.family === f.family && r.dqK5).length;
  return { families: primary, familiesWithoutDq: registered, trades, titles, delistedTitles, dq: { rule: 'DQ-K5', k5Titles, excludedTrades: trades.filter(r => r.dqK5).length } };
}

function familiesOf(trades, counts) {
  const families = FAMILIES.map(f => {
    const rows = trades.filter(r => r.family === f), exactRows = rows.filter(r => r.spyExactR !== null);
    const st = stats(rows);
    st.spyExactR = mean(exactRows.map(r => r.spyExactR));
    st.deltaSpyExactR = mean(exactRows.map(r => r.deltaSpyExactR));
    st.exactCoverage = rows.length ? exactRows.length / rows.length : null;
    return { family: f, counts: counts[f], ...st, delistedTrades: rows.filter(r => r.delisted).length,
      pHold: clusterP(rows, 'deltaHoldR'), pSpyExact: exactRows.length === rows.length && rows.length ? clusterP(rows, 'deltaSpyExactR') : 1,
      regimes: Object.fromEntries(['ABOVE_200', 'BELOW_200', 'UNAVAILABLE'].map(k => [k, stats(rows.filter(r => r.regime === k))])),
      tradesPerYear: (() => { const ys = new Set(rows.map(r => r.entryDate.slice(0, 4))); return ys.size ? rows.length / ys.size : null; })() };
  });
  const adjusted = holm(families.flatMap(f => [f.pHold, f.pSpyExact]));
  families.forEach((f, i) => {
    f.pHoldHolm = adjusted[2 * i]; f.pSpyExactHolm = adjusted[2 * i + 1];
    const enough = !(f.n < 100 || f.tickers < 20 || f.quarters < 20);
    // Urteil wie Protokoll: „besser als Halten“ nur mit positivem Netto-R, positiver Differenz gegen Aktie UND exaktem SPY und Holm <= .05.
    f.verdict = !enough ? 'zu wenig Fälle' : f.netR > 0 && f.deltaHoldR > 0 && f.deltaSpyExactR > 0 && f.pHoldHolm <= 0.05 && f.pSpyExactHolm <= 0.05 ? 'besser als Halten' : 'nicht besser';
    f.s2Candidate = f.netR > 0 && f.deltaHoldR > 0;
  });
  families.sort((a, b) => (b.netR ?? -Infinity) - (a.netR ?? -Infinity));
  return families;
}

function args(argv) { const a = {}; for (let i = 2; i < argv.length; i++) { const k = argv[i]; a[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1]; i++; } return a; }
async function main() {
  const a = args(process.argv);
  if (a.aggregate) {
    const docs = a.aggregate.split(',').map(d => JSON.parse(readFileSync(join(d, 'shard.json'), 'utf8')));
    const out = aggregate(docs);
    mkdirSync(a.out, { recursive: true });
    const plain = JSON.stringify({ schema: VERSION, label: 'Forschung, nicht zertifiziert', families: out.families, familiesWithoutDq: out.familiesWithoutDq, dq: out.dq, titles: out.titles, delistedTitles: out.delistedTitles, trades: out.trades });
    // Öffentlich (Repo): Methodik, Abdeckung, Urteil, keine Kennzahlen. Privat (an den Owner verschlüsselt): alle Zahlen und Trades.
    const pub = { schema: VERSION, label: 'Forschung, nicht zertifiziert', titles: out.titles, delistedTitles: out.delistedTitles,
      dq: out.dq,
      families: out.families.map(f => ({ family: f.family, n: f.n, tickers: f.tickers, quarters: f.quarters, delistedTrades: f.delistedTrades, dqK5Excluded: f.dqK5Excluded, exactCoverage: f.exactCoverage, verdict: f.verdict, counts: f.counts })),
      familiesWithoutDq: out.familiesWithoutDq.map(f => ({ family: f.family, n: f.n, verdict: f.verdict })),
      privateSha256: sha(plain) };
    writeFileSync(join(a.out, 'public.json'), JSON.stringify(pub, null, 1) + '\n');
    if (a.sealTo) {
      const L = await import('../supertrader/validation/lib.mjs');
      writeFileSync(join(a.out, 'results.sealed.owner.json'), L.encryptForOwner(readFileSync(a.sealTo, 'utf8'), Buffer.from(plain)));
    } else writeFileSync(join(a.out, 'results.private.json'), plain);
    console.log(JSON.stringify({ verdicts: out.families.map(f => [f.family, f.n, f.verdict]), titles: out.titles }));
    return;
  }
  await runShard(a);
}
if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) await main();
else if (!isMainThread) workerMain();
