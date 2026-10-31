#!/usr/bin/env node
/**
 * Supertrader 9 – Zertifizierungsvorbereitung C02 / C01 / C08 / C12 / C03 (CERT-PREP-TOP5-PLAN.json).
 *
 * Prüft den vorregistrierten Prüfplan gegen Code und Quellenextrakt und schreibt ein reproduzierbares Prüfprotokoll:
 *  - jede genannte Vertragsregel existiert mit dem genannten Status (eine Statusänderung fällt auf);
 *  - jeder Parameter hat im Code den genannten Wert, und das Quellen-Token steht im #709-Paraphrasetext;
 *  - jede #709-Regel existiert und ist am Wortlaut geprüft (original_wording_checked);
 *  - jeder genannte Test existiert in seiner Datei;
 *  - Blockerklassen a–d, Abnahmekriterien ohne Renditeziel (metricKind nie PERFORMANCE), VALIDATED_TRADE_SIGNAL gesperrt.
 * Liest nur; ändert keine Regel, keinen Parameter, keine Daten. Mit --run-tests laufen die genannten Testdateien
 * (node --test, TAP) und ihr Ergebnis steht im Protokoll (Abnahme PS-*-CONFORMANCE).
 *
 *   node scripts/supertrader/source-faithful/certification/cert-prep-top5.mjs [--out <dir>] [--run-tests]
 * Ohne --out wird das Protokoll nur auf stdout ausgegeben (nie in ein committetes Artefakt).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SF_DIR = path.resolve(HERE, '..');
export const ROOT = path.resolve(SF_DIR, '..', '..', '..');
export const PLAN_FILE = path.join(HERE, 'CERT-PREP-TOP5-PLAN.json');
export const CERT_PREP_CHECK_VERSION = 'sf9-cert-prep-check-1.0.0';
export const BLOCKER_CLASSES = Object.freeze(['a', 'b', 'c', 'd']);

export const loadPlan = (file = PLAN_FILE) => JSON.parse(fs.readFileSync(file, 'utf8'));
/** sha256 über den Dateiinhalt: der Plan ist vorregistriert, jede Änderung ändert den gepinnten Wert. */
export const planSha256 = (file = PLAN_FILE) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const testRef = (ref) => { const i = ref.indexOf(': '); return { file: ref.slice(0, i), id: ref.slice(i + 2) }; };
const allTestRefs = (plan) => [...new Set([
  ...plan.sharedExecution.tests,
  ...plan.methods.flatMap((m) => [...m.conformanceTests, ...m.executionAssumptions.flatMap((e) => e.tests)]),
])].sort();

/** Titel aller test('…')-Aufrufe einer Datei; ein Titel trägt seine IDs vor dem ersten ':' (getrennt durch ' / '). */
function testIdsOf(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8'), ids = new Set();
  for (const m of src.matchAll(/^\s*test\((['`])(.*?)\1/gm)) for (const id of m[2].split(':')[0].split(' / ')) ids.add(id.trim());
  return ids;
}

/** Validiert den Plan. Liefert { issues: [string], checks: {...} } (deterministisch, ohne Uhrzeit). */
export async function validatePlan(plan = loadPlan()) {
  const issues = [], checks = { rules: 0, params: 0, psr709: 0, tests: 0, blockers: 0, studies: 0 };
  const extract = JSON.parse(fs.readFileSync(path.join(SF_DIR, 'evidence/PSR709-EVIDENCE-EXTRACT.json'), 'utf8'));
  const psr = new Map(extract.rules.map((r) => [r.rule_id, r]));
  const mods = new Map();
  const mod = async (m) => { if (!mods.has(m)) mods.set(m, await import(pathToFileURL(path.join(SF_DIR, m)).href)); return mods.get(m); };
  const kinds = new Set(plan.guards.acceptanceMetricKinds), forbidden = new Set(plan.guards.forbiddenMetricKinds);

  if (plan.guards.validatedTradeSignal !== 'LOCKED_FOR_ALL_13') issues.push('GUARD_VALIDATED_TRADE_SIGNAL');
  for (const k of ['ruleChanges', 'parameterChanges', 'workflowsTriggered', 'generatedDataChanged']) if (plan.guards[k] !== 'NONE') issues.push(`GUARD_${k}`);
  for (const k of forbidden) if (kinds.has(k)) issues.push(`GUARD_FORBIDDEN_KIND_ALLOWED:${k}`);

  const ids = new Set();
  const blocker = (b, where) => {
    checks.blockers++;
    if (ids.has(b.id)) issues.push(`DUPLICATE_ID:${b.id}`); ids.add(b.id);
    if (!BLOCKER_CLASSES.includes(b.class)) issues.push(`BLOCKER_CLASS:${where}:${b.id}`);
    for (const s of b.secondary ?? []) if (!BLOCKER_CLASSES.includes(s)) issues.push(`BLOCKER_SECONDARY:${b.id}`);
    for (const f of ['text', 'evidence', 'closes']) if (!b[f]) issues.push(`BLOCKER_FIELD:${b.id}:${f}`);
  };
  for (const b of plan.crossCuttingBlockers) blocker(b, 'X');

  for (const m of plan.methods) {
    const c = (await mod(m.contract.module))[m.contract.export];
    if (!c) { issues.push(`CONTRACT_MISSING:${m.candidateId}`); continue; }
    if (c.candidateId !== m.candidateId || c.strategyId !== m.strategyId) issues.push(`CONTRACT_IDENTITY:${m.candidateId}`);
    if (c.sourceContractVersion !== m.contract.sourceContractVersion) issues.push(`CONTRACT_VERSION:${m.candidateId}:${c.sourceContractVersion}`);
    const engineVersion = (await mod(m.engine.module))[m.engine.versionExport];
    if (engineVersion !== m.engine.version) issues.push(`ENGINE_VERSION:${m.candidateId}:${engineVersion}`);
    const byId = new Map(c.rules.map((r) => [r.id, r]));
    for (const r of m.rules) {
      checks.rules++;
      const cr = byId.get(r.id);
      if (!cr) issues.push(`RULE_MISSING:${m.candidateId}:${r.id}`);
      else if (cr.status !== r.status) issues.push(`RULE_STATUS:${m.candidateId}:${r.id}:${cr.status}`);
      for (const p of cr?.psr709 ?? []) { checks.psr709++; const e = psr.get(p); if (!e) issues.push(`PSR709_MISSING:${p}`); else if (e.original_wording_checked !== true) issues.push(`PSR709_WORDING_UNCHECKED:${p}`); }
    }
    for (const p of m.params) {
      checks.params++;
      const e = psr.get(p.psr709);
      if (!e) { issues.push(`PARAM_PSR709_MISSING:${p.psr709}`); continue; }
      if (!e.rule_text_paraphrase.includes(p.token)) issues.push(`PARAM_TOKEN:${m.candidateId}:${p.psr709}:${p.token}`);
      const v = getPath((await mod(p.code.module))[p.code.export], p.code.path);
      if (v !== p.value) issues.push(`PARAM_VALUE:${m.candidateId}:${p.code.export}.${p.code.path}:${v}`);
      if (!['SOURCE_NUMBER', 'CONVENTION', 'MODEL_BOUND_FROM_SOURCE_RANGE', 'OWNER_CONVENTION'].includes(p.kind)) issues.push(`PARAM_KIND:${p.psr709}`);
      if (p.kind !== 'SOURCE_NUMBER' && !p.note && p.kind !== 'MODEL_BOUND_FROM_SOURCE_RANGE') issues.push(`PARAM_NOTE:${p.psr709}`);
    }
    for (const b of m.blockers) blocker(b, m.candidateId);
    const cc = new Set([...m.ccMet, ...m.ccOpen]);
    if (cc.size !== 8) issues.push(`CC_SET:${m.candidateId}`);
    for (const s of m.studies) {
      checks.studies++;
      if (!BLOCKER_CLASSES.includes(s.class)) issues.push(`STUDY_CLASS:${s.id}`);
      if (!s.acceptance?.length) issues.push(`STUDY_NO_ACCEPTANCE:${s.id}`);
      for (const a of s.acceptance ?? []) {
        if (forbidden.has(a.metricKind) || !kinds.has(a.metricKind)) issues.push(`STUDY_METRIC_KIND:${s.id}:${a.metricKind}`);
        if (/(rendite|return|sharpe|cagr|profit\s*factor|trefferquote|win\s*rate)\s*(>|>=|≥|<|mindestens|über)/i.test(a.criterion)) issues.push(`STUDY_PERFORMANCE_TARGET:${s.id}`);
      }
    }
    for (const f of m.findings) if (!plan.findings.some((x) => x.id === f)) issues.push(`FINDING_MISSING:${f}`);
  }
  for (const f of plan.findings) if (f.modelChange !== false) issues.push(`FINDING_IS_MODEL_CHANGE:${f.id}`);

  const cache = new Map();
  for (const ref of allTestRefs(plan)) {
    checks.tests++;
    const { file, id } = testRef(ref);
    if (!fs.existsSync(path.join(ROOT, file))) { issues.push(`TEST_FILE_MISSING:${file}`); continue; }
    if (!cache.has(file)) cache.set(file, testIdsOf(file));
    if (!cache.get(file).has(id)) issues.push(`TEST_MISSING:${ref}`);
  }
  return { issues, checks };
}

/** TAP-Ergebnis der Testdateien des Plans (nur mit --run-tests). */
export function runPlanTests(plan = loadPlan()) {
  const files = [...new Set(allTestRefs(plan).map((r) => testRef(r).file))];
  const results = [];
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', f], { cwd: ROOT, encoding: 'utf8' });
    for (const line of r.stdout.split('\n')) {
      const m = /^(not ok|ok) \d+ - (.*?)( # SKIP.*)?$/.exec(line);
      if (m) results.push({ file: f, name: m[2], ok: m[1] === 'ok', skipped: Boolean(m[3]) });
    }
  }
  const pick = (ref) => { const { file, id } = testRef(ref); return results.find((x) => x.file === file && x.name.split(':')[0].split(' / ').map((s) => s.trim()).includes(id)); };
  return Object.fromEntries(plan.methods.map((m) => {
    const rows = m.conformanceTests.map((ref) => ({ ref, result: pick(ref) ? (pick(ref).skipped ? 'SKIPPED' : pick(ref).ok ? 'PASS' : 'FAIL') : 'NOT_FOUND' }));
    return [m.candidateId, { pass: rows.filter((x) => x.result === 'PASS').length, other: rows.filter((x) => x.result !== 'PASS'), acceptance: rows.every((x) => x.result === 'PASS') ? 'MET' : 'NOT_MET' }];
  }));
}

/** Reproduzierbares Prüfprotokoll (ohne Zeitstempel): Planhash, Prüfzählungen, Blocker je Klasse und Methode. */
export async function certPrepReport({ runTests = false, plan = loadPlan() } = {}) {
  const { issues, checks } = await validatePlan(plan);
  const byClass = (list) => Object.fromEntries(BLOCKER_CLASSES.map((k) => [k, list.filter((b) => b.class === k).map((b) => b.id)]));
  return {
    id: 'SF9-CERT-PREP-TOP5-CHECK', version: CERT_PREP_CHECK_VERSION, plan: { id: plan.id, version: plan.version, fixedOn: plan.fixedOn, sha256: planSha256() },
    valid: issues.length === 0, issues, checks,
    guards: plan.guards,
    crossCutting: byClass(plan.crossCuttingBlockers),
    methods: plan.methods.map((m) => ({
      candidateId: m.candidateId, strategyId: m.strategyId, priority: m.priority, ccOpen: m.ccOpen,
      blockersByClass: byClass(m.blockers),
      blockerStatus: Object.fromEntries(m.blockers.map((b) => [b.id, b.status])),
      studies: m.studies.map((s) => ({ id: s.id, class: s.class, status: s.status })),
      findings: m.findings,
    })),
    findings: plan.findings.map((f) => ({ id: f.id, kind: f.kind, modelChange: f.modelChange })),
    conformance: runTests ? runPlanTests(plan) : 'NOT_RUN (--run-tests)',
  };
}

async function main() {
  const args = process.argv.slice(2), outIdx = args.indexOf('--out');
  const report = await certPrepReport({ runTests: args.includes('--run-tests') });
  const text = JSON.stringify(report, null, 1) + '\n';
  if (outIdx >= 0) { const dir = args[outIdx + 1]; fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'CERT-PREP-TOP5-CHECK.json'), text); }
  else process.stdout.write(text);
  if (!report.valid) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
