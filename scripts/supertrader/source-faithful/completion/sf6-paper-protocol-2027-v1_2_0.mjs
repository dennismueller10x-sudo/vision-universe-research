/**
 * Supertrader – SF6-PAPER-2027 protocol version 1.2.0 (forward data path, FP-ST-02 V5;
 * docs/SUPERTRADER_PAPER_2027_FORWARD_PATH.md). Added ALONGSIDE 1.1.0: sf6-paper-protocol-2027.mjs stays byte-identical
 * (fingerprint e623b336… pinned in sf-sf6-readiness) and is the version this one supersedes once it is fixed.
 *
 * Change against 1.1.0: the forward window PAPER_2027 in validation/lib.mjs (warm-up from 2026-01-02, first session
 * 2027-01-04, rolling end = the recorded session t, own private series namespace tiingo-paper-2027, listing as-of date =
 * t) and the forward loader paper/forward-source.mjs on the unchanged research loader. lib.mjs is one of the files of the
 * Turtle engine fingerprint (runner/run-research.mjs#codeSha256), so turtleEngineCodeSha256 changes; every other pin is
 * unchanged. The references themselves are unchanged: DEV and HOLDOUT are byte-identical on the fixtures (test
 * PAPER-2027-FWD-DEV-HOLDOUT-IDENTITY) and must be shown identical again on the frozen snapshot by the owner runs below
 * (as 1.1.0 did, E7-3).
 *
 * Status PREPARED_NOT_ACTIVE (fixed 2026-11-04): referenceIdentity shown by the runs R1-R6 (identical public blocks on the
 * frozen DEV snapshot, two exact restores each of DEV and HOLDOUT); the fingerprint of this version is pinned in
 * sf-sf6-readiness and named by the activation record. The switch itself stays off until its own commit.
 */
import crypto from 'node:crypto';
import { SF6_PAPER_PROTOCOL as V110, sf6PaperProtocolSha256 as v110Sha256 } from './sf6-paper-protocol-2027.mjs';

/** Fingerprint of 1.1.0 at the time 1.2.0 was prepared (pinned in sf-sf6-readiness); 1.1.0 itself is not edited. */
export const SUPERSEDED_1_1_0_SHA256 = 'e623b336cd24a49e04b4588ab5b06c06d6226a323b368d4c659f2d7ce4b64f66';

const SNAPSHOT_DEV = 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d';
const DISPATCH = '.github/workflows/supertrader-validation.yml (workflow_dispatch on the 1.2.0 branch)';
const SNAPSHOT_WF = '.github/workflows/supertrader-research-snapshot.yml (commit marker on the 1.2.0 branch)';

export const SF6_PAPER_PROTOCOL_1_2_0 = Object.freeze({
  id: 'SF6-PAPER-2027', version: '1.2.0', fixedOn: '2026-11-04', preparedOn: '2026-11-03', ownerDecision: 'E2; E7-3 (1.1.0); FP-ST-02 V5 (1.2.0) entschieden 04.11.2026, Owner-Regel Neustart (docs/PLAN_NEUSTART_2026-11.md)',
  supersedes: Object.freeze({ version: V110.version, fixedOn: V110.fixedOn, sha256: SUPERSEDED_1_1_0_SHA256, status: 'SUPERSEDED_BY_1_2_0_NEVER_ACTIVATED', pinned: Object.freeze({ turtleEngineCodeSha256: V110.references.pinned.turtleEngineCodeSha256 }), why: 'forward data path: validation/lib.mjs window PAPER_2027 (file of the Turtle engine fingerprint); references unchanged' }),
  window: Object.freeze({ ...V110.window, firstSession: '2027-01-04' }),
  activation: V110.activation,
  references: Object.freeze({
    scope: V110.references.scope,
    pinned: Object.freeze({ ...V110.references.pinned, turtleEngineCodeSha256: '5e6683d4ebf4f6c4257b0bfbc4a3fcb6608973ddb0876a0ef077bf9d4cccecec' }),
    unchangedPins: Object.freeze(['minerviniResearchCodeSha256', 'minerviniVariantRegistrySha256', 'sf5VariantRegistrySha256', 'accounting', 'portfolioPolicy']),
    referenceIdentity: Object.freeze({
      status: 'SHOWN',
      snapshotId: SNAPSHOT_DEV,
      basis: '1.1.0 referenceIdentity (Turtle 40170829944, Minervini 40170832007) and the sf5 AUTHORITATIVE run 40228392651',
      requiredRuns: Object.freeze([
        Object.freeze({ id: 'R1_TURTLE', workflow: DISPATCH, inputs: Object.freeze({ mode: 'sf-research', snapshot: SNAPSHOT_DEV, accounting: 'research-v1', allow_code_version_change: true }), comparedWith: '40170829944', expect: 'datasetVerified EXACT; every scenario of S1 / S2 (BASE_S0 884d88cb… / 67169e86…) and the Darvas component study with an identical public block; receipt codeSha256 = the 1.2.0 turtleEngineCodeSha256' }),
        Object.freeze({ id: 'R2_MINERVINI', workflow: DISPATCH, inputs: Object.freeze({ mode: 'sf4-lifecycle', snapshot: SNAPSHOT_DEV, accounting: 'research-v1', allow_code_version_change: true }), comparedWith: '40170832007', expect: 'datasetVerified EXACT; REF and every registered variant of SEPA / Power Play with an identical public block (REF SEPA 1ca52391…, Power Play 877ceb33…)' }),
        Object.freeze({ id: 'R3_SF5', workflow: DISPATCH, inputs: Object.freeze({ mode: 'sf5-lifecycle', snapshot: SNAPSHOT_DEV, accounting: 'research-v1', allow_code_version_change: true }), comparedWith: '40228392651', expect: 'datasetVerified EXACT; the seven sf5 lifecycles (REF and variants) with an identical public block' }),
        Object.freeze({ id: 'R4_RESTORE_DEV', workflow: SNAPSHOT_WF, marker: '[supertrader-snapshot:restore]', comparedWith: 'SNAPSHOT-POINTER.json restores', expect: 'two independent restores of ' + SNAPSHOT_DEV + ': datasetVerified EXACT and replayVerified EXACT with codeVersionChanged true' }),
        Object.freeze({ id: 'R5_RESTORE_HOLDOUT', workflow: SNAPSHOT_WF, marker: '[supertrader-snapshot:restore-holdout]', comparedWith: 'SNAPSHOT-POINTER-HOLDOUT.json restores', expect: 'two independent restores of the holdout snapshot: datasetVerified EXACT and replayVerified EXACT with codeVersionChanged true' }),
        Object.freeze({ id: 'R6_KK_CACHE', workflow: DISPATCH, inputs: Object.freeze({ mode: 'kk-intraday-cache', snapshot: SNAPSHOT_DEV, accounting: 'research-v1', allow_code_version_change: true }), comparedWith: '40228395395', expect: '0 requests (cache only); every public block identical; receipt engineCodeSha256 = the 1.2.0 turtleEngineCodeSha256 (KK_SNAPSHOT_RUNS AUTHORITATIVE carries the engine hash; not a SF6 reference, needed for SF-KK-READINESS)' }),
      ]),
      turtle: '41601470302', minervini: '41604774311', sf5: '41608045341', restoreDev: '41627645169', restoreHoldout: '41628817276', kk: '41864439485',
    }),
    notInScope: V110.references.notInScope,
  }),
  data: Object.freeze({
    ...V110.data,
    forwardPath: Object.freeze({
      window: 'validation/lib.mjs FORWARD_WINDOW PAPER_2027 (ST_WINDOW=PAPER_2027, ST_WINDOW_TO = session t): warmupFrom 2026-01-02, from 2027-01-04, to t; namespace tiingo-paper-2027; listing as-of date t (LISTING_OPTS)',
      loader: 'paper/forward-source.mjs#loadForwardSource: validation/analyze-methods.mjs#loadPitData with snapshot/snapshot.mjs CANONICAL_LOAD (the capture flags), datasetFromPit (validation/lib.mjs adjustSeries, ADR-002) and sec-pit r12 as in run-sf6-validation; cut at t BEFORE adjustment (forward-log.mjs#truncatePit)',
      semantics: 'identical to the research snapshot: split- and dividend-adjusted point in time, delistings from the listing table (LISTING_INACTIVE), same universe rules (buildListingTable, INCLUDED_CLASSES, STORE_ACTIVE from the daily price pipeline), same segments (MAX_GAP_DAYS)',
      producers: 'validation/fetch.mjs --mode forward (prices of non-store listings and SPY up to t), validation/sec-pit.mjs (sec-pit r12, sec-delist r13), both with ST_WINDOW=PAPER_2027 in the forward namespace',
      freezing: 'snapshot/snapshot.mjs capture with ST_WINDOW=PAPER_2027 (supertrader-research-snapshot.yml capture-paper-2027 / restore-paper-2027, own pointer SNAPSHOT-POINTER-PAPER-2027.json); retention per owner decision E-P2',
    }),
  }),
  recording: V110.recording,
  evaluation: V110.evaluation,
  status: 'PREPARED_NOT_ACTIVE',
});

export function sf6PaperProtocol120Sha256() { return crypto.createHash('sha256').update(JSON.stringify(SF6_PAPER_PROTOCOL_1_2_0)).digest('hex'); }

/** Versions of SF6-PAPER-2027 in order; the last one is the version an activation and the forward log refer to. */
export const SF6_PAPER_PROTOCOL_VERSIONS = Object.freeze([
  Object.freeze({ version: V110.version, protocol: V110, sha256: v110Sha256 }),
  Object.freeze({ version: SF6_PAPER_PROTOCOL_1_2_0.version, protocol: SF6_PAPER_PROTOCOL_1_2_0, sha256: sf6PaperProtocol120Sha256 }),
]);
export const currentPaperProtocol = () => SF6_PAPER_PROTOCOL_VERSIONS.at(-1);
/** referenceIdentity shown (owner runs recorded) and the version fixed: the precondition of an activation. */
export const referenceIdentityShown = (p) => p.status === 'PREPARED_NOT_ACTIVE' && (!p.references.referenceIdentity.status || p.references.referenceIdentity.status === 'SHOWN');
