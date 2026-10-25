/**
 * Supertrader 6.0 – prospective paper validation protocol SF6-PAPER-2027 (owner decision E2, 2026-10-24).
 *
 * The only untouched out-of-sample window of the platform: sessions from 2027-01-01 on, which no development, review or
 * earlier round has seen. The protocol is fixed (fingerprint pinned in test sf-sf6-readiness) BEFORE the window opens.
 * This file is a protocol, not an activation:
 *  - no scheduler, no workflow, no cron, no recording job is created by Supertrader 6.0;
 *  - starting the recording needs a separate, explicit owner approval (ACTIVATION.status below);
 *  - paper only: no broker, no order, no signal published to any product page, LIVE_NOT_APPROVED throughout.
 * Any change to a pinned reference, its code or this protocol after 2027-01-01 voids the window and restarts it with a new
 * protocol version (never a silent edit).
 *
 * 1.1.0 (2026-10-25, owner decision E7-3; docs/SUPERTRADER_7_OPTIMISTIC_FIXES.md): the SF7-D3 / SF7-D4 fixes of the
 * OPTIMISTIC readings changed two pinned code fingerprints (methods/turtle.mjs, research/minervini-lifecycle.mjs and the
 * sf4 runner). The references themselves are unchanged: the snapshot reruns reproduce every reference ledger and trade
 * hash (referenceIdentity). 1.1.0 pins the new fingerprints; 1.0.0 is recorded as superseded and was never activated.
 * Still PREPARED_NOT_ACTIVE: no scheduler, no workflow, no activation.
 */
import crypto from 'node:crypto';

export const SF6_PAPER_PROTOCOL = Object.freeze({
  id: 'SF6-PAPER-2027', version: '1.1.0', fixedOn: '2026-10-25', ownerDecision: 'E2; E7-3 (1.1.0)',
  supersedes: Object.freeze({ version: '1.0.0', fixedOn: '2026-10-24', sha256: 'c90c30bcf0186549aeb672ffc124b3b24d7b321288f0e78798a3a0cfc3bd5e8f', status: 'SUPERSEDED_BY_1_1_0_NEVER_ACTIVATED', pinned: Object.freeze({ turtleEngineCodeSha256: 'ae2a51ed86ae4d3ca10fcf263e1eb266437bbed851943e14dc1a984a3fd797a0', minerviniResearchCodeSha256: 'b1d81fb8b67a167284868f2fcc473d66f1a78a43c7f544789ffca232a18da13c' }), why: 'SF7-D3 / SF7-D4 (E7-3): corrected OPTIMISTIC readings as new versioned variants; the code fingerprints changed, the references did not' }),
  window: Object.freeze({ start: '2027-01-01', minimumSessions: 250, earliestEvaluation: 'after the 250th session from the start (about 2027-12-31)', interim: 'counts only; no metric is opened, no decision is taken before the earliest evaluation' }),
  activation: Object.freeze({ status: 'NOT_ACTIVATED', requires: 'explicit owner approval in a separate PR (recording workflow, storage, retention)', scheduler: 'NONE', orders: 'NONE', broker: 'NONE', productSurface: 'NONE' }),
  references: Object.freeze({
    scope: 'the 11 snapshot references of Supertrader 6.0, unchanged: Turtle S1 / S2 (BASE_S0), Minervini SEPA / Power Play (REF), Darvas, Kullamaegi Breakout, Pocket Pivot, Buyable Gap-Up, Weinstein Investor / Trader, Holy Grail W-RAS97 (REF)',
    pinned: Object.freeze({ turtleEngineCodeSha256: '89fbcf864a57041379bc62d4af64cfda7c5601aaaf1c08b38fd6b91b6472ef24', minerviniResearchCodeSha256: 'c834b227045b758f78dcf417f188cbf663f4153433395113e06ee81e54b7f30f', minerviniVariantRegistrySha256: 'f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75', sf5VariantRegistrySha256: '0a1260e9d087b1cde8176b66134e19b32222f94653d46df31c495d02552940da', accounting: 'research-v1', portfolioPolicy: 'VU-SF5-EQUITY-RESEARCH-PORTFOLIO 1.0.0 / VU-MIN-EQUITY-RESEARCH-PORTFOLIO 1.0.0' }),
    referenceIdentity: Object.freeze({ snapshotId: 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', turtle: Object.freeze({ runId: '40170829944', comparedWith: '39397517900', result: 'BASE_S0 and every other pre-registered scenario of S1 / S2: public block identical (ledgerSha256, trades, counts)' }), minervini: Object.freeze({ runId: '40170832007', comparedWith: '39746264325', result: 'REF and every registered variant of SEPA / Power Play: public block identical (ledgerSha256, tradesSha256, counts)' }) }),
    notInScope: Object.freeze(['SF6 model variants (research variants, E3)', 'the SF7 execution variants (ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE, SF7-*-CLOSE-RULE: research bounds, E7-3)', 'Kullamaegi Episodic Pivot / Parabolic Short (would need new intraday collection, E5)', 'SIC-based Turtle correlation limits (research proxy, E4)']),
  }),
  data: Object.freeze({
    source: 'the existing daily price pipeline of the platform (no new provider, no new paid data)',
    freezing: 'the forward sessions are frozen as research snapshot generations through the existing capture / restore path; the retention cap (3 full generations, 2 in use: DEV, HOLDOUT) needs an owner decision on retention before activation',
    pit: 'decisions of session t use only data up to the close of t; corporate actions only as known at t',
  }),
  recording: Object.freeze({
    perSession: 'after each close: the setups, orders armed for the next session and the open positions of every reference, appended to an owner-sealed, hash-chained log before the next open',
    noRewrite: 'an entry is never changed; a correction is a new entry referencing the old one',
  }),
  evaluation: Object.freeze({
    integrityChecks: Object.freeze(['FORWARD_LOG_EQUALS_BATCH_REPLAY: a batch re-run on the frozen forward snapshot reproduces the forward log (no look-ahead, no silent data revision)', 'NO_MISSING_SESSIONS: every session of the window logged', 'RESEARCH_V1_RECONCILED: ledger replay of every reference', 'V4D1_FORWARD_CENSUS: flagged sessions of the forward window counted with the SF6 detector (diagnostic)']),
    measures: 'the metrics of runner/metrics.mjs, sealed; compared with the distribution of the DEV and HOLDOUT runs (counts and distributions only, E6)',
    cc8: 'CC-8 is evidenced for a reference when the window reached the earliest evaluation and every integrity check passed; performance is never a criterion of CC-8',
    noTuning: 'no parameter, universe, cost or policy change during the window',
  }),
  status: 'PREPARED_NOT_ACTIVE',
});

export function sf6PaperProtocolSha256() { return crypto.createHash('sha256').update(JSON.stringify(SF6_PAPER_PROTOCOL)).digest('hex'); }
