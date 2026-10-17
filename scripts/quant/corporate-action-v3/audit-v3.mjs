#!/usr/bin/env node
/**
 * Canonical corporate-action protocol 3.0.0 audit inside the protected Actions runner. Data quality only:
 * no performance, no calibration, no strategy, no change of source acceptance rules.
 *
 * Stages
 *   prepare   canonical capture of the pinned #705 pipeline (V4 freeze content): universe, V4 population keys, the
 *             74 adjusted-level > 1e6 securities with their #721 forensic cause and defect days (D2 regression input),
 *             the 83 diagnostic cases with their canonical bars (regression input), CIKs, vendor ticker windows.
 *   scan      raw store re-read of every segment (read-only, cached privately), 1.2.0 whole-series verdict, features.
 *   select    BLINDED control set: categories from independent data only (raw price features, second vendor, FINRA,
 *             SEC), excluding the known V4 cases and the v2 control members; the member list and the independent
 *             event population are hashed into the public SELECT file before any v3 result exists.
 *   evaluate  canonical-price-validity-3.0.0 (SEC + FINRA + semantics) and 2.2.0 (v2 checkout) for every segment;
 *             independent PIT oracle; course-only hold FP/FN; downward jumps; D2 and 83 regression; extreme-move
 *             classification; blinded control results; acceptance against CORPORATE-ACTION-PROTOCOL-V3.json.
 *   seal      private results sealed to the owner and the v3 session key.
 *
 * Usage:
 *   node audit-v3.mjs --stage prepare  --base-root <#705> --capture <dir> --private <dir> --public <file>
 *   node audit-v3.mjs --stage scan     --base-root <#705> --private <dir> --public <file>
 *   node audit-v3.mjs --stage select   --private <dir> --sec <events> --finra <rows> --vendor <ndjson.gz> --v2-root <v2 checkout> --public <file>
 *   node audit-v3.mjs --stage evaluate --base-root <#705> --v2-root <v2> --private <dir> --sec <events> --finra <rows> --vendor <ndjson.gz> --acceptance <json> --public-dir <dir>
 *   node audit-v3.mjs --stage seal     --base-root <#705> --private <dir> --owner-key <pem> --session-key <pem> --sealed-dir <dir> --public <file>
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
const FDL = require(path.join(ROOT, 'quant/engines/finra-daily-list.js'));
const DS = require(path.join(ROOT, 'quant/engines/discontinuity-semantics.js'));
const PI = require(path.join(ROOT, 'quant/engines/price-integrity.js'));
const A = await import(pathToFileURL(path.join(ROOT, 'scripts/quant/price-integrity-audit.mjs')).href);
const V2A = await import(pathToFileURL(path.join(ROOT, 'scripts/quant/corporate-action-v2/audit-v2.mjs')).href);
const L = await import(pathToFileURL(path.join(HERE, 'labels.mjs')).href);
const VC = await import(pathToFileURL(path.join(HERE, 'vendor-collect.mjs')).href);
const PROTOCOL_FILE = path.join(ROOT, 'docs/data-quality/corporate-action-v3/CORPORATE-ACTION-PROTOCOL-V3.json');
const PROTOCOL = JSON.parse(fs.readFileSync(PROTOCOL_FILE, 'utf8'));
const PROTOCOL_V2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/data-quality/corporate-action-v2/CONTROL-SET-PROTOCOL-V2.json'), 'utf8'));

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; return o; };
const r4 = (x) => (finite(x) ? Math.round(x * 1e4) / 1e4 : null);
const CONFIRMED = { state: 'CONFIRMED', basis: 'EXISTING_LISTING_TABLE_AND_DATE_WINDOW' };
const args = (argv) => { const o = {}; for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1]; return o; };
const addDays = (d, n) => new Date(Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const wilson = (k, n) => { if (!n) return null; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [r4((c - m) / d), r4((c + m) / d)]; };
const hasSplit = (b) => finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9;
const writeJson = (f, o, pretty) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, pretty ? 2 : 0) + (pretty ? '\n' : ''), { mode: 0o600 }); };
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const rawFile = (o, i) => path.join(o.private, 'raw', `${i}.json.gz`);
const readRaw = (o, i) => JSON.parse(zlib.gunzipSync(fs.readFileSync(rawFile(o, i))).toString('utf8'));
const runMeta = () => ({ runId: process.env.GITHUB_RUN_ID ?? null, codeCommit: process.env.GITHUB_SHA ?? null, protocol: PROTOCOL.version, protocolSha256: sha(fs.readFileSync(PROTOCOL_FILE)) });
const versions = () => ({ validity: PV.VERSION, corporateActions: CAV.CONTRACT, validation: CAV.VERSION, semantics: DS.VERSION, finra: FDL.VERSION, secExtractor: SEC.VERSION, totalReturn: CTR.VERSION, labels: L.LABELS_VERSION });
const NO = { performanceCalculated: false, calibrationRun: false };

/* ------------------------------------------------------------------ prepare */
async function prepare(o) {
  const P = await A.loadPipeline(o['base-root']);
  const before = A.loadPrepared(P, o.capture);
  const binding = P.cap.computeContentBinding(o.capture), frozen = P.freeze.dataContract.canonicalCapture;
  const sameAsV4 = ['normalizedPartListSha256', 'normalizedManifestSha256', 'dataFingerprint'].every((k) => binding[k] === frozen[k]);
  const ext = A.extremeMonths(P, before.data);
  const names = new Map();
  try { for (const r of readJson(path.join(o['base-root'], 'quant/data/market/security-master/company-names.json')).rows || []) if (r.ticker && r.companyName) names.set(r.ticker, r.companyName); } catch { /* names optional */ }
  const preparedById = new Map(before.prepared.securities.map((s) => [s.id, s])), dataById = new Map(before.data.securities.map((s) => [s.id, s]));
  const sharesOf = (s) => (s.fundamentals || []).filter((f) => f.key === 'shares_outstanding' && finite(f.value)).map((f) => [f.availableAt, f.value]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  /* D2 input: the 74 adjusted-level > 1e6 securities, #721 forensic cause and the defect days on the canonical raw columns */
  const high = before.census.privateRows.map((h) => {
    const s = preparedById.get(h.id) ?? dataById.get(h.id), hx = s ? PI.explainHighLevel(s) : null, days = [];
    const bars = s?.bars || [];
    for (let j = 1; j < bars.length; j++) {
      const a = bars[j - 1], b = bars[j];
      if (!(a.rawClose > 0 && b.rawClose > 0)) continue;
      if (hasSplit(b)) { const g = b.splitFactor * b.rawClose / a.rawClose; if (Math.abs(Math.log(g)) >= Math.log(2)) days.push({ date: b.date, kind: 'DECLARED_SPLIT_INCONSISTENT', ratio: r4(g) }); }
      else if (Math.abs(Math.log(b.rawClose / a.rawClose)) >= Math.log(10)) days.push({ date: b.date, kind: 'UNDECLARED_JUMP_10X', ratio: r4(b.rawClose / a.rawClose) });
    }
    return { id: h.id, v4SanityClass: h.cls, cause: hx?.cause ?? null, defectDays: days };
  });
  /* 83 input: canonical bars and forensic context of every diagnostic case (explainMonth needs them with the raw store bars) */
  const in83 = ext.cases.filter((c) => c.diagnosticClass === 'UNDECLARED_RAW_JUMP_10X' || c.diagnosticClass === 'DECLARED_SPLIT_IN_MONTH').map((c) => {
    const s = dataById.get(c.id) ?? preparedById.get(c.id);
    return { id: c.id, month: c.month, F: c.F, E: c.E, ret: r4(c.ret), cls: c.diagnosticClass,
      canon: (s?.bars || []).map((b) => ({ date: b.date, totalReturnIndex: b.totalReturnIndex, splitFactor: b.splitFactor })),
      ctx: { shares: s ? sharesOf(s) : [], listing: { startDate: s?.listing?.startDate, endDate: s?.listing?.endDate, reusedLater: s?.listing?.reusedLater === true } } };
  });
  const population = { extreme: ext.cases.map((c) => ({ id: c.id, month: c.month, F: c.F, E: c.E, ret: r4(c.ret), cls: c.diagnosticClass, in83: c.diagnosticClass === 'UNDECLARED_RAW_JUMP_10X' || c.diagnosticClass === 'DECLARED_SPLIT_IN_MONTH' })),
    highIds: before.census.privateRows.map((h) => h.id), counts: ext.counts, byClass: ext.byClass };
  const universe = before.raw.securities.map((s) => ({
    id: s.id, ticker: s.ticker, securityId: s.securityId ?? null, listing: { id: s.listing?.id ?? null, startDate: s.listing?.startDate ?? null, endDate: s.listing?.endDate ?? null, reusedLater: s.listing?.reusedLater === true },
    sourceKey: s.priceSource?.sourceKey ?? null, firstBar: s.bars[0]?.date ?? null, cik: s.issuerCik ? String(s.issuerCik).padStart(10, '0') : null, cikStatus: s.issuerCikEvidence?.status ?? null,
    shares: (s.fundamentals || []).filter((f) => f.key === 'shares_outstanding' && finite(f.value)).map((f) => ({ periodEnd: f.periodEnd ?? null, availableAt: f.availableAt, value: f.value })),
    delisted: s.terminal?.kind === 'DELISTED', delistClass: s.terminal?.delistClass ?? null,
    name: !s.listing?.endDate ? names.get(s.ticker) ?? null : null }));
  const ciks = {};
  for (const u of universe) {
    if (!u.cik) continue;
    const c = ciks[u.cik] || (ciks[u.cik] = { tickers: [], windows: [] });
    if (!c.tickers.includes(u.ticker)) c.tickers.push(u.ticker);
    c.windows.push([u.firstBar || u.listing.startDate, u.listing.endDate]);
  }
  writeJson(path.join(o.private, 'universe.json'), { binding, sameAsV4, universe });
  writeJson(path.join(o.private, 'population.json'), population);
  writeJson(path.join(o.private, 'regression-input.json'), { high, in83 });
  writeJson(path.join(o.private, 'ciks.json'), ciks);
  writeJson(path.join(o.private, 'vendor-tickers.json'), universe.map((u) => ({ ticker: u.ticker, from: u.firstBar || u.listing.startDate, to: u.listing.endDate })));
  const pub = { schema: 'corporate-action-v3-prepare-1.0.0', ...runMeta(), capture: { dataFingerprint: binding.dataFingerprint, normalizedPartListSha256: binding.normalizedPartListSha256, securities: binding.securities, sameCanonicalContentAsV4Freeze: sameAsV4 },
    population: { extremeSecurityMonths: ext.cases.length, in83: in83.length, highLevel: high.length, highLevelByCause: high.reduce((a, h) => inc(a, h.cause ?? 'NONE'), {}), counts: ext.counts },
    universe: { segments: universe.length, withIssuerCik: universe.filter((u) => u.cik).length, distinctCiks: Object.keys(ciks).length, withName: universe.filter((u) => u.name).length, delisted: universe.filter((u) => u.delisted).length },
    regressionInputSha256: sha(fs.readFileSync(path.join(o.private, 'regression-input.json'))), ...NO };
  writeJson(o.public, pub, true);
  process.stdout.write(JSON.stringify(pub.universe) + '\n');
}

/* ------------------------------------------------------------------ scan */
async function scan(o) {
  const U = readJson(path.join(o.private, 'universe.json')).universe;
  const read = o['fake-store'] ? async (sec) => { const f = path.join(o['fake-store'], `${U.findIndex((x) => x.id === sec.id)}.json`); return fs.existsSync(f) ? readJson(f) : null; } : await A.rawReader(U.length);
  fs.mkdirSync(path.join(o.private, 'raw'), { recursive: true, mode: 0o700 });
  const rows = [], stats = { read: 0, missing: 0 }, reasons12 = {};
  for (let i = 0; i < U.length; i++) {
    const u = U[i];
    const store = await read({ ...u, priceSource: { sourceKey: u.sourceKey }, bars: [{ date: u.firstBar }] });
    if (!store) { stats.missing++; rows.push({ i, missing: true }); continue; }
    stats.read++;
    const last = u.listing.endDate || '9999-12-31';
    const bars = store.filter((b) => b.date >= u.firstBar && b.date <= last).map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      splitFactor: b.splitFactor ?? null, dividend: b.dividend ?? b.divCash ?? null, adjustedClose: b.adjustedClose ?? b.adjClose ?? null }));
    fs.writeFileSync(rawFile(o, i), zlib.gzipSync(JSON.stringify(bars)), { mode: 0o600 });
    const rec = (r) => CTR.reconstruct(r, { identity: CONFIRMED, delisted: u.delisted });
    const whole12 = rec(bars), pref12 = whole12.reconstructed ? null : PV.firstFailure(bars, rec);
    if (pref12) inc(reasons12, pref12.core.reason);
    rows.push({ i, bars: bars.length, whole12: whole12.reconstructed, pref12: pref12 ? { index: pref12.index, reason: pref12.core.reason } : null, f: V2A.features(bars) });
    if (i % 1000 === 0) process.stdout.write(`[scan] ${i}/${U.length}\n`);
  }
  writeJson(path.join(o.private, 'scan.json'), rows);
  const pub = { schema: 'corporate-action-v3-scan-1.0.0', ...runMeta(), rawReads: stats, segments: U.length, prefixReasons12: reasons12, ...NO };
  writeJson(o.public, pub, true);
  process.stdout.write(JSON.stringify(pub) + '\n');
}

/* ------------------------------------------------------------------ periodic (candidate CIKs for retrospective SEC statements, as v2) */
async function periodic(o) {
  const U = readJson(path.join(o.private, 'universe.json')).universe, rows = readJson(path.join(o.private, 'scan.json')), m = {};
  for (const r of rows) {
    if (r.missing || !U[r.i].cik) continue;
    const bars = r.pref12 && /^SPLIT_/.test(r.pref12.reason) ? readRaw(o, r.i) : null;
    const d = [...(bars && bars[r.pref12.index] ? [bars[r.pref12.index].date] : []), ...r.f.jumps10.map((j) => j.date)];
    if (d.length) (m[U[r.i].cik] = m[U[r.i].cik] || []).push(...d);
  }
  for (const k of Object.keys(m)) m[k] = [...new Set(m[k])].sort();
  writeJson(path.join(o.private, 'periodic-ciks.json'), m);
  process.stdout.write(`periodic ciks ${Object.keys(m).length}\n`);
}

/* ------------------------------------------------------------------ shared loaders */
function loadFinra(file) {
  const j = readJson(file), obs = j.rows.map(FDL.observation), bySym = new Map();
  for (const x of obs) for (const s of new Set([x.oldSymbol, x.newSymbol].filter(Boolean).map((t) => String(t).toUpperCase()))) { if (!bySym.has(s)) bySym.set(s, []); bySym.get(s).push(x); }
  return { meta: { collector: j.collector, fetchedAt: j.fetchedAt, stats: j.stats, windows: j.windows?.length ?? null }, bySym, rows: obs.length };
}
function loadVendor(file) {
  const m = new Map();
  if (!file || !fs.existsSync(file)) return { m, stats: null };
  for (const line of zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n')) { if (!line) continue; const t = line.slice(6, line.indexOf('"', 6)); m.set(t, line); }
  let stats = null; try { stats = readJson(file + '.stats.json'); } catch { /* optional */ }
  return { m, stats };
}
function finraFor(F, u) { return FDL.forListing(F.bySym.get(String(u.ticker).toUpperCase()) || [], { ticker: u.ticker, from: u.firstBar || u.listing.startDate, to: u.listing.endDate, name: u.name }); }
function vendorFor(V, u, bars) {
  const line = V.m.get(VC.yahooSymbol(u.ticker));
  const x = line ? JSON.parse(line) : null, vv = x ? L.vendorView(VC.decode(x)) : null;
  return { vv, ident: L.vendorIdentity(vv, bars), status: x ? x.status : 'NOT_COLLECTED' };
}
const rank = (seed, id) => sha(seed + '|' + id);

/* ------------------------------------------------------------------ select (blinded) */
async function select(o) {
  const { universe: U } = readJson(path.join(o.private, 'universe.json'));
  const scanRows = readJson(path.join(o.private, 'scan.json')), pop = readJson(path.join(o.private, 'population.json'));
  const secByCik = readJson(o.sec).ciks || {}, F = loadFinra(o.finra), V = loadVendor(o.vendor);
  /* in-sample exclusion exactly as protocol 2.0.0 */
  const inSample = new Set([...pop.extreme.map((c) => c.id), ...pop.highIds]);
  scanRows.forEach((r) => { if (!r.missing && r.pref12 && (r.pref12.reason === 'SPLIT_SUSPECTED_UNDECLARED' || r.pref12.reason === 'PRICE_SPIKE_REVERTED')) inSample.add(U[r.i].id); });
  const eligibleV2 = scanRows.filter((r) => !r.missing && !inSample.has(U[r.i].id));
  /* v2 control members, recomputed with the v2 seed and category rules (already seen: excluded from the v3 set) */
  const sdSortedV2 = eligibleV2.filter((r) => r.f.medianClose >= 1 && r.f.n >= 250).map((r) => r.f.sd).sort((a, b) => a - b);
  const sdCut = sdSortedV2.length ? sdSortedV2[Math.floor(sdSortedV2.length * 0.9)] : Infinity;
  const nextByCik = new Map();
  U.forEach((u, i) => { if (u.cik) { if (!nextByCik.has(u.cik)) nextByCik.set(u.cik, []); nextByCik.get(u.cik).push({ i, ticker: u.ticker, start: u.firstBar || u.listing.startDate, end: u.listing.endDate }); } });
  const symbolChangeCik = (i) => { const u = U[i]; if (!u.cik || !u.listing.endDate) return false; return (nextByCik.get(u.cik) || []).some((x) => x.i !== i && x.ticker !== u.ticker && x.start > u.listing.endDate && x.start <= addDays(u.listing.endDate, 30)); };
  const CAT2 = { NORMAL: (r) => r.f.n >= 250, VOLATILE: (r) => r.f.medianClose >= 1 && r.f.n >= 250 && r.f.sd >= sdCut, HIGH_BETA_MOVE: (r) => r.f.highBeta, PENNY: (r) => r.f.medianClose !== null && r.f.medianClose < 1,
    HIGH_NOMINAL: (r) => r.f.maxClose >= 1000, FORWARD_SPLIT: (r) => r.f.providerForwardSplit, STALE: (r) => r.f.maxStaleRun >= 10,
    MERGER: (r) => U[r.i].delisted && ['ACQUISITION', 'MERGER_FORM'].includes(U[r.i].delistClass), BANKRUPTCY_DISTRESS: (r) => U[r.i].delisted && U[r.i].delistClass === 'DEREGISTRATION_WITH_DISTRESS', SYMBOL_CHANGE: (r) => symbolChangeCik(r.i) };
  const v2Members = new Set();
  for (const fn of Object.values(CAT2)) eligibleV2.filter(fn).sort((a, b) => (rank(PROTOCOL_V2.selection.seed, U[a.i].id) < rank(PROTOCOL_V2.selection.seed, U[b.i].id) ? -1 : 1)).slice(0, PROTOCOL_V2.selection.perCategory).forEach((r) => v2Members.add(U[r.i].id));
  /* independent context of every segment (whole universe: FN population, vendor identity, FINRA) */
  const indep = [], vstat = {};
  for (const r of scanRows) {
    if (r.missing) continue;
    const u = U[r.i], bars = readRaw(o, r.i), finraObs = finraFor(F, u), v = vendorFor(V, u, bars);
    inc(vstat, v.ident.state);
    const ctx = { bars, vendor: v.vv, vendorIdentity: v.ident, finraObs, shares: u.shares };
    const secEff = ((secByCik[u.cik] || {}).events || []).filter((e) => e.stage === 'EFFECTIVE' && finite(e.ratio) && (e.marketDate || e.effectiveDate)).map((e) => ({ date: e.marketDate || e.effectiveDate, ratio: e.ratio }));
    const te = L.trueEvents(ctx);
    const downJumps = []; for (let k = 1; k < bars.length; k++) { const a = bars[k - 1], b = bars[k]; if (a.close > 0 && b.close > 0 && !hasSplit(b) && b.close / a.close <= 1 / 3) downJumps.push(b.date); }
    indep.push({ i: r.i, id: u.id, vendorIdentity: v.ident, vendorStatus: v.status, finraObs: finraObs.length, finraSplits: finraObs.filter((x) => x.kind === 'SPLIT').length,
      finraSymbolChange: finraObs.some((x) => x.kind === 'SYMBOL_CHANGE' || x.kind === 'EXCHANGE_DELISTING_TO_OTC'), trueEvents: te, secEffective: secEff, downJumps: downJumps.length });
  }
  const byI = new Map(indep.map((x) => [x.i, x]));
  const eligible = scanRows.filter((r) => !r.missing && !inSample.has(U[r.i].id) && !v2Members.has(U[r.i].id));
  const sdSorted = eligible.filter((r) => r.f.medianClose >= 1 && r.f.n >= 250).map((r) => r.f.sd).sort((a, b) => a - b);
  const sdCut3 = sdSorted.length ? sdSorted[Math.floor(sdSorted.length * 0.9)] : Infinity;
  const fwd = (x) => x.trueEvents.some((e) => e.date && e.ratio >= 1.5) || x.secEffective.some((e) => e.ratio >= 1.5);
  const rev = (x) => x.trueEvents.some((e) => e.ratio <= 1 / 1.5) || x.secEffective.some((e) => e.ratio <= 1 / 1.5);
  const CAT = {
    NORMAL: (r) => r.f.n >= 250,
    VOLATILE: (r) => r.f.medianClose >= 1 && r.f.n >= 250 && r.f.sd >= sdCut3,
    PENNY: (r) => r.f.medianClose !== null && r.f.medianClose < 1,
    CONFIRMED_FORWARD_SPLIT: (r) => fwd(byI.get(r.i)),
    CONFIRMED_REVERSE_SPLIT: (r) => rev(byI.get(r.i)),
    DOWNWARD_JUMP: (r) => byI.get(r.i).downJumps > 0,
    SYMBOL_CHANGE: (r) => symbolChangeCik(r.i) || byI.get(r.i).finraSymbolChange,
    MERGER: (r) => U[r.i].delisted && ['ACQUISITION', 'MERGER_FORM'].includes(U[r.i].delistClass),
    DELISTING: (r) => U[r.i].delisted,
    STALE: (r) => r.f.maxStaleRun >= 10,
    HIGH_NOMINAL: (r) => r.f.maxClose >= 1000
  };
  const seed = PROTOCOL.blindedControlSet.seed, per = PROTOCOL.blindedControlSet.perCategory;
  const members = {}, catsOf = {};
  for (const [k, fn] of Object.entries(CAT)) {
    const pool = eligible.filter(fn).sort((a, b) => (rank(seed, U[a.i].id) < rank(seed, U[b.i].id) ? -1 : 1));
    members[k] = { pool: pool.length, ids: pool.slice(0, per).map((r) => U[r.i].id) };
    members[k].ids.forEach((id) => { (catsOf[id] = catsOf[id] || []).push(k); });
  }
  const sel = { seed, perCategory: per, inSampleExcluded: inSample.size, v2MembersExcluded: v2Members.size, eligible: eligible.length, sdCut: sdCut3, members, catsOf };
  writeJson(path.join(o.private, 'select.json'), sel);
  writeJson(path.join(o.private, 'indep.json'), indep);
  const pub = { schema: 'corporate-action-v3-select-1.0.0', ...runMeta(), versions: versions(), blinded: true,
    note: 'written before the evaluate stage: no v3 decision exists when the members and the independent event population are fixed',
    inSampleExcluded: inSample.size, v2ControlMembersExcluded: v2Members.size, eligible: eligible.length,
    categories: Object.fromEntries(Object.entries(members).map(([k, v]) => [k, { pool: v.pool, sampled: v.ids.length }])),
    distinctMembers: Object.keys(catsOf).length, membersSha256: sha(JSON.stringify(members)), independentEventsSha256: sha(JSON.stringify(indep.map((x) => [x.id, x.trueEvents]))),
    vendorIdentity: vstat, vendorCollection: V.stats, finra: F.meta, independentEvents: indep.reduce((a, x) => { x.trueEvents.forEach((e) => inc(a, e.source)); return a; }, {}), ...NO };
  writeJson(o.public, pub, true);
  process.stdout.write(JSON.stringify({ categories: pub.categories, vendorIdentity: vstat }) + '\n');
}

/* ------------------------------------------------------------------ evaluate helpers */
const DISCONTINUITY_HOLDS = new Set(['SPLIT_SUSPECTED_UNDECLARED', 'SPLIT_SUSPECTED', 'SPLIT_MISSING', 'CORPORATE_ACTION_CONFLICT', 'UNDECLARED_SPLIT_SIGNATURE', 'UNEXPLAINED_EXTREME_DISCONTINUITY', 'CORPORATE_ACTION_RESIDUAL']);
const DATA_SEMANTIC_HOLDS = new Set(['CURRENCY_OR_UNIT_CHANGE', 'STALE_THEN_EXTREME_JUMP']);
const rawRatioAt = (bars, d) => { const k = bars.findIndex((b) => b.date === d); return k > 0 && bars[k - 1].close > 0 && bars[k].close > 0 ? bars[k].close / bars[k - 1].close : null; };
const prevDateOf = (bars, d) => { const k = bars.findIndex((b) => b.date >= d); return k > 0 ? bars[k - 1].date : null; };
/** canonical gross return of day d in the contract (same segment) or null when the return is not valid. */
function segReturn(c, bars, d) {
  const p = prevDateOf(bars, d); if (!p || !PV.isValidReturn(c, p, d)) return null;
  const s = c.segments[PV.segmentOf(c, d)]; const a = s.dates.indexOf(p), b = s.dates.indexOf(d);
  return a >= 0 && b >= 0 && s.tr[a] > 0 ? s.tr[b] / s.tr[a] : null;
}
/** v2 contract (first segment only): gross return of day d or null. */
function v2Return(c, bars, d) {
  const p = prevDateOf(bars, d); if (!p || !c || !c.validUntil) return null;
  if (!(p >= c.validFrom && d <= c.validUntil)) return null;
  if ((c.invalidRanges || []).some((x) => (p >= x.from && p <= x.to) || (d >= x.from && d <= x.to))) return null;
  const a = c.dates.indexOf(p), b = c.dates.indexOf(d); return a >= 0 && b >= 0 ? c.tr[b] / c.tr[a] : null;
}
/** Eastern-time calendar day of an EDGAR acceptance timestamp. */
const etDay = (iso) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); } catch { return null; } };
/** #722 final cause (build-data-fix-v4.mjs#finalCause, copied verbatim; regression labels only). */
function finalCause(c) {
  if (c.rootCause !== 'UNRESOLVED') return c.rootCause;
  const e = c.evidence || {}, k = e.nearestConventionalRatio, sh = e.secSharesRatio, r = e.rawRatio || 1, o = e.openRatio, vd = e.volumeRatioDay;
  if (sh && k && Math.abs(Math.log(sh * k)) <= Math.log(1.5)) return 'UNDECLARED_REVERSE_SPLIT';
  if (vd != null && vd >= 100 && !e.coreSignature) return 'GENUINE_PRICE_MOVE';
  if (r >= 100 && o && Math.abs(Math.log(o / r)) <= Math.log(1.25)) return 'CURRENCY_OR_UNIT';
  return 'UNRESOLVED';
}
/** Oracle input: everything published strictly before asOf by its own timestamp (bars <= asOf). */
function truncatedInputs(bars, opts, asOf) {
  const sec = (opts.secEvents || []).map((ev) => {
    const obs = (ev.observations || []).filter((x) => x.visibleAt && x.visibleAt < asOf);
    return obs.length ? Object.assign({}, ev, SEC.viewOf(obs), { observations: obs }) : null;
  }).filter(Boolean);
  const fObs = (opts._finraObs || []).filter((x) => x.visibleAt && x.visibleAt < asOf);
  return { bars: bars.filter((b) => b.date <= asOf), opts: { ...opts, asOf: undefined, secEvents: sec, finraEvents: FDL.splitEvents(fObs), listingEvents: FDL.listingEvents(fObs).filter((e) => e.visibleAt < asOf),
    shares: (opts.shares || []).filter((s) => s.availableAt && s.availableAt < asOf) } };
}
function signature(c) {
  return { segments: (c.segments || []).map((s) => [s.from, s.to, s.validBars]), holds: (c.holds || []).map((h) => [h.from, h.state, h.reason]),
    invalid: (c.segmentInvalidRanges || []).map((x) => [x.from, x.to]), normalized: (c.evidence || []).filter((e) => e.outcome === 'NORMALIZE').map((e) => [e.eventDate, r4(e.ratio)]) };
}
function trDiff(a, b) {
  let worst = 0;
  const bs = new Map((b.segments || []).map((s) => [s.from, s]));
  for (const s of a.segments || []) { const t = bs.get(s.from); if (!t) continue; const n = Math.min(s.tr.length, t.tr.length); for (let k = 1; k < n; k++) worst = Math.max(worst, Math.abs((s.tr[k] / s.tr[k - 1]) / (t.tr[k] / t.tr[k - 1]) - 1)); }
  return worst;
}

/* ------------------------------------------------------------------ evaluate */
async function evaluate(o) {
  const { universe: U, binding } = readJson(path.join(o.private, 'universe.json'));
  const scanRows = readJson(path.join(o.private, 'scan.json')), pop = readJson(path.join(o.private, 'population.json'));
  const regIn = readJson(path.join(o.private, 'regression-input.json')), sel = readJson(path.join(o.private, 'select.json')), indepRows = readJson(path.join(o.private, 'indep.json'));
  const indepById = new Map(indepRows.map((x) => [x.id, x]));
  const secAll = readJson(o.sec), secByCik = secAll.ciks || {}, F = loadFinra(o.finra), V = loadVendor(o.vendor);
  const ACC = o.acceptance && fs.existsSync(o.acceptance) ? readJson(o.acceptance) : { accessions: {}, stats: null };
  const PV2 = require(path.join(o['v2-root'], 'quant/engines/canonical-price-validity.js'));
  if (PV2.VERSION !== 'canonical-price-validity-2.2.0') throw new Error('V2_ROOT_NOT_2_2_0');
  const PA = PROTOCOL.acceptance;
  const highById = new Map(regIn.high.map((h) => [h.id, h])), in83ById = new Map(); regIn.in83.forEach((c) => { if (!in83ById.has(c.id)) in83ById.set(c.id, []); in83ById.get(c.id).push(c); });
  const pitSample = new Set();
  const M = { segments: 0, bars: 0, validBars: { v2_firstSegment: 0, v3_firstSegment: 0, v3_allSegments: 0, v3_resumed: 0 }, states: {}, statesV2: {}, holdsByReason: {}, holdsByReasonV2: {}, semanticByCause: {}, semanticExtremeByCause: {},
    normalizations: { total: 0, bySystem: {}, byCorroboration: {}, v2Total: 0 }, finra: { segmentsWithObservations: 0, segmentsWithSplitEvents: 0, splitEventsJoined: 0, listingEventsJoined: 0, normalizedByFinra: 0, secondSourceCorroborations: 0, sourcesDisagree: 0, evidenceFinraByReason: {} },
    evidenceByReason: {}, segmentsWithResume: 0, histories: { v2HeldOrRejected: 0, ofThoseUsableBarsGainedV3: 0 }, severe: { extremeUnresolvedInsideValid: 0, conflictingHolds: 0, conflictingHoldsUnlabeled: 0, segmentsWithCaEvidence: 0 } };
  const P = { holds: [], norms: [], invalid: [], fn: [], down: [], up: [], extreme272: [], d2: [], k83: [], pit: [], blinded: [] };
  const pit = { segmentsChecked: 0, viewsCompared: 0, mismatchKinds: {}, barsAfterAsOf: 0, observedAtTooEarly: 0, observedAtLate: 0, observedAtChecked: 0, revisionsAfterObserved: 0, lagSessions: {}, observedAtBasis: {},
    timestamps: { secObservations: 0, withAcceptance: 0, filedBeforeAcceptance: 0, lagDays: {} } };
  /* PIT sample order (pre-registered): segments with any intervention, ascending sha256(seed|id), at most maxSegments */
  const pitOrder = U.map((u, i) => ({ i, k: rank(PROTOCOL.pitOracle.seed, u.id) })).sort((a, b) => (a.k < b.k ? -1 : 1)).map((x) => x.i);
  const pitRankOf = new Map(pitOrder.map((i, k) => [i, k]));
  const results = new Map();
  /* SEC acceptance timestamps (whole universe, every observation) */
  for (const row of Object.values(secByCik)) for (const ev of row.events || []) for (const ob of ev.observations || []) {
    pit.timestamps.secObservations++;
    const a = ACC.accessions?.[ob.accession];
    if (!a || !a.acceptanceDateTime) continue;
    pit.timestamps.withAcceptance++;
    const ad = etDay(a.acceptanceDateTime);
    if (ad && ob.visibleAt < ad) pit.timestamps.filedBeforeAcceptance++;
    if (ad) inc(pit.timestamps.lagDays, String(Math.min(10, Math.round((Date.parse(ob.visibleAt) - Date.parse(ad)) / 864e5))));
  }
  for (const r of scanRows) {
    if (r.missing) continue;
    const u = U[r.i], bars = readRaw(o, r.i);
    const secRow = u.cik ? secByCik[u.cik] : null, secEvents = secRow ? secRow.events || [] : [];
    const finraObs = finraFor(F, u), finraEvents = FDL.splitEvents(finraObs), listingEvents = FDL.listingEvents(finraObs);
    const opts3 = { identity: CONFIRMED, delisted: u.delisted, secEvents, finraEvents, listingEvents, shares: u.shares, cik: u.cik, cikBasis: u.cikStatus };
    const v3 = PV.build(bars, opts3), v2 = PV2.build(bars, { identity: CONFIRMED, delisted: u.delisted, secEvents, shares: u.shares, cik: u.cik, cikBasis: u.cikStatus });
    const ind = indepById.get(u.id), v = vendorFor(V, u, bars);
    const ctxL = { bars, vendor: v.vv, vendorIdentity: v.ident, finraObs, shares: u.shares };
    M.segments++; M.bars += bars.length;
    M.validBars.v2_firstSegment += v2.validBars; M.validBars.v3_firstSegment += v3.validBars; M.validBars.v3_allSegments += v3.usableBars; M.validBars.v3_resumed += v3.resumedBars;
    if (v3.resumedBars) M.segmentsWithResume++;
    if (v2.state !== 'FULL_VALID') { M.histories.v2HeldOrRejected++; if (v3.usableBars > v2.validBars) M.histories.ofThoseUsableBarsGainedV3++; }
    inc(M.states, v3.state); inc(M.statesV2, v2.state);
    (v3.holds || []).forEach((h) => inc(M.holdsByReason, `${h.state}:${h.reason}`)); if (v2.hold) inc(M.holdsByReasonV2, `${v2.hold.state}:${v2.hold.reason}`);
    (v3.semanticFindings || []).forEach((s) => inc(M.semanticByCause, s.cause));
    v3.evidence.forEach((e) => { inc(M.evidenceByReason, e.reason); if (e.secEvent?.system === 'FINRA_OTC_DAILY_LIST') inc(M.finra.evidenceFinraByReason, e.reason); if (e.reason === 'SOURCES_DISAGREE_ON_RATIO') M.finra.sourcesDisagree++; });
    M.normalizations.v2Total += v2.evidence.filter((e) => e.outcome === 'NORMALIZE').length;
    if (finraObs.length) M.finra.segmentsWithObservations++; if (finraEvents.length) M.finra.segmentsWithSplitEvents++;
    M.finra.splitEventsJoined += finraEvents.length; M.finra.listingEventsJoined += listingEvents.length;
    if (secEvents.length || finraEvents.length) M.severe.segmentsWithCaEvidence++;
    /* ---- interventions with independent labels (whole universe) ---- */
    const ints = [];
    for (const h of v3.holds || []) {
      const rr = rawRatioAt(bars, h.from);
      const courseOnly = h.evidenceClass === 'PRICE_DISCONTINUITY_NO_CA_EVIDENCE' || (h.evidenceClass === null && !!h.semantic);
      let lab = null, family;
      if (DISCONTINUITY_HOLDS.has(h.reason)) { family = 'DISCONTINUITY_HOLD'; lab = rr ? L.labelHold(ctxL, h.from, rr) : null; }
      else if (DATA_SEMANTIC_HOLDS.has(h.reason)) { family = 'SEMANTIC_DATA_HOLD'; lab = rr ? L.labelDataDefect(ctxL, h.from, rr) : null; }
      else if (h.reason === 'LISTING_CHANGE_SEMANTIC') { family = 'SEMANTIC_TERMINAL'; lab = rr ? L.labelTerminal(ctxL, h.from, rr) : null; }
      else family = 'CORE_DATA_CONTRACT';
      if (h.evidenceClass === 'CONFLICTING_CORPORATE_ACTION') { M.severe.conflictingHolds++; if (!lab || lab.label === 'UNLABELED') M.severe.conflictingHoldsUnlabeled++; }
      const rec = { segmentId: u.id, kind: 'HOLD', family, date: h.from, reason: h.reason, state: h.state, evidenceClass: h.evidenceClass, courseOnly, semanticCause: h.semantic?.cause ?? null,
        rawRatio: r4(rr), label: lab ? lab.label : 'NOT_LABELED', basis: lab?.basis ?? null, evidence: lab?.evidence ?? null, observedAt: h.observedAt };
      ints.push(rec); P.holds.push(rec);
    }
    for (const e of v3.evidence.filter((x) => x.outcome === 'NORMALIZE')) {
      M.normalizations.total++; inc(M.normalizations.bySystem, e.secEvent?.system ?? 'SEC_EDGAR'); (e.corroboration || []).forEach((c) => inc(M.normalizations.byCorroboration, c));
      if (e.secEvent?.system === 'FINRA_OTC_DAILY_LIST') M.finra.normalizedByFinra++; if ((e.corroboration || []).includes('SECOND_SOURCE')) M.finra.secondSourceCorroborations++;
      const rr = rawRatioAt(bars, e.eventDate), lab = rr ? L.labelNormalize(ctxL, e.eventDate, rr, e.ratio, { triggerSystem: e.secEvent?.system, corroboration: e.corroboration }) : null;
      const rec = { segmentId: u.id, kind: 'NORMALIZE', date: e.eventDate, ratio: e.ratio, system: e.secEvent?.system ?? 'SEC_EDGAR', corroboration: e.corroboration || [], label: lab ? lab.label : 'NOT_LABELED', basis: lab?.basis ?? null, evidence: lab?.evidence ?? null };
      ints.push(rec); P.norms.push(rec);
    }
    for (const x of v3.segmentInvalidRanges || []) {
      const rr = rawRatioAt(bars, x.from), lab = rr ? L.labelDataDefect(ctxL, x.from, rr) : null;
      const rec = { segmentId: u.id, kind: 'INVALID_RANGE', date: x.from, to: x.to, reason: x.reason, label: lab ? lab.label : 'NOT_LABELED', basis: lab?.basis ?? null, evidence: lab?.evidence ?? null };
      ints.push(rec); P.invalid.push(rec);
    }
    /* ---- independent true events: false negatives (v3 and v2), course-only and direction ---- */
    for (const ev of ind ? ind.trueEvents : []) {
      const q = ev.ratio, dir = q < 1 ? 'REVERSE_UP' : 'FORWARD_DOWN';
      const win = bars.map((b, k) => k).filter((k) => k > 0 && bars[k].date > ev.from && bars[k].date <= ev.to);
      /* the provider declared it: same ratio (5 %) in the window; for a share-count window any provider reverse split */
      const prov = win.some((k) => hasSplit(bars[k]) && (ev.source === 'SEC_SHARES_DROP' ? bars[k].splitFactor < 1 : Math.abs(Math.log(bars[k].splitFactor) - Math.log(q)) <= Math.log(1.05)));
      const qq = q; /* a share-count drop sr = after/before is in splitFactor convention (1:20 reverse ~ 0.05) */
      let best = -1, bestScore = Infinity;
      for (const k of win) { const rr = bars[k].close / bars[k - 1].close; if (!(rr > 0) || !L.explains(rr, qq)) continue; const sc = Math.abs(Math.log(rr) + Math.log(qq)); if (sc < bestScore) { bestScore = sc; best = k; } }
      const secNear = secEvents.some((s) => { const x = s.marketDate || s.effectiveDate || s.visibleAt; return x && Math.abs(Date.parse(x) - Date.parse(ev.date || ev.to)) <= 60 * 864e5; });
      const finraNear = finraEvents.some((s) => s.marketDate && Math.abs(Date.parse(s.marketDate) - Date.parse(ev.date || ev.to)) <= 10 * 864e5);
      let status, statusV2;
      if (prov) status = statusV2 = 'PROVIDER_DECLARED';
      else if (best < 0) status = statusV2 = 'NOT_IN_PRICE';
      else {
        const d = bars[best].date, g3 = segReturn(v3, bars, d), g2 = v2Return(v2, bars, d), half = Math.abs(Math.log(qq)) / 2;
        const norm3 = v3.evidence.some((e) => e.outcome === 'NORMALIZE' && e.eventDate === d), norm2 = v2.evidence.some((e) => e.outcome === 'NORMALIZE' && e.eventDate === d);
        status = g3 === null ? (PV.isValidOn(v3, d) || PV.isValidOn(v3, prevDateOf(bars, d)) ? 'HELD_OR_LINK' : 'OUTSIDE_VALID') : Math.abs(Math.log(g3)) >= half ? 'FALSE_NEGATIVE' : norm3 ? 'NORMALIZED' : 'HANDLED';
        statusV2 = g2 === null ? 'HELD_OR_OUTSIDE' : Math.abs(Math.log(g2)) >= half ? 'FALSE_NEGATIVE' : norm2 ? 'NORMALIZED' : 'HANDLED';
      }
      P.fn.push({ segmentId: u.id, source: ev.source, date: ev.date, from: ev.from, to: ev.to, ratio: r4(q), direction: dir, status, statusV2, courseOnly: !secNear && !finraNear, blinded: !!sel.catsOf[u.id] });
    }
    /* ---- jump census (>= 3:1, no provider event): downward and upward, semantic cause vs independent label ---- */
    for (const c of DS.scan(bars, { listingEvents })) {
      if (c.onDeclaredSplit) continue;
      const g3 = segReturn(v3, bars, c.date), norm3 = v3.evidence.some((e) => e.outcome === 'NORMALIZE' && e.eventDate === c.date);
      const lab = L.classifyMove(ctxL, c.date, c.ratio);
      const statusV3 = norm3 ? 'NORMALIZED' : g3 === null ? 'NOT_IN_VALID_RETURN' : Math.abs(Math.log(g3)) >= Math.log(DS.CONFIG.candidateRatio) ? 'IN_VALID_RETURN' : 'ADJUSTED';
      const g2 = v2Return(v2, bars, c.date), statusV2 = g2 === null ? 'NOT_IN_VALID_RETURN' : Math.abs(Math.log(g2)) >= Math.log(DS.CONFIG.candidateRatio) ? 'IN_VALID_RETURN' : 'ADJUSTED';
      const rec = { segmentId: u.id, date: c.date, ratio: c.ratio, extreme: c.extreme, cause: c.cause, outcome: c.outcome, channels: { dollar: c.channels.dollarVolumeRatio, share: c.channels.shareVolumeRatio, k: c.channels.conventionalRatio }, statusV3, statusV2, independent: lab.class, vendorMove: lab.vendorMove, vendorSplit: lab.vendorSplit, finraSplit: lab.finraSplit, shares: lab.shares };
      (c.direction === 'DOWN' ? P.down : P.up).push(rec);
      if (c.extreme) inc(M.semanticExtremeByCause, `${c.direction}:${c.cause}`);
      if (c.extreme && c.cause === 'UNRESOLVED' && statusV3 === 'IN_VALID_RETURN') M.severe.extremeUnresolvedInsideValid++;
    }
    /* ---- the v2 "272": >= 10x moves without provider event inside the v2 valid range, neither normalized nor held ---- */
    const normDates2 = new Set(v2.evidence.filter((e) => e.outcome === 'NORMALIZE').map((e) => e.eventDate));
    for (const j of r.f.jumps10) {
      if (!v2.validUntil || j.date > v2.validUntil || j.date <= v2.validFrom || v2.invalidRanges.some((x) => x.from === j.date) || normDates2.has(j.date)) continue;
      const rr = rawRatioAt(bars, j.date), lab = L.classifyMove(ctxL, j.date, rr), g3 = segReturn(v3, bars, j.date);
      P.extreme272.push({ segmentId: u.id, date: j.date, dir: j.dir, ratio: j.ratio, independent: lab.class, evidence: lab, v3: g3 === null ? 'NOT_IN_VALID_RETURN' : Math.abs(Math.log(g3)) >= Math.log(10) ? 'STILL_IN_VALID_RETURN' : 'ADJUSTED',
        v3Hold: (v3.holds || []).find((h) => h.from === j.date)?.reason ?? null, v3Invalid: (v3.segmentInvalidRanges || []).some((x) => j.date >= x.from && j.date <= x.to) });
    }
    /* ---- D2 regression ---- */
    const h = highById.get(u.id);
    if (h) {
      const days = h.defectDays.map((x) => { const g3 = segReturn(v3, bars, x.date), g2 = v2Return(v2, bars, x.date); return { ...x, inBars: bars.some((b) => b.date === x.date), v3ValidReturn: g3 !== null, v2ValidReturn: g2 !== null }; });
      P.d2.push({ segmentId: u.id, cause: h.cause, v4SanityClass: h.v4SanityClass, coreAccepts1_2_0: r.whole12 === true, days, v3State: v3.state, v3Holds: (v3.holds || []).map((x) => [x.from, x.reason]), resumed: v3.segments.length > 1 });
    }
    /* ---- 83 regression ---- */
    for (const c of in83ById.get(u.id) || []) {
      const x = A.explainMonth(bars, c.F, c.E, c.ctx, c.canon), cause = finalCause({ rootCause: x.cause, evidence: x.evidence });
      const dom = x.days?.[0]?.date ?? x.dominantDays?.[0]?.date ?? null;
      const g3 = dom ? segReturn(v3, bars, dom) : null, g2 = dom ? v2Return(v2, bars, dom) : null;
      P.k83.push({ key: `${u.id}|${c.month}`, cls: c.cls, cause, defect: !String(cause).startsWith('GENUINE'), dominantDay: dom, v3ValidReturn: g3 !== null, v3StillExtreme: g3 !== null && Math.abs(Math.log(g3)) >= Math.log(2), v2ValidReturn: g2 !== null, v2StillExtreme: g2 !== null && Math.abs(Math.log(g2)) >= Math.log(2) });
    }
    /* ---- blinded control members ---- */
    const cats = sel.catsOf[u.id];
    if (cats) P.blinded.push({ segmentId: u.id, categories: cats, bars: bars.length, vendorIdentity: v.ident.state, finraObs: finraObs.length, shares: (u.shares || []).length, labelable: v.ident.state === 'CONFIRMED' || finraObs.length > 0 || (u.shares || []).length > 1,
      interventions: ints.filter((x) => x.kind !== 'HOLD' || x.family !== 'CORE_DATA_CONTRACT').map((x) => ({ kind: x.kind, family: x.family ?? null, date: x.date, reason: x.reason ?? null, label: x.label, basis: x.basis })) });
    /* ---- PIT oracle (pre-registered sample) ---- */
    const hasItem = (v3.holds || []).length || (v3.segmentInvalidRanges || []).length || v3.evidence.some((e) => e.outcome === 'NORMALIZE') || v3.segments.length > 1;
    if (hasItem && pitRankOf.get(r.i) !== undefined) pitSample.add(r.i);
    results.set(r.i, { hasItem });
    if (M.segments % 1000 === 0) process.stdout.write(`[evaluate] ${M.segments}\n`);
  }
  /* ---- PIT oracle: engine as-of view vs build on inputs truncated by their own publication time ---- */
  const chosen = pitOrder.filter((i) => pitSample.has(i)).slice(0, PROTOCOL.pitOracle.maxSegments);
  for (const i of chosen) {
    const u = U[i], bars = readRaw(o, i), secRow = u.cik ? secByCik[u.cik] : null, finraObs = finraFor(F, u);
    const opts3 = { identity: CONFIRMED, delisted: u.delisted, secEvents: secRow ? secRow.events || [] : [], finraEvents: FDL.splitEvents(finraObs), listingEvents: FDL.listingEvents(finraObs), shares: u.shares, cik: u.cik, cikBasis: u.cikStatus };
    const fin = PV.build(bars, opts3), dates = bars.map((b) => b.date), at = (d, k) => { const x = dates.findIndex((y) => y >= d); const j = x < 0 ? -1 : x + k; return j >= 0 && j < dates.length ? dates[j] : null; };
    const items = [];
    (fin.holds || []).forEach((h) => items.push({ kind: 'HOLD', key: `${h.from}|${h.state}`, eventDate: h.from, observedAt: h.observedAt, basis: h.observedAtBasis, has: (c) => (c.holds || []).some((x) => x.from === h.from && x.state === h.state) }));
    fin.evidence.filter((e) => e.outcome === 'NORMALIZE').forEach((e) => items.push({ kind: 'NORMALIZE', eventDate: e.eventDate, observedAt: e.observedAt, basis: e.observedAtBasis, has: (c) => c.evidence.some((x) => x.outcome === 'NORMALIZE' && x.eventDate === e.eventDate && r4(x.ratio) === r4(e.ratio)) }));
    (fin.segmentInvalidRanges || []).forEach((x) => items.push({ kind: 'INVALID_RANGE', eventDate: x.from, observedAt: x.observedAt, basis: 'REVERT_BAR', has: (c) => (c.segmentInvalidRanges || []).some((y) => y.from === x.from) }));
    fin.segments.slice(1).forEach((s) => items.push({ kind: 'RESUME_FROM', eventDate: s.from, observedAt: s.resumedAfter.observedAt, basis: s.resumedAfter.observedAtBasis, has: (c) => (c.segments || []).some((y) => y.from === s.from) }));
    pit.segmentsChecked++;
    const asOfs = new Set();
    for (const it of items) {
      inc(pit.observedAtBasis, `${it.kind}:${it.basis ?? 'NONE'}`);
      if (it.observedAt && it.eventDate) { const lag = dates.filter((d) => d > it.eventDate && d <= it.observedAt).length; inc(pit.lagSessions, `${it.kind}:${Math.min(lag, 30)}`); }
      for (const d of [at(it.eventDate, -1), at(it.eventDate, 0), it.observedAt && at(it.observedAt, -1), it.observedAt && at(it.observedAt, 0), it.observedAt && at(it.observedAt, 1), it.observedAt && at(it.observedAt, 5), it.observedAt && at(it.observedAt, 20)]) if (d && d >= dates[1]) asOfs.add(d);
    }
    const oracleAt = new Map();
    for (const asOf of [...asOfs].sort()) {
      const view = PV.build(bars, { ...opts3, asOf }), t = truncatedInputs(bars, { ...opts3, _finraObs: finraObs }, asOf), orc = PV.build(t.bars, t.opts);
      oracleAt.set(asOf, orc); pit.viewsCompared++;
      if (view.last && view.last > asOf) pit.barsAfterAsOf++;
      const a = signature(view), b = signature(orc);
      for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { inc(pit.mismatchKinds, k); P.pit.push({ segmentId: u.id, asOf, kind: k, engine: a[k], oracle: b[k] }); }
      if (trDiff(view, orc) > 1e-9) { inc(pit.mismatchKinds, 'tr'); P.pit.push({ segmentId: u.id, asOf, kind: 'tr' }); }
    }
    for (const it of items) {
      if (!it.observedAt || !oracleAt.has(it.observedAt)) continue;
      pit.observedAtChecked++;
      if (!it.has(oracleAt.get(it.observedAt))) { pit.observedAtTooEarly++; P.pit.push({ segmentId: u.id, kind: 'OBSERVED_AT_TOO_EARLY', item: it.kind, eventDate: it.eventDate, observedAt: it.observedAt }); }
      const prev = at(it.observedAt, -1);
      if (prev && oracleAt.has(prev) && it.has(oracleAt.get(prev))) pit.observedAtLate++;
      for (const k of [1, 5, 20]) { const d = at(it.observedAt, k); if (d && oracleAt.has(d) && !it.has(oracleAt.get(d))) { pit.revisionsAfterObserved++; break; } }
    }
  }
  /* ---- tallies ---- */
  const lab = (rows) => rows.reduce((a, x) => inc(a, x.label), {});
  const prec = (rows) => { const tp = rows.filter((x) => x.label === 'TRUE_POSITIVE').length, fp = rows.filter((x) => x.label === 'FALSE_POSITIVE').length, n = rows.length;
    return { total: n, truePositive: tp, falsePositive: fp, unlabeled: n - tp - fp, labelled: tp + fp, labelledShare: n ? r4((tp + fp) / n) : null, falseShare: tp + fp ? r4(fp / (tp + fp)) : null, wilson95FalseShare: wilson(fp, tp + fp), worstCaseFalseShare: n ? r4((n - tp) / n) : null }; };
  const caHolds = P.holds.filter((x) => x.family !== 'CORE_DATA_CONTRACT');
  const courseOnly = caHolds.filter((x) => x.courseOnly);
  const fnStat = (rows, key = 'status') => { const ev = rows.filter((x) => !['PROVIDER_DECLARED', 'NOT_IN_PRICE'].includes(x[key])); const fn = ev.filter((x) => x[key] === 'FALSE_NEGATIVE').length;
    return { events: rows.length, providerDeclared: rows.filter((x) => x[key] === 'PROVIDER_DECLARED').length, notInPrice: rows.filter((x) => x[key] === 'NOT_IN_PRICE').length, evaluable: ev.length, falseNegatives: fn, rate: ev.length ? r4(fn / ev.length) : null, wilson95: wilson(fn, ev.length), byStatus: rows.reduce((a, x) => inc(a, x[key]), {}) }; };
  const fnAll = fnStat(P.fn), fnAllV2 = fnStat(P.fn, 'statusV2'), fnDown = fnStat(P.fn.filter((x) => x.direction === 'FORWARD_DOWN')), fnUp = fnStat(P.fn.filter((x) => x.direction === 'REVERSE_UP'));
  const fnCourse = fnStat(P.fn.filter((x) => x.courseOnly)), fnCourseDown = fnStat(P.fn.filter((x) => x.courseOnly && x.direction === 'FORWARD_DOWN'));
  const confusion = (rows) => rows.reduce((a, x) => inc(a, `${x.cause}|${x.independent}|${x.statusV3}`), {});
  const downHeldGenuine = P.down.filter((x) => x.independent === 'LEGITIMATE_MOVE' && x.statusV3 === 'NOT_IN_VALID_RETURN').length, downGenuine = P.down.filter((x) => x.independent === 'LEGITIMATE_MOVE').length;
  const downEvents = P.down.filter((x) => x.independent === 'CONFIRMED_EVENT'), downEventsFn = downEvents.filter((x) => x.statusV3 === 'IN_VALID_RETURN').length;
  const downHoldsLabelled = P.down.filter((x) => x.statusV3 === 'NOT_IN_VALID_RETURN' && (x.independent === 'LEGITIMATE_MOVE' || x.independent === 'CONFIRMED_EVENT' || x.independent === 'BAD_DATA'));
  /* D2 */
  const d2Defect = P.d2.filter((x) => !['LEGITIMATE_HIGH_NOMINAL_PRICE', 'ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS'].includes(x.cause));
  const d2Known = d2Defect.filter((x) => x.coreAccepts1_2_0);
  const d2InValid = (rows, k) => rows.filter((x) => x.days.some((d) => d[k])).length;
  /* blinded control */
  const cats = Object.keys(sel.members), ctl = {};
  for (const k of cats) {
    const rows = P.blinded.filter((x) => x.categories.includes(k)), labelled = rows.filter((x) => x.labelable);
    const fpSeg = rows.filter((x) => x.interventions.some((i) => i.label === 'FALSE_POSITIVE')).length;
    const fnRows = P.fn.filter((x) => rows.some((r) => r.segmentId === x.segmentId)), fnS = fnStat(fnRows);
    ctl[k] = { pool: sel.members[k].pool, sampled: rows.length, labelable: labelled.length, labelableShare: rows.length ? r4(labelled.length / rows.length) : null, vendorConfirmed: rows.filter((x) => x.vendorIdentity === 'CONFIRMED').length,
      segmentsWithIntervention: rows.filter((x) => x.interventions.length).length, interventions: rows.reduce((a, x) => a + x.interventions.length, 0), labels: rows.flatMap((x) => x.interventions).reduce((a, i) => inc(a, `${i.kind}:${i.label}`), {}),
      falsePositiveSegments: fpSeg, falsePositiveRate: labelled.length ? r4(fpSeg / labelled.length) : null, wilson95: wilson(fpSeg, labelled.length), falseNegatives: fnS };
  }
  const uniq = new Map(); P.blinded.forEach((x) => uniq.set(x.segmentId, x));
  const uRows = [...uniq.values()], uLab = uRows.filter((x) => x.labelable), uFp = uRows.filter((x) => x.interventions.some((i) => i.label === 'FALSE_POSITIVE')).length;
  const blindedFn = fnStat(P.fn.filter((x) => x.blinded));
  const pooled = { distinctSegments: uRows.length, labelable: uLab.length, labelableShare: uRows.length ? r4(uLab.length / uRows.length) : null, falsePositiveSegments: uFp, falsePositiveRate: uLab.length ? r4(uFp / uLab.length) : null, wilson95: wilson(uFp, uLab.length), falseNegatives: blindedFn };
  /* source coverage */
  const caInts = [...caHolds, ...P.norms, ...P.invalid];
  const independentCoverage = { interventions: caInts.length, labelled: caInts.filter((x) => x.label === 'TRUE_POSITIVE' || x.label === 'FALSE_POSITIVE').length };
  independentCoverage.share = caInts.length ? r4(independentCoverage.labelled / caInts.length) : null;
  /* acceptance (protocol 3.0.0) */
  const pitClean = pit.barsAfterAsOf === 0 && Object.keys(pit.mismatchKinds).length === 0 && pit.observedAtTooEarly === 0 && pit.timestamps.filedBeforeAcceptance === 0;
  const perCatOk = Object.values(ctl).every((c) => c.falsePositiveRate === null || c.falsePositiveRate <= PA.blindedFalsePositiveRatePerCategory);
  const nonNull = (x) => x !== null && x !== undefined;
  const acc = {
    pitViolations: { value: { barsAfterAsOf: pit.barsAfterAsOf, mismatches: Object.values(pit.mismatchKinds).reduce((a, x) => a + x, 0), observedAtTooEarly: pit.observedAtTooEarly, filedBeforeAcceptance: pit.timestamps.filedBeforeAcceptance }, threshold: 0, pass: pitClean && pit.viewsCompared >= PA.pitMinViews, views: pit.viewsCompared },
    pitTimestampCoverage: { value: pit.timestamps.secObservations ? r4(pit.timestamps.withAcceptance / pit.timestamps.secObservations) : null, threshold: PA.pitAcceptanceTimestampCoverageMin, pass: pit.timestamps.secObservations > 0 && pit.timestamps.withAcceptance / pit.timestamps.secObservations >= PA.pitAcceptanceTimestampCoverageMin },
    blindedFalsePositiveRatePooled: { value: pooled.falsePositiveRate, threshold: PA.blindedFalsePositiveRatePooled, pass: nonNull(pooled.falsePositiveRate) && pooled.falsePositiveRate <= PA.blindedFalsePositiveRatePooled },
    blindedFalsePositiveRatePerCategory: { threshold: PA.blindedFalsePositiveRatePerCategory, pass: perCatOk },
    blindedFalseNegativeRate: { value: blindedFn.rate, evaluable: blindedFn.evaluable, threshold: PA.falseNegativeRateMax, minEvaluable: PA.minEvaluableEvents, pass: nonNull(blindedFn.rate) && blindedFn.evaluable >= PA.minEvaluableEvents && blindedFn.rate <= PA.falseNegativeRateMax },
    falseNegativeRateUniverse: { value: fnAll.rate, evaluable: fnAll.evaluable, threshold: PA.falseNegativeRateMax, pass: nonNull(fnAll.rate) && fnAll.evaluable >= PA.minEvaluableEvents && fnAll.rate <= PA.falseNegativeRateMax },
    courseOnlyHoldFalseShare: { value: prec(courseOnly).falseShare, labelledShare: prec(courseOnly).labelledShare, threshold: PA.courseOnlyHoldFalseShareMax, minLabelledShare: PA.courseOnlyHoldMinLabelledShare,
      pass: nonNull(prec(courseOnly).falseShare) && prec(courseOnly).falseShare <= PA.courseOnlyHoldFalseShareMax && prec(courseOnly).labelledShare >= PA.courseOnlyHoldMinLabelledShare },
    courseOnlyFalseNegativeRate: { value: fnCourse.rate, evaluable: fnCourse.evaluable, threshold: PA.courseOnlyFalseNegativeRateMax, pass: nonNull(fnCourse.rate) && fnCourse.evaluable >= PA.minEvaluableEvents && fnCourse.rate <= PA.courseOnlyFalseNegativeRateMax },
    normalizeFalseShare: { value: prec(P.norms).falseShare, labelled: prec(P.norms).labelled, threshold: PA.normalizeFalseShareMax, pass: nonNull(prec(P.norms).falseShare) && prec(P.norms).falseShare <= PA.normalizeFalseShareMax },
    downwardFalseNegativeRate: { value: fnDown.rate, evaluable: fnDown.evaluable, threshold: PA.downwardFalseNegativeRateMax, minEvaluable: PA.minEvaluableDownwardEvents, pass: nonNull(fnDown.rate) && fnDown.evaluable >= PA.minEvaluableDownwardEvents && fnDown.rate <= PA.downwardFalseNegativeRateMax },
    downwardHoldFalseShare: { value: downHoldsLabelled.length ? r4(downHoldsLabelled.filter((x) => x.independent === 'LEGITIMATE_MOVE').length / downHoldsLabelled.length) : null, labelled: downHoldsLabelled.length, threshold: PA.downwardHoldFalseShareMax,
      pass: downHoldsLabelled.length >= PA.minEvaluableDownwardEvents && downHoldsLabelled.filter((x) => x.independent === 'LEGITIMATE_MOVE').length / downHoldsLabelled.length <= PA.downwardHoldFalseShareMax },
    knownD2ValidRangeDefects: { value: d2InValid(d2Known, 'v3ValidReturn'), known: d2Known.length, threshold: 0, pass: d2InValid(d2Known, 'v3ValidReturn') === 0 },
    severeUnresolvedExtremeInsideValid: { value: M.severe.extremeUnresolvedInsideValid, threshold: 0, pass: M.severe.extremeUnresolvedInsideValid === 0 },
    unresolvedConflictingHolds: { value: M.severe.conflictingHoldsUnlabeled, share: M.severe.segmentsWithCaEvidence ? r4(M.severe.conflictingHoldsUnlabeled / M.severe.segmentsWithCaEvidence) : null, threshold: PA.unresolvedConflictShareMax,
      pass: M.severe.segmentsWithCaEvidence > 0 && M.severe.conflictingHoldsUnlabeled / M.severe.segmentsWithCaEvidence <= PA.unresolvedConflictShareMax },
    independentLabelCoverage: { value: independentCoverage.share, threshold: PA.independentLabelCoverageMin, pass: nonNull(independentCoverage.share) && independentCoverage.share >= PA.independentLabelCoverageMin },
    blindedLabelableShare: { value: pooled.labelableShare, threshold: PA.blindedLabelableShareMin, pass: nonNull(pooled.labelableShare) && pooled.labelableShare >= PA.blindedLabelableShareMin },
    secondSourceIntegrated: { value: { finraSplitEventsJoined: M.finra.splitEventsJoined, finraNormalizations: M.finra.normalizedByFinra, secondSourceCorroborations: M.finra.secondSourceCorroborations }, pass: M.finra.splitEventsJoined > 0 && F.meta.stats?.complete === true },
    secCollectionComplete: { value: { documentErrors: secAll.stats?.documentErrors ?? null, incompleteWindows: (secAll.stats?.incompleteWindows || []).length, documents: secAll.stats?.documents ?? null },
      threshold: PA.secDocumentErrorShareMax, pass: (secAll.stats?.incompleteWindows || []).length === 0 && (secAll.stats?.documents ? (secAll.stats.documentErrors || 0) / secAll.stats.documents <= PA.secDocumentErrorShareMax : false) }
  };
  acc.pass = Object.values(acc).every((x) => x.pass === true);
  const pub = { schema: 'corporate-action-v3-audit-1.0.0', ...runMeta(), versions: versions(), capture: { dataFingerprint: binding.dataFingerprint, securities: binding.securities },
    sources: { sec: { collector: secAll.collector, extractor: secAll.extractor, from: secAll.from, to: secAll.to, stats: { ...secAll.stats, incompleteWindows: (secAll.stats?.incompleteWindows || []).length }, ciksWithEvents: Object.keys(secByCik).length, sha256: sha(fs.readFileSync(o.sec)) },
      finra: { ...F.meta, observations: F.rows, sha256: sha(fs.readFileSync(o.finra)) }, vendor: { stats: V.stats?.stats ?? null, collector: V.stats?.collector ?? null, symbols: V.m.size }, edgarAcceptance: ACC.stats },
    impact: M, pit,
    courseOnlyHolds: { definition: 'holds whose evidence is the price only (PRICE_DISCONTINUITY_NO_CA_EVIDENCE, or a semantic quarantine/terminal without any source)', ...prec(courseOnly), byReason: courseOnly.reduce((a, x) => inc(a, `${x.reason}:${x.label}`), {}), byBasis: courseOnly.reduce((a, x) => inc(a, x.basis ?? 'NONE'), {}) },
    allCaHolds: { ...prec(caHolds), byFamily: caHolds.reduce((a, x) => inc(a, `${x.family}:${x.label}`), {}) }, coreDataContractHolds: P.holds.filter((x) => x.family === 'CORE_DATA_CONTRACT').length,
    normalizations: { ...prec(P.norms), bySystemAndLabel: P.norms.reduce((a, x) => inc(a, `${x.system}:${x.label}`), {}), byBasis: P.norms.reduce((a, x) => inc(a, x.basis ?? 'NONE'), {}) },
    invalidRanges: { ...prec(P.invalid), byReason: P.invalid.reduce((a, x) => inc(a, `${x.reason}:${x.label}`), {}) },
    falseNegatives: { universe: fnAll, universeV2: fnAllV2, downward: fnDown, upward: fnUp, courseOnly: fnCourse, courseOnlyDownward: fnCourseDown, bySource: P.fn.reduce((a, x) => inc(a, `${x.source}:${x.status}`), {}) },
    downward: { candidates: P.down.length, extreme: P.down.filter((x) => x.extreme).length, byCause: P.down.reduce((a, x) => inc(a, x.cause), {}), byIndependent: P.down.reduce((a, x) => inc(a, x.independent), {}),
      byStatusV3: P.down.reduce((a, x) => inc(a, x.statusV3), {}), byStatusV2: P.down.reduce((a, x) => inc(a, x.statusV2), {}), confusion: confusion(P.down),
      independentEvents: downEvents.length, independentEventsInValidReturn: downEventsFn, genuine: downGenuine, genuineHeld: downHeldGenuine },
    upward: { candidates: P.up.length, extreme: P.up.filter((x) => x.extreme).length, byCause: P.up.reduce((a, x) => inc(a, x.cause), {}), byIndependent: P.up.reduce((a, x) => inc(a, x.independent), {}), byStatusV3: P.up.reduce((a, x) => inc(a, x.statusV3), {}), confusion: confusion(P.up) },
    extremeV2Unresolved: { total: P.extreme272.length, byDirection: P.extreme272.reduce((a, x) => inc(a, x.dir), {}), byIndependent: P.extreme272.reduce((a, x) => inc(a, x.independent), {}), byV3: P.extreme272.reduce((a, x) => inc(a, x.v3), {}),
      byIndependentAndV3: P.extreme272.reduce((a, x) => inc(a, `${x.independent}|${x.v3}`), {}) },
    d2: { highLevel: P.d2.length, byCause: P.d2.reduce((a, x) => inc(a, x.cause), {}), defects: d2Defect.length, knownD2NotQuarantinedBy1_2_0: d2Known.length, reproducesEleven: d2Known.length === 11,
      knownD2InValidRangeV2: d2InValid(d2Known, 'v2ValidReturn'), knownD2InValidRangeV3: d2InValid(d2Known, 'v3ValidReturn'), defectDays: d2Known.reduce((a, x) => a + x.days.length, 0),
      defectDaysInValidV3: d2Known.reduce((a, x) => a + x.days.filter((d) => d.v3ValidReturn).length, 0), byCauseV3: d2Known.reduce((a, x) => inc(a, `${x.cause}:${x.days.some((d) => d.v3ValidReturn) ? 'IN_VALID_RANGE' : 'OUT'}`), {}) },
    known83: { total: P.k83.length, byCause: P.k83.reduce((a, x) => inc(a, x.cause), {}), defects: P.k83.filter((x) => x.defect).length, defectsInValidV3: P.k83.filter((x) => x.defect && x.v3StillExtreme).length, defectsInValidV2: P.k83.filter((x) => x.defect && x.v2StillExtreme).length,
      genuineHeldV3: P.k83.filter((x) => !x.defect && !x.v3ValidReturn).length, genuineHeldV2: P.k83.filter((x) => !x.defect && !x.v2ValidReturn).length, byCauseAndV3: P.k83.reduce((a, x) => inc(a, `${x.cause}:${x.v3StillExtreme ? 'VALID_STILL_EXTREME' : x.v3ValidReturn ? 'VALID' : 'NOT_VALID'}`), {}) },
    blindedControl: { protocol: 'CORPORATE-ACTION-PROTOCOL-V3.json', seed: sel.seed, perCategory: sel.perCategory, inSampleExcluded: sel.inSampleExcluded, v2MembersExcluded: sel.v2MembersExcluded, eligible: sel.eligible, categories: ctl, pooled },
    independentCoverage, acceptance: acc, ...NO };
  writeJson(path.join(o['public-dir'], 'CORPORATE-ACTION-V3-AUDIT.json'), pub, true);
  writeJson(path.join(o.private, 'evaluate.json'), P);
  process.stdout.write(JSON.stringify({ acceptance: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.pass ?? v])) }) + '\n');
}

/* ------------------------------------------------------------------ seal */
async function seal(o) {
  const { encryptForOwner } = await import(pathToFileURL(path.join(o['base-root'], 'scripts/supertrader/validation/lib.mjs')).href);
  const parts = {};
  for (const f of ['population.json', 'select.json', 'evaluate.json']) if (fs.existsSync(path.join(o.private, f))) parts[f.replace('.json', '')] = readJson(path.join(o.private, f));
  const bytes = zlib.gzipSync(Buffer.from(JSON.stringify(parts)));
  fs.mkdirSync(o['sealed-dir'], { recursive: true });
  const env = [['owner', o['owner-key']], ['session', o['session-key']]].map(([aud, k]) => {
    const f = path.join(o['sealed-dir'], `CORPORATE-ACTION-V3-PRIVATE.${aud}.sealed.json`), s = encryptForOwner(fs.readFileSync(k, 'utf8'), bytes);
    fs.writeFileSync(f, s); return { audience: aud, file: path.basename(f), sha256: sha(Buffer.from(s)) };
  });
  writeJson(o.public, { schema: 'corporate-action-v3-sealed-1.0.0', encoding: 'gzip(JSON)', plaintextSha256: sha(bytes), plaintextBytes: bytes.length, envelopes: env }, true);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = args(process.argv.slice(2));
  const run = { prepare, scan, periodic, select, evaluate, seal }[o.stage];
  if (!run) throw new Error('STAGE_REQUIRED');
  run(o).catch((e) => { process.stderr.write(JSON.stringify({ phase: 'CORPORATE_ACTION_V3_AUDIT', stage: o.stage, code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'PRIVATE_RUN_FAILURE', hint: /^[A-Za-z0-9 ,.:'()_\-/]{1,160}$/.test(e.message) ? e.message : null, stack: (e.stack || '').split('\n').slice(1, 6).map((l) => l.replace(/\(.*\/(scripts|quant)\//, '($1/')).join(' | ') }) + '\n'); process.exitCode = 1; });
}
export { truncatedInputs, signature, finalCause, segReturn };
