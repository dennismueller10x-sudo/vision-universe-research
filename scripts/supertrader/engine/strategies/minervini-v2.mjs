// Minervini SEPA / VCP 2.0.0 (Runde 7). Neue Hypothese; 1.1.0 bleibt mit
// seinem Ergebnis bestehen. Primaerseiten (minervini.com, Buecher) waren in
// Runde 7 nicht abrufbar; Belegstufe je Regel in der Methodentreue-Matrix.
//
//  MIN-LOW-02   Kurs mindestens 30 % ueber dem 52-Wochen-Tief (Fassung des
//               Buchs 2013 laut uebereinstimmenden Sekundaerquellen; 1.1.0
//               nutzte die aeltere 25-%-Fassung).
//  MIN-ENTRY-D2 Schluss ueber dem Pivot UND Ausbruchsvolumen >= 1,4x 50-Tage-
//               Schnitt ("40-50 % ueber Durchschnitt", nur sekundaer belegt).
//  MIN-STOP-01  Tief der letzten Kontraktion, hoechstens 10 % unter dem
//               Einstieg (10 % als Hoechstverlust: Schwager-Interview, sekundaer).
//  MIN-BE-01    Stop auf Einstand, sobald der Schluss 3 Anfangsrisiken ueber dem
//               Einstieg liegt ("never let a good size gain turn into a loss",
//               primaer; Schwelle 3R sekundaer).
//  MIN-EXIT-02  Ausstieg bei Schluss unter der 50-Tage-Linie mit
//               ueberdurchschnittlichem Volumen (sekundaer; ersetzt den reinen
//               VU-Ausstieg MIN-EXIT-VU-01).
//  Portfolio    1,25 % Risiko je Trade, hoechstens 25 % je Position (primaer:
//               Minervini auf X), "progressive exposure": nach netto negativen
//               letzten fuenf Trades halbes Risiko (VU-Formalisierung einer
//               Primaeraussage).
// Nicht abgebildet: diskretionaere VCP-Beurteilung, Cheat-/Low-Cheat-Einstiege,
// Verkauf in die Staerke, Klimax-Signale, Fundamentaldaten ("Code 33").
import v1, { PARAMS as P1, scan as scan1, invalidate } from './minervini.mjs';

export const PARAMS = Object.freeze({ ...P1, lowDistance: 1.30, breakoutVolume: 1.4, breakevenR: 3, exitVolume: 1.0 });

export function scan(ctx, t, p = PARAMS, opts = {}) {
  const r = scan1(ctx, t, p, opts);
  if (r && r.rules && 'MIN-LOW-01' in r.rules) { r.rules['MIN-LOW-02'] = r.rules['MIN-LOW-01']; delete r.rules['MIN-LOW-01']; }
  if (r && r.levels && r.levels.stopPlan) r.levels.stopPlan = 'Tief der letzten Kontraktion, höchstens 10 % unter dem Einstieg; Einstand ab 3 Anfangsrisiken Gewinn';
  return r;
}

export function confirm(ctx, t, pending, p = PARAMS) {
  const { bars, ind } = ctx;
  if (!(bars.close[t] > pending.levels.trigger)) return null;
  const v50 = ind.vol50[t - 1];
  const ratio = Number.isFinite(v50) && v50 > 0 && Number.isFinite(bars.volume[t]) ? bars.volume[t] / v50 : null;
  if (ratio !== null && ratio < p.breakoutVolume) return { notTaken: true, ruleId: 'MIN-ENTRY-D2', note: `Schluss über dem Pivot, aber nur ${ratio.toFixed(2)}× Durchschnittsvolumen — kein Einstieg.` };
  return { ruleId: 'MIN-ENTRY-D2', basis: 'DAILY_CLOSE', close: bars.close[t], volumeRatio: ratio, volumeVerified: ratio === null ? null : true };
}

export function planEntry(ctx, t, sig, p = PARAMS) {
  const open = ctx.bars.open[t];
  return { stop: Math.max(sig.levels.contractionLow, open * (1 - p.maxRisk)), stopRuleId: 'MIN-STOP-01' };
}

export function manage(ctx, t, pos, p = PARAMS) {
  const { bars, ind } = ctx;
  const out = {};
  const risk = pos.entry - pos.initialStop;
  if (risk > 0 && bars.close[t] >= pos.entry + p.breakevenR * risk && pos.stop < pos.entry) { out.stop = pos.entry; out.stopRuleId = 'MIN-BE-01'; }
  const s50 = ind.sma50[t], v50 = ind.vol50[t];
  if (Number.isFinite(s50) && bars.close[t] < s50 && Number.isFinite(v50) && bars.volume[t] > p.exitVolume * v50) out.exitNextOpen = 'MIN-EXIT-02';
  out.warning = !out.exitNextOpen && (bars.close[t] < pos.levels.trigger || (Number.isFinite(s50) && bars.close[t] < s50));
  out.warningRuleId = 'MIN-WARN-02';
  return out;
}

export const PORTFOLIO = Object.freeze({ initialEquity: 100000, riskPerTrade: 0.0125, maxPositionPct: 0.25, maxPositions: 10, maxExposure: 1.0, riskFreeRate: 0.02, progressive: { lookback: 5, factor: 0.5 }, source: 'Minervini (eigene Beiträge auf X): Ø 1,25 % Risiko, 25 % Position bei 5 % Stop, schrittweise Exposition; Höchstzahl 10 und Halbierungsregel sind VU.' });

export default {
  id: 'MINERVINI_VCP', variant: 'MINERVINI_TT_VCP_R7', version: '2.0.0', timeframe: 'daily',
  manageCompatible: ['2.0.0'],
  legacy: { '1.0.0': v1, '1.1.0': v1 },
  PARAMS, scan, confirm, planEntry, invalidate, manage, portfolio: PORTFOLIO,
};
