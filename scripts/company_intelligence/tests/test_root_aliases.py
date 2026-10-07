import copy
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from company_intelligence.root_aliases import root_alias_candidates, validate_root_aliases
from company_intelligence.discovery_batch import run, persist
from company_intelligence.inventory_sweep import select, record, progress
from company_intelligence.store import Store
from company_intelligence.transport import PublicHTTP, SourceError, BudgetExhausted
from test_engine import company, NOW


class RootAliasesTests(unittest.TestCase):
    def setUp(self):
        self.company = company('Example Devices Inc.', 'EXDV', '0000000001')
        self.company['officialSites'] = []
        self.value = {'status': 'AMBIGUOUS', 'candidates': [
            {'url': 'https://devices.example/', 'evidence': 'LOGO'},
            {'url': 'https://www.devices.example/', 'evidence': 'PUBLISHER'}]}
        self.body = b'<title>Example Devices Inc.</title><h1>Example Devices</h1><footer>Copyright 2026 Example Devices Inc.</footer>'

    def http(self, outcomes=None):
        owner = self
        class HTTP:
            def __init__(self): self.calls = []
            def get(self, url, **kwargs):
                self.calls.append(url)
                result = (outcomes or {}).get(url, {})
                if isinstance(result, Exception): raise result
                body = result.get('body', owner.body)
                return {'body': body, 'finalUrl': result.get('finalUrl', url),
                        'sha256': hashlib.sha256(body).hexdigest(), 'redirects': result.get('redirects', [])}
        return HTTP()

    def test_scope_only_admits_advertised_bare_www_roots_and_retains_originals(self):
        value = copy.deepcopy(self.value)
        value['candidates'].append({'url': 'http://devices.example/', 'evidence': 'OTHER'})
        original = copy.deepcopy(value)
        routes = root_alias_candidates(value)
        self.assertEqual([r['url'] for r in routes], ['https://devices.example/', 'https://www.devices.example/'])
        self.assertEqual(value, original)
        for other in ['https://www.devices.example/company', 'https://www.devices.example/?issuer=other',
                      'https://ir.devices.example/', 'https://www.devices-other.example/',
                      'https://www.devices.example:444/', 'https://www.devices.example:bad/',
                      'https://[broken/']:
            with self.subTest(other=other):
                self.assertEqual(root_alias_candidates({'status': 'AMBIGUOUS', 'candidates':
                    [self.value['candidates'][0], {'url': other}]}), [])

    def test_every_root_must_independently_prove_owner_with_retained_hashes(self):
        h = self.http()
        site = validate_root_aliases(self.company, self.value['candidates'], h, NOW)
        self.assertEqual(h.calls, [r['url'] for r in self.value['candidates']])
        proof = site['ownershipEvidence']['rootAliasVerification']
        self.assertEqual(len(proof['aliases']), 2)
        self.assertTrue(all(p['contentHash'] == hashlib.sha256(self.body).hexdigest() for p in proof['aliases']))
        self.assertTrue(all(p['ownershipEvidence'] and p['evidence'] for p in proof['aliases']))
        self.assertIn('INDEPENDENTLY_VERIFIED_WWW_ROOT_ALIASES', site['evidence'])

    def test_other_root_owner_conflict_never_accepts_first_valid_root(self):
        wrong = b'<title>Example Devices Inc.</title><footer>Copyright 2026 Unrelated Holdings Inc.</footer>'
        h = self.http({'https://www.devices.example/': {'body': wrong}})
        with self.assertRaisesRegex(SourceError, 'CONFLICTING_COPYRIGHT_OWNER') as error:
            validate_root_aliases(self.company, self.value['candidates'], h, NOW)
        self.assertEqual(len(error.exception.ownershipEvidence['verifiedRootAliases']), 1)
        self.assertEqual(len(h.calls), 2)

    def test_unavailable_root_preserves_partial_proof_without_dns_alias_fallback(self):
        h = self.http({'https://www.devices.example/': SourceError('DNS_UNAVAILABLE')})
        with self.assertRaisesRegex(SourceError, 'DNS_UNAVAILABLE') as error:
            validate_root_aliases(self.company, self.value['candidates'], h, NOW)
        self.assertEqual(len(h.calls), 2)
        self.assertEqual(len(error.exception.ownershipEvidence['verifiedRootAliases']), 1)

    def test_different_paths_or_cross_company_destinations_remain_withheld(self):
        for final in ['https://www.devices.example/another-path', 'https://parent.example/']:
            with self.subTest(final=final):
                h = self.http({'https://www.devices.example/': {'finalUrl': final, 'redirects': [final]}})
                with self.assertRaisesRegex(SourceError, 'REDIRECT'):
                    validate_root_aliases(self.company, self.value['candidates'], h, NOW)

    def test_frozen_cohort_verifies_and_checkpoints_aliases_without_changing_candidates(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp)/'state.sqlite'); c = self.company; cid = c['companyId']; cs = {cid: c}
            s.set_state('siteCandidates:'+cid, self.value)
            s.set_state('inventorySweep:aliases:domains:inventory', [cid])
            chosen, candidates = select(cs, s, NOW, 'aliases', 'domains')
            self.assertEqual([x['companyId'] for x in chosen], [cid])
            owner = self
            def get(client, url, **kwargs):
                client._wait(url)
                return owner.http().get(url)
            def counted(client, url):
                if client.requests >= client.budget: raise BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')
                client.requests += 1
            def checkpoint(row):
                persist([row], s, cs, NOW); record(row, s, NOW, 'aliases', 'domains')
            with patch.object(PublicHTTP, 'get', get), patch.object(PublicHTTP, '_wait', counted):
                rows = run(chosen, candidates, PublicHTTP(Path(tmp)/'http'), NOW, 8, 60,
                           workers=1, domain_only=True, admission_interval=.5, on_result=checkpoint)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['status'], 'VALIDATED'); self.assertEqual(rows[0]['requests'], 2)
            self.assertEqual(progress(s, 'aliases', 'domains')['pending'], 0)
            self.assertEqual(s.state('siteCandidates:'+cid), self.value)
            self.assertEqual(select(cs, s, NOW, 'aliases', 'domains')[0], [])
            s.close()

    def test_cooldown_or_offline_selection_never_resolves_alias_ambiguity(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp)/'state.sqlite'); cid = self.company['companyId']; cs = {cid: self.company}
            s.set_state('siteCandidates:'+cid, self.value)
            self.assertEqual(select(cs, s, NOW, 'offline', 'domains', allow_network=False)[0], [])
            self.assertEqual(progress(s, 'offline', 'domains')['pending'], 1)
            s.set_state('officialSite:'+cid, {'status': 'DEFERRED', 'reason': 'HTTP_503', 'retryAfter': '2026-12-01T00:00:00Z'})
            self.assertEqual(select(cs, s, NOW, 'cooldown', 'domains')[0], [])
            self.assertEqual(progress(s, 'cooldown', 'domains')['statuses'], {'COOLDOWN': 1})
            self.assertEqual(s.state('siteCandidates:'+cid), self.value); s.close()

    def test_shared_request_exhaustion_cannot_promote_partially_verified_roots(self):
        owner = self
        def get(client, url, **kwargs):
            client._wait(url)
            return owner.http().get(url)
        def counted(client, url):
            if client.requests >= client.budget: raise BudgetExhausted('NETWORK_BUDGET_EXHAUSTED')
            client.requests += 1
        with tempfile.TemporaryDirectory() as tmp, patch.object(PublicHTTP, 'get', get), patch.object(PublicHTTP, '_wait', counted):
            rows = run([self.company], {self.company['companyId']: self.value}, PublicHTTP(tmp),
                       NOW, 1, 60, workers=1, domain_only=True, admission_interval=.5)
        self.assertEqual(rows[0]['status'], 'DEFERRED'); self.assertEqual(rows[0]['requests'], 1)
        self.assertNotIn('site', rows[0]); self.assertEqual(rows[0]['reason'], 'NETWORK_BUDGET_EXHAUSTED')
        self.assertEqual(len(rows[0]['failureEvidence']['verifiedRootAliases']), 1)
