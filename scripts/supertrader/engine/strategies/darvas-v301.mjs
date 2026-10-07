// Darvas Box 3.0.1 (Runde 10, PREREGISTRATION-R10-FIXES K1 + K3). Signale, Stops und Ausstiege
// wie 3.0.0. Nur das Modellportfolio aendert sich:
//  DAR-PORT-01  sechs Titel gleichzeitig (TIME 1959) - das Hoechstgewicht je Titel ist jetzt 1/6,
//               damit die sechs belegten Positionen Platz haben (3.0.0: 20 % -> nur fuenf volle
//               Positionen, Rest als Kleinstposition oder ohne Kapital).
//  PORT-RANK-RS Gleichzeitige Einstiege nach relativer Staerke am Vortag statt alphabetisch.
// Geprueft an der versiegelten Pruefmenge und im Vollportfolio (Lauf r10c); kein Vorteil belegt.
import v3, { PORTFOLIO as P3 } from './darvas-v3.mjs';

export const PORTFOLIO = Object.freeze({ ...P3, maxPositionPct: 1 / 6, priority: 'RS',
  source: 'Darvas (TIME 1959): höchstens fünf bis sechs Aktien gleichzeitig; Höchstgewicht 1/6 damit sechs Titel Platz haben. Risiko je Trade ist VU-Standard; Rang nach relativer Stärke (VU, geprüft in R10).' });

export default { ...v3, variant: 'DARVAS_BOX_BUYSTOP_R10', version: '3.0.1', manageCompatible: ['2.0.0', '3.0.0', '3.0.1'], signalCompatible: ['3.0.0'], portfolio: PORTFOLIO };
