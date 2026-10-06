// Minervini Canonical Replication – eigene Portfolio-Simulation (keine gemeinsame VU-Portfolio-Logik).
//
// Bewusst NICHT verwendet: engine/simulator.mjs (5-Sitzungen-Sperre, Schlussbestaetigung, ein Signal je Titel
// blockiert ohne Portfolioplatz) und validation/portfolio.mjs#runPortfolioTR (Gleichtagsfinanzierung,
// alphabetischer Gleichstand, stille Defaults). Siehe Regelbuch legacyDisposition.
//
// Tagesablauf fuer Handelstag d (MR-EXE-01):
//  1. Stand zum Schluss d-1: Kapital, Positionswert, Bargeld, Exposure-Obergrenze (MR-PF-02).
//  2. Orders aus den Setups vom Schluss d-1 reihen (MR-PF-06) und reservieren (MR-SIZ-01/02, MR-PF-01).
//  3. Bestehende Positionen auf Balken d (MinerviniReplicationExitPolicy). Erloese finanzieren erst ab d+1.
//  4. Reservierte Orders: Kauf-Stop am Pivot, ausgeloest bei high[d] > Pivot (MR-ENT-01).
//  5. Schluss d: Dividenden, Stop-Nachzug, Delisting (letzter Kurs), Bewertung.
import { requireP } from './trend-template.mjs';
import { openPosition, stepBar, endOfDay } from './exit-policy.mjs';
import { exposureCeiling, rankOrders, reserveOrders, wholeShares } from './portfolio-policy.mjs';

// segment: {id, date[], open[], high[], low[], close[], rawClose[], volume[], volAvg[], divAdj[], delisted, setups: Map(localIdx -> setup)}
// rawClose dient nur der Stueckelung in ganze echte Aktien (unit = close / rawClose).
// setup:   {pivot, stop, stopPct, baseStart, rsScore, rsPct, sepa, vcp}
export function simulatePortfolio(segments, calendar, P, { recordSkipped = false } = {}) {
  requireP(P);
  const slip = P['exe.slippageBps'] / 1e4, comm = P['exe.commissionBps'] / 1e4;
  const segById = new Map(segments.map((s) => [s.id, s]));
  const idxOf = new Map(segments.map((s) => [s.id, new Map(s.date.map((d, i) => [d, i]))]));
  // Orders je Handelstag: Setup am lokalen Index j -> Order am Balken j+1.
  const ordersByDay = new Map();
  for (const s of segments) for (const [j, setup] of s.setups) {
    if (j + 1 >= s.date.length) continue;
    const d = s.date[j + 1];
    if (!(s.rawClose[j] > 0) || !(s.close[j] > 0)) continue;
    (ordersByDay.get(d) || ordersByDay.set(d, []).get(d)).push({ segId: s.id, setupIndex: j, unit: s.close[j] / s.rawClose[j], ...setup });
  }
  let cash = P['pf.initialEquity'];
  const positions = new Map(), lastExit = new Map(), lastClose = new Map();
  let lastClosedPnl = null;
  const trades = [], curve = [], skipped = [];
  const book = { commissions: 0, dividends: 0, reservedNotFilled: 0, filled: 0, reservedTotal: 0, ordersSeen: 0 };

  const closeTrade = (pos, seg, date, kind) => {
    const pnl = pos.proceeds + pos.dividends - pos.cost - pos.commissions;
    const t = {
      segId: seg.id, entryDate: pos.entryDate, entryPrice: pos.fillPrice, entryBase: pos.entry, shares0: pos.shares0, initialStop: pos.initialStop, R: pos.R,
      exits: pos.exits, exitDate: date, kind, pnl, returnPct: pnl / pos.cost, rMultiple: pnl / (pos.shares0 * pos.R),
      holdSessions: idxOf.get(seg.id).get(date) - pos.entryIndex,
      mfe: pos.maxHigh / pos.entry - 1, mae: pos.minLow / pos.entry - 1,
      setup: pos.setupInfo,
    };
    trades.push(t);
    return t;
  };
  const sell = (pos, seg, f, date) => {
    const px = f.price * (1 - slip), gross = px * f.shares, c = gross * comm;
    cash += gross - c; book.commissions += c;
    pos.proceeds += gross; pos.commissions += c;
    pos.exits.push({ date, price: px, shares: f.shares, ruleId: f.ruleId, basis: f.basis });
  };

  for (const D of calendar) {
    // 1. Stand zum Vortagesschluss
    let openValue = 0;
    for (const [id, pos] of positions) openValue += pos.shares * lastClose.get(id);
    const equity = cash + openValue;
    const ceiling = exposureCeiling(lastClosedPnl, P);
    // 2. Orders reihen und reservieren
    const cand = (ordersByDay.get(D) || []).filter((o) => {
      if (positions.has(o.segId)) return false;
      const le = lastExit.get(o.segId);
      return le === undefined || o.baseStart > le; // MR-RE-01: neue Basis nach dem Ausstieg
    });
    book.ordersSeen += cand.length;
    const reserved = reserveOrders(rankOrders(cand), { equity, openValue, openCount: positions.size, cash, ceiling }, P);
    book.reservedTotal += reserved.length;
    if (recordSkipped) for (const o of cand) if (!reserved.some((r) => r.order === o)) skipped.push({ date: D, segId: o.segId });
    // 3. Bestehende Positionen
    const closedToday = [];
    for (const [id, pos] of [...positions]) {
      const seg = segById.get(id), i = idxOf.get(id).get(D);
      if (i === undefined) continue;
      for (const f of stepBar(pos, { open: seg.open[i], high: seg.high[i], low: seg.low[i] }, P)) sell(pos, seg, f, D);
      if (pos.shares === 0) { positions.delete(id); lastExit.set(id, i); closedToday.push(closeTrade(pos, seg, D, 'EXIT')); }
    }
    // 4. Kauf-Stop-Orders (Budget = Bargeld zum Vortagesschluss abzueglich frueherer Kaeufe dieses Tages)
    let budget = equity - openValue; // = Bargeld am Tagesbeginn; Verkaufserloese von heute zaehlen nicht
    for (const r of reserved) {
      const seg = segById.get(r.order.segId), i = idxOf.get(seg.id).get(D);
      const o = r.order;
      if (!(seg.high[i] > o.pivot)) { book.reservedNotFilled++; continue; }
      const base = Math.max(seg.open[i], o.pivot);
      const px = base * (1 + slip);
      let shares = r.shares;
      if (shares * px * (1 + comm) > budget) shares = wholeShares(budget / (px * (1 + comm)), o.unit);
      if (!(shares > 0)) { book.reservedNotFilled++; continue; }
      const cost = shares * px, c = cost * comm;
      cash -= cost + c; budget -= cost + c; book.commissions += c; book.filled++;
      const pos = openPosition({ fillBase: base, technicalStop: o.stop, shares, entryIndex: i, shareUnit: o.unit }, P);
      Object.assign(pos, { entryDate: D, fillPrice: px, cost, commissions: c, proceeds: 0, dividends: 0, exits: [],
        setupInfo: { setupDate: seg.date[o.setupIndex], pivot: o.pivot, technicalStop: o.stop, stopPct: o.stopPct, rsPct: o.rsPct, rsScore: o.rsScore,
          breakoutVolumeRatio: Number.isFinite(seg.volume?.[i]) && seg.volAvg?.[i - 1] > 0 ? seg.volume[i] / seg.volAvg[i - 1] : null, // MR-ENT-02: nur Protokoll
          contractions: o.vcp?.contractions?.length ?? null, baseLength: o.vcp?.baseLength ?? null, baseDepthClass: o.vcp?.baseDepthClass ?? null,
          sepa: o.sepa || null } });
      for (const f of stepBar(pos, { open: seg.open[i], high: seg.high[i], low: seg.low[i] }, P, { entryDay: true })) sell(pos, seg, f, D);
      if (pos.shares === 0) { lastExit.set(seg.id, i); closedToday.push(closeTrade(pos, seg, D, 'EXIT')); } else positions.set(seg.id, pos);
    }
    // 5. Schluss
    for (const [id, pos] of [...positions]) {
      const seg = segById.get(id), i = idxOf.get(id).get(D);
      if (i === undefined) continue;
      const div = seg.divAdj?.[i];
      if (div > 0) { cash += div * pos.shares; pos.dividends += div * pos.shares; book.dividends += div * pos.shares; }
      endOfDay(pos, seg.close[i], P);
      if (seg.delisted && i === seg.date.length - 1) { // MR-EXE-04: Delisting zum letzten Schluss
        sell(pos, seg, { price: seg.close[i], shares: pos.shares, ruleId: 'MR-EXE-04-DELIST', basis: 'LAST_CLOSE' }, D);
        pos.shares = 0; positions.delete(id); lastExit.set(id, i); closedToday.push(closeTrade(pos, seg, D, 'DELISTED'));
      }
    }
    for (const [id] of positions) { const i = idxOf.get(id).get(D); if (i !== undefined) lastClose.set(id, segById.get(id).close[i]); }
    for (const t of closedToday) if (!positions.has(t.segId)) lastClose.delete(t.segId);
    // Rueckmeldung fuer MR-PF-02: Ergebnis des letzten Abschlusstags (bei mehreren Abschluessen die Summe).
    if (closedToday.length) lastClosedPnl = closedToday.reduce((s, t) => s + t.pnl, 0);
    let posValue = 0;
    for (const [id, pos] of positions) posValue += pos.shares * lastClose.get(id);
    curve.push({ date: D, equity: cash + posValue, cash, exposure: posValue / (cash + posValue), positions: positions.size, ceiling });
  }
  // Offene Positionen am Ende: zum letzten Schluss bewertet, als OPEN_AT_END ausgewiesen (keine Kosten).
  const end = calendar[calendar.length - 1];
  for (const [id, pos] of positions) {
    const seg = segById.get(id), px = lastClose.get(id);
    pos.proceeds += px * pos.shares;
    pos.exits.push({ date: end, price: px, shares: pos.shares, ruleId: 'OPEN_AT_END_MARK', basis: 'CLOSE' });
    const lastIdx = [...idxOf.get(id).entries()].filter(([d]) => d <= end).at(-1)[0];
    closeTrade(pos, seg, lastIdx, 'OPEN_AT_END');
  }
  return { curve, trades, book, skipped };
}

// Signalqualitaet ohne Portfolio (alle ausgeloesten Setups, je Titel unabhaengig, gleiche Ausstiegsregeln).
// Rechnet mit einer festen Messstueckzahl (nur damit der Teilverkauf ganzzahlig ist; keine Strategiezahl)
// und mit Basispreisen ohne Kosten; Kosten wirken nur im Portfolio.
const SIGNAL_MEASUREMENT_SHARES = 1000;
export function simulateSignals(segment, P) {
  requireP(P);
  const s = segment, out = [];
  let pos = null, lastExitIdx;
  for (let i = 1; i < s.date.length; i++) {
    if (pos) {
      const fills = stepBar(pos, { open: s.open[i], high: s.high[i], low: s.low[i] }, P);
      for (const f of fills) pos.exits.push({ i, price: f.price, shares: f.shares, ruleId: f.ruleId });
      if (pos.shares > 0) {
        endOfDay(pos, s.close[i], P);
        if (s.delisted && i === s.date.length - 1) { pos.exits.push({ i, price: s.close[i], shares: pos.shares, ruleId: 'MR-EXE-04-DELIST' }); pos.shares = 0; }
      }
      if (pos.shares === 0) { out.push(finishSignal(pos, s, i, false)); lastExitIdx = i; pos = null; }
      continue;
    }
    const setup = s.setups.get(i - 1);
    if (!setup || (lastExitIdx !== undefined && !(setup.baseStart > lastExitIdx))) continue;
    if (!(s.high[i] > setup.pivot)) continue;
    const base = Math.max(s.open[i], setup.pivot);
    pos = openPosition({ fillBase: base, technicalStop: setup.stop, shares: SIGNAL_MEASUREMENT_SHARES, entryIndex: i, shareUnit: 1 }, P);
    pos.exits = [];
    pos.setup = setup;
    for (const f of stepBar(pos, { open: s.open[i], high: s.high[i], low: s.low[i] }, P, { entryDay: true })) pos.exits.push({ i, price: f.price, shares: f.shares, ruleId: f.ruleId });
    if (pos.shares > 0) endOfDay(pos, s.close[i], P);
    else { out.push(finishSignal(pos, s, i, false)); lastExitIdx = i; pos = null; }
  }
  if (pos) { const i = s.date.length - 1; pos.exits.push({ i, price: s.close[i], shares: pos.shares, ruleId: 'OPEN_AT_END_MARK' }); out.push(finishSignal(pos, s, i, true)); }
  return out;
}

function finishSignal(pos, s, i, open) {
  const proceeds = pos.exits.reduce((a, x) => a + x.price * x.shares, 0);
  const ret = proceeds / (pos.entry * pos.shares0) - 1;
  return { segId: s.id, entryDate: s.date[pos.entryIndex], exitDate: s.date[i], entryIndex: pos.entryIndex, exitIndex: i, returnPct: ret, rMultiple: (ret * pos.entry) / pos.R,
    mfe: pos.maxHigh / pos.entry - 1, mae: pos.minLow / pos.entry - 1, open, exits: pos.exits.map((x) => x.ruleId) };
}
