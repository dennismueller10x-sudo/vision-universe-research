'use strict';
// VU-Portfolio-Standard, Point-in-Time-Faktorrekonstruktion (portfolio-pit-factors-1.0.0). Forschung, nicht zertifiziert.
//
// Rekonstruiert zu einem historischen Stichtag t die sechs Faktorfamilien der Strategieprofile aus Quellen, die zu t
// bekannt waren:
// - Kurse bis einschließlich t (Wochenschluss); Momentum und Risiko sind Verhältnisse und damit unabhängig von der
//   nachträglichen Split-Bereinigung. Marktkapitalisierung = SEC-Aktienzahl × Rohschluss (Rohschluss aus der
//   split-bereinigten Reihe über return-series.js#splitFactors, ADR-002, oder direkt aus Tagesbalken).
// - SEC-Fundamentaldaten nur, wenn das Einreichungsdatum VOR dem Stichtag liegt (pit-fundamental-history.js, filed < t),
//   und nur, wenn das jüngste sichtbare Geschäftsjahr höchstens MAX_FUNDAMENTAL_AGE_DAYS vor t endet.
// Die Faktoren sind eine dokumentierte Rekonstruktion, NICHT die Live-Faktorevidenz (vu-factor-evidence-2.0.0), deren
// Eingaben historisch nicht vorliegen. Querschnittsränge je Stichtag über das dann handelbare Universum.
const PIT = require('./pit-fundamental-history.js');
const VERSION = 'portfolio-pit-factors-1.0.0';
const MAX_FUNDAMENTAL_AGE_DAYS = 548;
const MOMENTUM = Object.freeze({ lookbackWeeks: 52, skipWeeks: 4 });
const RISK = Object.freeze({ windowWeeks: 52, minReturns: 40 });

// Familien -> Bestandteile (höhere Werte besser). Mindestzahl verfügbarer Bestandteile je Familie.
const FAMILIES = Object.freeze({
  momentum: { parts: ['momentum12_1'], min: 1 },
  risk: { parts: ['negVol52'], min: 1 },
  quality: { parts: ['grossMargin', 'equityToAssets', 'fcfMargin'], min: 2 },
  profitability: { parts: ['netMargin', 'fcfMargin'], min: 1 },
  growth: { parts: ['revenueCagr3y', 'revenueGrowthYoy'], min: 1 },
  value: { parts: ['earningsYield', 'fcfYield', 'bookToPrice'], min: 1 },
});
// Strategieprofile aus quant/data/product/strategy-index-v1.json.gz (Bedingungsfelder). earnings-revision-leader fehlt:
// historische Analystenrevisionen liegen nicht vor.
const PROFILES = Object.freeze({
  'quality-compounder': ['quality', 'profitability', 'risk', 'growth'],
  'momentum-leader': ['momentum', 'growth', 'risk'],
  'quality-momentum': ['quality', 'momentum', 'profitability'],
  garp: ['growth', 'value', 'quality'],
  'future-leader': ['growth', 'momentum', 'profitability'],
  'defensive-quality': ['risk', 'quality', 'profitability', 'momentum'],
  'value-momentum': ['value', 'momentum', 'quality'],
});
const UNAVAILABLE_PROFILES = Object.freeze({ 'earnings-revision-leader': 'NO_HISTORICAL_ANALYST_REVISIONS' });

const isNum = x => typeof x === 'number' && Number.isFinite(x);
const dayBefore = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);

// Preisfaktoren aus der Stufenreihe adj (Array, NaN = keine Beobachtung) zum Index t.
function priceFactors(adj, t) {
  const out = { momentum12_1: null, negVol52: null };
  const a = adj[t - MOMENTUM.skipWeeks], b = adj[t - MOMENTUM.lookbackWeeks];
  if (t - MOMENTUM.lookbackWeeks >= 0 && a > 0 && b > 0) out.momentum12_1 = a / b - 1;
  const r = [];
  for (let k = Math.max(1, t - RISK.windowWeeks + 1); k <= t; k++) if (adj[k] > 0 && adj[k - 1] > 0) r.push(Math.log(adj[k] / adj[k - 1]));
  if (r.length >= RISK.minReturns) {
    const m = r.reduce((s, x) => s + x, 0) / r.length;
    out.negVol52 = -Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1) * 52);
  }
  return out;
}

// Fundamentalfaktoren zum Stichtag dateT; sichtbar ist nur, was vor dateT eingereicht wurde.
function fundamentalFactors(bundle, dateT, rawClose) {
  const out = { grossMargin: null, equityToAssets: null, fcfMargin: null, netMargin: null, revenueCagr3y: null, revenueGrowthYoy: null, earningsYield: null, fcfYield: null, bookToPrice: null, marketCap: null, fundamentalsAsOfEnd: null };
  if (!bundle) return out;
  const asOf = dayBefore(dateT);
  const rev = PIT.visibleAnnual(bundle, 'revenue', asOf);
  const newestEnd = rev.length ? rev[0][2] : null;
  const fresh = newestEnd && (Date.parse(dateT) - Date.parse(newestEnd)) / 86400000 <= MAX_FUNDAMENTAL_AGE_DAYS;
  const shares = PIT.latest(bundle, 'shares_outstanding', asOf);
  const sharesRows = PIT.visibleAnnual(bundle, 'shares_outstanding', asOf);
  const sharesFresh = sharesRows.length && (Date.parse(dateT) - Date.parse(sharesRows[0][2])) / 86400000 <= MAX_FUNDAMENTAL_AGE_DAYS;
  if (sharesFresh && shares > 0 && rawClose > 0) out.marketCap = shares * rawClose;
  if (!fresh) return out;
  out.fundamentalsAsOfEnd = newestEnd;
  const f = PIT.featuresAt(bundle, asOf);
  if (!f) return out;
  for (const k of ['grossMargin', 'equityToAssets', 'fcfMargin', 'netMargin', 'revenueCagr3y', 'revenueGrowthYoy']) out[k] = isNum(f[k]) ? f[k] : null;
  if (out.marketCap > 0) {
    const ni = PIT.latest(bundle, 'net_income', asOf), fcf = PIT.latest(bundle, 'free_cash_flow', asOf), eq = PIT.latest(bundle, 'stockholders_equity', asOf);
    out.earningsYield = isNum(ni) ? ni / out.marketCap : null;
    out.fcfYield = isNum(fcf) ? fcf / out.marketCap : null;
    out.bookToPrice = isNum(eq) ? eq / out.marketCap : null;
  }
  return out;
}

// Querschnitts-Perzentil (Durchschnittsrang bei Gleichstand) in (0, 1].
function percentiles(values) {
  const idx = values.map((v, i) => [v, i]).filter(([v]) => isNum(v)).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length).fill(null), n = idx.length;
  for (let i = 0; i < n;) {
    let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const p = ((i + j) / 2 + 1) / n;
    for (let k = i; k <= j; k++) out[idx[k][1]] = p;
    i = j + 1;
  }
  return out;
}

// rows: [{id, ...Rohfaktoren}] eines Stichtags -> je Zeile Familienwerte (Mittel der Bestandteil-Perzentile).
function familyScores(rows) {
  const parts = [...new Set(Object.values(FAMILIES).flatMap(f => f.parts))];
  const pct = Object.fromEntries(parts.map(p => [p, percentiles(rows.map(r => r[p]))]));
  return rows.map((r, i) => {
    const fam = {};
    for (const [name, f] of Object.entries(FAMILIES)) {
      const v = f.parts.map(p => pct[p][i]).filter(isNum);
      fam[name] = v.length >= f.min ? v.reduce((s, x) => s + x, 0) / v.length : null;
    }
    return fam;
  });
}
// Profilscore = Mittel der Familien-Perzentile (erneut als Perzentil über die Zeilen mit allen Familien).
function profileScores(profileId, families, override) {
  const need = override || PROFILES[profileId];
  if (!need) throw Error('PROFILE_UNKNOWN: ' + profileId);
  const famPct = Object.fromEntries(need.map(n => [n, percentiles(families.map(f => f[n]))]));
  return families.map((_, i) => {
    const v = need.map(n => famPct[n][i]);
    return v.every(isNum) ? v.reduce((s, x) => s + x, 0) / v.length : null;
  });
}

module.exports = { VERSION, MAX_FUNDAMENTAL_AGE_DAYS, MOMENTUM, RISK, FAMILIES, PROFILES, UNAVAILABLE_PROFILES, priceFactors, fundamentalFactors, percentiles, familyScores, profileScores };
