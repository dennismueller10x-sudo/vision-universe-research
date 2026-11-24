#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 9 – Gewinner laufen lassen und Gewinner-Erkennung. Forschung, nicht zertifiziert.
 * Protokoll: docs/research/backtest2/PROTOKOLL.md §4k (vor dem ersten Lauf festgelegt). Daten wie Stufe 2 bis 8.
 *
 * Anlass (Owner 24.11.2026): Die Depots der Stufen 4 bis 8 wurden jeden Monat auf gleiche Gewichte zurückgestellt. Eine Aktie, die
 * sich vervielfacht, wurde dadurch laufend gestutzt, und seltene Muster ließen Geld ungenutzt. Die Bücher tun das Gegenteil:
 * kaufen, halten, solange der Trend läuft, verkaufen, wenn er bricht.
 *
 * Teil A – Depot ohne Zurückstellen („laufen lassen“):
 *   bis zu 25 Positionen; frei werdende Plätze besetzen die besten Kandidaten des Monats (Muster als Schranke, Rang nach Signal);
 *   jeder Kauf bekommt ein Fünfundzwanzigstel des Depotwerts (höchstens die vorhandene Kasse); KEIN monatliches Angleichen:
 *   Positionen wachsen mit ihrem Kurs. Verkauf nur, wenn am Monatsultimo der Schluss nicht mehr über der 200-Tage-Linie liegt
 *   (oder der Titel endet). Kasse 0 %. Kosten auf jeden Kauf und Verkauf.
 *   Acht feste Depots: je Muster (keines, Minervini, Turtle, Darvas-Kasten, Kullamägi) der Rang Momentum + Bruttogewinn/Bilanz +
 *   Rückkäufe; dazu für Minervini, Darvas-Kasten und Kullamägi „nur Muster“ (Rang relative Stärke).
 *   Ehrlichkeitsproben je Depot: derselbe Lauf OHNE die Aktie mit dem größten Gewinnbeitrag (sie wird nie gekauft), Anteil der fünf
 *   größten Positionen am Gesamtgewinn, Liste der größten Positionen.
 *
 * Teil B – Gewinner-Erkennung: „großer Gewinner“ = Titel des Universums, der in den folgenden 12 Monaten mindestens +100 % macht.
 *   Je Muster und für das beste Fünftel nach Signal: Wie viele der späteren Gewinner waren am Stichtag markiert (Trefferanteil),
 *   und wie viele der Markierten wurden Gewinner (Ausbeute), gegen die Grundquote aller Titel.
 *
 *   node scripts/research/backtest2/laufen-lassen.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { monthEnds, loadInputs, parseArgs, forwardReturn } from './merkmale.mjs';
import { crossSections, windowStats } from './faktor-wf.mjs';
import { scoreOf } from './trader-faktor.mjs';
import { SCORES, PATTERN_AT, patternFlags } from './trader-wf.mjs';
import { sideBps } from './engine.mjs';
import { valueAt, bootstrapP } from './search.mjs';

export const VERSION = 'backtest2-laufen-lassen-1.0.0';
export const R = Object.freeze({ maxRank: 1000, slots: 25, fromYear: 2014, winner: 1.0, winnerMonths: 12, topShare: 0.2 });
const NAME = { NONE: 'kein Muster', MINERVINI: 'Trendvorlage (Minervini)', TURTLE: '55-Tage-Ausbruch (Turtle)', DARVASBOX: 'Darvas-Kasten', KULLAMAEGI: 'Ausbruchs-Setup (Kullamägi)', DARVAS: 'Zweijahreshoch (Darvas)', WEINSTEIN: 'Stufe 2 (Weinstein)', POCKET: 'Pocket Pivot', GAPUP: 'Gap-Up', GRAIL: 'Holy Grail' };
export const PORTFOLIOS = Object.freeze([
  ...['NONE', 'MINERVINI', 'TURTLE', 'DARVASBOX', 'KULLAMAEGI'].map((p) => ({ id: p + '+F', label: NAME[p] + ' · Momentum + Bruttogewinn/Bilanz + Rückkäufe · laufen lassen', pattern: p, score: 'mom_gpa_buyback' })),
  ...['MINERVINI', 'DARVASBOX', 'KULLAMAEGI'].map((p) => ({ id: p, label: 'nur ' + NAME[p] + ' (relative Stärke) · laufen lassen', pattern: p, score: 'rs' })),
]);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Depot ohne Zurückstellen. xs: Querschnitte; flags: Muster je Monat; nextT[e]: Tagesindex des folgenden Ultimos.
 * exclude: Set von Titeln, die nie gekauft werden. Liefert Monatsrenditen des Depotwerts und die Positionsliste.
 */
export function drift(m, xs, flags, nextT, spec, { rules = R, exclude = null } = {}) {
  const parts = SCORES[spec.score], net = [], count = [], trades = [];
  const pos = new Map(); let cash = 1;
  xs.forEach((x, e) => {
    const equity0 = cash + [...pos.values()].reduce((a, p) => a + p.value, 0);
    /* Verkauf am Ultimo: Schluss nicht mehr über der 200-Tage-Linie oder kein Balken */
    for (const [s, p] of [...pos]) {
      const i = s * m.T + x.t, c = m.c[i];
      if (!(c > 0) || !(c > m.sma200[i])) { cash += p.value * (1 - sideBps(m.adv[i] > 0 ? m.adv[i] : 1e6) / 1e4); trades.push({ s, entry: p.entry, exit: x.date, cost: p.cost, value: p.value }); pos.delete(s); }
    }
    /* Kauf: freie Plätze mit den besten Kandidaten, je ein Fünfundzwanzigstel des Depotwerts */
    if (pos.size < rules.slots) {
      const cand = [], f = spec.pattern === 'NONE' ? null : flags[spec.pattern][e];
      for (let r = 0; r < x.s.length; r++) {
        const s = x.s[r], i = s * m.T + x.t;
        if (!(x.rank[r] <= rules.maxRank) || (f && !f[r]) || pos.has(s) || (exclude && exclude.has(s)) || !(m.c[i] > m.sma200[i])) continue;
        const v = scoreOf(x, r, parts); if (v === v) cand.push([v, r]);
      }
      cand.sort((a, b) => b[0] - a[0] || x.s[a[1]] - x.s[b[1]]);
      const unit = equity0 / rules.slots;
      for (const [, r] of cand) {
        if (pos.size >= rules.slots || cash <= 1e-9) break;
        const spend = Math.min(unit, cash), fee = spend * sideBps(x.adv[r]) / 1e4;
        cash -= spend; pos.set(x.s[r], { value: spend - fee, cost: spend, entry: x.date });
      }
    }
    const before = cash + [...pos.values()].reduce((a, p) => a + p.value, 0);
    for (const [s, p] of pos) { const r = forwardReturn(m, s, x.t, nextT[e]); p.value *= 1 + (isNum(r) ? r : 0); }
    const after = cash + [...pos.values()].reduce((a, p) => a + p.value, 0);
    /* Monatsrendite einschließlich der Kosten dieses Ultimos (equity0 = Wert vor Verkäufen und Käufen) */
    net.push(after / equity0 - 1); count.push(pos.size);
    void before;
  });
  for (const [s, p] of pos) trades.push({ s, entry: p.entry, exit: null, cost: p.cost, value: p.value });
  return { net, count, trades };
}

const ann = (rs) => (rs.length ? Math.exp(rs.reduce((a, r) => a + Math.log(1 + r), 0) / rs.length * 12) - 1 : null);
const monthsBetween = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));

export function evaluate(m, xs, flags, nextT, bench, { rules = R, draws = 4999, nameOf = (s) => String(s) } = {}) {
  const months = xs.map((x) => x.date), yr = (i) => +months[i].slice(0, 4), idx = months.map((_, i) => i).filter((i) => yr(i) >= rules.fromYear), spy = bench.SPY;
  const from = idx[0], sub = xs.slice(from), subFlags = Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, v.slice(from)])), subNext = nextT.slice(from), subMonths = months.slice(from), subSpy = spy.slice(from);
  const all = subMonths.map((_, i) => i), last = subMonths.at(-1);
  const statsOf = (run) => ({ ...windowStats(run.net, subSpy, subMonths, all), pBootstrap: bootstrapP(run.net.map((r, i) => r - subSpy[i]), draws) });
  const rows = PORTFOLIOS.map((pf) => {
    const run = drift(m, sub, subFlags, subNext, pf, { rules }), st = statsOf(run);
    /* Gewinnbeitrag je Titel über alle seine Positionen (in Einheiten des Startkapitals) */
    const by = new Map(); for (const t of run.trades) by.set(t.s, (by.get(t.s) || 0) + (t.value - t.cost));
    const contrib = [...by.entries()].sort((a, b) => b[1] - a[1]), gain = contrib.reduce((a, c) => a + c[1], 0), top = contrib[0];
    const without = top ? statsOf(drift(m, sub, subFlags, subNext, pf, { rules, exclude: new Set([top[0]]) })) : null;
    const hold = run.trades.map((t) => monthsBetween(t.entry, t.exit || last));
    return { id: pf.id, label: pf.label, ...st, avgPositions: run.count.reduce((a, b) => a + b, 0) / run.count.length, emptyMonths: run.count.filter((c) => c === 0).length,
      trades: run.trades.length, avgHoldMonths: hold.length ? hold.reduce((a, b) => a + b, 0) / hold.length : null,
      top5ShareOfGain: gain > 0 ? contrib.slice(0, 5).reduce((a, c) => a + c[1], 0) / gain : null,
      withoutTop: without ? { ticker: nameOf(top[0]), cagr: without.cagr, excess: without.excess, maxDrawdown: without.maxDrawdown } : null,
      topPositions: run.trades.slice().sort((a, b) => b.value / b.cost - a.value / a.cost).slice(0, 5).map((t) => ({ ticker: nameOf(t.s), entry: t.entry, exit: t.exit, multiple: t.value / t.cost })) };
  });
  return { window: [subMonths[0], last], months: subMonths.length, benchmarks: Object.fromEntries(Object.entries(bench).map(([k, v]) => [k, { cagr: ann(v.slice(from)) }])), portfolios: rows };
}

/** Teil B: Erkennung späterer Gewinner (mind. +100 % in 12 Monaten) je Muster und für das beste Fünftel nach Signal. */
export function winnerCapture(m, xs, flags, { rules = R } = {}) {
  const keys = [...Object.keys(PATTERN_AT), 'SIGNAL'], acc = Object.fromEntries(keys.map((k) => [k, { flagged: 0, hits: 0 }]));
  let total = 0, winners = 0;
  xs.forEach((x, e) => {
    if (+x.date.slice(0, 4) < rules.fromYear || e + rules.winnerMonths >= xs.length) return;
    const tn = xs[e + rules.winnerMonths].t, sc = [];
    for (let r = 0; r < x.s.length; r++) if (x.rank[r] <= rules.maxRank) { const v = scoreOf(x, r, SCORES.mom_gpa_buyback); if (v === v) sc.push(v); }
    sc.sort((a, b) => b - a); const cut = sc.length ? sc[Math.max(0, Math.floor(sc.length * rules.topShare) - 1)] : Infinity;
    for (let r = 0; r < x.s.length; r++) {
      if (!(x.rank[r] <= rules.maxRank)) continue;
      const f = forwardReturn(m, x.s[r], x.t, tn); if (!isNum(f)) continue;
      const win = f >= rules.winner; total++; if (win) winners++;
      for (const k of Object.keys(PATTERN_AT)) if (flags[k][e][r]) { acc[k].flagged++; if (win) acc[k].hits++; }
      const v = scoreOf(x, r, SCORES.mom_gpa_buyback); if (v === v && v >= cut) { acc.SIGNAL.flagged++; if (win) acc.SIGNAL.hits++; }
    }
  });
  const base = total ? winners / total : null;
  return { titleMonths: total, winners, baseRate: base, rows: keys.map((k) => ({ key: k, label: k === 'SIGNAL' ? 'Bestes Fünftel nach Momentum + Bruttogewinn/Bilanz + Rückkäufe' : NAME[k], flagged: acc[k].flagged,
    yield: acc[k].flagged ? acc[k].hits / acc[k].flagged : null, capture: winners ? acc[k].hits / winners : null, lift: acc[k].flagged && base ? acc[k].hits / acc[k].flagged / base : null })) };
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');
const p3 = (x) => (x == null ? '–' : x.toFixed(3).replace('.', ','));
const f1 = (x) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(1).replace('.', ','));

export function report(res) {
  const e = res.result, b = e.benchmarks, w = res.winners;
  const L = ['# Gewinner laufen lassen und Gewinner-Erkennung (Backtest 2.0, Stufe 9)' + (res.smoke ? ' – RAUCHTEST, kein Ergebnis' : ''), '',
    `**Forschung, nicht zertifiziert.** Nur für den Owner. ${e.window[0]} bis ${e.window[1]} (${e.months} Monate); Kosten abgezogen; delistete Titel enthalten (${res.data.loaded} Titel geladen). Datenstand-Fingerabdruck \`${res.dataFingerprint}\`.`, '',
    `Vergleich auf denselben Monaten: SPY ${pct(b.SPY.cagr)} p. a., QQQ ${pct(b.QQQ.cagr)}, RSP ${pct(b.RSP.cagr)}.`, '',
    '## Teil A: Depots ohne Zurückstellen (kaufen, halten bis der Kurs unter die 200-Tage-Linie fällt)', '',
    '| Depot | Rendite p. a. | vs. SPY | max. Verlust | Jahre vor SPY | p | ohne größten Gewinner | Anteil Top 5 am Gewinn | Positionen | Haltedauer (Mon.) | Käufe | leere Monate |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of e.portfolios) L.push(`| ${r.label} | ${pct(r.cagr)} | ${pp(r.excess)} | ${pct(r.maxDrawdown)} | ${r.yearsAhead}/${r.years} | ${p3(r.pBootstrap)} | ${r.withoutTop ? pct(r.withoutTop.cagr) + ' (ohne ' + r.withoutTop.ticker + ')' : '–'} | ${pct(r.top5ShareOfGain)} | ${f1(r.avgPositions)} | ${f1(r.avgHoldMonths)} | ${r.trades} | ${r.emptyMonths} |`);
  L.push('', '### Größte Positionen je Depot (Vielfaches des Einsatzes)', '');
  for (const r of e.portfolios) L.push(`- **${r.id}:** ` + r.topPositions.map((t) => `${t.ticker} ×${f1(t.multiple)} (${t.entry.slice(0, 7)} bis ${t.exit ? t.exit.slice(0, 7) : 'offen'})`).join(', '));
  L.push('', `## Teil B: Wie gut erkennen die Muster spätere Gewinner (mindestens +100 % in 12 Monaten)?`, '',
    `${w.titleMonths} Titel-Monate, davon ${w.winners} Gewinner: Grundquote ${pct(w.baseRate)}.`, '',
    '| Markierung | markiert | davon wurden Gewinner (Ausbeute) | gegenüber Grundquote | Anteil aller Gewinner, der markiert war |', '|---|---|---|---|---|');
  for (const r of w.rows) L.push(`| ${r.label} | ${r.flagged} | ${pct(r.yield)} | ×${f1(r.lift)} | ${pct(r.capture)} |`);
  L.push('', '## Lesehilfe', '',
    '- Teil A stellt nie zurück: eine Position wächst mit ihrem Kurs und wird erst verkauft, wenn der Monatsschluss unter der 200-Tage-Linie liegt. Das Ergebnis hängt deshalb absichtlich stärker an einzelnen Gewinnern; „ohne größten Gewinner“ zeigt, wie viel.',
    '- Teil B: „Ausbeute“ ist der Anteil der markierten Titel, die sich danach mindestens verdoppelten. Eine Ausbeute von 10 % heißt, dass 9 von 10 markierten Titeln es nicht taten.',
    '- Die Regeln standen vor dem ersten Lauf fest (PROTOKOLL §4k), aber nach Einsicht in Stufe 2 bis 8. p ist nicht für die Zahl der Versuche korrigiert. Ein gutes Ergebnis ist ein Hinweis, kein Beleg.');
  return L.join('\n') + '\n';
}

async function main() {
  const a = parseArgs(process.argv);
  const { m, bench, counts, diagnostics, bundleOf } = loadInputs(a);
  const xs = crossSections(m, bundleOf), flags = patternFlags(m, xs);
  const endsT = monthEnds(m.dates), ends = endsT.map((t) => m.dates[t]);
  const nextT = xs.map((x) => endsT[ends.indexOf(x.date) + 1]);
  const mret = (pts) => xs.map((x) => valueAt(pts, ends[ends.indexOf(x.date) + 1]) / valueAt(pts, x.date) - 1);
  const result = evaluate(m, xs, flags, nextT, { SPY: mret(bench.SPY), QQQ: mret(bench.QQQ), RSP: mret(bench.RSP) }, { nameOf: (s) => String(m.ids[s]).replace(/^ref_/, '') });
  const res = { schema: VERSION, label: 'Forschung, nicht zertifiziert', smoke: !!a.smoke, data: counts, dataFingerprint: diagnostics.dataFingerprint, result, winners: winnerCapture(m, xs, flags) };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'laufen-lassen.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'LAUFEN-LASSEN.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
