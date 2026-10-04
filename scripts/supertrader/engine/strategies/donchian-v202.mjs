// Donchian/Turtle 2.0.2 (Runde 13, PREREGISTRATION-R13-AUDIT amendmentBeforeResults): Ruecknahme der
// Marktampel aus 2.0.1. Mit korrekt gebuchten Uebernahmen (S1C) verfehlt die Ampel die R12-Bedingung (b):
// 2016-2020 schlechter als ohne Ampel. Signale, Units, Stops, Ausstiege und Portfolio wie 2.0.0.
import don2, { PORTFOLIO as P2 } from './donchian-v2.mjs';

export const PORTFOLIO = P2;
export default { ...don2, variant: 'DONCHIAN_TURTLE_S1_R13', version: '2.0.2', manageCompatible: [...new Set([...(don2.manageCompatible || []), '2.0.0', '2.0.1', '2.0.2'])], signalCompatible: ['2.0.0', '2.0.1'], portfolio: PORTFOLIO };
