// Owner-Linie 05.11.2026 (L2): öffentliche Signale ohne Order-, Stopp- und Ergebnisgrößen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicSignals, publicSignal, orderMarksIn, DROP_SIGNAL_KEYS } from '../public-signals.mjs';
import { signalsCore, signalsBySymbol } from '../build.mjs';

const RAW = JSON.parse(fs.readFileSync(new URL('../../../supertrader/data/signals.json', import.meta.url), 'utf8'));

test('PS-1: die öffentliche Sicht trägt keine Trigger-, Stopp-, Einstiegs-, Ausstiegs- oder Ergebnisgröße', () => {
  const pub = publicSignals(RAW);
  assert.deepEqual(orderMarksIn(pub), []);
  const txt = JSON.stringify(pub.strategies);
  assert.doesNotMatch(txt, /"(trigger|invalidation|stopPlan|stopHistory|levelHistory|initialStop|rMultiple|returnPct|distanceToTrigger)"/);
  assert.deepEqual(orderMarksIn(signalsCore(pub)), []);
  for (const slice of Object.values(signalsBySymbol(pub))) assert.deepEqual(orderMarksIn(slice), []);
});

test('PS-2: Zustand, Datum, Regeln und Identität bleiben; Zahl der Einträge unverändert', () => {
  const pub = publicSignals(RAW);
  for (const [id, st] of Object.entries(RAW.strategies)) for (const k of ['open', 'closed', 'invalidated', 'retired']) {
    if (!Array.isArray(st[k])) continue;
    assert.equal(pub.strategies[id][k].length, st[k].length, `${id}.${k}`);
    st[k].forEach((x, i) => { const y = pub.strategies[id][k][i]; for (const f of ['id', 'symbol', 'state', 'createdAt', 'rules', 'discovery']) assert.deepEqual(y[f], x[f], `${id}.${k}[${i}].${f}`); });
  }
  assert.deepEqual(pub.bySymbol, RAW.bySymbol);
  assert.equal(pub.asOf, RAW.asOf);
});

test('PS-3: Einzelfall – Übergänge ohne Preis, Bestätigung nur mit Datum, Plan und Auftrag entfallen', () => {
  const x = { id: 'X', state: 'ACTIVE', levels: { trigger: 10 }, plan: { stop: 9 }, entry: { price: 10 }, stop: 9, exits: [{ price: 12 }], order: { kind: 'SELL' }, result: { rMultiple: 2 },
    facts: { distanceToTrigger: 0.01, momentumPercentile: 99 }, transitions: [{ state: 'TRIGGERED', date: '2026-11-01', price: 10, trigger: 10, ruleId: 'R' }], confirmation: { date: '2026-10-31', close: 9.9 } };
  const y = publicSignal(x);
  for (const k of DROP_SIGNAL_KEYS) assert.ok(!(k in y), k);
  assert.deepEqual(y.facts, { momentumPercentile: 99 });
  assert.deepEqual(y.transitions, [{ state: 'TRIGGERED', date: '2026-11-01', ruleId: 'R' }]);
  assert.deepEqual(y.confirmation, { date: '2026-10-31' });
  assert.equal(x.levels.trigger, 10, 'Eingabe unverändert (Ledger behält den Zustand)');
});

test('PS-4: der Erzeuger schreibt signals.json, signals-core.json, Ausschnitte und Seiten aus der öffentlichen Sicht', () => {
  const src = fs.readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
  assert.match(src, /const pub = publicSignalsLagged\(signals\);\s*writeJson\(path\.join\(DATA, 'signals\.json'\), pub\)/);
  assert.match(src, /signalsCore\(pub\)/); assert.match(src, /signalsBySymbol\(pub,/);
});

test('PS-5 (L3): öffentlich keine Positionen und kein Rein/Raus vor 365 Tagen; Setups ohne Einstieg bleiben', async () => {
  const M = await import('../public-signals.mjs');
  const asOf = '2026-11-04', cutoff = M.lagCutoff(asOf);
  assert.equal(cutoff, '2025-11-04');
  const sig = { asOf, strategies: { X: { open: [{ id: 'a', state: 'SETUP' }, { id: 'b', state: 'ACTIVE', entry: { date: '2026-10-01', price: 5 } }], closed: [{ id: 'c', state: 'CLOSED', entry: { date: '2024-01-02' }, transitions: [{ state: 'CLOSED', date: '2024-02-01', price: 6 }] }, { id: 'd', state: 'CLOSED', entry: { date: '2026-10-02' }, transitions: [{ state: 'CLOSED', date: '2026-10-20' }] }], invalidated: [], retired: [] } },
    bySymbol: { A: [{ strategyId: 'X', id: 'a', state: 'SETUP' }], B: [{ strategyId: 'X', id: 'b', state: 'ACTIVE' }], D: [{ strategyId: 'X', id: 'd', state: 'CLOSED' }] } };
  const p = M.publicSignalsLagged(sig);
  assert.deepEqual(p.strategies.X.open.map((x) => x.id), ['a']);
  assert.deepEqual(p.strategies.X.closed.map((x) => x.id), ['c']);
  assert.equal(p.strategies.X.closedTotal, 2);
  assert.deepEqual(Object.keys(p.bySymbol), ['A']);
  assert.doesNotMatch(JSON.stringify(p), /"price"/);
  const pf = M.publicPortfolio({ asOf, strategies: { X: { positions: [{ symbol: 'Q', entryPrice: 3 }], openCount: 1, closed: [{ symbol: 'R', entryDate: '2024-01-02', exitDate: '2024-03-01', returnPct: 0.1 }, { symbol: 'S', exitDate: '2026-10-30' }], notTaken: [{ symbol: 'T', entryDate: '2026-10-20' }] } } });
  assert.deepEqual(pf.strategies.X.positions, []); assert.equal(pf.strategies.X.openCount, 1);
  assert.deepEqual(pf.strategies.X.closed.map((c) => c.symbol), ['R']); assert.ok(!('returnPct' in pf.strategies.X.closed[0]));
  assert.deepEqual(pf.strategies.X.notTaken, []);
  const t = M.publicTrend52({ asOf, portfolio: { slots: 10, used: 10, positions: [{ symbol: 'XNCR', entryPrice: 30 }] }, prepared: { candidates: [{ symbol: 'P', rank: 1, score: 1, wouldGetSlot: true }] }, decisions: [{ date: '2026-10-30', buys: ['XNCR'], sells: [] }], executions: [{ date: '2026-11-02', symbol: 'XNCR', side: 'BUY', price: 30 }], closed: [], notTaken: [] });
  assert.doesNotMatch(JSON.stringify(t), /XNCR|wouldGetSlot|"price"|entryPrice/);
  assert.equal(t.portfolio.used, 10);
});

test('PS-6 (L3): privater Zustand – einmalige Übernahme, danach nur privat; fehlt er nach der Umstellung: Abbruch', async () => {
  const P = await import('../private-state.mjs');
  const full = { schema: 'supertrader-ledger-1.0.0', open: [] }, pub = { schema: 'supertrader-ledger-public-1.0.0' };
  assert.deepEqual(P.resolveLedger('X', full, pub), { ledger: full, source: 'PRIVATE' });
  assert.deepEqual(P.resolveLedger('X', null, full), { ledger: full, source: 'MIGRATED_FROM_REPOSITORY' });
  assert.throws(() => P.resolveLedger('X', null, pub), /fail closed/);
  assert.deepEqual(P.resolveLedger('X', null, null), { ledger: null, source: 'NEW' });
  assert.ok(!P.ledgerIds().includes('VU_HOUSE_HS4_V03'), 'Hausstrategie hat ihren eigenen privaten Ledger');
  const w = fs.readFileSync(new URL('../../../.github/workflows/supertrader-signals.yml', import.meta.url), 'utf8');
  const i = (x) => w.indexOf(x);
  assert.ok(i('private-state.mjs pull') > 0 && i('private-state.mjs pull') < i('scripts/supertrader/build.mjs') && i('scripts/supertrader/build.mjs') < i('private-state.mjs push') && i('private-state.mjs push') < i('commit-and-push.sh'), 'holen -> bauen -> testen -> sichern -> committen');
  const src = fs.readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
  assert.match(src, /GITHUB_ACTIONS === 'true' && OUT === path\.resolve\(ROOT, 'supertrader'\)\) throw new Error\('SUPERTRADER_LEDGER_DIR fehlt/);
});
