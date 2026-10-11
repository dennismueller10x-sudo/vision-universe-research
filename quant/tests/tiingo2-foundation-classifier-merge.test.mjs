import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const Master=createRequire(import.meta.url)('../engines/us-security-master.js');
const classify=row=>Master.classifySecurity({assetType:'Stock',exchange:'NASDAQ',active:true,...row},{today:'2026-10-03',listedRoots:{}});
test('current main debt exclusions all survive accepted classification guards',()=>{
 const decisions=JSON.parse(readFileSync(new URL('../data/market/security-master/eligibility.json',import.meta.url))).decisions;
 const names=JSON.parse(readFileSync(new URL('../data/market/security-master/company-names.json',import.meta.url))).rows;
 /* Namensbeleg je Ausschluss: die Wertpapierbezeichnung der Boerse (apply-exchange-directory.mjs, steht im Abgleich), sonst der Firmenname (#366, 22 Titel). */
 const recon=JSON.parse(readFileSync(new URL('../data/market/security-master/eligibility-reconciliation.json',import.meta.url)));
 const directory=new Map((recon.changes||[]).filter(c=>c.source==='NASDAQ_TRADER_SYMBOL_DIRECTORY'&&c.securityName).map(c=>[c.securityId,c.securityName]));
 const fixtures=decisions.filter(row=>row.instrument_type==='DEBT'&&row.product_eligibility==='EXCLUDED').map(row=>({...row,name:directory.get(row.securityId)||names.find(n=>n.securityId===row.securityId)?.companyName}));
 assert.ok(fixtures.every(row=>!!row.name));
 assert.equal(fixtures.filter(row=>!directory.has(row.securityId)).length,22);
 assert.equal(fixtures.length,22+[...directory.keys()].filter(id=>decisions.some(d=>d.securityId===id&&d.instrument_type==='DEBT')).length);
 for(const row of fixtures){const c=classify(row);assert.equal(c.instrumentType,'DEBT',row.ticker);assert.equal(c.policyBucket,'EXCLUDE');assert.equal(Master.decideProductEligibility({instrumentType:c.instrumentType,classificationStatus:c.classificationStatus,policyBucket:c.policyBucket,eligible:c.eligibleUsEquity,reason:c.eligibilityReason}).inProductUniverse,false,row.ticker);}
});
test('explicit note security form survives issuer closed-end description',()=>{
 const c=classify({ticker:'SARZ',name:'Saratoga Investment Corp 6.00% Notes Due 2027',providerDescription:'Saratoga Investment Corp is a closed-end investment company.'});
 assert.equal(c.instrumentType,'DEBT');assert.equal(c.classificationStatus,'CLASSIFIED');assert.equal(c.policyBucket,'EXCLUDE');
});
test('explicit debt descriptor outranks confirmed NASDAQ preferred and derivative suffixes',()=>{
 for(const suffix of ['P','O','N','M','W','R','U']){
  const ticker='ABCN'+suffix,c=Master.classifySecurity({ticker,name:'Example Corporation 6.00% Senior Notes Due 2030',assetType:'Stock',exchange:'NASDAQ',active:true},{today:'2026-10-03',listedRoots:{ABCN:true}});
  assert.equal(c.instrumentType,'DEBT',ticker);assert.equal(c.classificationStatus,'CLASSIFIED',ticker);assert.equal(c.policyBucket,'EXCLUDE',ticker);
  const eligibility=Master.decideProductEligibility({instrumentType:c.instrumentType,classificationStatus:c.classificationStatus,policyBucket:c.policyBucket,eligible:c.eligibleUsEquity,reason:c.eligibilityReason});
  assert.equal(eligibility.status,'EXCLUDED',ticker);assert.equal(eligibility.inProductUniverse,false,ticker);
 }
 for(const ticker of ['ABCN-P-A','ABCN-WS','ABCN-RT','ABCN-U']){
  const c=classify({ticker,name:'Example Corporation Junior Subordinated Debentures'});
  assert.equal(c.instrumentType,'DEBT',ticker);assert.equal(c.classificationStatus,'CLASSIFIED',ticker);assert.equal(c.policyBucket,'EXCLUDE',ticker);
 }
});
test('classification cache rule provenance advances while current published main schema is preserved',()=>{
 assert.equal(Master.VERSION,'us-security-master-1.3.0');assert.equal(Master.CLASSIFICATION_RULE_VERSION,'us-security-master-rules-1.3.3');
 const c=classify({ticker:'PRHIZ',name:'Presurance Holdings Inc Sr Nt'});assert.equal(c.version,Master.VERSION);assert.equal(c.classificationRuleVersion,Master.CLASSIFICATION_RULE_VERSION);
});
