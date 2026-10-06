import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,statSync,symlinkSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
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
