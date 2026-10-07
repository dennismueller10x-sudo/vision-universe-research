import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEuropeanCalendar, checkCalendarWindow, checkEuropeanEodFreshness} from '../europe-calendar.mjs';
const rule = (year, closedDates = [], halfDays = []) => ({year, closedDates, halfDays, verified:true,
  weekdayTrading:true, basis:'SYNTHETIC_COMPLETE_YEAR_FIXTURE', evidence:['synthetic-only']});
const cfg = () => ({mic:'XETR',timeZone:'Europe/Berlin',annualRules:[rule(2026,['2026-04-03','2026-04-06'],['2026-12-30'])],
  regularClose:{verified:true,time:'17:35',evidence:['synthetic-close-only']},now:'2026-10-06T13:00:00Z'});
test('before a documented local close the completed EOD session is yesterday',()=>{
 const c=buildEuropeanCalendar(cfg());assert.equal(c.expectedLastSession,'2026-10-05');assert.equal(c.verified,true);
 assert.equal(checkEuropeanEodFreshness({calendar:c,mic:'XETR',latestDate:'2026-10-05'}).status,'READY');
 assert.equal(checkEuropeanEodFreshness({calendar:c,mic:'XETR',latestDate:'2026-10-06'}).status,'BLOCKED');
});
test('after close and on weekends the same calendar selects the actual completed session',()=>{
 const c=buildEuropeanCalendar({...cfg(),now:'2026-10-06T16:00:00Z'});assert.equal(c.expectedLastSession,'2026-10-06');
 const weekend=buildEuropeanCalendar({...cfg(),now:'2026-10-11T12:00:00Z'});assert.equal(weekend.expectedLastSession,'2026-10-09');
 const stale=checkEuropeanEodFreshness({calendar:weekend,mic:'XETR',latestDate:'2026-10-05'});assert.equal(stale.status,'PARTIAL');assert.equal(stale.lagSessions,4);
});
test('source closures, including Easter, cannot be replaced by weekdays inferred from prices',()=>{
 const c=buildEuropeanCalendar({...cfg(),now:'2026-04-06T20:00:00Z'});assert.equal(c.expectedLastSession,'2026-04-02');
 const bad=cfg();bad.annualRules[0].basis='OBSERVED_PRICE_DATES';const blocked=buildEuropeanCalendar(bad);assert.equal(blocked.historyVerified,false);
 assert.equal(checkCalendarWindow({calendar:blocked,mic:'XETR',start:'2026-01-01',end:'2026-10-05'}).status,'BLOCKED');
});
test('IANA timezone handles CET and CEST; UTC is not misused as local close time',()=>{
 const summer=buildEuropeanCalendar({...cfg(),now:'2026-10-06T15:40:00Z'});assert.equal(summer.expectedLastSession,'2026-10-06');
 const winter=buildEuropeanCalendar({...cfg(),now:'2026-11-03T15:40:00Z'});assert.equal(winter.expectedLastSession,'2026-11-02');
});
test('a missing calendar year blocks that window without discarding evidenced years',()=>{
 const c=buildEuropeanCalendar({...cfg(),annualRules:[rule(2024),rule(2026)]});assert.deepEqual(c.missingYears,[2025]);
 assert.equal(checkCalendarWindow({calendar:c,mic:'XETR',start:'2024-01-01',end:'2026-10-05'}).status,'BLOCKED');
 assert.equal(checkCalendarWindow({calendar:c,mic:'XETR',start:'2026-01-01',end:'2026-10-05'}).status,'READY');
 assert.equal(checkCalendarWindow({calendar:c,mic:'XPAR',start:'2026-01-01',end:'2026-10-05'}).status,'BLOCKED');
});
test('half-day close time requires its own evidence, never a normal-day guess',()=>{
 const c=buildEuropeanCalendar({...cfg(),now:'2026-12-30T14:00:00Z'});assert.equal(c.verified,false);assert.equal(c.completionBasis,'EARLY_CLOSE_TIME_UNRESOLVED');
 const ready=buildEuropeanCalendar({...cfg(),now:'2026-12-30T14:00:00Z',earlyCloses:{'2026-12-30':{verified:true,time:'14:15',evidence:['synthetic-halfday']}}});assert.equal(ready.expectedLastSession,'2026-12-30');
});
test('no regular close evidence still permits daily completeness, but not fresh-EOD certification',()=>{
 const c=buildEuropeanCalendar({...cfg(),regularClose:undefined});assert.equal(c.verified,false);assert.equal(c.historyVerified,true);
 assert.equal(checkCalendarWindow({calendar:c,mic:'XETR',start:'2026-01-01',end:'2026-10-05'}).status,'READY');
 assert.equal(checkEuropeanEodFreshness({calendar:c,mic:'XETR',latestDate:'2026-10-05'}).status,'BLOCKED');
});
test('an earliest auction-end bound proves only the preceding session before that time',()=>{
 const early={verified:true,time:'17:30',meaning:'NOT_BEFORE',evidence:['synthetic-random-auction-end']};
 const before=buildEuropeanCalendar({...cfg(),regularClose:early});assert.equal(before.expectedLastSession,'2026-10-05');
 const after=buildEuropeanCalendar({...cfg(),regularClose:early,now:'2026-10-06T16:00:00Z'});assert.equal(after.verified,false);assert.equal(after.expectedLastSession,null);
});
test('bad year/date/source evidence fails instead of manufacturing a calendar',()=>{
 const bad=cfg();bad.annualRules[0].closedDates=['2026-02-30'];assert.equal(buildEuropeanCalendar(bad).historyVerified,false);
 assert.throws(()=>buildEuropeanCalendar({...cfg(),annualRules:[rule(2026),rule(2026)]}),/DUPLICATE/);
 assert.throws(()=>buildEuropeanCalendar({...cfg(),now:undefined}),/FIXED_NOW/);
});
test('freshness distinguishes completed current EOD from the last valid session and never calls intraday fresh',()=>{
 const before=buildEuropeanCalendar({...cfg(),now:'2026-10-07T08:31:59Z'});
 assert.equal(checkEuropeanEodFreshness({calendar:before,mic:'XETR',latestDate:'2026-10-06'}).state,'FRESH_LAST_VALID_SESSION');
 assert.equal(checkEuropeanEodFreshness({calendar:before,mic:'XETR',latestDate:'2026-10-05'}).state,'STALE');
 assert.equal(checkEuropeanEodFreshness({calendar:before,mic:'XETR',latestDate:'2026-10-07'}).state,'INVALID_EOD');
 const after=buildEuropeanCalendar({...cfg(),now:'2026-10-07T17:00:00Z'});
 assert.equal(checkEuropeanEodFreshness({calendar:after,mic:'XETR',latestDate:'2026-10-07'}).state,'FRESH_CURRENT_SESSION');
 const random=buildEuropeanCalendar({...cfg(),regularClose:{verified:true,time:'17:30',meaning:'NOT_BEFORE',evidence:['synthetic-only']},now:'2026-10-07T17:00:00Z'});
 assert.equal(checkEuropeanEodFreshness({calendar:random,mic:'XETR',latestDate:'2026-10-07'}).state,'UNKNOWN');
});
