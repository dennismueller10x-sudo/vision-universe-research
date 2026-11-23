#!/usr/bin/env node
/**
 * Backtest 2.0, Stufe 6 – Kullamägi, Pocket Pivot, Gap-Up, Holy Grail und Darvas-Kasten mit Faktoren. Forschung, nicht zertifiziert.
 * Protokoll: docs/research/backtest2/PROTOKOLL.md §4h (vor dem ersten Lauf festgelegt). Daten und Depotführung wie Stufe 4 und 5.
 *
 * Diese Methoden sind Ereignis-Methoden. Geprüft wird hier nicht ihr Einstieg im Tagesverlauf, sondern die AUSWAHL: Aktien, bei
 * denen das Ereignis in den letzten 21 Sitzungen eintrat und noch gilt (Tagesbalken mit Umsatz, nur Balken bis t).
 *
 *   KULLAMAEGI   Ausbruchs-Setup: mindestens +30 % in 63 Sitzungen, Schluss höchstens 10 % unter dem 63-Tage-Hoch, die
 *                Spanne der letzten 10 Sitzungen höchstens 15 % des Schlusses, Schluss über dem 20-Tage-Durchschnitt
 *   POCKET       Pocket Pivot (Morales/Kacher): in den letzten 21 Sitzungen ein Tag mit höherem Schluss als am Vortag, dessen
 *                Umsatz über dem höchsten Umsatz aller Abwärtstage der 10 Sitzungen davor liegt, Schluss an dem Tag über der
 *                50-Tage-Linie; heute Schluss nicht unter dem Tief dieses Tages
 *   GAPUP        Buyable Gap-Up: in den letzten 21 Sitzungen ein Tag mit Tief über dem Vortageshoch, Eröffnung mindestens
 *                4 % über dem Vortagesschluss und Umsatz mindestens das 1,5-Fache des 50-Tage-Durchschnitts; heute Schluss
 *                nicht unter dem Tief dieses Tages
 *   GRAIL        Holy Grail (Raschke): ADX(14) über 30 mit +DI über −DI, in den letzten 5 Sitzungen ein Tief am oder unter
 *                dem 20-Tage-EMA, Schluss heute am oder über dem EMA
 *   DARVASBOX    zweiter Versuch zu Darvas, nach Einsicht in Stufe 5 (dort trug „neues Zweijahreshoch“ nicht): Schluss
 *                höchstens 10 % unter dem höchsten Hoch der gesamten verfügbaren Historie (mindestens 756 Balken), und in den
 *                letzten 5 Sitzungen ein Schluss über dem höchsten Hoch der 15 Sitzungen davor mit Umsatz mindestens das
 *                1,5-Fache des 50-Tage-Durchschnitts (Ausbruch aus dem Kasten mit Umsatz)
 *
 * Je Muster zwei Depots mit 25 Titeln („+ Faktoren“ nach Momentum 12-1 + Bruttogewinn je Bilanzsumme, „nur Muster“ nach
 * relativer Stärke 6 Monate), dazu „nur Faktoren“. Urteil je Muster mit Holm über die fünf Hypothesen (trader-familie.mjs#evaluate).
 *
 *   node scripts/research/backtest2/trader-ereignis.mjs --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out DIR [--smoke]
 */
import fs from 'node:fs';
import path from 'node:path';
import { monthEnds, loadInputs, parseArgs } from './merkmale.mjs';
import { crossSections } from './faktor-wf.mjs';
import { barsBack, evaluate as evaluateFamily, report as familyReport } from './trader-familie.mjs';
import { valueAt } from './search.mjs';

export const VERSION = 'backtest2-trader-ereignis-1.0.0';
export const E = Object.freeze({ window: 21, kkRet: 0.30, kkLook: 63, kkBelowHigh: 0.90, kkRange: 0.15, kkTight: 10, ppDown: 10, gapOpen: 0.04, volMult: 1.5, volAvg: 50,
  adx: 14, adxMin: 30, ema: 20, emaWarm: 100, touch: 5, boxHistory: 756, boxBelowTop: 0.90, boxLook: 15, boxWindow: 5 });
export const PATTERNS = Object.freeze(['KULLAMAEGI', 'POCKET', 'GAPUP', 'GRAIL', 'DARVASBOX']);
export const LABEL = Object.freeze({ KULLAMAEGI: 'Ausbruchs-Setup (Kullamägi)', POCKET: 'Pocket Pivot (Morales/Kacher)', GAPUP: 'Buyable Gap-Up (Morales/Kacher)', GRAIL: 'Holy Grail (Raschke)', DARVASBOX: 'Kasten-Ausbruch am Allzeithoch mit Umsatz (Darvas, 2. Versuch)' });
export const PORTFOLIOS = Object.freeze([
  ...PATTERNS.flatMap((p) => [
    { id: p + '+F', label: LABEL[p] + ' + Momentum + Bruttogewinn/Bilanz', pattern: p, score: 'mom_gpa' },
    { id: p, label: 'Kontrolle: nur ' + LABEL[p], pattern: p, score: 'rs' },
  ]),
  { id: 'FAKTOREN', label: 'Kontrolle: nur Momentum + Bruttogewinn/Bilanz', pattern: null, score: 'mom_gpa' },
]);

const avgVol = (m, base, idx, from, n) => { let s = 0; for (let k = from; k < from + n; k++) s += m.v[base + idx[k]] || 0; return s / n; };

export function kullamaegiAt(m, s, t, e = E) {
  const idx = barsBack(m, s, t, e.kkLook + 1); if (!idx) return false;
  const base = s * m.T, c = m.c[base + t];
  let hi = -Infinity; for (let k = 0; k <= e.kkLook; k++) hi = Math.max(hi, m.h[base + idx[k]]);
  let h10 = -Infinity, l10 = Infinity, s20 = 0;
  for (let k = 0; k < e.kkTight; k++) { h10 = Math.max(h10, m.h[base + idx[k]]); l10 = Math.min(l10, m.l[base + idx[k]]); }
  for (let k = 0; k < 20; k++) s20 += m.c[base + idx[k]];
  return c / m.c[base + idx[e.kkLook]] - 1 >= e.kkRet && c >= e.kkBelowHigh * hi && (h10 - l10) / c <= e.kkRange && c > s20 / 20;
}

export function pocketAt(m, s, t, e = E) {
  const idx = barsBack(m, s, t, e.window + e.ppDown + 1); if (!idx) return false;
  const base = s * m.T, c = m.c[base + t];
  for (let j = 0; j < e.window; j++) {
    const i = base + idx[j];
    if (!(m.c[i] > m.c[base + idx[j + 1]]) || !(m.c[i] > m.sma50[i])) continue;
    let maxDown = 0;
    for (let k = j + 1; k <= j + e.ppDown; k++) if (m.c[base + idx[k]] < m.c[base + idx[k + 1]]) maxDown = Math.max(maxDown, m.v[base + idx[k]] || 0);
    if (maxDown > 0 && m.v[i] > maxDown && c >= m.l[i]) return true;
  }
  return false;
}

export function gapUpAt(m, s, t, e = E) {
  const idx = barsBack(m, s, t, e.window + e.volAvg + 1); if (!idx) return false;
  const base = s * m.T, c = m.c[base + t];
  for (let j = 0; j < e.window; j++) {
    const i = base + idx[j], p = base + idx[j + 1];
    if (m.l[i] > m.h[p] && m.o[i] / m.c[p] - 1 >= e.gapOpen && m.v[i] >= e.volMult * avgVol(m, base, idx, j + 1, e.volAvg) && c >= m.l[i]) return true;
  }
  return false;
}

/** ADX(14) nach Wilder und +DI/−DI am letzten Balken; EMA 20 je Balken. bars = Indizes alt -> neu. */
export function adxEma(m, s, bars, e = E) {
  const base = s * m.T, n = bars.length, a = 2 / (e.ema + 1);
  let ema = m.c[base + bars[0]], tr = 0, pdm = 0, ndm = 0, adx = null, dxSum = 0, dxN = 0, pdi = 0, ndi = 0;
  const emas = [ema];
  for (let k = 1; k < n; k++) {
    const i = base + bars[k], p = base + bars[k - 1];
    ema = a * m.c[i] + (1 - a) * ema; emas.push(ema);
    const up = m.h[i] - m.h[p], dn = m.l[p] - m.l[i], t1 = Math.max(m.h[i] - m.l[i], Math.abs(m.h[i] - m.c[p]), Math.abs(m.l[i] - m.c[p]));
    const P = up > dn && up > 0 ? up : 0, N = dn > up && dn > 0 ? dn : 0;
    if (k <= e.adx) { tr += t1; pdm += P; ndm += N; } else { tr = tr - tr / e.adx + t1; pdm = pdm - pdm / e.adx + P; ndm = ndm - ndm / e.adx + N; }
    if (k >= e.adx && tr > 0) {
      pdi = 100 * pdm / tr; ndi = 100 * ndm / tr;
      const dx = pdi + ndi > 0 ? 100 * Math.abs(pdi - ndi) / (pdi + ndi) : 0;
      if (adx === null) { dxSum += dx; dxN++; if (dxN === e.adx) adx = dxSum / e.adx; } else adx = (adx * (e.adx - 1) + dx) / e.adx;
    }
  }
  return { adx, pdi, ndi, emas };
}

export function grailAt(m, s, t, e = E) {
  const idx = barsBack(m, s, t, e.emaWarm); if (!idx) return false;
  const bars = idx.slice().reverse(), r = adxEma(m, s, bars, e), base = s * m.T, n = bars.length;
  if (r.adx === null || !(r.adx > e.adxMin) || !(r.pdi > r.ndi)) return false;
  let touched = false; for (let k = n - e.touch; k < n; k++) if (m.l[base + bars[k]] <= r.emas[k]) touched = true;
  return touched && m.c[base + t] >= r.emas[n - 1];
}

export function darvasBoxAt(m, s, t, e = E) {
  const base = s * m.T;
  if (!barsBack(m, s, t, e.boxHistory)) return false;
  let top = -Infinity; for (let k = 0; k <= t; k++) if (m.c[base + k] > 0) top = Math.max(top, m.h[base + k]);
  if (!(m.c[base + t] >= e.boxBelowTop * top)) return false;
  const idx = barsBack(m, s, t, e.boxWindow + Math.max(e.boxLook, e.volAvg) + 1); if (!idx) return false;
  for (let j = 0; j < e.boxWindow; j++) {
    let ceil = -Infinity; for (let k = j + 1; k <= j + e.boxLook; k++) ceil = Math.max(ceil, m.h[base + idx[k]]);
    if (m.c[base + idx[j]] > ceil && m.v[base + idx[j]] >= e.volMult * avgVol(m, base, idx, j + 1, e.volAvg)) return true;
  }
  return false;
}

export const PATTERN_AT = Object.freeze({ KULLAMAEGI: kullamaegiAt, POCKET: pocketAt, GAPUP: gapUpAt, GRAIL: grailAt, DARVASBOX: darvasBoxAt });
export function patternFlags(m, xs) {
  return Object.fromEntries(PATTERNS.map((p) => [p, xs.map((x) => Uint8Array.from(x.s, (s) => (PATTERN_AT[p](m, s, x.t) ? 1 : 0)))]));
}
export const evaluate = (xs, flags, bench, opt = {}) => evaluateFamily(xs, flags, bench, { ...opt, portfolios: PORTFOLIOS, newPatterns: PATTERNS, labels: LABEL });

export function report(res) {
  return familyReport(res)
    .replace('# Die übrigen Trader-Muster mit Faktoren (Backtest 2.0, Stufe 5)', '# Ereignis-Methoden mit Faktoren (Backtest 2.0, Stufe 6)')
    .replace('neun vorab feste Depots', 'elf vorab feste Depots')
    .replace('(PROTOKOLL §4g)', '(PROTOKOLL §4h); der Darvas-Kasten ist ein zweiter Versuch nach Einsicht in Stufe 5')
    .replace('nach Einsicht in Stufe 2 bis 4', 'nach Einsicht in Stufe 2 bis 5');
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
  fs.writeFileSync(path.join(a.out, 'trader-ereignis.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(a.out, 'TRADER-EREIGNIS.md'), report(res));
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
