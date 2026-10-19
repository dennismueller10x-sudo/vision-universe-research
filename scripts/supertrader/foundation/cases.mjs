// Supertrader Foundation — eingefrorene synthetische Eingaben fuer den Vorher/Nachher-Nachweis.
//
// Jeder Fall ist deterministisch und hat dieselbe Form wie die Trades aus
// validation/analyze-methods.mjs tradesFor(): { id, listingId, entry, initialStop, exits,
// terminal, marks, divs, volumes }. Dieselben Eingaben laufen einmal im Legacy-Modus und
// einmal im Modus RESEARCH_V1 durch validation/portfolio.mjs runPortfolioTR.

export function weekdays(from, n) {
  const out = [];
  const d = new Date(from + 'T00:00:00Z');
  while (out.length < n) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

export const CALENDAR = Object.freeze(weekdays('2020-01-02', 40));
const C = CALENDAR;
export const CFG = Object.freeze({ initialEquity: 100000, riskPerTrade: 0.01, maxPositionPct: 0.25, maxPositions: 10, maxExposure: 1 });

// Kursreihe: price(i) fuer die Indizes [from, to], ohne die Indizes in skip.
function marksOf(from, to, price, skip = []) {
  const m = new Map(), s = new Set(skip);
  for (let i = from; i <= to; i++) if (!s.has(i)) m.set(C[i], price(i));
  return m;
}
function volsOf(marks, vol = () => 1000) { return new Map([...marks.keys()].map((d, i) => [d, vol(d, i)])); }
function trade(id, { entry = 1, stop = 9, entryPrice = 10, exits = [], terminal = null, marks, divs = new Map(), vols }) {
  return { id, listingId: id, entry: { date: C[entry], price: entryPrice }, initialStop: stop, exits, terminal, marks, divs, volumes: vols || volsOf(marks) };
}
const exit = (i, price, fraction, ruleId = 'TEST-EXIT') => ({ date: C[i], price, fraction, ruleId, basis: 'NEXT_OPEN' });

// Die Faelle decken den Pruefkatalog des Auftrags ab (Abschnitt 6).
export const CASES = Object.freeze([
  { id: 'C01_BAR_PRESENT', title: 'Kurs an jedem Tag vorhanden, Vollverkauf', build: () => [trade('AAA', { marks: marksOf(1, 20, (i) => 10 + i * 0.1), exits: [exit(20, 12, 1)] })] },
  { id: 'C02_ONE_MISSING_BAR', title: 'ein Handelstag ohne Kurs', build: () => [trade('AAA', { marks: marksOf(1, 20, (i) => 10 + i * 0.1, [10]), exits: [exit(20, 12, 1)] })] },
  { id: 'C03_MULTI_MISSING_WITHIN_LIMIT', title: 'mehrere Tage ohne Kurs, innerhalb der Grenze (5)', build: () => [trade('AAA', { marks: marksOf(1, 20, (i) => 10 + i * 0.1, [8, 9, 10, 11, 12]), exits: [exit(20, 12, 1)] })] },
  { id: 'C04_STALE_LIMIT_REACHED', title: 'Stale-Grenze erreicht: 8 Tage ohne Kurs, spaeter ein Ausstieg zu einem hoeheren Kurs', build: () => [trade('AAA', { marks: marksOf(1, 25, (i) => (i < 8 ? 10 + i * 0.1 : 20), [8, 9, 10, 11, 12, 13, 14, 15]), exits: [exit(25, 20, 1)] })] },
  { id: 'C05_PREMATURE_SERIES_END', title: 'Reihe endet vor Fensterende (OPEN_AT_END_MARK am letzten realen Balken)', build: () => [trade('AAA', { marks: marksOf(1, 12, (i) => 10 + i * 0.1), exits: [exit(12, 11.2, 1, 'OPEN_AT_END_MARK')], terminal: { date: C[12], lastClose: 11.2, distress: false, kind: 'OPEN_AT_END', cause: 'SERIES_END' } })] },
  { id: 'C06_GAP_SEGMENT_END', title: 'Segmentende durch Datenluecke, als DELISTED gefuehrt (Legacy) - Datenereignis', build: () => [trade('AAA', { marks: marksOf(1, 12, (i) => 10 + i * 0.1), terminal: { date: C[12], lastClose: 11.2, distress: false, kind: 'DELISTED', cause: 'DATA_GAP' } })] },
  { id: 'C07_ECONOMIC_DELISTING', title: 'wirtschaftliches Delisting (Notierung inaktiv) - Protokoll unveraendert', build: () => [trade('AAA', { marks: marksOf(1, 12, (i) => 10 + i * 0.1), terminal: { date: C[12], lastClose: 11.2, distress: false, kind: 'DELISTED', cause: 'LISTING_INACTIVE' } })] },
  { id: 'C08_LATE_OBSERVED_QUARANTINE', title: 'Quarantaene ab Tag 12, erst an Tag 15 beobachtet', build: () => [trade('AAA', { marks: marksOf(1, 11, (i) => 10 + i * 0.1), terminal: { date: C[12], from: C[12], observedAt: C[15], lastClose: 11.1, distress: false, kind: 'DATA_QUARANTINE' } })] },
  { id: 'C09_ONTIME_QUARANTINE', title: 'Quarantaene am selben Tag beobachtet', build: () => [trade('AAA', { marks: marksOf(1, 11, (i) => 10 + i * 0.1), terminal: { date: C[12], from: C[12], observedAt: C[12], lastClose: 11.1, distress: false, kind: 'DATA_QUARANTINE' } })] },
  { id: 'C10_FULL_SALE', title: 'Vollverkauf mit Dividende', build: () => [trade('AAA', { marks: marksOf(1, 15, () => 10), divs: new Map([[C[5], 0.25]]), exits: [exit(15, 10.5, 1)] })] },
  { id: 'C11_PARTIAL_THIRDS', title: 'Teilverkauf 1/3 (6 Dezimalen wie im Simulator), dann Rest', build: () => [trade('AAA', { marks: marksOf(1, 20, () => 10), exits: [exit(10, 11, 0.333333), exit(20, 12, 0.666667)] })] },
  { id: 'C12_FRACTIONAL_SHARES', title: 'Bruchteilsaktien (Risiko-Sizing ergibt keine ganze Zahl)', build: () => [trade('AAA', { entryPrice: 33.3333, stop: 31.7, marks: marksOf(1, 10, () => 33.3333), exits: [exit(10, 34, 1)] })] },
  { id: 'C13_ROUNDING_RESIDUAL', title: 'Fraktionen summieren sich auf 1 - 5e-10 (Rest unter der Loeschschwelle)', build: () => [trade('AAA', { marks: marksOf(1, 20, () => 10), exits: [exit(10, 11, 0.5), exit(20, 12, 0.5 - 5e-10)] })] },
  { id: 'C14_OVERSHOOT_FRACTION', title: 'Schlussfraktion um 1e-12 groesser als der Rest (Ueberverkauf)', build: () => [trade('AAA', { marks: marksOf(1, 20, () => 10), exits: [exit(10, 11, 0.4), exit(20, 12, 0.6 + 1e-12)] })] },
  { id: 'C15_EXIT_WITHOUT_SOURCE_BAR', title: 'Ausstieg an einem Tag ohne realen Quellbalken (synthetisch, nicht ausfuehrbar)', build: () => [trade('AAA', { marks: marksOf(1, 20, () => 10, [10]), exits: [exit(10, 9, 1)] })] },
  { id: 'C16_TINY_ORDER', title: 'Order unter dem Mindestwert (1e-6)', build: () => [trade('AAA', { entryPrice: 1e-9, stop: 5e-10, marks: marksOf(1, 10, () => 1e-9), exits: [exit(10, 1e-9, 1)] })], cfg: { ...CFG, initialEquity: 2e-6 } },
  { id: 'C17_NO_LOOKAHEAD_QUARANTINE', title: 'kein Effekt einer spaeter beobachteten Quarantaene vor observedAt', build: () => [trade('AAA', { marks: marksOf(1, 11, (i) => 10 + i * 0.1), terminal: { date: C[12], from: C[12], observedAt: C[30], lastClose: 11.1, distress: false, kind: 'DATA_QUARANTINE' } })] },
  { id: 'C18_FINAL_VALUATION', title: 'Position am Fensterende offen (Schlussbewertung)', build: () => [trade('AAA', { marks: marksOf(1, 39, (i) => 10 + i * 0.05), exits: [exit(39, 11.95, 1, 'OPEN_AT_END_MARK')], terminal: { date: C[39], lastClose: 11.95, distress: false, kind: 'OPEN_AT_END', cause: 'WINDOW_END' } })] },
  { id: 'C19_DUST_BELOW_LIMIT', title: 'Teilverkauf laesst einen Rest von 5e-7 der Position (Wert ~0,005) ohne weiteren Ausstieg', build: () => [trade('AAA', { marks: marksOf(1, 20, () => 10), exits: [exit(10, 10, 1 - 5e-7)] })] },
  { id: 'C20_HIGH_PRICE_RESIDUAL', title: 'V3-52W-Regression: Rest von ~8e-11 Stueck bei 1,97e11 Kurs (Wert ~15,8) nach einem Teilverkauf', build: () => [trade('ZZZ', { entryPrice: 1.97e11, stop: 1.8e11, marks: marksOf(1, 20, () => 1.97e11), exits: [exit(10, 1.97e11, 1 - 0.00136), exit(20, 1.97e11, 0.00136)] })] },
  { id: 'C21_ZERO_VOLUME_STALE', title: 'Nullvolumen bei unveraendertem Schluss zaehlt als stale', build: () => { const m = marksOf(1, 20, (i) => (i >= 5 && i <= 12 ? 10 : 10 + i * 0.01)); m.set(C[5], 10); return [trade('AAA', { marks: m, vols: volsOf(m, (d, i) => (i >= 4 && i <= 11 ? 0 : 1000)), exits: [exit(20, 10.2, 1)] })]; } },
  { id: 'C22_TWO_POSITIONS_CASH', title: 'zwei Positionen, Bargeld knapp (keine negativen Bestaende)', build: () => [trade('AAA', { stop: 9.9, marks: marksOf(1, 20, () => 10), exits: [exit(20, 10, 1)] }), trade('BBB', { stop: 9.9, marks: marksOf(1, 20, () => 10), exits: [exit(20, 10, 1)] }), trade('CCC', { stop: 9.9, marks: marksOf(1, 20, () => 10), exits: [exit(20, 10, 1)] }), trade('DDD', { stop: 9.9, marks: marksOf(1, 20, () => 10), exits: [exit(20, 10, 1)] }), trade('EEE', { stop: 9.9, marks: marksOf(1, 20, () => 10), exits: [exit(20, 10, 1)] })] },
]);

export function buildCase(c) { return { calendar: [...CALENDAR], trades: c.build(), cfg: c.cfg || CFG }; }
