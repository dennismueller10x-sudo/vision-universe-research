"""Bounded one-time QA metadata completion. No news discovery or factor changes.

The old submissions compaction retained filings but dropped SIC/business country.
Collect only public SEC issuer metadata for reproducible representative QA; retain
it privately so later runners do not need to fetch this sample again.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import re
import sys
import time
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'))
from company_intelligence.store import Store, atomic_json, dumps
from company_intelligence.model import load_universe
from company_intelligence.transport import BudgetExhausted
from company_intelligence.model import timestamp
from quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter
from quant.sec.provider import SECProvider
SEED='vision-universe-reviewed-german-profiles-20261012-v1'
EU_CANDIDATE_TICKERS=set('NVO ASML NVS SNY SAP AZN UL GSK SHEL BP DEO NOK ERIC PHG STM DB UBS ING LYG BCS SAN BBVA TEF GRFS ALC RELX WPP RACE STLA FRO CMBT TRMD GSL FLNG CRTO EVTC ADCT AMRN AUTL IMCR LIVN MNMD PRTA QGEN RYTM SNDX VRNA ARVN BNTX'.split())

def metadata(data,cik,now):
    if str(data.get('cik','')).zfill(10)!=cik:raise ValueError('QA_METADATA_ISSUER_MISMATCH')
    business=(data.get('addresses')or{}).get('business')or{}
    value={'cik':cik,'sic':str(data.get('sic')or''),'addresses':{'business':{k:business[k]for k in ('stateOrCountry','stateOrCountryDescription')if isinstance(business.get(k),str)}}}
    value.update(sourceUrl='https://data.sec.gov/submissions/CIK'+cik+'.json',verifiedAt=now,
        sourceRecordLogicalHash=hashlib.sha256(dumps(value).encode()).hexdigest(),hashBasis='SELECTED_PUBLIC_METADATA_LOGICAL_RECORD_NOT_HTTP_BODY')
    return value

def approved_reference(value, cik, now):
    verified = timestamp(value.get('verifiedAt'))
    if not verified or verified > now:
        raise ValueError('INVALID_PUBLIC_QA_REFERENCE_DATE')
    expected = metadata(value, cik, verified)
    if expected != value:
        raise ValueError('INVALID_PUBLIC_QA_REFERENCE_FIELDS_OR_HASH')
    return expected

def candidates(companies, profiles):
    buckets={k:[]for k in ('EU_CANDIDATE','US_CANDIDATE','HEALTH_CANDIDATE','FINANCIAL_CANDIDATE','INDUSTRIAL_CANDIDATE','FOREIGN_CANDIDATE')}
    order=lambda cid:hashlib.sha256((SEED+':'+cid).encode()).hexdigest()
    for cid,c in sorted(companies.items(),key=lambda pair:order(pair[0])):
        if not isinstance(c.get('cik'),str) or not re.fullmatch(r'\d{10}',c['cik']):continue
        p=profiles.get(cid,{})
        text=p.get('description','');foreign=any(s.get('form')in ('20-F','40-F')for s in p.get('sources',[]))
        if any(l['symbol']in EU_CANDIDATE_TICKERS for l in c['listings']):buckets['EU_CANDIDATE'].append(cid)
        if any(s.get('form')=='10-K'for s in p.get('sources',[])):buckets['US_CANDIDATE'].append(cid)
        if re.search(r'biopharma|biotech|clinical|medical|healthcare|diagnostic',text,re.I):buckets['HEALTH_CANDIDATE'].append(cid)
        if re.search(r'bank|insurance|financial services',text,re.I):buckets['FINANCIAL_CANDIDATE'].append(cid)
        if re.search(r'manufactur|industrial|retail|food|beverage|consumer',text,re.I):buckets['INDUSTRIAL_CANDIDATE'].append(cid)
        if foreign:buckets['FOREIGN_CANDIDATE'].append(cid)
    # These are collection hints, not publication or country/sector evidence.
    priority=buckets['EU_CANDIDATE']+buckets['US_CANDIDATE'][:65]+buckets['HEALTH_CANDIDATE'][:40]+buckets['FINANCIAL_CANDIDATE'][:40]+buckets['INDUSTRIAL_CANDIDATE'][:40]+buckets['FOREIGN_CANDIDATE']
    return list(dict.fromkeys(priority))

def complete(state,out,budget=250,max_seconds=600):
    state,out=Path(state),Path(out)
    if not (state/'state.sqlite').is_file() or not (state/'latest-run.json').is_file() or json.loads((state/'latest-run.json').read_text()).get('privateCompanies',0)<5120:
        raise ValueError('FULL_RESTORED_STATE_REQUIRED_FOR_QA_METADATA')
    if not 1<=budget<=250 or not 30<=max_seconds<=600:raise ValueError('INVALID_QA_METADATA_BOUNDS')
    stamp=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z');started=time.monotonic()
    lock=(state/'run.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);store=Store(state/'state.sqlite')
    client=SECHttpClient(cache=DiskCache(state/'qa-sec-cache',ttl_seconds=24*3600),rate_limiter=RateLimiter(rate_per_second=1,burst=1),timeout=12,max_retries=1)
    requests=0
    def bounded(url,headers,timeout):
        nonlocal requests
        remaining=max_seconds-(time.monotonic()-started)
        if requests>=budget or remaining<=0:raise BudgetExhausted('QA_METADATA_BUDGET_DEFERRED')
        requests+=1;return client._urlopen(url,headers,min(timeout,remaining))
    client._opener=bounded;provider=SECProvider(client);outcomes=Counter();completed=0
    try:
        companies=load_universe(ROOT);profiles=json.loads((ROOT/'company-intelligence/config/company-profiles.json').read_text())['profiles']
        reviewed=json.loads((ROOT/'company-intelligence/config/profile-reviewed-de.json').read_text())['profiles']
        profiles={**profiles,**{cid:e['reviewedSourceSnapshot']for cid,e in reviewed.items()if e.get('reviewedSourceSnapshot')}}
        references_path=ROOT/'company-intelligence/config/profile-qa-reference-metadata.json'
        imported=0
        if references_path.is_file():
            references=json.loads(references_path.read_text())
            if references.get('schema')!=1 or references.get('policy')!='PUBLIC_SEC_COUNTRY_AND_SIC_ONLY_NO_ADDRESSES_NO_OPERATIONAL_STATE':
                raise ValueError('INVALID_PUBLIC_QA_REFERENCE_POLICY')
            for cid,value in references['references'].items():
                if cid not in companies or store.state('profileQaIssuerMetadata:'+cid):continue
                checked=approved_reference(value,companies[cid]['cik'],stamp)
                store.set_state('profileQaIssuerMetadata:'+cid,checked);imported+=1
        approved={cid:c for cid,c in companies.items()if reviewed.get(cid,{}).get('status')=='APPROVED'}
        queue=list(dict.fromkeys(candidates(approved,profiles)+candidates(companies,profiles)))
        for cid in queue:
            prior=store.state('profileQaIssuerMetadata:'+cid)
            if prior:continue
            if completed>=250 or time.monotonic()-started>=max_seconds:break
            try:
                data=provider.get_submissions(companies[cid]['cik'],include_history=False)
                value=metadata(data,companies[cid]['cik'],stamp)
                if not value['sic'] or not value['addresses']['business']:outcomes['UPSTREAM_METADATA_INCOMPLETE']+=1
                store.set_state('profileQaIssuerMetadata:'+cid,value);completed+=1;outcomes['SUCCESS']+=1
            except BudgetExhausted:outcomes['BUDGET_DEFERRED']+=1;break
            except ValueError:outcomes['INVALID_ISSUER_METADATA']+=1
            except Exception:
                outcomes['TEMPORARY_SEC_FAILURE']+=1
                if outcomes['TEMPORARY_SEC_FAILURE']>=3:break
        references={cid:store.state('profileQaIssuerMetadata:'+cid)for cid in queue if store.state('profileQaIssuerMetadata:'+cid)}
        report={'schema':1,'seed':SEED,'collectionCandidates':len(queue),'newMetadataRecords':completed,'approvedPublicQAMetadataImported':imported,'requests':requests,
            'providerRequestAttempts':client.stats['requests'],'runtimeSeconds':round(time.monotonic()-started,3),'outcomes':dict(outcomes),'newsDiscovery':False,'factorChanges':False,'privateOperationalRowsIncluded':False,
            'publicQAReferences':references,'referencePolicy':'PUBLIC_SEC_COUNTRY_AND_SIC_ONLY_NO_ADDRESSES_NO_OPERATIONAL_STATE'}
        atomic_json(out,report);return report
    finally:store.close();lock.close()
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--state',required=True);p.add_argument('--out',required=True);a=p.parse_args();print(json.dumps(complete(a.state,a.out)))
