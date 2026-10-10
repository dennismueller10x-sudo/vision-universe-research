import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), E=require('../europe-discover-eligibility.js');
const H='a'.repeat(64), now='2026-10-10T07:00:00Z';
function fixture(){
 const s={region:'EUROPE',companyId:'LEI:example',securityId:'ref_EXAMPLE_DE_XETR',isin:'DE0000000001',fundamentals:{status:'MISSING'}};
 const l={listingId:'XETR:EXAMPLE.DE',mic:'XETR',providerSymbol:'EXAMPLE.DE',currency:'EUR',country:'DE'};
 const binding={companyId:s.companyId,securityId:s.securityId,listingId:l.listingId,mic:l.mic,providerSymbol:l.providerSymbol,currency:l.currency,isin:s.isin};
 l.identityAdmission={...binding,version:'europe-discover-identity-2.0.0',status:'UNIVERSE_IDENTITY_READY',assetType:'EQUITY',issuerCountry:'DE',issuerBinding:'VERIFIED_LEGAL_ISSUER',securityKey:'ISIN:'+s.isin,active:true,localListingPlausible:true,duplicateResolved:true,evidenceRefs:[{sha256:H,verified:true}]};
 l.discoverChart={...binding,version:'europe-discover-close-chart-1',evidenceRef:{sha256:H,verified:true},pointsSha256:H,sourceInputSha256:H,immutableExclusionsSha256:H,evaluatedAt:now,observationCount:220,firstDate:'2025-10-10',lastDate:'2026-10-09',sessionLag:0,calendarSource:{sha256:H},calendarSourceSha256:H,calendarProof:{evaluatedAt:now,verified:true,mic:'XETR',sourceSha256:H,coverageFrom:'2025-01-01',coverageTo:'2026-12-31',expectedLastCompletedSession:'2026-10-09',nextScheduledSession:{date:'2026-10-12',close:'2026-10-12T15:30:00Z'}},quoteUnit:'EUR',quoteBasis:{...binding,quoteUnit:'EUR',sourceSha256:H,kind:'OFFICIAL_LISTING_QUOTE_REFERENCE'},priceBasis:'RAW_UNADJUSTED',criticalIssues:[],reasonCodes:[],chartStatus:'CHART_READY'};
 return {s,l};
}
test('Discover admission independent of missing fundamentals, LEI, volume, adjusted fields and analytics',()=>{
 const {s,l}=fixture();l.identityAdmission.issuerBinding='SECURITY_SCOPED_OFFICIAL_ISSUER';s.companyId=l.identityAdmission.companyId=l.discoverChart.companyId='OFFICIAL_SECURITY_ISSUER:'+s.isin;
 l.technical={status:'TECHNICAL_BLOCKED'};l.adjustment={status:'ADJUSTMENT_UNKNOWN'};l.priceQuality={volumeValid:false};
 assert.equal(E.evaluate(s,l,now).DISCOVER_ELIGIBLE,true);
});
test('identity and chart independently fail closed for wrong class, issuer domicile, duplicates or mismatched listing',()=>{
 for(const mutate of [l=>l.identityAdmission.assetType='ETF',l=>l.identityAdmission.issuerCountry='US',l=>l.identityAdmission.duplicateResolved=false,l=>l.identityAdmission.listingId='OTHER']){
  const {s,l}=fixture();mutate(l);const r=E.evaluate(s,l,now);assert.equal(r.UNIVERSE_IDENTITY_READY,false);assert.equal(r.CHART_READY,true);assert.equal(r.DISCOVER_ELIGIBLE,false);
 }
});
test('minimum real Close history excludes single-observation and short-span dead ends',()=>{
 for(const mutate of [p=>p.observationCount=1,p=>p.firstDate='2026-10-01']){const {s,l}=fixture();mutate(l.discoverChart);assert.equal(E.evaluate(s,l,now).CHART,'CHART_BLOCKED');}
});
test('exchange-session delays allowed independently of calendar days, over three sessions blocked',()=>{
 for(const lag of [0,1,2,3,4]){const {s,l}=fixture();l.discoverChart.sessionLag=lag;const r=E.evaluate(s,l,now);assert.equal(r.DISCOVER_ELIGIBLE,lag<=3);assert.equal(r.CHART,lag>3?'CHART_BLOCKED':lag>=2?'CHART_LIMITED':'CHART_READY');}
});
test('unknown adjustment and uncertified volume can yield a limited chart; unresolved severe breaks cannot',()=>{
 const {s,l}=fixture();l.discoverChart.chartStatus='CHART_LIMITED';assert.equal(E.evaluate(s,l,now).DISCOVER_ELIGIBLE,true);l.discoverChart.criticalIssues=[{code:'SERIOUS_UNEXPLAINED_CLOSE_DISCONTINUITY'}];assert.equal(E.evaluate(s,l,now).DISCOVER_ELIGIBLE,false);
});
test('Close evidence expires and cannot be asserted in the future',()=>{
 for(const at of ['2026-10-08T07:00:00Z','2026-10-10T08:00:00Z','unknown']){const {s,l}=fixture();l.discoverChart.evaluatedAt=at;assert.equal(E.evaluate(s,l,now).DISCOVER_ELIGIBLE,false);}
});
test('quote currency provenance exact-bound and GBP subunits remain blocked without unit evidence',()=>{
 const {s,l}=fixture();l.discoverChart.quoteBasis.providerSymbol='OTHER';assert.equal(E.evaluate(s,l,now).DISCOVER_ELIGIBLE,false);
 const x=fixture();x.l.currency=x.l.identityAdmission.currency=x.l.discoverChart.currency=x.l.discoverChart.quoteBasis.currency='GBP';x.l.discoverChart.quoteUnit=x.l.discoverChart.quoteBasis.quoteUnit='GBP';assert.equal(E.evaluate(x.s,x.l,now).DISCOVER_ELIGIBLE,false);
});
test('unsafe older ranges do not disable safe 1Y chart and cannot be requested without independent proof',()=>{
 const {s,l}=fixture();assert.equal(E.evaluate(s,l,now,'1Y').DISCOVER_ELIGIBLE,true);assert.equal(E.evaluate(s,l,now,'MAX').DISCOVER_ELIGIBLE,false);
});

test('native Close quote unit cannot silently differ from its displayed currency',()=>{const {s,l}=fixture();l.discoverChart.quoteUnit=l.discoverChart.quoteBasis.quoteUnit='USD';assert.equal(E.evaluate(s,l,now).DISCOVER_ELIGIBLE,false);});
