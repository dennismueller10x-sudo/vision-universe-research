#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 3 – Faktor-Depots im Walk-forward. Forschung, nicht zertifiziert.
 * Protokoll: docs/research/backtest2/PROTOKOLL.md (Stufe 3). Daten wie die Merkmals-Studie (merkmale.mjs#loadInputs).
 *
 * Frage: Hätte eine Auswahl aus Merkmalen (Kurs und Geschäftszahlen, wie damals eingereicht), NUR auf vergangenen Jahren
 * gewählt, auf den folgenden ungesehenen Jahren einen S&P-500-ETF (SPY, Gesamtrendite) nach Kosten geschlagen?
 *
 *  - Monatsultimo: Universum wie Stufe 2 (1.000 liquideste Titel ≥ 5 $, heutige und delistete); Rang je Signal.
 *  - Raster (vorab festgelegt, 512 Depots): Signal (32) × bestes Zehntel/Fünftel × Top 500/1.000 × gleich/nach Börsenwert
 *    gewichtet × ohne/mit Marktfilter (SPY über 200-Tage-Linie, sonst Kasse ohne Zins).
 *  - Kosten: Umschlag (Summe der Gewichtsänderungen) × Kosten je Seite (engine.mjs#sideBps, gewichtet).
 *  - Fassung A (Auswahl aus den Lernjahren): je Runde nur Depots, die in den Lernjahren in beiden Hälften und in ≥ 60 %
 *    der Jahre vor SPY lagen und höchstens 50 % verloren; davon das mit dem höchsten Median der Lern-Überrendite aus sich
 *    und seinen Nachbarn (eine Einstellung anders). Kein Kandidat: SPY halten.
 *  - Fassung B (Hypothese vor 2014 veröffentlicht: Momentum, Jegadeesh/Titman 1993; Bruttogewinn je Bilanzsumme,
 *    Novy-Marx 2013): Momentum + Bruttogewinn/Bilanz, bestes Fünftel, Top 1.000, gleich gewichtet, ohne Filter – fest.
 *  - Vergleich: Näherung des heutigen Quant-Scores (quant-v2.4.1, Gewichte und verfügbare Bausteine, ohne Revisionen).
 *
 *   node scripts/research/backtest2/faktor-wf.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { FEATURES, COMBOS, monthEnds, priceFeatures, fundamentalFeatures, forwardReturn, pctRank, loadInputs, parseArgs, UNIVERSE, START_YEAR } from './merkmale.mjs';
import { sideBps } from './engine.mjs';
import { valueAt, bootstrapP } from './search.mjs';

export const WF_VERSION = 'backtest2-faktor-wf-1.0.0';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Näherung des Quant-Scores quant-v2.4.1 aus den Merkmalen der Studie: Faktorgewichte wie im Vertrag, je Faktor nur die
 *  Bausteine, die hier vorliegen (Gewichte renormiert); Revisionen fehlen (keine PIT-Schätzungen). */
export const QUANT_APPROX = Object.freeze({
  momentum: [0.25, [['momentum12_1', 0.375], ['rs6', 0.25], ['high52', 0.125], ['sma200', 0.125]]],
  quality: [0.10, [['accrualsLow', 0.25], ['equityToAssets', 0.15]]],
  growth: [0.15, [['revenueCagr3y', 0.3], ['revenueGrowthYoy', 0.15]]],
  value: [0.15, [['fcfYield', 0.3], ['earningsYield', 0.25], ['bookToPrice', 0.15]]],
  profitability: [0.15, [['roe', 0.25], ['gpa', 0.2], ['netMargin', 0.15], ['fcfMargin', 0.15]]],
  risk: [0.05, [['lowVol', 0.35]]],
});
export const EXTRA = Object.freeze([
  ['quantApprox', 'Quant-Score heute (Näherung, ohne Revisionen)', null],
  ['combo_trend_gpa', 'Über 200-Tage-Linie + Bruttogewinn/Bilanz', ['sma200', 'gpa']],
  ['combo_high52_gpa', 'Nähe 52-Wochen-Hoch + Bruttogewinn/Bilanz', ['high52', 'gpa']],
]);
export const SIGNALS = Object.freeze([...FEATURES.map((f) => [f[0], f[1]]), ...COMBOS.map((c) => [c[0], c[1]]), ...EXTRA.map((e) => [e[0], e[1]])]);
export const GRID = Object.freeze({ signal: SIGNALS.map((s) => s[0]), top: [0.1, 0.2], maxRank: [500, 1000], weight: ['EW', 'CAP'], filter: ['NONE', 'SPY200'] });
export const HYPOTHESIS = Object.freeze({ signal: 'combo_mom_gpa', top: 0.2, maxRank: 1000, weight: 'EW', filter: 'NONE' });
export const ROUNDS = Object.freeze([
  { learn: [2010, 2013], confirm: [2014, 2016] }, { learn: [2010, 2016], confirm: [2017, 2019] },
  { learn: [2010, 2019], confirm: [2020, 2022] }, { learn: [2010, 2022], confirm: [2023, 9999] },
]);
export const RULES = Object.freeze({ minYearShare: 0.6, maxLearnDrawdown: -0.5, minNames: 10 });

export function specs(grid = GRID) {
  const out = [];
  for (const signal of grid.signal) for (const top of grid.top) for (const maxRank of grid.maxRank) for (const weight of grid.weight) for (const filter of grid.filter) out.push({ id: out.length, signal, top, maxRank, weight, filter });
  return out;
}
const DIMS = ['top', 'maxRank', 'weight', 'filter'];
/** Nachbarn: gleiches Signal, genau eine andere Einstellung. */
export function neighborsOf(list) {
  const key = (c) => [c.signal, c.top, c.maxRank, c.weight, c.filter].join('|'), byKey = new Map(list.map((c) => [key(c), c.id]));
  return list.map((c) => DIMS.flatMap((d) => GRID[d].filter((v) => v !== c[d]).map((v) => byKey.get(key({ ...c, [d]: v })))).filter((x) => x !== undefined));
}
export const specLabel = (c) => `${SIGNALS.find((s) => s[0] === c.signal)[1]} · bestes ${c.top === 0.1 ? 'Zehntel' : 'Fünftel'} · Top ${c.maxRank} · ${c.weight === 'EW' ? 'gleich gewichtet' : 'nach Börsenwert'} · ${c.filter === 'NONE' ? 'ohne Marktfilter' : 'Marktfilter SPY 200 Tage'}`;

/** Querschnitte je Monat: Titel, Rendite bis zum nächsten Ultimo, Rang, Börsenwert, Perzentile je Signal (NaN = fehlt). */
export function crossSections(m, bundleOf, { from = START_YEAR, universe = UNIVERSE } = {}) {
  const ends = monthEnds(m.dates, from), K = SIGNALS.length, out = [];
  const featIdx = Object.fromEntries(FEATURES.map((f, i) => [f[0], i]));
  for (let e = 0; e + 1 < ends.length; e++) {
    const t = ends[e], tn = ends[e + 1], date = m.dates[t], rows = [];
    for (let s = 0; s < m.S; s++) {
      const i = s * m.T + t;
      if (!(m.rank[i] <= universe.maxRank && m.rc[i] >= universe.minPrice)) continue;
      const r = forwardReturn(m, s, t, tn); if (!isNum(r)) continue;
      const pf = priceFeatures(m, s, t), ff = fundamentalFeatures(bundleOf(s), date, m.rc[i]);
      rows.push({ s, r, adv: m.adv[i], rank: m.rank[i], ...(pf || {}), ...(ff || {}) });
    }
    if (rows.length < 50) continue;
    const n = rows.length, P = new Float32Array(n * K).fill(NaN), feat = FEATURES.map(([k]) => pctRank(rows.map((x) => (isNum(x[k]) ? x[k] : null))));
    const mean = (vals) => (vals.every(isNum) ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
    SIGNALS.forEach(([k], j) => {
      let col;
      if (k in featIdx) col = feat[featIdx[k]];
      else if (k === 'quantApprox') {
        const comp = rows.map((_, r) => {
          let sw = 0, sv = 0;
          for (const [w, parts] of Object.values(QUANT_APPROX)) {
            let pw = 0, pv = 0; for (const [p, cw] of parts) { const v = feat[featIdx[p]][r]; if (isNum(v)) { pw += cw; pv += cw * v; } }
            if (pw > 0) { sw += w; sv += w * (pv / pw); }
          }
          return sw >= 0.6 ? sv / sw : null; // mindestens 60 % der Faktorgewichte belegt
        });
        col = pctRank(comp);
      } else {
        const parts = (COMBOS.find((c) => c[0] === k) || EXTRA.find((x) => x[0] === k))[2];
        col = rows.map((_, r) => mean(parts.map((p) => feat[featIdx[p]][r])));
      }
      for (let r = 0; r < n; r++) if (isNum(col[r])) P[r * K + j] = col[r];
    });
    out.push({ t, date, s: Int32Array.from(rows, (x) => x.s), r: Float64Array.from(rows, (x) => x.r), adv: Float64Array.from(rows, (x) => x.adv),
      rank: Int32Array.from(rows, (x) => x.rank), cap: Float64Array.from(rows, (x) => (isNum(x.size) && x.size > 0 ? x.size : NaN)), P, K, filterOn: m.spyOn200[t] === 1 });
  }
  return out;
}

/** Monatsreihe eines Depots nach Kosten (Kasse = 0 %). Liefert {net[], n[], turnover[]}. */
export function portfolioSeries(xs, spec) {
  const j = SIGNALS.findIndex((s) => s[0] === spec.signal), net = [], names = [], turn = [];
  let prev = new Map();
  for (const x of xs) {
    let w = new Map();
    if (spec.filter === 'NONE' || x.filterOn) {
      const cand = [];
      for (let r = 0; r < x.s.length; r++) { const p = x.P[r * x.K + j]; if (x.rank[r] <= spec.maxRank && p === p && (spec.weight === 'EW' || x.cap[r] > 0)) cand.push([p, r]); }
      cand.sort((a, b) => b[0] - a[0] || x.s[a[1]] - x.s[b[1]]);
      const q = Math.floor(cand.length * spec.top);
      if (q >= RULES.minNames) {
        const pick = cand.slice(0, q).map((c) => c[1]), tot = spec.weight === 'EW' ? q : pick.reduce((a, r) => a + x.cap[r], 0);
        for (const r of pick) w.set(x.s[r], [spec.weight === 'EW' ? 1 / q : x.cap[r] / tot, x.r[r], x.adv[r]]);
      } else if (spec.filter === 'NONE') { net.push(null); names.push(0); turn.push(0); prev = new Map(); continue; }
    }
    let to = 0, cost = 0, ret = 0;
    for (const [s, [wt, r, adv]] of w) { const d = Math.abs(wt - (prev.get(s)?.[0] || 0)); to += d; cost += d * sideBps(adv) / 1e4; ret += wt * r; }
    for (const [s, [wt, , adv]] of prev) if (!w.has(s)) { to += wt; cost += wt * sideBps(adv) / 1e4; }
    net.push(ret - cost); names.push(w.size); turn.push(to); prev = w;
  }
  return { net, names, turnover: turn };
}

const ann = (rs) => { const v = rs.filter(isNum); if (!v.length) return null; return Math.exp(v.reduce((a, r) => a + Math.log(1 + r), 0) / v.length * 12) - 1; };
function maxDD(rs) { let e = 1, pk = 1, dd = 0; for (const r of rs) if (isNum(r)) { e *= 1 + r; pk = Math.max(pk, e); dd = Math.min(dd, e / pk - 1); } return dd; }

/** Kennzahlen einer Monatsreihe gegen SPY auf ausgewählten Monaten. */
export function windowStats(net, spyM, months, idx) {
  const a = idx.map((i) => net[i]), b = idx.map((i) => spyM[i]);
  if (a.some((x) => !isNum(x))) return null;
  const years = [...new Set(idx.map((i) => months[i].slice(0, 4)))];
  const yearsAhead = years.filter((y) => { const k = idx.filter((i) => months[i].startsWith(y)); return ann(k.map((i) => net[i])) > ann(k.map((i) => spyM[i])); }).length;
  const h = Math.floor(idx.length / 2), first = idx.slice(0, h), second = idx.slice(h);
  const exHalf = (k) => ann(k.map((i) => net[i])) - ann(k.map((i) => spyM[i]));
  return { cagr: ann(a), spy: ann(b), excess: ann(a) - ann(b), maxDrawdown: maxDD(a), yearsAhead, years: years.length, firstHalf: exHalf(first), secondHalf: exHalf(second) };
}

/** Fassung A: robuste Auswahl einer Runde. */
export function selectRound(series, list, nbrs, spyM, months, learnIdx) {
  const st = series.map((s) => windowStats(s.net, spyM, months, learnIdx));
  let best = null, bestScore = -Infinity;
  for (const c of list) {
    const x = st[c.id];
    if (!x || !(x.firstHalf > 0 && x.secondHalf > 0 && x.yearsAhead >= RULES.minYearShare * x.years && x.maxDrawdown >= RULES.maxLearnDrawdown)) continue;
    const vals = [c.id, ...nbrs[c.id]].map((k) => st[k]?.excess ?? -Infinity).sort((a, b) => a - b), n = vals.length;
    const score = n % 2 ? vals[n >> 1] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
    if (score > bestScore || (score === bestScore && c.id < best)) { bestScore = score; best = c.id; }
  }
  return { id: best, neighborhoodMedian: best === null ? null : bestScore, learn: best === null ? null : st[best], qualified: st.filter((x, k) => x && x.firstHalf > 0 && x.secondHalf > 0 && x.yearsAhead >= RULES.minYearShare * x.years && x.maxDrawdown >= RULES.maxLearnDrawdown).length };
}

/** Walk-forward über alle Runden; Bestätigungsmonate verkettet. bench: {SPY,QQQ,RSP} Monatsrenditen auf denselben Monaten. */
export function walkForward(xs, bench, { rounds = ROUNDS, list = specs() } = {}) {
  const months = xs.map((x) => x.date), series = list.map((c) => portfolioSeries(xs, c)), nbrs = neighborsOf(list), spyM = bench.SPY;
  const yr = (i) => +months[i].slice(0, 4), inYears = (a, b) => months.map((_, i) => i).filter((i) => yr(i) >= a && yr(i) <= b);
  const hyp = list.find((c) => DIMS.every((d) => c[d] === HYPOTHESIS[d]) && c.signal === HYPOTHESIS.signal).id;
  const quant = list.find((c) => c.signal === 'quantApprox' && c.top === 0.2 && c.maxRank === 1000 && c.weight === 'EW' && c.filter === 'NONE').id;
  const A = [], B = [], Q = [], chainIdx = [], out = { rounds: [] };
  for (const rd of rounds) {
    const li = inYears(...rd.learn), ci = inYears(...rd.confirm); if (!li.length || !ci.length) continue;
    const sel = selectRound(series, list, nbrs, spyM, months, li);
    const pickNet = sel.id === null ? spyM : series[sel.id].net;
    for (const i of ci) { A.push(pickNet[i]); B.push(series[hyp].net[i]); Q.push(series[quant].net[i]); chainIdx.push(i); }
    out.rounds.push({ learn: rd.learn, confirm: [rd.confirm[0], Math.min(rd.confirm[1], yr(ci.at(-1)))], qualified: sel.qualified,
      pick: sel.id === null ? 'kein Kandidat: SPY' : specLabel(list[sel.id]), pickSpec: sel.id === null ? null : list[sel.id], learnStats: sel.learn,
      confirmStats: windowStats(pickNet, spyM, months, ci), hypothesisConfirm: windowStats(series[hyp].net, spyM, months, ci) });
  }
  const on = (arr) => chainIdx.map((i) => arr[i]);
  const summary = (net) => {
    const ex = net.map((r, k) => r - spyM[chainIdx[k]]);
    const years = [...new Set(chainIdx.map((i) => months[i].slice(0, 4)))];
    return { cagr: ann(net), maxDrawdown: maxDD(net), excessSpy: ann(net) - ann(on(spyM)), pBootstrap: bootstrapP(ex, 4999),
      yearsAheadSpy: years.filter((y) => { const k = chainIdx.map((i, n) => [i, n]).filter(([i]) => months[i].startsWith(y)); return ann(k.map(([, n]) => net[n])) > ann(k.map(([i]) => spyM[i])); }).length, years: years.length };
  };
  out.window = [months[chainIdx[0]], months[chainIdx.at(-1)]];
  out.benchmarks = Object.fromEntries(Object.entries(bench).map(([k, v]) => [k, { cagr: ann(on(v)), maxDrawdown: maxDD(on(v)) }]));
  out.fassungA = summary(A); out.fassungB = summary(B); out.quantApprox = summary(Q);
  // Nachbarschaft der Hypothese: alle Einstellungen des Signals, nur Bestätigungsjahre (keine Auswahl)
  out.hypothesisNeighbors = list.filter((c) => c.signal === HYPOTHESIS.signal).map((c) => ({ label: specLabel(c), ...summary(on(series[c.id].net)) }));
  // Rangliste aller Depots auf den Bestätigungsjahren (Rückschau, nur zur Einordnung; nicht auswählbar)
  out.signalsOos = SIGNALS.map(([k, name]) => { const c = list.find((x) => x.signal === k && x.top === 0.2 && x.maxRank === 1000 && x.weight === 'EW' && x.filter === 'NONE'); return { key: k, name, ...summary(on(series[c.id].net)) }; })
    .sort((a, b) => b.excessSpy - a.excessSpy);
  out.trials = list.length;
  return out;
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');
const p3 = (x) => (x == null ? '–' : x.toFixed(3).replace('.', ','));

export function report(res) {
  const w = res.wf, b = w.benchmarks, row = (name, s) => `| ${name} | ${pct(s.cagr)} | ${pp(s.excessSpy)} | ${pct(s.maxDrawdown)} | ${s.yearsAheadSpy}/${s.years} | ${p3(s.pBootstrap)} |`;
  const L = ['# Faktor-Depots im Walk-forward (Backtest 2.0, Stufe 3)' + (res.smoke ? ' – RAUCHTEST, kein Ergebnis' : ''), '',
    `**Forschung, nicht zertifiziert.** Nur für den Owner. Bestätigungsjahre ${w.window[0]} bis ${w.window[1]}, verkettet; ${w.trials} vorab festgelegte Depots; Kosten abgezogen; delistete Titel enthalten (${res.data.loaded} Titel geladen). Datenstand-Fingerabdruck \`${res.dataFingerprint}\`.`, '',
    `Vergleich auf denselben Monaten: SPY ${pct(b.SPY.cagr)} p. a. (max. Verlust ${pct(b.SPY.maxDrawdown)}), QQQ ${pct(b.QQQ.cagr)}, RSP ${pct(b.RSP.cagr)}.`, '',
    '## Ergebnis auf ungesehenen Jahren', '', '| Fassung | Rendite p. a. | vs. SPY | max. Verlust | Jahre vor SPY | p (Bootstrap) |', '|---|---|---|---|---|---|',
    row('A – Auswahl nur aus den Lernjahren', w.fassungA), row('B – Hypothese Momentum + Bruttogewinn/Bilanz (fest)', w.fassungB), row('Quant-Score heute (Näherung, ohne Revisionen)', w.quantApprox), '',
    '## Runden (Fassung A)', '', '| Lernen | Bestätigen | Kandidaten | gewählt | Lernen vs. SPY | Bestätigen | SPY | Hypothese B |', '|---|---|---|---|---|---|---|---|'];
  for (const r of w.rounds) L.push(`| ${r.learn.join('–')} | ${r.confirm.join('–')} | ${r.qualified} | ${r.pick} | ${pp(r.learnStats?.excess)} | ${pct(r.confirmStats?.cagr)} | ${pct(r.confirmStats?.spy)} | ${pct(r.hypothesisConfirm?.cagr)} |`);
  L.push('', '## Nachbarschaft der Hypothese (alle 16 Einstellungen, Bestätigungsjahre)', '', '| Depot | Rendite p. a. | vs. SPY | max. Verlust | Jahre vor SPY | p |', '|---|---|---|---|---|---|');
  for (const n of w.hypothesisNeighbors) L.push(row(n.label, n));
  L.push('', '## Alle Signale auf den Bestätigungsjahren (bestes Fünftel, Top 1.000, gleich gewichtet; Rückschau zur Einordnung)', '', '| Signal | Rendite p. a. | vs. SPY | max. Verlust | Jahre vor SPY | p |', '|---|---|---|---|---|---|');
  for (const s of w.signalsOos) L.push(row(s.name, s));
  L.push('', '## Lesehilfe', '',
    '- Fassung A ist der eigentliche Test: Die Auswahl kennt nur die Lernjahre. Schlägt sie SPY auf den Bestätigungsjahren, war das Verfahren vorab anwendbar.',
    '- Fassung B prüft eine Hypothese, die vor 2014 veröffentlicht war; sie ist nicht aus diesen Daten gewählt. Die Nachbarschaft zeigt, ob das Ergebnis an einer Einstellung hängt.',
    '- p (Bootstrap) ist einseitig für „Monatsüberrendite gegen SPY > 0“; unter 0,05 ist ein Zufallstreffer unwahrscheinlich, eine Garantie ist es nicht.',
    '- Die Quant-Näherung nutzt die Faktorgewichte von quant-v2.4.1, aber nur die hier verfügbaren Bausteine und keine Revisionen; sie ist ein Vergleich, nicht der Produkt-Score.');
  return L.join('\n') + '\n';
}

async function main() {
  const a = parseArgs(process.argv);
  const { m, bench, counts, diagnostics, bundleOf } = loadInputs(a);
  const xs = crossSections(m, bundleOf);
  const ends = monthEnds(m.dates).map((t) => m.dates[t]);
  const mret = (pts) => xs.map((x) => valueAt(pts, ends[ends.indexOf(x.date) + 1]) / valueAt(pts, x.date) - 1);
  const wf = walkForward(xs, { SPY: mret(bench.SPY), QQQ: mret(bench.QQQ), RSP: mret(bench.RSP) });
  const res = { schema: 'backtest2-faktor-wf-1.0.0', label: 'Forschung, nicht zertifiziert', version: WF_VERSION, smoke: !!a.smoke, data: counts, dataFingerprint: diagnostics.dataFingerprint, wf };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'faktor-wf.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'FAKTOR-WALKFORWARD.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
