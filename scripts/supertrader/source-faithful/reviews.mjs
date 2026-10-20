/**
 * Independent adversarial reviews of the source-faithful work (mandate section 19). Four reviewers, each with its own
 * focus, read the code on branch claude/sf-09-registry-final (SF-1 .. SF-8 stacked) and probed it with synthetic data.
 * Every finding is listed with its resolution; a finding is FIXED only with the test that now covers it.
 * Rule for READY components: no open HIGH / CRITICAL finding (checked by build-artifacts.mjs).
 */
export const REVIEWS = Object.freeze([
  { id: 'SF-R1', focus: 'Source fidelity: Turtle, Darvas, Weinstein, contract.mjs', findings: [
    { id: 'SF-R1-01', severity: 'HIGH', title: 'Turtle adds measured from the newest held unit, not the last actual fill; re-adds after a unit stop raised stops beyond 1.5N', rules: ['TUR-ADD', 'TUR-STOPADD'], status: 'FIXED', fix: 'pos.lastFill is the last actual fill; after a unit stop-out no further adds (re-add = optional Whipsaw re-entry, not implemented)', test: 'sf-turtle.test.mjs: GC-TUR-NO-READD-AFTER-UNIT-STOP' },
    { id: 'SF-R1-02', severity: 'HIGH', title: 'Weinstein MA gate tested the prior close instead of the buy-stop price; Stage 1 -> 2 breakouts crossing the MA in the breakout week were rejected', rules: ['WEIN-MA', 'WEIN-S2'], status: 'FIXED', fix: 'gate on trigger > MA30w and MA not falling; prior close vs MA reported as evidence', test: 'sf-weinstein.test.mjs: GC-WEIN-BREAKOUT-CROSSES-MA' },
    { id: 'SF-R1-03', severity: 'MEDIUM', title: 'S1 filter warm-up over the whole history when `from` is omitted (look-ahead in the public API)', rules: ['TUR-S1SKIP'], status: 'FIXED', fix: 'warm-up only on bars before the first calendar date', test: 'sf-turtle.test.mjs: SF-TUR-WARMUP-CAUSAL' },
    { id: 'SF-R1-04', severity: 'MEDIUM', title: 'Darvas default bottom search discarded lows traded during the top confirmation', rules: ['DAR-Q2', 'DAR-Q7'], status: 'FIXED', fix: 'default AFTER_TOP_DAY (unresolved start stays SOURCE_AMBIGUOUS, both variants kept)', test: 'sf-darvas.test.mjs: GC-DAR-BOTTOM-CONFIRM, GC-DAR-BOTTOM-START-VARIANTS' },
    { id: 'SF-R1-05', severity: 'MEDIUM', title: 'Undeclared liquidity filter in the Darvas component study', rules: ['DAR-Q10'], status: 'FIXED', fix: 'declared as DAR-SF-RESEARCH-POPULATION (measurement convention of #705, not a Darvas rule); the review screen has no such filter', test: 'sf-runner.test.mjs: SF-RUN-COMPONENT' },
    { id: 'SF-R1-06', severity: 'LOW', title: 'Turtle exit marked SOURCE_EXACT although it adds the one-tick convention', rules: ['TUR-S1EX', 'TUR-S2EX'], status: 'FIXED', fix: 'SOURCE_DERIVED with derivation', test: 'sf-foundation.test.mjs: SF-CONTRACTS' },
    { id: 'SF-R1-07', severity: 'LOW', title: 'Preference-as-gate check was opt-in (only for gate: true)', rules: [], status: 'FIXED', fix: 'implemented EXACT / DERIVED rules on a DO_NOT_HARDEN #709 rule must state gate true / false (GATE_FLAG_REQUIRED)', test: 'sf-foundation.test.mjs: SF-CONTRACTS' },
    { id: 'SF-R1-08', severity: 'LOW', title: 'TUR-CONSISTENT cited for "no regime filter"; it means "consistently omit pre-excluded markets"', rules: ['TUR-CONSISTENT'], status: 'FIXED', fix: 'mapped to TUR-SF-MARKETS', test: 'sf-foundation.test.mjs: SF-CONTRACTS' },
  ] },
  { id: 'SF-R2', focus: 'Source fidelity of the screens (Minervini, Kullamaegi, Morales/Kacher, Holy Grail) and registry consistency', findings: [
    { id: 'SF-R2-01', severity: 'MEDIUM', title: 'Power Play scan picked the oldest qualifying peak; an older higher peak hid a newer valid Power Play', rules: ['MIN-PP-02', 'MIN-PP-04'], status: 'FIXED', fix: 'most recent peak that is the highest high of its own run-up leg', test: 'sf-minervini.test.mjs: SF-MIN-PP-NEWER-PEAK' },
    { id: 'SF-R2-02', severity: 'MEDIUM', title: 'Holy Grail "first pullback" hard-rejected later touches; gateExemption accepted any free text', rules: ['RAS04-001'], status: 'FIXED', fix: 'gate only ADX > 30 + 20 EMA touch (C13 core); first pullback is evidence + review flag; exemptions limited to GATE_EXEMPTIONS with candidate and rule', test: 'sf-holy-grail.test.mjs: GC-RAS-SECOND-PULLBACK-NOT-FIRST; sf-foundation.test.mjs: SF-VALIDATOR' },
    { id: 'SF-R2-03', severity: 'LOW', title: 'Power Play consolidation without any length signal', rules: ['MIN-PP-03'], status: 'FIXED', fix: 'review question beyond the printed 3-6 weeks; no maximum invented', test: 'sf-minervini.test.mjs: SF-MIN-PP-NEWER-PEAK' },
    { id: 'SF-R2-04', severity: 'LOW', title: 'IPO-scope names never reach review although the contract said "reported"', rules: ['MIN-MM-IPO-01'], status: 'DOCUMENTED', fix: 'contract text corrected: the SEPA screen does not emit them; IPO handling is the reviewer\'s', test: null },
    { id: 'SF-R2-05', severity: 'LOW', title: 'Missing gap-day volume became a megacap exception record', rules: ['MOKA24-VOL'], status: 'FIXED', fix: 'MISSING_DATA', test: 'sf-morales-kacher.test.mjs: SF-MOKA-BGU-MISSING-DATA' },
    { id: 'SF-R2-06', severity: 'LOW', title: 'Unsourced 50-session volume window decided BGU eligibility', rules: ['MOKA24-VOL'], status: 'FIXED', fix: 'without the window the gap is still evaluated, volume goes to review', test: 'sf-morales-kacher.test.mjs: SF-MOKA-BGU-MISSING-DATA' },
    { id: 'SF-R2-07', severity: 'LOW', title: 'Power Play derivation text did not match the code', rules: ['MIN-PP-02'], status: 'FIXED', fix: 'text aligned', test: null },
  ] },
  { id: 'SF-R3', focus: 'Temporal integrity, execution and research-v1 accounting', findings: [
    { id: 'SF-R3-01', severity: 'MEDIUM', title: 'S1 filter warm-up look-ahead without `from` (same as SF-R1-03)', rules: ['TUR-S1SKIP'], status: 'FIXED', fix: 'see SF-R1-03', test: 'sf-turtle.test.mjs: SF-TUR-WARMUP-CAUSAL' },
    { id: 'SF-R3-02', severity: 'MEDIUM', title: 'Receipt did not record the --limit subset', rules: [], status: 'FIXED', fix: 'limit, smoke store, computed segment hash and count in receipt params and public view', test: 'sf-runner.test.mjs: SF-RUN-RESULT' },
    { id: 'SF-R3-03', severity: 'MEDIUM', title: 'Darvas component trades open at a delisting valued at the last close only', rules: [], status: 'FIXED', fix: 'end states split; delisting / data-gap trades also under the -30 % scenario', test: 'sf-runner.test.mjs: SF-RUN-COMPONENT-DELISTING' },
    { id: 'SF-R3-04', severity: 'LOW', title: 'S1 filter used a resolution on the same bar regardless of intrabar order', rules: ['TUR-S1SKIP'], status: 'FIXED', fix: 'filter state before the bar unless the resolution happened at the open; counted as filterResolvedIntrabar', test: 'sf-turtle.test.mjs: GC-TUR-S1-SKIP-WINNER' },
    { id: 'SF-R3-05', severity: 'LOW', title: 'Cost counter booked slippage on haircut delisting settlements that carry none', rules: [], status: 'FIXED', fix: 'settlement slippage rate passed explicitly', test: 'sf-turtle.test.mjs: SF-TUR-TERMINAL' },
    { id: 'SF-R3-06', severity: 'LOW', title: 'Metrics started at the first curve point instead of the initial capital; profit factor null for "no losses"', rules: [], status: 'FIXED', fix: 'initial capital prepended; profitFactorUndefined reason', test: 'sf-runner.test.mjs: SF-METRICS' },
    { id: 'SF-R3-07', severity: 'LOW', title: 'runMethod accepted any dataset with a well-formed snapshot id', rules: [], status: 'FIXED', fix: 'datasetSha256 mandatory (DATASET_SHA_REQUIRED); binding checked in main', test: 'sf-runner.test.mjs: SF-RUN-COMPONENT' },
  ] },
  { id: 'SF-R4', focus: 'Snapshot integrity, data coverage, legacy isolation, security, test isolation', findings: [
    { id: 'SF-R4-01', severity: 'MEDIUM', title: 'CODE_VERSION_CHANGED accepted silently by the runner', rules: [], status: 'FIXED', fix: 'refused unless --allow-code-version-change; datasetVerified / codeVersionChanged / manifest dataset hash in the receipt', test: 'sf-runner.test.mjs: SF-RUN-WORKFLOW' },
    { id: 'SF-R4-02', severity: 'MEDIUM', title: 'Smoke / limit runs indistinguishable in the receipt (same as SF-R3-02)', rules: [], status: 'FIXED', fix: 'see SF-R3-02', test: 'sf-runner.test.mjs: SF-RUN-RESULT' },
    { id: 'SF-R4-03', severity: 'MEDIUM', title: 'Component study without delisting treatment and coverage disclosure (same as SF-R3-03)', rules: [], status: 'FIXED', fix: 'see SF-R3-03; dataCoverage, survivorship and V4-D1 added', test: 'sf-runner.test.mjs: SF-RUN-COMPONENT-DELISTING' },
    { id: 'SF-R4-04', severity: 'MEDIUM', title: 'research-v1 silently ignored by modes whose runner cannot use it', rules: [], status: 'FIXED', fix: 'same mode allow-list for research-v1 as for snapshots (SNAPSHOT_OR_ACCOUNTING_NOT_SUPPORTED_FOR_MODE)', test: 'sf-foundation.test.mjs: SF-WORKFLOW' },
    { id: 'SF-R4-05', severity: 'LOW', title: 'Zero-cost guard does not meter snapshot consumer reads (inherited from analyze-methods, not a regression)', rules: [], status: 'ACCEPTED_DOCUMENTED', fix: 'documented; metering the consumer reads belongs to the snapshot module and analyze-methods together (own PR)', test: null },
    { id: 'SF-R4-06', severity: 'LOW', title: 'Commit marker overrides the dispatch input', rules: [], status: 'DOCUMENTED', fix: 'precedence documented in the workflow header', test: null },
  ] },
]);

export function reviewSummary() {
  const all = REVIEWS.flatMap((r) => r.findings);
  const by = (k) => Object.fromEntries(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => [s, all.filter((f) => f.severity === s && k(f)).length]));
  return { reviewers: REVIEWS.length, findings: all.length, bySeverity: by(() => true), openBySeverity: by((f) => !['FIXED', 'DOCUMENTED', 'ACCEPTED_DOCUMENTED'].includes(f.status)), openHighOrCritical: all.filter((f) => ['HIGH', 'CRITICAL'].includes(f.severity) && f.status !== 'FIXED').length };
}
