import json,csv,re,unicodedata,hashlib
from pathlib import Path
D=Path(__file__).parent;refs=json.loads((D/'top_europe_reference.json').read_text())['companies'];bridge=json.loads((D/'tiingo_europe_adr_bridge.json').read_text());approved={r['company']:r['usBridge']['symbol'] for r in bridge['companies'] if r['usBridge']}
def norm(s):
 s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
 s=re.split(r'\b(common|ordinary|american|adr|ads|preferred|depositary|sponsored|unsponsored|class|rights|warrants)\b| - ',s)[0]
 s=re.sub(r'\b(international|holding|holdings|group|incorporated|corporation|corp|inc|limited|ltd|plc|ag|sa|se|nv|oyj|ab|spa|company|co)\b','',s)
 return re.sub('[^a-z0-9]','',s)
directory=[];sources=[]
for file,sc in [('nasdaqlisted.txt','Symbol'),('otherlisted.txt','ACT Symbol')]:
 path=D.parent/'global'/file;sources.append({'source':'https://www.nasdaqtrader.com/dynamic/SymDir/'+file,'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 for r in csv.DictReader(path.open(),delimiter='|'):
  if r.get('ETF')=='N' and r.get('Test Issue')=='N':directory.append({'symbol':r[sc],'name':r['Security Name'],'norm':norm(r['Security Name'])})
collision_reasons={'Castellum':'Swedish real-estate issuer differs from US Castellum defense issuer.','EQT':'Swedish private-equity manager differs from US EQT gas producer.','Grainger':'UK residential property issuer differs from US W.W. Grainger.','Domino\'s Pizza':'UK franchise issuer differs from US Domino\'s Pizza parent.','Leonardo':'Italian parent differs from US-listed Leonardo DRS subsidiary.','Merck':'German Merck KGaA differs from US Merck & Co.','Compass Group':'UK caterer differs from US Compass real estate company.','NN Group':'Dutch insurer differs from NN Inc US industrial supplier.','Orion':'Finnish pharmaceutical issuer differs from US Orion construction issuer.','Pershing Square Holdings':'Listed closed-end investment company differs from US management company and PSUS fund.','Wise':'Current Wise Group plc US identity must be checked by metadata; name is a candidate, not sufficient alone.'}
review=[]
for r in refs:
 z=norm(r['company']);hits=[d for d in directory if d['norm']==z or (min(len(z),len(d['norm']))>=6 and min(len(z),len(d['norm']))/max(len(z),len(d['norm']))>.6 and (z.startswith(d['norm']) or d['norm'].startswith(z)))]
 if hits or r['company'] in approved:
  review.append({'companyId':r['companyId'],'company':r['company'],'curatedMatchedSymbol':approved.get(r['company']),'officialDirectoryCandidates':[{k:v for k,v in d.items() if k!='norm'} for d in hits],'reviewStatus':'MATCH_PENDING_ACCOUNT_IDENTITY_AND_EOD' if r['company'] in approved else 'REJECTED_NAME_COLLISION_OR_DISTINCT_ISSUER','reason':collision_reasons.get(r['company'],'Curated issuer mapping accepted for probe only; legal form remains unverified.' if r['company'] in approved else 'Prefix or fuzzy name is insufficient issuer identity; not included in coverage.')})
out={'asOf':'2026-10-02','directorySources':sources,'primaryDirectoryNonEtfNonTestRows':len(directory),'referenceCompanies':len(refs),'methodology':'Scan entire official US primary listing directories against every reference company and aliases; exact legal-name-normalized and long-prefix matches reviewed, then augment known issuer ADR aliases (e.g Ericsson, SAP). No ticker equality identity assumption. Unmatched renamed companies remain unresolved.','coverageMetricInterpretation':'Verified matched names produce an evidence-backed lower bound; reference table contains stale entries and matching is not an authoritative ADR directory. Do not present unmatched count as proven absence of every possible US listing.','reviews':review}
(D/'europe_us_listing_match_review.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
print('reviews',len(review))
