/**
 * Supertrader 4.0 – product data contract for Minervini trade information (mandate phase H). Pure data: no UI, no
 * navigation, no new component. A later Supertrader view can show what this returns; nothing here is a buy signal.
 *
 * Guarantees of every view (test SF4-VIEW-*):
 *  - manualReviewRequired true and buyDeclarationAllowed false, whatever the setup class;
 *  - a simulated trade is labelled "nur Research-Simulation" and isPortfolioPosition is false: it is never a depot
 *    position;
 *  - no default risk: the position size needs the reviewer's risk fraction (MIN-SF-SIZE), otherwise it is not computed;
 *  - data quality is explicit: missing PIT fundamentals, the IBD rating (always DATA_BLOCKED), a missing RS proxy,
 *    missing bars and the translation-only source wording are listed, never silently ignored.
 */
import { fin } from '../common/series.mjs';
import { fundamentalEvidence, positionSize, NOT_A_STRATEGY } from './minervini-components.mjs';
import { entryEligibility, sepaSetupAt, powerPlaySetupAt, stopFor, REFERENCE_CONFIG, LIFECYCLE_VERSION } from './minervini-lifecycle.mjs';

export const TRADE_VIEW_VERSION = 'sf4-minervini-trade-view-1.0.0';

export const STATE_LABELS = Object.freeze({
  NO_SETUP: 'Kein Setup',
  SETUP_DETECTED: 'Setup erkannt',
  SETUP_CONFIRMED_MECHANICAL: 'Setup mechanisch bestätigt',
  ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW: 'Einstieg möglich – manuelle Prüfung erforderlich',
  ENTRY_BLOCKED: 'Einstieg blockiert',
  SIMULATED_OPEN: 'Simulierter Einstieg – nur Research-Simulation',
  SIMULATED_CLOSED: 'Simulierte Position geschlossen – nur Research-Simulation',
  OPEN_AT_DATA_END: 'Simulierte Position am Datenende offen – nur Research-Simulation',
  NONE: 'Keine Position',
});
export const BLOCKER_LABELS = Object.freeze({
  NO_SETUP: 'kein Setup', NOT_QUALIFIED: 'Setup-Kriterien nicht erfüllt', DATA_BLOCKED: 'Kursdaten fehlen', IPO_SCOPE_REVIEW: 'zu kurze Historie (IPO)', VCP_DATA_BLOCKED: 'Basis wegen fehlender Kurse nicht auswertbar', NO_BASE: 'keine Basis nach dem Pivot', PIVOT_ALREADY_EXCEEDED: 'Pivot bereits überschritten',
  DATA_BLOCKED_SETUP: 'Volumenhistorie für den Laufbeginn fehlt', MANUAL_REVIEW_SETUP: 'Setup braucht manuelle Prüfung', VCP_PROXY_NOT_MET: 'VCP-Merkmale (Research-Stellvertreter) nicht erfüllt',
  NO_STOP_BELOW_PIVOT: 'kein Stop unter dem Pivot', PLANNED_LOSS_ABOVE_10PCT: 'geplanter Verlust über 10 %', ALREADY_ABOVE_PIVOT: 'Kurs schon über dem Pivot', OUTSIDE_RESEARCH_UNIVERSE: 'außerhalb des liquiden Research-Universums', POSITION_OPEN_DUPLICATE_SIGNAL: 'Position bereits offen',
});
export const EXIT_LABELS = Object.freeze({
  STOP_INITIAL: 'Initialer Stop', STOP_BREAKEVEN_OR_BETTER: 'Stop auf Einstand oder besser', STOP_SAME_BAR_CERTAIN: 'Stop am Einstiegstag', STOP_SAME_BAR_ASSUMED: 'Stop am Einstiegstag (Reihenfolge im Tagesbalken unbekannt, konservativ)',
  MA50_CLOSE_EXIT: 'Schluss unter der 50-Tage-Linie', FREEROLL_PARTIAL_HALF: 'Teilverkauf (Hälfte)', TERMINAL_DELISTED: 'Notierung eingestellt', SECURITY_UNAVAILABLE: 'keine Kurse mehr (Datenereignis)',
});

/**
 * View of one security on the close of bar i: setup, entry for the next session, stop, risk, size, simulated position
 * (optional, from minervini-execution) and data quality. reviewerRiskFraction: the reviewer's risk per trade (no default).
 */
export function tradeView({ strategy, security, i, cfg = REFERENCE_CONFIG, rsProxy = null, reviewerRiskFraction = null, equity = null, simulatedTrade = null }) {
  if (!['SEPA', 'POWER_PLAY'].includes(strategy)) throw new Error('STRATEGY_REQUIRED');
  const bars = security.bars, isPP = strategy === 'POWER_PLAY';
  const setup = isPP ? powerPlaySetupAt(security, i) : sepaSetupAt(security, i);
  const detected = isPP ? ['CONFIRMED_MECHANICAL_SETUP', 'MANUAL_REVIEW_SETUP', 'DATA_BLOCKED_SETUP'].includes(setup.state) && fin(setup.pivot) : setup.state === 'SETUP_DETECTED';
  const setupState = !detected ? 'NO_SETUP' : isPP && setup.state === 'CONFIRMED_MECHANICAL_SETUP' ? 'SETUP_CONFIRMED_MECHANICAL' : 'SETUP_DETECTED';
  const el = entryEligibility({ strategy, setup: detected ? setup : null, bars, k: i + 1, cfg, hasPosition: Boolean(simulatedTrade) && simulatedTrade.status !== 'CLOSED' });
  const stop = detected ? stopFor(setup, cfg) : null, pivot = detected ? setup.pivot : null;
  const size = fin(stop) && fin(pivot) && reviewerRiskFraction && equity ? positionSize({ equity, riskFraction: reviewerRiskFraction, entry: pivot, stop }) : { status: 'RISK_FRACTION_REQUIRED', note: 'reviewer decision (MIN-SF-SIZE); no default risk' };
  const dq = [{ code: 'TRANSLATION_UNVERIFIED', label: 'Quellenwortlaut nur übersetzt, nicht am Original geprüft' }];
  if (!isPP) {
    dq.push({ code: 'IBD_RS_DATA_BLOCKED', label: 'IBD-RS-Rating nicht verfügbar; VU-Perzentil ist nur ein Stellvertreter' });
    const rs = rsProxy ? rsProxy.at(security.id, bars[i].date) : null;
    if (!fin(rs?.proxy?.vuPercentile)) dq.push({ code: 'RS_PROXY_UNAVAILABLE', label: 'RS-Stellvertreter nicht berechenbar' });
    const f = fundamentalEvidence(security.fund, bars[i].date);
    if (f.status !== 'EVIDENCE_ONLY') dq.push({ code: 'FUNDAMENTALS_MISSING', label: 'keine bis zum Vortag eingereichten SEC-Quartalszahlen', detail: f.status });
  }
  if (['DATA_BLOCKED', 'VCP_DATA_BLOCKED', 'DATA_BLOCKED_SETUP'].includes(setup.state)) dq.push({ code: 'MISSING_PRICE_OR_VOLUME_HISTORY', label: 'fehlende Kurs- oder Volumenhistorie', detail: setup.state });
  let position = { status: 'NONE', label: STATE_LABELS.NONE };
  if (simulatedTrade) {
    const st = simulatedTrade.status === 'CLOSED' ? 'SIMULATED_CLOSED' : simulatedTrade.status === 'OPEN_AT_DATA_END' ? 'OPEN_AT_DATA_END' : 'SIMULATED_OPEN';
    position = { status: st, label: STATE_LABELS[st], entryDate: simulatedTrade.entryDate, entryFill: simulatedTrade.entryFill, stop: simulatedTrade.finalStop ?? simulatedTrade.initialStop, shares: simulatedTrade.shares, exitReason: simulatedTrade.exitReason ?? null, exitLabel: simulatedTrade.exitReason ? EXIT_LABELS[simulatedTrade.exitReason] ?? simulatedTrade.exitReason : null, simulatedResearchOnly: true };
  }
  return {
    version: TRADE_VIEW_VERSION, lifecycleVersion: LIFECYCLE_VERSION, strategy, securityId: security.id, asOf: bars[i].date,
    setup: { state: setupState, label: STATE_LABELS[setupState], sourceState: setup.state, confirmationIsManual: !isPP || setup.state !== 'CONFIRMED_MECHANICAL_SETUP' ? true : 'MECHANICAL_PART_ONLY' },
    entry: { state: el.state, label: STATE_LABELS[el.state], blockers: el.blockers.map((b) => ({ code: b.code, label: BLOCKER_LABELS[b.code] ?? b.code, rule: b.rule, class: b.class })), forSession: 'next session after asOf' },
    pivot, stop, riskPerShare: fin(pivot) && fin(stop) ? pivot - stop : null, plannedLossPct: el.plannedLossAtPivot,
    positionSize: size, position, dataQuality: dq,
    manualReviewRequired: true, openManualDecisions: el.openManualDecisions,
    simulatedResearchOnly: true, isPortfolioPosition: false, buyDeclarationAllowed: false, ...NOT_A_STRATEGY,
  };
}
