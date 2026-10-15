/**
 * V4.1 (review R6): independent replay of the Turtle engine ledger. The Turtle stop-trigger fills do not run on
 * accounting-v4, so this second code path re-derives cash, holdings, dividends and the daily equity curve from the
 * fill ledger and the source bars, and compares with the engine. It does not validate the fill model itself
 * (that stays MEASUREMENT_PARTIAL: no external oracle for intrabar fills); it proves the bookkeeping.
 */
export function replayTurtleLedger(run, data, { relativeTolerance = 1e-9 } = {}) {
  const byId = new Map(data.securities.map((s) => [s.id, s]));
  const ledgerByDate = new Map();
  for (const e of run.ledger) { if (!ledgerByDate.has(e.date)) ledgerByDate.set(e.date, []); ledgerByDate.get(e.date).push(e); }
  const holdings = new Map(), lastClose = new Map();
  let cash = run.initialCapital, dividends = 0, recomputedDividends = 0, worst = 0, failures = 0, negativeCash = 0;
  const cursor = new Map();
  const barOn = (id, date) => {
    const bars = byId.get(id).bars; let i = cursor.get(id) ?? 0;
    while (i < bars.length && bars[i].date < date) i++;
    cursor.set(id, i);
    return bars[i]?.date === date ? bars[i] : null;
  };
  for (const point of run.curve) {
    const date = point.date;
    // dividends of positions held from earlier sessions (independently recomputed from the bars)
    for (const [id, sh] of holdings) { const b = barOn(id, date); if (b && b.dividend > 0) recomputedDividends += sh * b.dividend; }
    for (const e of ledgerByDate.get(date) ?? []) {
      if (e.side === 'DIVIDEND') { cash += e.amount; dividends += e.amount; continue; }
      if (e.side === 'BUY') { cash -= e.shares * e.price + e.fee; holdings.set(e.id, (holdings.get(e.id) ?? 0) + e.shares); }
      else { cash += e.shares * e.price - e.fee; const left = (holdings.get(e.id) ?? 0) - e.shares; if (Math.abs(left) <= 1e-9 * e.shares) holdings.delete(e.id); else holdings.set(e.id, left); }
    }
    if (cash < -1e-6) negativeCash++;
    let mv = 0;
    for (const [id, sh] of holdings) { const b = barOn(id, date); if (b) lastClose.set(id, b.close); mv += sh * (lastClose.get(id) ?? 0); }
    const equity = cash + mv, diff = Math.abs(equity - point.equity) / Math.max(1, Math.abs(point.equity));
    worst = Math.max(worst, diff); if (diff > relativeTolerance) failures++;
  }
  const dividendDiff = Math.abs(recomputedDividends - dividends);
  const pass = failures === 0 && negativeCash === 0 && dividendDiff <= Math.max(1e-6, 1e-9 * dividends);
  return { id: 'V4-TURTLE-LEDGER-REPLAY', hard: true, status: pass ? 'PASS' : 'FAIL', points: run.curve.length, failingPoints: failures, worstRelativeDifference: worst, negativeCashPoints: negativeCash, bookedDividends: dividends, recomputedDividends, measurementScope: 'BOOKKEEPING_ONLY_FILL_MODEL_NOT_EXTERNALLY_CALIBRATED' };
}
