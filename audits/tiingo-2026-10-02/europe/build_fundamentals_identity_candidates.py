"""Join real-account fundamentals identities to references, never infer EOD access."""
import json,unicodedata,re,collections,argparse
from pathlib import Path
D=Path(__file__).parent;parser=argparse.ArgumentParser();parser.add_argument('evidence',type=Path);args=parser.parse_args();j=json.loads(args.evidence.read_text());responses=[r for r in j['responses'] if '/fundamentals/meta' in r['url'] and isinstance(r.get('payload'),list) and r.get('status')==200];response=max(responses,key=lambda r:len(r['payload']));fund=response['payload'];by=collections.defaultdict(list)
def norm(s):
 s=unicodedata.normalize('NFKD',s or '').encode('ascii','ignore').decode().lower().replace('.','').replace('groep','group');s=re.sub(r'\b(international|holding|holdings|group|incorporated|corporation|corp|inc|limited|ltd|plc|ag|sa|se|nv|oyj|ab|spa|asa|company|co)\b','',s);return re.sub('[^a-z0-9]','',s)
for r in fund:
 if r.get('isActive'):by[norm(r.get('name'))].append(r)
current_daily_metadata={}
for response in j['responses']:
 payload=response.get('payload')
 if response.get('status')==200 and isinstance(payload,dict) and '/tiingo/daily/' in response.get('url','') and payload.get('ticker'):
  current_daily_metadata[str(payload['ticker']).upper()]={k:payload.get(k) for k in ['ticker','name','exchangeCode','startDate','endDate']}
refs=json.loads((D/'top_europe_reference.json').read_text())['companies'];out=[];reject={'Castellum','Domino\'s Pizza','EQT','Merck','NN Group','Orion','Pershing Square Holdings'}
for r in refs:
 hits=[]
 for a in [r['company']]+r.get('aliases',[]):hits+=by[norm(a)]
 if r['company']=='Golden Ocean Group' and current_daily_metadata.get('GOGL',{}).get('name')=='Corgi GOOGL 2x Daily ETF':
  for candidate in hits:candidate['currentDailyMetadataConflict']=current_daily_metadata['GOGL']
 if hits:out.append({'companyId':r['companyId'],'company':r['company'],'reviewStatus':'REJECTED_DISTINCT_ISSUER_HOMONYM' if r['company'] in reject else ('REJECTED_RECYCLED_SYMBOL_CURRENT_ETF' if r['company']=='Golden Ocean Group' and current_daily_metadata.get('GOGL',{}).get('name')=='Corgi GOOGL 2x Daily ETF' else 'DISCOVERY_ONLY_REQUIRES_LISTING_IDENTITY_AND_EOD_VALIDATION'),'fundamentalIdentityCandidates':list({r['ticker']:r for r in hits}.values())})
(D/'fundamentals_metadata_identity_candidates.json').write_text(json.dumps({'methodology':'Exact normalized issuer name/known alias match against actual account full fundamentals metadata. isActive and isADR are provider-reported attributes with observed stale/ambiguous cases. Not current EOD proof. Reporting currency is not listing trading currency. Homonyms and subsidiary/parent identities require independent review.','providerMetadataResponse':{k:response.get(k) for k in ['url','status','observedAt','sha256']},'providerFundamentalsRecords':len(fund),'referenceMatchedCompaniesIncludingRejectedHomonyms':len(out),'referenceUnmatchedCompanies':len(refs)-len(out),'matches':out},indent=2,ensure_ascii=False)+'\n')
print('matched reference names incl rejected homonyms',len(out))
