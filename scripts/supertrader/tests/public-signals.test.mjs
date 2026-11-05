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
  assert.match(src, /const pub = publicSignals\(signals\);\s*writeJson\(path\.join\(DATA, 'signals\.json'\), pub\)/);
  assert.match(src, /signalsCore\(pub\)/); assert.match(src, /signalsBySymbol\(pub,/);
});
