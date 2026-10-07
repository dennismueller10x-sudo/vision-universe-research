/** Evidence-based cash-market calendars. No provider I/O or holiday guesses.
 * annualRules must be complete official year calendars, including the explicit
 * statement that weekday trading applies except for the named closures.
 * A calendar extracted from observed price bars is not an admissible input.
 */
export const EUROPE_CALENDAR_VERSION = 'europe-session-calendar-1.0.0';
const dateOK = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const evidenceOK = (v) => Array.isArray(v) && v.length > 0 && v.every((r) => typeof r === 'string' && r.trim());
const timeOK = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const verified = (v) => v?.verified === true && evidenceOK(v.evidence);
function localClock(now, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
function dayBefore(d) { return new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10); }

export function buildEuropeanCalendar({ mic, timeZone, annualRules = [], regularClose, earlyCloses = {}, now } = {}) {
  if (!mic || !timeZone || typeof now !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(now) || !Number.isFinite(Date.parse(now)))
    throw new Error('MIC_TIMEZONE_AND_FIXED_NOW_REQUIRED');
  const clock = localClock(now, timeZone); // Invalid IANA timezones fail explicitly.
  const rules = new Map(); const ruleErrors = []; const refs = [];
  for (const r of annualRules) {
    if (!Number.isInteger(r.year) || r.year < 1900 || r.year > 2100 || rules.has(r.year)) throw new Error('INVALID_OR_DUPLICATE_CALENDAR_YEAR');
    const dates = [...(r.closedDates || []), ...(r.halfDays || [])];
    if (!verified(r) || r.weekdayTrading !== true || !Array.isArray(r.closedDates) || !Array.isArray(r.halfDays)
      || dates.some((d) => !dateOK(d) || Number(d.slice(0, 4)) !== r.year)
      || new Set(dates).size !== dates.length || r.basis === 'OBSERVED_PRICE_DATES') {
      ruleErrors.push({ year: r.year, cause: 'MISSING_CALENDAR_BASIS' }); continue;
    }
    rules.set(r.year, r); refs.push(...r.evidence);
  }
  const sessions = []; const halfDays = new Set();
  for (const [year, rule] of [...rules].sort((a, b) => a[0] - b[0])) {
    const closed = new Set(rule.closedDates); rule.halfDays.forEach((d) => halfDays.add(d));
    for (let ms = Date.parse(`${year}-01-01`); new Date(ms).getUTCFullYear() === year; ms += 86400000) {
      const d = new Date(ms); const date = d.toISOString().slice(0, 10);
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !closed.has(date)) sessions.push(date);
    }
  }
  const years = [...rules.keys()].sort((a, b) => a - b);
  const missingYears = [];
  if (years.length) for (let y = years[0]; y <= Math.max(years.at(-1), Number(clock.date.slice(0, 4))); y++) if (!rules.has(y)) missingYears.push(y);
  const todayIsSession = sessions.includes(clock.date);
  let completionVerified = rules.has(Number(clock.date.slice(0, 4)));
  let completionBasis = 'NON_TRADING_DAY_AFTER_PREVIOUS_LOCAL_DAY';
  let cutoff = dayBefore(clock.date);
  let close = regularClose;
  if (todayIsSession) {
    if (halfDays.has(clock.date)) close = earlyCloses[clock.date];
    if (!verified(close) || !timeOK(close.time)) {
      completionVerified = false; completionBasis = halfDays.has(clock.date) ? 'EARLY_CLOSE_TIME_UNRESOLVED' : 'REGULAR_CLOSE_TIME_UNRESOLVED';
    } else {
      refs.push(...close.evidence);
      if (close.meaning === 'NOT_BEFORE') {
        // Auction plans commonly state only the earliest possible end and
        // explicitly allow a random extension. That proves yesterday before
        // the bound, but never proves today's completion after the bound.
        completionBasis = 'VERIFIED_EARLIEST_LOCAL_CLOSE_BOUND';
        if (clock.time >= close.time) { completionVerified = false; completionBasis = 'AUCTION_COMPLETION_AFTER_EARLIEST_BOUND_UNRESOLVED'; }
      } else {
        completionBasis = 'VERIFIED_EXCHANGE_LOCAL_CLOSE';
        if (clock.time >= close.time) cutoff = clock.date;
      }
    }
  }
  const expectedLastSession = sessions.filter((d) => d <= cutoff).at(-1) || null;
  const lastSessionYear = expectedLastSession && Number(expectedLastSession.slice(0, 4));
  if (!expectedLastSession || !rules.has(Number(cutoff.slice(0, 4))) || (lastSessionYear && missingYears.some((y) => y >= lastSessionYear && y <= Number(clock.date.slice(0, 4))))) completionVerified = false;
  return { schemaVersion: EUROPE_CALENDAR_VERSION, mic, timeZone, now, localClock: clock,
    verified: completionVerified, historyVerified: rules.size > 0, expectedSessions: sessions,
    expectedLastSession: completionVerified ? expectedLastSession : null,
    lastProvenCompletedSession: expectedLastSession, completionBasis, coveredYears: years, missingYears,
    halfDays: [...halfDays].sort(), ruleErrors, evidence: [...new Set(refs)],
    limitations: ['Normal cash-market calendar, not a trading-halt or listing-specific suspension register.',
      'Missing years and unverified half-day/regular close times are not inferred from another exchange or from observed prices.'] };
}

export function checkCalendarWindow({ calendar, mic, start, end } = {}) {
  const causes = []; const missingYears = [];
  if (!dateOK(start) || !dateOK(end) || start > end) throw new Error('VALID_CALENDAR_WINDOW_REQUIRED');
  if (calendar?.schemaVersion !== EUROPE_CALENDAR_VERSION || calendar.mic !== mic || calendar.historyVerified !== true || !evidenceOK(calendar.evidence)) causes.push('MISSING_CALENDAR_BASIS');
  for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) if (!calendar?.coveredYears?.includes(y)) missingYears.push(y);
  if (missingYears.length) causes.push('MISSING_CALENDAR_BASIS');
  return { status: causes.length ? 'BLOCKED' : 'READY', causes: [...new Set(causes)], missingYears,
    window: { start, end }, expectedSessions: causes.length ? [] : calendar.expectedSessions.filter((d) => d >= start && d <= end), evidence: calendar?.evidence || [] };
}

export function checkEuropeanEodFreshness({ calendar, mic, latestDate } = {}) {
  if (!dateOK(latestDate)) return { status: 'BLOCKED', state: 'INVALID_EOD', cause: 'PROVIDER_DATA_DEFECT', latestDate: latestDate || null };
  if (!calendar?.verified || calendar.mic !== mic || !calendar.expectedLastSession) return {
    status: 'BLOCKED', state: 'UNKNOWN', cause: 'MISSING_CALENDAR_BASIS', latestDate, expectedLastSession: null,
    lastProvenCompletedSession: calendar?.lastProvenCompletedSession || null, evidence: calendar?.evidence || [] };
  const expected = calendar.expectedLastSession;
  if (!calendar.expectedSessions.includes(latestDate) || latestDate > expected) return {
    status: 'BLOCKED', state: 'INVALID_EOD', cause: 'PROVIDER_DATA_DEFECT', latestDate, expectedLastSession: expected,
    reason: 'The EOD date is outside a completed session for this verified MIC calendar.' };
  return { status: latestDate === expected ? 'READY' : 'PARTIAL', cause: latestDate === expected ? null : 'STALE_EOD',
    state: latestDate !== expected ? 'STALE' : expected === calendar.localClock.date ? 'FRESH_CURRENT_SESSION' : 'FRESH_LAST_VALID_SESSION',
    latestDate, expectedLastSession: expected, lagSessions: calendar.expectedSessions.filter((d) => d > latestDate && d <= expected).length,
    dataKind: 'EOD', completionBasis: calendar.completionBasis, evidence: calendar.evidence };
}
