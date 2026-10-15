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
 * ERWEITERUNG (PR B): Quant und Company Intelligence (CI) gehoeren zum selben Release und werden im selben Durchlauf
 * bewiesen. Auch hier gilt: Erwartung wird aus dem Release SELBST abgeleitet (delivery.json), nichts hartkodiert.
 *  7. Quant-Seite        : /quant/ (Gate-Shell) -> Inhalt sha256[:16] == ?v, Meta vu-release (quant) == release-id.json
 *                          products.quant, alle gestempelten Assets der Seite sha256[:16] == ?v. Fehlt products.quant
 *                          (gekuerzter Build), entfaellt NUR dieser Block (observed.quantSkipped).
 *  8. CI, Option ci:'ON' (Gate offen): index.json (Schema, state PREVIEW/AVAILABLE, generation), config/rollout.js
 *                          (stage 1 ohne productionOff, expectedGeneration), company-intelligence-delivery.json (status PASS,
 *                          generation, cohortStocks, issuers), company-intelligence-refresh.json (status PASS, Manifest-
 *                          Generation/generatedAt, Hash+Groesse von index.json im Manifest == ausgelieferte Bytes) und je
 *                          ein Lookup- und ein Issuer-Snapshot der Generation (Bytes+sha256 == Manifest). Alle muessen
 *                          zueinander passen; die Soll-Generation ist die der delivery.json (Beobachtung, nie hartkodiert).
 *                          refresh.json darf NUR im Bootstrap-Pfad fehlen (404 UND delivery.json mit acceptedGeneration ohne consumerCache);
 *                          dann entfallen nur refresh/Manifest-Querpruefungen/Snapshots, nie Index/Rollout/Delivery.
 *     CI, Option ci:'OFF' (Gate zu): index.json state DISABLED (oder sha256 == Platzhalter des Checkouts), rollout.js
 *                          stage 0 + productionOff, delivery.json und refresh.json antworten 404.
 *     Ohne Option ci werden die CI-Objekte nicht geprueft (rueckwaertskompatibel).
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
 maxLazyScripts: 40,
 maxQuantAssets: 40,
 maxSnapshotObjects: 2
});
export const CI_MODES = Object.freeze(['ON', 'OFF']);
export const CI_INDEX_SCHEMA = 'vu-company-intelligence-1.0.0';
const GENERATION = /^[a-f0-9]{24}$/;
const SHA64 = /^[0-9a-f]{64}$/;
const COUNT = n => Number.isInteger(n) && n > 0;
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

 // 7. Quant-Seite (Kennung products.quant gegen die ausgelieferte Seite)
 if (id) {
  if (typeof id.products?.quant === 'string') await probeQuant(ctx, id.products.quant, {pass, fail, observed});
  else observed.quantSkipped = true;
 }

 // 8. Company Intelligence
 if (ctx.ci === 'ON') await probeCiOn(ctx, {pass, fail, observed});
 else if (ctx.ci === 'OFF') await probeCiOff(ctx, {pass, fail, observed});

 return {ok: checks.every(c => c.ok), checks, observed, fingerprint: [observed.commit, observed.discoverId, observed.shellV, observed.contentSha16, observed.dataSha256,
  observed.quantId, observed.quantContentSha16, observed.ciGeneration, observed.ciIndexSha16, observed.rolloutStage, observed.ciBootstrap ? 'bootstrap' : ''].join('|')};
}

/** Quant: Shell -> Inhalt (Hash == ?v, Meta == release-id) -> gestempelte Assets (Hash == ?v). */
async function probeQuant(ctx, quantId, {pass, fail, observed}) {
 observed.quantId = quantId;
 const shellRes = await read(ctx, '/quant/');
 if (!shellRes.ok) { fail('quant-shell', ...Object.values(failureOf(shellRes)), shellRes); fail('quant-content', 'SKIPPED', 'ohne Shell nicht pruefbar'); return; }
 const m = /data-content="(\/__research\/content\/[^"?]+)\?v=([0-9a-f]{16})"/.exec(shellRes.bytes.toString('utf8'));
 if (!m) { fail('quant-shell', 'INVALID', 'data-content mit ?v= fehlt in /quant/', shellRes); fail('quant-content', 'SKIPPED', 'ohne Shell nicht pruefbar'); return; }
 pass('quant-shell', shellRes, 'v=' + m[2]);
 const contentRes = await read(ctx, m[1] + '?v=' + m[2]);
 if (!contentRes.ok) { fail('quant-content', ...Object.values(failureOf(contentRes)), contentRes); return; }
 const actual = sha16(contentRes.bytes), html = contentRes.bytes.toString('utf8');
 observed.quantContentSha16 = actual;
 const meta = /<meta\s+name="vu-release"\s+data-product="quant"\s+content="([0-9a-f]+)"/.exec(html)?.[1] || null;
 observed.quantMeta = meta;
 if (actual !== m[2]) { fail('quant-content', 'MIXED', 'Inhalt sha256[:16] ' + actual + ' != ?v der Shell ' + m[2], contentRes); return; }
 if (!meta) { fail('quant-content', 'INVALID', 'Meta-Kennung vu-release (quant) fehlt', contentRes); return; }
 if (meta !== quantId) { fail('quant-content', 'MIXED', 'Meta ' + meta + ' != release-id.json products.quant ' + quantId, contentRes); return; }
 pass('quant-content', contentRes, 'meta=' + meta);
 const stamped = [...new Map([...html.matchAll(/\b(?:src|href)="(\/[^"?#]+\.(?:js|css))\?v=([0-9a-f]{16})"/g)].map(x => [x[1] + '?v=' + x[2], {path: x[1], v: x[2]}])).values()];
 /* Bewusst streng: die ausgelieferte Quant-Seite stempelt ihre Assets immer (release-id.mjs stampAssets, heute 7). 0 gestempelte
    Assets heisst: Seite nicht in Endfassung (oder Stempel-Schritt fehlt) = echter Befund, kein Grund zur Nachsicht. */
 if (!stamped.length) { fail('quant-assets', 'INVALID', 'Quant-Seite ohne gestempelte Assets'); return; }
 const bad = []; let seen = 0;
 for (const {path, v} of stamped.slice(0, ctx.maxQuantAssets)) {
  if (ctx.now() > ctx.deadline + 1000) { bad.push({path, cause: 'DEADLINE', detail: 'Obergrenze erreicht'}); break; }
  const r = await read(ctx, path + '?v=' + v);
  seen++;
  if (!r.ok) bad.push({path, ...failureOf(r), headers: r.headers});
  else if (sha16(r.bytes) !== v) bad.push({path, cause: 'MIXED', detail: 'sha256[:16] ' + sha16(r.bytes) + ' != ?v ' + v, headers: r.headers});
 }
 observed.quantAssetsChecked = seen;
 if (stamped.length > ctx.maxQuantAssets) { observed.quantAssetsTruncated = true; observed.quantAssetsTotal = stamped.length; }
 if (bad.length) fail('quant-assets', bad[0].cause, bad.length + ' von ' + seen + ' Assets: ' + bad.slice(0, 5).map(b => b.path + ' ' + b.detail).join('; '), {status: null, headers: bad[0].headers || {}});
 else pass('quant-assets', null, seen + (observed.quantAssetsTruncated ? ' von ' + stamped.length + ' (abgeschnitten, truncated:true)' : '') + ' Assets, Hash == ?v');
}

/** Liest die Konfiguration aus dem ausgelieferten (minifizierten oder Quell-) rollout.js. Null, wenn nicht erkennbar. */
export function parseRollout(text) {
 const src = String(text || '');
 const m = /(?<![\w$.])const\s+config\s*=\s*\{\s*stage\s*:\s*(\d+)\s*,(\s*productionOff\s*:\s*(true|!0|false|!1)\s*,)?/.exec(src);
 if (!m) return null;
 const cohort = /(?<![\w$.])const\s+cohort\s*=\s*\[([^\]]*)\]/.exec(src);
 return {
  stage: Number(m[1]), productionOff: m[3] === 'true' || m[3] === '!0',
  expectedGeneration: /expectedGeneration\s*:\s*["']([a-f0-9]{24})["']/.exec(src)?.[1] || null,
  eligibilityNull: /\beligibility\s*:\s*null\b/.test(src),
  cohortSize: cohort ? (cohort[1].match(/"[^"]+"|'[^']+'/g) || []).length : null
 };
}

const CI = {index: '/company-intelligence/data/index.json', rollout: '/company-intelligence/config/rollout.js', delivery: '/company-intelligence-delivery.json', refresh: '/company-intelligence-refresh.json'};

/** CI Gate OFFEN: Objekte muessen zueinander und zur Generation der delivery.json passen. */
async function probeCiOn(ctx, {pass, fail, observed}) {
 const idxRes = await read(ctx, CI.index), rolRes = await read(ctx, CI.rollout), delRes = await read(ctx, CI.delivery), refRes = await read(ctx, CI.refresh);
 let index = null, rollout = null, delivery = null, refresh = null;

 if (!idxRes.ok) fail('ci-index', ...Object.values(failureOf(idxRes)), idxRes);
 else {
  const j = json(idxRes);
  observed.ciIndexSha16 = sha16(idxRes.bytes);
  if (!j || j.schema !== CI_INDEX_SCHEMA) fail('ci-index', 'INVALID', 'Schema ' + CI_INDEX_SCHEMA + ' fehlt (kein JSON oder Fallback-Seite)', idxRes);
  else if (j.state === 'DISABLED') fail('ci-index', 'STALE', 'state DISABLED (Gate-zu-Stand) bei offenem Gate', idxRes);
  else if (!['PREVIEW', 'AVAILABLE'].includes(j.state) || !GENERATION.test(j.generation || '')) fail('ci-index', 'INVALID', 'state ' + j.state + ' / generation ' + j.generation, idxRes);
  else { index = j; observed.ciIndexState = j.state; pass('ci-index', idxRes, 'state=' + j.state + ' generation=' + j.generation); }
 }

 if (!rolRes.ok) fail('ci-rollout', ...Object.values(failureOf(rolRes)), rolRes);
 else {
  const r = parseRollout(rolRes.bytes.toString('utf8'));
  if (!r) fail('ci-rollout', 'INVALID', 'const config={stage:...} nicht erkennbar', rolRes);
  else {
   observed.rolloutStage = r.stage; observed.rolloutExpected = r.expectedGeneration;
   if (r.stage !== 1 || r.productionOff) fail('ci-rollout', 'STALE', 'stage ' + r.stage + (r.productionOff ? ' productionOff' : '') + ' bei offenem Gate (erwartet stage 1)', rolRes);
   else if (!r.expectedGeneration) fail('ci-rollout', 'INVALID', 'expectedGeneration fehlt', rolRes);
   else { rollout = r; pass('ci-rollout', rolRes, 'stage=1 expectedGeneration=' + r.expectedGeneration); }
  }
 }

 if (!delRes.ok) fail('ci-delivery', ...Object.values(failureOf(delRes)), delRes);
 else {
  const d = json(delRes);
  if (!d || typeof d !== 'object') fail('ci-delivery', 'INVALID', 'kein JSON-Objekt (Fallback-Seite?)', delRes);
  else if (d.status !== 'PASS' || !GENERATION.test(d.generation || '') || !COUNT(d.cohortStocks) || !COUNT(d.issuers)) fail('ci-delivery', 'INVALID', 'status ' + d.status + ' generation ' + d.generation + ' cohortStocks ' + d.cohortStocks + ' issuers ' + d.issuers, delRes);
  else { delivery = d; observed.ciGeneration = d.generation; pass('ci-delivery', delRes, 'generation=' + d.generation + ' cohortStocks=' + d.cohortStocks + ' issuers=' + d.issuers); }
 }

 /* refresh.json ist NUR im GOOD-Pfad (stageProduction -> downloadGood) Teil des Releases; der Legacy-/Bootstrap-Pfad
    (verifyProductionConsumer, production-release.mjs) schreibt nur delivery.json und kennzeichnet sie mit acceptedGeneration
    (im GOOD-Pfad fehlt das Feld, dort steht consumerCache). Nur dann ist 404 hier erlaubt; alles andere bleibt Pflicht. */
 const bootstrap = !!delivery && typeof delivery.acceptedGeneration === 'string' && delivery.acceptedGeneration.length > 0 && delivery.consumerCache == null;
 if (refRes.status === 404 && bootstrap) { observed.ciBootstrap = true; pass('ci-refresh', refRes, 'Bootstrap-Pfad (delivery.acceptedGeneration, kein consumerCache): refresh.json fehlt erlaubt'); }
 else if (!refRes.ok) fail('ci-refresh', ...Object.values(failureOf(refRes)), refRes);
 else {
  const r = json(refRes), assets = r?.manifest?.assets;
  if (!r || typeof r !== 'object' || !assets || typeof assets !== 'object') fail('ci-refresh', 'INVALID', 'Manifest fehlt (Fallback-Seite?)', refRes);
  else if (r.status !== 'PASS' || !GENERATION.test(r.generation || '')) fail('ci-refresh', 'INVALID', 'status ' + r.status + ' generation ' + r.generation, refRes);
  else { refresh = r; pass('ci-refresh', refRes, 'generation=' + r.generation + ' assets=' + Object.keys(assets).length); }
 }

 // Querpruefung: Soll ist die Generation der delivery.json (aus dem Release selbst), nie ein fester Wert.
 const want = delivery?.generation || null, bad = [];
 if (!delivery) fail('ci-consistency', 'SKIPPED', 'ohne gueltige delivery.json nicht pruefbar');
 else {
  if (index && index.generation !== want) bad.push('index.generation ' + index.generation + ' != delivery ' + want);
  if (rollout && rollout.expectedGeneration !== want) bad.push('rollout.expectedGeneration ' + rollout.expectedGeneration + ' != delivery ' + want);
  if (rollout?.eligibilityNull && rollout.cohortSize && rollout.cohortSize !== delivery.cohortStocks) bad.push('rollout.cohort ' + rollout.cohortSize + ' != delivery.cohortStocks ' + delivery.cohortStocks);
  if (refresh) {
   if (refresh.generation !== want) bad.push('refresh.generation ' + refresh.generation + ' != delivery ' + want);
   if (refresh.manifest.generation !== want) bad.push('refresh.manifest.generation ' + refresh.manifest.generation + ' != delivery ' + want);
   if (refresh.cohortStocks != null && refresh.cohortStocks !== delivery.cohortStocks) bad.push('refresh.cohortStocks ' + refresh.cohortStocks + ' != delivery ' + delivery.cohortStocks);
   if (refresh.issuers != null && refresh.issuers !== delivery.issuers) bad.push('refresh.issuers ' + refresh.issuers + ' != delivery ' + delivery.issuers);
   if (index && refresh.manifest.generatedAt !== index.generatedAt) bad.push('refresh.manifest.generatedAt ' + refresh.manifest.generatedAt + ' != index.generatedAt ' + index.generatedAt);
   const entry = refresh.manifest.assets['index.json'];
   if (index && entry && (entry.sha256 !== sha256(idxRes.bytes) || entry.bytes !== idxRes.bytes.length)) bad.push('index.json Bytes/sha256 != Manifest (' + idxRes.bytes.length + ' B / ' + sha16(idxRes.bytes) + ' vs ' + entry.bytes + ' B / ' + String(entry.sha256).slice(0, 16) + ')');
   if (index && !entry) bad.push('index.json fehlt im Manifest');
   const prefix = 'snapshots/' + want + '/';
   const foreign = Object.keys(refresh.manifest.assets).find(p => p !== 'index.json' && !p.startsWith(prefix));
   if (foreign) bad.push('Manifest enthaelt Objekt anderer Generation: ' + foreign);
  }
  if (bad.length) fail('ci-consistency', 'MIXED', bad.slice(0, 6).join('; '));
  else pass('ci-consistency', null, 'index, rollout, delivery, refresh zeigen ' + want + (rollout ? '' : ' (ohne rollout)') );
 }

 // Snapshot-/Lookup-Objekte der Generation (Bytes + sha256 gegen das Manifest)
 if (observed.ciBootstrap && !refresh) { pass('ci-snapshots', null, 'entfaellt im Bootstrap-Pfad (kein Manifest zum Abgleich)'); return; }
 if (!(refresh && want && index)) { fail('ci-snapshots', 'SKIPPED', 'ohne index/delivery/refresh nicht pruefbar'); return; }
 const assets = refresh.manifest.assets, picks = [], notes = [];
 const shard = Array.isArray(index.lookupShards) ? [...index.lookupShards].filter(x => typeof x === 'string').sort()[0] : null;
 if (shard) picks.push('snapshots/' + want + '/lookup/' + shard + '.json'); else notes.push('ohne lookupShards');
 const issuer = Object.keys(assets).filter(p => p !== 'index.json' && !p.includes('/lookup/')).sort()[0];
 if (issuer) picks.push(issuer); else notes.push('ohne Issuer-Objekt');
 if (!picks.length) { fail('ci-snapshots', 'INVALID', 'weder Lookup-Shard noch Issuer-Objekt im Manifest/Index'); return; }
 const badSnap = []; let checked = 0;
 for (const path of picks.slice(0, ctx.maxSnapshotObjects)) {
  const meta = assets[path];
  if (!meta || !SHA64.test(meta.sha256 || '') || !Number.isInteger(meta.bytes)) { badSnap.push({path, cause: 'INVALID', detail: 'nicht (vollstaendig) im Manifest'}); continue; }
  if (ctx.now() > ctx.deadline + 1000) { badSnap.push({path, cause: 'DEADLINE', detail: 'Obergrenze erreicht'}); break; }
  const r = await read(ctx, '/company-intelligence/data/' + path);
  checked++;
  if (!r.ok) badSnap.push({path, ...failureOf(r), headers: r.headers});
  else if (r.bytes.length !== meta.bytes || sha256(r.bytes) !== meta.sha256) badSnap.push({path, cause: 'MIXED', detail: r.bytes.length + ' B / ' + sha16(r.bytes) + ' != Manifest ' + meta.bytes + ' B / ' + meta.sha256.slice(0, 16), headers: r.headers});
 }
 observed.ciSnapshotsChecked = checked;
 if (badSnap.length) fail('ci-snapshots', badSnap[0].cause, badSnap.slice(0, 4).map(b => b.path.split('/').slice(-2).join('/') + ' ' + b.detail).join('; '), {status: null, headers: badSnap[0].headers || {}});
 else pass('ci-snapshots', null, checked + ' Objekte, Bytes+sha256 == Manifest' + (notes.length ? ' (' + notes.join(', ') + ')' : ''));
}

/** CI Gate ZU: Platzhalter-Index, rollout stage 0 + productionOff, delivery.json/refresh.json 404. */
async function probeCiOff(ctx, {pass, fail, observed}) {
 const idxRes = await read(ctx, CI.index);
 if (!idxRes.ok) fail('ci-index', ...Object.values(failureOf(idxRes)), idxRes);
 else {
  const j = json(idxRes), sha = sha256(idxRes.bytes), isPlaceholder = !!ctx.expectedIndexSha256 && sha === ctx.expectedIndexSha256;
  observed.ciIndexSha16 = sha.slice(0, 16); observed.ciIndexState = j?.state ?? null;
  if (!isPlaceholder && !(j && j.state === 'DISABLED')) fail('ci-index', j && typeof j === 'object' ? 'MIXED' : 'INVALID', j && typeof j === 'object' ? 'state ' + j.state + ' (generation ' + j.generation + ') bei geschlossenem Gate (erwartet DISABLED)' : 'kein JSON-Objekt (Fallback-Seite?)', idxRes);
  else pass('ci-index', idxRes, isPlaceholder ? 'sha256 == Platzhalter des Checkouts' : 'state=DISABLED');
 }
 const rolRes = await read(ctx, CI.rollout);
 if (!rolRes.ok) fail('ci-rollout', ...Object.values(failureOf(rolRes)), rolRes);
 else {
  const r = parseRollout(rolRes.bytes.toString('utf8'));
  if (!r) fail('ci-rollout', 'INVALID', 'const config={stage:...} nicht erkennbar', rolRes);
  else {
   observed.rolloutStage = r.stage;
   if (r.stage !== 0 || !r.productionOff) fail('ci-rollout', 'MIXED', 'stage ' + r.stage + (r.productionOff ? ' productionOff' : ' ohne productionOff') + ' bei geschlossenem Gate (erwartet stage 0 productionOff)', rolRes);
   else pass('ci-rollout', rolRes, 'stage=0 productionOff');
  }
 }
 for (const [name, path] of [['ci-delivery', CI.delivery], ['ci-refresh', CI.refresh]]) {
  const r = await read(ctx, path);
  if (r.status === 404) pass(name, r, '404 wie erwartet');
  else if (r.ok) fail(name, 'MIXED', 'HTTP 200 statt 404 bei geschlossenem Gate (Objekt des offenen Gates noch ausgeliefert)', r);
  else fail(name, ...Object.values(failureOf(r)), r);
 }
}

/**
 * Wiederholt probeOnce mit Backoff bis zur harten Obergrenze.
 * once:true = ein einziger Durchlauf ohne Warten (Gegenprobe nach einem Browserfehler).
 */
export async function verifyPropagation(options = {}) {
 const o = {...DEFAULTS, ...options};
 const fetchImpl = o.fetchImpl || globalThis.fetch, sleep = o.sleep || defaultSleep, now = o.now || Date.now, log = o.log || (() => {});
 if (!o.origin) throw Error('PROPAGATION_ORIGIN_REQUIRED');
 if (o.ci != null && !CI_MODES.includes(o.ci)) throw Error('PROPAGATION_CI_MODE_INVALID:' + o.ci);
 const start = now(), deadline = start + o.maxMs;
 let counter = 0;
 const ctx = {origin: o.origin.replace(/\/$/, ''), fetch: fetchImpl, now, deadline, requestTimeoutMs: o.requestTimeoutMs, expectedSha: o.expectedSha || null,
  expectedDataSha256: o.expectedDataSha256 || null, dataPath: o.dataPath, maxLazyScripts: o.maxLazyScripts, maxQuantAssets: o.maxQuantAssets, maxSnapshotObjects: o.maxSnapshotObjects,
  ci: o.ci || null, expectedIndexSha256: o.expectedIndexSha256 || null, nonce: () => now().toString(36) + (counter++).toString(36)};
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
