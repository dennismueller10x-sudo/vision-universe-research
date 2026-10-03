import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { assessEvidence } from '../../scripts/market/tiingo2-evidence.mjs';
import { assessProductizationReplay, loadCandidatePriceInputs, prepareProductizationShadow, reconcileShadowIssuerMappings } from '../../scripts/market/tiingo2-productize.mjs';
import { productizationFixture as fixture } from './fixtures/tiingo2-productize-fixture.mjs';
import { parseExchangeDirectory } from '../../scripts/market/tiingo2-refresh.mjs';
import { resolveName } from '../../scripts/market/build-company-names.mjs';
const source=join(dirname(fileURLToPath(import.meta.url)),'../..'),Company=createRequire(import.meta.url)('../../quant/engines/company-master.js');
const digest=x=>createHash('sha256').update(x).digest('hex'),today='2026-10-02';
function save(root,path,doc){const file=join(root,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(doc));return file;}

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
 const manifest=JSON.parse(readFileSync(join(result.shadowRoot,'quant/data/universe/master-manifest.json')));assert.equal(manifest.identifiers.withIssuerId,1);assert.equal(manifest.identifiers.distinctIssuers,1);assert.equal(manifest.identifiers.withCik,1);
 assert.deepEqual(JSON.parse(readFileSync(join(result.shadowRoot,'quant/data/universe/instruments/BA.json'))).instruments[0],before);
 assert.equal(reconcileShadowIssuerMappings({shadowRoot:result.shadowRoot,securities:result.securities,byTicker:{IPO:{cik:'0007654321'}}}).rows[0].reason,'CIK_CONFLICT');
}));

test('verified issuer mapping survives native name resumption without fundamentals or changing listing provenance',()=>fixture(options=>{
 const result=prepareProductizationShadow({...options,today,runId:'issuer-no-fundamentals',expectedAdditions:1});
 const namesPath=join(result.shadowRoot,'quant/data/market/security-master/company-names.json'),before=JSON.parse(readFileSync(namesPath)),prior=before.rows.find(row=>row.ticker==='IPO'),baseline=before.rows.find(row=>row.ticker==='BASE');
 reconcileShadowIssuerMappings({shadowRoot:result.shadowRoot,securities:result.securities,byTicker:{IPO:{cik:'0001234567',identityVerified:true,fundamentalsStatus:'NONE'},BASE:{cik:'0000000001',identityVerified:true,fundamentalsStatus:'NONE'}}});
 const after=JSON.parse(readFileSync(namesPath)),row=after.rows.find(row=>row.ticker==='IPO'),candidate=row.candidates.TIINGO_METADATA;
 assert.equal(row.cik,'0001234567');assert.equal(resolveName(row.ticker,row.candidates).cik,row.cik,'existing resolver carries the verified issuer identity');
 assert.equal(candidate.cikSource,'EXISTING_SEC_CANONICAL_PRODUCER');
 const {cik,cikSource,...originalFields}=candidate,{cik:previousCik,cikSource:previousSource,...previousFields}=prior.candidates.TIINGO_METADATA;
 assert.deepEqual(originalFields,previousFields,'name observation, run, symbol, venue, listing date and security identity are unchanged');
 assert.deepEqual(after.rows.find(row=>row.ticker==='BASE'),baseline,'baseline name is untouched');
 assert.equal(row.companyName,prior.companyName);assert.equal(row.nameAsOf,prior.nameAsOf);
}));

test('repeated accepted stage is a verified no-op preserving later unrelated consumer additions',()=>fixture(options=>{
 assert.equal(assessProductizationReplay({...options,asOf:today,expectedAdditions:1}).state,'NEW_ADDITIONS');
 const prepared=prepareProductizationShadow({...options,today,runId:'repeat',expectedAdditions:1});
 cpSync(join(options.workDir,'canonical-stage'),join(options.sourceRun,'canonical'),{recursive:true});
 for(const path of ['quant/data/market/scale/universe-FULL_UNIVERSE.json','quant/data/market/security-master/eligibility.json','quant/data/market/security-master/company-names.json','quant/data/universe'])cpSync(join(prepared.shadowRoot,path),join(options.root,path),{recursive:true});
 const rawPath=join(options.root,'quant/data/market/scale/universe-FULL_UNIVERSE.json'),raw=JSON.parse(readFileSync(rawPath));raw.securities.push({...raw.securities[1],ticker:'OTHER',securityId:'ref_OTHER'});writeFileSync(rawPath,JSON.stringify(raw));
 const eligibilityPath=join(options.root,'quant/data/market/security-master/eligibility.json'),eligibility=JSON.parse(readFileSync(eligibilityPath));eligibility.decisions.push({...eligibility.decisions[1],ticker:'OTHER',securityId:'ref_OTHER'});eligibility.counts.universeMembers++;eligibility.counts.productUniverse++;eligibility.counts.ELIGIBLE++;writeFileSync(eligibilityPath,JSON.stringify(eligibility));
 const before=readFileSync(rawPath),replayed=assessProductizationReplay({...options,asOf:'2026-10-03',expectedAdditions:1});
 assert.equal(replayed.state,'BLOCKED_REQUIRES_FRESH_DIFF');assert.equal(replayed.reason,'COMPLETE_PRODUCT_AND_STORAGE_RECEIPT_REQUIRED');assert.equal(replayed.alreadyPresent,1);assert.equal(replayed.currentConsumer,3);assert.deepEqual(replayed.ADDED,[]);assert.deepEqual(replayed.REMOVED,[]);assert.equal(replayed.unchanged[0].instrumentId,prepared.securities[0].instrumentId);assert.deepEqual(readFileSync(rawPath),before);
 const shardPath=join(options.root,'quant/data/universe/instruments/IP.json'),shard=JSON.parse(readFileSync(shardPath));shard.instruments[0].instrumentId='vu_changed';shard.instruments[0].masterMemberId='ref_OTHER';writeFileSync(shardPath,JSON.stringify(shard));
 assert.throws(()=>assessProductizationReplay({...options,asOf:today,expectedAdditions:1}),/CACHED_STAGE_CANONICAL_IDENTITY_CONFLICT/);
}));

test('zero fresh accepted additions are NO_CHANGES; canonical-only and partial scopes require a fresh diff',()=>fixture(options=>{
 const prepared=prepareProductizationShadow({...options,today,runId:'partial',expectedAdditions:1});
 cpSync(join(options.workDir,'canonical-stage'),join(options.sourceRun,'canonical'),{recursive:true});
 for(const path of ['quant/data/market/scale/universe-FULL_UNIVERSE.json','quant/data/market/security-master/eligibility.json','quant/data/market/security-master/company-names.json','quant/data/universe'])cpSync(join(prepared.shadowRoot,path),join(options.root,path),{recursive:true});
 const previewPath=join(options.sourceRun,'tiingo2_publication_preview.json'),policyPath=join(options.sourceRun,'tiingo2_consumer_policy_report.json'),discoveryPath=join(options.sourceRun,'tiingo2_fresh_discovery.json');
 const preview=JSON.parse(readFileSync(previewPath)),policy=JSON.parse(readFileSync(policyPath)),discovery=JSON.parse(readFileSync(discoveryPath));
 // A fixture without review extras remains a valid accepted snapshot; do not
 // treat an already-present prefix as permission to publish its missing suffix.
 rmSync(join(options.sourceRun,'canonical'),{recursive:true});preview.ADDED.push({ticker:'TWIN',securityId:'ref_TWIN'});policy.rows.push({...policy.rows[0],ticker:'TWIN',securityId:'ref_TWIN'});discovery.records.push({...discovery.records[0],ticker:'TWIN'});
 writeFileSync(previewPath,JSON.stringify(preview));writeFileSync(policyPath,JSON.stringify(policy));writeFileSync(discoveryPath,JSON.stringify(discovery));
 assert.equal(assessProductizationReplay({...options,asOf:today,expectedAdditions:2}).state,'BLOCKED_REQUIRES_FRESH_DIFF');
 preview.ADDED=[];writeFileSync(previewPath,JSON.stringify(preview));
 assert.equal(assessProductizationReplay({...options,asOf:today,expectedAdditions:0}).state,'NO_CHANGES');
}));

test('cached no-op preflight still refuses changed original stage bytes',()=>fixture(options=>{
 prepareProductizationShadow({...options,today,runId:'tampered-preflight',expectedAdditions:1});cpSync(join(options.workDir,'canonical-stage'),join(options.sourceRun,'canonical'),{recursive:true});
 const manifest=JSON.parse(readFileSync(join(options.sourceRun,'canonical/manifest.json')));writeFileSync(join(options.sourceRun,'canonical',manifest.files[0].stagedPath),'{}');
 assert.throws(()=>assessProductizationReplay({...options,asOf:today,expectedAdditions:1}),/ACCEPTED_CANONICAL_STAGE_INTEGRITY_FAILED/);
}));
