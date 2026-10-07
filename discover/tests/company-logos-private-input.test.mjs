import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,symlinkSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const root=resolve(import.meta.dirname,'../..');
const Identity=createRequire(import.meta.url)('../../core/identity.js');
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'vu-logo-private-'));
 const lei='529900D6BF99LW9R2E68',isin='DE0007164600';
 const html=Buffer.from('<html>SAP SE ISIN '+isin+'</html>');
 const gb=Buffer.from(JSON.stringify({data:{id:lei,attributes:{entity:{legalName:{name:'SAP SE'}}}}}));
 const htmlPath=join(dir,'issuer.html'),gleifPath=join(dir,'gleif.json');
 writeFileSync(htmlPath,html);writeFileSync(gleifPath,gb);
 const company={companyId:Identity.companyIdForLEI(lei),lei,name:'SAP',legalName:'SAP SE',officialWebsite:'https://www.sap.com/',securities:[{isin,mic:'XETR',securityId:Identity.securityIdForISIN(isin),listingId:Identity.listingIdFor({isin,mic:'XETR'}),ticker:'SAP'}],domainEvidence:{type:'OFFICIAL_ISSUER_SHARE_CLASS_IDENTIFIER_PAGE',url:'https://www.sap.com/investors',path:htmlPath,sha256:hash(html),retrievedAt:'2026-10-06T12:00:00Z'},issuerEvidence:{url:'https://api.gleif.org/api/v1/lei-records/'+lei,path:gleifPath,sha256:hash(gb)}};
 return {dir,company,input:join(dir,'input.json'),out:join(dir,'output'),clean(){rmSync(dir,{recursive:true,force:true});}};
}
function run(f,mutate=()=>{},args=[]){
 const value={schemaVersion:'vu-private-company-logos-1',companies:[f.company]};mutate(value);
 writeFileSync(f.input,JSON.stringify(value));
 return spawnSync(process.execPath,[join(root,'scripts/discover/build-company-logos.mjs'),'--input='+f.input,'--out='+f.out,'--dry-run',...args],{cwd:root,encoding:'utf8',timeout:10000});
}
test('private logo input validates exact LEI/local ISIN without network or writes',()=>{
 const f=fixture();try{const result=run(f);assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{privateInput:true,validatedCompanies:1,providerRequests:0,writes:0});}finally{f.clean();}
});
test('US ticker identities cannot be used as canonical company or local security',()=>{
 for(const key of ['companyId','securityId']){const f=fixture();try{const result=run(f,v=>{if(key==='companyId')v.companies[0].companyId='iss_cik_0001000184';else v.companies[0].securities[0].securityId='ref_SAP';});assert.notEqual(result.status,0);}finally{f.clean();}}
});
test('namesake and unproven official domain reject even a valid ISIN',()=>{
 for(const mutate of [v=>v.companies[0].domainEvidence.url='https://partner.example/stock',v=>v.companies[0].name='Someone Else',v=>v.companies[0].securities[0].isin='NL0010273215']){const f=fixture();try{assert.notEqual(run(f,mutate).status,0);}finally{f.clean();}}
});
test('modified issuer proof and duplicate companies fail closed',()=>{
 for(const mutate of [v=>v.companies[0].issuerEvidence.sha256='0'.repeat(64),v=>v.companies.push(v.companies[0])]){const f=fixture();try{assert.notEqual(run(f,mutate).status,0);}finally{f.clean();}}
});
test('private logo outputs cannot target tracked repository paths',()=>{
 const f=fixture();try{f.out=join(root,'discover/logos');const result=run(f);assert.notEqual(result.status,0);assert.match(result.stderr,/PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED/);}finally{f.clean();}
});
test('private logo child symlinks reject before processing input',()=>{
 const f=fixture();try{mkdirSync(f.out);symlinkSync(join(root,'discover/logos/files'),join(f.out,'files'));const result=run(f);assert.notEqual(result.status,0);assert.match(result.stderr,/PRIVATE_OUTPUT_SYMLINK_REJECTED/);}finally{f.clean();}
});
test('explicit output without private input cannot redirect legacy US pipeline',()=>{
 const f=fixture();try{const result=spawnSync(process.execPath,[join(root,'scripts/discover/build-company-logos.mjs'),'--out='+f.out,'--dry-run'],{cwd:root,encoding:'utf8',timeout:10000});assert.notEqual(result.status,0);assert.match(result.stderr,/PRIVATE_LOGO_INPUT_REQUIRED/);}finally{f.clean();}
});

test('private company asset symlinks reject before any image write',()=>{
 const f=fixture();try{mkdirSync(join(f.out,'files'),{recursive:true});symlinkSync(join(root,'discover/logos/index.json'),join(f.out,'files','LEI-'+f.company.lei+'.png'));const result=run(f);assert.notEqual(result.status,0);assert.match(result.stderr,/PRIVATE_OUTPUT_SYMLINK_REJECTED/);}finally{f.clean();}
});

function unverified(f){
 const c=f.company; c.referencedIssuerId=c.companyId;c.companyId=null;c.officialWebsite=null;c.domainEvidence=null;c.issuerEvidence=null;c.domainStatus='UNVERIFIED';
 c.issuerReference={lei:c.lei,legalName:c.legalName,basis:'EXACT_GLEIF_ISIN_LEI_REFERENCE',evidence:{mappingZipSHA256:'a'.repeat(64),leiBatchResponseSHA256:'b'.repeat(64)}};
}
test('accepted referenced issuer with unknown domain yields honest fallback without joining a canonical Company',()=>{
 const f=fixture();try{unverified(f);run(f);
 // Execute without --dry-run to verify the actual no-network fallback output.
 const live=spawnSync(process.execPath,[join(root,'scripts/discover/build-company-logos.mjs'),'--input='+f.input,'--out='+f.out,'--cache-only'],{cwd:root,encoding:'utf8',timeout:10000});
 assert.equal(live.status,0,live.stderr);const row=JSON.parse(readFileSync(join(f.out,'logo_status.json'))).rows[0];
 assert.equal(row.companyId,null);assert.equal(row.referencedIssuerId,f.company.referencedIssuerId);assert.equal(row.status,'LOGO_FALLBACK');assert.equal(row.reason,'MISSING_VERIFIED_OFFICIAL_DOMAIN');assert.equal(row.logo.symbol,null);
 const summary=JSON.parse(readFileSync(join(f.out,'summary.json')));assert.equal(summary.verified,0);assert.equal(summary.fallback,1);assert.equal(summary.missingVerifiedDomain,1);assert.equal(summary.providerRequests,0);
 const before=readFileSync(join(f.out,'logo_status.json'));const second=spawnSync(process.execPath,[join(root,'scripts/discover/build-company-logos.mjs'),'--input='+f.input,'--out='+f.out,'--cache-only'],{cwd:root,encoding:'utf8',timeout:10000});assert.equal(second.status,0,second.stderr);assert.deepEqual(readFileSync(join(f.out,'logo_status.json')),before);
 }finally{f.clean();}
});
test('missing-domain fallback still requires exact referenced issuer provenance and local security IDs',()=>{
 for(const change of [v=>v.companies[0].issuerReference.evidence.mappingZipSHA256=null,v=>v.companies[0].securities[0].listingId='lst_XNYS_DE0007164600']){const f=fixture();try{unverified(f);assert.notEqual(run(f,change).status,0);}finally{f.clean();}}
});

test('existing exact ESMA ISIN to LEI references also remain fallback without a verified domain',()=>{
 const f=fixture();try{unverified(f);const result=run(f,v=>{const ref=v.companies[0].issuerReference;ref.basis='EXACT_ESMA_ISIN_LEI_REFERENCE';ref.evidence.regulatoryResponseSHA256=ref.evidence.mappingZipSHA256;delete ref.evidence.mappingZipSHA256;});assert.equal(result.status,0,result.stderr);}finally{f.clean();}
});

function commonsFixture(){
 const f=fixture(),repo=join(f.dir,'source-repo');
 for(const p of ['scripts/discover/build-company-logos.mjs','scripts/discover/company-logos-web.mjs','scripts/discover/company-logos-lib.mjs','scripts/marketstack/private-output.mjs','core/identity.js']){mkdirSync(join(repo,p,'..'),{recursive:true});copyFileSync(join(root,p),join(repo,p));}
 mkdirSync(join(repo,'discover/logos/files'),{recursive:true});mkdirSync(join(repo,'discover/config'),{recursive:true});
 copyFileSync(join(root,'discover/logos/files/SAP.png'),join(repo,'discover/logos/files/SAP.png'));
 const sourceSHA1='a'.repeat(40);
 writeFileSync(join(repo,'discover/logos/index.json'),JSON.stringify({files:{SAP:'files/SAP.png'},dark:[]}));
 writeFileSync(join(repo,'discover/logos/credits.json'),JSON.stringify({credits:{SAP:{source:'WIKIMEDIA_COMMONS',path:'files/SAP.png',sha1:sourceSHA1,wikidata:'Q552581',license:'pd',licenseName:'Public domain',author:'SAP SE',title:'File:SAP 2011 logo.svg',page:'https://commons.wikimedia.org/wiki/File:SAP_2011_logo.svg',fmt:3}}}));
 writeFileSync(join(repo,'discover/config/logo-reviewed.json'),JSON.stringify({symbols:{SAP:sourceSHA1}}));
 writeFileSync(join(repo,'discover/config/logo-exclusions.json'),JSON.stringify({symbols:{}}));writeFileSync(join(repo,'discover/config/logo-rejects.json'),JSON.stringify({urls:{},titles:{}}));
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:repo,encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'Logo fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Logo fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','-q');git('add','.');git('commit','-qm','Controlled approved-logo fixture');
 const sourceMainSHA=git('rev-parse','HEAD'),sourceBlobSHA=git('rev-parse','HEAD:discover/logos/files/SAP.png');
 const proof={results:{bindings:[{item:{value:'http://www.wikidata.org/entity/Q552581'},isin:{value:f.company.securities[0].isin},lei:{value:f.company.lei},site:{value:'https://www.sap.com/'}}]}};
 const path=join(f.dir,'graph.json'),bytes=Buffer.from(JSON.stringify(proof));writeFileSync(path,bytes);
 f.company.domainEvidence={type:'EXACT_WIKIDATA_ISIN_LEI_OFFICIAL_SITE_GRAPH',url:'https://query.wikidata.org/sparql?query=controlled-fixture',path,sha256:hash(bytes),retrievedAt:'2026-10-06T12:00:00Z'};
 f.company.cachedCentralLogo={sourceMainSHA,sourceBlobSHA,sourceSymbol:'SAP'};f.repo=repo;f.script=join(repo,'scripts/discover/build-company-logos.mjs');f.git=git;
 f.write=()=>writeFileSync(f.input,JSON.stringify({schemaVersion:'vu-private-company-logos-1',companies:[f.company]}));
 f.run=(args=['--dry-run'])=>{f.write();return spawnSync(process.execPath,[f.script,'--input='+f.input,'--out='+f.out,...args],{cwd:repo,encoding:'utf8',timeout:10000});};return f;
}
test('approved Commons cache accepts only exact source-main PNG and matching ISIN/LEI/site/item graph',()=>{
 const f=commonsFixture();try{const result=f.run();assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).writes,0);}finally{f.clean();}
});
test('Commons reuse rejects wrong blob, graph issuer, entity, site, and non-approved evidence host',()=>{
 for(const change of [f=>f.company.cachedCentralLogo.sourceBlobSHA='0'.repeat(40),f=>{const d=JSON.parse(readFileSync(f.company.domainEvidence.path));d.results.bindings[0].lei.value='529900NNUPAGGOMPXZ31';const b=Buffer.from(JSON.stringify(d));writeFileSync(f.company.domainEvidence.path,b);f.company.domainEvidence.sha256=hash(b);},f=>{const d=JSON.parse(readFileSync(f.company.domainEvidence.path));d.results.bindings[0].item.value='http://www.wikidata.org/entity/Q156578';const b=Buffer.from(JSON.stringify(d));writeFileSync(f.company.domainEvidence.path,b);f.company.domainEvidence.sha256=hash(b);},f=>f.company.officialWebsite='https://partner.example/',f=>f.company.domainEvidence.url='https://untrusted.example/sparql']){const f=commonsFixture();try{change(f);assert.notEqual(f.run().status,0);}finally{f.clean();}}
});
test('Commons reuse rejects arbitrary asset symbols and symlinked central cache PNGs',()=>{
 for(const change of [f=>f.company.cachedCentralLogo.sourceSymbol='../SAP',f=>{const p=join(f.repo,'discover/logos/files/SAP.png');rmSync(p);symlinkSync(join(root,'discover/logos/files/SAP.png'),p);}]){const f=commonsFixture();try{change(f);assert.notEqual(f.run().status,0);}finally{f.clean();}}
});
test('Commons reused asset stays quarantined until exact private PNG hash is reviewed',()=>{
 const f=commonsFixture();try{let result=f.run(['--cache-only']);assert.equal(result.status,0,result.stderr);let status=JSON.parse(readFileSync(join(f.out,'logo_status.json'))).rows[0];assert.equal(status.canonicalStatus,'SUSPECT_QUARANTINED');assert.equal(JSON.parse(readFileSync(join(f.out,'index.json'))).localCount,0);
 const review=join(f.dir,'review.json'),png=readFileSync(join(f.repo,'discover/logos/files/SAP.png'));writeFileSync(review,JSON.stringify({companies:{[f.company.companyId]:createHash('sha1').update(png).digest('hex')}}));result=f.run(['--cache-only','--reviewed='+review]);assert.equal(result.status,0,result.stderr);status=JSON.parse(readFileSync(join(f.out,'logo_status.json'))).rows[0];assert.equal(status.canonicalStatus,'VERIFIED_LOGO');const credit=JSON.parse(readFileSync(join(f.out,'credits.json'))).credits[status.symbol];assert.equal(credit.source,'WIKIMEDIA_COMMONS');assert.equal(credit.via,'VERIFIED_EXISTING_APPROVED_ASSET_WITH_EXACT_REFERENCE_GRAPH');assert.equal(credit.wikidata,'Q552581');assert.equal(credit.license,'pd');assert.deepEqual(readFileSync(join(f.out,status.asset)),png);
 }finally{f.clean();}
});
test('Commons source approval cannot be supplied by a pending or unreviewed main credit',()=>{
 const f=commonsFixture();try{const path=join(f.repo,'discover/logos/credits.json'),c=JSON.parse(readFileSync(path));c.credits.SAP.pending=true;writeFileSync(path,JSON.stringify(c));f.git('add','.');f.git('commit','-qm','Pending image fixture');f.company.cachedCentralLogo.sourceMainSHA=f.git('rev-parse','HEAD');assert.notEqual(f.run().status,0);}finally{f.clean();}
});

test('Commons source cache cannot silently change pixels or normalized PNG resolution',()=>{
 for(const edit of [f=>{const p=join(f.repo,'discover/logos/files/SAP.png'),b=readFileSync(p);b[b.length-1]^=1;writeFileSync(p,b);},f=>{const p=join(f.repo,'discover/logos/files/SAP.png'),b=readFileSync(p);b.writeUInt32BE(32,16);writeFileSync(p,b);f.git('add','.');f.git('commit','-qm','Insufficient resolution fixture');f.company.cachedCentralLogo.sourceMainSHA=f.git('rev-parse','HEAD');f.company.cachedCentralLogo.sourceBlobSHA=f.git('rev-parse','HEAD:discover/logos/files/SAP.png');}]){const f=commonsFixture();try{edit(f);assert.notEqual(f.run().status,0);}finally{f.clean();}}
});

test('approved Commons cache still respects current protected-source logo removal rules',()=>{
 const f=commonsFixture();try{writeFileSync(join(f.repo,'discover/config/logo-exclusions.json'),JSON.stringify({symbols:{SAP:'Removed by rights holder'}}));f.git('add','.');f.git('commit','-qm','Rights removal fixture');f.company.cachedCentralLogo.sourceMainSHA=f.git('rev-parse','HEAD');const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/CENTRAL_COMMONS_SOURCE_EXCLUDED/);}finally{f.clean();}
});

test('historical approved Commons pin cannot bypass later current removal rules',()=>{
 for(const update of [f=>writeFileSync(join(f.repo,'discover/config/logo-exclusions.json'),JSON.stringify({symbols:{SAP:'Removed by rights holder'}})),f=>writeFileSync(join(f.repo,'discover/config/logo-rejects.json'),JSON.stringify({urls:{},titles:{'File:SAP 2011 logo.svg':'Withdrawn current image'}})),f=>writeFileSync(join(f.repo,'discover/config/logo-rejects.json'),JSON.stringify({urls:{'https://commons.wikimedia.org/wiki/File:SAP_2011_logo.svg':'Withdrawn current source'},titles:{}}))]){
  const f=commonsFixture();try{const oldPin=f.company.cachedCentralLogo.sourceMainSHA;update(f);const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/CURRENT_CENTRAL_COMMONS_SOURCE_EXCLUDED/);assert.equal(f.company.cachedCentralLogo.sourceMainSHA,oldPin);}finally{f.clean();}
 }
});
