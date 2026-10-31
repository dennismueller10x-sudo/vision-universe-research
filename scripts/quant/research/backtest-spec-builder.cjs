#!/usr/bin/env node
'use strict';
// Spec builder for the internal backtest preview: turns a menu selection into a validated research-runner spec
// (scripts/quant/research/backtest-runner.cjs#validateSpec). No new engine and no execution: it starts from the
// registered demonstration specs (docs/quant/backtest-demos/specs) as templates and lets a reviewer change only
// whitelisted fields (window inside the template's data cut, cost preset, benchmark, signal rule subset, factor).
// Product certification can never be requested (status is removed). Errors are returned as safe codes only.
//   node scripts/quant/research/backtest-spec-builder.cjs --menu
//   node scripts/quant/research/backtest-spec-builder.cjs --select '<json>' [--out <spec.json>]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const R = require('./backtest-runner.cjs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SPECS_DIR = path.join(ROOT, 'docs/quant/backtest-demos/specs');
const SB = require(path.join(ROOT, 'quant/engines/signal-backtest.js'));
const F = require(path.join(ROOT, 'scripts/quant/v10/factor/factors.cjs'));
const Kinds = require(path.join(ROOT, 'quant/engines/backtest-kinds.cjs'));

const SCHEMA = 'backtest-spec-selection-1.0.0';
const SELECTION_KEYS = ['schemaVersion', 'template', 'window', 'costPreset', 'benchmark', 'ruleIds', 'factorId', 'methods'];
const COST_PRESETS = Object.freeze({ NONE: { feeBps: 0, slippageBps: 0 }, STANDARD: { feeBps: 5, slippageBps: 5 }, HIGH: { feeBps: 20, slippageBps: 20 } });
const EARLIEST = '1990-01-01';
// Codes a caller may show; anything else from the runner is reported as SPEC_REJECTED (no detail, no stack).
const SAFE_CODES = ['SELECTION_SCHEMA_UNKNOWN', 'SELECTION_UNKNOWN_KEY', 'UNKNOWN_TEMPLATE', 'WINDOW_INVALID', 'COST_PRESET_UNKNOWN', 'BENCHMARK_UNKNOWN',
  'RULE_NOT_ALLOWED', 'RULES_ONLY_FOR_SIGNAL', 'FACTOR_NOT_ALLOWED', 'FACTOR_ONLY_FOR_FACTOR_KIND', 'METHODS_OPTION_UNKNOWN',
  'SENSITIVITY_GRID_EXCLUDES_SELECTED_COSTS',
  'SPEC_INVALID', 'SPEC_UNKNOWN_KEY', 'SPEC_SCHEMA_UNKNOWN', 'UNKNOWN_KIND', 'UNKNOWN_METHOD', 'METHOD_NOT_APPLICABLE_TO_KIND', 'SPEC_REJECTED'];

const sha = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const clone = x => JSON.parse(JSON.stringify(x));

function loadTemplates(dir = SPECS_DIR) {
  const out = new Map();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
    const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    R.validateSpec(s);
    out.set(s.id, s);
  }
  return out;
}

/** What a selection UI may offer, read from the code constants and the registered templates. */
function menu(templates = loadTemplates()) {
  const methodsByKind = Object.fromEntries(Kinds.KINDS.map(k => [k, Object.keys(R.METHOD_FIT).filter(m => R.METHOD_FIT[m].includes(k))]));
  return {
    schemaVersion: SCHEMA,
    kinds: [...Kinds.KINDS],
    templates: [...templates.values()].map(s => ({ id: s.id, kind: s.kind, description: s.description || null, window: s.window, asOf: s.asOf,
      profile: s.population.profile, privateInputs: s.population.privateInputs || [], methods: Object.keys(s.methods || {}) })),
    costPresets: clone(COST_PRESETS), benchmarks: ['SPY', 'NONE'],
    signalRules: SB.RULES.map(r => r.id), factorIds: [...F.SIGNALS], methodsByKind,
    window: { earliest: EARLIEST, latest: 'template.asOf' },
    notes: ['Nur vorab registrierte Vorlagen; geändert werden dürfen Zeitraum, Kosten, Benchmark, Signalregeln, Faktor.',
      'Keine Produktzertifizierung anforderbar; Ergebnisse sind Research (NO_ALPHA_OR_CERTIFICATION_CLAIM).']
  };
}

function rejected(code) { return { ok: false, code: SAFE_CODES.includes(code) ? code : 'SPEC_REJECTED' }; }

/** Selection -> { ok, spec, specHash } or { ok:false, code }. Pure apart from reading the templates. */
function buildSpec(selection, templates = loadTemplates()) {
  const sel = selection || {};
  if (typeof sel !== 'object' || Array.isArray(sel)) return rejected('SELECTION_SCHEMA_UNKNOWN');
  if (sel.schemaVersion !== SCHEMA) return rejected('SELECTION_SCHEMA_UNKNOWN');
  for (const k of Object.keys(sel)) if (!SELECTION_KEYS.includes(k)) return rejected('SELECTION_UNKNOWN_KEY');
  const tpl = templates.get(sel.template);
  if (!tpl) return rejected('UNKNOWN_TEMPLATE');
  const spec = clone(tpl);
  delete spec.status; // product certification is never requested from a selection
  if (sel.window !== undefined) {
    const w = sel.window;
    if (!w || typeof w !== 'object' || Object.keys(w).some(k => !['from', 'to'].includes(k)) || !isDate(w.from) || !isDate(w.to) || w.from > w.to || w.from < EARLIEST || w.to > tpl.asOf) return rejected('WINDOW_INVALID');
    spec.window = { from: w.from, to: w.to };
  }
  if (sel.costPreset !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(COST_PRESETS, sel.costPreset)) return rejected('COST_PRESET_UNKNOWN');
    spec.costs = clone(COST_PRESETS[sel.costPreset]);
  }
  if (sel.benchmark !== undefined) {
    if (!['SPY', 'NONE'].includes(sel.benchmark)) return rejected('BENCHMARK_UNKNOWN');
    spec.benchmark = sel.benchmark;
  }
  if (sel.ruleIds !== undefined) {
    if (spec.kind !== 'SIGNAL_BACKTEST') return rejected('RULES_ONLY_FOR_SIGNAL');
    const allowed = SB.RULES.map(r => r.id);
    if (!Array.isArray(sel.ruleIds) || !sel.ruleIds.length || sel.ruleIds.some(r => !allowed.includes(r)) || new Set(sel.ruleIds).size !== sel.ruleIds.length) return rejected('RULE_NOT_ALLOWED');
    if (spec.engine.funded && !sel.ruleIds.includes(spec.engine.funded.rule)) return rejected('RULE_NOT_ALLOWED');
    spec.engine.ruleIds = sel.ruleIds.slice();
  }
  if (sel.factorId !== undefined) {
    if (spec.kind !== 'FACTOR_RANKING_BACKTEST') return rejected('FACTOR_ONLY_FOR_FACTOR_KIND');
    if (!F.SIGNALS.includes(sel.factorId)) return rejected('FACTOR_NOT_ALLOWED');
    spec.engine.factorId = sel.factorId;
  }
  if (sel.methods !== undefined) {
    if (sel.methods === 'NONE') delete spec.methods;
    else if (sel.methods !== 'TEMPLATE') return rejected('METHODS_OPTION_UNKNOWN');
  }
  // A recorded sensitivity grid must contain the selected baseline (research-validation: BASELINE_NOT_ON_GRID).
  const grid = spec.methods && spec.methods.PARAMETER_SENSITIVITY && spec.methods.PARAMETER_SENSITIVITY.dimensions;
  if (grid) for (const k of ['feeBps', 'slippageBps']) if (Array.isArray(grid[k]) && !grid[k].includes(spec.costs[k])) return rejected('SENSITIVITY_GRID_EXCLUDES_SELECTED_COSTS');
  const changed = { ...sel }; delete changed.schemaVersion;
  spec.id = 'sel-' + sha(changed).slice(0, 16);
  spec.description = 'Auswahl aus Vorlage ' + tpl.id + ' (' + spec.kind + ', ' + spec.window.from + '..' + spec.window.to + ')';
  try { R.validateSpec(spec); } catch (e) { return rejected(String(e.code || e.message).split(':')[0]); }
  return { ok: true, template: tpl.id, spec, specHash: R.specHash(spec) };
}

if (require.main === module) {
  const argv = process.argv.slice(2), at = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--menu')) { process.stdout.write(JSON.stringify(menu(), null, 1) + '\n'); process.exit(0); }
  let sel; try { sel = JSON.parse(at('--select') || 'null'); } catch { sel = null; }
  const r = buildSpec(sel);
  if (!r.ok) { console.error(JSON.stringify(r)); process.exit(2); }
  if (at('--out')) fs.writeFileSync(at('--out'), JSON.stringify(r.spec, null, 1) + '\n');
  console.log(JSON.stringify({ ok: true, template: r.template, id: r.spec.id, specHash: r.specHash }));
}
module.exports = { SCHEMA, SAFE_CODES, COST_PRESETS, loadTemplates, menu, buildSpec };
