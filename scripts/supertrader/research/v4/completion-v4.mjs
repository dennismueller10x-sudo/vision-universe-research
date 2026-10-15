/**
 * V4 certification levels (registered before measurement; never PASS == CERTIFIED).
 *
 *  CERTIFIED              EW control AND at least two economically distinct factor families (momentum, variance)
 *                         pass their external oracle; internal two-path reconciliation and the independent review
 *                         pass; no open BLOCKER/MAJOR V4 finding; the price-sanity sensitivity does not flip a verdict.
 *  (V4.1) an EW verdict flip under any pre-registered sensitivity caps the level at INTERNALLY_RECONCILED.
 *  PARTIALLY_CERTIFIED    EW control passes externally, internal/review pass, but at least one factor oracle fails
 *                         or is insufficient, or a MAJOR finding stays open, or a sensitivity flips a factor verdict.
 *  INTERNALLY_RECONCILED  internal two-path reconciliation and review pass, but the EW control cannot be assessed
 *                         externally (insufficient reference data). Reconciliation is not calibration (A1).
 *  NOT_CERTIFIED          the review or the internal reconciliation fails (PROVEN_MEASUREMENT_DEFECT), the EW control
 *                         fails its external oracle (MEASUREMENT_LAYER_EW_CONTROL_FAILED), or a BLOCKER stays open.
 *
 * A2: a factor whose VU direction conflicts with its oracle direction can never pass (DIRECTION is a hard check).
 * A10: every expected oracle comparison must be present exactly once with evaluated hard checks; reasons are split.
 */
export const CERTIFICATION_LEVELS_V4 = ['CERTIFIED', 'PARTIALLY_CERTIFIED', 'INTERNALLY_RECONCILED', 'NOT_CERTIFIED'];
export const EXPECTED_ORACLES_V4 = ['EW_MARKET', 'MOM_12_2_EW_DECILES', 'VAR_60D_EW_QUINTILES'];

export function certifyV4({ internal, review, oracles, sensitivities = [], openFindings = [] }) {
  const reasons = [];
  const keys = Object.keys(oracles ?? {});
  if (keys.length !== EXPECTED_ORACLES_V4.length || EXPECTED_ORACLES_V4.some((k) => !keys.includes(k))) throw new Error('ORACLE_SET_INCOMPLETE_OR_DUPLICATED');
  for (const k of EXPECTED_ORACLES_V4) if (!['PASS', 'FAIL', 'INSUFFICIENT_REFERENCE_DATA'].includes(oracles[k]?.verdict)) throw new Error('ORACLE_VERDICT_INVALID:' + k);
  const blockers = openFindings.filter((f) => f.severity === 'BLOCKER' && f.status !== 'CLOSED');
  const majors = openFindings.filter((f) => f.severity === 'MAJOR' && f.status !== 'CLOSED');
  if (review?.status !== 'PASS') reasons.push('PROVEN_MEASUREMENT_DEFECT_REVIEW_FAILED');
  if (internal?.verdict !== 'PASS') reasons.push('PROVEN_MEASUREMENT_DEFECT_INTERNAL_RECONCILIATION_FAILED');
  if (blockers.length) reasons.push('OPEN_BLOCKER_FINDINGS');
  if (oracles.EW_MARKET.verdict === 'FAIL') reasons.push('MEASUREMENT_LAYER_EW_CONTROL_FAILED');
  const factorPass = ['MOM_12_2_EW_DECILES', 'VAR_60D_EW_QUINTILES'].filter((k) => oracles[k].verdict === 'PASS');
  const flips = sensitivities.filter((s) => EXPECTED_ORACLES_V4.some((k) => s.verdicts?.[k] && s.verdicts[k] !== oracles[k].verdict));
  let level;
  if (reasons.length) level = 'NOT_CERTIFIED';
  else if (oracles.EW_MARKET.verdict === 'INSUFFICIENT_REFERENCE_DATA') { level = 'INTERNALLY_RECONCILED'; reasons.push('EW_CONTROL_NOT_EXTERNALLY_ASSESSABLE'); }
  else {
    level = factorPass.length === 2 ? 'CERTIFIED' : 'PARTIALLY_CERTIFIED';
    for (const k of ['MOM_12_2_EW_DECILES', 'VAR_60D_EW_QUINTILES']) if (oracles[k].verdict !== 'PASS') reasons.push(`${k}_${oracles[k].verdict}`);
    if (majors.length && level === 'CERTIFIED') { level = 'PARTIALLY_CERTIFIED'; reasons.push('OPEN_MAJOR_FINDINGS'); }
    if (flips.length && level === 'CERTIFIED') { level = 'PARTIALLY_CERTIFIED'; reasons.push('SENSITIVITY_FLIPS_A_VERDICT'); }
    // V4.1 (review R8): if any pre-registered sensitivity flips the EW control, the external validation of the
    // measurement base is not robust: cap at INTERNALLY_RECONCILED (closes the performance gate)
    const ewFlips = flips.filter((s) => s.verdicts.EW_MARKET && s.verdicts.EW_MARKET !== oracles.EW_MARKET.verdict);
    if (ewFlips.length) { level = 'INTERNALLY_RECONCILED'; reasons.push('EW_VERDICT_SENSITIVE:' + ewFlips.map((s) => s.id).join(',')); }
  }
  return {
    schema: 'supertrader-v4-certification-1.0.0', level, reasons,
    externallyValidatedSlices: level === 'NOT_CERTIFIED' || level === 'INTERNALLY_RECONCILED' ? [] : [...(oracles.EW_MARKET.verdict === 'PASS' ? ['EW_MARKET'] : []), ...factorPass],
    internalOnlySlices: ['EXECUTION_NEXT_OPEN_BOOK', 'COSTS', 'STOP_TRIGGER_FILLS', 'JT_6_6_OVERLAPPING_COHORTS', 'GH_52_WEEK_HIGH'],
    passIsNotCertified: true,
    openFindings: { blockers: blockers.map((f) => f.id), majors: majors.map((f) => f.id) },
    sensitivityFlips: flips.map((s) => s.id),
  };
}
