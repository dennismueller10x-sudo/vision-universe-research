// Supertrader — Research-Accounting-Vertrag (Foundation Repair, A4/A5/A8).
//
// Eine Stelle fuer die Mess- und Abrechnungsregeln der Research-Backtests auf main.
// Inhaltlich eine Portierung der vorab registrierten V4-Politik aus #705
// (research/v4/measurement/measurement-policy-v4.mjs, accounting-v4.mjs, Head 547d604d).
// Keine Zahl hier ist aus einem Ergebnis abgeleitet; jede stammt aus V4 und ist dort begruendet.
//
//  A4  Stale Valuation: Eine Position ohne frischen Kurs wird hoechstens STALE_CARRY_MAX_SESSIONS
//      Kalendersitzungen zum letzten Schluss bewertet (eine Handelswoche). In der Sitzung danach
//      wird sie als SECURITY_UNAVAILABLE zum letzten gueltigen Schluss abgerechnet.
//  A5  Terminal: Eine Datenquarantaene wird erst in der ersten Sitzung ab max(from, observedAt)
//      gebucht. Datenereignisse (Quarantaene, Datenluecke, nicht verfuegbar) sind keine
//      wirtschaftlichen Delistings: Basisfall Faktor 1, Sensitivitaeten -30 % und 0.
//      Orders brauchen einen realen Quellbalken; eine Abrechnung ohne Balken ist nur Settlement.
//  A8  Dust: Ein Rest wird nur unter DUST_VALUE_LIMIT (Wert, nicht Stueckzahl) abgeschrieben,
//      jede Abschreibung steht im Ledger, die Summe je Buch ist gedeckelt (fail closed).
//      Ein Schlussverkauf verkauft exakt den Bestand (keine Rundungsreste, kein Ueberverkauf).

export const RESEARCH_ACCOUNTING_ID = 'SUPERTRADER_RESEARCH_ACCOUNTING';
export const RESEARCH_ACCOUNTING_VERSION = '1.0.0';
export const RESEARCH_ACCOUNTING_MODE = 'RESEARCH_V1';
export const PORTED_FROM = Object.freeze({
  pr: 705,
  head: '547d604d9596b0f4af4c13ac31bebce48b3948ec',
  files: ['scripts/supertrader/research/v4/measurement/measurement-policy-v4.mjs', 'scripts/supertrader/research/v4/measurement/accounting-v4.mjs'],
  policy: 'VU_V4_MISSING_BAR_STALE_VALUATION_TERMINAL_POLICY@1.0.0',
});

export const POLICY = Object.freeze({
  staleCarryMaxSessions: 5,
  staleCarryReason: 'ONE_TRADING_WEEK; NOT_DERIVED_FROM_ANY_RESULT (V4)',
  zeroVolumeUnchangedCloseCountsAsStale: true,
  dustValueLimit: 0.01,
  dustBookValueCap: 1,
  minOrderValue: 1e-6,
  reconciliationAbsoluteFloor: 1e-6,
  reconciliationFlowUlps: 64,
  fullExitFractionEpsilon: 1e-9,
  dataEventScenarios: Object.freeze({ baseline: 'LAST_VALID_CLOSE', sensitivity: Object.freeze(['UNKNOWN_PROCEEDS_MINUS_30_PERCENT', 'ZERO_PROCEEDS']) }),
  ordersOnlyOnRealSourceBars: true,
  syntheticBarsSettlementOnly: true,
});

const UNIT_ROUNDOFF = 2 ** -53;

// Datenereignisse. DATA_GAP: Segmentende durch eine Luecke > MAX_GAP_DAYS, die Notierung laeuft danach weiter.
export const DATA_EVENTS = new Set(['DATA_QUARANTINE', 'SECURITY_UNAVAILABLE', 'DATA_GAP']);
export const isDataEvent = (kind) => DATA_EVENTS.has(kind);

export function dataEventFactor(scenario = POLICY.dataEventScenarios.baseline) {
  if (scenario === 'LAST_VALID_CLOSE') return 1;
  if (scenario === 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT') return 0.7;
  if (scenario === 'ZERO_PROCEEDS') return 0;
  throw new Error('UNKNOWN_DATA_EVENT_SCENARIO');
}

function firstSessionOnOrAfter(calendar, date) {
  let lo = 0, hi = calendar.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (calendar[m] < date) lo = m + 1; else hi = m; }
  return calendar[lo] ?? null;
}

// A5: Buchungstag einer Quarantaene = erste Sitzung ab max(from, observedAt). Nie frueher als die Information.
export function causalTerminalDate(calendar, { from, observedAt }) {
  const known = [from, observedAt].filter((d) => typeof d === 'string').sort().at(-1);
  if (!known) throw new Error('QUARANTINE_DATES_REQUIRED');
  return firstSessionOnOrAfter(calendar, known);
}

// Realer, ausfuehrbarer Quellbalken: vorhanden, nicht synthetisch, positiver endlicher Preis.
export function isExecutableBar(bar, field = 'open') {
  return Boolean(bar) && bar.synthetic !== true && Number.isFinite(bar[field]) && bar[field] > 0;
}

// A4: Stale-Zaehler je Buch. observe() einmal je Kalendersitzung nach Bekanntwerden der Balken.
// bars: Map(id -> { close, volume? }). Liefert die ids, deren Grenze in dieser Sitzung ueberschritten ist.
export function createStaleTracker(policy = POLICY) {
  const lastClose = new Map(), stale = new Map(), counts = { staleSessionMarks: 0, unavailableSettlements: 0, maxObservedStaleSessions: 0 };
  return {
    counts,
    observe(heldIds, bars) {
      const exceeded = [];
      for (const id of heldIds) {
        const b = bars.get(id);
        const fresh = b && !(policy.zeroVolumeUnchangedCloseCountsAsStale && b.volume === 0 && lastClose.get(id) === b.close);
        if (b) lastClose.set(id, b.close);
        if (fresh) { stale.set(id, 0); continue; }
        const n = (stale.get(id) ?? 0) + 1; stale.set(id, n); counts.staleSessionMarks++;
        counts.maxObservedStaleSessions = Math.max(counts.maxObservedStaleSessions, n);
        if (n > policy.staleCarryMaxSessions) exceeded.push(id);
      }
      return exceeded;
    },
    staleSessions: (id) => stale.get(id) ?? 0,
    forget(id) { lastClose.delete(id); stale.delete(id); },
  };
}

// A8: Stueckzahl eines Verkaufs. Schlussverkauf (Rest-Fraktion erreicht) = exakt der Bestand.
export function sellQuantity(shares, fraction, remainingFraction, policy = POLICY) {
  if (!(shares > 0) || !(fraction > 0)) return 0;
  if (fraction >= remainingFraction - policy.fullExitFractionEpsilon) return shares;
  return Math.min(shares, shares * fraction / remainingFraction);
}

// A8: Entscheidung ueber einen Rest nach einem Verkauf. Wert, nicht Stueckzahl.
export function dustDecision(shares, mark, policy = POLICY) {
  if (!(shares > 0)) return { action: shares === 0 ? 'CLOSED' : 'NEGATIVE_SHARES' };
  const value = Math.abs(shares * (Number.isFinite(mark) && mark > 0 ? mark : 0));
  return value < policy.dustValueLimit ? { action: 'WRITE_OFF', value } : { action: 'KEEP', value };
}

export function reconciliationTolerance(grossFlows, initialCapital, policy = POLICY) {
  return policy.reconciliationAbsoluteFloor + policy.reconciliationFlowUlps * UNIT_ROUNDOFF * (grossFlows + initialCapital);
}

// A4 harte Pruefung: keine offene Position am Ende ist laenger als die Grenze ohne Kurs.
export function endingPositionCheck(ids, tracker, policy = POLICY) {
  const violations = ids.filter((id) => tracker.staleSessions(id) > policy.staleCarryMaxSessions);
  return { id: 'FOUNDATION-A4-ENDING-POSITION-FRESHNESS', hard: true, status: violations.length ? 'FAIL' : 'PASS', checked: ids.length, violations: violations.length };
}

export function describeContract() {
  return { id: RESEARCH_ACCOUNTING_ID, version: RESEARCH_ACCOUNTING_VERSION, mode: RESEARCH_ACCOUNTING_MODE, portedFrom: PORTED_FROM, policy: POLICY, dataEvents: [...DATA_EVENTS] };
}
