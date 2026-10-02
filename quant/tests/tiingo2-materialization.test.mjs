import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { materializeFundamentals, assertShadowRoot } from '../../scripts/market/tiingo2-fundamentals.mjs';
import { classifyMaterializedFactorRecord } from '../../scripts/market/tiingo2-factors.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const Evidence = createRequire(import.meta.url)('../engines/factor-evidence.js');
function setup() {
  const base = mkdtempSync(join(tmpdir(), 'vu-tiingo2-materialize-')), shadow = join(base, 'shadow'), privateDir = join(base, 'private');
  mkdirSync(join(shadow, 'quant/config'), { recursive: true }); mkdirSync(privateDir, { recursive: true });
  copyFileSync(join(root, 'quant/config/sec-metric-registry.json'), join(shadow, 'quant/config/sec-metric-registry.json'));
  mkdirSync(join(shadow, 'quant/data/market/security-master'), { recursive: true });
  writeFileSync(join(shadow, 'quant/data/market/security-master/company-names.json'), JSON.stringify({ rows: [{ ticker: 'SCOP', securityId: 'ref_SCOP', cik: '4100000001' }, { ticker: 'NOSEC', securityId: 'ref_NOSEC', cik: null }] }));
  const seed = String.raw`
import sys,json,zipfile
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from quant.tests.test_pipeline_and_store import make_company,StubSEC
from quant.sec.http_client import DiskCache
company,_=make_company(4100000001,'SCOP','SYNTHETIC SCOPE SOFTWARE','3674','1231')
stub=StubSEC([company]); cache=DiskCache(Path(sys.argv[2])/'http-cache',ttl_seconds=None)
for url,payload in stub.responses.items():
 if '/companyfacts/' not in url: cache.put(url,json.dumps(payload).encode())
with zipfile.ZipFile(Path(sys.argv[2])/'companyfacts.zip','w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('CIK4100000001.json',json.dumps(company[-1].company_facts(company[2])))
 archive.writestr('CIK4100000002.json',json.dumps({'cik':4100000002,'entityName':'UNREQUESTED','facts':{}}))
`;
  const result = spawnSync('python3', ['-c', seed, join(root, 'scripts'), privateDir], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  return { base, shadow, privateDir, archive: join(privateDir, 'companyfacts.zip') };
}
test('actual SEC bulk pipeline produces PIT consumer/canonical/derived artifacts only for requested issuers', async () => {
  const fixture = setup();
  try {
    const report = await materializeFundamentals({ root: fixture.shadow, tickers: ['SCOP', 'NOSEC'], privateDir: fixture.privateDir, asOf: '2024-09-30', archive: fixture.archive, allowNetwork: false });
    assert.equal(report.pipeline.facts_source, 'bulk_companyfacts_zip'); assert.equal(report.network.requests, 0, 'cached submissions and bulk facts must not fetch per-company XBRL');
    assert.equal(report.rows.find((row) => row.ticker === 'NOSEC').fundamentalsStatus, 'NONE');
    const row = report.rows.find((row) => row.ticker === 'SCOP'); assert.equal(row.pitValid, true); assert.equal(row.fundamentalsStatus, 'FULL'); assert.equal(row.artifacts.length, 2);
    const bundle = JSON.parse(readFileSync(join(fixture.shadow, row.artifacts[0].path)));
    assert.equal(bundle.dataSource.isMock, false, 'existing producer provenance is preserved for fixture SEC inputs');
    for (const series of Object.values(bundle.annual)) for (const point of series) assert.ok(point[4] <= '2024-09-30', 'facts after cutoff are invisible');
    assert.ok(bundle.annual.free_cash_flow.length, 'existing derived engine must materialize actual cash-flow subtraction');
    assert.deepEqual(bundle.securityIds, ['ref_SCOP']);
    assert.deepEqual(report.scope, ['NOSEC', 'SCOP']);
    const canonical = JSON.parse(readFileSync(join(fixture.shadow, row.artifacts[1].path))); assert.equal(canonical.security.securityId, 'sec_SCOP', 'existing SEC-specific identity contract is unchanged');
    assert.ok(canonical.facts.length);
    bundle.tickers.unshift('SCOP.B'); bundle.securityIds.unshift('ref_SCOP_B');
    writeFileSync(join(fixture.shadow,row.artifacts[0].path),JSON.stringify(bundle));
    const indexPath=join(fixture.shadow,'quant/data/sec/canonical_index.json'), index=JSON.parse(readFileSync(indexPath));
    const retained={ticker:'OTHER',securityId:'sec_OTHER',cik:'4100000099',file:'canonical/OTHER.json'};index.companies.push(retained);writeFileSync(indexPath,JSON.stringify(index));
    const second = await materializeFundamentals({ root: fixture.shadow, tickers: ['SCOP'], privateDir: fixture.privateDir, asOf: '2024-09-30', archive: fixture.archive, allowNetwork: false });
    assert.equal(second.network.requests, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(fixture.shadow, row.artifacts[0].path))).annual, bundle.annual, 'resume preserves PIT financial values');
    assert.deepEqual(JSON.parse(readFileSync(join(fixture.shadow,row.artifacts[0].path))).securityIds,['ref_SCOP_B','ref_SCOP'],'requested share class does not erase existing same-issuer identity');
    assert.deepEqual(JSON.parse(readFileSync(indexPath)).companies.find(r=>r.ticker==='OTHER'),retained,'unrelated canonical index row stays identical');
    assert.equal(JSON.parse(readFileSync(indexPath)).companies.filter(r=>r.ticker==='SCOP').length,1,'resumed canonical publication is idempotent');
    assert.equal(second.canonicalProductionWrites, 0);
  } finally { rmSync(fixture.base, { recursive: true, force: true }); }
});
test('production root and escaped shadow data links are refused before any producer write', () => {
  assert.throws(() => assertShadowRoot(root), /SHADOW_ROOT_REQUIRED/);
  const base = mkdtempSync(join(tmpdir(), 'vu-shadow-link-'));
  try { mkdirSync(join(base, 'quant'), { recursive: true }); symlinkSync(join(root, 'quant/data'), join(base, 'quant/data')); assert.throws(() => assertShadowRoot(base), /SHADOW_DATA_SYMLINK_ESCAPES_ROOT/); }
  finally { rmSync(base, { recursive: true, force: true }); }
});
test('nested directory, dangling file and hardlink destinations cannot redirect shadow producer writes',()=>{
  const base=mkdtempSync(join(tmpdir(),'vu-shadow-nested-'));
  try{
    const shadow=join(base,'shadow'),outside=join(base,'outside');mkdirSync(join(shadow,'quant/data/sec'),{recursive:true});mkdirSync(outside);
    symlinkSync(outside,join(shadow,'quant/data/sec/consumer'));assert.throws(()=>assertShadowRoot(shadow),/SYMLINK/);rmSync(join(shadow,'quant/data/sec/consumer'));
    mkdirSync(join(shadow,'quant/data/market/factors'),{recursive:true});const file=join(shadow,'quant/data/market/factors/factors-FULL_UNIVERSE.json');
    symlinkSync(join(outside,'not-yet-written.json'),file);assert.throws(()=>assertShadowRoot(shadow),/SYMLINK/);rmSync(file);
    writeFileSync(join(outside,'baseline.json'),'protected baseline');linkSync(join(outside,'baseline.json'),file);assert.throws(()=>assertShadowRoot(shadow),/HARDLINK/);
    assert.equal(readFileSync(join(outside,'baseline.json'),'utf8'),'protected baseline');
  }finally{rmSync(base,{recursive:true,force:true});}
});
test('unavailable SEC identity source fails the whole scoped request once without fabricated fundamentals', async()=>{
  const fixture=setup();
  try{
    const report=await materializeFundamentals({root:fixture.shadow,tickers:['SCOP','NOSEC'],privateDir:join(fixture.base,'uncached'),asOf:'2024-09-30',allowNetwork:false,maxRetries:0});
    assert.equal(report.counts.NONE,2);assert.equal(report.pipeline,null);assert.equal(report.network.requests,1,'one unavailable shared ticker map must not be requested once per security');
    assert.ok(report.rows.every(row=>row.reason==='SEC_IDENTITY_ACCESS_FAILURE'&&row.pitValid===false&&row.artifacts.length===0));
  }finally{rmSync(fixture.base,{recursive:true,force:true});}
});
test('actual materialized factor states expose technical-only/partial/blockage and never activate disabled full7F', () => {
  const record = (available) => ({ factors: Object.fromEntries(Evidence.FACTOR_ORDER.map((id) => [id, available.includes(id) ? { state: 'AVAILABLE', score: 50 } : { state: 'UNAVAILABLE', score: null, reason: id === 'revisions' ? 'BLOCKED_EXTERNAL' : 'INPUT_NOT_MATERIALIZED' }])) });
  assert.equal(classifyMaterializedFactorRecord(record(['momentum', 'risk'])).quantStatus, 'TECHNICAL_ONLY');
  assert.equal(classifyMaterializedFactorRecord(record(['quality', 'momentum'])).quantStatus, 'PARTIAL');
  assert.equal(classifyMaterializedFactorRecord(record([])).quantStatus, 'BLOCKED');
  assert.equal(classifyMaterializedFactorRecord(record(Evidence.FACTOR_ORDER)).quantStatus, 'PARTIAL', 'methodology publication gate remains closed even if every factor were available');
  assert.equal(classifyMaterializedFactorRecord(record(['momentum']), { refreshedPrice: false }).quantStatus, 'BLOCKED', 'preexisting stale artifact is not a new materialization proof');
});
