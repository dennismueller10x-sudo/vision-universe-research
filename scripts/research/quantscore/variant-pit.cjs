#!/usr/bin/env node
'use strict';
// Quant-Varianten auf neu gebauten PIT-Dokumenten (22.11.2026, Owner „Ok“ zum Plan nach Backtest 2.0 Stufe 3).
// Forschung, nicht zertifiziert. Protokoll: docs/research/backtest2/PROTOKOLL.md §4c (vor dem ersten Lauf festgelegt).
//
// Frage: Trennt ein Gesamtscore mit mehr Gewicht auf Momentum und Profitabilitaet die kuenftigen Gewinner mindestens so gut
// wie die heutigen Gewichte? Gleiche Titel, gleiche Faktor-Scores (V10-Rekonstruktion der Produkt-Faktoren, Bausteine wie
// registriert), nur die Gewichtung des Gesamtscores aendert sich:
//   live   heutige Faktorgewichte (ohne Revisionen, renormiert): Q .10 G .15 V .15 P .15 M .25 R .05
//   tilt   behutsam: Q .10 G .05 V .05 P .30 M .45 R .05
//   mp     Momentum .50 + Profitabilitaet .50
//   mgpa   Momentum .50 + Bruttogewinn je Bilanzsumme .50 (Baustein grossProfitabilityTtm; Hypothese B der Stufe 3)
// Ergebnis je Variante und Horizont (3 und 12 Monate): IC, Q5-Q1, Rendite des oberen Fuenftels und dessen Abstand zu SPY
// (Kursrendite, Einstieg einen Balken spaeter); gepaarte Differenzen gegen live mit Newey-West-t und Holm.
// Dazu Vorher/Nachher am letzten Stichtag: Rangkorrelation live gegen Variante und Ueberlappung der oberen 10 %.
// Usage: node scripts/research/quantscore/variant-pit.cjs --docs <dir mit <cik>.json.gz aus pit_docs.py> --out <file.json> [--loader-options '<json>']
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const F = require('../../quant/v10/factor/common.cjs'), X = require('../../quant/v10/factor/factors.cjs');
const { docAt } = require('../../quant/v10/factor/panel.cjs');
const Q = require('../../quant/research/quality-margin-compare.cjs');
const FE = require(F.ROOT + '/quant/engines/factor-evidence.js');

const HORIZONS = [13, 52];
const VARIANTS = Object.freeze({
  live: { quality: 0.10, growth: 0.15, value: 0.15, profitability: 0.15, momentum: 0.25, risk: 0.05 },
  tilt: { quality: 0.10, growth: 0.05, value: 0.05, profitability: 0.30, momentum: 0.45, risk: 0.05 },
  mp: { momentum: 0.5, profitability: 0.5 },
  mgpa: { momentum: 0.5, gpa: 0.5 },
});
const COMPARISONS = [['tilt', 'live'], ['mp', 'live'], ['mgpa', 'live']];
function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

/** Gesamtscore einer Variante aus Faktor-Scores (und dem gpa-Perzentil); null, wenn ein benoetigter Teil fehlt. */
function composite(weights, s) {
  let sw = 0, sv = 0;
  for (const [k, w] of Object.entries(weights)) { const v = s[k]; if (!X.finite(v)) return null; sw += w; sv += w * v; }
  return sv / sw;
}

/** Je Stichtag: Faktor-Scores (V10), gpa-Perzentil, Gesamtscores aller Varianten; nur Titel mit allen Varianten. */
function scoreDate(rows) {
  const scores = X.scoreCrossSection(rows);
  const raw = rows.map(r => (r.template ? null : (X.finite(r.raws.grossProfitabilityTtm) ? r.raws.grossProfitabilityTtm : null)));
  const b = FE.winsorBounds(raw), gp = raw.filter(v => v !== null).length >= X.UNIVERSE_MIN ? FE.midrankPercentiles(raw.map(v => (v === null ? null : FE.clamp(v, b))), 'higher') : rows.map(() => null);
  const out = [];
  rows.forEach((r, k) => {
    const s = { ...scores[k], gpa: gp[k] };
    if (!X.finite(s.composite)) return; // wie das Produkt: Gesamtscore nur mit allen sechs Faktoren
    const v = Object.fromEntries(Object.entries(VARIANTS).map(([n, w]) => [n, composite(w, s)]));
    if (Object.values(v).every(X.finite)) out.push({ id: r.id, ...v });
  });
  return out;
}

function buildDates(frame, docsDir) {
  const rankIndex = new Map(frame.rankDates.map((d, k) => [d, k]));
  const issuerListings = new Map([...frame.ciks].map(([c, ids]) => [c, ids.length]));
  const perDate = frame.rankDates.map(() => []);
  const counts = { listings: 0, rows: 0, noDoc: 0, docAfterCutoff: 0 };
  const byCik = new Map();
  for (const l of frame.listings) { const k = l.cik || null; if (!k) continue; if (!byCik.has(k)) byCik.set(k, []); byCik.get(k).push(l); }
  for (const [cik, listings] of byCik) {
    const p = path.join(docsDir, cik + '.json.gz');
    const versions = fs.existsSync(p) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(p))).versions : null;
    for (const l of listings) {
      counts.listings++;
      const dates = l.points.map(x => x[0]), closes = l.points.map(x => x[1]);
      const factors = X.weeklySplitFactors(dates, l.splits), template = X.needsIndustryTemplate(l.sic4);
      dates.forEach((t, i) => {
        const r = rankIndex.get(t); if (r === undefined) return;
        const cutoff = F.dayBefore(t), raws = X.priceComponents(dates, closes, i, frame.spyMap);
        const v = versions ? docAt(versions, t) : null;
        if (!v) { counts.noDoc++; return; }
        if (v.asOf > cutoff) { counts.docAfterCutoff++; return; }
        const mc = X.marketCapAt({ doc: v.doc, cutoff, dates, closes, factors, i, issuerListings: issuerListings.get(cik) || 1 });
        const f = X.fundamentalComponents(v.doc, cutoff, mc.value);
        if (f) Object.assign(raws, f.raws);
        counts.rows++;
        perDate[r].push({ id: l.securityId, template, raws });
      });
    }
  }
  return { dates: frame.rankDates.map((d, r) => ({ date: d, rows: scoreDate(perDate[r].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) })), counts };
}

/** Spearman zweier gleich langer Wertlisten (Durchschnittsraenge). */
function spearman(a, b) {
  const rank = v => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length); for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  const ra = rank(a), rb = rank(b), ma = mean(ra), mb = mean(rb);
  let n = 0, da = 0, db = 0; for (let i = 0; i < ra.length; i++) { n += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return n / Math.sqrt(da * db);
}

/** Vorher/Nachher am letzten Stichtag mit Werten. */
function beforeAfter(scored) {
  const last = scored.filter(d => d.rows.length).at(-1); if (!last) return null;
  const top = (n) => new Set(last.rows.slice().sort((a, b) => b[n] - a[n]).slice(0, Math.max(1, Math.floor(last.rows.length / 10))).map(r => r.id));
  const live = top('live');
  return { date: last.date, titles: last.rows.length, variants: Object.fromEntries(Object.keys(VARIANTS).filter(n => n !== 'live').map(n => {
    const t = top(n); return [n, { spearmanVsLive: spearman(last.rows.map(r => r.live), last.rows.map(r => r[n])), top10Overlap: [...t].filter(x => live.has(x)).length / t.size }];
  })) };
}

/** Rendite des oberen Fuenftels minus SPY je Stichtag (gleicher Einstieg einen Balken spaeter). */
function q5VsSpy(per, frame, spy, names) {
  const idx = new Map(frame.calendar.map((d, k) => [d, k])), close = new Map(spy.bars.map(b => [b.date, b.close]));
  const out = {};
  for (const h of HORIZONS) for (const n of names) {
    const vals = [];
    for (const [d, x] of per[n + ':' + h]) {
      const k = idx.get(d), a = close.get(frame.calendar[k + 1]), b = close.get(frame.calendar[k + 1 + h]);
      if (X.finite(x.q5) && X.finite(a) && X.finite(b)) vals.push(x.q5 - (b / a - 1));
    }
    out[n + ':' + h] = { n: vals.length, mean: mean(vals), positiveShare: vals.length ? vals.filter(v => v > 0).length / vals.length : null };
  }
  return out;
}

function run(docsDir, loaderOptions) {
  const t0 = Date.now(), log = k => process.stderr.write(k + ' ' + Math.round((Date.now() - t0) / 1000) + 's\n');
  const frame = F.buildFrame(loaderOptions), spy = F.spyWeekly(frame.calendar);
  frame.spyMap = new Map(spy.bars.map(b => [b.date, b.close]));
  log('frame');
  const { dates, counts } = buildDates(frame, docsDir);
  log('rows');
  const names = Object.keys(VARIANTS);
  const per = Q.perDateOutcomes(dates, names, frame, spy, HORIZONS, log);
  const s = Q.summarize(per, names, HORIZONS, COMPARISONS);
  const titles = dates.map(d => d.rows.length).filter(n => n > 0).sort((a, b) => a - b);
  return {
    schemaVersion: 'quant-variant-pit-1.0.0', label: 'Forschung, nicht zertifiziert', evidenceKind: 'RECONSTRUCTION',
    frage: 'Trennt ein Gesamtscore mit mehr Gewicht auf Momentum und Profitabilitaet die kuenftigen Gewinner mindestens so gut wie die heutigen Gewichte?',
    varianten: VARIANTS, population: { rankDates: titles.length, titelJeStichtagMedian: titles[Math.floor(titles.length / 2)] || 0, ...counts },
    returnBasis: 'PRICE_RETURN', buckets: 5, ...s, q5MinusSpy: q5VsSpy(per, frame, spy, names), vorherNachher: beforeAfter(dates),
    grenzen: 'Rueckblickend auf heutigen Survivors (bedingte Population), Kursrendite ohne Kosten; Faktor-Bausteine der V10-Rekonstruktion; keine Revisionen.',
    input: { masterHash: frame.masterHash, loaderOptions }, certificationStatus: 'NOT_CERTIFIED', seconds: Math.round((Date.now() - t0) / 1000)
  };
}

function report(r) {
  const f = (x, d = 4) => (X.finite(x) ? x.toFixed(d) : '–');
  const L = ['# Quant-Varianten auf PIT-Dokumenten (Forschung, nicht zertifiziert)', '', r.frage, '',
    `Stichtage ${r.population.rankDates}, Titel je Stichtag im Median ${r.population.titelJeStichtagMedian}; ${r.grenzen}`, ''];
  for (const row of r.table) {
    L.push(`## ${row.horizonMonths} Monate (${row.first} bis ${row.last}, ${row.dates} Stichtage)`, '', '| Variante | IC | t | Q5−Q1 | oberes Fünftel | oberes Fünftel − SPY | Anteil vor SPY |', '|---|---|---|---|---|---|---|');
    for (const [n, v] of Object.entries(row.varianten)) { const q = r.q5MinusSpy[n + ':' + row.horizonBars]; L.push(`| ${n} | ${f(v.ic.mean)} | ${f(v.ic.t, 2)} | ${f(v.spread.mean)} | ${f(v.q5)} | ${f(q.mean)} | ${f(q.positiveShare, 2)} |`); }
    L.push('', '| Vergleich | Δ IC | t | Holm | Δ Q5−Q1 | t | Holm |', '|---|---|---|---|---|---|---|');
    for (const c of row.vergleiche) L.push(`| ${c.a} − ${c.b} | ${f(c.ic.mean)} | ${f(c.ic.t, 2)} | ${f(c.ic.holm, 3)} | ${f(c.spread.mean)} | ${f(c.spread.t, 2)} | ${f(c.spread.holm, 3)} |`);
    L.push('');
  }
  if (r.vorherNachher) { L.push(`## Vorher/Nachher am ${r.vorherNachher.date} (${r.vorherNachher.titles} Titel)`, '', '| Variante | Rangkorrelation zu live | Überlappung obere 10 % |', '|---|---|---|');
    for (const [n, v] of Object.entries(r.vorherNachher.variants)) L.push(`| ${n} | ${f(v.spearmanVsLive, 3)} | ${f(v.top10Overlap, 2)} |`); }
  return L.join('\n') + '\n';
}

function main() {
  const docsDir = arg('--docs'), out = arg('--out');
  if (!docsDir || !out) throw Error('usage: --docs <dir> --out <file.json> [--loader-options <json>]');
  const r = run(path.resolve(docsDir), F.parseLoaderOptions(arg('--loader-options')));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
  fs.writeFileSync(path.join(path.dirname(path.resolve(out)), 'QUANT-VARIANTEN.md'), report(r));
  console.log(report(r));
}
if (require.main === module) main();
module.exports = { VARIANTS, COMPARISONS, composite, scoreDate, spearman, beforeAfter, report };
