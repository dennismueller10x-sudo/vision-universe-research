/* Scoped orchestration of the existing SEC ingestion/canonical/consumer
 * producers. Every write lands in a caller-supplied isolated shadow/cache. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, lstatSync, readdirSync } from 'node:fs';
import { dirname, resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function assertShadowRoot(root) {
  const full = realpathSync(root);
  if (full === realpathSync(SOURCE_ROOT)) throw new Error('SHADOW_ROOT_REQUIRED');
  // Existing producers write leaves as well as directories. Check every
  // delivered data destination, including dangling links and file hardlinks,
  // before a producer can follow one into the protected source.
  const check = (path) => {
    let stat;try { stat=lstatSync(path); } catch(error) { if(error.code==='ENOENT')return;throw error; }
    if(stat.isSymbolicLink())throw new Error('SHADOW_DATA_SYMLINK_ESCAPES_ROOT');
    if(stat.isFile()&&stat.nlink>1)throw new Error('SHADOW_DATA_HARDLINK_UNSAFE');
    if(stat.isDirectory())for(const entry of readdirSync(path))check(join(path,entry));
  };
  for (const path of ['quant','discover','screener']) {
    const parent=join(full,path);let stat;try{stat=lstatSync(parent);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(stat.isSymbolicLink())throw new Error('SHADOW_DATA_SYMLINK_ESCAPES_ROOT');
    check(join(parent,'data'));
  }
  return full;
}
export function runExistingProcess(command, args, { cwd, env = {}, onProgress = () => {} } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const receive = (chunk) => { const line = String(chunk); output = (output + line).slice(-24000); onProgress(line); };
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    child.on('error', reject); child.on('close', (code) => done({ code, output }));
  });
}
const SEC_DRIVER = String.raw`
import sys,json,hashlib,logging,urllib.request
from pathlib import Path
config=json.loads(Path(sys.argv[1]).read_text()); root=Path(config['root']); private=Path(config['privateDir'])
sys.path.insert(0,config['sourceScripts'])
from quant.sec.provider import SECProvider,normalize_cik
from quant.sec.http_client import SECHttpClient,DiskCache
from quant.sec.pipeline import IngestionPipeline
from quant.sec.store import JsonRawStore,JsonFactStore,CheckpointStore
from quant.sec.registry import MetricRegistry
from quant.sec.consumer import build_consumer_bundle,summarize_bundle
from quant.sec.canonical import build_company_bundle
from quant.sec import universe_coverage
if not config.get('allowNetwork',True):
 def blocked(*a,**kw): raise RuntimeError('SEC_NETWORK_DISABLED')
 urllib.request.urlopen=blocked
client=SECHttpClient(cache=DiskCache(private/'http-cache',ttl_seconds=None),max_retries=config.get('maxRetries',2))
provider=SECProvider(client); registry=MetricRegistry.load(root/'quant/config/sec-metric-registry.json')
store=JsonFactStore(private/'facts',compress=True)
pipeline=IngestionPipeline(provider=provider,registry=registry,raw_store=JsonRawStore(private/'raw'),fact_store=store,checkpoint=CheckpointStore(private/'state',run_id='tiingo2-scoped'))
report={'schemaVersion':'tiingo2-fundamentals-materialization-1.0.0','asOf':config['asOf'],'scope':config['tickers'],'provider':'sec_edgar','factsSource':'bulk_companyfacts_zip','rows':[],'byTicker':{},'artifacts':[],'pipeline':None,'network':{}}
def write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True); body=(json.dumps(data,separators=(',',':'))+'\n').encode(); path.write_bytes(body)
 return {'path':str(path.relative_to(root)),'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body)}
def failure(entry,code,error=None): return {'ticker':entry['ticker'],'securityId':entry.get('securityId'),'cik':entry.get('cik'),'fundamentalsStatus':'NONE','reason':code,'error':error,'pitValid':False,'artifacts':[]}
resolved=[]
map_error=None
try:
 if config['entries']: provider.try_resolve_ticker(config['entries'][0]['ticker'])
except Exception as exc: map_error=str(exc)
for entry in config['entries']:
 if map_error:
  report['rows'].append(failure(entry,'SEC_IDENTITY_ACCESS_FAILURE',map_error)); continue
 try:
  current=provider.try_resolve_ticker(entry['ticker']); hint=normalize_cik(entry['cik']) if entry.get('cik') else None
  if hint and current and hint!=current: report['rows'].append(failure(entry,'SEC_IDENTITY_CIK_COLLISION')); continue
  cik=current or hint
  if not cik: report['rows'].append(failure(entry,'NO_SEC_CIK')); continue
  submissions=provider.get_submissions(cik); actual=[str(t).upper() for t in submissions.get('tickers',[])]
  if entry['ticker'] not in actual and current is None: report['rows'].append(failure(entry,'SEC_LISTING_IDENTITY_NOT_CONFIRMED')); continue
  resolved.append(dict(entry,cik=cik))
 except Exception as exc: report['rows'].append(failure(entry,'SEC_IDENTITY_ACCESS_FAILURE',str(exc)))
groups={}
for entry in resolved: groups.setdefault(entry['cik'],[]).append(entry)
archive_path=config.get('archive')
try:
 if groups:
  if not archive_path:
   with provider.open_bulk_company_facts(cache_dir=private/'bulk') as archive: archive_path=str(archive.archive_path)
  outcome=pipeline.ingest_universe([{'cik':cik} for cik in groups],bulk=True,bulk_archive=archive_path,resume=True)
  report['pipeline']=outcome['manifest']['run']; failures={r['cik']:r for r in outcome['results'] if r.get('status')=='FAILED'}
  issuers=universe_coverage.load_issuer_shards(root)
  consumer_index_path=root/'quant/data/sec/consumer/index.json'
  consumer_index=json.loads(consumer_index_path.read_text()) if consumer_index_path.exists() else {'schema':'vu-consumer-fundamentals-1.0.0','byTicker':{}}
  canonical_index_path=root/'quant/data/sec/canonical_index.json'
  canonical_index=json.loads(canonical_index_path.read_text()) if canonical_index_path.exists() else {'schema_version':1,'companies':[]}
  canonical_rows={row['ticker']:row for row in canonical_index.get('companies',[]) if row.get('ticker')}
  for cik,entries in groups.items():
   document=store.read_company(cik)
   if not document:
    for entry in entries: report['rows'].append(failure(entry,'SEC_INGEST_FAILED',failures.get(cik,{}).get('error')))
    continue
   payload=pipeline.raw_store.get_latest(cik,'companyfacts')
   existing_path=root/'quant/data/sec/consumer'/('CIK'+cik+'.json')
   previous=json.loads(existing_path.read_text()) if existing_path.exists() else {}
   if previous and normalize_cik(previous.get('cik'))!=cik: raise RuntimeError('CONSUMER_ISSUER_IDENTITY_COLLISION')
   tickers=list(dict.fromkeys(previous.get('tickers',[])+[e['ticker'] for e in entries]))
   security_ids=list(dict.fromkeys(previous.get('securityIds',[])+[e['securityId'] for e in entries]))
   bundle=build_consumer_bundle(cik,payload,registry,as_of=config['asOf'],tickers=tickers,security_ids=security_ids,name=document['profile']['name'],fiscal_year_end_hint=document['profile'].get('fiscal_year_end'),provider=provider) if payload else None
   issuers['iss_cik_'+cik]=universe_coverage.issuer_fundamentals(document,registry)
   if not bundle:
    for entry in entries: report['rows'].append(failure(entry,'NO_PERIODIC_PIT_FACTS'))
    continue
   consumer_artifact=write(root/'quant/data/sec/consumer'/('CIK'+cik+'.json'),bundle)
   summary=summarize_bundle(bundle); core=['revenue','net_income','operating_cash_flow','total_assets','stockholders_equity']
   present=set(bundle['coverage']['annualMetrics'])|set(bundle['coverage']['quarterlyMetrics'])|set(bundle['coverage']['ttmMetrics'])
   status='FULL' if all(m in present for m in core) and summary['h3'] else 'PARTIAL'
   pit=all(row[4] and row[4]<=config['asOf'] and row[5] for scope in ['annual','quarterly'] for series in bundle[scope].values() for row in series)
   for entry in entries:
    canonical=build_company_bundle(document,registry,entry['ticker']); artifact=write(root/'quant/data/sec/canonical'/(entry['ticker']+'.json'),canonical)
    canonical_rows[entry['ticker']]={'ticker':entry['ticker'],'securityId':canonical['security']['securityId'],'cik':cik,'name':canonical['security']['name'],'file':'canonical/'+entry['ticker']+'.json',**{key:canonical['coverage'][key] for key in ['factCount','metricIds','suppressedCells','annualYearsExamined','quarterlyYears']}}
    consumer_index.setdefault('byTicker',{})[entry['ticker']]={'cik':cik,'file':'consumer/CIK'+cik+'.json','annualYears':summary['annualYears'],'quarterly':summary['quarterly'],'ttm':summary['ttm'],'h3':summary['h3'],'h5':summary['h5'],'h10':summary['h10']}
    row={'ticker':entry['ticker'],'securityId':entry['securityId'],'cik':cik,'issuerId':'iss_cik_'+cik,'sic':document['profile'].get('sic'),'fundamentalsStatus':status,'reason':None,'pitValid':bool(pit),'annualYears':summary['annualYears'],'quarterly':summary['quarterly'],'ttm':summary['ttm'],'metrics':summary['metrics'],'metricAvailability':{m:('AVAILABLE' if m in present else 'NOT_REPORTED') for m in core},'artifacts':[consumer_artifact,artifact]}
    report['rows'].append(row); report['byTicker'][entry['ticker']]=row
    print(entry['ticker']+': '+status+' '+str(summary['annualYears'])+' years',flush=True)
  universe_coverage.write_issuer_shards(root,issuers)
  consumer_index.update({'asOf':config['asOf'],'count':len({r.get('cik') for r in consumer_index['byTicker'].values()})}); write(consumer_index_path,consumer_index)
  canonical_index['companies']=list(canonical_rows.values()); write(canonical_index_path,canonical_index)
except Exception as exc:
 done={r['ticker'] for r in report['rows']}
 for entry in resolved:
  if entry['ticker'] not in done: report['rows'].append(failure(entry,'SEC_BULK_ACCESS_OR_MATERIALIZATION_FAILURE',str(exc)))
report['rows'].sort(key=lambda r:r['ticker']); report['counts']={state:sum(r['fundamentalsStatus']==state for r in report['rows']) for state in ['FULL','PARTIAL','NONE']}; report['network']=dict(client.stats)
report['canonicalProductionWrites']=0
Path(config['resultFile']).write_text(json.dumps(report,indent=2)+'\n')
`;

export async function materializeFundamentals({ root, tickers, privateDir, asOf, archive = null, allowNetwork = true, maxRetries = 2, onProgress = () => {} }) {
  root = assertShadowRoot(root); privateDir = resolve(privateDir);
  const scope = [...new Set(tickers.map((t) => String(t).toUpperCase()))].sort();
  if (!scope.length || scope.some((t) => !/^[A-Z0-9._-]+$/.test(t)) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '')) throw new Error('INVALID_SEC_SCOPE');
  const names = JSON.parse(readFileSync(join(root, 'quant/data/market/security-master/company-names.json'))).rows ?? [];
  const byTicker = new Map(names.map((row) => [row.ticker, row]));
  const entries = scope.map((ticker) => { const row = byTicker.get(ticker); if (!row?.securityId) throw new Error('CANONICAL_MEMBER_REQUIRED:' + ticker); return { ticker, securityId: row.securityId, cik: row.cik ?? null }; });
  mkdirSync(privateDir, { recursive: true });
  const resultFile = join(privateDir, 'fundamentals-report.json'), configFile = join(privateDir, 'fundamentals-request.json');
  const config = { root, tickers: scope, entries, privateDir, asOf, archive, allowNetwork, maxRetries, resultFile, sourceScripts: join(SOURCE_ROOT, 'scripts') };
  writeFileSync(configFile, JSON.stringify(config));
  const processResult = await runExistingProcess('python3', ['-c', SEC_DRIVER, configFile], { cwd: root, onProgress });
  if (processResult.code !== 0 || !existsSync(resultFile)) throw new Error('SEC_EXISTING_PRODUCERS_FAILED:' + processResult.output.slice(-3000));
  const report = JSON.parse(readFileSync(resultFile));
  report.reportPath = resultFile; report.reportSha256 = createHash('sha256').update(readFileSync(resultFile)).digest('hex');
  return report;
}
