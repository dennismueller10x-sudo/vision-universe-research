// Supertrader Neustart – historischer Backtest der V1-Methoden (Top 5). Synthetische Reihen, kein Netz, keine Anbieterdaten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../source-faithful/research/run-st-hist-top5.mjs';
import * as L from '../validation/lib.mjs';
import { securityFromSegment } from '../source-faithful/runner/snapshot-input.mjs';
import { SF6_VALIDATION_PROTOCOL } from '../source-faithful/research/run-sf6-validation.mjs';

const WIN = Object.freeze({ warmupFrom: '2015-01-01', from: '2016-01-04', to: '2017-06-30' });
const CAL = (() => { const out = []; for (let t = Date.UTC(2014, 5, 2); t <= Date.UTC(2017, 11, 29); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); } return out; })();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
function bars(seed, drift) {
  const r = rng(seed), out = []; let c = 20;
  for (const d of CAL) { const o = c; c = c * (1 + drift + 0.03 * (r() - 0.5)); out.push({ date: d, open: o, high: Math.max(o, c) * 1.01, low: Math.min(o, c) * 0.99, close: Number(c.toFixed(4)), volume: 2e6 * (1 + r()), adjClose: null, dividend: 0, splitFactor: 1 }); }
  return out;
}
const sec = (id, seed, drift) => securityFromSegment({ id, raw: bars(seed, drift), endCause: 'ACTIVE', delisted: false, survivor: true });
const ds = () => ({ calendar: CAL.filter((d) => d >= WIN.from && d <= WIN.to), securities: [sec('tiingo:NYSE:AAA:2010-01-04', 3, 0.0015), sec('tiingo:NYSE:BBB:2010-01-04', 5, 0.0008), sec('tiingo:NASDAQ:CCC:2010-01-04', 9, 0.002)], spyTR: CAL.map((date, i) => ({ date, value: 100 * 1.0003 ** i })), benchmark: CAL.map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1, splitAdj: 1 })) });

test('ST-HIST-1: genau die V1-Methoden, als Forschung beschriftet, keine Renditeaussage', () => {
  assert.deepEqual([...T.TOP5], ['TURTLE_S1', 'TURTLE_S2', 'DARVAS', 'KK_BREAKOUT', 'BUYABLE_GAP_UP']);
  assert.equal(T.LABEL.label, 'Forschung, nicht zertifiziert');
  assert.equal(T.LABEL.performanceClaim, 'NONE');
  assert.equal(T.LABEL.productionApproved, false);
});

test('ST-HIST-2: je Methode und vorregistrierter Kostenstufe Trades, Trefferquote, Rendite, max. Verlust, SPY, Kosten; deterministisch', () => {
  const a = T.runTop5(ds(), { window: WIN });
  for (const k of T.TOP5) {
    assert.deepEqual(Object.keys(a[k].costs), SF6_VALIDATION_PROTOCOL.costLevels.map((c) => c.id));
    const m = a[k].costs.REF;
    for (const f of ['trades', 'hitRate', 'totalReturn', 'cagr', 'maxDrawdown', 'spyTotalReturn', 'spyDistance', 'costsPaid']) assert.ok(f in m, `${k} ${f}`);
    assert.ok(m.maxDrawdown <= 0);
    assert.ok(m.costsPaid >= a[k].costs['COST-0'].costsPaid);
  }
  const b = T.runTop5(ds(), { window: WIN });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('ST-HIST-3: der öffentliche Teil trägt keine Renditezahl; der versiegelte Teil ist nur mit dem Prüfschlüssel lesbar', () => {
  const A = T.runTop5(ds(), { window: WIN });
  const result = { A, quarantine: { A: { policy: 'DQ-K5-BOOK' } }, receipt: { version: T.ST_HIST_TOP5_VERSION } };
  const pub = JSON.stringify(T.publicPart(result));
  for (const f of ['totalReturn', 'cagr', 'maxDrawdown', 'hitRate', 'spyDistance', 'annualReturns']) assert.ok(!pub.includes(`"${f}"`), f);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sealed = L.encryptForOwner(publicKey.export({ type: 'spki', format: 'pem' }), Buffer.from(JSON.stringify(result)));
  assert.deepEqual(JSON.parse(L.decryptSealed(privateKey.export({ type: 'pkcs8', format: 'pem' }), sealed)).A, JSON.parse(JSON.stringify(A)));
});

test('ST-HIST-4: Workflow nur manuell, nur lesend, kein Commit, Eingaben über env', () => {
  const w = fs.readFileSync(new URL('../../../.github/workflows/supertrader-st-hist-top5.yml', import.meta.url), 'utf8');
  assert.match(w, /workflow_dispatch/);
  assert.doesNotMatch(w, /\n\s+schedule:/);
  assert.match(w, /permissions:\n\s+contents: read/);
  assert.doesNotMatch(w, /git push|push-with-retry/);
  assert.doesNotMatch(w, /run: [^\n]*\$\{\{\s*inputs\./);
  assert.match(w, /group: supertrader-st-hist-top5-\$\{\{ github\.ref_name \}\}/);
});
