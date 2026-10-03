// Supertrader — Gewinnpruefung zum damaligen Stand (Runde 11, Minervini 3.0.0, MIN-EPS-01).
// fund = { eps: [[periodEnd, value, firstFiled, derived?], ...], rev: [...] } (SEC-XBRL, erste Einreichung).
// Sichtbar ist ein Wert erst NACH seinem Einreichungstag (filed < asOf).
const YEAR = 365.25 * 864e5;
const near = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) <= 25 * 864e5;
function yoy(rows, asOf, back = 0) {
  const vis = rows.filter((r) => r[2] < asOf).sort((a, b) => a[0].localeCompare(b[0]));
  const cur = vis[vis.length - 1 - back];
  if (!cur) return { growth: null, reason: 'NO_QUARTER' };
  const target = new Date(Date.parse(cur[0]) - YEAR).toISOString().slice(0, 10);
  const prev = vis.find((r) => near(r[0], target));
  if (!prev) return { growth: null, reason: 'NO_YEAR_AGO', end: cur[0] };
  if (!(prev[1] > 0)) return { growth: null, reason: 'BASE_NOT_POSITIVE', end: cur[0], value: cur[1], prior: prev[1] };
  return { growth: cur[1] / prev[1] - 1, end: cur[0], value: cur[1], prior: prev[1], filed: cur[2] };
}

export const EPS_RULE = Object.freeze({ minGrowth: 0.25 });

export function earningsAt(fund, asOf, p = EPS_RULE) {
  if (!fund || !Array.isArray(fund.eps) || !fund.eps.length) return { ok: null, reason: 'MIN-EPS-NA' };
  const e0 = yoy(fund.eps, asOf, 0), e1 = yoy(fund.eps, asOf, 1), r0 = yoy(fund.rev || [], asOf, 0);
  const facts = { epsGrowth: e0.growth, epsGrowthPrev: e1.growth, revGrowth: r0.growth, quarterEnd: e0.end ?? null, filed: e0.filed ?? null };
  if (e0.growth === null) return { ok: e0.reason === 'BASE_NOT_POSITIVE' ? false : null, reason: e0.reason === 'BASE_NOT_POSITIVE' ? 'MIN-EPS-01' : 'MIN-EPS-NA', facts };
  if (!(e0.growth >= p.minGrowth)) return { ok: false, reason: 'MIN-EPS-01', facts };
  if (e1.growth !== null && !(e0.growth > e1.growth)) return { ok: false, reason: 'MIN-EPS-ACC', facts };
  if (e1.growth === null && e1.reason !== 'BASE_NOT_POSITIVE') return { ok: null, reason: 'MIN-EPS-NA', facts };
  if (r0.growth === null) return { ok: null, reason: 'MIN-EPS-NA', facts };
  if (!(r0.growth > 0)) return { ok: false, reason: 'MIN-REV-01', facts };
  return { ok: true, reason: null, facts };
}
