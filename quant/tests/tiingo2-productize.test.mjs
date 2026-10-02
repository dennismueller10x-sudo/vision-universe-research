import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { assessEvidence } from '../../scripts/market/tiingo2-evidence.mjs';
import { loadCandidatePriceInputs, prepareProductizationShadow, reconcileShadowIssuerMappings } from '../../scripts/market/tiingo2-productize.mjs';
import { parseExchangeDirectory } from '../../scripts/market/tiingo2-refresh.mjs';
const source=join(dirname(fileURLToPath(import.meta.url)),'../..'),Company=createRequire(import.meta.url)('../../quant/engines/company-master.js');
const digest=x=>createHash('sha256').update(x).digest('hex'),today='2026-10-02';
function save(root,path,doc){const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(doc));return file;}
function fixture(fn,{baselineTicker='BASE'}={}){const root=mkdtempSync(join(tmpdir(),'vu-productize-'));try{
 cpSync(join(source,'quant/engines'),join(root,'quant/engines'),{recursive:true});
 cpSync(join(source,'quant/config/company-master.json'),join(root,'quant/config/company-master.json'),{recursive:true});
 mkdirSync(join(root,'scripts/universe'),{recursive:true});cpSync(join(source,'scripts/universe/build-company-master.mjs'),join(root,'scripts/universe/build-company-master.mjs'));
 const raw={ticker:baselineTicker,securityId:'ref_'+baselineTicker,exchange:'NASDAQ',assetType:'Stock',currency:'USD',company:'Baseline Inc.',active:true,startDate:'2000-01-01'};
 const baseline=Company.toInstrument({...raw,name:raw.company},{today:'2026-09-01',provider:'tiingo'});Company.applyEligibility(baseline,{securityId:raw.securityId,product_eligibility:'ELIGIBLE',instrument_type:'EQUITY_COMMON'});
 baseline.firstSeen='2026-09-01';
 save(root,'quant/data/market/scale/universe-FULL_UNIVERSE.json',{securities:[raw]});
 save(root,'quant/data/market/security-master/eligibility.json',{decisions:[{...raw,instrument_type:'EQUITY_COMMON',product_eligibility:'ELIGIBLE'}],counts:{universeMembers:1,productUniverse:1,ELIGIBLE:1,SEPARATE_CLASS:0,REVIEW:0,EXCLUDED:0}});
 const baselineShard=Company.shardKey(baselineTicker);
 save(root,'quant/data/market/security-master/company-names.json',{rows:[{ticker:baselineTicker,securityId:raw.securityId,companyName:raw.company,status:'RESOLVED',inProductUniverse:true}]});
 save(root,'quant/data/universe/instruments/'+baselineShard+'.json',{shard:baselineShard,engine:Company.VERSION,count:1,instruments:[baseline]});
 save(root,'quant/data/universe/master-manifest.json',{totals:{providerRows:1,ingested:1,inMaster:1,published:1},identifiers:{},shards:{count:1,index:[{shard:baselineShard,count:1}]}});
 const sourceRun=join(root,'.verification/accepted'),sourceCache=join(root,'.market-cache/tiingo2'),workDir=join(root,'.market-cache/tiingo2-productization');
 const bars=['2026-09-01','2026-09-02','2026-10-01'].map(date=>({date,open:10,high:10,low:10,close:10,volume:100,adjOpen:10,adjHigh:10,adjLow:10,adjClose:10,adjVolume:100,splitFactor:1,divCash:0}));
 const metadata={ticker:'IPO',name:'IPO Corporation',startDate:'2026-09-01',exchangeCode:'NASDAQ'},summary=assessEvidence(bars,{ticker:'IPO',today,currency:'USD',metadata});
 const price={...summary.price,historyValid:true,latestValid:true,corporateActionValid:true};
 const policyRow={ticker:'IPO',securityId:'ref_IPO',companyName:'IPO Corporation',decision:'AUTO_ACCEPT',publicationReady:true,policy:{instrumentType:'EQUITY_COMMON'},evidence:{identity:{resolved:true},price,sec:{cik:null,available:false,pitValid:false},factors:{materialized:false,basisValid:true},source:summary.source}};
 save(root,'.verification/accepted/tiingo2_consumer_policy_report.json',{rows:[policyRow]});
 save(root,'.verification/accepted/tiingo2_publication_preview.json',{ADDED:[{ticker:'IPO',securityId:'ref_IPO',quantReady:false}],REMOVED:[]});
 save(root,'.verification/accepted/tiingo2_fresh_discovery.json',{records:[{ticker:'IPO',exchange:'NASDAQ',assetType:'Stock',currency:'USD',active:true,startDate:'2026-09-01',endDate:'2026-10-01'}]});
 const key=digest('isolated-price-cache');save(root,'.market-cache/tiingo2/evidence/'+key+'.json',{key,metadata,rows:bars,summary});
 return fn({root,sourceRun,sourceCache,workDir,baseline,bars,key,metadata,summary});
}finally{rmSync(root,{recursive:true,force:true});}}

test('existing canonical builder and MarketStore create additive concrete shadow outputs without touching baseline',()=>fixture(options=>{
 const before=readFileSync(join(options.root,'quant/data/universe/instruments/BA.json'));
 const result=prepareProductizationShadow({...options,today,runId:'fixture',expectedAdditions:1,requirePrices:true});
 assert.equal(result.status.canonicalAdded,1);assert.equal(result.status.consumerBefore,1);assert.equal(result.status.consumerAfter,2);
 assert.equal(result.status.priceMaterialized,1);assert.equal(result.status.productionWrites,0);
 assert.deepEqual(readFileSync(join(options.root,'quant/data/universe/instruments/BA.json')),before);
 const payload=result.pricePayloads.get('IPO');assert.equal(payload.provider,'tiingo');assert.equal(payload.securityId,'ref_IPO');assert.equal(payload.bars.length,3);
 const newCanonical=JSON.parse(readFileSync(join(result.shadowRoot,'quant/data/universe/instruments/IP.json'))).instruments[0];
 assert.equal(newCanonical.instrumentId,result.securities[0].instrumentId);assert.equal(newCanonical.masterMemberId,'ref_IPO');
 assert.ok(readFileSync(join(options.workDir,'company-builder.log'),'utf8').includes('kanonischer Company Master'));
 const resumed=prepareProductizationShadow({...options,today,runId:'fixture',expectedAdditions:1,requirePrices:true});
 assert.equal(resumed.pricePayloads.get('IPO').updatedAt,payload.updatedAt);
 assert.deepEqual(JSON.parse(readFileSync(join(result.shadowRoot,'quant/data/universe/instruments/BA.json'))).instruments[0],options.baseline);
}));

test('an existing DNA regression blocker does not abort valid newly accepted price materialization',()=>fixture(options=>{
 const policyPath=join(options.sourceRun,'tiingo2_consumer_policy_report.json'),policy=JSON.parse(readFileSync(policyPath));policy.rows.push({ticker:'DNA',companyName:'Ginkgo Bioworks'});writeFileSync(policyPath,JSON.stringify(policy));
 const result=prepareProductizationShadow({...options,today,runId:'regression',expectedAdditions:1,requirePrices:true});
 assert.equal(result.status.canonicalAdded,1);assert.equal(result.priceReport.materialized,1);assert.equal(result.priceReport.blocked,1);
 const dna=result.priceReport.rows.find(row=>row.ticker==='DNA');assert.equal(dna.regressionCase,true);assert.equal(dna.reason,'PRICE_CACHE_MISSING');
 assert.equal(result.priceCandidates.length,2);assert.equal(result.priceSecurities.length,2);
},{baselineTicker:'DNA'}));

test('accepted source canonical stage bytes cannot be modified while retaining their old proof',()=>fixture(options=>{
 prepareProductizationShadow({...options,today,runId:'original',expectedAdditions:1});
 cpSync(join(options.workDir,'canonical-stage'),join(options.sourceRun,'canonical'),{recursive:true});
 const stage=JSON.parse(readFileSync(join(options.sourceRun,'canonical/manifest.json'))),entry=stage.files[0];
 writeFileSync(join(options.sourceRun,'canonical',entry.stagedPath),'{}');
 assert.throws(()=>prepareProductizationShadow({...options,today,runId:'tampered',expectedAdditions:1,workDir:join(options.root,'.market-cache/second-shadow')}),/ACCEPTED_CANONICAL_STAGE_INTEGRITY_FAILED/);
}));

test('verified original canonical stage can be extended only by listing-bound reviewed additions',()=>fixture(options=>{
 prepareProductizationShadow({...options,today,runId:'original',expectedAdditions:1});
 cpSync(join(options.workDir,'canonical-stage'),join(options.sourceRun,'canonical'),{recursive:true});
 const policyPath=join(options.sourceRun,'tiingo2_consumer_policy_report.json'),policy=JSON.parse(readFileSync(policyPath)),extra=structuredClone(policy.rows[0]);
 extra.ticker='TWIN';extra.securityId='ref_TWIN';extra.companyName='Twin Corporation';extra.evidence.identity={resolved:true,listingPeriodMatched:true,providerSymbolMatched:true,symbolCollision:false,wrongExchange:false};policy.rows.push(extra);writeFileSync(policyPath,JSON.stringify(policy));
 const previewPath=join(options.sourceRun,'tiingo2_publication_preview.json'),preview=JSON.parse(readFileSync(previewPath));preview.ADDED.push({ticker:'TWIN',securityId:'ref_TWIN',reasonCodes:['TECHNICAL_REVIEW_RESOLVED_WITH_LISTING_BOUND_EVIDENCE']});writeFileSync(previewPath,JSON.stringify(preview));
 const discoveryPath=join(options.sourceRun,'tiingo2_fresh_discovery.json'),discovery=JSON.parse(readFileSync(discoveryPath));discovery.records.push({...discovery.records[0],ticker:'TWIN'});writeFileSync(discoveryPath,JSON.stringify(discovery));
 const metadata={...options.metadata,ticker:'TWIN',name:'Twin Corporation'},summary=assessEvidence(options.bars,{ticker:'TWIN',today,currency:'USD',metadata}),key=digest('reviewed-TWIN');save(options.root,'.market-cache/tiingo2/evidence/'+key+'.json',{key,metadata,rows:options.bars,summary});
 const directory='Symbol|Security Name|ETF|Test Issue\nTWIN|Twin Corporation - Common Stock|N|N\n',directoryPath=join(options.sourceCache,'directories',today+'-nasdaqlisted.txt');mkdirSync(dirname(directoryPath),{recursive:true});writeFileSync(directoryPath,directory);
 const official=parseExchangeDirectory(directory,'nasdaqlisted')[0],listingKey='TWIN|NASDAQ|2026-09-01',providerMetadataHash=digest(JSON.stringify(metadata)),providerResponseSha256=digest(JSON.stringify(options.bars)),officialEvidenceHash=digest(JSON.stringify(official));
 const proof={schemaVersion:'tiingo2-review-resolution-proof-1',resolverVersion:'tiingo2-review-resolution-1.0.0',asOf:today,sourceManifestSha256:digest(readFileSync(join(options.sourceRun,'canonical/manifest.json'))),additional:[{ticker:'TWIN',securityId:'ref_TWIN',listingKey,decision:'AUTO_RESOLVED',corporateActionGateWaived:false,providerMetadataHash,providerResponseSha256,officialEvidenceHash,proof:[{kind:'TECHNICAL_SECURITY_FORM_NAME_AND_VENUE_RESOLUTION',listingKey,identityFieldsPreserved:true,providerMetadataSha256:providerMetadataHash,providerResponseSha256,officialEvidenceSha256:officialEvidenceHash}]}]};
 save(options.root,'.verification/accepted/review-resolution-proof.json',proof);preview.reviewResolutionProofSha256=digest(readFileSync(join(options.sourceRun,'review-resolution-proof.json')));writeFileSync(previewPath,JSON.stringify(preview));
 const result=prepareProductizationShadow({...options,today,runId:'extended',expectedAdditions:2,requirePrices:true,workDir:join(options.root,'.market-cache/augmented-shadow')});
 assert.deepEqual(result.tickers,['IPO','TWIN']);assert.equal(result.status.consumerAfter,3);assert.equal(result.priceReport.materialized,2);
 extra.evidence.identity.providerSymbolMatched=false;writeFileSync(policyPath,JSON.stringify(policy));
 assert.throws(()=>prepareProductizationShadow({...options,today,runId:'unverified',expectedAdditions:2,workDir:join(options.root,'.market-cache/unverified-shadow')}),/ADDITIONAL_REVIEW_IDENTITY_PROOF_MISSING/);
 extra.evidence.identity.providerSymbolMatched=true;writeFileSync(policyPath,JSON.stringify(policy));
 writeFileSync(directoryPath,directory.replace('Twin Corporation','Different Issuer'));
 assert.throws(()=>prepareProductizationShadow({...options,today,runId:'changed-official',expectedAdditions:2,workDir:join(options.root,'.market-cache/changed-official-shadow')}),/ADDITIONAL_REVIEW_OFFICIAL_INPUT_PROOF_MISMATCH/);
 writeFileSync(directoryPath,directory);proof.sourceManifestSha256=digest('different-source-manifest');save(options.root,'.verification/accepted/review-resolution-proof.json',proof);preview.reviewResolutionProofSha256=digest(readFileSync(join(options.sourceRun,'review-resolution-proof.json')));writeFileSync(previewPath,JSON.stringify(preview));
 assert.throws(()=>prepareProductizationShadow({...options,today,runId:'changed-manifest',expectedAdditions:2,workDir:join(options.root,'.market-cache/changed-manifest-shadow')}),/ADDITIONAL_REVIEW_PROOF_BINDING_INVALID/);
}));

test('duplicate accepted policy rows cannot silently override their prior identity evidence',()=>fixture(options=>{
 const path=join(options.sourceRun,'tiingo2_consumer_policy_report.json'),policy=JSON.parse(readFileSync(path));policy.rows.push(structuredClone(policy.rows[0]));writeFileSync(path,JSON.stringify(policy));
 assert.throws(()=>prepareProductizationShadow({...options,today,runId:'duplicate',expectedAdditions:1}),/DUPLICATE_PRODUCTIZATION_POLICY_SYMBOL/);
}));

test('no private provider histories means an honest blocker and require-prices refuses publication readiness',()=>fixture(options=>{
 rmSync(join(options.sourceCache,'evidence'),{recursive:true});
 const result=prepareProductizationShadow({...options,today,runId:'missing',expectedAdditions:1});
 assert.equal(result.status.priceMaterialized,0);assert.equal(result.status.priceBlocked,1);assert.equal(result.pricePayloads.size,0);
 assert.throws(()=>prepareProductizationShadow({...options,today,runId:'missing',expectedAdditions:1,requirePrices:true}),/REQUIRED_PRIVATE_PRICE_INPUTS_MISSING_OR_INVALID/);
}));

test('wrong listing generation and modified private cache cannot produce canonical price readiness',()=>fixture(options=>{
 const path=join(options.sourceCache,'evidence',options.key+'.json'),cache=JSON.parse(readFileSync(path));
 const candidate={ticker:'IPO',startDate:'2026-09-01',exchange:'NASDAQ',currency:'USD'};
 cache.metadata.startDate='2000-01-01';writeFileSync(path,JSON.stringify(cache));
 assert.equal(loadCandidatePriceInputs({...options,candidates:[candidate],today}).get('IPO').reason,'PRICE_CACHE_MISSING');
 cache.metadata.startDate='2026-09-01';cache.rows[0].close=15;writeFileSync(path,JSON.stringify(cache));
 assert.equal(loadCandidatePriceInputs({...options,candidates:[candidate],today}).get('IPO').reason,'PRICE_CACHE_INTEGRITY_FAILED');
}));

test('SEC issuer mapping attaches only appended securities and refuses CIK reassignment',()=>fixture(options=>{
 const result=prepareProductizationShadow({...options,today,runId:'issuer',expectedAdditions:1});
 const before=JSON.parse(readFileSync(join(result.shadowRoot,'quant/data/universe/instruments/BA.json'))).instruments[0];
 const mapped=reconcileShadowIssuerMappings({shadowRoot:result.shadowRoot,securities:result.securities,byTicker:{IPO:{cik:'0001234567'},BASE:{cik:'0000000001'}}});
 assert.equal(mapped.rows[0].state,'MAPPED');assert.equal(result.securities[0].issuerId,'iss_cik_0001234567');
 assert.deepEqual(JSON.parse(readFileSync(join(result.shadowRoot,'quant/data/universe/instruments/BA.json'))).instruments[0],before);
 assert.equal(reconcileShadowIssuerMappings({shadowRoot:result.shadowRoot,securities:result.securities,byTicker:{IPO:{cik:'0007654321'}}}).rows[0].reason,'CIK_CONFLICT');
}));
