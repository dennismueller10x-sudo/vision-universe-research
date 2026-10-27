#!/usr/bin/env python3
"""Independent stdlib arithmetic reference; private input/output, no provider calls."""
import hashlib,json,math,pathlib,sys,time

def main(directory,root):
 started=time.monotonic();directory=pathlib.Path(directory);root=pathlib.Path(root)
 inp=json.loads((directory/'sensitivity-input.json').read_text());all_results=json.loads((directory/'sensitivity-result.json').read_text());summary=json.loads((directory/'sensitivity-summary.json').read_text())
 checks=0;source_pairs=0
 def near(a,b):
  nonlocal checks
  assert math.isclose(a,b,rel_tol=1e-10,abs_tol=1e-11),(a,b);checks+=1
 prices={}
 for f,sha in summary['sources'].items():
  b=(root/f).read_bytes();assert hashlib.sha256(b).hexdigest()==sha;checks+=1
  if 'discover-series-long' in f:
   d=json.loads(b);print_keys=False
   # Existing source tuples: [date, close] or document bars schema resolved below.
   prices[pathlib.Path(f).stem]=d
 # Validate all raw gross outcomes from original source points.
 parsed={}
 for ident,d in prices.items():
  points=d['points']; parsed[ident]={p[0]:p[1] for p in points}
 for events in inp['events'].values():
  for e in events:
   if not e['completed']:continue
   matches=[ident for ident in parsed if e['listingId'].split(':')[0]==ident]
   if not matches:
    ticker=e['listingId'].split(':')[2];matches=[ident for ident in parsed if ident=='ref_'+ticker]
   assert len(matches)==1,(e['listingId'],list(parsed))
   p=parsed[matches[0]];near(p[e['exitDate']]/p[e['entryDate']]-1,e['grossReturn']);source_pairs+=1
 def reference(config,rows,actual):
  dates=config['calendar'];indices={d:i for i,d in enumerate(dates)};length=len(dates)
  sums=[0.0]*length;counts=[0]*length
  for r in rows:
   i=indices[r['date']];sums[i]+=r['value'];counts[i]+=1
  mean=sum(sums)/len(rows);near(mean,actual['estimate'])
  pref=[0.0];cnt=[0]
  for i in range(2*length):pref.append(pref[-1]+sums[i%length]);cnt.append(cnt[-1]+counts[i%length])
  state=config['seed'];bootstrap=[];L=config['blockLength']
  for _ in range(config['replicates']):
   total=0.;n=0
   for used in range(0,length,L):
    state^=(state<<13)&0xffffffff;state^=state>>17;state^=(state<<5)&0xffffffff;state&=0xffffffff
    start=(state*length)//4294967296;end=start+min(L,length-used)
    total+=pref[end]-pref[start];n+=cnt[end]-cnt[start]
   assert n>0;bootstrap.append(total/n)
  for a,b in zip(bootstrap,actual['bootstrap']):near(a,b)
  ordered=sorted(bootstrap)
  def q(p):
   k=(len(ordered)-1)*p;i=math.floor(k);return ordered[i]+(ordered[min(i+1,len(ordered)-1)]-ordered[i])*(k-i)
  near(2*mean-q(1-config['alpha']/2),actual['ci'][0]);near(2*mean-q(config['alpha']/2),actual['ci'][1])
  p=(1+sum(abs(x-mean)>=abs(mean) for x in bootstrap))/(len(bootstrap)+1);near(p,actual['pValue']);return p
 pvalues=[]
 for short,long in zip(all_results['inferenceResults'],all_results['robustness']):
  par=short['parameters'];side=(par['feeBps']+par['slippageBps'])/10000
  rows=[{'date':e['signalDate'],'value':(1+e['grossReturn'])*(1-side)/(1+side)-1} for e in inp['events'][str(par['horizonBars'])+':'+str(par['entryDelayBars'])] if e['completed']]
  pvalues.append(reference(short['result']['config'],rows,short['result']));reference(long['result']['config'],rows,long['result'])
 adjusted=[0.]*len(pvalues);prev=0.
 for rank,i in enumerate(sorted(range(len(pvalues)),key=lambda i:(pvalues[i],i))):
  prev=max(prev,min(1.,(len(pvalues)-rank)*pvalues[i]));adjusted[i]=prev
 for row,p in zip(all_results['result']['rows'],adjusted):near(p,row['adjustedPValue']);assert row['reject']==(p<=.05)
 dims=all_results['registration']['specification']['dimensions'];baseline=all_results['registration']['specification']['baseline'];rows=all_results['result']['rows']
 neigh=[r for r in rows if sum(abs(dims[k].index(r['parameters'][k])-dims[k].index(baseline[k])) for k in dims)==1]
 assert len(neigh)==all_results['result']['neighborhood']['count'];checks+=1
 near(min(r['estimate'] for r in neigh),all_results['result']['neighborhood']['minEstimate']);near(max(r['estimate'] for r in neigh),all_results['result']['neighborhood']['maxEstimate'])
 report={'state':'PASS','reference':'Python stdlib independent source-price, circular-block RNG, pooled ratio, centered p, basic interval, Holm and neighborhood arithmetic','comparisons':checks,'sourcePriceOutcomePairs':source_pairs,'gridPoints':len(pvalues),'bootstrapDesigns':2*len(pvalues),'seconds':time.monotonic()-started,'independentTradingEvidence':False,'inputSha256':hashlib.sha256((directory/'sensitivity-input.json').read_bytes()).hexdigest(),'resultSha256':hashlib.sha256((directory/'sensitivity-result.json').read_bytes()).hexdigest(),'referenceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()}
 (directory/'sensitivity-independent-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main(sys.argv[1],sys.argv[2])
