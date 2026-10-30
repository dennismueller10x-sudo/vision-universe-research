/* =========================================================================
   VISION UNIVERSE QUANT — INTERNE BACKTEST-VORSCHAU (backtest-preview-1.0.0)

   Node-only, wie real-backtest-service.cjs; nie Teil des Browser-Bundles.
   NICHT verdrahtet: product-services.js, quant/index.html, quant/app/** und
   alle Views importieren diese Datei nicht (Test backtest-preview.test.mjs).
   Aufrufer sind nur die Offline-Werkzeuge
   scripts/quant/research/{build,render}-backtest-preview.cjs.

   Zwei Teile, keine neue Backtest-Architektur:
   - buildPreview(): Lesemodell aus committeten Runner-Ergebnissen
     (backtest-runner-result-1.0.0 mit backtest-result-2.0.0-Umschlag).
     Jeder Umschlag geht durch backtest-research-adapter.getResearchBacktest
     (Vertragspruefung, Art, productionApproved=false, Zustand C nur mit
     Zertifizierungsartefakt). Zahlen werden kopiert, nicht neu gerechnet.
   - getBacktestPreview(): Gating wie getRealBacktest. Standard DISABLED.
     Freigeschaltet nur mit options.backtestPreview =
     { enabled: true, audience: 'INTERNAL_REVIEW' }. Auch dann ohne Zahlen
     (mode STATUS_ONLY); Zahlen nur zusaetzlich mit internalPreview: true
     (mode INTERNAL_NUMBERS). Immer label RESEARCH, trust NOT_PRODUCT_TRUST,
     productionApproved=false, publiclyActivated=false.
     PRODUCT_CERTIFIED nur, wenn das uebergebene Zertifizierungsartefakt
     die Art CERTIFIED meldet und seinen eigenen Gates folgt (heute keine).
   ========================================================================= */
'use strict';
const crypto = require('node:crypto');
const Adapter = require('./backtest-research-adapter.js');
const Cert = require('../engines/backtest-certification.js');

const VERSION = 'backtest-preview-1.0.0';
const VIEW_VERSION = 'backtest-preview-view-1.0.0';
const AUDIENCE = 'INTERNAL_REVIEW';
const DEFAULT_CONFIG = Object.freeze({ enabled: false, audience: AUDIENCE });
const CLAIM = 'NO_ALPHA_OR_CERTIFICATION_CLAIM';
const KINDS = Object.freeze(['SAME_STOCK_REPLAY', 'PATTERN_EVIDENCE', 'SIGNAL_BACKTEST', 'SETUP_BACKTEST', 'STRATEGY_BACKTEST', 'FACTOR_RANKING_BACKTEST']);
const STATE_CODE = Object.freeze({ RESEARCH_EXECUTED: 'A', PREPARED_DATA_LIMITED: 'B', PRODUCT_CERTIFIED: 'C' });
const STATE_LABEL = Object.freeze({
  RESEARCH_EXECUTED: 'A · Research-Studie ausgeführt (historisch, dokumentierter Scope)',
  PREPARED_DATA_LIMITED: 'B · Engine bereit, Nachweise fehlen',
  PRODUCT_CERTIFIED: 'C · zertifiziert laut Zertifizierungsartefakt',
  NO_PREVIEW_CASE: 'kein Vorschaufall'
});
/* Felder, die nur im Modus INTERNAL_NUMBERS ausgeliefert werden. */
const NUMBER_FIELDS = Object.freeze(['metrics', 'uncertainty', 'benchmark', 'funded', 'methods', 'events', 'pit']);

function fail(code, detail) { const e = new Error(code + (detail !== undefined ? ':' + detail : '')); e.code = code; throw e; }
function canonical(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number') { if (!Number.isFinite(x)) fail('NON_FINITE_NUMBER'); return JSON.stringify(x); }
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  fail('NON_JSON_VALUE');
}
/* Gleiche Bildung wie backtest-runner.cjs#sha (inputHashes.certification). */
const sha = x => crypto.createHash('sha256').update(canonical(x)).digest('hex');
const clone = x => x === undefined ? null : structuredClone(x);
const countOf = x => Array.isArray(x) ? x.length : x && typeof x.count === 'number' ? x.count : 0;
const hashOf = doc => { const { previewHash, ...rest } = doc; return sha(rest); };

function certificationSummary(doc, source) {
  const violations = Cert.certificationViolations(doc);
  const kinds = {};
  for (const k of (doc && doc.kinds) || []) {
    kinds[k.id] = { label: k.label, status: k.status, readiness: k.readiness, trust: k.trust, reason: k.reason || null,
      blockers: (k.blockers || []).map(b => b.id + ':' + b.reason) };
  }
  /* Gebunden wird der Status-Inhalt (Status, Bereitschaft, Blocker je Art), nicht Zeitstempel: eine Neuerzeugung des
     Artefakts mit unveraenderten Status laesst die Vorschau gueltig; jede Statusaenderung verlangt einen Neubau. */
  return { source: source || null, schemaVersion: doc ? doc.schemaVersion : null, statusSha256: sha(kinds), violations, kinds,
    certifiedKinds: Object.keys(kinds).filter(id => kinds[id].status === 'CERTIFIED' && !violations.length) };
}

function dataQualityOf(dq) {
  /* Zwei Formen im Umschlag: Liste je Listing oder (ab vielen Listings) Zusammenfassung {count, quality, withSplitsInWindow}. */
  const ca = dq.corporateActions || {}, raw = ca.listings;
  let count = 0, byQuality = {}, withSplits = 0;
  if (Array.isArray(raw)) {
    count = raw.length;
    for (const l of raw) { const q = l.quality || 'NOT_REPORTED'; byQuality[q] = (byQuality[q] || 0) + 1; if ((l.splitsInWindow || []).length) withSplits++; }
  } else if (raw && typeof raw === 'object') { count = raw.count; byQuality = clone(raw.quality) || {}; withSplits = raw.withSplitsInWindow; }
  return { totalReturnBasis: dq.totalReturnBasis, coverage: clone(dq.coverage), censored: dq.censored, terminal: clone(dq.terminal), survivorship: clone(dq.survivorship),
    corporateActions: { contract: ca.contract || null, listings: count, byQuality, listingsWithSplitsInWindow: withSplits },
    warnings: (dq.warnings || []).slice() };
}

function caseEntry(meta, result, summaryCase, certDoc, cert) {
  const env = result && result.envelope;
  if (!env || result.schemaVersion !== 'backtest-runner-result-1.0.0') fail('RUNNER_RESULT_REQUIRED', meta.id);
  if (result.kind !== meta.kind || env.identity.kind !== meta.kind) fail('KIND_MISMATCH', meta.id);
  if (result.envelopeHash !== env.envelopeHash) fail('ENVELOPE_HASH_MISMATCH', meta.id);
  if (result.state !== env.status.state) fail('STATE_MISMATCH', meta.id);
  /* Wiederverwendung: Vertrag, Art, productionApproved, Zustand C — alles im bestehenden Adapter. */
  const view = Adapter.getResearchBacktest(meta.kind, env, { enabled: true, certification: certDoc });
  if (view.state !== 'AVAILABLE') fail('ENVELOPE_REFUSED_BY_RESEARCH_ADAPTER', meta.id + ':' + view.reason + (view.errors ? ':' + view.errors.join(',') : ''));
  if (!env.limitations.includes(CLAIM)) fail('CLAIM_LIMITATION_MISSING', meta.id);
  if (summaryCase && summaryCase.envelopeHash !== result.envelopeHash) fail('SUMMARY_ENVELOPE_MISMATCH', meta.id);
  const m = env.metrics;
  return {
    id: meta.id, kind: meta.kind, scenarios: (meta.scenarios || []).slice(), privateData: meta.privateData || null, purpose: meta.purpose || null,
    state: view.status.state, stateCode: STATE_CODE[view.status.state], stateLabel: STATE_LABEL[view.status.state],
    evidenceKind: view.status.evidenceKind, certificationStatus: view.status.certificationStatus, certificationSource: view.status.certificationSource,
    runnerCertificationSha256: result.inputHashes ? result.inputHashes.certification || null : null, productionApproved: false,
    period: clone(env.period), engine: clone(result.kindPath), costs: clone(result.spec && result.spec.costs),
    listings: countOf(result.population && result.population.listings), excluded: countOf(result.population && result.population.excluded),
    events: { occurrences: env.events.occurrences, completed: env.events.completed, immature: env.events.immature, censored: env.events.censored, ineligible: env.events.ineligible, titles: env.events.titles, entry: env.events.entry, exit: env.events.exit },
    metrics: clone(m), uncertainty: clone(env.uncertainty),
    benchmark: { requested: result.spec ? result.spec.benchmark : null, definition: clone(m.benchmark), excess: clone(m.excess) },
    funded: summaryCase ? clone(summaryCase.funded) : null,
    methods: env.methods.map(x => ({ method: x.method, state: x.state, result: clone(x.result) })),
    dataQuality: dataQualityOf(env.dataQuality),
    limitations: env.limitations.slice(),
    missingInputs: env.limitations.filter(l => l.startsWith('MISSING_INPUT:')),
    pit: clone(result.pit),
    hashes: { specHash: result.specHash, inputHash: result.inputHash, envelopeHash: result.envelopeHash, resultHash: result.resultHash }
  };
}

function kindState(cases) {
  if (!cases.length) return 'NO_PREVIEW_CASE';
  for (const s of ['PRODUCT_CERTIFIED', 'RESEARCH_EXECUTED']) if (cases.some(c => c.state === s)) return s;
  return 'PREPARED_DATA_LIMITED';
}

/* input: { cases: [{id, kind, scenarios, privateData, purpose}], results: {id: runnerResult}, summary: {cases: [...]}|null,
           certification: doc, sources: { demos, certification, runner } } */
function buildPreview(input) {
  if (!input || !Array.isArray(input.cases) || !input.results) fail('INVALID_INPUT');
  const certDoc = input.certification;
  if (!certDoc) fail('CERTIFICATION_ARTIFACT_REQUIRED');
  const cert = certificationSummary(certDoc, input.sources && input.sources.certification);
  if (cert.violations.length) fail('CERTIFICATION_ARTIFACT_VIOLATES_ITS_CONTRACT', cert.violations.join('; '));
  const ids = new Set();
  const entries = input.cases.map(meta => {
    if (!meta || typeof meta.id !== 'string' || ids.has(meta.id)) fail('DUPLICATE_OR_INVALID_CASE', meta && meta.id);
    if (!KINDS.includes(meta.kind)) fail('UNKNOWN_KIND', meta.kind);
    ids.add(meta.id);
    const s = input.summary && (input.summary.cases || []).find(x => x.id === meta.id) || null;
    return caseEntry(meta, input.results[meta.id], s, certDoc, cert);
  });
  const kinds = KINDS.map(kind => {
    const cases = entries.filter(c => c.kind === kind);
    const state = kindState(cases);
    const unionOf = f => [...new Set(cases.flatMap(f))].sort();
    return {
      kind, label: cert.kinds[kind] ? cert.kinds[kind].label : kind, state, stateCode: STATE_CODE[state] || null, stateLabel: STATE_LABEL[state],
      states: { A: cases.filter(c => c.stateCode === 'A').length, B: cases.filter(c => c.stateCode === 'B').length, C: cases.filter(c => c.stateCode === 'C').length },
      certification: cert.kinds[kind] || null,
      dataQualityLimits: unionOf(c => c.dataQuality.warnings),
      limitations: unionOf(c => c.limitations),
      cases
    };
  });
  const doc = {
    schemaVersion: VERSION, audience: AUDIENCE, label: 'RESEARCH', trust: 'NOT_PRODUCT_TRUST', claim: CLAIM,
    productionApproved: false, publiclyActivated: false,
    notes: ['Interne Vorschau aus committeten Research-Runner-Ergebnissen; keine Produktanzeige, keine Freigabe.',
      'Zahlen sind unverändert aus den Ergebnisumschlägen (backtest-result-2.0.0) übernommen.',
      'Zustand A wird nie automatisch zu C; C nur, wenn das Zertifizierungsartefakt die Art CERTIFIED meldet (heute keine Art).'],
    sources: clone(input.sources || null),
    certification: cert,
    kinds
  };
  doc.previewHash = hashOf(doc);
  return doc;
}

function previewViolations(doc, certDoc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['PREVIEW_MISSING'];
  if (doc.schemaVersion !== VERSION) errors.push('SCHEMA_VERSION');
  if (doc.audience !== AUDIENCE || doc.label !== 'RESEARCH' || doc.trust !== 'NOT_PRODUCT_TRUST' || doc.claim !== CLAIM) errors.push('LABELS');
  if (doc.productionApproved !== false || doc.publiclyActivated !== false) errors.push('ACTIVATION_FORBIDDEN');
  let h = null; try { h = hashOf(doc); } catch { errors.push('NOT_CANONICAL_JSON'); }
  if (h && h !== doc.previewHash) errors.push('PREVIEW_HASH_MISMATCH');
  if (!Array.isArray(doc.kinds) || doc.kinds.map(k => k.kind).join() !== KINDS.join()) { errors.push('KINDS'); return errors; }
  if (!certDoc) errors.push('CERTIFICATION_ARTIFACT_REQUIRED');
  else {
    const v = Cert.certificationViolations(certDoc);
    if (v.length) errors.push('CERTIFICATION_ARTIFACT_VIOLATES_ITS_CONTRACT');
    else if (!doc.certification || certificationSummary(certDoc).statusSha256 !== doc.certification.statusSha256) errors.push('CERTIFICATION_STATUS_CHANGED_REBUILD_PREVIEW');
  }
  for (const k of doc.kinds) for (const c of k.cases || []) {
    if (c.productionApproved !== false) errors.push('PRODUCTION_APPROVAL_FORBIDDEN:' + c.id);
    if (!STATE_CODE[c.state]) errors.push('UNKNOWN_STATE:' + c.id);
    if (!Array.isArray(c.limitations) || !c.limitations.includes(CLAIM)) errors.push('CLAIM_LIMITATION_MISSING:' + c.id);
    if (!c.dataQuality || !Array.isArray(c.dataQuality.warnings)) errors.push('DATA_QUALITY_MISSING:' + c.id);
    if (c.state === 'PRODUCT_CERTIFIED') {
      const e = certDoc && (certDoc.kinds || []).find(x => x.id === c.kind);
      if (!e || e.status !== 'CERTIFIED' || Cert.certificationViolations(certDoc).length) errors.push('PRODUCT_CERTIFICATION_NOT_PROVEN:' + c.id);
    }
  }
  return errors;
}

function disabled() { return { state: 'DISABLED', reason: 'BACKTEST_PREVIEW_DISABLED', schemaVersion: VIEW_VERSION, label: 'RESEARCH', certification: 'NOT_CERTIFIED', productionApproved: false, publiclyActivated: false }; }
function unavailable(reason, extra) { return Object.assign({ state: 'UNAVAILABLE', reason, schemaVersion: VIEW_VERSION, label: 'RESEARCH', certification: 'NOT_CERTIFIED', productionApproved: false, publiclyActivated: false }, extra || {}); }

/* options: { backtestPreview: {enabled, audience}, internalPreview: boolean, certification: doc, kind?: string } */
function getBacktestPreview(doc, options) {
  options = options || {};
  const cfg = options.backtestPreview || DEFAULT_CONFIG;
  if (cfg.enabled !== true || cfg.audience !== AUDIENCE) return disabled();
  if (options.kind !== undefined && !KINDS.includes(options.kind)) return unavailable('UNKNOWN_KIND');
  const errors = previewViolations(doc, options.certification);
  if (errors.length) {
    const certErr = errors.find(e => e.startsWith('PRODUCT_CERTIFICATION_NOT_PROVEN'));
    return unavailable(certErr ? 'PRODUCT_CERTIFICATION_NOT_PROVEN' : 'PREVIEW_CONTRACT_VIOLATED', { errors });
  }
  const numbers = options.internalPreview === true;
  const kinds = doc.kinds.filter(k => options.kind === undefined || k.kind === options.kind).map(k => ({
    kind: k.kind, label: k.label, state: k.state, stateCode: k.stateCode, stateLabel: k.stateLabel, states: clone(k.states),
    certification: clone(k.certification), dataQualityLimits: k.dataQualityLimits.slice(), limitations: k.limitations.slice(),
    cases: k.cases.map(c => {
      const o = clone(c);
      if (!numbers) for (const f of NUMBER_FIELDS) o[f] = null;
      o.display = { productAllowed: false, numbersShown: numbers, trust: 'NOT_PRODUCT_TRUST', label: 'RESEARCH' };
      return o;
    })
  }));
  return {
    state: 'AVAILABLE', schemaVersion: VIEW_VERSION, previewSchemaVersion: doc.schemaVersion, previewHash: doc.previewHash,
    audience: AUDIENCE, mode: numbers ? 'INTERNAL_NUMBERS' : 'STATUS_ONLY', internalPreview: numbers,
    label: 'RESEARCH', trust: 'NOT_PRODUCT_TRUST', claim: CLAIM, certification: doc.certification.certifiedKinds.length ? 'PARTIAL_SEE_KINDS' : 'NOT_CERTIFIED',
    productionApproved: false, publiclyActivated: false,
    certificationArtifact: { source: doc.certification.source, statusSha256: doc.certification.statusSha256, certifiedKinds: doc.certification.certifiedKinds.slice() },
    notes: doc.notes.slice(), kinds
  };
}

module.exports = { VERSION, VIEW_VERSION, AUDIENCE, DEFAULT_CONFIG, KINDS, STATE_CODE, NUMBER_FIELDS, CLAIM, canonical, sha, certificationSummary, buildPreview, previewViolations, getBacktestPreview };
