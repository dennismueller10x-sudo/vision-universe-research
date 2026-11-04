#!/usr/bin/env node
/* =========================================================================
   Universumstest der Abfrage-Engine (core/query-engine.js)

   Fuehrt einen festen, repraesentativen Satz von Abfragen ueber das echte
   Universum aus, einmal fuer /screener/ (screener/engine) und einmal fuer
   /technical/ (quant/engines/technical/technical-query.js und die
   Strategie-Vorlagen). Je Abfrage entsteht die Trefferliste in Ausgabe-
   reihenfolge samt Trichter, Zaehlern und Fehlern; ihr SHA-256 wird
   verglichen (byte-genau).

   Die Abfragen werden aus den Katalogen und den Daten erzeugt: jedes Feld,
   jeder Operator, jeder Zeitrahmen, jede Sortierung, dazu Randfaelle
   (leere Gruppen, ODER, Fehler, fehlende Werte, Ereignisfenster).

   Aufruf:
     node scripts/core/query-universe-snapshot.mjs \
       --screener <universe-US_REAL.json> [--technical technical/data/screener-v1.json] \
       [--queries <fixture.json>] [--impl <Wurzel der Implementierung>] [--ref <commit>] --out <datei.json>

   --queries  nimmt die Abfragen aus einer vorhandenen Momentaufnahme (statt
              sie neu zu erzeugen), damit alt und neu dieselben Abfragen rechnen.
   --impl     Verzeichnis, aus dem screener/engine, quant/engines/technical und
              technical/engine geladen werden (Standard: dieses Repository).
   --ref      Commit der Implementierung (nur als Vermerk in der Ausgabe).
   Schreibt nie in ein Produktionsartefakt; ohne --out keine Datei.
   ========================================================================= */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SNAPSHOT_SCHEMA = 'vu-query-universe-snapshot-1';

const sha = (s) => createHash('sha256').update(s).digest('hex');

function loadImpl(root) {
  const req = createRequire(join(root, 'package.json'));
  return {
    Fields: req(join(root, 'screener/engine/fields.js')),
    Query: req(join(root, 'screener/engine/query.js')),
    Engine: req(join(root, 'screener/engine/engine.js')),
    TQ: req(join(root, 'quant/engines/technical/technical-query.js')),
    TPL: req(join(root, 'technical/engine/templates.js'))
  };
}

/* ------------------------------------------------------------ Abfragen */
function quantiles(col) {
  const v = (col || []).filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (p) => v[Math.min(v.length - 1, Math.floor((v.length - 1) * p))];
  return { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9), min: v[0], max: v[v.length - 1] };
}
function topValues(col, k) {
  const c = new Map();
  for (const v of col || []) for (const x of Array.isArray(v) ? v : v === null || v === undefined ? [] : [v]) c.set(x, (c.get(x) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, k).map((e) => String(e[0]));
}

function screenerQueries(M, art) {
  const { Fields, Query } = M;
  const ds = M.Engine.createDataset(art);
  const out = [];
  let n = 0;
  const add = (id, q) => out.push({ id: 'sc:' + id, world: 'screener', query: q });
  const one = (filters, extra) => Object.assign({ v: 1, groups: [{ id: 'g1', op: 'AND', filters: filters.map((f) => Object.assign({ id: 'f' + (++n % 1e5).toString(36) }, f)) }] }, extra || {});
  for (const f of Fields.FIELDS) {
    if (!f.available) { add('unavailable:' + f.id, one([{ field: f.id, op: Fields.operatorsFor(f)[0], value: f.kind === 'enum' ? ['X'] : 1 }])); continue; }
    if (f.kind === 'number') {
      const q = quantiles(ds.column(f.id));
      if (!q) { add('empty:' + f.id, one([{ field: f.id, op: 'gt', value: 0 }])); continue; }
      add(f.id + ':gt', one([{ field: f.id, op: 'gt', value: q.p50 }], { sort: { field: 'marketCap', dir: 'desc' } }));
      add(f.id + ':gte', one([{ field: f.id, op: 'gte', value: q.p50 }]));
      add(f.id + ':lt', one([{ field: f.id, op: 'lt', value: q.p25 }]));
      add(f.id + ':lte', one([{ field: f.id, op: 'lte', value: q.p25 }]));
      add(f.id + ':between', one([{ field: f.id, op: 'between', value: q.p25, value2: q.p75 }]));
      add(f.id + ':between-rev', one([{ field: f.id, op: 'between', value: q.p90, value2: q.p10 }]));
      add(f.id + ':eq', one([{ field: f.id, op: 'eq', value: q.p50 }]));
      add(f.id + ':eq0', one([{ field: f.id, op: 'eq', value: 0 }]));
      add(f.id + ':string-value', one([{ field: f.id, op: 'gt', value: String(q.p75) }]));
    } else if (f.kind === 'bool') {
      add(f.id + ':true', one([{ field: f.id, op: 'is', value: true }]));
      add(f.id + ':false', one([{ field: f.id, op: 'is', value: false }]));
      add(f.id + ':str1', one([{ field: f.id, op: 'is', value: '1' }]));
    } else {
      const top = topValues(ds.column(f.id), 3);
      if (top.length) add(f.id + ':in1', one([{ field: f.id, op: 'in', value: [top[0]] }]));
      if (top.length > 1) add(f.id + ':in2', one([{ field: f.id, op: 'in', value: top.slice(0, 2) }]));
      add(f.id + ':unknown', one([{ field: f.id, op: 'in', value: ['ZZZ_UNKNOWN'] }]));
      add(f.id + ':dup', one([{ field: f.id, op: 'in', value: top.concat(top) }]));
    }
  }
  /* Sortierungen: jede erlaubte, beide Richtungen, ohne Filter (ganzes Universum). */
  const sortable = Query.SORTABLE.concat(Fields.FIELDS.filter((f) => f.available && f.kind === 'number' && Query.SORTABLE.indexOf(f.id) < 0).map((f) => f.id));
  for (const s of sortable) for (const dir of ['asc', 'desc']) {
    const extra = { sort: { field: s, dir } };
    if (s === 'match') extra.ranking = { enabled: true, weights: { momentum: 40, growth: 30, quality: 20, value: 10 } };
    add('sort:' + s + ':' + dir, one([], extra));
  }
  for (const w of [{ momentum: 100 }, { value: 100 }, { quality: 50, growth: 50 }, { momentum: 0, growth: 0, quality: 0, value: 0 }]) {
    add('rank:' + JSON.stringify(w), one([{ field: 'marketCap', op: 'gt', value: 1e9 }], { ranking: { enabled: true, weights: w }, sort: { field: 'match', dir: 'desc' } }));
  }
  add('rank-default-sort', one([{ field: 'sector', op: 'in', value: ['tech'] }], { ranking: { enabled: true } }));
  /* Zusammengesetzte Abfragen */
  const g = (id, op, filters, name) => ({ id, op, name, filters: filters.map((f) => Object.assign({ id: 'f' + (++n % 1e5).toString(36) }, f)) });
  const A = { field: 'marketCap', op: 'gt', value: 2e9 }, B = { field: 'sector', op: 'in', value: ['tech', 'health'] }, C = { field: 'rsi', op: 'lt', value: 40 },
    D = { field: 'revenueGrowth', op: 'gt', value: 0.15 }, E = { field: 'chartPattern', op: 'in', value: topValues(ds.column('chartPattern'), 4) },
    F = { field: 'newHigh52w', op: 'is', value: true }, G = { field: 'revenueCagr10', op: 'gt', value: 0.05 }, H = { field: 'pe', op: 'between', value: 5, value2: 25 };
  add('and-4', one([A, B, C, D]));
  add('or-group', { v: 1, mode: 'pro', groups: [g('g1', 'OR', [C, F, E])] });
  add('and-of-or', { v: 1, mode: 'pro', logic: 'AND', groups: [g('g1', 'AND', [A, B]), g('g2', 'OR', [C, F], 'Technik')] });
  add('or-of-and', { v: 1, mode: 'pro', logic: 'OR', groups: [g('g1', 'AND', [A, D]), g('g2', 'AND', [G, H]), g('g3', 'OR', [E])] });
  add('or-with-empty', { v: 1, mode: 'pro', logic: 'OR', groups: [g('g1', 'AND', []), g('g2', 'AND', [F])] });
  add('and-with-empty', { v: 1, mode: 'pro', logic: 'AND', groups: [g('g1', 'AND', [D]), g('g2', 'OR', [])] });
  add('missing-heavy', one([G, { field: 'chartPatternConfirmed', op: 'in', value: topValues(ds.column('chartPatternConfirmed'), 5) }, { field: 'tiStructure', op: 'in', value: topValues(ds.column('tiStructure'), 2) }]));
  add('zero-hits', one([{ field: 'marketCap', op: 'gt', value: 1e15 }]));
  add('empty', one([]));
  add('empty-groups-missing', { v: 1 });
  add('sort-name-filtered', one([B, A], { sort: { field: 'name', dir: 'asc' } }));
  add('sort-name-desc', one([D], { sort: { field: 'name', dir: 'desc' } }));
  add('sort-nonsortable-enum', one([], { sort: { field: 'sector', dir: 'asc' } }));
  add('sort-unknown', one([], { sort: { field: 'nope', dir: 'asc' } }));
  add('max-filters', one(Array.from({ length: 40 }, (_, i) => ({ field: 'marketCap', op: 'gt', value: i * 1e7 }))));
  add('too-many-filters', one(Array.from({ length: 41 }, () => A)));
  add('too-many-groups', { v: 1, groups: Array.from({ length: 7 }, (_, i) => g('g' + (i + 1), 'AND', [A])) });
  add('dup-group', { v: 1, groups: [g('g1', 'AND', [A]), g('g1', 'AND', [B])] });
  add('bad-version', { v: 2, groups: [] });
  add('bad-shape', null);
  add('unknown-field', one([{ field: 'nope', op: 'gt', value: 1 }]));
  add('bad-op', one([{ field: 'marketCap', op: 'in', value: [1] }]));
  add('bad-value', one([{ field: 'marketCap', op: 'gt', value: '' }]));
  add('bad-value2', one([{ field: 'marketCap', op: 'between', value: 1, value2: null }]));
  add('bad-enum', one([{ field: 'sector', op: 'in', value: [] }]));
  add('region-derived', one([{ field: 'region', op: 'in', value: ['NA', 'OTHER'] }, { field: 'ipoYear', op: 'between', value: 2000, value2: 2015 }]));
  return out;
}

function technicalQueries(M, art) {
  const { TQ, TPL } = M;
  const ds = TQ.createDataset(art);
  const out = [];
  const add = (id, q) => out.push({ id: 'tq:' + id, world: 'technical', query: q });
  const one = (tf, filters, extra) => Object.assign({ timeframe: tf, logic: 'AND', groups: [{ op: 'AND', filters }], limit: 500 }, extra || {});
  for (const f of TQ.FIELDS) {
    for (const tf of f.tfs) {
      const col = ds.column(TQ.columnKey(f.id, tf));
      const k = f.id + '@' + tf;
      if (f.kind === 'bool') {
        add(k + ':true', one(tf, [{ field: f.id, op: 'is', value: true }]));
        add(k + ':false', one(tf, [{ field: f.id, op: 'is', value: false }], { sort: { field: f.id, dir: 'asc' } }));
      } else if (f.kind === 'enum') {
        const top = topValues(col, 3).filter((v) => Object.prototype.hasOwnProperty.call(f.values, v));
        if (top.length) add(k + ':in1', one(tf, [{ field: f.id, op: 'in', value: [top[0]] }]));
        if (top.length > 1) add(k + ':in2', one(tf, [{ field: f.id, op: 'in', value: top.slice(0, 2) }]));
        if (top.length) add(k + ':nin', one(tf, [{ field: f.id, op: 'nin', value: [top[0]] }]));
        add(k + ':all-values', one(tf, [{ field: f.id, op: 'in', value: Object.keys(f.values) }]));
        if (f.legacyValues) add(k + ':legacy', one(tf, [{ field: f.id, op: 'in', value: Object.keys(f.legacyValues) }]));
      } else {
        const q = quantiles(col);
        if (!q) { add(k + ':empty', one(tf, [{ field: f.id, op: 'gt', value: 0 }])); continue; }
        add(k + ':gt', one(tf, [{ field: f.id, op: 'gt', value: q.p50 }], { sort: { field: f.id, dir: 'desc' } }));
        add(k + ':gte', one(tf, [{ field: f.id, op: 'gte', value: q.p50 }], { sort: { field: f.id, dir: 'asc' } }));
        add(k + ':lt', one(tf, [{ field: f.id, op: 'lt', value: q.p25 }]));
        add(k + ':lte', one(tf, [{ field: f.id, op: 'lte', value: q.p25 }]));
        add(k + ':between', one(tf, [{ field: f.id, op: 'between', value: q.p25, value2: q.p75 }]));
        if (f.window) {
          /* Ereignisfeld: Schwellen um das Pruefraum-Fenster W (leerer Wert + W = mindestens W Tage her). */
          const wq = quantiles(ds.column(tf === '1D' ? f.window : f.window + '@' + tf));
          const W = wq ? wq.p50 : 20;
          for (const a of [0, 1, 5, W - 1, W, W + 1, 400]) for (const op of ['lte', 'lt', 'gt', 'gte']) add(k + ':win:' + op + ':' + a, one(tf, [{ field: f.id, op, value: a }]));
          for (const [a, b] of [[0, 5], [2, W - 1], [0, W], [W, W + 50], [W + 1, 999]]) add(k + ':win:between:' + a + '-' + b, one(tf, [{ field: f.id, op: 'between', value: a, value2: b }]));
        }
      }
    }
  }
  /* Sortierungen: jedes nicht aufzaehlende Feld, beide Richtungen, ohne Filter. */
  for (const f of TQ.FIELDS) if (f.kind !== 'enum') for (const tf of f.tfs) for (const dir of ['asc', 'desc']) add('sort:' + f.id + '@' + tf + ':' + dir, one(tf, [], { sort: { field: f.id, dir } }));
  add('sort-none', one('1D', []));
  /* Vorlagen der Startseite */
  for (const p of TQ.PRESETS) add('preset:' + p.id, Object.assign({}, p.query, { limit: 500 }));
  /* Zusammengesetzte Abfragen und Randfaelle */
  const T = { field: 'aboveSma200', op: 'is', value: true }, R = { field: 'rsi14', op: 'lt', value: 35 }, X = { field: 'formationActive', op: 'in', value: ['BULL_FLAG', 'DOUBLE_BOTTOM', 'ASCENDING_TRIANGLE'] },
    V = { field: 'relVol', op: 'gt', value: 1.5 }, Ev = { field: 'goldenCrossDays', op: 'lte', value: 10 }, Cd = { field: 'candleBullish', op: 'in', value: ['hammer', 'engulfing'] };
  add('and-6', one('1D', [T, R, X, V, Ev, Cd], { limit: 50 }));
  add('or-group', { timeframe: '1D', logic: 'AND', groups: [{ op: 'OR', filters: [R, X, Ev, Cd] }], limit: 500 });
  add('and-of-or', { timeframe: '1D', logic: 'AND', groups: [{ op: 'AND', filters: [T] }, { op: 'OR', filters: [R, V, Cd] }], sort: { field: 'rsi14', dir: 'asc' }, limit: 500 });
  add('or-of-and', { timeframe: '1D', logic: 'OR', groups: [{ op: 'AND', filters: [T, V] }, { op: 'AND', filters: [R, Ev] }, { op: 'OR', filters: [X, Cd] }], limit: 500 });
  add('or-with-empty', { timeframe: '1D', logic: 'OR', groups: [{ op: 'AND', filters: [] }, { op: 'AND', filters: [V] }], limit: 500 });
  add('mtf-week-in-day', one('1D', [T, { field: 'aboveSma200', op: 'is', value: true, tf: '1W' }, { field: 'rsi14', op: 'gt', value: 50, tf: '1M' }]));
  add('mtf-day-in-week', one('1W', [{ field: 'macdPositive', op: 'is', value: true }, { field: 'chg1d', op: 'gt', value: 0, tf: '1D' }]));
  add('mtf-window-week', one('1D', [{ field: 'crossAboveSma200Days', op: 'lte', value: 3, tf: '1W' }]));
  add('tf-independent-1M', one('1M', [{ field: 'newHigh200w', op: 'is', value: false }, { field: 'distHigh200w', op: 'gt', value: -0.1 }], { sort: { field: 'distHigh200w', dir: 'desc' } }));
  /* Sortierung nach duenn belegten Feldern bei unterschiedlich vielen erfuellten Bedingungen (Gleichstand fehlender Werte) */
  for (const sf of ['goldenCrossDays', 'distHigh200w', 'rsRank', 'newHigh52wDays']) for (const dir of ['asc', 'desc']) {
    add('sort-sparse-or:' + sf + ':' + dir, { timeframe: '1D', logic: 'OR', groups: [{ op: 'OR', filters: [R, V, Cd, X, Ev] }, { op: 'AND', filters: [T, { field: 'rsi14', op: 'gt', value: 60 }] }], sort: { field: sf, dir }, limit: 500 });
  }
  add('limit-1', one('1D', [T], { limit: 1 }));
  add('limit-default', { timeframe: '1D', groups: [{ op: 'AND', filters: [T] }] });
  add('empty', { groups: [] });
  add('zero-hits', one('1D', [{ field: 'close', op: 'gt', value: 1e9 }]));
  add('stale-fresh', one('1D', [{ field: 'fresh', op: 'is', value: false }], { sort: { field: 'chg1d', dir: 'desc' } }));
  add('max-filters', one('1D', Array.from({ length: 30 }, (_, i) => ({ field: 'close', op: 'gt', value: i }))));
  /* Fehler */
  add('err:too-many-filters', one('1D', Array.from({ length: 31 }, () => T)));
  add('err:too-many-groups', { groups: Array.from({ length: 7 }, () => ({ op: 'AND', filters: [T] })) });
  add('err:timeframe', { timeframe: '1H', groups: [] });
  add('err:logic', { logic: 'XOR', groups: [] });
  add('err:groups', {});
  add('err:group-op', { groups: [{ op: 'NOT', filters: [T] }] });
  add('err:filters', { groups: [{ op: 'AND' }] });
  add('err:field', one('1D', [{ field: 'nope', op: 'is', value: true }]));
  add('err:field-tf', one('1W', [{ field: 'cci20', op: 'gt', value: 0 }]));
  add('err:filter-tf', one('1D', [{ field: 'rsi14', op: 'gt', value: 0, tf: '4H' }]));
  add('err:op', one('1D', [{ field: 'rsi14', op: 'eq', value: 50 }]));
  add('err:bool-value', one('1D', [{ field: 'aboveSma200', op: 'is', value: 'true' }]));
  add('err:enum-value', one('1D', [{ field: 'structure', op: 'in', value: ['NOPE'] }]));
  add('err:enum-empty', one('1D', [{ field: 'structure', op: 'in', value: [] }]));
  add('err:num-value', one('1D', [{ field: 'rsi14', op: 'gt', value: '50' }]));
  add('err:value2', one('1D', [{ field: 'rsi14', op: 'between', value: 50, value2: 40 }]));
  add('err:sort-enum', one('1D', [], { sort: { field: 'structure', dir: 'asc' } }));
  add('err:sort-tf', one('1W', [], { sort: { field: 'cci20', dir: 'asc' } }));
  add('err:limit', one('1D', [], { limit: 501 }));
  add('err:limit-frac', one('1D', [], { limit: 2.5 }));
  add('err:null', null);
  /* Strategie-Vorlagen (Praedikat derselben Engine) */
  for (const t of TPL.TEMPLATES) out.push({ id: 'tpl:' + t.id, world: 'template', query: { template: t.id } });
  return out;
}

/* ------------------------------------------------------------ Ausfuehren */
function runScreener(M, ds, raw) {
  let q;
  try { q = M.Query.validate(raw); } catch (e) { return { error: String(e.message) }; }
  const r = M.Engine.evaluate(ds, q);
  const order = M.Engine.sortIndices(ds, q, r.indices);
  return { count: r.count, universe: r.universe, hits: order.map((i) => ds.symbol(i)), funnel: r.funnel, perFilter: r.perFilter, groups: r.groups,
    why: order.slice(0, 3).map((i) => M.Engine.why(ds, q, i).map((g) => g.items.map((x) => [x.value, x.shown, x.pass]))) };
}
function runTechnical(M, ds, raw) {
  const r = M.TQ.evaluate(ds, raw);
  if (r.error) return { error: r.error, errors: r.errors };
  return { query: r.query, count: r.count, universe: r.universe, hits: r.indices.map((i) => ds.cols.s[i]), matched: r.indices.map((i) => r.matched[i]), funnel: r.funnel,
    describe: M.TQ.describe(raw) };
}
function runTemplate(M, ds, id) {
  const t = M.TPL.get ? M.TPL.get(id) : M.TPL.TEMPLATES.find((x) => x.id === id);
  const r = M.TPL.evaluate(ds, t);
  const rows = (list) => list.map((x) => [ds.cols.s[x.i], x.states.join('')]);
  return { full: rows(r.full), near: rows(r.near), incomplete: rows(r.incomplete), excluded: r.excluded, funnel: r.funnel };
}

export function snapshot({ screenerArtifact, technicalArtifact, queries, impl = ROOT, screenerSha = null, technicalSha = null, ref = null }) {
  const M = loadImpl(impl);
  const list = queries || [].concat(screenerArtifact ? screenerQueries(M, screenerArtifact) : [], technicalArtifact ? technicalQueries(M, technicalArtifact) : []);
  const sds = screenerArtifact ? M.Engine.createDataset(screenerArtifact) : null;
  if (sds && M.Fields.setDictionary) M.Fields.setDictionary(screenerArtifact.dict || null);
  const tds = technicalArtifact ? M.TQ.createDataset(technicalArtifact) : null;
  const results = [];
  for (const x of list) {
    let r;
    if (x.world === 'screener') { if (!sds) continue; r = runScreener(M, sds, x.query); }
    else if (x.world === 'technical') { if (!tds) continue; r = runTechnical(M, tds, x.query); }
    else { if (!tds) continue; r = runTemplate(M, tds, x.query.template); }
    const body = JSON.stringify(r);
    const hits = r.hits || r.full || [];
    results.push({ id: x.id, world: x.world, query: x.query, count: r.error ? null : r.count !== undefined ? r.count : r.full.length,
      error: r.error || null, head: hits.slice(0, 5), bytes: body.length, sha256: sha(body) });
  }
  return {
    schema: SNAPSHOT_SCHEMA,
    implementation: ref,
    inputs: {
      screener: screenerArtifact ? { sha256: screenerSha, asOf: screenerArtifact.asOf, size: screenerArtifact.cols.s.length } : null,
      technical: technicalArtifact ? { sha256: technicalSha, asOf: technicalArtifact.asOf, size: technicalArtifact.cols.s.length } : null
    },
    count: results.length,
    results
  };
}

function readArtifact(path) { const bytes = readFileSync(path); return { json: JSON.parse(bytes.toString('utf8')), sha256: sha(bytes) }; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : process.argv.find((a) => a.startsWith('--' + k + '='))?.slice(k.length + 3); };
  const sPath = arg('screener'), tPath = arg('technical') || join(ROOT, 'technical/data/screener-v1.json'), out = arg('out');
  if (!out) { console.error('--out fehlt (es wird nie in ein Produktionsartefakt geschrieben)'); process.exit(2); }
  const s = sPath ? readArtifact(sPath) : null, t = readArtifact(tPath);
  const queries = arg('queries') ? JSON.parse(readFileSync(arg('queries'), 'utf8')).results.map((r) => ({ id: r.id, world: r.world, query: r.query })) : null;
  const snap = snapshot({ screenerArtifact: s && s.json, screenerSha: s && s.sha256, technicalArtifact: t.json, technicalSha: t.sha256, queries, impl: resolve(arg('impl') || ROOT), ref: arg('ref') || null });
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(snap, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + '\n');
  const by = {}; for (const r of snap.results) by[r.world] = (by[r.world] || 0) + 1;
  console.log(`geschrieben: ${out} · ${snap.count} Abfragen (${Object.entries(by).map(([k, v]) => k + ' ' + v).join(', ')})`);
}
