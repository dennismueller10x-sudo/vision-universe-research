/* Live-Verifikation des Refresh-Workflows (company-intelligence-refresh.yml, Schritt "Deploy existing Pages pipeline ...").
 *
 * WARUM: `refresh-qa --live` lief einmalig; JEDER Fehler loeste sofort `refresh-run rollback`, `production-release disable` und den
 * OFF-Dispatch aus. Am 15.10.2026 20:12Z fuehrte ein transienter Mischstand (delivery.json <-> refresh.json, CDN-Edge-Cache,
 * max-age=600) so zum Rollback. Dieses Skript wiederholt die LESENDE Pruefung begrenzt - und nur bei belegter Auslieferungsursache.
 * Es baut nichts Paralleles: Propagationsbeweis (propagation-proof.mjs, ci:'ON') und Klassifikator (classify-live-failure.mjs)
 * aus den Pull Requests #692/#695 werden wiederverwendet; die QA selbst bleibt unveraendert (refresh-qa.mjs --live).
 *
 * Ablauf:
 *  1. Grundstand: ein einzelner Propagationsbeweis ohne Warten (nur Kennung, nicht bewertend).
 *  2. refresh-qa --live. Bestanden -> fertig.
 *  3. Fehler -> Gegenprobe (ein Beweis ohne Warten) und Klassifikation:
 *     - Beweis NOT_PROPAGATED: classifyReport() (STALE/MIXED/MISSING/REQUEST_FAILED/HTTP 429/5xx = TRANSIENT_PROPAGATION; alles andere,
 *       z. B. HTTP 401/403, INVALID, = REAL).
 *     - Beweis PROPAGATED: retryDecision() - nur wenn sich der Stand nachweislich geaendert hat (andere Kennung) transient, sonst REAL.
 *     - Hatte die Browserphase schon einen Bericht (live-qa.json mit status FAIL), ist ausser einem Playwright-TimeoutError alles REAL
 *       (Assertion = Daten-/Zugriffs-/Sicherheitsfehler).
 *     Universe-Pfad: universe-browser-qa schreibt bei Browserfehlern einen Bericht mit status FAIL OHNE `error`; das ist hier immer REAL
 *     (nur ein Bericht mit error.name === 'TimeoutError' kann transient sein).
 *  4. REAL -> sofortiges Ende mit Exit 1 (der Workflow rollt zurueck). TRANSIENT -> begrenzte Pause, Beweis MIT Warten (hoechstens
 *     proofWaitMs), dann hoechstens `maxRetries` weitere QA-Laeufe. Obergrenzen sind fest (LIMITS), nicht konfigurierbar, und
 *     gelten zusammen als Gesamtbudget (totalCapMs): vorher wird keine Wiederholung gestartet, die nicht mehr hineinpasst.
 *
 * Das Skript aendert KEINEN Zustand (kein Rollback, kein Gate, kein R2, kein gh). Ergebnis: Exit 0 = bestanden, Exit 1 = Fehler
 * (REAL, Obergrenze oder Zeitbudget). Der Rollback-Schritt des Workflows bleibt unveraendert und greift bei Exit 1.
 */
import {mkdirSync,readFileSync,rmSync,writeFileSync,appendFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {spawn as nodeSpawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {verifyPropagation,retryDecision,CAUSE} from './propagation-proof.mjs';
import {classifyReport,CLASSES} from './classify-live-failure.mjs';

export const ORIGIN = 'https://research.visionuniverse.de';
export const LIMITS = Object.freeze({
 maxRetries: 2,                      // zusaetzlich zum ersten Lauf: hoechstens 3 QA-Laeufe
 backoffMs: Object.freeze([30000, 60000]), // Pause vor der 1. bzw. 2. Wiederholung
 proofWaitMs: 240000,                // Obergrenze des wartenden Propagationsbeweises je Wiederholung
 qaTimeoutMs: 600000,                // Zeitlimit je QA-Lauf
 minQaMs: 180000,                    // darunter lohnt keine Wiederholung
 totalCapMs: 900000,                 // Gesamtbudget ab Skriptstart (erster Lauf, Beweise, Pausen, Wiederholungen)
 jobTimeoutMs: 3600000,              // timeout-minutes des Jobs refresh
 reserveMs: 600000                   // Reserve fuer Rollback, OFF-Dispatch und Upload. Ueberschreitet der Schritt das Job-Timeout, wird er
                                     // `cancelled` statt `failure`: dann liefe der Rollback NICHT (fail-open). Darum harte Frist vom Jobstart.
});

/** Ein Beweis-Ergebnis als Bericht im Format, das classifyReport() kennt. */
const asReport = proof => ({status: 'FAIL', cause: CAUSE, previousFailure: null,
 propagation: {status: proof.status, cause: proof.cause, attempts: proof.attempts}});

const real = (reason, detail) => ({class: CLASSES.REAL, reason, ...(detail ? {detail} : {})});

/** Beurteilung eines QA-Fehlers anhand der Gegenprobe. Rein, ohne Prozess-/Netzzugriff. */
export function decide({baseline, reproof, qaReport}) {
 if (!reproof || typeof reproof !== 'object') return real('PROOF_UNAVAILABLE'); // im Zweifel REAL
 /* Browserphase erreicht: alle Bytes stimmten, ein Fehler ist nur als Playwright-Timeout bei gleichzeitig belegter Auslieferungsstoerung transient. */
 const browserPhase = qaReport && typeof qaReport === 'object' && qaReport.status === 'FAIL'; // Bericht nur aus der Browserphase (vorher: runtimeCandidate/Hash-Pruefung ohne Bericht)
 if (browserPhase && qaReport.error?.name !== 'TimeoutError') return real('BROWSER_ASSERTION');
 if (reproof.status !== 'PROPAGATED') return classifyReport(asReport(reproof));
 if (browserPhase) return real('BROWSER_TIMEOUT_AFTER_PROVEN_PROPAGATION');
 if (!baseline || baseline.status !== 'PROPAGATED') return {class: CLASSES.PROPAGATION, reason: 'STATE_CHANGED_AFTER_FAILURE', detail: 'Grundstand nicht propagiert'};
 const d = retryDecision({proof: baseline, reproof, browser: null});
 return d.retry ? {class: CLASSES.PROPAGATION, reason: d.reason} : real(d.reason);
}

/**
 * Kern ohne Prozess-/Dateizugriff (testbar).
 *  qa({n, timeoutMs}) -> {ok:boolean, report?:object|null}
 *  prove({once?:boolean, maxMs?:number}) -> Ergebnis von verifyPropagation (darf werfen -> wird wie "kein Beweis" behandelt)
 */
export async function verifyLive({qa, prove, sleep = async () => {}, now = () => Date.now(), limits = LIMITS, deadlineMs = Infinity}) {
 const L = limits, start = now(), attempts = [];
 /* Restzeit = Minimum aus Gesamtbudget und Frist vom Jobstart (deadlineMs, absolut). Alle Wartezeiten und QA-Limits leiten sich daraus ab;
    auch die einmaligen Beweise zaehlen, weil die Uhr weiterlaeuft. */
 const left = () => Math.min(L.totalCapMs - (now() - start), deadlineMs - now());
 const safeProve = async opts => { try { return await prove(opts); } catch { return null; } };
 const done = (result, reason) => ({result, reason, attempts});
 let baseline = await safeProve({once: true}); // nur Kennung; nicht bewertend
 for (let n = 1; n <= 1 + L.maxRetries; n++) {
  if (left() < 60000) { attempts.push({n, ok: false, phase: 'budget'}); return done('FAIL', 'NO_TIME_BUDGET'); } // lieber Rollback als Abbruch durch das Job-Timeout
  let r;
  try { r = await qa({n, timeoutMs: Math.floor(Math.min(L.qaTimeoutMs, left()))}); } catch { r = {ok: false, report: null}; }
  if (r.ok) { attempts.push({n, ok: true}); return done('PASS', n === 1 ? 'PASSED' : 'PASSED_ON_RETRY_' + n); }
  const reproof = await safeProve({once: true});
  const d = decide({baseline, reproof, qaReport: r.report ?? null});
  attempts.push({n, ok: false, class: d.class, reason: d.reason});
  if (d.class === CLASSES.REAL) return done('FAIL', d.reason);       // echter Fehler: keine Wiederholung
  if (n > L.maxRetries) return done('FAIL', 'RETRIES_EXHAUSTED');   // feste Obergrenze
  const pause = L.backoffMs[Math.min(n - 1, L.backoffMs.length - 1)];
  if (left() < pause + L.minQaMs + 30000) return done('FAIL', 'NO_TIME_BUDGET');
  await sleep(pause);
  const wait = await safeProve({maxMs: Math.max(1000, Math.min(L.proofWaitMs, left() - L.minQaMs))});
  if (!wait || wait.status !== 'PROPAGATED') {
   const c = wait ? classifyReport(asReport(wait)) : real('PROOF_UNAVAILABLE');
   attempts.push({n, phase: 'proof', class: c.class, reason: c.reason});
   return done('FAIL', c.class === CLASSES.REAL ? c.reason : 'PROPAGATION_NOT_REACHED');
  }
  baseline = wait;
 }
 return done('FAIL', 'RETRIES_EXHAUSTED');
}

function readJson(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } }

/** Beendet die ganze Prozessgruppe (refresh-qa startet bei Universe-Laeufen Kindprozesse und Browser). */
function killGroup(child) {
 try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* schon beendet */ } }
}

/**
 * Ein QA-Lauf: unveraenderte refresh-qa --live, eigener Bericht je Lauf. Eigene Prozessgruppe (detached); beim Zeitlimit wird die
 * GANZE Gruppe beendet und abgewartet, damit kein Enkelprozess (universe-browser-qa) spaeter die --out-Datei des naechsten Laufs ueberschreibt.
 * command: nur fuer Tests (Standard: node refresh-qa.mjs --live --out <out>).
 */
export function realQa({out, env = process.env, spawn = nodeSpawn, command = null}) {
 return ({timeoutMs}) => new Promise(resolve => {
  rmSync(out, {force: true}); // kein Bericht eines frueheren Laufs
  const [cmd, args] = command || ['node', ['scripts/company_intelligence/refresh-qa.mjs', '--live', '--out', out]];
  let settled = false, timer = null, child;
  const finish = ok => { if (settled) return; settled = true; clearTimeout(timer); resolve({ok, report: ok ? null : readJson(out)}); };
  try { child = spawn(cmd, args, {env, stdio: 'inherit', detached: true}); } catch { return finish(false); }
  timer = setTimeout(() => { killGroup(child); child.once?.('close', () => finish(false)); setTimeout(() => finish(false), 5000).unref?.(); }, timeoutMs);
  child.on('error', () => finish(false));
  child.on('close', (code, signal) => finish(code === 0 && !signal));
 });
}

const safe = v => String(v ?? '').replace(/[^A-Za-z0-9_,.:()<>=\- ]/g, '?').slice(0, 200);

export async function main(argv = process.argv.slice(2), env = process.env) {
 const i = argv.indexOf('--out'), out = i >= 0 ? argv[i + 1] : null;
 if (!out) { console.error('USAGE: refresh-live-verify.mjs --out <live-qa.json>'); return {result: 'FAIL', reason: 'OUT_MISSING', attempts: []}; }
 mkdirSync(dirname(out), {recursive: true});
 const prove = o => verifyPropagation({origin: ORIGIN, ci: 'ON', ...o});
 const sleep = ms => new Promise(r => setTimeout(r, ms));
 /* Frist vom Jobstart (Workflow-Schritt "Record job start" setzt JOB_STARTED_AT in Sekunden). Fehlt/ungueltig: nur 5 min ab jetzt
    (fail-closed: lieber frueh scheitern und zurueckrollen als vom Job-Timeout abgebrochen werden). */
 const started = Number(env.JOB_STARTED_AT);
 const jobStartMs = Number.isFinite(started) && started > 0 && started * 1000 <= Date.now() ? started * 1000 : null;
 const deadlineMs = jobStartMs ? jobStartMs + LIMITS.jobTimeoutMs - LIMITS.reserveMs : Date.now() + 300000;
 const outcome = await verifyLive({qa: realQa({out, env}), prove, sleep, deadlineMs});
 try { writeFileSync(out + '.verify.json', JSON.stringify(outcome, null, 2) + '\n'); } catch { /* Beleg optional */ }
 const line = `Refresh-Live-Verifikation: ${outcome.result} (${safe(outcome.reason)}), Laeufe: ${outcome.attempts.filter(a => !a.phase).length}`;
 console.log(line);
 if (env.GITHUB_STEP_SUMMARY) { try { appendFileSync(env.GITHUB_STEP_SUMMARY, line + '\n'); } catch { /* optional */ } }
 if (outcome.result === 'PASS' && outcome.reason !== 'PASSED') console.log('::warning title=Refresh-Live-QA erst bei Wiederholung bestanden::' + safe(line) + ' - transiente Auslieferung, kein Rollback.');
 return outcome;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try { const o = await main(); process.exitCode = o.result === 'PASS' ? 0 : 1; } catch (error) { console.error('REFRESH_LIVE_VERIFY_ERROR', error?.name); process.exitCode = 1; } // fail-closed
}
