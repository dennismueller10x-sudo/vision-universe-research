#!/usr/bin/env node
/**
 * Vorwärtstest der Quant-Varianten aus den unveränderlichen Faktor-Snapshots. Forschung, nicht zertifiziert; nur für den Owner.
 * Protokoll: docs/research/backtest2/PROTOKOLL.md §4d (registriert am 22.11.2026).
 *
 * Kein eigener Speicher nötig: quant/data/product/factor-evidence-history/<methodik>/<datum>.json.gz wird nie überschrieben
 * („Ein veröffentlichter Snapshot wird nie überschrieben“). Jeder Monat nimmt den ersten Snapshot des Monats, bildet je Variante
 * das obere Fünftel (gleich gewichtet) und hält es bis zum ersten Snapshot des Folgemonats. Einstieg und Ausstieg zum
 * Schlusskurs des ersten Handelstags NACH dem Snapshot (quant/data/market/discover-series, split-bereinigt, Kursrendite);
 * Kosten 6 bp je Seite auf den Umschlag; Vergleich SPY (dieselbe Reihe). Titel ohne Kurs am Ausstieg: letzter bekannter Kurs.
 *
 *   node scripts/research/vorwaerts/forward.mjs [--out datei.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const Identity = require(path.join(ROOT, 'core/identity.js'));
export const VERSION = 'vorwaerts-quant-1.0.0';
export const REGISTERED = '2026-11-22', OFFICIAL_FROM = '2026-12', PRE_FROM = '2026-10', COST_BPS = 6, TOP = 0.2;
const FIELDS = ['quality', 'growth', 'momentum', 'value', 'profitability', 'revisions', 'risk'];
/** Varianten wie §4c; live mit Revisionen, wenn vorhanden (sonst renormiert), damit es dem Produkt-Score am nächsten ist. */
export const VARIANTS = Object.freeze({
  live: { quality: 0.10, growth: 0.15, momentum: 0.25, value: 0.15, profitability: 0.15, revisions: 0.15, risk: 0.05 },
  tilt: { quality: 0.10, growth: 0.05, momentum: 0.45, value: 0.05, profitability: 0.30, risk: 0.05 },
  mp: { momentum: 0.5, profitability: 0.5 },
});
const REQUIRED = ['quality', 'growth', 'momentum', 'value', 'profitability', 'risk']; // Revisionen fehlen meist
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Gesamtscore einer Variante: Pflichtfaktoren müssen vorliegen, optionale (Revisionen) werden sonst umverteilt. */
export function score(weights, f) {
  let sw = 0, sv = 0;
  for (const [k, w] of Object.entries(weights)) { const v = f[k]; if (!isNum(v)) { if (REQUIRED.includes(k)) return null; continue; } sw += w; sv += w * v; }
  return sw > 0 ? sv / sw : null;
}

/** Erster Snapshot je Monat. */
export function monthlyDecisions(dates) {
  const out = new Map(); for (const d of [...dates].sort()) if (!out.has(d.slice(0, 7))) out.set(d.slice(0, 7), d);
  return [...out.values()];
}

/** Kurs am ersten Handelstag nach `date` (und den Index), sonst null. points: [[datum, kurs]] aufsteigend. */
export function closeAfter(points, date) { for (const [d, c] of points) if (d > date && c > 0) return { date: d, close: c }; return null; }
export function closeOnOrBefore(points, date) { let v = null; for (const [d, c] of points) { if (d <= date && c > 0) v = { date: d, close: c }; else if (d > date) break; } return v; }

/**
 * Rechnet alle Monate. snaps: [{asOf, rows: {ticker: {factor: wert}}}], priceOf(ticker) -> points|null, spy: points.
 * Ergebnis je Monat: Entscheidungstag, Einstiegstag, Ausstiegstag, Rendite je Variante (nach Kosten), SPY, Titelzahl.
 */
export function evaluate(snaps, priceOf, spy, { top = TOP, costBps = COST_BPS } = {}) {
  const months = [], prev = Object.fromEntries(Object.keys(VARIANTS).map((k) => [k, new Set()]));
  for (let m = 0; m + 1 < snaps.length; m++) {
    const s = snaps[m], next = snaps[m + 1];
    const e0 = closeAfter(spy, s.asOf), e1 = closeAfter(spy, next.asOf);
    if (!e0 || !e1) continue; // Ausstieg noch nicht erreicht
    const row = { decision: s.asOf, entry: e0.date, exit: e1.date, spy: e1.close / e0.close - 1, variants: {} };
    for (const [name, w] of Object.entries(VARIANTS)) {
      const cand = [];
      for (const [t, f] of Object.entries(s.rows)) { const v = score(w, f); if (isNum(v)) cand.push([v, t]); }
      cand.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : 1));
      const pick = cand.slice(0, Math.floor(cand.length * top)).map((c) => c[1]);
      let sum = 0, n = 0, missing = 0;
      for (const t of pick) {
        const p = priceOf(t); const a = p && closeOnOrBefore(p, row.entry), b = p && closeOnOrBefore(p, row.exit);
        if (!a || a.date !== row.entry) { missing++; continue; } // ohne Einstiegskurs am Einstiegstag nicht kaufbar
        sum += b.close / a.close - 1; n++;
      }
      const ids = new Set(pick), changed = [...ids].filter((x) => !prev[name].has(x)).length + [...prev[name]].filter((x) => !ids.has(x)).length;
      const turnover = ids.size ? changed / ids.size : 0, gross = n ? sum / n : null;
      row.variants[name] = { names: n, missingEntry: missing, gross, net: gross === null ? null : gross - turnover * costBps / 1e4, turnover };
      prev[name] = ids;
    }
    months.push(row);
  }
  return months;
}

/** Verkettung ab einem Monat (JJJJ-MM): Rendite je Variante und SPY, Monate vor SPY. */
export function chain(months, fromMonth) {
  const sel = months.filter((m) => m.decision.slice(0, 7) >= fromMonth);
  const out = { from: fromMonth, months: sel.length, spy: sel.length ? sel.reduce((a, m) => a * (1 + m.spy), 1) - 1 : null, variants: {} };
  for (const k of Object.keys(VARIANTS)) {
    const v = sel.map((m) => m.variants[k].net);
    out.variants[k] = { total: v.length && v.every(isNum) ? v.reduce((a, r) => a * (1 + r), 1) - 1 : null, monthsAheadSpy: sel.filter((m) => m.variants[k].net > m.spy).length };
  }
  return out;
}

const pct = (x) => (isNum(x) ? (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' %' : '–');
export function report(res) {
  const L = ['# Vorwärtstest Quant-Varianten (Forschung, nicht zertifiziert)', '',
    `Registriert am ${res.registered}; zählt ab ${res.officialFrom}. Vorlauf ab ${res.preFrom} (nach dem Ende des Studienfensters 09/2026). Oberes Fünftel je Variante, gleich gewichtet, monatlich, ${res.costBps} bp je Seite, Kursrendite gegen SPY. Snapshots: ${res.snapshots} (letzter ${res.lastSnapshot}).`, '',
    '| Entscheidung | Einstieg | Ausstieg | live | tilt | mp | SPY |', '|---|---|---|---|---|---|---|'];
  for (const m of res.months) L.push(`| ${m.decision} | ${m.entry} | ${m.exit} | ${pct(m.variants.live.net)} | ${pct(m.variants.tilt.net)} | ${pct(m.variants.mp.net)} | ${pct(m.spy)} |`);
  for (const c of [res.pre, res.official]) {
    L.push('', `**Ab ${c.from}** (${c.months} Monate): SPY ${pct(c.spy)}; ` + Object.entries(c.variants).map(([k, v]) => `${k} ${pct(v.total)} (${v.monthsAheadSpy} Monate vor SPY)`).join(', '));
  }
  L.push('', 'Ein Monat zählt erst, wenn der Ausstieg (erster Handelstag nach dem ersten Snapshot des Folgemonats) erreicht ist. Wenige Monate sagen nichts; belastbar wird das frühestens nach 12–24 Monaten.');
  return L.join('\n') + '\n';
}

function loadSnapshots(ns = 'vu-factor-evidence-2.0.0') {
  const dir = path.join(ROOT, 'quant/data/product/factor-evidence-history', ns);
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/product/factor-evidence-history/index.json'), 'utf8')).series[ns];
  return monthlyDecisions(idx.filter((d) => d.slice(0, 7) >= PRE_FROM)).map((d) => {
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, d + '.json.gz'))));
    const keys = j.fields.map((f) => f.split('.').pop());
    if (keys.join() !== FIELDS.join()) throw new Error('SNAPSHOT_FIELDS ' + keys.join());
    const rows = {};
    for (const [t, vals] of Object.entries(j.rows)) rows[t] = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
    return { asOf: j.asOf, rows };
  });
}
function series(ticker) {
  let id; try { id = Identity.securityIdForTicker(ticker); } catch { return null; }
  const f = path.join(ROOT, 'quant/data/market/discover-series', id + '.json');
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return d.priceSeriesType === 'SPLIT_ADJUSTED' && d.grain === 'daily' ? d.points : null;
}

function main() {
  const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
  const snaps = loadSnapshots(), spy = series('SPY'), cache = new Map();
  const priceOf = (t) => { if (!cache.has(t)) cache.set(t, series(t)); return cache.get(t); };
  const months = evaluate(snaps, priceOf, spy);
  const res = { schema: VERSION, label: 'Forschung, nicht zertifiziert', registered: REGISTERED, officialFrom: OFFICIAL_FROM, preFrom: PRE_FROM, costBps: COST_BPS,
    snapshots: snaps.length, lastSnapshot: snaps.at(-1)?.asOf, months, pre: chain(months, PRE_FROM), official: chain(months, OFFICIAL_FROM) };
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(res, null, 1) + '\n'); }
  console.log(report(res));
}
if (import.meta.url === `file://${process.argv[1]}`) main();
