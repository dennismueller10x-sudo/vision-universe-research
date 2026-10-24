#!/usr/bin/env node
/**
 * Supertrader 7.0 Minervini source inventory (owner request 24.10.2026: no blanket "sources missing" claim without an
 * inventory per rule). Builds artifacts/STRATEGY-MINERVINI-SOURCE-INVENTORY.json from
 *  - the #709 extract (evidence/PSR709-EVIDENCE-EXTRACT.json): source library and the 132 Minervini rows,
 *  - the contracts (contracts/minervini.mjs): how every row is used,
 *  - the 7.0 re-reading (evidence/MINERVINI-SF7-FINDINGS.json): what the books contain beyond the #709 rows,
 *  - the classification below: for every contract rule and model assumption WHY it is not SOURCE_EXACT, separated into
 *    the six classes the owner asked for. The classification is written by hand and reviewed; the builder only checks
 *    that it is complete and that every page it cites is a recorded finding or a #709 row.
 *
 *   node scripts/supertrader/source-faithful/completion/build-minervini-source-inventory.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExtract } from '../evidence/psr709-extract.mjs';
import { loadFindings } from '../evidence/minervini-sf7-findings.mjs';
import { MINERVINI_SEPA, MINERVINI_POWER_PLAY } from '../contracts/minervini.mjs';
import { MODEL_ASSUMPTIONS } from '../research/minervini-lifecycle.mjs';
import { SF7_MODEL_ASSUMPTIONS, SF7_VARIANTS } from '../research/minervini-sf7.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ARTIFACT = 'STRATEGY-MINERVINI-SOURCE-INVENTORY.json';
export const ARTIFACT_DIR = path.join(HERE, '..', 'artifacts');

/** The six classes of the owner request (questions 4-6) plus the two positive ones. */
export const CLASSES = Object.freeze({
  SOURCE_PRESENT_ENGLISH: 'rule present in Minervini\'s own English words in the project (W-MIN18)',
  SOURCE_PRESENT_TRANSLATION: 'rule fully present in the supplied books; only the English original wording is not in the project',
  SOURCE_CONFLICT_TRANSLATION: 'the supplied translations / editions print different values; not a missing rule',
  OPERATIONALIZATION_OPEN: 'rule present, but the books give no exact mathematical definition (a model assumption is needed)',
  METHOD_DISCRETION: 'Minervini himself describes the step as judgment (manual), not as a fixed rule',
  DATA_MISSING: 'the rule is clear; historical data are missing (independent of the books)',
  PROJECT_AVAILABILITY: 'material that exists but is not accessible in the project',
  ABSENT_FROM_MATERIAL: 'checked in every supplied book: the material contains no rule for it',
});

const C = (cls, why, evidence) => Object.freeze({ cls, why, evidence });
/**
 * Classification of every contract rule (both contracts) and of every 4.0 / 7.0 model assumption. evidence: pages as
 * "B12 PDF n" / "B07 PDF n" / "B03 PDF n" (each must be a 7.0 finding or a #709 row page) or #709 rule ids / W-MIN18 ids.
 */
export const CLASSIFICATION = Object.freeze({
  'MIN-SF-STAGGER': [C('SOURCE_PRESENT_ENGLISH', 'staggered stops redistribute, never increase the planned risk (English, original wording checked): SOURCE_EXACT', ['MIN-W18-1'])],
  'MIN-SF-PRICE-CONFIRM': [C('SOURCE_PRESENT_ENGLISH', 'fundamentals need confirming chart action (English)', ['MIN-W18-5', 'MIN-PRICE-01']), C('OPERATIONALIZATION_OPEN', '"confirming chart action" is broader than a pivot crossing; the machine part is derived', ['B12 PDF 306'])],
  'MIN-SF-SIMPLE': [C('SOURCE_PRESENT_TRANSLATION', 'simple separate screens', ['MIN-PROCESS-15'])],
  'MIN-SF-PROCESS': [C('SOURCE_PRESENT_TRANSLATION', 'Trend Template as the qualification; B12 and B03 both: a stock failing it is not considered', ['MIN-PROCESS-01', 'B12 PDF 114', 'B03 PDF 142'])],
  'MIN-SF-TT-1': [C('SOURCE_PRESENT_TRANSLATION', 'same numbers in B12 (2013, Indonesian) and B03 (2017, licensed Vietnamese): cross-translation consistent', ['MIN-TT-01', 'B03 PDF 143'])],
  'MIN-SF-TT-2': [C('SOURCE_PRESENT_TRANSLATION', 'cross-translation consistent (B12 / B03)', ['MIN-TT-02', 'B03 PDF 143'])],
  'MIN-SF-TT-3': [C('SOURCE_PRESENT_TRANSLATION', 'at least 1 month, preferably 4-5 months in both books', ['MIN-TT-03', 'B03 PDF 143']), C('OPERATIONALIZATION_OPEN', 'no book defines how "trending up" is measured (21-session point comparison is the derivation)', ['B12 PDF 114', 'B03 PDF 143'])],
  'MIN-SF-TT-4': [C('SOURCE_PRESENT_TRANSLATION', 'cross-translation consistent (B12 / B03)', ['MIN-TT-04', 'B03 PDF 143'])],
  'MIN-SF-TT-5': [C('SOURCE_PRESENT_TRANSLATION', 'cross-translation consistent (B12 / B03)', ['MIN-TT-05', 'B03 PDF 143'])],
  'MIN-SF-TT-6': [C('SOURCE_CONFLICT_TRANSLATION', 'B12 Trend Template 30 %, B03 25 %, B12 PDF 101 "at least 25 to 30 percent"; reference keeps 30 %, variant ALT-SEPA-TT6-25', ['MIN-TT-06', 'B03 PDF 143', 'B12 PDF 101']), C('OPERATIONALIZATION_OPEN', 'intraday or closing 52-week low not stated', ['B12 PDF 114'])],
  'MIN-SF-TT-7': [C('SOURCE_PRESENT_TRANSLATION', 'within 25 % of the 52-week high in both books', ['MIN-TT-07', 'B03 PDF 143']), C('OPERATIONALIZATION_OPEN', 'intraday or closing 52-week high not stated', ['B12 PDF 114'])],
  'MIN-SF-TT-8': [C('DATA_MISSING', 'IBD RS rating >= 70 is clear in both books; the rating is proprietary and has no history in the project', ['MIN-TT-08', 'B03 PDF 143']), C('SOURCE_PRESENT_TRANSLATION', 'Minervini\'s own RS-line condition (not in a downtrend, preferably rising >= 6 weeks) is computable; variant ALT-SEPA-RS-LINE; no substitute for the rating', ['B03 PDF 143', 'B03 PDF 168'])],
  'MIN-SF-PRIORITY': [C('METHOD_DISCRETION', 'relative priority of the remaining names is a manual review in the book itself', ['MIN-PROCESS-04']), C('DATA_MISSING', 'surprise, revision and guidance history (inputs of the priority) have no PIT history in the project', ['MIN-PROCESS-06', 'MIN-PROCESS-08'])],
  'MIN-SF-FUNDAMENTALS': [C('METHOD_DISCRETION', 'no universal threshold: 20-25 % is a common minimum, higher in bull markets, single non-accelerating quarters tolerated', ['MIN-EPS-02', 'B12 PDF 177', 'B12 PDF 185']), C('DATA_MISSING', 'estimates, surprises, guidance; derived Q4 values not split-correctable (6.0: 405 cases)', ['MIN-EPS-05', 'MIN-EPS-09'])],
  'MIN-SF-VCP': [C('METHOD_DISCRETION', 'counts and halving are typical, flat bases allowed; validity is judged', ['MIN-VCP-02', 'MIN-VCP-03', 'MIN-VCP-04']), C('OPERATIONALIZATION_OPEN', 'footprint notation (6W 32/6 3T), depth bands (10-35 %, rarely after 60 %) and the flat-base bound (10-15 %) are printed, the contraction measurement is not; variant ALT-SEPA-FLAT-BASE', ['B12 PDF 297', 'B12 PDF 280', 'B12 PDF 306'])],
  'MIN-SF-PIVOT': [C('OPERATIONALIZATION_OPEN', 'buy over the pivot with rising volume, never before it, not chasing more than "a few percentage points" - no number for the chase or the volume', ['MIN-VCP-07', 'B12 PDF 297', 'B12 PDF 306', 'B07 PDF 67', 'B07 PDF 87']), C('METHOD_DISCRETION', 'he waits for 5-20 cents over the pivot and says there is no magic number', ['B07 PDF 40'])],
  'MIN-SF-STOP': [C('SOURCE_PRESENT_ENGLISH', 'maximum about 8-10 %, no volatility-widened stops (English)', ['MIN-W18-7', 'MIN-W18-8']), C('SOURCE_PRESENT_TRANSLATION', 'absolute maximum 10 % in B12 / B07 / B03; cut at half the average gain', ['MIN-MM-STOP-02', 'B12 PDF 370', 'B12 PDF 399']), C('OPERATIONALIZATION_OPEN', 'placement inside the bound (technical level vs percent) is the reviewer\'s; half-average-gain needs the trader\'s own history (diagnostic only)', ['B07 PDF 74', 'B12 PDF 398'])],
  'MIN-SF-SIZE': [C('SOURCE_PRESENT_ENGLISH', 'pilot positions, progressive exposure, examples only (English)', ['MIN-W18-3', 'MIN-W18-4']), C('SOURCE_PRESENT_TRANSLATION', 'risk per trade should not exceed 1.25-2.5 %, at most 25 % per position', ['MIN-MM-SIZE-01', 'B03 PDF 193']), C('METHOD_DISCRETION', 'the exact risk inside the range and the progression are the trader\'s', ['B03 PDF 123'])],
  'MIN-SF-SELL': [C('METHOD_DISCRETION', 'selling is more subjective than buying (English)', ['MIN-W18-2', 'MIN-MM-SELL-03']), C('OPERATIONALIZATION_OPEN', 'concrete signals are printed (largest decline since the Stage 2 start, climax run, close below MA20 after a breakout, 2-6R sales) but not ranked into a rule set; diagnostic largestDeclineSignal', ['B12 PDF 130', 'B07 PDF 90', 'B07 PDF 91'])],
  'MIN-SF-PP-NOFUND': [C('SOURCE_PRESENT_TRANSLATION', 'no visible fundamentals required', ['MIN-PP-01', 'B12 PDF 341'])],
  'MIN-SF-PP-DURATION': [C('SOURCE_PRESENT_TRANSLATION', '3-6 weeks typical, 12 days (B12) / 10-12 sessions (B03) possible', ['MIN-PP-03', 'B03 PDF 189'])],
  'MIN-SF-PP-RUNUP': [C('SOURCE_PRESENT_TRANSLATION', '+100 % in under eight weeks on big volume, generally after dormancy (B12 / B03)', ['MIN-PP-02', 'B03 PDF 189']), C('OPERATIONALIZATION_OPEN', '"big volume" at the start has no number (manual flag MIN-MR-PP-VOLUME)', ['MIN-PP-02'])],
  'MIN-SF-PP-CORRECTION': [C('SOURCE_PRESENT_TRANSLATION', 'B03 clarifies the printed range: no more than 20 %, some low-priced stocks about 25 %', ['MIN-PP-04', 'B03 PDF 189']), C('OPERATIONALIZATION_OPEN', '"low-priced" is not quantified; (20 %, 25 %] stays a review case', ['B03 PDF 189'])],
  'MIN-SF-PP-TIGHT': [C('SOURCE_PRESENT_TRANSLATION', 'conflict resolved: B12 requires VCP characteristics, B03 exempts bases correcting no more than 10 % - exactly the reference reading', ['MIN-PP-05', 'B12 PDF 341', 'B03 PDF 189'])],
  'MIN-SF-PP-ENTRY': [C('OPERATIONALIZATION_OPEN', 'pivot of a power play not constructed in the books (run-up high is the model assumption)', ['MIN-VCP-07'])],
  'MIN-SF-PP-STOP': [C('SOURCE_PRESENT_ENGLISH', 'maximum about 8-10 % (English)', ['MIN-W18-7']), C('OPERATIONALIZATION_OPEN', 'placement inside the bound', ['MIN-RISK-01'])],
  'MIN-SF-PP-SIZE': [C('SOURCE_PRESENT_TRANSLATION', 'at most 25 % per position', ['MIN-MM-SIZE-01']), C('METHOD_DISCRETION', 'risk inside the range is the trader\'s', ['B03 PDF 193'])],
  'MIN-SF-PP-EXIT': [C('METHOD_DISCRETION', 'sell rules are judgment', ['MIN-MM-SELL-01'])],
  // model assumptions of the 4.0 lifecycle and the 7.0 additions
  'MA-MIN-MANUAL-SUBSTITUTE': [C('METHOD_DISCRETION', 'the substituted decisions are manual in the books', ['MIN-PROCESS-04'])],
  'MA-MIN-SEPA-PIVOT': [C('OPERATIONALIZATION_OPEN', 'pivot named, not constructed', ['B12 PDF 297'])],
  'MA-MIN-SEPA-SETUP-PROXY': [C('OPERATIONALIZATION_OPEN', 'VCP judged; flat bases allowed (B12 PDF 306 now gives their 10-15 % bound)', ['B12 PDF 306'])],
  'MA-MIN-STOP-PLACEMENT': [C('OPERATIONALIZATION_OPEN', 'stop inside the 10 % bound; half-average-gain rule needs own trade history', ['B12 PDF 398'])],
  'MA-MIN-ORDER-TYPE': [C('ABSENT_FROM_MATERIAL', 'no order type in the books; the limit follows the 10 % bound; chase limit only "a few percentage points"', ['B12 PDF 297'])],
  'MA-MIN-ENTRY-TIMING': [C('DATA_MISSING', 'buy intraday on price, judge volume by intraday extrapolation: needs intraday volume (not in the daily snapshot)', ['B12 PDF 306', 'MIN-MM-VOL-EX'])],
  'MA-MIN-INTRABAR-ORDER': [C('DATA_MISSING', 'order of high and low inside a daily bar is unknown without intraday data', [])],
  'MA-MIN-SETUP-VALIDITY': [C('ABSENT_FROM_MATERIAL', 'no setup lifetime in the books', [])],
  'MA-MIN-SIGNAL-ORDER': [C('METHOD_DISCRETION', 'relative priority is manual', ['MIN-PROCESS-04'])],
  'MA-MIN-EXIT-POLICY': [C('OPERATIONALIZATION_OPEN', 'break-even at 2-3R (B12 PDF 410, B03 PDF 126: 3R raise, 2R break-even); sell rules judgment', ['B12 PDF 410', 'B03 PDF 126'])],
  'MA-MIN-STAGE2-TREND-TEMPLATE': [C('SOURCE_PRESENT_TRANSLATION', 'the Trend Template defines Stage 2 in the books themselves', ['B12 PDF 114'])],
  'MA-MIN-PP-PIVOT': [C('OPERATIONALIZATION_OPEN', 'pivot not constructed', [])],
  'MA-MIN-PP-ELIGIBLE-CLASSES': [C('METHOD_DISCRETION', 'owner decision 2026-10-21: no automatic upgrade of manual setups', [])],
  'MA-MIN-RESEARCH-UNIVERSE': [C('SOURCE_PRESENT_ENGLISH', 'no fixed volume cutoff (English): the universe floor is a platform convention', ['MIN-W18-6'])],
  'MA-MIN-STOP-FILL': [C('DATA_MISSING', 'fill of a stop inside a daily bar needs intraday data', ['MIN-MM-STOP-01'])],
  'MA-MIN-COSTS': [C('ABSENT_FROM_MATERIAL', 'no costs in the books', [])],
  'MA-MIN-ACCOUNTING-RESEARCH-V1': [C('ABSENT_FROM_MATERIAL', 'platform accounting', [])],
  'MA-MIN-MAX-POSITIONS': [C('SOURCE_PRESENT_TRANSLATION', 'not more than 20 (B12), rarely more than 10-12 (B07); preference, not a cap', ['MIN-RISK-10', 'B07 PDF 30'])],
  'MA-MIN-RISK-FRACTION': [C('SOURCE_PRESENT_TRANSLATION', 'B03: should not exceed 1.25-2.5 % per trade; reference 1.25 % is the lower printed bound', ['B03 PDF 193']), C('METHOD_DISCRETION', 'the value inside the range is the trader\'s', [])],
  'MA-MIN7-FLAT-BASE-WINDOW': [C('ABSENT_FROM_MATERIAL', 'flat-base length not printed', ['B12 PDF 306'])],
  'MA-MIN7-FLAT-BASE-PIVOT': [C('SOURCE_PRESENT_TRANSLATION', 'buy above the base high', ['B12 PDF 306'])],
  'MA-MIN7-FLAT-BASE-MERGE': [C('ABSENT_FROM_MATERIAL', 'research design (one-at-a-time)', [])],
  'MA-MIN7-RS-LINE': [C('OPERATIONALIZATION_OPEN', 'RS line rising >= 6 weeks without a slope measure', ['B03 PDF 143'])],
  'MA-MIN7-STAGE2-START': [C('OPERATIONALIZATION_OPEN', 'start of the Stage 2 advance not dated mechanically', ['B12 PDF 130'])],
  'MA-MIN7-AVG-GAIN': [C('OPERATIONALIZATION_OPEN', 'average gain of the trader\'s own history', ['B12 PDF 398'])],
});

/** Problems that have nothing to do with the books (owner question 6). */
export const DATA_ONLY_PROBLEMS = Object.freeze([
  { id: 'D-IBD-RS', problem: 'IBD RS rating history (proprietary)', affects: ['MIN-SF-TT-8'] },
  { id: 'D-ESTIMATES', problem: 'PIT analyst estimates, revisions, surprise and guidance history', affects: ['MIN-SF-PRIORITY', 'MIN-SF-FUNDAMENTALS'] },
  { id: 'D-EPS-Q4', problem: 'derived Q4 EPS not split-correctable (6.0: 405 SEPA entries with evidence); restatements not taken over', affects: ['MIN-SF-FUNDAMENTALS'] },
  { id: 'D-INTRADAY', problem: 'intraday volume and bar order (daily snapshot only; IEX intraday only from 2017 and only one venue)', affects: ['MA-MIN-ENTRY-TIMING', 'MA-MIN-INTRABAR-ORDER', 'MA-MIN-STOP-FILL'] },
  { id: 'D-V4D1', problem: 'undeclared corporate actions (V4-D1): SEPA 0 %, Power Play 0.99 % of reference trades directly exposed (6.0)', affects: ['CC-5'] },
  { id: 'D-SURVIVORSHIP-HOLDOUT', problem: 'holdout 2008-2015 survivorship-burdened and already opened', affects: ['CC-8'] },
  { id: 'D-OOS', problem: 'no untouched out-of-sample window before SF6-PAPER-2027', affects: ['CC-8'] },
]);

/** What exists but is not accessible in the project (owner question 2 / instruction on availability). */
export const PROJECT_AVAILABILITY = Object.freeze([
  { id: 'A-ENGLISH-EDITIONS', item: 'English editions of Trade Like a Stock Market Wizard (2013), Momentum Masters (2015), Think & Trade Like a Champion (2017)', status: 'NOT_IN_PROJECT', note: 'only translations were supplied (Dropbox root, 13 PDFs, 2026-10-13); the books are complete, the original wording is not in the project' },
  { id: 'A-STOCK-MARKET-WIZARDS', item: 'Schwager, Stock Market Wizards (2001), Minervini chapter', status: 'NOT_IN_PROJECT', note: 'the supplied Schwager volumes are Market Wizards (1989), The New Market Wizards (1992, pt), Unknown Market Wizards (2020, fr): none contains a Minervini interview' },
  { id: 'A-W-MIN18-PAGE', item: 'W-MIN18 interview page (stockopedia.com, 2018-04-17)', status: 'RECORDED_NOT_REFETCHABLE_HERE', note: 'read with original wording checked in #709 on 2026-10-13 (9 rows in the extract); on 2026-10-24 the page answers HTTP 403 to this container and the archive copy (web.archive.org 2022-12-06) is not reachable from here; the rows are not re-verified, they are not changed' },
]);

export function buildInventory() {
  const x = loadExtract(), f = loadFindings();
  const rows = x.rules.filter((r) => /inervini/.test(r.trader));
  const lib = x.sources.filter((s) => rows.some((r) => r.source_id === s.source_id));
  const contracts = [MINERVINI_SEPA, MINERVINI_POWER_PLAY];
  const use = new Map();
  for (const c of contracts) {
    for (const r of c.rules) for (const p of r.psr709 ?? []) { const u = use.get(p) ?? []; u.push(`${c.candidateId}:${r.id}:${r.status}`); use.set(p, u); }
    for (const [p, why] of Object.entries(c.exclusions ?? {})) { const u = use.get(p) ?? []; u.push(`${c.candidateId}:EXCLUDED:${why.slice(0, 60)}`); use.set(p, u); }
  }
  const ruleIds = new Set(rows.map((r) => r.rule_id));
  const pageRef = (e) => /^(B12|B07|B03) PDF (\d+)$/.exec(e);
  const findingPages = new Set(f.findings.map((r) => `${r.source} PDF ${r.pdfPage}`));
  const rowPages = new Set(rows.map((r) => `${r.source_id} PDF ${(/PDF (\d+)/.exec(r.page_location ?? '') ?? [])[1]}`));
  const errors = [];
  const contractRules = contracts.flatMap((c) => c.rules.map((r) => r.id));
  const assumptions = [...MODEL_ASSUMPTIONS.map((m) => m.id), ...SF7_MODEL_ASSUMPTIONS.map((m) => m.id)];
  for (const id of [...new Set([...contractRules, ...assumptions])]) if (!CLASSIFICATION[id]) errors.push(`UNCLASSIFIED:${id}`);
  for (const [id, list] of Object.entries(CLASSIFICATION)) {
    if (![...contractRules, ...assumptions].includes(id)) errors.push(`UNKNOWN_CLASSIFIED:${id}`);
    for (const c of list) {
      if (!CLASSES[c.cls]) errors.push(`UNKNOWN_CLASS:${id}:${c.cls}`);
      for (const e of c.evidence) {
        if (pageRef(e)) { if (!findingPages.has(e) && !rowPages.has(e)) errors.push(`UNSUPPORTED_PAGE:${id}:${e}`); } else if (!ruleIds.has(e)) errors.push(`UNKNOWN_EVIDENCE:${id}:${e}`);
      }
    }
  }
  const bySource = (sid) => rows.filter((r) => r.source_id === sid).length;
  const tally = (arr, k) => arr.reduce((o, v) => { const key = k(v); o[key] = (o[key] || 0) + 1; return o; }, {});
  return {
    schema: 'supertrader-sf7-minervini-source-inventory-1.0.0',
    question: 'Which Minervini material was supplied, what is available today, what reached the contracts, and why is each rule not SOURCE_EXACT?',
    sources: lib.map((s) => ({ sourceId: s.source_id, title: s.title, language: s.document_language ?? null, provenance: s.provenance, originalWordingChecked: s.original_wording_checked === true, sha256: s.sha256 ?? null, rows709: bySource(s.source_id), findings7: f.findings.filter((r) => r.source === s.source_id).length, availableToday: s.source_id === 'W-MIN18' ? 'RECORDED_NOT_REFETCHABLE_HERE' : (f.books[s.source_id] ? 'AVAILABLE_BYTE_IDENTICAL' : 'UNKNOWN') })),
    extraction: {
      rows709: rows.length,
      rowsInExtractBefore7: rows.length - bySource('W-MIN18'),
      droppedBefore7: { count: bySource('W-MIN18'), reason: 'method context SEPA2018 (W-MIN18, the only English Minervini rows) was not mapped by the 2.0 extractor; fixed in 7.0' },
      rowUse: { inContractRule: rows.filter((r) => (use.get(r.rule_id) ?? []).some((u) => !u.includes(':EXCLUDED:'))).length, onlyExcludedAsContext: rows.filter((r) => (use.get(r.rule_id) ?? []).length && (use.get(r.rule_id) ?? []).every((u) => u.includes(':EXCLUDED:'))).length, unused: rows.filter((r) => !use.has(r.rule_id)).length },
      b03Note: 'B03 (272 pages, licensed translation) gave #709 only 8 rows, all PDF 193-232 (sizing, average loss, sell guides); 7.0 re-reading: 95 findings across the whole book',
      findings7: f.counts,
      findingsByQuestion: tally(f.findings.flatMap((r) => r.questions), (q) => q),
    },
    classes: CLASSES,
    classification: Object.fromEntries(Object.entries(CLASSIFICATION).map(([k, v]) => [k, v])),
    classCounts: tally(Object.values(CLASSIFICATION).flat(), (c) => c.cls),
    dataOnlyProblems: DATA_ONLY_PROBLEMS,
    projectAvailability: PROJECT_AVAILABILITY,
    variants7: SF7_VARIANTS.map((v) => ({ id: v.id, strategy: v.strategy, source: v.source })),
    statusChange: 'no reference rule changes status; SOURCE_EXACT only MIN-SF-STAGGER (W-MIN18); every book rule stays translation-only (CC-1 unchanged)',
    validation: { ok: errors.length === 0, errors },
  };
}

export function writeInventory(dir = ARTIFACT_DIR) {
  const a = buildInventory();
  if (!a.validation.ok) throw new Error(`INVENTORY_INVALID:${a.validation.errors.join(',')}`);
  fs.writeFileSync(path.join(dir, ARTIFACT), JSON.stringify(a, null, 1) + '\n');
  return a;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf('--out');
  const r = writeInventory(i >= 0 ? path.resolve(a[i + 1]) : ARTIFACT_DIR);
  process.stdout.write(JSON.stringify({ rows709: r.extraction.rows709, classCounts: r.classCounts, ok: r.validation.ok }) + '\n');
}
