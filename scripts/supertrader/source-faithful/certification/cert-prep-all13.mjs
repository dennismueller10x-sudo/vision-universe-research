#!/usr/bin/env node
/**
 * Supertrader 9 – Zertifizierungsvorbereitung aller 13 Methoden (CERT-PREP-ALL13-PLAN.json).
 *
 * Der ALL13-Plan erweitert den unveränderten, gepinnten TOP5-Plan (CERT-PREP-TOP5-PLAN.json) um die übrigen acht
 * Methoden (C07, C06, C13, C11, C05, C04, C09, C10). Der Prüfer
 *  - pinnt den ALL13-Planinhalt (PINNED_ALL13_CONTENT_SHA256) und verlangt, dass die Basis der gepinnte TOP5-Plan ist
 *    (PINNED_PLAN_CONTENT_SHA256 aus cert-prep-top5.mjs); der TOP5-Plan selbst muss weiter gültig sein;
 *  - führt beide Pläne nach festen Regeln zusammen (mergePlans) und prüft das Ergebnis mit derselben Plan-Prüfung wie
 *    TOP5 (validatePlan: Regeln, Parameter, #709-Wortlaut, Tests, Klassen, Abnahmekriterien ohne Renditeziel);
 *  - verlangt alle 13 Methoden genau einmal (C01..C13) in der Reihenfolge der Matrix (Priorität 1..13);
 *  - prüft die Gegenproben (mutationProbes) statisch: jeder CP-Regeltreue-Test der ALL13-Testdatei hat mindestens eine;
 *    jede nennt eine Codestelle in methods/ oder research/, die genau einmal vorkommt;
 *  - mit --mutation-probes: wendet jede Gegenprobe einzeln auf den Engine-Code an, lässt den genannten Test laufen,
 *    verlangt ROT und stellt die Datei sofort byte-gleich wieder her (Prüfung per sha256). Nur lokal, nie in CI oder
 *    in einem Test; bricht ab, wenn eine Probe statisch fehlerhaft ist oder eine Zieldatei (Arbeitsstand oder Index)
 *    schon vom HEAD abweicht. Der Lauf ist synchron: ein Abbruch mit SIGKILL kann eine Datei mutiert zurücklassen;
 *    der nächste Lauf verweigert dann (Datei weicht vom HEAD ab), wiederherstellen mit dem Checkout der Datei.
 * Liest sonst nur; ändert keine Regel, keinen Parameter, keine Daten.
 *
 *   node scripts/supertrader/source-faithful/certification/cert-prep-all13.mjs [--out <dir | datei.json>] [--run-tests] [--mutation-probes] [--plan <datei>]
 * Exit 0 nur bei valid: true.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPlan, validatePlan, runPlanTests, planContentSha256, planSha256, referenceCodeFingerprints, testTitlesOf, idsOfTitle, SF_DIR, ROOT, PLAN_FILE, PINNED_PLAN_CONTENT_SHA256, DEFAULT_CP_TEST_FILES, BLOCKER_CLASSES } from './cert-prep-top5.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ALL13_PLAN_FILE = path.join(HERE, 'CERT-PREP-ALL13-PLAN.json');
export const CERT_PREP_ALL13_CHECK_VERSION = 'sf9-cert-prep-all13-check-1.0.0';
/** Pin des ALL13-Planinhalts (sha256 über JSON.stringify des geladenen ALL13-Plans). Neu setzen nur in einem begründeten Commit. */
export const PINNED_ALL13_CONTENT_SHA256 = '106b7155675d272179b8b6db019e601a45ba0ddbe49d7e8b11121aee1fcae802';
export const ALL13_TEST_FILE = 'scripts/supertrader/tests/sf-cert-prep-all13.test.mjs';
/** Familienpräfix der CP-Tests der ALL13-Testdatei -> Methoden. */
export const ALL13_CP_FAMILIES = Object.freeze({ WEIN: ['C04', 'C05'], MIN: ['C06', 'C07'], EP: ['C09'], PS: ['C10'], PP: ['C11'], HG: ['C13'] });
export const ALL13_CANDIDATES = Object.freeze(Array.from({ length: 13 }, (_, k) => `C${String(k + 1).padStart(2, '0')}`));
const CP_TEST_FILES = Object.freeze([...DEFAULT_CP_TEST_FILES, Object.freeze({ file: ALL13_TEST_FILE, families: ALL13_CP_FAMILIES })]);

export const loadAll13 = (file = ALL13_PLAN_FILE) => JSON.parse(fs.readFileSync(file, 'utf8'));
/** Gleiche Bildung wie planContentSha256 (sha256 über JSON.stringify des geladenen Plans). */
export const all13ContentSha256 = (ext) => planContentSha256(ext);
const fileSha = (f) => planSha256(f);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Zusammenführung (deterministisch): Basis unverändert, die Erweiterung hängt an. guards und dependsOn müssen gleich
 * sein; ein Ausschlussgrund der Basis darf nicht umdefiniert werden; ein paramsOutOfScope-Eintrag der Basis mit
 * OTHER_METHOD:<Kandidat> wird nur ersetzt, wenn er in paramsOutOfScopeSuperseded steht und <Kandidat> zur Erweiterung
 * gehört (die Methode führt den Parameter dann selbst; fehlt er dort, meldet validatePlan PARAM_NOT_COVERED).
 */
export function mergePlans(base, ext) {
  const issues = [];
  if (!same(ext.guards, base.guards)) issues.push('MERGE_GUARDS_DIFFER');
  if (!same(ext.dependsOn, base.dependsOn)) issues.push('MERGE_DEPENDENCY_DIFFERS');
  for (const [k, v] of Object.entries(ext.outOfScopeReasons ?? {})) if (base.outOfScopeReasons?.[k] !== undefined && base.outOfScopeReasons[k] !== v) issues.push(`MERGE_REASON_REDEFINED:${k}`);
  const extIds = new Set(ext.methods.map((m) => m.candidateId)), key = (p) => `${p.module}#${p.export}#${p.path}`;
  const superseded = new Set();
  for (const s of ext.paramsOutOfScopeSuperseded ?? []) {
    const b = (base.paramsOutOfScope ?? []).find((p) => key(p) === key(s));
    if (!b || !String(b.reason).startsWith('OTHER_METHOD:') || !extIds.has(b.reason.split(':')[1])) issues.push(`MERGE_SUPERSEDE_INVALID:${key(s)}`);
    else superseded.add(key(s));
  }
  for (const m of ext.methods) if (base.methods.some((x) => x.candidateId === m.candidateId)) issues.push(`MERGE_METHOD_IN_BASE:${m.candidateId}`);
  // keine Kollision von IDs oder Schlüsseln zwischen Basis und Erweiterung
  for (const f of ext.findings ?? []) if (base.findings.some((x) => x.id === f.id)) issues.push(`MERGE_DUPLICATE_FINDING:${f.id}`);
  for (const p of ext.paramsOutOfScope ?? []) if ((base.paramsOutOfScope ?? []).some((x) => key(x) === key(p))) issues.push(`MERGE_DUPLICATE_PARAM_OOS:${key(p)}`);
  for (const t of ext.sharedExecutionTests ?? []) if (base.sharedExecution.tests.includes(t)) issues.push(`MERGE_DUPLICATE_SHARED_TEST:${t}`);
  const plan = {
    ...base,
    id: ext.id, version: ext.version, fixedOn: ext.fixedOn, status: ext.status,
    outOfScopeReasons: { ...base.outOfScopeReasons, ...ext.outOfScopeReasons },
    sharedExecution: { ...base.sharedExecution, tests: [...base.sharedExecution.tests, ...(ext.sharedExecutionTests ?? [])] },
    paramsOutOfScope: [...(base.paramsOutOfScope ?? []).filter((p) => !superseded.has(key(p))), ...(ext.paramsOutOfScope ?? [])],
    crossCuttingBlockers: [...base.crossCuttingBlockers, ...(ext.crossCuttingBlockers ?? [])],
    methods: [...base.methods, ...ext.methods],
    findings: [...base.findings, ...(ext.findings ?? [])],
  };
  return { plan, issues };
}

const titlesOf = (file) => testTitlesOf(file).map((t) => idsOfTitle(t)[0]);

/** Statische Prüfung der Gegenproben. */
function probeIssues(ext) {
  const issues = [], titles = titlesOf(ALL13_TEST_FILE), cp = titles.filter((t) => t.startsWith('CP-') && !t.startsWith('CP-PLAN-'));
  const ids = new Set();
  for (const p of ext.mutationProbes ?? []) {
    if (ids.has(p.id)) issues.push(`MUTATION_PROBE_DUPLICATE:${p.id}`); ids.add(p.id);
    if (!cp.includes(p.test)) issues.push(`MUTATION_PROBE_TEST_UNKNOWN:${p.id}:${p.test}`);
    if (!/^(methods|research)\/[a-z0-9-]+\.mjs$/.test(p.file ?? '')) { issues.push(`MUTATION_PROBE_SCOPE:${p.id}:${p.file}`); continue; }
    const f = path.join(SF_DIR, p.file);
    if (!fs.existsSync(f)) { issues.push(`MUTATION_PROBE_FILE:${p.id}`); continue; }
    const n = fs.readFileSync(f, 'utf8').split(p.find).length - 1;
    if (!p.find || n !== 1) issues.push(`MUTATION_PROBE_FIND:${p.id}:${n}`);
    if (!p.replace || p.replace === p.find) issues.push(`MUTATION_PROBE_REPLACE:${p.id}`);
    if (!p.why) issues.push(`MUTATION_PROBE_WHY:${p.id}`);
  }
  for (const t of cp) if (!(ext.mutationProbes ?? []).some((p) => p.test === t)) issues.push(`MUTATION_PROBE_MISSING:${t}`);
  return issues;
}

/** Validiert ALL13: Pins, Basis, Zusammenführung, Plan-Prüfung, Abdeckung C01..C13, Gegenproben. */
export async function validateAll13({ ext = loadAll13(), base = loadPlan() } = {}) {
  const issues = [];
  const extSha = all13ContentSha256(ext), baseSha = planContentSha256(base);
  if (extSha !== PINNED_ALL13_CONTENT_SHA256) issues.push(`ALL13_PLAN_NOT_PINNED:${extSha}`);
  if (baseSha !== PINNED_PLAN_CONTENT_SHA256 || ext.extends?.contentSha256 !== PINNED_PLAN_CONTENT_SHA256) issues.push(`BASE_NOT_PINNED:${baseSha}`);
  if (ext.extends?.id !== base.id || ext.extends?.version !== base.version) issues.push('EXTENDS_IDENTITY');
  // die TOP5-Basis bleibt für sich gültig (mit ihrem eigenen Pin)
  for (const x of (await validatePlan(base)).issues) if (!x.startsWith('PLAN_NOT_PINNED:')) issues.push(`BASE:${x}`); // der Pin steht schon als BASE_NOT_PINNED
  const { plan, issues: mergeIssues } = mergePlans(base, ext);
  issues.push(...mergeIssues);
  const v = await validatePlan(plan, { pinnedContentSha256: null, cpTestFiles: CP_TEST_FILES });
  issues.push(...v.issues);
  const ids = plan.methods.map((m) => m.candidateId);
  if (!same([...ids].sort(), [...ALL13_CANDIDATES]) || new Set(ids).size !== 13) issues.push(`ALL13_COVERAGE:${ids.join(',')}`);
  if (!same(plan.methods.map((m) => m.priority), Array.from({ length: plan.methods.length }, (_, k) => k + 1))) issues.push('ALL13_PRIORITY_ORDER');
  issues.push(...probeIssues(ext));
  return { issues, checks: { ...v.checks, mutationProbes: (ext.mutationProbes ?? []).length }, dependency: v.dependency, plan };
}

/**
 * Gegenproben ausführen (nur --mutation-probes, nur lokal): je Probe Datei mutieren, den Test laufen lassen, ROT
 * verlangen, Datei byte-gleich zurücksetzen. Weicht eine Zieldatei schon vor dem Lauf vom Git-Stand ab, läuft nichts.
 */
export function runMutationProbes(ext = loadAll13()) {
  // nie mit einer statisch fehlerhaften Probe schreiben (Bereich methods/ und research/, Fundstelle genau einmal)
  const bad = probeIssues(ext);
  if (bad.length) throw new Error(`MUTATION_PROBES_REFUSED_STATIC:${bad.join(',')}`);
  const files = [...new Set(ext.mutationProbes.map((p) => p.file))];
  for (const f of files) {
    const r = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', path.join(SF_DIR, f)], { cwd: ROOT });
    if (r.status !== 0) throw new Error(`MUTATION_PROBES_REFUSED_DIRTY:${f}`);
  }
  const env = { ...process.env, CERT_PREP_NESTED: '1' }; delete env.NODE_TEST_CONTEXT;
  const results = [];
  for (const p of ext.mutationProbes) {
    const f = path.join(SF_DIR, p.file), original = fs.readFileSync(f), sha = fileSha(f);
    const restore = () => { fs.writeFileSync(f, original); if (fileSha(f) !== sha) throw new Error(`MUTATION_RESTORE_FAILED:${p.file}`); };
    let state;
    try {
      fs.writeFileSync(f, original.toString('utf8').replace(p.find, () => p.replace));
      const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=^${p.test}:`, ALL13_TEST_FILE], { cwd: ROOT, encoding: 'utf8', env });
      const line = r.stdout.split('\n').find((l) => new RegExp(`^(not ok|ok) \\d+ - ${p.test}:`).test(l));
      state = !line ? 'NOT_FOUND' : line.startsWith('not ok') ? 'RED' : 'STAYED_GREEN';
    } finally { restore(); }
    results.push({ id: p.id, test: p.test, file: p.file, result: state });
  }
  return results;
}

/** Code-Fingerabdrücke der rechnenden Engines (TOP5 unverändert, dazu die acht übrigen Methoden). */
export async function all13ReferenceCode() {
  const top5 = await referenceCodeFingerprints();
  const { researchCodeSha256 } = await import('../research/run-sf4-lifecycle.mjs');
  const { kkResearchCodeSha256 } = await import('../research/run-kk-intraday.mjs');
  const { SF6_PAPER_PROTOCOL } = await import('../completion/sf6-paper-protocol-2027.mjs');
  const pin = SF6_PAPER_PROTOCOL.references.pinned.minerviniResearchCodeSha256, min = researchCodeSha256();
  const sf5 = { fingerprint: 'research/run-sf5-lifecycle.mjs#sf5ResearchCodeSha256', head: top5.C08.head, pinnedReference: null, pinnedIn: null, state: 'REFERENCE_FINGERPRINT_NOT_PINNED_REFERENCE_COMMIT_OPEN' };
  const minRow = { fingerprint: 'research/run-sf4-lifecycle.mjs#researchCodeSha256', head: min, pinnedReference: pin, pinnedIn: 'SF6-PAPER-2027 references.pinned.minerviniResearchCodeSha256', state: min === pin ? 'HEAD_EQUALS_PINNED_REFERENCE_FINGERPRINT' : 'HEAD_DIFFERS_FROM_PINNED_REFERENCE_FINGERPRINT' };
  const kk = { fingerprint: 'research/run-kk-intraday.mjs#kkResearchCodeSha256', head: kkResearchCodeSha256(), pinnedReference: null, pinnedIn: null, state: 'NOT_IN_SF6_PAPER_2027_NO_PINNED_REFERENCE' };
  return { ...top5, C07: minRow, C06: minRow, C13: sf5, C11: sf5, C05: sf5, C04: sf5, C09: kk, C10: kk };
}

/** Reproduzierbares ALL13-Prüfprotokoll (ohne Zeitstempel). */
export async function all13Report({ runTests = false, mutationProbes = false, ext = loadAll13(), extFile = ALL13_PLAN_FILE, runner = runPlanTests, prober = runMutationProbes } = {}) {
  const { issues, checks, dependency, plan } = await validateAll13({ ext });
  const conformance = runTests ? runner(plan) : 'NOT_RUN (--run-tests)';
  if (runTests) for (const [id, r] of Object.entries(conformance)) if (r.acceptance !== 'MET') issues.push(`CONFORMANCE_NOT_MET:${id}`);
  const probes = mutationProbes ? prober(ext) : 'NOT_RUN (--mutation-probes)';
  if (mutationProbes) for (const r of probes) if (r.result !== 'RED') issues.push(`MUTATION_PROBE_NOT_RED:${r.id}:${r.result}`);
  const byClass = (list) => Object.fromEntries(BLOCKER_CLASSES.map((k) => [k, list.filter((b) => b.class === k).map((b) => b.id)]));
  return {
    id: 'SF9-CERT-PREP-ALL13-CHECK', version: CERT_PREP_ALL13_CHECK_VERSION,
    plan: { id: ext.id, version: ext.version, fixedOn: ext.fixedOn, sha256: fileSha(extFile), contentSha256: all13ContentSha256(ext), pinnedContentSha256: PINNED_ALL13_CONTENT_SHA256, extends: { id: ext.extends?.id ?? null, version: ext.extends?.version ?? null, sha256: planSha256(PLAN_FILE), contentSha256: ext.extends?.contentSha256 ?? null } },
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
    mutationProbes: probes,
    referenceCode: await all13ReferenceCode(),
  };
}

export function all13OutTarget(out) { return /\.json$/i.test(out) ? out : path.join(out, 'CERT-PREP-ALL13-CHECK.json'); }

async function main() {
  const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (args.includes('--help')) { process.stdout.write('cert-prep-all13.mjs [--out <dir | datei.json>] [--run-tests] [--mutation-probes] [--plan <datei>]\n'); return; }
  for (const k of ['--out', '--plan']) if (args.includes(k) && (!arg(k) || arg(k).startsWith('--'))) throw new Error(`${k} braucht einen Wert`);
  const extFile = arg('--plan') ? path.resolve(arg('--plan')) : ALL13_PLAN_FILE;
  const report = await all13Report({ runTests: args.includes('--run-tests'), mutationProbes: args.includes('--mutation-probes'), ext: loadAll13(extFile), extFile });
  const text = JSON.stringify(report, null, 1) + '\n';
  if (arg('--out')) { const file = all13OutTarget(arg('--out')); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
  else process.stdout.write(text);
  if (!report.valid) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
