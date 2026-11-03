/**
 * SF6-PAPER-2027 – forward log (recording.perSession / recording.noRewrite of completion/sf6-paper-protocol-2027.mjs)
 * and the four integrity checks (evaluation.integrityChecks). Pure: a dataset source goes in, entries and check results
 * come out; no network, no file, no clock (the caller passes recordedAt).
 *
 * Record of session t (protocol PIT: only data up to the close of t):
 *   every one of the 11 references runs UNCHANGED (research/sf6-references.mjs, REFERENCE_COSTS = research-v1 costs) on
 *   the dataset as known at the close of t, from the window start to t. The record keeps, per reference,
 *     public  counts and hashes only (no ticker, no price, no P&L; interim = counts only): open positions, closed trades,
 *             cumulative setups seen / orders armed / entries (the orders armed at the close of t for t + 1 are the
 *             difference to the record of t - 1), reconciliation, ledgerSha256 of the ledger up to t;
 *     sealed  the open position ids and the closed trade keys (owner only; the public entry carries its sha256).
 *   No metric is computed at any point (no pnl, no return, no curve value leaves the run).
 *
 * Entry chain: entry.hash = sha256(canonicalJson(entry without hash)); entry.prevHash = hash of the entry before
 * (GENESIS for the first). An entry is never changed; a correction is a new CORRECTION entry naming the seq it corrects.
 *
 * The engines are not touched: the record reads only what a run already returns (trades, ledger, counts,
 * reconciliation, openAtEnd). The armed orders themselves are internal to the engines and not returned; the record
 * keeps their count, which every engine except Turtle returns (Turtle has no armed order: its entries are stop levels
 * re-evaluated on the bar).
 */
import { canonicalJson, sha256 } from '../../snapshot/contract.mjs';
import { SF6_REFERENCES, REFERENCE_COSTS } from '../research/sf6-references.mjs';
import { currentPaperProtocol } from '../completion/sf6-paper-protocol-2027-v1_2_0.mjs';
import { DQ_POLICIES, PRIMARY_POLICY, quarantineDataset } from '../integrity/discontinuity.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';

// The log refers to the current protocol version (1.2.0 when present, completion/sf6-paper-protocol-2027-v1_2_0.mjs);
// window, recording and the four checks are the same in 1.1.0 and 1.2.0, only the pins and the forward path differ.
const SF6_PAPER_PROTOCOL = currentPaperProtocol().protocol, sf6PaperProtocolSha256 = currentPaperProtocol().sha256;

export const FORWARD_LOG_VERSION = 'sf6-paper-forward-log-1.0.0';
export const GENESIS = '0'.repeat(64);
export const ENTRY_TYPES = Object.freeze(['SESSION', 'CORRECTION']);
export const INTEGRITY_CHECK_IDS = Object.freeze(SF6_PAPER_PROTOCOL.evaluation.integrityChecks.map((c) => c.split(':')[0]));
/** Cumulative engine counts kept in the public record (scalars only; costs and dividends are money, not counts). */
export const RECORD_COUNTS = Object.freeze(['setupsSeen', 'ordersArmed', 'entries', 'adds', 'protectiveExits', 'scheduledExits', 'stopExits', 'unitStopExits', 'channelExits', 'terminalSettlements']);
/** Latest time a record of session t may be written: before the next regular open (09:30 New York = 13:30 / 14:30 UTC). */
export const NEXT_OPEN_UTC = 'T13:30:00Z';

const hashOf = (x) => sha256(typeof x === 'string' ? x : JSON.stringify(x));
const EPS = 1e-9;

// ------------------------------------------------------------------------------------------------ data as known at t

/** Research dataset (already adjusted) cut at the close of t. Adjustments stay as the dataset carries them. */
export function truncateDataset(ds, t) {
  const cut = (rows) => (rows ? rows.filter((r) => r.date <= t) : rows);
  const securities = [];
  for (const s of ds.securities) {
    const bars = s.bars.filter((b) => b.date <= t);
    if (!bars.length) continue;
    securities.push({ ...s, bars, terminal: s.terminal && s.terminal.date <= t ? s.terminal : null });
  }
  return { ...ds, calendar: ds.calendar.filter((d) => d <= t), securities, spyTR: cut(ds.spyTR), benchmark: cut(ds.benchmark) };
}

/**
 * Raw research snapshot input (loadPitData shape) cut at the close of t BEFORE adjustment: the split divisor is then
 * built only from split factors with an ex-date up to t, i.e. corporate actions as known at t (protocol data.pit).
 * A later split re-scales the adjusted history of a dataset built from the full window; this cut does not.
 */
export function truncatePit(pit, t) {
  const segs = [];
  for (const s of pit.segs) {
    const raw = s.raw.filter((b) => b.date <= t);
    if (!raw.length) continue;
    const ended = raw.length === s.raw.length;
    segs.push({ ...s, raw, endCause: ended ? s.endCause : 'ACTIVE', delisted: ended ? s.delisted : false });
  }
  const n = pit.spyAdj.date.filter((d) => d <= t).length;
  const spyAdj = Object.fromEntries(Object.entries(pit.spyAdj).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, n) : v]));
  return { ...pit, calendar: pit.calendar.filter((d) => d <= t), segs, spyAdj, spyTR: pit.spyTR.filter((r) => r.date <= t) };
}

/** Dataset sources: sessions and the dataset as known at the close of t. */
export function datasetSource(ds, { kind = 'DATASET', pit = false } = {}) {
  if (pit) return { kind, sessions: ds.calendar, at: (t) => datasetFromPit(truncatePit(ds, t)), pitCorporateActions: true };
  return { kind, sessions: ds.calendar, at: (t) => truncateDataset(ds, t), pitCorporateActions: false };
}

export function datasetSha256(ds) {
  return sha256(canonicalJson({ calendar: ds.calendar, securities: ds.securities.map((s) => [s.id, s.terminal, s.bars.map((b) => [b.date, b.open, b.high, b.low, b.close, b.volume, b.dividend ?? null, b.splitAdj ?? null])]) }));
}

// ------------------------------------------------------------------------------------------------ one reference run

/** Open position ids after the ledger rows up to t (net shares > 0); uniform for every engine. */
export function openIdsFromLedger(ledger, t = null) {
  const net = new Map();
  for (const r of ledger) {
    if (t !== null && r.date > t) continue;
    if (r.side === 'BUY') net.set(r.id, (net.get(r.id) || 0) + r.shares);
    else if (r.side === 'SELL') net.set(r.id, (net.get(r.id) || 0) - r.shares);
  }
  return [...net].filter(([, n]) => n > EPS).map(([id]) => id).sort();
}
const closedKey = (t) => [t.id, t.entryDate, t.exitDate, t.exitReason, t.shares];
const byKey = (a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);

function stateOf(x, t) {
  const ledger = t === null ? x.run.ledger : x.run.ledger.filter((r) => r.date <= t);
  const closed = x.trades.filter((tr) => tr.status === 'CLOSED' && (t === null || tr.exitDate <= t)).map(closedKey).sort(byKey);
  return { ledgerSha256: hashOf(ledger), ledgerRows: ledger.length, openIds: openIdsFromLedger(ledger), closed };
}

function runRef(ref, ds, from, to) {
  return ref.run(ds, { from, to, costs: REFERENCE_COSTS, ...(ref.prep(ds, { from }) || {}) });
}

/** Record of one session: public part (counts and hashes) and sealed part (ids, trade keys). */
export function sessionRecord(dsAtT, session, { from = SF6_PAPER_PROTOCOL.window.start, refs = SF6_REFERENCES } = {}) {
  const pub = {}, sealed = {};
  for (const ref of refs) {
    const x = runRef(ref, dsAtT, from, session);
    const st = stateOf(x, null);
    const counts = Object.fromEntries(RECORD_COUNTS.filter((k) => Number.isFinite(x.run.counts?.[k])).map((k) => [k, x.run.counts[k]]));
    sealed[ref.key] = { openIds: st.openIds, closed: st.closed };
    pub[ref.key] = { candidateId: ref.candidateId, openPositions: st.openIds.length, closedTrades: st.closed.length, counts, reconciliation: x.run.reconciliation.pass === true, ledgerRows: st.ledgerRows, ledgerSha256: st.ledgerSha256, sealedSha256: hashOf(canonicalJson(sealed[ref.key])) };
  }
  return { public: pub, sealed };
}

// ------------------------------------------------------------------------------------------------ chain

export function entryHash(entry) { const { hash, ...rest } = entry; void hash; return sha256(canonicalJson(rest)); }

/**
 * Builds the next entry and returns it; never changes an existing one. SESSION: the session must be later than every
 * session already recorded (no gap filling backwards, no duplicate). CORRECTION: names the seq of the entry it corrects
 * (same session) and a reason; the corrected entry stays.
 */
export function nextEntry(log, { type = 'SESSION', session, record, inputs, recordedAt, corrects = null, reason = null, activationSha256 = null, dryRun = false }) {
  if (!ENTRY_TYPES.includes(type)) throw new Error(`PAPER_ENTRY_TYPE:${type}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(session || '')) throw new Error('PAPER_SESSION_REQUIRED');
  if (!recordedAt) throw new Error('PAPER_RECORDED_AT_REQUIRED');
  const v = verifyChain(log); if (!v.pass) throw new Error(`PAPER_CHAIN_BROKEN:${v.errors[0]}`);
  const last = log.at(-1) ?? null;
  const sessions = log.filter((e) => e.type === 'SESSION').map((e) => e.session);
  if (type === 'SESSION' && sessions.length && session <= sessions.at(-1)) throw new Error(`PAPER_SESSION_NOT_AFTER_LAST:${session}<=${sessions.at(-1)}`);
  if (type === 'CORRECTION') {
    const target = log.find((e) => e.seq === corrects);
    if (!target || target.session !== session) throw new Error('PAPER_CORRECTION_TARGET');
    if (!reason) throw new Error('PAPER_CORRECTION_REASON_REQUIRED');
  }
  const entry = {
    schema: FORWARD_LOG_VERSION, protocol: { id: SF6_PAPER_PROTOCOL.id, version: SF6_PAPER_PROTOCOL.version, sha256: sf6PaperProtocolSha256() }, activationSha256,
    dryRun: dryRun === true, seq: log.length, type, session, corrects: type === 'CORRECTION' ? corrects : null, reason: type === 'CORRECTION' ? reason : null,
    recordedAt, prevHash: last ? last.hash : GENESIS, inputs, references: record.public,
    label: 'PAPER_ONLY_NO_ORDER_NO_SIGNAL_LIVE_NOT_APPROVED',
  };
  entry.hash = entryHash(entry);
  return entry;
}

export function verifyChain(log) {
  const errors = [];
  log.forEach((e, i) => {
    if (e.seq !== i) errors.push(`SEQ:${i}`);
    if (e.prevHash !== (i ? log[i - 1].hash : GENESIS)) errors.push(`PREV_HASH:${i}`);
    if (entryHash(e) !== e.hash) errors.push(`HASH:${i}`);
    if (e.protocol?.sha256 !== sf6PaperProtocolSha256()) errors.push(`PROTOCOL:${i}`);
  });
  return { pass: errors.length === 0, entries: log.length, head: log.at(-1)?.hash ?? GENESIS, errors };
}

/**
 * Append-only check of a new log against the committed one (base): the base is an exact prefix (byte-identical lines,
 * nothing changed, nothing removed, nothing inserted before the head), the new chain is valid, and every entry after the
 * base is a real record (no dry-run entry ever reaches the real log).
 */
export function verifyAppendOnly(baseText, newText) {
  const errors = [];
  const baseLines = baseText.split('\n').filter((l) => l.trim()), newLines = newText.split('\n').filter((l) => l.trim());
  if (newLines.length < baseLines.length) errors.push(`SHORTER:${newLines.length}<${baseLines.length}`);
  baseLines.forEach((l, i) => { if (newLines[i] !== l) errors.push(`CHANGED:${i}`); });
  const log = newLines.map((l) => JSON.parse(l));
  const chain = verifyChain(log); errors.push(...chain.errors);
  log.slice(baseLines.length).forEach((e) => { if (e.dryRun !== false) errors.push(`DRY_RUN_ENTRY:${e.seq}`); });
  return { pass: errors.length === 0, baseEntries: baseLines.length, entries: log.length, appended: Math.max(0, log.length - baseLines.length), head: chain.head, errors };
}

/** File name of the sealed part of an entry: one file per entry (a CORRECTION gets its own, the old one stays). */
export const sealedFileName = (entry) => `${String(entry.seq).padStart(4, '0')}-${entry.session}.sealed.json`;

/** Effective record per session: the SESSION entry, replaced by its latest CORRECTION. */
export function effectiveEntries(log) {
  const out = new Map();
  for (const e of log) if (e.type === 'SESSION' || out.has(e.session)) out.set(e.session, e);
  return out;
}

export const parseJsonl = (text) => text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
export const toJsonlLine = (entry) => canonicalJson(entry) + '\n';

// ------------------------------------------------------------------------------------------------ the four checks

const nextOpenOf = (sessions, t) => { const i = sessions.indexOf(t); return i >= 0 && i + 1 < sessions.length ? sessions[i + 1] + NEXT_OPEN_UTC : null; };

/**
 * Runs the four integrity checks of the protocol on a forward log against the frozen forward data.
 *   frozen     dataset source of the frozen forward snapshot (datasetSource), sessions = its calendar
 *   sealedOf   optional (session, key) -> sealed part, for the sealed comparison (owner run); public hashes suffice
 *   mode       PIT_PER_SESSION (authoritative: every session replayed on the frozen data as known at t) or
 *              SINGLE_RUN_PREFIX (fast pre-check: one run to the last session, ledger prefix per session; equal to the
 *              authoritative mode only when no corporate action after t re-scales the adjusted history)
 */
export function integrityChecks(log, frozen, { from = SF6_PAPER_PROTOCOL.window.start, to = null, refs = SF6_REFERENCES, mode = 'PIT_PER_SESSION', sealedOf = null } = {}) {
  const chain = verifyChain(log);
  const eff = effectiveEntries(log);
  const last = to ?? [...eff.keys()].sort().at(-1) ?? from;
  const expected = frozen.sessions.filter((d) => d >= from && d <= last);
  const results = {};

  // 1 FORWARD_LOG_EQUALS_BATCH_REPLAY
  const mismatches = []; const inputRevisions = [];
  let batchFinal = null;
  if (mode === 'SINGLE_RUN_PREFIX') {
    const ds = frozen.at(last); batchFinal = {};
    for (const ref of refs) batchFinal[ref.key] = runRef(ref, ds, from, last);
  }
  for (const t of expected) {
    const e = eff.get(t); if (!e) continue;
    let batch;
    if (mode === 'PIT_PER_SESSION') {
      const ds = frozen.at(t);
      if (e.inputs?.datasetSha256 && e.inputs.datasetSha256 !== datasetSha256(ds)) inputRevisions.push(t);
      batch = sessionRecord(ds, t, { from, refs });
    } else {
      batch = { public: {}, sealed: {} };
      for (const ref of refs) { const st = stateOf(batchFinal[ref.key], t); batch.sealed[ref.key] = { openIds: st.openIds, closed: st.closed }; batch.public[ref.key] = { openPositions: st.openIds.length, closedTrades: st.closed.length, ledgerSha256: st.ledgerSha256, sealedSha256: hashOf(canonicalJson(batch.sealed[ref.key])) }; }
    }
    for (const ref of refs) {
      const f = e.references?.[ref.key], b = batch.public[ref.key];
      if (!f) { mismatches.push({ session: t, key: ref.key, field: 'MISSING_REFERENCE' }); continue; }
      for (const k of ['ledgerSha256', 'sealedSha256', 'openPositions', 'closedTrades']) if (f[k] !== b[k]) mismatches.push({ session: t, key: ref.key, field: k });
      if (mode === 'PIT_PER_SESSION' && canonicalJson(f.counts) !== canonicalJson(b.counts)) mismatches.push({ session: t, key: ref.key, field: 'counts' });
      if (sealedOf) { const s = sealedOf(t, ref.key); if (s && canonicalJson(s) !== canonicalJson(batch.sealed[ref.key])) mismatches.push({ session: t, key: ref.key, field: 'sealed' }); }
    }
  }
  results.FORWARD_LOG_EQUALS_BATCH_REPLAY = { pass: chain.pass && mismatches.length === 0, mode, sessionsCompared: expected.filter((t) => eff.has(t)).length, references: refs.length, mismatches: mismatches.length, firstMismatch: mismatches[0] ?? null, inputsRevisedSessions: inputRevisions.length, firstInputRevision: inputRevisions[0] ?? null, chain: { pass: chain.pass, head: chain.head, errors: chain.errors.length } };

  // 2 NO_MISSING_SESSIONS (and every record written before the next open)
  const missing = expected.filter((t) => !eff.has(t));
  const extra = [...eff.keys()].filter((t) => !expected.includes(t));
  const late = [...eff.values()].filter((e) => { const lim = nextOpenOf(frozen.sessions, e.session); return lim && e.recordedAt > lim && e.type === 'SESSION'; }).map((e) => e.session);
  results.NO_MISSING_SESSIONS = { pass: chain.pass && missing.length === 0 && extra.length === 0 && late.length === 0, expectedSessions: expected.length, recordedSessions: eff.size, missing: missing.length, firstMissing: missing[0] ?? null, extra: extra.length, recordedAfterNextOpen: late.length, corrections: log.filter((e) => e.type === 'CORRECTION').length };

  // 3 RESEARCH_V1_RECONCILED (ledger replay of every reference: every record and the final batch run)
  const unreconciled = [];
  for (const e of eff.values()) for (const ref of refs) if (e.references?.[ref.key]?.reconciliation !== true) unreconciled.push({ session: e.session, key: ref.key });
  const finalDs = frozen.at(last), finalRuns = batchFinal ?? Object.fromEntries(refs.map((ref) => [ref.key, runRef(ref, finalDs, from, last)]));
  const batchUnreconciled = refs.filter((ref) => finalRuns[ref.key].run.reconciliation.pass !== true).map((r) => r.key);
  results.RESEARCH_V1_RECONCILED = { pass: unreconciled.length === 0 && batchUnreconciled.length === 0, accounting: SF6_PAPER_PROTOCOL.references.pinned.accounting, recordsUnreconciled: unreconciled.length, batchUnreconciled };

  // 4 V4D1_FORWARD_CENSUS (diagnostic: counted, never a gate on its own)
  const q = quarantineDataset(finalDs, DQ_POLICIES[PRIMARY_POLICY]);
  const inWindow = q.events.filter((ev) => ev.date >= from && ev.date <= last);
  const tally = (k) => inWindow.reduce((o, ev) => { o[ev[k]] = (o[ev[k]] || 0) + 1; return o; }, {});
  const heldAtFlag = {};
  for (const ref of refs) {
    const led = finalRuns[ref.key].run.ledger;
    heldAtFlag[ref.key] = inWindow.filter((ev) => openIdsFromLedger(led, ev.date).some((id) => id.split('#')[0] === ev.securityId.split('#')[0])).length;
  }
  results.V4D1_FORWARD_CENSUS = { pass: true, status: 'COUNTED_DIAGNOSTIC', policy: PRIMARY_POLICY, flags: inWindow.length, sessionsWithFlags: new Set(inWindow.map((ev) => ev.date)).size, securitiesFlagged: new Set(inWindow.map((ev) => ev.securityId)).size, byDirection: tally('direction'), byKind: tally('kind'), flagsOnHeldPositions: heldAtFlag };

  const ids = Object.keys(results);
  if (canonicalJson(ids) !== canonicalJson([...INTEGRITY_CHECK_IDS])) throw new Error('PAPER_CHECK_SET_DRIFT');
  return { schema: 'sf6-paper-integrity-checks-1.0.0', protocolSha256: sf6PaperProtocolSha256(), window: { from, to: last }, allPass: ids.every((k) => results[k].pass), checks: results };
}
