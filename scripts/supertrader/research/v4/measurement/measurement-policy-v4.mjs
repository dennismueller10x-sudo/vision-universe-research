/**
 * V4 measurement policy: missing bars, stale valuation, terminals (closes V3 adversarial findings A4 and A5).
 *
 * Source-independent and registered before any V4 measurement. Nothing in this file is derived from a
 * calibration or tournament result. Every number below has a stated, non-performance reason.
 *
 *  - A position may be valued at its last close for at most STALE_CARRY_MAX_SESSIONS consecutive
 *    calendar sessions without a fresh bar (one trading week). On the next session it is settled as
 *    SECURITY_UNAVAILABLE at the last close times the scenario factor. V3 held such positions forever.
 *  - A data-quarantine terminal is booked on the first calendar session on or after
 *    max(quarantine.from, quarantine.observedAt). V3 booked it on `from`, which can precede the bar that
 *    revealed the defect (lookahead).
 *  - A data quarantine and an unavailable security are data events, not economic delistings: baseline
 *    proceeds are the last valid close (factor 1). V3 applied the -30 % delisting factor to them. The
 *    economic delisting scenarios of the frozen tournament protocol are unchanged and stay mandatory
 *    sensitivities for every terminal kind.
 */
export const MEASUREMENT_POLICY_V4_ID = 'VU_V4_MISSING_BAR_STALE_VALUATION_TERMINAL_POLICY';
export const MEASUREMENT_POLICY_V4_VERSION = '1.0.0';

export const MEASUREMENT_POLICY_V4 = Object.freeze({
  id: MEASUREMENT_POLICY_V4_ID,
  version: MEASUREMENT_POLICY_V4_VERSION,
  registeredBeforeV4Measurement: true,
  staleCarryMaxSessions: 5,
  staleCarryReason: 'ONE_TRADING_WEEK; NOT_DERIVED_FROM_ANY_RESULT',
  zeroVolumeUnchangedCloseCountsAsStale: true,
  cases: {
    MISSING_ONE_SESSION: 'CARRY_LAST_CLOSE_FLAGGED_STALE',
    MISSING_MULTIPLE_SESSIONS_UP_TO_LIMIT: 'CARRY_LAST_CLOSE_FLAGGED_STALE',
    MISSING_BEYOND_LIMIT_NO_TERMINAL: 'SETTLE_SECURITY_UNAVAILABLE_AT_LAST_CLOSE_TIMES_DATA_EVENT_FACTOR_ON_SESSION_LIMIT_PLUS_ONE',
    SUSPENDED: 'NOT_DISTINGUISHABLE_FROM_MISSING_IN_SOURCE; SAME_AS_MISSING',
    DELISTED_UNKNOWN_CLASS: 'FROZEN_PROTOCOL_ECONOMIC_SCENARIO (baseline -30 %, sensitivities last price and distress zero)',
    ACQUISITION_OFFICIAL_CLASS: 'LAST_OBSERVED_PRICE_AS_CASH_PROCEEDS (frozen protocol)',
    DATA_QUARANTINE: 'TERMINAL_ON_FIRST_SESSION_ON_OR_AFTER_MAX(FROM,OBSERVED_AT); DATA_EVENT_FACTOR',
    STALE_PRICING: 'ZERO_VOLUME_UNCHANGED_CLOSE_DOES_NOT_RESET_THE_STALE_COUNTER',
    SECURITY_UNAVAILABLE: 'SAME_AS_MISSING_BEYOND_LIMIT',
  },
  dataEventScenarios: {
    baseline: 'LAST_VALID_CLOSE',
    sensitivity: ['UNKNOWN_PROCEEDS_MINUS_30_PERCENT', 'ZERO_PROCEEDS'],
  },
  economicScenarios: {
    baseline: 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT',
    sensitivity: ['LAST_OBSERVED_PRICE', 'DISTRESS_ZERO_OTHER_MINUS_30'],
  },
  ordersOnlyOnRealSourceBars: true,
  syntheticBarsSettlementOnly: true,
});

const DATA_EVENTS = new Set(['DATA_QUARANTINE', 'SECURITY_UNAVAILABLE']);
export const isDataEvent = (kind) => DATA_EVENTS.has(kind);

/** Scenario factor applied to the last valid close. `scenario` names an economic scenario of the frozen protocol. */
export function terminalFactorV4(terminal, scenario, { distress = false, dataEventScenario = MEASUREMENT_POLICY_V4.dataEventScenarios.baseline } = {}) {
  if (!terminal) return 1;
  if (isDataEvent(terminal.kind)) {
    if (dataEventScenario === 'LAST_VALID_CLOSE') return 1;
    if (dataEventScenario === 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT') return 0.7;
    if (dataEventScenario === 'ZERO_PROCEEDS') return 0;
    throw new Error('UNKNOWN_DATA_EVENT_SCENARIO');
  }
  if (terminal.delistClass === 'ACQUISITION') return 1;
  if (scenario === 'LAST_OBSERVED_PRICE') return 1;
  if (scenario === 'DISTRESS_ZERO_OTHER_MINUS_30') return distress ? 0 : 0.7;
  if (scenario === 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT') return 0.7;
  throw new Error('UNKNOWN_ECONOMIC_SCENARIO');
}

function firstSessionOnOrAfter(calendar, date) {
  let lo = 0, hi = calendar.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (calendar[m] < date) lo = m + 1; else hi = m; }
  return calendar[lo] ?? null;
}

/**
 * A5: rebuilds the data-quarantine terminal so that it is never booked before the information that
 * revealed it. Bars after the last valid bar are never used, so a holder is valued stale until the
 * terminal session (and the stale limit can settle it earlier as SECURITY_UNAVAILABLE, never later).
 */
export function causalQuarantineTerminal(security, calendar) {
  const q = security.dataQuarantine;
  if (!q) return security.terminal ?? null;
  const known = [q.from, q.observedAt].filter((d) => typeof d === 'string').sort().at(-1);
  const date = firstSessionOnOrAfter(calendar, known);
  const last = security.bars.at(-1);
  return { kind: 'DATA_QUARANTINE', date, quarantineFrom: q.from, observedAt: q.observedAt ?? q.from, lastKnownDate: last?.date ?? null,
    lastClose: last?.close ?? null, confidence: 'LOW', proceedsKnown: false, timing: 'FIRST_SESSION_ON_OR_AFTER_MAX_FROM_OBSERVED_AT' };
}

/** Applies A5 to a whole canonical dataset without touching bars (pure; returns new security objects). */
export function applyCausalTerminals(data) {
  let changed = 0;
  const securities = data.securities.map((s) => {
    if (!s.dataQuarantine) return s;
    const terminal = causalQuarantineTerminal(s, data.calendar);
    if (terminal?.date !== s.terminal?.date) changed++;
    return { ...s, terminal };
  });
  return { data: { ...data, securities }, audit: { policy: MEASUREMENT_POLICY_V4_ID, quarantinedSecurities: securities.filter((s) => s.dataQuarantine).length, terminalDatesMoved: changed } };
}

/**
 * Stale tracker for one book. `observe(date, bars)` must be called once per calendar session after the
 * source bars of that session are known. It returns the ids whose stale limit is exceeded on `date`.
 */
export function createStaleTracker(policy = MEASUREMENT_POLICY_V4) {
  const lastFresh = new Map(), lastClose = new Map(), stale = new Map(), counts = { staleSessionMarks: 0, unavailableSettlements: 0, maxObservedStaleSessions: 0 };
  return {
    counts,
    observe(date, heldIds, bars) {
      const exceeded = [];
      for (const id of heldIds) {
        const b = bars.get(id);
        const fresh = b && !(policy.zeroVolumeUnchangedCloseCountsAsStale && b.volume === 0 && lastClose.get(id) === b.close);
        if (b) lastClose.set(id, b.close);
        if (fresh) { lastFresh.set(id, date); stale.set(id, 0); continue; }
        const n = (stale.get(id) ?? 0) + 1; stale.set(id, n); counts.staleSessionMarks++;
        counts.maxObservedStaleSessions = Math.max(counts.maxObservedStaleSessions, n);
        if (n > policy.staleCarryMaxSessions) exceeded.push(id);
      }
      return exceeded;
    },
    staleSessions: (id) => stale.get(id) ?? 0,
    forget(id) { lastFresh.delete(id); lastClose.delete(id); stale.delete(id); },
  };
}

/** A4 hard check: every open position ends with a bar within the stale limit, or it was settled. */
export function endingPositionCheck(positions, tracker, policy = MEASUREMENT_POLICY_V4) {
  const violations = positions.filter((p) => tracker.staleSessions(p.id) > policy.staleCarryMaxSessions).map((p) => p.id);
  return { id: 'V4-A4-ENDING-POSITION-FRESHNESS', hard: true, status: violations.length ? 'FAIL' : 'PASS', checked: positions.length, violations: violations.length };
}
