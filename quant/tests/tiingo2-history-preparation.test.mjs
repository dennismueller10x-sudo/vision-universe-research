import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {prepareHistoryPublication} from '../../scripts/market/tiingo2-history-preparation.mjs';
test('prepared private histories bind exact canonical IDs/bytes to a publication and never export raw bars in public metadata',()=>{
 const root=mkdtempSync(join(tmpdir(),'tiingo2-history-plan-')),marketStoreDir=join(root,'history'),outputRoot=join(root,'.market-cache/prepared/tiingo2'),publicationManifestSha256='a'.repeat(64),sourceCommit='b'.repeat(40);
 try{
  const file=join(marketStoreDir,'tiingo/daily/ref_FIG.json');mkdirSync(join(marketStoreDir,'tiingo/daily'),{recursive:true});
  const payload={ticker:'FIG',securityId:'ref_FIG',provider:'tiingo',bars:[{securityId:'ref_FIG',date:'2026-10-01',close:123.456,volume:12345}]};writeFileSync(file,JSON.stringify(payload));
  const plan=prepareHistoryPublication({marketStoreDir,outputRoot,additions:[{ticker:'FIG',securityId:'ref_FIG'}],publicationManifestSha256,sourceCommit});
  assert.equal(plan.productionWrites,0);assert.equal(plan.sourceCommit,sourceCommit);assert.equal(plan.publicationManifestSha256,publicationManifestSha256);assert.equal(plan.rows[0].existingObjectOverwriteAllowed,false);assert.doesNotMatch(JSON.stringify(plan),/123\.456|12345|"close"/);
  assert.equal(readFileSync(join(outputRoot,plan.rows[0].path),'utf8'),readFileSync(file,'utf8'));
  assert.deepEqual(prepareHistoryPublication({marketStoreDir,outputRoot,additions:[{ticker:'FIG',securityId:'ref_FIG'}],publicationManifestSha256,sourceCommit}),plan);
  assert.throws(()=>prepareHistoryPublication({marketStoreDir,outputRoot,additions:[{ticker:'WRONG',securityId:'ref_FIG'}],publicationManifestSha256,sourceCommit}),/IDENTITY/);
  assert.throws(()=>prepareHistoryPublication({marketStoreDir,outputRoot:marketStoreDir,additions:[],publicationManifestSha256,sourceCommit}),/PRIVATE_SEPARATE/);
  assert.throws(()=>prepareHistoryPublication({marketStoreDir,outputRoot,additions:[]}),/PUBLICATION_HASH/);
  const outside=join(root,'protected');mkdirSync(outside);writeFileSync(join(outside,'ref_FIG.json'),'protected');
  rmSync(join(outputRoot,'private-histories/tiingo/daily'),{recursive:true});symlinkSync(outside,join(outputRoot,'private-histories/tiingo/daily'));
  assert.throws(()=>prepareHistoryPublication({marketStoreDir,outputRoot,additions:[{ticker:'FIG',securityId:'ref_FIG'}],publicationManifestSha256,sourceCommit}),/LINK/);
  assert.equal(readFileSync(join(outside,'ref_FIG.json'),'utf8'),'protected');
  rmSync(join(outputRoot,'private-histories/tiingo/daily'));mkdirSync(join(outputRoot,'private-histories/tiingo/daily'));
  const absent=join(outside,'not-yet-existing.json');symlinkSync(absent,join(outputRoot,'private-histories/tiingo/daily/ref_FIG.json'));
  assert.throws(()=>prepareHistoryPublication({marketStoreDir,outputRoot,additions:[{ticker:'FIG',securityId:'ref_FIG'}],publicationManifestSha256,sourceCommit}),/LINK/);assert.equal(existsSync(absent),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
