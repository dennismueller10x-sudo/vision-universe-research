// Momentum Breakout 3.0.0 (Runde 8) — Kullamaegis Breakout so nah an seiner
// eigenen Beschreibung, wie Tagesbalken es erlauben.
//
// Primaerquelle, in Runde 8 im Volltext gelesen (qullamaggie.com, "3 TIMELESS
// setups that have made me TENS OF MILLIONS!", 08.01.2021, und FAQ):
//  * Auswahl: "Scan for the 1 or 2% of stocks that are up the most" ueber
//    1, 3 und 6 Monate.
//  * Setup: (1) grosse Bewegung von 30-100 %+ in den letzten 1-3 Monaten,
//    (2) geordnete Konsolidierung mit hoeheren Tiefs und enger werdender Spanne,
//    2 Wochen bis 2 Monate, der Kurs "surft" die steigende 10- und 20-Tage-Linie,
//    (3) Ausbruch aus dieser Konsolidierung.
//  * Einstieg: Opening-Range-High (1/5/60 Minuten) - "You don't even have to
//    use any intraday chart, just look at the daily chart and enter when the
//    stock is starting to break out."
//  * Stop: "always lows of the day and stop should not be wider than the ATR
//    or ADR of the stock".
//  * 1/3 bis 1/2 nach 3-5 Tagen verkaufen, Stop auf Einstand; Rest mit der
//    10- oder 20-Tage-Linie, Anfaenger: erster SCHLUSS unter der 10-Tage-Linie.
//  * Position: "most of my positions are 10-20%", FAQ "generally 5%-25%";
//    Risiko meist 0,3-0,5 %, selten > 1 %; nie mehr als 30 % ueber Nacht.
//  * ADR (FAQ): durchschnittliche Tagesspanne in % ueber 20 Sitzungen.
//  * Kein Marktfilter in seinen schriftlichen Quellen.
//
// Was sich gegenueber 1.1.0/2.0.0 aendert (Abweichungen der alten Umsetzung):
//  * Einstieg am Ausbruchstag per Kauf-Stop am Trigger statt Schlusskurs-
//    Bestaetigung und Kauf zur Eroeffnung des Folgetags.
//  * Stop = Tief des Einstiegstags (gekappt auf 1 ADR) statt Tief des
//    Bestaetigungstags (Vortag des Einstiegs).
//  * Keine Gap-Sperre (stand nicht in der Quelle; ADR-Kappung begrenzt das Risiko).
//  * Hoechstgewicht 25 % (FAQ) statt 20 %.
//
// VU-Annaeherungen (gekennzeichnet): Trigger = Hoch der letzten 5 Sitzungen
// (obere Kante der engen Zone), Basis-Algorithmus, Liquiditaet, Teilverkauf
// genau nach 3 Sitzungen und 1/3, Tagesbalken-Annahme: das Tagestief liegt vor
// dem Einstieg (Opening-Range-Logik); vorsichtige Gegenprobe: Schluss unter
// dem Einstieg gilt als Ausstieg am selben Tag zum Stop.
import v1, { PARAMS as P1, scan as scan1, invalidate } from './kk-breakout.mjs';
import v2, { manage } from './kk-breakout-v2.mjs';

export const PARAMS = Object.freeze({ ...P1, gapSkipAdrMultiple: null });

export function scan(ctx, t, p = PARAMS, opts = {}) {
  const r = scan1(ctx, t, p, opts);
  if (r && r.levels && r.levels.stopPlan) r.levels.stopPlan = 'Tagestief des Einstiegstags, höchstens 1 ADR unter dem Einstieg';
  if (r && r.levels && r.levels.trigger) r.levels.triggerBasis = 'INTRADAY_BUY_STOP';
  return r;
}

// Kauf-Stop am Trigger (Stand Vortagesschluss). Ausfuehrung zu max(Eroeffnung,
// Trigger); Stop = Tagestief, hoechstens 1 ADR (ADR bis zum Vortag) unter dem Einstieg.
export function intradayEntry(ctx, t, pending, p = PARAMS) {
  const { bars, ind } = ctx;
  const trig = pending.levels.trigger;
  if (!(bars.high[t] >= trig)) return null;
  const fill = Math.max(bars.open[t], trig);
  const adr = ind.adr20[t - 1] ?? pending.levels.adr20;
  const cap = Number.isFinite(adr) ? fill * (1 - adr) : -Infinity;
  const lod = bars.low[t];
  const stop = Math.max(Math.min(lod, fill * 0.9999), cap);
  const v50 = ind.vol50[t - 1];
  return {
    ruleId: 'KK-BO-ENTRY-ORH-D', price: fill, stop, stopRuleId: lod >= cap ? 'KK-BO-STOP-LOD' : 'KK-BO-STOP-ADR',
    volumeRatio: Number.isFinite(v50) && v50 > 0 ? bars.volume[t] / v50 : null,
    pessimisticSameDayExit: bars.close[t] < fill,
  };
}

export const PORTFOLIO = Object.freeze({ initialEquity: 100000, riskPerTrade: 0.005, maxPositionPct: 0.25, maxPositions: 10, maxExposure: 1.0, riskFreeRate: 0.02, source: 'Kullamägi: Risiko meist 0,3–0,5 %, Positionen meist 10–20 % (FAQ 5–25 %), nie über 30 % über Nacht; Höchstzahl 10 ist VU.' });

export default {
  id: 'MOMENTUM_BREAKOUT', variant: 'KK_BREAKOUT_BUYSTOP_DAILY_R8', version: '3.0.0', timeframe: 'daily',
  entryMode: 'BUY_STOP_INTRADAY',
  manageCompatible: ['2.0.0', '3.0.0'],
  legacy: { '1.0.0': v1, '1.1.0': v1 },
  PARAMS, scan, intradayEntry, invalidate, manage,
  confirm: () => null, planEntry: () => ({ notTaken: true, ruleId: 'KK-BO-ENTRY-ORH-D', note: 'Einstieg nur per Kauf-Stop' }),
  portfolio: PORTFOLIO,
};
void v2;
