"""Independent arithmetic and NEW_52W_HIGH replay; no JS engine imports."""
import json, sys, math
from pathlib import Path
report=json.loads(Path(sys.argv[1]).read_text())
root=Path(__file__).resolve().parents[2]
import hashlib
source_bytes=(root/report['provenance']['sourcePath']).read_bytes()
assert hashlib.sha256(source_bytes).hexdigest()==report['input']['sourceBytesHash']
for field,relative in [('adapterCodeHash','quant/engines/weekly-real-adapter.cjs'),('historyCodeHash','quant/engines/backtest-history.js'),('signalCodeHash','quant/engines/signal-backtest.js'),('executionCodeHash','scripts/quant/run-real-weekly-backtest.cjs')]:
    assert hashlib.sha256((root/relative).read_bytes()).hexdigest()==report['input'][field]
points=json.loads(source_bytes)['points']
points=[p for p in points if p[0]<=report['input']['asOf']]
dates=[p[0] for p in points]; prices=[p[1] for p in points]
last=-10000; events=set()
for i in range(53,len(points)):
    trigger=prices[i]>max(prices[i-52:i]) and not prices[i-1]>max(prices[i-53:i-1])
    if trigger:
        if i-last>=13: events.add(i)
        last=i
cash=100000.; position=None; trades=[]; curve=[]
start=dates.index(report['input']['start'])
for i in range(start,len(points)):
    if position and i==position[0]+26:
        entry,units,capital,signal=position
        gross=units*prices[i]; cash=gross*.997
        trades.append((signal,entry,i,capital,gross,cash)); position=None
    if i-1 in events and i-1>=start and position is None:
        position=(i,cash/prices[i],cash,i-1);cash=0.
    value=position[1]*prices[i] if position else cash
    curve.append(value)
def near(a,b): assert math.isclose(a,b,rel_tol=1e-10,abs_tol=1e-7),(a,b)
assert len(trades)==len(report['trades'])
for t,r in zip(trades,report['trades']):
    signal,entry,exit,capital,gross,net=t
    assert r['signalDate']==dates[signal] and r['entryDate']==dates[entry] and r['exitDate']==dates[exit]
    assert exit-entry==26 and signal+1==entry
    for a,b in [(r['entryPrice'],prices[entry]),(r['exitPrice'],prices[exit]),(r['entryCapital'],capital),(r['netExitValue'],net),(r['fees'],gross*.002),(r['slippage'],gross*.001),(r['netReturn'],net/capital-1)]:near(a,b)
assert len(curve)==len(report['equity'])
for i,(value,row) in enumerate(zip(curve,report['equity'])):
    near(value,row['value']);near(row['benchmark'],100000*prices[start+i]/prices[start])
peak=curve[0];dd=0
for v in curve:peak=max(peak,v);dd=min(dd,v/peak-1)
near(dd,report['metrics']['maxDrawdown']);near(curve[-1]/100000-1,report['metrics']['totalReturn'])
from datetime import date
years=(date.fromisoformat(dates[-1])-date.fromisoformat(dates[start])).days/365.2425
near((curve[-1]/100000)**(1/years)-1,report['metrics']['cagr'])
assert report['history']['earliestEligibleBacktestDate']==dates[53]
assert report['input']['returnBasis']=='PRICE_RETURN' and report['certification']=='NOT_CERTIFIED'
# Output only after every independent check.
result_summary=({'state':'PASS','independentlyCheckedTrades':len(trades),'equityObservations':len(curve),'resultHash':report['resultHash']})

near(sum(t[4]*.002 for t in trades),report['metrics']['fees'])
near(sum(t[4]*.001 for t in trades),report['metrics']['slippage'])
benchmark=[100000*p/prices[start] for p in prices[start:]]
peak=benchmark[0]; worst=0
for value in benchmark: peak=max(peak,value);worst=min(worst,value/peak-1)
near(worst,report['benchmark']['maxDrawdown'])
near(benchmark[-1]/100000-1,report['benchmark']['totalReturn'])
near((benchmark[-1]/100000)**(1/years)-1,report['benchmark']['cagr'])
assert bool(position)==bool(report['openPosition'])
if position: near(position[1]*prices[-1],report['openPosition']['value']);assert not report['openPosition']['completed']

print(json.dumps(result_summary))
