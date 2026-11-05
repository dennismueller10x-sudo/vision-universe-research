'use strict';
// Strang G: Signale je Stichtag (Point-in-Time) für die Aktienfamilien. Forschung, nicht zertifiziert.
// Nutzt die vorhandenen PIT-Faktoren (quant/engines/portfolio-pit-factors.cjs) unverändert und ergänzt nur
// Labor-Signale: Momentum 6-1, 52-Wochen-Hoch mit 40-Wochen-Trend, Insider-Käufe (Form 4), SUE (Gewinnüberraschung).
// Alles, was zum Stichtag t gelesen wird, ist bis t bekannt: Kurse bis Wochenschluss t, Einreichungen strikt vor t.
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const F = require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs'));
const { COMBOS } = require('./protocol.cjs');
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const DAY = 86400000;
const minusDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') - n * DAY).toISOString().slice(0, 10);

function extraPriceFactors(adj, t) {
  const out = { momentum6_1: null, hi52: null };
  const a = adj[t - 4], b = adj[t - 26];
  if (t - 26 >= 0 && a > 0 && b > 0) out.momentum6_1 = a / b - 1;
  if (t >= 51 && adj[t] > 0) {
    let hi = 0, sum = 0, n = 0;
    for (let k = t - 51; k <= t; k++) if (adj[k] > 0) { hi = Math.max(hi, adj[k]); if (k > t - 40) { sum += adj[k]; n++; } }
    if (n >= 36 && hi > 0 && adj[t] > sum / n) out.hi52 = adj[t] / hi;
  }
  return out;
}

// Insider: events = sortierte Liste [filedDate, ownerKey, valueUsd] je Titel. Fenster [t − 7L Tage, t).
function insiderAt(events, date, weeks) {
  if (!events || !events.length) return { count: 0, value: 0 };
  const lo = minusDays(date, 7 * weeks), owners = new Set();
  let value = 0;
  for (const [d, o, v] of events) { if (d >= date) break; if (d < lo) continue; owners.add(o); value += isNum(v) ? v : 0; }
  return { count: owners.size, value };
}
// SUE: events = sortierte Liste [filedDate, sue]; jüngste Meldung in [t − 91 Tage, t).
function sueAt(events, date) {
  if (!events || !events.length) return null;
  const lo = minusDays(date, 91);
  let out = null;
  for (const [d, s] of events) { if (d >= date) break; if (d >= lo && isNum(s)) out = s; }
  return out;
}

// Rohzeile je Titel und Stichtag.
function row(s, t, date, ev) {
  const r = { id: s.id, ...F.priceFactors(s.adj, t), ...F.fundamentalFactors(s.bundle, date, s.raw[t]), ...extraPriceFactors(s.adj, t) };
  const ins = ev && ev.insider ? ev.insider.get(s.id) : null;
  const i13 = insiderAt(ins, date, 13), i26 = insiderAt(ins, date, 26);
  r.ins13 = i13.count; r.ins13v = r.marketCap > 0 ? i13.value / r.marketCap : null;
  r.ins26 = i26.count; r.ins26v = r.marketCap > 0 ? i26.value / r.marketCap : null;
  r.sue = ev && ev.sue ? sueAt(ev.sue.get(s.id), date) : null;
  r.hasInsiderData = !!(ev && ev.insider); r.hasSueData = !!(ev && ev.sue);
  return r;
}

// Einzelsignale als Perzentile über die Zeilen eines Stichtags.
function signalTable(rows) {
  const fam = F.familyScores(rows), pct = k => F.percentiles(rows.map(r => r[k]));
  const p12 = pct('momentum12_1'), p6 = pct('momentum6_1'), ph = pct('hi52'), psue = pct('sue');
  const flag26 = F.percentiles(rows.map(r => r.hasInsiderData ? (r.ins26 >= 1 ? 1 : 0) : null));
  const insScore = l => {
    const v = rows.map(r => r['ins' + l] >= 1 ? (isNum(r['ins' + l + 'v']) ? r['ins' + l + 'v'] : 0) : null), pv = F.percentiles(v);
    return rows.map((r, i) => r['ins' + l] >= 1 ? r['ins' + l] + 0.999 * pv[i] : null);
  };
  const mean2 = (a, b) => isNum(a) && isNum(b) ? (a + b) / 2 : null;
  const sig = {
    M12: p12, M6: p6, MAVG: p12.map((x, i) => mean2(x, p6[i])), HI52: ph,
    QUAL: fam.map(f => mean2(f.quality, f.profitability)), VAL: fam.map(f => f.value), LVOL: fam.map(f => f.risk),
    INS13: insScore(13), INS26: insScore(26), PEAD: rows.map(r => isNum(r.sue) ? r.sue : null), INSFLAG26: flag26,
    PEADPCT: psue, PROF: fam.map(f => f.profitability), GROWTH: fam.map(f => f.growth), QUALITY: fam.map(f => f.quality),
  };
  return sig;
}

// Score je Zeile für einen Signalschlüssel des Katalogs (ohne LERN).
function scoreOf(key, sig) {
  if (sig[key] && !COMBOS[key]) return sig[key];
  const parts = COMBOS[key];
  if (!parts) throw Error('SCORE_UNKNOWN ' + key);
  // Kombination: Mittel der Perzentile der Bestandteile (PEAD als Perzentil); alle Bestandteile nötig.
  const cols = parts.map(p => F.percentiles(p === 'PEAD' ? sig.PEADPCT : sig[p]));
  return cols[0].map((_, i) => { const v = cols.map(c => c[i]); return v.every(isNum) ? v.reduce((s, x) => s + x, 0) / v.length : null; });
}

// Merkmale des lernenden Rankings (fehlend = 0,5), zentriert.
const LEARN_FEATURES = ['M12', 'M6', 'HI52', 'LVOL', 'QUALITY', 'PROF', 'GROWTH', 'VAL', 'INSFLAG26', 'PEADPCT'];
function learnMatrix(sig, n) {
  return Array.from({ length: n }, (_, i) => LEARN_FEATURES.map(k => (isNum(sig[k][i]) ? sig[k][i] : 0.5) - 0.5));
}
// Ridge: b = (X'X + λ·n·I)^-1 X'y.
function ridge(X, y, lambda) {
  const p = X[0].length, n = X.length, A = Array.from({ length: p }, () => new Array(p).fill(0)), c = new Array(p).fill(0);
  for (let k = 0; k < n; k++) { const x = X[k]; for (let i = 0; i < p; i++) { c[i] += x[i] * y[k]; for (let j = 0; j < p; j++) A[i][j] += x[i] * x[j]; } }
  for (let i = 0; i < p; i++) A[i][i] += lambda * n;
  // Gauß-Elimination mit Pivotsuche.
  const M = A.map((r, i) => [...r, c[i]]);
  for (let i = 0; i < p; i++) {
    let m = i; for (let r = i + 1; r < p; r++) if (Math.abs(M[r][i]) > Math.abs(M[m][i])) m = r;
    [M[i], M[m]] = [M[m], M[i]];
    if (Math.abs(M[i][i]) < 1e-15) throw Error('RIDGE_SINGULAR');
    for (let r = 0; r < p; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let j = i; j <= p; j++) M[r][j] -= f * M[i][j]; }
  }
  return M.map((r, i) => r[p] / r[i]);
}

module.exports = { extraPriceFactors, insiderAt, sueAt, row, signalTable, scoreOf, LEARN_FEATURES, learnMatrix, ridge, minusDays };
