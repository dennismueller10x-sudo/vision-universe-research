"""Read-only, cohort-bound ledger/export/policy/delivery audit; output counts only.

No initialization, polling, private row dumps or state writes. Exact approved
consumer assets must match production before any delivery counts are claimed.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone, timedelta
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
from urllib.request import Request, urlopen
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from company_intelligence.consumer_usage import filter_for_preview, publisher

ROOT = Path(__file__).resolve().parents[2]
KEYS = ('news', 'earnings', 'events', 'calls', 'materials', 'materialEvents')

def stamp(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).replace(tzinfo=timezone.utc) if len(value) == 10 else datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)
    except (ValueError, TypeError, AttributeError):
        return None

def audit(state, raw, consumer, out, origin=None):
    state, raw, consumer = map(Path, (state, raw, consumer))
    candidate = json.loads((ROOT/'docs/company-intelligence/full-data-release-candidate.json').read_text())
    golden = json.loads((ROOT/'docs/company-intelligence/full-data-consumer-manifest.json').read_text())
    index = json.loads((raw/'index.json').read_text())
    assert index['generation'] == candidate['sourceGeneration']
    assert json.loads((consumer/'manifest.json').read_text()) == golden
    verified = 0
    for path, meta in golden['assets'].items():
        data = (consumer/path).read_bytes()
        assert len(data) == meta['bytes'] and hashlib.sha256(data).hexdigest() == meta['sha256'], 'CONSUMER_INTEGRITY'
        if origin:
            assert origin == 'https://research.visionuniverse.de', 'EXISTING_ORIGIN_REQUIRED'
            req = Request(origin+'/company-intelligence/data/'+path+'?v2-audit='+datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'), headers={'User-Agent':'Vision-Universe-Consumer-Audit/2'})
            with urlopen(req, timeout=30) as response:
                delivered = response.read()
            assert delivered == data, 'LIVE_ASSET_MISMATCH:'+path
            verified += 1
    configured = json.loads((ROOT/'company-intelligence/config/sources.json').read_text())
    rows = []
    now = datetime.now(timezone.utc)
    with sqlite3.connect('file:'+str((state/'state.sqlite').resolve())+'?mode=ro', uri=True) as db:
        sources = {s['sourceId']:s for s in configured}
        sources.update({s['sourceId']:s for (payload,) in db.execute('SELECT payload FROM sources') for s in [json.loads(payload)]})
        for cid, inventory in candidate['inventory'].items():
            ledger = [json.loads(p) for (p,) in db.execute('SELECT payload FROM items WHERE company=? ORDER BY published DESC,id', (cid,))]
            ledger_news = [r for r in ledger if r.get('eventType') == 'NEWS']
            value = json.loads((raw/'snapshots'/index['generation']/(cid+'.json')).read_text())
            filtered, policy = filter_for_preview(value, list(sources.values()))
            final = json.loads((consumer/'snapshots'/golden['generation']/(cid+'.json')).read_text())
            dates = [stamp(n.get('publishedAt') or n.get('publishedDate')) for n in final['news']]
            buckets = Counter('UNDATED' if not d else 'FUTURE' if d>now else 'TODAY' if d.date()==now.date() else '7_DAYS' if (now-d).days<7 else '30_DAYS' if (now-d).days<30 else '90_DAYS' if (now-d).days<90 else 'OLDER' for d in dates)
            losses = []
            if not ledger_news:
                losses.append({'class':'DATA_DOES_NOT_EXIST','stage':'PRIVATE_LEDGER_NEWS','count':0})
            if len(ledger_news)>len(value['news']):
                losses.append({'class':'DATA_EXISTS_BUT_IS_NOT_EXPORTED','stage':'LEDGER_TO_ENGINE_EXPORT','count':len(ledger_news)-len(value['news']),'reason':'ENGINE_SELECTION_OR_DEDUPLICATION; investigate before treating as defect'})
            allowed_ids = {n['newsId'] for n in filtered['news']}
            excluded_reasons = Counter('UNAPPROVED_PUBLISHER' if publisher(n.get('canonicalUrl') or n.get('sourceUrl')) else 'INSECURE_HTTP_LINK_WITHOUT_EXACT_HTTPS_RECONFIRMATION' if str(n.get('canonicalUrl') or n.get('sourceUrl') or '').startswith('http://') else 'NO_VERIFIED_OWNED_HOST' for n in value['news'] if n['newsId'] not in allowed_ids)
            if policy['excluded']['news']:
                losses.append({'class':'DATA_EXISTS_BUT_IS_FILTERED','stage':'SOURCE_USAGE','count':policy['excluded']['news'],'reasons':dict(excluded_reasons),'reason':'SOURCE_POLICY_EXCLUSION; not a transport defect'})
            kept_ids = {n['newsId'] for n in final['news']}
            dropped = [n for n in filtered['news'] if n['newsId'] not in kept_ids]
            cutoff = stamp(value['generatedAt'])-timedelta(days=180)
            retention = sum(bool(stamp(n.get('publishedAt') or n.get('publishedDate') or n.get('observedAt')) and stamp(n.get('publishedAt') or n.get('publishedDate') or n.get('observedAt')) < cutoff) for n in dropped)
            assert retention == len(dropped), 'UNEXPLAINED_CONSUMER_NEWS_LOSS:'+cid
            if len(filtered['news'])>len(final['news']):
                losses.append({'class':'DATA_EXISTS_BUT_IS_NOT_EXPORTED','stage':'APPROVED_CONSUMER_PROJECTION','count':len(filtered['news'])-len(final['news']),'reason':'DETERMINISTIC_180_DAY_RETENTION','verifiedOlderThanRetention':retention})
            rows.append({'companyId':cid,'tickers':inventory['tickers'],'ledgerNews':len(ledger_news),'latestLedgerNews':max((n.get('publishedAt') or n.get('publishedDate') or '' for n in ledger_news),default=None),
                         'engineExportNews':len(value['news']),'policyAllowedNews':len(filtered['news']),'consumerNews':len(final['news']),
                         'productionNews':len(final['news']) if origin else None,'newsFreshness':dict(buckets),
                         'ledgerEventTypes':dict(Counter(k for (k,) in db.execute('SELECT kind FROM events WHERE company=?',(cid,)))),
                         'acceptedModules':{k:len(final.get(k,[])) for k in KEYS},'germanProfile':inventory['germanProfile'],'financials':inventory['financials'],
                         'whatChanged':inventory['whatChanged'],'staleFinancials':inventory['staleFinancials'],'losses':losses})
    result={'schema':1,'status':'PASS','acceptedGeneration':candidate['acceptedGeneration'],'sourceGeneration':index['generation'],'consumerGeneration':golden['generation'],
            'auditedAt':now.isoformat(),'issuers':len(rows),'stocks':sum(len(r['tickers']) for r in rows),'productionAssetHashesVerified':verified,
            'sourceUsagePolicy':golden['sourceUsagePolicy'],'privateOperationalRowsIncluded':False,'ledgerMutations':False,
            'lossClasses':{key:{'issuers':sum(any(l['class']==key for l in r['losses']) for r in rows),'records':sum(l['count'] for r in rows for l in r['losses'] if l['class']==key)} for key in ('DATA_DOES_NOT_EXIST','DATA_EXISTS_BUT_IS_FILTERED','DATA_EXISTS_BUT_IS_NOT_EXPORTED')},'issuersAudit':rows}
    Path(out).parent.mkdir(parents=True,exist_ok=True)
    Path(out).write_text(json.dumps(result,indent=2)+'\n')
    return {k:result[k] for k in ('status','issuers','stocks','productionAssetHashesVerified','lossClasses')}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for k in ('state','raw','consumer','out'):p.add_argument('--'+k,required=True)
    p.add_argument('--origin')
    a=p.parse_args();print(json.dumps(audit(a.state,a.raw,a.consumer,a.out,a.origin)))
