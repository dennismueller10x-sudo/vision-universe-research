// MinerviniAdaptationPortfolioPolicy 1.1.0 – wie 2A, ausser MR-PF-02 (Startstufe nach Primaerbeleg 2022).
// Reihenfolge, Stueckelung und Reservierung kommen unveraendert aus dem eingefrorenen 2A-Modul.
import { requireP } from '../minervini/trend-template.mjs';
import { rankOrders, reserveOrders, sizeOrder, wholeShares } from '../minervini/portfolio-policy.mjs';
import { withMaxPositionPct } from './params.mjs';

export const POLICY_ID = 'MinerviniAdaptationPortfolioPolicy@1.1.0';
export { rankOrders, reserveOrders, sizeOrder, wholeShares };
export const STAGE = Object.freeze({ PILOT: 'PILOT', FULL: 'FULL' });

// MR-PF-02: Startstufe (zu Beginn und nach einem Verlust-Trade) 25 % Exposure, je Position hoechstens 5 %;
// volle Stufe nach einem Gewinn-Trade: 100 % und size.maxPositionPct (MR-SIZ-02). Der Wechsel ist VU_FORMALIZATION.
// MR-PF-07: kein Indexfilter.
export function exposureStage(lastClosedPnl, P) {
  requireP(P);
  const full = lastClosedPnl !== null && lastClosedPnl !== undefined && lastClosedPnl > 0;
  return full
    ? { stage: STAGE.FULL, ceiling: P['pf.fullExposureCeiling'], maxPositionPct: P['size.maxPositionPct'] }
    : { stage: STAGE.PILOT, ceiling: P['pf.initialExposureCeiling'], maxPositionPct: P['pf.initialMaxPositionPct'] };
}

// Reservierung mit stufenabhaengigem Hoechstgewicht.
export function reserveOrdersStaged(groups, state, stage, P) {
  return reserveOrders(groups, { ...state, ceiling: stage.ceiling }, withMaxPositionPct(P, stage.maxPositionPct));
}
