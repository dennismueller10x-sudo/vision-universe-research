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
 *  REAL                   alles andere: Browser-Assertion nach bewiesener Propagation, WRONG_PRODUCTION_COMMIT, Hash-/Datenfehler,
 *                         Zugriffs-/Sicherheitsfehler (HTTP 401/403, Gate), INVALID-Antworten, Bericht fehlt/unlesbar/PASS trotz
 *                         Fehler, unbekannte Ursache. FAIL-CLOSED: Im Zweifel REAL.
 */
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const CLASSES = Object.freeze({INFRA: 'TRANSIENT_INFRA', PROPAGATION: 'TRANSIENT_PROPAGATION', REAL: 'REAL'});
export const PROPAGATION_CAUSE = 'AUSLIEFERUNG_NICHT_PROPAGIERT';

/* Ursachen aus propagation-proof.mjs (failureOf / probeOnce), die "noch nicht ausgeliefert" bedeuten. INVALID (Schema, fehlende
   Meta-Kennung, kein JSON) und HTTP 4xx ausser 404/429 (Zugriff!) sind bewusst NICHT enthalten. */
export function isDeliveryCause(cause) {
 if (typeof cause !== 'string') return false;
 if (['STALE', 'MIXED', 'MISSING', 'REQUEST_FAILED', 'DEADLINE', 'SKIPPED'].includes(cause)) return true;
 const http = /^HTTP_(\d{3})$/.exec(cause);
 return !!http && (http[1] === '429' || /^5\d\d$/.test(http[1]));
}

const real = (reason, detail) => ({class: CLASSES.REAL, reason, ...(detail ? {detail} : {})});

/** Beurteilt nur den Propagationsbericht; alles Unbewiesene ist REAL. */
export function classifyReport(report) {
 if (!report || typeof report !== 'object' || Array.isArray(report)) return real('REPORT_MISSING_OR_INVALID');
 if (report.status !== 'FAIL') return real('REPORT_STATUS_NOT_FAIL', String(report.status).slice(0, 40)); // z. B. PASS-Bericht, spaeterer Befehl scheiterte
 if (report.cause !== PROPAGATION_CAUSE) return real('CAUSE_NOT_PROPAGATION', String(report.cause).slice(0, 80));
 const p = report.propagation;
 if (!p || p.status !== 'NOT_PROPAGATED' || p.cause !== PROPAGATION_CAUSE) return real('PROPAGATION_NOT_PROVEN_ABSENT');
 if (report.previousFailure) return real('BROWSER_FAILURE_BEFORE_PROPAGATION_LOSS'); // Browser sah schon einen Fehler: nicht beruhigend wiederholen
 const attempts = Array.isArray(p.attempts) ? p.attempts : [];
 const last = attempts[attempts.length - 1];
 const failed = Array.isArray(last?.failed) ? last.failed : [];
 if (!failed.length) return real('NO_FAILED_CHECK_EVIDENCE');
 const causes = failed.map(c => c?.cause);
 const bad = causes.filter(c => !isDeliveryCause(c));
 if (bad.length) return real('NON_DELIVERY_CAUSE', [...new Set(bad.map(String))].join(',').slice(0, 120));
 if (causes.every(c => c === 'SKIPPED' || c === 'DEADLINE')) return real('NO_ROOT_DELIVERY_CAUSE');
 return {class: CLASSES.PROPAGATION, reason: 'DELIVERY_NOT_PROPAGATED', detail: [...new Set(causes)].join(',')};
}

/**
 * @param {{depsOutcome?:string, qaOutcome?:string, report?:any}} input
 * depsOutcome/qaOutcome: Ergebnis (steps.<id>.outcome) von "Browser dependencies" bzw. der OFF-/Live-QA.
 */
export function classify({depsOutcome = '', qaOutcome = '', report = null} = {}) {
 if (depsOutcome === 'failure') return {class: CLASSES.INFRA, reason: 'BROWSER_DEPENDENCIES_FAILED'};
 if (depsOutcome !== 'success') return real('DEPENDENCIES_NOT_SUCCESSFUL', String(depsOutcome).slice(0, 40));
 if (qaOutcome !== 'failure') return real('QA_NOT_FAILED_UNEXPECTED_STATE', String(qaOutcome).slice(0, 40));
 return classifyReport(report);
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
  result = classify({depsOutcome: env.DEPS_OUTCOME, qaOutcome, report: readReport(reportFile(root, qa))});
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
