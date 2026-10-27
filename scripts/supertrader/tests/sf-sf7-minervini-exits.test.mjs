// Supertrader 7.0 – pre-registered Minervini research exit variants (owner decision E7-7, research/minervini-sf7-exits.mjs).
// Synthetic golden and adversarial cases. The 4.0 engine, its fingerprints and the REF stay untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SF7_EXIT_VARIANTS, SF7_EXIT_MODEL_ASSUMPTIONS, SF7_EXIT_SOURCE_BOUNDS, sf7ExitRegistrySha256, createExitRule, stage2Start } from '../source-faithful/research/minervini-sf7-exits.mjs';
import { runMinerviniLifecycleWithExitRule } from '../source-faithful/research/minervini-sf7-exit-execution.mjs';
import { buildSetupIndex, runMinerviniLifecycle } from '../source-faithful/research/minervini-execution.mjs';
import { REFERENCE_CONFIG, RUN_VARIANTS, variantRegistrySha256 } from '../source-faithful/research/minervini-lifecycle.mjs';
import { largestDeclineSignal, postBreakoutEvidence, SF7_MODEL_ASSUMPTIONS, sf7VariantRegistrySha256 } from '../source-faithful/research/minervini-sf7.mjs';

// pinned before the first E7-7 snapshot run (no result of any exit variant read)
const PINNED_SF7_EXIT_REGISTRY_SHA256 = 'df0379aee2827fa901ae8590017aaa3c082893837799aa64ea5812c079a9de79';
const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const mk = (closes, range = 0.002, vol = () => 1e6) => closes.map((c, k) => bar(k, c, c * (1 + range), c * (1 - range), c, vol(k)));
const path = (knots) => { const out = []; for (let s = 1; s < knots.length; s++) { const [a, pa] = knots[s - 1], [b, pb] = knots[s]; for (let k = a; k < b; k++) out.push(pa + ((pb - pa) * (k - a)) / (b - a)); } out.push(knots.at(-1)[1]); return out; };
const ds = (...secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs });
const VOLF = (k) => (k <= 260 ? 2e6 : k <= 284 ? 1.5e6 : k <= 300 ? 1e6 : k <= 330 ? 5e5 : 3e6);
// textbook VCP of the 4.0 tests (20 / 10 / 5 %), with different tails after the breakout
const vcp = (id, tail, noise = 0) => {
  let seed = 7 + id.length; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const c = path([[0, 40], [260, 100], [272, 80], [284, 98], [292, 88.2], [300, 96], [305, 91.2], [320, 95], [330, 97], ...tail]);
  return { id, bars: c.map((x, k) => { const z = x * (1 + (rnd() - 0.5) * noise); return bar(k, z, Math.max(x, z) * 1.004, Math.min(x, z) * 0.996, x, VOLF(k)); }) };
};
const TAILS = {
  RUN: [[340, 120], [400, 130]],
  CLIMAX: [[340, 120], [355, 160], [370, 140], [400, 150]],
  FAIL: [[335, 104], [345, 96], [360, 99], [400, 92]],
  CHOP: [[340, 118], [350, 110], [360, 125], [380, 115], [420, 135]],
  MA20: [[331, 97.6], [333, 95.2], [336, 99], [400, 125]],
};
// Power Play of the 4.0 tests (+125 % in 30 sessions, tight flag); only 150 sessions: no Trend Template, no Stage 2 start
const pp = (id, tail) => ({ id, bars: mk(path([[0, 20], [80, 20], [110, 45], [125, 44.2], [126, 46], ...tail])) });
const universe = () => {
  const secs = Object.entries(TAILS).map(([k, t]) => vcp(`V-${k}`, t, 0.004));
  secs.push(pp('P-RUN', [[150, 52]]), pp('P-FAST', [[140, 75], [150, 66]]), pp('P-FAIL', [[130, 47], [140, 40]]));
  // a halted session (no open) while a position is held: the engine skips it, the rule reads it later (MA-MIN7-EXIT-CATCH-UP)
  const h = vcp('V-HALT', TAILS.FAIL, 0.004); h.bars[338] = { ...h.bars[338], open: null };
  secs.push(h);
  return ds(...secs);
};
const variant = (id) => SF7_EXIT_VARIANTS.find((v) => v.id === id);
const runV = (d, strategy, id, idx = buildSetupIndex(d, strategy)) => runMinerviniLifecycleWithExitRule(d, { strategy, setupIndex: idx, config: REFERENCE_CONFIG, exitRule: variant(id).exitRule });
const runRef = (d, strategy, idx = buildSetupIndex(d, strategy)) => runMinerviniLifecycle(d, { strategy, setupIndex: idx, config: REFERENCE_CONFIG });

test('SF7-EXIT-ENGINE-IDENTITY: the engine copy without a rule equals the 4.0 engine for every registered configuration (ledger, trades, curve, counts)', () => {
  const d = universe();
  let trades = { SEPA: 0, POWER_PLAY: 0 };
  for (const strategy of ['SEPA', 'POWER_PLAY']) {
    const idx = buildSetupIndex(d, strategy);
    for (const v of RUN_VARIANTS) {
      if (v.strategies && !v.strategies.includes(strategy)) continue;
      const a = runMinerviniLifecycle(d, { strategy, setupIndex: idx, config: v.config }), b = runMinerviniLifecycleWithExitRule(d, { strategy, setupIndex: idx, config: v.config });
      assert.deepEqual(b.ledger, a.ledger, `${strategy} ${v.id} ledger`); assert.deepEqual(b.trades, a.trades, `${strategy} ${v.id} trades`);
      assert.deepEqual(b.curve, a.curve); assert.deepEqual(b.counts, a.counts); assert.deepEqual(b.rejections, a.rejections); assert.deepEqual(b.reconciliation, a.reconciliation);
      if (v.id === 'REF') trades[strategy] = a.trades.length;
    }
  }
  assert.ok(trades.SEPA >= 5 && trades.POWER_PLAY >= 2, JSON.stringify(trades));
});

test('SF7-EXIT-REF-UNCHANGED: running the exit variants never changes the REF result on the same index (synthetic universe)', () => {
  const d = universe(), before = {}, after = {};
  for (const s of ['SEPA', 'POWER_PLAY']) before[s] = JSON.stringify(runRef(d, s).ledger);
  for (const s of ['SEPA', 'POWER_PLAY']) { const idx = buildSetupIndex(d, s); for (const v of SF7_EXIT_VARIANTS) runV(d, s, v.id, idx); after[s] = JSON.stringify(runRef(d, s, idx).ledger); }
  assert.deepEqual(after, before);
});

test('SF7-EXIT-LARGEST-DECLINE-DAILY: full exit at the next open after the first decline larger than every daily decline since the Stage 2 start (B12 PDF 130)', () => {
  const s = vcp('V-FAIL', TAILS.FAIL, 0.004), d = ds(s);
  const ref = runRef(d, 'SEPA'), r = runV(d, 'SEPA', 'EXIT-LARGEST-DECLINE-DAILY');
  assert.equal(ref.trades.length, 1); assert.equal(r.trades.length, 1);
  const t = r.trades[0], diag = largestDeclineSignal(s.bars, { ...ref.trades[0], exitDate: null });
  assert.equal(diag.status, 'SIGNAL_OPEN_TRADE');
  const k = s.bars.findIndex((b) => b.date === diag.signalDate);
  assert.equal(t.exitReason, 'LARGEST_DECLINE_DAILY_EXIT'); assert.equal(t.exitDate, s.bars[k + 1].date, 'signal on the close of k, fill on k + 1');
  const sell = r.ledger.find((x) => x.side === 'SELL');
  assert.equal(sell.price, s.bars[k + 1].open * (1 - 0.001), 'next open, unchanged slippage');
  assert.ok(t.exitDate <= ref.trades[0].exitDate || ref.trades[0].exitDate === null);
  assert.equal(r.sf7ExitCounts.executed, 1); assert.equal(r.reconciliation.pass, true);
});

test('SF7-EXIT-LARGEST-DECLINE-WEEKLY: 5-session steps from the entry, at least 4 prior weeks; same signal as the 1.3.0 weekly diagnostic (B03 PDF 217)', () => {
  const up = path([[0, 30], [320, 100]]);
  const b = [...mk(up), ...[101, 102, 103, 104, 105, 104, 98, 90, 85, 84, 83, 82].map((x, j) => bar(321 + j, x, x * 1.002, x * 0.998, x))];
  const rule = createExitRule(variant('EXIT-LARGEST-DECLINE-WEEKLY').exitRule, b, { e: 321, s0: 320 });
  assert.equal(rule.status, 'EVALUATED');
  let hit = null; for (let k = 321; k < b.length && !hit; k++) hit = rule.onClose(k);
  assert.equal(hit.signalIndex, 331); assert.equal(hit.fraction, 1); assert.equal(hit.reason, 'LARGEST_DECLINE_WEEKLY_EXIT');
  assert.equal(postBreakoutEvidence(b, { setupDate: b[320].date, entryDate: b[321].date, exitDate: null, entryFill: 101 }).weeklyDeclineSignalBeforeExit, true);
  // fewer than 4 prior weeks since the Stage 2 start: not evaluable, the REF exits stay
  const st = stage2Start(b, 320);
  assert.ok(st !== null);
  assert.equal(createExitRule(variant('EXIT-LARGEST-DECLINE-WEEKLY').exitRule, b, { e: st + 20, s0: st }).status, 'NOT_EVALUABLE_FEWER_THAN_4_PRIOR_WEEKS');
});

test('SF7-EXIT-MA20-HALF: half at the next open after the first close below MA20 in the first 10 sessions; the rest follows REF (B03 PDF 47)', () => {
  const s = vcp('V-MA20', TAILS.MA20, 0.004), d = ds(s);
  const ref = runRef(d, 'SEPA'), r = runV(d, 'SEPA', 'EXIT-MA20-HALF');
  assert.equal(r.trades.length, 1); assert.equal(ref.trades.length, 1);
  const t = r.trades[0], sells = t.events.filter((e) => e.type === 'SELL');
  assert.equal(sells[0].reason, 'MA20_HALF_POST_BREAKOUT'); assert.equal(sells[0].shares, t.shares / 2);
  const sched = t.events.find((e) => e.type === 'EXIT_SCHEDULED_NEXT_OPEN' && e.reason === 'MA20_HALF_POST_BREAKOUT');
  const k = s.bars.findIndex((b) => b.date === sched.date), e = s.bars.findIndex((b) => b.date === t.entryDate);
  assert.ok(k - e < 10 && s.bars[k].close < s.bars.slice(k - 19, k + 1).reduce((a, b) => a + b.close, 0) / 20);
  for (let j = e; j < k; j++) assert.ok(s.bars[j].close >= s.bars.slice(j - 19, j + 1).reduce((a, b) => a + b.close, 0) / 20 - 1e-9, `no earlier close below MA20 (${j})`);
  assert.equal(sells[0].date, s.bars[k + 1].date);
  // the remaining half keeps the REF exit
  assert.equal(t.exitReason, ref.trades[0].exitReason); assert.equal(t.exitDate, ref.trades[0].exitDate);
  // a close below MA20 after the 10-session window never sells: steady rise for 12 sessions after the entry, then a drop
  const late = mk([...path([[0, 40], [300, 100]]), ...Array.from({ length: 12 }, (_, j) => 100.5 + j * 0.5), 90, 85]);
  const rule = createExitRule(variant('EXIT-MA20-HALF').exitRule, late, { e: 301, s0: 300 });
  for (let k = 301; k < late.length; k++) assert.equal(rule.onClose(k), null, `no half sale (${k})`);
  assert.ok(late.at(-1).close < late.slice(-20).reduce((a, b) => a + b.close, 0) / 20, 'the late close is below MA20');
});

test('SF7-EXIT-CLIMAX: full exit after an extended run (>= 25 % / 15 sessions or >= 70 % / 10) with the steepest 15-session gain since the Stage 2 start (B03 PDF 212)', () => {
  const s = vcp('V-CLIMAX', TAILS.CLIMAX, 0.004), d = ds(s);
  const r = runV(d, 'SEPA', 'EXIT-CLIMAX'), t = r.trades[0];
  assert.equal(t.exitReason, 'CLIMAX_RUN_EXIT');
  const sched = t.events.find((e) => e.reason === 'CLIMAX_RUN_EXIT' && e.type === 'EXIT_SCHEDULED_NEXT_OPEN');
  const k = s.bars.findIndex((b) => b.date === sched.date);
  const g = (j) => s.bars[j].close / s.bars[j - 15].close - 1;
  assert.ok(g(k) >= 0.25 || s.bars[k].close / s.bars[k - 10].close - 1 >= 0.70);
  const st = stage2Start(s.bars, s.bars.findIndex((b) => b.date === t.setupDate));
  for (let j = st + 15; j < k; j++) assert.ok(g(j) < g(k), `steepest since the Stage 2 start (${j})`);
  assert.equal(t.exitDate, s.bars[k + 1].date);
  // a steady advance (about 7 % per 15 sessions) never fires
  const calm = vcp('V-CALM', [[400, 130]], 0), rule = createExitRule(variant('EXIT-CLIMAX').exitRule, calm.bars, { e: 331, s0: 330 });
  for (let j = 331; j < calm.bars.length; j++) { assert.ok(calm.bars[j].close / calm.bars[j - 15].close - 1 < 0.25); assert.equal(rule.onClose(j), null); }
});

test('SF7-EXIT-CLIMAX-UPCLOSES: extended and at least 11 of 15 up closes -> full exit; translation doubt flagged (B03 PDF 216)', () => {
  const v = variant('EXIT-CLIMAX-UPCLOSES');
  assert.equal(v.translationDoubt, true); assert.equal(SF7_EXIT_SOURCE_BOUNDS.climaxUpCloseShare.translationDoubt, true);
  // 15 sessions, +30 %: 10 up closes is not enough, 11 is
  const base = path([[0, 40], [250, 100], [300, 100]]); // flat before the run: equal closes are no up closes
  const mkRun = (ups) => { const c = [...base]; let x = 100; for (let j = 0; j < 15; j++) { x = j < ups ? x * 1.03 : x * 0.995; c.push(x); } return mk(c); };
  const ten = mkRun(10), eleven = mkRun(11);
  const fire = (b) => { const r = createExitRule(v.exitRule, b, { e: 301, s0: 300 }); let h = null; for (let k = 301; k < b.length && !h; k++) h = r.onClose(k); return h; };
  assert.equal(fire(ten), null);
  assert.ok(eleven[311].close / eleven[296].close - 1 >= 0.25);
  assert.equal(fire(eleven).signalIndex, 311, 'first close with 11 up closes in its 15-session window');
  // 11 of 15 up closes without the extension (+1 % steps) never fire
  const slow = mk([...base, ...Array.from({ length: 15 }, (_, j) => 100 * Math.pow(1.01, Math.min(j + 1, 11)))]);
  assert.equal(fire(slow), null);
});

test('ADV-SF7-EXIT-NO-LOOKAHEAD: every rule gives the same signal on bars truncated after the signal close; the state reads no bar before onClose', () => {
  const cases = [vcp('V-FAIL', TAILS.FAIL, 0.004), vcp('V-CLIMAX', TAILS.CLIMAX, 0.004), vcp('V-MA20', TAILS.MA20, 0.004), vcp('V-CHOP', TAILS.CHOP, 0.004)];
  for (const s of cases) for (const v of SF7_EXIT_VARIANTS) {
    const e = 331, s0 = 330;
    const full = createExitRule(v.exitRule, s.bars, { e, s0 }); let hit = null; for (let k = e; k < s.bars.length && !hit; k++) hit = full.onClose(k);
    if (!hit) continue;
    const cut = s.bars.slice(0, hit.signalIndex + 1), r = createExitRule(v.exitRule, cut, { e, s0 }); let h2 = null; for (let k = e; k < cut.length && !h2; k++) h2 = r.onClose(k);
    assert.deepEqual(h2, hit, `${s.id} ${v.id}`);
    // changing every later bar does not move the signal
    const poisoned = s.bars.map((b, k) => (k > hit.signalIndex ? { ...b, close: 1, open: 1, high: 1, low: 1 } : b));
    const r3 = createExitRule(v.exitRule, poisoned, { e, s0 }); let h3 = null; for (let k = e; k <= hit.signalIndex && !h3; k++) h3 = r3.onClose(k);
    assert.deepEqual(h3, hit);
  }
  // catch-up: a call that skips closes reads them in order and reports the first signal
  const s = vcp('V-FAIL', TAILS.FAIL, 0.004), v = variant('EXIT-LARGEST-DECLINE-DAILY');
  const a = createExitRule(v.exitRule, s.bars, { e: 331, s0: 330 }); let h = null; for (let k = 331; k < s.bars.length && !h; k++) h = a.onClose(k);
  const b = createExitRule(v.exitRule, s.bars, { e: 331, s0: 330 });
  assert.deepEqual(b.onClose(h.signalIndex + 5), h);
  // the engine fills after the signal session, never on it
  const d = universe();
  for (const vv of SF7_EXIT_VARIANTS) for (const st of ['SEPA', 'POWER_PLAY']) {
    const r = runV(d, st, vv.id);
    for (const t of r.trades) for (const ev of t.events.filter((x) => x.type === 'EXIT_SCHEDULED_NEXT_OPEN' && x.rule === 'SF7_EXIT_VARIANT')) {
      assert.ok(ev.signalDate <= ev.date);
      const sell = t.events.find((x) => x.type === 'SELL' && x.reason === ev.reason);
      if (sell) assert.ok(sell.date > ev.date, `${vv.id} ${t.id}`);
    }
  }
});

test('SF7-EXIT-HALT-CATCH-UP: a signal on a session without an executable open fills at the next executable open', () => {
  const s = vcp('V-HALT', TAILS.FAIL, 0.004), d0 = ds(vcp('V-HALT', TAILS.FAIL, 0.004));
  const sig = (() => { const r = runV(d0, 'SEPA', 'EXIT-LARGEST-DECLINE-DAILY'); return r.trades[0].events.find((e) => e.reason === 'LARGEST_DECLINE_DAILY_EXIT' && e.type === 'EXIT_SCHEDULED_NEXT_OPEN'); })();
  const k = s.bars.findIndex((b) => b.date === sig.signalDate);
  s.bars[k] = { ...s.bars[k], open: null }; // the signal close is on a halted-open session: no close rules that day
  const r = runV(ds(s), 'SEPA', 'EXIT-LARGEST-DECLINE-DAILY'), t = r.trades[0];
  const ev = t.events.find((e) => e.reason === 'LARGEST_DECLINE_DAILY_EXIT' && e.type === 'EXIT_SCHEDULED_NEXT_OPEN');
  assert.equal(ev.signalDate, s.bars[k].date); assert.ok(ev.date > ev.signalDate);
  assert.ok(t.exitDate > ev.date || t.exitReason !== 'LARGEST_DECLINE_DAILY_EXIT');
});

test('SF7-EXIT-NOT-EVALUABLE: without Stage 2 at the setup the Stage-2 rules keep the REF exits (Power Play, 150 sessions: ledger identical)', () => {
  const d = ds(pp('P-FAST', [[140, 75], [150, 66]]), pp('P-FAIL', [[130, 47], [140, 40]]));
  const ref = runRef(d, 'POWER_PLAY');
  assert.ok(ref.trades.length >= 1);
  for (const id of ['EXIT-LARGEST-DECLINE-DAILY', 'EXIT-LARGEST-DECLINE-WEEKLY', 'EXIT-CLIMAX']) {
    const r = runV(d, 'POWER_PLAY', id);
    assert.deepEqual(r.ledger, ref.ledger, id);
    assert.equal(r.sf7ExitCounts.evaluated, 0); assert.equal(r.sf7ExitCounts.notEvaluable.NOT_EVALUABLE_NO_STAGE2_AT_SETUP, ref.trades.length);
  }
});

test('SF7-EXIT-REGISTRY: pre-registered and pinned; one fixed value per parameter; research variants only, never a reference or SOURCE_EXACT', () => {
  assert.equal(sf7ExitRegistrySha256(), PINNED_SF7_EXIT_REGISTRY_SHA256);
  assert.deepEqual(SF7_EXIT_VARIANTS.map((v) => v.id), ['EXIT-LARGEST-DECLINE-DAILY', 'EXIT-LARGEST-DECLINE-WEEKLY', 'EXIT-MA20-HALF', 'EXIT-CLIMAX', 'EXIT-CLIMAX-UPCLOSES']);
  const known = new Set([...SF7_MODEL_ASSUMPTIONS, ...SF7_EXIT_MODEL_ASSUMPTIONS].map((m) => m.id));
  for (const v of SF7_EXIT_VARIANTS) {
    assert.equal(v.status, 'SOURCE_DERIVED_RESEARCH_VARIANT'); assert.equal(v.reference, false); assert.equal(v.originalRule, false); assert.equal(v.activated, false); assert.equal(v.sourceExact, false);
    assert.equal(v.compareTo, 'REF'); assert.equal(v.config, REFERENCE_CONFIG); assert.deepEqual(v.strategies, ['SEPA', 'POWER_PLAY']);
    assert.ok(v.findings.length >= 1 && v.findings.every((f) => /^F7-B(03|12)-\d{3}-\d{3}$/.test(f)));
    assert.ok(v.modelAssumptions.every((m) => known.has(m)), v.id);
    assert.equal(typeof v.exitRule.fraction, 'number'); assert.equal(typeof v.translationDoubt, 'boolean');
  }
  // one value per parameter: every bound is a single number (no grid, no range)
  for (const [k, b] of Object.entries(SF7_EXIT_SOURCE_BOUNDS)) { assert.equal(typeof b.value, 'number', k); assert.ok(b.sessions === undefined || Number.isInteger(b.sessions), k); }
  assert.ok(SF7_EXIT_MODEL_ASSUMPTIONS.every((m) => m.id.startsWith('MA-MIN7-') && m.why));
  // the classification of the climax finding with the translation doubt is the flagged variant
  const cls = JSON.parse(fs.readFileSync(new URL('../source-faithful/evidence/MINERVINI-SF7-FINDINGS-CLASSIFICATION.json', import.meta.url), 'utf8')).rows;
  for (const v of SF7_EXIT_VARIANTS) assert.equal(v.translationDoubt, v.findings.some((f) => cls.find((r) => r.id === f)?.translationDoubt === true), v.id);
});

test('SF7-EXIT-FINGERPRINTS: the 4.0 research code, its registry, the Turtle engine, SF6-PAPER-2027 1.1.0 and the 7.0 setup variants are unchanged; no pinned file list contains the exit files', async () => {
  const { researchCodeSha256 } = await import('../source-faithful/research/run-sf4-lifecycle.mjs');
  const { codeSha256 } = await import('../source-faithful/runner/run-research.mjs');
  const { SF6_PAPER_PROTOCOL, sf6PaperProtocolSha256 } = await import('../source-faithful/completion/sf6-paper-protocol-2027.mjs');
  const { sf5VariantRegistrySha256 } = await import('../source-faithful/research/sf5-lifecycles.mjs');
  const { SF5_RESEARCH_FILES } = await import('../source-faithful/research/run-sf5-lifecycle.mjs');
  const { KK_RESEARCH_FILES } = await import('../source-faithful/research/run-kk-intraday.mjs');
  assert.equal(researchCodeSha256(), 'c834b227045b758f78dcf417f188cbf663f4153433395113e06ee81e54b7f30f');
  assert.equal(variantRegistrySha256(), 'f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75');
  assert.equal(codeSha256(), '89fbcf864a57041379bc62d4af64cfda7c5601aaaf1c08b38fd6b91b6472ef24');
  assert.equal(sf6PaperProtocolSha256(), 'e623b336cd24a49e04b4588ab5b06c06d6226a323b368d4c659f2d7ce4b64f66');
  assert.equal(SF6_PAPER_PROTOCOL.version, '1.1.0'); assert.equal(SF6_PAPER_PROTOCOL.references.pinned.sf5VariantRegistrySha256, sf5VariantRegistrySha256());
  assert.equal(sf7VariantRegistrySha256('sf7-minervini-1.3.0'), 'ce98c24feb40be85deba857d27a6a44a1aaec168570e63e114f217513385bd7e', 'the 7.0 setup variants ALT-SEPA-* are unchanged (content of the 1.3.0 registry; 1.4.0 changes only the version string)');
  const sf4 = fs.readFileSync(new URL('../source-faithful/research/run-sf4-lifecycle.mjs', import.meta.url), 'utf8');
  for (const f of ['minervini-sf7-exits.mjs', 'minervini-sf7-exit-execution.mjs', 'minervini-sf7-mechanical.mjs']) {
    assert.ok(!sf4.includes(f), `run-sf4-lifecycle#FILES must not include ${f}`);
    assert.ok(!SF5_RESEARCH_FILES.some((x) => x.endsWith(f)) && !KK_RESEARCH_FILES.some((x) => x.endsWith(f)), f);
  }
});

test('SF7-EXIT-RUNNER: REF unchanged, engine copy identical, exit variants per strategy with counts and hashes only (no metrics in the public part)', async () => {
  const { sf7Part, diffTradeSells } = await import('../source-faithful/research/run-sf7-minervini.mjs');
  const d = { ...universe(), benchmark: universe().securities[0].bars.map((x) => ({ date: x.date, close: 100 })), spyTR: null };
  const withExits = sf7Part(d, { from: null, to: null }), without = sf7Part(d, { from: null, to: null, exitVariants: [] });
  for (const st of ['SEPA', 'POWER_PLAY']) {
    const p = withExits.pub.strategies[st];
    assert.equal(p.ref.ledgerSha256, without.pub.strategies[st].ref.ledgerSha256);
    assert.deepEqual(p.variants, without.pub.strategies[st].variants, 'ALT-SEPA-* unchanged');
    assert.deepEqual(p.exitEngineIdentity, { ledgerEqualsRef: true, tradesEqualRef: true, curveEqualsRef: true, countsEqualRef: true });
    assert.deepEqual(Object.keys(p.exitVariants), SF7_EXIT_VARIANTS.map((v) => v.id));
    for (const [id, x] of Object.entries(p.exitVariants)) {
      assert.equal(x.status, 'SOURCE_DERIVED_RESEARCH_VARIANT'); assert.equal(x.reference, false); assert.equal(x.originalRule, false);
      assert.match(x.ledgerSha256, /^[0-9a-f]{64}$/);
      const s = x.vsRefSells; assert.equal(s.unchanged + s.changed + s.removedVsRef, p.ref.trades, id);
    }
    assert.equal(without.pub.strategies[st].exitVariants, undefined);
  }
  const txt = JSON.stringify(withExits.pub);
  for (const k of ['"pnl"', '"returnPct"', '"equity"', '"cagr"', '"sharpe"', '"metrics"', '"rMultiple"', '"unrealizedPnl"']) assert.ok(!txt.includes(k), k);
  assert.ok(withExits.sealed.strategies.SEPA.exitVariants['EXIT-CLIMAX'].metrics);
  // a partial sale with the same final exit is a changed trade
  const t = { id: 'A', entryDate: 'x', exitDate: 'y', shares: 2, exitReason: 'S', events: [{ type: 'SELL', date: 'y', shares: 2, reason: 'S' }] };
  const u = { ...t, events: [{ type: 'SELL', date: 'w', shares: 1, reason: 'MA20_HALF_POST_BREAKOUT' }, { type: 'SELL', date: 'y', shares: 1, reason: 'S' }] };
  assert.deepEqual(diffTradeSells([t], [u]), { unchanged: 0, changed: 1, removedVsRef: 0, addedVsRef: 0 });
  assert.deepEqual(diffTradeSells([t], [t, { id: 'B', entryDate: 'z' }]), { unchanged: 1, changed: 0, removedVsRef: 0, addedVsRef: 1 });
});

test('SF7-EXIT-SIGNAL-TALLY: Sitzungen vom Einstieg bis zum Signal je Bucket, nur Zaehlungen (Review #917)', async () => {
  const { signalSessionsFromEntry } = await import('../source-faithful/research/run-sf7-minervini.mjs');
  const bars = Array.from({ length: 40 }, (_, k) => ({ date: new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10) }));
  const ev = (k) => ({ type: 'EXIT_SCHEDULED_NEXT_OPEN', rule: 'SF7_EXIT_VARIANT', signalDate: bars[k].date });
  const trades = [
    { id: 'A', entryDate: bars[5].date, events: [ev(5)] },
    { id: 'A', entryDate: bars[5].date, events: [ev(7), { type: 'EXIT_SCHEDULED_NEXT_OPEN', rule: 'MA50', signalDate: bars[9].date }] },
    { id: 'A', entryDate: bars[2].date, events: [ev(30)] },
    { id: 'B', entryDate: bars[2].date, events: [ev(3)] },
  ];
  const t = signalSessionsFromEntry(trades, new Map([['A', { bars }]]));
  assert.deepEqual(t, { '0-0': 1, '1-2': 1, '3-5': 0, '6-10': 0, '11-20': 0, '21+': 1, unknown: 1 });
});

test('SF7-EXIT-UPCLOSES-NO-LOOKAHEAD: die Bedingung liest nur Schluesse bis j; vor dem Einstieg wird nie ausgewertet; Einstiegstag-Signale stammen aus dem Vorlauf (Owner-Pruefung E7-7)', async () => {
  const { climaxUpClosesHolds, createExitRule, SF7_EXIT_VARIANTS: V } = await import('../source-faithful/research/minervini-sf7-exits.mjs');
  const { upClosesSignalTiming } = await import('../source-faithful/research/run-sf7-minervini.mjs');
  const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
  const mkb = (cl) => cl.map((c, k) => ({ date: day(k), open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 }));
  // flat to 60, then a steep run-up of 15 rising closes (+40 %) up to the setup close s0 = 75, entry e = 76
  const cl = [...Array.from({ length: 61 }, () => 50), ...Array.from({ length: 15 }, (_, k) => 50 * (1 + 0.4 * (k + 1) / 15)), 70.5, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59, 58, 57, 56];
  const bars = mkb(cl), s0 = 75, e = 76;
  assert.equal(climaxUpClosesHolds(bars, s0), true, 'extended with 15 rising closes at the setup close (pre-entry state)');
  // no look-ahead: changing every bar after j never changes the value at j
  for (const j of [s0, e, e + 3]) { const b2 = bars.map((b, k) => (k > j ? { ...b, close: b.close * 3 } : b)); assert.equal(climaxUpClosesHolds(b2, j), climaxUpClosesHolds(bars, j)); }
  const rule = V.find((v) => v.id === 'EXIT-CLIMAX-UPCLOSES').exitRule;
  // the rule state starts at the entry close: a condition that holds only BEFORE the entry never fires
  const pre = mkb([...cl.slice(0, e), 40, 39, 38, 37, 36, 35, 34, 33, 32, 31]);
  assert.equal(climaxUpClosesHolds(pre, s0), true); assert.equal(climaxUpClosesHolds(pre, e), false);
  const st = createExitRule(rule, pre, { e, s0 }); let hit = null; for (let j = e; j < pre.length && !hit; j++) hit = st.onClose(j);
  assert.equal(hit, null, 'pre-entry-only condition: no exit, no retroactive exit');
  // when the entry close still meets it, the signal is on the entry close (after the fill) and is classified as already knowable at the setup
  const st2 = createExitRule(rule, bars, { e, s0 }); const h2 = st2.onClose(e);
  assert.equal(h2?.signalIndex, e);
  const trades = [{ id: 'A', setupDate: day(s0), entryDate: day(e), exitDate: day(e + 1), events: [{ type: 'EXIT_SCHEDULED_NEXT_OPEN', rule: 'SF7_EXIT_VARIANT', signalDate: day(e) }] }];
  const t = upClosesSignalTiming(trades, new Map([['A', { bars }]]));
  assert.equal(t.ON_ENTRY_CLOSE_ALREADY_AT_SETUP, 1); assert.equal(t.signalBeforeEntry, 0); assert.equal(t.fillNotAfterSignal, 0);
  const bad = upClosesSignalTiming([{ ...trades[0], exitDate: day(e) }], new Map([['A', { bars }]]));
  assert.equal(bad.fillNotAfterSignal, 1, 'an exit on the signal session itself would be a timing violation');
});
