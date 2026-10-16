#!/usr/bin/env node
/**
 * Corporate-action contract 2.0.0 audit inside the protected Actions runner. Data quality and coverage only:
 * no performance, no calibration, no strategy.
 *
 * Stages
 *   prepare   canonical capture of the pinned #705 pipeline (unchanged core 1.0.0 = V4 freeze content):
 *             universe (segments, listing windows, issuer CIK, SEC share counts, delisting class), the V4 extreme
 *             population keys (2213 security-months, 83 diagnostic cases) and the 74 adjusted-level > 1e6 ids.
 *   scan      raw store re-read of every segment (full window, provider adjustedClose), cached privately;
 *             1.2.0 whole-series and prefix verdicts, v2 without SEC, category features, CIKs for periodic reports.
 *   evaluate  v2 with SEC evidence for every segment; before/after impact against main (1.0.0 whole series),
 *             #721 (1.2.0 whole series) and the V4 prefix semantics; PIT leakage checks on real data; the
 *             pre-registered independent control set; regression rows of the known V4 cases (private).
 *   seal      private results sealed to the owner and session keys.
 *
 * Usage:
 *   node audit-v2.mjs --stage prepare  --base-root <#705 checkout> --capture <dir> --private <dir> --public <file>
 *   node audit-v2.mjs --stage scan     --base-root <dir> --private <dir> --public <file>
 *   node audit-v2.mjs --stage evaluate --base-root <dir> --private <dir> --sec <events.json> --public-dir <dir>
 *   node audit-v2.mjs --stage seal     --base-root <dir> --private <dir> --owner-key <pem> --session-key <pem> --sealed-dir <dir> --public <file>
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../..');
const CTR = require(path.join(ROOT, 'quant/engines/canonical-total-return.js'));
const PV = require(path.join(ROOT, 'quant/engines/canonical-price-validity.js'));
const CAV = require(path.join(ROOT, 'quant/engines/corporate-action-validation.js'));
const SEC = require(path.join(ROOT, 'quant/engines/sec-corporate-actions.js'));
const A = await import(pathToFileURL(path.join(ROOT, 'scripts/quant/price-integrity-audit.mjs')).href);
const PROTOCOL = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/data-quality/corporate-action-v2/CONTROL-SET-PROTOCOL-V2.json'), 'utf8'));

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; return o; };
const r4 = (x) => (finite(x) ? Math.round(x * 1e4) / 1e4 : null);
const CONFIRMED = { state: 'CONFIRMED', basis: 'EXISTING_LISTING_TABLE_AND_DATE_WINDOW' };
const args = (argv) => { const o = {}; for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1]; return o; };
const addDays = (d, n) => new Date(Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const wilson = (k, n) => { if (!n) return null; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [r4((c - m) / d), r4((c + m) / d)]; };
const hasSplit = (b) => finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9;
const noEvent = (b) => !hasSplit(b) && !(finite(b.dividend) && b.dividend > 0);
const writeJson = (f, o, pretty) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, pretty ? 2 : 0) + (pretty ? '\n' : ''), { mode: 0o600 }); };
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const rawFile = (o, i) => path.join(o.private, 'raw', `${i}.json.gz`);
const runMeta = () => ({ runId: process.env.GITHUB_RUN_ID ?? null, codeCommit: process.env.GITHUB_SHA ?? null });
const versions = () => ({ validity: PV.VERSION, corporateActions: CAV.CONTRACT, validation: CAV.VERSION, secExtractor: SEC.VERSION, totalReturn: CTR.VERSION, coreCorporateActions: CTR.CORPORATE_ACTION_CONTRACT });

/* ------------------------------------------------------------------ prepare */
async function prepare(o) {
  const P = await A.loadPipeline(o['base-root']);
  const before = A.loadPrepared(P, o.capture);
  const binding = P.cap.computeContentBinding(o.capture), frozen = P.freeze.dataContract.canonicalCapture;
  const sameAsV4 = ['normalizedPartListSha256', 'normalizedManifestSha256', 'dataFingerprint'].every((k) => binding[k] === frozen[k]);
  const ext = A.extremeMonths(P, before.data);
  const population = {
    extreme: ext.cases.map((c) => ({ id: c.id, month: c.month, F: c.F, E: c.E, ret: r4(c.ret), cls: c.diagnosticClass, in83: c.diagnosticClass === 'UNDECLARED_RAW_JUMP_10X' || c.diagnosticClass === 'DECLARED_SPLIT_IN_MONTH' })),
    highIds: before.census.privateRows.map((h) => h.id), counts: ext.counts, byClass: ext.byClass };
  const universe = before.raw.securities.map((s) => ({
    id: s.id, ticker: s.ticker, securityId: s.securityId ?? null, listing: { id: s.listing?.id ?? null, startDate: s.listing?.startDate ?? null, endDate: s.listing?.endDate ?? null, reusedLater: s.listing?.reusedLater === true },
    sourceKey: s.priceSource?.sourceKey ?? null, firstBar: s.bars[0]?.date ?? null, cik: s.issuerCik ? String(s.issuerCik).padStart(10, '0') : null, cikStatus: s.issuerCikEvidence?.status ?? null,
    shares: (s.fundamentals || []).filter((f) => f.key === 'shares_outstanding' && finite(f.value)).map((f) => ({ periodEnd: f.periodEnd ?? null, availableAt: f.availableAt, value: f.value })),
    delisted: s.terminal?.kind === 'DELISTED', delistClass: s.terminal?.delistClass ?? null }));
  const ciks = {};
  for (const u of universe) {
    if (!u.cik) continue;
    const c = ciks[u.cik] || (ciks[u.cik] = { tickers: [], windows: [] });
    if (!c.tickers.includes(u.ticker)) c.tickers.push(u.ticker);
    c.windows.push([u.firstBar || u.listing.startDate, u.listing.endDate]);
  }
  writeJson(path.join(o.private, 'universe.json'), { binding, sameAsV4, universe });
  writeJson(path.join(o.private, 'population.json'), population);
  writeJson(path.join(o.private, 'ciks.json'), ciks);
  const pub = { schema: 'corporate-action-v2-prepare-1.0.0', ...runMeta(), capture: { dataFingerprint: binding.dataFingerprint, normalizedPartListSha256: binding.normalizedPartListSha256, securities: binding.securities, sameCanonicalContentAsV4Freeze: sameAsV4 },
    population: { extremeSecurityMonths: ext.cases.length, in83: population.extreme.filter((c) => c.in83).length, highLevel: population.highIds.length, counts: ext.counts },
    universe: { segments: universe.length, withIssuerCik: universe.filter((u) => u.cik).length, distinctCiks: Object.keys(ciks).length, withShareCounts: universe.filter((u) => u.shares.length).length, delisted: universe.filter((u) => u.delisted).length },
    performanceCalculated: false, calibrationRun: false };
  writeJson(o.public, pub, true);
  process.stdout.write(JSON.stringify(pub.universe) + '\n');
}

/* ------------------------------------------------------------------ scan */
function features(bars) {
  const rets = [], closes = []; let maxClose = 0, staleRun = 1, maxStale = 1, highBeta = false, providerFwd = false;
  const jumps10 = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]; if (b.close > 0) { closes.push(b.close); if (b.close > maxClose) maxClose = b.close; }
    if (hasSplit(b) && b.splitFactor >= 1.5) providerFwd = true;
    if (!i) continue;
    const a = bars[i - 1];
    if (b.close === a.close) { staleRun++; if (staleRun > maxStale) maxStale = staleRun; } else staleRun = 1;
    if (!(a.close > 0 && b.close > 0) || !noEvent(b)) continue;
    const r = b.close / a.close, l = Math.log(r);
    rets.push(l);
    if (Math.abs(l) >= Math.log(1.5)) highBeta = true;
    if (Math.abs(l) >= Math.log(10)) jumps10.push({ date: b.date, dir: r > 1 ? 'UP' : 'DOWN', ratio: r4(r) });
  }
  closes.sort((x, y) => x - y);
  const mean = rets.reduce((x, y) => x + y, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((x, y) => x + (y - mean) ** 2, 0) / (rets.length || 1));
  return { n: bars.length, medianClose: closes.length ? closes[Math.floor(closes.length / 2)] : null, maxClose, sd: r4(sd * 1e4) / 1e4, maxStaleRun: maxStale, highBeta, providerForwardSplit: providerFwd,
    providerSplits: bars.filter(hasSplit).map((b) => ({ date: b.date, factor: b.splitFactor })), jumps10 };
}
const compact = (v) => ({ state: v.state, validFrom: v.validFrom, validUntil: v.validUntil, validBars: v.validBars, bars: v.bars,
  hold: v.hold ? { state: v.hold.state, from: v.hold.from, observedAt: v.hold.observedAt, reason: v.hold.reason, detail: v.hold.detail, evidenceClass: v.hold.evidenceClass } : null,
  invalid: v.invalidRanges.map((x) => ({ from: x.from, observedAt: x.observedAt })), normalized: v.normalized,
  evidence: v.evidence.map((e) => ({ class: e.class, outcome: e.outcome, reason: e.reason, eventDate: e.eventDate, ratio: e.ratio, visibleAt: e.visibleAt, observedAt: e.observedAt ?? null, confidence: e.confidence ?? null, provenanceHash: e.provenanceHash })) });

async function scan(o) {
  const U = readJson(path.join(o.private, 'universe.json')).universe;
  /* --fake-store DIR (local dry run only): bars from DIR/<segment index>.json instead of the history store */
  const read = o['fake-store'] ? async (sec) => { const f = path.join(o['fake-store'], `${U.findIndex((x) => x.id === sec.id)}.json`); return fs.existsSync(f) ? readJson(f) : null; } : await A.rawReader(U.length);
  fs.mkdirSync(path.join(o.private, 'raw'), { recursive: true, mode: 0o700 });
  const rows = [], periodic = new Map(), reasons12 = {}, stats = { read: 0, missing: 0 };
  for (let i = 0; i < U.length; i++) {
    const u = U[i];
    const sec = { ...u, priceSource: { sourceKey: u.sourceKey }, bars: [{ date: u.firstBar }] };
    const store = await read(sec);
    if (!store) { stats.missing++; rows.push({ i, missing: true }); continue; }
    stats.read++;
    const last = u.listing.endDate || '9999-12-31';
    const bars = store.filter((b) => b.date >= u.firstBar && b.date <= last).map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      splitFactor: b.splitFactor ?? null, dividend: b.dividend ?? b.divCash ?? null, adjustedClose: b.adjustedClose ?? b.adjClose ?? null }));
    fs.writeFileSync(rawFile(o, i), zlib.gzipSync(JSON.stringify(bars)), { mode: 0o600 });
    const rec = (r) => CTR.reconstruct(r, { identity: CONFIRMED, delisted: u.delisted });
    const whole12 = rec(bars);
    const pref12 = whole12.reconstructed ? null : PV.firstFailure(bars, rec);
    if (pref12) inc(reasons12, pref12.core.reason);
    const v0 = PV.build(bars, { identity: CONFIRMED, delisted: u.delisted });
    const f = features(bars);
    /* candidate dates for retrospective statements in periodic reports (10-Q/10-K/20-F) */
    const cand = [...(v0.hold && /^SPLIT_/.test(v0.hold.reason) ? [v0.hold.from] : []), ...f.jumps10.map((j) => j.date)];
    if (cand.length && u.cik) { const l = periodic.get(u.cik) || []; l.push(...cand); periodic.set(u.cik, l); }
    rows.push({ i, bars: bars.length, whole12: whole12.reconstructed, whole12Reason: whole12.reason ?? null, pref12: pref12 ? { index: pref12.index, reason: pref12.core.reason, date: bars[pref12.index]?.date ?? null } : null,
      v0: compact(v0), f });
    if (i % 1000 === 0) process.stdout.write(`[scan] ${i}/${U.length}\n`);
  }
  writeJson(path.join(o.private, 'scan.json'), rows);
  writeJson(path.join(o.private, 'periodic-ciks.json'), Object.fromEntries([...periodic.entries()].map(([c, d]) => [c, [...new Set(d)].sort()])));
  const pub = { schema: 'corporate-action-v2-scan-1.0.0', ...runMeta(), rawReads: stats, segments: U.length, periodicCiks: periodic.size, prefixReasons12: reasons12, performanceCalculated: false, calibrationRun: false };
  writeJson(o.public, pub, true);
  process.stdout.write(JSON.stringify(pub) + '\n');
}

/* ------------------------------------------------------------------ evaluate */
const rank = (id) => sha(PROTOCOL.selection.seed + '|' + id);
const EDGAR_FROM = '2001-06-01';
const PRICE_HOLD_CLASSES = new Set(['PRICE_DISCONTINUITY_NO_CA_EVIDENCE', 'PROBABLE_CORPORATE_ACTION', 'CONFLICTING_CORPORATE_ACTION']);
/** SEC shares outstanding across a date, both reports within 200 days of it (independent of price and of the 8-K text). */
function sharesAcross(shares, d) {
  const rows = (shares || []).filter((s) => finite(s.value) && s.value > 0).map((s) => ({ at: String(s.periodEnd || s.availableAt).slice(0, 10), value: s.value })).sort((a, b) => (a.at < b.at ? -1 : 1));
  let before = null, after = null;
  for (const x of rows) { if (x.at < d) before = x; else if (!after) after = x; }
  if (!before || !after || before.at < addDays(d, -200) || after.at > addDays(d, 200)) return null;
  return after.value / before.value;
}
function sharesLabel(sr, q) {
  if (sr === null || !finite(sr)) return 'NONE';
  if (Math.abs(Math.log(sr)) < Math.log(1.25)) return 'NO_SPLIT';
  return finite(q) && CAV.explains(1 / sr, q) ? 'CONFIRMS' : 'OTHER_CHANGE';
}
/** SEC statements (any stage) near a date whose ratio explains the raw move r. */
function secNear(secRow, d, r) {
  if (!secRow) return { any365: 0, matching: 0 };
  const lo = addDays(d, -365), hi = addDays(d, 365);
  const ev = (secRow.events || []).filter((e) => { const x = e.marketDate || e.effectiveDate || e.visibleAt; return x >= lo && x <= hi; });
  const px = (secRow.proxies || []).filter((p) => p.filedDate >= lo && p.filedDate <= hi);
  const matching = ev.filter((e) => { const x = e.marketDate || e.effectiveDate; const near = x ? Math.abs(Date.parse(x) - Date.parse(d)) <= 15 * 864e5 : Math.abs(Date.parse(e.visibleAt) - Date.parse(d)) <= 120 * 864e5; return near && finite(r) && CAV.explains(r, e.ratio); }).length;
  return { any365: ev.length + px.length, matching };
}
/** Independent label of one intervention (protocol 2.0.0). */
function labelIntervention(it, u, secRow, bars) {
  if (!u.cik || it.date < EDGAR_FROM) return 'UNLABELED';
  const i = bars.findIndex((b) => b.date >= it.date), r = i > 0 && bars[i - 1].close > 0 ? bars[i].close / bars[i - 1].close : null;
  const q = finite(it.ratio) ? it.ratio : (finite(r) && r > 0 ? 1 / r : null);
  const sl = sharesLabel(sharesAcross(u.shares, it.date), q), sec = secNear(secRow, it.date, r);
  it.shares = sl; it.secMatching = sec.matching; it.secAny365 = sec.any365;
  if (it.kind === 'NORMALIZE') return sl === 'CONFIRMS' ? 'TRUE_POSITIVE' : sl === 'NO_SPLIT' ? 'FALSE_POSITIVE' : 'UNLABELED';
  if (sec.matching > 0 || sl === 'CONFIRMS') return 'TRUE_POSITIVE';
  if (sl === 'NO_SPLIT' && sec.any365 === 0) return 'FALSE_POSITIVE';
  return 'UNLABELED';
}

async function evaluate(o) {
  const { universe: U, binding } = readJson(path.join(o.private, 'universe.json'));
  const scanRows = readJson(path.join(o.private, 'scan.json')), pop = readJson(path.join(o.private, 'population.json'));
  const secAll = readJson(o.sec), secByCik = secAll.ciks || {};
  const CTR10 = require(path.join(o['base-root'], 'quant/engines/canonical-total-return.js'));
  if (CTR10.VERSION !== 'canonical-total-return-1.0.0') throw new Error('BASE_CORE_NOT_1_0_0');
  const extremeById = new Map(); for (const c of pop.extreme) { if (!extremeById.has(c.id)) extremeById.set(c.id, []); extremeById.get(c.id).push(c); }
  const highIds = new Set(pop.highIds);
  /* in-sample exclusion for the control categories (pre-registered) */
  const inSample = new Set([...extremeById.keys(), ...highIds]);
  scanRows.forEach((r) => { if (!r.missing && r.pref12 && (r.pref12.reason === 'SPLIT_SUSPECTED_UNDECLARED' || r.pref12.reason === 'PRICE_SPIKE_REVERTED')) inSample.add(U[r.i].id); });
  const eligible = scanRows.filter((r) => !r.missing && !inSample.has(U[r.i].id));
  const sdSorted = eligible.filter((r) => r.f.medianClose >= 1 && r.f.n >= 250).map((r) => r.f.sd).sort((a, b) => a - b);
  const sdCut = sdSorted.length ? sdSorted[Math.floor(sdSorted.length * 0.9)] : Infinity;
  const nextByCik = new Map();
  U.forEach((u, i) => { if (u.cik) { if (!nextByCik.has(u.cik)) nextByCik.set(u.cik, []); nextByCik.get(u.cik).push({ i, ticker: u.ticker, start: u.firstBar || u.listing.startDate, end: u.listing.endDate }); } });
  const symbolChange = (i) => { const u = U[i]; if (!u.cik || !u.listing.endDate) return false; return (nextByCik.get(u.cik) || []).some((x) => x.i !== i && x.ticker !== u.ticker && x.start > u.listing.endDate && x.start <= addDays(u.listing.endDate, 30)); };
  const CAT = {
    NORMAL: (r) => r.f.n >= 250,
    VOLATILE: (r) => r.f.medianClose >= 1 && r.f.n >= 250 && r.f.sd >= sdCut,
    HIGH_BETA_MOVE: (r) => r.f.highBeta,
    PENNY: (r) => r.f.medianClose !== null && r.f.medianClose < 1,
    HIGH_NOMINAL: (r) => r.f.maxClose >= 1000,
    FORWARD_SPLIT: (r) => r.f.providerForwardSplit,
    STALE: (r) => r.f.maxStaleRun >= 10,
    MERGER: (r) => U[r.i].delisted && ['ACQUISITION', 'MERGER_FORM'].includes(U[r.i].delistClass),
    BANKRUPTCY_DISTRESS: (r) => U[r.i].delisted && U[r.i].delistClass === 'DEREGISTRATION_WITH_DISTRESS',
    SYMBOL_CHANGE: (r) => symbolChange(r.i)
  };
  const control = {}, controlIdx = new Map();
  for (const [k, fn] of Object.entries(CAT)) {
    const pool = eligible.filter(fn).sort((a, b) => (rank(U[a.i].id) < rank(U[b.i].id) ? -1 : 1));
    control[k] = { pool: pool.length, members: pool.slice(0, PROTOCOL.selection.perCategory).map((r) => r.i) };
    control[k].members.forEach((i) => { if (!controlIdx.has(i)) controlIdx.set(i, []); controlIdx.get(i).push(k); });
  }

  const M = { segments: 0, bars: 0, validBars: { main_1_0_0_wholeSeries: 0, pr721_1_2_0_wholeSeries: 0, v4_1_2_0_prefix: 0, v2_withoutSec: 0, v2: 0 },
    histories: { wholeSeriesRejected_1_2_0: 0, ofThoseRetainedAsPrefix_v2: 0, retainedBarsFromRejectedHistories_v2: 0, wholeSeriesRejected_1_0_0: 0, ofThoseRetainedAsPrefix_v2_vs_main: 0, retainedBarsFromRejectedHistories_v2_vs_main: 0 },
    v2States: {}, holdsByEvidenceClass: {}, holdsByReason: {}, quarantineByReason: {}, evidenceByClass: {}, evidenceByReason: {}, normalizedEvents: 0, normalizedSegments: 0, invalidBars: 0,
    barsNewlyHeld_v2_vs_main: 0, unresolved10xInsideValid: { UP: 0, DOWN: 0, total: 0, normalizedBySec: 0 },
    providerAgreement: { secEffectiveMatchedToProviderFactor: 0, secEffectiveConflictingProviderFactor: 0, secEffectiveNormalizedProviderMissing: 0, secEffectiveNotObserved: 0, secEffectiveOutsideSeries: 0, secEffectiveUndatedOrPeriodicOnly: 0, secEffectiveSmallRatioUncorroborated: 0 },
    extractorVsProvider: { providerSplitsSince2002WithCik: 0, foundDated: 0, foundUndated: 0, missed: 0 },
    pit: { mismatchKinds: {}, segmentsChecked: 0, viewsChecked: 0, barsAfterAsOf: 0, holdObservedAfterAsOf: 0, evidenceVisibleNotBeforeAsOf: 0, returnMismatchOutsideRevisions: 0, revisionsHold: 0, revisionsUnadjusted: 0, invalidRangesObservedNextSession: 0 },
    secCoverage: { segmentsWithCik: 0, segmentsWithSecEvents: 0, segmentsWithEffectiveEvents: 0 } };
  const holdLabels = { TRUE_POSITIVE: 0, FALSE_POSITIVE: 0, UNLABELED: 0, byClass: {} }, normLabels = { TRUE_POSITIVE: 0, FALSE_POSITIVE: 0, UNLABELED: 0, sharesNone: 0 };
  const fnEvents = { total: 0, evaluable: 0, handled: 0, held: 0, falseNegatives: 0, inSample: { evaluable: 0, falseNegatives: 0 }, outOfSample: { evaluable: 0, falseNegatives: 0 }, forwardReported: 0 };
  const privCases = [], privHigh = [], privControl = [], privHolds = [], privFn = [], privPit = [];
  for (const r of scanRows) {
    if (r.missing) continue;
    const u = U[r.i], bars = JSON.parse(zlib.gunzipSync(fs.readFileSync(rawFile(o, r.i))).toString('utf8'));
    const secRow = u.cik ? secByCik[u.cik] : null, secEvents = secRow ? secRow.events : [];
    M.segments++; M.bars += bars.length;
    if (u.cik) M.secCoverage.segmentsWithCik++;
    if (secEvents.length) M.secCoverage.segmentsWithSecEvents++;
    if (secEvents.some((e) => e.stage === 'EFFECTIVE')) M.secCoverage.segmentsWithEffectiveEvents++;
    const opts = { identity: CONFIRMED, delisted: u.delisted, secEvents, shares: u.shares, cik: u.cik, cikBasis: u.cikStatus };
    const v2 = secEvents.length || (r.v0.hold && u.shares.length) ? PV.build(bars, opts) : null;
    const c2 = v2 ? compact(v2) : r.v0;
    const c10 = CTR10.reconstruct(bars, { identity: CONFIRMED, delisted: u.delisted });
    M.validBars.main_1_0_0_wholeSeries += c10.reconstructed ? bars.length : 0;
    M.validBars.pr721_1_2_0_wholeSeries += r.whole12 ? bars.length : 0;
    M.validBars.v4_1_2_0_prefix += r.whole12 ? bars.length : r.pref12 ? r.pref12.index : 0;
    M.validBars.v2_withoutSec += r.v0.validBars;
    M.validBars.v2 += c2.validBars;
    if (!r.whole12) { M.histories.wholeSeriesRejected_1_2_0++; if (c2.validBars > 0) { M.histories.ofThoseRetainedAsPrefix_v2++; M.histories.retainedBarsFromRejectedHistories_v2 += c2.validBars; } }
    if (!c10.reconstructed) { M.histories.wholeSeriesRejected_1_0_0++; if (c2.validBars > 0) { M.histories.ofThoseRetainedAsPrefix_v2_vs_main++; M.histories.retainedBarsFromRejectedHistories_v2_vs_main += c2.validBars; } }
    if (c10.reconstructed) M.barsNewlyHeld_v2_vs_main += Math.max(0, bars.length - c2.validBars - c2.invalid.length);
    inc(M.v2States, c2.state);
    if (c2.hold) { inc(c2.hold.state === 'HOLD' ? M.holdsByReason : M.quarantineByReason, c2.hold.reason); if (c2.hold.evidenceClass) inc(M.holdsByEvidenceClass, c2.hold.evidenceClass); }
    M.invalidBars += c2.invalid.length;
    let norm = 0;
    for (const e of c2.evidence) {
      inc(M.evidenceByClass, e.class); inc(M.evidenceByReason, e.reason);
      if (e.outcome === 'NORMALIZE') norm++;
      if (e.reason === 'PROVIDER_FACTOR_MATCHES_SEC') M.providerAgreement.secEffectiveMatchedToProviderFactor++;
      else if (e.reason === 'PROVIDER_FACTOR_DIFFERS_FROM_SEC') M.providerAgreement.secEffectiveConflictingProviderFactor++;
      else if (e.reason === 'SEC_EFFECTIVE_AND_PRICE_CONCORDANT_PROVIDER_MISSING') M.providerAgreement.secEffectiveNormalizedProviderMissing++;
      else if (e.reason === 'SEC_EVENT_NOT_OBSERVED_IN_PRICE') M.providerAgreement.secEffectiveNotObserved++;
      else if (/OUTSIDE_SERIES|AFTER_LAST_BAR/.test(e.reason)) M.providerAgreement.secEffectiveOutsideSeries++;
      else if (/UNDATED|PERIODIC_ONLY/.test(e.reason)) M.providerAgreement.secEffectiveUndatedOrPeriodicOnly++;
      else if (/SMALL_RATIO/.test(e.reason)) M.providerAgreement.secEffectiveSmallRatioUncorroborated++;
    }
    M.normalizedEvents += norm; if (norm) M.normalizedSegments++;
    /* extractor recall against the independent provider factor (another vendor's record of the same event) */
    if (u.cik) for (const ps of r.f.providerSplits) {
      if (ps.date < '2002-01-01' || Math.abs(Math.log(ps.factor)) < Math.log(1.5)) continue;
      M.extractorVsProvider.providerSplitsSince2002WithCik++;
      const same = secEvents.filter((e) => e.stage === 'EFFECTIVE' && Math.abs(Math.log(e.ratio) - Math.log(ps.factor)) <= Math.log(1.01));
      if (same.some((e) => { const x = e.marketDate || e.effectiveDate; return x && Math.abs(Date.parse(x) - Date.parse(ps.date)) <= 7 * 864e5; })) M.extractorVsProvider.foundDated++;
      else if (same.some((e) => !(e.marketDate || e.effectiveDate) && Math.abs(Date.parse(e.visibleAt) - Date.parse(ps.date)) <= 400 * 864e5)) M.extractorVsProvider.foundUndated++;
      else M.extractorVsProvider.missed++;
    }
    /* unresolved >= 10x overnight moves inside the v2 valid range (no provider event, not normalized) */
    const normDates = new Set(c2.evidence.filter((e) => e.outcome === 'NORMALIZE').map((e) => e.eventDate));
    for (const j of r.f.jumps10) {
      if (!c2.validUntil || j.date > c2.validUntil || j.date <= c2.validFrom || c2.invalid.some((x) => x.from === j.date)) continue;
      if (normDates.has(j.date)) { M.unresolved10xInsideValid.normalizedBySec++; continue; }
      M.unresolved10xInsideValid[j.dir]++; M.unresolved10xInsideValid.total++;
    }
    /* PIT consistency on real data: as-of views around every hold, normalization and invalid bar */
    if (v2 && (v2.hold || v2.invalidRanges.length || norm) && M.pit.segmentsChecked < 600) {
      M.pit.segmentsChecked++;
      const hist = PV.pitHistory(bars, opts, v2);
      for (const h of hist) { if (h.state === 'HOLD') M.pit.revisionsHold++; else if (h.state === 'PIT_REVISION') M.pit.revisionsUnadjusted++; else if (h.state === 'INVALID_RANGE' && h.observedAt > h.from) M.pit.invalidRangesObservedNextSession++; }
      const dates = bars.map((b) => b.date), prevOf = (d) => { const k = dates.findIndex((x) => x >= d); return k > 0 ? dates[k - 1] : null; };
      const asOfs = new Set();
      if (v2.hold) [prevOf(v2.hold.from), v2.hold.from, v2.hold.observedAt].forEach((d) => d && asOfs.add(d));
      for (const e of v2.evidence) if (e.outcome === 'NORMALIZE' && e.eventDate) [prevOf(e.eventDate), e.eventDate, e.visibleAt, e.observedAt].forEach((d) => d && d >= dates[1] && asOfs.add(d));
      for (const x of v2.invalidRanges) [x.from, x.observedAt].forEach((d) => d && asOfs.add(d));
      /* a later SEC filing legitimately revises the event-day return (pitHistory); nothing else may differ */
      const revised = (d, asOf) => hist.some((h) => (h.state === 'HOLD' || h.state === 'PIT_REVISION') && d === h.from && asOf <= h.until);
      const fin = PV.alignTr(v2, dates);
      for (const asOf of asOfs) {
        const view = PV.build(bars, { ...opts, asOf }); M.pit.viewsChecked++;
        if (view.last && view.last > asOf) M.pit.barsAfterAsOf++;
        if (view.hold && view.hold.observedAt > asOf) M.pit.holdObservedAfterAsOf++;
        if (view.evidence.some((e) => e.outcome === 'NORMALIZE' && e.visibleAt && e.visibleAt >= asOf)) M.pit.evidenceVisibleNotBeforeAsOf++;
        const vt = PV.alignTr(view, dates);
        for (let k = 1; k < dates.length && dates[k] <= asOf; k++) {
          if (!(vt[k] > 0 && vt[k - 1] > 0 && fin[k] > 0 && fin[k - 1] > 0)) continue;
          if (Math.abs((vt[k] / vt[k - 1]) / (fin[k] / fin[k - 1]) - 1) > 1e-9 && !revised(dates[k], asOf)) {
            M.pit.returnMismatchOutsideRevisions++;
            /* diagnostic only (no rule depends on it): what differs between the as-of view and the final view */
            const nearNorm = v2.evidence.find((e) => e.outcome === 'NORMALIZE' && e.eventDate && Math.abs(Date.parse(e.eventDate) - Date.parse(dates[k])) <= 7 * 864e5);
            const viewNorm = view.evidence.find((e) => e.outcome === 'NORMALIZE' && e.eventDate && Math.abs(Date.parse(e.eventDate) - Date.parse(dates[k])) <= 7 * 864e5);
            const nearInv = v2.invalidRanges.find((x) => Math.abs(Date.parse(x.from) - Date.parse(dates[k])) <= 7 * 864e5);
            const kind = nearNorm && viewNorm && nearNorm.eventDate !== viewNorm.eventDate ? 'NORMALIZATION_DAY_MOVES_WITH_LATER_BARS' : nearNorm && !viewNorm ? 'NORMALIZATION_NOT_YET_IN_VIEW' : nearInv ? 'NEAR_INVALID_RANGE' : 'OTHER';
            inc(M.pit.mismatchKinds, kind);
            privPit.push({ segmentId: u.id, date: dates[k], asOf, kind, finalRet: r4(fin[k] / fin[k - 1]), viewRet: r4(vt[k] / vt[k - 1]), finalEvent: nearNorm ? { eventDate: nearNorm.eventDate, visibleAt: nearNorm.visibleAt, observedAt: nearNorm.observedAt } : null, viewEvent: viewNorm ? { eventDate: viewNorm.eventDate, visibleAt: viewNorm.visibleAt } : null });
            break;
          }
        }
      }
    }
    /* independent labels for every price-based hold and every normalization (whole universe) */
    const interventions = [];
    if (c2.hold && PRICE_HOLD_CLASSES.has(c2.hold.evidenceClass)) { const he = c2.evidence.find((e) => e.eventDate === c2.hold.from && PRICE_HOLD_CLASSES.has(e.class)); interventions.push({ kind: 'HOLD', date: c2.hold.from, class: c2.hold.evidenceClass, ratio: he ? he.ratio : null }); }
    for (const e of c2.evidence) if (e.outcome === 'NORMALIZE') interventions.push({ kind: 'NORMALIZE', date: e.eventDate, class: e.class, ratio: e.ratio });
    for (const it of interventions) {
      it.label = labelIntervention(it, u, secRow, bars);
      if (it.kind === 'HOLD') { holdLabels[it.label]++; inc(holdLabels.byClass, it.class + ':' + it.label); }
      else { normLabels[it.label]++; if (it.shares === 'NONE') normLabels.sharesNone++; }
    }
    if (c2.hold) privHolds.push({ segmentId: u.id, ticker: u.ticker, cik: u.cik, hold: c2.hold, v0Hold: r.v0.hold, labels: interventions });
    /* false negatives: share-count events (SEC XBRL, independent of price and of the 8-K text), whole universe */
    const sh = (u.shares || []).filter((s) => finite(s.value) && s.value > 0).map((s) => ({ at: String(s.periodEnd || s.availableAt).slice(0, 10), value: s.value })).sort((a, b) => (a.at < b.at ? -1 : 1));
    for (let k = 1; k < sh.length; k++) {
      const a = sh[k - 1], b = sh[k], sr = b.value / a.value;
      if (b.at <= a.at || b.at > addDays(a.at, 200) || a.at < bars[0].date || b.at > bars[bars.length - 1].date) continue;
      if (sr >= 3) { fnEvents.forwardReported++; continue; }
      if (sr > 1 / 3) continue;
      fnEvents.total++;
      const ins = inSample.has(u.id);
      const win = bars.map((x, idx) => idx).filter((idx) => idx > 0 && bars[idx].date > a.at && bars[idx].date <= b.at);
      if (!win.length) continue;
      const heldIn = c2.hold && c2.hold.from > a.at && c2.hold.from <= b.at;
      const trA = v2 ? PV.alignTr(v2, bars.map((x) => x.date)) : null;
      let fn = false;
      if (c2.validUntil) {
        const fin = trA || PV.alignTr(PV.build(bars, opts), bars.map((x) => x.date));
        for (const idx of win) { if (bars[idx].date > c2.validUntil) break; const g = fin[idx] / fin[idx - 1]; if (g > 0 && Math.log(g) >= Math.abs(Math.log(sr)) / 2) { fn = true; break; } }
      }
      const status = fn ? 'FALSE_NEGATIVE' : heldIn ? 'HELD' : 'HANDLED';
      fnEvents.evaluable++; if (fn) fnEvents.falseNegatives++; else if (heldIn) fnEvents.held++; else fnEvents.handled++;
      const grp = ins ? fnEvents.inSample : fnEvents.outOfSample; grp.evaluable++; if (fn) grp.falseNegatives++;
      privFn.push({ segmentId: u.id, from: a.at, to: b.at, sharesRatio: r4(sr), status, inSample: ins });
    }
    /* regression rows (private) */
    const cases = extremeById.get(u.id) || [];
    if (cases.length || highIds.has(u.id)) {
      const vv = v2 || PV.build(bars, opts);
      const at = (d) => { let best = -1; for (let k = 0; k < vv.dates.length; k++) { if (vv.dates[k] <= d) best = k; else break; } return best; };
      for (const c of cases) {
        const inValid = vv.validUntil && c.E <= vv.validUntil && c.F >= vv.validFrom && !vv.invalidRanges.some((x) => x.from > c.F && x.from <= c.E);
        const a = at(c.F), b = at(c.E);
        const ret = inValid && a >= 0 && b >= 0 ? vv.tr[b] / vv.tr[a] - 1 : null;
        const normalizedInMonth = vv.evidence.filter((e) => e.outcome === 'NORMALIZE' && e.eventDate > c.F && e.eventDate <= c.E).map((e) => ({ class: e.class, ratio: e.ratio, eventDate: e.eventDate, visibleAt: e.visibleAt }));
        const heldBy = !inValid ? (vv.hold && vv.hold.from <= c.E ? { from: vv.hold.from, reason: vv.hold.reason, evidenceClass: vv.hold.evidenceClass } : vv.invalidRanges.some((x) => x.from > c.F && x.from <= c.E) ? { reason: 'INVALID_RANGE' } : null) : null;
        privCases.push({ key: `${u.id}|${c.month}`, in83: c.in83, v4Class: c.cls, v4Ret: c.ret, v2: { inValidRange: !!inValid, ret: r4(ret), stillExtreme: ret !== null && (ret > 1 || ret < -0.99), normalizedInMonth, heldBy } });
      }
      if (highIds.has(u.id)) privHigh.push({ segmentId: u.id, v2: { state: vv.state, validFrom: vv.validFrom, validUntil: vv.validUntil, hold: vv.hold ? { from: vv.hold.from, reason: vv.hold.reason, evidenceClass: vv.hold.evidenceClass } : null,
        normalized: vv.evidence.filter((e) => e.outcome === 'NORMALIZE').map((e) => ({ eventDate: e.eventDate, ratio: e.ratio, class: e.class })), invalidRanges: vv.invalidRanges.map((x) => x.from),
        declaredSplits: r.f.providerSplits } });
    }
    /* control categories */
    const cats = controlIdx.get(r.i);
    if (cats) privControl.push({ segmentId: u.id, cik: u.cik, bars: bars.length, categories: cats, interventions: interventions.map((x) => ({ ...x })) });
    if (M.segments % 1000 === 0) process.stdout.write(`[evaluate] ${M.segments}\n`);
  }
  /* tallies (protocol 2.0.0) */
  const P = PROTOCOL.acceptance;
  const ctl = { protocol: 'CONTROL-SET-PROTOCOL-V2.json', protocolVersion: PROTOCOL.version, protocolSha256: sha(fs.readFileSync(path.join(ROOT, 'docs/data-quality/corporate-action-v2/CONTROL-SET-PROTOCOL-V2.json'))),
    inSampleExcluded: inSample.size, eligible: eligible.length, volatileSdCut: sdCut, categories: {} };
  for (const k of Object.keys(CAT)) {
    const rows = privControl.filter((x) => x.categories.includes(k));
    const labelled = rows.filter((x) => x.cik), all = rows.flatMap((x) => x.interventions);
    const fpSeg = rows.filter((x) => x.interventions.some((i) => i.label === 'FALSE_POSITIVE')).length;
    ctl.categories[k] = { pool: control[k].pool, sampled: rows.length, withCik: labelled.length, bars: rows.reduce((a, x) => a + x.bars, 0),
      segmentsWithIntervention: rows.filter((x) => x.interventions.length).length, interventions: all.length,
      labels: all.reduce((a, i) => inc(a, i.kind + ':' + i.label), {}),
      falsePositiveSegments: fpSeg, falsePositiveRate: labelled.length ? r4(fpSeg / labelled.length) : null, wilson95: wilson(fpSeg, labelled.length),
      interventionsPer10kBars: rows.length ? r4(all.length / (rows.reduce((a, x) => a + x.bars, 0) / 1e4)) : null };
  }
  const uniq = new Map(); privControl.forEach((x) => uniq.set(x.segmentId, x));
  const uLab = [...uniq.values()].filter((x) => x.cik), uFp = uLab.filter((x) => x.interventions.some((i) => i.label === 'FALSE_POSITIVE')).length;
  ctl.pooled = { distinctSegments: uniq.size, withCik: uLab.length, falsePositiveSegments: uFp, falsePositiveRate: uLab.length ? r4(uFp / uLab.length) : null, wilson95: wilson(uFp, uLab.length) };
  const hl = holdLabels.TRUE_POSITIVE + holdLabels.FALSE_POSITIVE, nl = normLabels.TRUE_POSITIVE + normLabels.FALSE_POSITIVE;
  ctl.holdPrecision = { ...holdLabels, labelled: hl, precision: hl ? r4(holdLabels.TRUE_POSITIVE / hl) : null, wilson95FalseShare: wilson(holdLabels.FALSE_POSITIVE, hl) };
  ctl.normalizePrecision = { ...normLabels, labelled: nl, falseShare: nl ? r4(normLabels.FALSE_POSITIVE / nl) : null, wilson95FalseShare: wilson(normLabels.FALSE_POSITIVE, nl) };
  ctl.falseNegatives = { ...fnEvents, falseNegativeRate: fnEvents.evaluable ? r4(fnEvents.falseNegatives / fnEvents.evaluable) : null, wilson95: wilson(fnEvents.falseNegatives, fnEvents.evaluable),
    heldShare: fnEvents.evaluable ? r4(fnEvents.held / fnEvents.evaluable) : null };
  ctl.secCollection = { complete: secAll.stats?.complete === true, incompleteWindows: (secAll.stats?.incompleteWindows || []).length, documentErrors: secAll.stats?.documentErrors ?? null, documentsSkippedByCap: secAll.stats?.documentsSkippedByCap ?? null };
  ctl.pit = M.pit;
  const pitClean = M.pit.barsAfterAsOf === 0 && M.pit.holdObservedAfterAsOf === 0 && M.pit.evidenceVisibleNotBeforeAsOf === 0 && M.pit.returnMismatchOutsideRevisions === 0;
  const perCatOk = Object.values(ctl.categories).every((c) => c.falsePositiveRate === null || c.falsePositiveRate <= P.falsePositiveRatePerCategory);
  ctl.acceptance = {
    secCollectionComplete: { pass: ctl.secCollection.complete },
    controlFalsePositiveRatePooled: { value: ctl.pooled.falsePositiveRate, threshold: P.falsePositiveRatePooled, pass: ctl.pooled.falsePositiveRate !== null && ctl.pooled.falsePositiveRate <= P.falsePositiveRatePooled },
    controlFalsePositiveRatePerCategory: { threshold: P.falsePositiveRatePerCategory, pass: perCatOk },
    holdPrecision: { value: ctl.holdPrecision.precision, threshold: P.holdPrecisionMin, pass: ctl.holdPrecision.precision !== null && ctl.holdPrecision.precision >= P.holdPrecisionMin },
    normalizeFalseShare: { value: ctl.normalizePrecision.falseShare, threshold: P.normalizeFalseShareMax, pass: ctl.normalizePrecision.falseShare !== null && ctl.normalizePrecision.falseShare <= P.normalizeFalseShareMax },
    falseNegativeRate: { value: ctl.falseNegatives.falseNegativeRate, threshold: P.falseNegativeRateMax, pass: ctl.falseNegatives.falseNegativeRate !== null && ctl.falseNegatives.falseNegativeRate <= P.falseNegativeRateMax },
    pitConsistency: { pass: pitClean, views: M.pit.viewsChecked } };
  ctl.acceptance.pass = Object.values(ctl.acceptance).every((x) => x.pass === true);

  const reg = (rows) => ({ total: rows.length, inValidRange: rows.filter((x) => x.v2.inValidRange).length, stillExtreme: rows.filter((x) => x.v2.stillExtreme).length,
    held: rows.filter((x) => x.v2.heldBy).length, normalizedInMonth: rows.filter((x) => x.v2.normalizedInMonth.length).length });
  const pubAudit = { schema: 'corporate-action-v2-audit-1.1.0', ...runMeta(), versions: versions(), capture: { dataFingerprint: binding.dataFingerprint, securities: binding.securities },
    sec: { collector: secAll.collector, extractor: secAll.extractor, from: secAll.from, to: secAll.to, stats: { ...secAll.stats, incompleteWindows: (secAll.stats?.incompleteWindows || []).length }, ciksWithEvents: Object.keys(secByCik).length,
      events: Object.values(secByCik).reduce((a, r) => a + (r.events || []).length, 0), effectiveEvents: Object.values(secByCik).reduce((a, r) => a + (r.events || []).filter((e) => e.stage === 'EFFECTIVE').length, 0),
      eventsByStage: Object.values(secByCik).flatMap((r) => r.events || []).reduce((a, e) => inc(a, e.stage), {}), eventsByConfidence: Object.values(secByCik).flatMap((r) => r.events || []).reduce((a, e) => inc(a, e.confidence), {}),
      sha256: sha(fs.readFileSync(o.sec)) },
    impact: M, regression: { extremeAll: reg(privCases), known83: reg(privCases.filter((x) => x.in83)), highLevel: { total: privHigh.length, fullValid: privHigh.filter((h) => h.v2.state === 'FULL_VALID').length,
      validPrefix: privHigh.filter((h) => h.v2.state === 'VALID_PREFIX').length, withNormalization: privHigh.filter((h) => h.v2.normalized.length).length } },
    performanceCalculated: false, calibrationRun: false };
  const pubControl = { schema: 'corporate-action-v2-control-results-2.0.0', ...runMeta(), versions: versions(), ...ctl, performanceCalculated: false, calibrationRun: false };
  writeJson(path.join(o['public-dir'], 'CORPORATE-ACTION-V2-AUDIT.json'), pubAudit, true);
  writeJson(path.join(o['public-dir'], 'INDEPENDENT-DATA-CONTROL-SET-V2.results.json'), pubControl, true);
  writeJson(path.join(o.private, 'evaluate.json'), { cases: privCases, high: privHigh, control: privControl, holds: privHolds, fn: privFn, pit: privPit, sec: secByCik, controlMembers: control });
  process.stdout.write(JSON.stringify({ impact: { validBars: M.validBars, histories: M.histories, holdsByEvidenceClass: M.holdsByEvidenceClass }, acceptance: ctl.acceptance }) + '\n');
}

/* ------------------------------------------------------------------ seal */
async function seal(o) {
  const { encryptForOwner } = await import(pathToFileURL(path.join(o['base-root'], 'scripts/supertrader/validation/lib.mjs')).href);
  const parts = {};
  for (const f of ['population.json', 'evaluate.json']) if (fs.existsSync(path.join(o.private, f))) parts[f.replace('.json', '')] = readJson(path.join(o.private, f));
  const bytes = zlib.gzipSync(Buffer.from(JSON.stringify(parts)));
  fs.mkdirSync(o['sealed-dir'], { recursive: true });
  const env = [['owner', o['owner-key']], ['session', o['session-key']]].map(([aud, k]) => {
    const f = path.join(o['sealed-dir'], `CORPORATE-ACTION-V2-PRIVATE.${aud}.sealed.json`), s = encryptForOwner(fs.readFileSync(k, 'utf8'), bytes);
    fs.writeFileSync(f, s); return { audience: aud, file: path.basename(f), sha256: sha(Buffer.from(s)) };
  });
  writeJson(o.public, { schema: 'corporate-action-v2-sealed-1.0.0', encoding: 'gzip(JSON)', plaintextSha256: sha(bytes), plaintextBytes: bytes.length, envelopes: env }, true);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = args(process.argv.slice(2));
  const run = { prepare, scan, evaluate, seal }[o.stage];
  if (!run) throw new Error('STAGE_REQUIRED');
  run(o).catch((e) => { process.stderr.write(JSON.stringify({ phase: 'CORPORATE_ACTION_V2_AUDIT', stage: o.stage, code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'PRIVATE_RUN_FAILURE', hint: /^[A-Za-z0-9 ,.:'()_\-/]{1,160}$/.test(e.message) ? e.message : null, stack: (e.stack || '').split('\n').slice(1, 6).map((l) => l.replace(/\(.*\/(scripts|quant)\//, '($1/')).join(' | ') }) + '\n'); process.exitCode = 1; });
}
export { features, compact, sharesAcross, sharesLabel, labelIntervention };
