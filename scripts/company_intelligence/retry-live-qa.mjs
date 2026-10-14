/* Begrenzte, rein lesende Wiederholung der Live-Pruefung nach einem als TRANSIENT klassifizierten Fehler
 * (pages-release.yml, Job company-intelligence-live; Klassifikation: classify-live-failure.mjs).
 *
 * Grundsaetze:
 *  - Verandert KEINEN Zustand: kein refresh-run, kein production-release, kein gh, kein R2-Schreiben. Es startet nur die gleichen
 *    Installations- und QA-Skripte wie der erste Versuch, mit eigenem RUNNER_TEMP (retry-<n>), damit Berichte nicht ueberschrieben werden.
 *  - Begrenzt: TRANSIENT_PROPAGATION hoechstens 1 Wiederholung (die QA wartet selbst bis 8 Minuten auf die Auslieferung; zusammen mit
 *    dem ersten Versuch ueberdeckt das die 10 Minuten max-age der CDN-Objekte), TRANSIENT_INFRA hoechstens 2.
 *  - Zeitbudget: Job-Timeout 35 min. Eine Wiederholung startet nur, wenn Restzeit >= Bedarf + Reserve fuer den Fail-closed-Handler bleibt;
 *    sonst SKIPPED (der Handler laeuft dann wie bisher). Die QA-Skripte bekommen CI_QA_BUDGET_MS passend zur Restzeit, der Prozess ein Zeitlimit.
 *  - Jeder fehlgeschlagene Versuch wird neu klassifiziert: wird er REAL, endet die Wiederholung sofort (kein beruhigendes Wiederholen).
 *  - Ergebnis nur ueber Ausgaben (result=PASS|FAIL|SKIPPED), Prozess endet immer mit 0; der Workflow entscheidet ueber Handler und Jobstatus.
 */
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {CLASSES,classifyReport,readReport,reportFile} from './classify-live-failure.mjs';

export const JOB_TIMEOUT_S = 35 * 60;
export const DEFAULTS = Object.freeze({
 proofMaxS: 480,        // propagation-proof.mjs DEFAULTS.maxMs (8 min)
 installS: 540,         // install-browser-deps.mjs: 8 min Zeitlimit + Anlauf
 qaS: Object.freeze({routine: 300, full: 900, off: 300}),
 handlerReserveS: 300,  // Rollback + OFF-Dispatch + Artefakt-Upload nach der Wiederholung
 pauseInfraS: 30,
 maxAttempts: Object.freeze({[CLASSES.PROPAGATION]: 1, [CLASSES.INFRA]: 2})
});

/** Geschaetzter Bedarf einer Wiederholung in Sekunden (ohne Handler-Reserve). */
export function needSeconds(cls, {qa, full}, d = DEFAULTS) {
 const run = qa === 'off' ? d.qaS.off : full ? d.qaS.full : d.qaS.routine;
 return cls === CLASSES.INFRA ? d.installS + run : d.proofMaxS + run;
}

export function budget({nowS, startedAtS, cls, qa, full, timeoutS = JOB_TIMEOUT_S, d = DEFAULTS}) {
 const left = startedAtS + timeoutS - nowS, need = needSeconds(cls, {qa, full}, d) + d.handlerReserveS;
 return {ok: left >= need, leftS: Math.round(left), needS: need, qaBudgetMs: Math.max(0, Math.floor((left - d.handlerReserveS) * 1000))};
}

/**
 * Kern ohne Prozess-/Dateizugriff (testbar).
 * attempt({n, cls, qa, qaBudgetMs}) -> {depsFailed?:boolean, report?:object|null, ok:boolean}
 */
export async function runRetries({cls, qa, full = false, startedAtS, now = () => Date.now() / 1000, sleep = async () => {}, attempt, d = DEFAULTS, timeoutS = JOB_TIMEOUT_S}) {
 if (!Number.isFinite(startedAtS) || startedAtS <= 0) return {result: 'SKIPPED', finalClass: cls, reason: 'STARTED_AT_INVALID', attempts: []}; // Zeitbudget unbekannt: fail-closed
 if (cls !== CLASSES.PROPAGATION && cls !== CLASSES.INFRA) return {result: 'SKIPPED', finalClass: cls, reason: 'NOT_TRANSIENT', attempts: []};
 const attempts = [];
 let current = cls;
 for (let n = 1; n <= d.maxAttempts[cls]; n++) {
  if (n > 1 && current === CLASSES.INFRA && d.pauseInfraS) await sleep(d.pauseInfraS * 1000); // Pause zaehlt zur Zeit
  const b = budget({nowS: now(), startedAtS, cls: current, qa, full, timeoutS, d});
  if (!b.ok) return {result: attempts.length ? 'FAIL' : 'SKIPPED', finalClass: current, reason: 'NO_TIME_BUDGET (rest ' + b.leftS + ' s < Bedarf ' + b.needS + ' s)', attempts};
  let r;
  try { r = await attempt({n, cls: current, qa, qaBudgetMs: b.qaBudgetMs, deadlineS: startedAtS + timeoutS - d.handlerReserveS}); } catch (error) { r = {ok: false, depsFailed: false, report: null, error: String(error?.name || 'Error')}; }
  const next = r.ok ? null : r.depsFailed ? {class: CLASSES.INFRA, reason: 'BROWSER_DEPENDENCIES_FAILED'} : classifyReport(r.report);
  attempts.push({n, ok: !!r.ok, class: next?.class ?? null, reason: next?.reason ?? null, ...(r.error ? {error: r.error} : {})});
  if (r.ok) return {result: 'PASS', finalClass: current, reason: 'PASSED_ON_RETRY_' + n, attempts};
  current = next.class;
  if (current === CLASSES.REAL) return {result: 'FAIL', finalClass: CLASSES.REAL, reason: next.reason, attempts};
 }
 return {result: 'FAIL', finalClass: current, reason: 'RETRIES_EXHAUSTED', attempts};
}

/** Befehle eines Versuchs. Bewusst nur Installation und QA - die Tests pruefen, dass nie ein zustandsaendernder Befehl darin steht. */
export {realAttempt};
export function attemptCommands({qa, installFirst}) {
 const cmds = [];
 if (installFirst) cmds.push({cmd: 'bash', args: ['scripts/company_intelligence/live-browser-setup.sh'], kind: 'deps'});
 cmds.push(qa === 'off' ? {cmd: 'node', args: ['scripts/company_intelligence/production-off-qa.mjs'], kind: 'qa'}
  : {cmd: 'bash', args: ['scripts/company_intelligence/live-qa-suite.sh'], kind: 'qa'});
 return cmds;
}

function realAttempt(env, spawn = spawnSync, nowS = () => Date.now() / 1000) {
 return async ({n, cls, qa, deadlineS}) => {
  const base = (env.RUNNER_TEMP || '/tmp') + '/retry-' + n;
  mkdirSync(base, {recursive: true});
  for (const c of attemptCommands({qa, installFirst: cls === CLASSES.INFRA})) {
   /* Zeitlimit je Befehl = Rest bis zur Handler-Reserve, nach der Installation neu berechnet. */
   const leftMs = Math.floor((deadlineS - nowS()) * 1000);
   if (leftMs < 1000) return {ok: false, depsFailed: c.kind === 'deps', report: null};
   console.log(`Wiederholung ${n}: ${c.kind}`);
   const res = spawn(c.cmd, c.args, {env: {...env, RUNNER_TEMP: base, CI_QA_BUDGET_MS: String(leftMs)}, stdio: 'inherit', timeout: leftMs, killSignal: 'SIGTERM'});
   if (res.error || res.status !== 0) {
    if (c.kind === 'deps') return {ok: false, depsFailed: true, report: null};
    return {ok: false, depsFailed: false, report: readReport(reportFile(base, qa))};
   }
  }
  return {ok: true};
 };
}

export async function main(env = process.env) {
 const cls = env.CLASS, qa = env.QA === 'off' ? 'off' : 'live', full = env.FULL_ACCEPTANCE === 'true';
 const startedAtS = Number(env.STARTED_AT); // fehlt/ungueltig -> runRetries liefert SKIPPED (fail-closed)
 const out = await runRetries({cls, qa, full, startedAtS, sleep: ms => new Promise(r => setTimeout(r, ms)), attempt: realAttempt(env)});
 const root = env.RUNNER_TEMP || '/tmp';
 try { mkdirSync(root + '/live-failure', {recursive: true}); writeFileSync(root + '/live-failure/retry.json', JSON.stringify(out, null, 2) + '\n'); } catch { /* Beleg optional */ }
 if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `result=${out.result}\nfinal_class=${out.finalClass}\n`);
 const safe = v => String(v ?? '').replace(/[^A-Za-z0-9_,.:()<>=\- ]/g, '?').slice(0, 200);
 const line = `Wiederholung nach ${cls}: ${out.result} (${safe(out.reason)}), Versuche: ${out.attempts.length}, Endklasse ${out.finalClass}`;
 console.log(line);
 if (out.result === 'PASS') console.log('::warning title=Company-Intelligence-Live-QA erst bei Wiederholung bestanden::' + safe(line) + ' - vorheriger Fehler war ' + safe(cls) + '. Kein Rollback ausgeloest.');
 if (env.GITHUB_STEP_SUMMARY) { try { appendFileSync(env.GITHUB_STEP_SUMMARY, line + '\n'); } catch { /* optional */ } }
 return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { await main(); } catch (error) { console.error('RETRY_HARNESS_ERROR', error?.name); } }
