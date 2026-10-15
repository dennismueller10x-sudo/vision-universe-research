/**
 * V4 independent numeric review (separate code path from constructions-v4.mjs and book-v4.mjs).
 * Closes the review gaps found by the V3 adversarial review:
 *  A6  R8b recomputes dividends from the replayed fill ledger and the source bars (V3 R8 took book.dividends
 *      as given); off-calendar security bars are counted and published (V3 dropped them silently).
 *  A7  signal formation is re-scored by an independent scorer on data truncated at the formation date; any
 *      bucket-membership difference is a lookahead or scorer defect and fails the review.
 *  A4  every ending position has a fresh bar within the stale limit or was settled.
 *  A8  dust write-offs are value-capped (checked again here from the ledger, not from the accounting flag).
 *  A10 every expected book must be present exactly once with all hard checks evaluated.
 */
import { DUST_BOOK_VALUE_CAP } from '../measurement/accounting-v4.mjs';

const EPS = 1e-9;

/** R8b: dividends recomputed from fills (holdings at the start of each session) times the source dividend field. */
export function recomputeDividends(book, data) {
  const byId = new Map(data.securities.map((s) => [s.id, s]));
  const fillsByDate = new Map();
  for (const f of book.fills) { if (!fillsByDate.has(f.date)) fillsByDate.set(f.date, []); fillsByDate.get(f.date).push(f); }
  const dustByDate = new Map();
  for (const w of book.dustWriteOffs ?? []) { if (!dustByDate.has(w.date)) dustByDate.set(w.date, []); dustByDate.get(w.date).push(w); }
  const dates = [...new Set([...book.curve.map((p) => p.date)])].sort();
  const held = new Map();
  let total = 0;
  for (const date of dates) {
    for (const [id, shares] of held) {
      if (!(shares > 0)) continue;
      const bars = byId.get(id)?.bars ?? [];
      let lo = 0, hi = bars.length; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].date < date) lo = m + 1; else hi = m; }
      const b = bars[lo]; if (b?.date === date && Number.isFinite(b.dividend) && b.dividend > 0) total += shares * b.dividend;
    }
    for (const f of fillsByDate.get(date) ?? []) held.set(f.id, (held.get(f.id) ?? 0) + (f.side === 'BUY' ? f.shares : -f.shares));
    for (const w of dustByDate.get(date) ?? []) held.set(w.id, 0);
  }
  const diff = Math.abs(total - book.dividends);
  return { id: 'V4-R8B-DIVIDENDS-RECOMPUTED', hard: true, recomputed: total, booked: book.dividends, absoluteDifference: diff, status: diff <= Math.max(1e-6, 1e-9 * Math.abs(total)) ? 'PASS' : 'FAIL' };
}

/** A6: security bars whose date is not a session of the benchmark calendar. */
export function offCalendarCensus(data) {
  const cal = new Set((data.benchmark?.bars || data.spyBars || []).map((b) => b.date));
  let bars = 0, securities = 0, withDividend = 0, withSplit = 0;
  for (const s of data.securities) {
    let hit = false;
    for (const b of s.bars) if (!cal.has(b.date)) { bars++; hit = true; if (b.dividend > 0) withDividend++; if (b.splitFactor && b.splitFactor !== 1) withSplit++; }
    if (hit) securities++;
  }
  return { id: 'V4-A6-OFF-CALENDAR-BARS', hard: true, offCalendarBars: bars, securities, withDividend, withSplit,
    status: withDividend + withSplit === 0 ? 'PASS' : 'FAIL', rule: 'off-calendar bars are tolerated only when they carry no dividend or split (otherwise wealth would be lost)' };
}

/** A8 from the ledger. */
export function dustCheck(book) {
  const value = (book.dustWriteOffs ?? []).reduce((a, w) => a + Math.abs(w.markValue), 0);
  return { id: 'V4-A8-DUST-VALUE-CAP', hard: true, writeOffs: (book.dustWriteOffs ?? []).length, totalAbsMarkValue: value, cap: DUST_BOOK_VALUE_CAP, status: value <= DUST_BOOK_VALUE_CAP ? 'PASS' : 'FAIL' };
}

/** Cash never negative and equity finite on every curve point. */
export function curveCheck(book) {
  const bad = book.curve.filter((p) => !(Number.isFinite(p.equity) && p.equity >= 0)).length;
  return { id: 'V4-CURVE-FINITE-NONNEGATIVE', hard: true, points: book.curve.length, violations: bad, status: bad || book.cash < -EPS ? 'FAIL' : 'PASS' };
}

// ---- A7 independent scorer (deliberately written without the helpers of constructions-v4.mjs) ----
function lastBarOfMonthUpTo(bars, month, cutoff) {
  let found = null;
  for (let i = bars.length - 1; i >= 0; i--) { const d = bars[i].date; if (d > cutoff) continue; if (d.slice(0, 7) === month) { found = bars[i]; break; } if (d.slice(0, 7) < month) break; }
  return found && found.totalReturnIndex > 0 ? found : null;
}
function shiftMonth(month, k) { const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 - k; const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; return `${yy}-${String(mm + 1).padStart(2, '0')}`; }
export function independentMomentum(bars, holdingMonth, F) {
  const truncated = bars.filter((b) => b.date <= F);
  const a = lastBarOfMonthUpTo(truncated, shiftMonth(holdingMonth, 13), F), b = lastBarOfMonthUpTo(truncated, shiftMonth(holdingMonth, 2), F);
  return a && b ? b.totalReturnIndex / a.totalReturnIndex - 1 : null;
}
export function independentVariance(bars, F, calendar) {
  const fi = calendar.indexOf(F); if (fi < 60) return null;
  const truncated = new Map(bars.filter((b) => b.date <= F).map((b) => [b.date, b]));
  const r = [];
  for (let k = fi - 59; k <= fi; k++) { const x = truncated.get(calendar[k]), y = truncated.get(calendar[k - 1]); if (x && y && x.totalReturnIndex > 0 && y.totalReturnIndex > 0) r.push(x.totalReturnIndex / y.totalReturnIndex - 1); }
  if (r.length < 20) return null;
  let s = 0; for (const v of r) s += v; const m = s / r.length; let q = 0; for (const v of r) q += (v - m) * (v - m);
  return q / (r.length - 1);
}
function nyseBreakpoints(values, n) {
  const s = values.slice().sort((a, b) => a - b), out = [];
  for (let k = 1; k < n; k++) { const h = (s.length - 1) * (k / n), lo = Math.floor(h); out.push(s[lo] + (h - lo) * ((s[Math.ceil(h)] ?? s[lo]) - s[lo])); }
  return out;
}

/**
 * A7: for the pre-registered sample of formation months, re-score every member of the construction with
 * the independent scorer on truncated data and compare bucket memberships exactly.
 * Sample: first, last and every 9th holding month (registered before measurement).
 */
export function truncationReview(data, months, calendar, exchangeOf, universeMember = null) {
  const byId = new Map(data.securities.map((s) => [s.id, s]));
  const sample = months.filter((_, i) => i === 0 || i === months.length - 1 || i % 9 === 0);
  const rows = [];
  // V4.1 (review R13): the EW eligible set itself is rebuilt from data truncated at F (bar exactly at F with a valid
  // total-return index, a bar at the last June month-end, no terminal on or before F) and compared as a set.
  const lastOfMonth = new Map(); for (const d of calendar) lastOfMonth.set(d.slice(0, 7), d);
  for (const m of universeMember ? sample : []) {
    const F = m.formation, y = Number(m.month.slice(0, 4)), june = lastOfMonth.get(`${Number(m.month.slice(5, 7)) >= 7 ? y : y - 1}-06`);
    const expected = new Set();
    for (const s of data.securities) {
      if (!universeMember(s) || (s.terminal && s.terminal.date <= F)) continue;
      const t = s.bars.filter((b) => b.date <= F), atF = t.at(-1);
      if (!atF || atF.date !== F || !(atF.totalReturnIndex > 0) || !june || !t.some((b) => b.date === june)) continue;
      expected.add(s.id);
    }
    const actual = new Set(m.EW_MARKET.privateMembership ?? []);
    const missing = [...expected].filter((id) => !actual.has(id)).length, extra = [...actual].filter((id) => !expected.has(id)).length;
    rows.push({ month: m.month, key: 'EW_MARKET_ELIGIBLE_SET', members: actual.size, missingIndependentScore: missing, bucketMismatches: extra });
  }
  for (const m of sample) {
    for (const [key, n, score] of [
      ['MOM_12_2_EW_DECILES', 10, (s) => independentMomentum(s.bars, m.month, m.formation)],
      ['VAR_60D_EW_QUINTILES', 5, (s) => independentVariance(s.bars, m.formation, calendar)],
    ]) {
      const c = m[key]; if (c?.status !== 'READY') continue;
      const members = c.privateMembership.flatMap((ids, k) => ids.map((id) => ({ id, k })));
      const scored = members.map((x) => ({ ...x, v: score(byId.get(x.id)) }));
      const missing = scored.filter((x) => !Number.isFinite(x.v)).length;
      const bps = nyseBreakpoints(scored.filter((x) => Number.isFinite(x.v) && exchangeOf(byId.get(x.id)) === 'NYSE').map((x) => x.v), n);
      const mismatches = scored.filter((x) => Number.isFinite(x.v)).filter((x) => { let k = 0; while (k < bps.length && x.v > bps[k]) k++; return k !== x.k; }).length;
      rows.push({ month: m.month, key, members: members.length, missingIndependentScore: missing, bucketMismatches: mismatches });
    }
  }
  const bad = rows.filter((r) => r.missingIndependentScore || r.bucketMismatches).length;
  return { id: 'V4-A7-TRUNCATION-INDEPENDENT-SCORER', hard: true, sampledFormations: rows.length, failingFormations: bad, rows, status: rows.length && !bad ? 'PASS' : 'FAIL' };
}

/** A10: assembles book reviews; every expected book exactly once, all hard checks evaluated. */
export function assembleReview(books, expected) {
  const seen = new Map();
  for (const b of books) { if (seen.has(b.book)) throw new Error('DUPLICATE_REVIEWED_BOOK'); seen.set(b.book, b); }
  const missing = expected.filter((e) => !seen.has(e));
  const out = books.map((b) => ({ book: b.book, hardChecks: b.checks.filter((c) => c.hard).length, failedHardChecks: b.checks.filter((c) => c.hard && c.status !== 'PASS').map((c) => c.id), checks: b.checks }));
  return { status: missing.length || out.some((b) => b.failedHardChecks.length || !b.hardChecks) ? 'FAIL' : 'PASS', expectedBooks: expected, missingBooks: missing, books: out };
}
