/**
 * V4.1 reference implementation of the Turtle unit / pyramid / stop rules exactly as #709 records them
 * (W-TUR, printed pp. 14-23; rule ids TUR-UNIT, TUR-ADD, TUR-STOP, TUR-STOPADD, TUR-STOPGAP).
 *
 * Why this exists: the #709 worked example TUR-CRUDE shows that after a gapped add the units carry DIFFERENT stops
 * (earlier units are raised by 1/2 N per add; the new unit sits 2N below its own fill). The frozen V4 engine
 * (turtle-source-v4.mjs, T4-STOP) moves every unit to 2N below the newest fill. Both agree when adds fill exactly at
 * their 1/2 N levels; they differ after a gap. That deviation is finding V41-F1. The frozen engine is NOT changed here
 * (it is part of the V4 freeze and a strategy change needs its own before/after PR); this module is the source-traced
 * specification and golden reference that the next engine version must reproduce.
 */

export const TURTLE_UNIT_STOP_RULES_V41 = [
  { ruleId: 'T41-UNIT', psr709: ['TUR-UNIT', 'TUR-DOLLAR'], kind: 'SOURCE', rule: 'unit = floor(0.01 x notional / (N x dollars per point))', code: 'unitContracts' },
  { ruleId: 'T41-UNIT-EQUITY', psr709: ['TUR-UNIT'], kind: 'TRANSLATION', rule: 'equities: dollars per point = 1 per share; the V4 engine keeps fractional shares (floor not applied)', code: 'turtle-source-v4.mjs#unitShares' },
  { ruleId: 'T41-ADD', psr709: ['TUR-ADD', 'TUR-ADDFAST'], kind: 'SOURCE', rule: 'next unit 1/2 N above the previous ACTUAL fill, at most 4 units; several adds on one day are possible', code: 'nextAddLevel' },
  { ruleId: 'T41-STOP', psr709: ['TUR-STOP'], kind: 'SOURCE', rule: 'each unit starts with a stop 2N below its own fill', code: 'unitStops' },
  { ruleId: 'T41-STOPADD', psr709: ['TUR-STOPADD', 'TUR-STOPGAP'], kind: 'SOURCE', rule: 'every add raises the stops of all earlier units by 1/2 N; after a gapped add the units therefore carry different stops', code: 'unitStops' },
  { ruleId: 'T41-WHIPSAW', psr709: ['TUR-WHIP', 'TUR-WHIPRE', 'TUR-WHIPST'], kind: 'NOT_IMPLEMENTED', rule: 'optional Whipsaw stop variant (1/2 N unit stop, re-entry) is a separate OPTIONAL variant, not the default', code: null },
];

/** TUR-UNIT: whole contracts (futures). */
export function unitContracts(notional, N, dollarsPerPoint, riskFraction = 0.01) {
  const dollarVolatility = N * dollarsPerPoint;
  return dollarVolatility > 0 ? Math.floor((riskFraction * notional) / dollarVolatility + 1e-9) : 0;
}

/** TUR-ADD: the next add level from the last actual fill. */
export const nextAddLevel = (lastFill, N, step = 0.5) => lastFill + step * N;

/**
 * TUR-STOP / TUR-STOPADD: stops per unit after the given sequence of actual fills (long side).
 * Unit k starts at fill_k - 2N; each later add raises it by 1/2 N.
 */
export function unitStops(fills, N, { stopN = 2, raiseN = 0.5 } = {}) {
  const stops = [];
  for (const fill of fills) {
    for (let k = 0; k < stops.length; k++) stops[k] += raiseN * N;
    stops.push(fill - stopN * N);
  }
  return stops;
}

/** The frozen V4 engine reading (T4-STOP): all units at 2N below the newest fill. Kept only to state V41-F1 exactly. */
export const frozenV4UniformStop = (fills, N, stopN = 2) => fills.map(() => fills.at(-1) - stopN * N);
