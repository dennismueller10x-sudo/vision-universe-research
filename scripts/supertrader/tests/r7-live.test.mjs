// Runde 7: Live-Betrieb nach Versionswechsel, Modellportfolio, Methodentreue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../engine/simulator.mjs';
import { applyVersionPolicy, LIVE_ENGINES, PREVIOUS_ENGINES } from '../build.mjs';
import { buildModelPortfolio } from '../model-portfolio.mjs';
import { fidelityFor, FIDELITY } from '../fidelity.mjs';
import { STRATEGIES } from '../registry.mjs';
import kk1 from '../engine/strategies/kk-breakout.mjs';
import kk2 from '../engine/strategies/kk-breakout-v2.mjs';
import { computeIndicators } from '../engine/indicators.mjs';

function bars(n, f) {
  const date = [], open = [], high = [], low = [], close = [], volume = [];
  for (let i = 0; i < n; i++) { const d = new Date(Date.UTC(2026, 0, 5 + i)); date.push(d.toISOString().slice(0, 10)); const c = f(i); open.push(c); high.push(c * 1.01); low.push(c * 0.99); close.push(c); volume.push(1e6); }
  return { date, open, high, low, close, volume };
}

test('R7-L1 Altposition läuft nach ihrer Regelversion (manageOnly); ohne Position wird nichts gesucht', () => {
  const b = bars(40, (i) => (i < 30 ? 100 + i * 0.1 : 90)); // Einbruch ab Tag 30
  const ctx = { symbol: 'X', bars: b, ind: computeIndicators(b), cross: {} };
  const sig = { id: 'MOMENTUM_BREAKOUT:X:old:v1.1.0', strategyId: 'MOMENTUM_BREAKOUT', version: '1.1.0', state: 'ACTIVE', symbol: 'X', transitions: [{ state: 'ACTIVE', date: b.date[20] }],
    entry: { date: b.date[20], index: 20, price: 102 }, stop: 95, initialStop: 95, stopRuleId: 'KK-BO-STOP-D1', stopHistory: [], remaining: 1, exits: [], levels: { trigger: 101 }, heldSessions: 5, partialDone: true };
  const state = { signal: sig, cooldownUntil: -1 };
  const res = simulate(kk2.legacy['1.1.0'], ctx, { state, from: 21, to: 39, manageOnly: true });
  assert.equal(res.finished.length, 1, 'Position abgeschlossen');
  assert.ok(res.finished[0].transitions.every((t) => !t.ruleVersion || t.ruleVersion === '1.1.0'), 'Protokoll unter 1.1.0');
  assert.equal(state.signal, null);
  const empty = simulate(kk2, ctx, { state: { signal: null, cooldownUntil: -1 }, from: 0, to: 39, manageOnly: true });
  assert.equal(empty.finished.length, 0);
});

test('R7-L2 Versionswechsel: wartende Setups werden abgelöst, Positionen der Vorversion bleiben', () => {
  const pending = { id: 'p', version: '1.1.0', state: 'SETUP', transitions: [] };
  const pos = { id: 'q', version: '1.1.0', state: 'ACTIVE', entry: { date: '2026-09-30' }, transitions: [] };
  const { open, retired } = applyVersionPolicy(kk2, [pending, pos], '2026-10-01', null);
  assert.deepEqual(open.map((x) => x.id), ['q']);
  assert.equal(retired[0].transitions.at(-1).ruleId, 'LC-VERSION-RETIRED');
  assert.throws(() => applyVersionPolicy({ ...kk2, legacy: {} }, [{ ...pos, transitions: [] }], '2026-10-01', null), /keine kompatible Positionsführung/);
  for (const e of LIVE_ENGINES.filter((x) => x.version === '2.0.0')) assert.ok(PREVIOUS_ENGINES.some((p) => p.id === e.id && e.legacy[p.version] === p), e.id + ': Vorversion als Legacy registriert');
  assert.ok(kk1.version === '1.1.0');
});

test('R7-L3 Modellportfolio: Größe aus Risiko/Stop, Höchstzahl, nicht übernommene Einstiege, keine Gesamtrendite', () => {
  const cal = ['2026-09-29', '2026-09-30', '2026-10-01'];
  const mk = (sym, price, stop) => ({ id: 'S:' + sym, symbol: sym, version: '2.0.0', state: 'ACTIVE', entry: { date: '2026-09-30', price }, initialStop: stop, stop, exits: [] });
  const engine = { id: 'S', version: '2.0.0', portfolio: { riskPerTrade: 0.01, maxPositionPct: 0.2, maxPositions: 2 } };
  const signals = [mk('AAA', 100, 95), mk('BBB', 50, 45), mk('CCC', 20, 19)];
  const barsOf = () => ({ date: cal, close: [100, 100, 100] });
  const mp = buildModelPortfolio({ engine, signals, barsOf, calendar: cal, asOf: '2026-10-01' });
  assert.equal(mp.positions.length, 2);
  assert.deepEqual(mp.notTaken.map((x) => [x.symbol, x.reason]), [['CCC', 'MAX_POSITIONS']], 'alphabetisch, dritter ohne Platz');
  const a = mp.positions.find((p) => p.symbol === 'AAA');
  assert.ok(Math.abs(a.initialWeightPct - 0.2) < 1e-3, '1 % Risiko / 5 % Stop = 20 %, Kappung 20 %');
  assert.ok(Math.abs(a.initialRiskPct - 0.01) < 1e-3);
  assert.ok(mp.cashPct >= 0 && mp.cashPct <= 1);
  const keys = JSON.stringify(mp);
  for (const k of ['cagr', 'totalReturn', 'equityCurve', 'maxDrawdown', 'excess']) assert.ok(!keys.includes(k), 'keine Gesamtkennzahl: ' + k);
  assert.match(mp.publication, /nicht veröffentlicht/);
});

test('R7-L4 Methodentreue: keine Methode gilt als quellentreu; Kernbefunde stehen in der Matrix', () => {
  for (const s of STRATEGIES.filter((x) => x.mode === 'LIVE')) assert.equal(fidelityFor(s.strategy_id).status, 'VU_VARIANT', s.strategy_id);
  assert.ok(!Object.values(FIDELITY).some((f) => f.status === 'SOURCE_FAITHFUL'));
  assert.equal(fidelityFor('CANSLIM').status, 'PARTIAL_CHECK');
  assert.equal(fidelityFor('PIOTROSKI_F').status, 'PARTIAL_CHECK');
  assert.equal(fidelityFor('GREENBLATT_VALUE').status, 'RESEARCH');
  const minExit = FIDELITY.MINERVINI_VCP.rules.filter((r) => r.area === 'Ausstieg');
  assert.ok(minExit.every((r) => r.cls !== 'ORIGINAL'), 'Minervini-Ausstieg nie als Originalregel');
  assert.ok(FIDELITY.MOMENTUM_BREAKOUT.rules.some((r) => /Umsetzungsfehler in 1\.1\.0/.test(r.note || '')));
  assert.ok(FIDELITY.WEINSTEIN_STAGE.rules.some((r) => r.cls === 'UNBACKED' && /1\.1\.0/.test(r.code)));
  for (const f of Object.values(FIDELITY)) for (const r of f.rules) assert.ok(r.source && r.code && r.access && r.cls, JSON.stringify(r));
});

test('R7-L5 Live-Versionen und Registry stimmen überein; Evidenz der Version 2.0.0 öffentlich nur „In Prüfung“', async () => {
  const { evidenceFor } = await import('../evidence.mjs');
  for (const e of LIVE_ENGINES) {
    const s = STRATEGIES.find((x) => x.strategy_id === e.id);
    assert.equal(s.strategy_version, e.version, e.id);
    const ev = evidenceFor(s);
    assert.equal(ev.version, e.version); assert.equal(ev.level, 'IN_REVIEW');
  }
});
