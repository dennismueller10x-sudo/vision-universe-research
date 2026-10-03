import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compareBaselineLogos} from '../../scripts/market/tiingo2-product-shadow-qa.mjs';

test('shadow QA rejects corrupted or missing baseline asset bytes despite unchanged logo paths',()=>{
 const shadow=mkdtempSync(join(tmpdir(),'logo-baseline-qa-')),baseline={files:{OLD:'files/OLD.png'},wide:{OLD:3},wideFiles:{OLD:'files/wide/SHARED.png'},dark:['OLD']};
 mkdirSync(join(shadow,'discover/logos/files/wide'),{recursive:true});
 const index=join(shadow,'discover/logos/index.json');writeFileSync(index,JSON.stringify(baseline));
 const records=['discover/logos/files/OLD.png','discover/logos/files/wide/SHARED.png'].map(path=>{
  const bytes=Buffer.from('original '+path);writeFileSync(join(shadow,path),bytes);
  return {path,gitBlobOid:createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')};
 });
 const inspect=()=>compareBaselineLogos({shadow,baseline,records});
 assert.equal(inspect().length,3,'existing finalizer check count must be preserved');
 assert.ok(inspect().every(r=>r.ok));assert.equal(inspect()[0].details.baselineAssets,2);
 writeFileSync(join(shadow,records[0].path),'different issuer asset at same URL');
 const bad=inspect()[0];assert.equal(bad.ok,false);assert.deepEqual(bad.details.changed,[]);
 assert.deepEqual(bad.details.changedAssetBytes,[records[0].path]);
 rmSync(join(shadow,records[1].path));assert.equal(inspect()[0].details.changedAssetBytes.length,2);
 writeFileSync(index,JSON.stringify({...baseline,wideFiles:{OLD:'files/wide/WRONG.png'}}));
 const wide=inspect().find(r=>r.name==='BASELINE_LOGO_MAPPING_WIDE');assert.equal(wide.ok,false);assert.deepEqual(wide.details.changedExplicitWide,['OLD']);
 rmSync(shadow,{recursive:true});
});
