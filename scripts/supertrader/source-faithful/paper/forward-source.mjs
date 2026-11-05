/**
 * SF6-PAPER-2027 1.2.0 – forward data path (FORWARD_DATA_PATHS.RESEARCH_FORWARD_WINDOW, FP-ST-02 V5;
 * docs/SUPERTRADER_PAPER_2027_FORWARD_PATH.md).
 *
 * No second price derivation and no second loader: the forward source is the research loader of the snapshots
 * (validation/analyze-methods.mjs#loadPitData with snapshot/snapshot.mjs CANONICAL_LOAD, the capture flags) run in the
 * forward window PAPER_2027 of validation/lib.mjs (ST_WINDOW=PAPER_2027, ST_WINDOW_TO = the recorded session t).
 * The dataset of a session is built exactly like a snapshot run of the references (research/run-sf6-validation.mjs):
 *   datasetFromPit (lib.mjs adjustSeries, split factors and dividends; ADR-002) + attachSecPit (sec-pit r12).
 * Point in time: the raw input is cut at the close of t BEFORE adjustment (forward-log.mjs#truncatePit), so corporate
 * actions enter only as known at t; delistings come from the listing table as of t (lib.mjs LISTING_OPTS).
 *
 * The io argument is the same seam as the snapshot path: LIVE_IO for the daily record, a snapshot replay io
 * (snapshot/snapshot.mjs#openSnapshot) for the batch replay on the frozen forward snapshot.
 */
import zlib from 'node:zlib';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { attachSecPit } from '../research/run-sf3-research.mjs';
import { truncatePit } from './forward-log.mjs';

export const FORWARD_SOURCE_KIND = 'RESEARCH_FORWARD_WINDOW';
export const FORWARD_SOURCE_VERSION = 'sf6-paper-forward-source-1.0.0';
/** sec-pit key of the references (run-sf6-validation.mjs / run-sf4-lifecycle.mjs SEC_PIT_KEY; frozen by the capture). */
export const FORWARD_SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz';

/**
 * Fail closed unless this process runs in the forward window ending at `session` (lib.mjs reads ST_WINDOW and
 * ST_WINDOW_TO once at import; a DEV or HOLDOUT process can never record a forward session).
 */
export function assertForwardWindow(session, lib = L) {
  if (lib.WINDOW_NAME !== lib.FORWARD_WINDOW.name) throw new Error(`FORWARD_WINDOW_ENV_REQUIRED: ST_WINDOW=${lib.FORWARD_WINDOW.name} ST_WINDOW_TO=${session}`);
  if (lib.WINDOW.to !== session) throw new Error(`FORWARD_WINDOW_TO_MISMATCH: ST_WINDOW_TO=${lib.WINDOW.to} != ${session}`);
  if (lib.SERIES_PROVIDER !== lib.FORWARD_WINDOW.seriesProvider) throw new Error('FORWARD_NAMESPACE_MISMATCH');
  return true;
}

/** Dataset source of the forward window from an already loaded pit (loadPitData result) and the sec-pit r12 records. */
export function forwardSourceFromPit(pit, secPit, { kind = FORWARD_SOURCE_KIND } = {}) {
  const at = (t) => { const ds = datasetFromPit(truncatePit(pit, t)); attachSecPit(ds, secPit || {}); return ds; };
  return { kind, version: FORWARD_SOURCE_VERSION, sessions: pit.calendar, at, pitCorporateActions: true, window: { name: L.WINDOW_NAME, ...L.WINDOW }, listingTableHash: pit.hash, dataFingerprint: pit.dataFingerprint?.hash ?? null };
}

/**
 * Loads the forward source for `session` through the research loader. io: LIVE_IO (default) or a snapshot replay io.
 * Returns { kind, sessions, at(t), pitCorporateActions: true, ... } as forward-log.mjs#datasetSource does.
 */
export async function loadForwardSource(session, { io = null, log = () => {} } = {}) {
  assertForwardWindow(session);
  const { loadPitData, LIVE_IO } = await import('../../validation/analyze-methods.mjs');
  const { CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
  const src = io ?? LIVE_IO;
  const pit = await loadPitData({ ...CANONICAL_LOAD, io: src, log });
  const driver = await src.createDriver();
  const buf = await driver.get(pit.mine.seriesPrefix + FORWARD_SEC_PIT_KEY);
  const secPit = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
  log(`forward source ${L.WINDOW_NAME} ${L.WINDOW.from}..${L.WINDOW.to}: ${pit.segs.length} segments, ${pit.calendar.length} sessions, sec-pit r12 ${Object.keys(secPit).length}`);
  return forwardSourceFromPit(pit, secPit);
}
