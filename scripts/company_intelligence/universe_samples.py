"""Reproducible useful/sparse/ineligible sample. Existing data only; zero API calls.

Size bands use dated USD listing close times the stored SEC-reported common share
count for single-listing common stocks. This is a disclosed QA size estimate, not
an intraday market-cap feed; ADR and multiple-share-class estimates are excluded.
"""
from collections import defaultdict
import hashlib
import json
from pathlib import Path
from .store import atomic_json
from .earnings import valid_date
from .universe_eligibility import DISPLAY_METRICS

ROOT=Path(__file__).resolve().parents[2]
SEED='vision-universe-eligibility-20261010'
TOP=['AAPL','MSFT','NVDA','TSLA','META','GOOG','GOOGL','PLTR','XPEV']
def samples(consumer,decisions,output):
    consumer=Path(consumer);m=json.loads((consumer/'manifest.json').read_text());rows=decisions['issuers']
    groups=defaultdict(list);metadata={};eligible=[];ineligible=[]
    order=lambda cid:hashlib.sha256((SEED+':'+cid).encode()).hexdigest()
    for cid,r in sorted(rows.items(),key=lambda x:order(x[0])):
        # The existing Master-detail route is a valid Discover experience too.
        # It must receive the same issuer modules independently of price data.
        available=r['tickers']
        if not available:continue
        ticker=available[0]
        if not r['status'].startswith('ELIGIBLE_'):
            ineligible.append(ticker);continue
        eligible.append(ticker)
        if not (ROOT/f'discover/data/stocks/US_REAL/{ticker}.json').is_file():groups['MASTER_DETAIL'].append(ticker)
        p=json.loads((consumer/f'snapshots/{m["generation"]}/{cid}.json').read_text())
        if sum(r['modules'][k] for k in ('profile','aktuelles','financials','nextEvent','calls','documents'))<=2:groups['SPARSE'].append(ticker)
        foreign=r.get('foreignIssuerEvidence',False) or any(l.get('securityType')=='ADR' or l.get('country') not in ('US',None) for l in p['listings']) or any(d.get('form') in ('20-F','40-F') for d in p.get('filings',[])+p.get('materials',[]))
        if foreign:groups['INTERNATIONAL_ADR'].append(ticker)
        if r['modules']['financials'] and (ROOT/f'discover/data/stocks/US_REAL/{ticker}.json').is_file():
            shares=p['latestFinancials'].get('metrics',{}).get('shares_outstanding',{}).get('current') or {}
            detail=json.loads((ROOT/f'discover/data/stocks/US_REAL/{ticker}.json').read_text())
            price=(detail.get('price') or {}).get('value');asof=detail.get('asOf')
            valuation=(detail.get('fundamentals') or {}).get('valuation') or {}
            accepted_cap=(valuation.get('marketCap') or {}).get('value')
            if not foreign and not valuation.get('marketCapReason') and type(accepted_cap) in (int,float) and len(p['listings'])==1 and p['listings'][0].get('securityType')=='COMMON_STOCK' and shares.get('unit')=='shares' and type(price) in (int,float) and price>0 and type(shares.get('value')) in (int,float) and shares['value']>0 and valid_date(asof) and valid_date(shares.get('periodEnd')):
                cap=price*shares['value'];band='LARGE_CAP' if cap>=10e9 else 'MID_CAP' if cap>=2e9 else 'SMALL_CAP' if cap>=300e6 else 'MICRO_CAP' if cap>=50e6 else 'NANO_CAP'
                groups[band].append(ticker);metadata[ticker]={'companyId':cid,'sizeBand':band,'marketCapEstimateUSD':cap,'priceUSD':price,'priceAsOf':asof,'shares':shares['value'],'sharesAsOf':shares['periodEnd'],'shareAccession':shares.get('filingId'),'basis':'DATED_EXISTING_USD_CLOSE_TIMES_REPORTED_COMMON_SHARES','notIntradayMarketCap':True}
    groups['RANDOM_ELIGIBLE']=eligible[:10];groups['INELIGIBLE']=ineligible[:20];groups['HIGH_PROFILE']=[t for t in TOP if any(t in r['tickers'] for r in rows.values())]
    for key in ('LARGE_CAP','MID_CAP','SMALL_CAP','MICRO_CAP','NANO_CAP','INTERNATIONAL_ADR','SPARSE','MASTER_DETAIL'):groups[key]=groups[key][:10]
    for key in ('LARGE_CAP','MID_CAP','SMALL_CAP','MICRO_CAP','INTERNATIONAL_ADR','SPARSE','RANDOM_ELIGIBLE'):
        if len(groups[key])<10:raise ValueError('REQUIRED_SAMPLE_GROUP_INCOMPLETE:'+key)
    if len(groups['INELIGIBLE'])<20:raise ValueError('REQUIRED_INELIGIBLE_SAMPLE_INCOMPLETE')
    # Preserve unusual module combinations in addition to the requested groups.
    combinations=defaultdict(list)
    for cid,r in rows.items():
        if r['status'].startswith('ELIGIBLE_'):
            key=','.join(k for k in r['modules'] if r['modules'][k]);combinations[key].append(cid)
    for key,cids in combinations.items():
        cid=sorted(cids,key=order)[0];t=rows[cid]['tickers'][0]
        if t:groups['MODULE_COMBINATIONS'].append(t)
    result={'schema':1,'generation':m['generation'],'seed':SEED,'method':'SHA256_SEED_AND_ISSUER_ORDER','groups':dict(groups),
            'stocks':sorted({t for key,ts in groups.items() if key!='INELIGIBLE' for t in ts}), 'ineligible':groups['INELIGIBLE'],
            'numericSizeEvidence':{t:metadata[t] for ts in groups.values() for t in ts if t in metadata},
            'sizeLimitations':'Dated close and reported shares have distinct timestamps. Single-listing common-stock estimates only; no ADR conversion or summed class shares. No current-price/provider claim.'}
    atomic_json(output,result);return result
