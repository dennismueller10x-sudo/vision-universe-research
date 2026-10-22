/**
 * Shared context evidence for the momentum methods (Darvas C03, Kullamaegi C08-C10, Morales / Kacher C11-C12) from the
 * new point-in-time inputs: SEC SIC group membership (research/industry-strength.mjs) and research-universe breadth
 * (research/market-breadth.mjs). Research code, evidence only: no method screen changes and no rule becomes a gate.
 *
 * Which sourced review questions this feeds (the decision stays with the reviewer):
 *  - DAR-SF-SELECTION "strongest stock of the industry" (DAR-Q12 / DAR-B10): rank of the stock's 252-session price change
 *    inside its PIT SIC group;
 *  - DAR-SF-MARKET "market trend and industry representatives": breadth + the group's chart evidence;
 *  - KK-SF-PRIORITY / KK-SF-BO-SETUP context, MOKA-SF-PP-CONTEXT / MOKA-SF-BGU-CONTEXT "leadership / theme",
 *    MOKA-SF-EXIT-CONTEXT "weak market": the same group rank and breadth.
 * The SIC group is a VU proxy for "industry" (none of these sources uses SIC); breadth is a proxy for the market.
 *
 * DATA_FRONTIER lists, per still blocked rule, the concrete missing input, whether the repository or the frozen snapshot
 * can supply it, and the cheapest compliant path (no paid provider, no uncontrolled mass download).
 */
import { fin } from '../common/series.mjs';
import { groupEvidence } from './industry-strength.mjs';
import { isoWeekKey } from '../../engine/indicators.mjs';

export const CONTEXT_EVIDENCE_VERSION = 'sf3-context-evidence-1.0.0';
export const CONTEXT_CONVENTIONS = Object.freeze({ leadershipLookbackSessions: 252, note: '252 sessions = 52 weeks (convention; Darvas names no window for "strongest")' });

/** Method -> the review questions the context evidence attaches to (rule ids of the existing contracts). */
export const CONTEXT_RULES = Object.freeze({
  SF_DARVAS_BOX: Object.freeze({ leadership: 'DAR-SF-SELECTION', market: 'DAR-SF-MARKET' }),
  SF_KK_BREAKOUT: Object.freeze({ leadership: 'KK-SF-PRIORITY', market: 'KK-SF-PRIORITY' }),
  SF_KK_EPISODIC_PIVOT: Object.freeze({ leadership: 'KK-SF-PRIORITY', market: 'KK-SF-PRIORITY' }),
  SF_MOKA_POCKET_PIVOT: Object.freeze({ leadership: 'MOKA-SF-PP-CONTEXT', market: 'MOKA-SF-EXIT-CONTEXT' }),
  SF_MOKA_BUYABLE_GAP_UP: Object.freeze({ leadership: 'MOKA-SF-BGU-CONTEXT', market: 'MOKA-SF-EXIT-CONTEXT' }),
});

/**
 * Rank of `securityId` inside its PIT group by the price change over `lookback` sessions ending at the session BEFORE
 * `date` (a decision on `date` cannot see its close). built: buildGroupStrength() result.
 */
export function industryLeadership(built, securityId, date, { lookback = CONTEXT_CONVENTIONS.leadershipLookbackSessions } = {}) {
  if (!built || built.status !== 'BUILT') return { status: 'DATA_BLOCKED', reason: built?.reason ?? 'NO_GROUP_INDEX' };
  const t = built.calendar.findLastIndex((d) => d < date);
  if (t < 0) return { status: 'INSUFFICIENT_HISTORY' };
  const week = built.weekOf[built.calendar.indexOf(date) >= 0 ? built.calendar.indexOf(date) : t];
  const group = built.groupOfAt(securityId, week);
  if (!group) return { status: 'UNKNOWN_MEMBERSHIP', meaning: 'UNKNOWN_NOT_A_LAGGARD_AND_NOT_A_LEADER' };
  const change = (id) => {
    const c = built.closes.get(id);
    if (!c) return null;
    // bar-count window on the calendar: both ends must have a bar (nothing interpolated)
    const a = t - lookback;
    return a >= 0 && c[a] === c[a] && c[t] === c[t] && c[a] > 0 ? c[t] / c[a] - 1 : null;
  };
  const rows = built.rosterIds(group, week).map((id) => [id, change(id)]).filter(([, v]) => fin(v)).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  const k = rows.findIndex(([id]) => id === securityId);
  if (k < 0) return { status: 'INSUFFICIENT_HISTORY', group };
  return { status: 'EVIDENCE_ONLY', group, session: built.calendar[t], membersRanked: rows.length, rank: k + 1, percentileInGroup: rows.length > 1 ? 1 - k / (rows.length - 1) : 1, strongestInGroup: k === 0, change: rows[k][1], groupLeader: rows[0][0], sourceStatus: 'VU_PROXY_INDUSTRY_SIC' };
}

/** Appends leadership, group chart and market breadth evidence to any method record (never changes status). */
export function withContextEvidence(record, { built = null, breadth = null, bench = null } = {}) {
  const rules = CONTEXT_RULES[record.methodId];
  if (!rules) throw new Error(`NO_CONTEXT_RULES:${record.methodId}`);
  const out = { ...record, machineScreenEvidence: [...(record.machineScreenEvidence || [])] };
  const lead = industryLeadership(built, record.securityId, record.asOf);
  const groupChart = lead.group && built ? groupEvidence(built, lead.group, isoWeekKey(record.asOf), { bench }) /* the week of the decision date itself: only earlier weeks are read (review M2) */ : null;
  out.machineScreenEvidence.push({ ruleId: rules.leadership, kind: 'CONTEXT_INDUSTRY_LEADERSHIP', value: { ...lead, groupChart, version: CONTEXT_EVIDENCE_VERSION } });
  if (breadth) out.machineScreenEvidence.push({ ruleId: rules.market, kind: 'CONTEXT_MARKET_BREADTH', value: { ...breadth.at(record.asOf, { causal: true }), sourceStatus: 'VU_UNIVERSE_BREADTH_PROXY_NOT_NYSE' } });
  return out;
}

/**
 * Rules that stay blocked after this phase, with the concrete missing input. `inSnapshot` = in the frozen snapshot
 * sts1-134d4d62eb88b6ff8d98fe6e56b12a6d; `inRepository` = somewhere in the repository or the private store.
 */
export const DATA_FRONTIER = Object.freeze([
  { rule: 'KK-SF-EP-CATALYST', methods: ['SF_KK_EPISODIC_PIVOT'], missing: 'timestamped catalyst (earnings release time, guidance, news)', inSnapshot: false, inRepository: 'PARTIAL: SEC first-filed dates of 10-Q / 10-K (sec-pit) - a filing date is not the release time of the catalyst (8-K Item 2.02 / press release, often before the open)', compliantPath: 'SEC EDGAR 8-K Item 2.02 acceptance timestamps (free, rate-limited, per CIK) as a PIT earnings-release calendar; surprise / guidance stay missing', unblocks: 'catalyst DATE and pre/post-open timing only; "unexpected" needs estimates (paid)' },
  { rule: 'KK-SF-EP-VOLUME', methods: ['SF_KK_EPISODIC_PIVOT'], missing: 'intraday volume of the first 15-20 minutes', inSnapshot: false, inRepository: 'PARTIAL: IEX minute bars from 2017 in the private r9 cache (live, not frozen; IEX share of volume only)', compliantPath: 'freeze the r9 minute cache for the trigger days into a snapshot extension; consolidated volume would need a licensed source', unblocks: 'a lower bound of opening volume (IEX share), not the consolidated value' },
  { rule: 'KK-SF-EP-ENTRY', methods: ['SF_KK_EPISODIC_PIVOT'], missing: '1-minute opening range high', inSnapshot: false, inRepository: 'PARTIAL: IEX minutes (private r9 cache, not frozen)', compliantPath: 'snapshot extension with the frozen minute bars of candidate days', unblocks: 'entry level on IEX prints (venue-limited)' },
  { rule: 'KK-SF-BO-ORH', methods: ['SF_KK_BREAKOUT'], missing: 'opening range high (1 / 5 / 60 minutes)', inSnapshot: false, inRepository: 'PARTIAL: IEX minutes (private r9 cache, not frozen)', compliantPath: 'same snapshot extension', unblocks: 'ORH entry variant on IEX prints' },
  { rule: 'KK-SF-PS-ENTRY', methods: ['SF_KK_PARABOLIC_SHORT'], missing: 'intraday bars and VWAP', inSnapshot: false, inRepository: 'PARTIAL: IEX minutes', compliantPath: 'snapshot extension; VWAP from IEX prints is venue-limited', unblocks: 'entry readings only; execution needs borrow' },
  { rule: 'KK-SF-PS-STOP', methods: ['SF_KK_PARABOLIC_SHORT'], missing: 'VWAP reclaim / running high of day', inSnapshot: false, inRepository: 'PARTIAL: IEX minutes', compliantPath: 'snapshot extension', unblocks: 'stop readings' },
  { rule: 'KK-SF-PS-BORROW', methods: ['SF_KK_PARABOLIC_SHORT'], missing: 'historical borrow availability, locate fees', inSnapshot: false, inRepository: 'NONE', compliantPath: 'none free: FINRA short interest (bi-monthly) and Reg SHO threshold lists are not borrow availability; historical locate fees are a paid product', unblocks: 'no full short backtest without historical executability (mandate)' },
  { rule: 'TUR-SF-SHORT', methods: ['SF_TURTLE_S1', 'SF_TURTLE_S2'], missing: 'historical borrow availability and fees', inSnapshot: false, inRepository: 'NONE', compliantPath: 'as KK-SF-PS-BORROW', unblocks: 'short side of the original system' },
  { rule: 'WEIN-SF-MARKET', methods: ['SF_WEINSTEIN_INVESTOR', 'SF_WEINSTEIN_TRADER'], missing: 'NYSE advance / decline and new highs / lows history', inSnapshot: false, inRepository: 'PROXY: research-universe breadth (research/market-breadth.mjs)', compliantPath: 'keep the labelled proxy; NYSE breadth history is a licensed series', unblocks: 'evidence only (Weinstein reads the market as a judgment)' },
  { rule: 'MIN-SF-TT-8', methods: ['SF_MINERVINI_SEPA_VCP'], missing: 'IBD RS rating', inSnapshot: false, inRepository: 'PROXY: VU percentile (research/minervini-components.mjs)', compliantPath: 'none (proprietary rating)', unblocks: 'never: the proxy is not the rating (#709)' },
  { rule: 'SEPA estimates / surprises / guidance', methods: ['SF_MINERVINI_SEPA_VCP'], missing: 'analyst estimates, surprise and guidance history', inSnapshot: false, inRepository: 'NONE', compliantPath: 'paid estimates provider (owner approval required)', unblocks: 'MIN-PROCESS-05..11 evidence' },
  { rule: 'CAP-weighted group index', methods: ['SF_WEINSTEIN_INVESTOR', 'SF_WEINSTEIN_TRADER'], missing: 'PIT shares outstanding in the frozen snapshot', inSnapshot: false, inRepository: 'YES: sec-pit r13 store carries dei:EntityCommonStockSharesOutstanding with first-filed dates (private, not frozen)', compliantPath: 'add _validation/sec-pit-r13.json.gz to the snapshot EXTRA_SERIES_KEYS in a new capture (supertrader-research-snapshot.yml)', unblocks: 'cap-weighted group charts, megacap judgments (MOKA-SF-BGU-MEGA evidence)' },
]);

/** Source-blocked components (no data would unblock them). */
export const SOURCE_FRONTIER = Object.freeze([
  { rule: 'RAS-SF-ENTRY', method: 'SF_RASCHKE_HOLY_GRAIL', reason: '#709 C13: entry order after the pullback not fully disclosed; no reading is invented' },
  { rule: 'RAS-SF-STOP', method: 'SF_RASCHKE_HOLY_GRAIL', reason: '#709 C13: initial stop not fully disclosed' },
  { rule: 'RAS-SF-SIZE', method: 'SF_RASCHKE_HOLY_GRAIL', reason: 'not disclosed for the setup' },
  { rule: 'TUR-SF-LIMIT-CORR (operationalisation)', method: 'SF_TURTLE_S1 / SF_TURTLE_S2', reason: 'W-TUR gives no measure, window or threshold; research variants exist (research/turtle-correlation.mjs), none is the source rule' },
  { rule: 'TUR-SF-FAILSAFE-EXIT / TUR-SF-S1-OPEN-BREAKOUT', method: 'SF_TURTLE_S1', reason: 'source silent; both readings run as scenarios' },
  { rule: 'DAR-SF-BOTTOM-START', method: 'SF_DARVAS_BOX', reason: '#709 VU-DAR UNRESOLVED; both variants implemented' },
  { rule: 'MOKA-SF-EXIT-VIOLATION / MOKA-SF-BGU-VOLWINDOW', method: 'SF_MOKA_*', reason: 'MOKA-C2 conflict / window not recorded; readings kept' },
  { rule: 'KK-SF-EP-EXIT', method: 'SF_KK_EPISODIC_PIVOT', reason: 'KK-C2: exit MA discretionary' },
]);
