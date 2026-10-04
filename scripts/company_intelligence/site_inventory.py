"""Consume existing website discovery outputs; never replace Company Master.

The logo site's ticker-keyed cache lacks a per-row CIK. It is candidate evidence,
not ingestion authority. Current unambiguous master membership, safe URL,
compatible SEC credit CIK and share-class agreement are required before a
candidate can enter the existing corporate ownership validator.
"""
import json
import hashlib
import re
from pathlib import Path
from urllib.parse import urlsplit
from .model import canonical_url, domain

VERSION = 'site-inventory-1.1.0'

ALLOWED_VIA = {'WIKIDATA_CIK','WIKIDATA_NAME','WIKIDATA_TICKER','SEC_STAMMDATEN','SEC_10K','SEC_20F','SEC_40F','SEC_F1','SEC_10Q','SEC_8K','SEC_424B4'}
EXCLUDED = re.compile(r'(^|\.)(sec\.gov|wikidata\.org|wikipedia\.org|facebook\.com|linkedin\.com|youtube\.com|x\.com|google\.com|yahoo\.com|bloomberg\.com|reuters\.com)$')


def candidate_routes(value):
    """Collapse only routes the verifier already treats as identical.

    Original candidate/provenance rows stay in the ledger. Different hosts,
    paths and non-tracking queries remain distinct ownership candidates.
    """
    routes = {}
    for index, candidate in enumerate(value.get('candidates', [])):
        url = canonical_url(candidate.get('url'))
        normalized = re.sub(r'^http:', 'https:', url) if url else None
        routes.setdefault(normalized or ('INVALID', index),
                          {**candidate, 'url': normalized} if normalized else candidate)
    return list(routes.values())


def inventory(root, companies):
    root=Path(root)
    path=root/'discover/logos/sites.json'
    if not path.exists():return {}, None
    data=json.loads(path.read_text());credits_path=root/'discover/logos/credits.json'
    credits=json.loads(credits_path.read_text()).get('credits',{}) if credits_path.exists() else {}
    symbols={}
    for cid,c in companies.items():
        for listing in c['listings']:symbols.setdefault(listing['symbol'],set()).add(cid)
    found={}
    for symbol,row in data.get('sites',{}).items():
        if not isinstance(row,dict) or row.get('via') not in ALLOWED_VIA or len(symbols.get(symbol,set()))!=1:continue
        cid=next(iter(symbols[symbol]));c=companies[cid];url=canonical_url(row.get('url'))
        if not url:continue
        host=urlsplit(url).hostname
        if not host or EXCLUDED.search(host) or re.fullmatch(r'[\d.:]+',host) or host.endswith(('.local','.internal','.localhost')) or host=='localhost':continue
        credit=credits.get(symbol,{})
        sec=re.search(r'https://www\.sec\.gov/Archives/edgar/data/(\d+)/',credit.get('page',''))
        if sec and (not c.get('cik') or sec[1].zfill(10)!=c['cik']):continue
        hint = 'Q4' if re.search(r'q4cdn\.com|q4web\.com|q4inc\.com', str(credit), re.I) else 'STOCKPR' if re.search(r'equisolve\.com|stockpr', str(credit), re.I) else 'GCS' if re.search(r'gcs-web\.com', str(credit), re.I) else None
        found.setdefault(cid,{})[domain(url)]={'platformHint':hint, 'url':url,'evidence':'EXISTING_LOGO_SITE_INVENTORY:'+row['via'],
            'sourcePath':'discover/logos/sites.json','sourceSymbol':symbol,'sourceGeneratedAt':data.get('generatedAt'),
            'identityState':'CURRENT_MASTER_SYMBOL_CANDIDATE','confidence':.8}
    return {cid:{'status':'CANDIDATE' if len(sites)==1 else 'AMBIGUOUS','candidates':list(sites.values())} for cid,sites in found.items()},data.get('generatedAt')


def import_inventory(root,companies,store,now):
    candidates,generation=inventory(root,companies)
    identity_hash=hashlib.sha256(json.dumps({cid:{'names':c.get('names'), 'symbols':sorted(l['symbol'] for l in c['listings'])} for cid,c in sorted(companies.items())},sort_keys=True).encode()).hexdigest()
    prior=store.state('siteInventoryImport',{})
    if prior.get('importVersion')==VERSION and prior.get('sourceGeneration')==generation and prior.get('identityHash')==identity_hash:return prior
    for cid,value in candidates.items():
        current=store.state('siteCandidates:'+cid,{})
        # Different independent domains are a conflict, not a reason to pick the
        # easier feed. Existing validated sites remain untouched.
        all_candidates={domain(c['url']):c for c in current.get('candidates',[]) if canonical_url(c.get('url'))}
        all_candidates.update({domain(c['url']):c for c in value['candidates']})
        store.set_state('siteCandidates:'+cid,{'status':'CANDIDATE' if len(all_candidates)==1 else 'AMBIGUOUS',
                       'candidates':list(all_candidates.values()),'checkedAt':now})
    result={'identityHash':identity_hash,'importVersion':VERSION,'sourceGeneration':generation,'issuerCount':len(companies),'candidateIssuers':len(candidates),'importedAt':now,
            'networkRequests':0,'interpretation':'Candidate URLs only; existing ownership validator required.'}
    store.set_state('siteInventoryImport',result)
    return result
