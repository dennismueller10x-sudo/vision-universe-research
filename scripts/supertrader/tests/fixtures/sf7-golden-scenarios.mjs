// Supertrader 7.0 – kleine synthetische Balkenreihen fuer die handgerechneten Golden Cases (sf-sf7-execution-validation).
// Die Reihen entsprechen den Szenarien der Supertrader-5.0-Tests (Darvas textbook, KK, Pocket Pivot, BGU, Holy Grail,
// Weinstein stage, EP, PS); sie sind hier nur gebuendelt, damit die Golden Cases eigene Erwartungswerte von Hand tragen.
export const day = (k, start = Date.UTC(2019, 0, 1)) => new Date(start + k * 864e5).toISOString().slice(0, 10);
export const bar = (k, o, h, l, c, v = 1e6, start) => ({ date: day(k, start), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
export const ds = (...secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs.map((s) => ({ terminal: null, ...s })) });

/** Darvas: box top 72 / bottom 66 complete at bar 35, touch entry 72.01 on bar 36, raise to 72.29 at bar 41, stop hit on bar 43 */
export function darvasTextbook() {
  const bars = [];
  for (let k = 0; k < 30; k++) { const c = 40 + k; bars.push(bar(k, c - 0.2, c + 0.5, c - 0.5, c)); }
  [[69.5, 72, 69, 71], [70.5, 71, 68, 69], [68.5, 70.5, 66, 67], [67, 70, 67, 68], [68, 69, 67, 68.5], [68.5, 70, 66.5, 69], [72, 73.5, 72, 73.2], [73.2, 73.4, 72.5, 73], [73, 73, 72.3, 72.8], [72.8, 72.9, 72.6, 72.7], [72.7, 73, 72.5, 72.8], [72.8, 73.2, 72.4, 73], [73, 73, 72.4, 72.6], [72.35, 72.5, 72, 72.1]].forEach(([o, h, l, c], j) => bars.push(bar(30 + j, o, h, l, c)));
  for (let j = 0; j < 8; j++) bars.push(bar(bars.length, 70.5, 71, 70, 70.5));
  return { id: 'DAR', bars };
}

const r3 = (k, c, v = 1e6) => bar(k, c, c * 1.015, c * 0.985, c, v);
/** Kullamaegi: breakout close 30.9 / low 30.4 on bar 120; NEXT_OPEN entry at 31 on bar 121 */
export function kkScenario() {
  const bars = [];
  for (let k = 0; k < 80; k++) bars.push(r3(k, 20));
  for (let k = 80; k < 110; k++) bars.push(r3(k, 20 + (10 * (k - 79)) / 30));
  for (let k = 110; k < 120; k++) bars.push(r3(k, 29.6 + 0.02 * (k - 110)));
  bars.push(bar(120, 29.9, 31, 30.4, 30.9));
  [[31, 31.6, 30.9, 31.4], [31.4, 32, 31.2, 31.8], [31.8, 32.6, 31.6, 32.4], [32.4, 33, 32.2, 32.8], [32.8, 33, 31.9, 32.0], [32, 32.2, 30.5, 30.6], [30.6, 30.8, 30.2, 30.4]].forEach(([o, h, l, c], j) => bars.push(bar(121 + j, o, h, l, c)));
  for (let j = 0; j < 5; j++) bars.push(r3(bars.length, 30.4));
  return { id: 'KK', bars };
}

/** Morales / Kacher BGU: gap day 130 (low 37.6), entry at the open of 131, gap through the stop at the open of 133 */
export function bguScenario() {
  const bars = [];
  for (let k = 0; k < 130; k++) { const c = 30 + k * 0.05; bars.push(bar(k, c, c + 0.3, c - 0.3, c)); }
  bars.push(bar(130, 37.8, 38.6, 37.6, 38.4, 3e6));
  [[38.5, 39, 38.2, 38.8], [38.8, 39.2, 38.4, 39], [37.2, 37.5, 36.8, 37]].forEach(([o, h, l, c], j) => bars.push(bar(131 + j, o, h, l, c)));
  return { id: 'BGU', bars };
}

/** Pocket pivot day 120 (volume above every down day of the ten before), entry at the open of 121, later a MA violation */
export function ppScenario() {
  const bars = [];
  for (let k = 0; k < 120; k++) { const c = 30 + k * 0.1 + (k % 4 === 3 ? -0.15 : 0); bars.push(bar(k, c - 0.05, c + 0.2, c - 0.2, c, k % 4 === 3 ? 8e5 : 7e5)); }
  bars.push(bar(120, 42, 42.6, 41.9, 42.5, 2e6));
  for (let k = 121; k < 160; k++) { const c = 42.5 + (k - 120) * 0.05; bars.push(bar(k, c, c + 0.2, c - 0.2, c)); }
  for (let k = 160; k < 175; k++) { const c = 44.5 - (k - 159) * 0.6; bars.push(bar(k, c + 0.1, c + 0.2, c - 0.3, c)); }
  return { id: 'PP', bars };
}

/** Holy Grail: impulse (ADX > 30), pullback to the 20 EMA, continuation above the impulse high */
export function hgScenario() {
  const bars = [];
  for (let k = 0; k < 40; k++) bars.push(bar(k, 20, 20.3, 19.7, 20 + (k % 2 ? 0.1 : -0.1)));
  for (let k = 40; k < 70; k++) { const c = 20 + (k - 39) * 0.6; bars.push(bar(k, c - 0.3, c + 0.4, c - 0.4, c)); }
  for (let k = 70; k < 76; k++) { const c = 38 - (k - 69) * 0.9; bars.push(bar(k, c + 0.3, c + 0.5, c - 0.4, c)); }
  for (let k = 76; k < 96; k++) { const c = 33 + (k - 75) * 0.5; bars.push(bar(k, c - 0.2, c + 0.4, c - 0.3, c)); }
  return { id: 'HG', bars };
}

const MONDAY = Date.UTC(2019, 0, 7);
/** Weinstein: Stage 4, Stage 1 base, Stage 2 breakout with volume, correction, new high, decline (weekdays from a Monday) */
export function stageScenario() {
  const px = (k) => (k < 210 ? 50 - (20 * k) / 210 : k < 420 ? 30 + 1.5 * Math.sin(k / 9) : k < 470 ? 30 + (k - 420) * 0.3 : k < 490 ? 45 - (k - 470) * 0.25 : k < 530 ? 40 + (k - 490) * 0.2 : 48 - (k - 530) * 0.4);
  const bars = []; for (let k = 0; k < 560; k++) { const c = px(k); bars.push(bar(k, c, c * 1.01, c * 0.99, c, k >= 420 && k < 430 ? 4e6 : 1e6, MONDAY)); }
  return { id: 'WEIN', bars };
}

const EP_START = Date.UTC(2021, 0, 4);
const ebar = (k, o, h, l, c, v = 1e6) => bar(k, o, h, l, c, v, EP_START);
const eflat = (k, c) => ebar(k, c, c * 1.015, c * 0.985, c);
export const epDay = (k) => day(k, EP_START);
const mm = (k, o, h, l, c, v = 10000) => ({ k, open: o, high: h, low: l, close: c, volume: v });
/** EP: gap day 80 (official open 23, +15 %), 20 rising sessions, then a close below the 20-day MA (consolidated low = dayLow) */
export function epScenario({ dayLow = 22.95 } = {}) {
  const bars = []; for (let k = 0; k < 80; k++) bars.push(eflat(k, 20));
  bars.push(ebar(80, 23, 25, dayLow, 24.5, 5e6));
  const rise = Array.from({ length: 20 }, (_, j) => { const c = 25 + j * 0.25; return [c - 0.1, c + 0.2, c - 0.2, c]; });
  [...rise, [29.6, 29.7, 27, 27.2], [27.1, 27.3, 26.8, 27]].forEach(([o, h, l, c], j) => bars.push(ebar(81 + j, o, h, l, c)));
  for (let j = 0; j < 3; j++) bars.push(eflat(bars.length, 27));
  return { id: 'US:X:EPX', bars };
}
/** IEX minutes of the EP gap day: ORH-1 break in minute 2 at 23.21 (stop 22.95 = official open low), no later low <= stop */
export function epMinutes({ volume = 50000 } = {}) {
  const m = [mm(0, 23, 23.2, 22.95, 23.1, volume), mm(1, 23.1, 23.15, 23.05, 23.1, volume * 0.6), mm(2, 23.12, 23.4, 23.1, 23.35, volume * 0.8)];
  for (let k = 3; k < 390; k++) { const p = 23.4 + (k / 389) * 1.6; m.push(mm(k, p, k === 389 ? 25 : p + 0.02, k === 200 ? 23.3 : p - 0.02, p, 2000)); }
  return m;
}
/** PS: three accelerating up days, trade day 63 (short under the 5-minute ORL), later days given by `after` */
export function psScenario(after = [[26.2, 26.4, 24.5, 24.8], [24.8, 25, 21, 21.5]]) {
  const bars = []; for (let k = 0; k < 60; k++) bars.push(eflat(k, 20));
  let c = 20; for (const r of [0.05, 0.07, 0.10]) { const o = c; c = c * (1 + r); bars.push(ebar(bars.length, o, c * 1.005, o * 0.995, c)); }
  bars.push(ebar(63, 27, 27.5, 26, 26.2));
  after.forEach(([o, h, l, cl], j) => bars.push(ebar(64 + j, o, h, l, cl)));
  for (let j = 0; j < 3; j++) bars.push(eflat(bars.length, 21.5));
  return { id: 'US:X:PSX', bars };
}
export function psMinutes() {
  const m = [mm(0, 27, 27.5, 26.9, 27.3), mm(1, 27.3, 27.4, 27.1, 27.2), mm(2, 27.2, 27.25, 26.8, 26.9), mm(3, 26.9, 27, 26.85, 26.95), mm(4, 26.95, 27.05, 26.9, 27)];
  m.push(mm(5, 27, 27.02, 26.9, 26.92)); m.push(mm(6, 26.92, 26.95, 26.85, 26.88)); m.push(mm(7, 26.85, 26.86, 26.7, 26.72));
  for (let k = 8; k < 390; k++) { const p = 26.7 - ((k - 8) / 381) * 0.5; m.push(mm(k, p, p + 0.03, k === 389 ? 26 : p - 0.03, p)); }
  return m;
}
