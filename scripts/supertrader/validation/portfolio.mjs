// Supertrader — Validierung: Portfolio mit Gesamtrendite und Delisting-Szenarien.
//
// Entspricht engine/backtest.mjs runPortfolio (gleiche Positionsgroesse,
// gleiche Limits, gleiche Reihenfolge), erweitert um:
//  * Kommission je Seite,
//  * Dividenden (je split-bereinigter Aktie) als Barmittel, wenn die Position
//    am Vortag gehalten wurde,
//  * Abrechnung offener Positionen am Reihenende delisteter Listings nach
//    vorab registriertem Szenario (S0/S1/S2),
//  * Positionsgroesse mit dem Vortagesschluss (ohne Blick auf den Schluss des
//    Einstiegstags); sizingSameDay=true bildet runPortfolio exakt nach (C2).
//
// Ein Trade: { id, listingId, entry:{date, price}, initialStop, exits:[{date,
//   price, fraction}], terminal: null | {date, lastClose, distress, kind},
//   marks: Map(date -> close), divs: Map(date -> divAdj) }

export const SCENARIOS = Object.freeze({
  S0_LAST_PRICE: (t, slip) => t.lastClose * (1 - slip),
  S1_MINUS_30: (t) => t.lastClose * 0.7,
  S2_DISTRESS_ZERO: (t) => (t.distress ? 0 : t.lastClose * 0.7),
});

function seededKey(seed, s) {
  // FNV-1a ueber seed+Text: deterministische Zufallsreihenfolge.
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function runPortfolioTR(trades, calendar, cfg, opts = {}) {
  const scenario = opts.scenario || 'S0_LAST_PRICE';
  const comm = (opts.commissionBps ?? 1) / 10000;
  const slip = (opts.slippageBps ?? 10) / 10000;
  const withDivs = opts.dividends !== false;
  const byEntry = new Map();
  for (const tr of trades) (byEntry.get(tr.entry.date) || byEntry.set(tr.entry.date, []).get(tr.entry.date)).push(tr);
  for (const list of byEntry.values()) {
    if (opts.seed) list.sort((a, b) => seededKey(opts.seed, a.listingId) - seededKey(opts.seed, b.listingId) || a.listingId.localeCompare(b.listingId));
    // Runde 10 (PREREGISTRATION-R10-FIXES K3): Rang nach relativer Staerke am Vortag, Gleichstand alphabetisch.
    else if ((opts.priority || cfg.priority) === 'SCORE') list.sort((a, b) => (Number.isFinite(b.rankScore) ? b.rankScore : -Infinity) - (Number.isFinite(a.rankScore) ? a.rankScore : -Infinity) || a.listingId.localeCompare(b.listingId));
    else if ((opts.priority || cfg.priority) === 'RS') list.sort((a, b) => (Number.isFinite(b.rsAtEntry) ? b.rsAtEntry : -1) - (Number.isFinite(a.rsAtEntry) ? a.rsAtEntry : -1) || a.listingId.localeCompare(b.listingId));
    else list.sort((a, b) => a.listingId.localeCompare(b.listingId));
  }
  let cash = cfg.initialEquity;
  const open = [];
  const equity = [], taken = [], skipped = [];
  const book = { realized: 0, dividends: 0, commissions: 0, terminal: 0, terminalCount: 0 };
  let lastMark = new Map();
  const finishedPnl = [];
  // Runde 8 (cfg.turtleNotional, Turtle Rules Kap. 3 "Adjusting Trading Size"):
  // Groessenbasis = notionelles Konto = Kapital zum Jahresbeginn; je 10 % Verlust
  // (gegenueber dem jeweils verkleinerten Konto) -20 %, bis der Jahresstart wieder erreicht ist.
  const tn = cfg.turtleNotional || null;
  let tnYear = null, tnStart = cfg.initialEquity, tnCuts = 0;
  const tnBase = (eqNow, date) => {
    if (date.slice(0, 4) !== tnYear) { tnYear = date.slice(0, 4); tnStart = eqNow; tnCuts = 0; }
    if (eqNow >= tnStart) tnCuts = 0;
    for (;;) {
      let lossTh = 0, acct = tnStart;
      for (let j = 0; j <= tnCuts; j++) { lossTh += tn.stepLoss * acct; acct *= 1 - tn.cut; }
      if (tnStart - eqNow >= lossTh - 1e-9) tnCuts++; else break;
    }
    return tnStart * Math.pow(1 - tn.cut, tnCuts);
  };
  const markOf = (p, date) => { const v = p.tr.marks.get(date); if (Number.isFinite(v)) { p.last = v; return v; } return opts.engineCompat ? p.tr.entry.price : p.last; };
  const close = (p, q, price, date, kind) => {
    const gross = q * price, c = gross * comm;
    cash += gross - c; book.commissions += c;
    p.proceeds += gross - c; p.shares -= q;
    if (kind === 'TERMINAL') { book.terminal += gross; book.terminalCount++; }
    void date;
  };
  for (let di = 0; di < calendar.length; di++) {
    const date = calendar[di];
    // Dividenden: gehalten zum Vortagesschluss
    if (withDivs) for (const p of open) { const d = p.tr.divs.get(date); if (d > 0 && p.entryDate < date) { cash += p.shares * d; book.dividends += p.shares * d; p.dividends += p.shares * d; } }
    // Ausstiege
    for (let i = open.length - 1; i >= 0; i--) {
      const p = open[i];
      for (const x of p.tr.exits) if (x.date === date && !p.done.has(x)) {
        const q = p.shares * x.fraction / p.remainingFraction;
        close(p, q, x.price, date, 'EXIT'); p.remainingFraction -= x.fraction; p.done.add(x);
      }
      if (p.remainingFraction <= 1e-9) { finish(p); open.splice(i, 1); }
    }
    // Einstiege
    for (const tr of byEntry.get(date) || []) {
      const prevDate = calendar[di - 1];
      const mv = open.reduce((a, p) => a + p.shares * (opts.sizingSameDay ? (markOf(p, date) ?? p.tr.entry.price) : (p.prevMark ?? p.tr.entry.price)), 0);
      void prevDate;
      const eq = cash + mv;
      const risk = tr.entry.price - tr.initialStop;
      // Runde 12 (PORT-MARKET-200): keine neue Position, wenn die Marktampel am Vortag rot war.
      if (cfg.marketFilter && opts.marketOk && opts.marketOk.get(date) === false) { skipped.push({ id: tr.id, reason: 'MARKET_FILTER' }); continue; }
      if (open.length >= cfg.maxPositions || !(risk > 0)) { skipped.push({ id: tr.id, reason: open.length >= cfg.maxPositions ? 'MAX_POSITIONS' : 'NO_RISK' }); continue; }
      // Runde 7: schrittweise Exposition (cfg.progressive): nach netto negativen
      // letzten n abgeschlossenen Trades gilt das verminderte Risiko.
      let riskPct = cfg.riskPerTrade;
      if (cfg.progressive && finishedPnl.length >= cfg.progressive.lookback) {
        const lastN = finishedPnl.slice(-cfg.progressive.lookback).reduce((a, b) => a + b, 0);
        if (lastN < 0) riskPct *= cfg.progressive.factor;
      }
      let shares = ((tn ? tnBase(equity.length ? equity[equity.length - 1].equity : cfg.initialEquity, date) : eq) * riskPct) / risk;
      const unit = tr.entry.price * (1 + comm);
      shares = Math.min(shares, (eq * cfg.maxPositionPct) / tr.entry.price, cash / unit);
      shares = Math.min(shares, Math.max(0, eq * cfg.maxExposure - (eq - cash)) / tr.entry.price);
      if (!(shares > 0)) { skipped.push({ id: tr.id, reason: 'NO_CASH' }); continue; }
      const gross = shares * tr.entry.price, c = gross * comm;
      cash -= gross + c; book.commissions += c;
      const p = { tr, shares, entryShares: shares, eqAtEntry: eq, cost: gross + c, proceeds: 0, dividends: 0, remainingFraction: 1, done: new Set(), entryDate: date, last: tr.entry.price, prevMark: null };
      open.push(p); taken.push(p);
      for (const x of tr.exits) if (x.date === date && !p.done.has(x)) {
        const q = p.shares * x.fraction / p.remainingFraction;
        close(p, q, x.price, date, 'EXIT'); p.remainingFraction -= x.fraction; p.done.add(x);
      }
      if (p.remainingFraction <= 1e-9) { finish(p); open.pop(); }
    }
    // Delisting: offene Rest-Position am letzten Handelstag nach Szenario abrechnen
    for (let i = open.length - 1; i >= 0; i--) {
      const p = open[i], t = p.tr.terminal;
      if (t && t.date === date && t.kind === 'DELISTED') {
        const px = SCENARIOS[scenario](t, slip);
        close(p, p.shares, px, date, 'TERMINAL'); p.remainingFraction = 0; p.terminalPrice = px;
        finish(p); open.splice(i, 1);
      }
    }
    const mv = open.reduce((a, p) => a + p.shares * (markOf(p, date) ?? p.tr.entry.price), 0);
    for (const p of open) p.prevMark = markOf(p, date);
    equity.push({ date, equity: cash + mv, exposure: (cash + mv) > 0 ? mv / (cash + mv) : 0 });
  }
  // Am Fensterende offene Positionen: Marktwert (OPEN_AT_END)
  const openAtEnd = open.map((p) => ({ id: p.tr.id, value: p.shares * (p.last ?? p.tr.entry.price) }));
  function finish(p) {
    p.pnl = p.proceeds + p.dividends - p.cost;
    finishedPnl.push(p.pnl);
    p.returnPct = p.pnl / p.cost;
    book.realized += p.proceeds - p.cost;
  }
  void lastMark;
  return { equity, taken, skipped, book, openAtEnd, cashEnd: cash };
}

// C1: Endwert = Start + realisierte Ergebnisse + Dividenden + offener Marktwert
// (Kommissionen stecken in den realisierten Ergebnissen).
export function reconcile(run, cfg) {
  const openCost = run.taken.filter((p) => p.pnl === undefined).reduce((a, p) => a + p.cost - p.proceeds, 0);
  const openValue = run.openAtEnd.reduce((a, o) => a + o.value, 0);
  const expected = cfg.initialEquity + run.book.realized + run.book.dividends - openCost + openValue;
  const end = run.equity[run.equity.length - 1].equity;
  return { end, expected, relDiff: Math.abs(end / expected - 1) };
}

// Jahres-/Teilzeitraum-CAGR aus einer Kurve [{date, equity|value}].
export function cagrBetween(curve, from, to, key = 'equity') {
  const pts = curve.filter((p) => p.date >= from && p.date <= to);
  if (pts.length < 2) return null;
  // Startwert: letzter Punkt vor dem Zeitraum, falls vorhanden
  const before = curve.filter((p) => p.date < from);
  const a = before.length ? before[before.length - 1] : pts[0], b = pts[pts.length - 1];
  const yrs = (Date.parse(b.date) - Date.parse(a.date)) / (365.25 * 864e5);
  return yrs > 0 ? (b[key] / a[key]) ** (1 / yrs) - 1 : null;
}

export function maxDrawdown(curve, key = 'equity') {
  let peak = -Infinity, mdd = 0;
  for (const p of curve) { peak = Math.max(peak, p[key]); mdd = Math.min(mdd, p[key] / peak - 1); }
  return mdd;
}
