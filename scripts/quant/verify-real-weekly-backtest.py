"""Independent cash-transaction reference; no JavaScript engine imports."""
import hashlib
import json
import math
import sys
from datetime import date
from pathlib import Path

def verify(report, root):
    def near(a, b):
        assert math.isclose(a, b, rel_tol=1e-10, abs_tol=1e-7), (a, b)
    source_bytes = (root / report['provenance']['sourcePath']).read_bytes()
    assert hashlib.sha256(source_bytes).hexdigest() == report['input']['sourceBytesHash']
    for field, relative in [('corporateActionCodeHash','quant/engines/corporate-action-evidence.js'),('adapterCodeHash','quant/engines/weekly-real-adapter.cjs'),('historyCodeHash','quant/engines/backtest-history.js'),('signalCodeHash','quant/engines/signal-backtest.js'),('executionCodeHash','scripts/quant/run-real-weekly-backtest.cjs'),('benchmarkCodeHash','quant/engines/weekly-benchmark.cjs')]:
        assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == report['input'][field]
    points = [p for p in json.loads(source_bytes)['points'] if p[0] <= report['input']['asOf']]
    dates, prices = zip(*points)
    triggers = []
    for i in range(53, len(points)):
        if prices[i] > max(prices[i-52:i]) and prices[i-1] <= max(prices[i-53:i-1]):
            triggers.append(i)
    events = {i for k,i in enumerate(triggers) if k == 0 or i-triggers[k-1] >= 13}
    start = dates.index(report['input']['start'])
    per_side = report['input']['costModel'] == 'PER_SIDE_NOTIONAL'
    cash, holding, trades, curve, charges = 100000., None, [], [], []
    for i in range(start, len(points)):
        if holding and i == holding['entry'] + 26:
            gross = holding['units'] * prices[i]
            fee, slip = gross * (.001 if per_side else .002), gross * (.0005 if per_side else .001)
            cash += gross - fee - slip
            charges.append((fee, slip))
            trades.append(dict(holding, exit=i, proceeds=cash, exit_fee=fee, exit_slip=slip))
            holding = None
        if i-1 in events and i-1 >= start and holding is None:
            budget = cash
            notional = cash / (1.0015 if per_side else 1)
            fee, slip = (notional*.001, notional*.0005) if per_side else (0.,0.)
            cash -= notional + fee + slip
            charges.append((fee,slip))
            holding = dict(entry=i, signal=i-1, units=notional/prices[i], capital=budget, fee=fee, slip=slip)
        curve.append(cash + (holding['units']*prices[i] if holding else 0))
    assert len(trades) == len(report['trades']) and len(curve) == len(report['equity'])
    for expected, actual in zip(trades, report['trades']):
        e, x = expected['entry'], expected['exit']
        assert actual['signalDate'] == dates[expected['signal']] and actual['entryDate'] == dates[e] and actual['exitDate'] == dates[x]
        assert x-e == 26 and expected['signal']+1 == e
        for a,b in [(actual['entryPrice'],prices[e]),(actual['exitPrice'],prices[x]),(actual['netExitValue'],expected['proceeds']),(actual['fees'],expected['fee']+expected['exit_fee']),(actual['slippage'],expected['slip']+expected['exit_slip']),(actual['netReturn'],expected['proceeds']/expected['capital']-1)]:
            near(a,b)
    def statistics(values):
        years = (date.fromisoformat(dates[-1])-date.fromisoformat(dates[start])).days/365.2425
        peak, worst = values[0], 0
        for v in values:
            peak = max(peak,v)
            worst = min(worst,v/peak-1)
        return dict(endCapital=values[-1], totalReturn=values[-1]/100000-1, cagr=(values[-1]/100000)**(1/years)-1, maxDrawdown=worst)
    for key,value in statistics(curve).items():
        if key in report['metrics']: near(value,report['metrics'][key])
    for actual,value in zip(report['equity'],curve): near(actual['value'],value)
    near(sum(c[0] for c in charges),report['metrics']['fees'])
    near(sum(c[1] for c in charges),report['metrics']['slippage'])
    buy_hold = [100000*p/prices[start] for p in prices[start:]]
    for key,value in statistics(buy_hold).items(): near(value,report['benchmark'][key])
    for row,value in zip(report['equity'],buy_hold): near(row['benchmark'],value)
    market = report['marketBenchmark']
    if market['state'] == 'AVAILABLE':
        raw = (root / market['provenance']['sourcePath']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == market['provenance']['sourceBytesHash']
        spy = dict(json.loads(raw)['points'])
        expected = [100000*spy[d]/spy[dates[start]] for d in dates[start:]]
        assert len(expected) == len(market['points'])
        for row,value,d in zip(market['points'],expected,dates[start:]):
            assert row['date'] == d
            near(row['value'],value)
        for key,value in statistics(expected).items(): near(value,market[key])
        near(report['metrics']['cagr']-market['cagr'],market['excessCagr'])
    assert bool(holding) == bool(report['openPosition'])
    if holding:
        near(holding['units']*prices[-1],report['openPosition']['value'])
        assert not report['openPosition']['completed']
    assert report['history']['earliestEligibleBacktestDate'] == dates[53]
    assert report['input']['returnBasis'] == 'PRICE_RETURN' and report['certification'] == 'NOT_CERTIFIED'
    return dict(state='PASS',independentlyCheckedTrades=len(trades),equityObservations=len(curve),benchmark=market['state'],costModel=report['input']['costModel'],resultHash=report['resultHash'])
if __name__ == '__main__':
    print(json.dumps(verify(json.loads(Path(sys.argv[1]).read_text()),Path(__file__).resolve().parents[2])))
