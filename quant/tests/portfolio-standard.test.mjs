// VU-Portfolio-Standard (Portfolio-Baukasten v1): Risikomodell, Konstruktion, PIT-Faktoren, Walk-forward-Lauf.
// Forschung, nicht zertifiziert. Python-Gegenrechnung: scripts/quant/verify-portfolio-construction.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const Risk = require(ROOT + '/quant/engines/portfolio-risk.cjs');
const C = require(ROOT + '/quant/engines/portfolio-construction.cjs');
const F = require(ROOT + '/quant/engines/portfolio-pit-factors.cjs');
const BT = require(ROOT + '/quant/engines/portfolio-backtest.cjs');

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function returnsMatrix(T, N, seed) {
  const r = rng(seed), out = [];
  for (let t = 0; t < T; t++) { const m = gauss(r) * 0.02; out.push(Array.from({ length: N }, (_, j) => m * (0.5 + j / N) + gauss(r) * (0.01 + 0.002 * (j % 5)))); }
  return out;
}
const SECTORS = ['Money', 'Hlth', 'BusEq', 'Manuf', 'Shops', 'NoDur', 'Enrgy', 'Utils'];
function candidates(n, seed, { sectors = SECTORS, dollarVolume = 50e6 } = {}) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => ({ id: 'S' + String(i).padStart(3, '0'), score: r(), sector: sectors[i % sectors.length], price: 20 + 50 * r(), dollarVolume }));
}

test('Ledoit/Wolf: Intensität in [0,1], Diagonale = Stichprobenvarianz, symmetrisch, N=1 ohne Schrumpfung', () => {
  const R = returnsMatrix(104, 12, 7), s = Risk.shrunkCovariance(R);
  assert.ok(s.shrinkage >= 0 && s.shrinkage <= 1);
  for (let i = 0; i < 12; i++) { assert.ok(Math.abs(s.cov[i][i] - s.sample[i][i]) < 1e-15); for (let j = 0; j < 12; j++) assert.equal(s.cov[i][j], s.cov[j][i]); }
  const one = Risk.shrunkCovariance(R.map(r => [r[0]]));
  assert.equal(one.shrinkage, 0);
  assert.throws(() => Risk.shrunkCovariance([[1], [1], [1]]), /ZERO_VARIANCE_ASSET/);
});

test('Beta und Volatilität: bekannte Werte', () => {
  const b = [0.01, -0.02, 0.03, 0.0, 0.015], r = b.map(x => 2 * x + 0.001);
  assert.ok(Math.abs(Risk.beta(r, b).beta - 2) < 1e-12);
  assert.ok(Math.abs(Risk.beta(r, b).correlation - 1) < 1e-12);
  assert.ok(Math.abs(Risk.annualVol([0.01, -0.01, 0.01, -0.01], 52) - Risk.sampleSd([0.01, -0.01, 0.01, -0.01]) * Math.sqrt(52)) < 1e-15);
});

test('Risikoparität: gleiche Risikobeiträge', () => {
  const cov = Risk.shrunkCovariance(returnsMatrix(104, 10, 3)).cov, w = C.equalRiskContribution(cov), rc = Risk.riskContributions(w, cov);
  assert.ok(Math.abs(w.reduce((a, x) => a + x, 0) - 1) < 1e-12);
  for (const x of rc) assert.ok(Math.abs(x - 0.1) < 1e-8);
});

test('Konstruktion hält den Standard: 15–30 Titel, <= 8 % je Titel, <= 25 % je Branche, über viele Zufallsfälle', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const cands = candidates(60 + seed, seed, { sectors: seed % 3 ? SECTORS : ['Money', 'Money', 'Money', 'Hlth', 'BusEq'] });
    const R = returnsMatrix(104, cands.length, seed + 100), returnsById = new Map(cands.map((c, j) => [c.id, R.map(r => r[j])]));
    for (const weighting of C.STANDARD.weightings) {
      const out = C.construct({ candidates: cands, returnsById, weighting });
      assert.equal(out.state, 'CONSTRUCTED');
      const w = Object.values(out.weights);
      assert.ok(w.length >= 15 && w.length <= 30, 'positions ' + w.length);
      assert.ok(Math.max(...w) <= 0.08 + 1e-12);
      for (const v of Object.values(out.sectorWeights)) assert.ok(v <= 0.25 + 1e-12);
      assert.ok(Math.abs(w.reduce((a, x) => a + x, 0) + out.cashResidual - 1) < 1e-9);
    }
  }
});

test('Konstruktion: zu wenige geeignete Titel -> TOO_FEW_ELIGIBLE; Liquidität schließt aus und begrenzt', () => {
  const cands = candidates(14, 1), R = returnsMatrix(104, 14, 2);
  assert.equal(C.construct({ candidates: cands, returnsById: new Map(cands.map((c, j) => [c.id, R.map(r => r[j])])) }).state, 'TOO_FEW_ELIGIBLE');
  assert.deepEqual(C.liquidity({ price: 3, dollarVolume: 1e9 }, C.STANDARD), { eligible: false, reason: 'PRICE_BELOW_MIN' });
  assert.equal(C.liquidity({ price: 30, dollarVolume: 1e6 }, C.STANDARD).reason, 'ADV_BELOW_MIN');
  assert.equal(C.liquidity({ price: 30, marketCap: 100e6 }, C.STANDARD).reason, 'MARKET_CAP_BELOW_MIN');
  assert.ok(Math.abs(C.liquidity({ price: 30, dollarVolume: 4e6 }, C.STANDARD).cap - 0.02) < 1e-15); // 5 % von 4 Mio. bei 10 Mio. Vermögen
  // Liquiditätsgrenze bindet: alle Titel 2 % Obergrenze -> 25 Titel * 2 % = 50 % investiert, Rest Cash.
  const c2 = candidates(40, 5, { dollarVolume: 4e6 }), R2 = returnsMatrix(104, 40, 6);
  const out = C.construct({ candidates: c2, returnsById: new Map(c2.map((c, j) => [c.id, R2.map(r => r[j])])), weighting: 'EQUAL' });
  assert.ok(Math.abs(out.cashResidual - 0.5) < 1e-9);
});

test('Spread-Modell: Klassen nach ADV, ersatzweise Marktkapitalisierung, Zuschlag unter 5 USD', () => {
  assert.equal(C.halfSpreadBps({ dollarVolume: 200e6, price: 50 }).bps, 2);
  assert.equal(C.halfSpreadBps({ dollarVolume: 3e6, price: 50 }).bps, 25);
  assert.equal(C.halfSpreadBps({ marketCap: 5e9, price: 50 }).bps, 5);
  assert.equal(C.halfSpreadBps({ dollarVolume: 3e6, price: 4 }).bps, 50);
  assert.equal(C.halfSpreadBps({ price: 50 }).basis, 'NO_LIQUIDITY_DATA_WORST_BUCKET');
});

test('PIT-Faktoren: SEC-Werte erst nach dem Einreichungsdatum sichtbar, veraltete Geschäftsjahre nicht', () => {
  const row = (fy, end, v, filed) => [fy, 'FY', end, v, filed, 'a', 0];
  const bundle = { annual: {
    revenue: [row(2018, '2018-12-31', 100, '2019-02-20'), row(2019, '2019-12-31', 120, '2020-02-20')],
    net_income: [row(2018, '2018-12-31', 10, '2019-02-20'), row(2019, '2019-12-31', 12, '2020-02-20')],
    shares_outstanding: [row(2018, '2018-12-31', 10, '2019-02-20'), row(2019, '2019-12-31', 10, '2020-02-20')],
    total_assets: [row(2019, '2019-12-31', 200, '2020-02-20')], stockholders_equity: [row(2019, '2019-12-31', 80, '2020-02-20')] } };
  assert.equal(F.fundamentalFactors(bundle, '2019-02-20', 5).fundamentalsAsOfEnd, null, 'am Einreichungstag noch nicht sichtbar');
  assert.equal(F.fundamentalFactors(bundle, '2019-02-21', 5).fundamentalsAsOfEnd, '2018-12-31');
  const f = F.fundamentalFactors(bundle, '2020-03-01', 5);
  assert.equal(f.fundamentalsAsOfEnd, '2019-12-31');
  assert.ok(Math.abs(f.revenueGrowthYoy - 0.2) < 1e-12);
  assert.equal(f.marketCap, 50);
  assert.ok(Math.abs(f.earningsYield - 12 / 50) < 1e-12);
  assert.equal(F.fundamentalFactors(bundle, '2021-12-01', 5).fundamentalsAsOfEnd, null, 'älter als 548 Tage');
  assert.deepEqual(F.percentiles([3, 1, null, 3]), [5 / 6, 1 / 3, null, 5 / 6]);
});

// Synthetisches Panel: 80 Titel, ein Teil endet vorzeitig (delistet), Gesamtrendite-Basis.
function panel({ T = 420, n = 80, seed = 11 } = {}) {
  const r = rng(seed), cal = [], d0 = Date.parse('2010-01-08T00:00:00Z');
  for (let t = 0; t < T; t++) cal.push(new Date(d0 + t * 7 * 86400000).toISOString().slice(0, 10));
  const bench = [100]; for (let t = 1; t < T; t++) bench.push(bench[t - 1] * (1 + 0.0015 + gauss(r) * 0.02));
  const securities = [];
  for (let i = 0; i < n; i++) {
    const adj = new Array(T).fill(NaN), start = i % 7 === 0 ? 120 : 0, end = i % 9 === 0 ? 250 + (i % 50) : T - 1;
    let p = 20 + 30 * r();
    for (let t = start; t <= end; t++) { p *= 1 + 0.001 * (i % 5) + (bench[t] / (bench[t - 1] || bench[t]) - 1) * (0.6 + (i % 4) * 0.2) + gauss(r) * 0.03; adj[t] = p; }
    securities.push({ id: 'ref_S' + i, sector: SECTORS[i % SECTORS.length], mic: 'XNYS', adj, raw: adj.slice(), dv: new Array(T).fill(80e6), bundle: null,
      terminal: end < T - 1 ? { lastIdx: end, kind: i % 2 ? 'MERGER' : 'DISTRESS' } : null });
  }
  return { calendar: cal, basis: 'TOTAL_RETURN', benchmark: { label: 'SYN', levels: bench, sourceHash: 'a'.repeat(64) }, securities,
    provenance: { datasetHash: 'b'.repeat(64), identityEvidence: 'c'.repeat(64), populationEvidence: 'd'.repeat(64), corporateActionEvidence: 'e'.repeat(64), lifecycleEvidence: 'f'.repeat(64), licenseEvidence: '1'.repeat(64) } };
}

test('Walk-forward-Lauf auf synthetischem Panel: Standard je Stichtag, delistete Titel über TERMINAL_CASH, Kennzahlen', () => {
  const p = panel(), res = BT.runModelPortfolio(p, { profileId: 'momentum-leader', window: [p.calendar[0], p.calendar.at(-1)], standard: {} });
  assert.equal(res.certification, 'NOT_CERTIFIED');
  assert.equal(res.label, 'Forschung, nicht zertifiziert');
  assert.equal(res.state, 'NO_PORTFOLIO_CONSTRUCTED');
  // momentum-leader braucht growth (Fundamentaldaten) -> ohne Bündel nie konstruiert -> alles Cash, ehrlich ausgewiesen.
  assert.equal(res.construction.constructed, 0);
  const res2 = BT.runModelPortfolio(p, { profileId: 'quality-momentum', window: [p.calendar[0], p.calendar.at(-1)] });
  assert.equal(res2.construction.constructed, 0);
});

test('Walk-forward-Lauf: Preisprofil (nur momentum/risk) konstruiert, Standard gehalten, delistete Titel gebucht, kein Blick nach vorn', () => {
  {
    const fams = ['momentum', 'risk'], p = panel(), w = [p.calendar[0], p.calendar.at(-1)];
    const res = BT.runModelPortfolio(p, { profileId: 'test-price', profileFamilies: fams, window: w });
    assert.ok(res.construction.constructed > 50);
    assert.ok(res.construction.averagePositions >= 15 && res.construction.averagePositions <= 30);
    assert.ok(res.construction.terminalEvents > 0, 'delistete Titel im Lauf');
    assert.ok(Number.isFinite(res.metrics.beta) && Number.isFinite(res.metrics.maxDrawdown) && Number.isFinite(res.metrics.annualizedVolatility));
    assert.ok(res.metrics.cagr < res.metrics.grossOfSpread.cagr, 'Spread kostet');
    // Kein Blick nach vorn: Zukunft nach Stichtag t ändern -> Entscheidung zu t unverändert.
    const t = 200, a = BT.decide(p, t, { ...BT.DEFAULTS, profileId: 'test-price', profileFamilies: fams, weighting: 'RISK_PARITY', standard: {} }, C.standardOf());
    const q = panel(); for (const s of q.securities) for (let k = t + 1; k < s.adj.length; k++) if (s.adj[k] > 0) s.adj[k] *= 1.5;
    const b = BT.decide(q, t, { ...BT.DEFAULTS, profileId: 'test-price', profileFamilies: fams, weighting: 'RISK_PARITY', standard: {} }, C.standardOf());
    assert.deepEqual(a.built.weights, b.built.weights);
  }
});

test('Python-Gegenrechnung: Schrumpfung, Gewichte und Grenzen auf 24 Fällen', () => {
  const cases = [];
  for (let seed = 1; seed <= 24; seed++) {
    const cands = candidates(40, seed, { sectors: seed % 2 ? SECTORS : ['Money', 'Money', 'Hlth', 'BusEq'], dollarVolume: seed % 4 ? 50e6 : 6e6 });
    const R = returnsMatrix(60, cands.length, seed + 7), returnsById = new Map(cands.map((c, j) => [c.id, R.map(r => r[j])]));
    const weighting = C.STANDARD.weightings[seed % 3];
    const s = C.standardOf(), elig = cands.map(c => ({ ...c, cap: C.liquidity(c, s).cap })), sel = C.select(elig, s).selected;
    const Rs = R.map(r => sel.map(c => r[cands.indexOf(cands.find(x => x.id === c.id))]));
    const risk = Risk.shrunkCovariance(Rs), out = C.construct({ candidates: cands, returnsById, weighting });
    cases.push({ name: 'case-' + seed, returns: Rs, weighting, caps: sel.map(c => c.cap), sectors: sel.map(c => c.sector), maxSector: 0.25, maxPosition: 0.08, minPositions: 15, maxPositions: 30,
      engine: { shrinkage: risk.shrinkage, cov: risk.cov, weights: sel.map(c => out.weights[c.id] || 0) } });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vu-pf-')), file = path.join(dir, 'cases.json');
  fs.writeFileSync(file, JSON.stringify(cases));
  const outp = execFileSync('python3', ['-I', path.join(ROOT, 'scripts/quant/verify-portfolio-construction.py'), '--input', file], { encoding: 'utf8' });
  const rep = JSON.parse(outp.trim().split('\n').at(-1));
  assert.equal(rep.mismatches, 0);
  assert.ok(rep.checks > 10000);
  fs.rmSync(dir, { recursive: true, force: true });
});
