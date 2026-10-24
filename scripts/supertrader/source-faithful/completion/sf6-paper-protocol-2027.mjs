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
 */
import crypto from 'node:crypto';

export const SF6_PAPER_PROTOCOL = Object.freeze({
  id: 'SF6-PAPER-2027', version: '1.0.0', fixedOn: '2026-10-24', ownerDecision: 'E2',
  window: Object.freeze({ start: '2027-01-01', minimumSessions: 250, earliestEvaluation: 'after the 250th session from the start (about 2027-12-31)', interim: 'counts only; no metric is opened, no decision is taken before the earliest evaluation' }),
  activation: Object.freeze({ status: 'NOT_ACTIVATED', requires: 'explicit owner approval in a separate PR (recording workflow, storage, retention)', scheduler: 'NONE', orders: 'NONE', broker: 'NONE', productSurface: 'NONE' }),
  references: Object.freeze({
    scope: 'the 11 snapshot references of Supertrader 6.0, unchanged: Turtle S1 / S2 (BASE_S0), Minervini SEPA / Power Play (REF), Darvas, Kullamaegi Breakout, Pocket Pivot, Buyable Gap-Up, Weinstein Investor / Trader, Holy Grail W-RAS97 (REF)',
    pinned: Object.freeze({ turtleEngineCodeSha256: 'ae2a51ed86ae4d3ca10fcf263e1eb266437bbed851943e14dc1a984a3fd797a0', minerviniResearchCodeSha256: 'b1d81fb8b67a167284868f2fcc473d66f1a78a43c7f544789ffca232a18da13c', minerviniVariantRegistrySha256: 'f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75', sf5VariantRegistrySha256: '0a1260e9d087b1cde8176b66134e19b32222f94653d46df31c495d02552940da', accounting: 'research-v1', portfolioPolicy: 'VU-SF5-EQUITY-RESEARCH-PORTFOLIO 1.0.0 / VU-MIN-EQUITY-RESEARCH-PORTFOLIO 1.0.0' }),
    notInScope: Object.freeze(['SF6 model variants (research variants, E3)', 'Kullamaegi Episodic Pivot / Parabolic Short (would need new intraday collection, E5)', 'SIC-based Turtle correlation limits (research proxy, E4)']),
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
