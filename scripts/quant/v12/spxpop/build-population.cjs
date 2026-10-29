#!/usr/bin/env node
'use strict';
/* V12 SPXPOP: PIT index population with period price returns from the fund holdings themselves (rules-1.1.0.json, amending 1.0.0/1.0.1).
 * Inputs (private, INDEXPOP): work/snapshots.json, work/mapping-1.2.0.json, work/fates-1.2.0.json, http-cache (N-PORT
 * monthly total returns). Repository (read-only): weekly series, multi-asset fund series, lifecycle register.
 * Outputs: --out-dir (repo evidence: population gz, periods, validation, summary, manifest) and --work (private detail).
 * Usage: node build-population.cjs --private <indexpop private dir> --work <spxpop private dir> --out-dir <dir> */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const L = require(path.join(ROOT, 'scripts/quant/v12/indexpop/lib.cjs'));
const IP = require(path.join(ROOT, 'quant/engines/research-index-population.cjs'));
const RS = require(path.join(ROOT, 'quant/engines/return-series.js'));
const contract = require(path.join(ROOT, 'quant/engines/research-contract.cjs'));
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PRIV = arg('--private'), WORK = arg('--work'), OUT = arg('--out-dir');
if (!PRIV || !WORK || !OUT) throw Error('usage: --private <dir> --work <dir> --out-dir <dir>');
const V = IP.RULE.version;
const RULES_FILE = path.join(ROOT, 'docs/quant-recovery/v12/spxpop/rules-' + V + '.json');
const RULES = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
if (RULES.ruleVersion !== IP.RULE.version) throw Error('RULE_VERSION_MISMATCH');
const R = IP.RULE;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const day = d => Date.parse(d + 'T00:00:00Z') / 864e5;
const FUND_ORDER = ['IWV', 'IWB', 'IWM', 'SPY', 'QQQ'];
// 1.1.0: DIA is price-weighted; share-ratio split detection does not apply (rules populations.notApplicable)
const NOT_APPLICABLE = new Set((RULES.populations.notApplicable || []).map(p => p.fund));
// member columns are published for these funds; IWV (Russell 3000 ~ IWB + IWM) only as period summary (repository size budget)
const PUBLISH_MEMBERS = new Set(['SPY', 'IWB', 'IWM', 'QQQ']);
const MC = require(path.join(ROOT, 'quant/engines/research-pit-market-cap.cjs'));

// ---------------------------------------------------------------- inputs
const snapFile = path.join(PRIV, 'work/snapshots.json'), mapFile = path.join(PRIV, 'work/mapping-1.2.0.json'), fateFile = path.join(PRIV, 'work/fates-1.2.0.json');
const SN = JSON.parse(fs.readFileSync(snapFile, 'utf8')).snapshots.filter(s => s.validation && s.validation.valid);
const M = JSON.parse(fs.readFileSync(mapFile, 'utf8')).mapping;
const fateIdx = new Map();
for (const x of JSON.parse(fs.readFileSync(fateFile, 'utf8')).exits) { const k = x.fund + '|' + x.lastHoldingDate + '|' + x.name; if (!fateIdx.has(k)) fateIdx.set(k, x.fate || 'NOT_FATED'); }
const LC = require(path.join(ROOT, 'quant/engines/research-listing-lifecycle.cjs')).records;
const lcBySid = new Map(LC.map(r => [r.securityId, r])), lcByCik = new Map();
for (const r of LC) if (r.cik) lcByCik.set(String(+r.cik), r);
const inputHashes = { snapshots: sha(fs.readFileSync(snapFile)), mapping: sha(fs.readFileSync(mapFile)), fates: sha(fs.readFileSync(fateFile)), rules: sha(fs.readFileSync(RULES_FILE)) };

const fundSeries = {};
for (const f of ['SPY', 'QQQ', 'DIA', 'IWM']) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/multi-asset/series', f + '.json'), 'utf8'));
  fundSeries[f] = d.points; inputHashes['fundSeries_' + f] = sha(JSON.stringify(d.points));
}
function closeOnOrBefore(points, date) { let lo = 0, hi = points.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (points[m][0] <= date) { r = points[m]; lo = m + 1; } else hi = m - 1; } return r; }
function fundReturn(f, t0, t1) {
  const p = fundSeries[f]; if (!p) return null;
  const a = closeOnOrBefore(p, t0), b = closeOnOrBefore(p, t1);
  if (!a || !b || day(t0) - day(a[0]) > 5 || day(t1) - day(b[0]) > 5) return null;
  return b[1] / a[1] - 1;
}
const CACHE = path.join(PRIV, 'http-cache');
const trCache = new Map();
function nportTR(s) { // compounded monthly total return of the 3 months ending at the report date
  if (s.kind !== 'NPORT') return null;
  if (trCache.has(s.src.url)) return trCache.get(s.src.url);
  const buf = L.readCached(CACHE, s.src.url); let v = null;
  if (buf) { const m = buf.toString('utf8').match(/<monthlyTotReturn\b[^>]*?rtn1="([-0-9.]+)"[^>]*?rtn2="([-0-9.]+)"[^>]*?rtn3="([-0-9.]+)"/); if (m) v = (1 + m[1] / 100) * (1 + m[2] / 100) * (1 + m[3] / 100) - 1; }
  trCache.set(s.src.url, v); return v;
}

// weekly series (read-only)
const SERIES_DIR = path.join(ROOT, 'quant/data/market/discover-series-long');
const serCache = new Map();
function series(id) {
  if (serCache.has(id)) return serCache.get(id);
  const f = path.join(SERIES_DIR, id + '.json'); if (!fs.existsSync(f)) { serCache.set(id, null); return null; }
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const pts = d.points.filter(p => p[1] > 0);
  const splits = ((d.corporateActions && d.corporateActions.splits) || []).filter(s => s[1] > 0 && s[1] !== 1);
  let end = pts.length ? pts.at(-1)[0] : null, endReason = 'LAST_BAR';
  const lc = lcBySid.get(id);
  if (lc && lc.lastTradeDate) { end = lc.lastTradeDate; endReason = 'LIFECYCLE_LAST_TRADE'; }
  else if (pts.length >= R.FROZEN_RUN) { let k = pts.length - 1; while (k > 0 && pts[k - 1][1] === pts.at(-1)[1]) k--; if (pts.length - k >= R.FROZEN_RUN) { end = pts[k][0]; endReason = 'FROZEN_TAIL'; } }
  const s = { pts, splits, end, endReason };
  serCache.set(id, s); return s;
}
function barOnOrBefore(s, date) { const b = closeOnOrBefore(s.pts, date); return b && day(date) - day(b[0]) <= R.SERIES_MAX_GAP_DAYS ? b : null; }
/** provider split product over (t0, t1] with the return-series.js#splitFactors convention (ADR-002) */
function providerFactor(s, t0, t1) {
  const bars = s.splits.map(x => ({ date: x[0], splitFactor: x[1], isSplit: true })).concat([{ date: t0, m: 0 }, { date: t1, m: 1 }]);
  bars.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.isSplit ? -1 : 1));
  const f = RS.splitFactors(bars), i0 = bars.findIndex(b => b.m === 0), i1 = bars.findIndex(b => b.m === 1);
  return f[i0] / f[i1];
}

// ---------------------------------------------------------------- positions
// bug fix before publication: some INDEXPOP report names carry page-break headings ("(Percentages shown are based on Net
// Assets) Biotechnology (continued) Amgen Inc.", 203 rows in IWB/IWM/IWV/QQQ); they are removed for the identity chain only.
const cleanName = n => String(n || '').replace(/^.*\(continued\)\s*/i, '').replace(/^\s*\(Percentages shown are based on [^)]*\)\s*/i, '').trim() || String(n || '');
const ISIN_RE = /^[A-Z]{2}[0-9A-Z]{9}[0-9]$/;
function positions(s) {
  const keys = L.positionKeys(s), total = s.members.reduce((a, m) => a + m.value, 0);
  return s.members.map((m, i) => {
    const k = keys[i], e = M[k] || null, v = e && e.dateMap ? e.dateMap[s.date] : null;
    const name = cleanName(m.name), nn = L.normName(m.title && L.normName(m.title).cls ? m.title : name);
    return { i, key: k, name, rawName: m.name, cusip: L.validCusip(m.cusip) ? m.cusip : null, isin: m.isin && ISIN_RE.test(m.isin) && !/^[A-Z]{2}0{9}/.test(m.isin) ? m.isin : null,
      nk: nn.key ? nn.key + '|' + (nn.cls || '') : null, nameKey: nn.key, cik: e && e.cik ? String(+e.cik) : null, sid: v && v.startsWith('ref_') ? v : null,
      shares: m.shares, value: m.value, p: m.value / m.shares, w: m.value / total };
  }).filter(p => p.value > 0 && p.shares > 0).map((p, i) => ({ ...p, i })); // zero-value lines (escrows) carry no weight
}
const byFund = new Map();
for (const s of SN) { if (!byFund.has(s.fund)) byFund.set(s.fund, []); byFund.get(s.fund).push(s); }
for (const l of byFund.values()) l.sort((a, b) => a.date < b.date ? -1 : 1);
const POS = new Map(); // fund|date -> positions
for (const s of SN) POS.set(s.fund + '|' + s.date, positions(s));
// last date each identity token is seen per fund (temporary absence)
const lastSeen = new Map();
for (const s of SN) for (const p of POS.get(s.fund + '|' + s.date)) for (const t of [p.key, p.nk && 'N' + p.nk, p.cik && 'K' + p.cik, p.cusip && 'C' + p.cusip]) if (t) { const k = s.fund + '|' + t; if (!lastSeen.has(k) || lastSeen.get(k) < s.date) lastSeen.set(k, s.date); }

// ---------------------------------------------------------------- linking + split classification per period
function groupBy(idx, f) { const g = new Map(); for (const i of idx) { const k = f(i); if (!k) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(i); } return g; }
function linkPeriod(A, B) {
  const la = new Int32Array(A.length).fill(-1), lb = new Int32Array(B.length).fill(-1), tier = new Array(A.length).fill(null);
  const set = (a, b, t) => { la[a] = b; lb[b] = a; tier[a] = t; };
  const uniq = (arr, f) => { const m = new Map(); arr.forEach((x, j) => { const k = f(x); if (!k) return; m.set(k, m.has(k) ? -2 : j); }); return m; };
  const bC = uniq(B, x => x.cusip), bI = uniq(B, x => x.isin);
  A.forEach((a, i) => { let j = -1; if (a.cusip && bC.get(a.cusip) >= 0) j = bC.get(a.cusip); else if (a.isin && bI.get(a.isin) >= 0) j = bI.get(a.isin); if (j >= 0 && lb[j] < 0) set(i, j, 'C1_CUSIP'); });
  const freeA = () => A.map((_, i) => i).filter(i => la[i] < 0), freeB = () => B.map((_, j) => j).filter(j => lb[j] < 0);
  let ga = groupBy(freeA(), i => A[i].nk), gb = groupBy(freeB(), j => B[j].nk); const dups = [];
  for (const [k, ia] of ga) { const ib = gb.get(k); if (!ib) continue; if (ia.length === 1 && ib.length === 1) set(ia[0], ib[0], 'C2_NAME'); else dups.push([ia, ib]); }
  // fund flow and preliminary index return from C1/C2
  const flowAndIndex = () => {
    const ls = []; for (let i = 0; i < A.length; i++) if (la[i] >= 0 && (tier[i] === 'C1_CUSIP' || tier[i] === 'C2_NAME')) ls.push(i);
    const F = IP.median(ls.map(i => B[la[i]].shares / A[i].shares));
    let sw = 0, sr = 0; for (const i of ls) { const q = B[la[i]].shares / A[i].shares / F; if (Math.abs(Math.log(q)) < R.CLEAN_LOG) { sw += A[i].w; sr += A[i].w * (B[la[i]].p / A[i].p - 1); } }
    return { F, ridx: sw > 0 ? sr / sw : null, nBase: ls.length };
  };
  let fi = flowAndIndex();
  const base = Math.log(1 + (fi.ridx || 0));
  for (const [ia, ib] of dups) {
    const pairs = []; for (const i of ia) for (const j of ib) pairs.push([Math.abs(Math.log(B[j].p / A[i].p) - base), i, j]);
    pairs.sort((x, y) => x[0] - y[0]);
    for (const [, i, j] of pairs) if (la[i] < 0 && lb[j] < 0) set(i, j, 'C2_NAME_DUP');
  }
  ga = groupBy(freeA(), i => A[i].cik); gb = groupBy(freeB(), j => B[j].cik);
  for (const [k, ia] of ga) { const ib = gb.get(k); if (ib && ia.length === 1 && ib.length === 1) set(ia[0], ib[0], 'C3_CIK'); }
  // C4 fuzzy, mutual unique best, plausible
  const fa = freeA(), fb = freeB(), best = (i, cands, simOf) => { let b = -1, bs = -1, tie = false; for (const j of cands) { const s = simOf(i, j); if (s > bs) { bs = s; b = j; tie = false; } else if (s === bs) tie = true; } return bs >= R.FUZZY_SIM && !tie ? b : -1; };
  const simAB = (i, j) => L.tokenSim(A[i].nameKey || '', B[j].nameKey || '');
  const bestB = new Map(fb.map(j => [j, best(j, fa, (jj, i) => simAB(i, jj))]));
  for (const i of fa) {
    const j = best(i, fb, simAB); if (j < 0 || bestB.get(j) !== i) continue;
    const q = B[j].shares / A[i].shares / fi.F, pr = B[j].p / A[i].p, near = IP.nearestRatio(q);
    const eN = Math.log(pr) - base, eS = Math.log(near.ratio.value * pr) - base;
    if ((Math.abs(Math.log(q)) <= R.FUZZY_Q_LOG || near.dist <= R.RATIO_TOL) && (Math.abs(eN) <= R.FUZZY_RESID || Math.abs(eS) <= R.FUZZY_RESID)) set(i, j, 'C4_FUZZY');
  }
  const links = [];
  for (let i = 0; i < A.length; i++) if (la[i] >= 0) {
    const j = la[i], q = B[j].shares / A[i].shares / fi.F, pr = B[j].p / A[i].p;
    links.push({ a: i, b: j, tier: tier[i], q, pr, ...IP.classifySplit(q, pr, fi.ridx) });
  }
  // possible identity breaks
  const ex = freeA(), en = freeB(); let breaks = 0; const breakList = [];
  for (const i of ex) { const j = en.find(jj => (A[i].cik && A[i].cik === B[jj].cik) || L.tokenSim(A[i].nameKey || '', B[jj].nameKey || '') >= R.BREAK_SIM); if (j !== undefined) { breaks++; if (breakList.length < 5) breakList.push([A[i].name, B[j].name]); } }
  return { links, la, lb, F: fi.F, ridx: fi.ridx, nBase: fi.nBase, exits: ex, entries: en, breaks, breakList };
}

const PERIODS = [];
for (const [fund, list] of byFund) for (let k = 0; k + 1 < list.length; k++) {
  const s0 = list[k], s1 = list[k + 1], A = POS.get(fund + '|' + s0.date), B = POS.get(fund + '|' + s1.date);
  PERIODS.push({ fund, t0: s0.date, t1: s1.date, s0, s1, A, B, ...linkPeriod(A, B) });
}
// cross-fund index of non-ambiguous own-fund links by (t0, t1, identity)
const xIdx = new Map();
for (const P of PERIODS) for (const l of P.links) {
  if (l.point == null || NOT_APPLICABLE.has(P.fund)) continue; const a = P.A[l.a];
  for (const t of [a.cusip && 'C' + a.cusip, a.isin && 'I' + a.isin, a.cik && 'K' + a.cik, a.nk && 'N' + a.nk]) if (t) { const k = P.t0 + '|' + P.t1 + '|' + t; if (!xIdx.has(k)) xIdx.set(k, []); xIdx.get(k).push({ fund: P.fund, point: l.point, p0: a.p, cls: l.cls }); }
}
/** Same security in other funds over the same (t0, t1): CUSIP, ISIN, name key (incl. share class), then CIK; a token
 * that hits more than one position of a fund (dual share classes share a CIK, e.g. GOOGL/GOOG) is not used for that fund
 * (bug fix before publication: the first 1.1.0 build tried the CIK before the name key and took the first hit). */
function xLookup(P, a, allowFund) {
  for (const t of [a.cusip && 'C' + a.cusip, a.isin && 'I' + a.isin, a.nk && 'N' + a.nk, a.cik && 'K' + a.cik]) {
    if (!t) continue;
    const c = (xIdx.get(P.t0 + '|' + P.t1 + '|' + t) || []).filter(x => allowFund(x.fund) && Math.abs(a.p / x.p0 - 1) <= R.CROSS_PRICE_TOL);
    const per = new Map(); for (const x of c) per.set(x.fund, (per.get(x.fund) || 0) + 1);
    const u = c.filter(x => per.get(x.fund) === 1);
    if (u.length) { u.sort((x, y) => FUND_ORDER.indexOf(x.fund) - FUND_ORDER.indexOf(y.fund)); return { ...u[0], via: t[0] }; }
  }
  return null;
}
function crossFund(P, a) { return xLookup(P, a, f => f !== P.fund); }

// ---------------------------------------------------------------- statuses per t0 member
function exitFate(P, a) {
  const f = fateIdx.get(P.fund + '|' + P.t0 + '|' + a.rawName);
  if (f) return f;
  for (const t of [a.key, a.nk && 'N' + a.nk, a.cik && 'K' + a.cik, a.cusip && 'C' + a.cusip]) if (t && (lastSeen.get(P.fund + '|' + t) || '') > P.t1) return 'TEMPORARY_ABSENCE';
  return 'NOT_FATED';
}
const statusCounts = {};
for (const P of PERIODS) {
  const rows = new Array(P.A.length);
  for (const l of P.links) {
    const a = P.A[l.a];
    if (l.cls === 'AMBIGUOUS_CA') rows[l.a] = { status: 'BOUNDED_AMBIGUOUS_CA', point: null, lo: l.lo, hi: l.hi, tier: l.tier, cls: l.cls, sf: null, fate: '' };
    else rows[l.a] = { status: 'OBS_CHAIN', point: l.point, lo: l.point, hi: l.point, tier: l.tier, cls: l.cls, sf: l.factor, fate: '' };
    rows[l.a].sid = a.sid || P.B[l.b].sid;
  }
  for (const i of P.exits) {
    const a = P.A[i], fate = exitFate(P, a), r = { tier: 'NONE', cls: 'NA', sf: null, fate, sid: a.sid };
    const x = crossFund(P, a);
    if (x) { Object.assign(r, { status: 'OBS_CROSSFUND', point: x.point, lo: x.point, hi: x.point, via: x.fund + ':' + x.via }); rows[i] = r; continue; }
    const s = a.sid ? series(a.sid) : null, b0 = s ? barOnOrBefore(s, P.t0) : null;
    const lc = (a.sid && lcBySid.get(a.sid)) || (a.cik && lcByCik.get(a.cik)) || null;
    if (s && b0) {
      const b1 = barOnOrBefore(s, P.t1);
      if (b1 && b1[0] <= s.end && b1[0] > b0[0]) { Object.assign(r, { status: 'OBS_SERIES', point: b1[1] / b0[1] - 1 }); r.lo = r.hi = r.point; rows[i] = r; continue; }
    }
    if (lc && lc.terminal && lc.terminal.kind === 'CASH_MERGER' && lc.terminal.cashPerShare > 0 && lc.lastTradeDate > P.t0 && lc.lastTradeDate <= P.t1) {
      Object.assign(r, { status: 'EST_CASH', point: lc.terminal.cashPerShare / a.p - 1 }); r.lo = r.hi = r.point; rows[i] = r; continue;
    }
    if (s && b0 && s.end > P.t0 && s.end < P.t1) {
      const bl = closeOnOrBefore(s.pts, s.end), rl = bl[1] / b0[1] - 1;
      if (/^ACQUIRED/.test(fate) || lc) { Object.assign(r, { status: 'EST_SERIES_END', point: rl, lo: rl, hi: rl }); rows[i] = r; continue; }
      Object.assign(r, { status: 'BOUNDED_EXIT_SERIES_DELISTED', point: rl, lo: -1, hi: rl }); rows[i] = r; continue;
    }
    Object.assign(r, { status: 'BOUNDED_EXIT', point: 0, lo: -1, hi: null }); rows[i] = r;
  }
  P.rows = rows;
  for (const r of rows) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
}

// ---------------------------------------------------------------- consistency, internal agreement, qualification
const periodBy = new Map(PERIODS.map(P => [P.fund + '|' + P.t0, P]));
const spyByT1Month = new Map(PERIODS.filter(P => P.fund === 'SPY').map(P => [P.t1.slice(0, 7), P]));
function internalAgreement(P, others) {
  let cw = 0, aw = 0, n = 0, nAgree = 0;
  for (const l of P.links) {
    if (l.point == null) continue; const a = P.A[l.a];
    const x = xLookup(P, a, f => others.includes(f));
    if (!x) continue; cw += a.w; n++; if (Math.abs(x.point - l.point) * 100 <= R.INTERNAL_DR_PP) { aw += a.w; nAgree++; }
  }
  return cw > 0 ? { agree: aw / cw, commonW: cw, n, nAgree } : null;
}
for (const P of PERIODS) {
  const g = { observed: 0, estimated: 0, bounded: 0 }, byStatus = {}, fatesB = {};
  let rp = 0, rl = 0, obsSum = 0;
  P.rows.forEach((r, i) => {
    const w = P.A[i].w, grp = IP.GROUP[r.status]; g[grp] += w;
    const bs = byStatus[r.status] = byStatus[r.status] || { n: 0, w: 0 }; bs.n++; bs.w += w;
    const pt = r.point != null ? r.point : (r.lo + r.hi) / 2; // ambiguous CA: midpoint (index level only)
    rp += w * pt; rl += w * r.lo;
    if (grp !== 'bounded') obsSum += w * r.point;
    if (grp === 'bounded') { const k = r.status === 'BOUNDED_AMBIGUOUS_CA' ? 'AMBIGUOUS_CA' : r.fate; const fb = fatesB[k] = fatesB[k] || { n: 0, w: 0 }; fb.n++; fb.w += w; }
  });
  let rfund = fundReturn(P.fund, P.t0, P.t1), refKind = rfund == null ? null : 'FUND_PRICE_SERIES';
  const tr = IP.monthsBetween(P.t0, P.t1) === 3 ? nportTR(P.s1) : null;
  if (rfund == null && (P.fund === 'IWB' || P.fund === 'IWV') && tr != null) {
    const sp = spyByT1Month.get(P.t1.slice(0, 7));
    const spTR = sp && IP.monthsBetween(sp.t0, sp.t1) === 3 ? nportTR(sp.s1) : null, spPR = sp ? fundReturn('SPY', sp.t0, sp.t1) : null;
    if (spTR != null && spPR != null) { rfund = tr - (spTR - spPR); refKind = 'NPORT_TR_MINUS_SPY_DIVIDEND_GAP'; }
  }
  const others = P.fund === 'IWV' ? ['IWB', 'IWM'] : P.fund === 'IWB' || P.fund === 'IWM' ? ['IWV'] : FUND_ORDER.filter(f => f !== P.fund);
  const ia = internalAgreement(P, others);
  const errorPp = rfund == null ? null : 100 * (rp - rfund);
  const splitCounts = {}; for (const l of P.links) splitCounts[l.cls] = (splitCounts[l.cls] || 0) + 1;
  const tierCounts = {}; for (const l of P.links) tierCounts[l.tier] = (tierCounts[l.tier] || 0) + 1;
  const rnd = (x, d = 6) => x == null ? null : +x.toFixed(d);
  P.summary = { months: IP.monthsBetween(P.t0, P.t1), members: P.A.length, membersT1: P.B.length, links: P.links.length, tierCounts, exits: P.exits.length, entries: P.entries.length,
    possibleIdentityBreaks: P.breaks, fundFlowF: rnd(P.F), indexPrelim: rnd(P.ridx), splitCounts, byStatus: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, { n: v.n, w: rnd(v.w) }])),
    observedW: rnd(g.observed), estimatedW: rnd(g.estimated), boundedW: rnd(g.bounded), boundedByFate: Object.fromEntries(Object.entries(fatesB).map(([k, v]) => [k, { n: v.n, w: rnd(v.w) }])),
    rPoint: rnd(rp), rLow: rnd(rl), rFund: rnd(rfund), referenceKind: refKind, errorPp: rnd(errorPp, 4), tolerancePp: rnd(IP.tolerancePp(P.t0, P.t1, refKind === 'NPORT_TR_MINUS_SPY_DIVIDEND_GAP'), 4),
    impliedBoundedMean: rfund != null && g.bounded > 1e-9 ? rnd((rfund - obsSum - 0) / g.bounded, 4) : null,
    nportTotalReturn: rnd(tr), trMinusPointPp: tr == null ? null : rnd(100 * (tr - rp), 4),
    internalAgreement: ia ? { against: others, agreeW: rnd(ia.agree), commonW: rnd(ia.commonW), n: ia.n, nAgree: ia.nAgree } : null };
  // impliedBoundedMean must not count bounded midpoint; obsSum covers observed+estimated only
  P.qualification = NOT_APPLICABLE.has(P.fund) ? 'NOT_APPLICABLE_PRICE_WEIGHTED' : IP.qualifyPeriod({ coveredW: g.observed + g.estimated, boundedW: g.bounded, errorPp, approx: refKind === 'NPORT_TR_MINUS_SPY_DIVIDEND_GAP', internalAgree: refKind ? null : ia && ia.agree }, P.t0, P.t1);
}

// ---------------------------------------------------------------- validation against provider splits / our series
const val = { splitVsProvider: { pairs: 0, agreeNone: 0, agreeSplit: 0, ourSplitProviderNone: 0, providerSplitOurNone: 0, bothDifferent: 0, ambiguousProviderNone: 0, ambiguousProviderSplit: 0, providerNonSplitFactorOurNone: 0, providerNonSplitFactorOurSplit: 0, providerNonSplitFactorOurAmbiguous: 0, cases: [], byFund: {} },
  returnVsSeries: { exactDates: [], weekly: [] }, crossFund: {} };
for (const P of PERIODS) for (const l of P.links) {
  const a = P.A[l.a], b = P.B[l.b];
  if (!a.sid || a.sid !== b.sid) continue; const s = series(a.sid); if (!s) continue;
  const pf = providerFactor(s, P.t0, P.t1), v = val.splitVsProvider; v.pairs++;
  if (NOT_APPLICABLE.has(P.fund)) continue;
  const pSplit = Math.abs(Math.log(pf)) > 1e-3 && MC.splitShaped(pf), pNonSplit = Math.abs(Math.log(pf)) > 1e-3 && !pSplit, ours = l.cls === 'SPLIT' ? l.factor : l.cls === 'AMBIGUOUS_CA' ? null : 1;
  let k;
  if (pNonSplit) k = ours == null ? 'providerNonSplitFactorOurAmbiguous' : ours === 1 ? 'providerNonSplitFactorOurNone' : 'providerNonSplitFactorOurSplit';
  else if (ours == null) k = pSplit ? 'ambiguousProviderSplit' : 'ambiguousProviderNone';
  else if (!pSplit && ours === 1) k = 'agreeNone';
  else if (pSplit && Math.abs(Math.log(ours / pf)) <= 0.01) k = 'agreeSplit';
  else if (!pSplit) k = 'ourSplitProviderNone';
  else if (ours === 1) k = 'providerSplitOurNone';
  else k = 'bothDifferent';
  v[k]++; const bf = v.byFund[P.fund] = v.byFund[P.fund] || {}; bf[k] = (bf[k] || 0) + 1;
  { const mo = IP.monthsBetween(P.t0, P.t1), bk = mo <= 3 ? 'quarter' : mo <= 6 ? 'halfYear' : 'longer'; v.byPeriodLength = v.byPeriodLength || {}; const b = v.byPeriodLength[bk] = v.byPeriodLength[bk] || { pairs: 0, agree: 0, providerNonSplit: 0, disagreeOrAmbiguous: 0, weightPairs: 0, weightDisagreeOrAmbiguous: 0 };
    b.pairs++; b.weightPairs += a.w; if (k === 'agreeNone' || k === 'agreeSplit') b.agree++; else if (k.startsWith('providerNonSplitFactor')) b.providerNonSplit++; else { b.disagreeOrAmbiguous++; b.weightDisagreeOrAmbiguous += a.w; } }
  if (k !== 'agreeNone' && k !== 'agreeSplit' && k !== 'providerNonSplitFactorOurNone') v.cases.push({ fund: P.fund, t0: P.t0, t1: P.t1, securityId: a.sid, name: a.name, kind: k, providerFactor: +pf.toFixed(6), ourClass: l.cls, ourFactor: ours, q: +l.q.toFixed(4), priceRatio: +l.pr.toFixed(4), weightPct: +(100 * a.w).toFixed(4) });
  if (l.point == null) continue;
  const b0 = barOnOrBefore(s, P.t0), b1 = barOnOrBefore(s, P.t1);
  if (b0 && b1 && b1[0] <= s.end) { const d = l.point - (b1[1] / b0[1] - 1); val.returnVsSeries.weekly.push(d); if (b0[0] === P.t0 && b1[0] === P.t1) val.returnVsSeries.exactDates.push(d); }
}
function dist(xs) {
  const a = xs.map(Math.abs).sort((x, y) => x - y), q = p => a.length ? +(100 * a[Math.min(a.length - 1, Math.floor(p * a.length))]).toFixed(4) : null;
  return { n: a.length, medianPp: q(0.5), p90Pp: q(0.9), p99Pp: q(0.99), maxPp: a.length ? +(100 * a.at(-1)).toFixed(3) : null, shareOver1pp: a.length ? +(a.filter(x => x > 0.01).length / a.length).toFixed(5) : null, shareOver5pp: a.length ? +(a.filter(x => x > 0.05).length / a.length).toFixed(5) : null };
}
val.returnVsSeries = { method: 'linked members whose t0 and t1 keys map to the same securityId: holdings return s*p1/p0-1 minus series return (adjusted weekly close on/before t1 / on/before t0); exactDates = both holdings dates are weekly bar dates', exactDates: dist(val.returnVsSeries.exactDates), weekly: dist(val.returnVsSeries.weekly) };
val.splitVsProvider.cases.sort((x, y) => y.weightPct - x.weightPct);
fs.mkdirSync(WORK, { recursive: true }); fs.writeFileSync(path.join(WORK, 'split-cases-' + IP.RULE.version + '.json'), JSON.stringify(val.splitVsProvider.cases));
val.splitVsProvider.casesTotal = val.splitVsProvider.cases.length; val.splitVsProvider.cases = val.splitVsProvider.cases.slice(0, 150);
// member-level cross-fund agreement (same security, same dates, independent share counts)
for (const P of PERIODS) {
  const ia = P.summary.internalAgreement; if (!ia) continue;
  const k = P.fund + '~' + ia.against.join('+') + (P.s0.kind === 'NPORT' ? ':NPORT' : ':REPORT');
  const c = val.crossFund[k] = val.crossFund[k] || { periods: 0, n: 0, nAgree: 0, commonW: 0, agreeWMean: 0 };
  c.periods++; c.n += ia.n; c.nAgree += ia.nAgree; c.commonW += ia.commonW; c.agreeWMean += ia.agreeW;
}
for (const c of Object.values(val.crossFund)) { c.agreeWMean = +(c.agreeWMean / c.periods).toFixed(5); c.commonW = +(c.commonW / c.periods).toFixed(4); }
// split-class totals and tiers
val.totals = { statusCounts, splitClasses: {}, tiers: {}, possibleIdentityBreaks: 0, exits: 0, entries: 0 };
for (const P of PERIODS) { for (const [k, v] of Object.entries(P.summary.splitCounts)) val.totals.splitClasses[k] = (val.totals.splitClasses[k] || 0) + v; for (const [k, v] of Object.entries(P.summary.tierCounts)) val.totals.tiers[k] = (val.totals.tiers[k] || 0) + v; val.totals.possibleIdentityBreaks += P.breaks; val.totals.exits += P.exits.length; val.totals.entries += P.entries.length; }

// ---------------------------------------------------------------- chains + compact data
const chains = [], sidList = [], sidIdx = new Map(), sidI = id => { if (id == null) return null; if (!sidIdx.has(id)) { sidIdx.set(id, sidList.length); sidList.push(id); } return sidIdx.get(id); };
const chainOf = new Map(); // fund|date|i -> chain
for (const [fund, list] of byFund) {
  for (let k = 0; k < list.length; k++) {
    const d = list[k].date, A = POS.get(fund + '|' + d);
    A.forEach((a, i) => { const ck = fund + '|' + d + '|' + i; if (!chainOf.has(ck)) { chainOf.set(ck, chains.length); chains.push([fund, sha(a.key).slice(0, 16), a.name, a.cik ? +a.cik : null]); } else { chains[chainOf.get(ck)][2] = a.name; if (a.cik) chains[chainOf.get(ck)][3] = +a.cik; } });
    const P = periodBy.get(fund + '|' + d); if (!P) continue;
    for (const l of P.links) chainOf.set(fund + '|' + P.t1 + '|' + l.b, chainOf.get(fund + '|' + d + '|' + l.a));
  }
}
const FATE_I = f => { const i = IP.FATES.indexOf(f || ''); if (i < 0) throw Error('FATE ' + f); return i; };
const POPS = [...RULES.populations.primary.map(p => ({ ...p, role: 'primary' })), ...RULES.populations.secondary.map(p => ({ ...p, role: 'secondary' })), ...(RULES.populations.notApplicable || []).map(p => ({ ...p, role: 'notApplicable', from: '0000', to: '9999' }))];
const periodsOut = [];
for (const P of PERIODS) {
  if (NOT_APPLICABLE.has(P.fund) || !PUBLISH_MEMBERS.has(P.fund)) { periodsOut.push({ fund: P.fund, t0: P.t0, t1: P.t1, form0: P.s0.src.form, form1: P.s1.src.form, accession0: P.s0.src.accession, accession1: P.s1.src.accession, qualification: P.qualification, summary: P.summary, cols: null }); continue; }
  const cols = { chain: [], w: [], status: [], tier: [], split: [], ret: [], fate: [], sid: [], sf: [], bnd: [] };
  P.rows.forEach((r, i) => {
    const q6 = x => x == null ? null : Math.round(x * 1e6);
    cols.chain.push(chainOf.get(P.fund + '|' + P.t0 + '|' + i)); cols.w.push(Math.round(P.A[i].w * 1e8)); cols.status.push(IP.STATUS.indexOf(r.status)); cols.tier.push(IP.TIERS.indexOf(r.tier));
    cols.split.push(IP.SPLIT_CLASSES.indexOf(r.cls)); cols.ret.push(q6(r.point)); cols.fate.push(FATE_I(r.fate)); cols.sid.push(sidI(r.sid));
    if (r.cls === 'SPLIT') cols.sf.push([i, q6(r.sf)]);
    if (q6(r.lo) !== q6(r.point) || q6(r.hi) !== q6(r.point)) cols.bnd.push([i, q6(r.lo), q6(r.hi)]);
  });
  periodsOut.push({ fund: P.fund, t0: P.t0, t1: P.t1, form0: P.s0.src.form, form1: P.s1.src.form, accession0: P.s0.src.accession, accession1: P.s1.src.accession, qualification: P.qualification, summary: P.summary, cols });
}
for (const pop of POPS) {
  const ps = periodsOut.filter(p => p.fund === pop.fund && p.t0 >= pop.from && p.t1 <= pop.to);
  const cls = ps.map(p => p.qualification), si = IP.qualifiedSpan(cls);
  const cnt = {}; for (const c of cls) cnt[c] = (cnt[c] || 0) + 1;
  pop.periods = ps.length; pop.qualificationCounts = cnt; pop.qualifiedSpanFrom = si == null ? null : ps[si].t0; pop.qualifiedSpanTo = si == null ? null : ps.at(-1).t1;
  pop.qualifiedSpanPeriods = si == null ? 0 : ps.length - si;
  pop.failingPeriods = ps.filter(p => p.qualification !== 'QUALIFIED' && p.qualification !== 'QUALIFIED_INTERNAL').map(p => ({ t0: p.t0, t1: p.t1, qualification: p.qualification, observedW: p.summary.observedW, boundedW: p.summary.boundedW, errorPp: p.summary.errorPp }));
}
const data = { schemaVersion: 'v12-spxpop-population-' + V + '', ruleVersion: IP.RULE.version, evidenceKind: 'RECONSTRUCTION', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
  columns: { w: 'weight x 1e8', ret: 'point return x 1e6 (null = none)', bnd: 'sparse [row, lower x 1e6, upper x 1e6 (null = unbounded)] where a bound differs from ret', sf: 'sparse [row, split factor x 1e6] for SPLIT rows', status: IP.STATUS, tier: IP.TIERS, split: IP.SPLIT_CLASSES, fate: IP.FATES, chain: 'index into chains [fund, keyHash16, name, cik]', sid: 'index into securityIds' },
  securityIds: sidList, chains, populations: POPS, periods: periodsOut };
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WORK, { recursive: true });
const gz = zlib.gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 });
const dataFile = 'population-' + V + '.json.gz';
fs.writeFileSync(path.join(OUT, dataFile), gz);
const codeHash = sha(fs.readFileSync(__filename) + fs.readFileSync(path.join(ROOT, 'quant/engines/research-index-population.cjs')));
fs.writeFileSync(path.join(OUT, 'manifest-' + V + '.json'), JSON.stringify({ schemaVersion: data.schemaVersion, ruleVersion: data.ruleVersion, dataFile, dataSha256: sha(gz), bytes: gz.length,
  rows: periodsOut.reduce((a, p) => a + (p.cols ? p.cols.chain.length : 0), 0), periods: periodsOut.length, chains: chains.length, inputHashes, codeSha256: codeHash }, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'periods-' + V + '.json'), JSON.stringify({ schemaVersion: 'v12-spxpop-periods-' + V + '', ruleVersion: IP.RULE.version, evidenceKind: 'RECONSTRUCTION',
  periods: periodsOut.map(p => ({ fund: p.fund, t0: p.t0, t1: p.t1, form0: p.form0, form1: p.form1, accession0: p.accession0, accession1: p.accession1, qualification: p.qualification, ...p.summary })) }, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'validation-' + V + '.json'), JSON.stringify({ schemaVersion: 'v12-spxpop-validation-' + V + '', ruleVersion: IP.RULE.version, evidenceKind: 'RECONSTRUCTION', ...val }, null, 1) + '\n');
const summary = { schemaVersion: 'v12-spxpop-summary-' + V + '', studyId: 'v12-spxpop-index-population', ruleVersion: IP.RULE.version, evidenceKind: 'RECONSTRUCTION', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
  dataSource: 'SEC fund holdings (N-30D, N-30B-2, N-Q, NPORT-P) of SPY, QQQ, DIA, IWB, IWM, IWV as parsed and validated by V12 INDEXPOP; fund price series (multi-asset, Tiingo) only as consistency reference',
  listingIdentity: 'identity chain C1 CUSIP/ISIN, C2 normalized name, C3 CIK, C4 fuzzy (rules-' + V + ' identityChain); securityId only from INDEXPOP T1/T2 via core/identity.js',
  returnBasis: 'PRICE_RETURN', availability: 'holdings as of the report date; SEC filing date is later (N-PORT ~60 days, reports ~60 days) - a study using these members must respect the filing date',
  populations: POPS.map(p => { const { failingPeriods, ...rest } = p; return { ...rest, failingPeriods: failingPeriods.length }; }), statusCounts, inputHashes,
  reproHash: contract.hash({ inputHashes, codeHash, dataSha256: sha(gz) }),
  scope: 'Holdings-frequency (annual/semiannual/quarterly) PIT index membership and price returns; no weekly study, no total return, no fundamentals except via CIK; not a strategy or signal study.' };
fs.writeFileSync(path.join(OUT, 'summary-' + V + '.json'), JSON.stringify(summary, null, 1) + '\n');
// private detail (names, per-link diagnostics) for the Python check and inspection
fs.writeFileSync(path.join(WORK, 'detail-' + V + '.json'), JSON.stringify(PERIODS.map(P => ({ fund: P.fund, t0: P.t0, t1: P.t1, summary: P.summary, qualification: P.qualification, breaks: P.breakList,
  rows: P.rows.map((r, i) => ({ name: P.A[i].name, key: P.A[i].key, w: P.A[i].w, p0: P.A[i].p, ...r, linkTo: P.la[i] >= 0 ? P.B[P.la[i]].name : null, q: (P.links.find(l => l.a === i) || {}).q })) }))));
console.log(JSON.stringify({ periods: periodsOut.length, bytes: gz.length, statusCounts, pops: POPS.map(p => [p.id, p.periods, p.qualificationCounts, p.qualifiedSpanFrom]) }, null, 0));
