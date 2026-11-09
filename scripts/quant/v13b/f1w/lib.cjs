'use strict';
// V13b F1W - building blocks of the standalone, non-confirmatory end-of-series comparison study
// (docs/quant-recovery/v13b/f1w/study-registration-2.0.0.json). Thin layer over the unchanged V13 study code
// (scripts/quant/v13/studies/lib.cjs, run-frame.cjs) and the V10 study code. Nothing here changes F0, F1 or any default.
//   F1w = V13 amendment-1.0.1 relabel (lib.mergeFrame relabelLastBar, unchanged)
//   F1d = same chains as F1w, the non-modal last bar is DROPPED instead of relabelled, then the unchanged registered frame rule.
const fs = require('node:fs'), path = require('node:path');
const W = require('../../v13/studies/lib.cjs'), K = W.K;

const REG_FILE = 'docs/quant-recovery/v13b/f1w/study-registration-2.0.0.json';
const OUT_DIR = 'docs/quant-recovery/v13b/f1w';
const V13_PRIVATE = path.resolve(W.ROOT, '..', '..', 'v13-studies', 'private');
const PRIVATE = path.resolve(W.ROOT, '..', '..', 'v13b-f1w', 'private');
const V13_F1W_MANIFEST = '066505661d92b62c6e5a4d0fe788c9629d5abde051c54f5309365016d64335f3';

function registrationSha(root = W.ROOT) {
  const s = W.shaFile(path.join(root, REG_FILE)), committed = fs.readFileSync(path.join(root, REG_FILE.replace(/\.json$/, '.sha256')), 'utf8').trim().split(/\s+/)[0];
  if (s !== committed) throw Error('V13B_F1W_REGISTRATION_HASH_MISMATCH');
  return s;
}

/** The F1w/F1d eligibility of a delisted doc (pure): last bar earlier than the modal label of its ISO week, all earlier bars modal. */
function endOfSeriesCase(d, modal, weekOf = K.weekOf) {
  const [x] = d.points.at(-1), m = modal.get(weekOf(x));
  if (!(m && x < m)) return null;
  if (!d.points.slice(0, -1).every(([y]) => modal.get(weekOf(y)) === y)) return null;
  return { lastDate: x, modalDate: m };
}

/**
 * F1d transform (registration 2.0.0, populations.F1d): for exactly the F1w chains drop the last bar (and the total-return point of
 * that date). Price of the dropped bar is not used; lifecycle (true lastTradeDate) unchanged. Chains left with < 2 bars are removed
 * from the map and counted. Returns { docs, truncated: [{id, dropped:[date, close], newLast}], tooShort: [ids] }.
 */
function dropNonModalLastBar(fr0, delisted, weekOf = K.weekOf) {
  const modal = new Map(fr0.calendar.map(d => [weekOf(d), d]));
  const docs = new Map(), truncated = [], tooShort = [];
  for (const id of [...delisted.keys()].sort()) {
    const d = delisted.get(id), c = endOfSeriesCase(d, modal, weekOf);
    if (!c) { docs.set(id, d); continue; }
    if (d.points.length - 1 < 2) { tooShort.push(id); continue; }
    const last = d.points.at(-1), tr = Array.isArray(d.totalReturnPoints) ? d.totalReturnPoints : null;
    const nd = { ...d, points: d.points.slice(0, -1), totalReturnPoints: tr && tr.length && tr.at(-1)[0] === last[0] ? tr.slice(0, -1) : tr, droppedLastBar: { date: last[0], close: last[1], modalDate: c.modalDate } };
    docs.set(id, nd); truncated.push({ id, dropped: last, newLast: nd.points.at(-1)[0] });
  }
  return { docs, truncated, tooShort };
}

/** F1d frame = unchanged registered merge (no relabel) on the transformed docs. */
function mergeFrameF1d(fr0, delisted, weekOf = K.weekOf) {
  const t = dropNonModalLastBar(fr0, delisted, weekOf);
  const fr = W.mergeFrame(fr0, t.docs, {}, K.micOf, weekOf);
  fr.delisted.truncatedLastBars = t.truncated.filter(x => fr.delisted.added.includes(x.id)).length;
  fr.delisted.tooShortAfterDrop = t.tooShort.length;
  fr.delisted.dropOption = true;
  return fr;
}

/** NYSE trading-day distance proxy: weekdays strictly after a up to and including b (holidays not removed; descriptive). */
function weekdaysBetween(a, b) {
  let n = 0; const t = new Date(a + 'T00:00:00Z'), z = new Date(b + 'T00:00:00Z');
  for (t.setUTCDate(t.getUTCDate() + 1); t <= z; t.setUTCDate(t.getUTCDate() + 1)) { const w = t.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

module.exports = { W, K, REG_FILE, OUT_DIR, V13_PRIVATE, PRIVATE, V13_F1W_MANIFEST, registrationSha, endOfSeriesCase, dropNonModalLastBar, mergeFrameF1d, weekdaysBetween };
