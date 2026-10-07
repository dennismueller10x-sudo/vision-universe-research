import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,statSync,symlinkSync,rmSync,readdirSync,mkdirSync,linkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {aggregateDevelopment,run,TECHNICAL_FIELDS} from '../build-europe-consumer-development.mjs';
const require=createRequire(import.meta.url),I=require('../../../core/identity.js'),SHA='a'.repeat(40),h=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const row=(extra={})=>({name:'Synthetic "issuer"',isin:'DE0007164600',mic:'XETR',securityId:I.securityIdForISIN('DE0007164600'),listingId:I.listingIdFor({isin:'DE0007164600',mic:'XETR'}),ticker:'SAP',mappingStatus:'VERIFIED',mappingSource:['synthetic-official-ISIN-MIC-currency'],tradingCurrency:'EUR',quoteUnit:'MAJOR',companyCountry:'DE',companyId:null,referencedIssuerId:I.companyIdForLEI('529900D6BF99LW9R2E68'),providerSymbol:'SAP.DE',indexMemberships:['DAX'],referenceEvidence:[{membershipSourceId:'synthetic-index-source'}],...extra});
const history=r=>({source:'marketstack',provider:'marketstack',apiVersion:'v2',isin:r.isin,mic:r.mic,currency:'EUR',quoteUnit:'MAJOR',retrievedAt:'2026-10-06T18:00:00Z',sourceEvidence:['synthetic-source-response'],adjustmentStatus:{verified:false,priceSeriesType:'UNKNOWN'},bars:[{date:'2026-10-05',open:10,high:12,low:9,close:11,volume:100},{date:'2026-10-06',open:11,high:13,low:10,close:12,volume:0}]});
const input=(extra={})=>({asOf:'2026-10-06',now:'2026-10-06T19:00:00Z',sourceSHA:SHA,listingMaps:[{schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:[row()]}],histories:{},statuses:[],...extra});
const proof=r=>({passed:true,fixture:false,sourceSHA:SHA,listingIds:[r.listingId],products:['search','detail','chart','watchlist','screener'],evidence:['synthetic-actual-browser-proof']});
function certificate(r,data){const hash=h(data.bars);return {schemaVersion:'europe-history-certification-1.0.0',listingId:r.listingId,securityId:r.securityId,isin:r.isin,mic:r.mic,asOf:'2026-10-06',inputSeriesHash:hash,calendar:{status:'READY',evidence:['synthetic-full-calendar']},splitAdjustedOHLC:{status:'READY',evidence:['synthetic-field-basis']},splitAdjustedVolume:{status:'BLOCKED',causes:['UNVERIFIED_VOLUME_BASIS']},freshness:{status:'READY',cause:null,latestDate:'2026-10-06',expectedLastSession:'2026-10-06',evidence:['synthetic-session-calendar']},technicalFields:{sma20:{status:'READY',causes:[],value:11.5,asOf:'2026-10-06',inputSeriesHash:hash,evidence:['synthetic-central-engine-result'],window:{from:'2026-10-05',to:'2026-10-06'}}}};}

test('no input history or proof produces no fake current courses, UI, logos, factors or technical READY',()=>{
 const out=aggregateDevelopment(input()),r=out.outputs.europe_consumer_product_readiness.listings[0];assert.equal(out.summary.counts.currentEod,0);assert.equal(out.summary.counts.searchReady,0);assert.equal(out.summary.counts.verifiedLogos,0);assert.equal(out.summary.counts.actualCompanyLinks,0);assert.equal(out.summary.counts.referencedLEIIssuers,1);
 assert.equal(Object.keys(r.technicalFields).length,13);assert.ok(Object.values(r.technicalFields).every(f=>f.status!=='READY'));assert.equal(r.functions.fundamentalInputs.causes[0],'MISSING_FUNDAMENTALS');assert.equal(out.outputs.europe_consumer_ingestion_status.listings[0].latest.price,null);assert.equal(out.outputs.europe_consumer_request_budget.estimatedCreditsConsumed,null);
});
test('current price and central technical field require matching source hash and calendar certificate',()=>{
 const r=row(),data=history(r),cert=certificate(r,data),out=aggregateDevelopment(input({histories:{[r.listingId]:data},certifications:{[r.listingId]:cert},integrationEvidence:proof(r)}));
 assert.equal(out.summary.counts.currentEod,1);assert.equal(out.summary.counts.technicalListings,1);const rr=out.outputs.europe_consumer_product_readiness.listings[0];assert.equal(rr.technicalFields.sma20.status,'READY');assert.equal(rr.functions.chart.status,'PARTIAL');assert.equal(rr.functions.quantFullScore.status,'BLOCKED');assert.equal(rr.functions.supertrader.status,'BLOCKED');assert.equal(out.outputs.europe_consumer_ingestion_status.listings[0].latest.price,data.bars.at(-1).close);
});
test('certificate drift, identity/currency conflict or forged field readiness cannot certify data',()=>{
 const r=row(),data=history(r),cert=certificate(r,data);
 for(const extra of [{certifications:{[r.listingId]:{...cert,inputSeriesHash:'old'}}},{histories:{[r.listingId]:{...data,mic:'XNYS'}}},{certifications:{[r.listingId]:{...cert,splitAdjustedOHLC:{status:'BLOCKED'}}}},{certifications:{[r.listingId]:{...cert,technicalFields:{sma20:{...cert.technicalFields.sma20,inputSeriesHash:'forged'}}}}}]){
  const out=aggregateDevelopment(input({histories:{[r.listingId]:data},certifications:{[r.listingId]:cert},integrationEvidence:proof(r),...extra}));assert.equal(out.summary.counts.technicalListings,0);
  if(extra.histories)assert.equal(out.outputs.europe_consumer_product_readiness.listings[0].functions.chart.status,'BLOCKED');
 }
});
test('uncertified old history has missing freshness evidence, not guessed calendar-day stale/current',()=>{
 const r=row(),data=history(r);data.bars=data.bars.slice(0,1);const out=aggregateDevelopment(input({histories:{[r.listingId]:data}}));assert.equal(out.outputs.europe_consumer_ingestion_status.listings[0].freshness.status,'MISSING');assert.equal(out.outputs.europe_consumer_ingestion_status.listings[0].freshness.cause,'MISSING_CALENDAR_BASIS');
 const cert=certificate(r,data);cert.freshness={status:'PARTIAL',cause:'STALE_EOD',latestDate:'2026-10-05',expectedLastSession:'2026-10-06',evidence:['synthetic-calendar']};assert.equal(aggregateDevelopment(input({histories:{[r.listingId]:data},certifications:{[r.listingId]:cert}})).outputs.europe_consumer_ingestion_status.listings[0].freshness.status,'STALE');
 cert.freshness.status='DELAYED_EXPECTED';assert.equal(aggregateDevelopment(input({histories:{[r.listingId]:data},certifications:{[r.listingId]:cert}})).outputs.europe_consumer_ingestion_status.listings[0].freshness.status,'MISSING');cert.freshness.providerDeliveryEvidence=['synthetic-provider-delivery-window'];assert.equal(aggregateDevelopment(input({histories:{[r.listingId]:data},certifications:{[r.listingId]:cert}})).outputs.europe_consumer_ingestion_status.listings[0].freshness.status,'DELAYED_EXPECTED');
});
test('only actual evidence for exact IDs/code revision grants Search/Watchlist, independently of Quant/history',()=>{
 const r=row();const good=aggregateDevelopment(input({integrationEvidence:proof(r)}));assert.equal(good.summary.counts.searchReady,1);assert.equal(good.summary.counts.watchlistReady,1);assert.equal(good.outputs.europe_consumer_product_readiness.listings[0].functions.chart.status,'BLOCKED');
 for(const change of [{fixture:true},{sourceSHA:'b'.repeat(40)},{listingIds:[]},{passed:false},{products:['detail']}])assert.equal(aggregateDevelopment(input({integrationEvidence:{...proof(r),...change}})).summary.counts.searchReady,0);
});
test('LEI references never become actual VU Companies; canonical fundamentals stay separate from prices',()=>{
 const r=row({companyId:I.companyIdForLEI('529900D6BF99LW9R2E68')}),out=aggregateDevelopment(input({listingMaps:[{schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:[r]}]}));assert.equal(out.summary.counts.actualCompanyLinks,0);
 const existing=row({companyId:'iss_cik_0001000184',companyAssociationStatus:'VERIFIED_EXISTING_VU_COMPANY',companyAssociationEvidence:['synthetic-exact-existing-company-proof']});const f={companyId:existing.companyId,verified:true,period:'2025-12-31',filingDate:'2026-02-01',evidence:['synthetic-canonical-facts']};const yes=aggregateDevelopment(input({listingMaps:[{schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:[existing]}],fundamentalStatus:{[existing.listingId]:f}}));assert.equal(yes.summary.counts.actualCompanyLinks,1);assert.equal(yes.outputs.europe_consumer_product_readiness.listings[0].functions.fundamentalInputs.status,'PARTIAL');assert.equal(yes.outputs.europe_consumer_product_readiness.listings[0].functions.quantFullScore.status,'BLOCKED');
});
test('duplicate identical listings deduplicate; conflicting currency or selected MIC fails closed',()=>{
 const one=input();one.listingMaps.push(structuredClone(one.listingMaps[0]));assert.equal(aggregateDevelopment(one).summary.counts.selectedListings,1);one.listingMaps[1].listings[0].tradingCurrency='USD';assert.throws(()=>aggregateDevelopment(one),/DUPLICATE_LISTING_INPUT_CONFLICT/);
 const other=input();other.listingMaps.push({...other.listingMaps[0],listings:[row({mic:'XFRA',listingId:I.listingIdFor({isin:'DE0007164600',mic:'XFRA'})})]});assert.throws(()=>aggregateDevelopment(other),/MULTIPLE_SELECTED_VENUES_FOR_SECURITY/);
});
test('budget uses actual shared counter once, unknown balance remains unknown and monthly model never activates',()=>{
 const out=aggregateDevelopment(input({budget:{runId:'actual-shared',requestsAttempted:12,estimatedCreditsConsumed:13,totalEstimatedCreditsConsumed:99,runLimit:20000,targetLimit:15000,creditsRemaining:19901,accountEvidenceState:'UNKNOWN_USER_AUTHORIZED_DETERMINISTIC_COUNTER'},refreshModel:{corporateActionPagesPerListingPerMonth:0,corporateActions:{documentedScopeUnsupported:true,embeddedObservationsMonitoring:true,evidence:['synthetic-action-scope-docs']}}}));const b=out.outputs.europe_consumer_request_budget;assert.equal(b.estimatedCreditsConsumed,99);assert.equal(b.requestsAttempted,12);assert.equal(b.accountRemainingCredits,null);assert.equal(b.accountRemainingVerified,false);assert.equal(b.hardCap,20000);assert.equal(b.scheduleActivated,false);assert.equal(b.monthlyRefreshModel.estimatedTotalSymbolCredits,0);assert.equal(b.selectedCandidateCount,1);assert.equal(b.monthlyRefreshModel.listings,0);
});
test('logo verification needs exact issuer/listing/asset evidence; fallback is not a verified logo',()=>{
 const r=row(),base={listingId:r.listingId,isin:r.isin,referencedIssuerId:r.referencedIssuerId,status:'VERIFIED_LOGO',asset:'/synthetic-logo.png',issuerVerified:true,issuerEvidence:['synthetic-exact-issuer-proof'],assetLoad:{loaded:true,asset:'/synthetic-logo.png',evidence:['synthetic-loaded-asset']}};assert.equal(aggregateDevelopment(input({logoStatus:[base]})).summary.counts.verifiedLogos,1);assert.equal(aggregateDevelopment(input({logoStatus:[{...base,isin:'DE000BASF111'}]})).summary.counts.verifiedLogos,0);assert.equal(aggregateDevelopment(input({logoStatus:[{...base,status:'EXISTING_FALLBACK'}]})).summary.counts.verifiedLogos,0);
});
test('repeat aggregation is deterministic and CSV correctly quotes actual target metadata',()=>{
 const one=aggregateDevelopment(input());assert.deepEqual(one,aggregateDevelopment(input()));assert.ok(one.csv.includes('"Synthetic ""issuer"""'));assert.ok(one.report.startsWith('|Index|'));assert.equal(Object.keys(one.outputs).length,7);
});
test('CLI requires private input/output, writes six data reports plus summary/CSV/Markdown with private permissions',()=>{
 assert.throws(()=>run([]),/EXPLICIT_PRIVATE_INPUT_OUTPUT_REQUIRED/);const root=mkdtempSync(join(tmpdir(),'eu-report-test-'));
 try{const source=join(root,'input.json'),out=join(root,'out');writeFileSync(source,JSON.stringify(input()));assert.equal(run(['--input',source,'--out',out]).selectedListings,1);assert.equal(readdirSync(out).length,9);assert.equal(statSync(join(out,'europe_consumer_ingestion_status.json')).mode&0o777,0o600);assert.equal(statSync(out).mode&0o777,0o700);symlinkSync(out,join(root,'link'));assert.throws(()=>run(['--input',source,'--out',join(root,'link')]),/SYMLINK_REJECTED/);assert.throws(()=>run(['--input',source,'--out',join(root,'public')]),/PUBLIC_REPORT_OUTPUT_REJECTED/);assert.equal(JSON.parse(readFileSync(join(out,'europe_consumer_request_budget.json'))).scheduleActivated,false);}finally{rmSync(root,{recursive:true,force:true});}
});

test('a dated older OHLC defect does not invalidate a separately proven current EOD or recent certification window',()=>{
 const r=row(),data=history(r);data.bars[0].high=1;const cert=certificate(r,data);
 const out=aggregateDevelopment(input({histories:{[r.listingId]:data},certifications:{[r.listingId]:cert}}));
 assert.equal(out.outputs.europe_consumer_ingestion_status.listings[0].history.state,'INVALID');
 assert.equal(out.outputs.europe_consumer_ingestion_status.listings[0].latest.price,12);
 assert.equal(out.outputs.europe_consumer_ingestion_status.listings[0].freshness.status,'CURRENT');
 assert.equal(out.outputs.europe_consumer_product_readiness.listings[0].functions.privateCloseChart.status,'PARTIAL');
 const latestBad=structuredClone(data);latestBad.bars.at(-1).high=1;
 assert.equal(aggregateDevelopment(input({histories:{[r.listingId]:latestBad}})).outputs.europe_consumer_ingestion_status.listings[0].freshness.status,'INVALID');
});

test('actual central logo rows require exact tuple, issuer/domain and separately loaded reviewed asset',()=>{
 const r=row(),companyId=r.referencedIssuerId,sec={isin:r.isin,listingId:r.listingId,securityId:r.securityId,mic:r.mic},asset='files/synthetic.png';
 const logoStatus={rows:[{companyId,securities:[sec],canonicalStatus:'VERIFIED_LOGO',asset,logo:{status:'VERIFIED_LOGO',companyId}}]};
 const evidence={companies:[{companyId,securities:[sec],issuerEvidence:{url:'https://example.test/issuer',path:'/private/issuer.json',sha256:'a'.repeat(64)},domainEvidence:{url:'https://example.test/stock',path:'/private/domain.html',sha256:'b'.repeat(64)}}],reviewed:{companies:{[companyId]:'c'.repeat(40)}},assetLoads:[{companyId,asset,loaded:true,sha1:'c'.repeat(40),evidence:['synthetic-actual-asset-load']}]};
 const output=aggregateDevelopment(input({logoStatus,logoEvidence:evidence}));assert.equal(output.summary.counts.verifiedLogos,1);assert.equal(output.summary.counts.actualCompanyLinks,0);
 for(const e of [{...evidence,assetLoads:[]},{...evidence,reviewed:{companies:{[companyId]:'d'.repeat(40)}}},{...evidence,companies:[]}]){const out=aggregateDevelopment(input({logoStatus,logoEvidence:e}));assert.equal(out.summary.counts.verifiedLogos,0);assert.equal(out.summary.counts.fallbacks,1);}
 const wrong=structuredClone(logoStatus);wrong.rows[0].securities[0].isin='DE000BASF111';assert.equal(aggregateDevelopment(input({logoStatus:wrong,logoEvidence:evidence})).outputs.europe_consumer_logo_status.listings[0].status,'SUSPECT_QUARANTINED');
});
test('retained quarantines and missing sessions allow only real partial close-chart points, not technical or UI certification',()=>{
 const r=row(),data=history(r);data.quarantined=Array.from({length:411},(_,i)=>({date:'2026-09-16',reason:'synthetic-bad-source-OHLC-'+i}));const cert=certificate(r,data);cert.missingSessions=['2026-09-17'];
 const noUI=aggregateDevelopment(input({histories:{[r.listingId]:data},certifications:{[r.listingId]:cert}}));const f=noUI.outputs.europe_consumer_product_readiness.listings[0].functions;assert.equal(f.privateCloseChart.status,'PARTIAL');assert.equal(f.chart.status,'BLOCKED');assert.equal(f.privateCloseChart.quality.quarantinedRowsRetained,411);assert.equal(f.privateCloseChart.quality.filledSessions,0);assert.deepEqual(f.privateCloseChart.quality.missingSessions,['2026-09-17']);
 const yesUI=aggregateDevelopment(input({histories:{[r.listingId]:data},certifications:{[r.listingId]:cert},integrationEvidence:proof(r)}));assert.equal(yesUI.outputs.europe_consumer_product_readiness.listings[0].functions.chart.status,'PARTIAL');assert.equal(yesUI.summary.counts.closeChartUsable,1);assert.equal(yesUI.outputs.europe_consumer_ingestion_status.listings[0].history.bars,2);
 const closeBad=structuredClone(data);closeBad.bars[0].close=-1;assert.equal(aggregateDevelopment(input({histories:{[r.listingId]:closeBad},integrationEvidence:proof(r)})).outputs.europe_consumer_product_readiness.listings[0].functions.chart.status,'BLOCKED');
});

test('reference listings and current provider identity matches remain separate; refresh counts only actual canonical admissions',()=>{
 const r=row(),data=history(r),meta={isin:r.isin,mic:r.mic,checkedAt:'2026-10-06T18:00:00Z',sourceEvidence:['synthetic-exact-current-provider-response'],data:{isin:r.isin,providerSymbol:r.providerSymbol,exchange:r.mic,currency:'EUR'}},st={decisions:[{listingId:r.listingId,isin:r.isin,mic:r.mic,status:'PARTIAL',bars:2,sourceEvidence:['synthetic-actual-normalization-status']}]};
 const yes=aggregateDevelopment(input({histories:{[r.listingId]:data},providerMetadata:{[r.listingId]:meta},statuses:[st]}));assert.equal(yes.summary.counts.referenceLocalListings,1);assert.equal(yes.summary.counts.providerMatchedLocalListings,1);assert.equal(yes.summary.indexMatrix[0].mappedLocalListings,1);assert.equal(yes.outputs.europe_consumer_request_budget.monthlyRefreshModel.listings,1);assert.equal(yes.summary.counts.unconfirmedFreshnessWithEod,1);
 for(const patch of [{providerMetadata:{}},{statuses:[]},{providerMetadata:{[r.listingId]:{...meta,data:{...meta.data,isin:null}}}},{providerMetadata:{[r.listingId]:{...meta,data:{...meta.data,providerSymbol:'OTHER.DE'}}}}]){const out=aggregateDevelopment(input({histories:{[r.listingId]:data},providerMetadata:{[r.listingId]:meta},statuses:[st],...patch}));assert.equal(out.summary.counts.providerMatchedLocalListings,0);assert.equal(out.summary.counts.referenceLocalListings,1);assert.equal(out.outputs.europe_consumer_request_budget.monthlyRefreshModel.listings,0);}
 assert.throws(()=>aggregateDevelopment(input({refreshModel:{corporateActionPagesPerListingPerMonth:0}})),/ZERO_CA_MODEL/);
});
test('core domicile can be copied from exact independent GLEIF reference without creating a Company association',()=>{
 const r=row({companyCountry:null,companyReference:{lei:'529900D6BF99LW9R2E68',domicileCountry:'DE',basis:'EXACT_GLEIF_ISIN_LEI_REFERENCE',evidence:{sourceSystem:'GLEIF_ANNA_ISIN_TO_LEI_AND_GLEIF_LEGAL_ENTITY_REFERENCE',leiBatchResponseSHA256:'a'.repeat(64),leiRecordURL:'https://api.gleif.org/api/v1/lei-records/529900D6BF99LW9R2E68'}}});
 const yes=aggregateDevelopment(input({listingMaps:[{schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:[r]}]}));assert.equal(yes.outputs.europe_consumer_listing_map.listings[0].companyCountry,'DE');assert.equal(yes.summary.counts.actualCompanyLinks,0);
 const bad=structuredClone(r);bad.companyReference.evidence={};assert.equal(aggregateDevelopment(input({listingMaps:[{schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:[bad]}]})).outputs.europe_consumer_listing_map.listings[0].companyCountry,null);
});

test('all-company producer with null Company IDs binds only exact referenced issuers: two verified and 161 fallbacks',()=>{
 const reference=row().referencedIssuerId;
 const targetRows=Array.from({length:163},(_,i)=>{const prefix='DE'+String(i+1).padStart(9,'0');const isin=Array.from({length:10},(_,n)=>prefix+n).find(s=>I.normalizeISIN(s));return row({isin,listingId:I.listingIdFor({isin,mic:'XETR'}),securityId:I.securityIdForISIN(isin),referencedIssuerId:reference,companyId:null});});
 const security=r=>({isin:r.isin,securityId:r.securityId,listingId:r.listingId,mic:r.mic});
 const rows=targetRows.map((r,i)=>({companyId:null,referencedIssuerId:reference,securities:[security(r)],canonicalStatus:i<2?'VERIFIED_LOGO':'EXISTING_FALLBACK',asset:i<2?'files/synthetic-'+i+'.png':null,logo:{companyId:reference,status:i<2?'VERIFIED_LOGO':'EXISTING_FALLBACK'}}));
 const companies=targetRows.slice(0,2).map(r=>({companyId:null,referencedIssuerId:reference,securities:[security(r)],issuerEvidence:{url:'https://example.test/issuer',path:'/private/issuer.json',sha256:'a'.repeat(64)},domainEvidence:{url:'https://example.test/stock',path:'/private/domain.html',sha256:'b'.repeat(64)}}));
 const logoEvidence={companies,reviewed:{companies:{[reference]:'c'.repeat(40)}},assetLoads:rows.slice(0,2).map(r=>({companyId:null,referencedIssuerId:reference,asset:r.asset,loaded:true,sha1:'c'.repeat(40),evidence:['synthetic-exact-asset-load']}))};
 const report=aggregateDevelopment(input({listingMaps:[{schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:targetRows}],logoStatus:{rows},logoEvidence}));assert.equal(report.summary.counts.verifiedLogos,2);assert.equal(report.summary.counts.fallbacks,161);assert.equal(report.summary.counts.actualCompanyLinks,0);assert.ok(report.outputs.europe_consumer_logo_status.listings.every(l=>l.status!=='SUSPECT_QUARANTINED'));
 const wrong=structuredClone(rows);wrong[0].logo.companyId='iss_lei_WRONG';const attack=aggregateDevelopment(input({listingMaps:[{schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:targetRows}],logoStatus:{rows:wrong},logoEvidence}));assert.equal(attack.summary.counts.verifiedLogos,1);assert.equal(attack.outputs.europe_consumer_logo_status.listings.find(l=>l.listingId===targetRows[0].listingId).status,'SUSPECT_QUARANTINED');
});

test('private per-listing history files produce identical reports without a monolithic history object',()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-report-histories-dir-'));try{
  const r=row(),data=history(r),dir=join(root,'normalized');mkdirSync(dir,{mode:0o700});const file=join(dir,r.listingId+'.json');
  data.quarantined=[{date:'2026-09-16',reason:'synthetic-original-defect-retained'}];writeFileSync(file,JSON.stringify(data)+'\n',{mode:0o600});
  const before=readFileSync(file),mtime=statSync(file).mtimeMs,common={certifications:{[r.listingId]:certificate(r,data)},integrationEvidence:proof(r)};
  const inMemory=aggregateDevelopment(input({...common,histories:{[r.listingId]:data}})),fileBacked=aggregateDevelopment(input({...common,historiesDir:dir}));
  for(const value of [inMemory.outputs.europe_consumer_ingestion_status.listings[0].quality,inMemory.outputs.europe_consumer_product_readiness.listings[0].functions.privateCloseChart.quality,inMemory.outputs.europe_consumer_product_readiness.listings[0].functions.chart.quality]){delete value.privateHistorySource.inline;value.privateHistorySource.path=file;}
  assert.deepEqual(fileBacked,inMemory);assert.deepEqual(aggregateDevelopment(input({...common,historiesDir:dir})),fileBacked);
  assert.deepEqual(readFileSync(file),before);assert.equal(statSync(file).mtimeMs,mtime,'report reads never modify the original private cache');
  const source=join(root,'report-input.json'),out=join(root,'reports');writeFileSync(source,JSON.stringify(input({...common,historiesDir:dir})));
  run(['--input',source,'--out',out]);assert.deepEqual(JSON.parse(readFileSync(join(out,'europe_consumer_ingestion_status.json'))),inMemory.outputs.europe_consumer_ingestion_status);
  rmSync(file);assert.deepEqual(aggregateDevelopment(input({historiesDir:dir})),aggregateDevelopment(input()),'a missing file remains missing history');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('file-backed reports reject competing histories, public paths, symlinked sources and hardlinked histories',()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-report-history-guards-'));try{
  const r=row(),data=history(r),dir=join(root,'normalized');mkdirSync(dir);const file=join(dir,r.listingId+'.json');writeFileSync(file,JSON.stringify(data));
  assert.throws(()=>aggregateDevelopment(input({historiesDir:dir,histories:{[r.listingId]:data}})),/COMPETING_HISTORY_INPUTS/);
  for(const historiesDir of ['',{},0])assert.throws(()=>aggregateDevelopment(input({historiesDir})),/PRIVATE_HISTORY_DIRECTORY_REQUIRED/);
  assert.throws(()=>aggregateDevelopment(input({historiesDir:resolve('core/data')})),/PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED/);
  const link=join(root,'linked-directory');symlinkSync(dir,link);assert.throws(()=>aggregateDevelopment(input({historiesDir:link})),/SYMLINK_REJECTED/);
  const original=join(root,'original.json');writeFileSync(original,JSON.stringify(data));rmSync(file);symlinkSync(original,file);
  assert.throws(()=>aggregateDevelopment(input({historiesDir:dir})),/SYMLINK_REJECTED/);rmSync(file);linkSync(original,file);
  assert.throws(()=>aggregateDevelopment(input({historiesDir:dir})),/HISTORY_INPUT_FILE_TYPE_REJECTED/);rmSync(file);mkdirSync(file);
  assert.throws(()=>aggregateDevelopment(input({historiesDir:dir})),/HISTORY_INPUT_FILE_TYPE_REJECTED/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('per-listing certification files match in-memory reports and ignore evidence siblings',()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-report-certifications-dir-'));try{
  const r=row(),data=history(r),cert=certificate(r,data),historyDir=join(root,'normalized'),certDir=join(root,'certifications');mkdirSync(historyDir);mkdirSync(certDir);
  const certFile=join(certDir,r.listingId+'.json');writeFileSync(join(historyDir,r.listingId+'.json'),JSON.stringify(data));writeFileSync(certFile,JSON.stringify(cert));
  writeFileSync(join(certDir,r.listingId+'-evidence.json'),JSON.stringify({...cert,technicalFields:{sma20:{...cert.technicalFields.sma20,value:999}}}));
  const bytes=readFileSync(certFile),mtime=statSync(certFile).mtimeMs,common={integrationEvidence:proof(r)};
  const expected=aggregateDevelopment(input({...common,histories:{[r.listingId]:data},certifications:{[r.listingId]:cert}}));
  const actual=aggregateDevelopment(input({...common,historiesDir:historyDir,certificationsDir:certDir}));assert.deepEqual(actual,expected);
  assert.equal(actual.outputs.europe_consumer_product_readiness.listings[0].technicalFields.sma20.value,11.5);
  assert.deepEqual(readFileSync(certFile),bytes);assert.equal(statSync(certFile).mtimeMs,mtime);
  const source=join(root,'input.json'),out=join(root,'reports');writeFileSync(source,JSON.stringify(input({...common,historiesDir:historyDir,certificationsDir:certDir})));run(['--input',source,'--out',out]);
  assert.deepEqual(JSON.parse(readFileSync(join(out,'europe_consumer_product_readiness.json'))),expected.outputs.europe_consumer_product_readiness);
  rmSync(certFile);assert.deepEqual(aggregateDevelopment(input({historiesDir:historyDir,certificationsDir:certDir})),aggregateDevelopment(input({histories:{[r.listingId]:data}})),'missing certificate remains untested');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('file-backed certifications reject competing certificates, public paths, symlinks and hardlinks',()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-report-certification-guards-'));try{
  const r=row(),cert=certificate(r,history(r)),dir=join(root,'certifications');mkdirSync(dir);const file=join(dir,r.listingId+'.json');writeFileSync(file,JSON.stringify(cert));
  assert.throws(()=>aggregateDevelopment(input({certificationsDir:dir,certifications:{[r.listingId]:cert}})),/COMPETING_CERTIFICATION_INPUTS/);
  for(const certificationsDir of ['',{},0])assert.throws(()=>aggregateDevelopment(input({certificationsDir})),/PRIVATE_CERTIFICATION_DIRECTORY_REQUIRED/);
  assert.throws(()=>aggregateDevelopment(input({certificationsDir:resolve('core/data')})),/PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED/);
  const link=join(root,'linked-directory');symlinkSync(dir,link);assert.throws(()=>aggregateDevelopment(input({certificationsDir:link})),/SYMLINK_REJECTED/);
  const original=join(root,'original.json');writeFileSync(original,JSON.stringify(cert));rmSync(file);symlinkSync(original,file);
  assert.throws(()=>aggregateDevelopment(input({certificationsDir:dir})),/SYMLINK_REJECTED/);rmSync(file);linkSync(original,file);
  assert.throws(()=>aggregateDevelopment(input({certificationsDir:dir})),/CERTIFICATION_INPUT_FILE_TYPE_REJECTED/);rmSync(file);mkdirSync(file);
  assert.throws(()=>aggregateDevelopment(input({certificationsDir:dir})),/CERTIFICATION_INPUT_FILE_TYPE_REJECTED/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('registered private audit wrappers supply only recentWindow certification and preserve original files',()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-report-wrapper-cert-'));try{
  const r=row(),data=history(r),cert=certificate(r,data),dir=join(root,'certifications');mkdirSync(dir);const path=join(dir,r.listingId+'.json');
  const wrapper={schemaVersion:'private-europe-cache-audit-1.0.0',listingId:r.listingId,recentWindow:cert,
   fullWindow:{...cert,technicalFields:{sma20:{...cert.technicalFields.sma20,value:999}}}};writeFileSync(path,JSON.stringify(wrapper));
  const before=readFileSync(path),mtime=statSync(path).mtimeMs,common={histories:{[r.listingId]:data},integrationEvidence:proof(r)};
  const wrapped=aggregateDevelopment(input({...common,certificationsDir:dir})),inMemory=aggregateDevelopment(input({...common,certifications:{[r.listingId]:cert}}));
  assert.deepEqual(wrapped,inMemory);assert.equal(wrapped.outputs.europe_consumer_product_readiness.listings[0].technicalFields.sma20.value,11.5);
  assert.deepEqual(readFileSync(path),before);assert.equal(statSync(path).mtimeMs,mtime);
  writeFileSync(path,JSON.stringify({...wrapper,recentWindow:null}));assert.deepEqual(aggregateDevelopment(input({...common,certificationsDir:dir})),aggregateDevelopment(input(common)),'absent recentWindow cannot borrow fullWindow certification');
  writeFileSync(path,JSON.stringify({...wrapper,schemaVersion:'unregistered-wrapper'}));assert.equal(aggregateDevelopment(input({...common,certificationsDir:dir})).summary.counts.technicalListings,0,'unknown wrappers never silently unwrap nested evidence');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('explicit private certification directory arrays resolve distinct exact listings without copying or preferring duplicates',()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-report-cert-directory-array-'));try{
  const one=row(),isin='DE0005190003',two=row({isin,listingId:I.listingIdFor({isin,mic:'XETR'}),securityId:I.securityIdForISIN(isin),providerSymbol:'SECOND_FIXTURE.DE',name:'Second synthetic issuer'});
  const dirs=[join(root,'baseline'),join(root,'new-cohort')];for(const dir of dirs)mkdirSync(dir);
  const firstData=history(one),secondData=history(two),firstCert=certificate(one,firstData),secondCert=certificate(two,secondData);
  const firstFile=join(dirs[0],one.listingId+'.json'),secondFile=join(dirs[1],two.listingId+'.json');
  writeFileSync(firstFile,JSON.stringify({schemaVersion:'private-europe-cache-audit-1.0.0',recentWindow:firstCert,fullWindow:null}));writeFileSync(secondFile,JSON.stringify(secondCert));
  const bytes=[readFileSync(firstFile),readFileSync(secondFile)],mtimes=[statSync(firstFile).mtimeMs,statSync(secondFile).mtimeMs];
  const common={listingMaps:[{schemaVersion:'de-eu-listing-map-1.0.0',asOf:'2026-10-06',listings:[one,two]}],histories:{[one.listingId]:firstData,[two.listingId]:secondData}};
  const expected=aggregateDevelopment(input({...common,certifications:{[one.listingId]:firstCert,[two.listingId]:secondCert}}));
  const actual=aggregateDevelopment(input({...common,certificationsDir:dirs}));assert.deepEqual(actual,expected);assert.deepEqual(aggregateDevelopment(input({...common,certificationsDir:[...dirs].reverse()})),expected);
  assert.deepEqual(aggregateDevelopment(input({histories:{[one.listingId]:firstData},certificationsDir:dirs[0]})),aggregateDevelopment(input({histories:{[one.listingId]:firstData},certificationsDir:[dirs[0]]})),'single string input remains byte-equivalent');
  assert.deepEqual([readFileSync(firstFile),readFileSync(secondFile)],bytes);assert.deepEqual([statSync(firstFile).mtimeMs,statSync(secondFile).mtimeMs],mtimes);
  writeFileSync(join(dirs[1],one.listingId+'.json'),JSON.stringify({...firstCert,technicalFields:{}}));
  assert.throws(()=>aggregateDevelopment(input({...common,certificationsDir:dirs})),/COMPETING_CERTIFICATION_INPUTS/,'duplicate exact listing must not select the newest or merge fields');
  assert.throws(()=>aggregateDevelopment(input({...common,certificationsDir:[...dirs].reverse()})),/COMPETING_CERTIFICATION_INPUTS/);
  writeFileSync(firstFile,JSON.stringify({schemaVersion:'private-europe-cache-audit-1.0.0',recentWindow:null}));
  assert.throws(()=>aggregateDevelopment(input({...common,certificationsDir:dirs})),/COMPETING_CERTIFICATION_INPUTS/,'a present wrapper with missing recentWindow still competes');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('all alternative certification directories retain private path and file guards',()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-report-alternate-cert-guards-'));try{
  const r=row(),dirs=[join(root,'baseline'),join(root,'alternate')];for(const dir of dirs)mkdirSync(dir);
  for(const certificationsDir of [[],[dirs[0],null],[dirs[0],''],[dirs[0],{}],[dirs[0],[dirs[1]]]])assert.throws(()=>aggregateDevelopment(input({certificationsDir})),/PRIVATE_CERTIFICATION_DIRECTORY_REQUIRED/);
  assert.throws(()=>aggregateDevelopment(input({certificationsDir:[dirs[0],resolve('core/data')]})),/PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED/);
  const link=join(root,'linked-directory');symlinkSync(dirs[1],link);assert.throws(()=>aggregateDevelopment(input({certificationsDir:[dirs[0],link]})),/SYMLINK_REJECTED/);
  const original=join(root,'original.json');writeFileSync(original,JSON.stringify(certificate(r,history(r))));const file=join(dirs[1],r.listingId+'.json');symlinkSync(original,file);
  assert.throws(()=>aggregateDevelopment(input({certificationsDir:dirs})),/SYMLINK_REJECTED/);rmSync(file);linkSync(original,file);
  assert.throws(()=>aggregateDevelopment(input({certificationsDir:dirs})),/CERTIFICATION_INPUT_FILE_TYPE_REJECTED/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('completed-session lower bounds disprove freshness but never prove current or delayed quotes',()=>{
 const r=row(),data=history(r);data.bars=data.bars.slice(0,1);const cert=certificate(r,data);
 cert.freshness={status:'BLOCKED',cause:'MISSING_CALENDAR_BASIS',latestDate:'2026-10-05',expectedLastSession:null,lastProvenCompletedSession:'2026-10-06',evidence:['synthetic-official-completed-session']};
 const check=()=>aggregateDevelopment(input({histories:{[r.listingId]:data},certifications:{[r.listingId]:cert}}));
 let result=check(),f=result.outputs.europe_consumer_ingestion_status.listings[0].freshness;assert.equal(f.status,'STALE');assert.equal(f.cause,'STALE_EOD');assert.equal(f.expectedLastSession,null);assert.equal(f.lastProvenCompletedSession,'2026-10-06');assert.equal(result.outputs.europe_consumer_product_readiness.listings[0].functions.latestEod.status,'PARTIAL');
 for(const update of [{lastProvenCompletedSession:'2026-10-05'},{lastProvenCompletedSession:'2026-10-04'},{lastProvenCompletedSession:null},{lastProvenCompletedSession:'2026-10-07'},{lastProvenCompletedSession:'2026-10-06',evidence:[]}]){Object.assign(cert.freshness,update);result=check();assert.equal(result.outputs.europe_consumer_ingestion_status.listings[0].freshness.status,'UNKNOWN');assert.equal(result.summary.counts.currentEod,0);assert.equal(result.summary.counts.unconfirmedFreshnessWithEod,1);}
 cert.freshness={status:'READY',latestDate:'2026-10-04',expectedLastSession:null,lastProvenCompletedSession:'2026-10-06',evidence:['synthetic-calendar']};assert.equal(check().outputs.europe_consumer_ingestion_status.listings[0].freshness.status,'MISSING','the lower bound cannot excuse latestDate drift');
 cert.inputSeriesHash='forged';assert.equal(check().outputs.europe_consumer_ingestion_status.listings[0].freshness.cause,'CERTIFICATION_INPUT_DRIFT');
});
test('registered wrapper diagnostics are compact, complete and source-hashed without changing field/window decisions',()=>{
 const root=mkdtempSync(join(tmpdir(),'eu-report-compact-wrapper-'));try{
  const r=row(),data=history(r),cert=certificate(r,data),dir=join(root,'certifications');mkdirSync(dir,{mode:0o700});
  data.quarantined=[{date:'2026-09-15',reason:'original-invalid-OHLC'},{date:'2026-09-16',reason:'original-invalid-OHLC'}];
  cert.fullHistoryQuality={bars:2,first:'2026-10-05',last:'2026-10-06',quarantinedRowsRetained:2,issues:[...Array.from({length:5000},(_,i)=>({date:i%2?'2026-10-06':'2026-10-05',cause:'UNKNOWN_ADJUSTMENT_BASIS',field:'adjustedOHLC',reason:'unverified field basis'})),{date:'2026-09-15',cause:'PROVIDER_DATA_DEFECT',field:'sourceRow',reason:'invalid OHLC'}]};
  cert.missingSessions=['2026-09-17'];cert.technicalFields.sma20={...cert.technicalFields.sma20,status:'BLOCKED',value:null,causes:['SHORT_HISTORY','UNKNOWN_ADJUSTMENT_BASIS'],evidence:Array.from({length:8},(_,i)=>'synthetic-private-source-'+i)};
  const file=join(dir,r.listingId+'.json'),wrapper={schemaVersion:'private-europe-cache-audit-1.0.0',recentWindow:cert,fullWindow:{...cert,technicalFields:{sma20:{status:'READY',value:999}}}};writeFileSync(file,JSON.stringify(wrapper)+'\n',{mode:0o600});const bytes=readFileSync(file),sha=createHash('sha256').update(bytes).digest('hex'),mtime=statSync(file).mtimeMs;
  const report=aggregateDevelopment(input({histories:{[r.listingId]:data},certificationsDir:dir,integrationEvidence:proof(r)})),i=report.outputs.europe_consumer_ingestion_status.listings[0],p=report.outputs.europe_consumer_product_readiness.listings[0];
  assert.equal(p.functions.privateCloseChart.status,'PARTIAL');assert.equal(p.functions.chart.status,'PARTIAL');assert.ok(p.functions.chart.causes.includes('PROVIDER_DATA_DEFECT'));assert.ok(p.functions.chart.causes.includes('MISSING_HISTORY'));
  assert.equal(i.quality.historyIssueSummary.count,5001);assert.deepEqual(i.quality.historyIssueSummary.byCause,{UNKNOWN_ADJUSTMENT_BASIS:5000,PROVIDER_DATA_DEFECT:1});assert.deepEqual(i.quality.historyIssueSummary.byField,{adjustedOHLC:5000,sourceRow:1});assert.deepEqual(i.quality.historyIssueSummary.byReason,{'unverified field basis':5000,'invalid OHLC':1});assert.deepEqual(i.quality.historyIssueSummary.window,{start:'2026-09-15',end:'2026-10-06'});assert.equal(i.quality.quarantineSummary.count,2);assert.deepEqual(i.quality.missingSessions,['2026-09-17']);assert.equal(i.quality.filledSessions,0);assert.equal(i.quality.historyIssues,undefined);assert.equal(i.quality.quarantine,undefined);
  assert.deepEqual(i.quality.privateHistoryIssues,{path:file,sha256:sha,jsonPointer:'/recentWindow/fullHistoryQuality/issues'});
  const field=p.technicalFields.sma20;for(const key of ['status','causes','window','inputSeriesHash','asOf','value'])assert.deepEqual(field[key],cert.technicalFields.sma20[key]);assert.equal(field.evidenceCount,8);assert.deepEqual(field.privateDetails,{path:file,sha256:sha,jsonPointer:'/recentWindow/technicalFields/sma20'});assert.deepEqual(field.evidence,['sha256:'+sha+'#/recentWindow/technicalFields/sma20']);
  assert.ok(JSON.stringify(report.outputs.europe_consumer_product_readiness).length<50000);assert.deepEqual(readFileSync(file),bytes);assert.equal(statSync(file).mtimeMs,mtime);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('CSV technical status uses existing field statuses and generator provenance cannot grant UI readiness',()=>{
 const r=row(),data=history(r),cert=certificate(r,data),generator='b'.repeat(40),report=aggregateDevelopment(input({generatorSourceSHA:generator,histories:{[r.listingId]:data},certifications:{[r.listingId]:cert},integrationEvidence:proof(r)}));
 assert.equal(report.summary.sourceSHA,SHA);assert.equal(report.summary.generatorSourceSHA,generator);assert.equal(report.summary.counts.searchReady,1);assert.ok(report.csv.split('\n')[0].includes('technicalStatus'));assert.ok(report.csv.split('\n')[1].includes('"PARTIAL","BLOCKED","BLOCKED"'));
 const changed=aggregateDevelopment(input({generatorSourceSHA:generator,integrationEvidence:{...proof(r),sourceSHA:generator}}));assert.equal(changed.summary.counts.searchReady,0);assert.throws(()=>aggregateDevelopment(input({generatorSourceSHA:'not-a-sha'})),/GENERATOR_SOURCE_SHA_REQUIRED/);
 const blocked=aggregateDevelopment(input({histories:{[r.listingId]:data},certifications:{[r.listingId]:{...cert,technicalFields:{sma20:{...cert.technicalFields.sma20,status:'BLOCKED',causes:['SHORT_HISTORY'],value:null}}}}}));assert.ok(blocked.csv.split('\n')[1].includes('"BLOCKED","BLOCKED","BLOCKED","BLOCKED"'));
});

test('empty incremental refresh retains only independently source-reconciled cached identity, never freshness',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vu-cached-identity-'));try{
  const r=row(),data=history(r);data.bars.pop();const cert=certificate(r,data);cert.freshness={status:'PARTIAL',cause:'STALE_EOD',latestDate:'2026-10-05',expectedLastSession:'2026-10-06',evidence:['synthetic-calendar']};cert.technicalFields={};
  const audit={schemaVersion:'private-europe-cache-audit-1.0.0',listingId:r.listingId,securityId:r.securityId,isin:r.isin,mic:r.mic,asOf:'2026-10-06',inputSeriesHash:h(data.bars),recentWindow:cert,identity:{status:'READY',evidence:['synthetic-exact-original-response']},sourceFields:{priceStatus:'READY',priceMatches:1,bars:1},sourceEvidence:['synthetic-original-source']};
  const meta={isin:r.isin,mic:r.mic,checkedAt:'2026-10-06T18:00:00Z',sourceEvidence:['synthetic-exact-metadata'],data:{isin:r.isin,providerSymbol:r.providerSymbol,exchange:r.mic,currency:'EUR',assetType:'equity'}},st={decisions:[{listingId:r.listingId,isin:r.isin,mic:r.mic,status:'BLOCKED',cause:'UNSUPPORTED_LISTING',asOf:'2026-10-06',sourceEvidence:['synthetic-empty-refresh-response']}]};
  const build=()=>{writeFileSync(join(dir,r.listingId+'.json'),JSON.stringify(audit));return aggregateDevelopment(input({histories:{[r.listingId]:data},providerMetadata:{[r.listingId]:meta},statuses:[st],certificationsDir:dir}));};
  let out=build().outputs.europe_consumer_ingestion_status.listings[0];assert.equal(out.providerIdentityMatched,true);assert.equal(out.providerIdentityBasis,'EXACT_CACHED_SOURCE_RECONCILIATION');assert.equal(out.refreshAttempt.status,'BLOCKED');assert.equal(out.freshness.status,'STALE');
  st.decisions[0].testedAt='2026-10-06T18:30:00Z';st.decisions.push({listingId:r.listingId,isin:r.isin,mic:r.mic,status:'PARTIAL',bars:1,asOf:'2026-10-05',testedAt:'2026-10-05T18:00:00Z',sourceEvidence:['synthetic-older-response']});out=build().outputs.europe_consumer_ingestion_status.listings[0];assert.equal(out.providerIdentityBasis,'EXACT_CACHED_SOURCE_RECONCILIATION');assert.equal(out.refreshAttempt.status,'BLOCKED');st.decisions.pop();
  for(const mutate of [()=>audit.sourceFields.priceMatches=0,()=>audit.inputSeriesHash='c'.repeat(64),()=>audit.identity.status='BLOCKED',()=>meta.data.assetType='etf',()=>meta.data.isin='DE0007664039']){const original=structuredClone(audit),originalMeta=structuredClone(meta);mutate();assert.equal(build().summary.counts.providerMatchedLocalListings,0);Object.assign(audit,original);Object.assign(meta,originalMeta);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
