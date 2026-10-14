/* Propagationsbeweis vor der Live-QA (Pages-Release, Job company-intelligence-live).
 *
 * WARUM: Zwischen Deploy-Ende und QA-Start liegen nur 1,5 bis 2,5 Minuten. GitHub Pages liefert hinter Fastly mit
 * cache-control max-age=600 aus, und der Cache-Schluessel ignoriert die Query (gemessen am 14.10.2026: verschiedene
 * ?ci-proof=-Werte liefern dasselbe Objekt mit gleichem age). Ein Cache-Buster belegt also NICHTS; belegt ist ein Release
 * nur, wenn die ausgelieferten Objekte selbst zusammenpassen. Frueher wurde nur /release-delivery.json auf den Commit
 * geprueft. Shell, Gate-Inhalt, Lazy-Skripte und Discover-Daten koennen je Objekt und Edge-Knoten noch auf dem alten
 * Stand sein; die Seite zeigt dann "Gerade nicht erreichbar" und der Job schaltet das Gate zu und rollt zurueck.
 *
 * WAS wird bewiesen (alle Pruefungen in einem Durchlauf, jede mit Header-Belegen):
 *  1. /release-id.json   : schema, commit == erwarteter Commit des gebauten Packages, Kennung products.discover.
 *  2. /release-delivery.json : sourceCommit == erwarteter Commit.
 *  3. /discover/ (Gate-Shell) : data-content="...?v=<16 Hex>" vorhanden.
 *  4. Gate-Inhalt        : sha256(Bytes)[:16] == v der Shell (Shell und Inhalt gleicher Stand) und
 *                          <meta name="vu-release" data-product="discover"> == release-id.json products.discover.
 *  5. Lazy-Skripte       : jedes gestempelte Skript des Templates dx-lazy-detail antwortet 200 und sha256[:16] == ?v=.
 *  6. Discover-Datei     : /discover/data/stocks/US_REAL/AAPL.json 200, gueltiges JSON, sha256 == Datei des Checkouts
 *                          (der Job checkt den gebauten Commit aus; die Datei wird unveraendert ausgeliefert).
 *
 * Bis zu einer HARTEN Obergrenze (maxMs) wird mit begrenztem Backoff wiederholt. Danach: NOT_PROPAGATED, Ursache
 * AUSLIEFERUNG_NICHT_PROPAGIERT, mit Kennungen und Headern (age, x-cache, x-served-by ...). Das ist ein FEHLER
 * (fail-closed, der Rollback-Pfad bleibt unveraendert) - aber mit eindeutiger Ursache. Was NACH nachgewiesener
 * Propagation fehlschlaegt, ist ein echter Fehler und wird nicht beruhigend wiederholt; einzige Ausnahme siehe
 * retryDecision (der Stand hat sich zwischen Beweis und Browserlauf nachweislich geaendert).
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const CAUSE = 'AUSLIEFERUNG_NICHT_PROPAGIERT';
export const SCHEMA = 'vu-release-id-1';
export const DEFAULTS = Object.freeze({
 maxMs: 480000,                       // harte Obergrenze: 8 Minuten (max-age=600 minus ~2 Minuten Vorlauf)
 delays: Object.freeze([5000, 10000, 15000, 20000, 30000]), // danach 30 s
 requestTimeoutMs: 20000,
 dataPath: '/discover/data/stocks/US_REAL/AAPL.json',
 maxLazyScripts: 40
});
const HEADERS = ['age', 'x-cache', 'x-cache-hits', 'x-served-by', 'x-github-request-id', 'last-modified', 'etag', 'date', 'cache-control', 'content-type', 'via'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sha16 = bytes => sha256(bytes).slice(0, 16);
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Nur Auslieferungs-Header, keine Cookies, keine Authorization-Header. */
export function headerEvidence(response) {
 const out = {};
 for (const key of HEADERS) {
  const value = response?.headers?.get?.(key);
  if (value != null) out[key] = String(value).slice(0, 200);
 }
 return out;
}

async function read(ctx, path) {
 const url = ctx.origin + path + (path.includes('?') ? '&' : '?') + 'ci-proof=' + ctx.nonce();
 const timeout = Math.min(ctx.requestTimeoutMs, Math.max(1000, ctx.deadline - ctx.now() + 1000));
 try {
  const response = await ctx.fetch(url, {cache: 'no-store', headers: {'cache-control': 'no-cache', pragma: 'no-cache'}, signal: AbortSignal.timeout(timeout)});
  const bytes = Buffer.from(await response.arrayBuffer());
  return {path, status: response.status, ok: response.status === 200, bytes, headers: headerEvidence(response)};
 } catch (error) {
  return {path, status: null, ok: false, bytes: Buffer.alloc(0), headers: {}, error: String(error?.name || 'Error') + ':' + String(error?.message || '').slice(0, 120)};
 }
}

function json(response) {
 try { return JSON.parse(response.bytes.toString('utf8')); } catch { return null; }
}

function failureOf(response) {
 if (response.status == null) return {cause: 'REQUEST_FAILED', detail: response.error};
 return {cause: response.status === 404 ? 'MISSING' : 'HTTP_' + response.status, detail: 'HTTP ' + response.status};
}

/** Ein Durchlauf aller Pruefungen. Wirft nicht; liefert {ok, checks, observed, fingerprint}. */
export async function probeOnce(ctx) {
 const checks = [], observed = {};
 const pass = (name, response, detail) => checks.push({name, ok: true, status: response?.status, ...(detail ? {detail} : {})});
 const fail = (name, cause, detail, response) => checks.push({name, ok: false, cause, detail, status: response?.status ?? null, headers: response?.headers || {}});
 const expected = ctx.expectedSha;

 // 1. Kennung des Releases
 const idRes = await read(ctx, '/release-id.json');
 let id = null;
 if (!idRes.ok) fail('release-id', ...Object.values(failureOf(idRes)), idRes);
 else {
  id = json(idRes);
  if (!id || id.schema !== SCHEMA || typeof id.products?.discover !== 'string') { fail('release-id', 'INVALID', 'Schema oder products.discover fehlt', idRes); id = null; }
  else {
   observed.commit = id.commit; observed.discoverId = id.products.discover;
   if (expected && id.commit !== expected) fail('release-id', 'STALE', 'commit ' + id.commit + ' != erwartet ' + expected, idRes);
   else pass('release-id', idRes);
  }
 }

 // 2. Auslieferungsbericht
 const delRes = await read(ctx, '/release-delivery.json');
 if (!delRes.ok) fail('release-delivery', ...Object.values(failureOf(delRes)), delRes);
 else {
  const delivery = json(delRes);
  observed.deliveryCommit = delivery?.sourceCommit;
  const want = expected || id?.commit;
  if (!delivery || typeof delivery.sourceCommit !== 'string') fail('release-delivery', 'INVALID', 'sourceCommit fehlt', delRes);
  else if (want && delivery.sourceCommit !== want) fail('release-delivery', expected ? 'STALE' : 'MIXED', 'sourceCommit ' + delivery.sourceCommit + ' != ' + want, delRes);
  else pass('release-delivery', delRes);
 }

 // 3. Gate-Shell
 const shellRes = await read(ctx, '/discover/');
 let shellPath = null, shellV = null;
 if (!shellRes.ok) fail('gate-shell', ...Object.values(failureOf(shellRes)), shellRes);
 else {
  const m = /data-content="(\/__research\/content\/[^"?]+)\?v=([0-9a-f]{16})"/.exec(shellRes.bytes.toString('utf8'));
  if (!m) fail('gate-shell', 'INVALID', 'data-content mit ?v= fehlt in /discover/', shellRes);
  else { shellPath = m[1]; shellV = m[2]; observed.shellV = shellV; pass('gate-shell', shellRes, 'v=' + shellV); }
 }

 // 4. Gate-Inhalt
 let html = null;
 if (shellPath) {
  const contentRes = await read(ctx, shellPath + '?v=' + shellV);
  if (!contentRes.ok) fail('gate-content', ...Object.values(failureOf(contentRes)), contentRes);
  else {
   const actual = sha16(contentRes.bytes);
   observed.contentSha16 = actual;
   html = contentRes.bytes.toString('utf8');
   const meta = /<meta\s+name="vu-release"\s+data-product="discover"\s+content="([0-9a-f]+)"/.exec(html)?.[1] || null;
   observed.contentMeta = meta;
   if (actual !== shellV) { fail('gate-content', 'MIXED', 'Inhalt sha256[:16] ' + actual + ' != ?v der Shell ' + shellV, contentRes); html = null; }
   else if (!meta) { fail('gate-content', 'INVALID', 'Meta-Kennung vu-release (discover) fehlt', contentRes); html = null; }
   else if (id && meta !== id.products.discover) { fail('gate-content', 'MIXED', 'Meta ' + meta + ' != release-id.json ' + id.products.discover, contentRes); html = null; }
   else pass('gate-content', contentRes, 'meta=' + meta);
  }
 } else fail('gate-content', 'SKIPPED', 'ohne Shell nicht pruefbar');

 // 5. Lazy-Skripte (Template dx-lazy-detail)
 if (html) {
  const template = /<template id="dx-lazy-detail">([\s\S]*?)<\/template>/.exec(html)?.[1] || '';
  const stamped = [...template.matchAll(/<script\s+src="(\/[^"?]+)\?v=([0-9a-f]+)"/g)].map(m => ({path: m[1], v: m[2]}));
  if (!stamped.length) fail('lazy-detail', 'INVALID', 'Template dx-lazy-detail ohne gestempelte Skripte');
  else {
   const bad = [];
   let seen = 0;
   for (const {path, v} of stamped.slice(0, ctx.maxLazyScripts)) {
    if (ctx.now() > ctx.deadline + 1000) { bad.push({path, cause: 'DEADLINE', detail: 'Obergrenze erreicht'}); break; }
    const r = await read(ctx, path + '?v=' + v);
    seen++;
    if (!r.ok) bad.push({path, ...failureOf(r), headers: r.headers});
    else if (sha16(r.bytes) !== v) bad.push({path, cause: 'MIXED', detail: 'sha256[:16] ' + sha16(r.bytes) + ' != ?v ' + v, headers: r.headers});
   }
   observed.lazyChecked = seen;
   if (stamped.length > ctx.maxLazyScripts) { observed.lazyTruncated = true; observed.lazyTotal = stamped.length; }
   if (bad.length) fail('lazy-detail', bad[0].cause, bad.length + ' von ' + seen + ' Skripten: ' + bad.slice(0, 5).map(b => b.path + ' ' + b.detail).join('; '), {status: null, headers: bad[0].headers || {}});
   else pass('lazy-detail', null, seen + (observed.lazyTruncated ? ' von ' + stamped.length + ' (abgeschnitten, truncated:true)' : '') + ' Skripte, Hash == ?v');
  }
 } else fail('lazy-detail', 'SKIPPED', 'ohne gueltigen Gate-Inhalt nicht pruefbar');

 // 6. Discover-Datei
 const dataRes = await read(ctx, ctx.dataPath);
 if (!dataRes.ok) fail('discover-data', ...Object.values(failureOf(dataRes)), dataRes);
 else {
  const data = json(dataRes), actual = sha256(dataRes.bytes);
  observed.dataSha256 = actual.slice(0, 16);
  if (!data || typeof data !== 'object') fail('discover-data', 'INVALID', 'kein JSON-Objekt', dataRes);
  else if (ctx.expectedDataSha256 && actual !== ctx.expectedDataSha256) fail('discover-data', 'STALE', 'sha256 ' + actual.slice(0, 16) + ' != erwartet ' + ctx.expectedDataSha256.slice(0, 16), dataRes);
  else pass('discover-data', dataRes, ctx.expectedDataSha256 ? 'sha256 == Checkout' : 'ohne Referenz-Hash (nur Struktur)');
 }

 return {ok: checks.every(c => c.ok), checks, observed, fingerprint: [observed.commit, observed.discoverId, observed.shellV, observed.contentSha16, observed.dataSha256].join('|')};
}

/**
 * Wiederholt probeOnce mit Backoff bis zur harten Obergrenze.
 * once:true = ein einziger Durchlauf ohne Warten (Gegenprobe nach einem Browserfehler).
 */
export async function verifyPropagation(options = {}) {
 const o = {...DEFAULTS, ...options};
 const fetchImpl = o.fetchImpl || globalThis.fetch, sleep = o.sleep || defaultSleep, now = o.now || Date.now, log = o.log || (() => {});
 if (!o.origin) throw Error('PROPAGATION_ORIGIN_REQUIRED');
 const start = now(), deadline = start + o.maxMs;
 let counter = 0;
 const ctx = {origin: o.origin.replace(/\/$/, ''), fetch: fetchImpl, now, deadline, requestTimeoutMs: o.requestTimeoutMs, expectedSha: o.expectedSha || null,
  expectedDataSha256: o.expectedDataSha256 || null, dataPath: o.dataPath, maxLazyScripts: o.maxLazyScripts, nonce: () => now().toString(36) + (counter++).toString(36)};
 const attempts = [];
 for (let n = 1; ; n++) {
  const probe = await probeOnce(ctx);
  const summary = {n, atMs: now() - start, ok: probe.ok, observed: probe.observed, ...(probe.ok ? {} : {failed: probe.checks.filter(c => !c.ok)})};
  attempts.push(summary);
  log(summary);
  const result = () => ({expectedSha: ctx.expectedSha, elapsedMs: now() - start, maxMs: o.maxMs, attemptCount: attempts.length, attempts: attempts.slice(-30), observed: probe.observed, fingerprint: probe.fingerprint,
   // Zwischenstand gesehen = ein frueherer Durchlauf war nicht ok oder zeigte eine andere Kennung als der letzte.
   intermediateSeen: attempts.some(a => !a.ok || a.observed.commit !== probe.observed.commit || a.observed.discoverId !== probe.observed.discoverId)});
  if (probe.ok) return {status: 'PROPAGATED', ...result()};
  const remaining = deadline - now();
  if (o.once || remaining <= 0) {
   return {status: 'NOT_PROPAGATED', cause: CAUSE, message: 'Auslieferung nicht propagiert: ' + probe.checks.filter(c => !c.ok).map(c => c.name + ' ' + c.cause + ' (' + c.detail + ')').join('; '), ...result()};
  }
  await sleep(Math.min(o.delays[Math.min(n - 1, o.delays.length - 1)], remaining));
 }
}

/**
 * Referenz-Hash der Discover-Datei aus dem Checkout. Fehlt die Datei, entfaellt NUR der Byte-Vergleich
 * (200 + gueltiges JSON bleibt Pflicht); das ist kein Propagationsfehler.
 */
export function referenceDataSha256(file, expectedSha) {
 if (!expectedSha) return {sha256: null, reason: 'NO_EXPECTED_COMMIT'};
 try { return {sha256: sha256(readFileSync(file)), reason: null}; } catch { return {sha256: null, reason: 'REFERENCE_FILE_MISSING'}; }
}

export class PropagationError extends Error {
 constructor(result) { super(CAUSE + ': ' + (result.message || '')); this.name = 'PropagationError'; this.cause_ = CAUSE; this.propagation = result; }
}

/**
 * Wiederholung der Browser-Bewertung nur, wenn BELEGT ist, dass beim ersten Versuch ein Zwischenstand sichtbar war:
 *  - die Gegenprobe nach dem Fehler zeigt eine andere Kennung als der Beweis davor, oder
 *  - der Browser sah eine andere Release-Kennung (Meta) als bewiesen.
 * Gleicher Stand, gleiche Kennung = echter Fehler, keine Wiederholung "zur Beruhigung".
 */
export function retryDecision({proof, reproof, browser}) {
 if (reproof && reproof.status !== 'PROPAGATED') return {retry: true, reason: 'STATE_CHANGED_AFTER_PROOF', detail: 'Gegenprobe nicht mehr propagiert'};
 if (reproof && reproof.fingerprint !== proof.fingerprint) return {retry: true, reason: 'STATE_CHANGED_AFTER_PROOF', detail: proof.fingerprint + ' -> ' + reproof.fingerprint};
 const seen = browser?.metaRelease;
 if (seen && proof.observed?.discoverId && seen !== proof.observed.discoverId) return {retry: true, reason: 'BROWSER_SAW_OTHER_RELEASE', detail: seen + ' != ' + proof.observed.discoverId};
 return {retry: false, reason: 'SAME_STATE_REAL_FAILURE', detail: 'Stand unveraendert (' + proof.fingerprint + '), Browserfehler gilt'};
}

/**
 * Ablauf: Beweis -> Browser-Bewertung. Beweis fehlgeschlagen = PropagationError (kein Browser). Browser-Fehler nach
 * Beweis = echter Fehler, ausser retryDecision erlaubt GENAU eine Wiederholung (mit neuem vollstaendigem Beweis).
 * prove({once}) liefert ein Ergebnis von verifyPropagation; runBrowser({propagation, attempt, previousFailure}).
 */
export async function evaluateRelease({prove, runBrowser, budget = null}) {
 const now = budget?.now || Date.now;
 const proof = await prove({});
 if (proof.status !== 'PROPAGATED') throw new PropagationError(proof);
 const browserStart = now();
 try {
  return {propagation: proof, retried: false, result: await runBrowser({propagation: proof, attempt: 1, previousFailure: null})};
 } catch (error) {
  const browserMs = now() - browserStart;
  const reproof = await prove({once: true});
  let decision = retryDecision({proof, reproof, browser: error?.observed});
  if (decision.retry && budget) {
   // Eine Wiederholung braucht: voller neuer Beweis (bis maxMs) + Browserlauf (wie der erste) + Reserve im Job-Budget.
   const left = budget.startedAt + budget.totalMs - now(), need = (budget.proofMaxMs || 0) + browserMs + (budget.reserveMs || 0);
   if (left < need) decision = {retry: false, reason: 'NO_TIME_BUDGET', detail: 'Restzeit ' + Math.round(left / 1000) + ' s < benoetigt ' + Math.round(need / 1000) + ' s; Wiederholung wuerde das Job-Timeout riskieren (fail-closed, Ursache: ' + decision.reason + ')'};
  }
  error.propagationEvidence = {proof, reproof, decision};
  if (!decision.retry) throw error;
  const second = await prove({});
  if (second.status !== 'PROPAGATED') throw Object.assign(new PropagationError(second), {previousFailure: String(error.message).slice(0, 500)});
  const previousFailure = {message: String(error.message).slice(0, 500), decision};
  try {
   return {propagation: second, retried: true, previousFailure, result: await runBrowser({propagation: second, attempt: 2, previousFailure})};
  } catch (again) {
   again.propagationEvidence = {proof: second, reproof: null, decision: {retry: false, reason: 'RETRY_EXHAUSTED', detail: 'zweiter Versuch fehlgeschlagen'}};
   again.previousFailure = previousFailure;
   throw again;
  }
 }
}
