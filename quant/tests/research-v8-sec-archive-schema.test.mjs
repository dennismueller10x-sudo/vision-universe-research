import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';

test('V8 SEC normalized archive schema preserves missing/time/chronology and restatement distinctions without publishing values',()=>{
 const root=mkdtempSync(join(tmpdir(),'v8-normalized-sec-'));
 try{
  mkdirSync(join(root,'quant/data/market/security-master'),{recursive:true});mkdirSync(join(root,'quant/data/sec/facts'),{recursive:true});
  writeFileSync(join(root,'quant/data/market/security-master/us-security-master.json'),JSON.stringify({rows:[]}));
  const source={cik:'0000000001',raw_companyfacts_sha256:'a'.repeat(64),filing_index:[{accession:'a',acceptance_datetime:'2020-02-01T12:00:00Z'},{accession:'b',acceptance_datetime:null}],factbook:{timelines:[{metric:'revenue',fiscal_year:2019,fiscal_period:'FY',restated:true,observations:[{value:987654321,available_from:'2020-01-01',period_end:'2019-12-31',quality:'HIGH',provenance:{accession:'a'}},{value:987654320,available_from:'2019-01-01T12:00:00Z',period_end:'2019-12-31',quality:'LOW',provenance:{accession:'b'}}]},{metric:'debt',fiscal_year:2020,fiscal_period:'Q1',restated:false,observations:[{value:1234,available_from:null,quality:'UNKNOWN',provenance:{}}]}]}};
  writeFileSync(join(root,'quant/data/sec/facts/example.json.gz'),gzipSync(JSON.stringify(source)));
  const run=spawnSync(process.execPath,[resolve('scripts/quant/audit-v8-archives.mjs'),'.verification/v8-archives'],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);
  const raw=readFileSync(join(root,'.verification/v8-archives/archive-assessment.json'),'utf8'),r=JSON.parse(raw),n=r.normalizedFactbooks;
  assert.equal(n.files,1);assert.equal(n.sourceCompanyfactsHashBound,1);assert.equal(n.timelines,2);assert.equal(n.observations,3);assert.equal(n.restatedTimelines,1);
  assert.equal(n.missingAvailability,1);assert.equal(n.dateOnlyAvailability,1);assert.equal(n.exactAvailability,1);assert.equal(n.availabilityBeforePeriodEnd,1);assert.equal(n.provenanceAccessionPresent,2);
  assert.equal(n.filingIndexEntries,2);assert.equal(n.filingIndexAcceptancePresent,1);assert.deepEqual(n.qualityCounts,{HIGH:1,LOW:1,UNKNOWN:1});assert.equal(n.earliestFiscalYear,2019);assert.equal(n.latestFiscalYear,2020);
  assert.equal(r.providerRequests,0);assert.equal(r.productionApproved,false);assert.ok(!raw.includes('"value"'));assert.ok(!raw.includes('987654321'));assert.equal(r.runtime.nodeVersion,process.versions.node);
 }finally{rmSync(root,{recursive:true,force:true});}
});
