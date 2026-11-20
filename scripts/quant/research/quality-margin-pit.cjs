#!/usr/bin/env node
'use strict';
// Quality-Margenformen auf neu gebauten PIT-Dokumenten (Steuerung 16.11.2026): Forschung, nicht zertifiziert.
// Je Monatsstichtag (V10-Rahmen, 2010-2025) und Titel die vier Quality-Basisteile und drei Formen der Margenkomponente,
// alle aus denselben Jahresreihen, die quant/engines/fundamental-inputs.js zum Stichtag sieht (Einreichung vor dem Stichtag):
//   (i)   operatingMarginStability  alte Stabilitaet: Median der Abweichung vom Median (bis quant-v2.3.0)
//   (ii)  operatingMarginDrawdown   neuer Einbruch: groesster Rueckgang vom frueheren Hoch, Dauerverlust zaehlt (quant-v2.4.0)
//   (iii) operatingMarginDownside   Abwaertsschwankung: Semi-Deviation der Jahresveraenderungen der Marge (nur Rueckgaenge),
//                                    mit derselben Dauerverlust-Regel wie (ii)
// (iii) misst die Rueckgaenge von Jahr zu Jahr, nicht die Abweichung unter dem Fenstermittel: Eine Semi-Deviation des
// Niveaus wuerde bei steigender Marge die fruehen Jahre als "unter dem Mittel" bestrafen, genau das soll die Form nicht.
// Margen wie in (ii) auf [-1, 1] gekappt; Fenster die letzten fuenf Geschaeftsjahre, ab vier.
//
// Satz "iv" (--set iv, Steuerung 18.11.2026 nach Owner-Ja): Einbruch nur ueber die letzten drei Geschaeftsjahre statt des
// bisherigen Fensters (bis fuenf, ab vier):
//   (ii) operatingMarginDrawdown    live (quant-v2.4.0)
//   (iv) operatingMarginDrawdown3y  dieselbe Regel (gekappt, Dauerverlust zaehlt), Fenster die letzten drei Jahre, ab drei
//   ohne                            Quality ohne Margenkomponente (Referenz, "v")
// Vergleiche iv-ii (Entscheidung), ii-ohne, iv-ohne; Holm ueber diese drei je Kennzahl.
// Usage: node quality-margin-pit.cjs --docs <dir mit <cik>.json.gz aus pit_docs.py> --out <file.json> [--set iv] [--loader-options '<json>']
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const F = require('../v10/factor/common.cjs'), X = require('../v10/factor/factors.cjs');
const { docAt } = require('../v10/factor/panel.cjs');
const FI = require(F.ROOT + '/quant/engines/fundamental-inputs.js');
const Q = require('./quality-margin-compare.cjs');
const C = F.C;

const HORIZONS = [13, 52];
const VARIANTS = { ohne: Q.variant(null), i: Q.variant('operatingMarginStability'), ii: Q.variant('operatingMarginDrawdown'), iii: Q.variant('operatingMarginDownside') };
const COMPARISONS = [['ii', 'i'], ['iii', 'i'], ['ii', 'iii'], ['i', 'ohne']];
const SETS = {
  'i-iii': { variants: VARIANTS, comparisons: COMPARISONS,
             frage: 'Welche Form der Margenkomponente traegt in Quality am meisten: alte Stabilitaet (i), neuer Einbruch (ii), Abwaertsschwankung (iii)?' },
  iv: { variants: { ohne: Q.variant(null), ii: Q.variant('operatingMarginDrawdown'), iv: Q.variant('operatingMarginDrawdown3y') },
        comparisons: [['iv', 'ii'], ['ii', 'ohne'], ['iv', 'ohne']],
        frage: 'Traegt der Margeneinbruch ueber die letzten drei Geschaeftsjahre (iv) in Quality mindestens so viel wie das bisherige Fenster (ii)? Referenz: ohne Margenkomponente.' }
};
const QUALITY_RAWS = ['accrualRatio', 'netDebtToAssets', 'equityToAssets', 'positiveFcfYears', 'operatingMarginStability', 'operatingMarginDrawdown'];
function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
const median = v => { const s = v.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Jahresmargen wie fundamental-inputs.js (operatives Ergebnis / Umsatz am selben Abschlussdatum), letzte fuenf. */
function marginWindow(doc, cutoff) {
  const revenue = new Map(FI.annualSeries(doc, 'revenue', cutoff).map(e => [e.end, e.value]));
  return FI.annualSeries(doc, 'operating_income', cutoff)
    .map(e => { const r = revenue.get(e.end); return X.finite(r) && r > 0 ? e.value / r : null; })
    .filter(v => v !== null).slice(-5);
}

/** Einbruch wie (ii) (gekappt, Dauerverlust zaehlt) ueber ein beliebiges Fenster. */
function drawdownOf(window) {
  const capped = window.map(v => Math.max(-1, Math.min(1, v)));
  let peak = -Infinity, drawdown = 0;
  for (const v of capped) { if (v > peak) peak = v; if (peak - v > drawdown) drawdown = peak - v; }
  return Math.max(drawdown, -Math.min(0, median(capped)));
}

/** (iv): Einbruch nur ueber die letzten drei Geschaeftsjahre (ab drei), sonst null. */
function drawdown3y(window) { return window.length >= 3 ? drawdownOf(window.slice(-3)) : null; }

/** Die drei Formen aus einem Margenfenster (>= 4 Jahre), sonst null. Spiegelt fundamental-inputs.js fuer (i) und (ii). */
function marginForms(window) {
  if (window.length < 4) return null;
  const med = median(window);
  const stability = median(window.map(v => Math.abs(v - med)));
  const capped = window.map(v => Math.max(-1, Math.min(1, v)));
  let peak = -Infinity, drawdown = 0;
  for (const v of capped) { if (v > peak) peak = v; if (peak - v > drawdown) drawdown = peak - v; }
  const loss = -Math.min(0, median(capped));
  const falls = capped.slice(1).map((v, k) => Math.min(0, v - capped[k]));
  const semi = Math.sqrt(falls.reduce((s, d) => s + d * d, 0) / falls.length);
  return { operatingMarginStability: stability, operatingMarginDrawdown: Math.max(drawdown, loss), operatingMarginDownside: Math.max(semi, loss) };
}

function loadDocs(dir, cik) {
  const p = path.join(dir, cik + '.json.gz');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(p))).versions;
}

/** Stichtage mit Quality-Rohwerten je Titel; zaehlt, wo die Nachrechnung von (i)/(ii) von der Engine abweicht. */
function buildRows(frame, docsDir) {
  const rankIndex = new Map(frame.rankDates.map((d, k) => [d, k]));
  const issuerListings = new Map([...frame.ciks].map(([c, ids]) => [c, ids.length]));
  const dates = frame.rankDates.map(d => ({ date: d, rows: [] }));
  const byId = new Map(frame.listings.map(l => [l.securityId, l]));
  const counts = { issuers: 0, issuersWithDocs: 0, rows: 0, withMargins: 0, engineMismatch: 0, docAfterCutoff: 0 };
  for (const [cik, ids] of frame.ciks) {
    counts.issuers++;
    const versions = loadDocs(docsDir, cik);
    if (!versions) continue;
    counts.issuersWithDocs++;
    for (const id of ids) {
      const l = byId.get(id);
      const pts = l.points.map(p => p[0]), closes = l.points.map(p => p[1]);
      const factors = X.weeklySplitFactors(pts, l.splits), template = X.needsIndustryTemplate(l.sic4);
      pts.forEach((t, i) => {
        const r = rankIndex.get(t); if (r === undefined) return;
        const cutoff = F.dayBefore(t), v = docAt(versions, t);
        if (!v) return;
        if (v.asOf > cutoff) { counts.docAfterCutoff++; return; }
        const mc = X.marketCapAt({ doc: v.doc, cutoff, dates: pts, closes, factors, i, issuerListings: issuerListings.get(cik) || 1 });
        const f = X.fundamentalComponents(v.doc, cutoff, mc.value);
        if (!f) return;
        const raws = {};
        for (const k of QUALITY_RAWS) if (X.finite(f.raws[k])) raws[k] = f.raws[k];
        const fenster = marginWindow(v.doc, cutoff);
        const d3 = drawdown3y(fenster);
        if (d3 !== null) raws.operatingMarginDrawdown3y = d3;
        const forms = marginForms(fenster);
        if (forms) {
          counts.withMargins++;
          if (Math.abs(forms.operatingMarginStability - (raws.operatingMarginStability ?? NaN)) > 1e-12 || Math.abs(forms.operatingMarginDrawdown - (raws.operatingMarginDrawdown ?? NaN)) > 1e-12) counts.engineMismatch++;
          raws.operatingMarginDownside = forms.operatingMarginDownside;
        }
        counts.rows++;
        dates[r].rows.push({ id, template, raws });
      });
    }
  }
  return { dates, counts };
}

function run(docsDir, loaderOptions, setName = 'i-iii') {
  const SET = SETS[setName];
  if (!SET) throw Error('unbekannter Satz ' + setName + ' (' + Object.keys(SETS).join(', ') + ')');
  const t0 = Date.now(), log = k => process.stderr.write(k + ' ' + Math.round((Date.now() - t0) / 1000) + 's\n');
  const frame = F.buildFrame(loaderOptions), spy = F.spyWeekly(frame.calendar);
  log('frame');
  const { dates, counts } = buildRows(frame, docsDir);
  log('rows');
  const known = new Set(frame.listings.map(l => l.securityId));
  const scored = Q.scoreDates(dates, SET.variants, id => known.has(id));
  const names = Object.keys(SET.variants);
  const per = Q.perDateOutcomes(scored, names, frame, spy, HORIZONS, log);
  const s = Q.summarize(per, names, HORIZONS, SET.comparisons);
  const titles = scored.map(d => d.rows.length).filter(n => n > 0).sort((a, b) => a - b);
  return {
    schemaVersion: 'quality-margin-pit-1.0.0', label: 'Forschung, nicht zertifiziert', evidenceKind: 'RECONSTRUCTION',
    satz: setName, frage: SET.frage,
    varianten: Object.fromEntries(names.map(n => [n, SET.variants[n].map(([id, w]) => [id, w])])),
    population: { rankDates: titles.length, titelJeStichtagMedian: titles[Math.floor(titles.length / 2)] || 0, ...counts },
    returnBasis: 'PRICE_RETURN', buckets: 5, ...s,
    grenzen: 'Rueckblickend auf heutigen Survivors (bedingte Population), Kursrendite ohne Kosten; PIT-Dokumente mit der heutigen SEC-Normalisierung neu gebaut.',
    input: { masterHash: frame.masterHash, loaderOptions },
    certificationStatus: 'NOT_CERTIFIED', seconds: Math.round((Date.now() - t0) / 1000)
  };
}

function main() {
  const docsDir = arg('--docs'), out = arg('--out');
  if (!docsDir || !out) throw Error('usage: --docs <dir> --out <file.json> [--loader-options <json>]');
  const r = run(path.resolve(docsDir), F.parseLoaderOptions(arg('--loader-options')), arg('--set') || 'i-iii');
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
  console.log(JSON.stringify({ population: r.population, multipleTesting: r.multipleTesting }));
  for (const row of r.table) for (const c of row.vergleiche) console.log([row.horizonMonths + 'M', c.a + '-' + c.b, 'IC ' + c.ic.mean?.toFixed(4) + ' t ' + c.ic.t?.toFixed(2) + ' Holm ' + c.ic.holm?.toFixed(3), 'Q5-Q1 ' + c.spread.mean?.toFixed(4) + ' t ' + c.spread.t?.toFixed(2)].join('\t'));
}
if (require.main === module) main();
module.exports = { marginForms, marginWindow, drawdown3y, VARIANTS, COMPARISONS, SETS };
