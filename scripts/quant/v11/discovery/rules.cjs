'use strict';
// V11 DISCOVERY – transparent, serialisable rule specifications -> strategies for lib.simulate.
// Every input is known at the decision week close j (price features: closes <= j; fundamentals: PIT panel
// row of the rank date j with filed < j; market cap PIT). Execution at j+1.
const L = require('./lib.cjs');

// Feature accessor: price features (lib.featuresAt) and, for FUND rules, PIT panel fields prefixed "f.".
function featureValue(row, name) {
  if (name.startsWith('f.')) { const k = name.slice(2); const f = row.fund; if (!f) return null; if (k in f) return f[k]; return f.raws ? f.raws[k] ?? null : null; }
  if (name === 'r12_1_x_r2') return row.r12_1 * row.r2;
  if (name === 'slope_r2') return row.slope * row.r2;
  if (name === 'idio_mom') return row.rs12_1; // relative strength vs SPY (log), 12-1
  return row[name];
}
const OPS = { gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b };

// Month-end decision dates (last calendar week of each month), as in the V10 factor frame.
function monthEnds(ctx) {
  const last = new Map(); ctx.cal.forEach((d, j) => last.set(d.slice(0, 7), j));
  return [...last.values()].sort((a, b) => a - b);
}
// Decision calendar and final liquidation session for a period [from, to] (decision dates).
function schedule(ctx, spec, from, to) {
  let all;
  if (spec.cadence === 'MONTHLY') { const me = monthEnds(ctx); all = me.filter((_, k) => k % 1 === 0); }
  else { const first = ctx.cal.findIndex(d => d >= from); all = []; for (let j = first; j < ctx.T - 1; j += spec.rebalanceWeeks) all.push(j); }
  let inPeriod = all.filter(j => ctx.cal[j] >= from && ctx.cal[j] <= to);
  if (spec.cadence === 'MONTHLY' && spec.rebalanceMonths > 1) inPeriod = inPeriod.filter((_, k) => k % spec.rebalanceMonths === 0);
  const lastJ = inPeriod.at(-1);
  let next;
  if (spec.cadence === 'MONTHLY') { const me = monthEnds(ctx); next = me[me.indexOf(lastJ) + (spec.rebalanceMonths || 1)]; }
  else next = lastJ + spec.rebalanceWeeks;
  if (next === undefined || next + 1 >= ctx.T) throw Error('SCHEDULE_BEYOND_DATA');
  return { decisions: inPeriod, endExec: next + 1 };
}

// V10 signal rules (quant/engines/signal-backtest.js, unchanged): event weeks per listing (engine detectEvents
// incl. cooldown, reads closes <= k only).
function v10Events(ctx, ruleId) {
  ctx._v10 = ctx._v10 || new Map();
  if (!ctx._v10.has(ruleId)) {
    const rule = L.K.Signal.RULE_BY_ID[ruleId], m = new Map();
    for (const l of ctx.listings) m.set(l.id, new Set(L.K.Signal.detectEvents(Array.from(l.closes), rule).map(k => k + l.cal0)));
    ctx._v10.set(ruleId, m);
  }
  return ctx._v10.get(ruleId);
}
function eligibleRows(ctx, spec, j) {
  const rows = L.featuresAt(ctx, j).filter(r => r.canEnter);
  let out = rows;
  if (spec.family === 'V10RULE') {
    const ev = v10Events(ctx, spec.v10Rule), H = spec.signalWindowWeeks;
    out = rows.filter(r => { const s = ev.get(r.id); for (let k = j - H + 1; k <= j; k++) if (s.has(k)) return true; return false; });
    // Deterministic hash tie-break as in the V10 funded strategy (one path of many).
    return out.map(r => ({ ...r, hashKey: L.sha('V11-DISCOVERY-V10RULE|' + r.id + '|' + ctx.cal[j]) }));
  }
  if (spec.family === 'ORACLE_LOOKAHEAD') {
    // FUTURE KNOWLEDGE (R5): realised forward price return from execution j+1 to j+1+h. Upper bound only.
    const h = spec.rebalanceWeeks;
    return rows.map(r => { const l = ctx.byId.get(r.id), a = L.closeAt(l, j + 1), b = L.closeAt(l, Math.min(j + 1 + h, l.last)); return { ...r, fwd: b / a - 1 }; }).filter(r => L.finite(r.fwd));
  }
  if (spec.family === 'FUND') {
    const fd = ctx.fund.byJ.get(j); if (!fd) return [];
    out = rows.map(r => ({ ...r, fund: fd.rows.get(r.id) || null })).filter(r => r.fund);
    if (spec.minMarketCap) out = out.filter(r => L.finite(r.fund.mcap) && r.fund.mcap >= spec.minMarketCap);
  }
  const need = [...(spec.ranks || []).map(x => x[0]), ...(spec.filters || []).map(x => x[0])];
  out = out.filter(r => need.every(n => L.finite(featureValue(r, n))));
  for (const [n, op, v] of spec.filters || []) out = out.filter(r => OPS[op](featureValue(r, n), v));
  return out;
}
function scored(ctx, spec, j) {
  const rows = eligibleRows(ctx, spec, j);
  if (!rows.length) return [];
  const comps = (spec.ranks || []).map(([n, dir, w]) => [L.pctRank(rows, r => featureValue(r, n), dir), w]);
  const wsum = comps.reduce((s, [, w]) => s + w, 0);
  rows.forEach((r, k) => { r.score = comps.length ? comps.reduce((s, [rk, w]) => s + w * rk[k], 0) / wsum : 0; });
  // Rank pct of the composite (1 = best); ties broken by id (V10 rules: by hash key) for determinism.
  if (spec.family === 'ORACLE_LOOKAHEAD') rows.sort((a, b) => b.fwd - a.fwd || (a.id < b.id ? -1 : 1));
  else if (spec.family === 'V10RULE') rows.sort((a, b) => a.hashKey < b.hashKey ? -1 : a.hashKey > b.hashKey ? 1 : 0);
  else rows.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  rows.forEach((r, k) => { r.rankPct = 1 - k / rows.length; r.rank = k; });
  return rows;
}
function spyBelowSma(ctx, j) { let s = 0; for (let k = j - 39; k <= j; k++) s += ctx.spy[k]; return ctx.spy[j] < s / 40; }

function weightsFor(spec, picks) {
  if (spec.weighting === 'INVVOL') { const inv = picks.map(r => 1 / r.vol), t = inv.reduce((a, b) => a + b, 0); return new Map(picks.map((r, k) => [r.id, inv[k] / t])); }
  if (spec.weighting === 'SCORE') { const t = picks.reduce((a, r) => a + r.score, 0); return new Map(picks.map(r => [r.id, r.score / t])); }
  return new Map(picks.map(r => [r.id, 1 / picks.length]));
}

function makeStrategy(ctx, spec) {
  return {
    spec,
    decide(j, view) {
      if (spec.marketFilter === 'SPY_SMA40' && spyBelowSma(ctx, j)) return view.positions.size ? new Map() : null;
      const rows = scored(ctx, spec, j);
      if (spec.selectAll) return weightsFor(spec, rows);
      const N = spec.positions;
      if (spec.holding === 'FULL') return weightsFor(spec, rows.slice(0, N));
      const byId = new Map(rows.map(r => [r.id, r]));
      if (spec.holding === 'BUFFER') {
        const keep = [...view.positions.keys()].filter(id => byId.has(id) && byId.get(id).rankPct >= spec.keepRankPct);
        const picks = keep.map(id => byId.get(id)).sort((a, b) => a.rank - b.rank).slice(0, N);
        for (const r of rows) { if (picks.length >= N) break; if (!picks.includes(r)) picks.push(r); }
        return weightsFor(spec, picks);
      }
      if (spec.holding === 'RUN') {
        // Let winners run: holdings keep their units (no reweighting) until an exit rule fires; freed capital and
        // cash are split equally over new entries (top-ranked names not yet held).
        const out = new Map(); let held = 0;
        for (const [id, pos] of view.positions) {
          const r = byId.get(id);
          const feat = r || L.featuresAt(ctx, j).find(x => x.id === id);
          let exit = !r || r.rankPct < spec.exitRankPct;
          if (spec.trendExit && feat && feat.sma40 < 1) exit = true;
          if (spec.maxHoldWeeks && j + 1 - pos.entry >= spec.maxHoldWeeks) exit = true;
          if (spec.trimAbove && pos.value / view.total > spec.trimAbove) { out.set(id, spec.trimAbove); held++; continue; }
          if (!exit) { out.set(id, 'KEEP'); held++; }
        }
        for (const r of rows) { if (held >= N) break; if (!out.has(r.id) && r.rankPct >= spec.entryRankPct) { out.set(r.id, 'FILL'); held++; } }
        const changed = out.size !== view.positions.size || [...out.values()].some(v => v !== 'KEEP') || [...view.positions.keys()].some(id => !out.has(id));
        return changed ? out : null;
      }
      throw Error('UNKNOWN_HOLDING:' + spec.holding);
    }
  };
}

// Population benchmarks on the same decision calendar: equal-weighted eligible universe of a spec, and the
// PIT cap-weighted frame population (panel market cap of the latest rank date <= j; 2010+).
function popSpec(spec) { return { ...spec, id: (spec.id || 'x') + ':POP_EW', selectAll: true, holding: 'FULL', weighting: 'EW', marketFilter: null, ranks: [], filters: spec.filters || [] }; }
function frameEwStrategy(ctx) {
  return { decide(j) { return new Map(L.featuresAt(ctx, j).filter(r => r.canEnter).map((r, _, a) => [r.id, 1 / a.length])); } };
}
function capWeightStrategy(ctx) {
  return { decide(j) {
    const fd = ctx.fund.latestAtOrBefore(j); if (!fd) return null;
    const rows = L.featuresAt(ctx, j).filter(r => r.canEnter).map(r => [r.id, fd.rows.get(r.id)?.mcap]).filter(([, m]) => L.finite(m) && m > 0);
    const t = rows.reduce((s, [, m]) => s + m, 0);
    return new Map(rows.map(([id, m]) => [id, m / t]));
  } };
}

function run(ctx, spec, from, to, costs, opts = {}) {
  const sch = schedule(ctx, spec, from, to);
  const sim = L.simulate(ctx, makeStrategy(ctx, spec), { ...sch, costs, ...opts });
  return { sch, sim };
}

module.exports = { featureValue, monthEnds, schedule, eligibleRows, scored, makeStrategy, popSpec, frameEwStrategy, capWeightStrategy, run, spyBelowSma };
