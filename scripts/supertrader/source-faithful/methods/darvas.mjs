/**
 * Nicolas Darvas, later Q&A box method (C03, contracts/darvas.mjs). Source: #709 B06 DAR-Q1..Q9 (HARD, HIGH, original
 * wording checked) and DAR-B6. The box state machine and the stops are mechanical; the output is a MANUAL_REVIEW
 * candidate (selection, volume judgment, market context and sizing stay with the reviewer). Not a rolling-high breakout:
 * a box needs a confirmed top AND a confirmed bottom, each by the three-day procedure with touch reset.
 *
 * Adapted from the V4.1 component of Draft PR #712 (methods/darvas-box-v4-1.mjs @ 26e6caf). Changes, declared:
 *  - explicit state names and a transition log (every transition has a golden test);
 *  - pessimistic stop check on the entry bar (the #712 path started on the next bar);
 *  - breakout-day volume is reported against the stock's own volume during the box (no external window).
 *
 * Bars: [{ date, open, high, low, close, volume, splitAdj? }] split-adjusted (DAR-Q15), ascending.
 */
import { rawTickAdjusted, fin } from '../common/series.mjs';

export const DARVAS_VERSION = 'sf-darvas-1.0.0';
export const DARVAS_PARAMS = Object.freeze({ confirmDays: 3, rawFraction: 0.01 }); // DAR-Q1 / DAR-Q2: three days; "a fraction": one raw cent (convention)
export const STATES = Object.freeze({ SEEK_TOP: 'SEEK_TOP', TOP_PENDING: 'TOP_PENDING', BOTTOM_SEARCH: 'BOTTOM_SEARCH', BOX: 'BOX' });
export const BOTTOM_SEARCH_START = Object.freeze({ AFTER_TOP_CONFIRMED: 'AFTER_TOP_CONFIRMED', AFTER_TOP_DAY: 'AFTER_TOP_DAY' });

/** DAR-SF-ENTRY / DAR-SF-SPLITS: the fraction in the split-adjusted basis of bar b. */
export const fractionFor = (b, rawFraction = DARVAS_PARAMS.rawFraction) => rawTickAdjusted(b, rawFraction);

/**
 * Box state machine. step(i) consumes bar i in order and returns that bar's events:
 * TOP_CANDIDATE, TOP_TOUCH_RESET, TOP_CONFIRMED, BOTTOM_CANDIDATE, BOTTOM_TOUCH_RESET, BOTTOM_CONFIRMED (box complete),
 * TOP_RESTARTED (top exceeded before the bottom), BREAKOUT, BOX_FAILED.
 */
export function createDarvasBoxMachine(bars, { bottomSearchStart = BOTTOM_SEARCH_START.AFTER_TOP_CONFIRMED, confirmDays = DARVAS_PARAMS.confirmDays, rawFraction = DARVAS_PARAMS.rawFraction } = {}) {
  if (!BOTTOM_SEARCH_START[bottomSearchStart]) throw new Error('UNKNOWN_BOTTOM_SEARCH_START');
  let st = { phase: STATES.SEEK_TOP, top: null, topDay: null, count: 0, bottom: null, bottomDay: null };
  const boxes = [];
  const topAt = (i) => ({ phase: STATES.TOP_PENDING, top: bars[i].high, topDay: i, count: 0, bottom: null, bottomDay: null });
  const complete = (i) => {
    const box = { top: st.top, bottom: st.bottom, topDate: bars[st.topDay].date, bottomDate: bars[st.bottomDay].date, completeDate: bars[i].date, completeIndex: i, bottomSearchStart };
    boxes.push(box); st = { ...st, phase: STATES.BOX, count: 0 };
    return { type: 'BOTTOM_CONFIRMED', ...box };
  };
  return {
    boxes,
    get state() { return { ...st }; },
    step(i) {
      const b = bars[i], ev = [];
      if (!fin(b.high) || !fin(b.low)) return ev; // missing bar: no decision
      switch (st.phase) {
        case STATES.SEEK_TOP:
          st = topAt(i); ev.push({ type: 'TOP_CANDIDATE', top: st.top });
          break;
        case STATES.TOP_PENDING:
          if (b.high > st.top) { st = topAt(i); ev.push({ type: 'TOP_CANDIDATE', top: st.top }); }
          else if (b.high === st.top) { st.count = 0; ev.push({ type: 'TOP_TOUCH_RESET', top: st.top }); }
          else if (++st.count >= confirmDays) {
            ev.push({ type: 'TOP_CONFIRMED', top: st.top, topDate: bars[st.topDay].date });
            st = { ...st, phase: STATES.BOTTOM_SEARCH, count: 0, bottom: null, bottomDay: null };
            if (bottomSearchStart === BOTTOM_SEARCH_START.AFTER_TOP_DAY) {
              // candidate = lowest low after the top day (latest on ties); the reverse count runs from that bar
              let k = st.topDay + 1; for (let j = st.topDay + 1; j <= i; j++) if (bars[j].low <= bars[k].low) k = j;
              st.bottom = bars[k].low; st.bottomDay = k; st.count = i - k;
              ev.push({ type: 'BOTTOM_CANDIDATE', bottom: st.bottom });
              if (st.count >= confirmDays) ev.push(complete(i));
            }
          }
          break;
        case STATES.BOTTOM_SEARCH:
          if (b.high > st.top) { ev.push({ type: 'TOP_RESTARTED', reason: 'TOP_EXCEEDED_BEFORE_BOTTOM', oldTop: st.top }); st = topAt(i); ev.push({ type: 'TOP_CANDIDATE', top: st.top }); break; }
          if (st.bottom === null || b.low < st.bottom) { st.bottom = b.low; st.bottomDay = i; st.count = 0; ev.push({ type: 'BOTTOM_CANDIDATE', bottom: st.bottom }); }
          else if (b.low === st.bottom) { st.count = 0; ev.push({ type: 'BOTTOM_TOUCH_RESET', bottom: st.bottom }); }
          else if (++st.count >= confirmDays) ev.push(complete(i));
          break;
        case STATES.BOX: {
          const trigger = st.top + fractionFor(b, rawFraction);
          if (b.high >= trigger) {
            const box = boxes.at(-1);
            ev.push({ type: 'BREAKOUT', top: st.top, bottom: st.bottom, trigger, fill: Math.max(b.open, trigger), gapOpen: b.open > trigger, boxIndex: boxes.length - 1, boxTopDate: box.topDate, boxCompleteIndex: box.completeIndex });
            st = topAt(i); ev.push({ type: 'TOP_CANDIDATE', top: st.top });
          } else if (b.low < st.bottom) {
            ev.push({ type: 'BOX_FAILED', top: st.top, bottom: st.bottom });
            st = { phase: STATES.SEEK_TOP, top: null, topDay: null, count: 0, bottom: null, bottomDay: null };
          }
          break;
        }
        default: throw new Error('DARVAS_STATE');
      }
      return ev;
    },
  };
}

/** Runs the machine over all bars; events carry the bar index and date. */
export function darvasEvents(bars, opts) {
  const m = createDarvasBoxMachine(bars, opts), events = [];
  for (let i = 0; i < bars.length; i++) for (const e of m.step(i)) events.push({ i, date: bars[i].date, ...e });
  return { events, boxes: m.boxes };
}

/**
 * DAR-SF-PROTECT / DAR-SF-STOP-INIT / DAR-SF-STOP-RAISE: mechanical position from a BREAKOUT event.
 * The stop is placed with the buy a fraction below the broken top; it is raised a fraction below the bottom of every
 * later completed box whose stop would be higher (effective from the next bar), never lowered. Exit = first bar whose
 * low reaches the stop, fill min(open, stop). Entry bar: a low at or below the initial stop is assumed after the
 * entry (pessimistic, counted as entryBarStop).
 */
export function darvasPosition(bars, entry, { opts, rawFraction = DARVAS_PARAMS.rawFraction } = {}) {
  const e = bars[entry.i];
  let stop = entry.top - fractionFor(e, rawFraction);
  const path = [{ i: entry.i, date: e.date, stop, ruleId: 'DAR-SF-STOP-INIT' }];
  if (e.low <= stop) return { entry: { i: entry.i, date: e.date, fill: entry.fill }, path, exit: { i: entry.i, date: e.date, stop, fill: stop, reason: 'STOP_ENTRY_BAR_PESSIMISTIC' }, entryBarStop: true };
  const later = darvasEvents(bars.slice(entry.i), opts).events.map((x) => ({ ...x, i: x.i + entry.i }));
  for (let i = entry.i + 1; i < bars.length; i++) {
    const b = bars[i];
    if (!fin(b.low)) continue; // missing bar: no fill, no decision
    if (b.low <= stop) return { entry: { i: entry.i, date: e.date, fill: entry.fill }, path, exit: { i, date: b.date, stop, fill: Math.min(b.open, stop), reason: b.open <= stop ? 'STOP_GAP_OPEN' : 'STOP' }, entryBarStop: false };
    for (const x of later) if (x.i === i && x.type === 'BOTTOM_CONFIRMED') { const s = x.bottom - fractionFor(b, rawFraction); if (s > stop) { stop = s; path.push({ i, date: b.date, stop, ruleId: 'DAR-SF-STOP-RAISE', boxTop: x.top, boxBottom: x.bottom }); } }
  }
  return { entry: { i: entry.i, date: e.date, fill: entry.fill }, path, exit: null, entryBarStop: false };
}

export const DARVAS_OPEN_QUESTIONS = Object.freeze([
  { flag: 'DAR-MR-SELECTION', psr709: ['DAR-Q12', 'DAR-Q14', 'DAR-B9', 'DAR-B10', 'DAR-B11'], question: 'techno-fundamental selection: industry growth expectation, strongest stock of the industry, expected earning power' },
  { flag: 'DAR-MR-VOLUME', psr709: ['DAR-Q10', 'DAR-B3'], question: 'is the breakout volume unusual relative to this stock\'s own history?' },
  { flag: 'DAR-MR-MARKET', psr709: ['DAR-Q13', 'DAR-B14'], question: 'market trend and relevant industry representatives' },
  { flag: 'DAR-MR-SIZING', psr709: ['DAR-B15', 'DAR-B18', 'DAR-B8'], question: 'position size, pilot buy, adds (personal exceptions are not generalized)' },
  { flag: 'DAR-MR-FRACTION', psr709: ['DAR-Q4', 'DAR-Q5', 'DAR-C-THIO'], question: 'the machine uses one raw cent as "a fraction"; set another fraction if appropriate' },
]);

/**
 * Machine screen on bar asOfIndex. A BREAKOUT on that bar whose trigger is above every earlier high of the available
 * history (DAR-SF-ATH gate) becomes a MANUAL_REVIEW_REQUIRED record; never a buy.
 * historyFromListing: true only when the bars reach back to the listing date.
 */
export function darvasScreen(security, { asOfIndex = security.bars.length - 1, historyFromListing = false, opts } = {}) {
  const bars = security.bars.slice(0, asOfIndex + 1);
  const { events, boxes } = darvasEvents(bars, opts);
  const out = [];
  for (const e of events.filter((x) => x.type === 'BREAKOUT' && x.i === asOfIndex)) {
    let priorMax = -Infinity; for (let k = 0; k < e.i; k++) if (fin(bars[k].high) && bars[k].high > priorMax) priorMax = bars[k].high;
    if (!(e.trigger > priorMax)) continue; // DAR-SF-ATH gate (within the available history)
    const box = boxes[e.boxIndex], topIdx = bars.findIndex((b) => b.date === box.topDate);
    let vs = 0, vn = 0; for (let k = topIdx; k < e.i; k++) if (fin(bars[k].volume)) { vs += bars[k].volume; vn++; }
    const b = bars[e.i];
    out.push({
      status: 'MANUAL_REVIEW_REQUIRED', methodId: 'SF_DARVAS_BOX', securityId: security.id, asOf: b.date, buyDeclarationAllowed: false, version: DARVAS_VERSION,
      machineScreenEvidence: [
        { ruleId: 'DAR-SF-TOP', psr709: 'DAR-Q1', value: { top: e.top, topDate: box.topDate } },
        { ruleId: 'DAR-SF-BOTTOM', psr709: 'DAR-Q2', value: { bottom: e.bottom, bottomDate: box.bottomDate, bottomSearchStart: box.bottomSearchStart } },
        { ruleId: 'DAR-SF-ENTRY', psr709: 'DAR-Q4', value: { trigger: e.trigger, fill: e.fill, gapOpen: e.gapOpen } },
        { ruleId: 'DAR-SF-STOP-INIT', psr709: 'DAR-Q5', value: e.top - fractionFor(b) },
        { ruleId: 'DAR-SF-ATH', psr709: 'DAR-Q9', value: historyFromListing ? 'ALL_TIME_HIGH' : 'ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED' },
        { ruleId: 'DAR-SF-VOLUME', psr709: 'DAR-Q10', value: { breakoutVolume: b.volume, meanVolumeDuringBox: vn ? vs / vn : null, ratio: vn && vs > 0 ? b.volume / (vs / vn) : null, note: 'evidence only; no minimum (DAR-Q10)' } },
      ],
      openQuestions: DARVAS_OPEN_QUESTIONS,
      dataNotAvailableToMachine: [...(historyFromListing ? [] : ['listing-to-date price history (all-time high unverified)']), 'industry (PIT)', 'fundamentals / expected earning power'],
    });
  }
  return out;
}

/**
 * Component signal study (no sizing, no selection): every ATH-gated breakout of a security with its mechanical stop
 * path and exit. Used by the diagnostic runner as COMPONENT_SIGNAL_STUDY_ONLY; never a method return.
 */
export function darvasComponentTrades(security, { from = null, to = null, opts } = {}) {
  const bars = security.bars, { events } = darvasEvents(bars, opts), trades = [];
  let priorMax = -Infinity, k = 0, busyUntil = -1;
  for (const e of events) {
    while (k < e.i) { if (fin(bars[k].high) && bars[k].high > priorMax) priorMax = bars[k].high; k++; }
    if (e.type !== 'BREAKOUT' || !(e.trigger > priorMax) || e.i <= busyUntil) continue;
    if ((from && bars[e.i].date < from) || (to && bars[e.i].date > to)) continue;
    const p = darvasPosition(bars, e, { opts });
    trades.push({ id: security.id, entryDate: p.entry.date, entryFill: p.entry.fill, exitDate: p.exit?.date ?? null, exitFill: p.exit?.fill ?? null, reason: p.exit?.reason ?? 'OPEN_AT_END', stopRaises: p.path.length - 1, entryBarStop: p.entryBarStop, heldSessions: (p.exit?.i ?? bars.length - 1) - e.i });
    busyUntil = p.exit ? p.exit.i : bars.length; // one position per security at a time
  }
  return trades;
}
