'use strict';
// VU-Portfolio-Standard, Konstruktion (portfolio-construction-1.0.0). Forschung, nicht zertifiziert.
// Owner-Freigabe 04.11.2026 (docs/PLAN_NEUSTART_2026-11.md §2): 15–30 Titel, max. 8 % je Titel, max. 25 % je Branche,
// Liquiditätsgrenze, Gebühren/Spread/Slippage, Gesamtrendite gegen Gesamtrendite-Benchmark, Walk-forward,
// Volatilität/Max-Drawdown/Beta ausgewiesen.
//
// Diese Datei entscheidet nur Gewichte zu EINEM Stichtag aus übergebenen Kandidaten. Sie liest keine Daten und kennt
// keine Zeit; Point-in-Time ist Aufgabe des Aufrufers (scripts/quant/portfolio/model-portfolios.cjs).
const Risk = require('./portfolio-risk.cjs');
const VERSION = 'portfolio-construction-1.0.0';

const STANDARD = Object.freeze({
  id: 'VU_PORTFOLIO_STANDARD_1',
  minPositions: 15, maxPositions: 30, targetPositions: 25,
  maxPositionWeight: 0.08, maxSectorWeight: 0.25,
  // Liquidität: Ausschluss unter der Mindestgrenze, und je Titel höchstens maxParticipation des durchschnittlichen
  // Tagesumsatzes (ADV) für das unterstellte Portfoliovermögen; ohne Volumen ersatzweise Marktkapitalisierung.
  minDollarVolumeUsd: 2e6, maxParticipationOfAdv: 0.05, assumedPortfolioUsd: 10e6,
  minMarketCapUsd: 300e6, minPrice: 5,
  // Kosten je Seite: Gebühr + Slippage pauschal, Spread je Titel aus dem Liquiditätsmodell unten.
  feeBps: 1, slippageBps: 5,
  weightings: ['EQUAL', 'INVERSE_VOL', 'RISK_PARITY'],
});

// Halber Geld-Brief-Spread in Basispunkten je Seite. Modellannahme aus Liquiditätsklassen, keine beobachteten Quotes.
// Klassen nach Tagesumsatz (ADV, USD); ohne Volumen nach Marktkapitalisierung (USD). Unter 5 USD Kurs: Zuschlag.
const SPREAD_BY_ADV = Object.freeze([[100e6, 2], [25e6, 5], [10e6, 10], [2e6, 25], [0, 50]]);
const SPREAD_BY_MCAP = Object.freeze([[10e9, 2], [2e9, 5], [500e6, 12], [300e6, 25], [0, 50]]);
const LOW_PRICE_SURCHARGE_BPS = 25;
function halfSpreadBps({ dollarVolume, marketCap, price }) {
  const table = Number.isFinite(dollarVolume) ? SPREAD_BY_ADV : Number.isFinite(marketCap) ? SPREAD_BY_MCAP : null;
  const x = Number.isFinite(dollarVolume) ? dollarVolume : marketCap;
  let bps = table ? table.find(([lo]) => x >= lo)[1] : SPREAD_BY_ADV.at(-1)[1];
  if (Number.isFinite(price) && price < 5) bps += LOW_PRICE_SURCHARGE_BPS;
  return { bps, basis: Number.isFinite(dollarVolume) ? 'ADV_BUCKET' : Number.isFinite(marketCap) ? 'MARKET_CAP_BUCKET' : 'NO_LIQUIDITY_DATA_WORST_BUCKET' };
}

function fail(code, detail) { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; throw e; }

function standardOf(over = {}) {
  const s = { ...STANDARD, ...over };
  if (!(s.minPositions >= 1 && s.maxPositions >= s.minPositions && s.targetPositions >= s.minPositions && s.targetPositions <= s.maxPositions)) fail('STANDARD_POSITIONS_INVALID');
  if (!(s.maxPositionWeight > 0 && s.maxPositionWeight <= 1 && s.maxSectorWeight > 0 && s.maxSectorWeight <= 1)) fail('STANDARD_CAPS_INVALID');
  if (s.targetPositions * s.maxPositionWeight < 1) fail('STANDARD_INFEASIBLE_POSITION_CAP');
  return s;
}

// Liquiditäts-Eligibility und Positionsobergrenze je Titel (Anteil am Portfolio).
function liquidity(c, s) {
  if (Number.isFinite(c.price) && c.price < s.minPrice) return { eligible: false, reason: 'PRICE_BELOW_MIN' };
  if (Number.isFinite(c.dollarVolume)) {
    if (c.dollarVolume < s.minDollarVolumeUsd) return { eligible: false, reason: 'ADV_BELOW_MIN' };
    return { eligible: true, cap: Math.min(s.maxPositionWeight, s.maxParticipationOfAdv * c.dollarVolume / s.assumedPortfolioUsd), basis: 'ADV' };
  }
  if (Number.isFinite(c.marketCap)) {
    if (c.marketCap < s.minMarketCapUsd) return { eligible: false, reason: 'MARKET_CAP_BELOW_MIN' };
    return { eligible: true, cap: s.maxPositionWeight, basis: 'MARKET_CAP_PROXY' };
  }
  return { eligible: false, reason: 'NO_LIQUIDITY_DATA' };
}

// Auswahl: absteigend nach Score (Gleichstand: id), höchstens floor(maxSectorWeight * N) Titel je Branche, damit die
// Branchengrenze bei gleichen Gewichten einhaltbar ist. Weniger als minPositions geeignete Titel -> leeres Ergebnis.
function select(candidates, s) {
  const ranked = candidates.filter(c => Number.isFinite(c.score)).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const perSector = Math.max(1, Math.floor(s.maxSectorWeight * s.targetPositions + 1e-9));
  const count = new Map(), out = [], skipped = { SECTOR_COUNT_LIMIT: 0 };
  for (const c of ranked) {
    if (out.length >= s.targetPositions) break;
    const k = c.sector || 'UNKNOWN';
    if ((count.get(k) || 0) >= perSector) { skipped.SECTOR_COUNT_LIMIT++; continue; }
    count.set(k, (count.get(k) || 0) + 1); out.push(c);
  }
  return { selected: out, perSectorLimit: perSector, skipped };
}

// Rohgewichte vor Grenzen.
function rawWeights(kind, sel, cov) {
  const n = sel.length;
  if (kind === 'EQUAL') return new Array(n).fill(1 / n);
  const vols = cov.map((r, i) => Math.sqrt(r[i]));
  if (kind === 'INVERSE_VOL') { const iv = vols.map(v => 1 / v), s = iv.reduce((a, b) => a + b, 0); return iv.map(x => x / s); }
  if (kind === 'RISK_PARITY') return equalRiskContribution(cov);
  fail('WEIGHTING_UNKNOWN', kind);
}
// Gleiche Risikobeiträge (long only) per Fixpunkt-Iteration w_i <- w_i * sqrt(b / RC_i), normiert; Start inverse Vol.
function equalRiskContribution(cov, { iterations = 2000, tolerance = 1e-12 } = {}) {
  const n = cov.length, target = 1 / n;
  let w = cov.map((r, i) => 1 / Math.sqrt(r[i]));
  let s = w.reduce((a, b) => a + b, 0); w = w.map(x => x / s);
  for (let k = 0; k < iterations; k++) {
    const rc = Risk.riskContributions(w, cov);
    const next = w.map((wi, i) => wi * Math.sqrt(target / Math.max(rc[i], 1e-300)));
    s = next.reduce((a, b) => a + b, 0);
    const nw = next.map(x => x / s);
    const diff = Math.max(...nw.map((x, i) => Math.abs(x - w[i])));
    w = nw;
    if (diff < tolerance) break;
  }
  return w;
}

// Projektion auf die Grenzen: Titelgrenze cap_i und Branchengrenze; überschüssiges Gewicht geht anteilig (nach Rohgewicht)
// an freie Titel; nicht unterzubringendes Gewicht bleibt Cash (CASH_RESIDUAL). Deterministisch, endliche Schleife.
function project(raw, caps, sectors, maxSector) {
  const n = raw.length, w = new Array(n).fill(0), fixed = new Array(n).fill(false);
  const sectorCap = new Map(); // Branche -> verbleibende Kapazität, sobald gebunden
  for (let iter = 0; iter < 10 * n + 10; iter++) {
    const fixedMass = w.reduce((a, x, i) => a + (fixed[i] ? x : 0), 0);
    const free = [...Array(n).keys()].filter(i => !fixed[i]);
    const base = free.reduce((a, i) => a + raw[i], 0);
    const mass = Math.max(0, 1 - fixedMass);
    for (const i of free) w[i] = base > 0 ? mass * raw[i] / base : 0;
    let changed = false;
    // Titelgrenzen zuerst.
    for (const i of free) if (w[i] > caps[i] + 1e-15) { w[i] = caps[i]; fixed[i] = true; changed = true; }
    if (changed) continue;
    // Branchen: Summe über alle Titel der Branche.
    const sums = new Map();
    for (let i = 0; i < n; i++) sums.set(sectors[i], (sums.get(sectors[i]) || 0) + w[i]);
    for (const [k, sum] of [...sums].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
      if (sum <= maxSector + 1e-12) continue;
      const idx = [...Array(n).keys()].filter(i => sectors[i] === k);
      // Die ganze Branche wird anteilig auf die Grenze skaliert (auch bereits an der Titelgrenze fixierte Titel; Skalieren
      // nach unten verletzt keine Titelgrenze) und fixiert.
      for (const i of idx) { w[i] = maxSector * w[i] / sum; fixed[i] = true; }
      sectorCap.set(k, true); changed = true;
      break;
    }
    if (!changed) break;
  }
  const invested = w.reduce((a, b) => a + b, 0);
  return { weights: w, cashResidual: Math.max(0, 1 - invested), boundSectors: [...sectorCap.keys()].sort() };
}

// Prüfung des Standards auf einem Gewichtsvektor (für Tests und den Ergebnisbericht).
function checkStandard(weights, sectors, s, tol = 1e-9) {
  const v = [], n = weights.filter(x => x > tol).length;
  if (n && (n < s.minPositions || n > s.maxPositions)) v.push('POSITION_COUNT_OUTSIDE_15_30:' + n);
  weights.forEach((x, i) => { if (x > s.maxPositionWeight + tol) v.push('POSITION_CAP_EXCEEDED:' + i); });
  const sums = new Map(); weights.forEach((x, i) => sums.set(sectors[i], (sums.get(sectors[i]) || 0) + x));
  for (const [k, x] of sums) if (x > s.maxSectorWeight + tol) v.push('SECTOR_CAP_EXCEEDED:' + k);
  if (weights.reduce((a, b) => a + b, 0) > 1 + tol) v.push('LEVERAGE');
  return v;
}

// Ein Stichtag. candidates: [{id, score, sector, price, dollarVolume?, marketCap?}], returnsById: Map(id -> Periodenrenditen,
// gleiche Länge, gemeinsames Fenster bis zum Stichtag). Ergebnis: Gewichte je id, Diagnose, Ex-ante-Risiko.
function construct({ candidates, returnsById, weighting = 'RISK_PARITY', standard = {} }) {
  const s = standardOf(standard);
  if (!s.weightings.includes(weighting)) fail('WEIGHTING_UNKNOWN', weighting);
  const excluded = {}, eligible = [];
  for (const c of candidates) {
    const liq = liquidity(c, s);
    if (!liq.eligible) { excluded[liq.reason] = (excluded[liq.reason] || 0) + 1; continue; }
    if (!returnsById.has(c.id)) { excluded.RISK_HISTORY_MISSING = (excluded.RISK_HISTORY_MISSING || 0) + 1; continue; }
    eligible.push({ ...c, cap: liq.cap, liquidityBasis: liq.basis });
  }
  const sel = select(eligible, s);
  if (sel.selected.length < s.minPositions) return { state: 'TOO_FEW_ELIGIBLE', weights: {}, eligible: eligible.length, excluded, selected: sel.selected.length };
  const ids = sel.selected.map(c => c.id);
  const R = returnsById.get(ids[0]).map((_, t) => ids.map(id => returnsById.get(id)[t]));
  const risk = Risk.shrunkCovariance(R);
  const raw = rawWeights(weighting, sel.selected, risk.cov);
  const sectors = sel.selected.map(c => c.sector || 'UNKNOWN');
  const pr = project(raw, sel.selected.map(c => c.cap), sectors, s.maxSectorWeight);
  const violations = checkStandard(pr.weights, sectors, s);
  if (violations.length) fail('STANDARD_VIOLATED', violations.join(','));
  const weights = Object.fromEntries(ids.map((id, i) => [id, pr.weights[i]]).filter(([, w]) => w > 0));
  const sectorWeights = {};
  sectors.forEach((k, i) => { sectorWeights[k] = (sectorWeights[k] || 0) + pr.weights[i]; });
  return {
    state: 'CONSTRUCTED', weights, weighting, cashResidual: pr.cashResidual, boundSectors: pr.boundSectors,
    exAnte: { annualVol: Risk.annualPortfolioVol(pr.weights, risk.cov), shrinkage: risk.shrinkage, averageCorrelation: risk.averageCorrelation, periods: risk.T },
    sectorWeights, positions: ids.length, eligible: eligible.length, excluded, skipped: sel.skipped,
    halfSpreadBps: Object.fromEntries(sel.selected.map(c => [c.id, halfSpreadBps(c).bps])),
  };
}

module.exports = { VERSION, STANDARD, SPREAD_BY_ADV, SPREAD_BY_MCAP, LOW_PRICE_SURCHARGE_BPS, halfSpreadBps, standardOf, liquidity, select, rawWeights, equalRiskContribution, project, checkStandard, construct };
