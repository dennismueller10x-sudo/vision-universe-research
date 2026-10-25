/**
 * Supertrader 7.0 – execution revision variants of the shared research engine (research/lifecycle-engine.mjs).
 * Docs: docs/SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md (defect SF7-D1, tests sf-sf7-execution).
 *
 * Defect SF7-D1 (found in the adversarial review of 7.0): on a daily bar on which a BUY_STOP fills by an intraday touch
 * of its level and the low reaches the stop, the engine calls the same-bar stop AMBIGUOUS. That is right while the close
 * lies above the stop (the low may have come before the fill). When the CLOSE lies at or below the stop, the price was at
 * the fill (> stop) and ended the bar at or below the stop, so it crossed the stop after the fill: the stop is CERTAIN.
 * The OPTIMISTIC reading ignored such a certain stop and kept the position (bound too optimistic); the PESSIMISTIC
 * reading exited at the stop already, only labelled "assumed".
 *
 * Correction EX7-SAME-BAR-CLOSE-CONFIRMS-STOP: an execution-logic correction, not a source rule and not a new model
 * choice (it removes an impossible path; no number is added). It is NOT applied to any reference: the Supertrader 5.0
 * references, their registry (sf5-lifecycles.mjs, pinned in SF6-PAPER-2027) and their hashes stay as they are. The
 * correction runs only as declared, versioned variants here (wrapper adapters with the engine flag
 * sameBarCloseConfirmsStop), beside the unchanged variant it is compared with (compareTo):
 *  - SF7-REF-CLOSE-RULE: the reference configuration (PESSIMISTIC). Expected: identical fills, shares and prices; only
 *    the exit reason of the reclassified exits changes (the runner reports ledgerWithoutReasonsEqual and the count);
 *  - SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE: the pre-registered optimistic alternative with the impossible path removed.
 * Only lifecycles whose entry is a BUY_STOP with an intraday touch fill can be affected: Darvas, Holy Grail W-RAS97 and
 * Weinstein Investor / Trader. Kullamaegi Breakout, Pocket Pivot and BGU enter ON_OPEN / ON_CLOSE (no entry-bar ambiguity).
 * Pinned before any snapshot result (test SF7-D1-REFERENCES-UNTOUCHED). Sealed metrics never choose a variant (E6).
 */
import crypto from 'node:crypto';
import { SF5_LIFECYCLES } from './sf5-lifecycles.mjs';

export const SF7_EXECUTION_VERSION = 'sf7-execution-variants-1.0.0';

export const SF7_EXECUTION_REVISIONS = Object.freeze([
  Object.freeze({ id: 'EX7-SAME-BAR-CLOSE-CONFIRMS-STOP', defect: 'SF7-D1', kind: 'EXECUTION_LOGIC_CORRECTION', class: 'MODEL_ASSUMPTION_CORRECTION_NOT_A_SOURCE_RULE', phase: 'INITIAL_STOP', rule: 'BUY_STOP filled by an intraday touch, low <= stop and close <= stop on the fill bar: the same-bar stop is CERTAIN (exit at the stop), in both intrabar readings', why: 'the close is the last print of the bar; a close at or below the stop after a fill above it means the stop traded after the fill. AMBIGUOUS stays for close > stop', engineFlag: 'adapter.sameBarCloseConfirmsStop', appliesTo: 'SF7 variants only; no reference changes' }),
]);

const withCloseRule = (a) => Object.freeze({ ...a, version: `${a.version}+${SF7_EXECUTION_VERSION}`, sameBarCloseConfirmsStop: true });
const lcOf = (key) => SF5_LIFECYCLES.find((l) => l.key === key);
const variant = (key, id, compareTo) => {
  const lc = lcOf(key), base = lc.variants.find((v) => v.id === compareTo);
  if (!base) throw new Error(`SF7_COMPARE_TO_MISSING:${key}:${compareTo}`);
  return Object.freeze({ key, id, compareTo, revision: 'EX7-SAME-BAR-CLOSE-CONFIRMS-STOP', adapter: withCloseRule(lc.adapter), config: base.config });
};

export const SF7_EXECUTION_VARIANTS = Object.freeze([
  variant('DARVAS', 'SF7-REF-CLOSE-RULE', 'REF'),
  variant('DARVAS', 'SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE', 'ALT-INTRABAR-OPTIMISTIC'),
  variant('HOLY_GRAIL_W_RAS97', 'SF7-REF-CLOSE-RULE', 'REF'),
  variant('HOLY_GRAIL_W_RAS97', 'SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE', 'ALT-INTRABAR-OPTIMISTIC'),
  variant('WEINSTEIN_INVESTOR', 'SF7-REF-CLOSE-RULE', 'REF'),
  variant('WEINSTEIN_TRADER', 'SF7-REF-CLOSE-RULE', 'REF'),
]);

/** sha256 of the ledger without the reason field (fills, shares, prices and fees only). */
export function ledgerWithoutReasonsSha256(ledger) {
  return crypto.createHash('sha256').update(JSON.stringify(ledger.map(({ reason, ...row }) => row))).digest('hex'); // eslint-disable-line no-unused-vars
}

export function sf7ExecutionVariantsSha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ version: SF7_EXECUTION_VERSION, revisions: SF7_EXECUTION_REVISIONS, variants: SF7_EXECUTION_VARIANTS.map((v) => ({ key: v.key, id: v.id, compareTo: v.compareTo, revision: v.revision, adapter: v.adapter.version, config: v.config })) })).digest('hex');
}
