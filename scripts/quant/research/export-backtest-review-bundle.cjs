#!/usr/bin/env node
'use strict';
// Exportiert das Datenpaket der internen Backtest-Vorschau fuer den Konto-Worker (workers/vu-account, Rolle
// backtest_reviewer, standardmaessig aus). Es wird nichts gerechnet: Das Paket fasst nur bereits committete,
// hashgebundene Artefakte zusammen:
//   - Menue und Vorlagen aus backtest-spec-builder.cjs (registrierte Vorlagen, erlaubte Parameter, sichere Codes),
//   - das committete Lesemodell docs/quant/backtest-preview/backtest-preview.json (nur Uebersicht je Art, ohne Zahlen),
//   - den vorgerechneten Katalog docs/quant/backtest-catalog (Index + abgeleitete Anzeigefelder je Eintrag;
//     keine Rohreihen, keine QA-Bloecke, keine Code-Hashes).
// Das Lesemodell wird als JSON gelesen und per Hash geprueft; der Vorschau-Dienst wird bewusst NICHT geladen
// (Isolation, quant/tests/backtest-preview.test.mjs). Die Nachweisart je Fall folgt derselben Regel wie die
// Ansicht der Vorschau (Gleichheit sichert quant/tests/backtest-review-bundle.test.mjs).
//   node scripts/quant/research/export-backtest-review-bundle.cjs --out workers/vu-account/data/backtest-review-bundle.json
//   node scripts/quant/research/export-backtest-review-bundle.cjs --check      (committetes Paket == Neubau?)
// Verweigert Ziele unter quant/data, discover/data, supertrader/data, social/data.
const fs = require('node:fs');
const path = require('node:path');
const R = require('./backtest-runner.cjs');
const B = require('./backtest-spec-builder.cjs');
const Catalog = require('./build-backtest-catalog.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCHEMA = 'backtest-review-bundle-1.0.0';
const DEFAULTS = {
  catalog: 'docs/quant/backtest-catalog',
  preview: 'docs/quant/backtest-preview/backtest-preview.json',
  bundle: 'workers/vu-account/data/backtest-review-bundle.json'
};
const GENERATED = ['quant/data', 'discover/data', 'supertrader/data', 'social/data'];
// Security-Master-Generation, gegen die der Katalog gerechnet wurde (inputHashes.population.masterHash =
// sha256 der Datei quant/data/market/security-master/us-security-master.json). Unbekannter Hash -> Abbruch.
const MASTER_GENERATIONS = Object.freeze({
  '26c82617913ab0dcbd08d24c80eb818134ccced74cc01e9eac819b4635498332': 'us-security-master-1.1.0'
});
const STATE_CODE = Object.freeze({ RESEARCH_EXECUTED: 'A', PREPARED_DATA_LIMITED: 'B', PRODUCT_CERTIFIED: 'C' });
const EVIDENCE_CLASS_LABEL = Object.freeze({
  CERTIFIED_STRATEGY: 'Zertifiziert',
  NOT_COMPUTED: 'Nicht gerechnet (Eingaben fehlen)',
  RECONSTRUCTION: 'Rekonstruierte Forschungsdaten',
  HISTORICAL_SIMULATION: 'Historische Simulation',
  HISTORICAL_STUDY: 'Historische Studie (beobachtete Daten)'
});
// Grenzen, die die Seite zu jeder Zahl zeigt.
const LIMITS = Object.freeze([
  'Interne Research-Vorschau: nicht zertifiziert (NOT_CERTIFIED), productionApproved = false, nicht öffentlich.',
  'Historische Studie, Simulation oder Rekonstruktion auf nachträglich gewählten Auswahlen – kein Strategiebefund.',
  'Keine Anlageberatung, keine Handelsempfehlung, kein Renditeversprechen (NO_ALPHA_OR_CERTIFICATION_CLAIM).',
  'Nur vorgerechnete Auswahlen werden gezeigt; alles andere heißt „nicht vorgerechnet“.'
]);

const fail = (code, detail) => { const e = new Error(code + (detail ? ':' + detail : '')); e.code = code; throw e; };
const readJson = f => JSON.parse(fs.readFileSync(path.resolve(ROOT, f), 'utf8'));
const clone = x => (x === undefined ? null : JSON.parse(JSON.stringify(x)));

/** Nachweisart wie in der Vorschau-Ansicht: CERTIFIED_STRATEGY nur im Zustand C. */
function evidenceClassOf(c) {
  const lim = Array.isArray(c.limitations) ? c.limitations : [];
  const cls = c.state === 'PRODUCT_CERTIFIED' ? 'CERTIFIED_STRATEGY'
    : c.state === 'PREPARED_DATA_LIMITED' ? 'NOT_COMPUTED'
    : lim.some(l => /RECONSTRUCT/.test(l)) ? 'RECONSTRUCTION'
    : c.evidenceKind === 'SIMULATED_LEDGER' || lim.includes('HISTORICAL_PRICE_SIMULATION') ? 'HISTORICAL_SIMULATION'
    : 'HISTORICAL_STUDY';
  return { class: cls, label: EVIDENCE_CLASS_LABEL[cls], certified: cls === 'CERTIFIED_STRATEGY', alphaClaim: false };
}

function countBy(list, key) {
  const out = {};
  for (const x of list || []) { const k = String(x && x[key]); out[k] = (out[k] || 0) + 1; }
  return out;
}

/** Abgeleitete Anzeigefelder eines Runner-Ergebnisses: Kennzahlen, Kosten, Benchmark, Datenqualitaet, Population. */
function displayOf(result) {
  const env = result.envelope, m = env.metrics || {}, dq = env.dataQuality || {}, pop = result.population || {};
  const ca = dq.corporateActions || null;
  return {
    period: clone(env.period),
    events: clone(env.events),
    metrics: {
      basis: m.basis ?? null, totalReturn: m.totalReturn ?? null, cagr: m.cagr ?? null, annualReturns: clone(m.annualReturns),
      volatility: m.volatility ?? null, maxDrawdown: m.maxDrawdown ?? null, hitRate: m.hitRate ?? null, trades: m.trades ?? null,
      turnover: m.turnover ?? null, cashShare: m.cashShare ?? null, perEvent: clone(m.perEvent)
    },
    risk: clone(result.extras && result.extras.metricsDetail ? result.extras.metricsDetail.risk : null),
    uncertainty: clone(env.uncertainty),
    costs: { selected: clone(result.spec.costs), model: clone(m.costs) },
    benchmark: { requested: result.spec.benchmark, definition: clone(m.benchmark), excess: clone(m.excess) },
    dataQuality: {
      totalReturnBasis: dq.totalReturnBasis ?? null, coverage: clone(dq.coverage), censored: clone(dq.censored),
      terminal: clone(dq.terminal), survivorship: clone(dq.survivorship),
      corporateActions: ca ? {
        contract: ca.contract ?? null,
        listings: Array.isArray(ca.listings) ? ca.listings.length : ca.listings ?? null,
        byQuality: Array.isArray(ca.listings) ? countBy(ca.listings, 'quality') : clone(ca.byQuality),
        listingsWithSplitsInWindow: Array.isArray(ca.listings) ? ca.listings.filter(l => (l.splitsInWindow || []).length).length : ca.listingsWithSplitsInWindow ?? null
      } : null,
      warnings: clone(dq.warnings) || []
    },
    population: {
      profile: pop.profile ?? null, frameSize: pop.frameSize ?? null, calendar: clone(pop.calendar),
      listings: Array.isArray(pop.listings) ? pop.listings.length : 0,
      tickers: Array.isArray(pop.listings) ? pop.listings.map(l => l.ticker || l.securityId).filter(Boolean) : [],
      excluded: Array.isArray(pop.excluded) ? pop.excluded.length : 0,
      privateInputs: clone(result.spec.population.privateInputs) || [],
      warnings: clone(pop.warnings) || []
    },
    methods: (env.methods || []).map(x => ({ method: x.method, state: x.state })),
    limitations: clone(env.limitations) || [],
    pit: clone(result.pit)
  };
}

function previewOverview(preview) {
  const { previewHash, ...rest } = preview;
  if (R.hash(rest) !== previewHash) fail('PREVIEW_HASH_MISMATCH');
  if (preview.productionApproved !== false || preview.publiclyActivated !== false) fail('PREVIEW_FLAGS_INVALID');
  if (!preview.certification || !Array.isArray(preview.certification.certifiedKinds)) fail('PREVIEW_CERTIFICATION_MISSING');
  return preview.kinds.map(k => ({
    kind: k.kind, label: k.label, stateCode: k.stateCode, stateLabel: k.stateLabel, states: clone(k.states),
    certification: clone(k.certification), dataQualityLimits: clone(k.dataQualityLimits), limitations: clone(k.limitations),
    cases: k.cases.map(c => ({ id: c.id, stateCode: c.stateCode, stateLabel: c.stateLabel, evidence: evidenceClassOf(c),
      certificationStatus: c.certificationStatus, period: clone(c.period), privateData: c.privateData === true, purpose: c.purpose ?? null }))
  }));
}

/** Baut das Paket (rein, ausser Lesen). */
function buildBundle({ catalogDir = DEFAULTS.catalog, previewFile = DEFAULTS.preview } = {}) {
  const dir = path.resolve(ROOT, catalogDir);
  const violations = Catalog.catalogViolations(dir);
  if (violations.length) fail('CATALOG_INVALID', violations.join(','));
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
  if (index.complete !== true) fail('CATALOG_INCOMPLETE');
  const preview = readJson(previewFile);
  const kinds = previewOverview(preview);
  const certifiedKinds = preview.certification.certifiedKinds.slice();
  const templates = B.loadTemplates();
  const grid = Catalog.readGrid();
  if (Catalog.sha(grid) !== index.gridHash) fail('GRID_HASH_MISMATCH');
  const bySpec = new Map(Catalog.plan(grid, templates).map(p => [p.specHash, p]));
  const masterHashes = new Set();
  const entries = index.entries.map(e => {
    const planned = bySpec.get(e.specHash);
    if (!planned) fail('ENTRY_NOT_IN_GRID', e.specHash);
    const result = JSON.parse(fs.readFileSync(path.join(dir, 'results', e.specHash + '.json'), 'utf8'));
    masterHashes.add(result.inputHashes && result.inputHashes.population ? result.inputHashes.population.masterHash : null);
    const status = result.envelope.status;
    if (status.productionApproved !== false || e.productionApproved !== false) fail('ENTRY_PRODUCTION_APPROVED', e.specHash);
    const evidence = evidenceClassOf({ state: result.state, evidenceKind: status.evidenceKind, limitations: result.envelope.limitations });
    if (evidence.certified && !certifiedKinds.includes(result.kind)) fail('PRODUCT_CERTIFICATION_NOT_PROVEN', e.specHash);
    return {
      label: e.label, selection: clone(planned.selection), selectionHash: e.selectionHash, template: e.template, kind: e.kind,
      specHash: e.specHash, state: e.state, stateCode: STATE_CODE[e.state] || null, certificationStatus: e.certificationStatus,
      evidenceKind: e.evidenceKind, evidence, productionApproved: false,
      privateInputs: clone(e.privateInputs), missingInputs: clone(e.missingInputs),
      hashes: { envelope: e.envelopeHash, result: e.resultHash, input: e.inputHash },
      display: displayOf(result)
    };
  });
  if (masterHashes.size !== 1) fail('MASTER_HASH_NOT_UNIQUE');
  const masterHash = [...masterHashes][0];
  const masterGeneration = MASTER_GENERATIONS[masterHash];
  if (!masterGeneration) fail('MASTER_GENERATION_UNKNOWN_REBUILD_CATALOG', String(masterHash));
  const stateLabels = {};
  for (const k of preview.kinds) for (const c of k.cases) stateLabels[c.stateCode] = c.stateLabel;
  const menu = B.menu(templates);
  const body = {
    schemaVersion: SCHEMA,
    audience: 'INTERNAL_REVIEW', label: 'RESEARCH', trust: 'NOT_PRODUCT_TRUST',
    certification: 'NOT_CERTIFIED', productionApproved: false, publiclyActivated: false, claim: 'NO_ALPHA_OR_CERTIFICATION_CLAIM',
    masterGeneration, masterHash,
    runner: index.runner, catalogSchemaVersion: index.schemaVersion, catalogHash: index.catalogHash, gridHash: index.gridHash,
    previewSchemaVersion: preview.schemaVersion, previewHash: preview.previewHash,
    certificationArtifact: { source: preview.certification.source, schemaVersion: preview.certification.schemaVersion,
      statusSha256: preview.certification.statusSha256, certifiedKinds },
    sources: { catalog: DEFAULTS.catalog, templates: 'docs/quant/backtest-demos/specs' },
    limits: LIMITS.slice(),
    evidenceClasses: { ...EVIDENCE_CLASS_LABEL },
    stateLabels,
    selectionRules: {
      schemaVersion: B.SCHEMA, keys: ['schemaVersion', 'template', 'window', 'costPreset', 'benchmark', 'ruleIds', 'factorId', 'methods'],
      earliest: menu.window.earliest, methodsOptions: ['TEMPLATE', 'NONE'], safeCodes: B.SAFE_CODES.slice()
    },
    menu,
    templates: [...templates.values()].map(clone),
    kinds,
    entries
  };
  return { ...body, bundleHash: R.hash(body) };
}

const serialize = bundle => JSON.stringify(bundle) + '\n';

function parse(argv) {
  const o = { check: false }, flags = { '--out': 'out', '--catalog': 'catalogDir', '--preview': 'previewFile' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') { o.check = true; continue; }
    const k = flags[argv[i]];
    if (!k || !argv[i + 1] || o[k] !== undefined) fail('INVALID_ARGUMENTS', argv[i]);
    o[k] = argv[++i];
  }
  if (!o.out && !o.check) fail('OUT_REQUIRED');
  if (o.out) {
    const rel = path.relative(ROOT, path.resolve(o.out));
    if (!rel.startsWith('..') && GENERATED.some(g => rel === g || rel.startsWith(g + path.sep))) fail('OUT_INSIDE_GENERATED_DATA', rel);
  }
  return o;
}

function main(argv) {
  const o = parse(argv);
  const bundle = buildBundle({ catalogDir: o.catalogDir, previewFile: o.previewFile });
  const text = serialize(bundle);
  if (o.check) {
    const file = path.resolve(ROOT, o.out || DEFAULTS.bundle);
    const committed = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (committed !== text) fail('BUNDLE_OUT_OF_DATE', path.relative(ROOT, file));
    return { ok: true, check: true, bundleHash: bundle.bundleHash, entries: bundle.entries.length };
  }
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  fs.writeFileSync(path.resolve(o.out), text);
  return { ok: true, out: o.out, bundleHash: bundle.bundleHash, entries: bundle.entries.length, bytes: Buffer.byteLength(text) };
}

if (require.main === module) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)))); }
  catch (e) { console.error('ABBRUCH: ' + String(e.code || e.message)); process.exitCode = 2; }
}
module.exports = { SCHEMA, DEFAULTS, MASTER_GENERATIONS, EVIDENCE_CLASS_LABEL, LIMITS, evidenceClassOf, displayOf, buildBundle, serialize, parse, main };
