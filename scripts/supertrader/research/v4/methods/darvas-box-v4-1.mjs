/**
 * Darvas later Q&A box state machine (V4.1, research). MACHINE SCREEN ONLY: it emits MANUAL_REVIEW_REQUIRED records,
 * never BUY. Source: #709 rules DAR-Q1..DAR-Q9 (B06, printed pp. 182-197, HARD, HIGH, original wording checked,
 * clearance SCOPE_AND_EXCEPTIONS_REQUIRED). Selection (DAR-Q12/Q14), volume judgment (DAR-Q10), re-entry (DAR-Q11)
 * and sizing stay with the reviewer (#709 C03: "techno-fundamental selection and sizing remain discretionary").
 *
 * Input bars: [{ date, open, high, low, close, volume, splitAdjustmentFactor? }] split-adjusted (DAR-Q15), ascending.
 */

export const DARVAS_RULES_V41 = [
  { ruleId: 'D41-TOP', psr709: ['DAR-Q1'], kind: 'SOURCE', rule: 'box top = a new high that is not touched or exceeded on the three following sessions; a touch (high equal to the candidate) or a higher high restarts the count', code: 'createDarvasBoxMachine#step' },
  { ruleId: 'D41-BOTTOM', psr709: ['DAR-Q2'], kind: 'SOURCE', rule: 'box bottom only after the top is established; reverse three-day procedure: a low not touched or undercut on the three following sessions; a re-touch restarts the count (#709 VU-DAR missing rule)', code: 'createDarvasBoxMachine#step' },
  { ruleId: 'D41-NO-WAIT', psr709: ['DAR-Q3'], kind: 'SOURCE', rule: 'the three days confirm boundaries; there is no waiting period after the breakout (DAR-ARLAN)', code: 'createDarvasBoxMachine#step' },
  { ruleId: 'D41-ENTRY', psr709: ['DAR-Q4'], kind: 'SOURCE', rule: 'buy-stop a fraction above the completed box top, executed on the breakthrough; fill = max(open, trigger)', code: 'createDarvasBoxMachine#step' },
  { ruleId: 'D41-STOP-INIT', psr709: ['DAR-Q5', 'DAR-Q7'], kind: 'SOURCE', rule: 'initial stop a fraction below the broken box top; never inside the box', code: 'darvasStopPath' },
  { ruleId: 'D41-STOP-RAISE', psr709: ['DAR-Q6', 'DAR-Q8'], kind: 'SOURCE', rule: 'when a new higher box has both boundaries, raise the stop to a fraction below its bottom (never lower it); the new bottom need not equal the old top', code: 'darvasStopPath' },
  { ruleId: 'D41-ATH', psr709: ['DAR-Q9', 'DAR-Q12'], kind: 'SOURCE', rule: 'all-time high is required: evidence ALL_TIME_HIGH_IN_AVAILABLE_HISTORY; when the history does not reach the listing date the flag is unverifiable and goes to review', code: 'darvasScreen' },
  { ruleId: 'D41-FRACTION', psr709: ['DAR-Q4', 'DAR-Q5', 'DAR-C-THIO'], kind: 'CONVENTION', rule: 'the source says "a fraction" and does not quantify it; VU convention = one raw cent (0.01 / split factor), the same tick as V4 Turtle; the reviewer may set another fraction per trade (DAR-C-THIO: no automatic same fraction for all trades)', code: 'fractionFor' },
  { ruleId: 'D41-BOTTOM-START', psr709: ['DAR-Q2'], kind: 'INTERPRETATION', rule: 'the bottom search starts on the first session after the top is confirmed (default) or after the top day; #709 VU-DAR records the start as UNRESOLVED, both are supported', code: 'createDarvasBoxMachine' },
  { ruleId: 'D41-TOP-EXCEEDED', psr709: ['DAR-Q1', 'DAR-Q2'], kind: 'INTERPRETATION', rule: 'a high above the confirmed top before the bottom is confirmed means no complete box yet: the top search restarts at that high', code: 'createDarvasBoxMachine#step' },
  { ruleId: 'D41-BOX-FAIL', psr709: ['DAR-Q11'], kind: 'INTERPRETATION', rule: 'a low below the completed box bottom before a breakout dissolves the box; the top search restarts', code: 'createDarvasBoxMachine#step' },
];

export const DARVAS_OPEN_QUESTIONS = [
  { psr709: ['DAR-Q12', 'DAR-Q14'], question: 'techno-fundamental selection: industry growth expectation and strongest stocks of the industry' },
  { psr709: ['DAR-Q10'], question: 'volume relative to the stock\'s own history (no general minimum)' },
  { psr709: ['DAR-Q13'], question: 'market trend and representatives of relevant industries' },
  { psr709: ['DAR-C1', 'DAR-C3', 'DAR-C6'], question: 'personal exceptions (pilot buys, adds below the pilot price, test stops) are not generalized; sizing is the reviewer\'s decision' },
];

export const fractionFor = (bar, rawTick = 0.01) => rawTick / (bar.splitAdjustmentFactor || 1);

/**
 * Box state machine. step(i) consumes bar i and returns the events of that bar:
 * TOP_CONFIRMED, BOTTOM_CONFIRMED (box complete), BREAKOUT, BOX_FAILED, TOP_RESTARTED.
 */
export function createDarvasBoxMachine(bars, { bottomSearchStart = 'AFTER_TOP_CONFIRMED', confirmDays = 3 } = {}) {
  let st = { phase: 'SEEK_TOP', top: null, topDay: null, count: 0, bottom: null };
  const boxes = [];
  const restartTop = (i) => ({ phase: 'TOP_PENDING', top: bars[i].high, topDay: i, count: 0, bottom: null });
  return {
    boxes,
    get state() { return { ...st }; },
    step(i) {
      const b = bars[i], ev = [];
      switch (st.phase) {
        case 'SEEK_TOP': st = restartTop(i); break;
        case 'TOP_PENDING':
          if (b.high > st.top) st = restartTop(i);
          else if (b.high === st.top) st.count = 0;
          else if (++st.count >= confirmDays) {
            ev.push({ type: 'TOP_CONFIRMED', top: st.top, topDate: bars[st.topDay].date });
            st = { ...st, phase: 'BOTTOM_SEARCH', count: 0, bottom: null };
            if (bottomSearchStart === 'AFTER_TOP_DAY') {
              // candidate = lowest low after the top day; the reverse count starts after the candidate
              let k = st.topDay + 1; for (let j = st.topDay + 1; j <= i; j++) if (bars[j].low <= bars[k].low) k = j;
              st.bottom = bars[k].low; st.count = i - k;
              if (st.count >= confirmDays) { ev.push(complete(i)); }
            }
          }
          break;
        case 'BOTTOM_SEARCH':
          if (b.high > st.top) { ev.push({ type: 'TOP_RESTARTED', reason: 'TOP_EXCEEDED_BEFORE_BOTTOM', oldTop: st.top }); st = restartTop(i); break; }
          if (st.bottom === null || b.low < st.bottom) { st.bottom = b.low; st.count = 0; }
          else if (b.low === st.bottom) st.count = 0;
          else if (++st.count >= confirmDays) ev.push(complete(i));
          break;
        case 'BOX': {
          const trigger = st.top + fractionFor(b);
          if (b.high >= trigger) {
            const box = boxes.at(-1);
            ev.push({ type: 'BREAKOUT', top: st.top, bottom: st.bottom, trigger, fill: Math.max(b.open, trigger), boxIndex: boxes.length - 1, boxStart: box.topDate });
            st = restartTop(i);
          } else if (b.low < st.bottom) {
            ev.push({ type: 'BOX_FAILED', top: st.top, bottom: st.bottom });
            st = { phase: 'SEEK_TOP', top: null, topDay: null, count: 0, bottom: null };
          }
          break;
        }
        default: throw new Error('DARVAS_STATE');
      }
      return ev;
      function complete(k) {
        const box = { top: st.top, bottom: st.bottom, topDate: bars[st.topDay].date, completeDate: bars[k].date };
        boxes.push(box); st = { ...st, phase: 'BOX', count: 0 };
        return { type: 'BOTTOM_CONFIRMED', ...box };
      }
    },
  };
}

/** Runs the machine over all bars; returns the events with their bar index and date. */
export function darvasEvents(bars, opts) {
  const m = createDarvasBoxMachine(bars, opts), out = [];
  for (let i = 0; i < bars.length; i++) for (const e of m.step(i)) out.push({ i, date: bars[i].date, ...e });
  return { events: out, boxes: m.boxes };
}

/**
 * D41-STOP-*: stop path of a hypothetical position entered at breakout event `entry` (from darvasEvents).
 * Returns per-bar stops from the entry bar on and the exit (first low at or below the stop; fill = min(open, stop)).
 */
export function darvasStopPath(bars, entry, { opts } = {}) {
  let stop = entry.top - fractionFor(bars[entry.i]);
  const later = darvasEvents(bars.slice(entry.i), opts).events.map((e) => ({ ...e, i: e.i + entry.i }));
  const path = [];
  for (let i = entry.i; i < bars.length; i++) {
    const b = bars[i];
    if (i > entry.i && b.low <= stop) return { path, exit: { i, date: b.date, stop, fill: Math.min(b.open, stop) } };
    for (const e of later) if (e.i === i && e.type === 'BOTTOM_CONFIRMED') { const s = e.bottom - fractionFor(b); if (s > stop) stop = s; }
    path.push({ i, date: b.date, stop });
  }
  return { path, exit: null };
}

/**
 * Machine screen: every BREAKOUT on the last bar (asOf) becomes a MANUAL_REVIEW_REQUIRED record.
 * historyFromListing: true only when the bars reach back to the listing date (otherwise the ATH is unverifiable).
 */
export function darvasScreen(security, { asOfIndex = security.bars.length - 1, historyFromListing = false, opts } = {}) {
  const bars = security.bars.slice(0, asOfIndex + 1);
  const { events } = darvasEvents(bars, opts);
  return events.filter((e) => e.type === 'BREAKOUT' && e.i === asOfIndex).map((e) => {
    let priorMax = -Infinity; for (let k = 0; k < e.i; k++) if (bars[k].high > priorMax) priorMax = bars[k].high;
    const athInHistory = e.top >= priorMax;
    return {
      status: 'MANUAL_REVIEW_REQUIRED', methodId: 'DARVAS_LATER_QA', securityId: security.id, asOf: bars[e.i].date, buyDeclarationAllowed: false,
      machineScreenEvidence: [
        { ruleId: 'D41-TOP', psr709: 'DAR-Q1', value: e.top },
        { ruleId: 'D41-BOTTOM', psr709: 'DAR-Q2', value: e.bottom },
        { ruleId: 'D41-ENTRY', psr709: 'DAR-Q4', value: { trigger: e.trigger, fill: e.fill } },
        { ruleId: 'D41-STOP-INIT', psr709: 'DAR-Q5', value: e.top - fractionFor(bars[e.i]) },
        { ruleId: 'D41-ATH', psr709: 'DAR-Q9', value: historyFromListing ? (athInHistory ? 'ALL_TIME_HIGH' : 'NOT_ALL_TIME_HIGH') : (athInHistory ? 'ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED' : 'NOT_ALL_TIME_HIGH') },
      ],
      openQuestions: DARVAS_OPEN_QUESTIONS,
      dataNotAvailableToMachine: historyFromListing ? ['industry (PIT)', 'fundamentals for the techno-fundamental selection'] : ['listing-to-date price history', 'industry (PIT)', 'fundamentals for the techno-fundamental selection'],
    };
  });
}
