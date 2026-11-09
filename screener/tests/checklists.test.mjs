/* Checklisten (Konzept „Fundamental + Screener: Verstehen. Finden.“, PR 5, Entscheidung 4, Folie FX07):
   Qualität 8, Wachstum 6, Bewertung 5 Punkte als Screener-Vorlagen auf vorhandenen Spalten; Zählung im Browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Fields = require('../engine/fields.js');
const Query = require('../engine/query.js');
const Engine = require('../engine/engine.js');
const CK = require('../engine/checklists.js');
const V = require('../engine/vocab.js');
const UNIVERSE = new URL('../data/universe-US_REAL.json', import.meta.url);

test('drei Checklisten mit den Schwellen der Folie FX07', () => {
  assert.deepEqual(CK.CHECKLISTS.map((c) => [c.id, c.name, c.items.length]), [['qualitaet', 'Qualität', 8], ['wachstum', 'Wachstum', 6], ['bewertung', 'Bewertung', 5]]);
  const rules = Object.fromEntries(CK.CHECKLISTS.map((c) => [c.id, c.items.map((i) => [i.field, i.op, i.value, i.value2 === undefined ? null : i.value2])]));
  assert.deepEqual(rules.qualitaet, [['revenueCagr3', 'gte', 0.1, null], ['netMargin', 'gte', 0.1, null], ['fcfMargin', 'gte', 0.1, null], ['roic', 'gte', 0.15, null], ['netCash', 'gt', 0, null], ['cashConversion', 'gte', 0.8, null], ['marginExpansion', 'gte', 0, null], ['epsCagr3', 'gte', 0.1, null]]);
  assert.deepEqual(rules.wachstum, [['revenueGrowth', 'gte', 0.15, null], ['revenueCagr3', 'gte', 0.15, null], ['revenueCagr10', 'gte', 0.1, null], ['epsCagr3', 'gte', 0.15, null], ['fcfGrowth', 'gt', 0, null], ['marginExpansion', 'gte', 0, null]]);
  assert.deepEqual(rules.bewertung, [['pe', 'between', 0, 20], ['ps', 'lte', 3, null], ['pFcf', 'between', 0, 20], ['peg', 'between', 0, 1.5], ['evEbitda', 'between', 0, 12]]);
});

test('jeder Punkt ist ein vorhandenes Screener-Kriterium auf derselben Spalte – kein neues Daten-Artefakt', () => {
  for (const c of CK.CHECKLISTS) for (const it of c.items) {
    const f = Fields.field(it.field);
    assert.ok(f && f.available !== false, it.field);
    assert.equal(f.col, it.col, it.field + ' liest ' + f.col);
  }
});

test('Zählung: N von M Punkten, ohne Wert gilt ein Punkt als nicht erfüllt, Vielfache nur bei positivem Wert', () => {
  const q = CK.byId('bewertung');
  const r = CK.evaluate(q, (col) => ({ pe: 23.6, ps: 2.5, pFcf: -4, peg: 0.11, evEbitda: null })[col]);
  assert.deepEqual(r.rows.map((x) => x.pass), [false, true, false, true, null]);
  assert.equal(r.met, 2); assert.equal(r.of, 5); assert.equal(r.all, false);
  assert.equal(CK.test(q.items[0], 0), false, 'KGV 0 erfüllt „KGV ≤ 20“ nicht');
  assert.equal(CK.test(q.items[0], 20), true);
  assert.equal(CK.formatValue(CK.byId('qualitaet').items[6], 44.722), '+44,7 Pp.');
  assert.equal(CK.formatValue(CK.byId('qualitaet').items[0], 1.0005), '+100 % p. a.');
  assert.equal(CK.formatValue(CK.byId('qualitaet').items[4], 2137000000), '2,1 Mrd. $ netto');
});

test('Wortwahl: „erfüllt“, keine Gesamtnote, kein Urteil über den Kurs, keine fremden Score-Namen', () => {
  const src = readFileSync(new URL('../engine/checklists.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /Note|Score|Kaufen|Empfehlung|Check-?Score|Piotroski|Altman|Lynch|Graham|Buffett/i);
  for (const c of CK.CHECKLISTS) assert.ok(c.items.every((i) => !/kaufen|günstig|unterbewertet/i.test(i.label)), c.id);
});

test('Checklisten sind fertige Ideen im Screener (Screener-Vorlagen)', () => {
  for (const c of CK.CHECKLISTS) {
    const idea = V.IDEAS.filter((i) => i.id === 'checkliste-' + c.id)[0];
    assert.ok(idea, c.id);
    assert.equal(idea.title, 'Checkliste ' + c.name);
    assert.deepEqual(idea.fs, CK.filters(c));
    let q = Query.empty(); for (const f of idea.fs) q = Query.addFilter(q, f).query;
    assert.equal(Query.validate(q).groups[0].filters.length, idea.fs.length);
  }
  assert.equal(V.IDEAS.length, 8, 'Mockup: „Alle 8“');
});

test('dieselbe Zählung im Screener und in der Checkliste (echtes Universum, sofern lokal gebaut)', { skip: !existsSync(UNIVERSE) && 'screener/data fehlt (products/screener/producer/build-universe.mjs)' }, () => {
  const art = JSON.parse(readFileSync(UNIVERSE, 'utf8')), ds = Engine.createDataset(art), c = art.cols;
  for (const l of CK.CHECKLISTS) {
    let q = Query.empty(); for (const f of CK.filters(l)) q = Query.addFilter(q, f).query;
    const eng = new Set(Engine.evaluate(ds, q).indices.map((i) => ds.symbol(i)));
    const own = new Set(); for (let i = 0; i < c.s.length; i++) if (CK.evaluate(l, (col) => c[col][i]).all) own.add(c.s[i]);
    assert.deepEqual([...eng].sort(), [...own].sort(), l.id);
    assert.ok(own.size > 0, l.id + ' hat Treffer');
  }
});
