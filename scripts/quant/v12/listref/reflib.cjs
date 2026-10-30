'use strict';
// V12 LISTREF – pure rule functions of protocol-1.0.0 (symbol rule, affinity, intervals, segments).
// No I/O; unit-tested in quant/tests/v12-listref.test.mjs.

const US_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'NYSE MKT', 'AMEX']);
const EXCHANGE_GROUP = { NYSE: 'NYSE', NASDAQ: 'NASDAQ', 'NYSE MKT': 'AMEX', AMEX: 'AMEX' };
const NASDAQ_FIFTH_EXCLUDE = { W: 'WARRANT', U: 'UNIT', R: 'RIGHT', P: 'PREFERRED', O: 'PREFERRED', N: 'PREFERRED', M: 'PREFERRED', V: 'WHEN_ISSUED',
  Y: 'ADR_SUFFIX', F: 'FOREIGN_SUFFIX', G: 'CONVERTIBLE', H: 'CONVERTIBLE', I: 'CONVERTIBLE', T: 'WITH_WARRANTS_OR_RIGHTS' };
const ENDED_BEFORE = '2026-09-28';
const CENSOR_START = '1995-01-03';

// -> { keep: bool, reason, fiveLetterKept }
function classifySymbol(ticker, exchange) {
  const t = String(ticker);
  if (/^[A-Z]{1,4}$/.test(t)) return { keep: true, reason: 'COMMON_SYMBOL', fiveLetterKept: false };
  if (/^[A-Z]{1,4}-[ABC]$/.test(t)) return { keep: true, reason: 'SHARE_CLASS_SYMBOL', fiveLetterKept: false };
  if (/^[A-Z]{5}$/.test(t)) {
    if (exchange !== 'NASDAQ') return { keep: false, reason: 'FIVE_LETTER_NON_NASDAQ', fiveLetterKept: false };
    const ex = NASDAQ_FIFTH_EXCLUDE[t[4]];
    if (ex) return { keep: false, reason: 'NASDAQ_SUFFIX_' + ex, fiveLetterKept: false };
    return { keep: true, reason: 'FIVE_LETTER_KEPT', fiveLetterKept: true };
  }
  if (/-P(-|$)|^-P-/.test(t)) return { keep: false, reason: 'DASH_PREFERRED', fiveLetterKept: false };
  if (/-WS(-|$)|-W$|-W-|-WI$|-WD$/.test(t)) return { keep: false, reason: 'DASH_WARRANT_OR_WHEN_ISSUED', fiveLetterKept: false };
  if (/-U$/.test(t)) return { keep: false, reason: 'DASH_UNIT', fiveLetterKept: false };
  if (/-R(-|$)|-RI$/.test(t)) return { keep: false, reason: 'DASH_RIGHT', fiveLetterKept: false };
  if (/-/.test(t)) return { keep: false, reason: 'DASH_OTHER_SUFFIX', fiveLetterKept: false };
  return { keep: false, reason: 'NON_ALPHA_OR_LONG_SYMBOL', fiveLetterKept: false };
}

function rootOf(ticker) { return String(ticker).replace(/-[ABC]$/, ''); }
// sibling symbols that indicate a SPAC structure (units / warrants)
function spacSiblings(ticker, exchange) {
  const r = rootOf(ticker);
  const s = [r + '-U', r + '-WS', r + '-WS-A', r + '-W'];
  if (exchange === 'NASDAQ' && r.length === 4) s.push(r + 'U', r + 'W');
  return s;
}

const DAY = 86400000;
const toMs = d => Date.parse(d + 'T00:00:00Z');
const addDays = (d, n) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
const activeIn = (row, y) => row.startDate <= y + '-12-31' && row.endDate >= y + '-01-01';
const isEnded = row => row.endDate < ENDED_BEFORE;

// --- ticker/name affinity ------------------------------------------------------------------------
const LEGAL = new Set(['INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED', 'PLC', 'LP', 'LLC', 'L', 'P', 'THE', 'NEW', 'DEL', 'DE', 'SA', 'NV', 'AG', 'SE', 'NA']);
function nameWords(name, keepLegal = false) {
  const s = String(name).toUpperCase().replace(/\/[A-Z]{2,3}\/?/g, ' ').replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]+/g, ' ');
  const w = s.split(/\s+/).filter(Boolean);
  const sig = w.filter(x => !LEGAL.has(x) && x !== 'AND' && x !== 'OF');
  if (keepLegal) {
    const all = w.filter(x => x !== 'THE' && x !== 'AND' && x !== 'OF');
    return all.length ? all : w;
  }
  return sig.length ? sig : w;
}
function isSubsequence(t, s) { let i = 0; for (const ch of s) { if (ch === t[i]) i++; if (i === t.length) return true; } return i === t.length; }
// T as concatenation of non-empty prefixes of words (strictly increasing word index, starting at word 0)
function prefixSegmentation(t, words) {
  const memo = new Map();
  const go = (ti, wi) => {
    if (ti === t.length) return true;
    if (wi >= words.length) return false;
    const k = ti + ':' + wi; if (memo.has(k)) return memo.get(k);
    let ok = false;
    for (let w = wi; w < words.length && !ok; w++) {
      if (wi === 0 && w !== 0 && ti === 0) break; // first segment must come from the first word
      const word = words[w];
      for (let len = 1; len <= word.length && ti + len <= t.length && !ok; len++) {
        if (word.slice(0, len) !== t.slice(ti, ti + len)) break;
        ok = go(ti + len, w + 1);
      }
    }
    memo.set(k, ok); return ok;
  };
  return go(0, 0);
}
function affinity(ticker, name) {
  const t = rootOf(String(ticker).toUpperCase()).replace(/[^A-Z]/g, '');
  if (!t) return 0;
  const sig = nameWords(name), all = nameWords(name, true);
  if (!sig.length) return 0;
  if (prefixSegmentation(t, sig) || prefixSegmentation(t, all)) return 3;
  if (t.length >= 3 && t[0] === sig[0][0] && isSubsequence(t, sig[0])) return 3;
  if (t[0] === sig[0][0] && isSubsequence(t, sig.join(''))) return 2;
  if (isSubsequence(t, all.join(''))) return 1;
  return 0;
}

// --- segments ------------------------------------------------------------------------------------
function sizeClass(floatUsd) {
  if (floatUsd === null || floatUsd === undefined || !Number.isFinite(floatUsd) || floatUsd <= 0) return 'UNKNOWN';
  if (floatUsd > 5e12) return 'UNKNOWN';
  if (floatUsd >= 10e9) return 'MEGA_LARGE';
  if (floatUsd >= 2e9) return 'MID';
  if (floatUsd >= 3e8) return 'SMALL';
  return 'MICRO';
}
// latest float with end in [Y-2-07-01, Y-06-30]; floats sorted by end ascending: [[end, val], ...]
function floatFor(floats, y) {
  if (!floats) return { value: null, flag: null };
  const lo = (y - 2) + '-07-01', hi = y + '-06-30';
  let best = null;
  for (const [end, val] of floats) if (end >= lo && end <= hi) best = [end, val];
  if (!best) return { value: null, flag: null };
  return { value: best[1], flag: best[1] > 5e12 ? 'SCALE_SUSPECT' : null, end: best[0] };
}
function ageBucket(startDate, y) {
  if (startDate <= CENSOR_START) return 'GE10_CENSORED';
  const age = daysBetween(startDate, y + '-07-01') / 365.25;
  if (age < 2) return 'LT2';
  if (age < 5) return '2_5';
  if (age < 10) return '5_10';
  return 'GE10';
}

module.exports = { US_EXCHANGES, EXCHANGE_GROUP, NASDAQ_FIFTH_EXCLUDE, ENDED_BEFORE, CENSOR_START, classifySymbol, rootOf, spacSiblings, addDays, daysBetween, activeIn, isEnded,
  nameWords, isSubsequence, prefixSegmentation, affinity, sizeClass, floatFor, ageBucket };
