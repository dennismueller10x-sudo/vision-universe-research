#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 7 – Walk-forward über Trader-Muster × Faktoren. Forschung, nicht zertifiziert.
 * Protokoll: docs/research/backtest2/PROTOKOLL.md §4i (vor dem ersten Lauf festgelegt). Daten wie Stufe 2 bis 6.
 *
 * Frage: Stufe 4 bis 6 haben einzelne feste Depots geprüft; die besten davon waren im Rückblick bekannt. Der saubere Test ist,
 * ob eine Auswahl, die NUR die Lernjahre kennt, auf den folgenden ungesehenen Jahren SPY nach Kosten schlägt (wie Stufe 3,
 * Fassung A). Nur das Ergebnis der verketteten Bestätigungsjahre zählt.
 *
 * Raster (vorab fest, 240 Depots):
 *   Muster   keines, Minervini, Turtle, Darvas, Weinstein (Stufe 5), Kullamägi, Pocket Pivot, Gap-Up, Holy Grail, Darvas-Kasten (Stufe 6)
 *   Rang     Momentum 12-1 · Momentum + Bruttogewinn/Bilanz · Momentum + Bruttogewinn/Bilanz + Rückkäufe · relative Stärke 6 Monate
 *   Titel    15 · 25 · 50
 *   Halten   ohne Puffer (jeden Monat die besten N) · mit Puffer (ein gehaltener Titel bleibt, solange er das Muster erfüllt
 *            und unter den besten 2N liegt; nur frei gewordene Plätze werden neu besetzt)
 * Monatsultimo, die 1.000 liquidesten Titel ≥ 5 $, gleich gewichtet, Kosten auf den Umschlag, Kasse 0 %, unter 10 Kandidaten Kasse.
 * Runden und Auswahlregel wie Stufe 3 (faktor-wf.mjs#ROUNDS, #selectRound): zugelassen sind Depots, die in den Lernjahren in
 * beiden Hälften und in mindestens 60 % der Jahre vor SPY lagen und höchstens 50 % verloren; gewählt wird der höchste Median
 * der Lern-Überrendite aus Depot und Nachbarn (gleiches Muster, genau eine Einstellung anders). Ohne Kandidat hält die Runde SPY.
 * Urteil „schlägt SPY“ nur, wenn die verketteten Bestätigungsjahre nach Kosten vor SPY liegen und der Block-Bootstrap p < 0,10 ergibt.
 *
 *   node scripts/research/backtest2/trader-wf.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { monthEnds, loadInputs, parseArgs } from './merkmale.mjs';
import { crossSections, windowStats, selectRound, ROUNDS } from './faktor-wf.mjs';
import { scoreOf } from './trader-faktor.mjs';
import { PATTERN_AT as FAMILY } from './trader-familie.mjs';
import { PATTERN_AT as EVENT } from './trader-ereignis.mjs';
import { sideBps } from './engine.mjs';
import { valueAt, bootstrapP } from './search.mjs';

export const VERSION = 'backtest2-trader-wf-1.0.0';
export const PATTERN_AT = Object.freeze({ ...FAMILY, ...EVENT });
export const SCORES = Object.freeze({ mom: ['momentum12_1'], mom_gpa: ['momentum12_1', 'gpa'], mom_gpa_buyback: ['momentum12_1', 'gpa', 'buyback'], rs: ['rs6'] });
export const GRID = Object.freeze({ pattern: ['NONE', ...Object.keys(PATTERN_AT)], score: Object.keys(SCORES), n: [15, 25, 50], hold: ['NONE', 'BUFFER'] });
export const RULES = Object.freeze({ maxRank: 1000, minNames: 10, bufferFactor: 2, pBeat: 0.10 });
const DIMS = ['score', 'n', 'hold'];
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const NAME = { NONE: 'kein Muster', MINERVINI: 'Trendvorlage (Minervini)', TURTLE: '55-Tage-Ausbruch (Turtle)', DARVAS: 'Zweijahreshoch (Darvas)', WEINSTEIN: 'Stufe 2 (Weinstein)', KULLAMAEGI: 'Ausbruchs-Setup (Kullamägi)', POCKET: 'Pocket Pivot', GAPUP: 'Gap-Up', GRAIL: 'Holy Grail', DARVASBOX: 'Darvas-Kasten' };
const SCORE_NAME = { mom: 'Momentum', mom_gpa: 'Momentum + Bruttogewinn/Bilanz', mom_gpa_buyback: 'Momentum + Bruttogewinn/Bilanz + Rückkäufe', rs: 'relative Stärke' };

export function specs(grid = GRID) {
  const out = [];
  for (const pattern of grid.pattern) for (const score of grid.score) for (const n of grid.n) for (const hold of grid.hold) out.push({ id: out.length, pattern, score, n, hold });
  return out;
}
/** Nachbarn: gleiches Muster, genau eine Einstellung anders (Titelzahl nur die benachbarte Stufe). */
export function neighborsOf(list, grid = GRID) {
  const key = (c) => [c.pattern, c.score, c.n, c.hold].join('|'), byKey = new Map(list.map((c) => [key(c), c.id]));
  return list.map((c) => DIMS.flatMap((d) => grid[d].filter((v) => v !== c[d] && (d !== 'n' || Math.abs(grid.n.indexOf(v) - grid.n.indexOf(c.n)) === 1)).map((v) => byKey.get(key({ ...c, [d]: v })))).filter((x) => x !== undefined));
}
export const specLabel = (c) => `${NAME[c.pattern]} · ${SCORE_NAME[c.score]} · ${c.n} Titel · ${c.hold === 'NONE' ? 'ohne Haltepuffer' : 'mit Haltepuffer'}`;

export function patternFlags(m, xs) {
  return Object.fromEntries(Object.keys(PATTERN_AT).map((p) => [p, xs.map((x) => Uint8Array.from(x.s, (s) => (PATTERN_AT[p](m, s, x.t) ? 1 : 0)))]));
}

/** Monatsreihe eines Depots nach Kosten; mit Haltepuffer bleiben gehaltene Titel, solange sie Kandidat unter den besten 2N sind. */
export function portfolioSeries(xs, flags, spec, rules = RULES) {
  const parts = SCORES[spec.score], net = [], names = [], turn = [];
  let prev = new Map();
  xs.forEach((x, e) => {
    const cand = [], f = spec.pattern === 'NONE' ? null : flags[spec.pattern][e];
    for (let r = 0; r < x.s.length; r++) {
      if (!(x.rank[r] <= rules.maxRank) || (f && !f[r])) continue;
      const v = scoreOf(x, r, parts); if (v === v) cand.push([v, r]);
    }
    cand.sort((a, b) => b[0] - a[0] || x.s[a[1]] - x.s[b[1]]);
    const w = new Map();
    if (cand.length >= rules.minNames) {
      const q = Math.min(spec.n, cand.length), pick = [];
      if (spec.hold === 'BUFFER') for (const [, r] of cand.slice(0, rules.bufferFactor * spec.n)) if (prev.has(x.s[r]) && pick.length < q) pick.push(r);
      for (const [, r] of cand) { if (pick.length >= q) break; if (!pick.includes(r)) pick.push(r); }
      for (const r of pick) w.set(x.s[r], [1 / q, x.r[r], x.adv[r]]);
    }
    let to = 0, cost = 0, ret = 0;
    for (const [s, [wt, r, adv]] of w) { const d = Math.abs(wt - (prev.get(s)?.[0] || 0)); to += d; cost += d * sideBps(adv) / 1e4; ret += wt * r; }
    for (const [s, [wt, , adv]] of prev) if (!w.has(s)) { to += wt; cost += wt * sideBps(adv) / 1e4; }
    net.push(ret - cost); names.push(w.size); turn.push(to); prev = w;
  });
  return { net, names, turnover: turn };
}

const ann = (rs) => { const v = rs.filter(isNum); return v.length ? Math.exp(v.reduce((a, r) => a + Math.log(1 + r), 0) / v.length * 12) - 1 : null; };
function maxDD(rs) { let e = 1, pk = 1, dd = 0; for (const r of rs) if (isNum(r)) { e *= 1 + r; pk = Math.max(pk, e); dd = Math.min(dd, e / pk - 1); } return dd; }

/** Walk-forward: je Runde Auswahl nur aus den Lernjahren, Bestätigungsmonate verkettet. */
export function walkForward(xs, flags, bench, { rounds = ROUNDS, list = specs(), draws = 4999 } = {}) {
  const months = xs.map((x) => x.date), series = list.map((c) => portfolioSeries(xs, flags, c)), nbrs = neighborsOf(list), spy = bench.SPY;
  const yr = (i) => +months[i].slice(0, 4), inYears = (a, b) => months.map((_, i) => i).filter((i) => yr(i) >= a && yr(i) <= b);
  const chain = [], chainIdx = [], out = { rounds: [] };
  for (const rd of rounds) {
    const li = inYears(...rd.learn), ci = inYears(...rd.confirm); if (!li.length || !ci.length) continue;
    const sel = selectRound(series, list, nbrs, spy, months, li), pick = sel.id === null ? spy : series[sel.id].net;
    for (const i of ci) { chain.push(pick[i]); chainIdx.push(i); }
    out.rounds.push({ learn: rd.learn, confirm: [rd.confirm[0], Math.min(rd.confirm[1], yr(ci.at(-1)))], qualified: sel.qualified,
      pick: sel.id === null ? 'kein Kandidat: SPY' : specLabel(list[sel.id]), pickSpec: sel.id === null ? null : list[sel.id], learnExcess: sel.learn ? sel.learn.excess : null,
      confirmStats: windowStats(pick, spy, months, ci) });
  }
  const on = (a) => chainIdx.map((i) => a[i]), years = [...new Set(chainIdx.map((i) => months[i].slice(0, 4)))];
  const summary = (net) => ({ cagr: ann(net), maxDrawdown: maxDD(net), excessSpy: ann(net) - ann(on(spy)), pBootstrap: bootstrapP(net.map((r, k) => r - spy[chainIdx[k]]), draws),
    yearsAheadSpy: years.filter((y) => { const k = chainIdx.map((i, n) => [i, n]).filter(([i]) => months[i].startsWith(y)); return ann(k.map(([, n]) => net[n])) > ann(k.map(([i]) => spy[i])); }).length, years: years.length });
  out.window = [months[chainIdx[0]], months[chainIdx.at(-1)]];
  out.benchmarks = Object.fromEntries(Object.entries(bench).map(([k, v]) => [k, { cagr: ann(on(v)), maxDrawdown: maxDD(on(v)) }]));
  out.selected = summary(chain);
  out.beats = !!(out.selected.excessSpy > 0 && isNum(out.selected.pBootstrap) && out.selected.pBootstrap < RULES.pBeat);
  /* Rückschau zur Einordnung (nicht auswählbar): alle Depots auf den Bestätigungsjahren, beste 15 und Anteil vor SPY. */
  const all = list.map((c) => ({ label: specLabel(c), spec: c, ...summary(on(series[c.id].net)), avgTurnover: on(series[c.id].turnover).reduce((a, b) => a + b, 0) / chainIdx.length, cashMonths: on(series[c.id].names).filter((n) => n === 0).length }));
  out.trials = list.length; out.aheadShare = all.filter((a) => a.excessSpy > 0).length / all.length;
  out.top = all.slice().sort((a, b) => b.excessSpy - a.excessSpy).slice(0, 15);
  out.byPattern = GRID.pattern.map((p) => { const g = all.filter((a) => a.spec.pattern === p); const ex = g.map((a) => a.excessSpy).sort((a, b) => a - b); return { pattern: NAME[p], medianExcess: ex[ex.length >> 1], ahead: g.filter((a) => a.excessSpy > 0).length, of: g.length }; });
  out.holdEffect = (() => { const d = []; for (const c of list) if (c.hold === 'BUFFER') { const o = list.find((x) => x.pattern === c.pattern && x.score === c.score && x.n === c.n && x.hold === 'NONE'); d.push(all[c.id].cagr - all[o.id].cagr); } d.sort((a, b) => a - b); return { medianCagrDiff: d[d.length >> 1], better: d.filter((x) => x > 0).length, of: d.length }; })();
  return out;
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');
const p3 = (x) => (x == null ? '–' : x.toFixed(3).replace('.', ','));

export function report(res) {
  const w = res.wf, b = w.benchmarks, s = w.selected;
  const L = ['# Walk-forward über Trader-Muster und Faktoren (Backtest 2.0, Stufe 7)' + (res.smoke ? ' – RAUCHTEST, kein Ergebnis' : ''), '',
    `**Forschung, nicht zertifiziert.** Nur für den Owner. Bestätigungsjahre ${w.window[0]} bis ${w.window[1]}, verkettet; ${w.trials} vorab festgelegte Depots; Kosten abgezogen; delistete Titel enthalten (${res.data.loaded} Titel geladen). Datenstand-Fingerabdruck \`${res.dataFingerprint}\`.`, '',
    `Vergleich auf denselben Monaten: SPY ${pct(b.SPY.cagr)} p. a. (max. Verlust ${pct(b.SPY.maxDrawdown)}), QQQ ${pct(b.QQQ.cagr)}, RSP ${pct(b.RSP.cagr)}.`, '',
    '## Urteil', '', `**${w.beats ? 'Schlägt SPY auf ungesehenen Jahren (Regel erfüllt).' : 'Nicht belegt: die vorab gesetzte Regel ist nicht erfüllt.'}** Auswahl nur aus den Lernjahren: ${pct(s.cagr)} p. a., ${pp(s.excessSpy)} gegen SPY, max. Verlust ${pct(s.maxDrawdown)}, ${s.yearsAheadSpy} von ${s.years} Jahren vorn, p ${p3(s.pBootstrap)}.`, '',
    '## Runden', '', '| Lernen | Bestätigen | zugelassen | gewählt | Lernen vs. SPY | Bestätigen | SPY |', '|---|---|---|---|---|---|---|'];
  for (const r of w.rounds) L.push(`| ${r.learn.join('–')} | ${r.confirm.join('–')} | ${r.qualified} | ${r.pick} | ${pp(r.learnExcess)} | ${pct(r.confirmStats?.cagr)} | ${pct(r.confirmStats?.spy)} |`);
  L.push('', `## Rückschau zur Einordnung (nicht auswählbar): ${Math.round(w.aheadShare * 100)} % der ${w.trials} Depots lagen auf den Bestätigungsjahren vor SPY`, '', '| Muster | Median vs. SPY | vor SPY |', '|---|---|---|');
  for (const p of w.byPattern) L.push(`| ${p.pattern} | ${pp(p.medianExcess)} | ${p.ahead} von ${p.of} |`);
  L.push('', `Haltepuffer gegen ohne Puffer (gleiche Einstellung sonst): Median ${pp(w.holdEffect.medianCagrDiff)} Rendite p. a., besser in ${w.holdEffect.better} von ${w.holdEffect.of} Paaren.`, '',
    '### Die 15 besten Depots der Rückschau', '', '| Depot | Rendite p. a. | vs. SPY | max. Verlust | Jahre vor SPY | p | Umschlag/Monat | Monate in Kasse |', '|---|---|---|---|---|---|---|---|');
  for (const t of w.top) L.push(`| ${t.label} | ${pct(t.cagr)} | ${pp(t.excessSpy)} | ${pct(t.maxDrawdown)} | ${t.yearsAheadSpy}/${t.years} | ${p3(t.pBootstrap)} | ${pct(t.avgTurnover)} | ${t.cashMonths} |`);
  L.push('', '## Lesehilfe', '',
    '- Das Urteil zählt nur für die Zeile „Auswahl nur aus den Lernjahren“: Die Regel wurde je Runde gewählt, ohne die Bestätigungsjahre zu kennen.',
    '- Die Rückschau zeigt, was im Nachhinein am besten war. Das beste von 240 Depots sieht immer gut aus; als Beleg taugt es nicht.',
    '- Geprüft wird die Auswahl der Aktien in monatlichen Depots, nicht die Ein- und Ausstiegsregeln der Methoden.');
  return L.join('\n') + '\n';
}

async function main() {
  const a = parseArgs(process.argv);
  const { m, bench, counts, diagnostics, bundleOf } = loadInputs(a);
  const xs = crossSections(m, bundleOf), flags = patternFlags(m, xs);
  const ends = monthEnds(m.dates).map((t) => m.dates[t]);
  const mret = (pts) => xs.map((x) => valueAt(pts, ends[ends.indexOf(x.date) + 1]) / valueAt(pts, x.date) - 1);
  const wf = walkForward(xs, flags, { SPY: mret(bench.SPY), QQQ: mret(bench.QQQ), RSP: mret(bench.RSP) });
  const res = { schema: VERSION, label: 'Forschung, nicht zertifiziert', smoke: !!a.smoke, data: counts, dataFingerprint: diagnostics.dataFingerprint, wf };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'trader-wf.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'TRADER-WALKFORWARD.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
