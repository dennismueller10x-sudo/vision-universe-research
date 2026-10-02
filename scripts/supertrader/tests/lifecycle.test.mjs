// Pflichtfaelle der Ein-/Ausstiegslogik: Bestaetigung per Schlusskurs,
// Modelleinstieg zur naechsten Eroeffnung, Gaps, Stop in derselben Kerze,
// fehlende Daten, Regimewechsel, Invalidation, Regelversion, Darvas-Volumen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeIndicators } from '../engine/indicators.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import { simulate } from '../engine/simulator.mjs';
import { phaseOf } from '../engine/lifecycle.mjs';
import darvas from '../engine/strategies/darvas.mjs';
import kk from '../engine/strategies/kk-breakout.mjs';
import { applyVersionPolicy, assertAppendOnly, planOf, linkReassessment, isReassessment } from '../build.mjs';

const slip = DEFAULT_EXECUTION.slippageBps / 10000;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

function dates(n, start = '2025-01-06') {
  const out = []; const d = new Date(start + 'T12:00:00Z');
  while (out.length < n) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function barsFrom(rows) {
  const b = { date: dates(rows.length), open: [], high: [], low: [], close: [], volume: [] };
  rows.forEach(([o, h, l, c, v]) => { b.open.push(o); b.high.push(h); b.low.push(l); b.close.push(c); b.volume.push(v === undefined ? 1e6 : v); });
  return b;
}
function ctxOf(rows, regime = 'MIXED') {
  const bars = barsFrom(rows);
  return { symbol: 'TEST', bars, ind: computeIndicators(bars), cross: { mom126: new Array(rows.length).fill(95) }, regime };
}

// Darvas-Grundszenario: Anstieg, Box 100/94 (Index 260-268), dann ab Index 269
// frei waehlbare Balken. Das Setup ist vor Index 269 vorbereitet.
const BREAK = 269;
function base() {
  const rows = [];
  for (let i = 0; i < 260; i++) { const c = 60 + i * 0.15; rows.push([c, c + 0.5, c - 0.5, c, 2e6]); }
  rows.push([98, 100, 97, 99, 2e6]);
  for (const c of [97, 96, 95, 96, 97, 98, 97, 96.5]) rows.push([c, c + 1, Math.max(94, c - 1.5), c, 2e6]);
  return rows;
}
const run = (rows, opts = {}) => simulate(darvas, ctxOf(rows, opts.regime), { from: 262, recordedAt: '2026-09-29T04:15:00Z', ...opts });
const states = (sig) => sig.transitions.map((t) => t.state);
const sigOf = (res) => res.state.signal || res.finished[res.finished.length - 1];

// Stub-Strategie fuer Simulator-Semantik unabhaengig von einer Methode.
function stub(overrides = {}) {
  return {
    id: 'STUB', variant: 'STUB_V', version: '2.0.0', PARAMS: {},
    scan: (ctx, t) => (t === 0 ? { stage: 'SETUP', levels: { trigger: 10, invalidation: 8 }, facts: {}, rules: {} } : { stage: 'SETUP', levels: { trigger: 10, invalidation: 8 }, facts: {}, rules: {} }),
    confirm: (ctx, t, s) => (ctx.bars.close[t] > s.levels.trigger ? { ruleId: 'STUB-ENTRY', basis: 'DAILY_CLOSE', close: ctx.bars.close[t] } : null),
    planEntry: () => ({ stop: 8, stopRuleId: 'STUB-STOP' }),
    invalidate: (ctx, t, s) => (ctx.bars.close[t] < s.levels.invalidation ? 'STUB-INV' : null),
    manage: (ctx, t) => (ctx.bars.close[t] < 10.5 ? { exitNextOpen: 'STUB-EXIT' } : {}),
    ...overrides,
  };
}
const stubCtx = (rows) => ({ symbol: 'S', bars: barsFrom(rows) });

test('Vorbedingung: Box-Setup ist vor dem Ausbruch vorbereitet', () => {
  const res = run(base());
  const s = res.state.signal;
  assert.ok(s && ['SETUP', 'ENTRY_READY'].includes(s.state));
  assert.equal(s.levels.trigger, 100);
  assert.equal(s.levels.invalidation, 94);
  assert.equal(phaseOf(s.state), 'PREPARED');
});

test('Trigger nicht erreicht: Setup bleibt vorbereitet, kein Einstieg', () => {
  const rows = base(); rows.push([97, 99.5, 96.5, 99, 2e6]);
  const s = run(rows).state.signal;
  assert.ok(['SETUP', 'ENTRY_READY'].includes(s.state));
  assert.equal(s.entry, undefined);
  assert.ok(!states(s).includes('TRIGGERED'));
});

test('Intraday ueber dem Trigger, Schluss darunter: nahe am Trigger ist KEINE Bestaetigung', () => {
  // Methodenneutral (Stub): Hoch 10,8 ueber Trigger 10, Schluss 9,9 darunter.
  const r = simulate(stub(), stubCtx([[9, 9.5, 8.8, 9.2], [9.6, 10.8, 9.5, 9.9]]), {});
  assert.equal(r.state.signal.state, 'SETUP');
  assert.equal(r.state.signal.entry, undefined);
  // Darvas: ein neues Hoch ueber der Oberkante ohne Schluss darueber verschiebt die
  // Box (Setup verloren) - es entsteht in keinem Fall ein Einstieg.
  const rows = base(); rows.push([98, 102, 97.5, 99.8, 3e6]);
  const s = sigOf(run(rows));
  assert.ok(!states(s).includes('TRIGGERED'), states(s).join(','));
  assert.equal(s.entry, undefined);
  assert.notEqual(phaseOf(s.state), 'CONFIRMED');
});

test('Schluss ueber dem Trigger ohne belegbare Intraday-Ausfuehrung: bestaetigt, Einstieg erst zur naechsten Eroeffnung', () => {
  const rows = base(); rows.push([99, 101, 98.5, 100.5, 3e6]);
  const s = run(rows).state.signal;
  assert.equal(s.state, 'TRIGGERED');
  assert.equal(s.entry, undefined, 'kein Fill am Bestaetigungstag');
  const t = s.transitions[s.transitions.length - 1];
  assert.equal(t.priceBasis, 'DAILY_CLOSE');
  assert.equal(t.price, 100.5);
  assert.equal(s.confirmation.date, s.transitions.at(-1).date);
  // Folgetag: Modelleinstieg zur Eroeffnung, nicht zum Trigger 100
  rows.push([101.2, 102, 100.8, 101.5, 2e6]);
  const s2 = run(rows).state.signal;
  assert.equal(s2.state, 'ACTIVE');
  near(s2.entry.price, 101.2 * (1 + slip));
  assert.equal(s2.entry.priceBasis, 'NEXT_OPEN');
  assert.notEqual(s2.entry.price, 100 * (1 + slip));
  assert.equal(s2.initialStop, 94);
});

test('Gap ueber den Trigger: Darvas erfasst den Eroeffnungskurs, Momentum laesst aus', () => {
  const rows = base(); rows.push([99, 101, 98.5, 100.5, 3e6]); rows.push([106, 107, 105, 106.5, 2e6]);
  const s = run(rows).state.signal;
  near(s.entry.price, 106 * (1 + slip));
  assert.equal(s.entry.gappedAboveTrigger, true);
  // Momentum: KK-BO-GAP-01
  const ctx = ctxOf(rows);
  const sig = { levels: { trigger: 100, adr20: 0.02 }, confirmation: { low: 98.5 } };
  const p = kk.planEntry(ctx, BREAK + 1, sig, kk.PARAMS);
  assert.equal(p.notTaken, true);
  assert.equal(p.ruleId, 'KK-BO-GAP-01');
  ctx.bars.open[BREAK + 1] = 100.5;
  const ok = kk.planEntry(ctx, BREAK + 1, sig, kk.PARAMS);
  assert.equal(ok.stopRuleId, 'KK-BO-STOP-D1');
  near(ok.stop, Math.max(98.5, 100.5 * 0.98));
});

test('Eroeffnung am Einstiegstag unter dem Stop: kein Modelleinstieg, Setup bleibt protokolliert', () => {
  const rows = base(); rows.push([99, 101, 98.5, 100.5, 3e6]); rows.push([90, 91, 88, 89, 3e6]);
  const res = run(rows);
  const s = res.finished[0];
  assert.equal(s.state, 'INVALIDATED');
  assert.equal(s.transitions.at(-1).ruleId, 'LC-OPEN-BELOW-STOP');
  assert.equal(s.entry, undefined);
});

test('Stop und hohes Kursziel in derselben Kerze: Stop gewinnt, kein Gewinn wird unterstellt', () => {
  const rows = base(); rows.push([99, 101, 98.5, 100.5, 3e6]); rows.push([101, 102, 100.5, 101.5, 2e6]);
  rows.push([101, 130, 93, 120, 5e6]);
  const res = run(rows);
  const s = res.finished[0];
  assert.equal(s.state, 'CLOSED');
  const x = s.exits.at(-1);
  near(x.price, 94 * (1 - slip));
  assert.equal(x.priceBasis, 'STOP_ORDER_ASSUMPTION');
  assert.ok(s.result.returnPct < 0);
  assert.deepEqual(states(s).slice(-4), ['TRIGGERED', 'ACTIVE', 'EXIT', 'CLOSED']);
});

test('Gap unter den Stop in der Position: Ausstieg zur Eroeffnung, Verlierer bleibt erhalten', () => {
  const rows = base(); rows.push([99, 101, 98.5, 100.5, 3e6]); rows.push([101, 102, 100.5, 101.5, 2e6]);
  rows.push([90, 91, 88, 89, 3e6]);
  const s = run(rows).finished[0];
  near(s.exits.at(-1).price, 90 * (1 - slip));
  assert.equal(s.exits.at(-1).priceBasis, 'OPEN_BELOW_STOP');
});

test('Ausstiegssignal bei fehlenden Daten: keine erfundene Ausfuehrung, Luecke protokolliert', () => {
  const N = NaN;
  const rows = [[9, 9.5, 8.8, 9.2], [9.5, 10.6, 9.4, 10.5], [10.6, 11, 10.5, 10.9], [10.8, 10.9, 10.2, 10.3], [N, N, N, N], [10.1, 10.4, 9.9, 10.2]];
  const res = simulate(stub(), stubCtx(rows), { recordedAt: 'r' });
  const s = res.finished[0];
  assert.equal(s.state, 'CLOSED');
  assert.equal(s.dataGaps.length, 1);
  assert.equal(s.dataGaps[0].ruleId, 'LC-DATA-GAP');
  const x = s.exits.at(-1);
  assert.equal(x.date, barsFrom(rows).date[5], 'Ausfuehrung erst zur naechsten verfuegbaren Eroeffnung');
  near(x.price, 10.1 * (1 - slip));
  assert.equal(x.afterDataGap, true);
  const exitT = s.transitions.find((t) => t.state === 'EXIT');
  assert.equal(exitT.date, barsFrom(rows).date[3], 'Ausstieg wurde am Signaltag ausgeloest');
});

test('Konflikt: Invalidation und Bestaetigung im selben Balken -> Invalidation gewinnt', () => {
  const rows = base(); rows.push([99, 101, 93, 100.5, 3e6]);
  const s = run(rows).finished[0];
  assert.equal(s.state, 'INVALIDATED');
  assert.equal(s.transitions.at(-1).ruleId, 'DAR-INV-01');
  assert.ok(!states(s).includes('TRIGGERED'));
});

test('Setup wird ungueltig: Protokoll bleibt vollstaendig mit Regel, Datum, Preis', () => {
  const rows = base(); rows.push([95, 95.5, 93.5, 94.2, 2e6]);
  const s = run(rows).finished[0];
  const t = s.transitions.at(-1);
  assert.equal(t.state, 'INVALIDATED');
  assert.equal(t.ruleId, 'DAR-INV-01');
  assert.equal(t.priceBasis, 'CLOSE');
  assert.equal(t.ruleVersion, darvas.version);
  assert.equal(t.recordedAt, '2026-09-29T04:15:00Z');
  assert.ok(s.transitions.length >= 2, 'Entdeckung bleibt erhalten');
});

test('Regimewechsel: A-Kandidat wird B-Setup; ab der Bestaetigung ist die Stufe eingefroren', () => {
  const rows = base();
  const ctx = ctxOf(rows, 'MIXED');
  const t = rows.length - 1;
  ctx.ind.adr20[t] = 0.02;
  const levels = { boxTop: 100, boxBottom: 94 };
  const a = darvas.quality(ctx, t, levels);
  assert.equal(a.label, 'A_CANDIDATE');
  ctx.regime = 'BROAD_WEAKNESS';
  const b = darvas.quality(ctx, t, levels);
  assert.equal(b.label, 'B_SETUP');
  assert.equal(b.blockedOnlyByRegime, true);
  assert.deepEqual(b.failed, ['DAR-Q-REGIME']);
  // Bestaetigt unter MIXED mit Volumen -> A_ENTRY; ein spaeterer Regimewechsel aendert das nicht.
  rows.push([99, 101, 98.5, 100.5, 5e6]); rows.push([101, 102, 100.5, 101.5, 2e6]);
  const c2 = ctxOf(rows, 'MIXED'); c2.ind.adr20[BREAK - 1] = 0.02;
  const res = simulate(darvas, c2, { from: 262 });
  assert.equal(res.state.signal.quality.label, 'A_ENTRY');
  c2.regime = 'BROAD_WEAKNESS';
  const cont = simulate(darvas, c2, { from: rows.length, to: rows.length - 1, state: res.state });
  assert.equal(cont.state.signal.quality.label, 'A_ENTRY');
});

test('Darvas-Volumen vor und nach dem Ausbruch', () => {
  const rows = base();
  const ctx = ctxOf(rows, 'BROAD_STRENGTH');
  const t = rows.length - 1;
  ctx.ind.adr20[t] = 0.02;
  const pre = darvas.quality(ctx, t, { boxTop: 100, boxBottom: 94 });
  assert.equal(pre.volumeStatus, 'PENDING_UNTIL_BREAKOUT');
  assert.equal(pre.criteria['DAR-Q-VOL'], null);
  assert.equal(pre.label, 'A_CANDIDATE', 'offenes Volumen zaehlt nicht gegen A-Kandidat');
  const pending = { levels: { trigger: 100, boxTop: 100, boxBottom: 94 } };
  const withVol = (v) => { const r = base(); r.push([99, 101, 98.5, 100.5, v]); const c = ctxOf(r, 'BROAD_STRENGTH'); c.ind.adr20[BREAK - 1] = 0.02; return darvas.confirm(c, BREAK, pending, darvas.PARAMS); };
  const weak = withVol(1e6);
  assert.equal(weak.quality.label, 'B_ENTRY');
  assert.deepEqual(weak.quality.failed, ['DAR-Q-VOL']);
  const strong = withVol(5e6);
  assert.equal(strong.quality.label, 'A_ENTRY');
  assert.equal(strong.quality.volumeStatus, 'MEASURED');
  const missing = withVol(null);
  assert.equal(missing.quality.label, 'B_ENTRY');
  assert.equal(missing.quality.volumeStatus, 'MISSING');
});

test('Regelversion aendert sich: wartende Setups werden beendet, nicht umgedeutet', () => {
  const engine = { id: 'DARVAS_BOX', version: '1.2.0', manageCompatible: ['1.1.0', '1.2.0'] };
  const old = { id: 'DARVAS_BOX:X:2026-09-28', symbol: 'X', version: '1.0.0', createdAt: '2026-09-28', state: 'SETUP', transitions: [{ state: 'SETUP', date: '2026-09-28', ruleId: 'LC-SETUP', price: 10 }], exits: [], levels: { trigger: 11, invalidation: 9 } };
  const before = { open: [JSON.parse(JSON.stringify(old))], closed: [], invalidated: [] };
  const { open, retired } = applyVersionPolicy(engine, [old], '2026-09-28', 'rec');
  assert.equal(open.length, 0);
  assert.equal(retired.length, 1);
  const r = retired[0];
  assert.equal(r.state, 'INVALIDATED');
  assert.equal(r.version, '1.0.0', 'Version des Signals bleibt die der Entdeckung');
  assert.deepEqual(r.transitions[0], before.open[0].transitions[0], 'altes Protokoll unveraendert');
  assert.equal(r.transitions.at(-1).ruleId, 'LC-VERSION-RETIRED');
  assert.deepEqual(r.levels, before.open[0].levels, 'Levels nicht neu interpretiert');
  assertAppendOnly(before, { open: [], closed: [], invalidated: [r] });
  // Positionen: nur mit erklaerter Kompatibilitaet
  const pos = { ...JSON.parse(JSON.stringify(old)), state: 'ACTIVE', version: '1.1.0' };
  assert.equal(applyVersionPolicy(engine, [pos], '2026-09-28', 'rec').open.length, 1);
  assert.throws(() => applyVersionPolicy(engine, [{ ...pos, version: '0.9.0' }], '2026-09-28', 'rec'), /kompatible/);
});

test('Signal-ID und Protokoll tragen die Regelversion', () => {
  const s = run(base()).state.signal;
  assert.match(s.id, /:v1\.2\.0$/);
  assert.equal(s.discovery.ruleVersion, '1.2.0');
  assert.equal(s.discovery.recordedAt, '2026-09-29T04:15:00Z');
  for (const t of s.transitions) { assert.equal(t.ruleVersion, '1.2.0'); assert.ok(t.dataAsOf); }
});

test('Ledger ist append-only: Umschreiben, Loeschen und Aendern Abgeschlossener wird abgelehnt', () => {
  const sig = { id: 'A', state: 'SETUP', version: '1', createdAt: 'd', transitions: [{ state: 'SETUP', date: 'd', ruleId: 'LC-SETUP' }] };
  const closed = { id: 'B', state: 'CLOSED', version: '1', createdAt: 'd', transitions: [{ state: 'CLOSED', date: 'e', ruleId: 'X' }], result: { returnPct: -0.05 } };
  const before = { open: [sig], closed: [closed], invalidated: [] };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  assert.throws(() => assertAppendOnly(before, { open: [], closed: [closed], invalidated: [] }), /fehlt/);
  const rewritten = clone(sig); rewritten.transitions[0].ruleId = 'OTHER';
  assert.throws(() => assertAppendOnly(before, { open: [rewritten], closed: [closed], invalidated: [] }), /umgeschrieben/);
  const changed = clone(closed); changed.result.returnPct = 0.1;
  assert.throws(() => assertAppendOnly(before, { open: [sig], closed: [changed], invalidated: [] }), /verändert/);
  const extended = clone(sig); extended.transitions.push({ state: 'ENTRY_READY', date: 'e', ruleId: 'LC-NEAR-TRIGGER' });
  assertAppendOnly(before, { open: [extended], closed: [closed], invalidated: [] });
});

test('Plan: geplante Schwellen sind als geplant markiert, Einstieg nur als tatsaechliche Modellausfuehrung', () => {
  const rows = base(); rows.push([99, 101, 98.5, 100.5, 3e6]);
  const s = run(rows).state.signal;
  const p = planOf({ ...s, strategyId: 'DARVAS_BOX', anchor: { date: s.confirmation.date } });
  assert.equal(p.phase, 'CONFIRMED');
  assert.equal(p.trigger.kind, 'PLANNED_THRESHOLD');
  assert.equal(p.entry, null, 'bestaetigt, aber noch kein Einstieg');
  assert.equal(p.nextAction.ruleId, 'LC-MODEL-ENTRY');
  rows.push([101.2, 102, 100.8, 101.5, 2e6]);
  const s2 = run(rows).state.signal;
  const p2 = planOf({ ...s2, strategyId: 'DARVAS_BOX' });
  assert.equal(p2.entry.kind, 'MODEL_EXECUTION');
  assert.equal(p2.entry.basis, 'NEXT_OPEN');
  assert.equal(p2.phase, 'POSITION');
});

test('Regression: Neubewertung nach Regelwechsel erscheint nicht als neues Setup vom Laufdatum', () => {
  // Setup unter alter Version am letzten Kursstand entdeckt.
  const rows = base();
  const ctx = ctxOf(rows);
  const dataDate = ctx.bars.date[rows.length - 1];
  const oldEngine = { ...darvas, version: '1.1.0' };
  const first = simulate(oldEngine, ctx, { from: 262, recordedAt: 'r1' }).state.signal;
  assert.ok(first && first.version === '1.1.0');
  const before = { open: [JSON.parse(JSON.stringify(first))], closed: [], invalidated: [] };
  // Regelwechsel, KEIN neuer Balken: Build-Lauf Tage spaeter auf demselben Kursstand.
  const { retired } = applyVersionPolicy(darvas, [first], dataDate, 'r2');
  const re = simulate(darvas, ctx, { from: rows.length - 1, recordedAt: 'r2' }).state.signal;
  assert.ok(re, 'neue Version erkennt das Setup auf demselben Kursstand');
  linkReassessment(retired[0], re);
  assert.ok(isReassessment(re));
  assert.equal(re.createdAt, dataDate, 'Datum ist der Kursstand, nicht das Laufdatum');
  assert.equal(re.discovery.reassessment.originalDiscoveryDate, first.createdAt);
  assert.equal(re.discovery.reassessment.priceDataAsOf, dataDate);
  assert.equal(re.discovery.reassessment.previousVersion, '1.1.0');
  assert.equal(retired[0].retiredBy.successorId, re.id);
  assert.notEqual(re.id, first.id);
  assertAppendOnly(before, { open: [re], closed: [], invalidated: [retired[0]] });
  // Ein echtes neues Setup traegt dagegen NEW_SETUP.
  assert.equal(first.discovery.kind, 'NEW_SETUP');
});
