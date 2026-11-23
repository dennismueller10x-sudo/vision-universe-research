#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 5 – die übrigen Trader-Muster mit Faktoren. Forschung, nicht zertifiziert.
 * Protokoll: docs/research/backtest2/PROTOKOLL.md §4g (vor dem ersten Lauf festgelegt). Daten und Depotführung wie Stufe 4
 * (trader-faktor.mjs): Monatsultimo, die 1.000 liquidesten Titel ≥ 5 $, gleich gewichtet, Kosten auf den Umschlag, Kasse 0 %.
 *
 * Frage: Stufe 4 prüfte nur die Trendvorlage nach Minervini. Gilt dasselbe für die Muster der anderen Methoden, wenn man sie
 * wie dort als Schranke nimmt und darin nach Momentum + Bruttogewinn je Bilanzsumme auswählt?
 *
 * Muster als Zustand am Monatsultimo (nur Balken bis t), veröffentlichte Lesarten auf Tagesbasis:
 *   TURTLE     neuer 55-Tage-Ausbruch: in den letzten 21 Sitzungen ein Schluss über dem höchsten Hoch der 55 Sitzungen davor
 *   DARVAS     neues Zweijahreshoch: in den letzten 21 Sitzungen ein Schluss über dem höchsten Hoch der 504 Sitzungen davor,
 *              und der Schluss heute nicht mehr als 5 % unter dem höchsten Hoch seit diesem Ausbruch (Kasten hält)
 *   WEINSTEIN  Stufe 2: Schluss über der 150-Tage-Linie, und diese mindestens 0,5 % höher als vor 21 Sitzungen
 *   MINERVINI  Trendvorlage wie Stufe 4 (zum Vergleich neu gerechnet)
 *
 * Je Muster zwei Depots mit 25 Titeln: „+ Faktoren“ (Rang nach Momentum 12-1 + Bruttogewinn je Bilanzsumme) und die Kontrolle
 * „nur Muster“ (Rang nach relativer Stärke 6 Monate). Dazu die Kontrolle „nur Faktoren“ ohne Muster. Neun feste Depots.
 * Urteil je neuem Muster (Turtle, Darvas, Weinstein): „Hinweis“ nur, wenn „+ Faktoren“ nach Kosten vor SPY liegt, der
 * Bootstrap-p nach Holm über die drei neuen Hypothesen unter 0,10 bleibt und das Depot über beiden Kontrollen liegt.
 *
 *   node scripts/research/backtest2/trader-familie.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { monthEnds, loadInputs, parseArgs } from './merkmale.mjs';
import { crossSections, windowStats } from './faktor-wf.mjs';
import { trendTemplateAt, scoreOf, SCORES, PERIODS } from './trader-faktor.mjs';
import { sideBps } from './engine.mjs';
import { valueAt, bootstrapP } from './search.mjs';

export const VERSION = 'backtest2-trader-familie-1.0.0';
export const RULES = Object.freeze({ maxRank: 1000, minNames: 10, n: 25, fromYear: 2014, pHint: 0.10, window: 21, turtle: 55, darvas: 504, darvasHold: 0.95, stageMa: 150, stageSlope: 0.005 });
export const PATTERNS = Object.freeze(['MINERVINI', 'TURTLE', 'DARVAS', 'WEINSTEIN']);
export const NEW_PATTERNS = Object.freeze(['TURTLE', 'DARVAS', 'WEINSTEIN']);
const LABEL = { MINERVINI: 'Trendvorlage (Minervini)', TURTLE: '55-Tage-Ausbruch (Turtle)', DARVAS: 'Neues Zweijahreshoch (Darvas)', WEINSTEIN: 'Stufe 2 (Weinstein)' };
export const PORTFOLIOS = Object.freeze([
  ...PATTERNS.flatMap((p) => [
    { id: p + '+F', label: LABEL[p] + ' + Momentum + Bruttogewinn/Bilanz', pattern: p, score: 'mom_gpa' },
    { id: p, label: 'Kontrolle: nur ' + LABEL[p], pattern: p, score: 'rs' },
  ]),
  { id: 'FAKTOREN', label: 'Kontrolle: nur Momentum + Bruttogewinn/Bilanz', pattern: null, score: 'mom_gpa' },
]);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Tagesindizes der letzten n Balken mit Kurs bis t (neueste zuerst); null, wenn an t kein Balken oder zu wenige. */
export function barsBack(m, s, t, n) {
  const base = s * m.T, idx = [];
  for (let k = t; k >= 0 && idx.length < n; k--) if (m.c[base + k] > 0) idx.push(k);
  return idx.length === n && idx[0] === t ? idx : null;
}

/** Ausbruch in den letzten `window` Sitzungen über das höchste Hoch der `look` Sitzungen davor. Liefert den Index j des jüngsten Ausbruchs oder -1. */
function breakoutWithin(m, s, idx, window, look) {
  const base = s * m.T;
  for (let j = 0; j < window; j++) {
    let hi = -Infinity; for (let k = j + 1; k <= j + look; k++) hi = Math.max(hi, m.h[base + idx[k]]);
    if (m.c[base + idx[j]] > hi) return j;
  }
  return -1;
}

export function turtleAt(m, s, t, r = RULES) {
  const idx = barsBack(m, s, t, r.window + r.turtle); if (!idx) return false;
  return breakoutWithin(m, s, idx, r.window, r.turtle) >= 0;
}

export function darvasAt(m, s, t, r = RULES) {
  const idx = barsBack(m, s, t, r.window + r.darvas); if (!idx) return false;
  const j = breakoutWithin(m, s, idx, r.window, r.darvas); if (j < 0) return false;
  const base = s * m.T; let top = -Infinity; for (let k = 0; k <= j; k++) top = Math.max(top, m.h[base + idx[k]]);
  return m.c[base + t] >= r.darvasHold * top;
}

export function weinsteinAt(m, s, t, r = RULES) {
  const idx = barsBack(m, s, t, r.stageMa + r.window); if (!idx) return false;
  const base = s * m.T; let now = 0, past = 0;
  for (let k = 0; k < r.stageMa; k++) { now += m.c[base + idx[k]]; past += m.c[base + idx[k + r.window]]; }
  now /= r.stageMa; past /= r.stageMa;
  return m.c[base + t] > now && past > 0 && now / past - 1 >= r.stageSlope;
}

export const PATTERN_AT = Object.freeze({ MINERVINI: trendTemplateAt, TURTLE: turtleAt, DARVAS: darvasAt, WEINSTEIN: weinsteinAt });

/** Muster-Flags je Monat und Titel: {MUSTER: Uint8Array[]}. */
export function patternFlags(m, xs) {
  return Object.fromEntries(PATTERNS.map((p) => [p, xs.map((x) => Uint8Array.from(x.s, (s) => (PATTERN_AT[p](m, s, x.t) ? 1 : 0)))]));
}

/** Monatsreihe eines Depots nach Kosten (wie trader-faktor.mjs#portfolioSeries, Muster frei wählbar). */
export function portfolioSeries(xs, flags, pf, rules = RULES) {
  const parts = SCORES[pf.score], net = [], names = [], turn = [], candidates = [];
  let prev = new Map();
  xs.forEach((x, e) => {
    const cand = [], f = pf.pattern ? flags[pf.pattern][e] : null;
    for (let r = 0; r < x.s.length; r++) {
      if (!(x.rank[r] <= rules.maxRank) || (f && !f[r])) continue;
      const v = scoreOf(x, r, parts); if (v === v) cand.push([v, r]);
    }
    cand.sort((a, b) => b[0] - a[0] || x.s[a[1]] - x.s[b[1]]);
    candidates.push(cand.length);
    const w = new Map();
    if (cand.length >= rules.minNames) { const q = Math.min(rules.n, cand.length); for (const [, r] of cand.slice(0, q)) w.set(x.s[r], [1 / q, x.r[r], x.adv[r]]); }
    let to = 0, cost = 0, ret = 0;
    for (const [s, [wt, r, adv]] of w) { const d = Math.abs(wt - (prev.get(s)?.[0] || 0)); to += d; cost += d * sideBps(adv) / 1e4; ret += wt * r; }
    for (const [s, [wt, , adv]] of prev) if (!w.has(s)) { to += wt; cost += wt * sideBps(adv) / 1e4; }
    net.push(ret - cost); names.push(w.size); turn.push(to); prev = w;
  });
  return { net, names, turnover: turn, candidates };
}

const ann = (rs) => (rs.length ? Math.exp(rs.reduce((a, r) => a + Math.log(1 + r), 0) / rs.length * 12) - 1 : null);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Holm über p-Werte: liefert je Eintrag das angepasste p (monoton). */
export function holm(ps) {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), out = new Array(ps.length); let run = 0;
  order.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, p * (ps.length - k))); out[i] = run; });
  return out;
}

export function evaluate(xs, flags, bench, { rules = RULES, draws = 4999, portfolios = PORTFOLIOS, newPatterns = NEW_PATTERNS, labels = LABEL } = {}) {
  const months = xs.map((x) => x.date), yr = (i) => +months[i].slice(0, 4), idx = months.map((_, i) => i).filter((i) => yr(i) >= rules.fromYear), spy = bench.SPY;
  const rows = portfolios.map((pf) => {
    const s = portfolioSeries(xs, flags, pf, rules), st = windowStats(s.net, spy, months, idx), ex = idx.map((i) => s.net[i] - spy[i]);
    return { id: pf.id, label: pf.label, pattern: pf.pattern, ...st, pBootstrap: bootstrapP(ex, draws),
      avgNames: mean(idx.map((i) => s.names[i])), avgCandidates: mean(idx.map((i) => s.candidates[i])), avgTurnover: mean(idx.map((i) => s.turnover[i])), cashMonths: idx.filter((i) => s.names[i] === 0).length,
      periods: PERIODS.map(([a, b]) => { const k = idx.filter((i) => yr(i) >= a && yr(i) <= b); return k.length ? { years: [a, Math.min(b, yr(k.at(-1)))], excess: ann(k.map((i) => s.net[i])) - ann(k.map((i) => spy[i])) } : null; }).filter(Boolean) };
  });
  const by = Object.fromEntries(rows.map((r) => [r.id, r])), adj = holm(newPatterns.map((p) => by[p + '+F'].pBootstrap ?? 1));
  const verdicts = newPatterns.map((p, k) => {
    const h = by[p + '+F'], c = by[p], f = by.FAKTOREN;
    const hint = !!(h.excess > 0 && adj[k] < rules.pHint && h.cagr > c.cagr && h.cagr > f.cagr);
    return { pattern: p, label: labels[p] || p, hint, pHolm: adj[k], vsPattern: h.cagr - c.cagr, vsFactors: h.cagr - f.cagr, text: hint ? 'Hinweis' : 'nicht belegt' };
  });
  return { window: [months[idx[0]], months[idx.at(-1)]], months: idx.length, benchmarks: Object.fromEntries(Object.entries(bench).map(([k, v]) => [k, { cagr: ann(idx.map((i) => v[i])) }])),
    portfolios: rows, verdicts, rule: '„+ Faktoren“ vor SPY nach Kosten, Bootstrap-p nach Holm über ' + newPatterns.length + ' Hypothesen < 0,10, Rendite über „nur Muster“ und „nur Faktoren“' };
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');
const p3 = (x) => (x == null ? '–' : x.toFixed(3).replace('.', ','));

export function report(res) {
  const e = res.result, b = e.benchmarks;
  const L = ['# Die übrigen Trader-Muster mit Faktoren (Backtest 2.0, Stufe 5)' + (res.smoke ? ' – RAUCHTEST, kein Ergebnis' : ''), '',
    `**Forschung, nicht zertifiziert.** Nur für den Owner. ${e.window[0]} bis ${e.window[1]} (${e.months} Monate); neun vorab feste Depots mit je 25 Titeln; Kosten abgezogen; delistete Titel enthalten (${res.data.loaded} Titel geladen). Datenstand-Fingerabdruck \`${res.dataFingerprint}\`.`, '',
    `Vergleich auf denselben Monaten: SPY ${pct(b.SPY.cagr)} p. a., QQQ ${pct(b.QQQ.cagr)}, RSP ${pct(b.RSP.cagr)}.`, '',
    '## Urteil je neuem Muster', '', `Regel: ${e.rule}.`, '', '| Muster | Urteil | p nach Holm | gegen nur Muster | gegen nur Faktoren |', '|---|---|---|---|---|'];
  for (const v of e.verdicts) L.push(`| ${v.label} | **${v.text}** | ${p3(v.pHolm)} | ${pp(v.vsPattern)} | ${pp(v.vsFactors)} |`);
  L.push('', '## Depots', '', '| Depot | Rendite p. a. | vs. SPY | max. Verlust | Jahre vor SPY | p | Kandidaten | Umschlag/Monat | Monate in Kasse |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of e.portfolios) L.push(`| ${r.label} | ${pct(r.cagr)} | ${pp(r.excess)} | ${pct(r.maxDrawdown)} | ${r.yearsAhead}/${r.years} | ${p3(r.pBootstrap)} | ${r.avgCandidates?.toFixed(0)} | ${pct(r.avgTurnover)} | ${r.cashMonths} |`);
  L.push('', '## Teilzeiträume (Abstand zu SPY p. a.)', '', '| Depot | ' + e.portfolios[0].periods.map((p) => p.years.join('–')).join(' | ') + ' |', '|---|' + e.portfolios[0].periods.map(() => '---').join('|') + '|');
  for (const r of e.portfolios) L.push(`| ${r.id} | ${r.periods.map((p) => pp(p.excess)).join(' | ')} |`);
  L.push('', '## Lesehilfe', '',
    '- Geprüft wird die AUSWAHL der Aktien in monatlichen Depots: das Muster als Schranke, darin der Rang nach Faktoren. Die Ein- und Ausstiegsregeln der Methoden (Stopps, Kästen, Einheiten) sind nicht Teil dieses Tests.',
    '- Die Lesarten der Muster sind einfache Tageszustände (PROTOKOLL §4g), nicht die zertifizierten Supertrader-Module.',
    '- Die Regeln standen vor dem ersten Lauf fest, aber nach Einsicht in Stufe 2 bis 4. Ein „Hinweis“ ist kein Beweis.');
  return L.join('\n') + '\n';
}

async function main() {
  const a = parseArgs(process.argv);
  const { m, bench, counts, diagnostics, bundleOf } = loadInputs(a);
  const xs = crossSections(m, bundleOf), flags = patternFlags(m, xs);
  const ends = monthEnds(m.dates).map((t) => m.dates[t]);
  const mret = (pts) => xs.map((x) => valueAt(pts, ends[ends.indexOf(x.date) + 1]) / valueAt(pts, x.date) - 1);
  const result = evaluate(xs, flags, { SPY: mret(bench.SPY), QQQ: mret(bench.QQQ), RSP: mret(bench.RSP) });
  const res = { schema: VERSION, label: 'Forschung, nicht zertifiziert', smoke: !!a.smoke, data: counts, dataFingerprint: diagnostics.dataFingerprint, result };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'trader-familie.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'TRADER-FAMILIE.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
