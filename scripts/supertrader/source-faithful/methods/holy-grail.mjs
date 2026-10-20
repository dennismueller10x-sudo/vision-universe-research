/**
 * Linda Raschke Holy Grail, disclosed setup component on the daily timeframe (C13, contracts/holy-grail.mjs).
 * Source: #709 W-RAS04 (2004 interview, own quotes, HIGH, checked): ADX(14) > 30 on the same timeframe before the
 * pullback (RAS04-002, HARD); first pullback to the 20 EMA after a strong impulse (RAS04-001, the setup definition);
 * 3/10 SMA oscillator with SMA16 signal line (RAS04-004, HARD). Entry order, stop and size are not disclosed
 * (#709 C13), so the output is a review record. Long side (uptrend, +DI > -DI); the short side needs borrow data.
 */
import { fin, emaSeries, smaSeries } from '../common/series.mjs';

export const HOLY_GRAIL_VERSION = 'sf-holy-grail-1.0.0';
export const HG_PARAMS = Object.freeze({ adxPeriod: 14, adxThreshold: 30, ema: 20, osc: [3, 10], signal: 16 });

/** Wilder ADX / +DI / -DI (RAS04-002 "ADX14"): Wilder smoothing, first ADX = mean of the first n DX values. */
export function adx(bars, n = HG_PARAMS.adxPeriod) {
  const len = bars.length, ADX = new Array(len).fill(null), PDI = new Array(len).fill(null), MDI = new Array(len).fill(null);
  let sTR = 0, sP = 0, sM = 0, dxs = [], prevAdx = null;
  for (let i = 1; i < len; i++) {
    const b = bars[i], p = bars[i - 1];
    if (![b.high, b.low, p.high, p.low, p.close].every(fin)) return { ADX, PDI, MDI }; // no repair of gaps
    const up = b.high - p.high, dn = p.low - b.low;
    const pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
    if (i <= n) { sTR += tr; sP += pdm; sM += mdm; if (i < n) continue; }
    else { sTR = sTR - sTR / n + tr; sP = sP - sP / n + pdm; sM = sM - sM / n + mdm; }
    const pdi = sTR > 0 ? (100 * sP) / sTR : 0, mdi = sTR > 0 ? (100 * sM) / sTR : 0;
    PDI[i] = pdi; MDI[i] = mdi;
    const dx = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
    if (prevAdx === null) { dxs.push(dx); if (dxs.length === n) { prevAdx = dxs.reduce((a, x) => a + x, 0) / n; ADX[i] = prevAdx; } }
    else { prevAdx = (prevAdx * (n - 1) + dx) / n; ADX[i] = prevAdx; }
  }
  return { ADX, PDI, MDI };
}

/** RAS04-004: oscillator = SMA3 - SMA10 of the close; signal = SMA16 of the oscillator. */
export function oscillator310(bars, P = HG_PARAMS) {
  const c = bars.map((b) => b.close), a = smaSeries(c, P.osc[0]), b = smaSeries(c, P.osc[1]);
  const osc = a.map((x, i) => (fin(x) && fin(b[i]) ? x - b[i] : null));
  return { osc, signal: smaSeries(osc, P.signal) };
}

/**
 * Screen on bar i: ADX(14) > 30 on every bar from the last cross above 30 (k0) to i-1, +DI > -DI at i-1, and bar i is
 * the FIRST bar since k0 whose low touches the 20 EMA. Returns a MANUAL_REVIEW_REQUIRED record or [].
 */
export function holyGrailScreen(security, { asOfIndex = security.bars.length - 1 } = {}, P = HG_PARAMS) {
  const bars = security.bars, i = asOfIndex;
  const { ADX, PDI, MDI } = adx(bars, P.adxPeriod), ema = emaSeries(bars.map((b) => b.close), P.ema);
  if (i < 2 || !fin(ADX[i - 1]) || !(ADX[i - 1] > P.adxThreshold) || !(PDI[i - 1] > MDI[i - 1]) || !fin(ema[i])) return [];
  let k0 = i - 1; while (k0 - 1 >= 0 && fin(ADX[k0 - 1]) && ADX[k0 - 1] > P.adxThreshold) k0--;
  if (!(bars[i].low <= ema[i])) return [];
  for (let k = k0; k < i; k++) if (fin(ema[k]) && bars[k].low <= ema[k]) return []; // not the first pullback
  const { osc, signal } = oscillator310(bars, P);
  let impulseHigh = -Infinity, oscMax = -Infinity;
  for (let k = k0; k < i; k++) { impulseHigh = Math.max(impulseHigh, bars[k].high); if (fin(osc[k])) oscMax = Math.max(oscMax, osc[k]); }
  return [{
    status: 'MANUAL_REVIEW_REQUIRED', methodId: 'SF_RASCHKE_HOLY_GRAIL', securityId: security.id, asOf: bars[i].date, buyDeclarationAllowed: false, version: HOLY_GRAIL_VERSION, timeframe: 'DAILY',
    machineScreenEvidence: [
      { ruleId: 'RAS-SF-ADX', psr709: 'RAS04-002', value: { adxBeforePullback: ADX[i - 1], adxAboveSinceDate: bars[k0].date, plusDI: PDI[i - 1], minusDI: MDI[i - 1] } },
      { ruleId: 'RAS-SF-PULLBACK', psr709: 'RAS04-001', value: { ema20: ema[i], low: bars[i].low, firstTouchSince: bars[k0].date, impulseHigh, impulseAboveEmaPct: impulseHigh / ema[i] - 1 } },
      { ruleId: 'RAS-SF-OSC', psr709: 'RAS04-004', value: { osc: osc[i], signal: signal[i], oscMaxDuringImpulse: oscMax, newMomentumHighDuringImpulse: fin(oscMax) && fin(osc[k0 - 1] ?? null) ? oscMax > osc[k0 - 1] : null } },
    ],
    openQuestions: [{ flag: 'RAS-MR-IMPULSE', psr709: ['RAS04-001'], question: 'strong impulse before the pullback?' }, { flag: 'RAS-MR-EXECUTION', psr709: ['RAS04-001'], question: 'entry order, stop and exit are not disclosed (#709 C13)' }],
    dataNotAvailableToMachine: ['intraday timeframes (5-120 minutes)', 'disclosed entry order / stop / size'],
  }];
}
