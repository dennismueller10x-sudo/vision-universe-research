import copy
import json
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from company_intelligence.editorial import german_profile

ROOT = Path(__file__).resolve().parents[3]


class EditorialEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.profiles = json.loads((ROOT / 'company-intelligence/config/company-profiles.json').read_text())['profiles']
        self.review = json.loads((ROOT / 'company-intelligence/config/profile-editorial-de.json').read_text())
        self.apple = self.profiles['iss_cik_0000320193']

    def test_changed_fact_or_source_never_reuses_a_reviewed_german_description(self):
        approved = german_profile(self.apple, self.review)
        self.assertEqual(approved['language'], 'de')
        for change in ('description', 'source'):
            altered = copy.deepcopy(self.apple)
            if change == 'description':
                altered['description'] += ' Different business.'
            else:
                altered['sources'][0]['contentHash'] = '0' * 64
            result = german_profile(altered, self.review)
            self.assertEqual(result['language'], 'en')
            self.assertNotEqual(result['description'], approved['description'])

    def test_nonbusiness_alphabet_fragment_is_withheld_for_both_share_classes(self):
        self.assertIsNone(german_profile(self.profiles['iss_cik_0001652044'], self.review))

    def test_withdrawal_does_not_permanently_block_a_corrected_future_profile(self):
        prior = self.profiles['iss_cik_0001652044']
        changed = copy.deepcopy(prior)
        changed['description'] = 'A newly reviewed actual business description.'
        self.assertIsNotNone(german_profile(changed, self.review))

    def test_repeated_projection_keeps_review_only_status(self):
        profile = german_profile(self.apple, self.review)
        self.assertEqual(german_profile(profile, self.review), profile)
        self.assertEqual(profile['editorialStatus'], 'REVIEW_ONLY')


if __name__ == '__main__':
    unittest.main()
