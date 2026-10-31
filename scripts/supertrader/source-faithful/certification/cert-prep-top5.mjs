#!/usr/bin/env node
/**
 * Supertrader 9 – Zertifizierungsvorbereitung C02 / C01 / C08 / C12 / C03 (CERT-PREP-TOP5-PLAN.json).
 *
 * Prüft den vorregistrierten Prüfplan gegen Code, Vertrag, Quellenextrakt und Testdatei und schreibt ein
 * reproduzierbares Prüfprotokoll:
 *  - Planinhalt gepinnt (PINNED_PLAN_CONTENT_SHA256); jede Planänderung braucht einen neuen Pin;
 *  - jede genannte Vertragsregel existiert mit dem genannten Status; jede Vertragsregel ist im Plan geführt oder mit
 *    einem geprüften Grund ausgeschlossen (rulesOutOfScope);
 *  - jeder Parameter hat im Code den genannten Wert, das Quellen-Token steht im #709-Paraphrasetext, die Art passt
 *    zum Code (Forschungsproxy nie SOURCE_NUMBER); jeder Parameter der Methodenmodule ist geführt oder begründet
 *    ausgeschlossen (paramsOutOfScope);
 *  - jede #709-Regel existiert und ist am Wortlaut geprüft (original_wording_checked);
 *  - jeder genannte Test existiert; die CP-Regeltreue-Tests der Testdatei sind vollständig zugeordnet;
 *  - Blockerklassen a–d mit Konsistenzregeln (Verweis, Kriterium, Status, Owner-/Lizenzbezug, Datenanforderung);
 *    eine Abweichung braucht classReason;
 *  - Abnahmekriterien ohne Renditeziel (metricKind nie PERFORMANCE, keine Rendite-/Risikokennzahl mit Schwelle);
 *  - VALIDATED_TRADE_SIGNAL gesperrt;
 *  - Abhängigkeit von PR #1148: liegt die Matrix vor, muss ihr sha256 dem Plan entsprechen.
 * Liest nur; ändert keine Regel, keinen Parameter, keine Daten. Mit --run-tests laufen die genannten Testdateien
 * (node --test, TAP); eine Methode mit NOT_MET macht das Protokoll ungültig (valid: false, Exit 1).
 *
 *   node scripts/supertrader/source-faithful/certification/cert-prep-top5.mjs [--out <dir | datei.json>] [--run-tests] [--plan <datei>]
 *
 * --out <dir>        schreibt <dir>/CERT-PREP-TOP5-CHECK.json (Verzeichnis wird angelegt)
 * --out <datei.json> schreibt genau diese Datei (Endung .json)
 * ohne --out         nur stdout, nie in ein committetes Artefakt
 * --plan <datei>     prüft eine andere Plandatei (Tests, Gegenproben); der Pin gilt weiter
 * Exit 0 nur bei valid: true.
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
export const CERT_PREP_CHECK_VERSION = 'sf9-cert-prep-check-1.1.0';
export const BLOCKER_CLASSES = Object.freeze(['a', 'b', 'c', 'd']);
/** Pin des Planinhalts (sha256 über JSON.stringify des geladenen Plans). Neu setzen nur in einem begründeten Commit. */
export const PINNED_PLAN_CONTENT_SHA256 = '7f6f864b4a8e198db8316f9b8f135fa18ab240e3605dd5d93b3a9bd22fb48ad9';
export const CERT_PREP_TEST_FILE = 'scripts/supertrader/tests/sf-cert-prep-top5.test.mjs';
/** Familienpräfix der CP-Tests -> Methoden, deren conformanceTests sie zusammen vollständig enthalten müssen. */
export const CP_FAMILIES = Object.freeze({ TUR: ['C02', 'C01'], KK: ['C08'], BGU: ['C12'], DAR: ['C03'] });
const PARAM_KINDS = Object.freeze(['SOURCE_NUMBER', 'CONVENTION', 'MODEL_BOUND_FROM_SOURCE_RANGE', 'OWNER_CONVENTION']);
const A_STATUS = /^(DONE|PREPARED_[A-Z_]+|OPEN_SEPARATE_PR)$/;

export const loadPlan = (file = PLAN_FILE) => JSON.parse(fs.readFileSync(file, 'utf8'));
/** sha256 über die Plandatei (Bytes). */
export const planSha256 = (file = PLAN_FILE) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
/** sha256 über den Planinhalt; den prüft validatePlan gegen PINNED_PLAN_CONTENT_SHA256. */
export const planContentSha256 = (plan) => crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');

const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const hasPath = (obj, p) => { const ks = p.split('.'), last = ks.pop(); const o = ks.reduce((x, k) => (x == null ? undefined : x[k]), obj); return o != null && Object.hasOwn(o, last); };
const leaves = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? leaves(v, `${pre}${k}.`) : [`${pre}${k}`]));
const testRef = (ref) => { const i = ref.indexOf(': '); return { file: ref.slice(0, i), id: ref.slice(i + 2) }; };
const allTestRefs = (plan) => [...new Set([
  ...plan.sharedExecution.tests,
  ...plan.methods.flatMap((m) => [...m.conformanceTests, ...m.executionAssumptions.flatMap((e) => e.tests)]),
  ...(plan.paramsOutOfScope ?? []).filter((p) => p.test).map((p) => p.test),
])].sort();

/** test('…')-Titel einer Datei; ein Titel trägt seine IDs vor dem ersten ':' (getrennt durch ' / '). */
function testTitlesOf(file) {
  const src = fs.readFileSync(path.resolve(ROOT, file), 'utf8');
  return [...src.matchAll(/^\s*test\((['`])(.*?)\1/gm)].map((m) => m[2]);
}
const idsOfTitle = (t) => t.split(':')[0].split(' / ').map((s) => s.trim());
function testIdsOf(file) { return new Set(testTitlesOf(file).flatMap(idsOfTitle)); }

/**
 * Renditeziel-Erkennung: eine Rendite-, Risiko- oder Trefferkennzahl, gefolgt (im selben Satzteil) von einem
 * Vergleich und einer Zahl, oder eine Zahl mit 'p.a.'. Erlaubt bleiben Zählungen und Verteilungen ohne Schwelle.
 */
const PERF_METRIC = /(rendite|return|gewinn|profit|ertrag|sharpe|sortino|calmar|cagr|alpha|draw\s*-?\s*down|max\.?\s*-?\s*dd\b|\bmdd\b|trefferquote|win\s*-?\s*rate|hit\s*-?\s*rate|erwartungswert|expectancy|performance|outperform)/gi;
const PERF_COMPARE = /(>=?|<=?|≥|≤|=|mindestens|höchstens|maximal|minimal|über|unter|größer|kleiner|besser|schlechter|mehr als|weniger als|at least|at most|above|below|exceed)/i;
export function isPerformanceTarget(text) {
  const s = String(text ?? '');
  if (/\d\s*%?\s*p\.\s*a\.?/i.test(s)) return true;
  for (const m of s.matchAll(PERF_METRIC)) {
    const tail = s.slice(m.index + m[0].length).split(/[;\n]|\.\s/)[0].slice(0, 60);
    if (PERF_COMPARE.test(tail) && /\d/.test(tail)) return true;
  }
  return false;
}

/** Validiert den Plan. Liefert { issues: [string], checks: {...}, dependency } (deterministisch, ohne Uhrzeit). */
export async function validatePlan(plan = loadPlan()) {
  const issues = [], checks = { rules: 0, rulesOutOfScope: 0, params: 0, paramsOutOfScope: 0, psr709: 0, tests: 0, blockers: 0, studies: 0 };
  const extract = JSON.parse(fs.readFileSync(path.join(SF_DIR, 'evidence/PSR709-EVIDENCE-EXTRACT.json'), 'utf8'));
  const psr = new Map(extract.rules.map((r) => [r.rule_id, r]));
  const mods = new Map();
  const mod = async (m) => { if (!mods.has(m)) mods.set(m, await import(pathToFileURL(path.join(SF_DIR, m)).href)); return mods.get(m); };
  const kinds = new Set(plan.guards.acceptanceMetricKinds), forbidden = new Set(plan.guards.forbiddenMetricKinds);
  const reasons = new Set(Object.keys(plan.outOfScopeReasons ?? {}));
  const reasonCode = (r) => String(r ?? '').split(':')[0];

  const contentSha = planContentSha256(plan);
  if (contentSha !== PINNED_PLAN_CONTENT_SHA256) issues.push(`PLAN_NOT_PINNED:${contentSha}`);

  if (plan.guards.validatedTradeSignal !== 'LOCKED_FOR_ALL_13') issues.push('GUARD_VALIDATED_TRADE_SIGNAL');
  for (const k of ['ruleChanges', 'parameterChanges', 'workflowsTriggered', 'generatedDataChanged']) if (plan.guards[k] !== 'NONE') issues.push(`GUARD_${k}`);
  for (const k of forbidden) if (kinds.has(k)) issues.push(`GUARD_FORBIDDEN_KIND_ALLOWED:${k}`);

  // Abhängigkeit von PR #1148 (Matrix): solange die Datei fehlt PENDING, liegt sie vor, muss der sha256 passen
  const dep = plan.dependsOn;
  let dependency = 'NONE';
  if (!dep || !dep.pr || !dep.file || !/^[0-9a-f]{64}$/.test(dep.sha256 ?? '')) issues.push('DEPENDENCY_UNDECLARED');
  else if (!fs.existsSync(path.join(ROOT, dep.file))) dependency = `PENDING_PR_${dep.pr}`;
  else {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, dep.file))).digest('hex');
    dependency = sha === dep.sha256 ? `PRESENT_MATCHING_PR_${dep.pr}` : `PRESENT_DIFFERENT_PR_${dep.pr}`;
    if (sha !== dep.sha256) issues.push(`DEPENDENCY_SHA256:${dep.file}:${sha}`);
  }

  const allBlockers = [...plan.crossCuttingBlockers, ...plan.methods.flatMap((m) => m.blockers)];
  const blockerById = new Map(allBlockers.map((b) => [b.id, b]));
  const ids = new Set();
  const blocker = (b, where) => {
    checks.blockers++;
    if (ids.has(b.id)) issues.push(`DUPLICATE_ID:${b.id}`); ids.add(b.id);
    if (!BLOCKER_CLASSES.includes(b.class)) issues.push(`BLOCKER_CLASS:${where}:${b.id}`);
    for (const s of b.secondary ?? []) if (!BLOCKER_CLASSES.includes(s)) issues.push(`BLOCKER_SECONDARY:${b.id}`);
    for (const f of ['text', 'evidence', 'closes']) if (!b[f]) issues.push(`BLOCKER_FIELD:${b.id}:${f}`);
    // Klassen-Konsistenz; eine bewusste Abweichung trägt classReason
    if (b.classReason) return;
    const ref = /^(?:wie\s+)?((?:X|C\d\d)-[A-Z0-9-]+)\b/.exec(b.closes ?? '')?.[1];
    if (ref && blockerById.has(ref) && ref !== b.id && blockerById.get(ref).class !== b.class) issues.push(`BLOCKER_CLASS_INHERIT:${b.id}:${ref}`);
    if (['CC-5', 'CC-8'].includes(b.criterion) && b.class !== 'd') issues.push(`BLOCKER_CLASS_CRITERION:${b.id}:${b.criterion}`);
    if (b.class === 'a' && b.status && !A_STATUS.test(b.status)) issues.push(`BLOCKER_CLASS_A_STATUS:${b.id}:${b.status}`);
    if (b.class !== 'a' && b.status === 'DONE') issues.push(`BLOCKER_DONE_NOT_A:${b.id}`);
    if (b.class !== 'd' && !(b.secondary ?? []).includes('d') && /owner|lizenz/i.test(`${b.text} ${b.closes}`)) issues.push(`BLOCKER_CLASS_OWNER:${b.id}`);
  };
  for (const b of plan.crossCuttingBlockers) blocker(b, 'X');

  // Parameter-Soll: alle Blätter der Methodenmodule (methods/*), die der Plan nutzt
  const paramSeen = new Set(), paramExports = new Map();
  for (const p of plan.methods.flatMap((m) => m.params)) if (p.code.module.startsWith('methods/')) paramExports.set(`${p.code.module}#${p.code.export}`, p.code);
  for (const p of plan.paramsOutOfScope ?? []) {
    checks.paramsOutOfScope++;
    const key = `${p.module}#${p.export}#${p.path}`;
    paramSeen.add(key);
    if (!reasons.has(reasonCode(p.reason))) issues.push(`PARAM_OOS_REASON:${key}:${p.reason}`);
    if (!hasPath((await mod(p.module))[p.export] ?? {}, p.path)) issues.push(`PARAM_OOS_UNKNOWN:${key}`);
    if (reasonCode(p.reason) === 'STRUCTURAL_FLAG' && !p.test) issues.push(`PARAM_OOS_NO_TEST:${key}`);
    if (reasonCode(p.reason) === 'NOT_IN_RESEARCH_REFERENCE' && !blockerById.has(p.blocker)) issues.push(`PARAM_OOS_NO_BLOCKER:${key}`);
    if (reasonCode(p.reason) === 'OTHER_METHOD' && plan.methods.some((m) => m.candidateId === p.reason.split(':')[1])) issues.push(`PARAM_OOS_METHOD_IN_PLAN:${key}`);
  }

  const cpTitles = testTitlesOf(CERT_PREP_TEST_FILE).filter((t) => t.startsWith('CP-') && !t.startsWith('CP-PLAN-'));
  const cpRef = (t) => `${CERT_PREP_TEST_FILE}: ${idsOfTitle(t)[0]}`;

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
    // Regel-Soll aus dem Vertrag: jede Vertragsregel ist im Plan oder mit geprüftem Grund ausgeschlossen
    const inPlan = new Set(m.rules.map((r) => r.id)), oos = new Map((m.rulesOutOfScope ?? []).map((r) => [r.id, r]));
    for (const r of m.rulesOutOfScope ?? []) {
      checks.rulesOutOfScope++;
      const cr = byId.get(r.id), code = reasonCode(r.reason);
      if (!cr) { issues.push(`RULE_OOS_UNKNOWN:${m.candidateId}:${r.id}`); continue; }
      if (inPlan.has(r.id)) issues.push(`RULE_OOS_ALSO_IN_PLAN:${m.candidateId}:${r.id}`);
      if (!reasons.has(code)) issues.push(`RULE_OOS_REASON:${m.candidateId}:${r.id}:${r.reason}`);
      else if (code === 'COVERED_IN' && !plan.methods.some((o) => o.candidateId === r.reason.split(':')[1] && o !== m && o.contract.module === m.contract.module && o.rules.some((x) => x.id === r.id))) issues.push(`RULE_OOS_NOT_COVERED_THERE:${m.candidateId}:${r.id}:${r.reason}`);
      else if (code === 'MANUAL_REVIEW_LAYER' && cr.status !== 'MANUAL_REVIEW_REQUIRED') issues.push(`RULE_OOS_STATUS:${m.candidateId}:${r.id}:${cr.status}`);
      else if (code === 'DATA_BLOCKED' && cr.status !== 'DATA_BLOCKED') issues.push(`RULE_OOS_STATUS:${m.candidateId}:${r.id}:${cr.status}`);
      else if (code === 'CONTRACT_GOLDEN_CASES' && !(cr.tests ?? []).length) issues.push(`RULE_OOS_NO_GOLDEN_CASES:${m.candidateId}:${r.id}`);
      else if (!['COVERED_IN', 'MANUAL_REVIEW_LAYER', 'DATA_BLOCKED', 'CONTRACT_GOLDEN_CASES'].includes(code)) issues.push(`RULE_OOS_REASON:${m.candidateId}:${r.id}:${r.reason}`);
    }
    for (const r of c.rules) if (!inPlan.has(r.id) && !oos.has(r.id)) issues.push(`RULE_NOT_COVERED:${m.candidateId}:${r.id}`);

    for (const p of m.params) {
      checks.params++;
      const e = psr.get(p.psr709);
      if (!e) { issues.push(`PARAM_PSR709_MISSING:${p.psr709}`); continue; }
      if (!e.rule_text_paraphrase.includes(p.token)) issues.push(`PARAM_TOKEN:${m.candidateId}:${p.psr709}:${p.token}`);
      const v = getPath((await mod(p.code.module))[p.code.export], p.code.path);
      if (v !== p.value) issues.push(`PARAM_VALUE:${m.candidateId}:${p.code.export}.${p.code.path}:${v}`);
      if (!PARAM_KINDS.includes(p.kind)) issues.push(`PARAM_KIND:${p.psr709}`);
      if (p.kind !== 'SOURCE_NUMBER' && !p.note && p.kind !== 'MODEL_BOUND_FROM_SOURCE_RANGE') issues.push(`PARAM_NOTE:${p.psr709}`);
      // Forschungsproxys (research/*) sind nie eine Quellenzahl; eine Quellenzahl liegt im Methodenmodul
      if (p.code.module.startsWith('research/') && p.kind === 'SOURCE_NUMBER') issues.push(`PARAM_KIND_MODEL_AS_SOURCE:${m.candidateId}:${p.code.export}.${p.code.path}`);
      if (p.kind === 'MODEL_BOUND_FROM_SOURCE_RANGE' && !p.code.module.startsWith('research/')) issues.push(`PARAM_KIND_MODEL_OUTSIDE_RESEARCH:${m.candidateId}:${p.code.export}.${p.code.path}`);
      if (p.code.module.startsWith('methods/')) paramSeen.add(`${p.code.module}#${p.code.export}#${p.code.path}`);
    }
    for (const b of m.blockers) blocker(b, m.candidateId);
    const cc = new Set([...m.ccMet, ...m.ccOpen]);
    if (cc.size !== 8) issues.push(`CC_SET:${m.candidateId}`);
    for (const k of m.ccOpen) if (!m.blockers.some((b) => b.criterion === k)) issues.push(`CC_OPEN_WITHOUT_BLOCKER:${m.candidateId}:${k}`);
    for (const d of m.dataRequirements ?? []) if (d.blocker) {
      const b = blockerById.get(d.blocker);
      if (!b) issues.push(`DATA_BLOCKER_MISSING:${d.id}:${d.blocker}`);
      else if (b.class !== d.class) issues.push(`DATA_CLASS:${d.id}:${d.class}:${b.class}`);
    }
    for (const s of m.studies) {
      checks.studies++;
      if (!BLOCKER_CLASSES.includes(s.class)) issues.push(`STUDY_CLASS:${s.id}`);
      if (!s.acceptance?.length) issues.push(`STUDY_NO_ACCEPTANCE:${s.id}`);
      for (const a of s.acceptance ?? []) {
        if (forbidden.has(a.metricKind) || !kinds.has(a.metricKind)) issues.push(`STUDY_METRIC_KIND:${s.id}:${a.metricKind}`);
        if (isPerformanceTarget(a.criterion)) issues.push(`STUDY_PERFORMANCE_TARGET:${s.id}`);
      }
    }
    for (const f of m.findings) if (!plan.findings.some((x) => x.id === f)) issues.push(`FINDING_MISSING:${f}`);

    // Mindestumfang der conformanceTests: jeder CP-Test der Familie, dessen Belegstellen (Klammern im Titel) eine
    // Regel, einen #709-Beleg oder einen Parameter dieser Methode nennen
    const fam = Object.entries(CP_FAMILIES).find(([, ms]) => ms.includes(m.candidateId))?.[0];
    const own = new Set([...m.rules.map((r) => r.id), ...m.rules.flatMap((r) => byId.get(r.id)?.psr709 ?? []), ...m.params.map((p) => p.psr709)]);
    for (const t of cpTitles.filter((x) => fam && x.startsWith(`CP-${fam}-`))) {
      const refs = [...t.matchAll(/\(([^)]*)\)/g)].map((x) => x[1]).join(' ').split(/[\s,;/]+/);
      if (refs.some((r) => own.has(r)) && !m.conformanceTests.includes(cpRef(t))) issues.push(`CONFORMANCE_MINIMUM:${m.candidateId}:${idsOfTitle(t)[0]}`);
    }
  }
  for (const [key, code] of paramExports) {
    for (const leaf of leaves((await mod(code.module))[code.export] ?? {})) if (!paramSeen.has(`${key}#${leaf}`)) issues.push(`PARAM_NOT_COVERED:${key}.${leaf}`);
  }
  // Vollständigkeit je Familie (Vereinigung) und der gemeinsamen CP-EXEC-Tests
  for (const [fam, ms] of Object.entries(CP_FAMILIES)) {
    const union = new Set(plan.methods.filter((m) => ms.includes(m.candidateId)).flatMap((m) => m.conformanceTests));
    for (const t of cpTitles.filter((x) => x.startsWith(`CP-${fam}-`))) if (!union.has(cpRef(t))) issues.push(`CONFORMANCE_FAMILY:${fam}:${idsOfTitle(t)[0]}`);
  }
  for (const t of cpTitles.filter((x) => x.startsWith('CP-EXEC-'))) if (!plan.sharedExecution.tests.includes(cpRef(t))) issues.push(`CONFORMANCE_SHARED:${idsOfTitle(t)[0]}`);
  for (const t of cpTitles) if (!['EXEC', ...Object.keys(CP_FAMILIES)].includes(t.split('-')[1])) issues.push(`CONFORMANCE_UNMAPPED:${idsOfTitle(t)[0]}`);
  for (const f of plan.findings) if (f.modelChange !== false) issues.push(`FINDING_IS_MODEL_CHANGE:${f.id}`);

  const cache = new Map();
  for (const ref of allTestRefs(plan)) {
    checks.tests++;
    const { file, id } = testRef(ref);
    if (!fs.existsSync(path.resolve(ROOT, file))) { issues.push(`TEST_FILE_MISSING:${file}`); continue; }
    if (!cache.has(file)) cache.set(file, testIdsOf(file));
    if (!cache.get(file).has(id)) issues.push(`TEST_MISSING:${ref}`);
  }
  return { issues, checks, dependency };
}

/** TAP-Ergebnis der Testdateien des Plans (nur mit --run-tests). */
export function runPlanTests(plan = loadPlan()) {
  const files = [...new Set(allTestRefs(plan).map((r) => testRef(r).file))];
  const results = [];
  // eigener Testlauf je Datei: kein Erbe eines umgebenden node --test (NODE_TEST_CONTEXT), Schutz vor Selbstaufruf
  const env = { ...process.env, CERT_PREP_NESTED: '1' };
  delete env.NODE_TEST_CONTEXT;
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', f], { cwd: ROOT, encoding: 'utf8', env });
    for (const line of r.stdout.split('\n')) {
      const m = /^(not ok|ok) \d+ - (.*?)( # SKIP.*)?$/.exec(line);
      if (m) results.push({ file: f, name: m[2], ok: m[1] === 'ok', skipped: Boolean(m[3]) });
    }
  }
  const pick = (ref) => { const { file, id } = testRef(ref); return results.find((x) => x.file === file && idsOfTitle(x.name).includes(id)); };
  return Object.fromEntries(plan.methods.map((m) => {
    const rows = m.conformanceTests.map((ref) => ({ ref, result: pick(ref) ? (pick(ref).skipped ? 'SKIPPED' : pick(ref).ok ? 'PASS' : 'FAIL') : 'NOT_FOUND' }));
    return [m.candidateId, { pass: rows.filter((x) => x.result === 'PASS').length, other: rows.filter((x) => x.result !== 'PASS'), acceptance: rows.every((x) => x.result === 'PASS') ? 'MET' : 'NOT_MET' }];
  }));
}

/**
 * Code-Fingerabdruck der rechnenden Engine auf dem geprüften Stand, verglichen mit einem im Code gepinnten
 * Referenzwert, soweit es ihn gibt (Turtle: SF6-PAPER-2027 references.pinned.turtleEngineCodeSha256). Für die
 * SF5-Lebenszyklen (C08, C12, C03) ist kein Referenz-Fingerabdruck gepinnt: Nachweis auf dem Referenz-Commit offen.
 */
export async function referenceCodeFingerprints() {
  const { codeSha256 } = await import('../runner/run-research.mjs');
  const { sf5ResearchCodeSha256 } = await import('../research/run-sf5-lifecycle.mjs');
  const { SF6_PAPER_PROTOCOL } = await import('../completion/sf6-paper-protocol-2027.mjs');
  const turtle = codeSha256(), pinned = SF6_PAPER_PROTOCOL.references.pinned.turtleEngineCodeSha256, sf5 = sf5ResearchCodeSha256();
  const turtleRow = { fingerprint: 'runner/run-research.mjs#codeSha256', head: turtle, pinnedReference: pinned, pinnedIn: 'SF6-PAPER-2027 references.pinned.turtleEngineCodeSha256', state: turtle === pinned ? 'HEAD_EQUALS_PINNED_REFERENCE_FINGERPRINT' : 'HEAD_DIFFERS_FROM_PINNED_REFERENCE_FINGERPRINT' };
  const sf5Row = { fingerprint: 'research/run-sf5-lifecycle.mjs#sf5ResearchCodeSha256', head: sf5, pinnedReference: null, pinnedIn: null, state: 'REFERENCE_FINGERPRINT_NOT_PINNED_REFERENCE_COMMIT_OPEN' };
  return { C02: turtleRow, C01: turtleRow, C08: sf5Row, C12: sf5Row, C03: sf5Row };
}

/** Reproduzierbares Prüfprotokoll (ohne Zeitstempel): Planhash, Prüfzählungen, Blocker je Klasse und Methode. */
export async function certPrepReport({ runTests = false, plan = loadPlan(), planFile = PLAN_FILE, runner = runPlanTests } = {}) {
  const { issues, checks, dependency } = await validatePlan(plan);
  const conformance = runTests ? runner(plan) : 'NOT_RUN (--run-tests)';
  if (runTests) for (const [id, r] of Object.entries(conformance)) if (r.acceptance !== 'MET') issues.push(`CONFORMANCE_NOT_MET:${id}`);
  const byClass = (list) => Object.fromEntries(BLOCKER_CLASSES.map((k) => [k, list.filter((b) => b.class === k).map((b) => b.id)]));
  return {
    id: 'SF9-CERT-PREP-TOP5-CHECK', version: CERT_PREP_CHECK_VERSION,
    plan: { id: plan.id, version: plan.version, fixedOn: plan.fixedOn, sha256: planSha256(planFile), contentSha256: planContentSha256(plan), pinnedContentSha256: PINNED_PLAN_CONTENT_SHA256 },
    valid: issues.length === 0, issues, checks,
    dependency: { pr: plan.dependsOn?.pr ?? null, file: plan.dependsOn?.file ?? null, sha256: plan.dependsOn?.sha256 ?? null, state: dependency, mergeOrder: plan.dependsOn?.mergeOrder ?? null },
    guards: plan.guards,
    crossCutting: byClass(plan.crossCuttingBlockers),
    methods: plan.methods.map((m) => ({
      candidateId: m.candidateId, strategyId: m.strategyId, priority: m.priority, ccOpen: m.ccOpen,
      blockersByClass: byClass(m.blockers),
      blockerStatus: Object.fromEntries(m.blockers.map((b) => [b.id, b.status])),
      studies: m.studies.map((s) => ({ id: s.id, class: s.class, status: s.status, ...(s.evidenceState ? { evidenceState: s.evidenceState } : {}) })),
      findings: m.findings,
    })),
    findings: plan.findings.map((f) => ({ id: f.id, kind: f.kind, modelChange: f.modelChange })),
    conformance,
    conformanceScope: runTests ? 'PR_HEAD_ONLY: die Tests liefen auf dem geprüften Arbeitsstand, nicht auf dem Commit, der die Referenz rechnet' : null,
    referenceCode: await referenceCodeFingerprints(),
  };
}

/** --out: Verzeichnis (dann <dir>/CERT-PREP-TOP5-CHECK.json) oder eine Datei mit Endung .json. */
export function outTarget(out) {
  if (/\.json$/i.test(out)) return out;
  return path.join(out, 'CERT-PREP-TOP5-CHECK.json');
}

async function main() {
  const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (args.includes('--help')) { process.stdout.write('cert-prep-top5.mjs [--out <dir | datei.json>] [--run-tests] [--plan <datei>]\n  --out <dir>: schreibt <dir>/CERT-PREP-TOP5-CHECK.json; --out <datei.json>: genau diese Datei; ohne --out: stdout\n  Exit 0 nur bei valid: true (NOT_MET mit --run-tests: Exit 1)\n'); return; }
  for (const k of ['--out', '--plan']) if (args.includes(k) && (!arg(k) || arg(k).startsWith('--'))) throw new Error(`${k} braucht einen Wert`);
  const planFile = arg('--plan') ? path.resolve(arg('--plan')) : PLAN_FILE;
  const report = await certPrepReport({ runTests: args.includes('--run-tests'), plan: loadPlan(planFile), planFile });
  const text = JSON.stringify(report, null, 1) + '\n';
  if (arg('--out')) { const file = outTarget(arg('--out')); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
  else process.stdout.write(text);
  if (!report.valid) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
