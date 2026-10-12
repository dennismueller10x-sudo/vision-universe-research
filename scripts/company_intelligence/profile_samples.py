"""Dated, seeded profile QA groups from existing identity/SEC evidence only."""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.store import Store, atomic_json
from company_intelligence.universe_samples import samples as universe_samples

SEED = 'vision-universe-reviewed-german-profiles-20261012-v1'
TOP = ['PYPL','NTLA','AAPL','MSFT','NVDA','TSLA','META','GOOG','GOOGL','AMZN','NFLX','PLTR','AMD','INTC','CRM','ORCL','UBER','SHOP','BABA','ASML','TSM','NVO','XPEV']
EUROPE = {'AUSTRIA','BELGIUM','CYPRUS','CZECH REPUBLIC','DENMARK','FINLAND','FRANCE','GERMANY','GREECE','IRELAND','ITALY','LUXEMBOURG','NETHERLANDS','NORWAY','POLAND','PORTUGAL','SPAIN','SWEDEN','SWITZERLAND','UNITED KINGDOM','UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND'}
US_STATES = set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())
TARGETS = {'US':50, 'EUROPE':25, 'ADR_GLOBAL':25, 'SMALL_MICRO':25, 'BIOTECH_HEALTH':25, 'FINANCIAL':25, 'INDUSTRIAL_CONSUMER':25}

def create(state, consumer, decisions, output):
    state,consumer,output=map(Path,(state,consumer,output))
    rows=json.loads(Path(decisions).read_text())['issuers'];m=json.loads((consumer/'manifest.json').read_text())
    base=universe_samples(consumer,{'issuers':rows},output.with_suffix('.size-sample.json'),group_limit=25,include_all_size_evidence=True)
    size={t for t,e in base['numericSizeEvidence'].items() if e['sizeBand'] in ('SMALL_CAP','MICRO_CAP')}
    store=Store(state/'state.sqlite');groups=defaultdict(list);evidence={};profile_total=0
    order=lambda cid:hashlib.sha256((SEED+':'+cid).encode()).hexdigest()
    try:
        for cid in sorted(m['eligibility'],key=order):
            r=m['eligibility'][cid];ticker=r['tickers'][0]
            raw={**store.state('profileQaIssuerMetadata:'+cid,{}),**store.state('sec-submissions:'+cid,{})}
            business=raw.get('addresses',{}).get('business',{})
            country=str(business.get('stateOrCountryDescription') or '').upper()
            state_code=business.get('stateOrCountry')
            if state_code in US_STATES:country='UNITED STATES'
            listing_foreign=any(l.get('securityType')=='ADR' or l.get('country') not in (None,'US') for l in rows[cid].get('listings',[]))
            try:sic=int(raw.get('sic',''))
            except (TypeError,ValueError):sic=None
            kinds=[]
            if country in {'UNITED STATES','USA','U.S.A.'}:kinds.append('US')
            if country in EUROPE:kinds.append('EUROPE')
            if country and country not in {'UNITED STATES','USA','U.S.A.'} or listing_foreign or rows[cid].get('foreignIssuerEvidence'):kinds.append('ADR_GLOBAL')
            if ticker in size:kinds.append('SMALL_MICRO')
            if sic is not None:
                source=store.state('profileReviewSource:'+cid,{}) or store.state('companyProfile:'+cid,{})
                import re
                life_science=sic==8731 and bool(re.search(r'biopharma|biotech|clinical|klinisch|Wirkstoff',source.get('description',''),re.I))
                if 2830<=sic<=2839 or 3840<=sic<=3859 or 8000<=sic<=8099 or life_science:kinds.append('BIOTECH_HEALTH')
                if 6000<=sic<=6799:kinds.append('FINANCIAL')
                if (2000<=sic<=3999 or 5000<=sic<=5999) and 'BIOTECH_HEALTH'not in kinds:kinds.append('INDUSTRIAL_CONSUMER')
            profile_total+=r['modules']['profile']
            if r['modules']['profile']:
                for kind in kinds:groups[kind].append(ticker)
            if kinds:evidence[ticker]={'companyId':cid,'businessCountry':country or None,'sic':sic,'profilePresent':r['modules']['profile']}
        selected={k:groups[k][:n]for k,n in TARGETS.items()}
        mandatory=[t for t in TOP if t in m['tickers']]
        available=set(m['tickers']);selected['HIGH_PROFILE']=mandatory
        # Existing browser QA expects these structural group names.
        selected['SPARSE']=base['groups']['SPARSE'];selected['INTERNATIONAL_ADR']=selected['ADR_GLOBAL'][:2];selected['MASTER_DETAIL']=base['groups']['MASTER_DETAIL']
        chosen=sorted({t for ts in selected.values()for t in ts})
        result={'schema':1,'generation':m['generation'],'seed':SEED,'method':'SHA256_SEED_ISSUER_ORDER_WITH_RECORDED_SEC_BUSINESS_COUNTRY_AND_SIC',
                'stocks':chosen,'ineligible':base['ineligible'],'groups':selected,'groupTargets':TARGETS,
                'availableGroupCounts':{k:len(groups[k])for k in TARGETS},'groupShortfalls':{k:TARGETS[k]-len(selected[k])for k in TARGETS if len(selected[k])<TARGETS[k]},
                'mandatoryNotEligible':[t for t in TOP if t not in available], 'approvedProfileUniverseCount':profile_total,
                'evidence':{t:evidence[t]for t in chosen if t in evidence},'publicMetadataInventory':evidence,
                'profileQualityGroupsRequireApprovedGermanCopy':True,'numericSizeEvidenceScope':base['numericSizeEvidenceScope'],'privateOperationalRowsIncluded':False}
        atomic_json(output,result);return result
    finally:store.close()

if __name__=='__main__':
    a=argparse.ArgumentParser(description=__doc__)
    for k in ('state','consumer','decisions','out'):a.add_argument('--'+k,required=True)
    v=a.parse_args();r=create(v.state,v.consumer,v.decisions,v.out)
    print(json.dumps({'stocks':len(r['stocks']),'groupShortfalls':r['groupShortfalls'],'mandatoryNotEligible':r['mandatoryNotEligible']}))
