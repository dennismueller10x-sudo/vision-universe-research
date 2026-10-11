import unittest
from company_intelligence.universe_audit import private_inventory

class PrivateInventoryTests(unittest.TestCase):
    def test_master_only_sources_and_listings_do_not_inflate_private_coverage(self):
        companies = {'private': {'listings': [1, 2]}, 'master': {'listings': [3, 4, 5]}}
        current = {'private': {'listings': [1]}, 'master': {'listings': [3, 4, 5]}}
        eligibility = {'issuers': {
            'private': {'hasPrivatePayload': True, 'profileState': 'GERMAN_APPROVED', 'financialState': 'STALE', 'sourceState': 'NO_APPROVED_SOURCE', 'moduleReasons': {'calls': 'NO_VALID_MEANINGFUL_CONTENT'}},
            'master': {'hasPrivatePayload': False, 'profileState': 'NO_SAFE_PROFILE_SOURCE', 'sourceState': 'POLLABLE_APPROVED', 'moduleReasons': {'profile': 'NO_SAFE_PROFILE_SOURCE'}},
        }}
        r = private_inventory({'privateListingCount': 5}, eligibility, companies, current)
        self.assertEqual(r['identityInventoryListingCount'], 5)
        self.assertEqual(r['privateListingCount'], 2)
        self.assertEqual(r['currentPrivateListingCount'], 1)
        self.assertEqual(r['privateProfileStates'], {'GERMAN_APPROVED': 1})
        self.assertEqual(r['privateFinancialStates'], {'STALE': 1})
        self.assertEqual(r['privateSourceStates'], {'NO_APPROVED_SOURCE': 1})
        self.assertEqual(r['privateModuleFailureClasses'], {'NO_VALID_MEANINGFUL_CONTENT': 1})
