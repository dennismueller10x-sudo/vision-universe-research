/**
 * Converts the frozen snapshot dataset (validation/analyze-methods.mjs loadPitData on the replaying snapshot io) into
 * the input of the source-faithful methods. No data is added, repaired or interpolated:
 *  - bars: split-adjusted OHLCV and dividends from validation/lib.mjs adjustSeries (the snapshot convention, ADR-002),
 *    raw close / raw volume kept for raw-price rules (tick, universe floor); splitAdj = raw close / adjusted close;
 *  - terminal: only the end of an inactive listing inside the window is an economic delisting (LISTING_INACTIVE);
 *    a segment end by a data gap is a data event (DATA_GAP); ACTIVE and WINDOW_END have no terminal;
 *  - securities are snapshot segments (listing id, '#n' after a data gap); identity follows the snapshot listing ids.
 */
import * as L from '../../validation/lib.mjs';

export function securityFromSegment(seg) {
  const a = L.adjustSeries(seg.raw);
  const bars = a.date.map((date, i) => {
    const rc = a.rawClose[i], c = a.close[i];
    return { date, open: a.open[i], high: a.high[i], low: a.low[i], close: c, volume: a.volume[i], rawClose: rc, rawVolume: a.rawVolume[i], splitAdj: Number.isFinite(rc) && Number.isFinite(c) && c > 0 ? rc / c : 1, dividend: a.divAdj[i] };
  });
  const last = bars.at(-1);
  let terminal = null;
  if (seg.endCause === 'LISTING_INACTIVE') terminal = { date: last.date, cause: 'LISTING_INACTIVE', distress: L.distressSignature(a.rawClose), delistClass: seg.delistClass || null };
  else if (seg.endCause === 'DATA_GAP') terminal = { date: last.date, cause: 'DATA_GAP', distress: false, delistClass: null };
  return { id: seg.id, bars, terminal, survivor: seg.survivor === true, cls: seg.cls || null };
}

export function datasetFromPit(pit) {
  return { calendar: pit.calendar, securities: pit.segs.map(securityFromSegment), spyTR: pit.spyTR };
}
