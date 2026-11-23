#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 4 – Trader-Muster mit Faktoren. Forschung, nicht zertifiziert.
 * Protokoll: docs/research/backtest2/PROTOKOLL.md §4f (vor dem ersten Lauf festgelegt). Daten wie Stufe 2 und 3
 * (merkmale.mjs#loadInputs: Tagesreihen mit delisteten Titeln, Fundamentaldaten wie damals eingereicht, Gesamtrendite).
 *
 * Frage: Die mechanischen Trader-Regeln allein lagen in jedem Test hinter SPY; die Bücher (Minervini u. a.) kaufen aber nur
 * wenige Marktführer mit starkem Geschäft. Liegt ein konzentriertes Depot aus Aktien, die BEIDES erfüllen (Trendvorlage UND
 * die Faktoren, die in Stufe 2/3 getragen haben), nach Kosten vor SPY, und trägt die Kombination mehr als jeder Teil allein?
 *
 * Kein Raster, keine Auswahl: acht vorab feste Depots.
 *   H1   Trendvorlage + Momentum + Bruttogewinn je Bilanzsumme, 25 Titel            (die Hypothese; Urteil nur hierauf)
 *   H2   Trendvorlage + Momentum + Umsatzwachstum + Eigenkapitalrendite, 25 Titel   (Minervinis Geschäftskriterien)
 *   K1   nur Trendvorlage, nach relativer Stärke 6 Monate, 25 Titel                 (Kontrolle: das Muster allein)
 *   K2   nur Momentum + Bruttogewinn je Bilanzsumme, 25 Titel                       (Kontrolle: die Faktoren allein)
 *   je einmal mit 50 Titeln (zeigt, ob das Ergebnis an der Titelzahl hängt).
 * Monatsultimo, die 1.000 liquidesten Titel ≥ 5 $, gleich gewichtet, Kosten = Umschlag × Kosten je Seite, kein Marktfilter
 * (Stufe 3: mit Filter lagen alle Einstellungen hinter SPY), Kasse ohne Zins. Unter 10 Kandidaten: Kasse in diesem Monat.
 * Trendvorlage wie signals.mjs#TREND_TEMPLATE (veröffentlichte Lesart): Schluss > SMA50 > SMA150 > SMA200, SMA200 höher als
 * vor 21 Sitzungen, Schluss ≥ 1,3 × 52-Wochen-Tief, Schluss ≥ 0,75 × 52-Wochen-Hoch.
 *
 *   node scripts/research/backtest2/trader-faktor.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { monthEnds, loadInputs, parseArgs } from './merkmale.mjs';
import { crossSections, SIGNALS, windowStats } from './faktor-wf.mjs';
import { sideBps } from './engine.mjs';
import { valueAt, bootstrapP } from './search.mjs';

export const VERSION = 'backtest2-trader-faktor-1.0.0';
export const RULES = Object.freeze({ maxRank: 1000, minNames: 10, fromYear: 2014, pHint: 0.10 });
export const SCORES = Object.freeze({ mom_gpa: ['momentum12_1', 'gpa'], mom_growth_roe: ['momentum12_1', 'revenueGrowthYoy', 'roe'], rs: ['rs6'] });
export const PORTFOLIOS = Object.freeze([
  { id: 'H1', label: 'Trendvorlage + Momentum + Bruttogewinn/Bilanz · 25 Titel', template: true, score: 'mom_gpa', n: 25, primary: true },
  { id: 'H1-50', label: 'Trendvorlage + Momentum + Bruttogewinn/Bilanz · 50 Titel', template: true, score: 'mom_gpa', n: 50 },
  { id: 'H2', label: 'Trendvorlage + Momentum + Umsatzwachstum + Eigenkapitalrendite · 25 Titel', template: true, score: 'mom_growth_roe', n: 25 },
  { id: 'H2-50', label: 'Trendvorlage + Momentum + Umsatzwachstum + Eigenkapitalrendite · 50 Titel', template: true, score: 'mom_growth_roe', n: 50 },
  { id: 'K1', label: 'Kontrolle: nur Trendvorlage (relative Stärke) · 25 Titel', template: true, score: 'rs', n: 25 },
  { id: 'K1-50', label: 'Kontrolle: nur Trendvorlage (relative Stärke) · 50 Titel', template: true, score: 'rs', n: 50 },
  { id: 'K2', label: 'Kontrolle: nur Momentum + Bruttogewinn/Bilanz · 25 Titel', template: false, score: 'mom_gpa', n: 25 },
  { id: 'K2-50', label: 'Kontrolle: nur Momentum + Bruttogewinn/Bilanz · 50 Titel', template: false, score: 'mom_gpa', n: 50 },
]);
export const PERIODS = Object.freeze([[2014, 2016], [2017, 2019], [2020, 2022], [2023, 9999]]);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Trendvorlage am Tagesindex t (nur Balken bis t); false ohne 253 Balken oder ohne Balken an t. */
export function trendTemplateAt(m, s, t) {
  const base = s * m.T, idx = [];
  for (let k = t; k >= 0 && idx.length < 253; k--) if (m.c[base + k] > 0) idx.push(k);
  if (idx.length < 253 || idx[0] !== t) return false;
  const c = m.c[base + t], sma50 = m.sma50[base + t], sma200 = m.sma200[base + t], sma200Prev = m.sma200[base + idx[21]];
  let s150 = 0; for (let j = 0; j < 150; j++) s150 += m.c[base + idx[j]];
  const sma150 = s150 / 150;
  let hi = -Infinity, lo = Infinity; for (let j = 1; j <= 252; j++) { hi = Math.max(hi, m.h[base + idx[j]]); lo = Math.min(lo, m.l[base + idx[j]]); }
  return c > sma50 && sma50 > sma150 && sma150 > sma200 && sma200 > sma200Prev && c >= 1.3 * lo && c >= 0.75 * hi;
}

/** Punktwert eines Titels: Mittel der Perzentile der Bausteine; NaN, wenn einer fehlt. */
export function scoreOf(x, r, parts) {
  let s = 0;
  for (const p of parts) { const v = x.P[r * x.K + SIGNALS.findIndex((q) => q[0] === p)]; if (!(v === v)) return NaN; s += v; }
  return s / parts.length;
}

/** Monatsreihe eines Depots nach Kosten. flags[e][r] = Trendvorlage erfüllt. Kasse = 0 %. */
export function portfolioSeries(xs, flags, pf, rules = RULES) {
  const parts = SCORES[pf.score], net = [], names = [], turn = [], candidates = [];
  let prev = new Map();
  xs.forEach((x, e) => {
    const cand = [];
    for (let r = 0; r < x.s.length; r++) {
      if (!(x.rank[r] <= rules.maxRank) || (pf.template && !flags[e][r])) continue;
      const v = scoreOf(x, r, parts); if (v === v) cand.push([v, r]);
    }
    cand.sort((a, b) => b[0] - a[0] || x.s[a[1]] - x.s[b[1]]);
    candidates.push(cand.length);
    const w = new Map();
    if (cand.length >= rules.minNames) { const q = Math.min(pf.n, cand.length); for (const [, r] of cand.slice(0, q)) w.set(x.s[r], [1 / q, x.r[r], x.adv[r]]); }
    let to = 0, cost = 0, ret = 0;
    for (const [s, [wt, r, adv]] of w) { const d = Math.abs(wt - (prev.get(s)?.[0] || 0)); to += d; cost += d * sideBps(adv) / 1e4; ret += wt * r; }
    for (const [s, [wt, , adv]] of prev) if (!w.has(s)) { to += wt; cost += wt * sideBps(adv) / 1e4; }
    net.push(ret - cost); names.push(w.size); turn.push(to); prev = w;
  });
  return { net, names, turnover: turn, candidates };
}

const ann = (rs) => (rs.length ? Math.exp(rs.reduce((a, r) => a + Math.log(1 + r), 0) / rs.length * 12) - 1 : null);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Auswertung aller Depots gegen SPY ab RULES.fromYear; bench: {SPY, QQQ, RSP} Monatsrenditen auf denselben Monaten. */
export function evaluate(xs, flags, bench, { rules = RULES, portfolios = PORTFOLIOS, draws = 4999 } = {}) {
  const months = xs.map((x) => x.date), yr = (i) => +months[i].slice(0, 4);
  const idx = months.map((_, i) => i).filter((i) => yr(i) >= rules.fromYear), spy = bench.SPY;
  const rows = portfolios.map((pf) => {
    const s = portfolioSeries(xs, flags, pf, rules), st = windowStats(s.net, spy, months, idx);
    const ex = idx.map((i) => s.net[i] - spy[i]);
    return { id: pf.id, label: pf.label, primary: !!pf.primary, ...st, pBootstrap: bootstrapP(ex, draws),
      avgNames: mean(idx.map((i) => s.names[i])), avgCandidates: mean(idx.map((i) => s.candidates[i])), avgTurnover: mean(idx.map((i) => s.turnover[i])),
      cashMonths: idx.filter((i) => s.names[i] === 0).length,
      periods: PERIODS.map(([a, b]) => { const k = idx.filter((i) => yr(i) >= a && yr(i) <= b); return k.length ? { years: [a, Math.min(b, yr(k.at(-1)))], excess: ann(k.map((i) => s.net[i])) - ann(k.map((i) => spy[i])) } : null; }).filter(Boolean) };
  });
  const by = Object.fromEntries(rows.map((r) => [r.id, r])), h = by.H1, k1 = by.K1, k2 = by.K2;
  const hint = !!(h && k1 && k2 && h.excess > 0 && h.pBootstrap < rules.pHint && h.cagr > k1.cagr && h.cagr > k2.cagr);
  return { window: [months[idx[0]], months[idx.at(-1)]], months: idx.length,
    benchmarks: Object.fromEntries(Object.entries(bench).map(([k, v]) => [k, { cagr: ann(idx.map((i) => v[i])) }])),
    portfolios: rows,
    verdict: { hint, text: hint ? 'Hinweis: H1 liegt nach Kosten vor SPY (p < 0,10) und vor beiden Kontrollen. Kein Beweis; vorwärts bestätigen.' : 'nicht belegt: H1 erfüllt die vorab gesetzte Regel nicht.',
      rule: 'H1 vor SPY nach Kosten mit Bootstrap-p < 0,10 UND Rendite über K1 (nur Muster) und K2 (nur Faktoren)',
      h1VsPattern: h && k1 ? h.cagr - k1.cagr : null, h1VsFactors: h && k2 ? h.cagr - k2.cagr : null } };
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');
const p3 = (x) => (x == null ? '–' : x.toFixed(3).replace('.', ','));

export function report(res) {
  const e = res.result, b = e.benchmarks;
  const L = ['# Trader-Muster mit Faktoren (Backtest 2.0, Stufe 4)' + (res.smoke ? ' – RAUCHTEST, kein Ergebnis' : ''), '',
    `**Forschung, nicht zertifiziert.** Nur für den Owner. ${e.window[0]} bis ${e.window[1]} (${e.months} Monate); acht vorab feste Depots, keine Auswahl; Kosten abgezogen; delistete Titel enthalten (${res.data.loaded} Titel geladen). Datenstand-Fingerabdruck \`${res.dataFingerprint}\`.`, '',
    `Vergleich auf denselben Monaten: SPY ${pct(b.SPY.cagr)} p. a., QQQ ${pct(b.QQQ.cagr)}, RSP ${pct(b.RSP.cagr)}.`, '',
    `## Urteil`, '', `**${e.verdict.text}**`, '', `Regel: ${e.verdict.rule}. H1 gegen nur Muster: ${pp(e.verdict.h1VsPattern)}; H1 gegen nur Faktoren: ${pp(e.verdict.h1VsFactors)}.`, '',
    '## Depots', '', '| Depot | Rendite p. a. | vs. SPY | max. Verlust | Jahre vor SPY | p | Titel | Kandidaten | Umschlag/Monat | Monate in Kasse |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of e.portfolios) L.push(`| ${r.primary ? '**' + r.label + '**' : r.label} | ${pct(r.cagr)} | ${pp(r.excess)} | ${pct(r.maxDrawdown)} | ${r.yearsAhead}/${r.years} | ${p3(r.pBootstrap)} | ${r.avgNames?.toFixed(0)} | ${r.avgCandidates?.toFixed(0)} | ${pct(r.avgTurnover)} | ${r.cashMonths} |`);
  L.push('', '## Teilzeiträume (Abstand zu SPY p. a.)', '', '| Depot | ' + e.portfolios[0].periods.map((p) => p.years.join('–')).join(' | ') + ' |', '|---|' + e.portfolios[0].periods.map(() => '---').join('|') + '|');
  for (const r of e.portfolios) L.push(`| ${r.id} | ${r.periods.map((p) => pp(p.excess)).join(' | ')} |`);
  L.push('', '## Lesehilfe', '',
    '- H1 ist die Hypothese. K1 und K2 zeigen, ob die Kombination mehr trägt als das Muster oder die Faktoren allein.',
    '- Die Regeln standen vor dem ersten Lauf fest (PROTOKOLL §4f), aber NACH Einsicht in Stufe 2 und 3: Dass Momentum + Bruttogewinn/Bilanz dort vorn lag, war bekannt. Ein positives Ergebnis ist deshalb ein Hinweis, der vorwärts bestätigt werden muss.',
    '- Monatliche Depots, keine Einzel-Trades mit Stopp: geprüft wird die Auswahl der Aktien, nicht die Ein- und Ausstiegsregeln der Methoden.',
    '- p ist einseitig für „Monatsüberrendite gegen SPY > 0“ (Block-Bootstrap).');
  return L.join('\n') + '\n';
}

async function main() {
  const a = parseArgs(process.argv);
  const { m, bench, counts, diagnostics, bundleOf } = loadInputs(a);
  const xs = crossSections(m, bundleOf);
  const flags = xs.map((x) => Uint8Array.from(x.s, (s) => (trendTemplateAt(m, s, x.t) ? 1 : 0)));
  const ends = monthEnds(m.dates).map((t) => m.dates[t]);
  const mret = (pts) => xs.map((x) => valueAt(pts, ends[ends.indexOf(x.date) + 1]) / valueAt(pts, x.date) - 1);
  const result = evaluate(xs, flags, { SPY: mret(bench.SPY), QQQ: mret(bench.QQQ), RSP: mret(bench.RSP) });
  const res = { schema: VERSION, label: 'Forschung, nicht zertifiziert', smoke: !!a.smoke, data: counts, dataFingerprint: diagnostics.dataFingerprint, result };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'trader-faktor.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'TRADER-FAKTOR.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
