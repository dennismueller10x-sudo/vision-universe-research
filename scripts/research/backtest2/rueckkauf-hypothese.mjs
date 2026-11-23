#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 8 – feste Hypothese „Momentum + Bruttogewinn/Bilanz + Rückkäufe, 25 Titel, Haltepuffer“.
 * Forschung, nicht zertifiziert. Protokoll: docs/research/backtest2/PROTOKOLL.md §4j. Daten und Depotführung wie Stufe 7.
 *
 * Herkunft, offen benannt: Das Signal stand seit Stufe 2 fest (dort phasenfest), die Depotform (25 Titel, Haltepuffer) wurde
 * NACH Einsicht in die Rückschau der Stufe 7 gewählt. Dieser Lauf ist deshalb keine Bestätigung, sondern die Beschreibung genau
 * einer Regel: Wie verteilt sich ihr Ergebnis über die Jahre, und hängt es an wenigen Gewinnern?
 *
 *   R25        kein Muster, Rang Momentum 12-1 + Bruttogewinn je Bilanzsumme + Rückkäufe, 25 Titel, mit Haltepuffer (die Regel)
 *   Gegenproben  R25 ohne den besten bzw. die zwei besten Titel jedes Monats (im Nachhinein entfernt: Härtetest, keine Strategie)
 *                R25 ohne Haltepuffer · 15 Titel · 50 Titel · mit Trendvorlage (Minervini) · ohne Rückkäufe (Momentum + Bruttogewinn/Bilanz)
 * Auswertung 2014 bis Ende gegen SPY (Gesamtrendite): Rendite, Abstand, max. Verlust, Jahre vorn, Bootstrap-p, Umschlag;
 * Kalenderjahre und Teilzeiträume für R25.
 *
 *   node scripts/research/backtest2/rueckkauf-hypothese.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { monthEnds, loadInputs, parseArgs } from './merkmale.mjs';
import { crossSections, windowStats } from './faktor-wf.mjs';
import { scoreOf, trendTemplateAt, PERIODS } from './trader-faktor.mjs';
import { SCORES, RULES } from './trader-wf.mjs';
import { sideBps } from './engine.mjs';
import { valueAt, bootstrapP } from './search.mjs';

export const VERSION = 'backtest2-rueckkauf-hypothese-1.0.0';
export const FROM_YEAR = 2014;
export const HYPOTHESIS = Object.freeze({ id: 'R25', label: 'Momentum + Bruttogewinn/Bilanz + Rückkäufe · 25 Titel · Haltepuffer', pattern: false, score: 'mom_gpa_buyback', n: 25, hold: true, dropTop: 0, cap: null });
export const CHECKS = Object.freeze([
  { id: 'R25-ohne-1', label: 'R25 ohne den besten Titel jedes Monats (Härtetest)', dropTop: 1 },
  { id: 'R25-ohne-2', label: 'R25 ohne die zwei besten Titel jedes Monats (Härtetest)', dropTop: 2 },
  { id: 'R25-Kappe30', label: 'R25, Monatsrendite je Titel bei +30 % gekappt (Härtetest)', cap: 0.30 },
  { id: 'R25-ohne-Puffer', label: 'wie R25, ohne Haltepuffer', hold: false },
  { id: 'R15', label: 'wie R25, 15 Titel', n: 15 },
  { id: 'R50', label: 'wie R25, 50 Titel', n: 50 },
  { id: 'R25-Trendvorlage', label: 'wie R25, nur Titel mit Trendvorlage (Minervini)', pattern: true },
  { id: 'MG25', label: 'wie R25, ohne Rückkäufe (Momentum + Bruttogewinn/Bilanz)', score: 'mom_gpa' },
].map((c) => ({ ...HYPOTHESIS, ...c })));
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Monatsreihe nach Kosten. dropTop entfernt im Nachhinein die k besten Titel des Monats aus dem Mittel (Kosten bleiben). */
export function series(xs, flags, spec, rules = RULES) {
  const parts = SCORES[spec.score], net = [], names = [], turn = [], held = [], medianEdge = [];
  let prev = new Map();
  xs.forEach((x, e) => {
    const cand = [];
    for (let r = 0; r < x.s.length; r++) {
      if (!(x.rank[r] <= rules.maxRank) || (spec.pattern && !flags[e][r])) continue;
      const v = scoreOf(x, r, parts); if (v === v) cand.push([v, r]);
    }
    cand.sort((a, b) => b[0] - a[0] || x.s[a[1]] - x.s[b[1]]);
    const w = new Map();
    if (cand.length >= rules.minNames) {
      const q = Math.min(spec.n, cand.length), pick = [];
      if (spec.hold) for (const [, r] of cand.slice(0, rules.bufferFactor * spec.n)) if (prev.has(x.s[r]) && pick.length < q) pick.push(r);
      for (const [, r] of cand) { if (pick.length >= q) break; if (!pick.includes(r)) pick.push(r); }
      for (const r of pick) w.set(x.s[r], [1 / q, x.r[r], x.adv[r]]);
    }
    let to = 0, cost = 0;
    for (const [s, [wt, , adv]] of w) { const d = Math.abs(wt - (prev.get(s)?.[0] || 0)); to += d; cost += d * sideBps(adv) / 1e4; }
    for (const [s, [wt, , adv]] of prev) if (!w.has(s)) { to += wt; cost += wt * sideBps(adv) / 1e4; }
    const med = (a) => { if (!a.length) return null; const v = a.slice().sort((p, q) => p - q), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
    /* Median der gehaltenen Titel gegen Median aller Titel des Universums in diesem Monat (unempfindlich gegen Ausreißer) */
    const uni = []; for (let r = 0; r < x.s.length; r++) if (x.rank[r] <= rules.maxRank) uni.push(x.r[r]);
    medianEdge.push(w.size ? med([...w.values()].map((v) => v[1])) - med(uni) : null);
    held.push([...w.entries()].map(([sid, v]) => [sid, v[1]]));
    const rets = [...w.values()].map((v) => (isNum(spec.cap) ? Math.min(v[1], spec.cap) : v[1])).sort((a, b) => b - a).slice(Math.min(spec.dropTop || 0, Math.max(0, w.size - 1)));
    net.push((rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0) - cost); names.push(w.size); turn.push(to); prev = w;
  });
  return { net, names, turnover: turn, held, medianEdge };
}

const ann = (rs) => (rs.length ? Math.exp(rs.reduce((a, r) => a + Math.log(1 + r), 0) / rs.length * 12) - 1 : null);
const total = (rs) => rs.reduce((a, r) => a * (1 + r), 1) - 1;

export function evaluate(xs, flags, bench, { draws = 4999, nameOf = (s) => String(s) } = {}) {
  const months = xs.map((x) => x.date), yr = (i) => +months[i].slice(0, 4), idx = months.map((_, i) => i).filter((i) => yr(i) >= FROM_YEAR), spy = bench.SPY;
  const rowOf = (spec) => {
    const s = series(xs, flags, spec), st = windowStats(s.net, spy, months, idx);
    return { id: spec.id, label: spec.label, ...st, pBootstrap: bootstrapP(idx.map((i) => s.net[i] - spy[i]), draws),
      avgTurnover: idx.reduce((a, i) => a + s.turnover[i], 0) / idx.length, cashMonths: idx.filter((i) => s.names[i] === 0).length, net: s.net, held: s.held, medianEdge: s.medianEdge };
  };
  const h = rowOf(HYPOTHESIS), checks = CHECKS.map(rowOf);
  const years = [...new Set(idx.map((i) => yr(i)))].map((y) => { const k = idx.filter((i) => yr(i) === y); return { year: y, months: k.length, r25: total(k.map((i) => h.net[i])), spy: total(k.map((i) => spy[i])) }; });
  const periods = PERIODS.map(([a, b]) => { const k = idx.filter((i) => yr(i) >= a && yr(i) <= b); return k.length ? { years: [a, Math.min(b, yr(k.at(-1)))], r25: ann(k.map((i) => h.net[i])), spy: ann(k.map((i) => spy[i])) } : null; }).filter(Boolean);
  const strip = ({ net, held, medianEdge, ...r }) => r;
  /* Größte Einzelbeiträge der Regel (Titel, Monat, Monatsrendite) und der Median-Vergleich: hängt das Ergebnis an Ausreißern? */
  const single = []; for (const i of idx) for (const [sid, r] of h.held[i]) single.push({ ticker: nameOf(sid), month: months[i], ret: r });
  single.sort((a, b) => b.ret - a.ret);
  const me = idx.map((i) => h.medianEdge[i]).filter(isNum), meSorted = me.slice().sort((a, b) => a - b);
  const medianCheck = { months: me.length, monthsAhead: me.filter((v) => v > 0).length, medianOfMonthly: meSorted.length ? meSorted[meSorted.length >> 1] : null, mean: me.length ? me.reduce((a, b) => a + b, 0) / me.length : null };
  const over100 = single.filter((x) => x.ret > 1).length;
  return { window: [months[idx[0]], months[idx.at(-1)]], months: idx.length, benchmarks: Object.fromEntries(Object.entries(bench).map(([k, v]) => [k, { cagr: ann(idx.map((i) => v[i])) }])),
    hypothesis: strip(h), checks: checks.map(strip), years, periods, topSingle: single.slice(0, 15), singleOver100: over100, holdingsMonths: single.length, medianCheck,
    worstYearVsSpy: years.filter((y) => y.months === 12).reduce((m, y) => (m === null || y.r25 - y.spy < m.r25 - m.spy ? y : m), null) };
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');
const p3 = (x) => (x == null ? '–' : x.toFixed(3).replace('.', ','));

export function report(res) {
  const e = res.result, b = e.benchmarks, row = (r) => `| ${r.label} | ${pct(r.cagr)} | ${pp(r.excess)} | ${pct(r.maxDrawdown)} | ${r.yearsAhead}/${r.years} | ${p3(r.pBootstrap)} | ${pct(r.avgTurnover)} | ${r.cashMonths} |`;
  const L = ['# Feste Hypothese: Momentum + Bruttogewinn/Bilanz + Rückkäufe (Backtest 2.0, Stufe 8)' + (res.smoke ? ' – RAUCHTEST, kein Ergebnis' : ''), '',
    `**Forschung, nicht zertifiziert.** Nur für den Owner. ${e.window[0]} bis ${e.window[1]} (${e.months} Monate); Kosten abgezogen; delistete Titel enthalten (${res.data.loaded} Titel geladen). Datenstand-Fingerabdruck \`${res.dataFingerprint}\`.`, '',
    `Vergleich auf denselben Monaten: SPY ${pct(b.SPY.cagr)} p. a., QQQ ${pct(b.QQQ.cagr)}, RSP ${pct(b.RSP.cagr)}.`, '',
    '## Die Regel und ihre Gegenproben', '', '| Depot | Rendite p. a. | vs. SPY | max. Verlust | Jahre vor SPY | p | Umschlag/Monat | Monate in Kasse |', '|---|---|---|---|---|---|---|---|',
    row({ ...e.hypothesis, label: '**' + e.hypothesis.label + '**' }), ...e.checks.map(row), '',
    '## Kalenderjahre (R25 gegen SPY)', '', '| Jahr | R25 | SPY | Abstand |', '|---|---|---|---|'];
  for (const y of e.years) L.push(`| ${y.year}${y.months < 12 ? ' (' + y.months + ' Mon.)' : ''} | ${pct(y.r25)} | ${pct(y.spy)} | ${pp(y.r25 - y.spy)} |`);
  const mc = e.medianCheck;
  L.push('', '## Hängt es an Ausreißern?', '',
    `Median der gehaltenen Titel gegen Median aller Titel des Universums, je Monat: in ${mc.monthsAhead} von ${mc.months} Monaten vorn, typischer Monat ${pp(mc.medianOfMonthly)}, im Mittel ${pp(mc.mean)}.`,
    `Von ${e.holdingsMonths} Titel-Monaten hatten ${e.singleOver100} eine Monatsrendite über +100 %.`, '',
    '| Titel | Monat (Ultimo) | Rendite im Folgemonat |', '|---|---|---|');
  for (const t of e.topSingle) L.push(`| ${t.ticker} | ${t.month} | ${pct(t.ret)} |`);
  L.push('', '## Teilzeiträume (p. a.)', '', '| Zeitraum | R25 | SPY | Abstand |', '|---|---|---|---|');
  for (const p of e.periods) L.push(`| ${p.years.join('–')} | ${pct(p.r25)} | ${pct(p.spy)} | ${pp(p.r25 - p.spy)} |`);
  L.push('', '## Lesehilfe', '',
    '- Das Signal stand seit Stufe 2 fest; die Depotform (25 Titel, Haltepuffer) wurde nach Einsicht in die Rückschau der Stufe 7 gewählt. Der Lauf beschreibt diese eine Regel, er bestätigt sie nicht. Bestätigen kann nur der Vorwärtstest.',
    '- „Ohne den besten Titel“ entfernt im Nachhinein den besten Titel jedes Monats. Das trifft JEDES Depot mit 25 Titeln hart (der beste Titel trägt rechnerisch rund einen Prozentpunkt je Monat); aussagekräftiger sind die Kappung bei +30 %, der Median-Vergleich und die Liste der größten Einzelbeiträge.',
    '- p ist einseitig für „Monatsüberrendite gegen SPY > 0“ (Block-Bootstrap), nicht für die Versuche der Stufe 7 korrigiert.');
  return L.join('\n') + '\n';
}

async function main() {
  const a = parseArgs(process.argv);
  const { m, bench, counts, diagnostics, bundleOf } = loadInputs(a);
  const xs = crossSections(m, bundleOf), flags = xs.map((x) => Uint8Array.from(x.s, (s) => (trendTemplateAt(m, s, x.t) ? 1 : 0)));
  const ends = monthEnds(m.dates).map((t) => m.dates[t]);
  const mret = (pts) => xs.map((x) => valueAt(pts, ends[ends.indexOf(x.date) + 1]) / valueAt(pts, x.date) - 1);
  const result = evaluate(xs, flags, { SPY: mret(bench.SPY), QQQ: mret(bench.QQQ), RSP: mret(bench.RSP) }, { nameOf: (sid) => String(m.ids[sid]) });
  const res = { schema: VERSION, label: 'Forschung, nicht zertifiziert', smoke: !!a.smoke, data: counts, dataFingerprint: diagnostics.dataFingerprint, result };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'rueckkauf-hypothese.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'RUECKKAUF-HYPOTHESE.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
