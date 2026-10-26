#!/usr/bin/env python3
"""Independent V6 study arithmetic/reference checks, explicitly synthetic fixtures.

Run: python3 scripts/quant/verify-research-studies.py --node /path/to/node22
No provider requests; no committed production data writes.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import subprocess
import time
import resource

ROOT = Path(__file__).resolve().parents[2]

def day(k):
    return (dt.date(2010, 1, 1) + dt.timedelta(days=7*k)).isoformat()

def fixture():
    listings = []
    for ident, phase in [('A', 0), ('B', 2)]:
        bars = []
        for k in range(180):
            close = 100 + .1*k + 15*math.sin(k/8 + phase)
            bars.append(dict(date=day(k), close=close, returnLevel=close,
                             availableAt=day(k)+'T21:01:00Z', closeAt=day(k)+'T21:00:00Z', sourceHash='synthetic-bar-'+str(k)))
        listings.append(dict(listingId=ident, issuerId='issuer:'+ident,
            identity=dict(mic='XNYS', instrumentClass='COMMON_STOCK', primary=True, validFrom='1990-01-01', availableAt='1990-01-01T00:00:00Z', sourceHash='synthetic-identity'),
            membership=[dict(validFrom='1990-01-01', availableAt='1990-01-01T00:00:00Z', sourceHash='synthetic-membership')], bars=bars))
    return dict(asOf=day(179), sourceMode='SYNTHETIC_TEST', returnBasis='TOTAL_RETURN', currency='USD',
        registration=dict(id='independent-fixture', version='1', frozenAt='2009-01-01T00:00:00Z', analysisMode='EXPLORATORY'),
        horizonBars=4, costs=dict(basis='PER_SIDE_NOTIONAL', feeBps=10, slippageBps=5), listings=listings,
        benchmark=dict(currency='USD', returnBasis='TOTAL_RETURN', bars=listings[0]['bars']))

def detect(closes, rule, i):
    if rule.startswith('MOMENTUM'):
        a = closes[i]/closes[i-26]-1
        b = closes[i-1]/closes[i-27]-1
        return a >= 0 and b < 0 if rule.endswith('IMPROVED') else a < 0 and b >= 0
    if rule.startswith('TREND'):
        a, b = sum(closes[i-39:i+1])/40, sum(closes[i-40:i])/40
        return closes[i] >= a and closes[i-1] < b if rule.endswith('UP') else closes[i] < a and closes[i-1] >= b
    return closes[i] > max(closes[i-52:i]) and not closes[i-1] > max(closes[i-53:i-1])

def signal_reference(o):
    rows = []
    rules = ['MOMENTUM_IMPROVED', 'MOMENTUM_DETERIORATED', 'TREND_UP', 'TREND_DOWN', 'NEW_52W_HIGH']
    for l in o['listings']:
        closes = [b['close'] for b in l['bars']]
        for rule in rules:
            previous = -100000
            for i in range(53, len(closes)):
                if not detect(closes, rule, i):
                    continue
                if i-previous >= 13:
                    row = dict(listingId=l['listingId'], ruleId=rule, signalDate=day(i))
                    if i+5 < len(closes):
                        entry, end = closes[i+1], closes[i+5]
                        row['netReturn'] = end/entry*(1-.0015)/(1+.0015)-1
                        peak, dd = entry, 0
                        for price in closes[i+1:i+6]:
                            peak = max(peak, price)
                            dd = min(dd, price/peak-1)
                        row['maxDrawdown'] = dd
                    rows.append(row)
                previous = i
    return rows

def close(a, b, label):
    if not math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-12):
        raise AssertionError((label, a, b))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--node', default='node')
    parser.add_argument('--out')
    args = parser.parse_args()
    o = fixture()
    js = """const fs=require('node:fs');const R=require('./quant/engines/research-studies.cjs');const o=JSON.parse(fs.readFileSync(0,'utf8'));
const signal=R.runSignalStudy(o);
const factor=R.runFactorStudy({...o,buckets:2,factorId:'X',factorSnapshots:[{date:o.listings[0].bars[70].date,availableAt:o.listings[0].bars[70].availableAt,sourceHash:'synthetic-cross',rows:o.listings.map((l,k)=>({listingId:l.listingId,value:k,availableAt:o.listings[0].bars[69].availableAt,sourceHash:'synthetic-factor'}))}]});
const events=R.runEventStudy({...o,events:[{eventId:'filing',eventType:'SEC_FILING',listingId:'A',occurredAt:o.listings[0].bars[60].date,publishedAt:o.listings[0].bars[60].date+'T22:00:00Z',availableAt:o.listings[0].bars[60].date+'T22:01:00Z',sourceHash:'synthetic-filing'}]});
const regimes=R.classifyRegimes({asOf:o.asOf,mode:'PIT_AVAILABLE',bars:o.listings[0].bars,lookbackBars:26,volatilityLookbackBars:13,trendBand:0.05,volatilityThreshold:0.1,annualization:52});
const patternDefinition={id:'FIXED_ABOVE_MA',version:'1',terms:[{feature:'aboveSma40w',operator:'eq',value:true}]};
const replay=R.runReplayValidation({...o,listings:[o.listings[0]],pattern:patternDefinition,cooldownBars:8});
const pattern=R.runPatternStudy({...o,pattern:patternDefinition,cooldownBars:4});
const setup=R.runSetupStudy({...o,listings:[o.listings[0]],entryStates:['CONFIRMED'],entryVariants:[{id:'NEXT',delayBars:1},{id:'DELAY',delayBars:2}],exitVariants:[{id:'TIME',type:'TIME_EXIT',horizonBars:26},{id:'TARGET',type:'TARGET_CLOSE',horizonBars:26}],setups:[{listingId:'A',date:o.listings[0].bars[60].date,availableAt:o.listings[0].bars[60].availableAt,sourceHash:'synthetic-setup',sourceMode:'SYNTHETIC_TEST',state:'CONFIRMED',targetLevel:1,levelBasis:'SIGNAL_SERIES'}]});
const inference=R.inference([{issuerId:'A',timeCluster:'T1',netReturn:.1},{issuerId:'B',timeCluster:'T1',netReturn:.2},{issuerId:'A',timeCluster:'T2',netReturn:-.1},{issuerId:'B',timeCluster:'T2',netReturn:.4}]);
console.log(JSON.stringify({signal,factor,events,regimes,replay,pattern,setup,inference}));"""
    started=time.perf_counter()
    actual = json.loads(subprocess.run([args.node, '-e', js], cwd=ROOT, input=json.dumps(o), text=True, capture_output=True, check=True).stdout)
    elapsed=time.perf_counter()-started
    child_peak_rss_kib=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    expected = signal_reference(o)
    observed = actual['signal']['events']
    assert len(expected) == len(observed)
    checked = 0
    for a, b in zip(expected, observed):
        for key in ['listingId', 'ruleId', 'signalDate']:
            assert a[key] == b[key], (key, a, b)
        for key in ['netReturn', 'maxDrawdown']:
            if key in a:
                close(a[key], b[key], key)
                checked += 1
            else:
                assert not b['completed']
    factor = actual['factor']['events']
    assert [(e['listingId'], e['bucket']) for e in factor] == [('A', 0), ('B', 1)]
    for l, e in zip(o['listings'], factor):
        close(l['bars'][75]['returnLevel']/l['bars'][71]['returnLevel']*(1-.0015)/(1+.0015)-1, e['netReturn'], 'factor-net')
        checked += 1
    assert actual['events']['events'][0]['entryDate'] == day(61)
    close(o['listings'][0]['bars'][65]['returnLevel']/o['listings'][0]['bars'][61]['returnLevel']*(1-.0015)/(1+.0015)-1, actual['events']['events'][0]['netReturn'], 'event-net')
    checked += 1
    for k, r in enumerate(actual['regimes']['regimes'], start=26):
        p = [b['close'] for b in o['listings'][0]['bars']]
        rets = [p[j]/p[j-1]-1 for j in range(k-12, k+1)]
        mean = sum(rets)/13
        vol = math.sqrt(sum((v-mean)**2 for v in rets)/12)*math.sqrt(52)
        close(vol, r['volatility'], 'regime-vol')
        close(p[k]/p[k-26]-1, r['trendReturn'], 'regime-trend')
        checked += 2
    # Fixed replay/pattern selection is independently reconstructed from raw closes.
    for mode, cooldown in [('replay', 8), ('pattern', 4)]:
        expected_cases = []
        expected_controls = []
        for l in o['listings'][:1 if mode == 'replay' else 2]:
            closes = [b['close'] for b in l['bars']]
            last = -100000
            for k in range(53, len(closes)):
                hit = closes[k] > sum(closes[k-39:k+1])/40
                if hit and k-last >= cooldown:
                    expected_cases.append((l['listingId'], day(k)))
                    last = k
                elif not hit:
                    expected_controls.append((l['listingId'], day(k)))
        got = actual[mode]
        assert [(e['listingId'], e['signalDate']) for e in got['events']] == expected_cases
        checked += len(expected_cases)
        if mode == 'pattern':
            assert [(e['listingId'], e['signalDate']) for e in got['controls']] == expected_controls
            checked += len(expected_controls)
    # Registered setup variants: next/delayed entries and close-triggered later exits.
    for row in actual['setup']['events']:
        entry = 61 if row['entryVariant'] == 'NEXT' else 62
        end = entry+26 if row['exitVariant'] == 'TIME' else entry+2
        assert row['entryDate'] == day(entry) and row['exitDate'] == day(end)
        prices = o['listings'][0]['bars']
        close(prices[end]['returnLevel']/prices[entry]['returnLevel']*(1-.0015)/(1+.0015)-1, row['netReturn'], 'setup-variant-net')
        checked += 1
    # Independent two-way cluster mean variance on a balanced issuer/time panel.
    panel=[('A','T1',.1),('B','T1',.2),('A','T2',-.1),('B','T2',.4)]
    m=sum(x[2] for x in panel)/len(panel)
    def cluster_variance(key):
        sums={}
        for row in panel:
            k=key(row)
            sums[k]=sums.get(k,0)+(row[2]-m)
        return len(sums)/(len(sums)-1)*sum(x*x for x in sums.values())/len(panel)**2
    variance=cluster_variance(lambda r:r[0])+cluster_variance(lambda r:r[1])-cluster_variance(lambda r:(r[0],r[1]))
    close(m,actual['inference']['mean'],'cluster-mean')
    if variance >= 0:
        close(math.sqrt(variance),actual['inference']['standardError'],'cluster-se')
    else:
        assert actual['inference']['interval95'] is None
    checked += 2
    report = dict(schemaVersion='v6-independent-studies-1.0.0', status='PASS', sourceMode='SYNTHETIC_TEST',
        signalEvents=len(expected), numericComparisons=checked, resourceObservation=dict(fixtureSourceBars=360,nodeWallSeconds=elapsed,childPeakRssKiB=child_peak_rss_kib,scope='small synthetic validation workload; includes Node startup, runtime hashing and concurrent environment load'), tolerance=dict(relative=1e-12, absolute=1e-12),
        independentImplementation='Python stdlib: all five signal rules/cooldown, fixed replay/pattern selection and controls, setup execution variants, net outcomes/drawdown, ranking, event timing, trend/volatility, two-way cluster inference',
        historicalDataEligibility='NOT_ESTABLISHED_BY_SYNTHETIC_REFERENCE', inputSha256=hashlib.sha256(json.dumps(o, sort_keys=True).encode()).hexdigest())
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
