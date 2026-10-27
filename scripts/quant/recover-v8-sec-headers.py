#!/usr/bin/env python3
"""Bounded original acceptance audit. Raw SEC prefixes stay in private output only."""
import argparse,datetime,hashlib,json,pathlib,re,sys,zoneinfo,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient,DiskCache,RateLimiter

def plan():
    result=[]
    for ticker in ['JPM','MSFT','NVDA','XOM']:
        bundle=json.loads((ROOT/f'quant/data/sec/inspector/{ticker}.json').read_text())
        rows=[r for r in bundle['rows'] if r.get('available') and r.get('accession') and r.get('available_from')]
        accs=sorted({r['accession'] for r in rows},key=lambda a:min(r['available_from'] for r in rows if r['accession']==a))
        for acc in dict.fromkeys([accs[0],accs[len(accs)//2],accs[-1]]):
            chosen=[r for r in rows if r['accession']==acc]
            result.append(dict(ticker=ticker,cik=str(int(bundle['profile']['cik'])),accession=acc,availableFrom=sorted({r['available_from'] for r in chosen}),storedRows=len(chosen)))
    return result

def audit(raw, item):
    prefix=raw.decode('utf8',errors='replace')
    found=re.search(r'<ACCEPTANCE-DATETIME>(\d{14})',prefix)
    if not found:return dict(state='HEADER_NOT_FOUND')
    eastern=datetime.datetime.strptime(found.group(1),'%Y%m%d%H%M%S').replace(tzinfo=zoneinfo.ZoneInfo('America/New_York'))
    utc=eastern.astimezone(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
    accession=re.search(r'ACCESSION NUMBER:\s*([0-9-]+)',prefix)
    identity=accession is not None and accession.group(1)==item['accession']
    return dict(state='MATCH' if identity and item['availableFrom']==[utc] else 'CONFLICT',acceptanceUtc=utc,rawEastern=found.group(1),accessionIdentity=identity,
        meaning='SEC acceptance only; company publication time not established')

class PrefixClient(SECHttpClient):
    # EDGAR may ignore Range. Read and close a fixed prefix; never buffer its full body.
    # A distinct cache key ensures a prefix cannot masquerade as a full response.
    def _urlopen(self,url,headers,timeout):
        request=urllib.request.Request(url.removesuffix('#v8-prefix-65536'),headers={k:v for k,v in headers.items() if k.lower()!='accept-encoding'})
        with urllib.request.urlopen(request,timeout=timeout) as response:
            return response.read(65536)

def main():
    p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--fetch',action='store_true');args=p.parse_args();out=pathlib.Path(args.out).resolve()
    if out==ROOT or ROOT in out.parents:raise SystemExit('PRIVATE_OUTPUT_REQUIRED')
    out.mkdir(parents=True,exist_ok=True,mode=0o700)
    client=PrefixClient(cache=DiskCache(out/'http-cache'),rate_limiter=RateLimiter(2,1),max_retries=0)
    results=[];total=0
    for item in plan():
        url=f'https://www.sec.gov/Archives/edgar/data/{item["cik"]}/{item["accession"].replace("-","")}/{item["accession"]}.txt'
        target=out/(item['accession']+'.prefix');result=dict(item,url=url)
        try:
            raw,_=(client.get_bytes(url+'#v8-prefix-65536'),None) if args.fetch else (target.read_bytes(),None)
            if len(raw)>65536:raise ValueError('PREFIX_BUDGET')
            target.write_bytes(raw);target.chmod(0o600);total+=len(raw)
            result.update(audit(raw,item),sourceHash=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
        except Exception as e:result.update(state='UNRESOLVED',reason=str(e))
        results.append(result)
    report=dict(schemaVersion='v8-sec-acceptance-1',planHash=hashlib.sha256(json.dumps(plan(),sort_keys=True).encode()).hexdigest(),codeHash=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),results=results,requestStats=client.stats,maxRequests=12,maxBytes=12*65536,bytes=total,productionApproved=False,scope='Twelve deterministic earliest/middle/latest stored accessions of four preselected surviving issuers; not earnings timestamps or untouched evidence.')
    (out/'acceptance-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(matched=sum(r['state']=='MATCH' for r in results),unresolved=sum(r['state']=='UNRESOLVED' for r in results),bytes=total,requests=client.stats['requests'])))
if __name__=='__main__':main()
