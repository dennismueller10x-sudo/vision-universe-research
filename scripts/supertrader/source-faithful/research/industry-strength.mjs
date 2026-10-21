/**
 * Weinstein industry-group strength from point-in-time SEC SIC membership. Research code, no activation, no change to
 * methods/weinstein.mjs: the screens stay as they are; withIndustryEvidence() only appends evidence to a record.
 *
 * Source (#709 B09, Weinstein 1988): WEIN-GROUP (p. 80, HARD) no long buy in a negative group, check the group chart's
 * stage first; WEIN-GROUP2 (CONTEXTUAL) one healthy group is enough, stock and group need not be at the same point;
 * WEIN-DIVERS3 spread over several technically good groups; WEIN-SH-GRP short side (weak group under its MA, RS falling).
 * The source reads published group charts (S&P / Value Line industry groups). This file builds a VU PROXY of such a
 * chart: SIC membership is the SEC's classification of the registrant, not Weinstein's group list. Every number this
 * file adds (SIC level, minimum members, carry-forward age, weekly roster) is a declared research variant, never a
 * source rule, and the stage of a group stays the reviewer's call (WEIN-SF-STAGE is manual for stocks as well).
 *
 * Point in time:
 *  - membership of week k is resolved once, with the date of the session BEFORE the first session of week k
 *    (adapters/industry-groups.mjs makeWeinsteinGroupMembership: SIC known at that date, 16:00 ET cut-off). A SIC
 *    change inside a week is used from the next week (delay <= 1 week, never early);
 *  - a member's daily return on session t needs bars on t and t-1 (split-adjusted closes, ADR-002); nothing is filled;
 *  - the group return of session t is the mean (EQUAL) or the prior-close-capitalisation weighted mean (CAP) of the
 *    member returns; with fewer than minMembers valid returns the session is UNKNOWN and the index has a gap;
 *  - a weekly close exists only for a week without UNKNOWN sessions; MA30w needs 30 such weeks (strict).
 * CAP weighting needs point-in-time shares outstanding. The frozen snapshot carries none (sec-pit r12 has EPS and
 * revenue only; shares exist in the r13 store, which is not frozen): without a sharesAt provider CAP is DATA_BLOCKED and
 * no weight is pretended.
 */
import { isoWeekKey } from '../../engine/indicators.mjs';
import { fin, smaSeries } from '../common/series.mjs';
import { relativeStrength, ma30w, weeklyBars } from '../methods/weinstein.mjs';

export const INDUSTRY_STRENGTH_VERSION = 'sf3-industry-strength-1.0.0';

/**
 * Pre-registered research variants (2026-10-21, before any snapshot measurement). Not owner releases: `ref` names the
 * research variant for adapters/industry-groups.mjs, which refuses to run without one.
 *  - SIC3 / 5 members: the order proposed in docs/SUPERTRADER_2_INDUSTRY_GROUP_DECISIONS.md (2.2, recommendation 2);
 *  - SIC2 / SIC4 and 3 / 10 members: granularity and size sensitivity;
 *  - maxAgeDays 400: one annual 10-K cycle plus a filing-delay margin; 120: quarterly cycle (strict);
 *  - identity: NAME_EXACT_XBRL_IN_LISTING_WINDOW only (strict) or with CURRENT_TICKER_MAPPING (wider, weaker).
 */
const G = (id, level, minMembers, maxAgeDays, identity, weighting = 'EQUAL', role = 'SENSITIVITY') => Object.freeze({ id, ref: `SF3-RESEARCH-VARIANT:${id}`, level, minMembers, maxAgeDays, acceptedIdentityEvidence: Object.freeze(identity), weighting, role, sourceStatus: 'VU_PROXY_OF_WEINSTEIN_GROUP_CHART' });
const STRICT = ['NAME_EXACT_XBRL_IN_LISTING_WINDOW'], WIDE = ['NAME_EXACT_XBRL_IN_LISTING_WINDOW', 'CURRENT_TICKER_MAPPING'];
export const GROUP_VARIANTS = Object.freeze([
  // owner 2026-10-21: research reference (clearly labelled), never SOURCE_EXACT and never a trading gate
  G('SIC3-EW-MIN5-400D-WIDE', 'industryGroup', 5, 400, WIDE, 'EQUAL', 'BASELINE_FOR_COMPARISON'),
  G('SIC3-EW-MIN5-400D-STRICT', 'industryGroup', 5, 400, STRICT),
  G('SIC2-EW-MIN5-400D-WIDE', 'majorGroup', 5, 400, WIDE),
  G('SIC4-EW-MIN5-400D-WIDE', 'industry', 5, 400, WIDE),
  G('SIC3-EW-MIN3-400D-WIDE', 'industryGroup', 3, 400, WIDE),
  G('SIC3-EW-MIN10-400D-WIDE', 'industryGroup', 10, 400, WIDE),
  G('SIC3-EW-MIN5-120D-WIDE', 'industryGroup', 5, 120, WIDE),
  G('SIC3-CAP-MIN5-400D-WIDE', 'industryGroup', 5, 400, WIDE, 'CAP', 'WEIGHTING_DATA_BLOCKED_IN_SNAPSHOT'),
]);

export const GROUP_STATE = Object.freeze({ KNOWN: 'KNOWN', UNKNOWN_MEMBERSHIP: 'UNKNOWN_MEMBERSHIP', TOO_FEW_MEMBERS: 'TOO_FEW_MEMBERS', INSUFFICIENT_HISTORY: 'INSUFFICIENT_HISTORY', DATA_BLOCKED: 'DATA_BLOCKED' });

/**
 * Group index series for every group of a membership provider.
 * data: { calendar, securities }; membership: { groupOf(id, date) } (adapters/industry-groups.mjs).
 * opts: { minMembers, weighting: 'EQUAL' | 'CAP', sharesAt?(id, date) -> shares | null }.
 * Returns { status, groups: Map key -> { daily: [{ date, value, members, valid }], weeks }, rosterByWeek, coverage }.
 */
export function buildGroupIndices(data, membership, { minMembers, weighting = 'EQUAL', sharesAt = null } = {}) {
  if (!(Number.isInteger(minMembers) && minMembers >= 1)) throw new Error('MIN_MEMBERS_REQUIRED');
  if (!['EQUAL', 'CAP'].includes(weighting)) throw new Error('UNKNOWN_WEIGHTING');
  if (weighting === 'CAP' && typeof sharesAt !== 'function') return { status: GROUP_STATE.DATA_BLOCKED, reason: 'NO_PIT_SHARES_OUTSTANDING_IN_SNAPSHOT', weighting, groups: new Map(), coverage: null };
  const cal = data.calendar, T = cal.length, pos = new Map(cal.map((d, i) => [d, i]));
  const closes = new Map(), vols = new Map();
  for (const s of data.securities) {
    const c = new Float64Array(T).fill(NaN), v = new Float64Array(T).fill(NaN);
    for (const b of s.bars) { const t = pos.get(b.date); if (t !== undefined && fin(b.close) && b.close > 0) { c[t] = b.close; v[t] = fin(b.volume) ? b.volume : NaN; } }
    closes.set(s.id, c); vols.set(s.id, v);
  }
  // weekly rosters: resolved once per ISO week with the session before the week's first session
  const weekOf = cal.map((d) => isoWeekKey(d));
  const rosterByWeek = new Map(), coverage = { weeks: 0, lookups: 0, unknownMembership: 0, sessions: 0, validGroupSessions: 0, tooFewSessions: 0, capWeightMissing: 0 };
  let roster = null;
  const groups = new Map();
  const ensure = (k) => groups.get(k) || groups.set(k, { key: k, daily: [] }).get(k);
  for (let t = 1; t < T; t++) {
    if (weekOf[t] !== weekOf[t - 1] || roster === null) {
      roster = new Map(); coverage.weeks++;
      const asOf = cal[t - 1];
      for (const [id, c] of closes) {
        if (!(c[t - 1] === c[t - 1])) continue; // listed (has a bar) at the roster date
        coverage.lookups++;
        const g = membership.groupOf(id, asOf);
        if (!g) { coverage.unknownMembership++; continue; }
        (roster.get(g) || roster.set(g, []).get(g)).push(id);
      }
      rosterByWeek.set(weekOf[t], { asOf, groups: new Map([...roster].map(([k, v]) => [k, v.length])) });
    }
    coverage.sessions++;
    for (const [k, ids] of roster) {
      let s = 0, w = 0, n = 0;
      for (const id of ids) {
        const c = closes.get(id), r = c[t] / c[t - 1] - 1;
        if (!(r === r)) continue;
        let wt = 1;
        if (weighting === 'CAP') { const sh = sharesAt(id, cal[t - 1]); if (!(sh > 0)) { coverage.capWeightMissing++; continue; } wt = sh * c[t - 1]; }
        s += wt * r; w += wt; n++;
      }
      const valid = n >= minMembers && w > 0;
      if (valid) coverage.validGroupSessions++; else coverage.tooFewSessions++;
      ensure(k).daily.push({ t, date: cal[t], ret: valid ? s / w : null, members: n, valid });
    }
  }
  for (const g of groups.values()) {
    // sessions without a roster entry for the group (membership lost, e.g. carry-forward expired) are explicit
    // UNKNOWN sessions, so the weekly series stays contiguous on the calendar (review M1: no silent gap)
    const byT = new Map(g.daily.map((d) => [d.t, d])), full = [];
    for (let t = g.daily[0].t; t < T; t++) full.push(byT.get(t) ?? { t, date: cal[t], ret: null, members: 0, valid: false, noRoster: true });
    g.daily = full;
    // chain level: carried across UNKNOWN sessions (declared); a week with an UNKNOWN session has no close, and MA30w
    // needs 30 complete consecutive weeks, so no stage evidence is computed across a gap
    let level = 100;
    for (const d of g.daily) { if (d.valid) level *= 1 + d.ret; d.value = d.valid ? level : null; }
    g.weeks = groupWeeks(g.daily, weekOf);
  }
  return { status: 'BUILT', weighting, minMembers, groups, rosterByWeek, coverage, closes, vols, calendar: cal, weekOf };
}

/** Weekly closes of a group index: a week has a close only if it has no UNKNOWN session (the current, incomplete week is excluded by groupEvidence, which only reads weeks before the decision week). */
function groupWeeks(daily, weekOf) {
  const out = [];
  for (const d of daily) {
    const key = weekOf[d.t];
    let w = out.at(-1);
    if (!w || w.key !== key) { w = { key, date: d.date, close: null, sessions: 0, invalidSessions: 0, minMembers: Infinity }; out.push(w); }
    w.date = d.date; w.sessions++; w.minMembers = Math.min(w.minMembers, d.members);
    if (d.valid) w.close = d.value; else w.invalidSessions++;
  }
  for (const w of out) if (w.invalidSessions) w.close = null; // strict: a week with a gap has no close
  return out;
}

/** Stage evidence label of a weekly close series at week w (no stage decision: WEIN-SF-STAGE is manual). */
export function maRelation(weeks, w) {
  const ma = smaSeries(weeks.map((x) => x.close), 30);
  if (!fin(weeks[w]?.close) || !fin(ma[w]) || !fin(ma[w - 1])) return { status: GROUP_STATE.INSUFFICIENT_HISTORY };
  const above = weeks[w].close > ma[w], slope1 = ma[w] - ma[w - 1], slope4 = fin(ma[w - 4]) ? ma[w] / ma[w - 4] - 1 : null;
  const dir = slope1 > 0 ? 'RISING' : slope1 < 0 ? 'FALLING' : 'FLAT';
  return { status: GROUP_STATE.KNOWN, label: `${above ? 'ABOVE' : 'BELOW'}_${dir}_MA30W`, closeVsMa30w: weeks[w].close / ma[w] - 1, ma30wSlope1w: slope1 / ma[w - 1], ma30wSlope4w: slope4, note: 'evidence only: ABOVE_RISING resembles Stage 2, BELOW_FALLING resembles Stage 4; the stage of the group chart is the reviewer\'s call (WEIN-GROUP)' };
}

/**
 * Evidence of one group in the last COMPLETE week before `beforeWeekKey` (causal for a breakout in that week).
 * bench: methods/weinstein.mjs benchmarkWeekly(SPY daily).
 */
export function groupEvidence(built, groupKey, beforeWeekKey, { bench = null, minMembers = built.minMembers } = {}) {
  const g = built.groups.get(groupKey);
  if (!g) return { status: GROUP_STATE.UNKNOWN_MEMBERSHIP, group: groupKey };
  // the evidence week must be the calendar week immediately before the decision week (review M1 / M2): no older week
  // is shown as current and nothing after the decision week is ever read
  const prior = built.weekOf.filter((k) => k < beforeWeekKey).at(-1) ?? null;
  const w = prior === null ? -1 : g.weeks.findIndex((x) => x.key === prior);
  if (w < 0) return { status: GROUP_STATE.INSUFFICIENT_HISTORY, group: groupKey, reason: prior === null ? 'NO_CALENDAR_WEEK_BEFORE' : 'GROUP_NOT_IN_ROSTER_IN_PRIOR_WEEK', priorWeek: prior };
  const wk = g.weeks[w];
  if (!fin(wk.close)) return { status: wk.minMembers < minMembers ? GROUP_STATE.TOO_FEW_MEMBERS : GROUP_STATE.INSUFFICIENT_HISTORY, group: groupKey, week: wk.key, members: wk.minMembers };
  const rel = maRelation(g.weeks, w);
  const rs = bench ? relativeStrength(g.weeks.map((x) => ({ key: x.key, close: x.close })), bench.weeklyClose, w) : 'BENCHMARK_UNAVAILABLE';
  return { status: rel.status, group: groupKey, week: wk.key, members: wk.minMembers, weighting: built.weighting, maRelation: rel, relativeStrength: rs, breadth: groupBreadth(built, groupKey, wk.key), volume: groupVolume(built, groupKey, wk.key) };
}

/**
 * Group breadth (decision memo alternative C): share of the group's members whose own weekly close is above a rising
 * own MA30w at week `weekKey`. Members = roster of that week. Evidence only; no "healthy" threshold is set.
 */
export function groupBreadth(built, groupKey, weekKey) {
  const ids = built.rosterIds?.(groupKey, weekKey);
  if (!ids) return { status: 'ROSTER_IDS_NOT_RETAINED' };
  let n = 0, up = 0;
  for (const id of ids) {
    const wk = memberWeeks(built, id), w = wk.findIndex((x) => x.key === weekKey);
    if (w < 1) continue;
    const ma = wk.ma;
    if (!fin(ma[w]) || !fin(ma[w - 1]) || !fin(wk[w].close)) continue;
    n++; if (wk[w].close > ma[w] && ma[w] > ma[w - 1]) up++;
  }
  return n ? { status: GROUP_STATE.KNOWN, membersEvaluated: n, shareAboveRisingMa30w: up / n } : { status: GROUP_STATE.INSUFFICIENT_HISTORY };
}

/** Group volume behaviour: mean over members of (week volume / own mean of the 4 prior weeks). Evidence only. */
export function groupVolume(built, groupKey, weekKey) {
  const ids = built.rosterIds?.(groupKey, weekKey);
  if (!ids) return { status: 'ROSTER_IDS_NOT_RETAINED' };
  const ratios = [];
  for (const id of ids) {
    const wk = memberWeeks(built, id), w = wk.findIndex((x) => x.key === weekKey);
    if (w < 4) continue;
    const prior = [1, 2, 3, 4].map((k) => wk[w - k].volume);
    const m = prior.reduce((a, b) => a + b, 0) / 4;
    if (m > 0 && fin(wk[w].volume)) ratios.push(wk[w].volume / m);
  }
  if (!ratios.length) return { status: GROUP_STATE.INSUFFICIENT_HISTORY };
  ratios.sort((a, b) => a - b);
  return { status: GROUP_STATE.KNOWN, members: ratios.length, meanVolumeVs4w: ratios.reduce((a, b) => a + b, 0) / ratios.length, medianVolumeVs4w: ratios[Math.floor(ratios.length / 2)] };
}

function memberWeeks(built, id) {
  built._mw ||= new Map();
  if (built._mw.has(id)) return built._mw.get(id);
  const c = built.closes.get(id), v = built.vols.get(id);
  const daily = [];
  for (let t = 0; t < built.calendar.length; t++) if (c[t] === c[t]) daily.push({ date: built.calendar[t], open: c[t], high: c[t], low: c[t], close: c[t], volume: v[t] === v[t] ? v[t] : 0, splitAdj: 1 });
  const wk = weeklyBars(daily);
  wk.ma = ma30w(wk);
  built._mw.set(id, wk);
  return wk;
}

/**
 * Rotation: cross-sectional rank of every group with a KNOWN 13-week RS change in week `weekKey` (1 = strongest).
 * Groups below minMembers or with gaps are not ranked (reported as unranked). Evidence only.
 */
export function groupRanking(built, weekKey, bench) {
  const rows = [], unranked = [];
  for (const [k, g] of built.groups) {
    const w = g.weeks.findIndex((x) => x.key === weekKey);
    if (w < 0 || !fin(g.weeks[w].close)) { unranked.push(k); continue; }
    const rs = relativeStrength(g.weeks.map((x) => ({ key: x.key, close: x.close })), bench.weeklyClose, w);
    if (!fin(rs.change13w)) { unranked.push(k); continue; }
    rows.push({ group: k, rsChange13w: rs.change13w, normalisedLevel: rs.normalisedLevel });
  }
  rows.sort((a, b) => b.rsChange13w - a.rsChange13w || a.group.localeCompare(b.group));
  rows.forEach((r, i) => { r.rank = i + 1; r.percentile = rows.length > 1 ? 1 - i / (rows.length - 1) : 1; });
  return { week: weekKey, ranked: rows, unranked: unranked.sort(), note: 'rotation evidence: rank by 13-week change of the group RS line vs SPY; no source threshold' };
}

/**
 * Retains roster ids so breadth / volume can be evaluated: wraps buildGroupIndices with a membership recorder.
 * Use this entry point for evidence (buildGroupIndices alone keeps only counts).
 */
export function buildGroupStrength(data, membership, opts) {
  const ids = new Map();
  const recorder = { groupOf(id, date) { const g = membership.groupOf(id, date); if (g) (ids.get(date + '|' + g) || ids.set(date + '|' + g, []).get(date + '|' + g)).push(id); return g; } };
  const built = buildGroupIndices(data, recorder, opts);
  if (built.status !== 'BUILT') return built;
  built.rosterIds = (groupKey, weekKey) => { const r = built.rosterByWeek.get(weekKey); return r ? ids.get(r.asOf + '|' + groupKey) ?? [] : null; };
  built.groupOfAt = (id, weekKey) => { const r = built.rosterByWeek.get(weekKey); if (!r) return null; for (const k of r.groups.keys()) if ((ids.get(r.asOf + '|' + k) || []).includes(id)) return k; return null; };
  return built;
}

/** Weinstein candidate record -> same record with group and market-context evidence appended (never a gate). */
export function withIndustryEvidence(record, { built, bench = null, breadth = null, variant = null }) {
  const out = { ...record, machineScreenEvidence: [...record.machineScreenEvidence], reviewGates: [...(record.reviewGates || [])] };
  const week = record.asOfWeek;
  let value;
  if (!built || built.status !== 'BUILT') value = { status: GROUP_STATE.DATA_BLOCKED, reason: built?.reason ?? 'NO_GROUP_INDEX' };
  else {
    // roster of the breakout week = membership known at the session before that week (causal)
    const g = built.groupOfAt(record.securityId, week);
    value = g ? groupEvidence(built, g, week, { bench }) : { status: GROUP_STATE.UNKNOWN_MEMBERSHIP, meaning: 'UNKNOWN_NOT_NEGATIVE_AND_NOT_HEALTHY' };
  }
  out.machineScreenEvidence.push({ ruleId: 'WEIN-SF-GROUP', psr709: 'WEIN-GROUP', value: { ...value, variant: variant?.id ?? null, sourceStatus: 'VU_PROXY_OF_WEINSTEIN_GROUP_CHART', version: INDUSTRY_STRENGTH_VERSION } });
  if (breadth) out.machineScreenEvidence.push({ ruleId: 'WEIN-SF-MARKET', psr709: 'WEIN-MARKET', value: { ...breadth.at(record.asOf, { causal: true }), sourceStatus: 'VU_UNIVERSE_BREADTH_PROXY_NOT_NYSE' } });
  out.reviewGates.push({ id: 'WEIN-RG-GROUP', psr709: ['WEIN-GROUP', 'WEIN-GROUP2'], question: 'Is the stock\'s group chart negative (no long buy) or healthy? The machine shows a SIC proxy chart, not Weinstein\'s group list.', decidedBy: 'REVIEWER', blocksAutomation: true });
  return out;
}
