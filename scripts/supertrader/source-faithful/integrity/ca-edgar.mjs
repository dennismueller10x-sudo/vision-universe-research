/**
 * Supertrader 7.0 – V4-D1 resolution, rule set 1.4.0 (owner decision E7-1, 25.10.2026): a targeted, free, throttled
 * EDGAR check of the reference-exposed, still UNRESOLVED DQ-K5 sessions of rule set 1.3.0.
 *
 * 1.4.0 = 1.3.0 (integrity/ca-resolution.mjs, UNCHANGED, hash 08d8a6ec... pinned) plus exactly ONE new factor-bearing
 * independent source for CONFIRMED_UNDECLARED_SPLIT: a filing document of the SAME CIK that states the split ratio
 * (8-K body, 10-Q / 10-K footnote, 424B prospectus; proxy / information statements only as context). The document text
 * is parsed locally (HTML stripped, normalised, regex + number-word parser) and never stored: only the extracted ratio,
 * the dates, the accession number and the SHA-256 of the matched passage survive (sealed).
 *
 * A split is confirmed by a document only when ALL of these hold (pre-registered, never tuned on a result):
 *  - the 1.3.0 result of the session is UNRESOLVED with a reason of DOC_PATH_REASONS:
 *      path A 'SHARES_PASSED': NO_FACTOR_BEARING_SOURCE (every 1.2.0 / 1.3.0 share, price, open and volume test passed,
 *             only the factor-bearing source was missing) – the document factor must equal the share-ratio factor;
 *      path B 'SHARES_UNUSABLE': the SEC share counts gave no usable bracket (missing / no accepted source / not
 *             bracketing / too wide / mixed source) – then shares cannot contradict and are not required;
 *    every other 1.3.0 reason (declared split nearby, share ratio contradicts, ADR / IFRS, shared CIK, spike, unmapped
 *    listing, genuine-move failures) stays UNRESOLVED – a document never overrides a contradiction;
 *  - CIK KNOWN (sec-pit), not shared at the session, not ADR / IFRS;
 *  - exactly one ratio among all non-range split statements of the documents filed by that CIK in
 *    [d - 90, d + 100] days that are undated or dated within 135 days of d; two different ratios -> UNRESOLVED;
 *    only range bounds ("between 1-for-5 and 1-for-30") -> UNRESOLVED (an approved range never proves a factor);
 *  - that ratio lies on the factor grid of 1.3.0 and at least one statement of it comes from a post-event form (8-K,
 *    10-Q, 10-K, 424B) with a stated date within 80 characters of an effective wording whose first session lies within
 *    +-2 sessions of d (a proxy or information statement alone never confirms);
 *  - the overnight open relative selects exactly that grid value (snapFactor), the close relative lies within
 *    priceRatioTol of it in the same direction, the raw volume behaves like that split, Tiingo adjClose does not
 *    contradict it; path A: the share ratio selects the same grid value with the 1.2.0 residual cap;
 *    path B: no other flag of the listing within +-10 sessions;
 *  - the EDGAR index covers the 1.3.0 filing window and holds no merger / disposition / exchange-offer form, no 8-K
 *    item 2.01 and no 8-K without items there, and no matched passage speaks of a merger or exchange offer.
 * CONFIRMED_GENUINE_MOVE keeps its 1.3.0 rules; 1.4.0 may only take it back (a document dating a split at d).
 * Everything else stays UNRESOLVED and in quarantine.
 */
import crypto from 'node:crypto';
import { fin } from '../common/series.mjs';
import { sessionRatio } from './discontinuity.mjs';
import { CLASSES, TOLERANCES, FACTOR_GRID, MERGER_FORMS, SPLIT_BLOCKING_8K_ITEMS, snapFactor, gridLogGap, ratioLabel, volumeRelative, adjCloseImplied, rulesetSha256 as rulesetSha256V130, CA_RESOLUTION_VERSION as V130 } from './ca-resolution.mjs';

export const CA_EDGAR_VERSION = 'sf7-ca-resolution-1.4.0';
export const DOC_PARSER_VERSION = 'sf7-edgar-ratio-parser-1.0.0';
/** The 1.3.0 rule set this layer extends (pinned in a test; ca-resolution.mjs stays byte-for-byte as in run 40122736287). */
export const BASE_RULESET = Object.freeze({ version: V130, sha256: '08d8a6ec8e0565f0c674fa295d50745607b1c37cfc8411e609952f8224267af7' });

/** Forms whose primary document is read. Post-event forms may date a split; proxy forms only give context / conflicts. */
export const POST_EVENT_FORMS = Object.freeze(['8-K', '8-K/A', '10-Q', '10-Q/A', '10-K', '10-K/A', '10-QSB', '10-KSB', '424B1', '424B2', '424B3', '424B4', '424B5']);
export const CONTEXT_FORMS = Object.freeze(['DEF 14C', 'PRE 14C', 'DEF 14A', 'PRE 14A']);
export const DOC_FORMS = Object.freeze([...POST_EVENT_FORMS, ...CONTEXT_FORMS]);
/** Forms in the document window that block a document-based split (merger, exchange or tender offer, deregistration). */
export const DOC_CONFLICT_FORMS = Object.freeze([...MERGER_FORMS, 'SC TO-I', 'SC TO-I/A', 'SC 13E4', 'SC 13E4/A', 'F-4/A', '425']);
/** Document priority (lower first); within a class the filing closest to d (8-K), the first after d (10-Q/10-K/424B) or the last before d (proxy). */
export const DOC_PRIORITY = Object.freeze([
  Object.freeze({ cls: 1, forms: ['8-K', '8-K/A'], items: ['5.03', '3.03'] }),
  Object.freeze({ cls: 2, forms: ['8-K', '8-K/A'], items: ['5.07', '3.01', '8.01'] }),
  Object.freeze({ cls: 3, forms: ['10-Q', '10-Q/A', '10-K', '10-K/A', '10-QSB', '10-KSB'], after: true }),
  Object.freeze({ cls: 4, forms: ['424B1', '424B2', '424B3', '424B4', '424B5'], after: true }),
  Object.freeze({ cls: 5, forms: ['DEF 14C', 'PRE 14C', 'DEF 14A', 'PRE 14A'], before: true }),
]);
/** 1.3.0 reasons that open the document path. */
export const DOC_PATH_REASONS = Object.freeze({
  SHARES_PASSED: Object.freeze(['NO_FACTOR_BEARING_SOURCE']),
  SHARES_UNUSABLE: Object.freeze(['SEC_SHARES_MISSING', 'SEC_SHARES_NOT_DEI', 'SEC_SHARES_NOT_BRACKETING', 'SEC_BRACKET_TOO_WIDE', 'SEC_MIXED_SOURCE_BRACKET']),
});
/**
 * Pre-registered document tolerances.
 *  effectiveSessions   the first session on / after a stated effective date lies within +-2 sessions of d;
 *  filingWindowDays    documents filed by the CIK in [d - 90, d + 100] calendar days;
 *  statementDays       a split statement dated more than 135 days from d is historical and ignored (undated counts);
 *  keywordChars        a ratio mention counts only with a split keyword within 150 characters;
 *  passageChars        dates, effective wording and merger wording within 300 characters of the mention;
 *  effectiveDateChars  a stated effective date lies within 80 characters of an effective wording (so the filing date
 *                      of a certificate of amendment in the same passage is not read as the effective date);
 *  directionChars      'reverse' / 'forward' within 80 characters before or 40 after the mention;
 *  rangeLeadChars      a range word within 60 characters before the mention makes it a range bound;
 *  rangeJoinChars      two mentions joined by and / to / through / or within 30 characters are range bounds;
 *  otherFlagSessions   path B: no other flag of the listing within +-10 sessions;
 *  conflictMaxSmall    an off-grid ratio with its smaller side <= 10 and larger side <= 1000 counts as a conflicting
 *                      ratio (5-for-4); larger numbers (vote counts) are not ratios;
 *  maxDocChars         at most 15 000 000 characters of one document are parsed (truncation recorded).
 */
export const DOC_TOLERANCES = Object.freeze({ effectiveSessions: 2, filingWindowDays: Object.freeze([-90, 100]), statementDays: 135, keywordChars: 150, passageChars: 300, effectiveDateChars: 80, directionChars: Object.freeze([80, 40]), rangeLeadChars: 60, rangeJoinChars: 30, otherFlagSessions: 10, conflictMaxSmall: 10, conflictMaxLarge: 1000, maxDocChars: 15000000 });
/**
 * Hard, pre-registered request budget (enforced fail-closed by the EDGAR client): sequential requests, at most 2 per
 * second, 30 s timeout, at most 600 requests per run (the 1.3.0 index lookups included), at most 6 document requests per
 * session, at most 3 index pages per CIK (recent page plus two older pages, only those overlapping the window).
 */
export const EDGAR_BUDGET = Object.freeze({ totalRequests: 600, docRequestsPerSession: 6, indexPagesPerCik: 3, minIntervalMs: 500, timeoutMs: 30000 });
export const SMOKE_BUDGET = Object.freeze({ ...EDGAR_BUDGET, totalRequests: 60 });

export const SPLIT_KEYWORDS = /\b(?:reverse\s+(?:stock\s+|share\s+)?split|stock\s+split|share\s+split|forward\s+(?:stock\s+)?split|split-adjusted|share\s+consolidation|reverse\s+split|split)\b/g;
export const RANGE_WORDS = /\b(?:between|range|ranging|ranges|not\s+less\s+than|not\s+more\s+than|no\s+less\s+than|no\s+more\s+than|up\s+to|not\s+to\s+exceed|not\s+exceeding|maximum|minimum|at\s+least|any\s+whole\s+number|within)\b/;
export const EFFECTIVE_WORDS = /\b(?:effective|effected|effectuated|became\s+effective|becomes\s+effective|begin\s+trading|begins\s+trading|began\s+trading|commence\s+trading|commenced\s+trading|split-adjusted\s+basis|market\s+open|opening\s+of\s+(?:the\s+)?(?:market|trading)|effective\s+time)\b/;
export const MERGER_WORDS = /\b(?:merger|exchange\s+offer|exchange\s+ratio|business\s+combination|amalgamation|plan\s+of\s+arrangement|tender\s+offer)\b/;
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export const NUMBER_WORDS = Object.freeze([...ONES, ...TENS.filter(Boolean), 'hundred', 'thousand']);

/** The full 1.4.0 rule set (its SHA-256 is pinned in a test; any change is a new version 1.4.1 with before / after). */
export const RULESET = Object.freeze({
  version: CA_EDGAR_VERSION, base: BASE_RULESET, parser: DOC_PARSER_VERSION, postEventForms: POST_EVENT_FORMS, contextForms: CONTEXT_FORMS, conflictForms: DOC_CONFLICT_FORMS,
  priority: DOC_PRIORITY, docPathReasons: DOC_PATH_REASONS, tolerances: DOC_TOLERANCES, budget: EDGAR_BUDGET, smokeBudget: SMOKE_BUDGET,
  splitKeywords: SPLIT_KEYWORDS.source, rangeWords: RANGE_WORDS.source, effectiveWords: EFFECTIVE_WORDS.source, mergerWords: MERGER_WORDS.source, numberWords: NUMBER_WORDS,
});
export const rulesetSha256 = () => crypto.createHash('sha256').update(JSON.stringify(RULESET)).digest('hex');
/** The 1.3.0 rule set must be exactly the one this layer was registered on. */
export const baseRulesetUnchanged = () => rulesetSha256V130() === BASE_RULESET.sha256;

const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const ln = Math.log;
const within = (x, tol) => fin(x) && x > 0 && Math.abs(ln(x)) <= ln(tol) + 1e-12;
const sameFactor = (a, b) => fin(a) && fin(b) && a > 0 && b > 0 && Math.abs(ln(a / b)) < TOLERANCES.sameFactorLogTol;
export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5;

// ---------------------------------------------------------------------------------------------------- text and parser

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '-', mdash: '-', hyphen: '-', minus: '-', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"' };
/** HTML / SGML to normalised lower-case text: tags and scripts removed, entities decoded, dashes unified, whitespace collapsed. */
export function documentText(html) {
  let t = String(html ?? '');
  t = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ');
  t = t.replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);?/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? ' ');
  t = t.replace(/[‐-―−­]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ');
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Number words / digits to a number: "twenty-five" 25, "one hundred fifty" 150, "1,000" 1000; null when not a valid number. */
export function parseNumber(s) {
  const x = String(s).trim().toLowerCase();
  if (/^\d{1,3}(,\d{3})+$/.test(x)) return Number(x.replace(/,/g, ''));
  if (/^\d+(\.\d+)?$/.test(x)) return Number(x);
  const toks = x.split(/[\s-]+/).filter(Boolean);
  if (!toks.length) return null;
  let total = 0, cur = 0, seen = false, lastAnd = false, lastTen = false, lastOne = false;
  for (const w of toks) {
    if (w === 'and') { if (!seen || lastAnd) return null; lastAnd = true; continue; }
    const o = ONES.indexOf(w), t = TENS.indexOf(w);
    if (o >= 0) { if (lastOne || (lastTen && o >= 10) || (lastTen && o === 0)) return null; cur += o; lastOne = true; lastTen = false; }
    else if (t >= 2) { if (lastOne || lastTen || cur % 100 !== 0) return null; cur += t * 10; lastTen = true; lastOne = false; }
    else if (w === 'hundred') { if (!(cur > 0 && cur < 10)) return null; cur *= 100; lastOne = lastTen = false; }
    else if (w === 'thousand') { if (!(cur > 0)) return null; total += cur * 1000; cur = 0; lastOne = lastTen = false; }
    else return null;
    seen = true; lastAnd = false;
  }
  if (lastAnd) return null;
  return total + cur;
}

const WORD = `(?:${[...NUMBER_WORDS].sort((a, b) => b.length - a.length).join('|')})`;
// 'and' only after 'hundred' (one hundred and fifty), so 'one-for-five and one-for-thirty' stays two mentions
const NUM = `(?:\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?|\\b${WORD}(?:[\\s-]+(?:(?<=hundred[\\s-]+)and[\\s-]+)?${WORD}\\b)*)`;
const PAREN = `(?:\\s*\\(\\s*\\d+(?:\\.\\d+)?\\s*\\))?`;
const RE_FOR = new RegExp(`(?<![\\w.,])(${NUM})${PAREN}\\s*[-\\s]\\s*for\\s*[-\\s]\\s*(${NUM})\\b${PAREN}`, 'g');
const RE_COLON = /(?<![\w.,:])(\d{1,4})\s*:\s*(\d{1,4})(?![\w.,:])/g;
const RE_EACH = new RegExp(`\\b(?:each|every)\\s+(?:(${NUM})${PAREN}\\s+)?(?:(?:issued|and|outstanding|pre-split|old|existing|shares?\\s+of)\\s+)*shares?\\b[^.;]{0,160}?\\b(?:into|for)\\s+(${NUM})${PAREN}\\s+(?:(?:new|post-split|fully|paid|validly|issued|and|non-assessable|nonassessable|outstanding)[\\s,-]+)*shares?\\b`, 'g');
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const RE_DATE_LONG = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g;
const RE_DATE_NUM = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const isoDate = (y, m, d) => { const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, t = Date.parse(`${s}T00:00:00Z`); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : null; };

/** Every date in the text with its position. */
export function findDates(text) {
  const out = [];
  for (const m of text.matchAll(RE_DATE_LONG)) { const s = isoDate(Number(m[3]), MONTHS[m[1].slice(0, 3)], Number(m[2])); if (s) out.push({ pos: m.index, date: s }); }
  for (const m of text.matchAll(RE_DATE_NUM)) { const s = isoDate(Number(m[3]), Number(m[1]), Number(m[2])); if (s) out.push({ pos: m.index, date: s }); }
  return out.sort((a, b) => a.pos - b.pos);
}

/**
 * Ratio mentions of a text: 'A-for-B' (A new for B old: price factor B / A), 'A:B' (only next to a split keyword or after
 * "ratio of"; times excluded) and 'each / every B shares ... into A share(s)'. A 'reverse' / 'consolidation' or
 * 'forward' keyword next to the mention fixes the direction (price factor max / min or min / max). Each mention carries
 * its range flag (range word before it, or joined to a neighbour by and / to / through / or).
 */
export function ratioMentions(text, tol = DOC_TOLERANCES) {
  const raw = [];
  const push = (pos, end, newN, oldN, kind) => { if (fin(newN) && fin(oldN) && newN > 0 && oldN > 0 && newN !== oldN) raw.push({ pos, end, newN, oldN, kind }); };
  for (const m of text.matchAll(RE_FOR)) push(m.index, m.index + m[0].length, parseNumber(m[1]), parseNumber(m[2]), 'FOR');
  for (const m of text.matchAll(RE_COLON)) {
    const end = m.index + m[0].length, after = text.slice(end, end + 40), before = text.slice(Math.max(0, m.index - 20), m.index);
    if (/^\s*(?:a\.?\s?m\b|p\.?\s?m\b|hours?\b)/.test(after)) continue;
    if (!(/^\W{0,3}(?:\w+\W+){0,2}(?:reverse|forward|stock\s+split|share\s+split|split|share\s+consolidation)/.test(after) || /ratio\s+of\s*$/.test(before))) continue;
    push(m.index, end, Number(m[1]), Number(m[2]), 'COLON');
  }
  for (const m of text.matchAll(RE_EACH)) push(m.index, m.index + m[0].length, parseNumber(m[2]), m[1] === undefined ? 1 : parseNumber(m[1]), 'EACH_INTO');
  // a FOR match inside an EACH_INTO match (or the reverse) is one mention: keep the first-starting, longest
  raw.sort((a, b) => a.pos - b.pos || b.end - a.end);
  const ms = []; for (const r of raw) { if (ms.length && r.pos < ms[ms.length - 1].end) continue; ms.push(r); }
  for (let k = 0; k < ms.length; k++) {
    const m = ms[k], ctx = text.slice(Math.max(0, m.pos - tol.directionChars[0]), m.end + tol.directionChars[1]);
    const rev = /\breverse\b|\bconsolidat/.test(ctx), fwd = /\bforward\b/.test(ctx), hi = Math.max(m.newN, m.oldN), lo = Math.min(m.newN, m.oldN);
    m.priceFactor = rev && !fwd ? hi / lo : fwd && !rev ? lo / hi : m.oldN / m.newN;
    m.range = RANGE_WORDS.test(text.slice(Math.max(0, m.pos - tol.rangeLeadChars), m.pos));
    m.splitContext = new RegExp(SPLIT_KEYWORDS.source).test(text.slice(Math.max(0, m.pos - tol.keywordChars), m.end + tol.keywordChars));
  }
  for (let k = 0; k + 1 < ms.length; k++) {
    const gap = text.slice(ms[k].end, ms[k + 1].pos);
    if (gap.length <= tol.rangeJoinChars && /^[\s,]*(?:and|to|through|or|-)[\s,]*(?:(?:a|an)\s+)?(?:ratio\s+of\s+)?$/.test(gap)) ms[k].range = ms[k + 1].range = true;
  }
  return ms;
}

/** Grid value of a price factor c (>= 1: c itself, < 1: 1 / c) or null when it is not on the 1.3.0 grid. */
export function gridFactor(c) {
  if (!(fin(c) && c > 0)) return null;
  const g = c >= 1 ? c : 1 / c, hit = FACTOR_GRID.find((x) => Math.abs(x - g) < 1e-9 * Math.max(1, g));
  return hit === undefined ? null : c >= 1 ? hit : 1 / hit;
}
const passageOf = (text, m) => {
  const a = Math.max(text.lastIndexOf('. ', m.pos) + 2, m.pos - 300), bIdx = text.indexOf('. ', m.end), b = bIdx < 0 ? Math.min(text.length, m.end + 300) : Math.min(bIdx + 1, m.end + 300);
  return text.slice(Math.max(0, a), b);
};

/**
 * Extracts the split statements of one document (no text is kept): per split-context ratio mention its price factor,
 * grid value, label, range flag, the dates within passageChars, effective / merger wording and the SHA-256 of the passage.
 */
export function extractStatements(html, tol = DOC_TOLERANCES) {
  const full = documentText(html), truncated = full.length > tol.maxDocChars, text = truncated ? full.slice(0, tol.maxDocChars) : full;
  const dates = findDates(text), ms = ratioMentions(text, tol);
  const statements = [];
  for (const m of ms) {
    if (!m.splitContext) continue;
    const lo = m.pos - tol.passageChars, hi = m.end + tol.passageChars, around = text.slice(Math.max(0, lo), hi);
    const g = gridFactor(m.priceFactor), small = Math.min(m.newN, m.oldN), large = Math.max(m.newN, m.oldN);
    const isRatio = g !== null || (small <= tol.conflictMaxSmall && large <= tol.conflictMaxLarge);
    if (!isRatio) continue;
    const near = dates.filter((x) => x.pos >= lo && x.pos <= hi), eff = [...around.matchAll(new RegExp(EFFECTIVE_WORDS.source, 'g'))].map((x) => [Math.max(0, lo) + x.index, Math.max(0, lo) + x.index + x[0].length]);
    const effectiveDates = near.filter((x) => eff.some(([a, b]) => x.pos >= a - tol.effectiveDateChars && x.pos <= b + tol.effectiveDateChars)).map((x) => x.date);
    statements.push({ kind: m.kind, factor: g, offGrid: g === null, label: g !== null ? ratioLabel(g) : `${m.newN}-for-${m.oldN}`, range: m.range, dates: near.map((x) => x.date), effectiveDates, effective: eff.length > 0, merger: MERGER_WORDS.test(around), passageSha256: sha(passageOf(text, m)) });
  }
  const kw = text.match(new RegExp(SPLIT_KEYWORDS.source, 'g'));
  return { parser: DOC_PARSER_VERSION, chars: full.length, truncated, textSha256: sha(full), splitKeywordHits: kw ? kw.length : 0, statements };
}

// ---------------------------------------------------------------------------------------------------- document choice

/** Documents to read for session date d from an EDGAR index (form, filingDate, items, accessionNumber, primaryDocument), in priority order. */
export function selectDocuments(index, d, tol = DOC_TOLERANCES) {
  if (!index || !Array.isArray(index.form)) return [];
  const lo = addDays(d, tol.filingWindowDays[0]), hi = addDays(d, tol.filingWindowDays[1]), out = [], seen = new Set();
  for (let k = 0; k < index.form.length; k++) {
    const form = index.form[k], fd = index.filingDate[k], acc = index.accessionNumber?.[k];
    if (!(fd >= lo && fd <= hi) || !acc || seen.has(acc) || !DOC_FORMS.includes(form)) continue;
    const items = String(index.items?.[k] ?? '').split(/[,\s]+/).filter(Boolean);
    const p = DOC_PRIORITY.find((x) => x.forms.includes(form) && (!x.items || x.items.some((y) => items.includes(y))) && (!x.after || fd >= d) && (!x.before || fd <= d));
    if (!p) continue;
    seen.add(acc);
    const dist = p.after ? daysBetween(d, fd) : p.before ? daysBetween(fd, d) : Math.abs(daysBetween(d, fd));
    out.push({ accessionNumber: acc, form, filingDate: fd, primaryDocument: index.primaryDocument?.[k] || null, items: items.join(','), cls: p.cls, dist });
  }
  return out.sort((a, b) => a.cls - b.cls || a.dist - b.dist || (a.accessionNumber < b.accessionNumber ? -1 : 1));
}

/** First session index on / after date s (null beyond the data). */
const sessionOnOrAfter = (raw, s) => { const k = raw.findIndex((b) => b.date >= s); return k < 0 ? null : k; };

/**
 * The document answer for session i (date d) of raw bars: the one ratio the documents of the CIK state, with the
 * statement that dates it within +-effectiveSessions of d; or a reason why there is none. docs: [{ accessionNumber,
 * form, filingDate, extraction }]. complete: all selected documents were read (budget not cut).
 */
export function documentFactor({ docs, raw, i, complete = true, tol = DOC_TOLERANCES }) {
  const d = raw[i].date, lo = addDays(d, tol.filingWindowDays[0]), hi = addDays(d, tol.filingWindowDays[1]);
  const inWin = (docs || []).filter((x) => x.filingDate >= lo && x.filingDate <= hi && x.extraction);
  const all = inWin.flatMap((x) => x.extraction.statements.map((s) => ({ ...s, accessionNumber: x.accessionNumber, form: x.form, filingDate: x.filingDate })));
  const relevant = all.filter((s) => !s.range && (!s.dates.length || s.dates.some((y) => Math.abs(daysBetween(d, y)) <= tol.statementDays)));
  const ev = { documentsRead: inWin.length, statements: all.length, rangeStatements: all.filter((s) => s.range).length, relevantStatements: relevant.length };
  const out = (reason, more = {}) => ({ ok: false, reason, evidence: { ...ev, ...more } });
  if (!complete) return out('EDGAR_BUDGET_EXHAUSTED');
  if (relevant.some((s) => s.merger)) return out('DOCUMENT_MERGER_CONTEXT');
  if (!relevant.length) return out(all.some((s) => s.range) ? 'DOCUMENT_RANGE_ONLY' : inWin.some((x) => x.extraction.splitKeywordHits > 0) ? 'DOCUMENT_NO_RATIO' : 'NO_SPLIT_DOCUMENT_FOUND');
  const labels = [...new Set(relevant.map((s) => s.label))];
  if (labels.length > 1) return out('DOCUMENT_CONFLICTING_RATIOS', { ratios: labels.length });
  const s0 = relevant[0];
  if (s0.offGrid) return out('DOCUMENT_RATIO_NOT_ON_GRID');
  const c = s0.factor;
  const inSessions = (y) => { const k = sessionOnOrAfter(raw, y); return k !== null && Math.abs(k - i) <= tol.effectiveSessions; };
  const dated = relevant.filter((s) => POST_EVENT_FORMS.includes(s.form) && s.effectiveDates.some(inSessions));
  if (!dated.length) {
    const reason = relevant.every((s) => CONTEXT_FORMS.includes(s.form)) ? 'DOCUMENT_PROXY_ONLY' : relevant.some((s) => s.effectiveDates.length) ? 'DOCUMENT_EFFECTIVE_DATE_OUTSIDE_WINDOW' : 'DOCUMENT_NO_EFFECTIVE_DATE';
    return out(reason, { factor: c, label: ratioLabel(c) });
  }
  const best = dated.sort((a, b) => POST_EVENT_FORMS.indexOf(a.form) - POST_EVENT_FORMS.indexOf(b.form) || (a.filingDate < b.filingDate ? -1 : 1))[0];
  const statedDate = best.effectiveDates.find(inSessions);
  return { ok: true, factor: c, label: ratioLabel(c), evidence: { ...ev, factor: c, label: ratioLabel(c), accessionNumber: best.accessionNumber, form: best.form, filingDate: best.filingDate, statedDate, passageSha256: best.passageSha256, confirmingStatements: dated.length } };
}

/** EDGAR ground-truth label of a session (E7-1 validation plan) from the document answer. */
export function groundTruthLabel(df) {
  if (!df) return 'NOT_CHECKED';
  if (df.ok) return df.factor > 1 ? 'REVERSE_SPLIT_DOCUMENTED' : 'FORWARD_SPLIT_DOCUMENTED';
  if (df.reason === 'NO_SPLIT_DOCUMENT_FOUND') return 'NO_SPLIT_DOCUMENT_FOUND';
  if (df.reason === 'EDGAR_BUDGET_EXHAUSTED') return 'NOT_CHECKED';
  if (df.reason === 'DOCUMENT_CONFLICTING_RATIOS' || df.reason === 'DOCUMENT_RANGE_ONLY' || df.reason === 'DOCUMENT_MERGER_CONTEXT') return 'AMBIGUOUS';
  return 'UNCLEAR';
}

// ---------------------------------------------------------------------------------------------------- classification

const unresolved = (reason, evidence = {}) => ({ cls: CLASSES.UNRESOLVED, reason, evidence });
/** The document path a 1.3.0 result opens ('A', 'B') or null. */
export const documentPath = (r13) => (r13?.cls !== CLASSES.UNRESOLVED ? null : DOC_PATH_REASONS.SHARES_PASSED.includes(r13.reason) ? 'A' : DOC_PATH_REASONS.SHARES_UNUSABLE.includes(r13.reason) ? 'B' : null);

/**
 * 1.4.0 class of one session from its 1.3.0 result r13 and the document answer df (documentFactor). index: the EDGAR index
 * of the CIK (merged pages) for the window checks; filings: 1.3.0 filingEvidence of that index at d.
 */
export function classifyWithDocument({ r13, raw, bars, i, sec, identity = {}, otherFlagDates = [], filings, index, df, tol = TOLERANCES, dtol = DOC_TOLERANCES }) {
  if (r13.cls === CLASSES.GENUINE) return df?.ok ? unresolved('DOCUMENT_CONTRADICTS_GENUINE', { ...r13.evidence, document: df.evidence }) : r13;
  const path = documentPath(r13);
  if (!path) return r13;
  const ev = { ...r13.evidence, path13: r13.reason, documentPath: path };
  if (!df?.ok) return unresolved(df?.reason ?? 'DOCUMENT_NOT_CHECKED', { ...ev, document: df?.evidence ?? null });
  const c = df.factor; ev.document = df.evidence; ev.factor = c;
  if (!sec?.cik || sec.how !== 'KNOWN') return unresolved('SPLIT_REQUIRES_KNOWN_CIK', ev);
  if (identity.cikSharedAtSession) return unresolved('CIK_SHARED_BY_LIVE_LISTINGS', ev);
  if (identity.instrumentClass === 'ADR' || sec.taxonomy === 'ifrs-full') return unresolved('ADR_OR_FOREIGN_FILER', ev);
  const r = sessionRatio(bars, i), b = raw[i], p = raw[i - 1];
  if (!fin(r) || !b || !p) return unresolved('PRICE_EVIDENCE_MISSING', ev);
  if ((c > 1) !== (r > 1)) return unresolved('DOCUMENT_AND_PRICE_DIRECTION_CONFLICT', ev);
  if (!within(r / c, tol.priceRatioTol)) return unresolved('PRICE_RATIO_OFF_DOCUMENT_FACTOR', ev);
  const openRel = fin(b.open) && b.open > 0 && fin(p.close) && p.close > 0 ? b.open / p.close : null, openSnap = snapFactor(openRel);
  ev.openRelative = openRel; ev.openSnap = openSnap[0] ?? null;
  if (!(openSnap.length === 1 && sameFactor(openSnap[0], c))) return unresolved('OPEN_SELECTS_OTHER_FACTOR', ev);
  if (path === 'A') {
    const q = r13.evidence?.q, snap = snapFactor(q);
    if (!(snap.length === 1 && sameFactor(snap[0], c))) return unresolved('DOCUMENT_AND_SHARES_DISAGREE', ev);
    if (Math.abs(ln(q / c)) > Math.min(tol.shareResidualGapShare * gridLogGap(c), ln(tol.shareResidualMax)) + 1e-12) return unresolved('SHARE_RESIDUAL_TOO_LARGE', ev);
  } else {
    const lo = raw[Math.max(0, i - dtol.otherFlagSessions)].date, hi = raw[Math.min(raw.length - 1, i + dtol.otherFlagSessions)].date;
    if (otherFlagDates.some((x) => x !== raw[i].date && x >= lo && x <= hi)) return unresolved('MULTIPLE_JUMPS_NEAR_SESSION', ev);
  }
  const v = volumeRelative(raw, i, tol); ev.volumeRelative = v;
  if (v === null) return unresolved('VOLUME_EVIDENCE_MISSING', ev);
  if (!((c > 1 ? v < 1 : v > 1) && within(v * c, tol.volumeRatioTol))) return unresolved('VOLUME_INCONSISTENT_WITH_FACTOR', ev);
  const adj = adjCloseImplied(raw, i), adjSnap = adj === null ? [] : snapFactor(1 / adj); ev.adjCloseImplied = adj;
  if (adj !== null && !(adjSnap.length === 1 && sameFactor(adjSnap[0], c)) && !within(adj, tol.adjCloseTol)) return unresolved('TIINGO_ADJCLOSE_CONFLICT', ev);
  if (!filings?.covered) return unresolved(filings?.reason ?? 'SEC_FILINGS_UNAVAILABLE', ev);
  if (filings.hits.some((h) => h[3] === 'MERGER' || (h[3] === 'ITEM' && h[2].split(',').some((x) => SPLIT_BLOCKING_8K_ITEMS.includes(x))))) return unresolved('MERGER_OR_DISPOSITION_FILING_NEAR_SPLIT', ev);
  if (filings.unknownItems.length) return unresolved('8K_ITEMS_UNKNOWN_NEAR_SPLIT', ev);
  const d = raw[i].date, wlo = addDays(d, dtol.filingWindowDays[0]), whi = addDays(d, dtol.filingWindowDays[1]);
  if ((index?.form || []).some((f, k) => DOC_CONFLICT_FORMS.includes(f) && index.filingDate[k] >= wlo && index.filingDate[k] <= whi)) return unresolved('MERGER_OR_EXCHANGE_OFFER_IN_DOCUMENT_WINDOW', ev);
  ev.secondSource = 'FILING_DOCUMENT';
  return { cls: CLASSES.SPLIT, reason: 'DOCUMENT_STATED_RATIO_SAME_FACTOR', factor: c, splitFactor: 1 / c, label: ratioLabel(c), evidence: ev };
}
