/* Reevaluate only freshness from an immutable exact-MIC schedule. Prices,
 * exclusions, identity evidence and original observation dates stay unchanged. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.VUCore=root.VUCore||{};root.VUCore.EuropeSessionProof=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function refreshCatalog(catalog,calendar,opts){
  var now=Date.parse(opts&&opts.now||new Date().toISOString()),today=new Date(now).toISOString().slice(0,10),out=JSON.parse(JSON.stringify(catalog));
  if(!Number.isFinite(now)||!calendar||calendar.schema!=='europe-exact-mic-display-calendar-1'||!calendar.calendars)throw Error('EXACT_MIC_DISPLAY_CALENDAR_REQUIRED');
  out.securities.forEach(function(s){s.listings.forEach(function(l){
   var p=l.discoverChart,c=calendar.calendars[l.mic];
   if(!p||!c||c.mic!==l.mic||c.sourceSha256!==p.calendarSourceSha256||c.coverageFrom>today||c.coverageTo<today||!Array.isArray(c.sessions)||!c.sessions.length)throw Error('EXACT_MIC_CALENDAR_BINDING_REQUIRED');
   var previous='',completed=[],next=null;
   c.sessions.forEach(function(row){var ms=Date.parse(row.close);if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||row.date<=previous||!Number.isFinite(ms)||row.close.slice(0,10)!==row.date)throw Error('INVALID_EXACT_MIC_SCHEDULE');previous=row.date;if(ms<=now)completed.push(row);else if(!next)next=row;});
   if(!completed.length||!next||p.lastDate< c.coverageFrom||!c.sessions.some(function(r){return r.date===p.lastDate;}))throw Error('CALENDAR_COVERAGE_EXHAUSTED');
   var last=completed[completed.length-1].date,lag=completed.filter(function(r){return r.date>p.lastDate;}).length;
   if(last<p.lastDate)throw Error('FUTURE_CLOSE_IN_CALENDAR');
   p.sourceEvaluatedAt=p.sourceEvaluatedAt||p.evaluatedAt;p.evaluatedAt=new Date(now).toISOString();p.sessionLag=lag;p.freshness=lag===0?'CURRENT_LAST_SESSION':lag<=3?'DELAYED':'STALE';
   p.calendarProof={mic:l.mic,sourceSha256:c.sourceSha256,source:c.source,coverageFrom:c.coverageFrom,coverageTo:c.coverageTo,expectedLastCompletedSession:last,nextScheduledSession:{date:next.date,close:next.close},evaluatedAt:p.evaluatedAt,verified:true};
   p.sessionEvaluation={kind:'IMMUTABLE_SCHEDULE_REEVALUATION',priceEvidenceRef:p.evidenceRef,sourceEvaluatedAt:p.sourceEvaluatedAt};
   l.latest.status=lag===0?'LAST_VALID_SESSION':lag<=3?'DELAYED':'STALE';
  });});return out;
 }
 return {refreshCatalog:refreshCatalog};
});
