(function(g){
'use strict';
// Strict incremental safety, using the existing exchange calendar. This proves
// session closure, not provider revision finality or durable storage entitlement.
const Hours = typeof module!=='undefined'&&module.exports?require('./realtime/market-hours.js'):g.VURealtime.MarketHours;
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function blocked(reason) { return {state:'BLOCKED', reason}; }
function latestClosedSession(now, calendar) {
  if (!calendar?.exchanges?.XNYS) return blocked('CALENDAR_UNAVAILABLE');
  const current=Hours.sessionAt(now,{calendar,exchange:'XNYS'});
  if (!current.calendarCoverage) return blocked('CALENDAR_UNAVAILABLE');
  let day=current.localDate;
  for(let i=0;i<10;i++) {
    // Noon UTC is always the same NY civil date; reuse calendar holiday and
    // early-close semantics rather than inventing a second calendar.
    const session=Hours.sessionAt(day+'T12:00:00Z',{calendar,exchange:'XNYS'});
    if(!session.calendarCoverage)return blocked('CALENDAR_UNAVAILABLE');
    const close=session.earlyClose||calendar.exchanges.XNYS.sessions.REGULAR.end;
    if(session.isTradingDay && (day<current.localDate || current.localTime>=close))
      return {state:'AVAILABLE',date:day,calendarId:calendar.calendarId,providerFinality:'NOT_CERTIFIED'};
    const prior=new Date(day+'T00:00:00Z');prior.setUTCDate(prior.getUTCDate()-1);day=prior.toISOString().slice(0,10);
  }
  return blocked('COMPLETED_SESSION_UNAVAILABLE');
}
function plan(lastStoredDate, session, calendar) {
  if(session.state!=='AVAILABLE')return session;
  if(!validDate(lastStoredDate))return blocked('HISTORY_RESTORE_REQUIRED');
  if(lastStoredDate>session.date)return blocked('STORED_SESSION_NOT_FINAL');
  if(lastStoredDate===session.date)return {state:'CURRENT',through:session.date};
  const from=new Date(lastStoredDate+'T00:00:00Z');from.setUTCDate(from.getUTCDate()+1);
  const expectedDates=[];
  for(let day=from.toISOString().slice(0,10);day<=session.date;) {
    const evidence=calendar?.exchanges?.XNYS && Hours.sessionAt(day+'T12:00:00Z',{calendar,exchange:'XNYS'});
    if(!evidence?.calendarCoverage)return blocked('CALENDAR_UNAVAILABLE');
    if(evidence.isTradingDay)expectedDates.push(day);
    from.setUTCDate(from.getUTCDate()+1);day=from.toISOString().slice(0,10);
  }
  const start=new Date(lastStoredDate+'T00:00:00Z');start.setUTCDate(start.getUTCDate()+1);
  return {state:'FETCH',from:start.toISOString().slice(0,10),through:session.date,expectedDates};
}
function reconcile(bars, plan) {
  if(!Array.isArray(bars)||bars.some(b=>!validDate(b.date)))return blocked('INVALID_BAR_DATE');
  if(bars.some(b=>b.date>plan.through||b.date<plan.from))return blocked('OUTSIDE_INCREMENTAL_WINDOW');
  if(bars.some(b=>!Number.isFinite(b.splitFactor)||!Number.isFinite(b.dividend)))return blocked('CORPORATE_ACTION_EVIDENCE_MISSING');
  if(bars.some(b=>(b.splitFactor!==undefined && b.splitFactor!==null && b.splitFactor!==1) || (b.dividend!==undefined && b.dividend!==null && b.dividend!==0)))
    return blocked('CORPORATE_ACTION_RECONCILIATION_REQUIRED');
  if(!Array.isArray(plan.expectedDates))return blocked('CALENDAR_UNAVAILABLE');
  const dates=new Set(bars.map(b=>b.date));
  if(dates.size!==bars.length)return blocked('DUPLICATE_BAR');
  if(bars.some(b=>!plan.expectedDates.includes(b.date)))return blocked('NON_TRADING_SESSION_BAR');
  // Missing trailing dates stay retryable. A hole before a later bar must
  // never advance the stored watermark beyond the missing session.
  const last=bars.length?bars.map(b=>b.date).sort().at(-1):null;
  if(plan.expectedDates.some(date=>date<=last&&!dates.has(date)))return blocked('MISSING_SESSION_BAR');
  return {state:'AVAILABLE',complete:plan.expectedDates.every(date=>dates.has(date)),providerFinality:'NOT_CERTIFIED'};
}
const api={latestClosedSession,plan,reconcile};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUMarketEodGate=api;
})(typeof window!=='undefined'?window:globalThis);
