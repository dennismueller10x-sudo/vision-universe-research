import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { summarize, clusterT, cashInSpy, exposureStats, attributeIdle, investedReturns, olsNW } from '../validation/audit-r14.mjs';
import { runPortfolioTR } from '../validation/portfolio.mjs';

test('R14-S1 summarize/clusterT: Quantile, Trefferquote, Cluster-t über Monatsmittel', () => {
  const s = summarize([1, 2, 3, 4, NaN]);
  assert.equal(s.n, 4); assert.equal(s.mean, 2.5); assert.equal(s.median, 2.5); assert.equal(s.pos, 1);
  const c = clusterT([1, 1, 3, 3, 2, 2], ['a', 'a', 'b', 'b', 'c', 'c']);
  assert.equal(c.clusters, 3); assert.equal(c.mean, 2); assert.ok(Math.abs(c.t - 2 / (1 / Math.sqrt(3))) < 1e-9);
});

test('R14-C1 Cash in SPY: ungenutztes Kapital verdient die SPY-Rendite, investierter Teil bleibt', () => {
  const eq = [{ date: 'd0', equity: 100, exposure: 0.25 }, { date: 'd1', equity: 101, exposure: 0.25 }];
  const spy = new Map([['d1', 0.02]]);
  const out = cashInSpy(eq, spy, 0);
  assert.ok(Math.abs(out[1].equity - 100 * (1 + 0.01 + 0.75 * 0.02)) < 1e-9);
});

test('R14-E1 Exposition und Zerlegung des ungenutzten Kapitals (Größenregel vs. freie Plätze)', () => {
  const cal = ['2024-01-02', '2024-01-03', '2024-01-04'];
  const tr = { id: 'A', listingId: 'A', entry: { date: '2024-01-02', price: 10 }, initialStop: 9.5, exits: [{ date: '2024-01-04', price: 10, fraction: 1, ruleId: 'X' }], terminal: null, marks: new Map(cal.map((d) => [d, 10])), divs: new Map() };
  const cfg = { initialEquity: 100000, riskPerTrade: 0.005, maxPositionPct: 0.25, maxPositions: 2, maxExposure: 1 };
  const run = runPortfolioTR([tr], cal, cfg, { commissionBps: 0 });
  // Risiko 0,5 % / Stopabstand 5 % = 10 % Gewicht; Höchstgewicht 25 %
  const ex = exposureStats(run.equity);
  assert.ok(Math.abs(ex.mean - (0.1 + 0.1 + 0) / 3) < 1e-9);
  const a = attributeIdle(run, cfg);
  // Tag 1/2: Größenregel 0,15, freier Platz 0,25 → zusammen 0,40 < ungenutzt 0,90; Tag 3: zwei freie Plätze 0,5 (skaliert ≤ 1)
  assert.ok(Math.abs(a.sizingMean - (0.15 + 0.15) / 3) < 1e-9);
  assert.ok(a.unexplainedMean > 0); // Rest = Kapital, das selbst bei vollen Höchstgewichten nicht verplant wäre
});

test('R14-B2 Rendite des investierten Kapitals = Portfoliorendite / Exposition; CAPM-β ≈ 1 bei proportionaler Rendite', () => {
  const eq = [{ date: 'x0', equity: 100, exposure: 0.5 }]; const spy = new Map();
  let v = 100; for (let i = 1; i <= 300; i++) { const r = Math.sin(i) * 0.01; spy.set('x' + i, r); v *= 1 + 0.5 * r; eq.push({ date: 'x' + i, equity: v, exposure: 0.5 }); }
  const b = investedReturns(eq, spy);
  assert.ok(Math.abs(b.beta - 1) < 1e-9); assert.ok(Math.abs(b.excessAnn) < 1e-9);
  const o = olsNW([1, 2, 3, 4].concat(Array.from({ length: 40 }, (_, i) => i)), [3, 5, 7, 9].concat(Array.from({ length: 40 }, (_, i) => 1 + 2 * i)));
  assert.ok(Math.abs(o.beta - 2) < 1e-9);
});

test('R14-W1 Holdout-Fenster nur per ST_WINDOW=HOLDOUT, eigener Namensraum; ohne Variable unverändert DEV', () => {
  const run = (env) => spawnSync(process.execPath, ['-e', 'import("./scripts/supertrader/validation/lib.mjs").then(L=>console.log(JSON.stringify([L.WINDOW_NAME,L.WINDOW,L.SERIES_PROVIDER])))'], { env: { ...process.env, ...env }, encoding: 'utf8' });
  const dev = JSON.parse(run({ ST_WINDOW: '' }).stdout), ho = JSON.parse(run({ ST_WINDOW: 'HOLDOUT' }).stdout);
  assert.deepEqual(dev, ['DEV', { warmupFrom: '2015-01-01', from: '2016-01-04', to: '2026-09-30' }, 'tiingo-delisted']);
  assert.deepEqual(ho, ['HOLDOUT', { warmupFrom: '2007-01-02', from: '2008-01-02', to: '2015-12-31' }, 'tiingo-holdout']);
});

test('R14-W2 Holdout-Listings: aktiv = über 2015 hinaus gelistet, alle aus dem Abruf (kein STORE_ACTIVE)', () => {
  const code = `import("./scripts/supertrader/validation/lib.mjs").then(L=>{const rows=[{ticker:'AAA',exchange:'NYSE',assetType:'Stock',priceCurrency:'USD',startDate:'2005-01-03',endDate:'2019-06-01'},{ticker:'BBB',exchange:'NASDAQ',assetType:'Stock',priceCurrency:'USD',startDate:'2009-02-02',endDate:'2012-03-01'}];
    const t=L.buildListingTable(rows,new Map([['AAA',{startDate:'2005-01-03',instrumentType:'EQUITY_COMMON'}]]));console.log(JSON.stringify(t.map(l=>[l.ticker,l.active,l.source]).sort()))})`;
  const out = JSON.parse(spawnSync(process.execPath, ['-e', code], { env: { ...process.env, ST_WINDOW: 'HOLDOUT' }, encoding: 'utf8' }).stdout);
  assert.deepEqual(out, [['AAA', true, 'FETCH'], ['BBB', false, 'FETCH']]);
});
