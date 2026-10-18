#!/usr/bin/env node
/**
 * Unified data-issue population, provider-vs-VU locus and French-oracle attribution (diagnostic only).
 *
 * Runs after the unchanged corporate-action-v3 audit stages prepare/scan/select/evaluate of the pinned #758 checkout,
 * executed WITHOUT the validation vendor (SEC/FINRA merged inputs of run 39019906367). It reads their private outputs
 * (universe, population, scan, raw store bars, evaluate) and the same canonical capture, then:
 *   1. denominators: segments, securities, companies (CIK), listings, bars;
 *   2. the historical populations (83 security-months, 74 high-level, 11 D2, 272 extreme moves, holds, quarantines,
 *      this audit's tournament census) joined on segment id and event day, deduplicated per counting level;
 *   3. provider locus of every event day: does Tiingo's adjustedClose move with the raw close (no event in either
 *      provider column) or stay continuous (provider columns disagree)?
 *   4. French EW/MOM/VAR correlations of separated diagnostic variants (never a certification, never a rule).
 * Public output: counts and correlations. Per-case rows are sealed to the owner key.
 * Usage: node population.mjs --base-root <#705> --v3-root <#758> --capture <dir> --ca <v3 private dir> --sec <file>
 *          --finra <file> --oracle-parsed <file> --public-out <file> --sealed-dir <dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as K from './lib.mjs';

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const year = (d) => String(d).slice(0, 4);
const exchangeOf = (id) => String(id || '').split(':')[1] || 'UNKNOWN';
const priceBucket = (p) => (!K.finite(p) ? 'UNKNOWN' : p < 1 ? 'LT_1' : p < 5 ? '1_TO_5' : p < 20 ? '5_TO_20' : p < 100 ? '20_TO_100' : 'GE_100');

/** Provider locus of one event day on the raw store bars (Tiingo raw close and adjustedClose). */
export function providerLocus(rb, d) {
  const k = rb.findIndex((b) => b.date === d);
  if (k < 1) return 'DAY_NOT_IN_STORE';
  const a = rb[k - 1], b = rb[k], raw = b.close / a.close;
  if (!(a.adjustedClose > 0 && b.adjustedClose > 0)) return 'PROVIDER_ADJUSTED_MISSING';
  const adj = b.adjustedClose / a.adjustedClose;
  if (Math.abs(Math.log(adj / raw)) < Math.log(1.1)) return K.finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9 ? 'PROVIDER_DECLARED_SPLIT_ADJ_FOLLOWS_RAW' : 'PROVIDER_NO_EVENT_IN_EITHER_COLUMN';
  if (Math.abs(Math.log(adj)) < Math.log(1.5)) return K.finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9 ? 'PROVIDER_DECLARED_SPLIT_ADJ_CONTINUOUS' : 'PROVIDER_COLUMNS_DISAGREE_ADJ_CONTINUOUS';
  return 'PROVIDER_PARTIAL_ADJUSTMENT';
}

/** EW market mean per month with security-months excluded (diagnose-calibration-v4 loop, exclusion set as input). */
export function ewVariant(M, data, exclude) {
  const calendar = M.cons.sessionCalendar(data), calIdx = new Map(calendar.map((d, i) => [d, i])), byId = new Map(data.securities.map((s) => [s.id, s]));
  const base = M.cons.buildConstructions(data, {}), out = [];
  for (const m of base.months) {
    const rets = m.EW_MARKET.privateMembership.filter((id) => !exclude.has(id + '|' + m.month)).map((id) => M.cons.holdingReturn(byId.get(id), m.formation, m.end, calIdx)?.ret).filter(K.finite);
    out.push({ month: m.month, EW_MARKET: { ret: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null, count: rets.length } });
  }
  return out;
}
function corrOf(M, months, oracle) {
  const c = M.cmp.compareEwMarket(months, oracle.EW_MARKET);
  /* correlation, verdict and failed checks only: a mean difference plus the public French series would reveal the absolute
     mean return of the Tiingo-based EW portfolio (review IR-20) */
  return { correlation: K.r3(c.stats?.correlation), verdict: c.verdict, failedHardChecks: c.failedHardChecks ?? [], holdingCountRatioMean: K.r3(c.informational?.holdingCountRatioMean) };
}
function fullVariant(M, data, oracle) {
  const months = M.cons.buildConstructions(data, { keepMembership: false }).months;
  const ew = corrOf(M, months, oracle);
  const buckets = (key, id) => { try { return M.cmp.compareBuckets(months, oracle[key], key, id); } catch { return { verdict: 'NOT_COMPARABLE' }; } };
  const mom = buckets('MOM_12_2_EW_DECILES', 'FRENCH_MOM10_EW_DECILES'), vr = buckets('VAR_60D_EW_QUINTILES', 'FRENCH_VAR_EW_QUINTILES');
  return { EW_MARKET: ew, MOM_SPREAD_CORRELATION: K.r3(mom.spread?.stats?.correlation), MOM_MEDIAN_BUCKET_CORRELATION: K.r3(mom.medianBucketCorrelation), MOM_VERDICT: mom.verdict,
    VAR_SPREAD_CORRELATION: K.r3(vr.spread?.stats?.correlation), VAR_MEDIAN_BUCKET_CORRELATION: K.r3(vr.medianBucketCorrelation), VAR_VERDICT: vr.verdict };
}

export async function runPopulation(o) {
  const M = await K.loadModules(path.resolve(o['base-root']), path.resolve(o['v3-root']));
  const { raw, prepared } = o._loaded || K.loadCapture(M, o.capture);
  K.expectFingerprint(o['expect-fingerprint'], raw);
  const sec = K.loadSec(o.sec), finra = K.loadFinra(o.finra, M.FDL);
  const ca = path.resolve(o.ca);
  const { universe: U } = readJson(path.join(ca, 'universe.json'));
  const pop = readJson(path.join(ca, 'population.json')), scan = readJson(path.join(ca, 'scan.json')), ev = readJson(path.join(ca, 'evaluate.json'));
  const idx = new Map(U.map((u, i) => [u.id, i])), readRaw = (i) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ca, 'raw', `${i}.json.gz`))).toString('utf8'));
  const prepById = new Map(prepared.securities.map((s) => [s.id, s]));
  const rawCache = new Map(), rawOf = (id) => { const i = idx.get(id); if (i === undefined) return null; if (!rawCache.has(i)) { if (rawCache.size > 400) rawCache.clear(); rawCache.set(i, readRaw(i)); } return rawCache.get(i); };
  const levels = (ids) => { const seg = new Set(ids), secId = new Set(), cik = new Set(), tick = new Set(); for (const id of seg) { const u = U[idx.get(id)]; if (!u) continue; if (u.securityId) secId.add(u.securityId); if (u.cik) cik.add(u.cik); tick.add(u.ticker); } return { segmentsListings: seg.size, securityIds: secId.size, companiesCik: cik.size, tickers: tick.size }; };

  /* ---------- 1. denominators ---------- */
  const warm = M.protocol.window.warmupFrom, from = M.protocol.window.from;
  let storeBars = 0, storeBarsWarm = 0;
  for (const r of scan) { if (r.missing) continue; storeBars += r.bars; }
  for (let i = 0; i < U.length; i++) { if (scan[i]?.missing) continue; const rb = readRaw(i); storeBarsWarm += rb.filter((b) => b.date >= warm && b.date <= M.protocol.window.to).length; }
  const canonBars = prepared.securities.reduce((a, s) => a + s.bars.length, 0), canonBarsWindow = prepared.securities.reduce((a, s) => a + s.bars.filter((b) => b.date >= from).length, 0);
  const denominators = { universe: levels(U.map((u) => u.id)), storeBarsAllHistory: storeBars, storeBarsTournamentSpan: storeBarsWarm, tournamentCanonicalBars: canonBars, tournamentCanonicalBarsInMeasurementWindow: canonBarsWindow,
    tournamentSecurities: prepared.securities.length, tournamentQuarantined: prepared.securities.filter((s) => s.dataQuarantine).length, captureRejections: raw.coverage?.rejected ?? raw.coverage?.rejections ?? null };

  /* ---------- 2. populations ---------- */
  const k83 = ev.k83 || [], d2 = ev.d2 || [], e272 = ev.extreme272 || [], holds = ev.holds || [];
  const P = {
    V4_83_SECURITY_MONTHS: pop.extreme.filter((c) => c.in83), V4_74_HIGH_LEVEL: pop.highIds,
    D2_DEFECT_SECURITIES: d2.filter((r) => r.coreAccepts1_2_0 && ['DECLARED_SPLIT_INCONSISTENT', 'UNDECLARED_JUMP_IN_HISTORY', 'UNRESOLVED'].includes(r.cause)),
    V2_272_EXTREME_MOVES: e272, V3_HOLDS: holds, TOURNAMENT_QUARANTINES: prepared.securities.filter((s) => s.dataQuarantine),
  };
  const census = K.labelledCensus(M, prepared, sec, finra);
  const censusRows = []; for (const [id, evs] of census) for (const e of evs) censusRows.push({ id, ...e });
  const segsOf = {
    V4_83_SECURITY_MONTHS: P.V4_83_SECURITY_MONTHS.map((c) => c.id), V4_74_HIGH_LEVEL: P.V4_74_HIGH_LEVEL, D2_DEFECT_SECURITIES: P.D2_DEFECT_SECURITIES.map((r) => r.segmentId),
    V2_272_EXTREME_MOVES: e272.map((x) => x.segmentId), V3_HOLDS: holds.map((h) => h.segmentId), V3_CONFLICTING_HOLDS: holds.filter((h) => h.evidenceClass === 'CONFLICTING_CORPORATE_ACTION').map((h) => h.segmentId),
    TOURNAMENT_QUARANTINES: P.TOURNAMENT_QUARANTINES.map((s) => s.id), TOURNAMENT_CENSUS_EVENTS: censusRows.map((r) => r.id),
    TOURNAMENT_CENSUS_CONFIRMED: censusRows.filter((r) => r.label.cls === 'CONFIRMED_BY_INDEPENDENT_SOURCE').map((r) => r.id),
  };
  const populations = Object.fromEntries(Object.entries(segsOf).map(([k, ids]) => [k, { rows: ids.length, ...levels(ids) }]));
  populations.V4_83_SECURITY_MONTHS.securityMonths = new Set(P.V4_83_SECURITY_MONTHS.map((c) => c.id + '|' + c.month)).size;
  populations.V4_83_SECURITY_MONTHS.byClass = P.V4_83_SECURITY_MONTHS.reduce((a, c) => K.inc(a, c.cls), {});
  const keys = Object.keys(segsOf), sets = Object.fromEntries(keys.map((k) => [k, new Set(segsOf[k])]));
  const overlaps = {};
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) { let n = 0; for (const x of sets[keys[a]]) if (sets[keys[b]].has(x)) n++; if (n) overlaps[keys[a] + '&' + keys[b]] = n; }
  const unionAll = new Set(keys.filter((k) => !['TOURNAMENT_QUARANTINES', 'V3_HOLDS', 'V3_CONFLICTING_HOLDS'].includes(k)).flatMap((k) => [...sets[k]]));
  const unionWithProtective = new Set(keys.flatMap((k) => [...sets[k]]));
  const coverage = { segmentsWithCik: U.filter((u) => u.cik).length, segmentsWithShareRows: U.filter((u) => (u.shares || []).length > 1).length,
    segmentsWithFinraRows: prepared.securities.filter((s) => (finra.bySym.get(String(s.ticker).toUpperCase()) || []).length).length, finraIdentityBasis: 'SYMBOL_IN_LISTING_WINDOW (no name check)',
    tickersWithMoreThanOneCik: (() => { const m = new Map(); for (const u of U) if (u.cik) { if (!m.has(u.ticker)) m.set(u.ticker, new Set()); m.get(u.ticker).add(u.cik); } return [...m.values()].filter((x) => x.size > 1).length; })() };

  /* events joined on segment|day */
  const evKey = (id, d) => id + '|' + d, events = new Map();
  const addEv = (id, d, src, extra) => { if (!d) return; const k = evKey(id, d); if (!events.has(k)) events.set(k, { id, date: d, sources: new Set(), extra: {} }); const e = events.get(k); e.sources.add(src); Object.assign(e.extra, extra); };
  for (const x of e272) addEv(x.segmentId, x.date, 'V2_272', { v3: x.v3, independentNoVendor: x.independent, dir: x.dir });
  for (const r of censusRows) addEv(r.id, r.date, 'TOURNAMENT_CENSUS', { kind: r.kind, label: r.label.cls, channel: r.label.channel, strictCls: r.label.strictCls, direction: r.dir, dayHasDeclaredSplit: r.kind === 'DECLARED_SPLIT_RESIDUAL', inTournamentValidPrefix: true, rawRatio: r.rawRatio });
  for (const c of k83) { const [id] = c.key.split('|'); addEv(id, c.dominantDay, 'V4_83_DOMINANT_DAY', { cause83: c.cause, defect83: c.defect }); }
  for (const r of d2) for (const dd of r.days || []) addEv(r.segmentId, dd.date, 'D2_DEFECT_DAY', { d2Kind: dd.kind, d2Cause: r.cause });
  const evRows = [];
  for (const e of events.values()) {
    const rb = rawOf(e.id), s = prepById.get(e.id), u = U[idx.get(e.id)];
    const locus = rb ? providerLocus(rb, e.date) : 'NO_STORE_SERIES';
    let label = e.extra.label ?? null, channel = e.extra.channel ?? null, strictCls = e.extra.strictCls ?? null;
    if (!label && s) { const k = s.bars.findIndex((b) => b.date === e.date); if (k > 0) { const a = s.bars[k - 1], b = s.bars[k]; const declared = K.finite(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9;
      const lb = K.labelEvent(M, s, { date: e.date, kind: declared ? 'DECLARED_SPLIT_RESIDUAL' : 'UNDECLARED_RAW_JUMP_10X', rawRatio: b.rawClose / a.rawClose, trStep: b.totalReturnIndex / a.totalReturnIndex }, sec, finra);
      label = lb.cls; channel = lb.channel; strictCls = lb.strictCls; e.extra.dayHasDeclaredSplit = declared; e.extra.direction = b.rawClose > a.rawClose ? 'UP' : 'DOWN'; } }
    const k0 = rb ? rb.findIndex((b) => b.date === e.date) : -1, priorRaw = k0 > 0 ? rb[k0 - 1].close : null;
    const inPrefix = !!(s && s.bars.some((b) => b.date === e.date));
    evRows.push({ id: e.id, ticker: u?.ticker ?? null, securityId: u?.securityId ?? null, cik: u?.cik ?? null, date: e.date, sources: [...e.sources].sort(), locus, independent: label ?? e.extra.independentNoVendor ?? 'NOT_LABELED', channel, strictCls: strictCls ?? (label ? label : null),
      inTournamentValidPrefix: inPrefix, priorRawClose: priorRaw, exchange: exchangeOf(e.id), ...e.extra });
  }
  const tally = (rows, f) => rows.reduce((a, r) => K.inc(a, f(r)), {});
  const eventStats = { distinctEvents: evRows.length, bySourceCombination: tally(evRows, (r) => r.sources.join('+')), byProviderLocus: tally(evRows, (r) => r.locus), byIndependentNoVendor: tally(evRows, (r) => r.independent),
    byLocusAndIndependent: tally(evRows, (r) => r.locus + '|' + r.independent), byConfirmationChannel: tally(evRows.filter((r) => r.channel), (r) => r.channel),
    censusByKindAndChannel: tally(censusRows, (r) => r.kind + '|' + (r.label.channel ?? r.label.cls)), insideTournamentValidPrefix: evRows.filter((r) => r.inTournamentValidPrefix).length,
    byYear: tally(evRows, (r) => year(r.date)), byPriorRawPrice: tally(evRows, (r) => priceBucket(r.priorRawClose)), byExchange: tally(evRows, (r) => r.exchange),
    securitiesWithEvents: levels(evRows.map((r) => r.id)), unionOfIssuePopulations: levels([...unionAll]), unionOfEventPopulationsDefinition: '83 + 74 + D2 + 272 + census (holds and quarantines excluded: protective decisions, not findings)',
    unionIncludingHoldsAndQuarantines: levels([...unionWithProtective]), byStrictClass: tally(evRows, (r) => r.strictCls ?? 'NOT_LABELED'), evidenceCoverage: coverage };
  /* bars: one return day per event, the level shift of every later bar inside the valid prefix, bars lost to quarantine */
  let levelShiftedBars = 0; for (const r of censusRows) { const s = prepById.get(r.id); levelShiftedBars += s.bars.length - r.i; }
  const lostToQuarantine = P.TOURNAMENT_QUARANTINES.reduce((a, s) => { const rb = rawOf(s.id); return a + (rb ? rb.filter((b) => b.date > s.bars.at(-1).date && b.date <= (s.listing?.endDate || M.protocol.window.to) && b.date <= M.protocol.window.to).length : 0); }, 0);
  const bars = { censusReturnDaysInValidPrefix: censusRows.length, censusLevelShiftedBarsAfterEvent: levelShiftedBars, barsAfterQuarantineNotUsed: lostToQuarantine,
    shareOfTournamentBars: { returnDays: K.r4(censusRows.length / canonBars), levelShifted: K.r4(levelShiftedBars / canonBars), lostToQuarantine: K.r4(lostToQuarantine / storeBarsWarm) },
    quarantinesByReason: tally(P.TOURNAMENT_QUARANTINES, (s) => s.dataQuarantine.reason), quarantinesByYear: tally(P.TOURNAMENT_QUARANTINES, (s) => year(s.dataQuarantine.from)) };

  /* 83 cases: forensic cause (#722 finalCause, recomputed by v3) x independent label of the dominant day */
  const evByKey = new Map(evRows.map((r) => [evKey(r.id, r.date), r]));
  const k83Rows = k83.map((c) => { const [id, month] = c.key.split('|'); const e = c.dominantDay ? evByKey.get(evKey(id, c.dominantDay)) : null; return { id, month, cls: c.cls, cause: c.cause, defect: c.defect, dominantDay: c.dominantDay, independent: e?.independent ?? 'NO_DOMINANT_DAY', strictCls: e?.strictCls ?? null, direction: e?.direction ?? null, priorPrice: e ? priceBucket(e.priorRawClose) : null, channel: e?.channel ?? null, dayHasDeclaredSplit: e?.dayHasDeclaredSplit ?? null, locus: e?.locus ?? null, v3ValidReturn: c.v3ValidReturn, v3StillExtreme: c.v3StillExtreme }; });
  const cases83 = { rows: k83Rows.length, byCause: tally(k83Rows, (r) => r.cause), byDefect: tally(k83Rows, (r) => String(r.defect)), byIndependent: tally(k83Rows, (r) => r.independent), byCauseAndIndependent: tally(k83Rows, (r) => r.cause + '|' + r.independent),
    byCauseAndLocus: tally(k83Rows, (r) => r.cause + '|' + r.locus), byClassCauseIndependent: tally(k83Rows, (r) => r.cls + '|' + r.cause + '|' + r.independent),
    byClassAndChannel: tally(k83Rows, (r) => r.cls + '|' + (r.channel ?? r.independent)), byCauseAndStrict: tally(k83Rows, (r) => r.cause + '|' + r.strictCls),
    byClassDirectionPrice: tally(k83Rows, (r) => r.cls + '|' + r.direction + '|' + r.priorPrice), byIndependentDirectionPrice: tally(k83Rows, (r) => r.independent + '|' + r.direction + '|' + r.priorPrice), dominantDayIsDeclaredSplit: tally(k83Rows, (r) => String(r.dayHasDeclaredSplit)), v3: tally(k83Rows, (r) => (r.v3ValidReturn ? (r.v3StillExtreme ? 'VALID_STILL_EXTREME' : 'VALID') : 'NOT_VALID')) };
  const d2Rows = P.D2_DEFECT_SECURITIES.map((r) => ({ id: r.segmentId, cause: r.cause, days: (r.days || []).map((d) => ({ date: d.date, kind: d.kind, independent: evByKey.get(evKey(r.segmentId, d.date))?.independent ?? null, strictCls: evByKey.get(evKey(r.segmentId, d.date))?.strictCls ?? null, locus: evByKey.get(evKey(r.segmentId, d.date))?.locus ?? null, v3Valid: d.v3ValidReturn })) }));
  const d2Summary = { securities: d2Rows.length, byCause: tally(d2Rows, (r) => r.cause), dayIndependent: tally(d2Rows.flatMap((r) => r.days), (d) => d.independent), dayStrict: tally(d2Rows.flatMap((r) => r.days), (d) => d.strictCls ?? 'NOT_LABELED'), daysInsideCensus: d2Rows.flatMap((r) => r.days.map((d) => evByKey.get(evKey(r.id, d.date)))).filter((e) => e?.sources?.includes('TOURNAMENT_CENSUS')).length, dayLocus: tally(d2Rows.flatMap((r) => r.days), (d) => d.locus) };
  const e272Summary = { rows: e272.length, reproducesV3Count: e272.length === 272, byIndependentNoVendor: tally(e272, (x) => x.independent), byV3: tally(e272, (x) => x.v3), byDir: tally(e272, (x) => x.dir),
    byLocus: tally(e272.map((x) => evByKey.get(evKey(x.segmentId, x.date))), (r) => r?.locus ?? 'UNKNOWN') };
  const holdSummary = { holds: holds.length, byReason: tally(holds, (h) => h.reason), courseOnly: holds.filter((h) => h.courseOnly).length, conflicting: holds.filter((h) => h.evidenceClass === 'CONFLICTING_CORPORATE_ACTION').length, resumedBarsAfterHolds: holds.reduce((a, h) => a + (h.resumedBarsAfter || 0), 0) };

  /* ---------- 4. French oracle attribution ---------- */
  let french = null;
  if (o._oracle || (o['oracle-parsed'] && fs.existsSync(o['oracle-parsed']))) {
    const oracle = o._oracle || readJson(o['oracle-parsed']).parsed;
    const census4 = M.sanity.priceSanityCensus(prepared.securities);
    const v4 = M.policy.applyCausalTerminals(M.sanity.applyPriceSanityQuarantine(prepared, census4).data).data;
    let ewSecurityMonths = 0;
    const ext = [], calendar = M.cons.sessionCalendar(v4), calIdx = new Map(calendar.map((d, i) => [d, i])), byId = new Map(v4.securities.map((s) => [s.id, s]));
    for (const m of M.cons.buildConstructions(v4, {}).months) for (const id of m.EW_MARKET.privateMembership) {
      const s = byId.get(id), h = M.cons.holdingReturn(s, m.formation, m.end, calIdx);
      if (h && K.finite(h.ret)) ewSecurityMonths++;
      if (!h || !K.finite(h.ret) || Math.abs(h.ret) <= 1) continue;
      ext.push({ key: id + '|' + m.month, cls: M.diag.classifyOutlier(M.diag.signature(s, m.formation, m.end)) });
    }
    const flagged = ext.filter((x) => x.cls !== 'UNEXPLAINED_PRICE_MOVE' && x.cls !== 'SUB_DOLLAR_GENUINE_OR_UNVERIFIED');
    const k83ByKey = new Map(k83Rows.map((r) => [r.id + '|' + r.month, r]));
    const set = (rows) => new Set(rows.map((x) => x.key));
    const ewVariants = {
      BASELINE: new Set(), EXCLUDE_83_DATA_SIGNATURE: set(flagged), EXCLUDE_ALL_ABS_RET_GT_100PCT: set(ext),
      EXCLUDE_83_FORENSIC_DEFECT_ONLY: set(flagged.filter((x) => k83ByKey.get(x.key)?.defect === true)), EXCLUDE_83_FORENSIC_GENUINE_ONLY: set(flagged.filter((x) => k83ByKey.get(x.key)?.defect === false)),
      EXCLUDE_83_INDEPENDENTLY_CONFIRMED_ONLY: set(flagged.filter((x) => k83ByKey.get(x.key)?.independent === 'CONFIRMED_BY_INDEPENDENT_SOURCE')),
      EXCLUDE_83_NOT_INDEPENDENTLY_CONFIRMED: set(flagged.filter((x) => k83ByKey.get(x.key)?.independent !== 'CONFIRMED_BY_INDEPENDENT_SOURCE')),
      EXCLUDE_83_CONFIRMED_BY_STATED_RATIO_ONLY: set(flagged.filter((x) => ['FINRA', 'SEC_8K'].includes(k83ByKey.get(x.key)?.channel))),
      EXCLUDE_83_FORENSIC_DEFECT_AND_UNDECLARED: set(flagged.filter((x) => k83ByKey.get(x.key)?.defect === true && x.cls === 'UNDECLARED_RAW_JUMP_10X')),
      EXCLUDE_83_UNDECLARED_NOT_CONFIRMED: set(flagged.filter((x) => x.cls === 'UNDECLARED_RAW_JUMP_10X' && k83ByKey.get(x.key)?.independent !== 'CONFIRMED_BY_INDEPENDENT_SOURCE')),
      EXCLUDE_83_STRICTLY_CONFIRMED_ONLY: set(flagged.filter((x) => k83ByKey.get(x.key)?.strictCls === 'CONFIRMED_BY_INDEPENDENT_SOURCE')),
      EXCLUDE_83_NOT_STRICTLY_CONFIRMED: set(flagged.filter((x) => k83ByKey.get(x.key)?.strictCls !== 'CONFIRMED_BY_INDEPENDENT_SOURCE')),
      EXCLUDE_83_UNDECLARED_CONFIRMED: set(flagged.filter((x) => x.cls === 'UNDECLARED_RAW_JUMP_10X' && k83ByKey.get(x.key)?.independent === 'CONFIRMED_BY_INDEPENDENT_SOURCE')),
      EXCLUDE_UNDECLARED_RAW_JUMP_10X_ONLY: set(flagged.filter((x) => x.cls === 'UNDECLARED_RAW_JUMP_10X')), EXCLUDE_DECLARED_SPLIT_IN_MONTH_ONLY: set(flagged.filter((x) => x.cls === 'DECLARED_SPLIT_IN_MONTH')),
    };
    const ew = {}; for (const [k, ex] of Object.entries(ewVariants)) ew[k] = { excludedSecurityMonths: ex.size, ...corrOf(M, ewVariant(M, v4, ex), oracle) };
    const indep = (ev2) => (ev2.label.cls !== 'CONFIRMED_BY_INDEPENDENT_SOURCE' ? null : ev2.kind === 'UNDECLARED_RAW_JUMP_10X' && K.finite(ev2.label.statedRatio) ? 'NORMALIZE' : 'CUT');
    const tc = (d) => M.policy.applyCausalTerminals(d).data;
    const full = {
      V4_BASELINE: fullVariant(M, v4, oracle),
      TOURNAMENT_DATA_NO_V4_SANITY: fullVariant(M, tc(prepared), oracle),
      C_INDEPENDENT_CORRECTIONS: fullVariant(M, tc(K.applyEvents(prepared, census, indep).data), oracle),
      C2_STRICT_CORRECTIONS: fullVariant(M, tc(K.applyEvents(prepared, census, (x) => (x.label.strictCls !== 'CONFIRMED_BY_INDEPENDENT_SOURCE' ? null : x.kind === 'UNDECLARED_RAW_JUMP_10X' && K.finite(x.label.statedRatio) ? 'NORMALIZE' : 'CUT')).data), oracle),
      D_CUT_ALL_CENSUS_EVENTS: fullVariant(M, tc(K.applyEvents(prepared, census, (x) => indep(x) || 'CUT').data), oracle),
      D_CUT_ALL_CENSUS_EVENTS_PLUS_V4_SANITY: (() => { const x = K.applyEvents(prepared, census, (y) => indep(y) || 'CUT').data, c4 = M.sanity.priceSanityCensus(x.securities); return fullVariant(M, tc(M.sanity.applyPriceSanityQuarantine(x, c4).data), oracle); })(),
      E_WHOLE_SERIES_DROP: fullVariant(M, K.dropQuarantined(tc(prepared)).data, oracle),
    };
    let gap = 0, gapFlag = 0; const base = ewVariant(M, v4, new Set()), ref = new Map(oracle.EW_MARKET.map((r) => [r.month, r.ret])), flagMonths = new Set(flagged.map((x) => x.key.split('|')[1]));
    for (const m of base) { const r0 = ref.get(m.month); if (!K.finite(r0) || !K.finite(m.EW_MARKET.ret)) continue; const g2 = (m.EW_MARKET.ret - r0) ** 2; gap += g2; if (flagMonths.has(m.month)) gapFlag += g2; }
    french = { ewSecurityMonths, ewExclusionVariants: ew, fullConstructionVariants: full, extremeSecurityMonths: ext.length, flagged83: flagged.length, squaredGapShareInMonthsWithFlaggedCases: K.r3(gapFlag / gap), v4PriceSanity: { affected: census4.affected, defectQuarantined: census4.defectQuarantined, byClass: census4.byClass } };
  }

  const priv = { evRows, k83Rows, d2Rows, census: censusRows.map((r) => ({ id: r.id, date: r.date, kind: r.kind, rawRatio: r.rawRatio, label: r.label })) };
  const sealed = K.sealForOwner(M, Buffer.from(JSON.stringify({ schema: 'vu-root-cause-population-private-1.0.0', ...priv })), path.join(o['sealed-dir'], 'POPULATION-CASES.owner.sealed.json'));
  const pub = { schema: 'vu-root-cause-population-public-1.0.0', version: K.VERSION, kind: 'DIAGNOSTIC_NOT_CERTIFYING', runId: process.env.GITHUB_RUN_ID ?? null, sourceDataFingerprint: raw.fingerprint,
    inputs: { secAvailable: sec.available, finraAvailable: finra.available, vendorUsed: false, v3StagesRunWithoutVendor: true }, census: K.CENSUS,
    denominators, populations, overlaps, eventStats, bars, cases83, d2: d2Summary, extreme272: e272Summary, holds: holdSummary, french, sealed, performanceCalculated: false };
  K.writeJson(o['public-out'], pub);
  return pub;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPopulation(K.args(process.argv.slice(2))).then((p) => process.stdout.write(JSON.stringify({ denominators: p.denominators, events: p.eventStats.distinctEvents }) + '\n'))
    .catch((e) => { process.stderr.write(JSON.stringify({ phase: 'ROOT_CAUSE_POPULATION', code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'PRIVATE_RUN_FAILURE', hint: /^[A-Za-z0-9 ,.:'()_\-/]{1,160}$/.test(e.message) ? e.message : null, stack: (e.stack || '').split('\n').slice(1, 6).map((l) => l.replace(/\(.*\/scripts\//, '(scripts/')).join(' | ') }) + '\n'); process.exitCode = 1; });
}
