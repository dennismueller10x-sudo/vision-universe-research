// Supertrader — Durable Research Snapshot: Datensatz-Fingerabdruck und reproduzierbarer Kontroll-Backtest.
//
// Beides wird im Capture-Job aus den gerade gelesenen Daten berechnet und im Manifest festgehalten.
// Jeder Konsument rechnet es nach dem Wiederherstellen erneut; jede Abweichung ist ein Integritaetsfehler.
// Der Kontroll-Backtest ist ein technischer Reproduktionstest (feste Engine, feste Teilmenge),
// keine Strategiebewertung; sein Ergebnis wird nur als Hash veroeffentlicht.
import { sha256, canonicalJson } from './contract.mjs';
import { segCtx, tradesFor } from '../validation/analyze-methods.mjs';
import { runPortfolioTR, reconcileResearch } from '../validation/portfolio.mjs';
import { DEFAULT_EXECUTION } from '../engine/execution.mjs';
import donchian from '../engine/strategies/donchian.mjs';

export const REPLAY = Object.freeze({ engine: 'DONCHIAN_TURTLE', segments: 150, minBars: 300, accounting: 'RESEARCH_V1', initialEquity: 100000 });

// Kanonische Zaehlungen und Hash ueber die Segmente, die loadPitData liefert (Universe, Bars, Kapitalmassnahmen).
export function datasetFingerprint(pit) {
  let bars = 0, splits = 0, dividends = 0, delisted = 0;
  const rows = pit.segs.map((s) => {
    bars += s.raw.length; if (s.delisted) delisted++;
    let sp = 0, dv = 0;
    for (const b of s.raw) { if (Number.isFinite(b.splitFactor) && b.splitFactor !== 1) sp++; if (b.dividend > 0) dv++; }
    splits += sp; dividends += dv;
    return [s.id, s.raw.length, s.raw[0]?.date, s.raw.at(-1)?.date, sha256(canonicalJson(s.raw)), sp, dv, s.delisted ? 1 : 0, s.endCause || null];
  }).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const counts = { listings: pit.listings.length, members: pit.members.length, segments: pit.segs.length, bars, splitEvents: splits, dividendEvents: dividends, delistedSegments: delisted, duplicates: pit.dup.size, offCalendar: pit.offCalendar, calendarDays: pit.calendar.length, activeListings: pit.listings.filter((l) => l.active).length, inactiveListings: pit.listings.filter((l) => !l.active).length };
  return { counts, tableHash: pit.hash, loaderFingerprint: pit.dataFingerprint.hash, segmentsSha256: sha256(canonicalJson(rows)), calendarSha256: sha256(canonicalJson(pit.calendar)), spySha256: sha256(canonicalJson(pit.spyRaw || [])) };
}

export function replayFingerprint(pit) {
  const segs = pit.segs.filter((s) => s.raw.length >= REPLAY.minBars).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, REPLAY.segments);
  const trades = [];
  for (const seg of segs) trades.push(...tradesFor(donchian, seg, segCtx(seg, null), DEFAULT_EXECUTION));
  const cfg = { initialEquity: REPLAY.initialEquity, riskPerTrade: 0.01, maxPositionPct: 0.2, maxPositions: 12, maxExposure: 1 };
  const cal = [...new Set([...pit.calendar, ...trades.flatMap((t) => [t.entry.date, ...t.exits.map((x) => x.date)])])].sort();
  const run = runPortfolioTR(trades, cal, cfg, { scenario: 'S1_MINUS_30', accounting: REPLAY.accounting });
  const rc = reconcileResearch(run, cfg);
  const summary = { segments: segs.length, trades: trades.length, taken: run.taken.length, ledgerRows: run.ledger.length, curve: run.equity.map((e) => Math.round(e.equity * 1e6)), ledger: run.ledger.map((r) => [r.date, r.id, r.side, Math.round(r.shares * 1e6), Math.round((r.price || 0) * 1e6)]), reconciled: rc.pass };
  return { config: REPLAY, segments: segs.length, trades: trades.length, reconciled: rc.pass, sha256: sha256(canonicalJson(summary)) };
}
