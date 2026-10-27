#!/usr/bin/env python3
"""Conditional simulation diagnostics; ESS is descriptive, never eligibility evidence."""
import bisect, importlib.util, json, math, pathlib, sys
p=pathlib.Path(sys.argv[1]); spec=importlib.util.spec_from_file_location('mc',pathlib.Path(__file__).with_name('verify-research-monte-carlo.py'));mc=importlib.util.module_from_spec(spec);spec.loader.exec_module(mc)
rows=[];pairs={};dependence={}
for f in sorted(p.glob('V7-MC-*-input.json')):
 x=json.loads(f.read_text());r=json.loads(f.with_name(f.name.replace('-input','-result')).read_text());kind=(x['model'],x.get('blockLength'))
 if kind not in dependence:
  a=[o['return'] for o in x['observations']];n=len(a);mean=sum(a)/n;var=sum((v-mean)**2 for v in a);acf=[sum((a[i]-mean)*(a[i-k]-mean) for i in range(k,n))/var if var else 0 for k in range(1,min(27,n))];tau=1
  # Initial-positive sequence diagnostic. Assumes stationary mean; not a measured independent count.
  for v in acf:
   if v<=0:break
   tau+=2*v
  dependence[kind]=dict(model=kind[0],blockLength=kind[1],n=n,acf=acf,meanEssDiagnostic=n/tau,zeroReturnShare=sum(v==0 for v in a)/n,limitation='Stationarity and covariance truncation assumptions; not guaranteed effective sample size, not tail-quantile ESS')
 metrics,_=mc.reference(x);key=(kind,x['simulations']);pairs.setdefault(key,{})[x['seed']]=metrics
 rows.append(dict(id=f.stem,model=x['model'],blockLength=x.get('blockLength'),simulations=x['simulations'],seed=x['seed'],cdfEpsilon=r['uncertainty']['cdfEpsilon'],distributions=r['distributions']))
comparisons=[]
for (kind,n),seeds in pairs.items():
 a,b=seeds.values();dist={}
 for metric in a:
  aa,bb=sorted(a[metric]),sorted(b[metric]);dist[metric]=max(abs(bisect.bisect_right(aa,v)/n-bisect.bisect_right(bb,v)/n) for v in set(aa+bb))
 threshold=2*math.sqrt(math.log(80)/(2*n))
 comparisons.append(dict(model=kind[0],blockLength=kind[1],simulations=n,cdfDistances=dist,perMetricUnionDkwBound=threshold,withinBound=all(d<=threshold for d in dist.values()),scope='Conditional two-seed Monte Carlo variability; no market/model validation; no across-comparison familywise claim'))
report=dict(schemaVersion='v7-mc-diagnostics-1',dependence=list(dependence.values()),seedComparisons=comparisons,runs=rows,convergence='DKW epsilon shrinks from 0.04295 at 1000 to 0.01358 at 10000; tails can remain unbounded',assumptions=['IID trade resampling is a scenario model, not established exchangeability of 21 trades','Circular bootstrap preserves dependence only within a block; wrap boundary is artificial','4/13/26-week block comparison tests model sensitivity, not optimal block selection','Historical nonstationarity, selection, corporate-action and future-distribution uncertainty remain outside DKW','No forecast, no positive-edge requirement, no product approval'])
(p/'monte-carlo-diagnostics.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(seedComparisons=len(comparisons),allWithinBound=all(c['withinBound'] for c in comparisons))))
