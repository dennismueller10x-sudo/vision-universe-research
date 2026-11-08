'use strict';
// Strang G: Softwaretests mit synthetischen Daten (keine Studienergebnisse).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Pr = require('./protocol.cjs');
const St = require('./stats.cjs');
const Ev = require('./evaluate.cjs');
const Sg = require('./signals.cjs');
const Etf = require('./etf-engine.cjs');
const Seal = require('./seal.cjs');
const Run = require('./run-labor.cjs');

test('Protokoll unverändert und Katalog vollständig (78)', () => {
  assert.strictEqual(Pr.protocolGuard(), Pr.PROTOCOL_SHA256);
  const v = Pr.variants();
  assert.strictEqual(v.length, 78);
  const fam = v.reduce((o, x) => (o[x.family] = (o[x.family] || 0) + 1, o), {});
  assert.deepStrictEqual(fam, { MOM: 12, HI52: 4, QUAL: 4, VAL: 4, LVOL: 4, INS: 8, PEAD: 4, KOMBI: 24, LERN: 4, ETF: 10 });
  for (const x of v.filter(x => x.kind === 'stock')) { assert.strictEqual(x.standard.feeBps, 10); assert.strictEqual(x.standard.slippageBps, 10); assert.ok(x.n >= 15 && x.n <= 30); }
});

test('Insider- und SUE-Fenster lesen nur Einreichungen strikt vor dem Stichtag', () => {
  const ev = [['2020-01-02', 'A', 100], ['2020-03-01', 'B', 50], ['2020-03-06', 'C', 10]];
  assert.deepStrictEqual(Sg.insiderAt(ev, '2020-03-06', 13), { count: 2, value: 150 });
  assert.deepStrictEqual(Sg.insiderAt(ev, '2020-03-07', 4), { count: 2, value: 60 });
  assert.strictEqual(Sg.sueAt([['2020-01-10', 1.5], ['2020-02-07', -2]], '2020-02-07'), 1.5);
  assert.strictEqual(Sg.sueAt([['2019-01-10', 1.5]], '2020-02-07'), null);
});

test('52-Wochen-Hoch nur über dem 40-Wochen-Mittel', () => {
  const up = Float64Array.from({ length: 60 }, (_, i) => 10 + i), down = Float64Array.from({ length: 60 }, (_, i) => 100 - i);
  assert.ok(Sg.extraPriceFactors(up, 59).hi52 === 1);
  assert.strictEqual(Sg.extraPriceFactors(down, 59).hi52, null);
  assert.ok(Math.abs(Sg.extraPriceFactors(up, 59).momentum6_1 - (65 / 43 - 1)) < 1e-12);
});

test('Ridge findet ein bekanntes lineares Modell', () => {
  const X = [], y = [];
  for (let i = 0; i < 400; i++) { const x = Array.from({ length: 10 }, (_, j) => Math.sin(i * (j + 1) * 0.37) / 2); X.push(x); y.push(0.3 * x[0] - 0.2 * x[3]); }
  const b = Sg.ridge(X, y, 1e-9);
  assert.ok(Math.abs(b[0] - 0.3) < 1e-6 && Math.abs(b[3] + 0.2) < 1e-6 && Math.abs(b[5]) < 1e-6);
});

test('DSR: Rauschen liegt unter, ein echter Vorsprung über der Schwelle', () => {
  const rnd = (() => { let s = 7; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; }; })();
  const noise = Array.from({ length: 78 }, () => Array.from({ length: 416 }, () => rnd() * 0.04));
  const srs = noise.map(x => St.moments(x).sr);
  const best = noise[srs.indexOf(Math.max(...srs))];
  assert.ok(St.deflatedSharpe(best, srs, 78).dsr < 0.95);
  const strong = best.map(x => x + 0.01);
  assert.ok(St.deflatedSharpe(strong, srs, 78).dsr > 0.99);
  assert.ok(Math.abs(St.PhiInv(0.975) - 1.959964) < 1e-5 && Math.abs(St.Phi(1.959964) - 0.975) < 1e-6);
});

test('Reality Check: Nullfall nicht signifikant, deutlicher Vorsprung signifikant, deterministisch', () => {
  const rnd = (() => { let s = 11; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; }; })();
  const F = Array.from({ length: 10 }, () => Array.from({ length: 300 }, () => rnd() * 0.04));
  const a = St.realityCheck(F, { count: 499 }), b = St.realityCheck(F, { count: 499 });
  assert.strictEqual(a.p, b.p);
  assert.ok(a.p > 0.05);
  F[3] = F[3].map(x => x + 0.01);
  assert.ok(St.realityCheck(F, { count: 499 }).p < 0.01);
});

// Synthetische Bewertung: Strategie = SPY + konstanter Vorsprung.
function synth(edge, dd = 0) {
  const dates = [], lv = [], sp = []; let a = 100, b = 100;
  for (let i = 0; i < 418; i++) { const d = new Date(Date.UTC(2016, 0, 8) + i * 7 * 86400000).toISOString().slice(0, 10); const r = 0.002 + 0.02 * Math.sin(i * 1.7); b *= 1 + r; a *= 1 + r + edge + 0.004 * Math.sin(i * 2.3) - (i === 200 ? dd : 0); dates.push(d); lv.push(a); sp.push(b); }
  return Ev.evaluate(dates.map((d, i) => [d, lv[i]]), new Map(dates.map((d, i) => [d, sp[i]])));
}
test('Auswahl: Zulassung, Rang, Familiengrenze, Weg weniger Verlust', () => {
  const evals = { A1: synth(0.002), A2: synth(0.003), A3: synth(0.004), B1: synth(0.001), C1: synth(-0.001), D1: synth(0.002, 0.5), Z: null };
  const fam = { A1: 'A', A2: 'A', A3: 'A', B1: 'B', C1: 'C', D1: 'D', Z: 'Z' };
  const s = Ev.select(evals, fam);
  assert.deepStrictEqual(s.candidates.filter(c => c.track === 'BEAT').map(c => c.id), ['A3', 'A2', 'B1']);
  assert.strictEqual(s.checks.D1.c, false);
  assert.strictEqual(s.checks.Z.eligible, false);
  assert.ok(s.candidates.length <= 5);
  const wf = Ev.walkForward(evals);
  assert.strictEqual(wf.folds.length, 6);
  assert.strictEqual(wf.folds[0].pick, 'A3');
});

test('Urteile', () => {
  const up = synth(0.002), dn = synth(-0.002);
  assert.strictEqual(Ev.verdict(null), 'nicht bestimmbar (blockiert)');
  assert.strictEqual(Ev.verdict(dn, null).final, 'besteht nicht');
  assert.strictEqual(Ev.verdict(up, up, 0.01).final, 'besteht, statistisch gesichert');
  assert.strictEqual(Ev.verdict(up, up, 0.2).final, 'besteht, statistisch nicht gesichert');
  assert.strictEqual(Ev.verdict(up, dn, 0.01).final, 'besteht nicht');
});

test('Versiegelung: nur mit privatem Schlüssel lesbar, Hash geprüft', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const s = Seal.seal('{"x":1}', publicKey);
  assert.ok(!JSON.stringify(s).includes('"x":1'));
  assert.strictEqual(Seal.open(s, privateKey), '{"x":1}');
  assert.throws(() => Seal.open({ ...s, data: Buffer.from('xx').toString('base64') }, privateKey));
  assert.ok(/BEGIN PUBLIC KEY/.test(fs.readFileSync(path.join(Pr.ROOT, 'docs/research/labor/empfaenger.pem'), 'utf8')));
});

// ETF-Engine auf synthetischen Reihen.
function etfCtx() {
  const weeks = [], etfs = {};
  for (let i = 0; i < 700; i++) weeks.push(new Date(Date.UTC(2010, 0, 1) + i * 7 * 86400000).toISOString().slice(0, 10));
  const wk = d => d;
  Etf.SYMBOLS.forEach((s, k) => { let v = 100; etfs[s] = new Map(weeks.map((d, i) => { v *= 1 + (s === 'BIL' ? 0.0005 : 0.001 + 0.01 * Math.sin(i / (5 + k))); return [d, v]; })); });
  return { weeks, etfs, isoWeek: wk };
}
test('ETF: Ausführung eine Woche nach der Entscheidung, Kosten je Seite, Cash-Start', () => {
  const c = etfCtx();
  let on = true; const spyOn = d => (d >= '2017-01-01' && d < '2017-06-01' ? false : on);
  const r = Etf.runEtf({ id: 'ETF-E1', rule: 'E1' }, { ...c, window: ['2016-01-01', '2023-12-31'], spyOn, shock: () => false });
  assert.strictEqual(r.state, 'RUN');
  assert.ok(r.trades >= 3 && r.switches >= 2);
  // erste Woche: nur BIL-Zins (Cash-Start), danach SPY minus 22 bp Kosten in der Ausführungswoche
  const [d0, v0] = r.equity[0], [d1, v1] = r.equity[1];
  const bil = c.etfs.BIL.get(d1) / c.etfs.BIL.get(d0);
  assert.ok(Math.abs(v1 / v0 - bil * (1 - 22e-4)) < 1e-9);
  for (const rule of ['E2', 'E3', 'E4', 'R1', 'R2', 'S1', 'S2', 'S3', 'S4']) assert.strictEqual(Etf.runEtf({ id: rule, rule }, { ...c, window: ['2016-01-01', '2023-12-31'], spyOn, shock: () => false }).state, 'RUN');
});

test('Blockierung: fehlende Insider-/SUE-Daten blockieren nur ihre Familien', () => {
  const v = Object.fromEntries(Pr.variants().map(x => [x.id, x]));
  const ctx = { panel: {}, ins: null, sue: { map: new Map() } };
  assert.strictEqual(Run.blockedReason(v['INS-L13-W4-N15'], ctx, Pr.WINDOWS.dev), 'INSIDER_DATA_MISSING');
  assert.strictEqual(Run.blockedReason(v['K6-F0-W13-N25'], ctx, Pr.WINDOWS.dev), 'INSIDER_DATA_MISSING');
  assert.strictEqual(Run.blockedReason(v['LERN-L0.1-N25'], ctx, Pr.WINDOWS.dev), 'INSIDER_DATA_MISSING');
  assert.strictEqual(Run.blockedReason(v['MOM-M12-W13-N25'], ctx, Pr.WINDOWS.dev), null);
  assert.strictEqual(Run.blockedReason(v['ETF-E1'], { panel: null }, Pr.WINDOWS.dev), null);
  const q = []; for (let y = 2015; y <= 2023; y++) for (let k = 1; k <= 4; k++) q.push(y + 'q' + k);
  assert.ok(Run.insiderCovered({ quarters: q }, Pr.WINDOWS.dev));
  assert.ok(!Run.insiderCovered({ quarters: q.filter(x => x !== '2019q3') }, Pr.WINDOWS.dev));
});

test('Insider-Abdeckung im Prüfteil braucht nur Quartale bis zur letzten Entscheidung', () => {
  const q = []; for (let y = 2023; y <= 2026; y++) for (let k = 1; k <= 4; k++) if (!(y === 2026 && k === 4)) q.push(y + 'q' + k);
  assert.ok(Run.insiderCovered({ quarters: q }, Pr.WINDOWS.test));
  assert.ok(!Run.insiderCovered({ quarters: q.filter(x => x !== '2026q3') }, Pr.WINDOWS.test));
});
