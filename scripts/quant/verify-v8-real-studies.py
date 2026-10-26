#!/usr/bin/env python3
"""Independent Python formulas and complete role assignment, no JS engine imports."""
import json, sys, pathlib, math, hashlib, datetime
out=pathlib.Path(sys.argv[1]); checks=[]
def load(name): return json.loads((out/(name+'.json')).read_text())
def hash_(x): return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def near(a,b): assert math.isclose(a,b,rel_tol=2e-10,abs_tol=1e-10),(a,b)
def day(s): return datetime.date.fromisoformat(s[:10])
observations=load('observations'); lookup={r['id']:r for r in observations}
for mode in ['ROLLING','EXPANDING']:
 x=load('wf-'+mode+'-input'); cfg=x['config']; partition=load('wf-'+mode+'-partition'); result=load('wf-'+mode+'-result'); models=load('wf-'+mode+'-models'); calendar=cfg['calendar']; all_test=[]; values=[]
 for i,p in enumerate(range(cfg['trainSize']+cfg['validationSize'],len(calendar)-cfg['testSize']+1,cfg['stepSize'])):
  f=partition['folds'][i]; start=0 if mode=='EXPANDING' else p-cfg['validationSize']-cfg['trainSize']; bounds={'train':[calendar[start],calendar[p-cfg['validationSize']-1]],'validation':[calendar[p-cfg['validationSize']],calendar[p-1]],'test':[calendar[p],calendar[p+cfg['testSize']-1]]}
  for role in bounds: assert [s[:10] for s in f['bounds'][role]]==bounds[role]
  by=lambda role: sorted([e for e in x['events'] if bounds[role][0]<=e['decisionAt']<=bounds[role][1]],key=lambda e:(e['decisionAt'],e['id']))
  for role in bounds:
   cutoff=bounds['validation'][0] if role=='train' else bounds['test'][0] if role=='validation' else cfg['asOf']; protected=by('validation')+by('test') if role=='train' else by('test') if role=='validation' else []; eligible=[]; excluded=[]
   for e in by(role):
    reason=None
    if e['decisionAt']>cfg['asOf'] or e['availableAt']>e['decisionAt']: reason='INPUT_NOT_AVAILABLE_AT_DECISION'
    elif e['outcomeAvailableAt'] is None: reason='OUTCOME_UNKNOWN'
    elif e['outcomeAvailableAt']>cfg['asOf'] or (e['outcomeAvailableAt']>cutoff if role=='test' else e['outcomeAvailableAt']>=cutoff): reason='OUTCOME_NOT_MATURE_AT_CUTOFF'
    elif role!='test' and day(e['outcomeAvailableAt'])+datetime.timedelta(days=cfg['embargoDays'])>=day(cutoff): reason='EMBARGO'
    elif any(e['informationStart']<=t['outcomeEnd'] and t['informationStart']<=e['outcomeEnd'] for t in protected): reason='PURGED_INFORMATION_OUTCOME_OVERLAP'
    if reason: excluded.append(dict(id=e['id'],role=role,reason=reason))
    else: eligible.append(e['id'])
   assert eligible==f[role]
   assert excluded==[e for e in f['excluded'] if e['role']==role]
  train=[lookup[z] for z in f['train']]; val=[lookup[z] for z in f['validation']]; test=[lookup[z] for z in f['test']]; assert train and val and test
  candidates=['CASH']
  for rule in ['MOMENTUM_IMPROVED','MOMENTUM_DETERIORATED','TREND_UP','TREND_DOWN','NEW_52W_HIGH']:
   t=[z['value'] for z in train if z['ruleId']==rule]
   if t and sum(t)/len(t)>0:candidates.append(rule)
  scores={rule:sum(z['value'] if z['ruleId']==rule else 0 for z in val)/len(val) for rule in candidates}; selected=sorted(scores,key=lambda rule:(-scores[rule],rule))[0]
  assert models[i]['fitted']==dict(candidates=candidates);assert models[i]['selected']==dict(rule=selected)
  assert result['folds'][i]['trainN']==len(train); assert result['folds'][i]['validationN']==len(val); assert result['folds'][i]['testN']==len(test)
  all_test+=f['test']; values += [dict(id=z['id'],value=z['value'] if z['ruleId']==selected else 0) for z in test]
 assert len(all_test)==len(set(all_test)); assert len(result['aggregate']['rows'])==len(values)
 for a,b in zip(result['aggregate']['rows'],values): assert a['id']==b['id'];near(a['value'],b['value'])
 near(result['aggregate']['mean'],sum(z['value'] for z in values)/len(values)); checks.append(dict(id='FULL_WF_'+mode,folds=len(partition['folds']),testOpportunities=len(values),state='PASS'))
x=load('regime-input'); labels=load('regime-labels')['regimes']; bars=x['bars']; lb=x['lookbackBars']; vl=x['volatilityLookbackBars']; assert len(labels)==len(bars)-max(lb,vl)
for k in range(max(lb,vl),len(bars)):
 r=labels[k-max(lb,vl)];trend=bars[k]['close']/bars[k-lb]['close']-1;returns=[bars[j]['close']/bars[j-1]['close']-1 for j in range(k-vl+1,k+1)];mean=sum(returns)/vl;vol=(sum((z-mean)**2 for z in returns)/(vl-1)*x['annualization'])**0.5
 near(r['trendReturn'],trend);near(r['volatility'],vol);assert r['date']==bars[k]['date'];assert r['state']==('POSITIVE_TREND' if trend>x['trendBand'] else 'NEGATIVE_TREND' if trend< -x['trendBand'] else 'SIDEWAYS'); assert r['volatilityState']==('HIGH_VOLATILITY' if vol>=x['volatilityThreshold'] else 'LOW_VOLATILITY')
checks.append(dict(id='ALL_DAILY_REGIME_LABELS',labels=len(labels),state='PASS'))
events=[e for e in load('signal-result')['events'] if e['completed']]
for axis in ['state','volatilityState']:
 expected=[];by_date={}
 for r in labels:
  if not expected or expected[-1]['state']!=r[axis]: expected.append(dict(id=len(expected),state=r[axis],from_=r['date'],to=r['date'],bars=0,events=0,values=[]))
  q=expected[-1];q['to']=r['date'];q['bars']+=1;by_date[r['date']]=q
 for e in events:
  if e['signalDate'] in by_date:q=by_date[e['signalDate']];q['events']+=1;q['values'].append(e['netReturn'])
 actual=load('regime-'+axis+'-episodes');assert len(expected)==len(actual)
 for a,b in zip(expected,actual):
  assert all(a[k]==b[k] for k in ['id','state','to','bars','events']);assert a['from_']==b['from']
  if a['values']: near(sum(a['values'])/len(a['values']),b['meanNetReturn'])
  else: assert b['meanNetReturn'] is None
 grouped=load('regime-'+axis+'-result');assert len(grouped['unmatched'])==sum(e['signalDate'] not in by_date for e in events)
 for state in grouped['states']: assert sum(e['events'] for e in expected if e['state']==state['state'])==state['statistics']['n']
 checks.append(dict(id='COMPLETE_REGIME_EPISODES_'+axis,episodes=len(actual),state='PASS'))
if (out/'original-events-result.json').exists():
 x=load('original-events-input'); r=load('original-events-result'); headers=load('sec-header-input'); known={z['ticker']+':'+z['accession']:z for z in headers['results']}; count=0
 for e in r['events']:
  h=known[e['eventId']];assert h['state']=='MATCH' and h['accessionIdentity'];src=next(z for z in x['events'] if z['eventId']==e['eventId']);assert src['availableAt']==h['acceptanceUtc']
  listing=next(z for z in x['listings'] if z['listingId']==e['listingId']);bars=listing['bars'];index=next(i for i,b in enumerate(bars) if b['closeAt']>h['acceptanceUtc']);assert e['entryDate']==bars[index]['date'];assert e['exitDate']==bars[index+x['horizonBars']]['date'];side=(x['costs']['feeBps']+x['costs']['slippageBps'])/10000;near(e['netReturn'],bars[index+x['horizonBars']]['close']/bars[index]['close']*(1-side)/(1+side)-1);count+=1
  # Close time independently via Python zoneinfo, on the observed date.
  from zoneinfo import ZoneInfo
  date=e['entryDate'];close=datetime.datetime.fromisoformat(date+'T16:00:00').replace(tzinfo=ZoneInfo('America/New_York')).astimezone(datetime.timezone.utc).isoformat().replace('+00:00','.000Z');assert bars[index]['closeAt']==close
 assert count==4
 checks.append(dict(id='ORIGINAL_SEC_DAILY_EVENT_TIMING_AND_NET_OUTCOMES',events=count,state='PASS'))
if (out/'original-weekly-events-result.json').exists():
 x=load('original-weekly-events-input'); r=load('original-weekly-events-result'); headers=load('sec-header-input'); known={z['ticker']+':'+z['accession']:z for z in headers['results']}; count=0
 assert len(x['events'])==len(headers['results'])==12
 for e in r['events']:
  h=known[e['eventId']];assert h['state']=='MATCH' and h['accessionIdentity'];src=next(z for z in x['events'] if z['eventId']==e['eventId']);assert src['availableAt']==h['acceptanceUtc']
  bars=next(z for z in x['listings'] if z['listingId']==e['listingId'])['bars'];index=next(i for i,b in enumerate(bars) if b['date']>h['acceptanceUtc'][:10]);assert e['entryDate']==bars[index]['date'];assert e['exitDate']==bars[index+x['horizonBars']]['date']
  side=(x['costs']['feeBps']+x['costs']['slippageBps'])/10000;near(e['netReturn'],bars[index+x['horizonBars']]['close']/bars[index]['close']*(1-side)/(1+side)-1);count+=1
 assert count==12;checks.append(dict(id='ORIGINAL_SEC_WEEKLY_EVENT_DATE_AND_NET_OUTCOMES',events=count,state='PASS'))
report=dict(schemaVersion='v8-independent-real-parity-1.1.0',checks=checks,referenceSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),artifactHashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.glob('*.json')) if p.name!='independent-validation.json'},source='Independent Python; no engine import',scope='Arithmetic and method execution parity only; no untouched predictive confirmation',productionApproved=False)
(out/'independent-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
