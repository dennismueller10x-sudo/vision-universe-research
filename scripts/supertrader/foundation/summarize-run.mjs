// Supertrader Foundation — kanonische, vergleichbare Zusammenfassung eines runPortfolioTR-Laufs.
// Gleiche Form fuer Legacy und RESEARCH_V1, damit Vorher/Nachher feldweise verglichen werden kann.
const r = (v) => (Number.isFinite(v) ? Math.round(v * 1e8) / 1e8 + 0 : v);

export function summarizeRun(run, cfg) {
  const last = run.equity[run.equity.length - 1];
  const taken = run.taken.map((p) => ({
    id: p.tr.id, entryShares: p.entryShares, sharesLeft: p.shares, cost: r(p.cost), proceeds: r(p.proceeds), dividends: r(p.dividends),
    pnl: p.pnl === undefined ? null : r(p.pnl), closed: p.pnl !== undefined, settlement: p.settlement || null, terminalPrice: p.terminalPrice ?? null,
  }));
  const openValue = run.openAtEnd.reduce((a, o) => a + o.value, 0);
  return {
    finalEquity: r(last.equity), cashEnd: r(run.cashEnd), openValueEnd: r(openValue), minCash: r(run.minCash ?? null),
    equityCurve: run.equity.map((p) => r(p.equity)), exposureEnd: r(last.exposure), positionsEnd: last.n,
    taken, skipped: run.skipped.map((s) => s.reason),
    book: Object.fromEntries(Object.entries(run.book).map(([k, v]) => [k, typeof v === 'number' ? r(v) : v])),
    ledger: run.ledger || null, dustWriteOffs: run.dustWriteOffs || null, rejections: run.rejections || null,
    totalReturn: r(last.equity / cfg.initialEquity - 1),
  };
}
