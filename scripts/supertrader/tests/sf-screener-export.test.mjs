// Supertrader – Export der veröffentlichten Kandidaten als Screener-Kriterien (Plan §7 Z5). Liest nur den committeten Stand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as X from '../source-faithful/product/screener-export.mjs';

const INDEX = JSON.parse(fs.readFileSync(new URL('../../../supertrader/data/sf-candidates/index.json', import.meta.url), 'utf8'));

test('SF-SCREENER-1: echter Stand -> Spalten je Ticker; jede Kandidatenzeile wiederzufinden; nur veröffentlichte Stufen', () => {
  const r = X.screenerColumns(INDEX);
  assert.equal(r.meta.asOf, INDEX.asOf);
  assert.equal(r.meta.candidates, INDEX.candidates.length);
  assert.equal(r.meta.label, 'Research, keine Empfehlung');
  assert.equal(r.criteria.methods.length, 13);
  assert.deepEqual(r.criteria.methods.filter((m) => m.v1).map((m) => m.id).sort(), ['C01', 'C02', 'C03', 'C08', 'C12']);
  for (const c of INDEX.candidates) {
    const x = r.byTicker.get(c.t);
    assert.ok(x && x.methods.includes(c.c), `${c.t} ${c.c}`);
    assert.ok(X.STAGE_ORDER.indexOf(x.stage) >= X.STAGE_ORDER.indexOf(c.s));
  }
  for (const x of r.byTicker.values()) {
    assert.deepEqual([...x.v1, ...x.research].sort(), x.methods);
    assert.ok(x.v1.every((m) => X.V1_METHODS.includes(m)) && x.research.every((m) => !X.V1_METHODS.includes(m)));
  }
  assert.ok(!JSON.stringify([...r.byTicker.values()]).includes('VALIDATED_TRADE_SIGNAL'));
});

test('SF-SCREENER-2: fail closed bei falschem Schema, offenem Freigabestatus, unbekannter Methode oder Stufe', () => {
  const base = { ...INDEX, candidates: INDEX.candidates.slice(0, 3) };
  assert.throws(() => X.screenerColumns({ ...base, schema: 'x' }), /SF_SCREENER_EXPORT_SCHEMA/);
  assert.throws(() => X.screenerColumns({ ...base, status: { ...base.status, validatedTradeSignal: 'OPEN' } }), /SF_SCREENER_EXPORT_STATUS/);
  assert.throws(() => X.screenerColumns({ ...base, candidates: [{ ...base.candidates[0], c: 'C99' }] }), /UNKNOWN_METHOD/);
  assert.throws(() => X.screenerColumns({ ...base, candidates: [{ ...base.candidates[0], s: 'VALIDATED_TRADE_SIGNAL' }] }), /SF_SCREENER_EXPORT_STAGE/);
});

test('SF-SCREENER-3: höchste Stufe je Ticker und je Methode', () => {
  const s = INDEX.strategies.slice(0, 2).map((x) => x.candidateId);
  const idx = { ...INDEX, candidates: [{ c: s[0], t: 'ZZZ', s: 'CHART_CANDIDATE' }, { c: s[1], t: 'ZZZ', s: 'MODELED_TRADE_PLAN' }, { c: s[0], t: 'ZZZ', s: 'CONFIRMED_RESEARCH_SETUP' }] };
  const x = X.screenerColumns(idx).byTicker.get('ZZZ');
  assert.equal(x.stage, 'MODELED_TRADE_PLAN');
  assert.deepEqual(x.stageByMethod, { [s[0]]: 'CONFIRMED_RESEARCH_SETUP', [s[1]]: 'MODELED_TRADE_PLAN' });
  assert.deepEqual(x.methods, [...s].sort());
});
