// Interne Backtest-Vorschau (docs/quant/BACKTEST_PREVIEW.md, Abschnitt 9). Standardmaessig AUS.
//
// Zugang nur, wenn (1) die Vorschau ausdruecklich eingeschaltet ist (VU_BACKTEST_REVIEW_ENABLED="true", sonst 404
// PREVIEW_NOT_ACTIVATED), (2) eine gueltige Sitzung besteht (401) und (3) das Konto die Rolle backtest_reviewer hat
// (serverseitig aus user_roles mit dem Nutzer-JWT, Muster requirePricingAdmin; sonst 403 NOT_BACKTEST_REVIEWER).
// Vergeben wird die Rolle nur ueber den Datenbankzugang des Betriebs, nie von einem Konto selbst.
//
// Daten: workers/vu-account/data/backtest-review-bundle.json (scripts/quant/research/export-backtest-review-bundle.cjs),
// hashgebunden an Katalog, Lesemodell und Vorlagen. Der Worker rechnet nichts: Eine Auswahl wird nach denselben Regeln
// wie backtest-spec-builder.cjs#buildSpec in eine Spec uebersetzt, deren specHash im vorgerechneten Katalog
// nachgeschlagen wird. Was nicht vorgerechnet ist, heisst NOT_PRECOMPUTED. Fehler nur als sichere Codes, ohne Daten.
// Nie CERTIFIED_STRATEGY ohne Zertifizierungsartefakt, das die Art zertifiziert; productionApproved immer false.
import {HttpError, json, readJson} from './http.mjs';
import {requireUser} from './auth.mjs';
import DEFAULT_BUNDLE from '../data/backtest-review-bundle.json' with {type: 'json'};

export const ROLE = 'backtest_reviewer';
const BUNDLE_SCHEMA = 'backtest-review-bundle-1.0.0';
const NO_STORE = {'Cache-Control': 'no-store, private'};
const MAX_SELECTION_CHARS = 2048;

// ---------------------------------------------------------------- Hashes (wie backtest-runner.cjs#canonical/hash)
function canonical(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number') { if (!Number.isFinite(x)) throw new Error('NON_FINITE_NUMBER'); return JSON.stringify(x); }
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  throw new Error('NON_JSON_VALUE');
}
async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const hashOf = x => sha256Hex(canonical(x));
const clone = x => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- Paket pruefen (einmal je Paketobjekt)
const verified = new WeakMap();
export async function bundleViolations(b) {
  const errors = [];
  if (!b || typeof b !== 'object') return ['BUNDLE_MISSING'];
  if (b.schemaVersion !== BUNDLE_SCHEMA) errors.push('BUNDLE_SCHEMA_UNKNOWN');
  if (b.productionApproved !== false || b.publiclyActivated !== false) errors.push('BUNDLE_FLAGS_INVALID');
  if (b.certification !== 'NOT_CERTIFIED' || b.claim !== 'NO_ALPHA_OR_CERTIFICATION_CLAIM') errors.push('BUNDLE_CLAIMS_CERTIFICATION');
  const certified = Array.isArray(b.certificationArtifact?.certifiedKinds) ? b.certificationArtifact.certifiedKinds : null;
  if (!certified) errors.push('CERTIFICATION_ARTIFACT_MISSING');
  for (const e of Array.isArray(b.entries) ? b.entries : []) {
    if (e.productionApproved !== false) errors.push('ENTRY_PRODUCTION_APPROVED');
    if ((e.evidence?.class === 'CERTIFIED_STRATEGY' || e.state === 'PRODUCT_CERTIFIED') && !(certified || []).includes(e.kind)) errors.push('PRODUCT_CERTIFICATION_NOT_PROVEN');
    if (e.evidence?.alphaClaim !== false) errors.push('ENTRY_CLAIM_INVALID');
  }
  if (!Array.isArray(b.entries) || !Array.isArray(b.templates) || !b.menu || !b.selectionRules) errors.push('BUNDLE_INCOMPLETE');
  try {
    const {bundleHash, ...body} = b;
    if (await hashOf(body) !== bundleHash) errors.push('BUNDLE_HASH_MISMATCH');
  } catch { errors.push('BUNDLE_HASH_MISMATCH'); }
  return [...new Set(errors)];
}
async function verifiedBundle(b) {
  if (!verified.has(b)) verified.set(b, bundleViolations(b));
  const errors = await verified.get(b);
  if (errors.length) throw new HttpError(503, 'BACKTEST_BUNDLE_INVALID');
  return b;
}

// ---------------------------------------------------------------- Auswahl -> Spec (Regeln von backtest-spec-builder.cjs)
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
  && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

/** Auswahl -> {ok, spec, specHash, template} oder {ok:false, code}. Gleiche Reihenfolge und Codes wie buildSpec. */
export async function specFromSelection(bundle, selection) {
  const rules = bundle.selectionRules, menu = bundle.menu;
  const rejected = code => ({ok: false, code: rules.safeCodes.includes(code) ? code : 'SPEC_REJECTED'});
  const sel = selection || {};
  if (typeof sel !== 'object' || Array.isArray(sel)) return rejected('SELECTION_SCHEMA_UNKNOWN');
  if (sel.schemaVersion !== rules.schemaVersion) return rejected('SELECTION_SCHEMA_UNKNOWN');
  for (const k of Object.keys(sel)) if (!rules.keys.includes(k)) return rejected('SELECTION_UNKNOWN_KEY');
  const tpl = typeof sel.template === 'string' ? bundle.templates.find(t => t.id === sel.template) : null;
  if (!tpl) return rejected('UNKNOWN_TEMPLATE');
  const spec = clone(tpl);
  delete spec.status; // Produktzertifizierung ist nie anforderbar
  if (sel.window !== undefined) {
    const w = sel.window;
    if (!w || typeof w !== 'object' || Object.keys(w).some(k => !['from', 'to'].includes(k)) || !isDate(w.from) || !isDate(w.to)
      || w.from > w.to || w.from < rules.earliest || w.to > tpl.asOf) return rejected('WINDOW_INVALID');
    spec.window = {from: w.from, to: w.to};
  }
  if (sel.costPreset !== undefined) {
    if (typeof sel.costPreset !== 'string' || !Object.prototype.hasOwnProperty.call(menu.costPresets, sel.costPreset)) return rejected('COST_PRESET_UNKNOWN');
    spec.costs = clone(menu.costPresets[sel.costPreset]);
  }
  if (sel.benchmark !== undefined) {
    if (!menu.benchmarks.includes(sel.benchmark)) return rejected('BENCHMARK_UNKNOWN');
    spec.benchmark = sel.benchmark;
  }
  if (sel.ruleIds !== undefined) {
    if (spec.kind !== 'SIGNAL_BACKTEST') return rejected('RULES_ONLY_FOR_SIGNAL');
    const allowed = menu.signalRules;
    if (!Array.isArray(sel.ruleIds) || !sel.ruleIds.length || sel.ruleIds.some(r => !allowed.includes(r)) || new Set(sel.ruleIds).size !== sel.ruleIds.length) return rejected('RULE_NOT_ALLOWED');
    if (spec.engine.funded && !sel.ruleIds.includes(spec.engine.funded.rule)) return rejected('RULE_NOT_ALLOWED');
    spec.engine.ruleIds = sel.ruleIds.slice();
  }
  if (sel.factorId !== undefined) {
    if (spec.kind !== 'FACTOR_RANKING_BACKTEST') return rejected('FACTOR_ONLY_FOR_FACTOR_KIND');
    if (!menu.factorIds.includes(sel.factorId)) return rejected('FACTOR_NOT_ALLOWED');
    spec.engine.factorId = sel.factorId;
  }
  if (sel.methods !== undefined) {
    if (sel.methods === 'NONE') delete spec.methods;
    else if (sel.methods !== 'TEMPLATE') return rejected('METHODS_OPTION_UNKNOWN');
  }
  const grid = spec.methods && spec.methods.PARAMETER_SENSITIVITY && spec.methods.PARAMETER_SENSITIVITY.dimensions;
  if (grid) for (const k of ['feeBps', 'slippageBps']) if (Array.isArray(grid[k]) && !grid[k].includes(spec.costs[k])) return rejected('SENSITIVITY_GRID_EXCLUDES_SELECTED_COSTS');
  const changed = {...sel};
  delete changed.schemaVersion;
  spec.id = 'sel-' + (await sha256Hex(JSON.stringify(changed))).slice(0, 16);
  spec.description = 'Auswahl aus Vorlage ' + tpl.id + ' (' + spec.kind + ', ' + spec.window.from + '..' + spec.window.to + ')';
  return {ok: true, template: tpl.id, spec, specHash: await hashOf(spec)};
}

/** Auswahl -> PRECOMPUTED (Eintrag) | NOT_PRECOMPUTED | REJECTED (sicherer Code). Rechnet nie. */
export async function lookupSelection(bundle, selection) {
  const r = await specFromSelection(bundle, selection);
  if (!r.ok) return {state: 'REJECTED', code: r.code};
  const entry = bundle.entries.find(e => e.specHash === r.specHash);
  if (!entry) return {state: 'NOT_PRECOMPUTED', specHash: r.specHash, template: r.template, kind: r.spec.kind};
  return {state: 'PRECOMPUTED', specHash: r.specHash, entry};
}

// ---------------------------------------------------------------- Zugang
export function activated(cfg) { return cfg.backtestReview?.enabled === true; }

async function requireBacktestReviewer(ctx) {
  if (!activated(ctx.cfg)) throw new HttpError(404, 'PREVIEW_NOT_ACTIVATED');
  const user = await requireUser(ctx);
  const rows = await ctx.sb.user.select(user.accessToken, 'user_roles', {user_id: `eq.${user.id}`, role: `eq.${ROLE}`});
  if (!Array.isArray(rows) || !rows.some(r => r && r.role === ROLE)) throw new HttpError(403, 'NOT_BACKTEST_REVIEWER');
  return {user, bundle: await verifiedBundle(ctx.backtestBundle || DEFAULT_BUNDLE)};
}

function frame(bundle) {
  return {audience: bundle.audience, label: bundle.label, trust: bundle.trust, certification: 'NOT_CERTIFIED', productionApproved: false,
    publiclyActivated: false, claim: bundle.claim, limits: bundle.limits.slice(), masterGeneration: bundle.masterGeneration,
    catalogHash: bundle.catalogHash, previewHash: bundle.previewHash, bundleHash: bundle.bundleHash,
    certificationArtifact: clone(bundle.certificationArtifact), evidenceClasses: clone(bundle.evidenceClasses), stateLabels: clone(bundle.stateLabels)};
}
const reply = (ctx, status, body) => json(ctx.request, ctx.cfg, status, body, {cookies: ctx.outCookies, headers: NO_STORE});

// GET /v1/admin/backtests: Menue (Arten, Vorlagen, erlaubte Parameter), Uebersicht je Art, vorgerechnete Auswahlen (ohne Zahlen).
export async function overview(ctx) {
  const {bundle} = await requireBacktestReviewer(ctx);
  return reply(ctx, 200, {state: 'OK', ...frame(bundle), menu: clone(bundle.menu), kinds: clone(bundle.kinds),
    precomputed: bundle.entries.map(e => ({label: e.label, selection: clone(e.selection), template: e.template, kind: e.kind, specHash: e.specHash,
      stateCode: e.stateCode, evidence: clone(e.evidence)}))});
}

async function answer(ctx, bundle, selection) {
  const r = await lookupSelection(bundle, selection);
  if (r.state === 'REJECTED') throw new HttpError(400, 'SELECTION_REJECTED', r.code);
  if (r.state === 'NOT_PRECOMPUTED') {
    return reply(ctx, 200, {state: 'NOT_PRECOMPUTED', display: 'nicht vorgerechnet', ...frame(bundle),
      specHash: r.specHash, template: r.template, kind: r.kind});
  }
  return reply(ctx, 200, {state: 'PRECOMPUTED', ...frame(bundle), specHash: r.specHash, entry: clone(r.entry)});
}

// POST /v1/admin/backtests/lookup {selection} (Cookie-Sitzung: CSRF-Pruefung im Router)
export async function lookupPost(ctx) {
  const {bundle} = await requireBacktestReviewer(ctx);
  const body = await readJson(ctx.request, 4096);
  return answer(ctx, bundle, body.selection);
}

// GET /v1/admin/backtests/lookup?selection=<JSON>
export async function lookupGet(ctx) {
  const {bundle} = await requireBacktestReviewer(ctx);
  const raw = new URL(ctx.request.url).searchParams.get('selection');
  if (!raw || raw.length > MAX_SELECTION_CHARS) throw new HttpError(400, 'SELECTION_REJECTED', 'SELECTION_SCHEMA_UNKNOWN');
  let selection;
  try { selection = JSON.parse(raw); } catch { throw new HttpError(400, 'SELECTION_REJECTED', 'SELECTION_SCHEMA_UNKNOWN'); }
  return answer(ctx, bundle, selection);
}
