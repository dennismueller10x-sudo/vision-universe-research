import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
const require=createRequire(import.meta.url),Adapter=require('../../providers/sec/adapter.js'),Schema=require('../engines/schema.js');
const fixture=JSON.parse(readFileSync(new URL('./fixtures/sec-canonical-synthetic.json',import.meta.url))).bundles[0];

test('native adapter reads lossless JSON and gzip with identical PIT results',()=>{
 const plain=mkdtempSync(join(tmpdir(),'sec-json-')),compressed=mkdtempSync(join(tmpdir(),'sec-gzip-'));
 try{
  const bytes=Buffer.from(JSON.stringify(fixture));writeFileSync(join(plain,'SYNA.json'),bytes);writeFileSync(join(compressed,'SYNA.json.gz'),gzipSync(bytes,{level:9}));
  assert.deepEqual(Adapter.fileLoader(compressed)(),Adapter.fileLoader(plain)());
  const a=Adapter.createSecProvider({directory:plain}),b=Adapter.createSecProvider({directory:compressed});
  for(const asOf of ['1990-01-01','2018-01-01','2026-01-01'])assert.deepEqual(b.getFacts(fixture.security.securityId,{asOf}),a.getFacts(fixture.security.securityId,{asOf}));
  writeFileSync(join(compressed,'SYNA.json'),'invalid source');
  assert.throws(()=>Adapter.fileLoader(compressed)(),/DUPLICATE_CANONICAL_STORAGE_IDENTITY/,'a bad/empty plain copy cannot hide a compressed identity collision');
 }finally{rmSync(plain,{recursive:true,force:true});rmSync(compressed,{recursive:true,force:true});}
});

test('every delivered canonical index binding resolves to decoded native schema and safe chronology',()=>{
 const index=JSON.parse(readFileSync(new URL('../data/sec/canonical_index.json',import.meta.url))),bundles=Adapter.fileLoader()();
 assert.equal(bundles.length,index.companies.length,'compressed histories are measured rather than silently skipped');
 for(const bundle of bundles){
  const row=index.companies.filter(row=>row.ticker===bundle.security.ticker);
  assert.equal(row.length,1);assert.equal(row[0].securityId,bundle.security.securityId);
  for(const fact of bundle.facts){
   const checked=Schema.validate('FundamentalFact',fact);assert.equal(checked.valid,true,bundle.security.ticker+': '+checked.errors.join(';'));
   assert.ok(fact.periodEnd<=fact.filedAt&&fact.filedAt<=fact.availableAt,bundle.security.ticker+': invalid chronology');
  }
 }
});
