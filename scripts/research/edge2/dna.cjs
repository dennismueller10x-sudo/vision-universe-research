'use strict';
// Edge 2 Teil 4 – Gewinner-DNA (docs/research/edge2/dna/PROTOKOLL.json). Forschung, nicht zertifiziert.
// Gewinner = oberste 5 % der Gesamtrendite über 52 Wochen nach dem Stichtag (inkl. delisteter Titel mit Endwert). Merkmale am
// Stichtag (point-in-time) werden mit allen anderen verglichen; daraus wird eine feste Formel (Log-Lift je Dezil) gelernt,
// eingefroren und auf späteren Jahren geprüft. Dieses Modul liest keine Dateien.
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');
const F = require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs'));
const C = require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs'));
const BT = require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs'));
const P = require(path.join(ROOT, 'quant/engines/research-portfolio.cjs'));
const Bl = require('./blind.cjs');
const Q = require('../edge/quant-e3.cjs');
const crypto = require('node:crypto');
const VERSION = 'edge2-dna-1.0.0';
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : P.canonical(x)).digest('hex');
const FEATURES = Object.freeze(['momentum12_1', 'volatility52', 'marketCap', 'earningsYield', 'fcfYield', 'bookToPrice', 'grossMargin', 'netMargin', 'fcfMargin', 'revenueGrowthYoy', 'revenueCagr3y', 'equityToAssets', 'momentum1', 'distance52High', 'trend40', 'momentum6']);
const HORIZON = 52, WIN_SHARE = 0.05, ALPHA = 0.01;

/** Merkmale aller zulässigen Titel an t (Universum wie im blinden Test). */
function featuresAt(panel, t) {
  return Bl.universeAt(panel, t).map(({ s, f }) => {
    const a = s.adj, x = { ...f };
    x.momentum1 = a[t - 4] > 0 ? a[t] / a[t - 4] - 1 : null;
    x.momentum6 = a[t - 26] > 0 ? a[t] / a[t - 26] - 1 : null;
    let hi = 0, sum = 0, n = 0;
    for (let k = t - 51; k <= t; k++) if (a[k] > 0) { hi = Math.max(hi, a[k]); if (k > t - 40) { sum += a[k]; n++; } }
    x.distance52High = hi > 0 ? a[t] / hi : null;
    x.trend40 = n >= 30 ? a[t] / (sum / n) : null;
    return { s, f: x };
  });
}
/** Gesamtrendite von t+1 bis t+1+52 (Ausführung wie im Ledger); Delisting: letzter Kurs × Endwertquote. */
function forwardReturn(s, t) {
  const e = t + 1, end = e + HORIZON, a = s.adj;
  if (!(a[e] > 0)) return null;
  const term = s.terminal ? s.terminal.lastIdx : null;
  if (term !== null && term < end) { const rec = BT.DEFAULTS.terminalRecovery[s.terminal.kind]; return a[term] > 0 ? a[term] * rec / a[e] - 1 : null; }
  if (!(a[end] > 0)) return null;
  return a[end] / a[e] - 1;
}
function deciles(rows, key) {
  const p = F.percentiles(rows.map(r => r.f[key]));
  return p.map(x => (isNum(x) ? Math.min(10, Math.max(1, Math.ceil(x * 10))) : 0)); // 0 = fehlt
}
/** Beobachtungen an den Lernstichtagen: je Titel Dezile und Gewinner-Kennzeichen. */
// maxEnd: höchster erlaubter Index des Rendite-Endes (kein Label reicht in die Prüf- bzw. Handelsperiode).
function observations(panel, ts, maxEnd = panel.calendar.length - 1) {
  const obs = [];
  for (const t of ts) {
    if (t + 1 + HORIZON > maxEnd) continue;
    const rows = featuresAt(panel, t), fr = rows.map(r => forwardReturn(r.s, t));
    const ok = rows.map((_, i) => i).filter(i => isNum(fr[i]));
    const sorted = ok.map(i => fr[i]).sort((x, y) => y - x), cut = sorted[Math.max(0, Math.ceil(sorted.length * WIN_SHARE) - 1)];
    const dec = Object.fromEntries(FEATURES.map(k => [k, deciles(rows, k)]));
    for (const i of ok) obs.push({ t, win: fr[i] >= cut ? 1 : 0, d: Object.fromEntries(FEATURES.map(k => [k, dec[k][i]])) });
  }
  return obs;
}
// Chi-Quadrat-Unabhängigkeitstest (11 Klassen x 2), p-Wert über die regularisierte Gamma-Funktion.
function gammaQ(a, x) {
  if (x <= 0) return 1;
  const gln = (() => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = a, tmp = a + 5.5; tmp -= (a + 0.5) * Math.log(tmp); let ser = 1.000000000190015; for (const v of c) ser += v / ++y; return -tmp + Math.log(2.5066282746310005 * ser / a); })();
  if (x < a + 1) { let sum = 1 / a, del = sum, ap = a; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; } return 1 - sum * Math.exp(-x + a * Math.log(x) - gln); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}
/** Lernverfahren (eingefroren im Protokoll): Log-Lift je Dezil, nur Merkmale mit Chi²-p < ALPHA/16 (Bonferroni). */
function learn(obs) {
  const N = obs.length, W = obs.reduce((s, o) => s + o.win, 0), base = W / N, rule = { version: VERSION, observations: N, winners: W, baseRate: base, features: {}, rejected: {} };
  for (const k of FEATURES) {
    const n = new Array(11).fill(0), w = new Array(11).fill(0);
    for (const o of obs) { n[o.d[k]]++; w[o.d[k]] += o.win; }
    let chi = 0, df = -1;
    for (let b = 0; b <= 10; b++) { if (!n[b]) continue; df++; const ew = n[b] * base, el = n[b] * (1 - base); chi += (w[b] - ew) ** 2 / ew + (n[b] - w[b] - el) ** 2 / el; }
    const p = df > 0 ? gammaQ(df / 2, chi / 2) : 1;
    // Laplace-Glättung: +1 Gewinner, +1/base Beobachtungen je Klasse (Lift 1 ohne Daten).
    const lift = n.map((x, b) => Math.log(((w[b] + 1) / (x + 1 / base)) / base));
    if (p < ALPHA / FEATURES.length) rule.features[k] = { p, logLift: lift.map(v => Math.round(v * 1e4) / 1e4), counts: n, winners: w };
    else rule.rejected[k] = { p };
  }
  rule.ruleSha256 = sha({ features: Object.fromEntries(Object.entries(rule.features).map(([k, v]) => [k, v.logLift])) });
  return rule;
}
function scoreRows(rows, rule) {
  const dec = Object.fromEntries(Object.keys(rule.features).map(k => [k, deciles(rows, k)]));
  return rows.map((_, i) => Object.entries(rule.features).reduce((s, [k, v]) => s + v.logLift[dec[k][i]], 0));
}
/** Portfolio: alle 13 Wochen die 20 besten Scores, höchstens 5 je Branche, gleich gewichtet (Liquiditätsgrenze), Ledger wie E3. */
function runRule(panel, { window, anchorDate, ruleAt, n = 20 }) {
  const cal = panel.calendar, idx = [...cal.keys()].filter(i => cal[i] >= window[0] && cal[i] <= window[1] && panel.benchmark.levels[i] > 0);
  const anchor = cal.indexOf(anchorDate), first = idx[0], last = idx.at(-1);
  const std = C.standardOf({ minPositions: n, maxPositions: n, targetPositions: n, maxPositionWeight: 1 / n });
  const targets = [], memberships = [], used = [];
  for (let t = first; t < last; t++) {
    if ((t - anchor) % 13 !== 0) continue;
    const rule = ruleAt(t), rows = featuresAt(panel, t), sc = scoreRows(rows, rule);
    used.push([cal[t], rule.ruleSha256]);
    const order = rows.map((_, i) => i).sort((x, y) => sc[y] - sc[x] || (rows[x].s.id < rows[y].s.id ? -1 : 1));
    const per = {}, w = {}, hs = {};
    for (const i of order) {
      if (Object.keys(w).length >= n) break;
      const s = rows[i].s; if ((per[s.sector] || 0) >= Math.floor(n * 0.25)) continue;
      const c = { price: s.raw[t], dollarVolume: s.dv ? s.dv[t] : undefined, marketCap: isNum(rows[i].f.marketCap) ? rows[i].f.marketCap : undefined };
      const liq = C.liquidity(c, std); if (!liq.eligible) continue;
      w[s.id] = Math.min(1 / n, liq.cap); hs[s.id] = C.halfSpreadBps(c).bps; per[s.sector] = (per[s.sector] || 0) + 1;
    }
    const members = Object.keys(w).sort(), mh = sha({ date: cal[t], members, v: 'dna' });
    memberships.push({ effectiveAt: cal[t] + 'T00:00:00Z', availableAt: cal[t] + 'T00:00:00Z', sourceHash: mh, members });
    targets.push({ decisionDate: cal[t], executionDate: cal[t + 1], availableAt: cal[t] + 'T23:59:59.999Z', membershipHash: mh, weights: w, hs });
  }
  const r = Q.ledgerFromTargets(panel, { initialCapital: 1e6, terminalRecovery: BT.DEFAULTS.terminalRecovery }, std, idx, targets, memberships, 13);
  return { ...r, rulesUsed: used, rebalances: targets.length };
}
/** Lernstichtage: alle 13 Wochen ab dem ersten Wochenstichtag >= from. */
function quarterStarts(panel, from) { const a = panel.calendar.findIndex(d => d >= from), out = []; for (let t = a; t >= 0 && t < panel.calendar.length; t += 13) out.push(t); return out; }
/** Erste Panelwoche jedes Kalenderjahres. */
function yearStarts(panel, from, to) {
  const cal = panel.calendar, out = [];
  for (let t = 1; t < cal.length; t++) if (cal[t].slice(0, 4) !== cal[t - 1].slice(0, 4) && +cal[t].slice(0, 4) >= from && +cal[t].slice(0, 4) <= to) out.push(t);
  return out;
}
module.exports = { VERSION, FEATURES, HORIZON, WIN_SHARE, featuresAt, forwardReturn, observations, learn, scoreRows, runRule, yearStarts, quarterStarts, gammaQ };
