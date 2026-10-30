'use strict';
// Worker: runs research-studies.runSignalStudy / runReplayValidation per listing (unchanged engine) for a chunk of
// listings and returns compact events. The expected calendar starts at the listing's first bar and the
// benchmark at the same date: both only shorten arrays the engine never reads before the first bar
// (calendar positions are used relatively), so events are identical; this is checked in tests.
const { parentPort, workerData } = require('node:worker_threads');
const S = require('../../../../quant/engines/research-studies.cjs');

function listingOf(x) {
  return { listingId: x.listingId, issuerId: x.id, securityId: x.id,
    identity: { mic: x.mic, instrumentClass: 'COMMON_STOCK', primary: true, validFrom: x.listingStart, availableAt: x.availableAt, sourceHash: x.identityHash },
    bars: x.dates.map((date, k) => ({ date, close: x.closes[k] })) };
}
function compact(e, x, idx) {
  return { rule: e.ruleId ?? null, securityId: x.id, signalDate: e.signalDate, state: e.state, reason: e.reasons ? e.reasons[0] : null, entryDate: e.entryDate, exitDate: e.exitDate,
    expectedExitDate: e.expectedExitDate, gross: e.completed ? e.grossReturn : null, bench: e.completed ? e.benchmarkReturn : null, maxDrawdown: e.completed ? e.maxDrawdown : null,
    entryClose: e.entryDate ? x.closes[idx.get(e.entryDate)] : null, lastClose: x.closes[x.closes.length - 1] };
}
function runChunk({ kind, listings, calendar, benchmark, base, horizons, extra }) {
  const out = {};
  for (const h of horizons) {
    const events = [];
    for (const x of listings) {
      const first = calendar.indexOf(x.dates[0]);
      const input = { ...base, ...extra, horizonBars: h, expectedCalendar: calendar.slice(first), benchmark: { ...base.benchmark, bars: benchmark.filter(b => b.date >= x.dates[0]) }, listings: [listingOf(x)] };
      const r = kind === 'signal' ? S.runSignalStudy(input) : S.runReplayValidation(input);
      const idx = new Map(x.dates.map((d, k) => [d, k]));
      for (const e of r.events) events.push(compact(e, x, idx));
    }
    out[h] = events;
  }
  return out;
}
if (parentPort) parentPort.postMessage(runChunk(workerData));
module.exports = { runChunk, listingOf };
