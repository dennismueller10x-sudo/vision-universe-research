'use strict';
// V13 STUDIES - shared building blocks for the pre-registered delisted-series studies
// (docs/quant-recovery/v13/delisted/study-registration-1.0.0.json). Thin wrappers around the V10 study code
// (scripts/quant/v10/studies/common.cjs) and the hash-bound delisted loader (quant/engines/research-delisted-series.cjs).
// No engine logic is forked: F1 = F0 frame object plus the delisted docs that pass the SAME frame rules
// (F0's modal week labels, MIC set via common.micOf); the panel, eligibility, outcomes and inference are the V10 functions.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const K = require(ROOT + '/scripts/quant/v10/studies/common.cjs');

const STUDY_DIR = 'docs/quant-recovery/v13/studies';
const STUDY_REGISTRATION = 'docs/quant-recovery/v13/delisted/study-registration-1.0.0.json';
const STUDY_AMENDMENT = 'docs/quant-recovery/v13/studies/study-amendment-1.0.1.json';
const F0_LOADER = Object.freeze({ identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true });
const PRIVATE_SERIES = path.resolve(ROOT, '..', '..', 'v13-private', 'series');
// Registered terminal scenarios (protocol R6 / study registration "delisting_terminal"); index 0 is the point estimate.
const TERMINAL_SCENARIOS = Object.freeze({ MERGER: [0, -0.10, 0.10], DISTRESS: [0, -0.30, -1], UNKNOWN: [0, -0.30, -1] });
const SCENARIO_NAMES = ['S0_LAST_CLOSE', 'S1_MERGER_M10_OTHER_M30', 'S2_MERGER_P10_OTHER_M100'];

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const shaFile = f => sha256(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f)));
function registrationSha() {
  const s = shaFile(STUDY_REGISTRATION), committed = fs.readFileSync(path.join(ROOT, STUDY_REGISTRATION.replace(/\.json$/, '.sha256')), 'utf8').trim().split(/\s+/)[0];
  if (s !== committed) throw Error('STUDY_REGISTRATION_HASH_MISMATCH');
  return s;
}
function amendmentSha() { const f = path.join(ROOT, STUDY_AMENDMENT); return fs.existsSync(f) ? shaFile(f) : null; }

/**
 * Frame merge (pure, outcome-free). fr0: K.buildFrame result (docs Map, qualified, frame, calendar, excluded).
 * delisted: Map(id -> doc) from research-delisted-series.loadDelisted. Rule = V10 frame rule with F0's calendar:
 * every weekly date label must equal F0's modal label of its ISO week (weeks absent from F0's calendar count as
 * non-modal), then the MIC must lie in XNAS/XNYS/XASE (common.micOf). Nothing is repaired; exclusions are counted.
 */
// options.relabelLastBar (study amendment 1.0.1, sensitivity F1w only): the LAST bar may carry a date earlier than the
// modal label of its ISO week; it is relabelled to that modal date (price unchanged, no bar added). All other bars as registered.
function mergeFrame(fr0, delisted, options = {}, micOf = K.micOf, weekOf = K.weekOf) {
  const modal = new Map(fr0.calendar.map(d => [weekOf(d), d]));
  if (modal.size !== fr0.calendar.length) throw Error('F0_CALENDAR_NOT_ONE_LABEL_PER_WEEK');
  const excluded = { NON_MODAL_WEEK_LABEL: [], EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET: [] }, added = [], relabelled = [];
  const ids = [...delisted.keys()].sort(), out = new Map();
  for (const id of ids) {
    if (fr0.docs.has(id)) throw Error('DELISTED_ID_COLLIDES_WITH_F0:' + id);
    let d = delisted.get(id);
    if (options.relabelLastBar) {
      const [x, v] = d.points.at(-1), m = modal.get(weekOf(x));
      if (m && x < m && d.points.slice(0, -1).every(([y]) => modal.get(weekOf(y)) === y)) {
        d = { ...d, points: d.points.slice(0, -1).concat([[m, v]]), totalReturnPoints: Array.isArray(d.totalReturnPoints) && d.totalReturnPoints.length && d.totalReturnPoints.at(-1)[0] === x ? d.totalReturnPoints.slice(0, -1).concat([[m, d.totalReturnPoints.at(-1)[1]]]) : d.totalReturnPoints, relabelledLastBar: { from: x, to: m } };
        relabelled.push(id);
      }
    }
    out.set(id, d);
    if (d.points.some(([x]) => modal.get(weekOf(x)) !== x)) excluded.NON_MODAL_WEEK_LABEL.push(id);
    else if (!micOf(d)) excluded.EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET.push(id);
    else added.push(id);
  }
  const docs = new Map(fr0.docs); for (const id of ids) docs.set(id, out.get(id));
  return { ...fr0, docs, qualified: fr0.qualified.concat(ids), frame: fr0.frame.concat(added), calendar: fr0.calendar,
    excluded: { NON_MODAL_WEEK_LABEL: fr0.excluded.NON_MODAL_WEEK_LABEL.concat(excluded.NON_MODAL_WEEK_LABEL), EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET: fr0.excluded.EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET.concat(excluded.EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET) },
    delisted: { loaded: ids.length, added, excluded, relabelledLastBars: relabelled.filter(id => added.includes(id)).length, relabelOption: !!options.relabelLastBar } };
}
/** Manifest of F1 for the reproducibility hash: F0 manifest hash + per added delisted doc the register-bound points hash. */
function mergedManifestHash(f0ManifestHash, fr1, delistedMeta) {
  return K.V.hash({ f0ManifestHash, delisted: fr1.delisted.added.map(id => { const d = fr1.docs.get(id); return [id, d.identityHash, d.points.length, d.listingLifecycle.status]; }), delistedMeta });
}

/** Terminal class of a panel listing: registered V13 class for delisted docs, null otherwise. */
const terminalClassOf = p => (p.lifecycle && p.lifecycle.schemaVersion === 'v13-delisted-register-1.0.0' && p.lifecycle.terminal) ? p.lifecycle.terminal.kind : null;
/** Scenario return s for scenario index j (0 = last traded close). F0 ended listings (V10 lifecycle) stay at last close in every scenario. */
function scenarioReturn(p, j) { const c = terminalClassOf(p); if (!c) return 0; const s = TERMINAL_SCENARIOS[c]; if (!s) throw Error('TERMINAL_CLASS_UNKNOWN:' + c); return s[j]; }
/** A listing whose series ended (sourced last trade before the calendar end). */
function endedListing(p, T) { return !!(p.lifecycle && p.lifecycle.lastTradeDate) && p.cal[p.closes.length - 1] < T - 1; }
/**
 * Terminal-resolved forward gross for an eligible bar k whose h-week exit lies beyond the series end of an ENDED listing:
 * entry close k+1 observed and contiguous, contiguous path to the last bar, expected exit inside the calendar (matured by
 * asOf); value = lastClose*(1+s)/entryClose - 1 ("terminal applied in the last held week"). Returns null otherwise.
 */
function terminalForward(p, k, h, T, j) {
  const n = p.closes.length, e = k + 1, x = k + 1 + h;
  if (x < n || e >= n || !endedListing(p, T)) return null;
  if (p.cal[e] !== p.cal[k] + 1 || p.cal[n - 1] - p.cal[k] !== n - 1 - k || p.cal[k] + 1 + h > T - 1) return null;
  return p.closes[n - 1] * (1 + scenarioReturn(p, j)) / p.closes[e] - 1;
}

function writeJson(rel, x) { const f = path.isAbsolute(rel) ? rel : path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); const s = JSON.stringify(x, null, 1) + '\n'; fs.writeFileSync(f, s); return sha256(s); }
function args(argv, spec) { const o = { ...spec }; for (let i = 0; i < argv.length; i++) { const k = argv[i].replace(/^--/, ''); if (!(k in spec)) throw Error('UNKNOWN_ARGUMENT:' + argv[i]); o[k] = argv[++i]; } return o; }
const r6 = x => typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : x;

module.exports = { ROOT, K, STUDY_DIR, STUDY_REGISTRATION, STUDY_AMENDMENT, F0_LOADER, PRIVATE_SERIES, TERMINAL_SCENARIOS, SCENARIO_NAMES, sha256, shaFile, registrationSha, amendmentSha,
  mergeFrame, mergedManifestHash, terminalClassOf, scenarioReturn, endedListing, terminalForward, writeJson, args, r6 };
