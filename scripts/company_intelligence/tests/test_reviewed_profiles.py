from copy import deepcopy
import unittest
import tempfile
from pathlib import Path
from company_intelligence.store import Store, dumps
from company_intelligence.reviewed_profiles import approved_copy, apply, flag_reviews, digest, copy_version, SCHEMA
from test_profile_source_audit import CID, NOW, profile

TEXT = 'Example Therapeutics entwickelt Wirkstoffkandidaten zur Behandlung von Krebserkrankungen. Das Biotechnologieunternehmen befindet sich mit diesen Therapien in der klinischen Entwicklung und arbeitet an der Erforschung neuer Behandlungsmöglichkeiten.'
def entry(source=None):
    source = source or profile()
    value = {'companyId': CID, 'companyName': source['companyName'], 'status': 'APPROVED', 'description': TEXT,
            'sourceDescriptionHash': digest(source['description']), 'sourceHashes': sorted(s['contentHash'] for s in source['sources']),
            'reviewedAt': '2026-10-12T09:00:00Z', 'profileVersion': 'reviewed-de-' + digest(TEXT)[:24],
            'profileTextHash': digest(TEXT), 'method': 'MODEL_ASSISTED_STATIC_PARAPHRASE'}
    value['profileVersion'] = copy_version(value)
    return value
class MemoryStore:
    def __init__(self, source): self.values = {'companyProfile:' + CID: source}; self.audits = []
    def state(self, key, default=None): return deepcopy(self.values.get(key, default))
    def set_state(self, key, value): self.values[key] = deepcopy(value)
    def sources(self): return []
    def audit(self, *args, **kwargs): self.audits.append((args, kwargs))
class ReviewedProfilesTests(unittest.TestCase):
    def test_drafts_and_changed_source_cannot_approve_a_profile(self):
        p = profile(); e = entry(p)
        result = approved_copy(p, e, CID, NOW)
        self.assertEqual(result['language'], 'de'); self.assertEqual(result['description'], TEXT)
        for alteration in [{'status': 'DRAFT_ONLY'}, {'companyId': 'iss_cik_0000320193'}, {'sourceDescriptionHash': '0' * 64},
                           {'sourceHashes': ['0' * 64]}, {'profileTextHash': '0' * 64}, {'reviewedAt': '2027-01-01T00:00:00Z'}]:
            with self.assertRaises(ValueError): approved_copy(p, {**e, **alteration}, CID, NOW)
    def test_clinical_products_never_become_commercial_or_promotional(self):
        p = profile(); e = entry(p)
        for text in ['Example Therapeutics verkauft zugelassene Medikamente zur Behandlung von Krebs und verfügt über ein umfangreiches Angebot an Therapien für Patienten.',
                     'Example Therapeutics ist ein führendes Unternehmen und entwickelt klinische Wirkstoffkandidaten für Patienten mit unterschiedlichen Arten von Krebserkrankungen.',
                     'Example Therapeutics entwickelt klinische Wirkstoffkandidaten und beschäftigt 500 Mitarbeiter in der Forschung und Entwicklung von Therapien gegen Krebs.']:
            changed = {**e, 'description': text, 'profileTextHash': digest(text)}
            changed['profileVersion'] = copy_version(changed)
            with self.assertRaises(ValueError): approved_copy(p, changed, CID, NOW)
    def test_exact_issuer_supplementary_provenance_is_required(self):
        p = profile(); e = entry(p); wrong = {**p['sources'][0], 'companyId': 'iss_cik_0000320193'}
        changed = {**e, 'additionalSources': [wrong]}; changed['profileVersion'] = copy_version(changed)
        with self.assertRaisesRegex(ValueError, 'INVALID_SUPPLEMENTARY_PROFILE_SOURCE'): approved_copy(p, changed, CID, NOW)
    def test_static_copy_survives_next_refresh_without_generation_and_flags_new_source(self):
        p = profile(); e = entry(p); store = MemoryStore(p); companies = {CID: {}}
        reviewed = {'schema': SCHEMA, 'profiles': {CID: e}}
        self.assertEqual(apply(store, companies, NOW, reviewed)['updatedProfiles'], 1)
        current = store.state('companyProfile:' + CID)
        self.assertEqual(apply(store, companies, NOW, reviewed)['updatedProfiles'], 0)
        self.assertEqual(store.state('companyProfile:' + CID), current)
        store.set_state('profileRefreshPending:' + CID, {**p, 'description': 'A materially changed business.'})
        self.assertEqual(apply(store, companies, NOW, reviewed)['sourceChangesAwaitingReview'], 1)
        self.assertEqual(store.state('companyProfile:' + CID), current)
        self.assertEqual(store.state('profileReviewPending:' + CID)['status'], 'SOURCE_CHANGED_REVIEW_REQUIRED')
    def test_failed_copy_or_unknown_web_owner_preserves_previous_safe_data(self):
        p = profile(); store = MemoryStore(p); e = entry(p)
        self.assertEqual(apply(store, {CID: {}}, NOW, {'profiles': {CID: {**e, 'status': 'DRAFT_ONLY'}}})['rejectedProfiles'], 1)
        self.assertEqual(store.state('companyProfile:' + CID), p)
        p['sources'][0].update(type='FIRST_PARTY_WEB', url='https://unknown.example/about'); store = MemoryStore(p)
        self.assertEqual(apply(store, {CID: {}}, NOW, {'profiles': {CID: entry(p)}})['rejectionReasons'], {'PROFILE_WEB_OWNERSHIP_NOT_VERIFIED': 1})
    def test_same_cik_does_not_reuse_old_business_description_after_a_name_change(self):
        p = profile(); store = MemoryStore(p)
        result = apply(store, {CID: {'names': ['New Operating Business Inc.']}}, NOW, {'profiles': {CID: entry(p)}})
        self.assertEqual(result['rejectionReasons'], {'PROFILE_CURRENT_MASTER_NAME_REVIEW_REQUIRED': 1})
        self.assertEqual(store.state('companyProfile:' + CID), p)
    def test_new_review_can_pin_the_changed_source_without_reusing_old_source(self):
        p = profile(); store = MemoryStore(p)
        apply(store, {CID: {}}, NOW, {'profiles': {CID: entry(p)}})
        changed = profile('Example Therapeutics develops clinical-stage treatments for cancer and rare diseases.')
        store.set_state('profileRefreshPending:' + CID, changed)
        e = entry(changed); text = TEXT + ' Ein weiterer Forschungsschwerpunkt sind seltene Erkrankungen.'
        e.update(description=text, profileTextHash=digest(text), profileVersion='reviewed-de-' + digest(text)[:24])
        e['profileVersion'] = copy_version(e)
        self.assertEqual(apply(store, {CID: {}}, NOW, {'profiles': {CID: e}})['updatedProfiles'], 1)
        self.assertEqual(store.state('profileReviewSource:' + CID)['description'], changed['description'])
        self.assertEqual(store.state('profileReviewPending:' + CID)['status'], 'REVIEWED')
    def test_reviewed_source_snapshot_can_fill_an_extraction_gap_but_cannot_bypass_policy(self):
        p = profile(); store = MemoryStore(None); e = {**entry(p), 'reviewedSourceSnapshot': p}
        self.assertEqual(apply(store, {CID: {}}, NOW, {'profiles': {CID: e}})['updatedProfiles'], 1)
        self.assertEqual(store.state('profileReviewSource:' + CID)['description'], p['description'])
        wrong = deepcopy(p); wrong['sources'][0]['url'] = 'https://www.sec.gov/Archives/edgar/data/320193/annual.htm'
        store = MemoryStore(None)
        self.assertEqual(apply(store, {CID: {}}, NOW, {'profiles': {CID: {**e, 'reviewedSourceSnapshot': wrong}}})['rejectedProfiles'], 1)
        self.assertIsNone(store.state('companyProfile:' + CID))
    def test_same_text_with_new_source_hash_has_a_new_version_and_can_be_reviewed(self):
        p = profile(); old = entry(p); changed = deepcopy(p); changed['sources'][0]['contentHash'] = 'b' * 64
        new = entry(changed)
        self.assertNotEqual(old['profileVersion'], new['profileVersion'])
        store = MemoryStore(p); apply(store, {CID: {}}, NOW, {'profiles': {CID: old}})
        store.set_state('profileRefreshPending:' + CID, changed)
        self.assertEqual(apply(store, {CID: {}}, NOW, {'profiles': {CID: new}})['updatedProfiles'], 1)
        self.assertEqual(store.state('companyProfile:' + CID)['sources'][0]['contentHash'], 'b' * 64)
    def test_review_revocation_and_later_identity_changes_withhold_only_profile(self):
        p = profile(); e = entry(p); store = MemoryStore(p)
        apply(store, {CID: {}}, NOW, {'profiles': {CID: e}})
        store.set_state('financials:' + CID, {'state': 'AVAILABLE'})
        apply(store, {CID: {}}, NOW, {'profiles': {CID: {**e, 'status': 'REVOKED'}}})
        withheld = store.state('companyProfile:' + CID)
        self.assertEqual(withheld['editorialStatus'], 'WITHHELD_CONSUMER')
        self.assertEqual(withheld['description'], TEXT)
        self.assertEqual(store.state('financials:' + CID), {'state': 'AVAILABLE'})
        self.assertEqual(apply(store, {CID: {}}, NOW, {'profiles': {CID: e}})['updatedProfiles'], 1)
        apply(store, {CID: {'names': ['Different Business Inc.']}}, NOW, {'profiles': {CID: e}})
        self.assertEqual(store.state('companyProfile:' + CID)['editorialStatus'], 'WITHHELD_CONSUMER')
    def test_quarterly_checks_and_policy_safe_signals_queue_review_without_inference(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'state.sqlite')
            try:
                p = approved_copy(profile(), entry(), CID, NOW)
                store.set_state('companyProfile:' + CID, p)
                for ident, url in [('owned-sec', 'https://www.sec.gov/Archives/edgar/data/1652130/material.htm'),
                                   ('rejected-publisher', 'https://globenewswire.com/article')]:
                    row = {'companyId': CID, 'newsId': ident, 'canonicalUrl': url,
                           'publishedAt': '2026-10-13T09:00:00Z', 'categories': ['M&A']}
                    store.db.execute('INSERT INTO items VALUES(?,?,?,?)', (ident, CID, row['publishedAt'], dumps(row)))
                store.db.commit()
                before = store.state('companyProfile:' + CID)
                self.assertEqual(flag_reviews(store, {CID: {}}, '2027-02-01T10:00:00Z'),
                                 {'PERIODIC_SOURCE_REVIEW_DUE': 1, 'MATERIAL_SIGNAL_SOURCE_REVIEW_REQUIRED': 1})
                pending = store.state('profileReviewPending:' + CID)
                self.assertEqual(pending['signalCount'], 1)
                self.assertEqual(store.state('companyProfile:' + CID), before)
            finally: store.close()
if __name__ == '__main__': unittest.main()
