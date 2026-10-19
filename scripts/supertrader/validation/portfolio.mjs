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
//
// opts.accounting === 'RESEARCH_V1' (Foundation Repair, accounting-contract.mjs) schaltet
// die korrigierte Research-Abrechnung ein (A4 Stale-Grenze, A5 kausale Terminals und
// Datenereignisse ohne Pauschalabschlag, A8 wertbewusster Dust und exakter Schlussverkauf,
// Orders nur auf realen Quellbalken, Ledger). Ohne die Option laeuft der Legacy-Pfad
// unveraendert (eingefrorene Runden, Live-Modellportfolio).
import * as AC from './accounting-contract.mjs';

export const SCENARIOS = Object.freeze({
  S0_LAST_PRICE: (t, slip) => t.lastClose * (1 - slip),
  S1_MINUS_30: (t) => t.lastClose * 0.7,
  S2_DISTRESS_ZERO: (t) => (t.distress ? 0 : t.lastClose * 0.7),
  // Runde 13 (PREREGISTRATION-R13-AUDIT D): Uebernahmen laut SEC-Einreichungen zum letzten Kurs.
  S1C_CLASSIFIED: (t, slip) => (t.delistClass === 'ACQUISITION' ? t.lastClose * (1 - slip) : t.lastClose * 0.7),
  S2C_CLASSIFIED: (t, slip) => (t.delistClass === 'ACQUISITION' ? t.lastClose * (1 - slip) : t.distress ? 0 : t.lastClose * 0.7),
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
    // Runde 14 (C7): umgekehrt alphabetisch als Gegenprobe auf Reihenfolge-/Alphabet-Bias.
    else if ((opts.priority || cfg.priority) === 'RALPHA') list.sort((a, b) => b.listingId.localeCompare(a.listingId));
    else list.sort((a, b) => a.listingId.localeCompare(b.listingId));
  }
  let cash = cfg.initialEquity;
  const open = [];
  const equity = [], taken = [], skipped = [];
  const book = { realized: 0, dividends: 0, commissions: 0, terminal: 0, terminalCount: 0 };
  let lastMark = new Map();
  // RESEARCH_V1: Abrechnungsvertrag, Stale-Zaehler, Ledger, Dust-Abschreibungen, Ablehnungen.
  const rv1 = opts.accounting === AC.RESEARCH_ACCOUNTING_MODE;
  if (opts.accounting && !rv1) throw new Error('UNKNOWN_ACCOUNTING_MODE');
  const dataFactor = rv1 ? AC.dataEventFactor(opts.dataEventScenario) : 1;
  const tracker = rv1 ? AC.createStaleTracker() : null;
  const ledger = [], dustWriteOffs = [], rejections = [], cashPrecisionCorrections = [];
  let grossFlows = 0, minCash = cash, ignoredExitsAfterSettlement = 0;
  const causalQ = new Map();
  if (rv1) for (const tr of trades) if (tr.terminal?.kind === 'DATA_QUARANTINE') causalQ.set(tr, AC.causalTerminalDate(calendar, { from: tr.terminal.from ?? tr.terminal.date, observedAt: tr.terminal.observedAt }));
  const isEconomicTerminal = (t) => t && t.kind === 'DELISTED' && !(rv1 && AC.isDataEvent(t.cause));
  const book1 = (row) => { if (rv1) { ledger.push(row); grossFlows += Math.abs(row.gross || 0) + Math.abs(row.fee || 0); } };
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
      // Runde 14: Die Schwellen summieren sich zu stepLoss/cut (50 %) des Jahresstarts; bei groesserem Verlust
      // endete die Schleife nie (Holdout 2008). Nach 60 Kuerzungen ist das notionelle Konto praktisch null (0,8^60).
      if (tnStart - eqNow >= lossTh - 1e-9 && tnCuts < 60) tnCuts++; else break;
    }
    return tnStart * Math.pow(1 - tn.cut, tnCuts);
  };
  const markOf = (p, date) => { const v = p.tr.marks.get(date); if (Number.isFinite(v)) { p.last = v; return v; } return opts.engineCompat ? p.tr.entry.price : p.last; };
  const close = (p, q, price, date, kind, reason) => {
    const gross = q * price, c = gross * comm;
    cash += gross - c; book.commissions += c;
    p.proceeds += gross - c; p.shares -= q;
    if (kind === 'TERMINAL') { book.terminal += gross; book.terminalCount++; }
    book1({ date, id: p.tr.id, side: kind === 'EXIT' ? 'SELL' : kind, shares: q, price, gross, fee: c, reason: reason || kind });
    if (rv1) { if (p.shares < 0) throw new Error('ACCOUNTING_NEGATIVE_SHARES'); minCash = Math.min(minCash, cash); }
    void date;
  };
  // RESEARCH_V1: Verkauf nur auf realem Quellbalken, exakter Schlussverkauf, wertbewusster Dust.
  // OPEN_AT_END_MARK ist eine Bewertung, keine Order (Reihenende ist am letzten Balken nicht bekannt).
  const exitsV1 = (p, date) => {
    for (const x of p.tr.exits) if (x.date === date && !p.done.has(x)) {
      p.done.add(x);
      if (x.ruleId === 'OPEN_AT_END_MARK') { p.endMark = x; continue; }
      if (!AC.isExecutableBar({ open: p.tr.marks.get(date) })) { rejections.push({ id: p.tr.id, date, reason: 'EXIT_WITHOUT_SOURCE_BAR', ruleId: x.ruleId }); continue; }
      const q = AC.sellQuantity(p.shares, x.fraction, p.remainingFraction);
      close(p, q, x.price, date, 'EXIT', x.ruleId); p.remainingFraction -= x.fraction;
      if (p.shares === 0) { p.remainingFraction = 0; break; }
      const d = AC.dustDecision(p.shares, p.tr.marks.get(date));
      if (d.action === 'WRITE_OFF') {
        dustWriteOffs.push({ id: p.tr.id, date, shares: p.shares, markValue: d.value, residualFraction: p.remainingFraction });
        book1({ date, id: p.tr.id, side: 'DUST_WRITE_OFF', shares: p.shares, price: p.tr.marks.get(date), gross: 0, fee: 0, value: d.value, reason: 'BELOW_DUST_VALUE_LIMIT' });
        if (dustWriteOffs.reduce((a, w) => a + w.markValue, 0) > AC.POLICY.dustBookValueCap) throw new Error('DUST_BOOK_VALUE_CAP_EXCEEDED');
        p.shares = 0; p.remainingFraction = 0; break;
      }
    }
    return p.remainingFraction <= 1e-9 || p.shares === 0;
  };
  // RESEARCH_V1: Abrechnung eines Datenereignisses zum letzten gueltigen Schluss (Settlement, keine Order).
  const settleV1 = (p, date, kind, lastClose) => {
    const px = lastClose * dataFactor * (1 - slip);
    close(p, p.shares, px, date, 'SETTLE', kind); p.remainingFraction = 0; p.terminalPrice = px;
    p.settlement = { date, kind, lastClose, factor: dataFactor, ignoredExits: p.tr.exits.filter((x) => !p.done.has(x) && x.ruleId !== 'OPEN_AT_END_MARK').length };
    ignoredExitsAfterSettlement += p.settlement.ignoredExits;
    tracker.forget(p.tr.id);
  };
  for (let di = 0; di < calendar.length; di++) {
    const date = calendar[di];
    // Dividenden: gehalten zum Vortagesschluss
    if (withDivs) for (const p of open) { const d = p.tr.divs.get(date); if (d > 0 && p.entryDate < date) { cash += p.shares * d; book.dividends += p.shares * d; p.dividends += p.shares * d; book1({ date, id: p.tr.id, side: 'DIVIDEND', shares: p.shares, price: d, gross: p.shares * d, fee: 0, reason: 'EX_DATE_HELD_PREVIOUS_CLOSE' }); } }
    // Ausstiege
    for (let i = open.length - 1; i >= 0; i--) {
      const p = open[i];
      if (rv1) { if (exitsV1(p, date)) { finish(p); open.splice(i, 1); } continue; }
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
      if (cfg.marketFilter && opts.marketOk && opts.marketOk.get(date) === false) { skipped.push({ id: tr.id, reason: 'MARKET_FILTER', date }); continue; }
      if (open.length >= cfg.maxPositions || !(risk > 0)) { skipped.push({ id: tr.id, reason: open.length >= cfg.maxPositions ? 'MAX_POSITIONS' : 'NO_RISK', date }); continue; }
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
      if (!(shares > 0)) { skipped.push({ id: tr.id, reason: 'NO_CASH', date }); continue; }
      if (rv1 && !(shares * tr.entry.price > AC.POLICY.minOrderValue)) { skipped.push({ id: tr.id, reason: 'BELOW_MIN_ORDER_VALUE', date }); continue; }
      if (rv1 && !AC.isExecutableBar({ open: tr.marks.get(date) })) { skipped.push({ id: tr.id, reason: 'ENTRY_WITHOUT_SOURCE_BAR', date }); continue; }
      const gross = shares * tr.entry.price, c = gross * comm;
      cash -= gross + c; book.commissions += c;
      const p = { tr, shares, entryShares: shares, eqAtEntry: eq, cost: gross + c, proceeds: 0, dividends: 0, remainingFraction: 1, done: new Set(), entryDate: date, last: tr.entry.price, prevMark: null };
      open.push(p); taken.push(p);
      book1({ date, id: tr.id, side: 'BUY', shares, price: tr.entry.price, gross, fee: c, reason: 'ENTRY' });
      if (rv1) {
        // binary64-Rundung des Sizings (cash / unit): innerhalb der Toleranz auf 0 gesetzt und protokolliert (wie V4 guardedNumericCash).
        if (cash < -AC.reconciliationTolerance(grossFlows, cfg.initialEquity)) throw new Error('ACCOUNTING_NEGATIVE_CASH');
        if (cash < 0) { cashPrecisionCorrections.push({ date, id: tr.id, residual: cash }); cash = 0; }
        minCash = Math.min(minCash, cash); if (exitsV1(p, date)) { finish(p); open.pop(); } continue;
      }
      for (const x of tr.exits) if (x.date === date && !p.done.has(x)) {
        const q = p.shares * x.fraction / p.remainingFraction;
        close(p, q, x.price, date, 'EXIT'); p.remainingFraction -= x.fraction; p.done.add(x);
      }
      if (p.remainingFraction <= 1e-9) { finish(p); open.pop(); }
    }
    // Delisting: offene Rest-Position am letzten Handelstag nach Szenario abrechnen
    for (let i = open.length - 1; i >= 0; i--) {
      const p = open[i], t = p.tr.terminal;
      if (t && t.date === date && isEconomicTerminal(t)) {
        const px = SCENARIOS[scenario](t, slip);
        close(p, p.shares, px, date, 'TERMINAL'); p.remainingFraction = 0; p.terminalPrice = px;
        finish(p); open.splice(i, 1);
      } else if (rv1 && causalQ.get(p.tr) === date) {
        // A5: Quarantaene erst ab max(from, observedAt) gebucht, Datenereignis-Faktor.
        settleV1(p, date, 'DATA_QUARANTINE', t.lastClose ?? p.last); finish(p); open.splice(i, 1);
      }
    }
    // A4: hoechstens STALE_CARRY_MAX_SESSIONS Sitzungen zum letzten Schluss, dann SECURITY_UNAVAILABLE.
    if (rv1) {
      const bars = new Map();
      for (const p of open) { const v = p.tr.marks.get(date); if (Number.isFinite(v)) bars.set(p.tr.id, { close: v, volume: p.tr.volumes?.get(date) }); }
      const over = new Set(tracker.observe(open.map((p) => p.tr.id), bars));
      for (let i = open.length - 1; i >= 0; i--) if (over.has(open[i].tr.id)) { const p = open[i]; settleV1(p, date, 'SECURITY_UNAVAILABLE', p.last); tracker.counts.unavailableSettlements++; finish(p); open.splice(i, 1); }
    }
    const mv = open.reduce((a, p) => a + p.shares * (markOf(p, date) ?? p.tr.entry.price), 0);
    for (const p of open) p.prevMark = markOf(p, date);
    equity.push({ date, equity: cash + mv, exposure: (cash + mv) > 0 ? mv / (cash + mv) : 0, n: open.length, ...(rv1 ? { stale: open.filter((p) => tracker.staleSessions(p.tr.id) > 0).length } : {}) }); // n: Runde 14 (Positionszahl je Tag)
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
  if (!rv1) return { equity, taken, skipped, book, openAtEnd, cashEnd: cash };
  return { equity, taken, skipped, book, openAtEnd, cashEnd: cash, accounting: AC.describeContract(), ledger, dustWriteOffs, rejections, cashPrecisionCorrections, minCash, grossFlows,
    staleCounts: { ...tracker.counts }, ignoredExitsAfterSettlement, endingPositionCheck: AC.endingPositionCheck(open.map((p) => p.tr.id), tracker), dataEventScenario: opts.dataEventScenario || AC.POLICY.dataEventScenarios.baseline };
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

// RESEARCH_V1: Erhaltungsnachweis aus dem Ledger. Drei unabhaengige Identitaeten plus harte Grenzen:
//  Bargeld = Start - Kaeufe - Gebuehren + Verkaeufe/Settlements + Dividenden (nur aus Ledger-Zeilen),
//  Endwert = Bargeld + offener Marktwert, Endwert = Start + realisiert + Dividenden - offene Kosten + offener Wert.
export function reconcileResearch(run, cfg) {
  if (!run.ledger) throw new Error('RESEARCH_V1_RUN_REQUIRED');
  let ledgerCash = cfg.initialEquity;
  for (const r of run.ledger) {
    if (r.side === 'BUY') ledgerCash -= r.gross + r.fee;
    else if (r.side === 'SELL' || r.side === 'SETTLE' || r.side === 'TERMINAL') ledgerCash += r.gross - r.fee;
    else if (r.side === 'DIVIDEND') ledgerCash += r.gross;
  }
  for (const c of run.cashPrecisionCorrections) ledgerCash -= c.residual;
  const tol = AC.reconciliationTolerance(run.grossFlows, cfg.initialEquity);
  const end = run.equity[run.equity.length - 1].equity;
  const openValue = run.openAtEnd.reduce((a, o) => a + o.value, 0);
  const pnl = reconcile(run, cfg);
  const dust = run.dustWriteOffs.reduce((a, w) => a + w.markValue, 0);
  const checks = {
    cashFromLedger: Math.abs(ledgerCash - run.cashEnd) <= tol,
    equityIsCashPlusOpen: Math.abs(end - (run.cashEnd + openValue)) <= tol,
    pnlIdentity: Math.abs(end - pnl.expected) <= tol,
    noNegativeCash: run.minCash >= -tol,
    noNegativeShares: run.taken.every((p) => p.shares >= 0),
    dustWithinCap: dust <= AC.POLICY.dustBookValueCap,
    endingFreshness: run.endingPositionCheck.status === 'PASS',
  };
  return { pass: Object.values(checks).every(Boolean), checks, tolerance: tol, ledgerCash, cashEnd: run.cashEnd, end, expected: pnl.expected, dustValue: dust, dustCount: run.dustWriteOffs.length };
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

// Runde 12 (PORT-MARKET-200): SPY ueber GD 200 am Vortag je Handelstag (Marktampel).
export function marketOkMap(spyAdj, days = 200) {
  const out = new Map(); let sum = 0; const d = spyAdj.date, c = spyAdj.close;
  for (let i = 0; i < d.length; i++) {
    sum += c[i]; if (i >= days) sum -= c[i - days];
    if (i + 1 < d.length) out.set(d[i + 1], i >= days - 1 ? c[i] > sum / days : null);
  }
  return out;
}
