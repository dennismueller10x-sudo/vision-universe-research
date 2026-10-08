"""Apply the reviewed Top-46 facts to a full, freshly restored derivative only.

Never reads credentials, polls sources, initializes a missing ledger or writes the
accepted R2 namespace. Public inputs contain reviewed facts/metadata, not bodies.
"""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.model import load_universe, Resolver, make_item, timestamp
from company_intelligence.profiles import public_profile
from company_intelligence.store import Store, dumps, atomic_json, item_time
from company_intelligence.consumer_usage import filter_for_preview, first_party, publisher
from company_intelligence.acceptance import fingerprint
from current_state_acceptance import database_proof


def reviewed():
    path = ROOT / 'company-intelligence/config/top46-content-review.json'
    value = json.loads(path.read_text())
    golden = json.loads((ROOT / 'docs/company-intelligence/consumer-v2/top46-baseline-manifest.json').read_text())
    if (value.get('schema') != 1 or value.get('scope') != 'EXISTING_PRODUCTION_COHORT_ONLY' or
            value.get('sourceUsagePolicy') != 'OWNED_IR_SEC_METADATA_PREVIEW_V1' or
            value.get('tickers') != golden['tickers'] or len(value['tickers']) != 46 or not timestamp(value.get('asOf'))):
        raise ValueError('EXACT_EXISTING_COHORT_AND_SOURCE_POLICY_REQUIRED')
    if len(value.get('profiles', [])) > 14 or len(value.get('news', [])) > 100 or len(value.get('publicationDates', [])) > 30:
        raise ValueError('CONTENT_REVIEW_BUDGET_EXCEEDED')
    return value, hashlib.sha256(path.read_bytes()).hexdigest()


def identities(identity_root, store):
    companies = load_universe(identity_root)
    sites = json.loads((Path(identity_root) / 'company-intelligence/config/official-sites.json').read_text())
    for c in companies.values():
        seed = sites.get(c.get('cik'))
        proof = store.state('officialSite:' + c['companyId'], {})
        if seed:
            c['officialSites'] = [seed.get('irHomepage') or seed['url']]
        elif proof.get('status') == 'VALIDATED':
            c['officialSites'] = [proof['url']]
    return companies


def untouched(db, cids):
    marks = ','.join('?' for _ in cids)
    out = {}
    for table, column in [('items','company'),('sources','company'),('events','company')]:
        rows = db.execute(f'SELECT * FROM {table} WHERE {column} IS NULL OR {column} NOT IN ({marks}) ORDER BY 1', tuple(cids)).fetchall()
        out[table] = hashlib.sha256(dumps([list(r) for r in rows]).encode()).hexdigest()
    rows = db.execute('SELECT * FROM state ORDER BY key').fetchall()
    protected = [list(r) for r in rows if r[0] != 'latestRun' and not (r[0].startswith('companyProfile:') and r[0].split(':',1)[1] in cids) and not r[0].startswith('top46Content:')]
    out['state'] = hashlib.sha256(dumps(protected).encode()).hexdigest()
    out['event_alias'] = hashlib.sha256(dumps([list(r) for r in db.execute('SELECT * FROM event_alias ORDER BY 1')]).encode()).hexdigest()
    return out


def export(state, identity_root):
    store = Store(Path(state) / 'state.sqlite')
    try:
        review, _ = reviewed()
        value = store.export(identities(identity_root, store), Path(state) / 'public/company-intelligence/data', review['asOf'])
        if value['exportedCompanies'] < 5120:
            raise ValueError('FULL_PRIVATE_UNIVERSE_SHRINK_REJECTED')
        return value
    finally:
        store.close()


def prepare(state, identity_root, evidence):
    state, identity_root, evidence = map(Path, (state, identity_root, evidence))
    if not (state / 'state.sqlite').is_file():
        raise ValueError('EXISTING_FULL_ACCEPTED_LEDGER_REQUIRED')
    review, review_hash = reviewed()
    accepted = json.loads((ROOT / 'company-intelligence/config/accepted-state-handoff.json').read_text())
    proof = {n:database_proof(state/n) for n in accepted['databases']}
    if proof != accepted['databases'] or review['acceptedGeneration'] != accepted['generation']:
        raise ValueError('FULL_ACCEPTED_BASELINE_PROOF_REQUIRED')
    store = Store(state / 'state.sqlite')
    try:
        companies = identities(identity_root, store)
        selected = {cid:c for cid,c in companies.items() if any(l['symbol'] in review['tickers'] for l in c['listings'])}
        if len(selected) != 45:
            raise ValueError('EXACT_45_ISSUERS_REQUIRED')
        current = load_universe(ROOT)
        for cid, company in selected.items():
            if cid not in current or company['listings'] != current[cid]['listings']:
                raise ValueError('CURRENT_MASTER_COHORT_IDENTITY_DRIFT')
        cids = sorted(selected)
        before = untouched(store.db, cids)
        # Previously approved Chemed/Affirm call corrections become audited
        # derivative records. Their generation guard remains on the baseline.
        from company_intelligence.consumer_event_review import apply_review
        configured = json.loads((ROOT/'company-intelligence/config/sources.json').read_text())
        old_sources = configured + [json.loads(r[0]) for r in store.db.execute('SELECT payload FROM sources')]
        for cid in cids:
            raw = store.company_payload(companies[cid], accepted['generatedAt'])
            safe, _ = filter_for_preview(raw, old_sources)
            fixed = apply_review(safe, source_generation='2b1a4bcdffb54e9b40a23a98')
            old_ids = {e['eventId'] for e in safe['events']}
            for event in fixed['events']:
                if event['eventId'] not in old_ids:
                    store.event(event, review['asOf'])
        for row in review['profiles']:
            cid = row['companyId']; p = row['profile']
            if cid not in selected or p.get('language') != 'de' or row.get('reviewStatus') != 'ACCEPTED_FACTUAL_GERMAN_PARAPHRASE' or not public_profile(p,cid,review['asOf']):
                raise ValueError('UNREVIEWED_PROFILE_OR_WRONG_ISSUER')
            store.set_state('companyProfile:'+cid,p)
            store.audit(review['asOf'],cid,'TOP46_SOURCE_BACKED_GERMAN_PROFILE',reviewHash=review_hash,sourceHashes=[s['contentHash'] for s in p['sources']])
        for row in review.get('profileWebsites', []):
            cid = row['companyId']
            if cid not in selected or row != review['profileWebsites'][0] or cid != 'iss_cik_0000804328' or row['url'] != 'https://www.qualcomm.com/':
                raise ValueError('UNREVIEWED_WEBSITE_CORRECTION')
            profile = store.state('companyProfile:'+cid)
            if not profile or profile.get('officialWebsite') != row['priorUrl']:
                raise ValueError('WEBSITE_CORRECTION_PRIOR_MISMATCH')
            store.set_state('companyProfile:'+cid,{**profile,'officialWebsite':row['url']})
            store.audit(review['asOf'],cid,'INCORRECT_THIRD_PARTY_PROFILE_WEBSITE_CORRECTED',priorUrl=row['priorUrl'],url=row['url'],ownershipEvidenceUrl=row['ownershipEvidenceUrl'])
        sources = {s['sourceId']:s for s in review['sources']}
        for s in sources.values():
            if s.get('companyId') not in selected or not first_party(s,s['companyId']) or publisher(s['url']):
                raise ValueError('UNAPPROVED_SOURCE_CLASS_OR_ISSUER')
            store.source(s)
        resolver = Resolver(selected)
        for cid in cids:
            consumer_path = ROOT/'quant/data/sec/consumer'/('CIK'+companies[cid]['cik']+'.json')
            if consumer_path.is_file():
                data=json.loads(consumer_path.read_text())
                if data.get('cik')==companies[cid]['cik'] and data.get('name'):
                    resolver.add_alias(cid,data['name'])
        outcomes = {}
        for row in review['news']:
            source = sources[row['sourceId']]
            if row['companyId'] != source['companyId'] or publisher(row['url']):
                raise ValueError('NEWS_SOURCE_ISSUER_OR_POLICY_MISMATCH')
            matches = [m for m in resolver.resolve(row,source) if m['companyId']==row['companyId']]
            if len(matches)!=1:
                raise ValueError('REVIEWED_NEWS_IDENTITY_NOT_RESOLVED:'+row['headline'])
            item = make_item(row,source,matches[0],review['asOf'])
            safe, _ = filter_for_preview({'companyId':row['companyId'],'news':[item]},list(sources.values()))
            if len(safe['news'])!=1:
                raise ValueError('NEW_ITEM_EXCLUDED_BY_UNCHANGED_POLICY')
            outcome=store.ingest(item);outcomes[outcome]=outcomes.get(outcome,0)+1
        from company_intelligence.earnings import valid_date
        for row in review['publicationDates']:
            old = store.db.execute('SELECT payload FROM items WHERE id=?',(row['newsId'],)).fetchone()
            if not old:
                raise ValueError('DATE_CORRECTION_ID_MISSING')
            item=json.loads(old[0])
            if item['companyId']!=row['companyId'] or item['canonicalUrl']!=row['url'] or row['companyId'] not in selected or item.get('publishedAt') or item.get('publishedDate') or not valid_date(row['publishedDate']) or row['publishedDate']>review['asOf'][:10]:
                raise ValueError('DATE_CORRECTION_NOT_EXACT_UNKNOWN_ARTICLE')
            item.update(publishedDate=row['publishedDate'],date=row['publishedDate'],timestampPrecision='DATE_ONLY',publicationDateEvidence={k:row[k] for k in ('method','sourceContentHash','corroboratedByJsonLd')})
            with store.db:
                store.db.execute('UPDATE items SET published=?,payload=? WHERE id=?',(item_time(item),dumps(item),row['newsId']))
            store.audit(review['asOf'],row['companyId'],'EXPLICIT_FIRST_PARTY_PUBLICATION_DAY_RECOVERED',newsId=row['newsId'],priorPrecision='SOURCE_UPDATED_TIME',sourceContentHash=row['sourceContentHash'],publishedDate=row['publishedDate'])
        for event in review['events']:
            if event['companyId'] not in selected or event.get('confirmationStatus')!='CONFIRMED' or event.get('sourceId') not in sources:
                raise ValueError('UNREVIEWED_EVENT')
            safe,_=filter_for_preview({'companyId':event['companyId'],'events':[event]},list(sources.values()))
            if len(safe['events'])!=1:
                raise ValueError('UNAPPROVED_EVENT_SOURCE')
            store.event(event,review['asOf'])
        if before != untouched(store.db,cids):
            raise ValueError('UNRELATED_PRIVATE_RECORDS_CHANGED')
        result=store.export(companies,state/'public/company-intelligence/data',review['asOf'])
        if result['exportedCompanies']<accepted['exportedCompanies']:
            raise ValueError('FULL_PRIVATE_UNIVERSE_SHRINK_REJECTED')
        store.set_state('latestRun',{'generatedAt':review['asOf'],'export':result,'basis':'FULL_ACCEPTED_STATE_PLUS_REVIEWED_TOP46_CONTENT','acceptedBaseline':accepted['generation']})
        store.set_state('top46Content:'+review_hash,{'reviewHash':review_hash,'acceptedBaseline':accepted['generation'],'cohortIssuers':45,'cohortStocks':46})
    finally:
        store.close()
    after={n:database_proof(state/n) for n in accepted['databases']}
    if after['archive.sqlite'] != proof['archive.sqlite']:
        raise ValueError('ARCHIVE_HISTORY_CHANGED')
    for table in ('items','events','sources','audit','state'):
        if after['state.sqlite']['tables'][table]['count']<proof['state.sqlite']['tables'][table]['count']:
            raise ValueError('PRIVATE_TABLE_SHRINK_REJECTED:'+table)
    payload={'schema':1,'status':'FULL_ACCEPTED_DERIVATIVE_CONTENT_PREPARED','reviewHash':review_hash,'asOf':review['asOf'],'acceptedBaseline':accepted['generation'],'namespace':'content-top46-'+review_hash[:24],'export':result,'fingerprint':fingerprint(state),'databases':after,'unchangedOutsideCohort':True,'acceptedR2NamespaceWritten':False,'newsOutcomes':outcomes,'profileUpdates':len(review['profiles']),'publicationDateCorrections':len(review['publicationDates']),'privateOperationalRowsIncluded':False}
    atomic_json(evidence,payload)
    return payload


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['prepare','export']);p.add_argument('--state',required=True,type=Path);p.add_argument('--identity-root',required=True,type=Path);p.add_argument('--evidence',type=Path)
    a=p.parse_args();value=prepare(a.state,a.identity_root,a.evidence) if a.command=='prepare' else export(a.state,a.identity_root)
    print(json.dumps({k:v for k,v in value.items() if k in ('status','namespace','export','newsOutcomes','profileUpdates','publicationDateCorrections','generation','exportedCompanies')}))
