import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={VUCompanyIntelligence:{safeLink:url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}}};
vm.runInNewContext(readFileSync('company-intelligence/ui/stock-section.js','utf8'),context);
const {viewModel,freshness,storyType,changeLabel}=context.VUCompanyIntelligenceStock;
const now=Date.parse('2026-10-07T15:00:00Z'),cid='iss_cik_0001318605';
const news=(id,date,extra={})=>({companyId:cid,newsId:id,canonicalUrl:'https://www.tesla.com/'+id,publishedAt:date,eventType:'NEWS',...extra});
test('publication freshness never substitutes observation/update timestamps',()=>{
 assert.equal(freshness(null,now),'UNDATED');assert.equal(freshness('2026-10-08',now),'FUTURE');
 for(const [date,bucket] of [['2026-10-07','TODAY'],['2026-10-03','7_DAYS'],['2026-09-20','30_DAYS'],['2026-08-01','90_DAYS'],['2025-01-01','OLDER']])assert.equal(freshness(date,now),bucket);
 const m=viewModel({companyId:cid,news:[news('undated',null,{observedAt:'2026-10-07T14:00:00Z'})]},now);
 assert.equal(m.recent.length,0);assert.equal(m.archive.length,1);
});
test('consumer intelligence unifies verified releases and material events without routine filing dumps',()=>{
 const m=viewModel({companyId:cid,news:[news('release','2026-10-01'),news('release','2026-10-01')],materialEvents:[{companyId:cid,eventType:'MATERIAL_SEC_EVENT',importance:'HIGH',sourceUrl:'https://www.sec.gov/material',date:'2026-10-02'},{companyId:cid,eventType:'MATERIAL_SEC_EVENT',importance:'MEDIUM',sourceUrl:'https://www.sec.gov/routine',date:'2026-10-03'}],earnings:[{companyId:cid,eventType:'EARNINGS_PUBLISHED',sourceUrl:'https://www.tesla.com/results',date:'2026-10-04'},{companyId:cid,eventType:'PERIODIC_REPORT_PUBLISHED',isAmendment:true,sourceUrl:'https://www.sec.gov/amendment',date:'2026-10-05'}]},now);
 assert.equal(m.recent.length,3);assert.equal(m.recent[0].eventType,'EARNINGS_PUBLISHED');assert.equal(m.archive.length,0);
});
test('wrong issuers, missing/unsafe links and future announcements stay out of intelligence',()=>{
 const m=viewModel({companyId:cid,news:[news('wrong','2026-10-01',{companyId:'other'}),news('bad','2026-10-01',{canonicalUrl:'javascript:alert(1)'}),news('future','2026-11-01')]},now);
 assert.equal(m.recent.length,0);assert.equal(m.archive.length,0);
});
test('events retain separate release/call, date-only and honest estimates, removing cancellations and past calls',()=>{
 const events=[{eventType:'EARNINGS_SCHEDULED',confirmationStatus:'CONFIRMED',date:'2026-10-24'},{eventType:'EARNINGS_CALL',confirmationStatus:'CONFIRMED',date:'2026-10-24',startsAt:'2026-10-24T23:30:00Z'},{eventType:'EARNINGS_ESTIMATED',confirmationStatus:'ESTIMATED',dateStart:'2026-10-09',dateEnd:'2026-10-30'},{confirmationStatus:'CONFIRMED',date:'2026-10-24',eventStatus:'CANCELLED'},{confirmationStatus:'CONFIRMED',startsAt:'2026-10-07T14:00:00Z'}];
 const m=viewModel({companyId:cid,events},now);assert.equal(m.confirmed.length,2);assert.equal(m.estimates.length,1);assert.equal(m.confirmed[0].startsAt,undefined);
});
test('only available metrics and supported comparisons appear; share changes require context',()=>{
 const m=viewModel({companyId:cid,latestFinancials:{metrics:{revenue:{current:{value:0,unit:'USD'}},eps_diluted:{current:{value:NaN}}},whatChanged:[{metric:'shares_outstanding',comparison:'YEAR_AGO_QUARTER',previous:1,current:2},{metric:'revenue',comparison:'UNKNOWN',previous:1,current:2},{metric:'revenue_growth',comparison:'PREVIOUS_QUARTER_YOY_GROWTH',previous:18,current:24}]}},now);
 assert.deepEqual(Array.from(m.metrics),['revenue']);assert.equal(m.changes.length,1);assert.equal(m.changes[0].metric,'revenue_growth');
});
test('confirmed results supersede only the same issuer and fiscal-period estimate, retaining the raw evidence',()=>{
 const estimate={companyId:cid,eventType:'EARNINGS_ESTIMATED',confirmationStatus:'ESTIMATED',fiscalYear:2026,fiscalQuarter:'Q3',dateStart:'2026-10-09',dateEnd:'2026-10-30'};
 const result={companyId:cid,eventType:'EARNINGS_SCHEDULED',confirmationStatus:'CONFIRMED',fiscalYear:2026,fiscalQuarter:'Q3',date:'2026-10-21'};
 const payload={companyId:cid,events:[estimate,result,{...result,eventType:'EARNINGS_CALL',startsAt:'2026-10-21T21:30:00Z'}]};
 assert.equal(viewModel(payload,now).estimates.length,0);assert.equal(viewModel(payload,now).confirmed.length,2);assert.equal(payload.events.length,3);
 for(const change of [{companyId:'other'},{fiscalQuarter:'Q4'},{fiscalYear:2025},{fiscalQuarter:null},{eventType:'EARNINGS_CALL'},{confirmationStatus:'ESTIMATED'},{eventStatus:'CANCELLED'}])assert.equal(viewModel({companyId:cid,events:[estimate,{...result,...change}]},now).estimates.length,1);
});
test('type pills reuse existing deterministic categories without inferring new facts',()=>{
 assert.equal(storyType({eventType:'NEWS',categories:['Buyback']}),'Aktienrückkauf');assert.equal(storyType({eventType:'NEWS',categories:['Other']}),'Unternehmensmeldung');assert.equal(storyType({eventType:'MATERIAL_SEC_EVENT'}),'SEC / Regulatorisch');assert.equal(storyType({eventType:'EARNINGS_PUBLISHED'}),'Geschäftszahlen');
});
test('revenue contraction remains a decline even when its rate improves; crossing zero is explicit',()=>{
 for(const [previous,current,label] of [
  [-48,-22.93,'Rückgang abgeschwächt'],[-5,-10,'Rückgang verstärkt'],
  [-5,5,'Wachstum statt Rückgang'],[5,-5,'Rückgang statt Wachstum'],
  [-5,0,'Kein Umsatzrückgang'],[5,0,'Kein Umsatzwachstum'],
  [0,5,'Umsatzwachstum'],[0,-5,'Umsatzrückgang'],
  [18,24,'Beschleunigt'],[24,18,'Verlangsamt'],[-5,-5,'Unverändert']
 ])assert.equal(changeLabel({metric:'revenue_growth',previous,current}),label);
 assert.equal(changeLabel({metric:'total_debt',previous:1,current:2}),'Gestiegen');
});

test('new official earnings news does not silently freshen stale normalized financial metrics',()=>{
 const f={state:'AVAILABLE',stale:true,reportingPeriod:'2025-12-31',metrics:{cash_and_equivalents:{current:{value:100,unit:'CNY'}}},whatChanged:[]};
 const payload={companyId:cid,latestFinancials:f,news:[news('q2-release','2026-08-24',{categories:['Earnings'],headline:'Second Quarter 2026 Unaudited Financial Results'})]};
 const m=viewModel(payload,now);assert.equal(m.recent.length,1);assert.equal(storyType(m.recent[0]),'Geschäftszahlen');assert.equal(payload.latestFinancials.stale,true);assert.equal(payload.latestFinancials.reportingPeriod,'2025-12-31');assert.deepEqual(Array.from(m.metrics),['cash_and_equivalents']);
});
