// Darvas Box 3.0.0 (Runde 8). 1.2.0 und 2.0.0 bleiben mit ihren Ergebnissen bestehen.
//
// Primaerquelle, in Runde 8 im Volltext gelesen: TIME, 25.05.1959 ("Business:
// Pas de Dough") - Darvas "places buy orders at breakout points" und legt die
// Stop-Loss-Order "just below his buy order"; er begrenzt sich auf "five or
// six stocks at a time" und beobachtet Aktien, die mit starkem Volumen gut
// steigen. TIME, 01.08.1960 ("The Darvas Effect"): Stop-Loss-Order als
// Kernbaustein, Beispiel 40 -> 38; bei Kurssturz wird unter dem Stop verkauft.
//
// Aenderung gegenueber 2.0.0 (Umsetzungsfehler der alten Versionen):
//  DAR-ENTRY-BS  Kauforder am Ausbruchspunkt (Boxoberkante) im Tagesverlauf
//                statt Schlusskurs-Bestaetigung + Kauf zur naechsten Eroeffnung.
//                Ausfuehrung zu max(Eroeffnung, Oberkante).
//  DAR-STOP-03   Stop 1 % unter der Kauforder (= Oberkante); 1 % ist VU fuer "just below".
//  DAR-PORT-01   Hoechstens 6 Titel gleichzeitig (TIME 1959).
// Unveraendert: Boxbildung (VU, 3-Tage-Regel nur sekundaer), Auswahl,
// Nachziehen an jede hoehere bestaetigte Boxunterkante (DAR-STOP-01).
// Nicht abgebildet: Fundamentalfilter ("infant industries where earnings could
// double or treble"), Volumenschwelle (keine Zahl belegt), Pyramiding.
import v1, { scan, invalidate, quality } from './darvas.mjs';
import v2, { PARAMS as P2, manage } from './darvas-v2.mjs';

export const PARAMS = P2;

export function intradayEntry(ctx, t, pending, p = PARAMS) {
  const { bars } = ctx;
  const trig = pending.levels.trigger;
  if (!(bars.high[t] > trig)) return null;
  const fill = Math.max(bars.open[t], trig);
  const stop = trig * (1 - p.stopBelowTop);
  const v50 = ctx.ind.vol50[t - 1];
  return { ruleId: 'DAR-ENTRY-BS', price: fill, stop, stopRuleId: 'DAR-STOP-03', volumeRatio: Number.isFinite(v50) && v50 > 0 ? bars.volume[t] / v50 : null, pessimisticSameDayExit: bars.low[t] <= stop };
}

export const PORTFOLIO = Object.freeze({ initialEquity: 100000, riskPerTrade: 0.005, maxPositionPct: 0.20, maxPositions: 6, maxExposure: 1.0, riskFreeRate: 0.02, source: 'Darvas (TIME 1959): höchstens fünf bis sechs Aktien gleichzeitig. Risiko je Trade und Höchstgewicht sind VU-Standard (keine belegte Zahl).' });

export default {
  id: 'DARVAS_BOX', variant: 'DARVAS_BOX_BUYSTOP_R8', version: '3.0.0', timeframe: 'daily',
  entryMode: 'BUY_STOP_INTRADAY',
  manageCompatible: ['2.0.0', '3.0.0'],
  legacy: { '1.0.0': v1, '1.1.0': v1, '1.2.0': v1 },
  PARAMS, scan, intradayEntry, invalidate, manage, quality,
  classify: (ctx, t, sig) => quality(ctx, t, sig.levels),
  confirm: () => null, planEntry: () => ({ notTaken: true, ruleId: 'DAR-ENTRY-BS', note: 'Einstieg nur per Kauforder am Ausbruchspunkt' }),
  portfolio: PORTFOLIO,
};
void v2;
