// Donchian/Turtle 2.0.1 (Runde 12, PREREGISTRATION-R12 PORT-MARKET-200). Signale, Units, Stops und
// Ausstiege wie 2.0.0. Nur das Modellportfolio aendert sich:
//  PORT-MARKET-200  Keine neue Modellposition, wenn SPY am Vortag unter seinem 200-Tage-Durchschnitt
//                   schloss. Fuer die Turtles ist keine Marktregel belegt - VU-Annahme, im Vollportfolio
//                   vorab festgelegt geprueft (Ueberrendite insgesamt und in beiden Teilzeitraeumen hoeher).
import don2, { PORTFOLIO as P2 } from './donchian-v2.mjs';

export const PORTFOLIO = Object.freeze({ ...P2, marketFilter: true,
  source: (P2.source ? P2.source + ' ' : '') + 'Marktampel: keine neue Position bei SPY unter dem 200-Tage-Durchschnitt (VU-Annahme, geprüft in R12).' });

export default { ...don2, variant: 'DONCHIAN_TURTLE_S1_R12', version: '2.0.1', manageCompatible: [...new Set([...(don2.manageCompatible || []), '2.0.0', '2.0.1'])], signalCompatible: ['2.0.0'], portfolio: PORTFOLIO };
