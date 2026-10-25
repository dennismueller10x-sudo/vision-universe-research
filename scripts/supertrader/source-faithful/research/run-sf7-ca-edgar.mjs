#!/usr/bin/env node
/**
 * Supertrader 7.0 – targeted EDGAR check of V4-D1 (owner decision E7-1, 25.10.2026; rule set 1.4.0, integrity/ca-edgar.mjs).
 *  1. exactly the run of run-sf7-ca-resolution.mjs#caResolutionPart: BASE (11 references, compared with 6.0), every DQ-K3
 *     candidate with exposure, classification with rule set 1.3.0 UNCHANGED (its EDGAR index lookups go through the same
 *     throttled, budgeted client);
 *  2. refinement (this file): only for the reference-exposed UNRESOLVED DQ-K5 sessions of 1.3.0 (authoritative run:
 *     exactly 83, asserted BEFORE any document request), caches first, then the EDGAR index of the CIK (older pages only
 *     when needed) and at most 6 primary documents per session from the pre-registered forms and window; the text is
 *     parsed locally and dropped; 1.4.0 classifies (classifyWithDocument);
 *  3. back in caResolutionPart: census, generated overlay manifest (1.4.0), the overlay through the UNCHANGED production
 *     path, CA / CA-Q-K5 / CA-Q-K3 reference runs, reconciliation and trade comparison with BASE.
 *  - public (log): counts per class / reason / label, requests used, sessions resolved per reference, BASE hash identity,
 *    the overlay manifest hashes (1.3.0 and 1.4.0). No ticker, CIK, accession number or document text;
 *  - sealed (owner key): per session the 1.3.0 and 1.4.0 class, the extracted ratio / dates / accession / passage hash.
 * DIAGNOSTIC_NOT_CERTIFIED. No paid source, no live activation, no orders; quant/data and the snapshot stay unchanged.
 *
 *   node scripts/supertrader/source-faithful/research/run-sf7-ca-edgar.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --out <dir> [--smoke-limit 400]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { FOUNDATION } from '../contract.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { INTEGRITY_KEYS } from './run-sf6-integrity.mjs';
import { caResolutionPart, compareWithSf6, caCodeSha256, SEC_SHARES_KEYS } from './run-sf7-ca-resolution.mjs';
import { CLASSES, CA_RESOLUTION_VERSION, filingEvidence, rulesetSha256 as rulesetSha256V130 } from '../integrity/ca-resolution.mjs';
import { CA_EDGAR_VERSION, EDGAR_BUDGET, SMOKE_BUDGET, DOC_TOLERANCES, rulesetSha256, baseRulesetUnchanged, BASE_RULESET, selectDocuments, documentFactor, groundTruthLabel, classifyWithDocument, documentPath, addDays } from '../integrity/ca-edgar.mjs';
import { buildOverlayManifest } from '../integrity/ca-overlay.mjs';
import { createEdgarClient, emptyCache, EDGAR_CACHE_KEY, EDGAR_CLIENT_VERSION } from './sf7-edgar-client.mjs';
import { SF6_RUN_FACTS } from '../completion/sf6-run-facts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SF7_CA_EDGAR_RUNNER_VERSION = 'sf7-ca-edgar-runner-1.0.0';
/** E7-1: the reference-exposed UNRESOLVED DQ-K5 sessions of rule set 1.3.0 (run 40122736287). */
export const EXPECTED_SCOPE_SESSIONS = 83;
/** 1.3.0 overlay manifest hash of run 40122736287 (empty overlay); the 1.3.0 stage of this run must reproduce it. */
export const MANIFEST_SHA256_V130 = 'e0a31fea1f723faec9046e944c9500984809a62b3cc44262ad3e648f252522c1';
const FILES = ['../integrity/ca-edgar.mjs', 'sf7-edgar-client.mjs', 'run-sf7-ca-edgar.mjs'];
export function edgarCodeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of FILES) { h.update(f); h.update(fs.readFileSync(path.join(HERE, f))); }
  return h.digest('hex');
}
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const tally = (rows, key) => rows.reduce((o, r) => { const k = key(r); if (k != null) o[k] = (o[k] || 0) + 1; return o; }, {});

/**
 * Refinement of caResolutionPart (rule set 1.4.0). scope 'K5' (E7-1) or 'K3' (smoke only: the technical probe exercises
 * EDGAR on the exposed DQ-K3 sessions of 400 series). expectedCount: asserted before any document request (fail closed).
 */
export function edgarRefine({ client, scope = 'K5', expectedCount = null, budget = EDGAR_BUDGET, tol = DOC_TOLERANCES }) {
  return async ({ cands, identityOf, segs, baseDs, snapshotId, evidenceInputs, log = () => {} }) => {
    for (const c of cands) c.result13 = c.result;
    const inScope = cands.filter((c) => c.result.cls === CLASSES.UNRESOLVED && c.exposedRefs.length && (scope === 'K3' || c.level === 'K5'));
    if (expectedCount !== null && inScope.length !== expectedCount) throw new Error(`EDGAR_SCOPE_COUNT_MISMATCH: ${inScope.length} != ${expectedCount}`);
    // sessions that can become CONFIRMED (document path A, then B) first, then the ground-truth-only sessions
    const rank = (c) => ({ A: 0, B: 1 }[documentPath(c.result13)] ?? 2);
    const order = [...inScope].sort((a, b) => rank(a) - rank(b) || b.exposedRefs.length - a.exposedRefs.length || (a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : a.date.localeCompare(b.date)));
    log(`EDGAR scope ${scope}: ${inScope.length} sessions (document path A ${order.filter((c) => rank(c) === 0).length}, B ${order.filter((c) => rank(c) === 1).length})`);
    const sealedRows = [];
    let docsSelectedTotal = 0;
    for (const c of order) {
      const { sec, identity } = identityOf(c), raw = segs[c.j].raw, bars = baseDs.securities[c.j].bars;
      const row = { segmentId: c.segmentId, date: c.date, level: c.level, exposedRefs: c.exposedRefs, cik: sec?.cik ?? null, cls13: c.result13.cls, reason13: c.result13.reason, path: documentPath(c.result13) };
      if (!sec?.cik) { c.edgar = { label: 'NOT_CHECKED', check: 'NO_CIK' }; sealedRows.push({ ...row, ...c.edgar }); continue; }
      const lo = addDays(c.date, Math.min(tol.filingWindowDays[0], -45)), hi = addDays(c.date, tol.filingWindowDays[1]);
      const ix = await client.indexCovering(sec.cik, lo, hi);
      if (!ix || ix.refused) { c.edgar = { label: 'NOT_CHECKED', check: ix?.refused ? 'EDGAR_BUDGET_EXHAUSTED' : 'EDGAR_INDEX_UNAVAILABLE' }; if (documentPath(c.result13)) c.result = { cls: CLASSES.UNRESOLVED, reason: c.edgar.check, evidence: c.result13.evidence }; sealedRows.push({ ...row, ...c.edgar }); continue; }
      const picks = selectDocuments(ix.index, c.date, tol).slice(0, budget.docRequestsPerSession); docsSelectedTotal += picks.length;
      const docs = []; let complete = true, failed = 0;
      for (const p of picks) {
        const x = await client.document(sec.cik, p);
        if (x.refused) { complete = false; break; }
        if (!x.ok) { failed++; continue; }
        docs.push({ accessionNumber: p.accessionNumber, form: p.form, filingDate: p.filingDate, extraction: x.extraction });
      }
      // a document that could not be read may hold a conflicting ratio: the session cannot be confirmed (fail closed)
      const df = documentFactor({ docs, raw, i: c.i, complete: complete && failed === 0, tol });
      if (df.ok === false && complete && failed > 0) df.reason = 'DOCUMENT_FETCH_FAILED';
      const filings = ix.covered ? filingEvidence(ix.index, c.date) : { covered: false, reason: 'SEC_FILINGS_NOT_COVERED' };
      c.result = classifyWithDocument({ r13: c.result13, raw, bars, i: c.i, sec, identity, otherFlagDates: c.otherFlagDates, filings, index: ix.index, df });
      c.edgar = { label: groundTruthLabel(df), check: 'CHECKED', indexCovered: ix.covered, documentsSelected: picks.length, documentsRead: docs.length, documentsFailed: failed, documentReason: df.ok ? 'DOCUMENT_FACTOR' : df.reason };
      sealedRows.push({ ...row, ...c.edgar, cls14: c.result.cls, reason14: c.result.reason, label14: c.result.label ?? null, document: df.evidence, documents: docs.map((x) => ({ accessionNumber: x.accessionNumber, form: x.form, filingDate: x.filingDate, chars: x.extraction.chars, truncated: x.extraction.truncated, textSha256: x.extraction.textSha256, statements: x.extraction.statements })) });
    }
    // public, counts only
    const confirmedNow = (c) => c.result.cls !== CLASSES.UNRESOLVED, k5 = (c) => c.level === 'K5';
    const perReference = {};
    for (const k of [...new Set(cands.flatMap((c) => c.exposedRefs))].sort()) {
      const rows = cands.filter((c) => k5(c) && c.exposedRefs.includes(k));
      perReference[k] = { dqK5Exposed: rows.length, unresolved13: rows.filter((c) => c.result13.cls === CLASSES.UNRESOLVED).length, confirmedSplit14: rows.filter((c) => c.result.cls === CLASSES.SPLIT).length, confirmedGenuine14: rows.filter((c) => c.result.cls === CLASSES.GENUINE).length, unresolved14: rows.filter((c) => !confirmedNow(c)).length, splitFactors14: tally(rows.filter((c) => c.result.cls === CLASSES.SPLIT), (c) => c.result.label) };
    }
    const m13 = buildOverlayManifest(cands.map((c) => ({ ...c.result13, segmentId: c.segmentId, date: c.date })), { snapshotId, classifierVersion: CA_RESOLUTION_VERSION, evidenceInputs });
    const pub = {
      version: CA_EDGAR_VERSION, rulesetSha256: rulesetSha256(), baseRuleset: { version: BASE_RULESET.version, sha256: rulesetSha256V130(), unchanged: baseRulesetUnchanged() }, client: EDGAR_CLIENT_VERSION, scope, expectedSessions: expectedCount,
      sessionsInScope: inScope.length, sessionsWithCik: inScope.filter((c) => identityOf(c).sec?.cik).length, sessionsChecked: inScope.filter((c) => c.edgar?.check === 'CHECKED').length,
      byCheck: tally(inScope, (c) => c.edgar?.check ?? 'NOT_REACHED'), byDocumentPath: tally(inScope, (c) => documentPath(c.result13) ?? 'NONE'),
      documentsSelected: docsSelectedTotal, documentsRead: inScope.reduce((s, c) => s + (c.edgar?.documentsRead ?? 0), 0), documentsFailed: inScope.reduce((s, c) => s + (c.edgar?.documentsFailed ?? 0), 0),
      requests: client.stats(), labels: tally(inScope, (c) => c.edgar?.label ?? 'NOT_CHECKED'), documentReasons: tally(inScope, (c) => c.edgar?.documentReason ?? null),
      byClass14: tally(inScope, (c) => c.result.cls), byReason14: tally(inScope, (c) => c.result.reason), splitFactors14: tally(inScope.filter((c) => c.result.cls === CLASSES.SPLIT), (c) => c.result.label),
      transitions: tally(inScope, (c) => `${c.result13.reason} -> ${c.result.cls === CLASSES.UNRESOLVED ? c.result.reason : c.result.cls}`),
      before: { 'DQ-K5': tally(cands.filter(k5), (c) => c.result13.cls), 'DQ-K3': tally(cands, (c) => c.result13.cls), exposedK5Unresolved: cands.filter((c) => k5(c) && c.exposedRefs.length && c.result13.cls === CLASSES.UNRESOLVED).length, overlayManifestSha256: m13.manifestSha256, overlayEntries: m13.entries.length },
      after: { 'DQ-K5': tally(cands.filter(k5), (c) => c.result.cls), 'DQ-K3': tally(cands, (c) => c.result.cls), exposedK5Unresolved: cands.filter((c) => k5(c) && c.exposedRefs.length && c.result.cls === CLASSES.UNRESOLVED).length },
      changedOutsideScope: cands.filter((c) => !inScope.includes(c) && c.result !== c.result13).length,
      perReference,
    };
    if (pub.changedOutsideScope) throw new Error('EDGAR_CHANGED_OUTSIDE_SCOPE');
    log(`EDGAR: ${pub.sessionsChecked}/${inScope.length} checked, requests ${pub.requests.requests}/${budget.totalRequests}, confirmed splits ${pub.byClass14[CLASSES.SPLIT] ?? 0}`);
    return { pub, sealed: { sessions: sealedRows } };
  };
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (arg('--accounting') !== 'research-v1') { console.error('RESEARCH_ACCOUNTING_REQUIRED'); process.exit(2); }
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) { console.error('SNAPSHOT_REQUIRED'); process.exit(2); }
  const OUT = arg('--out'); if (!OUT) { console.error('--out required'); process.exit(2); }
  const LIMIT = Number(arg('--smoke-limit', '0'));
  if (!(Number.isInteger(LIMIT) && LIMIT >= 0)) { console.error('SMOKE_LIMIT_INTEGER'); process.exit(2); }
  const smoke = LIMIT > 0, budget = smoke ? SMOKE_BUDGET : EDGAR_BUDGET, scope = smoke ? 'K3' : 'K5';
  if (!baseRulesetUnchanged()) { console.error('BASE_RULESET_1_3_0_CHANGED'); process.exit(2); }
  const t0 = Date.now(), log = (m) => console.log(`[sf7-ca-edgar +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  let pit, datasetSha256, verification, secPit, shares, sharesSha256, live, cache = emptyCache(), cacheLoaded = false, cacheSha256 = null;
  const SEC_SHARES_KEY = SEC_SHARES_KEYS.r14;
  try {
    const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
    const { createSnapshotStore } = await import('../../snapshot/store.mjs');
    const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
    live = await LIVE_IO.createDriver();
    const opened = await openSnapshot({ store: createSnapshotStore({ driver: live, smoke: false }), snapshotId, requireRestoreReceipt: true });
    pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
    const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
    if (v.codeVersionChanged) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'CODE_VERSION_CHANGED');
    datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
    verification = { datasetVerified: v.datasetVerified, codeVersionChanged: v.codeVersionChanged, bytesVerified: opened.verified.bytes };
    const driver = await opened.io.createDriver();
    const buf = await driver.get(pit.mine.seriesPrefix + '_validation/sec-pit-r12.json.gz');
    secPit = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
    const sbuf = await live.get(pit.mine.seriesPrefix + SEC_SHARES_KEY);
    if (!sbuf) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'SEC_PIT_R14_MISSING');
    sharesSha256 = crypto.createHash('sha256').update(sbuf).digest('hex');
    const r14 = JSON.parse(zlib.gunzipSync(sbuf).toString('utf8'));
    shares = new Map(Object.entries(r14).filter(([, x]) => Array.isArray(x?.shares) && x.shares.length).map(([id, x]) => [id, { cik: x.cik, how: x.how, taxonomy: x.taxonomy ?? null, shares: x.shares }]));
    // caches first: the private EDGAR cache of earlier 1.4.0 runs (extracted statements only), when present
    const cbuf = await live.get(pit.mine.seriesPrefix + EDGAR_CACHE_KEY);
    if (cbuf) { cache = JSON.parse(zlib.gunzipSync(cbuf).toString('utf8')); cacheLoaded = true; cacheSha256 = crypto.createHash('sha256').update(cbuf).digest('hex'); }
    log(`snapshot ${snapshotId}: dataset ${v.datasetVerified}; r14 listings with shares ${shares.size} (sha ${sharesSha256.slice(0, 12)}); EDGAR cache ${cacheLoaded ? 'loaded' : 'none'}`);
  } catch (e) {
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`);
    process.exit(3);
  }
  const cacheBefore = { submissions: Object.keys(cache.submissions || {}).length, documents: Object.keys(cache.documents || {}).length };
  if (LIMIT) pit.segs = pit.segs.slice(0, LIMIT);
  const ds = datasetFromPit(pit); attachSecPit(ds, secPit);
  const listingPeriods = new Map(pit.listings.map((l) => [l.id, { startDate: l.startDate, listEnd: l.listEnd || null }]));
  const { UA } = await import('../../validation/sec-pit.mjs');
  const client = createEdgarClient({ userAgent: UA, budget, cache });
  const evidenceInputs = { secShares: 'r14', secSharesKey: SEC_SHARES_KEY, secSharesSha256: sharesSha256, datasetSha256, snapshotId };
  const authoritative = snapshotId === SF6_RUN_FACTS.integrity.snapshotId && !LIMIT;
  const receipt = { schema: 'supertrader-sf7-ca-edgar-receipt-1.0.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, engineCodeSha256: engineCodeSha256(), caCodeSha256: caCodeSha256(), edgarCodeSha256: edgarCodeSha256(), runner: SF7_CA_EDGAR_RUNNER_VERSION, classifier: CA_EDGAR_VERSION, rulesetSha256: rulesetSha256(), baseRulesetSha256: rulesetSha256V130(), secShares: 'r14', secSharesSha256: sharesSha256, edgarCache: { key: EDGAR_CACHE_KEY, loaded: cacheLoaded, sha256: cacheSha256, ...cacheBefore }, budget, scope, limit: LIMIT || null, ...verification, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  const fetchFilings = (cik) => client.submissions13(cik);
  let r;
  try {
    r = await caResolutionPart(ds, pit.segs, { sharesByListing: shares, listingPeriods, fetchFilings, secFetchMax: smoke ? 5 : 150, snapshotId, evidenceInputs, classifierVersion: CA_EDGAR_VERSION, rulesetSha256Value: rulesetSha256(), refine: edgarRefine({ client, scope, expectedCount: authoritative ? EXPECTED_SCOPE_SESSIONS : null, budget }), log });
  } catch (e) {
    console.error(String(e?.message || e).startsWith('EDGAR_') ? String(e.message) : String(e?.stack || e));
    process.exit(6);
  }
  r.pub.baseVsSf6 = authoritative ? compareWithSf6(r.pub.lifecycles) : { skipped: 'NOT_THE_AUTHORITATIVE_FULL_RUN' };
  r.pub.refine.before.overlayMatchesRun40122736287 = authoritative ? r.pub.refine.before.overlayManifestSha256 === MANIFEST_SHA256_V130 : null;
  const stats = client.stats();
  if (stats.requests > budget.totalRequests) { console.error('EDGAR_BUDGET_BREACH'); process.exit(7); }
  // the private cache keeps extracted statements only (never document text); written back for later runs
  const out = client.exportCache();
  const cacheAfter = { submissions: Object.keys(out.submissions).length, documents: Object.keys(out.documents).length };
  try { await live.put(pit.mine.seriesPrefix + EDGAR_CACHE_KEY, zlib.gzipSync(Buffer.from(JSON.stringify(out))), { contentType: 'application/gzip' }); r.pub.refine.cache = { loaded: cacheLoaded, before: cacheBefore, after: cacheAfter, written: true }; }
  catch { r.pub.refine.cache = { loaded: cacheLoaded, before: cacheBefore, after: cacheAfter, written: false }; }
  const pub = { schema: 'supertrader-sf7-ca-edgar-public-1.0.0', receipt, resolution: r.pub };
  const sealed = { receipt, public: pub, resolution: r.sealed };
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `sf7-ca-edgar${smoke ? '-smoke' : ''}`;
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(sealed))));
  fs.writeFileSync(path.join(OUT, `${tag}-overlay.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(r.manifest))));
  fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
  log(`done; public ${tag}.public.json`);
  if (authoritative && !r.pub.baseVsSf6.allEqual) { console.error('BASE_REGRESSION: BASE differs from the 6.0 facts'); process.exit(5); }
  if (authoritative && !r.pub.refine.before.overlayMatchesRun40122736287) { console.error('V130_OVERLAY_NOT_REPRODUCED'); process.exit(5); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
