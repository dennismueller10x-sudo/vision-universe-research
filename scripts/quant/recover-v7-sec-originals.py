#!/usr/bin/env python3
"""Bounded source PoC using existing SEC client; 8 accession cap, 80 MiB, no product writes."""
import argparse,datetime,hashlib,json,pathlib,sys,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient,DiskCache,RateLimiter
parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--fetch',action='store_true');args=parser.parse_args();out=pathlib.Path(args.out).resolve()
if out==ROOT or ROOT in out.parents:raise SystemExit('PRIVATE_OUTPUT_REQUIRED')
out.mkdir(parents=True,exist_ok=True,mode=0o700)
client=SECHttpClient(cache=DiskCache(out/'http-cache'),rate_limiter=RateLimiter(2,1),max_retries=0)
plans=[]
for ticker in ['JPM','MSFT','NVDA','XOM']:
 bundle=json.loads((ROOT/f'quant/data/sec/inspector/{ticker}.json').read_text());rows=bundle['rows']
 rows=[r for r in rows if r['metric'] in ['revenue','operating_income'] and r.get('available') and r.get('accession') and r.get('fiscal_period')=='FY' and r.get('quality')=='HIGH' and not r.get('flags') and r.get('transformation')=='AS_REPORTED']
 accs=sorted(set(r['accession'] for r in rows),key=lambda a:min(r['available_from'] for r in rows if r['accession']==a)); chosen=list(dict.fromkeys([accs[0],accs[-1]]))
 for acc in chosen:plans.append(dict(ticker=ticker,cik=str(int(bundle['profile']['cik'])),accession=acc,rows=[r for r in rows if r['accession']==acc]))
assert len(plans)<=8
ns={'x':'http://www.xbrl.org/2003/instance'};total=0;results=[]
for plan in plans:
 acc=plan['accession'];cik=plan['cik'];base=f'https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace("-","")}/';folder=out/acc;folder.mkdir(exist_ok=True,mode=0o700)
 try:
  if args.fetch:index=client.get_json(base+'index.json');(folder/'index.json').write_text(json.dumps(index))
  else:index=json.loads((folder/'index.json').read_text())
  files=[r for r in index['directory']['item'] if r['name'].endswith('.xml') and not r['name'].lower().startswith('filingsummary') and not r['name'].endswith(('_cal.xml','_def.xml','_lab.xml','_pre.xml'))]
  assert len(files)==1,[(r['name'],r.get('size')) for r in files]
  file=files[0];size=int(file.get('size') or 0);assert 0<size<=32*1024*1024 and total+size<=80*1024*1024,'SOURCE_BYTE_BUDGET'
  raw=client.get_bytes(base+file['name']) if args.fetch else (folder/file['name']).read_bytes();total+=len(raw);assert len(raw)<=size+1024 and total<=80*1024*1024
  (folder/file['name']).write_bytes(raw);root=ET.fromstring(raw);contexts={c.attrib['id']:c for c in root.findall('x:context',ns)};checks=[]
  for row in plan['rows']:
   values=[]
   for f in root:
    if f.tag.split('}')[-1]!=row['concept'].split(':')[-1] or not f.attrib.get('contextRef'):continue
    c=contexts[f.attrib['contextRef']];period=c.find('x:period',ns)
    if any(e.tag.endswith(('explicitMember','typedMember')) for e in c.iter()):continue
    start=period.find('x:startDate',ns);end=period.find('x:endDate',ns)
    if start is not None and end is not None and start.text==row.get('period_start') and end.text==row['period_end']:
     unit=root.find("x:unit[@id='%s']/x:measure"%f.attrib['unitRef'],ns)
     if unit is not None and unit.text.split(':')[-1].upper()==row['unit']:values.append(float(f.text))
   state='MATCH' if values and all(v==row['value'] for v in values) else 'MISSING_OR_CONFLICTING'
   checks.append(dict(metric=row['metric'],periodStart=row['period_start'],periodEnd=row['period_end'],storedValue=row['value'],originalValues=sorted(set(values)),availableFrom=row['available_from'],state=state))
  results.append(dict(ticker=plan['ticker'],accession=acc,url=base+file['name'],sourceHash=hashlib.sha256(raw).hexdigest(),bytes=len(raw),checks=checks,state='MATCH' if all(c['state']=='MATCH' for c in checks) else 'REVIEW'))
 except Exception as e:results.append(dict(ticker=plan['ticker'],accession=acc,state='UNRESOLVED',reason=str(e)))
report=dict(schemaVersion='v7-sec-original-poc-1',createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),client='existing SECHttpClient; configured default declaring contact',requestStats=client.stats,maxAccessions=8,maxBytes=80*1024*1024,bytes=total,results=results,scope='Original facts for earliest/latest stored annual accessions of four selected issuers. Not complete first-filing vintage coverage, no new market universe.',productionApproved=False)
(out/'original-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(accessions=len(results),matching=sum(r['state']=='MATCH' for r in results),requests=client.stats['requests'],bytes=total)))
