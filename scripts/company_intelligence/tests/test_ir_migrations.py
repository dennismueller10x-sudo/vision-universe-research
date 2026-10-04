import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from company_intelligence.feeds import discover_ir
from company_intelligence.discovery_batch import run, persist
from company_intelligence.transport import PublicHTTP, SourceError, BudgetExhausted
from company_intelligence.store import Store
from company_intelligence.cached_discovery import replay
from company_intelligence.inventory_sweep import prefix
from test_engine import company, NOW

ROOT='https://apple.com/'
OLD='https://old-ir.example/investors'
NEW='https://new-ir.example/investors'


class HTTP:
    def __init__(self, owner='Apple Inc.', chain=True, budget_legal=False):
        self.owner=owner;self.chain=chain;self.calls=[];self.budget_legal=budget_legal
    def get(self,url,**kwargs):
        self.calls.append(url)
        if url==ROOT:return {'body':b'<title>Apple Inc.</title><a href="https://old-ir.example/investors">Investors</a><a href="/prior.pdf">Investor Presentation</a>','finalUrl':ROOT}
        if url==OLD:
            body=('<title>Apple Investors</title><footer>Copyright 2026 '+self.owner+'. All rights reserved.</footer><a href="/deck.pdf">Investor Presentation</a>').encode()
            if self.budget_legal:body=b'<title>Apple Investors</title><a href="/about">About</a>'
            return {'body':body,'finalUrl':NEW,'redirects':[OLD] if self.chain else []}
        if self.budget_legal:raise BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')
        raise SourceError('HTTP_404')


class IRMigrationTests(unittest.TestCase):
    def test_cached_ir_conflict_cannot_replace_separately_verified_root_outcome(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=company();cid=c['companyId'];s=Store(Path(tmp)/'state.sqlite');prior={'status':'VALIDATED','url':ROOT,'contentHash':'original-proof'}
            s.set_state('officialSite:'+cid,prior);s.set_state(prefix('cached-conflict','ir')+'inventory',[cid])
            http=HTTP(owner='Other Research LLC');http.generation='test';http.requests=0;http.stats={}
            result=replay(Path(tmp),s,{cid:c},'cached-conflict',lane='ir',http=http)
            self.assertEqual(result['outcomes'],{'CACHED_REJECTED':1})
            self.assertEqual(s.state('officialSite:'+cid),prior)
            self.assertEqual(s.state('ir:'+cid)['configurations'][0]['documents'][0]['url'],ROOT+'prior.pdf');s.close()

    def test_independent_destination_owner_recovers_linked_ir_migration_without_refetch(self):
        http=HTTP();_,configs=discover_ir(company(),ROOT,http,NOW)
        ir=next(c for c in configs if c['irHomepage']==NEW)
        self.assertEqual(ir['pageRole'],'IR');self.assertEqual(ir['documents'][0]['type'],'PRESENTATION')
        self.assertEqual(ir['redirectEvidence']['fromUrl'],OLD)
        self.assertEqual(http.calls.count(OLD),1)
        self.assertIn('Apple Inc.',ir['ownershipEvidence']['companyNames'])

    def test_wrong_owner_or_missing_chain_keeps_only_previously_trusted_root_documents(self):
        for http in (HTTP(owner='Other Research LLC'),HTTP(chain=False)):
            with self.assertRaisesRegex(SourceError,'IR_REDIRECT_REQUIRES_REVALIDATION') as caught:
                discover_ir(company(),ROOT,http,NOW)
            configs=caught.exception.discoveryConfigurations
            self.assertEqual(len(configs),1);self.assertEqual(configs[0]['irHomepage'],ROOT)
            self.assertEqual(configs[0]['documents'][0]['url'],ROOT+'prior.pdf')
            self.assertFalse(any(NEW in c['irHomepage'] for c in configs))

    def test_budget_in_destination_legal_evidence_walk_remains_budget_deferral(self):
        with self.assertRaises(BudgetExhausted) as caught:discover_ir(company(),ROOT,HTTP(budget_legal=True),NOW)
        self.assertEqual(caught.exception.discoveryConfigurations[0]['irHomepage'],ROOT)

    def test_batch_retains_trusted_documents_after_unresolved_redirect_and_does_not_revoke_domain(self):
        with self.assertRaises(SourceError) as caught:discover_ir(company(),ROOT,HTTP(owner='Other Research LLC'),NOW)
        with tempfile.TemporaryDirectory() as tmp:
            c=company();s=Store(Path(tmp)/'state.sqlite')
            s.set_state('officialSite:'+c['companyId'],{'status':'VALIDATED','url':ROOT})
            with patch('company_intelligence.discovery_batch.discover_ir',side_effect=caught.exception):
                results=run([c],{},PublicHTTP(Path(tmp)/'http'),NOW,12,60)
            persist(results,s,{c['companyId']:c},NOW)
            self.assertEqual(results[0]['status'],'DEGRADED')
            self.assertEqual(s.state('officialSite:'+c['companyId'])['status'],'VALIDATED')
            self.assertTrue(s.state('ir:'+c['companyId'])['partialDiscovery'])
            self.assertEqual(s.state('ir:'+c['companyId'])['configurations'][0]['documents'][0]['url'],ROOT+'prior.pdf');s.close()
