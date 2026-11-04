/* Rule-based exact-MIC trading calendar for the ten Europe Discover venues.
 * Sessions are derived for any date range from a weekday rule plus the
 * exchanges' published recurring holiday and early-close rules, so a calendar
 * built from it never expires because of a hard-coded end date. The rules
 * reproduce the reviewed exchange_calendars 4.13.2 schedules that bound the
 * October 2026 publication (see core/tests/europe-exchange-calendar.test.mjs).
 * Unscheduled one-off closures cannot be predicted; they surface as missing
 * provider sessions and are never filled with prices. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.VUCore=root.VUCore||{};root.VUCore.EuropeExchangeCalendar=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 var VERSION='vu-europe-exchange-calendar-1';
 // Holiday keys: fixed "MM-DD" dates or Easter-relative / computed names.
 // close: regular local close; early: local close of shortened sessions.
 var RULES=Object.freeze({
  XETR:{timeZone:'Europe/Berlin',close:'17:30',holidays:['01-01','GOOD_FRIDAY','EASTER_MONDAY','05-01','12-24','12-25','12-26','12-31'],early:{}},
  XPAR:{timeZone:'Europe/Paris',close:'17:30',holidays:['01-01','GOOD_FRIDAY','EASTER_MONDAY','05-01','12-25','12-26'],early:{'12-24':'14:05','12-31':'14:05'}},
  XAMS:{timeZone:'Europe/Amsterdam',close:'17:30',holidays:['01-01','GOOD_FRIDAY','EASTER_MONDAY','05-01','12-25','12-26'],early:{'12-24':'14:05','12-31':'14:05'}},
  XBRU:{timeZone:'Europe/Brussels',close:'17:30',holidays:['01-01','GOOD_FRIDAY','EASTER_MONDAY','05-01','12-25','12-26'],early:{'12-24':'14:05','12-31':'14:05'}},
  XMIL:{timeZone:'Europe/Rome',close:'17:30',holidays:['01-01','GOOD_FRIDAY','EASTER_MONDAY','05-01','08-15','12-24','12-25','12-26','12-31'],early:{}},
  XMAD:{timeZone:'Europe/Madrid',close:'17:30',holidays:['01-01','GOOD_FRIDAY','EASTER_MONDAY','05-01','12-25','12-26'],early:{'12-24':'14:00','12-31':'14:00'}},
  XSWX:{timeZone:'Europe/Zurich',close:'17:30',holidays:['01-01','01-02','GOOD_FRIDAY','EASTER_MONDAY','05-01','ASCENSION','WHIT_MONDAY','08-01','12-24','12-25','12-26','12-31'],early:{}},
  XSTO:{timeZone:'Europe/Stockholm',close:'17:30',holidays:['01-01','01-06','GOOD_FRIDAY','EASTER_MONDAY','05-01','ASCENSION','06-06','MIDSUMMER_EVE','12-24','12-25','12-26','12-31'],early:{'01-05':'13:00','MAUNDY_THURSDAY':'13:00','04-30':'13:00','ASCENSION_EVE':'13:00','ALL_SAINTS_EVE':'13:00'}},
  XCSE:{timeZone:'Europe/Copenhagen',close:'17:00',holidays:['01-01','MAUNDY_THURSDAY','GOOD_FRIDAY','EASTER_MONDAY','GREAT_PRAYER_DAY_UNTIL_2023','ASCENSION','ASCENSION_FRIDAY','WHIT_MONDAY','06-05','12-24','12-25','12-26','12-31'],early:{}},
  XWBO:{timeZone:'Europe/Vienna',close:'17:30',holidays:['01-01','GOOD_FRIDAY','EASTER_MONDAY','05-01','10-26','12-24','12-25','12-26','12-31'],early:{}}
 });
 var DAY=86400000;
 function iso(ms){return new Date(ms).toISOString().slice(0,10);}
 function utc(y,m,d){return Date.UTC(y,m-1,d);}
 function easter(y){var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return utc(y,month,day);}
 function named(key,y){
  var e=easter(y);
  if(/^\d{2}-\d{2}$/.test(key))return iso(utc(y,+key.slice(0,2),+key.slice(3)));
  switch(key){
   case 'MAUNDY_THURSDAY':return iso(e-3*DAY);
   case 'GOOD_FRIDAY':return iso(e-2*DAY);
   case 'EASTER_MONDAY':return iso(e+DAY);
   case 'ASCENSION_EVE':return iso(e+38*DAY);
   case 'ASCENSION':return iso(e+39*DAY);
   case 'ASCENSION_FRIDAY':return iso(e+40*DAY);
   case 'WHIT_MONDAY':return iso(e+50*DAY);
   case 'GREAT_PRAYER_DAY_UNTIL_2023':return y<=2023?iso(e+26*DAY):null;
   case 'MIDSUMMER_EVE':{for(var d=19;d<=25;d++){var t=utc(y,6,d);if(new Date(t).getUTCDay()===5)return iso(t);}return null;}
   case 'ALL_SAINTS_EVE':{for(var s=31;s<=37;s++){var u=utc(y,10,1)+(s-1)*DAY;if(new Date(u).getUTCDay()===6)return iso(u-DAY);}return null;}
  }
  throw Error('UNKNOWN_CALENDAR_RULE:'+key);
 }
 var formatters={};
 function offsetMinutes(timeZone,ms){
  var parts={},f=formatters[timeZone]||(formatters[timeZone]=new Intl.DateTimeFormat('en-US',{timeZone:timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}));
  f.formatToParts(new Date(ms)).forEach(function(p){parts[p.type]=p.value;});
  return (Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second)-ms)/60000;
 }
 function localToIso(date,time,timeZone){
  var guess=Date.parse(date+'T'+time+':00Z'),ms=guess-offsetMinutes(timeZone,guess)*60000;ms=guess-offsetMinutes(timeZone,ms)*60000;
  return new Date(ms).toISOString().replace('.000Z','+00:00');
 }
 function yearRules(rule,y){
  var closed=new Set(),early=new Map();
  rule.holidays.forEach(function(k){var d=named(k,y);if(d)closed.add(d);});
  Object.keys(rule.early).forEach(function(k){var d=named(k,y);if(d)early.set(d,rule.early[k]);});
  return {closed:closed,early:early};
 }
 function day(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&iso(Date.parse(value))===value;}
 /** Sessions with UTC close timestamps for an exact MIC, inclusive range. */
 function sessions(mic,from,to){
  var rule=RULES[mic];if(!rule)throw Error('UNSUPPORTED_EXACT_MIC:'+mic);
  if(!day(from)||!day(to)||from>to)throw Error('INVALID_CALENDAR_RANGE');
  var out=[],cache={};
  for(var t=Date.parse(from);t<=Date.parse(to);t+=DAY){
   var wd=new Date(t).getUTCDay();if(wd===0||wd===6)continue;
   var date=iso(t),y=+date.slice(0,4),r=cache[y]||(cache[y]=yearRules(rule,y));
   if(r.closed.has(date))continue;
   out.push({date:date,close:localToIso(date,r.early.get(date)||rule.close,rule.timeZone)});
  }
  return out;
 }
 function shiftDays(date,n){return iso(Date.parse(date)+n*DAY);}
 /** The publication window is derived from the data and the run date, never
  * from a fixed end date: it starts before the oldest last observation and
  * ends a fixed horizon after the run date. */
 var WINDOW=Object.freeze({leadDays:35,horizonDays:120});
 function publicationWindow(dataDates,runDate){
  if(!Array.isArray(dataDates)||!dataDates.length||dataDates.some(function(d){return !day(d);})||!day(runDate))throw Error('DATA_AND_RUN_DATE_REQUIRED');
  var oldest=dataDates.slice().sort()[0];
  return {coverageFrom:shiftDays(oldest<runDate?oldest:runDate,-WINDOW.leadDays),coverageTo:shiftDays(runDate,WINDOW.horizonDays)};
 }
 return {VERSION:VERSION,RULES:RULES,WINDOW:WINDOW,sessions:sessions,publicationWindow:publicationWindow,easter:function(y){return iso(easter(y));}};
});
