/**
 * V4.1 source evidence: a hash-verified, machine-readable extract of the Primary Source Reconstruction (Draft PR #709).
 *
 * #709 is the authoritative source-fidelity evidence. Its files live under docs/supertrader-primary-source-reconstruction/
 * on research/supertrader-primary-source-reconstruction @ 8b766fa4947cb2b564ede7cd850c6a995f57aada. They are not copied
 * into this tree (Supertrader Gate A); this script reads them from a directory (git show / checkout of that commit),
 * verifies every SHA-256 listed in SUPERTRADER-ARTIFACT-MANIFEST.json and writes only the rows the V4.1 acceptance needs:
 * the candidates, the reproducibility and data-requirement rows, all rules of the mapped method contexts, their cases,
 * conflicts, VU gaps and source gaps. Field values are copied verbatim; nothing is re-researched or re-scored here.
 *
 * Usage: node psr709-extract.mjs --psr <dir with the 21 #709 files> [--commit <sha>] [--out <file>]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PSR709 = Object.freeze({
  pullRequest: 709,
  branch: 'research/supertrader-primary-source-reconstruction',
  commit: '8b766fa4947cb2b564ede7cd850c6a995f57aada',
  manifestPath: 'docs/supertrader-primary-source-reconstruction/SUPERTRADER-ARTIFACT-MANIFEST.json',
});
export const DEFAULT_EXTRACT = path.join(HERE, '..', 'v4-1', 'PSR709-EVIDENCE-EXTRACT.json');

/** V4 method id -> #709 candidate and method contexts (rule matrix field `method`). CAN SLIM has no #709 candidate. */
export const METHOD_CONTEXTS = Object.freeze({
  TURTLE_S1_SOURCE: { candidate: 'C01', contexts: ['TURTLE_COMMON_ORIGINAL', 'TURTLE_SYSTEM1', 'TURTLE_WHipsaw'] },
  TURTLE_S2_SOURCE: { candidate: 'C02', contexts: ['TURTLE_COMMON_ORIGINAL', 'TURTLE_SYSTEM2', 'TURTLE_WHipsaw'] },
  DARVAS_LATER_QA: { candidate: 'C03', contexts: ['DARVAS_LATER_QA'] },
  WEINSTEIN_STAGE2_INVESTOR: { candidate: 'C04', contexts: ['WEIN_STAGE_INVESTOR_1988', 'WEIN_MARKET_CONTEXT_1988'] },
  WEINSTEIN_STAGE2_TRADER: { candidate: 'C05', contexts: ['WEIN_STAGE_TRADER_1988', 'WEIN_MARKET_CONTEXT_1988'] },
  MINERVINI_SEPA_VCP: { candidate: 'C06', contexts: ['MIN_SEPA_GROWTH_2013'] },
  MINERVINI_POWER_PLAY: { candidate: 'C07', contexts: ['MIN_POWER_PLAY'] },
  KULLAMAGI_COMMON_BREAKOUT: { candidate: 'C08', contexts: ['Breakout'] },
  KULLAMAGI_EPISODIC_PIVOT: { candidate: 'C09', contexts: ['Episodic Pivot'] },
  KULLAMAGI_PARABOLIC_SHORT: { candidate: 'C10', contexts: ['Parabolic Short'] },
  MORALES_KACHER_POCKET_PIVOT: { candidate: 'C11', contexts: ['PocketPivot', 'PocketPivotExit', 'PocketPivot/BuyableGapUpExits'] },
  MORALES_KACHER_BUYABLE_GAP_UP: { candidate: 'C12', contexts: ['BuyableGapUp', 'BuyableGapUp2024', 'PocketPivot/BuyableGapUpExits'] },
  RASCHKE_HOLY_GRAIL: { candidate: 'C13', contexts: ['HolyGrail2004'] },
  ONEIL_CAN_SLIM: { candidate: null, contexts: ['Original2009chartmethodpartial', 'IBDoperationalization2013', 'MarketSmith2018', 'Laterinstitutionalbasecount'] },
});
/** Reproducibility / data-requirement rows that describe the method as a whole (#709 `method` field). */
export const PRIMARY_CONTEXT = Object.freeze({
  TURTLE_S1_SOURCE: 'TURTLE_SYSTEM1', TURTLE_S2_SOURCE: 'TURTLE_SYSTEM2', DARVAS_LATER_QA: 'DARVAS_LATER_QA',
  WEINSTEIN_STAGE2_INVESTOR: 'WEIN_STAGE_INVESTOR_1988', WEINSTEIN_STAGE2_TRADER: 'WEIN_STAGE_TRADER_1988', MINERVINI_SEPA_VCP: 'MIN_SEPA_GROWTH_2013',
  MINERVINI_POWER_PLAY: 'MIN_POWER_PLAY', KULLAMAGI_COMMON_BREAKOUT: 'Breakout', KULLAMAGI_EPISODIC_PIVOT: 'Episodic Pivot', KULLAMAGI_PARABOLIC_SHORT: 'Parabolic Short',
  MORALES_KACHER_POCKET_PIVOT: 'PocketPivot', MORALES_KACHER_BUYABLE_GAP_UP: 'BuyableGapUp', RASCHKE_HOLY_GRAIL: 'HolyGrail2004', ONEIL_CAN_SLIM: 'IBDoperationalization2013',
});
/** #709 VU gap rows per method (CURRENT-VU-GAP-MATRIX gap_id). */
const VU_GAP = { TURTLE_S1_SOURCE: 'VU-TUR', TURTLE_S2_SOURCE: 'VU-TUR', DARVAS_LATER_QA: 'VU-DAR', WEINSTEIN_STAGE2_INVESTOR: 'VU-WEIN', WEINSTEIN_STAGE2_TRADER: 'VU-WEIN', MINERVINI_SEPA_VCP: 'VU-MIN-LIVE', KULLAMAGI_COMMON_BREAKOUT: 'VU-KK', ONEIL_CAN_SLIM: 'VU-CAN' };

const RULE_FIELDS = ['rule_id', 'trader', 'method', 'rule_area', 'rule_text_paraphrase', 'modal_strength', 'provenance', 'source_id', 'page_location', 'era', 'confidence', 'original_wording_checked', 'hard_coding_clearance'];
const CASE_FIELDS = ['case_id', 'trader', 'ticker', 'company', 'date_or_range', 'setup_family', 'action', 'personal_trade_category', 'entry_price', 'exit_price', 'stop', 'rationale', 'provenance', 'source_id', 'page_location', 'confidence', 'explicit_chart_reference', 'units', 'contracts'];
const REPRO_FIELDS = ['method_id', 'trader', 'method', 'method_kind', 'reproducibility', 'disclosed_component_reproducibility', 'full_personal_trading_replica', 'source_coverage', 'ground_truth_quality', 'vu_feasibility', 'original_english_checked_for_all_rules', 'not_fully_reproducible', 'personal_replication_status', 'source_context_case_ids'];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));

/** Verifies every artifact listed in the #709 manifest; throws on any mismatch or missing file. */
export function verifyPsr709Directory(dir) {
  const manifestBuf = fs.readFileSync(path.join(dir, path.basename(PSR709.manifestPath)));
  const manifest = JSON.parse(manifestBuf);
  const files = manifest.artifacts.map((a) => {
    const buf = fs.readFileSync(path.join(dir, path.basename(a.path)));
    const actual = sha256(buf);
    if (actual !== a.sha256 || buf.length !== a.bytes) throw new Error(`PSR709_HASH_MISMATCH:${a.path}:${actual}`);
    return { path: a.path, bytes: a.bytes, sha256: a.sha256, verified: true };
  });
  return { manifest, manifestSha256: sha256(manifestBuf), files };
}

export function buildExtract(dir, { commit = PSR709.commit } = {}) {
  const { manifest, manifestSha256, files } = verifyPsr709Directory(dir);
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  const rules = read('SUPERTRADER-RULE-SOURCE-MATRIX.json').rules;
  const cases = read('SUPERTRADER-BEHAVIORAL-GROUND-TRUTH.json').cases;
  const repro = read('SUPERTRADER-REPRODUCIBILITY-MATRIX.json').methods;
  const dataReq = read('SUPERTRADER-DATA-REQUIREMENTS.json').methods;
  const candidates = read('SUPERTRADER-TOP-IMPLEMENTATION-CANDIDATES.json').candidates;
  const conflicts = read('SUPERTRADER-NORMATIVE-BEHAVIORAL-CONFLICTS.json').conflicts;
  const vuGaps = read('SUPERTRADER-CURRENT-VU-GAP-MATRIX.json').gaps;
  const sourceGaps = read('SUPERTRADER-SOURCE-GAPS.json').gaps;
  const finalReview = read('SUPERTRADER-FINAL-REVIEW.json');

  const contexts = new Set(Object.values(METHOD_CONTEXTS).flatMap((m) => m.contexts));
  const ruleRows = rules.filter((r) => contexts.has(r.method)).map((r) => pick(r, RULE_FIELDS));
  const ruleIds = new Set(ruleRows.map((r) => r.rule_id));
  for (const c of candidates) for (const id of c.evidence_rule_ids) if (!ruleIds.has(id)) throw new Error(`PSR709_EVIDENCE_RULE_OUTSIDE_CONTEXTS:${id}`);
  const reproRows = repro.filter((m) => contexts.has(m.method)).map((m) => pick(m, REPRO_FIELDS));
  const caseIds = new Set(reproRows.flatMap((m) => m.source_context_case_ids));
  const caseRows = cases.filter((c) => caseIds.has(c.case_id)).map((c) => pick(c, CASE_FIELDS));
  const sourceIds = new Set(ruleRows.map((r) => r.source_id));
  const relevantConflict = (c) => (c.rule_ids ?? []).some((id) => ruleIds.has(id)) || (c.case_ids ?? []).some((id) => caseIds.has(id));
  return {
    schema: 'supertrader-v4-1-psr709-extract-1.0.0',
    pin: { ...PSR709, commit, manifestSha256, manifestCounts: manifest.counts, manifestCompletedAtUtc: manifest.completed_at_utc, repositoryCommitAudited: manifest.repository_commit_audited, filesVerified: files.length, mismatches: 0, files },
    finalReview: { status: finalReview.final_status, openHighFindings: finalReview.open_high_findings, openCriticalFindings: finalReview.open_critical_findings, limitation: finalReview.review_limitation },
    methodContexts: METHOD_CONTEXTS, primaryContext: PRIMARY_CONTEXT,
    candidates: candidates.map((c) => pick(c, ['candidate_id', 'rank', 'trader', 'method', 'source_coverage', 'reproducibility', 'behavioral_ground_truth', 'vu_feasibility', 'data_availability', 'evidence_rule_ids', 'assessment', 'provenance', 'ready_for_backtest_now', 'next_phase'])),
    reproducibility: reproRows,
    dataRequirements: dataReq.filter((m) => contexts.has(m.method)).map((m) => ({ method: m.method, trader: m.trader, requirements: m.requirements.map((r) => pick(r, ['field', 'requirement', 'availability'])) })),
    rules: ruleRows,
    cases: caseRows,
    conflicts: conflicts.filter(relevantConflict).map((c) => pick(c, ['conflict_id', 'trader', 'rule_ids', 'case_ids', 'conflict_type', 'severity', 'source_ids', 'resolution', 'handling_status'])),
    vuGaps: vuGaps.filter((g) => Object.values(VU_GAP).includes(g.gap_id)).map((g) => pick(g, ['gap_id', 'trader', 'method', 'scope', 'matching_rules', 'missing_rules', 'false_hard_rules', 'foreign_rules', 'vu_formalizations', 'evidence_rule_ids', 'source_confidence', 'severity', 'assessment', 'rebuild_recommendation'])),
    vuGapByMethod: VU_GAP,
    sourceGaps: sourceGaps.filter((g) => sourceIds.has(g.source_id) || (g.source_ids ?? []).some((s) => sourceIds.has(s))).map((g) => pick(g, ['gap_id', 'source_id', 'source_ids', 'book_status', 'type', 'status', 'missing_sections', 'missing', 'semantic_gaps', 'reproducibility_impact'])),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  if (!get('--psr')) throw new Error('usage: --psr <dir>');
  const out = get('--out') ? path.resolve(get('--out')) : DEFAULT_EXTRACT;
  const x = buildExtract(path.resolve(get('--psr')), { commit: get('--commit') ?? PSR709.commit });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(x, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ out, files: x.pin.filesVerified, rules: x.rules.length, cases: x.cases.length, conflicts: x.conflicts.length }) + '\n');
}
