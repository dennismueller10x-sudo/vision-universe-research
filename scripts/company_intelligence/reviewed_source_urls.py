"""Exact existing-item HTTPS corrections from reviewed public feed sightings.

No source registration, ownership grant, new news, body republication, network
request or discovery occurs. Independent native HTTP observations are explicit;
a GitHub-runner outage remains an outage, never a fabricated successful poll.
"""
from collections import Counter
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import re
from .consumer_usage import first_party, publisher
from .model import canonical_url, normalize, timestamp, within_domain, make_item
from .store import item_time
ROOT=Path(__file__).resolve().parents[2]


def apply(store, companies, now, review=None):
    if review is None:
        path=ROOT/'company-intelligence/config/reviewed-source-url-observations.json'
        if not path.is_file():return {'correctedItems':0,'updatedIssuerIds':[],'reasons':{}}
        review=json.loads(path.read_text())
    if (review.get('schema')!=1 or review.get('sourceUsagePolicy')!='OWNED_IR_SEC_METADATA_PREVIEW_V1'
            or review.get('scope')!='EXACT_EXISTING_REGISTERED_ISSUER_NEWS_URL_RECONFIRMATION_ONLY'
            or not isinstance(review.get('observations'),list) or len(review['observations'])>10):
        raise ValueError('INVALID_REVIEWED_SOURCE_URL_POLICY')
    counts=Counter();updated=set();sources=store.sources()
    for observation in review['observations']:
        cid=observation.get('companyId');seen=timestamp(observation.get('observedAt'));digest=observation.get('bodyHash','')
        if (cid not in companies or not seen or seen>now or observation.get('method')!='NATIVE_PUBLIC_HTTP_ROBOTS_CHECKED_RSS'
                or not re.fullmatch(r'[a-f0-9]{64}',digest) or not isinstance(observation.get('items'),list)
                or len(observation['items'])>100):counts['INVALID_OBSERVATION']+=1;continue
        key='reviewedSourceUrlObservation:'+hashlib.sha256(json.dumps(observation,sort_keys=True).encode()).hexdigest()
        if store.state(key):counts['ALREADY_APPLIED']+=1;continue
        if seen<(datetime.fromisoformat(now.replace('Z','+00:00'))-timedelta(days=7)).isoformat().replace('+00:00','Z'):
            counts['OBSERVATION_EXPIRED']+=1;continue
        owner=store.state('officialSite:'+cid,{})
        if owner.get('status')!='VALIDATED':counts['OWNER_NOT_CURRENTLY_ACCEPTED']+=1;continue
        candidates=[s for s in sources if s.get('url')==observation.get('sourceUrl') and s.get('active')
                    and s.get('type')=='IR_FEED' and first_party(s,cid) and not publisher(s.get('url'))]
        if len(candidates)!=1:counts['EXACT_REGISTERED_SOURCE_REQUIRED']+=1;continue
        source=candidates[0];changed=0
        for sighting in observation['items']:
            url=canonical_url(sighting.get('url'));published=timestamp(sighting.get('publishedAt'));headline=sighting.get('headline')
            if (not url or not url.startswith('https://') or publisher(url) or not published or published>seen
                    or not isinstance(headline,str) or not headline
                    or not any(within_domain(url,site)for site in source.get('allowedSites',[]))):
                counts['INVALID_ITEM_SIGHTING']+=1;continue
            old_url='http://'+url[8:]
            old=[json.loads(r[0])for r in store.db.execute('SELECT payload FROM items WHERE company=? AND published=?',(cid,published))
                 if json.loads(r[0]).get('canonicalUrl')==old_url and normalize(json.loads(r[0]).get('headline',''))==normalize(headline)
                 and json.loads(r[0]).get('publishedAt')==published]
            if len(old)!=1:counts['EXACT_EXISTING_ITEM_REQUIRED']+=1;continue
            item=make_item({'headline':headline,'url':url,'publishedAt':published},source,
                           {'companyId':cid,'confidence':1.0,'evidence':['VERIFIED_FIRST_PARTY_SOURCE','EXACT_REVIEWED_NATIVE_FEED_URL_SIGHTING']},seen)
            item['provenance'][0].update(observationBodyHash=digest,observationMethod=observation['method'])
            result=store.ingest(item)
            saved=json.loads(store.db.execute('SELECT payload FROM items WHERE id=?',(old[0]['newsId'],)).fetchone()[0])
            if result!='DUPLICATE' or saved['canonicalUrl']!=url or saved['newsId']!=old[0]['newsId'] or item_time(saved)!=published:
                raise ValueError('EXACT_SOURCE_URL_CORRECTION_IDENTITY_FAILED')
            store.audit(now,cid,'EXACT_REVIEWED_SOURCE_URL_CORRECTED',newsId=saved['newsId'],bodyHash=digest,observedAt=seen)
            changed+=1
        if changed:
            store.set_state(key,{'status':'APPLIED','correctedItems':changed,'appliedAt':now,'observationBodyHash':digest})
            counts['CORRECTED_EXISTING_ITEMS']+=changed;updated.add(cid)
    return {'correctedItems':counts['CORRECTED_EXISTING_ITEMS'],'updatedIssuerIds':sorted(updated),'reasons':dict(counts),
            'newSourcesRegistered':0,'newItemsCreated':0,'githubSourcePollSuccessClaimed':False}
