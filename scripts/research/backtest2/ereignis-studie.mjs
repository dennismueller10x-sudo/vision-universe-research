#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 11 – Ereignisstudie: Was machten markierte Aktien NACH dem Muster, verglichen mit allen Aktien am selben Tag?
 * Forschung, nicht zertifiziert. Protokoll: docs/research/backtest2/PROTOKOLL.md §4m (vor dem ersten Lauf festgelegt).
 *
 * Anlass: Seltene Muster (Kullamägi, Holy Grail, Gap-Up, Darvas-Kasten) lassen ein Monatsdepot oft leer; als Depot gemessen sehen sie
 * schlecht aus, obwohl das einzelne Ereignis gut sein kann. Diese Stufe misst das Ereignis selbst.
 *
 * Je Monatsultimo und Horizont (1, 3, 6, 12 Monate): Rendite der markierten Titel minus Rendite aller Titel des Universums (größte
 * 1.000) am selben Ultimo – als Mittel und als Median. Danach Mittel über die Monate (jeder Monat zählt gleich, damit eine Häufung
 * von Ereignissen nicht doppelt zählt). t-Wert mit um die Überlappung gekürzter Monatszahl (n / Horizont).
 * Zusätzlich je Muster die Teilmenge „markiert UND bestes Fünftel nach Momentum + Bruttogewinn/Bilanz + Rückkäufe“.
 *
 *   node scripts/research/backtest2/ereignis-studie.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadInputs, parseArgs, forwardReturn } from './merkmale.mjs';
import { crossSections } from './faktor-wf.mjs';
import { scoreOf } from './trader-faktor.mjs';
import { SCORES, PATTERN_AT, patternFlags } from './trader-wf.mjs';

export const VERSION = 'backtest2-ereignis-studie-1.0.0';
export const R = Object.freeze({ maxRank: 1000, fromYear: 2014, splitYear: 2020, horizons: [1, 3, 6, 12], topShare: 0.2, minFlagged: 3, tMin: 2 });
const NAME = { MINERVINI: 'Trendvorlage (Minervini)', TURTLE: '55-Tage-Ausbruch (Turtle)', DARVASBOX: 'Darvas-Kasten', KULLAMAEGI: 'Ausbruchs-Setup (Kullamägi)', DARVAS: 'Zweijahreshoch (Darvas)', WEINSTEIN: 'Stufe 2 (Weinstein)', POCKET: 'Pocket Pivot', GAPUP: 'Gap-Up', GRAIL: 'Holy Grail' };
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

export function study(m, xs, flags, { rules = R } = {}) {
  const keys = Object.keys(PATTERN_AT).filter((k) => flags[k]), groups = keys.flatMap((k) => [k, k + '+F']);
  const acc = Object.fromEntries(groups.map((g) => [g, Object.fromEntries(rules.horizons.map((h) => [h, []]))]));
  xs.forEach((x, e) => {
    if (+x.date.slice(0, 4) < rules.fromYear) return;
    const rows = []; for (let r = 0; r < x.s.length; r++) if (x.rank[r] <= rules.maxRank) rows.push(r);
    const sc = rows.map((r) => scoreOf(x, r, SCORES.mom_gpa_buyback)).filter((v) => v === v).sort((a, b) => b - a);
    const cut = sc.length ? sc[Math.max(0, Math.floor(sc.length * rules.topShare) - 1)] : Infinity;
    for (const h of rules.horizons) {
      if (e + h >= xs.length) continue;
      const tn = xs[e + h].t, f = new Map();
      for (const r of rows) { const v = forwardReturn(m, x.s[r], x.t, tn); if (isNum(v)) f.set(r, v); }
      if (f.size < 50) continue;
      const all = [...f.values()], uMean = mean(all), uMed = median(all);
      for (const k of keys) for (const withF of [false, true]) {
        const got = [];
        for (const [r, v] of f) { if (!flags[k][e][r]) continue; if (withF) { const s = scoreOf(x, r, SCORES.mom_gpa_buyback); if (!(s === s && s >= cut)) continue; } got.push(v); }
        if (got.length < rules.minFlagged) continue;
        acc[k + (withF ? '+F' : '')][h].push({ date: x.date, n: got.length, dMean: mean(got) - uMean, dMed: median(got) - uMed, hit: got.filter((v) => v > uMed).length / got.length });
      }
    }
  });
  const rowsOut = groups.map((g) => {
    const base = g.replace('+F', ''), per = Object.fromEntries(rules.horizons.map((h) => {
      const a = acc[g][h], d = a.map((o) => o.dMean), mu = mean(d);
      const sd = d.length > 1 ? Math.sqrt(d.reduce((s, v) => s + (v - mu) ** 2, 0) / (d.length - 1)) : null, nEff = d.length / h;
      const half = (keep) => mean(a.filter((o) => keep(+o.date.slice(0, 4))).map((o) => o.dMean));
      return [h, { months: a.length, events: a.reduce((s, o) => s + o.n, 0), excessMean: mu, excessMedian: mean(a.map((o) => o.dMed)), hitRate: mean(a.map((o) => o.hit)),
        t: sd > 0 && nEff > 1 ? mu / (sd / Math.sqrt(nEff)) : null, early: half((y) => y < rules.splitYear), late: half((y) => y >= rules.splitYear) }];
    }));
    const okAt = (h) => { const p = per[h]; return p && p.excessMean > 0 && p.excessMedian > 0 && p.t > rules.tMin && p.early > 0 && p.late > 0; };
    return { key: g, label: NAME[base] + (g.endsWith('+F') ? ' + bestes Fünftel Faktoren' : ''), per, notable: okAt(3) && okAt(12) };
  });
  return { horizons: rules.horizons, rows: rowsOut };
}

const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');
const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(0) + ' %');
const f1 = (x) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(1).replace('.', ','));

export function report(res) {
  const e = res.result;
  const L = ['# Ereignisstudie: Was machten markierte Aktien nach dem Muster? (Backtest 2.0, Stufe 11)' + (res.smoke ? ' – RAUCHTEST, kein Ergebnis' : ''), '',
    `**Forschung, nicht zertifiziert.** Nur für den Owner. Ab 2014, größte 1.000 US-Aktien, delistete Titel enthalten. Ohne Kosten (Vergleich je Ereignis, kein Depot). Datenstand-Fingerabdruck \`${res.dataFingerprint}\`.`, '',
    'Auffällig nach der vorab festgelegten Regel: ' + (e.rows.filter((r) => r.notable).map((r) => r.label).join('; ') || 'kein Muster') + '.', ''];
  for (const h of e.horizons) {
    L.push(`## ${h} Monat${h > 1 ? 'e' : ''} nach dem Muster`, '', '| Muster | Ereignisse | Monate | Vorsprung (Mittel) | Vorsprung (Median) | über dem Median aller | t | 2014–2019 | ab 2020 |', '|---|---|---|---|---|---|---|---|---|');
    for (const r of e.rows) { const p = r.per[h]; L.push(`| ${r.label} | ${p.events} | ${p.months} | ${pp(p.excessMean)} | ${pp(p.excessMedian)} | ${pct(p.hitRate)} | ${f1(p.t)} | ${pp(p.early)} | ${pp(p.late)} |`); }
    L.push('');
  }
  L.push('## Lesehilfe', '',
    '- „Vorsprung“ ist die Rendite der markierten Aktien minus die Rendite aller Aktien des Universums am selben Stichtag, gemittelt über die Monate. Der Median zeigt die typische Aktie, das Mittel wird von einzelnen Ausreißern gezogen.',
    '- „über dem Median aller“: Anteil der markierten Aktien, die besser liefen als die mittlere Aktie. 50 % ist Zufall.',
    '- t ist um die Überlappung der Zeiträume gekürzt. Auffällig heißt: nach 3 und nach 12 Monaten Mittel und Median positiv, t über 2 und in beiden Hälften positiv.',
    '- Gemessen wird am Monatsultimo. Ein Ereignis mitten im Monat wird erst am Ultimo gezählt; ein Einstieg am Ereignistag selbst ist hier nicht abgebildet.');
  return L.join('\n') + '\n';
}

async function main() {
  const a = parseArgs(process.argv);
  const { m, diagnostics, bundleOf } = loadInputs(a);
  const xs = crossSections(m, bundleOf), flags = patternFlags(m, xs);
  const res = { schema: VERSION, label: 'Forschung, nicht zertifiziert', smoke: !!a.smoke, dataFingerprint: diagnostics.dataFingerprint, result: study(m, xs, flags) };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'ereignis-studie.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'EREIGNIS-STUDIE.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
