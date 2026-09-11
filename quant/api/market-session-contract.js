/* Calendar context only: session phase is never evidence of a live feed. */
(function(g){
'use strict';
const Hours=typeof module!=='undefined'&&module.exports?require('../engines/realtime/market-hours.js'):g.VURealtime.MarketHours;
const phases={PRE:'PRE_MARKET',REGULAR:'REGULAR',AFTER:'AFTER_HOURS',CLOSED:'CLOSED'};
const labels={PRE:'NYSE · Vorbörse',REGULAR:'NYSE · regulärer Handel',AFTER:'NYSE · Nachbörse',CLOSED:'NYSE · geschlossen'};
function build(calendar,now=new Date().toISOString()){
 const missing={state:'UNAVAILABLE',reason:'CALENDAR_UNAVAILABLE',phase:null,label:'Handelsphase nicht bestätigt',isLive:false};
 if(calendar?.schemaVersion!=='1.0.0'||calendar.calendarId!=='XNYS-v1'||calendar.exchanges?.XNYS?.timezone!=='America/New_York')return missing;
 const ex=calendar.exchanges.XNYS,time=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t),date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 if(!date(calendar.coverage?.from)||!date(calendar.coverage?.to)||calendar.coverage.from>calendar.coverage.to||!Array.isArray(ex.weekdays)||!ex.weekdays.length||ex.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||!Array.isArray(ex.holidays)||!ex.holidays.every(date)||!ex.earlyCloses||typeof ex.earlyCloses!=='object'||Array.isArray(ex.earlyCloses))return missing;
 if(['PRE','REGULAR','AFTER'].some(p=>!time(ex.sessions?.[p]?.start)||!time(ex.sessions?.[p]?.end)||ex.sessions[p].start>=ex.sessions[p].end)||ex.sessions.PRE.end!==ex.sessions.REGULAR.start||ex.sessions.REGULAR.end!==ex.sessions.AFTER.start)return missing;
 if(Object.entries(ex.earlyCloses).some(([d,t])=>!date(d)||!time(t)||t<=ex.sessions.REGULAR.start||t>=ex.sessions.REGULAR.end))return missing;
 try{const result=Hours.sessionAt(now,{calendar,exchange:'XNYS'});if(!result.calendarCoverage||!phases[result.phase])return {...missing,reason:'OUTSIDE_CALENDAR_COVERAGE'};
 return {version:'1.0.0',state:'AVAILABLE',phase:phases[result.phase],label:labels[result.phase],exchange:'XNYS',localDate:result.localDate,localTime:result.localTime,timezone:result.timezone,asOf:new Date(now).toISOString(),calendarId:result.calendarId,earlyClose:result.earlyClose,isLive:false,source:'EXISTING_EXCHANGE_CALENDAR',limitation:'Calendar schedule, not exchange operational confirmation or provider stream status'};
 }catch{return missing;}
}
const api={build};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUMarketSessionContract=api;
})(typeof window!=='undefined'?window:globalThis);
