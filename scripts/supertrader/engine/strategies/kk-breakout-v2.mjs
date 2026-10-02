// Momentum Breakout 2.0.0 (Runde 7) — Korrektur der Positionsfuehrung nach
// Kullamaegis eigener Beschreibung (qullamaggie.com, "3 timeless setups" und
// FAQ; in Runde 7 nur ueber Suchauszuege lesbar, siehe Methodentreue-Matrix):
// "1/3 bis 1/2 nach 3-5 Tagen verkaufen, Stop auf Einstand, den REST an der
// 10- oder 20-Tage-Linie nachziehen".
//
// Version 1.1.0 wendete den 10-Tage-Ausstieg ab dem ersten Tag auf die GANZE
// Position an. Das ist keine Originalregel (KK-BO-TRAIL-01 betrifft den Rest
// nach dem Teilverkauf) und fuehrte zu einer mittleren Haltedauer von unter
// vier Sitzungen. 2.0.0: vor dem Teilverkauf gilt nur der Stop am Tagestief
// des Ausbruchstags (KK-BO-STOP-D1); der 10-Tage-Ausstieg (KK-BO-TRAIL-02)
// greift erst fuer den Rest nach dem Teilverkauf.
// Alles andere (Auswahl, Basis, Bestaetigung, Gap-Regel, Stop) unveraendert.
import v1, { PARAMS as P1, scan, confirm, planEntry, invalidate } from './kk-breakout.mjs';

export const PARAMS = P1;

export function manage(ctx, t, pos, p = PARAMS) {
  const { bars, ind } = ctx;
  const out = {};
  const held = pos.heldSessions || 0;
  if (!pos.partialDone && held >= p.partialAfterSessions) {
    out.partialNextOpen = { fraction: p.partialFraction, ruleId: 'KK-BO-SCALE-01' };
    out.stop = Math.max(pos.stop, pos.entry);
    out.stopRuleId = 'KK-BO-SCALE-01';
  }
  const ma = ind[p.trailSma][t];
  if (pos.partialDone && Number.isFinite(ma) && bars.close[t] < ma) out.exitNextOpen = 'KK-BO-TRAIL-02';
  out.warning = !out.exitNextOpen && (bars.close[t] < pos.entry || (pos.partialDone && Number.isFinite(ma) && bars.close[t] < ma * 1.01));
  out.warningRuleId = 'KK-BO-WARN-01';
  return out;
}

// Portfolio (KK-FAQ): Risiko meist 0,3-0,5 % je Trade, Positionen meist 10-20 %.
export const PORTFOLIO = Object.freeze({ initialEquity: 100000, riskPerTrade: 0.005, maxPositionPct: 0.20, maxPositions: 10, maxExposure: 1.0, riskFreeRate: 0.02, source: 'KK-FAQ (Risiko 0,3-0,5 %, Positionen 10-20 %); Höchstzahl 10 ist VU' });

export default {
  id: 'MOMENTUM_BREAKOUT', variant: 'KK_COMMON_BREAKOUT_DAILY_R7', version: '2.0.0', timeframe: 'daily',
  manageCompatible: ['2.0.0'],
  legacy: { '1.0.0': v1, '1.1.0': v1 },
  PARAMS, scan, confirm, planEntry, invalidate, manage, portfolio: PORTFOLIO,
};
