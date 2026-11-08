#!/usr/bin/env node
'use strict';
// Kleines Bündel der Musterportfolios für die Backtest-Ansicht im Produkt (Schema public-model-portfolios-1.0.0).
// Forschung, nicht zertifiziert; Kennzahlen, ausgedünnte Kurve und Grenzen, keine Positionen, keine Kurse, kein Versprechen.
//
//   node scripts/quant/portfolio/export-public-model-portfolios.cjs --out FILE [--in docs/quant/research/portfolio-v1/model-portfolios.json] [--check]
//
// Sperre: In einen Pfad, den GitHub Pages ausliefert (scripts/vu2/build-release.mjs#permitted), schreibt der Exporter nur,
// wenn die Owner-Freigabe der öffentlichen Darstellung im Plan dokumentiert ist (APPROVAL_MARKER in
// docs/PLAN_NEUSTART_2026-11.md). Öffentliche Renditeaussagen brauchen laut CLAUDE.md die Owner-Freigabe.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const SCHEMA = 'public-model-portfolios-1.0.0';
const APPROVAL_MARKER = 'Freigabe öffentliche Backtest-Darstellung';
const PLAN = 'docs/PLAN_NEUSTART_2026-11.md';
const Exp = require('./export-model-portfolios-bundle.cjs');

function servedByPages(rel) {
  const p = rel.split(path.sep).join('/');
  if (p.startsWith('..') || path.isAbsolute(rel)) return false;
  if (/^(scripts|docs|providers)\//.test(p) || /^workers\/[^/]+\/data\//.test(p) || /^quant\/data\/(sec|fundamentals)\//.test(p)) return false;
  return true;
}
function approved(root) {
  const plan = path.join(root, PLAN);
  return fs.existsSync(plan) && fs.readFileSync(plan, 'utf8').includes(APPROVAL_MARKER);
}

function build(root, inFile) {
  const src = Exp.build(root, inFile);
  if (src.state !== 'COMPUTED') return { schemaVersion: SCHEMA, state: 'NOT_YET_COMPUTED', label: 'Forschung, nicht zertifiziert', portfolios: [] };
  return {
    schemaVersion: SCHEMA, state: 'COMPUTED', label: 'Forschung, nicht zertifiziert', certification: 'NOT_CERTIFIED', claim: 'NO_PERFORMANCE_PROMISE',
    disclaimer: 'Historische Rekonstruktion mit festen Regeln, nicht zertifiziert. Keine Anlageberatung, keine Empfehlung, kein Versprechen künftiger Renditen. Vergangene Ergebnisse sind kein verlässlicher Indikator.',
    source: { sha256: src.source.sha256, schemaVersion: src.source.schemaVersion },
    requestedWindow: src.requestedWindow, realizedWindow: src.window, windowAlarm: src.windowAlarm,
    basis: src.data.basis, benchmark: src.data.benchmark, population: src.population ? src.population.description : null,
    standard: { positions: [src.standardRules.minPositions, src.standardRules.maxPositions], maxPositionWeight: src.standardRules.maxPositionWeight, maxSectorWeight: src.standardRules.maxSectorWeight,
      rebalanceWeeks: 4, costsPerSideBps: { fee: src.standardRules.feeBps, slippage: src.standardRules.slippageBps, halfSpread: [2, 50] } },
    portfolios: src.portfolios.map(p => p.state !== 'RUN' ? { profileId: p.profileId, name: p.name, state: p.state } : {
      profileId: p.profileId, name: p.name, state: 'RUN',
      metrics: { cagr: p.metrics.cagr, benchmarkCagr: p.metrics.benchmarkCagr, excessCagr: p.metrics.excessCagr, annualizedVolatility: p.metrics.annualizedVolatility,
        benchmarkVolatility: p.metrics.benchmarkVolatility, maxDrawdown: p.metrics.maxDrawdown, benchmarkMaxDrawdown: p.metrics.benchmarkMaxDrawdown, beta: p.metrics.beta,
        annualizedOneWayTurnover: p.metrics.annualizedOneWayTurnover },
      folds: p.folds.map(f => ({ from: f.from, to: f.to, cagr: f.cagr, benchmarkCagr: f.benchmarkCagr, maxDrawdown: f.maxDrawdown })),
      chart: p.chart,
    }),
    limits: src.openLimits,
  };
}

function main() {
  const a = process.argv, get = (k, d) => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : d; };
  const out = get('--out');
  if (!out) throw Error('--out required');
  const rel = path.relative(ROOT, path.resolve(out));
  if (servedByPages(rel) && !approved(ROOT)) {
    console.error('PUBLIC_DISPLAY_NOT_APPROVED: ' + rel + ' würde ausgeliefert; Freigabe fehlt in ' + PLAN + ' („' + APPROVAL_MARKER + '“).');
    process.exit(3);
  }
  const body = build(ROOT, get('--in', 'docs/quant/research/portfolio-v1/model-portfolios.json'));
  const doc = { ...body, bundleHash: crypto.createHash('sha256').update(Exp.canonical(body)).digest('hex') };
  const text = JSON.stringify(doc) + '\n';
  if (a.includes('--check')) { const ok = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === text; console.log(JSON.stringify({ ok, check: true })); process.exit(ok ? 0 : 1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(JSON.stringify({ ok: true, out: rel, bytes: Buffer.byteLength(text), portfolios: doc.portfolios.length }));
}
if (require.main === module) main();
module.exports = { build, servedByPages, approved, APPROVAL_MARKER, SCHEMA };
