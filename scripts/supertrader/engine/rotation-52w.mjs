// VU Trendfolge 52W 1.0.0 (Runde 12, PREREGISTRATION-R12.json) - eigene Vision-Universe-Methode.
// Stuetzt sich auf oeffentlich beschriebene Regeln einer TraderFox-Variante ("NEO-DARVAS", 2018/2019);
// weder Darvas-Original noch TraderFox-System. VU-Ersatzannahmen sind markiert.
//
// Monatliches Depot mit hoechstens 10 Aktien: Entscheidung am letzten Handelstag eines Monats nach
// Schluss, Ausfuehrung zur Eroeffnung des ersten Handelstags des Folgemonats. Kein Stop dazwischen.
//
// Eingabe:
//   stocks: [{ id, symbol, bars: {date[], open[], high[], low[], close[], volume[]}, divAdj?: number[],
//              rs?: number[] (VU-RS-Perzentil je Tag), terminal?: {date, lastClose, distress, kind} }]
//   calendar: Handelstage (aufsteigend); spy: { date[], close[] } (bereinigt)
//   opts: { variant: 'PP'|'BASE', rank: 'CLENOW'|'RS'|'RANDOM', seed, scenario, slippageBps, commissionBps,
//           initialEquity, from, to, universeSize, startDate }
// Ausgabe: { equity[], trades[], decisions[], skipped[], book, openAtEnd, cashEnd }

export const VERSION = '1.0.0';
export const PARAMS = Object.freeze({
  slots: 10, targetWeight: 0.10, minWeight: 0.03, maxWeight: 0.20, trimTo: 0.15, redCap: 0.05,
  universeSize: 1800, advDays: 63, minAdv20: 1e6, lookback: 252, newHighDays: 20, staleDays: 65, gapDays: 20, gapMin: 0.06,
  clenowDays: 90, spyMaDays: 200,
  variants: {
    PP: { minPerf: 1.0, gapRule: true, weightRules: true, redAction: 'CAP' },
    BASE: { minPerf: 0.7, gapRule: false, weightRules: false, redAction: 'SELL' },
  },
});

const SCEN = {
  S0_LAST_PRICE: (t, slip) => t.lastClose * (1 - slip),
  S1_MINUS_30: (t) => t.lastClose * 0.7,
  S2_DISTRESS_ZERO: (t) => (t.distress ? 0 : t.lastClose * 0.7),
};

function hash(seed, s) { let h = 2166136261 ^ seed; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Clenow-Trendmass: annualisierte Steigung der Regression ln(Schluss) ~ Zeit ueber n Sitzungen × R².
export function clenow(close, t, n = 90) {
  if (t - n + 1 < 0) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let k = 0; k < n; k++) {
    const c = close[t - n + 1 + k]; if (!(c > 0)) return null;
    const y = Math.log(c); sx += k; sy += y; sxx += k * k; sxy += k * y; syy += y * y;
  }
  const vx = n * sxx - sx * sx, vy = n * syy - sy * sy;
  if (!(vx > 0)) return null;
  const b = (n * sxy - sx * sy) / vx;
  const r2 = vy > 0 ? ((n * sxy - sx * sy) ** 2) / (vx * vy) : 0;
  return (Math.exp(b * 252) - 1) * r2;
}

// Kennzahlen einer Aktie am Index t (alles nur bis einschliesslich t).
export function metricsAt(b, t, p = PARAMS) {
  if (t < p.lookback) return null;
  let lo = Infinity, hi = -Infinity, hi20 = -Infinity, lastNewHigh = -1;
  for (let i = t - p.lookback + 1; i <= t; i++) { if (b.low[i] < lo) lo = b.low[i]; if (b.high[i] > hi) hi = b.high[i]; }
  for (let i = t - p.newHighDays + 1; i <= t; i++) if (b.high[i] > hi20) hi20 = b.high[i];
  // Neues 252-Tage-Hoch in den letzten 65 Sitzungen: Ist irgendein Tag im Fenster ein 252-Tage-Hoch, dann
  // auch der (letzte) Hoechstwert des Fensters - daher genuegt dessen Pruefung (gleichwertig, O(n)).
  let iMax = -1, mMax = -Infinity;
  for (let i = t - p.staleDays + 1; i <= t; i++) if (b.high[i] >= mMax) { mMax = b.high[i]; iMax = i; }
  let prev = -Infinity; for (let j = Math.max(0, iMax - p.lookback + 1); j < iMax; j++) if (b.high[j] > prev) prev = b.high[j];
  if (iMax >= 0 && mMax >= prev) lastNewHigh = iMax;
  let gap = false;
  for (let i = t - p.gapDays + 1; i <= t; i++) if (i > 0 && b.close[i - 1] > 0 && b.open[i] / b.close[i - 1] - 1 >= p.gapMin) { gap = true; break; }
  let dv20 = 0; for (let i = t - 19; i <= t; i++) dv20 += b.close[i] * (b.volume[i] || 0);
  let dv63 = 0; for (let i = t - p.advDays + 1; i <= t; i++) dv63 += b.close[i] * (b.volume[i] || 0);
  return { close: b.close[t], perf: lo > 0 ? b.close[t] / lo - 1 : null, newHigh20: hi20 >= hi, freshHigh65: lastNewHigh >= 0, gap20: gap, adv20: dv20 / 20, adv63: dv63 / p.advDays, clenow: clenow(b.close, t, p.clenowDays) };
}

function spyMaOk(spy, idx, p) {
  if (idx < p.spyMaDays - 1) return null;
  let s = 0; for (let i = idx - p.spyMaDays + 1; i <= idx; i++) s += spy.close[i];
  return spy.close[idx] > s / p.spyMaDays;
}

export function buyReasons(m, v, p = PARAMS) {
  const r = [];
  if (!(m.adv20 >= p.minAdv20)) r.push('TR52-LIQ');
  if (!(m.perf >= v.minPerf)) r.push('TR52-PERF');
  if (!m.newHigh20) r.push('TR52-HIGH20');
  if (v.gapRule && !m.gap20) r.push('TR52-GAP');
  return r;
}

export function simulateRotation(stocks, calendar, spy, opts = {}) {
  const p = PARAMS, v = p.variants[opts.variant || 'PP'];
  const slip = (opts.slippageBps ?? 10) / 1e4, comm = (opts.commissionBps ?? 1) / 1e4;
  const scen = SCEN[opts.scenario || 'S0_LAST_PRICE'];
  const from = opts.from || calendar[0], to = opts.to || calendar[calendar.length - 1];
  const idx = stocks.map((s) => new Map(s.bars.date.map((d, i) => [d, i])));
  const spyIdx = new Map(spy.date.map((d, i) => [d, i]));
  const lastPx = stocks.map(() => null);
  const lastPx_init = new Map();
  let cash = opts.initialEquity ?? 100000;
  const pos = new Map(); // si -> {shares, entryDate, entryPrice, cost, proceeds, dividends, exits[]}
  // Live (Ledger): Fortsetzung aus gespeichertem Zustand - fruehere Entscheidungen werden nie neu gerechnet.
  const siOf = new Map(stocks.map((s, i) => [s.id, i]));
  let pendingIn = null;
  if (opts.state) {
    cash = opts.state.cash;
    for (const q of opts.state.positions || []) { const si = siOf.get(q.listingId); if (si === undefined) { (opts.state.missing ||= []).push(q.listingId); continue; } pos.set(si, { ...q, exits: [...(q.exits || [])] }); }
    for (const [id, px] of Object.entries(opts.state.lastPx || {})) { const si = siOf.get(id); if (si !== undefined) lastPx_init.set(si, px); }
    if (opts.state.pending) pendingIn = { sells: opts.state.pending.sells.map((o) => ({ ...o, si: siOf.get(o.listingId) })).filter((o) => o.si !== undefined), buys: opts.state.pending.buys.map((o) => ({ ...o, si: siOf.get(o.listingId) })).filter((o) => o.si !== undefined) };
  }
  const equity = [], trades = [], decisions = [], skipped = [];
  const book = { commissions: 0, dividends: 0, terminalCount: 0 };
  const cal = opts.previewOnly ? [] : calendar.filter((d) => d >= from && d <= to);
  for (const [si, px] of lastPx_init) lastPx[si] = px;
  let pending = pendingIn; // Entscheidung vom Monatsende -> Ausfuehrung zur naechsten Eroeffnung
  const value = (date) => { let mv = 0; for (const [si, q] of pos) { const i = idx[si].get(date); const px = i !== undefined ? stocks[si].bars.close[i] : lastPx[si]; mv += q.shares * (px ?? q.entryPrice); } return cash + mv; };
  const sell = (si, frac, price, date, ruleId) => {
    const q = pos.get(si); const sh = q.shares * frac; const g = sh * price, c = g * comm;
    cash += g - c; book.commissions += c; q.proceeds += g - c; q.shares -= sh; q.exits.push({ date, price, fraction: frac * q.remaining, ruleId }); q.remaining *= (1 - frac);
    if (q.shares <= 1e-9) { pos.delete(si); const pnl = q.proceeds + q.dividends - q.cost; trades.push({ id: `${stocks[si].id}:${q.entryDate}`, listingId: stocks[si].id, symbol: stocks[si].symbol, entry: { date: q.entryDate, price: q.entryPrice }, exits: q.exits, weightAtEntry: q.weightAtEntry, rankAtEntry: q.rankAtEntry, returnPct: pnl / q.cost }); }
  };
  // Monatsentscheidung mit den Schlusskursen von `date` (letzter Handelstag des Monats).
  const decide = (date, record = true) => {
    const eq = value(date);
    const si0 = spyIdx.get(date); const green = si0 !== undefined ? spyMaOk(spy, si0, p) : null;
    const sells = [], heldAfter = new Set(pos.keys());
    for (const [si, q] of pos) {
      const i = idx[si].get(date); if (i === undefined) continue;
      const m = metricsAt(stocks[si].bars, i, p); if (!m) continue;
      const w = q.shares * stocks[si].bars.close[i] / eq;
      let rule = null;
      if (v.weightRules && w < p.minWeight) rule = 'TR52-SELL-WEIGHT';
      else if (!(m.perf >= v.minPerf)) rule = 'TR52-SELL-PERF';
      else if (!m.freshHigh65) rule = 'TR52-SELL-STALE';
      else if (green === false && v.redAction === 'SELL') rule = 'TR52-SELL-MARKET';
      if (rule) { sells.push({ si, target: 0, ruleId: rule }); heldAfter.delete(si); continue; }
      if (green === false && v.redAction === 'CAP' && w > p.redCap) sells.push({ si, target: p.redCap, ruleId: 'TR52-CAP-MARKET' });
      else if (v.weightRules && w > p.maxWeight) sells.push({ si, target: p.trimTo, ruleId: 'TR52-TRIM' });
    }
    // Kandidaten: Universum = 1.800 Titel mit hoechstem 63-Tage-Umsatz (VU-Ersatz fuer Groesse)
    const rows = [];
    for (let si = 0; si < stocks.length; si++) {
      const i = idx[si].get(date); if (i === undefined) continue;
      if (stocks[si].terminal && stocks[si].terminal.kind === 'DELISTED' && stocks[si].terminal.date <= date) continue;
      if (i < p.lookback) continue;
      const b = stocks[si].bars; let dv = 0; for (let k = i - p.advDays + 1; k <= i; k++) dv += b.close[k] * (b.volume[k] || 0);
      rows.push({ si, i, adv63: dv / p.advDays });
    }
    rows.sort((a, b) => b.adv63 - a.adv63);
    const uni = rows.slice(0, opts.universeSize || p.universeSize);
    for (const r of uni) r.m = metricsAt(stocks[r.si].bars, r.i, p);
    const cands = [];
    for (const r of uni) {
      if (heldAfter.has(r.si) || !r.m) continue;
      const why = buyReasons(r.m, v, p);
      if (why.length) continue;
      const score = opts.rank === 'RS' ? (stocks[r.si].rs?.[r.i] ?? -1) : opts.rank === 'RANDOM' ? -hash(opts.seed || 1, stocks[r.si].id) : r.m.clenow ?? -Infinity;
      cands.push({ si: r.si, score, m: r.m });
    }
    cands.sort((a, b) => b.score - a.score || stocks[a.si].id.localeCompare(stocks[b.si].id));
    const free = p.slots - heldAfter.size;
    const buys = green === true ? cands.slice(0, Math.max(0, free)).map((c, k) => ({ si: c.si, rank: k + 1 })) : [];
    if (record) for (const c of (green === true ? cands.slice(Math.max(0, free)) : cands)) skipped.push({ date, listingId: stocks[c.si].id, reason: green === true ? 'NO_SLOT' : 'MARKET_FILTER', decision: true });
    const dec = { date, green, universe: uni.length, candidates: cands.length, sells: sells.map((s) => ({ listingId: stocks[s.si].id, ruleId: s.ruleId, target: s.target })), buys: buys.map((b) => ({ listingId: stocks[b.si].id, rank: b.rank })),
      top: cands.slice(0, 15).map((c, k) => ({ listingId: stocks[c.si].id, symbol: stocks[c.si].symbol, rank: k + 1, score: c.score, perf: c.m.perf, adv20: c.m.adv20, newHigh20: c.m.newHigh20, gap20: c.m.gap20 })) };
    if (record) decisions.push(dec);
    return { dec, cands, pending: { sells: sells.map((o) => ({ ...o, listingId: stocks[o.si].id })), buys: buys.map((o) => ({ ...o, listingId: stocks[o.si].id })) } };
  };
  for (let di = 0; di < cal.length; di++) {
    const date = cal[di];
    // Monatswechsel: Entscheidung mit dem Schluss des Vortags (Monatsende), Ausfuehrung zur heutigen Eroeffnung.
    const prevDate = di > 0 ? cal[di - 1] : (opts.state?.lastDate || null);
    if (prevDate && prevDate.slice(0, 7) !== date.slice(0, 7) && (!opts.startDate || prevDate >= opts.startDate)) {
      const d0 = decide(prevDate);
      pending = { sells: [...(pending?.sells || []), ...d0.pending.sells], buys: d0.pending.buys };
    }
    // Dividenden (gehalten zum Vortag)
    for (const [si, q] of pos) { const i = idx[si].get(date); const d = i !== undefined && stocks[si].divAdj ? stocks[si].divAdj[i] : 0; if (d > 0 && q.entryDate < date) { cash += q.shares * d; q.dividends += q.shares * d; book.dividends += q.shares * d; } }
    // Ausfuehrung der Monatsentscheidung zur Eroeffnung
    if (pending) {
      const eqOpen = (() => { let mv = 0; for (const [si, q] of pos) { const i = idx[si].get(date); const px = i !== undefined ? stocks[si].bars.open[i] : lastPx[si]; mv += q.shares * (px ?? q.entryPrice); } return cash + mv; })();
      const still = [];
      for (const o of pending.sells) {
        if (!pos.has(o.si)) continue;
        const i = idx[o.si].get(date); if (i === undefined) { still.push(o); continue; }
        const px = stocks[o.si].bars.open[i] * (1 - slip);
        if (o.target === 0) sell(o.si, 1, px, date, o.ruleId);
        else { const q = pos.get(o.si); const w = q.shares * stocks[o.si].bars.open[i] / eqOpen; if (w > o.target) sell(o.si, 1 - o.target / w, px, date, o.ruleId); }
      }
      for (const o of pending.buys) {
        if (pos.size >= p.slots) { skipped.push({ date, listingId: stocks[o.si].id, reason: 'NO_SLOT' }); continue; }
        const i = idx[o.si].get(date); if (i === undefined) { skipped.push({ date, listingId: stocks[o.si].id, reason: 'NO_BAR' }); continue; }
        const px = stocks[o.si].bars.open[i] * (1 + slip);
        const want = eqOpen * p.targetWeight, afford = cash / (1 + comm);
        const amt = Math.min(want, afford);
        if (amt < eqOpen * p.minWeight) { skipped.push({ date, listingId: stocks[o.si].id, reason: 'NO_CASH' }); continue; }
        const sh = amt / px, c = amt * comm; cash -= amt + c; book.commissions += c;
        pos.set(o.si, { shares: sh, entryDate: date, entryPrice: px, cost: amt + c, proceeds: 0, dividends: 0, exits: [], remaining: 1, weightAtEntry: amt / eqOpen, rankAtEntry: o.rank });
      }
      pending = still.length ? { sells: still, buys: [] } : null;
    }
    // Delisting: Rest am letzten Handelstag nach Szenario
    for (const [si] of [...pos]) { const t = stocks[si].terminal; if (t && t.kind === 'DELISTED' && t.date === date) { sell(si, 1, scen(t, slip), date, 'DELISTED'); book.terminalCount++; } }
    for (const [si] of pos) { const i = idx[si].get(date); if (i !== undefined) lastPx[si] = stocks[si].bars.close[i]; }
    const eq = value(date);
    equity.push({ date, equity: eq, exposure: eq > 0 ? (eq - cash) / eq : 0, positions: pos.size });
  }
  const openAtEnd = [...pos].map(([si, q]) => ({ listingId: stocks[si].id, symbol: stocks[si].symbol, entryDate: q.entryDate, entryPrice: q.entryPrice, shares: q.shares, remaining: q.remaining, lastPrice: lastPx[si], cost: q.cost, proceeds: q.proceeds, dividends: q.dividends, exits: q.exits, weightAtEntry: q.weightAtEntry, rankAtEntry: q.rankAtEntry }));
  const pvDate = opts.previewOnly ? to : cal[cal.length - 1];
  const preview = opts.preview && pvDate ? decide(pvDate, false) : null;
  const state = { cash, positions: [...pos].map(([si, q]) => ({ ...q, listingId: stocks[si].id, symbol: stocks[si].symbol })), lastPx: Object.fromEntries([...pos.keys()].map((si) => [stocks[si].id, lastPx[si]])),
    pending: pending ? { sells: pending.sells.map(({ si, ...o }) => ({ ...o, listingId: o.listingId || stocks[si].id })), buys: pending.buys.map(({ si, ...o }) => ({ ...o, listingId: o.listingId || stocks[si].id })) } : null, lastDate: cal[cal.length - 1] || opts.state?.lastDate || null };
  return { equity, trades, decisions, skipped, book, openAtEnd, cashEnd: cash, state, preview: preview ? { ...preview.dec, sells: preview.pending.sells, candidates: preview.cands.map((c, k) => ({ listingId: stocks[c.si].id, symbol: stocks[c.si].symbol, rank: k + 1, score: c.score, perf: c.m.perf })) } : null };
}

export default { id: 'VU_TREND_52W', version: VERSION, variant: 'VU_TREND_52W_PP', PARAMS, simulateRotation, metricsAt, clenow, buyReasons };
