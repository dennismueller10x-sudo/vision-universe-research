/* Klassifikation eines Fehlschlags im Job company-intelligence-live (pages-release.yml).
 *
 * WARUM: Der Fail-closed-Handler fuehrte bei JEDEM Fehlschlag sofort `refresh-run rollback`, `production-release disable`
 * und einen OFF-Dispatch aus. Ein einzelner vorübergehender Auslieferungs-/Netzfehler (13.10.2026 18:15Z) nahm so das
 * Gate und den GOOD-Zeiger zurück. Dieses Skript entscheidet NUR, ob eine begrenzte Wiederholung der Pruefung
 * (ohne jede Zustandsaenderung) zulaessig ist. Es liest, es schreibt nur Ausgaben, es ruft nichts auf.
 *
 * Klassen:
 *  TRANSIENT_INFRA        Schritt "Browser dependencies" (npm/apt/Playwright-Install) ist gescheitert; es wurde noch nichts geprueft.
 *  TRANSIENT_PROPAGATION  Bericht: status FAIL, cause AUSLIEFERUNG_NICHT_PROPAGIERT, propagation.status NOT_PROPAGATED, und
 *                         JEDE fehlgeschlagene Pruefung des letzten Durchlaufs hat eine Auslieferungs-Ursache (STALE, MIXED,
 *                         MISSING, REQUEST_FAILED, HTTP 429/5xx ...). Der Release ist dann nachweislich noch nicht (vollstaendig)
 *                         ausgeliefert - die Seite wurde NICHT bewertet.
 *                         Hinweis: Bei gesetztem EXPECTED_PRODUCTION_SHA meldet schon der Propagationsbeweis einen falschen/anderen Commit
 *                         als STALE (also TRANSIENT_PROPAGATION, bis die Wiederholung scheitert); WRONG_PRODUCTION_COMMIT der Browser-Phase
 *                         tritt nur ohne erwarteten Commit auf und ist REAL.
 *  TRANSIENT_BROWSER_HTTP Bericht: cause BROWSER_ASSERTION_AFTER_PROVEN_PROPAGATION (Propagation bewiesen), Fehler ist ein Playwright-
 *                         TimeoutError, und ALLE Auffaelligkeiten erklaeren sich durch ein voruebergehendes 502/503/504 (optional 429) mit
 *                         text/html auf Lazy-Skripten desselben Ursprungs (Beleg Lauf 38590652362: 503 auf /discover/engines/narrative.js,
 *                         discover/ui/lazy.js laedt Lazy-Skripte ohne Wiederholung). Siehe classifyBrowserHttp; jede Abweichung ist REAL.
 *  REAL                   alles andere: Browser-Assertion nach bewiesener Propagation, Hash-/Datenfehler,
 *                         Zugriffs-/Sicherheitsfehler (HTTP 401/403, Gate), INVALID-Antworten, Bericht fehlt/unlesbar/PASS trotz
 *                         Fehler, unbekannte Ursache. FAIL-CLOSED: Im Zweifel REAL.
 */
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const CLASSES = Object.freeze({INFRA: 'TRANSIENT_INFRA', PROPAGATION: 'TRANSIENT_PROPAGATION', BROWSER: 'TRANSIENT_BROWSER_HTTP', REAL: 'REAL'});
export const BROWSER_CAUSE = 'BROWSER_ASSERTION_AFTER_PROVEN_PROPAGATION';
export const PROPAGATION_CAUSE = 'AUSLIEFERUNG_NICHT_PROPAGIERT';

/* Ursachen aus propagation-proof.mjs (failureOf / probeOnce), die "noch nicht ausgeliefert" bedeuten. INVALID (Schema, fehlende
   Meta-Kennung, kein JSON) und HTTP 4xx ausser 404/429 (Zugriff!) sind bewusst NICHT enthalten. */
export function isDeliveryCause(cause) {
 if (typeof cause !== 'string') return false;
 if (['STALE', 'MIXED', 'MISSING', 'REQUEST_FAILED', 'DEADLINE', 'SKIPPED'].includes(cause)) return true;
 const http = /^HTTP_(\d{3})$/.exec(cause);
 return !!http && (http[1] === '429' || /^5\d\d$/.test(http[1]));
}

const BROWSER_STATUSES = [502, 503, 504, 429];
const pathOf = u => String(u ?? '').split('?')[0];

/**
 * Belegbar transienter Browser-Fehler: nur 502/503/504/429 mit text/html auf Same-Origin-Skripten, die genau als
 * LAZY_SCRIPT_FAILED gemeldet wurden. Alles Weitere (andere Status, andere URLs, pageErrors, weitere fehlgeschlagene
 * Requests, unerklaerte Konsole, fremder Commit, previousFailure, fehlende Diagnose) ist REAL.
 */
export function classifyBrowserHttp(report, {expectedSha = null} = {}) {
 const no = reason => real(reason);
 if (!expectedSha || report.sourceCommit !== expectedSha) return no('BROWSER_COMMIT_NOT_VERIFIED');
 if (report.previousFailure) return no('BROWSER_PREVIOUS_FAILURE');
 if (report.propagation?.status !== 'PROPAGATED') return no('BROWSER_PROPAGATION_NOT_PROVEN');
 if (report.error?.name !== 'TimeoutError') return no('BROWSER_ERROR_NOT_TIMEOUT');
 const d = report.browserDiagnostics;
 if (!d || typeof d !== 'object' || !['console', 'pageErrors', 'failed', 'http'].every(k => Array.isArray(d[k]))) return no('BROWSER_DIAGNOSTICS_MISSING');
 if (d.truncated && Object.keys(d.truncated).length) return no('BROWSER_DIAGNOSTICS_TRUNCATED');
 if (d.pageErrors.length) return no('BROWSER_PAGE_ERRORS');
 if (Array.isArray(report.active?.errors) && report.active.errors.length) return no('BROWSER_PAGE_ERRORS');
 if (!d.http.length) return no('BROWSER_NO_HTTP_EVIDENCE');
 const statuses = new Set(), paths = new Set();
 for (const h of d.http) {
  const url = h?.url;
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return no('BROWSER_HTTP_NOT_SAME_ORIGIN'); // safeUrl laesst nur fremde Ursprungs-Praefixe stehen
  if (!BROWSER_STATUSES.includes(h.status)) return no('BROWSER_HTTP_STATUS_' + String(h.status).replace(/\D/g, '').slice(0, 3));
  if (!/^text\/html/i.test(String(h.headers?.['content-type'] ?? ''))) return no('BROWSER_HTTP_NOT_HTML');
  statuses.add(h.status); paths.add(pathOf(url));
 }
 for (const f of d.failed) if (!paths.has(pathOf(f?.url))) return no('BROWSER_OTHER_FAILED_REQUEST');
 const lazy = new Set();
 for (const line of d.console) {
  const text = String(line);
  const named = [...text.matchAll(/LAZY_SCRIPT_FAILED:(\S+)/g)].map(m => pathOf(m[1].replace(/[.,;)'"]+$/, '')));
  for (const n of named) { if (!paths.has(n)) return no('BROWSER_LAZY_URL_MISMATCH'); lazy.add(n); }
  if (named.length) continue;
  const generic = /(?:status of|response code \()\s*(\d{3})/.exec(text);
  if (!generic || !statuses.has(Number(generic[1]))) return no('BROWSER_CONSOLE_UNEXPLAINED');
 }
 if (!lazy.size) return no('BROWSER_NO_LAZY_FAILURE_NAMED');
 for (const path of paths) if (!lazy.has(path)) return no('BROWSER_HTTP_URL_NOT_NAMED_AS_CAUSE'); // jedes 5xx muss als Ursache benannt sein
 const ps = report.pageState;
 if (!ps || typeof ps !== 'object' || !Array.isArray(ps.scriptResourcesSuspicious)) return no('BROWSER_PAGESTATE_MISSING');
 for (const r of ps.scriptResourcesSuspicious) if (!paths.has(pathOf(r?.n)) || !(BROWSER_STATUSES.includes(r.s) || r.s === 0)) return no('BROWSER_PAGESTATE_MISMATCH');
 const seen = report.propagation?.observed?.discoverId;
 if (ps.metaRelease && seen && ps.metaRelease !== seen) return no('BROWSER_SAW_OTHER_RELEASE');
 return {class: CLASSES.BROWSER, reason: 'LAZY_SCRIPT_HTTP_' + [...statuses].sort().join('_'), detail: [...lazy].join(',').slice(0, 120)};
}

const real = (reason, detail) => ({class: CLASSES.REAL, reason, ...(detail ? {detail} : {})});

/** Beurteilt nur den Propagationsbericht; alles Unbewiesene ist REAL. */
export function classifyReport(report, {expectedSha = null} = {}) {
 if (!report || typeof report !== 'object' || Array.isArray(report)) return real('REPORT_MISSING_OR_INVALID');
 if (report.status !== 'FAIL') return real('REPORT_STATUS_NOT_FAIL', String(report.status).slice(0, 40)); // z. B. PASS-Bericht, spaeterer Befehl scheiterte
 if (report.cause === BROWSER_CAUSE) return classifyBrowserHttp(report, {expectedSha});
 if (report.cause !== PROPAGATION_CAUSE) return real('CAUSE_NOT_PROPAGATION', String(report.cause).slice(0, 80));
 if (expectedSha && typeof report.sourceCommit === 'string' && report.sourceCommit !== expectedSha) return real('REPORT_COMMIT_MISMATCH'); // fremder/alter Bericht
 const p = report.propagation;
 if (!p || p.status !== 'NOT_PROPAGATED' || p.cause !== PROPAGATION_CAUSE) return real('PROPAGATION_NOT_PROVEN_ABSENT');
 if (report.previousFailure) return real('BROWSER_FAILURE_BEFORE_PROPAGATION_LOSS'); // Browser sah schon einen Fehler: nicht beruhigend wiederholen
 const attempts = Array.isArray(p.attempts) ? p.attempts : [];
 const last = attempts[attempts.length - 1];
 const failed = Array.isArray(last?.failed) ? last.failed : [];
 if (!failed.length) return real('NO_FAILED_CHECK_EVIDENCE');
 const causes = failed.map(c => c?.cause);
 const bad = causes.filter(c => !isDeliveryCause(c));
 /* lazy-detail meldet nur die Ursache des ERSTEN Skripts als cause; weitere stehen im detail-Text (propagation-proof.mjs, nicht hier aenderbar).
    HTTP-Codes dort, die keine Auslieferungsursache sind (401/403/400 ...), machen den Fehler REAL. */
 for (const c of failed) for (const m of String(c?.detail ?? '').matchAll(/\bHTTP (\d{3})\b/g)) if (!isDeliveryCause('HTTP_' + m[1]) && m[1] !== '404') bad.push('DETAIL_HTTP_' + m[1]);
 if (bad.length) return real('NON_DELIVERY_CAUSE', [...new Set(bad.map(String))].join(',').slice(0, 120));
 if (causes.every(c => c === 'SKIPPED' || c === 'DEADLINE')) return real('NO_ROOT_DELIVERY_CAUSE');
 return {class: CLASSES.PROPAGATION, reason: 'DELIVERY_NOT_PROPAGATED', detail: [...new Set(causes)].join(',')};
}

/**
 * @param {{depsOutcome?:string, qaOutcome?:string, report?:any}} input
 * depsOutcome/qaOutcome: Ergebnis (steps.<id>.outcome) von "Browser dependencies" bzw. der OFF-/Live-QA.
 */
export function classify({depsOutcome = '', qaOutcome = '', report = null, expectedSha = null} = {}) {
 if (depsOutcome === 'failure') return {class: CLASSES.INFRA, reason: 'BROWSER_DEPENDENCIES_FAILED'};
 if (depsOutcome !== 'success') return real('DEPENDENCIES_NOT_SUCCESSFUL', String(depsOutcome).slice(0, 40));
 if (qaOutcome !== 'failure') return real('QA_NOT_FAILED_UNEXPECTED_STATE', String(qaOutcome).slice(0, 40));
 return classifyReport(report, {expectedSha});
}

export function readReport(file) {
 try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/** Berichtsdatei der QA dieses Laufs: Live-QA schreibt live-fast/, OFF-QA live-off/. */
export function reportFile(root, qa) {
 return root + (qa === 'off' ? '/live-off/report.json' : '/live-fast/report.json');
}

/** Nur feste Codes in Annotation/Summary, nie Berichtsinhalt (Berichte sind zwar geschwaerzt; hier gilt zusaetzlich Minimalismus). */
const safe = v => String(v ?? '').replace(/[^A-Za-z0-9_,.:\- ]/g, '?').slice(0, 160);

export function main(env = process.env) {
 const root = env.REPORT_ROOT || env.RUNNER_TEMP || '/tmp';
 const qa = env.ENABLED === 'true' ? 'live' : 'off';
 const qaOutcome = qa === 'live' ? env.LIVE_OUTCOME : env.OFF_OUTCOME;
 let result;
 try {
  result = classify({depsOutcome: env.DEPS_OUTCOME, qaOutcome, report: readReport(reportFile(root, qa)), expectedSha: env.EXPECTED_PRODUCTION_SHA || null});
 } catch (error) {
  result = real('CLASSIFIER_ERROR', error?.name); // fail-closed
 }
 const out = {...result, qa};
 try {
  mkdirSync(root + '/live-failure', {recursive: true});
  writeFileSync(root + '/live-failure/classification.json', JSON.stringify(out, null, 2) + '\n');
 } catch { /* Beleg ist Zusatz; die Ausgabe unten entscheidet */ }
 if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `class=${out.class}\nreason=${safe(out.reason)}\nqa=${qa}\n`);
 const line = `Live-Fehler klassifiziert: ${out.class} (${safe(out.reason)}${out.detail ? ': ' + safe(out.detail) : ''}), QA=${qa}`;
 console.log(line);
 if (env.GITHUB_STEP_SUMMARY) { try { appendFileSync(env.GITHUB_STEP_SUMMARY, line + '\n'); } catch { /* optional */ } }
 return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
