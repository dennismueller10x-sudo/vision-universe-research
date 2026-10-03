#!/usr/bin/env python3
"""Refresh derived fitness counts after analyzing merged account evidence."""
import datetime,json,pathlib
out=pathlib.Path(__file__).resolve().parent
p=out/'tiingo_product_fitness_summary.json';d=json.loads(p.read_text());q=json.loads((out/'tiingo_price_quality.json').read_text());fresh=q['freshAccountSamples']
cn=[s for s in fresh if any(r.get('group') in ['china_local','china_etf'] or any('/'+t+'/' in r.get('path','') for t in ['000001','002594','300750','600519','601318','688981','200011','900901','510300','510040']) for r in s['references'])]
china_div={ (s['references'][0]['path'],e['date']) for s in cn for e in s['dividendEvents'] }
china_splits=[{**e,'sample':s['id']} for s in cn for e in s['splitEvents']]
d['adjustmentEvidence'].update(freshEodPriceResponses=len(fresh),freshCashDividendOccurrences=sum(len(s['dividendEvents']) for s in fresh),freshUniqueCashDividendEvents=q['freshUniqueCashDividendEvents'],freshAllExactFormulaPass=all(e['passesStrongDividendCheck'] for s in fresh for e in s['dividendEvents']),freshAllRawOhlcGeometryPass=not any(s['issues'] for s in fresh),chinaUniqueCashDividendEvents=len(china_div),chinaCashDividendOccurrences=sum(len(s['dividendEvents']) for s in cn),chinaSplitEvents=china_splits,eventCountCaveat=q['eventCountCaveat'])
d['adjustmentEvidence'].pop('chinaCashDividendEvents',None)
d['verifiedFalseSplitGateExclusions']=['DNA','AMC','BIRD','AMWL']
d['productionRecovery']={'performed':False,'rejectionRuleUnchanged':'ingest-rejection-r2-2026-09-25','implication':'Existing same-rule rejection ledger can defer retries20hours..7days; isolated QA replay does not restore publishedDNA. Recover through reviewed additive refresh/normalqualitygates without silently requeueing all344candidates.'}
d['isolatedGateReplay']={'script':'quality/verify_gate.mjs','result':'quality/fresh_gate_verification.json','productionOutputsRegenerated':False}
if china_splits:
 for r in d['readiness']:
  if r['assetClass']=='SHANGHAI_SHENZHEN_LOCAL':r['reason']='Current account confirms6mainlandAshare sampled histories with coherent raw/adjustedOHLCV andcashdividends. BYDknown corporateaction measured separately; inspect splitEvents for exactfactor. Localcurrency/venuecalendar/globalidentity normalization must be added safely; existing registry hardcodesUS/USD. Bshare samples200011/900901 stale2026-05-22.'
d['externallyVerifiedActionFailures']=q.get('externallyVerifiedActionFailures',[])
d['corporateActionCompletenessWarning'] = q['cashAlgebraCaveat']
d['chinaHistoricalQuality'] = {
 'status':'BLOCKED_CONFIRMED_BYD_ACTION_FAILURE_AND_UNRESOLVED_MOUTAI_VOLUME_RECONCILIATION',
 'scope':'Automatic long-history Quant, technical, SuperTrader and backtest activation',
 'source':'global/tiingo_china_corporate_action_crosscheck.json',
 'actionEvidence':'BYDJuly29confirmedfirstpartyissuer/SZSE/CNInfoannouncement2025-047,ID1224237000. Moutai2011/2014/2015remainsecondarycalendarconcerns requiringprimaryverification',
 'knownConcerns':['BYDJuly29 2025 firstpartyverifiedbonusandcashaction is missingfromadjustmentfields. Confirmedprovideradjustmentfailure; priceandvolumeadjustmentsrequireexternalreconciliation.',
 'Moutai2011/2014 stock-bonus comparisons show materially different adjusted returns;2015 divCash may proxy a bonus, so blindly applying a replacement split factor could double-count.',
 'Historical volume units (shares vs lots) not established; Moutai2007 volume scale differs from later history.'],
 'passingCashAlgebraDoesNotResolveMissingActions':True,
 'productionActivationPerformed':False}
for r in d['readiness']:
 if r['assetClass'] in ['SHANGHAI_SHENZHEN_LOCAL','LOCAL_ETF']:
  r['chartsAndTechnicalIndicators']='BLOCKED';r['superTraderCurrentTechnicalSignals']='BLOCKED'
  r['reason']='Rawpricediscoveryconfirmed, but firstpartyverifiedBYDAshare3:1bonus+cash is not correctlyadjusted in providerfields. Automatic fullhistoricalanalytics BLOCKED. Moutaiaction+volumeunitconcernsremainreconciliationpending. Explicitpost-eventwindowscouldbePARTIAL after action,currency,calendarandidentityvalidation;thisauditactivatesnothing.'
d['longHistoryEvidence']=[{'id':s['id'],'bars':s['bars'],'first':s['first'],'last':s['last'],'zeroVolumeBars':s['zeroVolumeBars'],'requestedRanges':[r.get('params') for r in s['references']]} for s in fresh if s['bars']>1000]
p.write_text(json.dumps(d,indent=2)+'\n')
print(json.dumps({'freshPriceResponses':len(fresh),'cashOccurrences':d['adjustmentEvidence']['freshCashDividendOccurrences'],'uniqueCashEvents':q['freshUniqueCashDividendEvents'],'chinaUniqueCashEvents':len(china_div),'chinaSplitEvents':len(china_splits)}))
