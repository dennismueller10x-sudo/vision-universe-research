// Donchian/Turtle 2.1.0 (Runde 11, PREREGISTRATION-R11). Quelle (Original Turtle Trading Rules,
// Kap. Tactics, „Buy Strength – Sell Weakness“): „If the signals came all at once, we always bought the
// strongest markets … Others would subtract the price 3 months ago from the current price and then divide
// by the current N.“ Bis 2.0.0 vergab das Modellportfolio gleichzeitige Einstiege alphabetisch.
//  PORT-RANK-TURTLE  Rang = (Schluss − Schluss vor 63 Sitzungen) / N, Stand Vortag; Gleichstand alphabetisch.
// Signale, Groesse (Units) und Ausstiege unveraendert.
import don2, { PORTFOLIO as P2, turtleN } from './donchian-v2.mjs';

const NCACHE = new WeakMap();
export function rankScore(ctx, entryIndex) {
  const b = ctx.bars, i = entryIndex - 1;
  if (i < 63) return null;
  let N = NCACHE.get(b); if (!N) { N = turtleN(b); NCACHE.set(b, N); }
  const n = N[i], c = b.close[i], c0 = b.close[i - 63];
  return Number.isFinite(n) && n > 0 && Number.isFinite(c) && Number.isFinite(c0) ? (c - c0) / n : null;
}

export const PORTFOLIO = Object.freeze({ ...P2, priority: 'SCORE',
  source: (P2.source ? P2.source + ' ' : '') + 'Gleichzeitige Einstiege: die stärksten zuerst – (Schluss − Schluss vor drei Monaten) / N (Original Turtle Rules, „Buy Strength – Sell Weakness“).' });

export default { ...don2, variant: 'DONCHIAN_TURTLE_S1_RANKED_R11', version: '2.1.0', manageCompatible: [...new Set([...(don2.manageCompatible || []), '2.0.0', '2.1.0'])], signalCompatible: ['2.0.0'], rankScore, portfolio: PORTFOLIO };
