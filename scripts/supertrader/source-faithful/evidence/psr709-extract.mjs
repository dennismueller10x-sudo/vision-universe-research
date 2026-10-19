/**
 * Source-faithful strategy implementation: hash-verified, machine-readable extract of the Primary Source
 * Reconstruction (Draft PR #709). #709 is the authoritative source evidence for every rule implemented under
 * scripts/supertrader/source-faithful/. Its files live under docs/supertrader-primary-source-reconstruction/ on
 * research/supertrader-primary-source-reconstruction @ 8b766fa4947cb2b564ede7cd850c6a995f57aada and are NOT copied
 * into main (Supertrader Gate A, #709 is an unmerged draft). This script reads them from a directory, verifies every
 * SHA-256 and byte size listed in SUPERTRADER-ARTIFACT-MANIFEST.json and writes only the rows the 13 candidates need.
 * Field values are copied verbatim; nothing is re-researched, re-scored or re-worded.
 *
 * Adapted from the V4.1 extractor of Draft PR #712 (research/supertrader-source-acceptance-v4-1 @ 26e6caf,
 * scripts/supertrader/research/v4/acceptance/psr709-extract.mjs). Differences, declared:
 *  - method ids are the source-faithful strategy ids of this tree (SF_*), not the V4 ids;
 *  - shared method contexts that #709 records for the same trader (Kullamaegi Execution / Portfolio, Darvas
 *    techno-fundamental selection, Minervini risk / exit / cheat / pullback / IPO / turnaround, Morales/Kacher
 *    market direction, Weinstein short side for documentation) are included so that manual-review questions and
 *    exclusions can cite them; they never widen what a machine gate may enforce;
 *  - the source library rows (book edition, language, ISBN, provenance) are included for the
 *    Source -> Book Edition -> Rule chain; private storage locators are dropped.
 *
 * Usage: node psr709-extract.mjs --psr <dir with the #709 docs tree or flat files> [--out <file>]
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
export const ACCEPTANCE_PR712 = Object.freeze({
  pullRequest: 712,
  branch: 'research/supertrader-source-acceptance-v4-1',
  commit: '26e6cafa93c10bda160bc73f2791f744bae6ed79',
  report: 'docs/SUPERTRADER_SOURCE_ACCEPTANCE_V4_1.md',
});
export const DEFAULT_EXTRACT = path.join(HERE, 'PSR709-EVIDENCE-EXTRACT.json');

/** Source-faithful strategy id -> #709 candidate and the #709 method contexts (rule matrix field `method`). */
export const METHOD_CONTEXTS = Object.freeze({
  SF_TURTLE_S1: { candidate: 'C01', primary: 'TURTLE_SYSTEM1', contexts: ['TURTLE_COMMON_ORIGINAL', 'TURTLE_SYSTEM1', 'TURTLE_WHipsaw'] },
  SF_TURTLE_S2: { candidate: 'C02', primary: 'TURTLE_SYSTEM2', contexts: ['TURTLE_COMMON_ORIGINAL', 'TURTLE_SYSTEM2', 'TURTLE_WHipsaw'] },
  SF_DARVAS_BOX: { candidate: 'C03', primary: 'DARVAS_LATER_QA', contexts: ['DARVAS_LATER_QA', 'DARVAS_TECHNO_FUNDAMENTAL_1957_1959', 'DARVAS_TECHNICAL_DEVELOPMENT'] },
  SF_WEINSTEIN_INVESTOR: { candidate: 'C04', primary: 'WEIN_STAGE_INVESTOR_1988', contexts: ['WEIN_STAGE_INVESTOR_1988', 'WEIN_MARKET_CONTEXT_1988'] },
  SF_WEINSTEIN_TRADER: { candidate: 'C05', primary: 'WEIN_STAGE_TRADER_1988', contexts: ['WEIN_STAGE_TRADER_1988', 'WEIN_MARKET_CONTEXT_1988', 'WEIN_STAGE_INVESTOR_1988'] },
  SF_MINERVINI_SEPA_VCP: { candidate: 'C06', primary: 'MIN_SEPA_GROWTH_2013', contexts: ['MIN_SEPA_GROWTH_2013', 'MIN_CHEAT_3C_2013', 'MIN_EXIT', 'MIN_RISK_2015', 'MIN_RISK_EXIT_2017', 'MIN_PULLBACK', 'MIN_IPO', 'MIN_SEPA_TURNAROUND'] },
  SF_MINERVINI_POWER_PLAY: { candidate: 'C07', primary: 'MIN_POWER_PLAY', contexts: ['MIN_POWER_PLAY', 'MIN_RISK_2015', 'MIN_RISK_EXIT_2017'] },
  SF_KK_BREAKOUT: { candidate: 'C08', primary: 'Breakout', contexts: ['Breakout', 'Execution', 'Portfolio', 'Portfolio/execution'] },
  SF_KK_EPISODIC_PIVOT: { candidate: 'C09', primary: 'Episodic Pivot', contexts: ['Episodic Pivot', 'Execution', 'Portfolio', 'Portfolio/execution'] },
  SF_KK_PARABOLIC_SHORT: { candidate: 'C10', primary: 'Parabolic Short', contexts: ['Parabolic Short', 'Parabolic Long', 'Execution', 'Portfolio', 'Portfolio/execution'] },
  SF_MOKA_POCKET_PIVOT: { candidate: 'C11', primary: 'PocketPivot', contexts: ['PocketPivot', 'PocketPivotExit', 'PocketPivot/BuyableGapUpExits', 'MarketDirectionModel'] },
  SF_MOKA_BUYABLE_GAP_UP: { candidate: 'C12', primary: 'BuyableGapUp', contexts: ['BuyableGapUp', 'BuyableGapUp2024', 'PocketPivot/BuyableGapUpExits', 'MarketDirectionModel'] },
  SF_RASCHKE_HOLY_GRAIL: { candidate: 'C13', primary: 'HolyGrail2004', contexts: ['HolyGrail2004'] },
});
/** Not a #709 candidate. Kept only to document why CAN SLIM is outside the 13 (GAP-B04). */
export const NON_CANDIDATE_CONTEXTS = Object.freeze({
  ONEIL_CAN_SLIM: { candidate: null, primary: 'IBDoperationalization2013', contexts: ['Original2009chartmethodpartial', 'IBDoperationalization2013', 'MarketSmith2018', 'Laterinstitutionalbasecount'] },
  WEINSTEIN_SHORT: { candidate: null, primary: 'WEIN_STAGE_SHORT_1988', contexts: ['WEIN_STAGE_SHORT_1988'] },
});
const VU_GAP = { SF_TURTLE_S1: 'VU-TUR', SF_TURTLE_S2: 'VU-TUR', SF_DARVAS_BOX: 'VU-DAR', SF_WEINSTEIN_INVESTOR: 'VU-WEIN', SF_WEINSTEIN_TRADER: 'VU-WEIN', SF_MINERVINI_SEPA_VCP: 'VU-MIN-LIVE', SF_MINERVINI_POWER_PLAY: 'VU-MIN-LIVE', SF_KK_BREAKOUT: 'VU-KK', ONEIL_CAN_SLIM: 'VU-CAN' };

const RULE_FIELDS = ['rule_id', 'trader', 'method', 'rule_area', 'rule_text_paraphrase', 'modal_strength', 'provenance', 'source_id', 'page_location', 'era', 'confidence', 'original_wording_checked', 'hard_coding_clearance'];
const CASE_FIELDS = ['case_id', 'trader', 'ticker', 'company', 'date_or_range', 'setup_family', 'action', 'personal_trade_category', 'entry_price', 'exit_price', 'stop', 'rationale', 'provenance', 'source_id', 'page_location', 'confidence', 'explicit_chart_reference', 'units', 'contracts'];
const REPRO_FIELDS = ['method_id', 'trader', 'method', 'method_kind', 'reproducibility', 'disclosed_component_reproducibility', 'full_personal_trading_replica', 'source_coverage', 'ground_truth_quality', 'vu_feasibility', 'original_english_checked_for_all_rules', 'not_fully_reproducible', 'personal_replication_status', 'source_context_case_ids'];
const SOURCE_FIELDS = ['source_id', 'title', 'author', 'edition', 'provenance', 'url', 'document_language', 'source_language', 'original_wording_checked', 'translation_note', 'era', 'isbn', 'publisher', 'page_count', 'printed_page_range', 'missing_pages', 'sha256'];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
// Accepts the repository layout (docs/supertrader-primary-source-reconstruction/...) or a flat directory.
const locate = (dir, repoPath) => { const a = path.join(dir, repoPath), b = path.join(dir, path.basename(repoPath)); return fs.existsSync(a) ? a : b; };

/** Verifies every artifact listed in the #709 manifest; throws on any mismatch or missing file. */
export function verifyPsr709Directory(dir) {
  const manifestBuf = fs.readFileSync(locate(dir, PSR709.manifestPath));
  const manifest = JSON.parse(manifestBuf);
  const files = manifest.artifacts.map((a) => {
    const buf = fs.readFileSync(locate(dir, a.path));
    const actual = sha256(buf);
    if (actual !== a.sha256 || buf.length !== a.bytes) throw new Error(`PSR709_HASH_MISMATCH:${a.path}`);
    return { path: a.path, bytes: a.bytes, sha256: a.sha256, verified: true };
  });
  return { manifest, manifestSha256: sha256(manifestBuf), files };
}

export function buildExtract(dir) {
  const { manifest, manifestSha256, files } = verifyPsr709Directory(dir);
  const read = (name) => JSON.parse(fs.readFileSync(locate(dir, `docs/supertrader-primary-source-reconstruction/${name}`), 'utf8'));
  const rules = read('SUPERTRADER-RULE-SOURCE-MATRIX.json').rules;
  const cases = read('SUPERTRADER-BEHAVIORAL-GROUND-TRUTH.json').cases;
  const repro = read('SUPERTRADER-REPRODUCIBILITY-MATRIX.json').methods;
  const dataReq = read('SUPERTRADER-DATA-REQUIREMENTS.json').methods;
  const candidates = read('SUPERTRADER-TOP-IMPLEMENTATION-CANDIDATES.json').candidates;
  const conflicts = read('SUPERTRADER-NORMATIVE-BEHAVIORAL-CONFLICTS.json').conflicts;
  const vuGaps = read('SUPERTRADER-CURRENT-VU-GAP-MATRIX.json').gaps;
  const sourceGaps = read('SUPERTRADER-SOURCE-GAPS.json').gaps;
  const library = read('SUPERTRADER-SOURCE-LIBRARY.json').sources;
  const finalReview = read('SUPERTRADER-FINAL-REVIEW.json');

  const all = { ...METHOD_CONTEXTS, ...NON_CANDIDATE_CONTEXTS };
  const contexts = new Set(Object.values(all).flatMap((m) => m.contexts));
  const ruleRows = rules.filter((r) => contexts.has(r.method)).map((r) => pick(r, RULE_FIELDS));
  const ruleIds = new Set(ruleRows.map((r) => r.rule_id));
  for (const c of candidates) for (const id of c.evidence_rule_ids) if (!ruleIds.has(id)) throw new Error(`PSR709_EVIDENCE_RULE_OUTSIDE_CONTEXTS:${id}`);
  if (candidates.length !== 13) throw new Error(`PSR709_CANDIDATE_COUNT:${candidates.length}`);
  const reproRows = repro.filter((m) => contexts.has(m.method)).map((m) => pick(m, REPRO_FIELDS));
  const caseIds = new Set(reproRows.flatMap((m) => m.source_context_case_ids ?? []));
  const caseRows = cases.filter((c) => caseIds.has(c.case_id)).map((c) => pick(c, CASE_FIELDS));
  const sourceIds = new Set([...ruleRows.map((r) => r.source_id), ...caseRows.map((c) => c.source_id)]);
  const relevantConflict = (c) => (c.rule_ids ?? []).some((id) => ruleIds.has(id)) || (c.case_ids ?? []).some((id) => caseIds.has(id));
  return {
    schema: 'supertrader-sf-psr709-extract-1.0.0',
    pin: { ...PSR709, manifestSha256, manifestCounts: manifest.counts, manifestCompletedAtUtc: manifest.completed_at_utc, repositoryCommitAudited: manifest.repository_commit_audited, filesVerified: files.length, mismatches: 0, files },
    acceptanceReference: ACCEPTANCE_PR712,
    finalReview: { status: finalReview.final_status, openHighFindings: finalReview.open_high_findings, openCriticalFindings: finalReview.open_critical_findings, limitation: finalReview.review_limitation },
    methodContexts: METHOD_CONTEXTS,
    nonCandidateContexts: NON_CANDIDATE_CONTEXTS,
    candidates: candidates.map((c) => pick(c, ['candidate_id', 'rank', 'trader', 'method', 'source_coverage', 'reproducibility', 'behavioral_ground_truth', 'vu_feasibility', 'data_availability', 'product_relevance', 'evidence_rule_ids', 'assessment', 'provenance', 'ready_for_backtest_now', 'next_phase'])),
    sources: library.filter((s) => sourceIds.has(s.source_id)).map((s) => pick(s, SOURCE_FIELDS)),
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

let cached = null;
/** Loads the committed extract (tests and builders). */
export function loadExtract(file = DEFAULT_EXTRACT) {
  if (file === DEFAULT_EXTRACT && cached) return cached;
  const x = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (file === DEFAULT_EXTRACT) cached = x;
  return x;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  if (!get('--psr')) throw new Error('usage: --psr <dir>');
  const out = get('--out') ? path.resolve(get('--out')) : DEFAULT_EXTRACT;
  const x = buildExtract(path.resolve(get('--psr')));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(x, null, 1) + '\n');
  process.stdout.write(JSON.stringify({ out: path.relative(process.cwd(), out), files: x.pin.filesVerified, rules: x.rules.length, cases: x.cases.length, conflicts: x.conflicts.length, sources: x.sources.length }) + '\n');
}
