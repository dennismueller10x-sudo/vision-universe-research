/* Begrenzte Wiederholung der Live-Verifikation im Refresh-Workflow (refresh-live-verify.mjs) und Workflow-Vertrag.
 * Kein Netz, kein Workflow-Lauf: QA, Propagationsbeweis, Uhr und Pausen sind eingespeist; das echte YAML wird mit dem
 * abhaengigkeitsfreien Teilmengen-Parser (helpers/workflow-yaml.mjs) geprueft. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {verifyLive,decide,realQa,LIMITS} from '../refresh-live-verify.mjs';
import {CLASSES} from '../classify-live-failure.mjs';
import {CAUSE} from '../propagation-proof.mjs';
import {loadYamlFile} from './helpers/workflow-yaml.mjs';

const OK = fp => ({status: 'PROPAGATED', fingerprint: fp, observed: {discoverId: 'd1'}, attempts: [{n: 1, ok: true}]});
const NOT = (...causes) => ({status: 'NOT_PROPAGATED', cause: CAUSE, fingerprint: 'x', observed: {}, attempts: [{n: 1, ok: false, failed: causes.map(cause => ({name: 'ci-refresh', ok: false, cause}))}]});
const T0 = 1_000_000;
/** Skript: qa-Ergebnisse und Beweise der Reihe nach; protokolliert alle Aufrufe. */
function harness({qa, proofs, clock = () => T0, limits = LIMITS}) {
 const log = {qa: [], prove: [], sleeps: []};
 let q = 0, p = 0;
 const run = () => verifyLive({
  qa: async a => { log.qa.push(a); return qa[Math.min(q++, qa.length - 1)]; },
  prove: async o => { log.prove.push(o); const r = proofs[Math.min(p++, proofs.length - 1)]; if (r instanceof Error) throw r; return r; },
  sleep: async ms => { log.sleeps.push(ms); }, now: clock, limits
 });
 return {log, run};
}

test('transient (Mischstand): Fehler -> Gegenprobe MIXED -> Pause -> Beweis -> Wiederholung besteht, kein Fehlerergebnis', async () => {
 const h = harness({qa: [{ok: false, report: null}, {ok: true}], proofs: [OK('a'), NOT('MIXED'), OK('b')]});
 const r = await h.run();
 assert.equal(r.result, 'PASS');assert.equal(r.reason, 'PASSED_ON_RETRY_2');
 assert.equal(h.log.qa.length, 2);
 assert.deepEqual(h.log.sleeps, [LIMITS.backoffMs[0]]);
 assert.equal(h.log.prove[2].maxMs <= LIMITS.proofWaitMs, true); // wartender Beweis mit fester Obergrenze
 assert.equal(r.attempts[0].class, CLASSES.PROPAGATION);
});

test('transient: STALE und HTTP 503 der Gegenprobe gelten als Auslieferungsursache', async () => {
 for (const cause of ['STALE', 'HTTP_503', 'HTTP_429', 'REQUEST_FAILED', 'MISSING']) {
  const h = harness({qa: [{ok: false, report: null}, {ok: true}], proofs: [OK('a'), NOT(cause), OK('a')]});
  assert.equal((await h.run()).result, 'PASS', cause);
 }
});

test('echt: Zugriffs-/Sicherheitsursache (HTTP 401/403, INVALID) -> sofort FAIL, keine Wiederholung, keine Pause', async () => {
 for (const cause of ['HTTP_401', 'HTTP_403', 'INVALID', 'HTTP_400']) {
  const h = harness({qa: [{ok: false, report: null}, {ok: true}], proofs: [OK('a'), NOT(cause)]});
  const r = await h.run();
  assert.equal(r.result, 'FAIL', cause);assert.equal(h.log.qa.length, 1);assert.deepEqual(h.log.sleeps, []);
  assert.equal(r.attempts[0].class, CLASSES.REAL);
 }
 // gemischt: eine echte Ursache neben einer transienten macht den Fehler REAL
 const h = harness({qa: [{ok: false, report: null}], proofs: [OK('a'), NOT('MIXED', 'HTTP_403')]});
 assert.equal((await h.run()).result, 'FAIL');assert.equal(h.log.qa.length, 1);
});

test('echt: Beweis propagiert und gleicher Stand wie vorher -> REAL, sofort FAIL', async () => {
 const h = harness({qa: [{ok: false, report: null}, {ok: true}], proofs: [OK('same'), OK('same')]});
 const r = await h.run();
 assert.equal(r.result, 'FAIL');assert.equal(r.reason, 'SAME_STATE_REAL_FAILURE');assert.equal(h.log.qa.length, 1);assert.deepEqual(h.log.sleeps, []);
});

test('Stand hat sich nach dem Fehler geaendert (andere Kennung) -> transient, Wiederholung besteht', async () => {
 const h = harness({qa: [{ok: false, report: null}, {ok: true}], proofs: [OK('alt'), OK('neu'), OK('neu')]});
 const r = await h.run();
 assert.equal(r.result, 'PASS');assert.equal(r.attempts[0].reason, 'STATE_CHANGED_AFTER_PROOF');
});

test('echt: Browser-Assertion (Bericht FAIL, kein Timeout) bleibt REAL, auch wenn die Gegenprobe Mischstand zeigt', async () => {
 const report = {status: 'FAIL', error: {name: 'AssertionError', message: 'x'}, active: {ticker: 'AAPL'}, completedCases: 3};
 const h = harness({qa: [{ok: false, report}, {ok: true}], proofs: [OK('a'), NOT('MIXED')]});
 const r = await h.run();
 assert.equal(r.result, 'FAIL');assert.equal(r.reason, 'BROWSER_ASSERTION');assert.equal(h.log.qa.length, 1);
 // Sperrseiten-/Zugriffspruefung (active=null) ist ebenfalls eine Assertion
 const h2 = harness({qa: [{ok: false, report: {...report, active: null}}], proofs: [OK('a'), NOT('STALE')]});
 assert.equal((await h2.run()).reason, 'BROWSER_ASSERTION');
});

test('Browser-Timeout: nur transient bei belegter Auslieferungsstoerung; bei bewiesener Propagation REAL', async () => {
 const report = {status: 'FAIL', error: {name: 'TimeoutError', message: 't'}, active: {}, completedCases: 1};
 let h = harness({qa: [{ok: false, report}, {ok: true}], proofs: [OK('a'), NOT('HTTP_502'), OK('a')]});
 assert.equal((await h.run()).result, 'PASS');
 h = harness({qa: [{ok: false, report}, {ok: true}], proofs: [OK('a'), OK('a')]});
 const r = await h.run();
 assert.equal(r.result, 'FAIL');assert.equal(r.reason, 'BROWSER_TIMEOUT_AFTER_PROVEN_PROPAGATION');
});

test('Obergrenze: bleibt es transient, genau 1 + maxRetries QA-Laeufe, dann FAIL (Rollback-Pfad), Pausen fest begrenzt', async () => {
 const h = harness({qa: [{ok: false, report: null}], proofs: [OK('a'), NOT('MIXED'), OK('a'), NOT('MIXED'), OK('a'), NOT('MIXED')]});
 const r = await h.run();
 assert.equal(r.result, 'FAIL');assert.equal(r.reason, 'RETRIES_EXHAUSTED');
 assert.equal(h.log.qa.length, 1 + LIMITS.maxRetries);
 assert.deepEqual(h.log.sleeps, [...LIMITS.backoffMs]);
 assert.equal(h.log.prove.filter(o => o.maxMs).every(o => o.maxMs <= LIMITS.proofWaitMs), true);
});

test('Propagation wird auch nach der Wartezeit nicht erreicht -> FAIL ohne weiteren QA-Lauf', async () => {
 const h = harness({qa: [{ok: false, report: null}, {ok: true}], proofs: [OK('a'), NOT('MIXED'), NOT('STALE')]});
 const r = await h.run();
 assert.equal(r.result, 'FAIL');assert.equal(r.reason, 'PROPAGATION_NOT_REACHED');assert.equal(h.log.qa.length, 1);
 const h2 = harness({qa: [{ok: false, report: null}, {ok: true}], proofs: [OK('a'), NOT('MIXED'), NOT('HTTP_403')]});
 assert.equal((await h2.run()).reason !== 'PROPAGATION_NOT_REACHED', true); // echte Ursache wird als solche benannt
});

test('Zeitbudget: verbraucht der erste Lauf das Gesamtbudget, gibt es keine Wiederholung', async () => {
 let t = T0;
 const h = harness({qa: [{ok: false, report: null}, {ok: true}], proofs: [OK('a'), NOT('MIXED'), OK('a')], clock: () => { const v = t; t += LIMITS.totalCapMs; return v; }});
 const r = await h.run();
 assert.equal(r.result, 'FAIL');assert.equal(r.reason, 'NO_TIME_BUDGET');assert.equal(h.log.qa.length, 1);assert.deepEqual(h.log.sleeps, []);
});

test('Fail-closed: Beweis wirft oder fehlt -> REAL; QA wirft -> Fehlschlag', async () => {
 const h = harness({qa: [{ok: false, report: null}, {ok: true}], proofs: [OK('a'), new Error('netz')]});
 const r = await h.run();
 assert.equal(r.result, 'FAIL');assert.equal(r.reason, 'PROOF_UNAVAILABLE');assert.equal(h.log.qa.length, 1);
 assert.equal(decide({baseline: null, reproof: null, qaReport: null}).class, CLASSES.REAL);
 const throwing = await verifyLive({qa: async () => { throw new Error('x'); }, prove: async () => NOT('HTTP_403'), sleep: async () => {}});
 assert.equal(throwing.result, 'FAIL');
});

test('Erfolg beim ersten Lauf: keine Gegenprobe, keine Pause', async () => {
 const h = harness({qa: [{ok: true}], proofs: [OK('a')]});
 const r = await h.run();
 assert.equal(r.result, 'PASS');assert.equal(r.reason, 'PASSED');assert.equal(h.log.prove.length, 1);assert.deepEqual(h.log.sleeps, []);
});

test('realQa startet unveraendert refresh-qa --live, entfernt alten Bericht und liest den Fehlerbericht', async () => {
 const calls = [];
 const spawn = (cmd, args, opts) => { calls.push({cmd, args, opts}); return {status: 1}; };
 const out = '/nonexistent/live-qa.json';
 const r = await realQa({out, env: {A: '1'}, spawn})({timeoutMs: 5000});
 assert.equal(r.ok, false);assert.equal(r.report, null);
 assert.deepEqual(calls[0].args, ['scripts/company_intelligence/refresh-qa.mjs', '--live', '--out', out]);
 assert.equal(calls[0].opts.timeout, 5000);
 const src = readFileSync(fileURLToPath(new URL('../refresh-live-verify.mjs', import.meta.url)), 'utf8');
 const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
 assert.doesNotMatch(code, /rollback|production-release|\bgh\b|workflow run|refresh-run/, 'das Skript aendert keinen Zustand');
});

/* --- Workflow-Vertrag --- */
const file = process.env.CI_REFRESH_VERIFY_TEST_WORKFLOW || fileURLToPath(new URL('../../../.github/workflows/company-intelligence-refresh.yml', import.meta.url));
const wf = loadYamlFile(file), steps = wf.jobs.refresh.steps;
const deploy = steps.find(s => s.id === 'deploy_live'), rollback = steps.find(s => /^Fail closed on actual production regression/.test(s.name || ''));

test('Workflow: Deploy-Verify ruft die begrenzte Verifikation statt refresh-qa --live; Reihenfolge Verify vor observe', () => {
 assert.ok(deploy && rollback);
 assert.match(deploy.run, /node scripts\/company_intelligence\/refresh-live-verify\.mjs --out "\$RUNNER_TEMP\/ci-refresh\/live-qa\.json"/);
 assert.doesNotMatch(deploy.run, /refresh-qa\.mjs/, 'keine ungeschuetzte Einmal-QA mehr');
 const verify = deploy.run.indexOf('refresh-live-verify.mjs'), observe = deploy.run.indexOf('refresh-run.mjs observe'), slo = deploy.run.indexOf('PRODUCTION_PUBLICATION_SLO_FAILED');
 assert.ok(slo >= 0 && slo < verify && verify < observe);
 assert.equal(deploy['continue-on-error'], undefined, 'Fehler der Verifikation muss den Schritt rot machen');
 assert.equal(deploy.if, 'inputs.verification != true');
});

test('Workflow: Rollback bleibt fail-closed und unveraendert (sofort bei Fehlschlag des Deploy-/Verify-Schritts)', () => {
 assert.equal(rollback.if, "failure() && steps.deploy_live.outcome == 'failure' && inputs.verification != true");
 assert.ok(steps.indexOf(rollback) > steps.indexOf(deploy));
 assert.match(rollback.run, /refresh-run\.mjs rollback \|\| true/);
 assert.match(rollback.run, /production-release\.mjs disable \|\| true/);
 assert.match(rollback.run, /gh workflow run pages-release\.yml --ref main -f company_intelligence_off=true/);
});

test('Workflow: ADR-005 (Eingaben nur ueber env), Rechte, Timeout und Passwortschutz unveraendert', () => {
 for (const s of steps) if (s.run) assert.doesNotMatch(s.run, /\$\{\{\s*inputs\./, 'Eingabe im run-Block: ' + (s.name || s.id));
 assert.equal(deploy.env.RESEARCH_ACCESS_PASSWORD, '${{ secrets.RESEARCH_ACCESS_PASSWORD }}');
 assert.equal(deploy.env.NODE_PATH, '/tmp/ci-refresh/node_modules');
 assert.deepEqual(wf.permissions, {contents: 'read', actions: 'write'});
 assert.equal(wf.jobs.refresh['timeout-minutes'], 60);
 const upload = steps.find(s => String(s.uses).startsWith('actions/upload-artifact') && /health/.test(String(s.with?.name)));
 assert.match(upload.with.path, /live-qa\.json\.verify\.json/);
 assert.match(upload.with.path, /live-qa\.json\n/);
});

test('Obergrenzen sind fest und passen ins Jobbudget', () => {
 assert.ok(Object.isFrozen(LIMITS) && Object.isFrozen(LIMITS.backoffMs));
 assert.ok(LIMITS.maxRetries <= 2);
 const worst = LIMITS.qaTimeoutMs + LIMITS.totalCapMs;
 assert.ok(LIMITS.totalCapMs <= 15 * 60000 && worst <= 25 * 60000);
});
