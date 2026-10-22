/**
 * defineContract: fills the foundation bindings every source-faithful contract shares and applies the
 * implementation switch. While `implemented` is false (contract registered, method code not merged yet) every rule
 * is reported as NOT_IMPLEMENTED and keeps its classification as `targetStatus`; nothing is claimed early.
 */
import { CONTRACT_SCHEMA, FOUNDATION, RULE_STATUS } from '../contract.mjs';

export const SF_ROOT = 'scripts/supertrader/source-faithful';

export function defineContract(spec) {
  const implemented = spec.implemented === true;
  const rules = spec.rules.map((r) => {
    if (implemented) return { ...r };
    const { code, tests, ...rest } = r;
    return { ...rest, status: RULE_STATUS.NOT_IMPLEMENTED, targetStatus: r.status, reason: `PLANNED (${spec.plannedIn}): target ${r.status}`, plannedCode: code ?? null, plannedTests: tests ?? [] };
  });
  return {
    schema: CONTRACT_SCHEMA,
    sourceContractVersion: spec.sourceContractVersion ?? '1.0.0',
    implemented,
    plannedIn: spec.plannedIn,
    securityIdentity: FOUNDATION.securityIdentity,
    accountingContract: FOUNDATION.accounting,
    snapshot: { required: true, id: FOUNDATION.snapshotId, contract: FOUNDATION.snapshotContract, liveInputsForbidden: true },
    corporateActionPolicy: { ...FOUNDATION.priceTruth, rule: 'split-adjusted OHLC from the snapshot; raw prices only where a rule names a raw quantity (tick, price floor); no price reconstruction for missing bars' },
    missingDataBehavior: spec.missingDataBehavior ?? 'A missing or non-executable bar produces no decision and no fill (validation/accounting-contract.mjs isExecutableBar); indicators that need an absent bar return null and the rule is not evaluated; nothing is interpolated.',
    reproducibilityReceipt: { writtenBy: `${SF_ROOT}/runner/run-research.mjs`, fields: ['snapshotId', 'datasetSha256', 'accounting', 'codeSha256', 'contractFingerprint', 'params', 'runId', 'commit'] },
    ...spec,
    rules,
  };
}

/**
 * Supertrader 3.0 research evidence attached to a rule (research/*.mjs). It never changes the rule status: a proxy or
 * evidence component is not the source rule, and a DATA_BLOCKED / MANUAL rule stays so (docs/SUPERTRADER_3_*.md).
 */
export const sf3Evidence = (file, fn, tests, note) => Object.freeze({ code: `${SF_ROOT}/research/${file}#${fn}`, tests: Object.freeze(tests.map(([f, id]) => `scripts/supertrader/tests/${f}.test.mjs: ${id}`)), note });

/**
 * Supertrader 4.0 lifecycle evidence (research/minervini-lifecycle.mjs, minervini-execution.mjs): same shape and same
 * rule as sf3Evidence - the lifecycle runs a rule under declared model assumptions, it never changes the rule status.
 */
export const sf4Evidence = sf3Evidence;

/** Shared rule fragments (one definition, referenced by several contracts). */
export const EXCLUDE = Object.freeze({
  futuresOnly: 'futures-only mechanics (contract month, roll); part of ORIGINAL_FUTURES_REPLICATION, which is DATA_BLOCKED (no futures chains in the snapshot)',
  optionalVariant: 'OPTIONAL variant in #709; the default method is implemented, the variant is not',
  executionJudgment: 'execution judgment (order type, fast markets); not modelled, costs follow the research execution convention',
  documentationOnly: 'context or example in #709; documented for the reviewer, not a rule of the machine',
});
