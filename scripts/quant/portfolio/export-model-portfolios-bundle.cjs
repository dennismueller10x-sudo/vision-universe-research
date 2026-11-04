#!/usr/bin/env node
'use strict';
// Paket der Musterportfolios für die interne Backtest-Vorschau (Rolle backtest_reviewer).
//   node scripts/quant/portfolio/export-model-portfolios-bundle.cjs [--in docs/quant/research/portfolio-v1/model-portfolios.json]
//        [--out workers/vu-account/data/model-portfolios-bundle.json] [--check]
// Ohne Ergebnisdatei entsteht ein Paket im Zustand NOT_YET_COMPUTED (keine Zahlen). Hash wie der Worker (kanonisches JSON).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const SCHEMA = 'model-portfolios-bundle-1.0.0';
const IN = 'docs/quant/research/portfolio-v1/model-portfolios.json';
const OUT = 'workers/vu-account/data/model-portfolios-bundle.json';

function canonical(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number') { if (!Number.isFinite(x)) throw Error('NON_FINITE'); return JSON.stringify(x); }
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  throw Error('NON_JSON');
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const NAMES = { 'quality-compounder': 'Quality Compounder', 'momentum-leader': 'Momentum Leader', garp: 'GARP', 'defensive-quality': 'Defensive Quality', 'value-momentum': 'Value Momentum', 'quality-momentum': 'Quality Momentum', 'future-leader': 'Future Leader' };
const LIMIT_TEXT = {
  KEINE_HISTORISCHE_INDEXMITGLIEDSCHAFT: 'Keine historische Indexmitgliedschaft: Universum sind alle damals handelbaren US-Stammaktien mit Kurs- und Liquiditätsfilter.',
  SIC_HEUTIGER_STAND: 'Branchen aus dem heutigen SIC-Code, nicht historisch.',
  SPREAD_MODELLIERT_NICHT_BEOBACHTET: 'Spread aus Liquiditätsklassen modelliert, keine beobachteten Kurse.',
  ENDWERT_DELISTETER_TITEL_ANNAHME_JE_KLASSE: 'Endwert delisteter Titel ist eine feste Annahme je Klasse (Übernahme 100 %, unbekannt 70 %, Notlage 0 %).',
  NUR_KURSRENDITE_KEINE_DIVIDENDEN: 'Nur Kursrendite, keine Dividenden.',
  NUR_HEUTIGE_TITEL_SURVIVORSHIP: 'Nur heutige Titel (Survivorship-Verzerrung).',
  FUNDAMENTALDATEN_VERZOEGERT_ZULETZT_EINGEREICHT: 'Fundamentaldaten verzögert (zuletzt eingereichte Fassung).',
  DELISTETE_TITEL_OHNE_TAGESUMSATZ_LIQUIDITAET_UEBER_MARKTKAPITALISIERUNG: 'Delistete Titel ohne Tagesumsatz: Liquidität über die Marktkapitalisierung.',
};
const ticker = id => id.startsWith('ref_') ? id.slice(4) : id.startsWith('dl_') ? 'delistet' : id;

function build(root, inFile) {
  const file = path.join(root, inFile);
  const base = { schemaVersion: SCHEMA, audience: 'INTERNAL_REVIEW', label: 'Forschung, nicht zertifiziert', certification: 'NOT_CERTIFIED', productionApproved: false, publiclyActivated: false,
    claim: 'NO_ALPHA_OR_CERTIFICATION_CLAIM', standard: 'VU_PORTFOLIO_STANDARD_1',
    limits: ['Forschung, nicht zertifiziert. Historische Rekonstruktion, keine Empfehlung, keine Renditezusage.', 'Nur intern; eine öffentliche Darstellung braucht eine eigene Owner-Freigabe und die Rechtsberatung.'] };
  if (!fs.existsSync(file)) return { ...base, state: 'NOT_YET_COMPUTED', source: null, portfolios: [] };
  const bytes = fs.readFileSync(file), doc = JSON.parse(bytes);
  if (doc.certification !== 'NOT_CERTIFIED' || doc.productionApproved !== false || doc.publiclyActivated !== false) throw Error('SOURCE_FLAGS_INVALID');
  const portfolios = doc.results.map(r => r.state !== 'RUN' ? { profileId: r.profileId, name: NAMES[r.profileId] || r.profileId, state: r.state } : {
    profileId: r.profileId, name: NAMES[r.profileId] || r.profileId, state: 'RUN', weighting: r.weighting, window: r.window, basis: r.basis, benchmark: r.benchmark,
    metrics: r.metrics, folds: r.folds,
    construction: { averagePositions: r.construction.averagePositions, averageCashResidual: r.construction.averageCashResidual, averageExAnteVol: r.construction.averageExAnteVol, rebalances: r.construction.rebalances, constructed: r.construction.constructed,
      distinctHoldings: r.construction.distinctHoldings, terminalEvents: r.construction.terminalEvents, terminalByKind: r.construction.terminalByKind, averageSectorWeights: r.construction.averageSectorWeights },
    costs: r.costs,
    // Wertentwicklung ausgedünnt (jede 4. Woche + letzte), [Datum, Portfolio, Benchmark] normiert auf 100.
    equity: r.equity.filter((e, i, a) => i % 4 === 0 || i === a.length - 1).map(([d, v, b]) => [d, +(100 * v / r.equity[0][1]).toFixed(3), +(100 * b / r.equity[0][2]).toFixed(3)]),
    lastHoldings: r.lastHoldings.map(h => ({ ticker: ticker(h.id), weight: h.weight })),
  });
  // Diagrammpunkte (logarithmisch, auf [0,1] normiert) für die Anzeige; die Seite rechnet nichts.
  for (const p of portfolios) if (p.state === 'RUN') {
    const ys = p.equity.flatMap(e => [Math.log(e[1]), Math.log(e[2])]), lo = Math.min(...ys), hi = Math.max(...ys), n = p.equity.length - 1 || 1;
    p.chart = p.equity.map((e, i) => [+(i / n).toFixed(4), +((Math.log(e[1]) - lo) / ((hi - lo) || 1)).toFixed(4), +((Math.log(e[2]) - lo) / ((hi - lo) || 1)).toFixed(4)]);
  }
  return { ...base, state: 'COMPUTED', source: { file: inFile, sha256: sha(bytes), schemaVersion: doc.schemaVersion, engines: doc.engines },
    data: { basis: doc.data.basis, benchmark: doc.data.benchmark, priceSource: doc.data.priceSource, delistedSource: doc.data.delistedSource, fundamentalsSource: doc.data.fundamentalsSource, securities: doc.data.securities },
    window: doc.window, standardRules: doc.standard, openLimits: doc.openLimits.map(k => LIMIT_TEXT[k] || k), sensitivity: doc.sensitivity, portfolios };
}

function main() {
  const a = process.argv, get = (k, d) => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : d; };
  const body = build(ROOT, get('--in', IN)), bundle = { ...body, bundleHash: sha(canonical(body)) };
  const out = path.join(ROOT, get('--out', OUT)), text = JSON.stringify(bundle, null, 1) + '\n';
  if (a.includes('--check')) {
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    const ok = cur === text;
    console.log(JSON.stringify({ ok, check: true, bundleHash: bundle.bundleHash, state: bundle.state }));
    process.exit(ok ? 0 : 1);
  }
  fs.writeFileSync(out, text);
  console.log(JSON.stringify({ ok: true, bundleHash: bundle.bundleHash, state: bundle.state, portfolios: bundle.portfolios.length }));
}
if (require.main === module) main();
module.exports = { build, canonical, SCHEMA };
