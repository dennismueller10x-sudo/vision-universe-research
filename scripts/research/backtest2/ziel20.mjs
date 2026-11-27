#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 12 – „Was müsste man tun, um 20 % p. a. zu erreichen?“ Marktphase, Verlustbegrenzung, Nebenwerte, Hebel.
 * Forschung, nicht zertifiziert. Protokoll: docs/research/backtest2/PROTOKOLL.md §4n (vor dem ersten Lauf festgelegt).
 *
 * Anlass (Owner 27.11.2026): Vermutung, dass viele schlechte Trades die Rendite auffressen (Darvas, Turtle, Minervini), und Frage,
 * ob nur in bestimmten Marktphasen investiert zu sein das Ergebnis verbessert. Zielvorgabe: mindestens 20 % p. a.
 *
 * Sechs Grunddepots (laufen lassen wie Stufe 9: Kauf am Monatsultimo, Verkauf wenn Monatsschluss nicht über der 200-Tage-Linie),
 * je zwölf Varianten:
 *   BASIS      unverändert
 *   PHASE-KAUF neue Käufe nur, wenn SPY am Ultimo über seiner 200-Tage-Linie liegt
 *   PHASE-RAUS wie PHASE-KAUF, zusätzlich alles verkaufen, wenn SPY am Ultimo darunter liegt
 *   BREITE     neue Käufe nur, wenn mindestens die Hälfte der 1.000 größten Aktien über ihrer 200-Tage-Linie liegt
 *   STOPP-8    täglicher Verkauf zum Schluss, sobald die Position 8 % unter ihrem Einstand liegt
 *   NACHLAUF   täglicher Verkauf zum Schluss, sobald die Position 25 % unter ihrem höchsten Schluss seit Kauf liegt
 *   RAUS+STOPP PHASE-RAUS und STOPP-8
 *   NEBENWERTE Universum Rang 1.001 bis 3.000 statt 1 bis 1.000
 *   10-TITEL   10 statt 25 Plätze
 *   HEBEL      1,5-facher Einsatz, Kredit 4 % p. a.
 *   HEBEL-PHASE 1,5-fach nur in Monaten, die mit SPY über der 200-Tage-Linie beginnen, sonst 1-fach
 *   RAUS+HEBEL PHASE-RAUS mit 1,5-fach in guter Phase
 * Dazu je Grunddepot die Trade-Statistik (Anteil Verlierer, Summe der Verluste gegen Summe der Gewinne).
 *
 *   node scripts/research/backtest2/ziel20.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { monthEnds, loadInputs, parseArgs, forwardReturn } from './merkmale.mjs';
import { crossSections, windowStats } from './faktor-wf.mjs';
import { scoreOf } from './trader-faktor.mjs';
import { SCORES, patternFlags } from './trader-wf.mjs';
import { sideBps } from './engine.mjs';
import { valueAt, bootstrapP } from './search.mjs';

export const VERSION = 'backtest2-ziel20-1.0.0';
export const R = Object.freeze({ fromYear: 2014, slots: 25, hardStop: 0.08, trail: 0.25, breadthMin: 0.5, leverage: 1.5, financing: 0.04, smallRank: [1001, 3000],
  target: Object.freeze({ cagr: 0.20, withoutTop: 0.17, maxDrawdown: -0.40 }) });
export const BASES = Object.freeze([
  { id: 'FAKTOREN', label: 'Faktoren ohne Muster', pattern: 'NONE', score: 'mom_gpa_buyback' },
  { id: 'MINERVINI+F', label: 'Trendvorlage (Minervini) + Faktoren', pattern: 'MINERVINI', score: 'mom_gpa_buyback' },
  { id: 'TURTLE+F', label: '55-Tage-Ausbruch (Turtle) + Faktoren', pattern: 'TURTLE', score: 'mom_gpa_buyback' },
  { id: 'DARVASBOX+F', label: 'Darvas-Kasten + Faktoren', pattern: 'DARVASBOX', score: 'mom_gpa_buyback' },
  { id: 'DARVASBOX', label: 'nur Darvas-Kasten (relative Stärke)', pattern: 'DARVASBOX', score: 'rs' },
  { id: 'KULLAMAEGI', label: 'nur Ausbruchs-Setup (Kullamägi, relative Stärke)', pattern: 'KULLAMAEGI', score: 'rs' },
]);
export const VARIANTS = Object.freeze([
  { id: 'BASIS', label: 'unverändert' },
  { id: 'PHASE-KAUF', label: 'Käufe nur bei SPY über 200-Tage-Linie', regime: 'BUY', kind: 'SPY' },
  { id: 'PHASE-RAUS', label: 'bei SPY unter 200-Tage-Linie alles verkaufen', regime: 'OUT', kind: 'SPY' },
  { id: 'BREITE', label: 'Käufe nur bei breitem Markt (≥ 50 % über 200-Tage-Linie)', regime: 'BUY', kind: 'BREADTH' },
  { id: 'STOPP-8', label: 'täglicher Stopp 8 % unter Einstand', hard: true },
  { id: 'NACHLAUF', label: 'täglicher Stopp 25 % unter Höchststand', trail: true },
  { id: 'RAUS+STOPP', label: 'Marktphase raus + Stopp 8 %', regime: 'OUT', kind: 'SPY', hard: true },
  { id: 'NEBENWERTE', label: 'Rang 1.001 bis 3.000', small: true },
  { id: '10-TITEL', label: '10 statt 25 Titel', slots: 10 },
  { id: 'HEBEL', label: '1,5-fach, Kredit 4 %', lev: 'ALWAYS' },
  { id: 'HEBEL-PHASE', label: '1,5-fach nur in guter Marktphase', lev: 'REGIME' },
  { id: 'RAUS+HEBEL', label: 'Marktphase raus + 1,5-fach in guter Phase', regime: 'OUT', kind: 'SPY', lev: 'REGIME' },
]);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Marktlage je Ultimo: SPY über 200-Tage-Linie; Marktbreite = Anteil der Titel (Rang ≤ 1.000) über ihrer 200-Tage-Linie. */
export function regimes(m, xs) {
  return xs.map((x) => { let n = 0, up = 0; for (let r = 0; r < x.s.length; r++) { if (!(x.rank[r] <= 1000)) continue; const i = x.s[r] * m.T + x.t; n++; if (m.c[i] > m.sma200[i]) up++; }
    return { spy: m.spyOn200[x.t] === 1, breadth: n ? up / n : 0 }; });
}

/**
 * Depot ohne Zurückstellen mit optionaler Marktphase und täglichen Stopps.
 * spec: {pattern, score}; v: Variante; reg: regimes(); Liefert Monatsrenditen, Positionszahl, Trades.
 */
export function run(m, xs, flags, nextT, reg, spec, v = {}, { rules = R, exclude = null, rank = [1, 1000] } = {}) {
  const parts = SCORES[spec.score], slots = v.slots || rules.slots, net = [], count = [], trades = [], pos = new Map();
  let cash = 1;
  const fee = (i) => sideBps(m.adv[i] > 0 ? m.adv[i] : 1e6) / 1e4;
  const close = (s, p, date, i) => { cash += p.value * (1 - fee(i)); trades.push({ s, entry: p.entry, exit: date, cost: p.cost, value: p.value * (1 - fee(i)) }); pos.delete(s); };
  xs.forEach((x, e) => {
    const equity0 = cash + [...pos.values()].reduce((a, p) => a + p.value, 0);
    const good = v.regime ? (v.kind === 'BREADTH' ? reg[e].breadth >= rules.breadthMin : reg[e].spy) : true;
    for (const [s, p] of [...pos]) { const i = s * m.T + x.t, c = m.c[i]; if (!(c > 0) || !(c > m.sma200[i]) || (v.regime === 'OUT' && !good)) close(s, p, x.date, i); }
    if (good && pos.size < slots) {
      const cand = [], f = spec.pattern === 'NONE' ? null : flags[spec.pattern][e];
      for (let r = 0; r < x.s.length; r++) {
        const s = x.s[r], i = s * m.T + x.t;
        if (!(x.rank[r] >= rank[0] && x.rank[r] <= rank[1]) || (f && !f[r]) || pos.has(s) || (exclude && exclude.has(s)) || !(m.c[i] > m.sma200[i])) continue;
        const sc = scoreOf(x, r, parts); if (sc === sc) cand.push([sc, r]);
      }
      cand.sort((a, b) => b[0] - a[0] || x.s[a[1]] - x.s[b[1]]);
      const unit = equity0 / slots;
      for (const [, r] of cand) {
        if (pos.size >= slots || cash <= 1e-9) break;
        const spend = Math.min(unit, cash), val = spend * (1 - sideBps(x.adv[r]) / 1e4);
        cash -= spend; pos.set(x.s[r], { value: val, cost: spend, entry: x.date, basis: val, peak: val });
      }
    }
    /* Monat: ohne Stopps ein Schritt, mit Stopps Tag für Tag zum Schluss */
    for (const [s, p] of [...pos]) {
      const start = p.value;
      if (v.hard || v.trail) {
        let sold = false;
        for (let d = x.t + 1; d <= nextT[e]; d++) {
          const r = forwardReturn(m, s, x.t, d), val = start * (1 + (isNum(r) ? r : 0));
          if (val > p.peak) p.peak = val;
          if ((v.hard && val <= p.basis * (1 - rules.hardStop)) || (v.trail && val <= p.peak * (1 - rules.trail))) { p.value = val; close(s, p, m.dates[d], s * m.T + d); sold = true; break; }
        }
        if (sold) continue;
      }
      const r = forwardReturn(m, s, x.t, nextT[e]); p.value = start * (1 + (isNum(r) ? r : 0)); if (p.value > p.peak) p.peak = p.value;
    }
    net.push((cash + [...pos.values()].reduce((a, p) => a + p.value, 0)) / equity0 - 1); count.push(pos.size);
  });
  for (const [s, p] of pos) trades.push({ s, entry: p.entry, exit: null, cost: p.cost, value: p.value });
  return { net, count, trades };
}

/** Hebel auf die Monatsreihe: L-facher Einsatz, Kreditkosten auf den geliehenen Teil; Totalverlust begrenzt bei −100 %. */
export function levered(net, reg, mode, rules = R) {
  return net.map((r, e) => { const L = mode === 'ALWAYS' || reg[e].spy ? rules.leverage : 1; return Math.max(-1, L * r - (L - 1) * rules.financing / 12); });
}

export function tradeStats(trades) {
  const g = trades.map((t) => t.value / t.cost - 1), pnl = trades.map((t) => t.value - t.cost), win = g.filter((x) => x > 0), loss = g.filter((x) => x <= 0);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return { trades: g.length, loserShare: g.length ? loss.length / g.length : null, avgWin: avg(win), avgLoss: avg(loss), bigLoserShare: g.length ? g.filter((x) => x <= -0.2).length / g.length : null,
    sumGains: pnl.filter((x) => x > 0).reduce((a, b) => a + b, 0), sumLosses: pnl.filter((x) => x <= 0).reduce((a, b) => a + b, 0), doublers: g.filter((x) => x >= 1).length };
}

export function evaluate(m, big, small, spy, { rules = R, draws = 1999, nameOf = (s) => String(s), bases = BASES, variants = VARIANTS } = {}) {
  const cut = (d) => { const idx = d.xs.map((_, i) => i).filter((i) => +d.xs[i].date.slice(0, 4) >= rules.fromYear), xs = idx.map((i) => d.xs[i]);
    return { xs, flags: Object.fromEntries(Object.entries(d.flags).map(([k, a]) => [k, idx.map((i) => a[i])])), nextT: idx.map((i) => d.nextT[i]), reg: regimes(m, xs), months: xs.map((x) => x.date) }; };
  const B = cut(big), S = small ? cut(small) : null, spyOf = (w) => w.months.map((d) => spy.get(d));
  const rows = [], stats = [];
  for (const b of bases) for (const v of variants) {
    const w = v.small ? S : B; if (!w) continue;
    const opts = { rules, rank: v.small ? rules.smallRank : [1, 1000] }, sp = spyOf(w), all = w.months.map((_, i) => i);
    const lev = (net) => (v.lev ? levered(net, w.reg, v.lev, rules) : net);
    const a = run(m, w.xs, w.flags, w.nextT, w.reg, b, v, opts), net = lev(a.net), st = windowStats(net, sp, w.months, all);
    const by = new Map(); for (const t of a.trades) by.set(t.s, (by.get(t.s) || 0) + (t.value - t.cost));
    const top = [...by.entries()].sort((x, y) => y[1] - x[1])[0];
    const wo = top ? windowStats(lev(run(m, w.xs, w.flags, w.nextT, w.reg, b, v, { ...opts, exclude: new Set([top[0]]) }).net), sp, w.months, all) : null;
    const T = rules.target, hit = !!st && st.cagr >= T.cagr && !!wo && wo.cagr >= T.withoutTop && st.firstHalf > 0 && st.secondHalf > 0 && st.maxDrawdown >= T.maxDrawdown;
    rows.push({ base: b.id, baseLabel: b.label, variant: v.id, variantLabel: v.label, ...st, pBootstrap: st ? bootstrapP(net.map((r, i) => r - sp[i]), draws) : null,
      withoutTop: wo ? { ticker: nameOf(top[0]), cagr: wo.cagr } : null, avgPositions: a.count.reduce((x, y) => x + y, 0) / a.count.length, emptyMonths: a.count.filter((c) => c === 0).length, trades: a.trades.length, hit });
    if (v.id === 'BASIS' || v.id === 'STOPP-8' || v.id === 'PHASE-RAUS') stats.push({ base: b.id, baseLabel: b.label, variant: v.id, ...tradeStats(a.trades) });
  }
  const goodMonths = B.reg.filter((r) => r.spy).length;
  return { window: [B.months[0], B.months.at(-1)], months: B.months.length, spy: windowStats(spyOf(B), spyOf(B), B.months, B.months.map((_, i) => i)).cagr, goodMonths, rows, tradeStats: stats, hits: rows.filter((r) => r.hit).map((r) => r.baseLabel + ' · ' + r.variantLabel) };
}

const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const pp = (x) => (x == null || !Number.isFinite(x) ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' Pp');
const p3 = (x) => (x == null ? '–' : x.toFixed(3).replace('.', ','));
const f1 = (x) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(1).replace('.', ','));

export function report(res) {
  const e = res.result, T = R.target;
  const L = ['# Ziel 20 % p. a.: Marktphase, Verlustbegrenzung, Nebenwerte, Hebel (Backtest 2.0, Stufe 12)' + (res.smoke ? ' – RAUCHTEST, kein Ergebnis' : ''), '',
    `**Forschung, nicht zertifiziert.** Nur für den Owner. ${e.window[0]} bis ${e.window[1]} (${e.months} Monate, davon ${e.goodMonths} mit SPY über der 200-Tage-Linie); Kosten abgezogen; delistete Titel enthalten. SPY ${pct(e.spy)} p. a. Datenstand-Fingerabdruck \`${res.dataFingerprint}\`.`, '',
    `**Ziel erreicht und robust** (mind. ${pct(T.cagr)} p. a., ohne größten Gewinner mind. ${pct(T.withoutTop)}, beide Hälften vor SPY, größter Verlust höchstens ${pct(T.maxDrawdown)}): ${e.hits.length ? e.hits.join('; ') : 'keine Variante'}.`, ''];
  for (const b of [...new Set(e.rows.map((r) => r.base))]) {
    const rs = e.rows.filter((r) => r.base === b);
    L.push(`## ${rs[0].baseLabel}`, '', '| Variante | Rendite p. a. | vs. SPY | ohne größten Gewinner | max. Verlust | 1. Hälfte | 2. Hälfte | p | Positionen | leere Monate | Käufe | Ziel |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rs) L.push(`| ${r.variantLabel} | ${pct(r.cagr)} | ${pp(r.excess)} | ${r.withoutTop ? pct(r.withoutTop.cagr) + ' (ohne ' + r.withoutTop.ticker + ')' : '–'} | ${pct(r.maxDrawdown)} | ${pp(r.firstHalf)} | ${pp(r.secondHalf)} | ${p3(r.pBootstrap)} | ${f1(r.avgPositions)} | ${r.emptyMonths} | ${r.trades} | ${r.hit ? 'ja' : 'nein'} |`);
    L.push('');
  }
  L.push('## Fressen schlechte Trades die Rendite? (je abgeschlossener oder offener Position)', '', '| Depot | Variante | Positionen | Anteil Verlierer | Ø Gewinn | Ø Verlust | Anteil mit −20 % oder schlechter | Summe Gewinne | Summe Verluste | Verdoppler |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const s of e.tradeStats) L.push(`| ${s.baseLabel} | ${s.variant} | ${s.trades} | ${pct(s.loserShare)} | ${pct(s.avgWin)} | ${pct(s.avgLoss)} | ${pct(s.bigLoserShare)} | ${f1(s.sumGains)} | ${f1(s.sumLosses)} | ${s.doublers} |`);
  L.push('', '## Lesehilfe', '',
    '- „Summe Gewinne / Verluste“ in Vielfachen des Startkapitals. Liegt die Summe der Verluste nahe an der Summe der Gewinne, fressen die Verlierer die Rendite.',
    '- Hebel: 1,5-facher Einsatz mit 4 % Kreditkosten p. a. auf den geliehenen Teil. Der größte Verlust wächst mit.',
    '- 72 Varianten nach Einsicht in Stufe 2 bis 11. p ist nicht für die Zahl der Versuche korrigiert. Eine Variante, die das Ziel erreicht, ist ein Kandidat für den Vorwärtstest, kein Beleg.');
  return L.join('\n') + '\n';
}

async function main() {
  const a = parseArgs(process.argv);
  const { m, bench, diagnostics, bundleOf } = loadInputs(a);
  const endsT = monthEnds(m.dates), ends = endsT.map((t) => m.dates[t]);
  const pack = (xs) => ({ xs, flags: patternFlags(m, xs), nextT: xs.map((x) => endsT[ends.indexOf(x.date) + 1]) });
  const big = pack(crossSections(m, bundleOf)), small = pack(crossSections(m, bundleOf, { universe: { maxRank: R.smallRank[1], minPrice: 5 } }));
  const spy = new Map(small.xs.concat(big.xs).map((x) => [x.date, valueAt(bench.SPY, ends[ends.indexOf(x.date) + 1]) / valueAt(bench.SPY, x.date) - 1]));
  const result = evaluate(m, big, small, spy, { nameOf: (s) => String(m.ids[s]).replace(/^ref_/, '') });
  const res = { schema: VERSION, label: 'Forschung, nicht zertifiziert', smoke: !!a.smoke, dataFingerprint: diagnostics.dataFingerprint, result };
  fs.mkdirSync(a.out, { recursive: true });
  fs.writeFileSync(path.join(a.out, 'ziel20.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'ZIEL20.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
