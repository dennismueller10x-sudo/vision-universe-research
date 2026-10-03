// Darvas Box 3.0.2 (Runde 12, PREREGISTRATION-R12 PORT-MARKET-200). Signale, Stops und Ausstiege wie
// 3.0.0/3.0.1. Nur das Modellportfolio aendert sich:
//  PORT-MARKET-200  Keine neue Modellposition, wenn SPY am Vortag unter seinem 200-Tage-Durchschnitt
//                   schloss (Marktampel; dokumentiert in einer TraderFox-Variante, verwandt mit O'Neils "M").
//                   Signale werden weiter protokolliert; offene Positionen laufen nach Regel weiter.
// Vorab festgelegte Pruefung im Vollportfolio bestanden (Ueberrendite insgesamt und in beiden Teilzeitraeumen
// hoeher als ohne Marktampel); ein Vorteil gegenueber dem Markt ist damit nicht belegt.
import v301, { PORTFOLIO as P301 } from './darvas-v301.mjs';

export const PORTFOLIO = Object.freeze({ ...P301, marketFilter: true,
  source: P301.source + ' Marktampel: keine neue Position bei SPY unter dem 200-Tage-Durchschnitt (VU, geprüft in R12).' });

export default { ...v301, variant: 'DARVAS_BOX_BUYSTOP_R12', version: '3.0.2', manageCompatible: ['2.0.0', '3.0.0', '3.0.1', '3.0.2'], signalCompatible: ['3.0.0', '3.0.1'], portfolio: PORTFOLIO };
