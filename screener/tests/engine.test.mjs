import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Fields = require('../engine/fields.js');
const Query = require('../engine/query.js');
const Engine = require('../engine/engine.js');
const Store = require('../engine/store.js');
const Adapters = require('../engine/adapters.js');

// Kleines, vollstaendig kontrolliertes Universum.
function fixture() {
  const rows = [
    { s: 'AAA', n: 'Alpha', sec: 'tech', mcap: 5e8, revGrowth: 0.4, distSma200: 0.1, dist52wH: -0.02, rsi14: 60, pe: 30, idx: ['NDX'], ipo: '2021-05-01' },
    { s: 'BBB', n: 'Beta', sec: 'tech', mcap: 2e9, revGrowth: 0.1, distSma200: -0.05, dist52wH: -0.2, rsi14: 45, pe: 12, idx: null, ipo: '1999-01-04' },
    { s: 'CCC', n: 'Gamma', sec: 'health', mcap: 8e8, revGrowth: null, distSma200: 0.2, dist52wH: -0.01, rsi14: 75, pe: null, idx: ['SP500'], ipo: null },
    { s: 'DDD', n: 'Delta', sec: null, mcap: null, revGrowth: 0.25, distSma200: 0.05, dist52wH: -0.04, rsi14: 55, pe: 20, idx: null, ipo: '2015-02-02' }
  ];
  const cols = {};
  const all = ['s', 'n', 'ex', 'co', 'cls', 'sec', 'sic2', 'div', 'ipo', 'idx', 'was', 'mcap', 'revGrowth', 'distSma200', 'dist52wH', 'rsi14', 'pe', 'perf6m', 'perf1y', 'rsPct', 'revCagr3', 'epsGrowth', 'grossMargin', 'fcfMargin', 'roe', 'roic', 'ps', 'evEbitda', 'fcfYield'];
  for (const c of all) cols[c] = rows.map((r) => (c in r ? r[c] : c === 'co' ? 'US' : null));
  return Engine.createDataset({ schema: 'vu-screener-universe-1.0.0', cols, dict: { sectors: { tech: 'Technologie', health: 'Gesundheit' } } });
}

function q(filters, extra = {}) {
  return Query.validate({ v: 1, groups: [{ id: 'g1', op: 'AND', filters }], ...extra });
}

test('Registry: jedes verfuegbare Feld hat Spalte, Gruppe und Beschreibung; unverfuegbare haben einen Grund', () => {
  for (const f of Fields.FIELDS) {
    assert.ok(Fields.group(f.group), f.id);
    if (f.available) { assert.ok(f.col, f.id + ' ohne Spalte'); assert.ok(f.desc, f.id + ' ohne Beschreibung'); }
    else assert.ok(f.reason, f.id + ' ohne Grund');
  }
  assert.equal(new Set(Fields.FIELDS.map((f) => f.id)).size, Fields.FIELDS.length);
});

test('Suche findet Kriterien ueber Zahl, englischen Namen und Kuerzel', () => {
  const ids = (s) => Fields.search(s, { mode: 'pro' }).map((f) => f.id);
  assert.ok(ids('200').includes('priceVsSma200'));
  assert.ok(ids('200').includes('sma50VsSma200'));
  const rev = ids('revenue');
  for (const id of ['revenueGrowth', 'revenueCagr3', 'forwardRevenueGrowth']) assert.ok(rev.includes(id), id);
  assert.equal(ids('ROIC')[0], 'roic');
  assert.ok(!Fields.search('peg', { mode: 'simple' }).some((f) => f.id === 'peg'), 'Pro-Feld im Einfach-Modus');
});

test('Filter: UND-Logik, fehlende Werte erfuellen nichts, Trichter zaehlt Verluste', () => {
  const ds = fixture();
  const query = q([
    { field: 'sector', op: 'in', value: ['tech', 'health'] },
    { field: 'marketCap', op: 'lt', value: 1e9 },
    { field: 'priceVsSma200', op: 'gt', value: 0 }
  ]);
  const r = Engine.evaluate(ds, query);
  assert.deepEqual(r.indices.map((i) => ds.symbol(i)), ['AAA', 'CCC']);
  assert.deepEqual(r.funnel.map((s) => s.count), [4, 3, 2, 2]);
  assert.equal(r.funnel[1].missing, 1); // DDD ohne Sektor
  assert.equal(r.perFilter[query.groups[0].filters[1].id].pass, 2);
});

test('Gruppen: ODER innerhalb, UND zwischen; ODER zwischen Gruppen', () => {
  const ds = fixture();
  let query = Query.validate({ v: 1, groups: [
    { id: 'g1', op: 'OR', filters: [{ field: 'revenueGrowth', op: 'gt', value: 0.3 }, { field: 'pe', op: 'lt', value: 15 }] },
    { id: 'g2', op: 'AND', filters: [{ field: 'rsi', op: 'lt', value: 70 }] }] });
  assert.equal(query.mode, 'pro');
  assert.deepEqual(Engine.evaluate(ds, query).indices.map((i) => ds.symbol(i)), ['AAA', 'BBB']);
  query = { ...query, logic: 'OR' };
  const r = Engine.evaluate(ds, Query.validate(query));
  assert.equal(r.count, 3); // AAA, BBB (g1) + DDD (g2)
  assert.equal(r.funnel.at(-1).kind, 'union');
});

test('Why Match nennt jede Bedingung mit gemessenem Wert', () => {
  const ds = fixture();
  const query = q([{ field: 'marketCap', op: 'lt', value: 1e9 }, { field: 'distance52wHigh', op: 'gt', value: -0.05 }]);
  const w = Engine.why(ds, query, ds.indexOf('AAA'))[0].items;
  assert.equal(w.length, 2);
  assert.ok(w.every((x) => x.pass === true));
  assert.equal(w[0].shown, '500 Mio. $');
  assert.equal(w[1].shown, '−2 %');
  const miss = Engine.why(ds, q([{ field: 'revenueGrowth', op: 'gt', value: 0 }]), ds.indexOf('CCC'))[0].items[0];
  assert.equal(miss.pass, null); assert.equal(miss.shown, 'Keine Daten');
});

test('URL: Hin- und Rueckweg ist verlustfrei, ungueltige Links werden abgelehnt', () => {
  let query = q([{ field: 'sector', op: 'in', value: ['tech'] }, { field: 'marketCap', op: 'between', value: 3e8, value2: 1e9 }, { field: 'newHigh52w', op: 'is', value: true }]);
  query = Query.addGroup(query, 'Technik');
  query = Query.addFilter(query, { field: 'rsi', op: 'lt', value: 70 }, 'g2').query;
  query.groups[1].op = 'OR';
  query.ranking = { enabled: true, weights: { momentum: 40, growth: 30, quality: 20, value: 10 } };
  query.sort = { field: 'match', dir: 'desc' };
  const params = Query.toParams(query);
  const back = Query.fromParams(params.toString());
  assert.equal(Query.key(back), Query.key(query));
  assert.equal(back.groups[1].name, 'Technik');
  assert.throws(() => Query.fromParams('f=unknown:gt:1'), /unknown-field/);
  assert.throws(() => Query.fromParams('f=marketCap:gt:abc'), /value/);
  assert.throws(() => Query.fromParams('f=forwardPe:lt:20'), /unavailable/);
});

test('Ranking: Match ist gewichtetes Mittel von Universums-Perzentilen und bleibt 0-100', () => {
  const ds = fixture();
  const query = q([], { ranking: { enabled: true, weights: { momentum: 0, growth: 100, quality: 0, value: 0 } }, sort: { field: 'match', dir: 'desc' } });
  const order = Engine.sortIndices(ds, query, [0, 1, 2, 3]).map((i) => ds.symbol(i));
  assert.equal(order[0], 'AAA'); // hoechstes Umsatzwachstum
  assert.equal(order.at(-1), 'CCC'); // ohne Wachstumsdaten -> kein Match, ans Ende
  const m = Engine.match(ds, query, ds.indexOf('AAA'));
  assert.ok(m.score >= 0 && m.score <= 100);
  assert.equal(Engine.match(ds, query, ds.indexOf('CCC')).score, null);
});

test('Sortierung: fehlende Werte stehen immer hinten', () => {
  const ds = fixture();
  for (const dir of ['asc', 'desc']) {
    const o = Engine.sortIndices(ds, q([], { sort: { field: 'pe', dir } }), [0, 1, 2, 3]).map((i) => ds.symbol(i));
    assert.equal(o.at(-1), 'CCC');
  }
});

test('Adaptive Karten folgen dem Fokus des Screens', () => {
  assert.equal(Engine.focus(q([{ field: 'perf6m', op: 'gt', value: 0 }, { field: 'priceVsSma200', op: 'gt', value: 0 }])), 'momentum');
  assert.equal(Engine.focus(q([{ field: 'pe', op: 'lt', value: 15 }])), 'value');
  const m = Engine.cardMetrics(q([{ field: 'roic', op: 'gt', value: 0.1 }]));
  assert.equal(m[0], 'roic'); assert.equal(m.length, 4);
});

test('Histogramm und Enum-Optionen stammen aus dem Universum', () => {
  const ds = fixture();
  const h = Engine.histogram(ds, 'rsi', 10);
  assert.equal(h.total, 4); assert.equal(h.bins.reduce((a, b) => a + b.count, 0), 4);
  const o = Engine.enumOptions(ds, 'sector');
  assert.deepEqual(o.map((x) => [x.value, x.count]), [['tech', 2], ['health', 1]]);
  assert.equal(o[0].label, 'Technologie');
  assert.deepEqual(Engine.enumOptions(ds, 'index').map((x) => x.value).sort(), ['NDX', 'SP500']);
});

test('Chartbild-Felder: Enum-Filter, deutsche Etiketten, Elliott als experimentell gekennzeichnet', () => {
  const cols = { s: ['AAA', 'BBB', 'CCC'], n: ['A', 'B', 'C'], co: ['US', 'US', 'US'], ipo: [null, null, null],
    tiOut: ['BULLISH', 'BEARISH', null], tiStr: ['CORRECTION_IN_UPTREND', 'DOWNTREND_ADVANCING', null], tiEw: ['LOW', 'HIGH', null] };
  const ds = Engine.createDataset({ schema: 'vu-screener-universe-1.0.0', cols });
  const r = Engine.evaluate(ds, q([{ field: 'tiOutlook', op: 'in', value: ['BULLISH'] }, { field: 'tiStructure', op: 'in', value: ['CORRECTION_IN_UPTREND'] }]));
  assert.deepEqual(r.indices, [0]);
  assert.deepEqual(Object.values(r.perFilter).map((p) => p.missing), [1, 1]); // fehlendes Chartbild erfuellt nichts
  assert.equal(Fields.enumLabel('tiOutlook', 'BULLISH'), 'Aufwärts');
  assert.equal(Fields.enumLabel('tiStructure', 'CORRECTION_IN_UPTREND'), 'Rücksetzer im Aufwärtstrend');
  assert.deepEqual(Engine.enumOptions(ds, 'tiElliottApplicable').map((x) => x.value).sort(), ['HIGH', 'LOW']);
  const ew = Fields.field('tiElliottApplicable');
  assert.equal(ew.group, 'technical');
  assert.match(ew.desc, /Experimentell/); assert.match(ew.desc, /keine Prognose/); assert.match(ew.desc, /keine belastbare Zählung/);
  for (const id of ['tiOutlook', 'tiStructure', 'tiElliottApplicable']) {
    const f = Fields.field(id);
    assert.doesNotMatch(f.desc + ' ' + f.label, /kaufen|verkaufen|Kaufsignal|Wahrscheinlichkeit von/i, id);
  }
  // Ohne Chartbild-Spalten (aelteres Artefakt) ist das Kriterium nicht auswaehlbar statt leer
  assert.equal(Engine.isAvailable(fixture(), 'tiOutlook'), false);
});

test('Monitoring: Diff und Laeufe nur bei neuem Datenstand', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  const store = Store.create(storage);
  const s = store.save({ name: 'Tech Small Caps', query: q([]) });
  store.recordRun(s.id, { asOf: '2026-09-24', count: 3, symbols: ['A', 'B', 'C'] });
  store.recordRun(s.id, { asOf: '2026-09-24', count: 3, symbols: ['A', 'B', 'C'] });
  assert.equal(store.get(s.id).runs.length, 1);
  store.recordRun(s.id, { asOf: '2026-09-25', count: 3, symbols: ['B', 'C', 'D'] });
  const [a, b] = store.get(s.id).runs;
  assert.deepEqual(Engine.diff(a.symbols, b.symbols), { added: ['D'], removed: ['A'], unchanged: ['B', 'C'] });
  assert.equal(store.setNotify(s.id, { newMatches: true, active: true }).notify.active, false);
  assert.throws(() => store.save({ name: ' ', query: q([]) }), /NAME_REQUIRED/);
  store.remember({ key: 'k1', label: 'x', count: 1 }); store.remember({ key: 'k1', label: 'y', count: 2 });
  assert.equal(store.history().length, 1);
  assert.equal(Store.relativeDay('2026-09-24T10:00:00Z', '2026-09-28T10:00:00Z'), 'Vor 4 Tagen');
});

test('Formatierung: deutsche Zahlen, Vorzeichen, Einheiten', () => {
  assert.equal(Fields.format('marketCap', 742e6), '742 Mio. $');
  assert.equal(Fields.format('revenueGrowth', 0.48), '+48 %');
  assert.equal(Fields.format('grossMargin', 0.703), '70 %');
  assert.equal(Fields.format('pe', 18.24), '18,2');
  assert.equal(Fields.format('pe', null), '–');
  assert.equal(Fields.fromInput(Fields.field('revenueGrowth'), '20'), 0.2);
  assert.equal(Fields.fromInput(Fields.field('marketCap'), '1,5', 'Mrd. $'), 1.5e9);
  assert.equal(Fields.describeFilter({ field: 'priceVsSma200', op: 'gt', value: 0 }), 'Kurs über SMA200');
});

test('Static-Adapter paginiert wie der Server-Vertrag', async () => {
  const ds = fixture();
  const artifact = { ...ds.meta, schema: 'vu-screener-universe-1.0.0', universeId: 'US_REAL', asOf: '2026-09-25' };
  const a = Adapters.StaticUniverseAdapter({ fetchJson: async () => artifact });
  const r = await a.screen(q([], { sort: { field: 'marketCap', dir: 'desc' } }), { offset: 1, limit: 2 });
  assert.equal(r.total, 4); assert.equal(r.rows.length, 2); assert.equal(r.rows[0].symbol, 'CCC'); assert.equal(r.order.length, 4);
  await assert.rejects(Adapters.RemoteScreenerAdapter({}).screen(q([])), /REMOTE_NOT_CONFIGURED/);
});
