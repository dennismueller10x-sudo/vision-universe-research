#!/usr/bin/env python3
"""Read-only Tiingo price semantics audit. Never writes production artifacts.

Run: python3 audits/tiingo-2026-10-02/quality/analyze_quality.py
Optional fresh response records: --probes PATH (root result list with id/body).
All output is under this audit directory; no credentials/network are accessed.
"""
import argparse, collections, datetime, hashlib, json, math, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path(__file__).resolve().parent
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()
def finite(x): return isinstance(x,(int,float)) and math.isfinite(x)
def canonical(b):
    return {**b,'date':b.get('date','')[:10], 'adjustedClose':b.get('adjustedClose',b.get('adjClose')),
            'dividend':b.get('dividend',b.get('divCash')), 'adjustedVolume':b.get('adjustedVolume',b.get('adjVolume')),
            **{f'adjusted{k.capitalize()}':b.get(f'adjusted{k.capitalize()}',b.get(f'adj{k.capitalize()}')) for k in ['open','high','low']}}
def validate(identifier,bars,source):
    bars=[canonical(b) for b in bars]; issues=[]; splits=[]; dividends=[]; common_geometry=[]
    fields=['open','high','low','close','volume','adjustedOpen','adjustedHigh','adjustedLow','adjustedClose','adjustedVolume','splitFactor','dividend']
    field_counts={k:sum(finite(b.get(k)) for b in bars) for k in fields}
    for i,b in enumerate(bars):
        if i and b['date']<=bars[i-1]['date']: issues.append({'code':'NON_ASCENDING_DATE','date':b['date']})
        if all(finite(b.get(k)) for k in ['low','open','close','high']):
            if not b['low']<=min(b['open'],b['close'])<=max(b['open'],b['close'])<=b['high']: issues.append({'code':'RAW_OHLC_GEOMETRY','date':b['date']})
        if all(finite(b.get(k)) for k in ['close','adjustedClose','open','adjustedOpen','high','adjustedHigh','low','adjustedLow']) and min(b['close'],b['open'],b['high'],b['low'])>0:
            ratios=[b['adjusted'+k.capitalize()]/b[k] for k in ['open','high','low','close']]; mean=sum(ratios)/4
            common_geometry.append(max(abs(x/mean-1) for x in ratios))
        if not i: continue
        p=bars[i-1]
        if not all(finite(v) and v>0 for v in [p.get('close'),b.get('close'),p.get('adjustedClose'),b.get('adjustedClose')]): continue
        raw_ratio=b['close']/p['close']; adj_ratio=b['adjustedClose']/p['adjustedClose']; adjustment_step=adj_ratio/raw_ratio
        sf=b.get('splitFactor'); div=b.get('dividend')
        if finite(sf) and sf>0 and sf!=1:
            err=abs(adjustment_step/sf-1)
            splits.append({'date':b['date'],'splitFactor':sf,'rawReturnPct':100*(raw_ratio-1),'adjustedReturnPct':100*(adj_ratio-1),'observedAdjustmentStep':adjustment_step,'splitFactorRelativeError':err,'passesSplitGeometry':err<=0.001 if not div else None,'simultaneousDividend':bool(div),'postSplitCashCombinedFactor':sf*(1+div/b['close']) if div else None,'postSplitCashCombinedRelativeError':abs(adjustment_step/(sf*(1+div/b['close']))-1) if div else None,'preSplitCashCombinedFactor':sf+div/b['close'] if div else None,'preSplitCashCombinedRelativeError':abs(adjustment_step/(sf+div/b['close'])-1) if div else None})
        if finite(div) and div>0 and sf==1:
            observed=(p['adjustedClose']/p['close'])/(b['adjustedClose']/b['close']); cash_yield=div/p['close']; expected=b['close']/(b['close']+div)
            exact_yield=1-expected; normalized=abs((1-observed)/exact_yield-1)
            dividends.append({'eventClassification':'PROVIDER_DECLARED_CASH_ONLY_NOT_INDEPENDENT_ACTION_VERIFICATION','date':b['date'],'cashYield':cash_yield,'observedBackwardFactorRatio':observed,'expectedBackwardFactorRatio':expected,'absoluteFactorError':abs(observed-expected),'cashYieldRelativeError':normalized,'dividendClearlyPresent':abs(1-observed)>exact_yield*0.5,'passesStrongDividendCheck':normalized<=0.0001,'legacyApproximationFactorRatio':1-cash_yield,'legacyApproximationDividendRelativeError':abs((1-observed)/cash_yield-1),'additiveReinvestmentReturn':(b['close']+div)/p['close']-1,'providerAdjustedReturn':adj_ratio-1})
    split_volume=[]; acc=1
    for b in reversed(bars):
        if finite(b.get('volume')) and b['volume']>0 and finite(b.get('adjustedVolume')):
            split_volume.append(abs(b['adjustedVolume']/(b['volume']*acc)-1))
        sf=b.get('splitFactor')
        if finite(sf) and sf>0: acc*=sf
    # Existing cache adjustment origin may include corporate actions after its terminal date;
    # volume-vs-window divisor therefore need not be equal unless fetched through today.
    return {'id':identifier,'source':source,'bars':len(bars),'first':bars[0]['date'] if bars else None,'last':bars[-1]['date'] if bars else None,'fieldCoverage':field_counts,'issues':issues,'zeroVolumeBars':sum(b.get('volume')==0 for b in bars),'splitEvents':splits,'dividendEvents':dividends,'adjustedOHLCCommonFactorWorstError':max(common_geometry,default=None),'adjustedVolumeVsWindowSplitFactorWorstError':max(split_volume,default=None),'volumeCaveat':'Window split product omits splits after terminal date; provider adjusted volume anchors to current full history. Dividend factors do not adjust volume.','weekdayGapsOver7CalendarDays':[{'from':p['date'],'to':b['date']} for p,b in zip(bars,bars[1:]) if (datetime.date.fromisoformat(b['date'])-datetime.date.fromisoformat(p['date'])).days>7]}
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--probes',nargs='*'); args=ap.parse_args(); samples=[]
    for p in sorted((ROOT/'quant/data/market/golden-preview/daily').glob('*.json')):
        d=json.loads(p.read_text()); s=validate(d.get('ticker',p.stem),d.get('bars',[]),str(p.relative_to(ROOT)))
        s.update(fetchedAt=d.get('fetchedAt'),updatedAt=d.get('updatedAt'),inputSha256=hashlib.sha256(p.read_bytes()).hexdigest(),adjustmentStatus=d.get('adjustmentStatus'))
        samples.append(s)
    fresh=[]
    for probe_path in args.probes or []:
        d=json.loads(pathlib.Path(probe_path).read_text()); records=d.get('responses',d.get('results',d.get('probes',[]))) if isinstance(d,dict) else d
        for record in records:
            refs=record.get('references',[record]); quality_refs=[r for r in refs if str(r.get('path','')).startswith('/tiingo/daily/') and str(r.get('path','')).endswith('/prices')]
            if not quality_refs: continue
            body=record.get('payload',record.get('body',record.get('data',record.get('response'))))
            if isinstance(body,str):
                try: body=json.loads(body)
                except ValueError: continue
            if isinstance(body,list) and body and isinstance(body[0],dict) and 'close' in body[0]:
                sample=validate(quality_refs[0]['id'],body,str(probe_path)); sample.update(url=record.get('url'),observedAt=record.get('observedAt'),responseSha256=record.get('sha256'),references=quality_refs)
                fresh.append(sample)
    status=json.loads((ROOT/'quant/data/market/tiingo-status.json').read_text()); securities=status['securities']; discover=[]
    for p in (ROOT/'quant/data/market/discover-series').glob('*.json'):
        d=json.loads(p.read_text()); points=d.get('points',[]); discover.append({'id':d.get('securityId',p.stem),'source':d.get('source'),'dataMode':d.get('dataMode'),'priceSeriesType':d.get('priceSeriesType'),'bars':len(points),'last':points[-1][0] if points else None,'from':points[0][0] if points else None})
    failures=collections.Counter(s.get('reason') for s in securities.values() if not s.get('ok'))
    report={'schemaVersion':'tiingo-quality-audit-1.0.0','generatedAt':NOW,'productionChanged':False,'cacheSamples':samples,'freshAccountSamples':fresh,'method':{'split':'(adjClose_t / adjClose_prev) / (close_t / close_prev) == splitFactor_t on split-only event, allowing floating point error; a real >15% daily move does not refute adjustment.','cashDividend':'(adjClose_prev/close_prev)/(adjClose_t/close_t) == close_t/(close_t+divCash_t); report error relative to cash yield so small yields cannot hide missing adjustment. Skip simultaneous splits.','OHLC':'Within each bar adjusted O/H/L/C must share the same adjustment factor.','volume':'adjVolume / volume contains cumulative subsequent splits; cash dividends should not multiply volume.','missingBars':'Large calendar gaps observed, but exact missing exchange sessions need a venue calendar; no weekday-as-trading-day claim.','economicReturn':'Fresh coherent provider adjusted return matches additive cash-reinvestment (close_t+divCash)/close_prev in measured cash-only events. Existing verifier 1-divCash/close_prev is an approximation, not the exact factor formula. Net tax, ADR fee, withholding and FX effects excluded.'},'baseline':{'statusGeneratedAt':status['generatedAt'],'statusSummary':status['summary'],'rejectionReasons':dict(failures),'dnaStatus':securities.get('ref_DNA'),'discoverSeriesCount':len(discover),'discoverBases':dict(collections.Counter(d['priceSeriesType'] for d in discover)),'discoverHistoryAtLeast200':sum(d['bars']>=200 for d in discover),'discoverHistoryAtLeast252':sum(d['bars']>=252 for d in discover),'discoverLastDateCounts':dict(collections.Counter(d['last'] for d in discover))},'limits':['Golden-five audit sample covers existing US equities only; no class-wide ADR/ETF/China/local-Europe validation inferred.','Discover files are split-adjusted close points, not raw OHLCV; only golden-five cache supports raw-vs-adjusted proof locally.','A passing current historical sample does not establish historical point-in-time membership, delisting proceeds or fundamental timestamps.']}
    action_path=OUT.parent/'global/tiingo_china_corporate_action_crosscheck.json'
    external=json.loads(action_path.read_text()) if action_path.exists() else {}
    confirmed=[c for c in external.get('checks',[]) if c.get('actionOracleConfidence')=='VERIFIED_ISSUER_AND_EXCHANGE' and c.get('actionMismatch')]
    report['externallyVerifiedActionFailures']=[{'instrument':c['instrument'],'date':c['date'],'failure':c['actionMismatch'],'providerSplitFactor':c['providerSplitFactor'],'issuerSplitRatio':c['primaryIssuerAction']['terms']['splitRatio'],'providerAdjustedReturn':c['providerAdjustedReturn'],'expectedGrossCorporateActionReturn':c['expectedGrossCorporateActionReturn'],'cashBasis':c['expectedReturnCashBasis'],'primarySource':c['primaryIssuerAction']['document'],'source':'global/tiingo_china_corporate_action_crosscheck.json'} for c in confirmed]
    for sample in fresh:
        for event in sample['dividendEvents']:
            mismatch=next((c for c in confirmed if sample['references'][0]['path']=='/tiingo/daily/'+c['instrument']+'/prices' and event['date']==c['date']),None)
            if mismatch: event['economicActionValidation']='CONFIRMED_FAILURE_DESPITE_PASSING_CASH_FIELD_ALGEBRA';event['verifiedIssuerSplitRatio']=mismatch['primaryIssuerAction']['terms']['splitRatio']
    report['corporateActionCompletenessNotEstablished'] = True
    report['cashAlgebraCaveat'] = 'Cash-only means provider splitFactor == 1. Passing reinvestment algebra cannot prove that an omitted split/stock bonus is absent or that divCash contains actual cash rather than an action proxy.'
    report['volumeUnitCaveat'] = 'OHLC/adjustment coherence cannot verify base volume unit consistency (shares vs lots) across history or venues. China historical volume units need independent reconciliation.'
    report['freshUniqueCashDividendEvents'] = len({(sample['references'][0]['path'], e['date']) for sample in fresh for e in sample['dividendEvents']})
    report['eventCountCaveat'] = 'Event counts across responses may overlap; unique fresh events deduplicate by instrument endpoint and date. Cache/fresh event totals are not independent samples.'
    (OUT/'tiingo_price_quality.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'cacheSeries':len(samples),'freshSeries':len(fresh),'splits':sum(len(s['splitEvents']) for s in samples+fresh),'dividends':sum(len(s['dividendEvents']) for s in samples+fresh),'cashYieldNormalizedMatches':sum(sum(e['passesStrongDividendCheck'] for e in s['dividendEvents']) for s in samples+fresh),'output':str(OUT/'tiingo_price_quality.json')}))
if __name__=='__main__': main()
