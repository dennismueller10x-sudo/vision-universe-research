/**
 * SF6-PAPER-2027 – the owner switch (package FP-ST-02 / CC-8; docs/SUPERTRADER_PAPER_2027_ACTIVATION.md).
 *
 * The protocol (1.1.0: completion/sf6-paper-protocol-2027.mjs, fingerprint e623b336… pinned in sf-sf6-readiness;
 * 1.2.0 with the forward data path: completion/sf6-paper-protocol-2027-v1_2_0.mjs) is NOT edited by the activation: it
 * stays the fixed object the window is evaluated against, and CC-8 evidence counts only under its fingerprint. The activation is this separate record. It names the protocol fingerprint it activates and
 * the owner decisions the protocol leaves open (retention, PS-C02-SAMPLE-COUNT, forward data path).
 *
 * The recording workflow (.github/workflows/supertrader-paper-2027.yml) asks activationState() first and does nothing
 * unless it says ACTIVE. In this PR the switch is OFF (activated: false, every decision null).
 */
import crypto from 'node:crypto';
import { canonicalJson } from '../../snapshot/contract.mjs';
import * as L from '../../validation/lib.mjs';
import { SF6_PAPER_PROTOCOL_VERSIONS, currentPaperProtocol, referenceIdentityShown } from '../completion/sf6-paper-protocol-2027-v1_2_0.mjs';

// 1.2.0 (FP-ST-02 V5, docs/SUPERTRADER_PAPER_2027_FORWARD_PATH.md): the guard knows every protocol version
// (SF6_PAPER_PROTOCOL_VERSIONS) and accepts only the current one (1.2.0 when present). An activation naming 1.1.0 is
// PROTOCOL_SUPERSEDED; while 1.2.0 has no shown reference identity the guard reports REFERENCE_IDENTITY_NOT_SHOWN.
const CURRENT = currentPaperProtocol(), SF6_PAPER_PROTOCOL = CURRENT.protocol, sf6PaperProtocolSha256 = CURRENT.sha256;

export const ACTIVATION_SCHEMA = 'sf6-paper-activation-1.0.0';
/**
 * The protocol fingerprint this activation is for: 1.2.0 in its current (draft) form. Filling in the owner runs changes
 * the 1.2.0 fingerprint; this constant is then updated in the same commit (test PAPER-2027-SWITCH fails otherwise).
 * 1.1.0 (e623b336…) is superseded and never activated.
 */
export const ACTIVATED_PROTOCOL_SHA256 = '1c23911cb771bf254271f3f1f625141fe190d89f376cfe863a8c6e4ef1f3b875';

/** Allowed answers of the owner decisions (docs/SUPERTRADER_PAPER_2027_ACTIVATION.md, section "Entscheidungen"). */
export const DECISION_OPTIONS = Object.freeze({
  // PS-C02-SAMPLE-COUNT (CERT-PREP-TOP5-PLAN C02-SAMPLE): COUNT_ONLY keeps protocol 1.1.0 (250 sessions, count reported);
  // MIN_CLOSED_TRADES / LONGER_WINDOW change evaluation.cc8 or window.minimumSessions = a new protocol version, fixed
  // before 2027-01-01.
  sampleCount: Object.freeze(['COUNT_ONLY', 'MIN_CLOSED_TRADES', 'LONGER_WINDOW']),
  // data.freezing: where the frozen forward sessions live (cap snapshot/contract.mjs RETENTION.maxGenerations = 3, two
  // used by DEV and HOLDOUT, the third wanted by FP-ST-01 as well; deleting a generation is locked in the driver and an
  // owner decision, docs/SUPERTRADER_DURABLE_RESEARCH_SNAPSHOTS.md). Smoke generations have their own cap and free
  // nothing here.
  retention: Object.freeze(['RAISE_CAP_TO_4_FORWARD_GENERATION', 'SHARE_THIRD_GENERATION_WITH_FP_ST_01', 'OWNER_DELETES_ONE_FULL_GENERATION']),
  // forward data path of the recording (see FORWARD_DATA_PATHS)
  dataSource: Object.freeze(['RESEARCH_FORWARD_WINDOW']),
});

/**
 * Forward data paths. 1.1.0 had none (FORWARD_DATA_PATH_NOT_IMPLEMENTED): the research loader knew DEV and HOLDOUT only.
 * 1.2.0: validation/lib.mjs FORWARD_WINDOW PAPER_2027 (rolling end ST_WINDOW_TO = t) and paper/forward-source.mjs on the
 * unchanged research loader. IMPLEMENTED only when the current protocol defines the path and lib.mjs has the window.
 */
const forwardImplemented = Boolean(SF6_PAPER_PROTOCOL.data.forwardPath && L.FORWARD_WINDOW && L.FORWARD_WINDOW.from === SF6_PAPER_PROTOCOL.window.firstSession);
export const FORWARD_DATA_PATHS = Object.freeze({
  RESEARCH_FORWARD_WINDOW: Object.freeze({
    status: forwardImplemented ? 'IMPLEMENTED' : 'NOT_IMPLEMENTED', reason: 'FORWARD_DATA_PATH_NOT_IMPLEMENTED',
    needs: forwardImplemented ? `ST_WINDOW=${L.FORWARD_WINDOW.name} ST_WINDOW_TO=<session> in the recording process (paper/forward-source.mjs#assertForwardWindow)` : 'validation/lib.mjs FORWARD_WINDOW PAPER_2027 and protocol 1.2.0 data.forwardPath',
    load: async (session, opts) => (await import('./forward-source.mjs')).loadForwardSource(session, opts),
  }),
});

export const SF6_PAPER_ACTIVATION = Object.freeze({
  schema: ACTIVATION_SCHEMA,
  protocol: Object.freeze({ id: SF6_PAPER_PROTOCOL.id, version: SF6_PAPER_PROTOCOL.version, sha256: ACTIVATED_PROTOCOL_SHA256 }),
  // ---- OWNER SWITCH --------------------------------------------------------------------------------------------
  activated: false,
  approval: null, // { by, on: 'YYYY-MM-DD', pr: <number> } – required with activated: true
  decisions: Object.freeze({ sampleCount: null, retention: null, dataSource: null }),
  // ---------------------------------------------------------------------------------------------------------------
  recording: Object.freeze({
    notBefore: SF6_PAPER_PROTOCOL.window.start, firstSession: '2027-01-04',
    log: 'scripts/supertrader/source-faithful/paper/log/SF6-PAPER-2027.jsonl',
    sealed: 'scripts/supertrader/source-faithful/paper/log/sealed/<seq>-<session>.sealed.json, one per entry (encrypted for the owner, validation/results-public-key.pem; the public entry carries the plaintext sha256 per reference)',
    retentionOfRecords: 'log and sealed parts in the repository on main, append-only (run-paper-2027.mjs verify against the committed log before every commit; the commit adds files, the log only grows), never deleted, kept at least until the CC-8 evaluation is closed and as long as any certification relies on it; every commit anchors the chain head',
  }),
  scheduler: 'GUARDED_WORKFLOW', orders: 'NONE', broker: 'NONE', productSurface: 'NONE', liveReadiness: 'LIVE_NOT_APPROVED',
});

export function activationSha256(a = SF6_PAPER_ACTIVATION) { return crypto.createHash('sha256').update(canonicalJson(a)).digest('hex'); }

/**
 * Current pins against the protocol (the same comparison as test SF6-PAPER-PROTOCOL-2027). A mismatch after the
 * window start voids the window (protocol header); it is reported, never re-pinned here.
 */
export async function pinCheck() {
  const { codeSha256 } = await import('../runner/run-research.mjs');
  const { researchCodeSha256 } = await import('../research/run-sf4-lifecycle.mjs');
  const { variantRegistrySha256 } = await import('../research/minervini-lifecycle.mjs');
  const { sf5VariantRegistrySha256 } = await import('../research/sf5-lifecycles.mjs');
  const P = SF6_PAPER_PROTOCOL.references.pinned; // pins of the current protocol version (1.2.0 when present)
  const now = { turtleEngineCodeSha256: codeSha256(), minerviniResearchCodeSha256: researchCodeSha256(), minerviniVariantRegistrySha256: variantRegistrySha256(), sf5VariantRegistrySha256: sf5VariantRegistrySha256() };
  const rows = Object.entries(now).map(([k, v]) => ({ pin: k, pinned: P[k], current: v, equal: P[k] === v }));
  return { pass: rows.every((r) => r.equal), rows };
}

/**
 * Decision of the workflow guard. state:
 *   INACTIVE   the switch is off or the window has not started: the workflow does nothing (green, no commit)
 *   ACTIVE     record the session
 *   BLOCKED    switched on but a precondition is missing or broken: red run, no record (never a silent skip)
 */
export async function activationState({ today, activation = SF6_PAPER_ACTIVATION, pins = null } = {}) {
  const reasons = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) throw new Error('PAPER_TODAY_REQUIRED');
  if (activation.activated !== true) return { state: 'INACTIVE', reasons: ['NOT_ACTIVATED'], activationSha256: activationSha256(activation) };
  if (activation.protocol.sha256 !== sf6PaperProtocolSha256()) {
    const known = SF6_PAPER_PROTOCOL_VERSIONS.find((v) => v.sha256() === activation.protocol.sha256);
    reasons.push(known ? `PROTOCOL_SUPERSEDED:${known.version}` : 'PROTOCOL_FINGERPRINT_MISMATCH');
  }
  if (!referenceIdentityShown(SF6_PAPER_PROTOCOL)) reasons.push('REFERENCE_IDENTITY_NOT_SHOWN');
  if (!activation.approval || !activation.approval.by || !/^\d{4}-\d{2}-\d{2}$/.test(activation.approval.on || '') || !Number.isInteger(activation.approval.pr)) reasons.push('OWNER_APPROVAL_MISSING');
  else if (activation.approval.on >= activation.recording.notBefore) reasons.push('APPROVAL_AFTER_WINDOW_START');
  for (const [k, opts] of Object.entries(DECISION_OPTIONS)) {
    const v = activation.decisions[k];
    if (v === null || v === undefined) reasons.push(`DECISION_MISSING:${k}`);
    else if (!opts.includes(typeof v === 'object' ? v.option : v)) reasons.push(`DECISION_INVALID:${k}`);
  }
  const src = activation.decisions.dataSource && FORWARD_DATA_PATHS[activation.decisions.dataSource];
  if (src && src.status !== 'IMPLEMENTED') reasons.push(src.reason);
  const p = pins ?? (await pinCheck());
  if (!p.pass) reasons.push(...p.rows.filter((r) => !r.equal).map((r) => `PIN_MISMATCH:${r.pin}`));
  if (reasons.length) return { state: 'BLOCKED', reasons, activationSha256: activationSha256(activation) };
  if (today < activation.recording.notBefore) return { state: 'INACTIVE', reasons: ['BEFORE_WINDOW_START'], activationSha256: activationSha256(activation) };
  return { state: 'ACTIVE', reasons: [], activationSha256: activationSha256(activation) };
}
