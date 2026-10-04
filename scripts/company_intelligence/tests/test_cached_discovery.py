import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from company_intelligence.cached_discovery import CachedHTTP, replay, preserve_ir
from company_intelligence.store import Store
from company_intelligence.transport import BudgetExhausted
from test_engine import company, NOW


class CachedDiscoveryTests(unittest.TestCase):
    def cache(self, http, url, body, checked=1000):
        meta, payload = http._paths(url)
        payload.write_bytes(body)
        meta.write_text(json.dumps({'url':url,'finalUrl':url,'checked':checked,'sha256':hashlib.sha256(body).hexdigest()}))

    def test_offline_reads_are_bounded_current_and_hash_verified_without_outbound_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            initial = CachedHTTP(tmp,clock=lambda:1000)
            for name, checked in [('good',1000),('expired',-90000),('future',2000),('corrupt',1000)]:
                self.cache(initial,'https://issuer.example/'+name,b'evidence',checked)
            initial._paths('https://issuer.example/corrupt')[1].write_bytes(b'changed')
            with patch('urllib.request.OpenerDirector.open',side_effect=AssertionError('OUTBOUND')):
                cached=CachedHTTP(tmp,clock=lambda:1000)
                self.assertEqual(cached.get('https://issuer.example/good')['body'],b'evidence')
                for name in ('expired','future','corrupt','missing'):
                    with self.assertRaises(BudgetExhausted):cached.get('https://issuer.example/'+name)
                self.assertEqual(cached.requests,0)

    def test_missing_page_has_durable_resumable_outcome_and_retains_live_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            s=Store(Path(tmp)/'state.sqlite');c=company();c['officialSites']=[];cid=c['companyId']
            prior={'status':'DEFERRED','reason':'HTTP_503','retryAfter':'2099-01-01T00:00:00Z'}
            s.set_state('officialSite:'+cid,prior)
            s.set_state('siteCandidates:'+cid,{'status':'CANDIDATE','candidates':[{'url':'https://apple.com/','evidence':'candidate'}]})
            http=CachedHTTP(Path(tmp)/'http')
            first=replay(Path(tmp),s,{cid:c},'second',http=http)
            second=replay(Path(tmp),s,{cid:c},'second',http=http)
            self.assertEqual(first['outcomes'],{'CACHE_ONLY_PENDING_NETWORK':1})
            self.assertEqual(second['processedThisBatch'],0)
            self.assertEqual(s.state('officialSite:'+cid),prior)
            self.assertEqual(first['networkRequests'],0)
            with patch('company_intelligence.cached_discovery.export_revision',return_value=b'new-verifier'):
                updated=replay(Path(tmp),s,{cid:c},'second')
            self.assertEqual(updated['processedThisBatch'],1)
            self.assertEqual(s.state('officialSite:'+cid),prior);s.close()

    def test_cached_ir_documents_survive_optional_missing_pages_and_keep_live_health(self):
        with tempfile.TemporaryDirectory() as tmp:
            s=Store(Path(tmp)/'state.sqlite');c=company();cid=c['companyId'];url='https://apple.com/investors'
            s.set_state('officialSite:'+cid,{'status':'VALIDATED','url':url})
            prior={'retryAfter':'2099-01-01T00:00:00Z','lastFailure':NOW,'reason':'HTTP_503'}
            s.set_state('ir:'+cid,prior)
            initial=CachedHTTP(Path(tmp)/'http')
            self.cache(initial,url,b'<title>Apple Inc. Investors</title><a href="/deck.pdf">Investor Presentation</a><a href="/news">Press Releases</a>',initial.clock())
            report=replay(Path(tmp),s,{cid:c},'cached-ir',lane='ir')
            state=s.state('ir:'+cid)
            self.assertEqual(report['outcomes'],{'CACHED_PARTIAL':1})
            self.assertEqual(state['retryAfter'],prior['retryAfter']);self.assertNotIn('lastSuccess',state)
            self.assertEqual(state['configurations'][0]['documents'][0]['type'],'PRESENTATION')
            self.assertEqual(report['networkRequests'],0);s.close()

    def test_new_cache_generation_reopens_missing_evidence_and_validates_exact_owner(self):
        with tempfile.TemporaryDirectory() as tmp:
            s=Store(Path(tmp)/'state.sqlite');c=company();cid=c['companyId'];c['officialSites']=[]
            s.set_state('officialSite:'+cid,{'status':'REJECTED','reason':'OFFICIAL_SITE_CANDIDATE_OWNER_NOT_VALIDATED'})
            s.set_state('siteCandidates:'+cid,{'status':'CANDIDATE','candidates':[{'url':'https://apple.com/','evidence':'candidate'}]})
            replay(Path(tmp),s,{cid:c},'second')
            http=CachedHTTP(Path(tmp)/'http')
            self.cache(http,'https://apple.com/',b'<title>Apple Inc.</title><footer>Copyright 2026 Apple Inc. All rights reserved.</footer>',http.clock())
            report=replay(Path(tmp),s,{cid:c},'second')
            self.assertEqual(report['recovered'],[cid]);self.assertEqual(report['networkRequests'],0)
            self.assertEqual(s.state('officialSite:'+cid)['status'],'VALIDATED');s.close()
