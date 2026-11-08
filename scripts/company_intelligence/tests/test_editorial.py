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

    def test_source_change_keeps_reviewed_german_within_grace_and_marks_review(self):
        # Entscheidung Steuerung 07.11.2026 (B2): neuer 10-K -> gepruefte Fassung bleibt hoechstens
        # 120 Tage nach reviewedAt (Apple: 2026-10-06T10:30Z), markiert; Stichtag ist der Exportstand.
        approved = german_profile(self.apple, self.review)
        self.assertNotIn('reviewStatus', approved)
        for change in ('description', 'source'):
            altered = copy.deepcopy(self.apple)
            if change == 'description':
                altered['description'] += ' Different business.'
            else:
                altered['sources'][0]['contentHash'] = '0' * 64
            inside = german_profile(altered, self.review, as_of='2026-11-07T00:00:00Z')
            self.assertEqual(inside['language'], 'de', change)
            self.assertEqual(inside['description'], approved['description'], change)
            self.assertEqual(inside['reviewStatus'], 'SOURCE_CHANGED_REVIEW_REQUIRED', change)
            self.assertEqual(inside['editorialStatus'], 'REVIEW_ONLY', change)
            last_day = german_profile(altered, self.review, as_of='2027-02-03T10:30:00Z')
            self.assertEqual(last_day['language'], 'de', change)
            outside = german_profile(altered, self.review, as_of='2027-02-03T10:30:01Z')
            self.assertEqual(outside['language'], 'en', change)
            self.assertNotIn('reviewStatus', outside)
            before_review = german_profile(altered, self.review, as_of='2026-10-01T00:00:00Z')
            self.assertEqual(before_review['language'], 'en', change)

    def test_grace_never_overrides_a_withdrawal(self):
        self.assertIsNone(german_profile(self.profiles['iss_cik_0001652044'], self.review, as_of='2026-11-07T00:00:00Z'))

    def test_matching_source_unchanged_with_as_of(self):
        self.assertEqual(german_profile(self.apple, self.review, as_of='2027-06-01T00:00:00Z'), german_profile(self.apple, self.review))

    def test_repeated_projection_keeps_review_only_status(self):
        profile = german_profile(self.apple, self.review)
        self.assertEqual(german_profile(profile, self.review), profile)
        self.assertEqual(profile['editorialStatus'], 'REVIEW_ONLY')


if __name__ == '__main__':
    unittest.main()
