'use strict';
// V11 DISCOVERY – shared building blocks: population frame (V10 study frame rule on the lifecycle loader),
// calendar-aligned weekly closes, PIT fundamental panel (V10 factor strand, cut to the lifecycle frame),
// price features (closes up to the decision week only), a fast portfolio simulator that mirrors the
// research-portfolio ledger arithmetic exactly, the research-portfolio bridge (official ledger), metrics
// and inference wrappers (research-validation). No product data are written; no engine is changed.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../../..');
const K = require(ROOT + '/scripts/quant/v10/studies/common.cjs');
const P = require(ROOT + '/quant/engines/research-portfolio.cjs');
const V = require(ROOT + '/quant/engines/research-validation.cjs');
const C = require(ROOT + '/quant/engines/research-contract.cjs');

const STUDY_ID = 'V11-DISCOVERY';
const PROTOCOL_FILE = 'docs/quant-recovery/v11/protocol/time-split-1.0.0.json';
const PROTOCOL_SHA_FILE = 'docs/quant-recovery/v11/protocol/time-split-1.0.0.sha256';
const DOCS = path.join(ROOT, 'docs/quant-recovery/v11/discovery');
const LOADER_OPTIONS = Object.freeze({ identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true });
const PRIVATE = process.env.V11_DISCOVERY_PRIVATE || '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad/v11-private/discovery';
const FACTOR_PANEL = process.env.V11_FACTOR_PANEL || '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad/v10-private/factor/panel.jsonl.gz';
const COSTS = Object.freeze({ base: { feeBps: 10, slippageBps: 5 }, stress: { feeBps: 20, slippageBps: 30 } });
const INFERENCE = Object.freeze({ replicates: 1999, seed: 1729, alpha: 0.05, blockLengthWeeks: 26, robustnessBlockLengthWeeks: 52, assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING' });
const LEDGER_CAPITAL = 1; // Numeraire 1 as in V10 (research-portfolio full-exit float dust, docs/quant-recovery/v10/engine-fixes).

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const finite = v => typeof v === 'number' && Number.isFinite(v);

function protocolHash() {
  const line = fs.readFileSync(path.join(ROOT, PROTOCOL_SHA_FILE), 'utf8').trim().split(/\s+/)[0];
  const actual = C.shaFile(path.join(ROOT, PROTOCOL_FILE));
  if (line !== actual) throw Error('PROTOCOL_HASH_MISMATCH');
  return actual;
}
function protocol() { return JSON.parse(fs.readFileSync(path.join(ROOT, PROTOCOL_FILE), 'utf8')); }
function gitHead() { try { return cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } }
// A frozen file must be committed and unchanged in the working tree before the gated stage runs (R2/R3).
function assertCommitted(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw Error('FROZEN_FILE_MISSING:' + rel);
  const status = cp.execFileSync('git', ['status', '--porcelain', '--', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (status) throw Error('FROZEN_FILE_NOT_COMMITTED:' + rel);
  const commit = cp.execFileSync('git', ['log', '-1', '--format=%H %cI', '--', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!commit) throw Error('FROZEN_FILE_NOT_IN_HISTORY:' + rel);
  const [sha1, at] = commit.split(' ');
  return { file: rel, commit: sha1, committedAt: at, sha256: C.shaFile(abs) };
}

// ---------------- context ----------------
function buildContext({ withPanel = true } = {}) {
  const t0 = Date.now();
  const fr = K.buildFrame(LOADER_OPTIONS);
  const panel = K.buildPanel(fr);
  const cal = fr.calendar, T = cal.length, calIndex = new Map(cal.map((d, i) => [d, i]));
  const bench = K.loadBenchmark();
  const spy = new Float64Array(T).fill(NaN);
  cal.forEach((d, i) => { const v = bench.byDate.get(d); if (v) spy[i] = v; });
  const listings = panel.map((p, i) => {
    const lc = p.lifecycle, end = lc ? (lc.lastTradeDate || lc.lastObservedDate || null) : null;
    return { i, id: p.id, listingId: p.listingId, mic: p.mic, listingStart: p.listingStart, cal0: p.cal[0], n: p.closes.length, last: p.cal[p.closes.length - 1], closes: p.closes,
      ended: !!end, lifecycle: lc ? { status: lc.status ?? null, lastTradeDate: lc.lastTradeDate ?? null, lastObservedDate: lc.lastObservedDate ?? null, terminalKind: lc.terminal?.kind ?? null, cashPerShare: lc.terminal?.cashPerShare ?? null } : null };
  });
  for (const l of listings) if (l.cal0 + l.n - 1 !== l.last) throw Error('CALENDAR_GAP_IN_FRAME:' + l.id); // frame has no gaps (checked)
  // Quoted (unadjusted) close at week k = split-adjusted close x product of provider split factors dated after k.
  // The quoted price was public at k; later split factors only undo the provider's back-adjustment.
  for (const l of listings) {
    const splits = (fr.docs.get(l.id).corporateActions?.splits || []).map(([d, f]) => [d, f]).sort((a, b) => a[0] < b[0] ? -1 : 1);
    const dates = panel[l.i].dates, rf = new Float64Array(l.n); let acc = 1, q = splits.length - 1;
    for (let k = l.n - 1; k >= 0; k--) { while (q >= 0 && splits[q][0] > dates[k]) { acc *= splits[q][1]; q--; } rf[k] = acc; }
    l.rawFactor = rf;
  }
  const ctx = { fr, cal, T, calIndex, bench, spy, listings, byId: new Map(listings.map(l => [l.id, l])), manifestHash: C.hash(K.sourceManifest(fr)), seconds: null };
  if (withPanel) ctx.fund = loadFundamentals(ctx);
  ctx.seconds = (Date.now() - t0) / 1000;
  return ctx;
}
const closeAt = (l, j) => (j >= l.cal0 && j <= l.last) ? l.closes[j - l.cal0] : NaN;
const alive = (l, j) => j >= l.cal0 && j <= l.last;

// PIT fundamental panel of the V10 factor strand (monthly rank dates 2010-2025), cut to the lifecycle frame:
// rows of listings outside the lifecycle frame or after their last bar are dropped (V10 finding 5).
const FUND_RAWS = ['grossProfitabilityTtm', 'roicTtm', 'roaTtm', 'operatingMarginTtm', 'revenueGrowthTtmYoy', 'revenueCagr3y', 'epsCagr3y', 'fcfYield', 'earningsYield', 'bookToMarket', 'salesYield', 'accrualRatio', 'netDebtToAssets'];
function loadFundamentals(ctx) {
  const cache = path.join(PRIVATE, 'fund-cache-1.0.0.json.gz');
  const panelStat = fs.statSync(FACTOR_PANEL);
  const key = sha(JSON.stringify({ size: panelStat.size, mtime: panelStat.mtimeMs, manifest: ctx.manifestHash, raws: FUND_RAWS }));
  if (fs.existsSync(cache)) { const c = JSON.parse(zlib.gunzipSync(fs.readFileSync(cache)).toString('utf8')); if (c.key === key) return hydrateFund(c, ctx); }
  const buf = zlib.gunzipSync(fs.readFileSync(FACTOR_PANEL));
  let start = 0, header = null, trailer = null; const dates = [];
  const counts = { panelRows: 0, droppedNotInLifecycleFrame: 0, droppedAfterSeriesEnd: 0, kept: 0 };
  while (start < buf.length) {
    let end = buf.indexOf(10, start); if (end < 0) end = buf.length;
    if (end > start) {
      const d = JSON.parse(buf.toString('utf8', start, end));
      if (!header) header = d;
      else if (d.trailer) trailer = d;
      else {
        const j = ctx.calIndex.get(d.date); if (j === undefined) throw Error('RANK_DATE_NOT_ON_CALENDAR:' + d.date);
        const idx = header.componentIds.map((c, k) => [c, k]).filter(([c]) => FUND_RAWS.includes(c));
        const rows = [];
        for (const [id, scores, vec, template, marketCap, fundAvailableAt] of d.rows) {
          counts.panelRows++;
          const l = ctx.byId.get(id);
          if (!l) { counts.droppedNotInLifecycleFrame++; continue; }
          if (!alive(l, j)) { counts.droppedAfterSeriesEnd++; continue; }
          const raws = {}; for (const [c, k] of idx) if (vec[k] !== null) raws[c] = vec[k];
          rows.push([id, scores, template ? 1 : 0, finite(marketCap) ? marketCap : null, fundAvailableAt || null, raws]);
          counts.kept++;
        }
        dates.push({ date: d.date, j, cutoff: d.cutoff, rows });
      }
    }
    start = end + 1;
  }
  if (!trailer) throw Error('PANEL_TRUNCATED');
  const c = { key, panelSha256: null, schemaVersion: header.schemaVersion, panelLoaderOptions: header.loaderOptions, counts, dates };
  fs.mkdirSync(PRIVATE, { recursive: true });
  fs.writeFileSync(cache, zlib.gzipSync(JSON.stringify(c)));
  return hydrateFund(c, ctx);
}
function hydrateFund(c, ctx) {
  const byJ = new Map();
  for (const d of c.dates) {
    const m = new Map();
    for (const [id, s, template, mcap, availableAt, raws] of d.rows) m.set(id, { q: s.quality, g: s.growth, v: s.value, p: s.profitability, m: s.momentum, r: s.risk, comp: s.composite, template, mcap, availableAt, raws });
    byJ.set(d.j, { date: d.date, cutoff: d.cutoff, rows: m });
  }
  const js = [...byJ.keys()].sort((a, b) => a - b);
  return { byJ, js, counts: c.counts, panelLoaderOptions: c.panelLoaderOptions, latestAtOrBefore: j => { let r = null; for (const x of js) { if (x <= j) r = x; else break; } return r === null ? null : byJ.get(r); } };
}

// ---------------- price features (closes up to week j only) ----------------
const FEATURE_MIN_BARS = 57; // 52 weeks + skip month + 1
function featuresAt(ctx, j) {
  ctx._feat = ctx._feat || new Map();
  if (ctx._feat.has(j)) return ctx._feat.get(j);
  const out = [];
  const spyOk = finite(ctx.spy[j]) && finite(ctx.spy[j - 52]) && finite(ctx.spy[j - 4]);
  for (const l of ctx.listings) {
    if (!alive(l, j) || l.listingStart > ctx.cal[j] || j - l.cal0 + 1 < FEATURE_MIN_BARS) continue;
    const c = k => l.closes[k - l.cal0];
    const c0 = c(j), c4 = c(j - 4), c13 = c(j - 13), c26 = c(j - 26), c52 = c(j - 52);
    let s40 = 0; for (let k = j - 39; k <= j; k++) s40 += c(k);
    let hi = 0, up = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0; const lr = [];
    for (let k = j - 51; k <= j; k++) {
      const v = c(k); if (v > hi) hi = v;
      const r = Math.log(v / c(k - 1)); lr.push(r); if (r > 0) up++;
      const x = k - j, y = Math.log(v); sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
    }
    const n = 52, cov = sxy - sx * sy / n, vx = sxx - sx * sx / n, vy = syy - sy * sy / n;
    const r2 = vy > 0 ? (cov * cov) / (vx * vy) : 0, slope = cov / vx;
    const m = mean(lr), vol = Math.sqrt(lr.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) * Math.sqrt(52);
    // Weekly beta vs SPY over 52 weeks (price returns).
    let beta = null;
    if (spyOk) { let ma = 0, mb = 0, cnt = 0; const pr = []; for (let k = j - 51; k <= j; k++) { const a = c(k) / c(k - 1) - 1, b = ctx.spy[k] / ctx.spy[k - 1] - 1; if (finite(b)) { pr.push([a, b]); ma += a; mb += b; cnt++; } }
      if (cnt >= 50) { ma /= cnt; mb /= cnt; let cv = 0, vb = 0; for (const [a, b] of pr) { cv += (a - ma) * (b - mb); vb += (b - mb) ** 2; } beta = vb > 0 ? cv / vb : null; } }
    out.push({ i: l.i, id: l.id, r12_1: c4 / c52 - 1, r6: c0 / c26 - 1, r3: c0 / c13 - 1, r1: c0 / c4 - 1, r12: c0 / c52 - 1, vol, r2, slope, upShare: up / n, hi52: c0 / hi, sma40: c0 / (s40 / 40),
      rawPx: c0 * l.rawFactor[j - l.cal0], zeroShare: lr.filter(x => x === 0).length / n, rs12_1: spyOk ? Math.log(c4 / c52) - Math.log(ctx.spy[j - 4] / ctx.spy[j - 52]) : null, beta, canEnter: alive(l, j + 1) });
  }
  ctx._feat.set(j, out);
  return out;
}
// Cross-sectional percentile rank (0..1, midrank) of key over rows; higher = better unless dir < 0.
function pctRank(rows, key, dir = 1) {
  const v = rows.map((r, k) => [typeof key === 'function' ? key(r) : r[key], k]).filter(([x]) => finite(x)).sort((a, b) => dir * (a[0] - b[0]));
  const out = new Float64Array(rows.length).fill(NaN);
  for (let s = 0; s < v.length;) { let e = s; while (e + 1 < v.length && v[e + 1][0] === v[s][0]) e++; const pr = ((s + e) / 2 + 0.5) / v.length; for (let k = s; k <= e; k++) out[v[k][1]] = pr; s = e + 1; }
  return out;
}

// ---------------- portfolio simulator (mirrors research-portfolio arithmetic for price simulation) ----------------
// strategy.decide(j, view) -> null (no trade) or Map(id -> number | 'KEEP' | 'FILL'); ids absent are sold.
// Execution at j+1 close. Forced exit at a listing's last bar (series end) with others KEEP.
// Returns the equity path, trades, rebalances and resolved numeric targets (for the research-portfolio bridge).
function simulate(ctx, strategy, { decisions, endExec, costs, delistValue = 'LAST_CLOSE', record = true, relativeTolerance = false }) {
  const rate = (costs.feeBps + costs.slippageBps) / 10000, feeRate = costs.feeBps / 10000, slipRate = costs.slippageBps / 10000, init = LEDGER_CAPITAL;
  const start = decisions[0], decSet = new Set(decisions);
  let cash = init, turnover = 0, fees = 0, slips = 0;
  const holdings = new Map(), meta = new Map(), equity = [], trades = [], targets = [], rebalances = [], exits = [];
  const terminalAdjust = []; // delisting valuation alternatives (bounds) relative to LAST_CLOSE
  for (let s = start; s <= endExec; s++) {
    const price = id => { const l = ctx.byId.get(id), v = closeAt(l, s); if (!finite(v)) throw Error('SIM_PRICE_UNAVAILABLE:' + id + '@' + ctx.cal[s]); return v; };
    // Target executing at s: decision at s-1 (regular) merged with forced exits of listings whose last bar is s.
    let spec = null, decisionJ = s - 1;
    if (decSet.has(s - 1) && s - 1 >= start && s - 1 < endExec) spec = strategy.decide(s - 1, viewOf(ctx, s - 1, holdings, meta, cash));
    if (s === endExec) spec = new Map(); // final liquidation
    const forced = [...holdings.keys()].filter(id => ctx.byId.get(id).last === s && s < endExec);
    if (spec) for (const id of [...spec.keys()]) if (ctx.byId.get(id).last <= s && s < endExec) spec.delete(id); // cannot hold beyond series end
    if (forced.length) {
      if (!spec) { spec = new Map(); for (const id of holdings.keys()) spec.set(id, 'KEEP'); }
      for (const id of forced) spec.delete(id);
      // Bound variants (not engine-representable): terminal value written off (MINUS_100) or sourced cash
      // consideration (CASH_OR_LAST); the position leaves the book before the rebalance, without costs.
      if (delistValue !== 'LAST_CLOSE') for (const id of forced) {
        const l = ctx.byId.get(id), u = holdings.get(id), px = price(id);
        const f = delistValue === 'MINUS_100' ? 0 : (l.lifecycle?.terminalKind === 'CASH_MERGER' && finite(l.lifecycle.cashPerShare) && l.lifecycle.cashPerShare > 0 ? l.lifecycle.cashPerShare / px : 1);
        cash += u * px * f; holdings.delete(id);
        const m = meta.get(id); exits.push({ id, entry: m.entry, exit: s, entryPrice: m.entryPrice, exitPrice: px * f, forced: true, terminal: delistValue }); meta.delete(id);
      }
    }
    const marked = new Map([...holdings].map(([k, u]) => [k, u * price(k)]));
    const before = cash + [...marked.values()].reduce((a, b) => a + b, 0);
    if (spec) {
      const keys = [...new Set([...holdings.keys(), ...spec.keys()])].sort();
      keys.forEach(k => price(k));
      const keepVal = [...spec].filter(([, w]) => w === 'KEEP').reduce((s2, [k]) => s2 + (marked.get(k) || 0), 0);
      const fixedW = [...spec].filter(([, w]) => typeof w === 'number').reduce((s2, [, w]) => s2 + w, 0);
      const nFill = [...spec].filter(([, w]) => w === 'FILL').length;
      const weightAt = v => { const fill = nFill ? Math.max(0, (1 - fixedW - keepVal / v) / nFill) : 0; const w = new Map(); for (const [k, x] of spec) w.set(k, x === 'KEEP' ? (marked.get(k) || 0) / v : x === 'FILL' ? fill : x); return w; };
      const costAt = v => { const w = weightAt(v); return keys.reduce((s2, k) => s2 + Math.abs((w.get(k) || 0) * v - (marked.get(k) || 0)), 0) * rate; };
      let lo = 0, hi = before;
      for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (mid + costAt(mid) > before) hi = mid; else lo = mid; }
      const after = (lo + hi) / 2, w = weightAt(after);
      const weights = Object.fromEntries([...w].filter(([, x]) => x > 0).sort((a, b) => a[0] < b[0] ? -1 : 1));
      // Engine-identical execution with the resolved numeric weights.
      const costAt2 = v => keys.reduce((s2, k) => s2 + Math.abs((weights[k] || 0) * v - (marked.get(k) || 0)), 0) * rate;
      let lo2 = 0, hi2 = before;
      for (let it = 0; it < 80; it++) { const mid = (lo2 + hi2) / 2; if (mid + costAt2(mid) > before) hi2 = mid; else lo2 = mid; }
      const after2 = (lo2 + hi2) / 2;
      let traded = 0, f = 0, sl = 0;
      const deltas = keys.map(k => ({ k, delta: (weights[k] || 0) * after2 - (marked.get(k) || 0) })).sort((a, b) => a.delta - b.delta || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
      for (const { k, delta } of deltas) {
        if (Math.abs(delta) <= 1e-12 * (relativeTolerance ? Math.max(init, before) : init)) continue;
        const px = price(k), notional = Math.abs(delta), fee = notional * feeRate, slip = notional * slipRate, units = delta / px;
        cash -= delta + fee + slip;
        const nu = (holdings.get(k) || 0) + units;
        if (nu < -1e-10 && !(relativeTolerance && Math.abs(nu * px) <= 1e-9 * Math.max(init, before))) throw Error('SIM_NEGATIVE_UNITS');
        if (Math.abs(nu) <= 1e-12 || (relativeTolerance && Math.abs(nu * px) <= 1e-12 * Math.max(init, before))) { holdings.delete(k); const m = meta.get(k); if (m) { exits.push({ id: k, entry: m.entry, exit: s, entryPrice: m.entryPrice, exitPrice: px, forced: forced.includes(k) }); meta.delete(k); } }
        else { holdings.set(k, nu); if (!meta.has(k)) meta.set(k, { entry: s, entryPrice: px }); }
        if (record) trades.push([s, k, delta > 0 ? 1 : -1, units, px, notional, fee + slip]);
        traded += notional; f += fee; sl += slip;
      }
      // Engine tolerances are absolute (initial capital); oracle paths grow by many orders of magnitude, so they
      // use the same tolerances relative to the pre-trade equity (relativeTolerance, oracle only).
      const tol = relativeTolerance ? Math.max(init, before) : init;
      if (cash < -1e-9 * tol) throw Error('SIM_NEGATIVE_CASH');
      if (Math.abs(cash) < 1e-12 * tol) cash = 0;
      fees += f; slips += sl; const turn = before > 0 ? traded / (2 * before) : 0; turnover += turn;
      rebalances.push({ s, decision: decisionJ, forced: forced.length, turnover: turn, cost: f + sl });
      targets.push({ decision: decisionJ, exec: s, weights, forced: forced.slice() });
      for (const id of forced) { const l = ctx.byId.get(id); terminalAdjust.push({ id, s, kind: l.lifecycle?.terminalKind || 'UNKNOWN', cashPerShare: l.lifecycle?.cashPerShare ?? null }); }
    }
    let value = cash, invested = 0;
    for (const [k, u] of holdings) { const v = u * price(k); value += v; invested += v; }
    equity.push({ s, date: ctx.cal[s], value, cash, invested, n: holdings.size, spy: ctx.spy[s] });
  }
  return { equity, trades, targets, rebalances, exits, terminalAdjust, metrics: { turnoverSum: turnover, fees, slippage: slips } };
}
function viewOf(ctx, j, holdings, meta, cash) {
  const pos = new Map(); let total = cash;
  for (const [k, u] of holdings) { const v = u * closeAt(ctx.byId.get(k), j); pos.set(k, { units: u, value: v, ...meta.get(k) }); total += v; }
  return { j, date: ctx.cal[j], positions: pos, total, cash };
}

// ---------------- research-portfolio bridge (official ledger) ----------------
const ledgerId = id => /^[A-Za-z0-9_:./-]{1,160}$/.test(id) ? id : 'ledger:' + sha(id).slice(0, 32);
const closeTs = d => d + 'T23:59:59.999Z';
function engineInput(ctx, sim, costs, startJ, endExec) {
  const sessions = []; for (let s = startJ; s <= endExec; s++) sessions.push({ date: ctx.cal[s], closeAt: closeTs(ctx.cal[s]) });
  const need = new Map();
  let held = new Set();
  const tByExec = new Map(sim.targets.map(t => [t.exec, t]));
  for (let s = startJ; s <= endExec; s++) {
    const t = tByExec.get(s);
    if (t) { for (const k of held) add(k, s); held = new Set(Object.keys(t.weights)); }
    for (const k of held) add(k, s);
  }
  function add(k, s) { if (!need.has(k)) need.set(k, new Set()); need.get(k).add(s); }
  const listings = [...need].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([id, ss]) => {
    const l = ctx.byId.get(id);
    const bars = [...ss].sort((a, b) => a - b).map(s => { const v = closeAt(l, s); if (!finite(v)) throw Error('BRIDGE_PRICE_MISSING:' + id); return { date: ctx.cal[s], close: v, availableAt: closeTs(ctx.cal[s]) }; });
    return { listingId: ledgerId(l.listingId), issuerId: ledgerId(l.id), mic: l.mic, instrumentClass: 'COMMON_STOCK', primary: true, currency: 'USD', firstTradeDate: ctx.cal[l.cal0], lastTradeDate: null, events: [], bars };
  });
  const lid = id => ledgerId(ctx.byId.get(id).listingId);
  const memberships = [], targets = [];
  for (const t of sim.targets) {
    const members = Object.keys(t.weights).map(lid).sort();
    const h = V.hash({ d: ctx.cal[t.decision], members });
    memberships.push({ effectiveAt: ctx.cal[t.decision] + 'T00:00:00Z', availableAt: ctx.cal[t.decision] + 'T00:00:00Z', sourceHash: h, members });
    targets.push({ decisionDate: ctx.cal[t.decision], executionDate: ctx.cal[t.exec], availableAt: closeTs(ctx.cal[t.decision]), membershipHash: h, weights: Object.fromEntries(Object.entries(t.weights).map(([k, w]) => [lid(k), w]).sort((a, b) => a[0] < b[0] ? -1 : 1)) });
  }
  return { sessions, initialCapital: LEDGER_CAPITAL, currency: 'USD', returnBasis: 'PRICE_RETURN',
    provenance: { mode: 'HISTORICAL_PRICE_SIMULATION', datasetHash: ctx.manifestHash, priceSeriesType: 'SPLIT_ADJUSTED', populationBasis: 'CONDITIONAL_FIXED_CURRENT_COHORT', clockBasis: 'MODELED_WEEK_END_DATE' },
    costs: { basis: 'PER_SIDE_NOTIONAL', ...costs }, maxMembershipAgeDays: 45, maxFactorAgeDays: 45, listings, factorSnapshots: [], memberships, targets,
    benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', sourceHash: ctx.bench.provenance.sourceBytesHash, costPolicy: 'PASSIVE_NO_TRANSACTION_COSTS', levels: sessions.map(x => { const v = ctx.bench.byDate.get(x.date); if (!v) throw Error('SPY_MISSING:' + x.date); return { date: x.date, level: v }; }) } };
}
function runEngine(ctx, sim, costs, startJ, endExec) {
  const input = engineInput(ctx, sim, costs, startJ, endExec);
  const r = P.runPortfolio(input);
  let maxAbs = 0;
  r.equity.forEach((e, k) => { maxAbs = Math.max(maxAbs, Math.abs(e.value - sim.equity[k].value)); });
  return { inputHash: r.inputHash, resultHash: r.resultHash, generation: r.generation, engine: P.VERSION, limitations: r.limitations, metrics: r.metrics, equity: r.equity.map(e => [e.date, e.value]),
    parity: { sessions: r.equity.length, maxAbsEquityDiff: maxAbs, identicalWithin1e9: maxAbs <= 1e-9 } };
}

// ---------------- metrics ----------------
function pathMetrics(values, dates) {
  const rets = values.slice(1).map((v, k) => v / values[k] - 1);
  const years = (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / (365.25 * 86400000);
  let peak = values[0], mdd = 0, peakD = dates[0], ddPeak = null, ddTrough = null;
  values.forEach((v, k) => { if (v > peak) { peak = v; peakD = dates[k]; } const d = v / peak - 1; if (d < mdd) { mdd = d; ddPeak = peakD; ddTrough = dates[k]; } });
  const m = mean(rets), s = sd(rets), down = Math.sqrt(rets.reduce((a, r) => a + (r < 0 ? r * r : 0), 0) / Math.max(1, rets.length - 1));
  return { from: dates[0], to: dates.at(-1), years, totalReturn: values.at(-1) / values[0] - 1, cagr: years > 0 ? (values.at(-1) / values[0]) ** (1 / years) - 1 : null,
    volatility: s * Math.sqrt(52), sharpe: s > 0 ? m / s * Math.sqrt(52) : null, sortino: down > 0 ? m / down * Math.sqrt(52) : null, maxDrawdown: mdd, maxDrawdownPeak: ddPeak, maxDrawdownTrough: ddTrough, weeks: rets.length };
}
function blockInference(dates, values, blockLength) {
  const rows = values.map((v, k) => ({ id: dates[k], date: dates[k], value: v }));
  if (rows.length < 2 * blockLength) return { n: rows.length, estimate: mean(values), ci: null, pValue: null, state: 'TOO_FEW_DATES_FOR_BLOCK' };
  const r = V.inferTemporalBlockMean({ calendar: dates, blockLength, minimumBlockLength: blockLength, replicates: INFERENCE.replicates, seed: INFERENCE.seed, alpha: INFERENCE.alpha, assumption: INFERENCE.assumption }, rows);
  return { n: r.n, estimate: r.estimate, ci: r.ci, pValue: r.pValue, blockLength, blocks: r.blockCountDiagnostic, method: r.inferenceMethod, inputHash: r.inputHash };
}
function neweyWest(x, lag) {
  const n = x.length, m = mean(x), e = x.map(v => v - m);
  let s = e.reduce((a, v) => a + v * v, 0) / n;
  for (let L = 1; L <= lag; L++) { let c = 0; for (let t = L; t < n; t++) c += e[t] * e[t - L]; s += 2 * (1 - L / (lag + 1)) * c / n; }
  const se = Math.sqrt(s / n); return { mean: m, se, t: se > 0 ? m / se : null, lag };
}
function ols(y, X) { // small OLS with intercept as first column of X rows
  const k = X[0].length, XtX = Array.from({ length: k }, () => new Float64Array(k)), Xty = new Float64Array(k);
  for (let t = 0; t < y.length; t++) for (let a = 0; a < k; a++) { Xty[a] += X[t][a] * y[t]; for (let b = 0; b < k; b++) XtX[a][b] += X[t][a] * X[t][b]; }
  const A = XtX.map((row, a) => [...row, Xty[a]]);
  for (let c = 0; c < k; c++) { let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; if (Math.abs(A[c][c]) < 1e-14) return null; for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let q = c; q <= k; q++) A[r][q] -= f * A[c][q]; } }
  return A.map((row, a) => row[k] / A[a][a]);
}
function holm(cells, key = 'pValue') {
  const testable = cells.filter(c => finite(c[key]));
  const adj = V.holm(testable.map(c => c[key]));
  testable.forEach((c, i) => { c.holmAdjustedP = adj[i]; c.holmReject = adj[i] <= INFERENCE.alpha; });
  cells.filter(c => !finite(c[key])).forEach(c => { c.holmAdjustedP = null; c.holmReject = false; });
  return { familySize: cells.length, testable: testable.length, rejections: testable.filter(c => c.holmReject).length, alpha: INFERENCE.alpha, method: 'HOLM_STEP_DOWN (research-validation.holm)' };
}

function writeJson(file, x, gz = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const s = JSON.stringify(x, null, gz ? 0 : 1) + (gz ? '' : '\n');
  fs.writeFileSync(file, gz ? zlib.gzipSync(s, { level: 9 }) : s);
}
function readJson(file) { const b = fs.readFileSync(file); return JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8')); }
function codeHashes() {
  const files = ['lib.cjs', 'rules.cjs', 'evaluate.cjs'].map(f => 'scripts/quant/v11/discovery/' + f).concat(['scripts/quant/v10/studies/common.cjs', 'quant/engines/research-portfolio.cjs', 'quant/engines/research-validation.cjs', 'quant/engines/research-weekly-loader.cjs']);
  return Object.fromEntries(files.filter(f => fs.existsSync(path.join(ROOT, f))).map(f => [f, C.shaFile(path.join(ROOT, f))]));
}

module.exports = { ROOT, K, P, V, C, STUDY_ID, DOCS, PRIVATE, LOADER_OPTIONS, COSTS, INFERENCE, LEDGER_CAPITAL, FUND_RAWS, sha, mean, sd, finite, protocolHash, protocol, gitHead, assertCommitted,
  buildContext, closeAt, alive, featuresAt, pctRank, simulate, engineInput, runEngine, pathMetrics, blockInference, neweyWest, ols, holm, writeJson, readJson, codeHashes, ledgerId };
