// Walk-forward über Trader-Muster × Faktoren (Stufe 7): Gegentests auf künstlichen Daten. Schreibt nichts ins Repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNALS } from './faktor-wf.mjs';
import { specs, neighborsOf, portfolioSeries, walkForward, report, GRID, SCORES, RULES, PATTERN_AT } from './trader-wf.mjs';

test('Raster: 240 Depots, zehn Muster-Stufen, Nachbarn im selben Muster mit genau einer anderen Einstellung', () => {
  const list = specs();
  assert.equal(list.length, 240);
  assert.deepEqual(GRID.pattern, ['NONE', 'MINERVINI', 'TURTLE', 'DARVAS', 'WEINSTEIN', 'KULLAMAEGI', 'POCKET', 'GAPUP', 'GRAIL', 'DARVASBOX']);
  assert.deepEqual(Object.keys(PATTERN_AT).length, 9);
  assert.deepEqual(GRID.n, [15, 25, 50]); assert.deepEqual(GRID.hold, ['NONE', 'BUFFER']);
  for (const parts of Object.values(SCORES)) for (const p of parts) assert.ok(SIGNALS.some((s) => s[0] === p), p);
  const n = neighborsOf(list), c = list.find((x) => x.pattern === 'MINERVINI' && x.score === 'mom_gpa' && x.n === 25 && x.hold === 'NONE');
  /* 3 andere Rangregeln + 2 benachbarte Titelzahlen + 1 anderes Halten */
  assert.equal(n[c.id].length, 6);
  assert.ok(n[c.id].every((k) => list[k].pattern === 'MINERVINI'));
  const edge = list.find((x) => x.pattern === 'NONE' && x.score === 'mom' && x.n === 15 && x.hold === 'NONE');
  assert.equal(n[edge.id].length, 5, '15 Titel hat nur einen Nachbarn in der Titelzahl');
  assert.deepEqual(RULES, { maxRank: 1000, minNames: 10, bufferFactor: 2, pBeat: 0.10 });
});

/* 60 Titel je Monat; fill(set, r, i, e) belegt Signale und Rendite. */
function fakeXs(n, fill, start = 2010) {
  const K = SIGNALS.length, col = (k) => SIGNALS.findIndex((s) => s[0] === k);
  return Array.from({ length: n }, (_, e) => {
    const P = new Float32Array(60 * K).fill(NaN), r = new Float64Array(60);
    for (let i = 0; i < 60; i++) fill((k, v) => { P[i * K + col(k)] = v; }, r, i, e);
    return { date: `${start + Math.floor(e / 12)}-${String((e % 12) + 1).padStart(2, '0')}-28`, s: Int32Array.from({ length: 60 }, (_, i) => i), r, adv: new Float64Array(60).fill(1e9),
      rank: Int32Array.from({ length: 60 }, (_, i) => i + 1), cap: new Float64Array(60).fill(1), K, P };
  });
}
const noFlags = (xs) => Object.fromEntries(Object.keys(PATTERN_AT).map((p) => [p, xs.map(() => new Uint8Array(60))]));

test('Haltepuffer: gehaltene Titel bleiben unter den besten 2N, ohne Puffer wird jeden Monat neu besetzt', () => {
  /* Rang wechselt monatlich zwischen zwei Ordnungen; die besten 15 der einen liegen in der anderen auf Platz 16..30 */
  const xs = fakeXs(4, (set, r, i, e) => { set('momentum12_1', e % 2 ? (i < 15 ? 0.7 + i / 1000 : i < 30 ? 0.9 + i / 1000 : 0.1) : (i < 15 ? 0.9 + i / 1000 : i < 30 ? 0.7 + i / 1000 : 0.1)); r[i] = 0.01; });
  const flags = noFlags(xs), base = { pattern: 'NONE', score: 'mom', n: 15 };
  const a = portfolioSeries(xs, flags, { ...base, hold: 'NONE' }), b = portfolioSeries(xs, flags, { ...base, hold: 'BUFFER' });
  assert.deepEqual(a.names, [15, 15, 15, 15]); assert.deepEqual(b.names, [15, 15, 15, 15]);
  assert.ok(Math.abs(a.turnover[1] - 2) < 1e-9, 'ohne Puffer: alle 15 raus, 15 neue rein');
  assert.ok(Math.abs(b.turnover[1]) < 1e-9, 'mit Puffer: alle 15 liegen noch unter den besten 30 und bleiben');
  assert.ok(b.net[1] > a.net[1], 'weniger Umschlag, weniger Kosten');
  /* fällt ein Titel aus den besten 2N, wird er ersetzt */
  const xs2 = fakeXs(2, (set, r, i, e) => { set('momentum12_1', e === 0 ? (i < 15 ? 0.9 : 0.1 + i / 1000) : (i < 15 ? 0.0001 * i : 0.5 + i / 1000)); r[i] = 0; });
  assert.ok(Math.abs(portfolioSeries(xs2, noFlags(xs2), { ...base, hold: 'BUFFER' }).turnover[1] - 2) < 1e-9);
});

test('Muster als Schranke, unter 10 Kandidaten Kasse', () => {
  const xs = fakeXs(2, (set, r, i) => { set('momentum12_1', i / 60); set('gpa', i / 60); r[i] = 0.02; });
  const flags = noFlags(xs); flags.TURTLE = xs.map(() => Uint8Array.from({ length: 60 }, (_, i) => (i < 20 ? 1 : 0))); flags.GRAIL = xs.map(() => Uint8Array.from({ length: 60 }, (_, i) => (i < 5 ? 1 : 0)));
  assert.equal(portfolioSeries(xs, flags, { pattern: 'TURTLE', score: 'mom_gpa', n: 25, hold: 'NONE' }).names[0], 20);
  assert.deepEqual(portfolioSeries(xs, flags, { pattern: 'GRAIL', score: 'mom_gpa', n: 25, hold: 'NONE' }).names, [0, 0]);
});

test('Walk-forward: ein eingebauter Vorteil wird aus den Lernjahren gefunden und hält; ohne Vorteil kein Urteil „schlägt“', () => {
  const months = 17 * 12, spy = new Array(months).fill(0.006), bench = { SPY: spy, QQQ: spy, RSP: spy };
  const build = (edge) => fakeXs(months, (set, r, i, e) => {
    set('momentum12_1', i / 60); set('gpa', i / 60); set('buyback', 0.5); set('rs6', 1 - i / 60);
    /* Titel mit hohem Punktwert UND Muster (40..59) laufen besser, mit leichter Schwankung */
    r[i] = 0.006 + (i >= 40 ? edge : 0) + ((e + i) % 2 ? 0.004 : -0.004);
  });
  const flagsOf = (xs) => { const f = noFlags(xs); f.MINERVINI = xs.map(() => Uint8Array.from({ length: 60 }, (_, i) => (i >= 20 ? 1 : 0))); return f; };
  const good = build(0.012), wf = walkForward(good, flagsOf(good), bench, { draws: 499 });
  assert.equal(wf.rounds.length, 4); assert.equal(wf.trials, 240);
  for (const r of wf.rounds) assert.ok(r.pickSpec && /mom/.test(r.pickSpec.score), r.pick);
  assert.ok(wf.selected.excessSpy > 0.05, JSON.stringify(wf.selected));
  assert.equal(wf.beats, true);
  assert.equal(wf.window[0].slice(0, 4), '2014');
  const flat = build(0), wf0 = walkForward(flat, flagsOf(flat), bench, { draws: 499 });
  assert.equal(wf0.beats, false);
  const md = report({ wf, smoke: true, data: { loaded: 60 }, dataFingerprint: 'test' });
  assert.match(md, /Stufe 7/); assert.match(md, /Schlägt SPY auf ungesehenen Jahren/); assert.match(md, /Rückschau zur Einordnung/); assert.doesNotMatch(md, /NaN|undefined/);
  assert.match(report({ wf: wf0, smoke: false, data: { loaded: 60 }, dataFingerprint: 'test' }), /Nicht belegt/);
});
