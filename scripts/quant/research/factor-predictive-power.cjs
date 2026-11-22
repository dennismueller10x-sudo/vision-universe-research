#!/usr/bin/env node
'use strict';
// Prognosekraft der Faktoren und Profile auf der bereinigten Basis (Forschung, nicht zertifiziert; Steuerung 22.11.2026).
// Nur lesend: Kurse aus dem Checkout (Reihen unter SERIES_DIR), PIT-Dokumente aus pit_docs.py, Eignung aus
// quant/data/market/security-master/eligibility.json. Schreibt nichts ins Repository.
//
// Je Monatsstichtag (V10-Rahmen, 2010-2025) werden die Rohwerte der Engine (fundamental-inputs.js, Stand quant-v2.4.1) mit den
// Gewichten des aktuellen Vertrags quant/methodology/quant-v2.json zu Faktor-Perzentilen gerechnet, getrennt nach Population:
//   common  EQUITY_COMMON + ADR des Produktumfangs (Ranglistenbasis seit #2250)
//   all     Produktumfang inklusive getrennter Klassen (Vorzug, SPAC, Trust, REIT-Klasse) und Pruefungsfaelle
// Signale: quality, growth, value, profitability, momentum, risk, composite (ohne Revisionen, keine PIT-Quelle),
// PROFILE_MEAN (Mittel der sechs Perzentile, ab vier belegten). Zusatz in "common": quality/composite/PROFILE_MEAN mit dem
// bisherigen Margenfenster (quant-v2.4.0, bis fuenf Jahre) als Vergleich.
// Je Signal und Horizont (1, 3, 12 Monate): IC, Q5-Q1, Trefferquote, Newey-West-p, Holm je Kennzahl, Teilzeitraeume.
// Usage: node factor-predictive-power.cjs --docs <dir> --out <file.json> --population common|all [--loader-options '<json>']
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const F = require('../v10/factor/common.cjs'), X = require('../v10/factor/factors.cjs');
const { neweyWest, nwBandwidth } = require('../v10/factor/study.cjs');
const Q = require('./quality-margin-compare.cjs');
const QP = require('./quality-margin-pit.cjs');
const FE = require(F.ROOT + '/quant/engines/factor-evidence.js');
const V = require(F.ROOT + '/quant/engines/research-validation.cjs');
const CONTRACT = require(F.ROOT + '/quant/methodology/quant-v2.json');

const HORIZONS = [4, 13, 52];
const SUBPERIODS = [['2010-01-01', '2014-12-31'], ['2015-01-01', '2019-12-31'], ['2020-01-01', '2025-12-31']];
const RANKABLE = ['EQUITY_COMMON', 'ADR'], PRODUCT = ['ELIGIBLE', 'SEPARATE_CLASS', 'REVIEW'];
const NO_WINSOR = new Set(X.COMPONENTS.quality.filter(c => c[3]).map(c => c[0]));
const finite = X.finite;
function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }

/** Komponenten je Faktor aus dem aktuellen Vertrag; Margenform fuer Quality austauschbar (v2.4.0: Fenster bis fuenf Jahre). */
function specs(marginId) {
  const out = {};
  for (const f of X.FACTORS) out[f] = CONTRACT.factors[f].components.map(c => [c.id === 'operatingMarginDrawdown' && marginId ? marginId : c.id, c.weight, c.direction, NO_WINSOR.has(c.id)]);
  return out;
}
const SPECS = { v241: specs(null), v240: specs('operatingMarginDrawdown5y') };

function scoreCrossSection(rows, sp) {
  const comp = {};
  for (const f of X.FACTORS) for (const [id, , direction, noWinsor] of sp[f]) {
    if (comp[id]) continue;
    const raws = rows.map(r => (r.template && ['quality', 'value', 'profitability'].includes(f) ? null : (finite(r.raws[id]) ? r.raws[id] : null)));
    const bounds = noWinsor ? null : FE.winsorBounds(raws);
    const vals = raws.map(v => (v === null ? null : FE.clamp(v, bounds)));
    comp[id] = vals.filter(v => v !== null).length >= X.UNIVERSE_MIN ? FE.midrankPercentiles(vals, direction) : rows.map(() => null);
  }
  return rows.map((r, k) => {
    const out = {};
    for (const f of X.FACTORS) {
      if (r.template && ['quality', 'value', 'profitability'].includes(f)) { out[f] = null; continue; }
      const components = sp[f].map(([id, weight]) => ({ id, weight, state: finite(comp[id][k]) ? 'AVAILABLE' : 'UNAVAILABLE', score: finite(comp[id][k]) ? comp[id][k] : null }));
      let a = FE.assembleFactor(CONTRACT.factors[f], components);
      if (a.state === 'AVAILABLE' && X.mandatoryUnmet(f, id => components.some(c => c.id === id && c.state === 'AVAILABLE'))) a = { state: 'UNAVAILABLE' };
      out[f] = a.state === 'AVAILABLE' ? a.score : null;
    }
    const have = X.FACTORS.filter(f => finite(out[f]));
    out.composite = have.length === 6 ? X.FACTORS.reduce((s, f) => s + X.COMPOSITE_WEIGHTS[f] * out[f], 0) / X.FACTORS.reduce((s, f) => s + X.COMPOSITE_WEIGHTS[f], 0) : null;
    out.PROFILE_MEAN = have.length >= 4 ? have.reduce((s, f) => s + out[f], 0) / have.length : null;
    return out;
  });
}

function loadDocs(dir, cik) {
  const p = path.join(dir, cik + '.json.gz');
  return fs.existsSync(p) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(p))).versions : null;
}
function docAt(versions, t) { let d = null; for (const v of versions || []) { if (v.from <= t) d = v; else break; } return d; }
function drawdownOf(window) {
  const capped = window.map(v => Math.max(-1, Math.min(1, v)));
  let peak = -Infinity, dd = 0;
  for (const v of capped) { if (v > peak) peak = v; if (peak - v > dd) dd = peak - v; }
  const s = capped.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2), med = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  return Math.max(dd, -Math.min(0, med));
}

function populations() {
  const e = JSON.parse(fs.readFileSync(path.join(F.ROOT, 'quant/data/market/security-master/eligibility.json'), 'utf8'));
  const type = new Map();
  for (const d of e.decisions) if (PRODUCT.includes(d.product_eligibility)) type.set(d.securityId, d.instrument_type);
  return type;
}

function buildRows(frame, docsDir, keep, spyMap) {
  const rankIndex = new Map(frame.rankDates.map((d, k) => [d, k]));
  const issuerListings = new Map([...frame.ciks].map(([c, ids]) => [c, ids.length]));
  const dates = frame.rankDates.map(d => ({ date: d, rows: [] }));
  const byId = new Map(frame.listings.map(l => [l.securityId, l]));
  const counts = { issuers: 0, issuersWithDocs: 0, listings: 0, rows: 0, priceOnlyRows: 0, margin3yMismatch: 0 };
  const seen = new Set();
  const handle = (id, versions, cik) => {
    const l = byId.get(id); if (!l || !keep(id)) return;
    counts.listings++;
    const pts = l.points.map(p => p[0]), closes = l.points.map(p => p[1]);
    const template = X.needsIndustryTemplate(l.sic4);
    const factors = X.weeklySplitFactors(pts, l.splits);
    pts.forEach((t, i) => {
      const r = rankIndex.get(t); if (r === undefined) return;
      const cutoff = F.dayBefore(t);
      const raws = X.priceComponents(pts, closes, i, spyMap);
      const v = versions ? docAt(versions, t) : null;
      if (v && v.asOf <= cutoff) {
        const mc = X.marketCapAt({ doc: v.doc, cutoff, dates: pts, closes, factors, i, issuerListings: issuerListings.get(cik) || 1 });
        const f = X.fundamentalComponents(v.doc, cutoff, mc.value);
        if (f) {
          Object.assign(raws, f.raws);
          const w = QP.marginWindow(v.doc, cutoff);
          if (w.length >= 4) raws.operatingMarginDrawdown5y = drawdownOf(w);
          const d3 = QP.drawdown3y(w);
          if (d3 !== null && finite(f.raws.operatingMarginDrawdown) && Math.abs(d3 - f.raws.operatingMarginDrawdown) > 1e-12) counts.margin3yMismatch++;
        }
      } else counts.priceOnlyRows++;
      const clean = {}; for (const [k, x] of Object.entries(raws)) if (finite(x)) clean[k] = x;
      counts.rows++;
      dates[r].rows.push({ id, template, raws: clean });
    });
  };
  for (const [cik, ids] of frame.ciks) {
    counts.issuers++;
    const versions = loadDocs(docsDir, cik);
    if (versions) counts.issuersWithDocs++;
    for (const id of ids) { seen.add(id); handle(id, versions, cik); }
  }
  for (const l of frame.listings) if (!seen.has(l.securityId)) handle(l.securityId, null, null);
  return { dates, counts };
}

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
function stat(rows, field, h) {
  const pts = rows.filter(r => finite(r[field]));
  const vals = pts.map(r => r[field]), nw = neweyWest(vals, nwBandwidth(h));
  return { n: vals.length, mean: nw.mean, t: nw.t ?? null, p: nw.p ?? null, positiveShare: vals.length ? vals.filter(x => x > 0).length / vals.length : null,
    subperiods: SUBPERIODS.map(([a, b]) => { const s = pts.filter(r => r.date >= a && r.date <= b).map(r => r[field]); const x = neweyWest(s, nwBandwidth(h)); return { from: a, to: b, n: s.length, mean: x.mean, t: x.t ?? null, positiveShare: s.length ? s.filter(v => v > 0).length / s.length : null }; }) };
}

function run(docsDir, loaderOptions, population) {
  const t0 = Date.now(), log = k => process.stderr.write(k + ' ' + Math.round((Date.now() - t0) / 1000) + 's\n');
  const type = populations();
  const keep = population === 'common' ? id => RANKABLE.includes(type.get(id)) : id => type.has(id);
  const frame = F.buildFrame(loaderOptions), spy = F.spyWeekly(frame.calendar);
  log('frame');
  const { dates, counts } = buildRows(frame, docsDir, keep, new Map(spy.bars.map(b => [b.date, b.close])));
  log('rows');
  const known = new Set(frame.listings.map(l => l.securityId));
  const sets = population === 'common' ? { v241: '', v240: '_v240' } : { v241: '' };
  const signals = [...X.FACTORS, 'composite', 'PROFILE_MEAN'];
  const scored = dates.map(d => ({ date: d.date, rows: [] }));
  const own = {};
  for (const [name, sfx] of Object.entries(sets)) {
    dates.forEach((d, k) => {
      const rows = d.rows.filter(r => known.has(r.id));
      const sc = scoreCrossSection(rows, SPECS[name]);
      if (name === 'v241') scored[k].rows = rows.map((r, j) => ({ id: r.id, ...Object.fromEntries(signals.map(s => [s, sc[j][s]])) }));
      else rows.forEach((r, j) => { const t = scored[k].rows[j]; if (t) for (const s of ['quality', 'composite', 'PROFILE_MEAN']) t[s + sfx] = sc[j][s]; });
    });
  }
  const names = [...signals, ...(population === 'common' ? ['quality_v240', 'composite_v240', 'PROFILE_MEAN_v240'] : [])];
  const per = Q.perDateOutcomes(scored, names, frame, spy, HORIZONS, log);
  const table = [];
  for (const n of names) for (const h of HORIZONS) {
    const rows = [...per[n + ':' + h]].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date < b.date ? -1 : 1);
    table.push({ signal: n, horizonBars: h, horizonMonths: Q.H_MONTHS[h], dates: rows.length, ic: stat(rows, 'ic', h), spread: stat(rows, 'spread', h), q5: mean(rows.map(r => r.q5).filter(finite)), q1: mean(rows.map(r => r.q1).filter(finite)) });
  }
  // Holm je Kennzahl ueber alle Signale x Horizonte (Newey-West-p, zweiseitig)
  for (const k of ['ic', 'spread']) {
    const fam = table.filter(r => finite(r[k].p)), adj = V.holm(fam.map(r => r[k].p));
    fam.forEach((r, j) => { r[k].holm = adj[j]; r[k].holmReject05 = adj[j] <= 0.05; });
  }
  // gepaarte Differenz v2.4.1 - v2.4.0 (nur "common")
  const paired = [];
  if (population === 'common') for (const base of ['quality', 'composite', 'PROFILE_MEAN']) for (const h of HORIZONS) {
    const a = per[base + ':' + h], b = per[base + '_v240:' + h];
    const ds = [...a.keys()].filter(d => b.has(d)).sort();
    const diff = f => ds.map(d => [a.get(d)[f], b.get(d)[f]]).filter(([x, y]) => finite(x) && finite(y)).map(([x, y]) => x - y);
    const s = v => { const nw = neweyWest(v, nwBandwidth(h)); return { n: v.length, mean: nw.mean, t: nw.t ?? null, p: nw.p ?? null }; };
    paired.push({ signal: base, horizonMonths: Q.H_MONTHS[h], ic: s(diff('ic')), spread: s(diff('spread')) });
  }
  if (paired.length) { const adj = V.holm(paired.flatMap(r => [r.ic.p, r.spread.p]).map(p => (finite(p) ? p : 1))); paired.forEach((r, j) => { r.ic.holm = adj[2 * j]; r.spread.holm = adj[2 * j + 1]; }); }
  const titles = scored.map(d => d.rows.length).filter(n => n > 0).sort((a, b) => a - b);
  return {
    schemaVersion: 'factor-predictive-power-1.0.0', label: 'Forschung, nicht zertifiziert', evidenceKind: 'RECONSTRUCTION',
    modelVersion: CONTRACT.methodologyVersion, population, populationRule: population === 'common' ? 'EQUITY_COMMON + ADR im Produktumfang (ranking-population-1.0.0)' : 'Produktumfang inklusive getrennter Klassen und Pruefungsfaellen',
    population_counts: { rankDates: titles.length, titelJeStichtagMedian: titles[Math.floor(titles.length / 2)] || 0, ...counts },
    returnBasis: 'PRICE_RETURN', buckets: 5, horizonsMonths: [1, 3, 12],
    table, v241GegenV240: paired,
    grenzen: 'Rueckblickend auf heutigen Titeln der Reihen im Checkout (bedingte Population, keine delisteten), Kursrendite ohne Kosten; Revisionen ohne PIT-Quelle fehlen, composite = sechs Faktoren; PIT-Dokumente mit heutiger SEC-Normalisierung. Holm: Newey-West-p ueber alle Signale x Horizonte je Kennzahl.',
    input: { masterHash: frame.masterHash, loaderOptions, framedListings: frame.listings.length },
    certificationStatus: 'NOT_CERTIFIED', seconds: Math.round((Date.now() - t0) / 1000)
  };
}

function main() {
  const docsDir = arg('--docs'), out = arg('--out'), population = arg('--population') || 'common';
  if (!docsDir || !out || !['common', 'all'].includes(population)) throw Error('usage: --docs <dir> --out <file.json> --population common|all');
  const r = run(path.resolve(docsDir), F.parseLoaderOptions(arg('--loader-options')), population);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
  console.log(JSON.stringify(r.population_counts));
  for (const t of r.table) console.log([population, t.signal, t.horizonMonths + 'M', 'IC ' + t.ic.mean?.toFixed(4) + ' t ' + t.ic.t?.toFixed(2) + ' Holm ' + t.ic.holm?.toFixed(3), 'Q5-Q1 ' + t.spread.mean?.toFixed(4) + ' Holm ' + t.spread.holm?.toFixed(3)].join('\t'));
}
if (require.main === module) main();
module.exports = { SPECS, scoreCrossSection, specs, drawdownOf };
