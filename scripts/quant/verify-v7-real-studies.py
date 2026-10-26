#!/usr/bin/env python3
"""Independent observed-data arithmetic. No engine import, no predictive independence claim."""
import json, math, sys, pathlib, hashlib, subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(sys.argv[1]); checks=[]
def load(p): return json.loads(p.read_text())
def near(a,b): assert math.isclose(a,b,rel_tol=2e-10,abs_tol=1e-9),(a,b)
def detect(c,r,i):
 if r.startswith('MOMENTUM'):
  a,b=c[i]/c[i-26]-1,c[i-1]/c[i-27]-1
  return a>=0 and b<0 if r.endswith('IMPROVED') else a<0 and b>=0
 if r.startswith('TREND'):
  a,b=sum(c[i-39:i+1])/40,sum(c[i-40:i])/40
  return c[i]>=a and c[i-1]<b if r.endswith('UP') else c[i]<a and c[i-1]>=b
 return c[i]>max(c[i-52:i]) and not c[i-1]>max(c[i-53:i-1])
for p in sorted(OUT.glob('V7-*-input.json')):
 x=load(p); r=load(p.with_name(p.name.replace('-input','-result'))); count=0
 if 'listings' in x and 'events' in r:
  bars={l['listingId']:{b['date']:b['close'] for b in l['bars']} for l in x['listings']}
  bench={b['date']:b['close'] for b in x.get('benchmark',{}).get('bars',[])}
  for e in r['events']:
   if not e['completed']: continue
   b=bars[e['listingId']]; a,z=b[e['entryDate']],b[e['exitDate']]; side=(x['costs']['feeBps']+x['costs']['slippageBps'])/10000
   near(e['grossReturn'],z/a-1); near(e['netReturn'],z/a*(1-side)/(1+side)-1)
   peak=a;dd=0
   for d,v in b.items():
    if e['entryDate']<=d<=e['exitDate']: peak=max(peak,v);dd=min(dd,v/peak-1)
   near(e['maxDrawdown'],dd)
   if e['benchmarkReturn'] is not None:near(e['benchmarkReturn'],bench[e['exitDate']]/bench[e['entryDate']]-1)
   assert e['entryDate']>e['signalDate'];count+=1
  if r['kind']=='SIGNAL_BACKTEST':
   expected=[]
   for l in x['listings']:
    c=[b['close'] for b in l['bars']]
    for rule in r['rules']:
     last=-100000
     for i in range(53,len(c)):
      if detect(c,rule['id'],i):
       if i-last>=13:expected.append((l['listingId'],rule['id'],l['bars'][i]['date']))
       last=i
   assert expected==[(e['listingId'],e['ruleId'],e['signalDate']) for e in r['events']]
  checks.append(dict(id=p.stem,observedOutcomes=count,state='PASS'))
 elif r.get('conditionalPriceSimulation'):
  prices={l['listingId']:{b['date']:b['close'] for b in l['bars']} for l in x['listings']};cash=x['initialCapital'];units={};side=(x['costs']['feeBps']+x['costs']['slippageBps'])/10000;targets={t['executionDate']:t for t in x['targets']}
  for row in r['equity']:
   d=row['date'];before=cash+sum(u*prices[k][d] for k,u in units.items())
   if d in targets:
    weights=targets[d]['weights'];current={k:units.get(k,0)*prices[k][d] for k in prices}
    lo,hi=0,before
    for _ in range(100):
     v=(lo+hi)/2;f=v+side*sum(abs(weights.get(k,0)*v-current[k]) for k in prices)-before
     if f>0:hi=v
     else:lo=v
    value=(lo+hi)/2;units={k:w*value/prices[k][d] for k,w in weights.items()};cash=value*(1-sum(weights.values()))
   near(row['value'],cash+sum(u*prices[k][d] for k,u in units.items()));near(row['cash'],cash)
   for position in row['positions']:near(position['units'],units[position['listingId']])
  near(r['endCapital'],row['value']);checks.append(dict(id=p.stem,equityPoints=len(r['equity']),state='PASS'))
 elif r.get('kind')=='WALK_FORWARD_PARTITION':
  events={e['id']:e for e in x['events']};test=[]
  for fold in r['folds']:
   test+=fold['test']
   for role in ['train','validation','test']:
    for ident in fold[role]:
     e=events[ident];assert e['outcomeAvailableAt']<=x['config']['asOf'];assert fold['bounds'][role][0][:10]<=e['decisionAt']<=fold['bounds'][role][1][:10]
     if role!='test':
      protected=fold['validation']+fold['test'] if role=='train' else fold['test']
      for other in protected:
       t=events[other];assert e['outcomeEnd']<t['informationStart'] or t['outcomeEnd']<e['informationStart']
  assert len(test)==len(set(test));checks.append(dict(id=p.stem,folds=len(r['folds']),state='PASS'))
 elif r.get('kind')=='OOS_AGGREGATE':
  obs={o['id']:o['value'] for o in x['observations']};ids=[i for f in x['partition']['folds'] for i in f['test']];assert r['n']==len(ids)
  if ids:near(r['mean'],sum(obs[i] for i in ids)/len(ids))
  checks.append(dict(id=p.stem,state='PASS'))
 elif p.name.startswith('V7-MC-'):
  result=subprocess.run([sys.executable,str(ROOT/'scripts/quant/verify-research-monte-carlo.py'),str(p),str(p.with_name(p.name.replace('-input','-result')))],capture_output=True,text=True)
  assert result.returncode==0,result.stdout+result.stderr
  checks.append(dict(id=p.stem,state='PASS',referenceOutput=result.stdout))
report=dict(schemaVersion='v7-independent-calculation-1',checks=checks,state='PASS',limitation='Same historical inputs; calculation parity only. No independent forecasting evidence.')
(OUT/'independent-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(state='PASS',checks=len(checks))))
