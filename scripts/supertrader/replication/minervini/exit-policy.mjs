// MinerviniReplicationExitPolicy – strategieeigene Ausstiegslogik (MR-RSK-01/02, MR-EXIT-01..03, MR-EXE-03).
//
// Gemeinsame technische Primitive sind nur Kursvergleiche auf Tagesbalken. WARUM verkauft wird,
// steht ausschliesslich hier und kommt aus dem Minervini-Regelbuch:
//   - Anfangsstop am technischen Punkt, nie mehr als 10 % Verlust (MR-RSK-01/02)
//   - Verkauf in die Staerke: Haelfte bei 3R (MR-EXIT-02)
//   - Einstand ab 3R (MR-EXIT-01)
//   - danach Stop nachziehen, mindestens die Haelfte des hoechsten Schlussgewinns sichern (MR-EXIT-03)
// Nicht umgesetzt (Regelbuch): Zeitstop (Zahl nicht oeffentlich), 20-Tage-Linie, Klimaxsignale,
// Ausstieg unter der 50-Tage-Linie (Herkunft ungeklaert).
// Balkenreihenfolge (MR-EXE-03, VU-Messrahmen): Stop vor Gewinnziel; am Einstiegstag zaehlt ein Tief <= Stop.
// Preise sind Basispreise vor Kosten; Slippage und Gebuehren rechnet portfolio-sim.mjs.
import { requireP } from './trend-template.mjs';

export const POLICY_ID = 'MinerviniReplicationExitPolicy@1.0.0';
const WHOLE_SHARE_TOLERANCE = 1e-9; // nur Gleitkomma-Rundung beim Abrunden auf ganze Aktien

// shareUnit: bereinigte Stueckzahl je echter (Roh-)Aktie am Einstiegstag; Teilverkaeufe werden auf ganze echte Aktien abgerundet.
export function openPosition({ fillBase, technicalStop, shares, entryIndex, shareUnit }, P) {
  requireP(P);
  if (!(fillBase > 0) || !(technicalStop > 0) || !(shares > 0) || !(shareUnit > 0)) throw new Error('openPosition: ungueltige Eingabe');
  const cap = fillBase * (1 - P['risk.maxStopPct']);
  const capped = cap > technicalStop;
  const stop = capped ? cap : technicalStop;
  const R = fillBase - stop;
  if (!(R > 0)) throw new Error('openPosition: Stop nicht unter dem Einstieg');
  return {
    entry: fillBase, initialStop: stop, stop, stopRuleId: capped ? 'MR-RSK-02' : 'MR-RSK-01', R,
    shares0: shares, shares, entryIndex, shareUnit,
    target: fillBase + P['exit.partialR'] * R,
    breakevenLevel: fillBase + P['exit.breakevenR'] * R,
    trailLevel: fillBase + P['exit.trailActivationR'] * R,
    partialDone: false, breakevenArmed: false, trailArmed: false,
    maxClose: -Infinity, maxHigh: -Infinity, minLow: Infinity,
  };
}

// Ein Tagesbalken. Gibt die Verkaeufe dieses Balkens zurueck: [{price, shares, ruleId, basis}].
export function stepBar(pos, bar, P, { entryDay = false } = {}) {
  requireP(P);
  const fills = [];
  const { open, high, low } = bar;
  if (Number.isFinite(high)) pos.maxHigh = Math.max(pos.maxHigh, high);
  if (Number.isFinite(low)) pos.minLow = Math.min(pos.minLow, low);
  const sellAll = (price, ruleId, basis) => { fills.push({ price, shares: pos.shares, ruleId, basis }); pos.shares = 0; };
  const partial = (price, basis) => {
    const n = Math.floor((pos.shares0 / pos.shareUnit) * P['exit.partialFraction'] + WHOLE_SHARE_TOLERANCE) * pos.shareUnit;
    pos.partialDone = true;
    if (n > 0 && n < pos.shares) { fills.push({ price, shares: n, ruleId: 'MR-EXIT-02', basis }); pos.shares -= n; }
  };
  if (!entryDay && Number.isFinite(open)) {
    if (open <= pos.stop) { sellAll(open, pos.stopRuleId, 'GAP_OPEN'); return fills; }
    if (!pos.partialDone && open >= pos.target) partial(open, 'GAP_OPEN');
  }
  if (Number.isFinite(low) && low <= pos.stop) { sellAll(pos.stop, pos.stopRuleId, 'STOP'); return fills; }
  if (Number.isFinite(high)) {
    // Eroeffnung >= Ziel wurde oben als Gap behandelt; hier liegt das Ziel ueber der Eroeffnung.
    if (!pos.partialDone && high >= pos.target) partial(pos.target, 'LIMIT');
    if (high >= pos.breakevenLevel) pos.breakevenArmed = true;
    if (high >= pos.trailLevel) pos.trailArmed = true;
  }
  return fills;
}

// Tagesschluss: Stop fuer den naechsten Balken nachziehen (nur aufwaerts).
export function endOfDay(pos, close, P) {
  requireP(P);
  if (Number.isFinite(close)) pos.maxClose = Math.max(pos.maxClose, close);
  if (pos.breakevenArmed && pos.entry > pos.stop) { pos.stop = pos.entry; pos.stopRuleId = 'MR-EXIT-01'; }
  if (pos.trailArmed && Number.isFinite(pos.maxClose)) {
    const trail = pos.entry + P['exit.trailProtectFraction'] * (pos.maxClose - pos.entry);
    if (trail > pos.stop) { pos.stop = trail; pos.stopRuleId = 'MR-EXIT-03'; }
  }
  return pos;
}
