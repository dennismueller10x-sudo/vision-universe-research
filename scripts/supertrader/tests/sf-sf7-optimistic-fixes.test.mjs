// Supertrader 7.0 – Behebung SF7-D3 (Turtle) und SF7-D4 (Minervini) in den OPTIMISTIC-Lesarten (Eigentuemerentscheidung
// E7-3, docs/SUPERTRADER_7_OPTIMISTIC_FIXES.md). Die Fix-Tests schlagen auf dem Stand vor der Behebung fehl
// (UNKNOWN_ENTRY_BAR_ORDER bzw. AMBIGUOUS). Referenzen: die Lesarten PESSIMISTIC / OPTIMISTIC der Turtle-Engine und alle
// registrierten Minervini-Varianten sind auf einem synthetischen Universum bitgleich mit dem Code vor der Behebung
// (Fingerabdruecke unten, mit dem alten Code erzeugt). Simuliert nur Research-Trades.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { runTurtle, createBreakoutTracker, turtleN, MODEL_ASSUMPTIONS, ENTRY_BAR_ORDERS, TURTLE_EXECUTION_REVISION, TURTLE_VERSION } from '../source-faithful/methods/turtle.mjs';
import { SCENARIO_SET } from '../source-faithful/runner/run-research.mjs';
import { fillBuyOrder, RUN_VARIANTS, variantRegistrySha256 } from '../source-faithful/research/minervini-lifecycle.mjs';
import { runMinerviniLifecycle, buildSetupIndex } from '../source-faithful/research/minervini-execution.mjs';
import { SF7_MINERVINI_VARIANTS, SF7_MINERVINI_SUPERSEDED, sf7MinerviniVariantsSha256 } from '../source-faithful/research/sf7-minervini-variants.mjs';

// pinned before any snapshot result of the Supertrader 7.0 Minervini variants exists
const PINNED_SF7_MINERVINI_VARIANTS = '496cad56c7eb71a3eef3e675679ecfbe02896f0997e464eab52b8139c0928b04';
// produced with the code BEFORE the fix (claude/supertrader-7-execution @ 8e66e392): reference readings unchanged
const PRE_FIX_TURTLE_READINGS = '2e4fe04136ae29bbdd4c04789f525954e7cf8d4381752af35b08a2e395e99746';
const PRE_FIX_MINERVINI_VARIANTS = '27b9efd105874b02ebc320806f10f9d59de0d06896650802a540641f94cef868';

const sha = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 1e6, rawClose: c, rawVolume: 1e6, splitAdj: 1 });
const flat = (n, px = 10, w = 0.1) => Array.from({ length: n }, (_, k) => bar(k, px, px + w, px - w, px));
const ds = (bars) => ({ calendar: bars.map((b) => b.date), securities: [{ id: 'A', bars, terminal: null }] });
const OPEN_UNIVERSE = Object.freeze({ id: 'TEST_OPEN', priceFloorRaw: 0, dollarVolumeFloor: 0, dollarVolumeSessions: 1 });
const tur = (d, entryBarOrder) => runTurtle(d, { system: 'S2', universe: OPEN_UNIVERSE, slippageBps: 0, commissionBps: 0, entryBarOrder });
const rows = (r) => r.ledger.map((x) => [x.date, x.side, x.unit, Math.round(x.price * 1000) / 1000, x.reason]);
/** S2 entry on bar 70 (55-day high 10.1, N 0.2, stop 2N below the fill), then flat at 9.5 */
const entryBar = (o, h, l, c) => { const b = flat(70); b.push(bar(70, o, h, l, c)); for (let k = 71; k < 80; k++) b.push(bar(k, 9.5, 9.6, 9.4, 9.5)); return ds(b); };

test('SF7-D3-TURTLE-OPEN-FILL: Einstieg zur Eroeffnung, Tief durch den Stop: OPTIMISTIC_CERTAIN_RULE stoppt am selben Balken (vorher gehalten)', () => {
  const d = entryBar(11, 11.1, 9.0, 9.5);
  const pes = tur(d, 'PESSIMISTIC'), opt = tur(d, 'OPTIMISTIC'), fix = tur(d, 'OPTIMISTIC_CERTAIN_RULE');
  assert.deepEqual(rows(fix), [[day(70), 'BUY', 1, 11, 'S2'], [day(70), 'SELL', 1, 10.6, 'STOP_2N_SAME_BAR_CERTAIN']]);
  assert.equal(fix.counts.sameBarCertainByOpenFill, 1); assert.equal(fix.counts.sameBarCertainByClose, undefined);
  assert.equal(fix.positionTrades[0].exitDate, day(70));
  // the superseded reading keeps the defect (before / after evidence), the reference stops at the same price
  assert.equal(opt.positionTrades[0].exitDate > day(70), true);
  assert.equal(pes.ledger[1].price, fix.ledger[1].price);
  assert.ok(fix.reconciliation.pass);
});

test('SF7-D3-TURTLE-CLOSE: Einstieg per Beruehrung, Schluss unter dem Kanal-Level: sicher; Schluss darueber bleibt mehrdeutig (optimistisch gehalten)', () => {
  const certain = tur(entryBar(10.05, 10.6, 9.0, 9.5), 'OPTIMISTIC_CERTAIN_RULE');
  assert.deepEqual(rows(certain).slice(1), [[day(70), 'SELL', 1, 9.89, 'EXIT_20D_SAME_BAR_CERTAIN']]);
  assert.equal(certain.counts.sameBarCertainByClose, 1); assert.equal(certain.counts.sameBarEntryChannelExits, 1);
  assert.equal(tur(entryBar(10.05, 10.6, 9.0, 9.5), 'OPTIMISTIC').positionTrades[0].exitDate > day(70), true);
  const amb = entryBar(10.05, 10.6, 9.0, 10.5);
  assert.deepEqual(rows(tur(amb, 'OPTIMISTIC_CERTAIN_RULE')), rows(tur(amb, 'OPTIMISTIC')), 'close above every level: the low may precede the fill');
  assert.equal(tur(amb, 'PESSIMISTIC').positionTrades[0].exitDate, day(70));
});

test('SF7-D3-TURTLE-ADD-AT-OPEN: Nachkauf zur Eroeffnung, Tief durch den neuen Einheiten-Stop: sicher (Anhebung erst nach dem Fill)', () => {
  const b = []; for (let k = 0; k < 70; k++) b.push(bar(k, 10, 10.5, 9.5, 10));
  b.push(bar(70, 10.3, 10.6, 10.2, 10.55));
  let p = 10.55; for (let k = 71; k < 95; k++) { b.push(bar(k, p, p + 0.1, p - 0.05, p + 0.05)); p += 0.05; }
  b.push(bar(95, 12.95, 13.0, 10.9, 12.0)); for (let k = 96; k < 100; k++) b.push(bar(k, 12, 12.1, 11.9, 12));
  const d = ds(b), fix = tur(d, 'OPTIMISTIC_CERTAIN_RULE'), opt = tur(d, 'OPTIMISTIC'), pes = tur(d, 'PESSIMISTIC');
  assert.deepEqual(rows(fix).slice(3), [[day(95), 'BUY', 4, 12.95, 'S2'], [day(95), 'SELL', 4, 10.95, 'STOP_2N_SAME_BAR_CERTAIN']]);
  assert.equal(fix.counts.sameBarAddStops, 1); assert.equal(fix.counts.sameBarCertainByOpenFill, 1);
  assert.equal(opt.counts.sameBarAddStops, 0); assert.equal(pes.counts.sameBarAddStops, 1);
});

test('SF7-D3-TURTLE-FILTER: S1-Filter loest den hypothetischen Ausbruch nur bei Sicherheit am Ausbruchsbalken auf', () => {
  const b = flat(70); b.push(bar(70, 11, 11.1, 9.0, 9.5)); b.push(bar(71, 9.5, 9.6, 9.4, 9.5));
  const N = turtleN(b), run = (entryBarOrder) => { const t = createBreakoutTracker(b, N, undefined, { entryBarOrder }); for (let i = 1; i < b.length; i++) { t.resolve(i); t.start(i); if (i === 70) return t; } return t; };
  const fix = run('OPTIMISTIC_CERTAIN_RULE'), opt = run('OPTIMISTIC'), pes = run('PESSIMISTIC');
  assert.equal(fix.outcome(), 'LOSER'); assert.equal(fix.counts.ENTRY_BAR_RESOLVED_CERTAIN, 1);
  assert.equal(opt.outcome(), 'OPEN'); assert.equal(pes.outcome(), 'LOSER');
  const amb = flat(70); amb.push(bar(70, 10.05, 10.6, 9.0, 10.5));
  const t = createBreakoutTracker(amb, turtleN(amb), undefined, { entryBarOrder: 'OPTIMISTIC_CERTAIN_RULE' }); for (let i = 1; i <= 70; i++) { t.resolve(i); t.start(i); }
  assert.equal(t.outcome(), 'OPEN');
});

test('SF7-D3-TURTLE-VERSIONED: neue Lesart als eigenes Szenario, die alte als ersetzt markiert; Referenz und alte Lesart bitgleich mit dem Code vor der Behebung', () => {
  assert.equal(TURTLE_VERSION, 'sf-turtle-1.3.0');
  assert.deepEqual(ENTRY_BAR_ORDERS, ['PESSIMISTIC', 'OPTIMISTIC', 'OPTIMISTIC_CERTAIN_RULE']);
  assert.equal(TURTLE_EXECUTION_REVISION.defect, 'SF7-D3');
  const ma = MODEL_ASSUMPTIONS.find((m) => m.id === 'MA-TUR-INTRABAR-ORDER');
  assert.equal(ma.reference.option, 'entryBarOrder=PESSIMISTIC');
  assert.equal(ma.alternative.scenario, 'ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE'); assert.equal(ma.alternative.supersedes.scenario, 'ENTRY_BAR_OPTIMISTIC');
  const old = SCENARIO_SET.find((s) => s.id === 'ENTRY_BAR_OPTIMISTIC'), neu = SCENARIO_SET.find((s) => s.id === 'ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE');
  assert.equal(old.status, 'SUPERSEDED_SF7_D3'); assert.equal(old.entryBarOrder, 'OPTIMISTIC'); assert.equal(neu.entryBarOrder, 'OPTIMISTIC_CERTAIN_RULE');
  assert.equal(SCENARIO_SET.find((s) => s.id === 'BASE_S0').entryBarOrder, undefined);
  // synthetic universe: PESSIMISTIC and OPTIMISTIC, S1 and S2: ledgers, counts and filter counts as before the fix
  const d = synthetic(), out = [];
  for (const system of ['S1', 'S2']) for (const entryBarOrder of ['PESSIMISTIC', 'OPTIMISTIC']) { const r = runTurtle(d, { system, universe: OPEN_UNIVERSE, from: sday(100), entryBarOrder }); out.push([system, entryBarOrder, r.ledger, r.counts, r.filterCounts]); }
  assert.equal(sha(out), PRE_FIX_TURTLE_READINGS);
  assert.throws(() => runTurtle(d, { system: 'S2', entryBarOrder: 'OPTIMISTIC_V2' }), /UNKNOWN_ENTRY_BAR_ORDER/);
});

test('SF7-D4-MINERVINI-FILL: Pivot-Beruehrung mit Schluss <= Stop ist mit der Revision sicher; ohne Option unveraendert mehrdeutig', () => {
  const b = { date: '2020-02-03', open: 10.2, high: 10.8, low: 9.9, close: 9.95, volume: 1 }, order = { type: 'BUY_STOP', level: 10.5, stop: 10.0 };
  const fix = fillBuyOrder(b, order, { closeConfirmsStop: true });
  assert.equal(fix.status, 'FILLED'); assert.equal(fix.basis, 'INTRADAY_PIVOT_TOUCH'); assert.equal(fix.sameBarStop, 'CERTAIN'); assert.equal(fix.sameBarStopEvidence, 'CERTAIN_BY_CLOSE');
  assert.equal(fillBuyOrder(b, order).sameBarStop, 'AMBIGUOUS'); // reference path unchanged
  assert.equal(fillBuyOrder({ ...b, close: 10.0 }, order, { closeConfirmsStop: true }).sameBarStop, 'CERTAIN'); // close equal to the stop
  assert.equal(fillBuyOrder({ ...b, close: 10.3 }, order, { closeConfirmsStop: true }).sameBarStop, 'AMBIGUOUS');
  assert.equal(fillBuyOrder({ ...b, close: null }, order, { closeConfirmsStop: true }).sameBarStop, 'AMBIGUOUS');
  assert.equal(fillBuyOrder({ ...b, open: 10.6 }, order, { closeConfirmsStop: true }).sameBarStopEvidence, undefined); // gap: already CERTAIN
});

test('SF7-D4-MINERVINI-LIFECYCLE: Szenario Pivot 10,5 / Stop 10,0 / O 10,2 H 10,8 L 9,9 C 9,95: korrigiertes OPTIMISTIC stoppt am selben Balken; REF nur Bezeichnung', () => {
  const bars = []; for (let k = 0; k < 30; k++) bars.push(bar(k, 10.2, 10.3, 10.1, 10.2));
  bars.push(bar(30, 10.2, 10.8, 9.9, 9.95)); for (let k = 31; k < 40; k++) bars.push(bar(k, 10.3, 10.4, 10.2, 10.3));
  const setupIndex = { strategy: 'SEPA', counts: {}, index: new Map([['A', new Map([[29, { date: day(29), state: 'SETUP_DETECTED', vcpProxyStrict: true, pivot: 10.5, stopStructure: 10.0 }]])]]) };
  const cfgOf = (id, flag) => (flag ? SF7_MINERVINI_VARIANTS.find((v) => v.compareTo === id).config : RUN_VARIANTS.find((v) => v.id === id).config);
  const go = (id, flag) => runMinerviniLifecycle(ds(bars), { strategy: 'SEPA', setupIndex, config: cfgOf(id, flag) });
  const optBefore = go('ALT-INTRABAR-OPTIMISTIC', false), optAfter = go('ALT-INTRABAR-OPTIMISTIC', true);
  assert.equal(optBefore.trades[0].status, 'OPEN_AT_DATA_END'); // the defect: a certainly stopped position is held
  assert.equal(optAfter.trades[0].exitDate, day(30)); assert.equal(optAfter.trades[0].exitReason, 'STOP_SAME_BAR_CERTAIN');
  assert.equal(optAfter.counts.sameBarStopCertain, 1); assert.equal(optBefore.counts.sameBarStopAmbiguousIgnored, 1);
  const refBefore = go('REF', false), refAfter = go('REF', true);
  const noReason = (r) => r.ledger.map(({ reason, ...x }) => x); // eslint-disable-line no-unused-vars
  assert.deepEqual(noReason(refAfter), noReason(refBefore)); // PESSIMISTIC: same fills, shares and prices
  assert.equal(refBefore.ledger[1].reason, 'STOP_SAME_BAR_ASSUMED'); assert.equal(refAfter.ledger[1].reason, 'STOP_SAME_BAR_CERTAIN');
  assert.ok(optAfter.reconciliation.pass && refAfter.reconciliation.pass);
});

test('SF7-D4-MINERVINI-VARIANTS: eigenes, gepinntes SF7-Register; Minervini-Register f13ea350 und alle Varianten bitgleich mit dem Code vor der Behebung', () => {
  assert.equal(sf7MinerviniVariantsSha256(), PINNED_SF7_MINERVINI_VARIANTS);
  assert.equal(variantRegistrySha256(), 'f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75');
  assert.deepEqual(SF7_MINERVINI_VARIANTS.map((v) => [v.id, v.compareTo]), [['SF7-REF-CLOSE-RULE', 'REF'], ['SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE', 'ALT-INTRABAR-OPTIMISTIC']]);
  for (const v of SF7_MINERVINI_VARIANTS) { const { sameBarCloseConfirmsStop, ...rest } = v.config; assert.deepEqual(rest, RUN_VARIANTS.find((x) => x.id === v.compareTo).config); assert.equal(sameBarCloseConfirmsStop, true); }
  assert.ok(RUN_VARIANTS.every((v) => v.config.sameBarCloseConfirmsStop === undefined), 'no registered variant carries the revision');
  assert.equal(SF7_MINERVINI_SUPERSEDED['ALT-INTRABAR-OPTIMISTIC'].supersededBy, 'SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE');
  assert.ok(RUN_VARIANTS.some((v) => v.id === 'ALT-INTRABAR-OPTIMISTIC'), 'the superseded variant is still run');
  const d = synthetic(), out = [];
  for (const strategy of ['SEPA', 'POWER_PLAY']) { const idx = buildSetupIndex(d, strategy, { from: sday(260) }); for (const v of RUN_VARIANTS) { if (v.strategies && !v.strategies.includes(strategy)) continue; const r = runMinerviniLifecycle(d, { strategy, setupIndex: idx, config: v.config, from: sday(260) }); out.push([strategy, v.id, r.ledger, r.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.exitReason, t.shares]), r.counts]); } }
  assert.equal(sha(out), PRE_FIX_MINERVINI_VARIANTS);
});

const sday = (k) => new Date(Date.UTC(2016, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
/** 30 random walks with occasional opening gaps and jumps (the universe the pre-fix fingerprints were produced on) */
function synthetic(n = 30, len = 700, seed0 = 101) {
  const secs = [];
  for (let s = 0; s < n; s++) {
    const r = rng(s + seed0); let c = 20; const drift = (r() - 0.35) * 0.004, bars = [];
    for (let k = 0; k < len; k++) { const o0 = c * (1 + (r() < 0.05 ? 0.04 * (r() - 0.3) : 0)); c *= 1 + drift + 0.025 * (r() - 0.5) * 2 + (r() < 0.006 ? 0.3 : 0); const h = Math.max(o0, c) * (1 + 0.02 * r()), l = Math.min(o0, c) * (1 - 0.02 * r()); bars.push({ date: sday(k), open: o0, high: h, low: l, close: c, volume: 1e6 * (0.5 + r()), rawClose: c, rawVolume: 1e6, splitAdj: 1 }); }
    secs.push({ id: `S${String(s).padStart(3, '0')}`, bars, terminal: null });
  }
  return { calendar: secs[0].bars.map((b) => b.date), securities: secs };
}
