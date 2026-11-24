#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 10 – Laufen lassen im Walk-forward über Depotgröße, Ausstieg, Rang, Muster und Universum.
 * Forschung, nicht zertifiziert. Protokoll: docs/research/backtest2/PROTOKOLL.md §4l (vor dem ersten Lauf festgelegt).
 *
 * Anlass (Owner 24.11.2026): Stufe 9 hat acht feste Depots nach Einsicht gerechnet. Offen ist, ob eine Regel, die NUR aus den
 * Lernjahren gewählt wird, in den ungesehenen Jahren hält, und welcher Hebel (weniger Titel, anderer Ausstieg, engeres Universum)
 * die Rendite trägt.
 *
 * Gitter (216 Depots): Muster {keines, Trendvorlage, 55-Tage-Ausbruch} × Rang {Momentum, Momentum + Bruttogewinn/Bilanz,
 *   + Rückkäufe} × Plätze {10, 15, 25, 40} × Ausstieg {200-Tage-Linie, 25 % nachlaufend, beides} × Universum {500, 1.000}.
 * Auswahl nur aus den Lernjahren: Kennzahl eines Depots = Minimum aus (eigene Rendite ohne den größten Gewinner) und (Median der
 *   Rendite seiner Nachbarn, die sich in genau einer Dimension unterscheiden). Das Depot mit der höchsten Kennzahl wird gewählt.
 * Prüfung in den ungesehenen Jahren mit frischem Start: Rendite, Vorsprung zu SPY, ohne größten Gewinner, Bootstrap-p.
 *
 *   node scripts/research/backtest2/laufen-wf.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { monthEnds, loadInputs, parseArgs } from './merkmale.mjs';
import { crossSections, windowStats } from './faktor-wf.mjs';
import { patternFlags } from './trader-wf.mjs';
import { drift, R as R9 } from './laufen-lassen.mjs';
import { valueAt, bootstrapP } from './search.mjs';

export const VERSION = 'backtest2-laufen-wf-1.0.0';
export const DIMS = Object.freeze({ pattern: ['NONE', 'MINERVINI', 'TURTLE'], score: ['mom', 'mom_gpa', 'mom_gpa_buyback'], slots: [10, 15, 25, 40], exit: ['SMA200', 'TRAIL', 'BOTH'], universe: [500, 1000] });
export const RULES = Object.freeze({ fromYear: 2014, splitYear: 2020, pBeat: 0.10 });
const LABEL = { NONE: 'kein Muster', MINERVINI: 'Trendvorlage', TURTLE: '55-Tage-Ausbruch', mom: 'Momentum', mom_gpa: 'Momentum + Bruttogewinn/Bilanz', mom_gpa_buyback: 'Momentum + Bruttogewinn/Bilanz + Rückkäufe', SMA200: '200-Tage-Linie', TRAIL: '25 % nachlaufend', BOTH: 'Linie oder 25 %' };

export function grid() {
  const out = [];
  for (const pattern of DIMS.pattern) for (const score of DIMS.score) for (const slots of DIMS.slots) for (const exit of DIMS.exit) for (const universe of DIMS.universe)
    out.push({ id: [pattern, score, slots, exit, universe].join('|'), pattern, score, slots, exit, universe });
  return out;
}
export const labelOf = (g) => `${LABEL[g.pattern]} · ${LABEL[g.score]} · ${g.slots} Titel · Ausstieg ${LABEL[g.exit]} · Top ${g.universe}`;
/** Nachbarn: gleiche Werte in allen Dimensionen bis auf genau eine. */
export function neighborsOf(g, all) { const k = Object.keys(DIMS); return all.filter((h) => k.filter((d) => h[d] !== g[d]).length === 1); }
const median = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** Ein Depot auf einem Fenster (frischer Start), mit und ohne den Titel mit dem größten Gewinnbeitrag. */
export function runWindow(m, w, g, { draws = 0 } = {}) {
  const rules = { ...R9, slots: g.slots, maxRank: g.universe }, all = w.months.map((_, i) => i);
  const st = (run) => windowStats(run.net, w.spy, w.months, all);
  const run = drift(m, w.xs, w.flags, w.nextT, g, { rules }), by = new Map();
  for (const t of run.trades) by.set(t.s, (by.get(t.s) || 0) + (t.value - t.cost));
  const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  const without = top ? st(drift(m, w.xs, w.flags, w.nextT, g, { rules, exclude: new Set([top[0]]) })) : null, s = st(run);
  return { ...s, pBootstrap: draws ? bootstrapP(run.net.map((r, i) => r - w.spy[i]), draws) : null, top: top ? top[0] : null,
    withoutTop: without ? { cagr: without.cagr, excess: without.excess, maxDrawdown: without.maxDrawdown } : null,
    avgPositions: run.count.reduce((a, b) => a + b, 0) / run.count.length, trades: run.trades.length };
}

export function slice(xs, flags, nextT, spy, keep) {
  const idx = xs.map((_, i) => i).filter((i) => keep(+xs[i].date.slice(0, 4)));
  return { xs: idx.map((i) => xs[i]), flags: Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, idx.map((i) => v[i])])), nextT: idx.map((i) => nextT[i]), spy: idx.map((i) => spy[i]), months: idx.map((i) => xs[i].date) };
}

/** Auswahl aus einem Fenster: höchste Kennzahl = min(eigene Rendite ohne größten Gewinner, Median der Nachbarn). */
export function select(all, stats) {
  const by = new Map(all.map((g, i) => [g.id, stats[i]]));
  let best = null, bestKey = -Infinity;
  all.forEach((g, i) => {
    const own = stats[i]?.withoutTop?.cagr, nb = median(neighborsOf(g, all).map((h) => by.get(h.id)?.cagr));
    if (!Number.isFinite(own) || nb == null) return;
    const key = Math.min(own, nb);
    if (key > bestKey) { bestKey = key; best = i; }
  });
  return { index: best, key: bestKey };
}

export function walkForward(m, xs, flags, nextT, spy, { rules = RULES, draws = 4999, nameOf = (s) => String(s), gridList = grid() } = {}) {
  const full = slice(xs, flags, nextT, spy, (y) => y >= rules.fromYear), early = slice(xs, flags, nextT, spy, (y) => y >= rules.fromYear && y < rules.splitYear), late = slice(xs, flags, nextT, spy, (y) => y >= rules.splitYear);
  const sE = gridList.map((g) => runWindow(m, early, g)), sL = gridList.map((g) => runWindow(m, late, g)), sF = gridList.map((g) => runWindow(m, full, g));
  const fold = (name, learn, sLearn, testW, sTest) => {
    const pick = select(gridList, sLearn), g = gridList[pick.index], test = runWindow(m, testW, g, { draws });
    const pass = test.excess > 0 && test.withoutTop && test.withoutTop.excess > 0 && test.pBootstrap < rules.pBeat;
    return { name, learn: [learn.months[0], learn.months.at(-1)], test: [testW.months[0], testW.months.at(-1)], chosen: g.id, label: labelOf(g), key: pick.key,
      learnStats: sLearn[pick.index], testStats: { ...test, top: test.top == null ? null : nameOf(test.top) }, gridMedianExcessTest: median(sTest.map((s) => s?.excess)), pass };
  };
  const folds = [fold('A (zeitlich: lernen früh, prüfen spät)', early, sE, late, sL), fold('B (Gegenprobe: lernen spät, prüfen früh)', late, sL, early, sE)];
  const ok = (s) => s && s.excess > 0, okW = (s) => s && s.withoutTop && s.withoutTop.excess > 0;
  const both = gridList.filter((_, i) => ok(sE[i]) && ok(sL[i])).length, bothW = gridList.filter((_, i) => okW(sE[i]) && okW(sL[i])).length;
  const levers = Object.fromEntries(Object.entries(DIMS).map(([d, vals]) => [d, vals.map((v) => { const k = gridList.map((g, i) => (g[d] === v ? i : -1)).filter((i) => i >= 0);
    return { value: v, medianCagr: median(k.map((i) => sF[i]?.cagr)), medianWithoutTop: median(k.map((i) => sF[i]?.withoutTop?.cagr)), medianMaxDD: median(k.map((i) => sF[i]?.maxDrawdown)), aheadBothHalves: k.filter((i) => okW(sE[i]) && okW(sL[i])).length, n: k.length }; })]));
  const topFull = gridList.map((g, i) => ({ label: labelOf(g), ...sF[i], early: sE[i]?.excess, late: sL[i]?.excess, top: sF[i]?.top == null ? null : nameOf(sF[i].top) }))
    .filter((r) => Number.isFinite(r.withoutTop?.cagr)).sort((a, b) => b.withoutTop.cagr - a.withoutTop.cagr).slice(0, 12);
  return { window: [full.months[0], full.months.at(-1)], spy: { full: sF[0]?.spy, early: sE[0]?.spy, late: sL[0]?.spy }, depots: gridList.length, folds, aheadBothHalves: both, aheadBothHalvesWithoutTop: bothW, levers, topFull, proven: folds[0].pass };
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');
const p3 = (x) => (x == null ? '–' : x.toFixed(3).replace('.', ','));

export function report(res) {
  const e = res.result;
  const L = ['# Laufen lassen im Walk-forward (Backtest 2.0, Stufe 10)' + (res.smoke ? ' – RAUCHTEST, kein Ergebnis' : ''), '',
    `**Forschung, nicht zertifiziert.** Nur für den Owner. ${e.window[0]} bis ${e.window[1]}; Kosten abgezogen; delistete Titel enthalten. ${e.depots} Depots. Datenstand-Fingerabdruck \`${res.dataFingerprint}\`.`, '',
    `SPY: gesamt ${pct(e.spy.full)} p. a., frühe Jahre ${pct(e.spy.early)}, späte Jahre ${pct(e.spy.late)}.`, '',
    `**Urteil: ${e.proven ? 'BELEGT nach der vorab festgelegten Regel (Runde A)' : 'nicht belegt (Runde A)'}.**`, '',
    '## Auswahl aus den Lernjahren, Prüfung in den ungesehenen Jahren', '',
    '| Runde | gewähltes Depot | Lernjahre: Rendite / ohne größten Gewinner | Prüfjahre | Rendite | vs. SPY | ohne größten Gewinner | max. Verlust | p | Median aller Depots vs. SPY | bestanden |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const f of e.folds) L.push(`| ${f.name} | ${f.label} | ${pct(f.learnStats.cagr)} / ${pct(f.learnStats.withoutTop?.cagr)} | ${f.test[0].slice(0, 7)} bis ${f.test[1].slice(0, 7)} | ${pct(f.testStats.cagr)} | ${pp(f.testStats.excess)} | ${pct(f.testStats.withoutTop?.cagr)} (${pp(f.testStats.withoutTop?.excess)}, ohne ${f.testStats.top}) | ${pct(f.testStats.maxDrawdown)} | ${p3(f.testStats.pBootstrap)} | ${pp(f.gridMedianExcessTest)} | ${f.pass ? 'ja' : 'nein'} |`);
  L.push('', `Von ${e.depots} Depots lagen ${e.aheadBothHalves} in beiden Hälften vor SPY, ${e.aheadBothHalvesWithoutTop} auch ohne ihren jeweils größten Gewinner.`, '',
    '## Welcher Hebel trägt? (Median über alle Depots mit diesem Wert, ganzer Zeitraum)', '',
    '| Hebel | Wert | Rendite p. a. | ohne größten Gewinner | max. Verlust | in beiden Hälften vor SPY (ohne größten Gewinner) |', '|---|---|---|---|---|---|');
  const DN = { pattern: 'Muster', score: 'Rang', slots: 'Titel', exit: 'Ausstieg', universe: 'Universum' };
  for (const [d, rows] of Object.entries(e.levers)) for (const r of rows) L.push(`| ${DN[d]} | ${LABEL[r.value] || r.value} | ${pct(r.medianCagr)} | ${pct(r.medianWithoutTop)} | ${pct(r.medianMaxDD)} | ${r.aheadBothHalves}/${r.n} |`);
  L.push('', '## Rückschau: die zwölf besten Depots nach Rendite ohne größten Gewinner (nicht als Beleg lesbar)', '',
    '| Depot | Rendite p. a. | vs. SPY | ohne größten Gewinner | max. Verlust | früh vs. SPY | spät vs. SPY |', '|---|---|---|---|---|---|---|');
  for (const r of e.topFull) L.push(`| ${r.label} | ${pct(r.cagr)} | ${pp(r.excess)} | ${pct(r.withoutTop.cagr)} (ohne ${r.top}) | ${pct(r.maxDrawdown)} | ${pp(r.early)} | ${pp(r.late)} |`);
  L.push('', '## Lesehilfe', '',
    '- Runde A ist die zeitlich richtige Probe: die Regel wurde nur mit Daten bis 2019 gewählt und dann auf 2020 bis heute angewandt. Runde B ist eine Gegenprobe in umgekehrter Richtung.',
    '- „Median aller Depots“ zeigt, was ein beliebiges Depot des Gitters im Prüfzeitraum brachte. Liegt das gewählte Depot nicht darüber, hat die Auswahl nichts geleistet.',
    '- Die Rückschau-Tabelle ist die Bestenliste im Nachhinein. Aus 216 Versuchen sieht der beste immer gut aus.');
  return L.join('\n') + '\n';
}

async function main() {
  const a = parseArgs(process.argv);
  const { m, bench, diagnostics, bundleOf } = loadInputs(a);
  const xs = crossSections(m, bundleOf), flags = patternFlags(m, xs);
  const endsT = monthEnds(m.dates), ends = endsT.map((t) => m.dates[t]);
  const nextT = xs.map((x) => endsT[ends.indexOf(x.date) + 1]);
  const spy = xs.map((x) => valueAt(bench.SPY, ends[ends.indexOf(x.date) + 1]) / valueAt(bench.SPY, x.date) - 1);
  const result = walkForward(m, xs, flags, nextT, spy, { nameOf: (s) => String(m.ids[s]).replace(/^ref_/, '') });
  const res = { schema: VERSION, label: 'Forschung, nicht zertifiziert', smoke: !!a.smoke, dataFingerprint: diagnostics.dataFingerprint, result };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'laufen-wf.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'LAUFEN-WF.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
