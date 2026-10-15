/**
 * V4 calibration run (inside the protected runner only; private plaintext never leaves /workspace/private).
 *
 * Order (registered): verify freeze content + git pinning -> verify canonical content and oracle bytes against
 * the freeze -> load canonical data -> causal terminals (A5) -> price-sanity census and defect quarantine (A9)
 * -> off-calendar census (A6) -> arithmetic constructions -> external oracle comparisons -> close and next-open
 * equal-weight books on V4 accounting -> independent review (A4/A6/A7/A8/A10) -> pre-registered sensitivities
 * -> certification level. Public output: verdicts, check flags, correlations, counts, hashes. Returns,
 * means, volatilities and drawdowns are sealed to the owner/session keys.
 *
 * Usage: node run-calibration-v4.mjs --freeze <file> --input-dir <private canonical> --oracle-parsed <file>
 *          --out <private dir> --public-out <summary.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCanonicalData } from '../certification/canonical-input.mjs';
import { prepareRerunData } from '../certification/run-rerun.mjs';
import { computeContentBinding } from '../calibration/capture-v3-inrunner.mjs';
import * as Listing from '../../validation/lib.mjs';
import { verifyFreezeV4, verifyFreezePinned } from './freeze-v4.mjs';
import { applyCausalTerminals } from './measurement/measurement-policy-v4.mjs';
import { priceSanityCensus, applyPriceSanityQuarantine, exchangeOf } from './measurement/price-sanity-v4.mjs';
import { buildConstructions, sessionCalendar, membershipTurnover, oracleUniverseMember } from './oracle/constructions-v4.mjs';
import { compareEwMarket, compareBuckets, compareInternal } from './oracle/compare-v4.mjs';
import { runEqualWeightBook } from './oracle/book-v4.mjs';
import { recomputeDividends, offCalendarCensus, dustCheck, curveCheck, truncationReview, assembleReview } from './review/review-v4.mjs';
import { certifyV4 } from './completion-v4.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const demand = (ok, code) => { if (!ok) throw new Error(code); };
const baseProtocol = JSON.parse(fs.readFileSync(path.join(HERE, '../tournament/protocol.json')));
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

export function publicOracle(c) {
  const flags = (x) => ({ verdict: x.verdict, validMonths: x.validMonths, correlation: r3(x.stats?.correlation), direction: x.stats ? { vu: x.stats.directionVu, oracle: x.stats.directionRef } : null,
    checks: (x.checks ?? []).map((k) => ({ id: k.id, hard: k.hard, pass: k.pass })) });
  if (c.buckets) return { oracleId: c.oracleId, verdict: c.verdict, hardFailures: c.hardFailures, blockedFormations: c.blockedFormations, medianBucketCorrelation: r3(c.medianBucketCorrelation),
    lowLeg: flags(c.buckets[0]), highLeg: flags(c.buckets.at(-1)), spread: flags(c.spread), bucketCorrelations: c.buckets.map((b) => r3(b.stats?.correlation)) };
  return { oracleId: c.oracleId, ...flags(c), holdingCountRatioMean: r3(c.informational?.holdingCountRatioMean) };
}

function compareAll(months, oracle) {
  return {
    EW_MARKET: compareEwMarket(months, oracle.EW_MARKET),
    MOM_12_2_EW_DECILES: compareBuckets(months, oracle.MOM_12_2_EW_DECILES, 'MOM_12_2_EW_DECILES', 'FRENCH_MOM10_EW_DECILES'),
    VAR_60D_EW_QUINTILES: compareBuckets(months, oracle.VAR_60D_EW_QUINTILES, 'VAR_60D_EW_QUINTILES', 'FRENCH_VAR_EW_QUINTILES'),
  };
}

function bookReview(name, run, data) {
  return { book: name, checks: [
    { id: 'V4-RECONCILIATION-GROSS-FLOW', hard: true, status: run.reconciliation.pass ? 'PASS' : 'FAIL', absoluteDifference: run.reconciliation.absoluteDifference, tolerance: run.reconciliation.tolerance },
    recomputeDividends(run.book, data), dustCheck(run.book), curveCheck(run.book), { ...run.endingFreshness },
  ] };
}

function universeTables(data, raw) {
  const byKind = {}, byYear = {};
  for (const s of data.securities) if (s.terminal) { byKind[s.terminal.kind] = (byKind[s.terminal.kind] || 0) + 1; const y = s.terminal.date?.slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; }
  const types = {}, exchanges = {};
  for (const s of data.securities) { const t = s.listing?.instrumentType ?? 'UNKNOWN'; types[t] = (types[t] || 0) + 1; const e = exchangeOf(s) ?? 'UNKNOWN'; exchanges[e] = (exchanges[e] || 0) + 1; }
  return { securities: data.securities.length, terminalsByKind: byKind, terminalsByYear: byYear, instrumentTypes: types, exchanges, canonicalCoverage: { inputSegments: raw.coverage?.inputSegments ?? null, usableSegments: raw.coverage?.usableSegments ?? null, rejectedByReason: raw.coverage?.rejected ?? null } };
}

function seal(dir, name, bytes) {
  const keys = [['owner', 'scripts/supertrader/validation/results-public-key.pem'], ['session', 'scripts/supertrader/research/tournament/session-public-key.pem']];
  return keys.map(([aud, p]) => { const file = path.join(dir, `${name}.${aud}.sealed.json`), sealed = Listing.encryptForOwner(fs.readFileSync(path.join(ROOT, p), 'utf8'), bytes); fs.writeFileSync(file, sealed, { mode: 0o600, flag: 'wx' }); return { audience: aud, file: path.basename(file), sha256: sha(Buffer.from(sealed)) }; });
}

/** Pure core (also used by the synthetic end-to-end test). */
export function calibrateV4(rawPrepared, oracle, { openFindings = [] } = {}) {
  // V4.1 (review R7b): the price-sanity quarantine runs first, then causal terminals are rebuilt for every quarantine
  const census = priceSanityCensus(rawPrepared.securities);
  const sanitized = applyPriceSanityQuarantine(rawPrepared, census);
  const terminals = applyCausalTerminals(sanitized.data);
  const data = terminals.data;
  const keepDefects = applyCausalTerminals(rawPrepared).data;
  const calendar = sessionCalendar(data);
  const offCalendar = offCalendarCensus(data);
  const baseline = buildConstructions(data, {});
  const oracles = compareAll(baseline.months, oracle);
  const closeBook = runEqualWeightBook(data, baseline.months, { mode: 'CLOSE' });
  const openBook = runEqualWeightBook(data, baseline.months, { mode: 'NEXT_OPEN' });
  const internal = compareInternal(closeBook.monthly, new Map(baseline.months.map((m) => [m.month, m.EW_MARKET.ret])));
  const executionEffect = compareInternal(openBook.monthly, new Map(baseline.months.map((m) => [m.month, m.EW_MARKET.ret])));
  const truncation = truncationReview(data, baseline.months, calendar, exchangeOf, (s) => oracleUniverseMember(s));
  const review = assembleReview([bookReview('EW_CLOSE', closeBook, data), bookReview('EW_NEXT_OPEN', openBook, data), { book: 'CONSTRUCTIONS', checks: [truncation, offCalendar] }], ['EW_CLOSE', 'EW_NEXT_OPEN', 'CONSTRUCTIONS']);
  const affected = new Set(census.privateRows.map((r) => r.id));
  const variants = [
    { id: 'EXCLUDE_ALL_ADJUSTED_LEVEL_ABOVE_1E6', data: { ...data, securities: data.securities.filter((s) => !affected.has(s.id)) }, opts: {} },
    { id: 'KEEP_PRICE_SANITY_DEFECTS_WITH_POST_DEFECT_PATH', data: keepDefects, opts: {} },
    { id: 'DATA_EVENTS_MINUS_30_PERCENT', data, opts: { dataEventScenario: 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT' } },
    { id: 'ECONOMIC_LAST_OBSERVED_PRICE', data, opts: { scenario: 'LAST_OBSERVED_PRICE' } },
    { id: 'ECONOMIC_DISTRESS_ZERO', data, opts: { scenario: 'DISTRESS_ZERO_OTHER_MINUS_30' } },
  ];
  const sensitivities = variants.map((v) => { const c = compareAll(buildConstructions(v.data, { ...v.opts, keepMembership: false }).months, oracle); return { id: v.id, verdicts: Object.fromEntries(Object.entries(c).map(([k, x]) => [k, x.verdict])), correlations: Object.fromEntries(Object.entries(c).map(([k, x]) => [k, r3(x.stats?.correlation ?? x.spread?.stats?.correlation)])), private: c }; });
  const certification = certifyV4({ internal, review, oracles, sensitivities, openFindings });
  const turnover = { EW_MARKET: membershipTurnover(baseline.months, 'EW_MARKET'), MOM_LOW: membershipTurnover(baseline.months, 'MOM_12_2_EW_DECILES', 0), MOM_HIGH: membershipTurnover(baseline.months, 'MOM_12_2_EW_DECILES', 9), VAR_LOW: membershipTurnover(baseline.months, 'VAR_60D_EW_QUINTILES', 0), VAR_HIGH: membershipTurnover(baseline.months, 'VAR_60D_EW_QUINTILES', 4) };
  const categories = {}; for (const m of baseline.months) for (const [c, n] of Object.entries(m.EW_MARKET.categories)) categories[c] = (categories[c] || 0) + n;
  return { data, terminals, census, sanitized, baseline, oracles, closeBook, openBook, internal, executionEffect, review, sensitivities, certification, turnover, categories, offCalendar };
}

export async function runCalibrationV4(args) {
  const freezePath = path.resolve(args['--freeze']), freezeBytes = fs.readFileSync(freezePath), freeze = JSON.parse(freezeBytes);
  verifyFreezeV4(freeze);
  const pinned = verifyFreezePinned(freezePath);
  const inputDir = path.resolve(args['--input-dir']), out = path.resolve(args['--out']);
  demand(inputDir.startsWith('/workspace/private/') && out.startsWith('/workspace/private/'), 'PRIVATE_PATHS_REQUIRED');
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const binding = computeContentBinding(inputDir), frozenBinding = freeze.dataContract.canonicalCapture;
  for (const k of ['normalizedPartListSha256', 'normalizedManifestSha256', 'normalizedInputsSha256', 'dataFingerprint']) demand(binding[k] === frozenBinding[k], 'CANONICAL_CONTENT_DIFFERS_FROM_FREEZE:' + k);
  const oracleBytes = fs.readFileSync(args['--oracle-parsed']);
  demand(sha(oracleBytes) === freeze.oracleParsedSha256, 'ORACLE_PARSED_DIFFERS_FROM_FREEZE');
  const oracle = JSON.parse(oracleBytes).parsed;
  const sourceMetadataSha = sha(fs.readFileSync(path.join(inputDir, 'data-certification-inputs.json')));
  const raw = await loadCanonicalData(inputDir, { sourceProvenanceOverlay: true, expectedSourceMetadataSha256: sourceMetadataSha });
  const prepared = prepareRerunData(raw, baseProtocol).data;
  // V4.1 (review R1): certification uses the open-findings array frozen inside the freeze, never the mutable file
  const openFindings = freeze.openFindings;
  demand(Array.isArray(openFindings) && openFindings.length > 0, 'FROZEN_OPEN_FINDINGS_REQUIRED');
  const r = calibrateV4(prepared, oracle, { openFindings });
  const summary = {
    schema: 'supertrader-v4-calibration-public-summary-1.0.0', generation: 'CALIBRATION_V4', postHoc: true,
    freezeId: freeze.freezeId, freezeFileSha256: sha(freezeBytes), freezeCommit: pinned.freezeCommit, runId: process.env.GITHUB_RUN_ID ?? null,
    inputVerification: { canonicalContentBinding: 'MATCHES_FREEZE', oracleParsed: 'MATCHES_FREEZE' },
    universe: universeTables(r.data, raw),
    causalTerminals: r.terminals.audit,
    priceSanity: { affected: r.census.affected, byClass: r.census.byClass, defectQuarantined: r.census.defectQuarantined, quarantineAudit: r.sanitized.audit },
    offCalendar: { offCalendarBars: r.offCalendar.offCalendarBars, securities: r.offCalendar.securities, withDividend: r.offCalendar.withDividend, withSplit: r.offCalendar.withSplit, status: r.offCalendar.status },
    holdingCategories: r.categories,
    oracles: Object.fromEntries(Object.entries(r.oracles).map(([k, c]) => [k, publicOracle(c)])),
    internalReconciliation: { verdict: r.internal.verdict, months: r.internal.months, withinShare: r.internal.withinShare, meanAbsoluteDifference: r.internal.meanAbsoluteDifference, maxAbsoluteDifference: r.internal.maxAbsoluteDifference, closeBookStats: r.closeBook.stats, staleCounts: r.closeBook.staleCounts },
    executionConventionEffect: { basis: 'NEXT_OPEN_BOOK_VS_CLOSE_ARITHMETIC_INFORMATIONAL', withinShare: r.executionEffect.withinShare, meanAbsoluteDifference: r3(r.executionEffect.meanAbsoluteDifference), openBookStats: r.openBook.stats },
    review: { status: r.review.status, missingBooks: r.review.missingBooks, books: r.review.books.map((b) => ({ book: b.book, hardChecks: b.hardChecks, failedHardChecks: b.failedHardChecks })), truncationSample: r.review.books.find((b) => b.book === 'CONSTRUCTIONS').checks[0].sampledFormations },
    sensitivities: r.sensitivities.map(({ id, verdicts, correlations }) => ({ id, verdicts, correlations })),
    turnoverMembershipInformational: Object.fromEntries(Object.entries(r.turnover).map(([k, v]) => [k, r3(v)])),
    certification: r.certification,
    performanceNumbersPublished: false,
  };
  const privatePayload = Buffer.from(JSON.stringify({ schema: 'supertrader-v4-calibration-private-1.0.0', freezeId: freeze.freezeId,
    months: r.baseline.months.map(({ month, formation, end, EW_MARKET, MOM_12_2_EW_DECILES, VAR_60D_EW_QUINTILES }) => ({ month, formation, end, EW: { ret: EW_MARKET.ret, count: EW_MARKET.count, categories: EW_MARKET.categories }, MOM: MOM_12_2_EW_DECILES && { status: MOM_12_2_EW_DECILES.status, buckets: MOM_12_2_EW_DECILES.buckets, counts: MOM_12_2_EW_DECILES.counts }, VAR: VAR_60D_EW_QUINTILES && { status: VAR_60D_EW_QUINTILES.status, buckets: VAR_60D_EW_QUINTILES.buckets, counts: VAR_60D_EW_QUINTILES.counts } })),
    oracles: r.oracles, sensitivities: r.sensitivities.map((s) => ({ id: s.id, comparisons: s.private })), closeBookMonthly: [...r.closeBook.monthly], openBookMonthly: [...r.openBook.monthly], priceSanityRows: r.census.privateRows, review: r.review }));
  summary.sealed = { plaintextSha256: sha(privatePayload), envelopes: seal(out, 'SUPERTRADER-V4-CALIBRATION-PRIVATE', privatePayload) };
  fs.mkdirSync(path.dirname(path.resolve(args['--public-out'])), { recursive: true });
  fs.writeFileSync(args['--public-out'], JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), args = {};
  for (let i = 0; i < a.length; i += 2) args[a[i]] = a[i + 1];
  runCalibrationV4(args).then((s) => process.stdout.write(JSON.stringify({ freezeId: s.freezeId, level: s.certification.level, reasons: s.certification.reasons, oracles: Object.fromEntries(Object.entries(s.oracles).map(([k, x]) => [k, x.verdict])), internal: s.internalReconciliation.verdict, review: s.review.status }) + '\n'))
    .catch((e) => { process.stderr.write(JSON.stringify({ phase: 'V4_CALIBRATION', code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'PRIVATE_RUN_FAILURE', name: e.name, hint: /^[A-Za-z0-9 ,.:'()_\-/]{1,160}$/.test(e.message) ? e.message : null, stack: (e.stack || '').split('\n').slice(1, 6).map((l) => l.replace(/\(.*\/scripts\//, '(scripts/')).join(' | ') }) + '\n'); process.exitCode = 1; });
}
